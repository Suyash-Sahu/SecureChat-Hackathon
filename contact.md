Overview

This feature allows users to connect with others, send friend requests, accept/reject requests, and chat only with accepted friends.
It ensures a secure, organized, and real-time contact management system.

🎯 Goals

Enable users to search and add friends.

Allow users to view pending requests (incoming & outgoing).

Restrict messaging only to friends in the contact list.

Persist all data so that users can view requests after re-login.

Prevent self-requests and duplicate requests.

🧱 Core Components

Add Contact (Search + Send Request)

Friend Requests (Incoming / Outgoing)

My Friends (Accepted Friends List)

Online Friends

Chat (Friends Only)

🎨 Frontend Structure (UI/UX)
1️⃣ Add Contact Page

Purpose: Search for a user and send a friend request.

UI Elements:

🔍 Search Bar → Enter username or email.

🔘 Search Button → Trigger API to fetch users.

📋 List of Users (search result):

User profile image

Username

Email

"Add Friend" button

Interactions:

Clicking “Add Friend” calls:

POST /api/friend-request
{
  "senderId": currentUserId,
  "receiverId": selectedUserId
}


Validations:

❌ Cannot send request to self.

❌ Cannot send request if already friends.

❌ Cannot send duplicate requests.

2️⃣ Friend Requests Section

Tabs:

📥 Incoming Requests

📤 Outgoing Requests

Incoming Requests View:

List of pending requests received.

Show sender’s name, email, and buttons:

✅ Accept

❌ Reject

On “Accept”:

POST /api/friend-request/accept
{
  "senderId": senderId,
  "receiverId": currentUserId
}


On “Reject”:

POST /api/friend-request/reject
{
  "senderId": senderId,
  "receiverId": currentUserId
}


Outgoing Requests View:

Show users to whom the current user has sent requests.

Show receiver’s name, email, and a button:

🔄 Cancel Request

On “Cancel”:

DELETE /api/friend-request/cancel
{
  "senderId": currentUserId,
  "receiverId": receiverId
}

3️⃣ My Friends Section

Purpose: Show all accepted friends.

Display:

Friend list showing:

Profile picture

Name

Online/Offline status

Actions:

💬 Message → Open chat window

❌ Remove Friend → (optional future feature)

API:

GET /api/friends?userId=currentUserId

4️⃣ Online Friends Section

Purpose: Show only friends who are online.

Logic:

Fetch all friends.

Filter those with isOnline: true.

GET /api/friends/online?userId=currentUserId


Rules:

Can only message if the user is your friend.

Disable chat button if not friends.

⚙️ Backend Logic
1️⃣ API Endpoints
API	Method	Description
/api/friend-request	POST	Send a friend request
/api/friend-requests	GET	Get all requests (incoming/outgoing)
/api/friend-request/accept	POST	Accept a request
/api/friend-request/reject	POST	Reject a request
/api/friend-request/cancel	DELETE	Cancel sent request
/api/friends	GET	Get all friends
/api/friends/online	GET	Get only online friends
2️⃣ Database Design
Table: Users
Field	Type	Description
userId	String	Unique ID
name	String	Username
email	String	Email
password	String	Hashed password
isOnline	Boolean	True if user is online
Table: FriendRequests
Field	Type	Description
requestId	String	Unique ID
senderId	String	Who sent request
receiverId	String	Who received request
status	Enum(pending, accepted, rejected)	
createdAt	Timestamp	Time of sending
Table: Friends
Field	Type	Description
userId	String	One user
friendId	String	The other user
createdAt	Timestamp	When friendship was accepted
🧠 Logic Flow Summary
[User A] —clicks Add→ POST /api/friend-request → [Server]
      ↓
Database: Save pending request
      ↓
Notify [User B]
      ↓
[User B] —opens app→ GET /api/friend-requests
      ↓
Accept/Reject → Update database
      ↓
Accepted → Add to Friends table

🚫 Edge Case Handling
Issue	Solution
Sending request to self	Block at frontend & backend
Duplicate request	Backend checks for existing record
Messaging non-friend	Chat API verifies friendship first
Lost session	Store requests/friends in DB, not local memory
Offline notifications	When user logs in, fetch new requests
Cancelled request	Remove record from FriendRequests
🛠️ Technologies Used
Layer	Tools
Frontend	React / Android (Java/Kotlin)
Backend	Node.js (Express) / Django
Database	MongoDB / MySQL
Realtime	Socket.io / Firebase Realtime Database
Auth	JWT (JSON Web Token)
🚀 Expected User Flow

User logs in → sees “My Contacts” tab.

Clicks “Add Contact” → searches and sends a request.

Receiver sees it in “Incoming Requests”.

Accept → both appear in “My Friends”.

Only friends visible in “Online Friends”.

Chat allowed only between friends.