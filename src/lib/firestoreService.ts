import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { BOOTSTRAPPED_ADMIN_EMAIL, db, handleFirestoreError, OperationType } from '../firebase';
import {
  type CommunitySettings,
  type Confession,
  type ConfessionStatus,
  type ConfessionTopic,
  generateGhostMask,
  generateStarterHandle,
  type ModerationActionType,
  type ModerationReport,
  type ReportReason,
  type SensitivityLevel,
  type UserProfile,
  type UserRole,
  type UserStatus,
  VALIDATION_LIMITS,
} from '../types';
import { classifyPostTopic, deriveTitleFromBody } from './topicClassifier';
import { getMissingStarterPosts } from './starterPreview';

export async function ensureUserAccountAndProfile(user: User): Promise<UserProfile> {
  const userPath = `users/${user.uid}`;
  const profilePath = `userProfiles/${user.uid}`;

  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    const safeEmail = (user.email || 'unknown@example.com').slice(0, 254);
    const safeDisplay = (user.displayName || '').slice(0, 120);

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email: safeEmail,
        displayName: safeDisplay,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(userRef, {
        email: safeEmail,
        displayName: safeDisplay,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  try {
    const profileRef = doc(db, 'userProfiles', user.uid);
    const profileSnap = await getDoc(profileRef);
    const isBootstrappedAdmin =
      user.email === BOOTSTRAPPED_ADMIN_EMAIL && user.emailVerified === true;

    if (!profileSnap.exists()) {
      const initialHandle = generateStarterHandle(user.uid);
      const initialProfile = {
        uid: user.uid,
        handle: initialHandle,
        bio: '',
        reputation: 10,
        role: (isBootstrappedAdmin ? 'admin' : 'member') as UserRole,
        status: 'active' as UserStatus,
        postsCount: 0,
        flagsSubmitted: 0,
        lastVoteConfessionId: '',
        defaultAnonymous: true,
        defaultHideContent: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(profileRef, initialProfile);
      const fresh = await getDoc(profileRef);
      return fresh.data() as UserProfile;
    }

    const existingProfile = profileSnap.data() as UserProfile;
    // If bootstrapped admin signed in earlier before promotion, elevate via admin rule
    if (isBootstrappedAdmin && existingProfile.role !== 'admin') {
      await updateDoc(profileRef, {
        role: 'admin',
        status: 'active',
        updatedAt: serverTimestamp(),
      });
      return { ...existingProfile, role: 'admin', status: 'active' };
    }

    return existingProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, profilePath);
  }
}

export async function updateUserProfile(
  uid: string,
  rawHandle: string,
  rawBio: string,
  defaults?: { defaultAnonymous: boolean; defaultHideContent: boolean }
): Promise<void> {
  const handle = rawHandle.trim().slice(0, VALIDATION_LIMITS.handleMax);
  const bio = rawBio.trim().slice(0, VALIDATION_LIMITS.bioMax);

  if (
    handle.length < VALIDATION_LIMITS.handleMin ||
    !VALIDATION_LIMITS.handlePattern.test(handle)
  ) {
    throw new Error(
      'Handle must be 3–32 characters using only letters, numbers, hyphens, or underscores.'
    );
  }

  const path = `userProfiles/${uid}`;
  const payload: Record<string, unknown> = {
    handle,
    bio,
    updatedAt: serverTimestamp(),
  };
  if (defaults) {
    payload.defaultAnonymous = Boolean(defaults.defaultAnonymous);
    payload.defaultHideContent = Boolean(defaults.defaultHideContent);
  }

  try {
    await updateDoc(doc(db, 'userProfiles', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export interface CreateConfessionInput {
  authorProfile: UserProfile;
  title?: string;
  body: string;
  topic?: ConfessionTopic;
  sensitivity: SensitivityLevel;
  isAnonymous: boolean;
}

export async function createConfession(input: CreateConfessionInput): Promise<string> {
  const body = input.body.trim().slice(0, VALIDATION_LIMITS.bodyMax);

  if (body.length < VALIDATION_LIMITS.bodyMinPlain) {
    throw new Error('Post must be at least 10 characters.');
  }

  const rawTitle = input.title?.trim() ? input.title.trim() : deriveTitleFromBody(body);
  const title = rawTitle.slice(0, VALIDATION_LIMITS.titleMax);
  const topic = input.topic ?? classifyPostTopic(body);

  const confessionRef = doc(collection(db, 'confessions'));
  const authorHandle = input.isAnonymous
    ? generateGhostMask(input.authorProfile.uid, confessionRef.id)
    : input.authorProfile.handle;

  const batch = writeBatch(db);
  batch.set(confessionRef, {
    authorUid: input.authorProfile.uid,
    authorHandle: authorHandle.slice(0, 48),
    isAnonymous: input.isAnonymous,
    title,
    body,
    topic,
    sensitivity: input.sensitivity,
    isEncrypted: false,
    ciphertext: '',
    encryptionIv: '',
    encryptionSalt: '',
    encryptionHint: '',
    score: 0,
    upvotes: 0,
    downvotes: 0,
    replyCount: 0,
    flagCount: 0,
    status: 'active',
    moderationNote: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'userProfiles', input.authorProfile.uid), {
    postsCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return confessionRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `confessions/${confessionRef.id}`);
  }
}

export async function editConfession(
  confessionId: string,
  updates: {
    body: string;
    sensitivity: SensitivityLevel;
  }
): Promise<void> {
  const body = updates.body.trim().slice(0, VALIDATION_LIMITS.bodyMax);

  if (body.length < VALIDATION_LIMITS.bodyMinPlain) {
    throw new Error('Post must be at least 10 characters.');
  }

  const title = deriveTitleFromBody(body);
  const path = `confessions/${confessionId}`;
  try {
    await updateDoc(doc(db, 'confessions', confessionId), {
      title,
      body,
      sensitivity: updates.sensitivity,
      encryptionHint: '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteConfession(confessionId: string): Promise<void> {
  const path = `confessions/${confessionId}`;
  try {
    await deleteDoc(doc(db, 'confessions', confessionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveConfession(userId: string, confession: Confession): Promise<void> {
  const path = `users/${userId}/saved/${confession.id}`;
  const safeTitle = (confession.title.trim() || 'Untitled post').slice(
    0,
    VALIDATION_LIMITS.titleMax
  );
  try {
    await setDoc(doc(db, 'users', userId, 'saved', confession.id), {
      userId,
      confessionId: confession.id,
      title: safeTitle,
      topic: confession.topic,
      savedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function unsaveConfession(userId: string, confessionId: string): Promise<void> {
  const path = `users/${userId}/saved/${confessionId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'saved', confessionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function castVote(
  confession: Confession,
  voterUid: string,
  direction: 1 | -1,
  currentVote: number | null
): Promise<number | null> {
  const voteRef = doc(db, 'confessions', confession.id, 'votes', voterUid);
  const confessionRef = doc(db, 'confessions', confession.id);
  const authorProfileRef = doc(db, 'userProfiles', confession.authorUid);
  const batch = writeBatch(db);

  let nextVote: number | null = direction;
  let scoreDelta = 0;
  let upvotesDelta = 0;
  let downvotesDelta = 0;
  let repDelta = 0;

  if (currentVote === direction) {
    // Toggle off vote
    nextVote = null;
    batch.delete(voteRef);
    if (direction === 1) {
      scoreDelta = -1;
      upvotesDelta = -1;
      repDelta = -2;
    } else {
      scoreDelta = 1;
      downvotesDelta = -1;
      repDelta = 2;
    }
  } else if (currentVote === null) {
    // New vote
    batch.set(voteRef, {
      voterUid,
      confessionId: confession.id,
      value: direction,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (direction === 1) {
      scoreDelta = 1;
      upvotesDelta = 1;
      repDelta = 2;
    } else {
      scoreDelta = -1;
      downvotesDelta = 1;
      repDelta = -2;
    }
  } else {
    // Switch vote (+1 -> -1 or -1 -> +1)
    batch.update(voteRef, {
      value: direction,
      updatedAt: serverTimestamp(),
    });
    if (direction === 1) {
      scoreDelta = 2;
      upvotesDelta = 1;
      downvotesDelta = -1;
      repDelta = 4;
    } else {
      scoreDelta = -2;
      upvotesDelta = -1;
      downvotesDelta = 1;
      repDelta = -4;
    }
  }

  const confessionUpdate: Record<string, unknown> = {
    score: increment(scoreDelta),
    updatedAt: serverTimestamp(),
  };
  if (upvotesDelta !== 0) confessionUpdate.upvotes = increment(upvotesDelta);
  if (downvotesDelta !== 0) confessionUpdate.downvotes = increment(downvotesDelta);
  batch.update(confessionRef, confessionUpdate);

  // Atomically update author reputation (no self-farming)
  if (confession.authorUid !== voterUid && repDelta !== 0) {
    batch.update(authorProfileRef, {
      reputation: increment(repDelta),
      lastVoteConfessionId: confession.id,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
    return nextVote;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `confessions/${confession.id}/votes/${voterUid}`);
  }
}

export interface CreateReplyInput {
  confessionId: string;
  authorProfile: UserProfile;
  body: string;
  isAnonymous: boolean;
}

export async function createReply(input: CreateReplyInput): Promise<void> {
  const body = input.body.trim().slice(0, VALIDATION_LIMITS.replyBodyMax);
  if (body.length < VALIDATION_LIMITS.replyBodyMinPlain) {
    throw new Error('Reply must be at least 2 characters.');
  }

  const replyRef = doc(collection(db, 'confessions', input.confessionId, 'replies'));
  const authorHandle = input.isAnonymous
    ? generateGhostMask(input.authorProfile.uid, input.confessionId)
    : input.authorProfile.handle;

  const batch = writeBatch(db);
  batch.set(replyRef, {
    confessionId: input.confessionId,
    authorUid: input.authorProfile.uid,
    authorHandle: authorHandle.slice(0, 48),
    isAnonymous: input.isAnonymous,
    body,
    isEncrypted: false,
    ciphertext: '',
    encryptionIv: '',
    encryptionSalt: '',
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'confessions', input.confessionId), {
    replyCount: increment(1),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `confessions/${input.confessionId}/replies/${replyRef.id}`
    );
  }
}

export async function deleteReply(confessionId: string, replyId: string): Promise<void> {
  const path = `confessions/${confessionId}/replies/${replyId}`;
  try {
    await deleteDoc(doc(db, 'confessions', confessionId, 'replies', replyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function submitReport(params: {
  confession: Confession;
  reporterProfile: UserProfile;
  reason: ReportReason;
  details: string;
  autoQuarantineFlags: number;
}): Promise<void> {
  const reportRef = doc(collection(db, 'reports'));
  const details = params.details.trim().slice(0, VALIDATION_LIMITS.reportDetailsMax);
  const batch = writeBatch(db);

  batch.set(reportRef, {
    targetType: 'confession',
    confessionId: params.confession.id,
    replyId: '',
    targetTitle: params.confession.title.slice(0, VALIDATION_LIMITS.titleMax),
    reporterUid: params.reporterProfile.uid,
    reporterHandle: params.reporterProfile.handle.slice(0, 48),
    reason: params.reason,
    details,
    status: 'open',
    resolvedByUid: '',
    resolutionNote: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (params.confession.status === 'active' || params.confession.status === 'flagged') {
    const nextFlags = params.confession.flagCount + 1;
    const nextStatus: ConfessionStatus =
      nextFlags >= params.autoQuarantineFlags ? 'flagged' : params.confession.status;
    batch.update(doc(db, 'confessions', params.confession.id), {
      flagCount: increment(1),
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
  }

  batch.update(doc(db, 'userProfiles', params.reporterProfile.uid), {
    flagsSubmitted: increment(1),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${reportRef.id}`);
  }
}

export async function moderateConfessionAndReport(params: {
  actorProfile: UserProfile;
  confessionId: string;
  authorUid?: string;
  report?: ModerationReport | null;
  action: 'approve' | 'quarantine' | 'remove' | 'dismiss_report';
  reason: string;
  reputationPenalty?: number;
}): Promise<void> {
  const cleanReason = params.reason.trim().slice(0, VALIDATION_LIMITS.moderationReasonMax);
  if (cleanReason.length < VALIDATION_LIMITS.moderationReasonMin) {
    throw new Error('Provide a moderation rationale (at least 3 characters) for the audit ledger.');
  }

  const actorTier = params.actorProfile.role === 'admin' ? 'tier3_admin' : 'tier2_mod';
  if (params.action === 'remove' && actorTier !== 'tier3_admin') {
    throw new Error('Permanent removal requires Tier 3 Lead Admin privileges.');
  }

  const batch = writeBatch(db);
  const confessionRef = doc(db, 'confessions', params.confessionId);

  if (params.action === 'approve') {
    batch.update(confessionRef, {
      status: 'active',
      moderationNote: '',
      updatedAt: serverTimestamp(),
    });
  } else if (params.action === 'quarantine') {
    batch.update(confessionRef, {
      status: 'quarantined',
      moderationNote: cleanReason,
      updatedAt: serverTimestamp(),
    });
  } else if (params.action === 'remove') {
    batch.update(confessionRef, {
      status: 'removed',
      moderationNote: cleanReason,
      updatedAt: serverTimestamp(),
    });
  }

  if (params.report) {
    batch.update(doc(db, 'reports', params.report.id), {
      status: params.action === 'dismiss_report' || params.action === 'approve' ? 'dismissed' : 'resolved',
      resolvedByUid: params.actorProfile.uid,
      resolutionNote: cleanReason,
      updatedAt: serverTimestamp(),
    });
  }

  if (params.authorUid && params.reputationPenalty && params.reputationPenalty !== 0) {
    const clamped = Math.max(-50, Math.min(50, Math.trunc(params.reputationPenalty)));
    batch.update(doc(db, 'userProfiles', params.authorUid), {
      reputation: increment(clamped),
      updatedAt: serverTimestamp(),
    });
  }

  const logRef = doc(collection(db, 'moderationLogs'));
  batch.set(logRef, {
    actorUid: params.actorProfile.uid,
    actorHandle: params.actorProfile.handle.slice(0, 48),
    actorTier,
    action: params.action as ModerationActionType,
    targetType: params.report ? 'report' : 'confession',
    targetId: params.report ? params.report.id : params.confessionId,
    reason: cleanReason,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `confessions/${params.confessionId}`);
  }
}

export async function updateUserGovernance(params: {
  actorProfile: UserProfile;
  targetProfile: UserProfile;
  nextRole?: UserRole;
  nextStatus?: UserStatus;
  reputationDelta?: number;
  reason: string;
}): Promise<void> {
  const cleanReason = params.reason.trim().slice(0, VALIDATION_LIMITS.moderationReasonMax);
  if (cleanReason.length < VALIDATION_LIMITS.moderationReasonMin) {
    throw new Error('Provide a rationale (at least 3 characters) for the audit ledger.');
  }

  const isAdmin = params.actorProfile.role === 'admin';
  const actorTier = isAdmin ? 'tier3_admin' : 'tier2_mod';
  const batch = writeBatch(db);
  const targetRef = doc(db, 'userProfiles', params.targetProfile.uid);

  const updates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  let action: ModerationActionType = 'adjust_reputation';

  if (isAdmin && params.nextRole && params.nextRole !== params.targetProfile.role) {
    updates.role = params.nextRole;
    action = 'change_role';
    const adminDocRef = doc(db, 'admins', params.targetProfile.uid);
    if (params.nextRole === 'admin') {
      batch.set(adminDocRef, {
        uid: params.targetProfile.uid,
        grantedBy: params.actorProfile.uid,
        createdAt: serverTimestamp(),
      });
    } else if (params.targetProfile.role === 'admin') {
      batch.delete(adminDocRef);
    }
  }

  if (isAdmin && params.nextStatus && params.nextStatus !== params.targetProfile.status) {
    updates.status = params.nextStatus;
    action = 'restrict_user';
  }

  if (params.reputationDelta && params.reputationDelta !== 0) {
    const clamped = Math.max(-50, Math.min(50, Math.trunc(params.reputationDelta)));
    updates.reputation = increment(clamped);
  }

  batch.update(targetRef, updates);

  const logRef = doc(collection(db, 'moderationLogs'));
  batch.set(logRef, {
    actorUid: params.actorProfile.uid,
    actorHandle: params.actorProfile.handle.slice(0, 48),
    actorTier,
    action,
    targetType: 'user',
    targetId: params.targetProfile.uid,
    reason: cleanReason,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `userProfiles/${params.targetProfile.uid}`);
  }
}

export async function saveCommunitySettings(
  actorProfile: UserProfile,
  settings: Omit<CommunitySettings, 'updatedByUid' | 'updatedAt'>
): Promise<void> {
  if (actorProfile.role !== 'admin') {
    throw new Error('Only Tier 3 Lead Admins can modify community standards.');
  }

  const batch = writeBatch(db);
  const settingsRef = doc(db, 'settings', 'community');
  batch.set(settingsRef, {
    autoQuarantineFlags: Math.max(1, Math.min(20, Math.trunc(settings.autoQuarantineFlags))),
    minRepToPost: Math.max(-50, Math.min(100, Math.trunc(settings.minRepToPost))),
    minRepToReport: Math.max(0, Math.min(100, Math.trunc(settings.minRepToReport))),
    encryptionEnabled: Boolean(settings.encryptionEnabled),
    unfilteredModeEnabled: Boolean(settings.unfilteredModeEnabled),
    announcement: settings.announcement.trim().slice(0, VALIDATION_LIMITS.announcementMax),
    updatedByUid: actorProfile.uid,
    updatedAt: serverTimestamp(),
  });

  const logRef = doc(collection(db, 'moderationLogs'));
  batch.set(logRef, {
    actorUid: actorProfile.uid,
    actorHandle: actorProfile.handle.slice(0, 48),
    actorTier: 'tier3_admin',
    action: 'update_policy',
    targetType: 'policy',
    targetId: 'community',
    reason: `Updated thresholds: auto-quarantine at ${settings.autoQuarantineFlags} flags, min post rep ${settings.minRepToPost}.`,
    createdAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/community');
  }
}

export async function seedStarterConfessions(
  authorProfile: UserProfile,
  existingConfessions: Confession[] = []
): Promise<number> {
  const missing = getMissingStarterPosts(existingConfessions);
  for (const item of missing) {
    await createConfession({
      authorProfile,
      body: item.body,
      sensitivity: item.sensitivity,
      isAnonymous: item.isAnonymous,
    });
  }
  return missing.length;
}
