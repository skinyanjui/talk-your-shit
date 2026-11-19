import React, { useState } from 'react';
import { Check, Shield } from 'lucide-react';
import {
  getReputationTier,
  getRoleTierLabel,
  REPUTATION_TIERS,
  type UserProfile,
  VALIDATION_LIMITS,
} from '../types';
import { updateUserProfile } from '../lib/firestoreService';

interface ReputationViewProps {
  currentProfile: UserProfile | null;
  profiles: UserProfile[];
  loading: boolean;
  searchQuery: string;
  onClearSearch: () => void;
  onRequireSignIn: () => void;
  onToast: (message: string) => void;
}

export function ReputationView({
  currentProfile,
  profiles,
  loading,
  searchQuery,
  onClearSearch,
  onRequireSignIn,
  onToast,
}: ReputationViewProps) {
  const [editing, setEditing] = useState(false);
  const [handleInput, setHandleInput] = useState(currentProfile?.handle || '');
  const [bioInput, setBioInput] = useState(currentProfile?.bio || '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  React.useEffect(() => {
    if (currentProfile) {
      setHandleInput(currentProfile.handle);
      setBioInput(currentProfile.bio);
    }
  }, [currentProfile?.uid]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!currentProfile) return;
    setFormError(null);
    setSaving(true);
    try {
      await updateUserProfile(currentProfile.uid, handleInput, bioInput);
      setEditing(false);
      onToast('Handle updated.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to update handle.');
    } finally {
      setSaving(false);
    }
  }

  const q = searchQuery.trim().toLowerCase();
  const sortedProfiles = [...profiles]
    .filter((member) => {
      if (!q) return true;
      const tier = getReputationTier(member.reputation).name;
      const hay = `${member.handle} ${member.bio} ${member.role} ${member.status} ${tier}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => b.reputation - a.reputation);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#0C0C0C] dark:text-[#F2F2F2]">
          Reputation
        </h1>
        <p className="mt-1.5 text-sm text-[#595959] dark:text-[#A3A3A3] max-w-xl">
          Upvotes (+2) and downvotes (-2) build community trust under your handle without exposing your real identity.
        </p>
      </div>

      {/* Compact Own Standing Block */}
      <section className="border border-[#E6E6E6] dark:border-[#242424] bg-white dark:bg-[#141414] rounded-lg p-5">
        {currentProfile ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-[#0C0C0C] dark:text-[#F2F2F2]">
                    @{currentProfile.handle}
                  </span>
                  <span className="text-xs text-[#595959] dark:text-[#A3A3A3]">
                    · {getRoleTierLabel(currentProfile.role)}
                  </span>
                </div>
                {currentProfile.bio && (
                  <p className="mt-1 text-xs text-[#595959] dark:text-[#A3A3A3]">
                    {currentProfile.bio}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-5">
                <div className="text-right">
                  <div className="text-xl font-bold tabular-nums text-[#0C0C0C] dark:text-[#F2F2F2]">
                    {currentProfile.reputation}
                  </div>
                  <div
                    className={`text-xs font-bold ${getReputationTier(currentProfile.reputation).accentClass}`}
                  >
                    {getReputationTier(currentProfile.reputation).name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md border border-[#D4D4D4] dark:border-[#333333] text-[#0C0C0C] dark:text-[#F2F2F2] hover:bg-[#F7F7F7] dark:hover:bg-[#1E1E1E] cursor-pointer whitespace-nowrap"
                >
                  {editing ? 'Cancel' : 'Edit handle'}
                </button>
              </div>
            </div>

            {editing && (
              <form
                onSubmit={handleSaveProfile}
                className="pt-4 border-t border-[#E6E6E6] dark:border-[#242424] grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                {formError && (
                  <p className="sm:col-span-2 text-xs text-[#CC0000] dark:text-[#FF6B6B]">
                    {formError}
                  </p>
                )}
                <input
                  type="text"
                  required
                  minLength={VALIDATION_LIMITS.handleMin}
                  maxLength={VALIDATION_LIMITS.handleMax}
                  pattern="^[a-zA-Z0-9_\-]+$"
                  value={handleInput}
                  onChange={(e) => setHandleInput(e.target.value)}
                  placeholder="Handle"
                  className="px-3 py-2 text-sm rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C] text-[#0C0C0C] dark:text-[#F2F2F2]"
                />
                <input
                  type="text"
                  maxLength={VALIDATION_LIMITS.bioMax}
                  value={bioInput}
                  onChange={(e) => setBioInput(e.target.value)}
                  placeholder="Short note (optional)"
                  className="px-3 py-2 text-sm rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C] text-[#0C0C0C] dark:text-[#F2F2F2]"
                />
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md bg-[#0C0C0C] text-white dark:bg-[#F2F2F2] dark:text-[#0C0C0C] cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-[#595959] dark:text-[#A3A3A3]">
              Sign in with Google to get a handle and 10 starting reputation.
            </p>
            <button
              type="button"
              onClick={onRequireSignIn}
              className="px-4 py-2 text-xs font-semibold rounded-md bg-[#CC0000] text-white hover:bg-[#A80000] shrink-0 cursor-pointer"
            >
              Sign in
            </button>
          </div>
        )}
      </section>

      {/* Quiet Trust Tier Scale */}
      <section className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#595959] dark:text-[#A3A3A3]">
        {REPUTATION_TIERS.map((tier) => (
          <span key={tier.name} className="inline-flex items-center gap-1.5">
            <span className={`font-bold ${tier.accentClass}`}>{tier.name}</span>
            <span className="tabular-nums">
              {tier.minRep < 0 ? '<0' : `${tier.minRep}+`}
            </span>
          </span>
        ))}
      </section>

      {/* Clean Member Standing Table */}
      <section className="border border-[#E6E6E6] dark:border-[#242424] bg-white dark:bg-[#141414] rounded-lg overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#E6E6E6] dark:border-[#242424] text-xs font-semibold text-[#595959] dark:text-[#A3A3A3]">
              <th className="py-3 px-4">Handle</th>
              <th className="py-3 px-4">Tier</th>
              <th className="py-3 px-4 text-right">Posts</th>
              <th className="py-3 px-4 text-right">Rep</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E6E6E6] dark:divide-[#242424] text-sm">
            {loading ? (
              <tr>
                <td colSpan={4} className="py-6 px-4 text-center text-xs text-[#595959]">
                  Loading directory...
                </td>
              </tr>
            ) : sortedProfiles.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 px-4 text-center text-xs text-[#595959] dark:text-[#A3A3A3]">
                  {q ? (
                    <span>
                      No members match "{searchQuery}".{' '}
                      <button
                        type="button"
                        onClick={onClearSearch}
                        className="font-semibold text-[#CC0000] hover:underline cursor-pointer"
                      >
                        Clear search
                      </button>
                    </span>
                  ) : (
                    'No members yet.'
                  )}
                </td>
              </tr>
            ) : (
              sortedProfiles.map((member) => {
                const tier = getReputationTier(member.reputation);
                return (
                  <tr key={member.uid}>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0C0C0C] dark:text-[#F2F2F2]">
                        @{member.handle}
                        {member.role !== 'member' && (
                          <Shield className="w-3.5 h-3.5 text-[#CC0000]" />
                        )}
                      </span>
                    </td>
                    <td className={`py-3 px-4 text-xs font-semibold ${tier.accentClass}`}>
                      {tier.name}
                    </td>
                    <td className="py-3 px-4 text-right text-xs tabular-nums text-[#595959] dark:text-[#A3A3A3]">
                      {member.postsCount}
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-bold tabular-nums text-[#0C0C0C] dark:text-[#F2F2F2]">
                      {member.reputation}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
