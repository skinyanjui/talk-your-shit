import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  getReputationTier,
  REPUTATION_TIERS,
  type UserProfile,
  VALIDATION_LIMITS,
} from '../types';
import { updateUserProfile } from '../lib/firestoreService';

interface ProfileModalProps {
  profile: UserProfile;
  onClose: () => void;
  onUpdated: () => void;
  onViewMyPosts?: () => void;
}

export function ProfileModal({ profile, onClose, onUpdated, onViewMyPosts }: ProfileModalProps) {
  const [handleInput, setHandleInput] = useState(profile.handle);
  const [bioInput, setBioInput] = useState(profile.bio);
  const [defaultAnonymous, setDefaultAnonymous] = useState(profile.defaultAnonymous ?? true);
  const [defaultHideContent, setDefaultHideContent] = useState(profile.defaultHideContent ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const tier = getReputationTier(profile.reputation);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await updateUserProfile(profile.uid, handleInput, bioInput, {
        defaultAnonymous,
        defaultHideContent,
      });
      onUpdated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-white dark:bg-[#141414] border border-[#E6E6E6] dark:border-[#262626] rounded-lg overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E6E6E6] dark:border-[#262626]">
          <h2
            id="profile-modal-title"
            className="text-lg font-bold text-[#0C0C0C] dark:text-[#F2F2F2]"
          >
            Your profile
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile dialog"
            className="p-1.5 rounded-md text-[#595959] hover:text-[#0C0C0C] dark:text-[#A3A3A3] dark:hover:text-[#F2F2F2] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Personal Standing Summary */}
          <div className="grid grid-cols-3 gap-3 pb-4 border-b border-[#E6E6E6] dark:border-[#262626]">
            <div>
              <div className="text-xs text-[#595959] dark:text-[#A3A3A3]">Reputation</div>
              <div className="mt-0.5 text-xl font-bold tabular-nums text-[#0C0C0C] dark:text-[#F2F2F2]">
                {profile.reputation}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#595959] dark:text-[#A3A3A3]">Standing</div>
              <div className={`mt-1 text-sm font-bold ${tier.accentClass}`}>
                {tier.name}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#595959] dark:text-[#A3A3A3]">Posts</div>
              {onViewMyPosts && profile.postsCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewMyPosts();
                  }}
                  className="mt-0.5 inline-flex items-baseline gap-1.5 text-xl font-bold tabular-nums text-[#0C0C0C] dark:text-[#F2F2F2] hover:text-[#CC0000] dark:hover:text-[#FF5A5A] transition-colors cursor-pointer"
                >
                  <span>{profile.postsCount}</span>
                  <span className="text-[11px] font-semibold text-[#CC0000] dark:text-[#FF5A5A]">
                    View
                  </span>
                </button>
              ) : (
                <div className="mt-0.5 text-xl font-bold tabular-nums text-[#0C0C0C] dark:text-[#F2F2F2]">
                  {profile.postsCount}
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-xs text-[#CC0000] dark:text-[#FF6B6B]">{error}</p>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="modal-handle"
                className="text-xs font-semibold text-[#595959] dark:text-[#A3A3A3]"
              >
                Handle
              </label>
              <span className="text-xs tabular-nums text-[#737373]">
                {handleInput.length}/{VALIDATION_LIMITS.handleMax}
              </span>
            </div>
            <input
              id="modal-handle"
              type="text"
              required
              minLength={VALIDATION_LIMITS.handleMin}
              maxLength={VALIDATION_LIMITS.handleMax}
              pattern="^[a-zA-Z0-9_\-]+$"
              value={handleInput}
              onChange={(e) => setHandleInput(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C] text-[#0C0C0C] dark:text-[#F2F2F2] focus:outline-none focus:bg-white dark:focus:bg-[#141414] focus:ring-2 focus:ring-[#CC0000]/30"
            />
            <p className="mt-1 text-xs text-[#595959] dark:text-[#A3A3A3]">
              Only shown when you turn off "Post anonymously". Your email is always private.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="modal-bio"
                className="text-xs font-semibold text-[#595959] dark:text-[#A3A3A3]"
              >
                Short note (optional)
              </label>
              <span className="text-xs tabular-nums text-[#737373]">
                {bioInput.length}/{VALIDATION_LIMITS.bioMax}
              </span>
            </div>
            <textarea
              id="modal-bio"
              rows={2}
              maxLength={VALIDATION_LIMITS.bioMax}
              value={bioInput}
              onChange={(e) => setBioInput(e.target.value)}
              placeholder="A brief note on your profile..."
              className="w-full px-3 py-2 text-sm rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C] text-[#0C0C0C] dark:text-[#F2F2F2] focus:outline-none focus:bg-white dark:focus:bg-[#141414] focus:ring-2 focus:ring-[#CC0000]/30"
            />
          </div>

          {/* Privacy & Posting Defaults */}
          <div className="pt-3 border-t border-[#E6E6E6] dark:border-[#262626] space-y-3">
            <div className="text-xs font-semibold text-[#595959] dark:text-[#A3A3A3]">
              Posting defaults
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={defaultAnonymous}
                onChange={(e) => setDefaultAnonymous(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#CC0000] rounded cursor-pointer shrink-0"
              />
              <div>
                <div className="text-sm font-medium text-[#0C0C0C] dark:text-[#F2F2F2]">
                  Post anonymously by default
                </div>
                <div className="text-xs text-[#595959] dark:text-[#A3A3A3] mt-0.5">
                  Hide your @handle behind an anonymous label on new posts and replies.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={defaultHideContent}
                onChange={(e) => setDefaultHideContent(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#CC0000] rounded cursor-pointer shrink-0"
              />
              <div>
                <div className="text-sm font-medium text-[#0C0C0C] dark:text-[#F2F2F2]">
                  Hide my posts by default
                </div>
                <div className="text-xs text-[#595959] dark:text-[#A3A3A3] mt-0.5">
                  Keep your post body collapsed behind a tap-to-reveal cover in the feed.
                </div>
              </div>
            </label>
          </div>

          {/* Quiet Tier Scale Reference */}
          <div className="pt-3 border-t border-[#E6E6E6] dark:border-[#262626] flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#595959] dark:text-[#A3A3A3]">
            {REPUTATION_TIERS.map((t) => (
              <span key={t.name}>
                <span className={`font-semibold ${t.accentClass}`}>{t.name}</span>{' '}
                <span className="tabular-nums">{t.minRep < 0 ? '<0' : `${t.minRep}+`}</span>
              </span>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-[#595959] dark:text-[#A3A3A3] hover:text-[#0C0C0C] dark:hover:text-[#F2F2F2] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-[#0C0C0C] text-white dark:bg-[#F2F2F2] dark:text-[#0C0C0C] hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
