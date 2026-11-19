import type { Timestamp } from 'firebase/firestore';

export type UserRole = 'member' | 'moderator' | 'admin';
export type UserStatus = 'active' | 'muted' | 'suspended';
export type ConfessionTopic =
  | 'Unfiltered'
  | 'Hot Takes'
  | 'Relationships'
  | 'Work & Money'
  | 'Family'
  | 'Culture'
  | 'Tech & Internet'
  | 'Health & Mind'
  | 'Night Thoughts'
  | 'Campus & School'
  | 'Advice'
  | 'Confessions'
  | 'Secrets'
  | 'Off the Record';

export type SensitivityLevel = 'open' | 'sensitive' | 'mature';
export type ConfessionStatus = 'active' | 'flagged' | 'quarantined' | 'removed';
export type ReplyStatus = 'active' | 'flagged' | 'removed';
export type ReportReason = 'harassment' | 'doxxing' | 'spam' | 'harmful' | 'off_topic';
export type ReportStatus = 'open' | 'resolved' | 'dismissed';
export type ModerationActionType =
  | 'approve'
  | 'quarantine'
  | 'remove'
  | 'dismiss_report'
  | 'adjust_reputation'
  | 'change_role'
  | 'update_policy'
  | 'restrict_user';

export const CONFESSION_TOPICS: ConfessionTopic[] = [
  'Unfiltered',
  'Hot Takes',
  'Relationships',
  'Work & Money',
  'Family',
  'Culture',
  'Tech & Internet',
  'Health & Mind',
  'Night Thoughts',
  'Campus & School',
  'Advice',
  'Confessions',
  'Secrets',
  'Off the Record',
];

export const REPORT_REASONS: { value: ReportReason; label: string; description: string }[] = [
  {
    value: 'harassment',
    label: 'Harassment or targeted abuse',
    description: 'Threats, slurs, or coordinated piling on an individual.',
  },
  {
    value: 'doxxing',
    label: 'Doxxing or private PII leak',
    description: 'Reveals real names, addresses, phone numbers, or private identities.',
  },
  {
    value: 'spam',
    label: 'Spam, scam, or bot behavior',
    description: 'Unsolicited promotions, phishing links, or repetitive flooding.',
  },
  {
    value: 'harmful',
    label: 'Dangerous or illegal content',
    description: 'Self-harm encouragement, violence, or unlawful activity.',
  },
  {
    value: 'off_topic',
    label: 'Misleading tag or sensitivity',
    description: 'Unmarked mature content or severe category mismatch.',
  },
];

// Verbatim validation constraints synced with firebase-blueprint.json & firestore.rules
export const VALIDATION_LIMITS = {
  handleMin: 3,
  handleMax: 32,
  handlePattern: /^[a-zA-Z0-9_-]+$/,
  bioMax: 180,
  titleMin: 3,
  titleMax: 140,
  bodyMinPlain: 10,
  bodyMax: 3000,
  ciphertextMax: 8000,
  hintMax: 140,
  replyBodyMinPlain: 2,
  replyBodyMax: 1500,
  reportDetailsMax: 500,
  moderationReasonMin: 3,
  moderationReasonMax: 300,
  announcementMax: 280,
} as const;

export interface UserProfile {
  uid: string;
  handle: string;
  bio: string;
  reputation: number;
  role: UserRole;
  status: UserStatus;
  postsCount: number;
  flagsSubmitted: number;
  lastVoteConfessionId: string;
  defaultAnonymous?: boolean;
  defaultHideContent?: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface Confession {
  id: string;
  authorUid: string;
  authorHandle: string;
  isAnonymous: boolean;
  title: string;
  body: string;
  topic: ConfessionTopic;
  sensitivity: SensitivityLevel;
  isEncrypted: boolean;
  ciphertext: string;
  encryptionIv: string;
  encryptionSalt: string;
  encryptionHint: string;
  score: number;
  upvotes: number;
  downvotes: number;
  replyCount: number;
  flagCount: number;
  status: ConfessionStatus;
  moderationNote: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface Reply {
  id: string;
  confessionId: string;
  authorUid: string;
  authorHandle: string;
  isAnonymous: boolean;
  body: string;
  isEncrypted: boolean;
  ciphertext: string;
  encryptionIv: string;
  encryptionSalt: string;
  status: ReplyStatus;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface SavedPost {
  userId: string;
  confessionId: string;
  title: string;
  topic: ConfessionTopic;
  savedAt?: Timestamp | null;
}

export interface ModerationReport {
  id: string;
  targetType: 'confession' | 'reply';
  confessionId: string;
  replyId: string;
  targetTitle: string;
  reporterUid: string;
  reporterHandle: string;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  resolvedByUid: string;
  resolutionNote: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ModerationLog {
  id: string;
  actorUid: string;
  actorHandle: string;
  actorTier: 'tier2_mod' | 'tier3_admin';
  action: ModerationActionType;
  targetType: 'confession' | 'reply' | 'user' | 'report' | 'policy';
  targetId: string;
  reason: string;
  createdAt?: Timestamp | null;
}

export interface CommunitySettings {
  autoQuarantineFlags: number;
  minRepToPost: number;
  minRepToReport: number;
  encryptionEnabled: boolean;
  unfilteredModeEnabled: boolean;
  announcement: string;
  updatedByUid: string;
  updatedAt?: Timestamp | null;
}

export const DEFAULT_COMMUNITY_SETTINGS: CommunitySettings = {
  autoQuarantineFlags: 3,
  minRepToPost: 0,
  minRepToReport: 10,
  encryptionEnabled: false,
  unfilteredModeEnabled: true,
  announcement: '',
  updatedByUid: 'system',
  updatedAt: null,
};

export interface ReputationTier {
  name: string;
  minRep: number;
  summary: string;
  accentClass: string;
}

export const REPUTATION_TIERS: ReputationTier[] = [
  {
    name: 'Restricted',
    minRep: -1000,
    summary: 'Below standing threshold. Posting and flagging are paused until standing recovers.',
    accentClass: 'text-[#CC0000] dark:text-[#FF6B6B]',
  },
  {
    name: 'Newcomer',
    minRep: 0,
    summary: 'Verified member. Can publish posts, join discussions, and vote.',
    accentClass: 'text-[#595959] dark:text-[#A3A3A3]',
  },
  {
    name: 'Trusted',
    minRep: 50,
    summary: 'Established contributor with full community flagging privileges.',
    accentClass: 'text-[#15803D] dark:text-[#4ADE80]',
  },
  {
    name: 'Steward',
    minRep: 200,
    summary: 'High-trust member eligible for Tier 2 Community Moderator elevation.',
    accentClass: 'text-[#B45309] dark:text-[#FBBF24]',
  },
  {
    name: 'Elder',
    minRep: 500,
    summary: 'Longstanding pillar of candid discussion with top community standing.',
    accentClass: 'text-[#CC0000] dark:text-[#FF6B6B]',
  },
];

export function getReputationTier(reputation: number): ReputationTier {
  if (reputation < 0) return REPUTATION_TIERS[0];
  if (reputation < 50) return REPUTATION_TIERS[1];
  if (reputation < 200) return REPUTATION_TIERS[2];
  if (reputation < 500) return REPUTATION_TIERS[3];
  return REPUTATION_TIERS[4];
}

export function getRoleTierLabel(role: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Tier 3 · Lead Admin';
    case 'moderator':
      return 'Tier 2 · Moderator';
    default:
      return 'Tier 1 · Member';
  }
}

const HANDLE_ADJECTIVES = [
  'Quiet',
  'Candid',
  'Velvet',
  'Blunt',
  'Ash',
  'Hollow',
  'Iron',
  'Glass',
  'Slate',
  'Silent',
  'Stark',
  'Amber',
];

const HANDLE_NOUNS = [
  'Fox',
  'Raven',
  'Moth',
  'Jackal',
  'Cedar',
  'Sparrow',
  'Wren',
  'Hound',
  'Cipher',
  'Echo',
  'Flint',
  'Lynx',
];

export function generateStarterHandle(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  }
  const adj = HANDLE_ADJECTIVES[hash % HANDLE_ADJECTIVES.length];
  const noun = HANDLE_NOUNS[(hash >>> 4) % HANDLE_NOUNS.length];
  const suffix = String(100 + (hash % 900));
  return `${adj}${noun}-${suffix}`;
}

export function generateGhostMask(uid: string, salt: string): string {
  let hash = 2166136261;
  const input = `${uid}:${salt}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const hex = hash.toString(16).toUpperCase().padStart(4, '0').slice(0, 4);
  return `Anonymous #${hex}`;
}

export function formatRelativeTime(ts?: Timestamp | null): string {
  if (!ts) return 'Just now';
  const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date();
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatFullTimestamp(ts?: Timestamp | null): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  return ts.toDate().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const AVERAGE_WORDS_PER_MINUTE = 200;

export function estimateReadTimeMinutes(title: string, body: string): number {
  const combined = `${title} ${body}`.trim();
  if (!combined) return 1;
  const words = combined.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / AVERAGE_WORDS_PER_MINUTE));
}

export function formatReadTime(title: string, body: string): string {
  const minutes = estimateReadTimeMinutes(title, body);
  return `${minutes} min read`;
}
