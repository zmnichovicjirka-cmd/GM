# Security Specification - Gymni Mate

## Data Invariants
1. A **Lesson** must always have a valid `uid` that matches the authenticated user.
2. A **UserProfile** document ID must match the user's `uid`.
3. A **Schedule** document ID must match the user's `uid`.
4. A **Message** must only be accessible by the `senderId` or `receiverId`.
5. A **Curriculum** can be public if `isPublished` is true, but only the `authorId` can modify it.
6. **Avatar Identities** are globally readable but only modifiable by admins.

## The Dirty Dozen Payloads

1. **Identity Theft (Lesson)**: User A tries to create a lesson with `uid` set to User B's ID.
2. **Profile Hijacking**: User A tries to update User B's `UserProfile` document.
3. **Privilege Escalation**: User A tries to update their own `role` to 'admin' in `UserProfile`.
4. **Message Eavesdropping**: User A tries to list messages where they are neither `senderId` nor `receiverId`.
5. **Unauthorized Schedule Edit**: User A tries to update User B's `Schedule`.
6. **Fake Curriculum Author**: User A tries to create a `Curriculum` with `authorId` set to User B.
7. **Bypassing Immutability**: User A tries to change the `createdAt` timestamp of an existing lesson.
8. **Malicious ID Injection**: An attacker tries to use an extremely long or invalid character string as a document ID to cause resource exhaustion.
9. **Spamming Messages**: Attacker tries to send a message with a text exceeding 2000 characters.
10. **Ghost Fields**: User tries to add an undocumented field `isVerified: true` to their `UserProfile`.
11. **Avatar Defacement**: A non-admin user tries to update a shared `Identity` (avatar).
12. **Status Spoofing**: User A tries to update User B's `status` in their profile.

## Field Size Limits
- `topic`: 100 characters.
- `subject`: 50 characters.
- `text` (Message): 2000 characters.
- `bio`: 500 characters.
- `displayName`: 100 characters.
- `study_json`: 1MB (handled by Firestore default, but we should be aware).
