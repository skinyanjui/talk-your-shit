import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, ShieldAlert, User, X } from 'lucide-react';
import {
  type CommunitySettings,
  formatReadTime,
  type SensitivityLevel,
  type UserProfile,
  VALIDATION_LIMITS,
} from '../types';
import { createConfession } from '../lib/firestoreService';
import { classifyPostTopic } from '../lib/topicClassifier';

interface ComposeModalProps {
  profile: UserProfile;
  settings: CommunitySettings;
  onClose: () => void;
  onSuccess: () => void;
}

const DRAFT_STORAGE_KEY = 'tys-compose-draft';

function loadSavedDraftBody(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { body?: unknown; title?: unknown };
    if (typeof parsed.body === 'string' && parsed.body.length > 0) {
      return parsed.body;
    }
    return typeof parsed.title === 'string' ? parsed.title : '';
  } catch {
    return '';
  }
}

export function hasSavedComposeDraft(): boolean {
  return loadSavedDraftBody().trim().length > 0;
}

export function ComposeModal({
  profile,
  settings,
  onClose,
  onSuccess,
}: ComposeModalProps) {
  const [body, setBody] = useState<string>(() => loadSavedDraftBody());
  const [isAnonymous, setIsAnonymous] = useState(profile.defaultAnonymous ?? true);
  const [hideInFeed, setHideInFeed] = useState(profile.defaultHideContent ?? false);
  const [isMature, setIsMature] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (!body) {
        window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      } else {
        window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ body }));
      }
    } catch {
      // Ignore storage restrictions
    }
  }, [body]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const belowRepFloor = profile.reputation < settings.minRepToPost && profile.role === 'member';
  const isRestricted = profile.status !== 'active' || belowRepFloor;
  const trimmedBody = body.trim();
  const bodyReady = trimmedBody.length >= VALIDATION_LIMITS.bodyMinPlain;
  const canSubmit = !submitting && !isRestricted && bodyReady;

  const remainingChars = Math.max(0, VALIDATION_LIMITS.bodyMinPlain - trimmedBody.length);

  const sensitivity: SensitivityLevel = hideInFeed
    ? isMature && settings.unfilteredModeEnabled
      ? 'mature'
      : 'sensitive'
    : 'open';

  function handleClearDraft() {
    setBody('');
    setError(null);
    try {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isRestricted) return;
    setError(null);
    setSubmitting(true);

    try {
      const detectedTopic = classifyPostTopic(body);
      await createConfession({
        authorProfile: profile,
        body,
        topic: detectedTopic,
        sensitivity,
        isAnonymous,
      });
      try {
        window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // Ignore
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish post.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-white dark:bg-[#141414] border border-[#E6E6E6] dark:border-[#262626] rounded-lg overflow-hidden my-auto shadow-xl">
        {/* Ultra-minimal Header: Title + Quiet Read Time / Clear + Close */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#E6E6E6] dark:border-[#262626]">
          <div className="flex items-center gap-3 min-w-0">
            <h2
              id="compose-modal-title"
              className="text-base font-bold text-[#0C0C0C] dark:text-[#F2F2F2] whitespace-nowrap"
            >
              New post
            </h2>
            {bodyReady && (
              <span className="text-xs tabular-nums text-[#737373]">
                {formatReadTime('', trimmedBody)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {body.length > 0 && (
              <button
                type="button"
                onClick={handleClearDraft}
                className="text-xs font-medium text-[#737373] hover:text-[#CC0000] transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close composer"
              className="p-1.5 rounded-md text-[#595959] hover:text-[#0C0C0C] dark:text-[#A3A3A3] dark:hover:text-[#F2F2F2] hover:bg-[#F2F2F2] dark:hover:bg-[#1F1F1F] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-5 pt-4 pb-3 space-y-3">
            {isRestricted && (
              <div className="p-3 rounded-md border border-[#FECACA] dark:border-[#7F1D1D] bg-[#FEF2F2] dark:bg-[#2A1215] text-xs text-[#991B1B] dark:text-[#FCA5A5] flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {profile.status !== 'active'
                    ? `Posting is paused while your account is ${profile.status}.`
                    : `You need at least ${settings.minRepToPost} rep to post.`}
                </span>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-md border border-[#FECACA] dark:border-[#7F1D1D] bg-[#FEF2F2] dark:bg-[#2A1215] text-xs text-[#991B1B] dark:text-[#FCA5A5]">
                {error}
              </div>
            )}

            {/* Single Clean Writing Canvas — no headline or category required */}
            <div>
              <textarea
                id="confession-body"
                aria-label="Post content"
                autoFocus
                rows={7}
                required
                minLength={VALIDATION_LIMITS.bodyMinPlain}
                maxLength={VALIDATION_LIMITS.bodyMax}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Say what's on your mind..."
                className="w-full py-1 text-[14px] leading-[1.65] tracking-[-0.004em] bg-transparent text-[#171717] dark:text-[#EAEAEA] placeholder:text-[#8C8C8C] focus:outline-none resize-y"
              />
              <div className="flex items-center justify-between min-h-[18px] mt-1">
                {body.length > 0 && remainingChars > 0 && !isRestricted ? (
                  <span className="text-[11px] tabular-nums text-[#737373]">
                    {remainingChars} more {remainingChars === 1 ? 'character' : 'characters'} to post
                  </span>
                ) : (
                  <span />
                )}
                {body.length > VALIDATION_LIMITS.bodyMax * 0.8 && (
                  <span className="text-[11px] tabular-nums text-[#737373]">
                    {body.length}/{VALIDATION_LIMITS.bodyMax}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Single Compact Bottom Action Bar */}
          <div className="px-5 py-3 border-t border-[#E6E6E6] dark:border-[#262626] bg-[#FAFAFA] dark:bg-[#101010] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAnonymous((v) => !v)}
                aria-pressed={isAnonymous}
                title="Toggle anonymous posting"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  isAnonymous
                    ? 'border-[#0C0C0C] bg-[#0C0C0C] text-white dark:border-[#F2F2F2] dark:bg-[#F2F2F2] dark:text-[#0C0C0C]'
                    : 'border-[#D4D4D4] dark:border-[#2E2E2E] bg-white dark:bg-[#161616] text-[#595959] dark:text-[#A3A3A3] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2]'
                }`}
              >
                {isAnonymous ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Anonymous</span>
                  </>
                ) : (
                  <>
                    <User className="w-3.5 h-3.5" />
                    <span>@{profile.handle}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setHideInFeed((prev) => {
                    const next = !prev;
                    if (!next) setIsMature(false);
                    return next;
                  });
                }}
                aria-pressed={hideInFeed}
                title="Collapse post behind a tap-to-reveal cover in the feed"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors cursor-pointer ${
                  hideInFeed
                    ? 'border-[#B45309] text-[#B45309] dark:border-[#FBBF24] dark:text-[#FBBF24] bg-[#FFFBEB] dark:bg-[#231B0E]'
                    : 'border-[#D4D4D4] dark:border-[#2E2E2E] bg-white dark:bg-[#161616] text-[#595959] dark:text-[#A3A3A3] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{hideInFeed ? 'Hidden cover' : 'Hide cover'}</span>
              </button>

              {hideInFeed && settings.unfilteredModeEnabled && (
                <label className="inline-flex items-center gap-1.5 pl-1 text-xs font-medium text-[#595959] dark:text-[#A3A3A3] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isMature}
                    onChange={(e) => setIsMature(e.target.checked)}
                    className="accent-[#CC0000] cursor-pointer"
                  />
                  <span>Mature</span>
                </label>
              )}
            </div>

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-[#595959] dark:text-[#A3A3A3] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-md bg-[#CC0000] text-white hover:bg-[#A80000] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
              >
                {submitting ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
