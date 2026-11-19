import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  type CommunitySettings,
  type Confession,
  formatRelativeTime,
  getRoleTierLabel,
  type ModerationLog,
  type ModerationReport,
  type UserProfile,
  type UserRole,
  type UserStatus,
  VALIDATION_LIMITS,
} from '../types';
import {
  moderateConfessionAndReport,
  saveCommunitySettings,
  updateUserGovernance,
} from '../lib/firestoreService';

interface ModerationViewProps {
  currentProfile: UserProfile | null;
  confessions: Confession[];
  profiles: UserProfile[];
  settings: CommunitySettings;
  searchQuery: string;
  onClearSearch: () => void;
  onRequireSignIn: () => void;
  onToast: (message: string) => void;
}

type ModTab = 'queue' | 'audit' | 'governance';

export function ModerationView({
  currentProfile,
  confessions,
  profiles,
  settings,
  searchQuery,
  onClearSearch,
  onRequireSignIn,
  onToast,
}: ModerationViewProps) {
  const [activeTab, setActiveTab] = useState<ModTab>('queue');
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const [policyDraft, setPolicyDraft] = useState({
    autoQuarantineFlags: settings.autoQuarantineFlags,
    minRepToPost: settings.minRepToPost,
    minRepToReport: settings.minRepToReport,
    encryptionEnabled: settings.encryptionEnabled,
    unfilteredModeEnabled: settings.unfilteredModeEnabled,
    announcement: settings.announcement,
  });
  const [savingPolicy, setSavingPolicy] = useState(false);

  useEffect(() => {
    setPolicyDraft({
      autoQuarantineFlags: settings.autoQuarantineFlags,
      minRepToPost: settings.minRepToPost,
      minRepToReport: settings.minRepToReport,
      encryptionEnabled: settings.encryptionEnabled,
      unfilteredModeEnabled: settings.unfilteredModeEnabled,
      announcement: settings.announcement,
    });
  }, [settings]);

  const isSignedIn = Boolean(currentProfile);
  const isMod = currentProfile?.role === 'moderator';
  const isAdmin = currentProfile?.role === 'admin';
  const isModOrAdmin = isMod || isAdmin;

  useEffect(() => {
    if (!isSignedIn) return;
    setLoadingReports(true);
    const q = query(
      collection(db, 'reports'),
      where('status', 'in', ['open', 'resolved', 'dismissed']),
      limit(60)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ModerationReport)
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() ?? Date.now();
            const tb = b.createdAt?.toMillis?.() ?? Date.now();
            return tb - ta;
          });
        setReports(items);
        setLoadingReports(false);
      },
      (error) => {
        setLoadingReports(false);
        handleFirestoreError(error, OperationType.LIST, 'reports');
      }
    );
    return () => unsub();
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    setLoadingLogs(true);
    const q = query(
      collection(db, 'moderationLogs'),
      where('actorTier', 'in', ['tier2_mod', 'tier3_admin']),
      limit(80)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as ModerationLog)
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis?.() ?? Date.now();
            const tb = b.createdAt?.toMillis?.() ?? Date.now();
            return tb - ta;
          });
        setLogs(items);
        setLoadingLogs(false);
      },
      (error) => {
        setLoadingLogs(false);
        handleFirestoreError(error, OperationType.LIST, 'moderationLogs');
      }
    );
    return () => unsub();
  }, [isSignedIn]);

  const q = searchQuery.trim().toLowerCase();

  const filteredReports = reports.filter((rep) => {
    if (!q) return true;
    const hay = `${rep.targetTitle} ${rep.reason} ${rep.reporterHandle} ${rep.details} ${rep.status} ${rep.resolutionNote}`.toLowerCase();
    return hay.includes(q);
  });

  const filteredLogs = logs.filter((entry) => {
    if (!q) return true;
    const hay = `${entry.actorHandle} ${entry.actorTier} ${entry.action} ${entry.targetType} ${entry.reason}`.toLowerCase();
    return hay.includes(q);
  });

  const filteredProfiles = profiles.filter((member) => {
    if (!q) return true;
    const hay = `${member.handle} ${member.role} ${member.status}`.toLowerCase();
    return hay.includes(q);
  });

  const openReports = filteredReports.filter((r) => r.status === 'open');

  async function handleResolveReport(
    report: ModerationReport,
    action: 'approve' | 'quarantine' | 'remove',
    penalty = 0
  ) {
    if (!currentProfile || !isModOrAdmin) return;
    const targetConf = confessions.find((c) => c.id === report.confessionId);
    const reason =
      (rationales[report.id] || '').trim() ||
      (action === 'approve'
        ? 'Reviewed: within community standards.'
        : action === 'quarantine'
          ? `Quarantined following ${report.reason} report.`
          : `Removed by Tier 3 Admin for ${report.reason}.`);

    setBusyId(report.id);
    try {
      await moderateConfessionAndReport({
        actorProfile: currentProfile,
        confessionId: report.confessionId,
        authorUid: targetConf?.authorUid,
        report,
        action,
        reason,
        reputationPenalty: penalty,
      });
      onToast('Decision recorded to audit log.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to resolve report.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleMemberGovernance(
    target: UserProfile,
    changes: { nextRole?: UserRole; nextStatus?: UserStatus; reputationDelta?: number },
    reason: string
  ) {
    if (!currentProfile) return;
    setBusyId(target.uid);
    try {
      await updateUserGovernance({
        actorProfile: currentProfile,
        targetProfile: target,
        ...changes,
        reason,
      });
      onToast(`Updated @${target.handle}.`);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSavePolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!currentProfile || !isAdmin) return;
    setSavingPolicy(true);
    try {
      await saveCommunitySettings(currentProfile, policyDraft);
      onToast('Community standards updated.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to save policy.');
    } finally {
      setSavingPolicy(false);
    }
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0C0C0C] dark:text-[#F2F2F2]">
            Moderation
          </h1>
          <p className="mt-1.5 text-sm text-[#595959] dark:text-[#A3A3A3] max-w-xl">
            Three tiers keep standards transparent: Tier 1 community flags (auto-hides at {settings.autoQuarantineFlags}), Tier 2 moderator triage, and Tier 3 admin governance.
          </p>
        </div>
        {currentProfile && (
          <span className="text-xs font-semibold text-[#0C0C0C] dark:text-[#F2F2F2]">
            {getRoleTierLabel(currentProfile.role)}
          </span>
        )}
      </div>

      {!isSignedIn ? (
        <div className="border border-[#E6E6E6] dark:border-[#242424] bg-white dark:bg-[#141414] rounded-lg p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-sm text-[#595959] dark:text-[#A3A3A3]">
            Sign in with Google to view open community flags and the moderation audit log.
          </p>
          <button
            type="button"
            onClick={onRequireSignIn}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-[#CC0000] text-white hover:bg-[#A80000] shrink-0 cursor-pointer"
          >
            Sign in
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 p-1 bg-[#F2F2F2] dark:bg-[#1A1A1A] rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'queue'
                  ? 'bg-white dark:bg-[#2A2A2A] text-[#0C0C0C] dark:text-[#F2F2F2]'
                  : 'text-[#595959] dark:text-[#A3A3A3]'
              }`}
            >
              Queue ({openReports.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === 'audit'
                  ? 'bg-white dark:bg-[#2A2A2A] text-[#0C0C0C] dark:text-[#F2F2F2]'
                  : 'text-[#595959] dark:text-[#A3A3A3]'
              }`}
            >
              Audit Log ({filteredLogs.length})
            </button>
            {isModOrAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('governance')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === 'governance'
                    ? 'bg-white dark:bg-[#2A2A2A] text-[#0C0C0C] dark:text-[#F2F2F2]'
                    : 'text-[#595959] dark:text-[#A3A3A3]'
                }`}
              >
                {isAdmin ? 'Admin Controls' : 'Member Standing'}
              </button>
            )}
          </div>

          {/* QUEUE */}
          {activeTab === 'queue' && (
            <section className="border border-[#E6E6E6] dark:border-[#242424] bg-white dark:bg-[#141414] rounded-lg divide-y divide-[#E6E6E6] dark:divide-[#242424]">
              {loadingReports ? (
                <div className="p-6 text-xs text-[#595959]">Loading reports...</div>
              ) : filteredReports.length === 0 ? (
                <div className="p-10 text-center">
                  <CheckCircle2 className="w-6 h-6 text-[#15803D] dark:text-[#4ADE80] mx-auto" />
                  <p className="mt-2 text-sm font-bold text-[#0C0C0C] dark:text-[#F2F2F2]">
                    {q ? `No reports match "${searchQuery}"` : 'Queue is clear'}
                  </p>
                  <p className="mt-1 text-xs text-[#595959] dark:text-[#A3A3A3]">
                    {q ? (
                      <button
                        type="button"
                        onClick={onClearSearch}
                        className="font-semibold text-[#CC0000] hover:underline cursor-pointer"
                      >
                        Clear search
                      </button>
                    ) : (
                      'Flagged posts from the feed will appear here for review.'
                    )}
                  </p>
                </div>
              ) : (
                filteredReports.map((rep) => (
                  <div key={rep.id} className="p-5 space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#595959] dark:text-[#A3A3A3]">
                      <span
                        className={`font-bold uppercase ${
                          rep.status === 'open'
                            ? 'text-[#CC0000]'
                            : 'text-[#15803D] dark:text-[#4ADE80]'
                        }`}
                      >
                        {rep.status}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold">{rep.reason.replace('_', ' ')}</span>
                      <span aria-hidden="true">·</span>
                      <span>@{rep.reporterHandle}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">
                        {formatRelativeTime(rep.createdAt)}
                      </span>
                    </div>

                    <div className="text-sm font-bold text-[#0C0C0C] dark:text-[#F2F2F2]">
                      {rep.targetTitle || rep.confessionId}
                    </div>
                    {rep.details && (
                      <p className="text-xs text-[#595959] dark:text-[#A3A3A3]">"{rep.details}"</p>
                    )}
                    {rep.resolutionNote && (
                      <p className="text-xs text-[#15803D] dark:text-[#4ADE80]">
                        Note: {rep.resolutionNote}
                      </p>
                    )}

                    {rep.status === 'open' && isModOrAdmin && (
                      <div className="pt-1 space-y-2.5">
                        <input
                          type="text"
                          value={rationales[rep.id] || ''}
                          onChange={(e) =>
                            setRationales((prev) => ({ ...prev, [rep.id]: e.target.value }))
                          }
                          placeholder="Reason for audit log..."
                          className="w-full px-3 py-1.5 text-xs rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C] text-[#0C0C0C] dark:text-[#F2F2F2]"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={busyId === rep.id}
                            onClick={() => handleResolveReport(rep, 'approve', 0)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] text-[#15803D] dark:text-[#4ADE80] cursor-pointer"
                          >
                            Dismiss &amp; Restore
                          </button>
                          <button
                            type="button"
                            disabled={busyId === rep.id}
                            onClick={() => handleResolveReport(rep, 'quarantine', -10)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[#B45309] text-white cursor-pointer"
                          >
                            Quarantine (-10 rep)
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              disabled={busyId === rep.id}
                              onClick={() => handleResolveReport(rep, 'remove', -25)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[#CC0000] text-white cursor-pointer"
                            >
                              Remove (-25 rep)
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </section>
          )}

          {/* AUDIT LOG */}
          {activeTab === 'audit' && (
            <section className="border border-[#E6E6E6] dark:border-[#242424] bg-white dark:bg-[#141414] rounded-lg divide-y divide-[#E6E6E6] dark:divide-[#242424]">
              {loadingLogs ? (
                <div className="p-6 text-xs text-[#595959]">Loading audit log...</div>
              ) : filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#595959] dark:text-[#A3A3A3]">
                  {q ? (
                    <span>
                      No audit entries match "{searchQuery}".{' '}
                      <button
                        type="button"
                        onClick={onClearSearch}
                        className="font-semibold text-[#CC0000] hover:underline cursor-pointer"
                      >
                        Clear search
                      </button>
                    </span>
                  ) : (
                    'No moderation actions logged yet.'
                  )}
                </div>
              ) : (
                filteredLogs.map((entry) => (
                  <div key={entry.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[#0C0C0C] dark:text-[#F2F2F2]">
                          @{entry.actorHandle}
                        </span>
                        <span className="text-[#595959] dark:text-[#A3A3A3]">
                          {entry.actorTier === 'tier3_admin' ? 'Tier 3' : 'Tier 2'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-[#0C0C0C] dark:text-[#F2F2F2]">
                          {entry.action.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-[#595959] dark:text-[#A3A3A3]">{entry.reason}</p>
                    </div>
                    <span className="tabular-nums text-[#595959] dark:text-[#A3A3A3] shrink-0">
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </section>
          )}

          {/* GOVERNANCE (ROLES + TIER 3 THRESHOLDS) */}
          {activeTab === 'governance' && isModOrAdmin && (
            <div className="space-y-8">
              <section className="border border-[#E6E6E6] dark:border-[#242424] bg-white dark:bg-[#141414] rounded-lg overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E6E6E6] dark:border-[#242424] text-xs font-semibold text-[#595959] dark:text-[#A3A3A3]">
                      <th className="py-3 px-4">Member</th>
                      <th className="py-3 px-4 text-right">Rep</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Adjust</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6E6E6] dark:divide-[#242424] text-xs">
                    {filteredProfiles.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 px-4 text-center text-[#595959] dark:text-[#A3A3A3]">
                          No members match "{searchQuery}".
                        </td>
                      </tr>
                    ) : (
                      filteredProfiles.map((member) => {
                      const isSelf = member.uid === currentProfile?.uid;
                      return (
                        <tr key={member.uid}>
                          <td className="py-3 px-4 font-semibold text-[#0C0C0C] dark:text-[#F2F2F2]">
                            @{member.handle}
                          </td>
                          <td className="py-3 px-4 text-right font-bold tabular-nums">
                            {member.reputation}
                          </td>
                          <td className="py-3 px-4">
                            {isAdmin && !isSelf ? (
                              <select
                                disabled={busyId === member.uid}
                                value={member.role}
                                onChange={(e) =>
                                  handleMemberGovernance(
                                    member,
                                    { nextRole: e.target.value as UserRole },
                                    `Changed role to ${e.target.value}.`
                                  )
                                }
                                className="px-2 py-1 text-xs rounded border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C]"
                              >
                                <option value="member">Tier 1 · Member</option>
                                <option value="moderator">Tier 2 · Mod</option>
                                <option value="admin">Tier 3 · Admin</option>
                              </select>
                            ) : (
                              <span className="text-[#595959] dark:text-[#A3A3A3]">
                                {getRoleTierLabel(member.role)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {isAdmin && !isSelf ? (
                              <select
                                disabled={busyId === member.uid}
                                value={member.status}
                                onChange={(e) =>
                                  handleMemberGovernance(
                                    member,
                                    { nextStatus: e.target.value as UserStatus },
                                    `Changed status to ${e.target.value}.`
                                  )
                                }
                                className="px-2 py-1 text-xs rounded border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C]"
                              >
                                <option value="active">Active</option>
                                <option value="muted">Muted</option>
                                <option value="suspended">Suspended</option>
                              </select>
                            ) : (
                              <span className="capitalize text-[#595959] dark:text-[#A3A3A3]">
                                {member.status}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap font-semibold">
                            <button
                              type="button"
                              disabled={busyId === member.uid}
                              onClick={() =>
                                handleMemberGovernance(
                                  member,
                                  { reputationDelta: 15 },
                                  'Constructive standing bonus (+15 rep).'
                                )
                              }
                              className="text-[#15803D] dark:text-[#4ADE80] hover:underline cursor-pointer"
                            >
                              +15
                            </button>
                            <button
                              type="button"
                              disabled={busyId === member.uid}
                              onClick={() =>
                                handleMemberGovernance(
                                  member,
                                  { reputationDelta: -15 },
                                  'Moderation warning (-15 rep).'
                                )
                              }
                              className="text-[#CC0000] dark:text-[#FF6B6B] hover:underline cursor-pointer"
                            >
                              -15
                            </button>
                          </td>
                        </tr>
                      );
                      })
                    )}
                  </tbody>
                </table>
              </section>

              {isAdmin && (
                <form
                  onSubmit={handleSavePolicy}
                  className="border border-[#E6E6E6] dark:border-[#242424] bg-white dark:bg-[#141414] rounded-lg p-5 space-y-4"
                >
                  <h2 className="text-base font-bold text-[#0C0C0C] dark:text-[#F2F2F2]">
                    Tier 3 Community Thresholds
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#595959] dark:text-[#A3A3A3] mb-1">
                        Auto-hide flags
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={policyDraft.autoQuarantineFlags}
                        onChange={(e) =>
                          setPolicyDraft((p) => ({
                            ...p,
                            autoQuarantineFlags: Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-1.5 text-sm tabular-nums rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#595959] dark:text-[#A3A3A3] mb-1">
                        Min rep to post
                      </label>
                      <input
                        type="number"
                        min={-50}
                        max={100}
                        value={policyDraft.minRepToPost}
                        onChange={(e) =>
                          setPolicyDraft((p) => ({ ...p, minRepToPost: Number(e.target.value) }))
                        }
                        className="w-full px-3 py-1.5 text-sm tabular-nums rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#595959] dark:text-[#A3A3A3] mb-1">
                        Min rep to flag
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={policyDraft.minRepToReport}
                        onChange={(e) =>
                          setPolicyDraft((p) => ({ ...p, minRepToReport: Number(e.target.value) }))
                        }
                        className="w-full px-3 py-1.5 text-sm tabular-nums rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C]"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="policy-announcement"
                        className="text-xs font-semibold text-[#595959] dark:text-[#A3A3A3]"
                      >
                        Public board announcement (optional)
                      </label>
                      <span className="text-xs tabular-nums text-[#737373]">
                        {policyDraft.announcement.length}/{VALIDATION_LIMITS.announcementMax}
                      </span>
                    </div>
                    <input
                      id="policy-announcement"
                      type="text"
                      maxLength={VALIDATION_LIMITS.announcementMax}
                      value={policyDraft.announcement}
                      onChange={(e) =>
                        setPolicyDraft((p) => ({ ...p, announcement: e.target.value }))
                      }
                      placeholder="Leave blank to hide notice on the public feed..."
                      className="w-full px-3 py-1.5 text-sm rounded-md border border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F7] dark:bg-[#0C0C0C] text-[#0C0C0C] dark:text-[#F2F2F2]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                    <div className="flex flex-wrap items-center gap-5 text-xs">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={policyDraft.unfilteredModeEnabled}
                          onChange={(e) =>
                            setPolicyDraft((p) => ({
                              ...p,
                              unfilteredModeEnabled: e.target.checked,
                            }))
                          }
                          className="accent-[#CC0000]"
                        />
                        <span>Allow mature tag</span>
                      </label>
                    </div>
                    <button
                      type="submit"
                      disabled={savingPolicy}
                      className="px-4 py-1.5 text-xs font-semibold rounded-md bg-[#CC0000] text-white hover:bg-[#A80000] cursor-pointer"
                    >
                      {savingPolicy ? 'Saving...' : 'Save Policy'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
