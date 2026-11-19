import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowBigDown,
  ArrowBigUp,
  Bookmark,
  Eye,
  EyeOff,
  Flag,
  MessageSquare,
  Pencil,
  Send,
  Share2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  type Confession,
  formatFullTimestamp,
  formatReadTime,
  formatRelativeTime,
  type Reply,
  type SensitivityLevel,
  type UserProfile,
  VALIDATION_LIMITS,
} from '../types';
import {
  castVote,
  createReply,
  deleteConfession,
  deleteReply,
  editConfession,
  moderateConfessionAndReport,
} from '../lib/firestoreService';

interface ConfessionCardProps {
  confession: Confession;
  currentProfile: UserProfile | null;
  currentVote: number | null;
  isSaved?: boolean;
  defaultExpanded?: boolean;
  onVoteChange: (confessionId: string, nextVote: number | null) => void;
  onToggleSave?: (confession: Confession, currentlySaved: boolean) => Promise<void> | void;
  onRequireSignIn: () => void;
  onOpenReport: (confession: Confession) => void;
  onToast: (message: string) => void;
}

export function ConfessionCard({
  confession,
  currentProfile,
  currentVote,
  isSaved = false,
  defaultExpanded = false,
  onVoteChange,
  onToggleSave,
  onRequireSignIn,
  onOpenReport,
  onToast,
}: ConfessionCardProps) {
  const [revealed, setRevealed] = useState(
    confession.sensitivity === 'open' && confession.status === 'active'
  );
  const [bodyExpanded, setBodyExpanded] = useState(defaultExpanded);
  const [isBodyTruncated, setIsBodyTruncated] = useState(false);
  const bodyRef = useRef<HTMLParagraphElement>(null);

  const [voting, setVoting] = useState(false);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [showReplies, setShowReplies] = useState(defaultExpanded);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);

  // Reply composer state (respects profile anonymity default)
  const [replyBody, setReplyBody] = useState('');
  const [replyAnonymous, setReplyAnonymous] = useState(
    currentProfile?.defaultAnonymous ?? true
  );
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  useEffect(() => {
    if (currentProfile && typeof currentProfile.defaultAnonymous === 'boolean') {
      setReplyAnonymous(currentProfile.defaultAnonymous);
    }
  }, [currentProfile?.defaultAnonymous]);

  // Author inline edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(confession.body);
  const [editSensitivity, setEditSensitivity] = useState<SensitivityLevel>(confession.sensitivity);
  const [savingEdit, setSavingEdit] = useState(false);

  // Detect whether body text actually overflows its clamped row width so "Read more" only renders when needed
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || bodyExpanded) return;

    function measure() {
      const node = bodyRef.current;
      if (!node) return;
      setIsBodyTruncated(node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1);
    }

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [confession.body, bodyExpanded, revealed, isEditing]);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteReplyId, setConfirmDeleteReplyId] = useState<string | null>(null);

  const isPreview = confession.id.startsWith('preview-');
  const isAuthor = !isPreview && currentProfile?.uid === confession.authorUid;
  const isModOrAdmin =
    !isPreview &&
    (currentProfile?.role === 'moderator' || currentProfile?.role === 'admin');
  const isAdmin = !isPreview && currentProfile?.role === 'admin';

  useEffect(() => {
    if (!showReplies || isPreview) return;
    setLoadingReplies(true);
    const path = `confessions/${confession.id}/replies`;
    const q = query(
      collection(db, 'confessions', confession.id, 'replies'),
      where('status', 'in', ['active', 'flagged'])
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Reply)
          .filter((r) => !r.isEncrypted)
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() ?? Date.now();
            const tb = b.createdAt?.toMillis?.() ?? Date.now();
            return ta - tb;
          });
        setReplies(list);
        setLoadingReplies(false);
      },
      (error) => {
        setLoadingReplies(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsubscribe();
  }, [showReplies, confession.id, isPreview]);

  async function handleVote(direction: 1 | -1) {
    if (isPreview) {
      onToast('Sign in and publish posts to vote on the live board.');
      return;
    }
    if (!currentProfile) {
      onRequireSignIn();
      return;
    }
    if (currentProfile.status !== 'active') {
      onToast('Voting is paused while your account is restricted.');
      return;
    }
    if (voting) return;
    setVoting(true);
    try {
      const next = await castVote(confession, currentProfile.uid, direction, currentVote);
      onVoteChange(confession.id, next);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Vote could not be saved.');
    } finally {
      setVoting(false);
    }
  }

  async function handleBookmarkClick() {
    if (isPreview) {
      onToast('Publish posts to the live board before saving.');
      return;
    }
    if (!currentProfile) {
      onRequireSignIn();
      return;
    }
    if (!onToggleSave || savingBookmark) return;
    setSavingBookmark(true);
    try {
      await onToggleSave(confession, isSaved);
    } finally {
      setSavingBookmark(false);
    }
  }

  async function handleReplySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isPreview) {
      onToast('Publish posts to the live board to start a discussion.');
      return;
    }
    if (!currentProfile) {
      onRequireSignIn();
      return;
    }
    setReplyError(null);
    setSendingReply(true);
    try {
      await createReply({
        confessionId: confession.id,
        authorProfile: currentProfile,
        body: replyBody,
        isAnonymous: replyAnonymous,
      });
      setReplyBody('');
      onToast('Reply posted.');
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Unable to send reply.');
    } finally {
      setSendingReply(false);
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSavingEdit(true);
    try {
      await editConfession(confession.id, {
        body: editBody,
        sensitivity: editSensitivity,
      });
      setIsEditing(false);
      onToast('Post updated.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to save edits.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteConfession(confession.id);
      onToast('Post deleted.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to delete post.');
    }
  }

  async function handleDeleteReply(replyId: string) {
    try {
      await deleteReply(confession.id, replyId);
      setConfirmDeleteReplyId(null);
      onToast('Reply deleted.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to delete reply.');
    }
  }

  async function handleQuickMod(action: 'approve' | 'quarantine' | 'remove') {
    if (!currentProfile) return;
    const defaultNote =
      action === 'approve'
        ? 'Reviewed and restored to feed.'
        : action === 'quarantine'
          ? 'Quarantined by moderation for review.'
          : 'Removed by Lead Admin for policy violation.';
    try {
      await moderateConfessionAndReport({
        actorProfile: currentProfile,
        confessionId: confession.id,
        authorUid: confession.authorUid,
        action,
        reason: defaultNote,
        reputationPenalty: action === 'remove' ? -25 : action === 'quarantine' ? -10 : 0,
      });
      onToast(
        action === 'approve'
          ? 'Post restored.'
          : action === 'quarantine'
            ? 'Post quarantined (-10 rep).'
            : 'Post removed (-25 rep).'
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Moderation action failed.');
    }
  }

  async function handleCopyShareLink() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('thread', confession.id);
      await navigator.clipboard.writeText(url.toString());
      onToast('Link copied.');
    } catch {
      onToast('Unable to copy link in this browser context.');
    }
  }

  const isVeiled =
    !revealed &&
    (confession.sensitivity !== 'open' ||
      confession.status === 'flagged' ||
      confession.status === 'quarantined');

  return (
    <article className="border-b border-[#E6E6E6] dark:border-[#242424] py-4 first:pt-3.5">
      <div className="flex gap-3 sm:gap-3.5">
        {/* Vote Rail */}
        <div className="flex flex-col items-center shrink-0 pt-0.5 w-9">
          <button
            type="button"
            disabled={voting}
            onClick={() => handleVote(1)}
            aria-label="Upvote post"
            aria-pressed={currentVote === 1}
            className={`p-1 rounded-md transition-colors cursor-pointer ${
              currentVote === 1
                ? 'text-[#CC0000] bg-[#CC0000]/10'
                : 'text-[#737373] dark:text-[#8C8C8C] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] hover:bg-[#F2F2F2] dark:hover:bg-[#1A1A1A]'
            }`}
          >
            <ArrowBigUp className="w-[18px] h-[18px]" />
          </button>
          <span
            className={`text-[13px] font-bold tabular-nums my-0.5 ${
              confession.score > 0
                ? 'text-[#0C0C0C] dark:text-[#F2F2F2]'
                : confession.score < 0
                  ? 'text-[#CC0000] dark:text-[#FF6B6B]'
                  : 'text-[#595959] dark:text-[#8C8C8C]'
            }`}
          >
            {confession.score}
          </span>
          <button
            type="button"
            disabled={voting}
            onClick={() => handleVote(-1)}
            aria-label="Downvote post"
            aria-pressed={currentVote === -1}
            className={`p-1 rounded-md transition-colors cursor-pointer ${
              currentVote === -1
                ? 'text-[#1D4ED8] dark:text-[#60A5FA] bg-[#1D4ED8]/10'
                : 'text-[#737373] dark:text-[#8C8C8C] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] hover:bg-[#F2F2F2] dark:hover:bg-[#1A1A1A]'
            }`}
          >
            <ArrowBigDown className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* Main Editorial Story Body */}
        <div className="flex-1 min-w-0">
          {/* Clean Metadata Line (no category label inside posts) */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-[#595959] dark:text-[#A3A3A3]">
            <span className="font-semibold text-[#0C0C0C] dark:text-[#F2F2F2]">
              {confession.isAnonymous ? confession.authorHandle : `@${confession.authorHandle}`}
            </span>
            <span aria-hidden="true">·</span>
            <span
              title={formatFullTimestamp(confession.createdAt)}
              className="tabular-nums"
            >
              {formatRelativeTime(confession.createdAt)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {formatReadTime('', confession.body)}
            </span>
            {confession.sensitivity !== 'open' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#B45309] dark:text-[#FBBF24] font-semibold">
                  {confession.sensitivity === 'mature' ? 'Mature' : 'Hidden'}
                </span>
              </>
            )}
            {confession.status === 'flagged' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#B45309] dark:text-[#FBBF24] font-semibold">
                  Flagged ({confession.flagCount})
                </span>
              </>
            )}
            {confession.status === 'quarantined' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#CC0000] dark:text-[#FF6B6B] font-semibold">
                  Quarantined
                </span>
              </>
            )}
          </div>

          {/* Inline Edit Form OR Direct Post Content */}
          {isEditing ? (
            <form onSubmit={handleSaveEdit} className="mt-3 space-y-3">
              <textarea
                rows={4}
                required
                minLength={VALIDATION_LIMITS.bodyMinPlain}
                maxLength={VALIDATION_LIMITS.bodyMax}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                className="w-full px-3 py-2 text-[13.5px] sm:text-[14px] leading-[1.65] rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C] text-[#171717] dark:text-[#EAEAEA]"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <select
                  value={editSensitivity}
                  onChange={(e) => setEditSensitivity(e.target.value as SensitivityLevel)}
                  className="px-2.5 py-1.5 text-xs rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C] text-[#0C0C0C] dark:text-[#F2F2F2]"
                >
                  <option value="open">Visible in feed</option>
                  <option value="sensitive">Hidden (tap to reveal)</option>
                  <option value="mature">Mature (tap to reveal)</option>
                </select>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-xs font-medium text-[#595959] dark:text-[#A3A3A3] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-[#0C0C0C] text-white dark:bg-[#F2F2F2] dark:text-[#0C0C0C] cursor-pointer"
                  >
                    {savingEdit ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <>
              {confession.moderationNote && (
                <p className="mt-2.5 text-xs text-[#92400E] dark:text-[#FBBF24] bg-[#FFFBEB] dark:bg-[#231B0E] border border-[#FDE68A] dark:border-[#4D3B18] rounded-md px-3 py-2">
                  Note: {confession.moderationNote}
                </p>
              )}

              {isVeiled ? (
                <div className="mt-3 p-4 rounded-md border border-[#E6E6E6] dark:border-[#262626] bg-[#F7F7F7] dark:bg-[#141414] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    {confession.status === 'quarantined' || confession.status === 'flagged' ? (
                      <ShieldAlert className="w-4 h-4 text-[#B45309] dark:text-[#FBBF24] shrink-0 mt-0.5" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-[#595959] dark:text-[#A3A3A3] shrink-0 mt-0.5" />
                    )}
                    <div className="text-sm text-[#595959] dark:text-[#A3A3A3] leading-relaxed">
                      {confession.status === 'quarantined'
                        ? 'This post is quarantined pending review.'
                        : confession.status === 'flagged'
                          ? `This post received ${confession.flagCount} flags and is awaiting review.`
                          : confession.sensitivity === 'mature'
                            ? 'Marked as mature content — tap to read.'
                            : 'Content hidden by author — tap to read.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRevealed(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-[#D4D4D4] dark:border-[#333333] bg-white dark:bg-[#1E1E1E] text-[#0C0C0C] dark:text-[#F2F2F2] hover:bg-[#F2F2F2] dark:hover:bg-[#262626] transition-colors shrink-0 whitespace-nowrap cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Show post
                  </button>
                </div>
              ) : (
                <div className="mt-1.5 w-full">
                  <p
                    ref={bodyRef}
                    onClick={() => {
                      if (!bodyExpanded && isBodyTruncated) {
                        setBodyExpanded(true);
                      }
                    }}
                    className={`w-full text-[13.5px] sm:text-[14px] leading-[1.65] tracking-[-0.004em] text-[#171717] dark:text-[#EAEAEA] ${
                      bodyExpanded
                        ? 'whitespace-pre-wrap'
                        : `line-clamp-3 ${isBodyTruncated ? 'cursor-pointer' : ''}`
                    }`}
                  >
                    {confession.body}
                  </p>
                  {(isBodyTruncated || bodyExpanded) && (
                    <button
                      type="button"
                      onClick={() => setBodyExpanded((v) => !v)}
                      className="mt-1 text-[11.5px] font-semibold text-[#CC0000] hover:underline cursor-pointer"
                    >
                      {bodyExpanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Action Bar */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 sm:gap-x-5 gap-y-1.5 text-[11.5px] text-[#595959] dark:text-[#A3A3A3]">
            <button
              type="button"
              onClick={() => setShowReplies((v) => !v)}
              className="inline-flex items-center gap-1.5 font-semibold hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] transition-colors cursor-pointer whitespace-nowrap"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="tabular-nums">
                {showReplies && !loadingReplies && !isPreview
                  ? replies.length
                  : confession.replyCount}
              </span>
              <span>
                {(showReplies && !loadingReplies && !isPreview
                  ? replies.length
                  : confession.replyCount) === 1
                  ? 'Reply'
                  : 'Replies'}
              </span>
            </button>

            <button
              type="button"
              disabled={savingBookmark}
              onClick={handleBookmarkClick}
              aria-pressed={isSaved}
              className={`inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                isSaved
                  ? 'font-semibold text-[#CC0000] dark:text-[#FF5A5A]'
                  : 'font-medium hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2]'
              }`}
            >
              <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
              <span>{isSaved ? 'Saved' : 'Save'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyShareLink}
              className="inline-flex items-center gap-1.5 font-medium hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!currentProfile) {
                  onRequireSignIn();
                } else {
                  onOpenReport(confession);
                }
              }}
              className="inline-flex items-center gap-1.5 font-medium hover:text-[#CC0000] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Flag className="w-3.5 h-3.5" />
              <span>Flag</span>
            </button>

            {revealed &&
              (confession.sensitivity !== 'open' || confession.status !== 'active') && (
                <button
                  type="button"
                  onClick={() => setRevealed(false)}
                  className="inline-flex items-center gap-1 font-medium hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] cursor-pointer whitespace-nowrap"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Hide</span>
                </button>
              )}

            {isAuthor && confession.status === 'active' && !isEditing && (
              <button
                type="button"
                onClick={() => {
                  setEditBody(confession.body);
                  setEditSensitivity(confession.sensitivity);
                  setIsEditing(true);
                }}
                className="inline-flex items-center gap-1 font-medium hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] cursor-pointer whitespace-nowrap"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}

            {(isAuthor || isAdmin) && !confirmDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 font-medium hover:text-[#CC0000] dark:hover:text-[#FF6B6B] cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}

            {confirmDelete && (
              <span className="inline-flex items-center gap-2 text-[#CC0000] dark:text-[#FF6B6B]">
                <span>Delete post?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="font-semibold underline cursor-pointer"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-[#595959] dark:text-[#A3A3A3] cursor-pointer"
                >
                  Cancel
                </button>
              </span>
            )}

            {/* Tier 2 / Tier 3 Quick Moderation Controls */}
            {isModOrAdmin && (
              <span className="inline-flex items-center gap-3 ml-auto pl-3 border-l border-[#E6E6E6] dark:border-[#262626]">
                {confession.status !== 'active' && (
                  <button
                    type="button"
                    onClick={() => handleQuickMod('approve')}
                    className="font-semibold text-[#15803D] dark:text-[#4ADE80] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Approve
                  </button>
                )}
                {confession.status !== 'quarantined' && (
                  <button
                    type="button"
                    onClick={() => handleQuickMod('quarantine')}
                    className="font-semibold text-[#B45309] dark:text-[#FBBF24] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Quarantine
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleQuickMod('remove')}
                    className="font-semibold text-[#CC0000] dark:text-[#FF6B6B] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Remove
                  </button>
                )}
              </span>
            )}
          </div>

          {/* Expandable Discussion Replies */}
          {showReplies && (
            <div className="mt-5 pt-4 border-t border-[#E6E6E6] dark:border-[#242424] space-y-4">
              {loadingReplies ? (
                <div className="space-y-3">
                  <div className="h-10 rounded bg-[#F2F2F2] dark:bg-[#1A1A1A] animate-pulse" />
                  <div className="h-10 rounded bg-[#F2F2F2] dark:bg-[#1A1A1A] animate-pulse" />
                </div>
              ) : replies.length === 0 ? (
                <p className="text-xs text-[#595959] dark:text-[#A3A3A3]">
                  No replies yet. Join the conversation below.
                </p>
              ) : (
                <ul className="space-y-4">
                  {replies.map((reply) => {
                    const canDeleteReply =
                      !isPreview &&
                      (currentProfile?.uid === reply.authorUid || isAdmin);
                    const isMatchingOp =
                      reply.authorUid === confession.authorUid &&
                      reply.isAnonymous === confession.isAnonymous;
                    return (
                      <li
                        key={reply.id}
                        className="pl-4 border-l border-[#E6E6E6] dark:border-[#2E2E2E]"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#595959] dark:text-[#A3A3A3]">
                          <span className="font-semibold text-[#0C0C0C] dark:text-[#F2F2F2]">
                            {reply.isAnonymous ? reply.authorHandle : `@${reply.authorHandle}`}
                          </span>
                          {isMatchingOp && (
                            <span className="text-[10px] font-bold uppercase tracking-[0.04em] text-[#CC0000] dark:text-[#FF5A5A]">
                              OP
                            </span>
                          )}
                          <span aria-hidden="true">·</span>
                          <span
                            title={formatFullTimestamp(reply.createdAt)}
                            className="tabular-nums"
                          >
                            {formatRelativeTime(reply.createdAt)}
                          </span>
                          {canDeleteReply && (
                            <span className="ml-auto inline-flex items-center gap-2">
                              {confirmDeleteReplyId === reply.id ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteReply(reply.id)}
                                    className="font-semibold text-[#CC0000] dark:text-[#FF6B6B] hover:underline cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteReplyId(null)}
                                    className="text-[#595959] dark:text-[#A3A3A3] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteReplyId(reply.id)}
                                  aria-label="Delete reply"
                                  className="text-[#737373] hover:text-[#CC0000] dark:hover:text-[#FF6B6B] transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[13px] leading-[1.6] text-[#262626] dark:text-[#D9D9D9] whitespace-pre-wrap">
                          {reply.body}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Reply Input */}
              {currentProfile ? (
                <form onSubmit={handleReplySubmit} className="space-y-2.5 pt-1">
                  {replyError && (
                    <p className="text-xs text-[#CC0000] dark:text-[#FF6B6B]">{replyError}</p>
                  )}
                  <textarea
                    rows={2}
                    required
                    maxLength={VALIDATION_LIMITS.replyBodyMax}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !sendingReply && replyBody.trim()) {
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="Write a reply..."
                    className="w-full px-3 py-2 text-sm rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C] text-[#0C0C0C] dark:text-[#F2F2F2] placeholder:text-[#737373] focus:outline-none focus:bg-white dark:focus:bg-[#141414] focus:ring-2 focus:ring-[#CC0000]/30"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="inline-flex items-center gap-1.5 text-xs text-[#595959] dark:text-[#A3A3A3] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={replyAnonymous}
                        onChange={(e) => setReplyAnonymous(e.target.checked)}
                        className="accent-[#CC0000]"
                      />
                      <span>Post anonymously</span>
                    </label>
                    <button
                      type="submit"
                      disabled={sendingReply || !replyBody.trim()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-[#0C0C0C] text-white dark:bg-[#F2F2F2] dark:text-[#0C0C0C] hover:opacity-90 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {sendingReply ? 'Posting...' : 'Reply'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={onRequireSignIn}
                  className="text-xs font-semibold text-[#CC0000] hover:underline cursor-pointer"
                >
                  Sign in to reply
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
