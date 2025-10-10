The Contact Management Module extends the backend system to handle user-to-user interactions. It enables users to manage contacts (like a chat app), send/receive friend requests, organize contacts into groups, and block/report malicious users. The contact system forms the foundation for chat, media sharing, and collaboration features.

2. Target Users

End Users (Members): Regular users who can search, add, and manage contacts.

Admins: Monitor and manage reported/blocked accounts for security.

3. Core Features
3.1 Contact Search & Discovery

Search users by username, email, or user ID.

Return limited public profile info (name, avatar).

3.2 Friend Request Workflow

Send friend requests to other users.

Accept/Reject requests.

Cancel pending requests.

Prevent duplicate requests.

3.3 Contact List Management

View all contacts (accepted friends).

Organize contacts into groups (optional future enhancement).

Remove contacts.

3.4 Blocking & Reporting

Block users (prevents chat and further requests).

Report users for spam/inappropriate content.

Admins can review and take action.

3.5 Contact Status

Online/Offline status tracking (real-time integration with sockets later).

Last seen timestamp.

4. Technical Specifications
4.1 API Endpoints Structure

Contact Routes (/api/v1/contacts/)

GET /search?query= – Search for users

POST /request/:userId – Send friend request

GET /requests – View incoming/outgoing friend requests

POST /request/:requestId/accept – Accept friend request

POST /request/:requestId/reject – Reject friend request

DELETE /request/:requestId/cancel – Cancel sent request

GET /list – Get contact list

DELETE /:contactId/remove – Remove from contacts

POST /:userId/block – Block a user

POST /:userId/unblock – Unblock a user

POST /:userId/report – Report a user

4.2 Permission Matrix
Feature	User	Admin
Search Users	✓	✓
Send Friend Request	✓	✗
Accept/Reject Request	✓	✗
Cancel Request	✓	✗
View Contacts	✓	✓
Remove Contact	✓	✗
Block/Unblock User	✓	✓
Report User	✓	✓
View Reports Dashboard	✗	✓
4.3 Data Models

User (extended)

{
  "id": "uuid",
  "username": "string",
  "email": "string",
  "avatar": "string",
  "status": "online/offline",
  "lastSeen": "timestamp"
}


FriendRequest

{
  "id": "uuid",
  "fromUserId": "uuid",
  "toUserId": "uuid",
  "status": "pending/accepted/rejected",
  "createdAt": "timestamp"
}


Contact

{
  "id": "uuid",
  "userId": "uuid",
  "contactId": "uuid",
  "createdAt": "timestamp"
}


BlockList

{
  "id": "uuid",
  "userId": "uuid",
  "blockedUserId": "uuid",
  "createdAt": "timestamp"
}


Report

{
  "id": "uuid",
  "reporterId": "uuid",
  "reportedUserId": "uuid",
  "reason": "string",
  "status": "open/reviewed/action_taken",
  "createdAt": "timestamp"
}

5. Security Features

Prevent duplicate requests and spam (rate-limiting).

Validation middleware for inputs.

Blocked users cannot send messages or requests.

Reports visible only to admins.

Success Criteria

Users can search and add contacts.

Friend request system is seamless (send, accept, reject, cancel).

Contact list available for chat integration.

Blocking/reporting works securely.

Admin can monitor flagged accounts.