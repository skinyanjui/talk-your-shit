# TYS Security Specification (Phase 0 — Payload-First Security TDD)

## 1. Data Invariants
1. **PII Isolation**: User emails and Google display names live exclusively in `/users/{userId}` and can NEVER be read by any non-owner (except Tier 3 Admin). Listing `/users` is strictly forbidden (`allow list: if false`).
2. **No Self-Assigned Privileges**: A user creating `/userProfiles/{userId}` MUST initialize `role == 'member'`, `status == 'active'`, `reputation == 10`, `postsCount == 0`, `flagsSubmitted == 0`. Self-promotion to `moderator` or `admin` is strictly rejected.
3. **Strict Author Integrity**: Any created confession, reply, vote, or report MUST match `request.auth.uid` and require `request.auth.token.email_verified == true`.
4. **Master Gate Parent Existence**: Replies and votes under `/confessions/{confessionId}` MUST verify the parent confession exists and is not in terminal state `'removed'`.
5. **Atomicity Guarantee**: Voting on a confession updates the confession's score/upvotes/downvotes ONLY if the voter's `/confessions/{confessionId}/votes/{uid}` document is written in the same atomic transaction (`getAfter(...).data.updatedAt == request.time`). Author reputation changes on `/userProfiles/{userId}` from votes likewise require `getAfter(...)` proof at `request.time`.
6. **Terminal State Locking**: Once a confession reaches `status == 'removed'` or a report reaches `'resolved'`/`'dismissed'`, non-admin updates are strictly blocked.
7. **Immutable Audit Trail**: `/moderationLogs/{logId}` documents can only be created by verified Moderators/Admins and can NEVER be updated or deleted.
8. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps MUST equal `request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Self-Assigned Admin on Profile Create**: `{ uid: "u1", handle: "hacker", bio: "", reputation: 9999, role: "admin", status: "active", ... }` -> DENIED.
2. **Shadow Field Injection (Ghost Field)**: Creating confession with extra key `isVerified: true` -> DENIED via `keys().hasOnly(...)`.
3. **Unverified Email Spoofing**: Admin email with `email_verified: false` attempting policy update -> DENIED.
4. **PII Blanket Leak**: User B calling `get` on `/users/userA` -> DENIED.
5. **ID Poisoning**: Document ID containing 200+ chars or `$` / `.` special characters -> DENIED via `isValidId()`.
6. **Author UID Spoofing**: User A creating a confession with `authorUid: "userB"` -> DENIED.
7. **Reputation Farming Without Atomic Vote**: User B updating `/userProfiles/userA` with `{ reputation: 500 }` without an atomic vote doc at `request.time` -> DENIED.
8. **Orphaned Reply Write**: Creating a reply under a non-existent `/confessions/nonexistent/replies/r1` -> DENIED via Master Gate `get()`.
9. **Terminal State Resurrection**: Regular member or author attempting to update a `'removed'` confession back to `'active'` -> DENIED.
10. **Value Poisoning on Allowed Update Key**: Updating `score` on a confession to a string `"9999"` or jumping by `+50` -> DENIED via `isValidConfession()` + delta bounds.
11. **Tier 2 Privilege Escalation**: A Tier 2 Moderator attempting to change a user's `role` to `'admin'` or update `/settings/community` -> DENIED (Tier 3 Admin only).
12. **Audit Log Tampering**: Even an Admin attempting to `delete` or `update` an existing `/moderationLogs/{logId}` entry -> DENIED.
