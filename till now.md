Detailed Technical Explanation of Secure Chat Application
1. Overall System Architecture
Client-Server Model
The application follows a client-server architecture with:
Frontend (Client): Vanilla JavaScript, HTML, CSS running in the browser
Backend (Server): Node.js with Express framework
Database: MongoDB with Mongoose ODM
Real-time Communication: Socket.IO for WebSocket-based communication
Connection Flow
HTTP REST API: Used for authentication, user management, and initial data fetching
Socket.IO WebSocket: Established after successful authentication for real-time messaging
Database Connection: MongoDB connection pool managed by Mongoose
Real-time Communication Handling
Socket.IO Server: Manages persistent connections with all connected clients
Event-driven Architecture: Uses emit/on pattern for real-time updates
Room-less Communication: Direct user-to-user messaging using username-based routing
2. Message Sending & Receiving Mechanism
Message Flow
User A → Client (socket.emit) → Server (socket.on) → Validation → 
Friend Check → User B Socket → Client (socket.on) → UI Update
Step-by-Step Process
Client Side: User types message and clicks send
Socket Emit: socket.emit('privateMessage', {to, message})
Server Reception: Server receives via socket.on('privateMessage')
Validation: Server checks message format, length, and sender validity
Friend Verification: Server verifies both users are friends using Friend model
Message Forwarding: Server finds recipient's socket and emits newMessage event
Delivery Confirmation: Server sends messageSent event back to sender
UI Update: Both clients update their chat interfaces
Message Storage
Messages are stored in-memory using Maps:
userMessages Map in chat.models.js stores messages per user
No persistent database storage for messages (temporary session-based storage)
Message Delivery Management
Real-time delivery through Socket.IO events
No explicit seen status tracking implemented
Messages stored temporarily in memory during session
Socket Channels
No explicit rooms used
Direct username-based message routing
Each user identified by their socket connection and username
3. Security and Data Validation for Messages
Message Validation
Length Check: Messages limited to 1000 characters
Format Validation: Basic string validation
Friendship Verification: Server checks friendship status before forwarding
Image/File Security
File validation in script.js:
File Type Check: MIME type validation for allowed formats (images, PDFs, documents)
Size Limitation: 25MB maximum file size
Extension Validation: File extension checking
File processing in file.routes.js:
Multer Middleware: Handles file upload with size and type restrictions
Jimp Library: Image processing for potential steganography detection
Storage: Files saved to local uploads directory with unique filenames
Upload Verification
Server-side MIME type validation
File extension checking
Size limitations enforced
Image processing to detect potential hidden data
4. Contacts / Friend Request System
Friend Request Flow
1. Send Request: User A → POST /api/v1/contacts/request/:receiverId
2. Store Request: FriendRequest collection with status "pending"
3. Notify Receiver: Socket.IO event (if online)
4. Accept/Reject: PUT /api/v1/contacts/request/:requestId/{accept,reject}
5. Update Friends: Create two entries in Friends collection (bidirectional)
6. Update UI: Real-time updates through socket events
Data Storage
FriendRequests Collection (friendRequest.models.js):
senderId: ObjectId of request sender
receiverId: ObjectId of request receiver
status: pending/accepted/rejected
Timestamps for creation
Friends Collection (friend.models.js):
userId: ObjectId of one friend
friendId: ObjectId of the other friend
Bidirectional entries for each friendship
Frontend Components
Add Contact (index.html - addContact tab): Search users and send requests
Incoming Requests (index.html - requests tab): View and respond to received requests
Outgoing Requests (index.html - requests tab): View sent requests and cancel them
My Friends (index.html - contacts tab): List of accepted friends with chat option
Online Friends (index.html - onlineUsers tab): Friends currently connected
Message Permission
Server-side Check: socket.service.js verifies friendship before message forwarding
Frontend Restriction: UI only shows chat option for friends
Database Query: Friend model lookup to validate relationship
5. Authentication System
Login Flow
1. User submits credentials → POST /api/v1/auth/login
2. Server validates email/password
3. Password hashed comparison using bcrypt
4. Generate JWT access/refresh tokens
5. Set secure HTTP-only cookies
6. Return user data and success response
Signup Flow
1. User submits registration data → POST /api/v1/auth/register
2. Server validates input and checks for existing user
3. Password hashed using bcrypt
4. User created in database with isEmailVerified=false
5. Email OTP generated and sent
6. User redirected to OTP verification screen
JWT Implementation
Access Token: Short-lived (1 day) JWT with user info
Refresh Token: Long-lived (10 days) JWT for token rotation
Token Generation: user.models.js methods generateAccessToken() and generateRefreshToken()
Token Validation: auth.middleware.js middleware verifyJWT()
Email Verification
OTP Generation: 6-digit code with expiration (10 minutes)
Storage: OTP hash and expiry stored in User document
Sending: mail.js utility function
Verification: Compare hash of user input with stored hash
Password Security
Hashing: bcrypt with salt rounds
Storage: Only hashed passwords stored in database
Comparison: bcrypt comparison during login
Session Management
Token Validation: Middleware checks JWT validity on each request
Cookie-based: Tokens stored in secure HTTP-only cookies
CSRF Protection: CSRF tokens for state-changing requests
6. Forgot Password / Reset Password Module
Reset Flow
1. User requests reset → POST /api/v1/auth/forgot-password
2. Server generates 6-digit OTP with expiry
3. OTP stored in User document
4. Email sent with OTP
5. User enters OTP and new password → POST /api/v1/auth/reset-password
6. Server validates OTP and updates password
7. User redirected to login page
OTP Management
Generation: 6-digit numeric code
Expiration: 10-minute expiry time
Attempt Limiting: Track failed attempts to prevent brute force
Storage: Hashed OTP with expiry in User document
Form Validation
Frontend: Client-side validation in script.js
Backend: Server-side validation in auth.controller.js
Password Requirements: Minimum 6 characters
Redirection Handling
Success: Redirect to login page after successful reset
Form Management: Hide reset form and show success message
State Management: Clear form fields after successful submission
API Endpoints
/api/v1/auth/forgot-password - Initiate reset process
/api/v1/auth/reset-password - Complete reset with new password
7. Database Structure
Collections
Users (user.models.js)
javascript
{
  _id: ObjectId,
  username: String,
  email: String,
  password: String (hashed),
  isEmailVerified: Boolean,
  emailOtp: String (hashed),
  emailOtpExpiry: Date,
  emailOtpAttempts: Number,
  refreshToken: String,
  tokenVersion: Number,
  role: String (USER|ADMIN|PREMIUM_USER)
}
FriendRequests (friendRequest.models.js)
javascript
{
  _id: ObjectId,
  senderId: ObjectId (ref: User),
  receiverId: ObjectId (ref: User),
  status: String (pending|accepted|rejected)
}
Friends (friend.models.js)
javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  friendId: ObjectId (ref: User)
}
Messages (In-memory)
Stored in userMessages Map in chat.models.js
Temporary session-based storage
Relationships
Users ↔ FriendRequests (one-to-many)
Users ↔ Friends (one-to-many)
FriendRequests: senderId and receiverId reference User id
Friends: userId and friendId reference User id
8. File Structure & Code Locations
Backend Routes
/src/auth/routes/auth.routes.js → Authentication routes (login, register, reset password)
/src/routes/contact.routes.js → Friend/contact management routes
/src/routes/file.routes.js → File upload/download routes
Backend Controllers
/src/auth/controllers/auth.controller.js → Authentication logic
/src/controllers/contact.controller.js → Friend/contact management logic
Backend Models
/src/auth/models/user.models.js → User schema and methods
/src/models/friendRequest.models.js → Friend request schema
/src/models/friend.models.js → Friend relationship schema
/src/models/chat.models.js → In-memory chat data structures
Backend Utilities
/src/auth/utils/mail.js → Email sending functionality
/src/auth/utils/otp.js → OTP generation and validation
/src/auth/utils/api-error.js → Error handling utilities
/src/auth/utils/api-response.js → Response formatting utilities
Frontend Pages/Components
/public/index.html → Main application UI with all tabs
/public/script.js → All frontend logic and event handlers
/public/styles.css → All styling for the application
Services
/src/services/socket.service.js → Socket.IO server implementation
9. Real-Time Features
Real-time Updates
Message Delivery: Instant through Socket.IO events
Online Status: Broadcast when users connect/disconnect
Friend Requests: Real-time notifications through socket events
Friend List Updates: Automatic refresh on friend actions
Socket.IO Implementation
Connection Management: Persistent WebSocket connections
Event Handling: Custom events for different actions
Broadcasting: Notify relevant users of status changes
Direct Messaging: Targeted message delivery to specific users
Frontend Subscription
Event Listeners: Set up on socket connection
UI Updates: Real-time DOM manipulation on events
State Management: Keep frontend data in sync with backend
Events Used
newMessage - Receive messages
messageSent - Confirm message delivery
userJoined - User comes online
userLeft - User goes offline
loginSuccess - Successful authentication
messageError - Message delivery errors
10. Security & Data Protection
JWT Security
Expiration: Short-lived access tokens (1 day)
Refresh Tokens: Long-lived with rotation mechanism
Token Versioning: Invalidate tokens on logout
Secure Cookies: HTTP-only, SameSite, Secure flags
Data Encryption
Password Hashing: bcrypt with salt
OTP Hashing: SHA-256 for OTP storage
In-transit Encryption: HTTPS for all communications
Rate Limiting
Authentication Endpoints: Rate limiting in app.js
OTP Requests: Per-email/IP rate limiting
Brute Force Protection: Attempt tracking for OTP
Credential Protection
Password Storage: Never stored in plain text
Email Security: Protected through HTTPS and secure transport
Token Storage: HTTP-only cookies prevent XSS
CORS Setup
Configuration: Defined in app.js
Origin Restrictions: Configurable allowed origins
Credential Handling: Proper CORS headers for authenticated requests
11. Error Handling & Logging
Error Types Handled
Invalid Requests: 400 Bad Request responses
Authentication Errors: 401/403 responses with proper messages
Resource Not Found: 404 responses
Server Errors: 500 responses with logging
Validation Middleware
Input Validation: Express-validator in route handlers
Authentication Check: verifyJWT middleware
Email Verification: requireEmailVerified middleware
Logging Implementation
Error Logging: Custom logError function in script.js
Server Logs: Console logging in backend controllers
Error Context: Include timestamps, stack traces, and additional data
Utility Functions
getErrorMessage(): Standardized error message formatting
withAuthDefaults(): Consistent authentication headers
fetchWithTimeout(): Network request with timeout handling
12. Additional Features
Profile Management
Username Display: Shown in chat header
Online Status: Real-time indicators
Avatar System: Placeholder avatars using first letter of username
User Experience Features
Typing Indicator: Not implemented
Message Read Receipts: Not implemented
Last Seen Status: Basic online/offline status
Notification System: Real-time socket-based notifications
UI/UX Features
Responsive Design: Mobile-friendly layout
Tab Navigation: Organized interface with multiple sections
Real-time Feedback: Instant status updates
File Attachments: Image and document sharing
13. Expected Output
This detailed technical explanation covers all aspects of the secure chat application:
Architecture: Client-server model with REST API and WebSocket communication
Messaging: Real-time message delivery with friend-only restrictions
Security: JWT authentication, password hashing, rate limiting
Friend System: Complete friend request and management functionality
File Handling: Secure file upload with validation
Database: MongoDB collections for users, friends, and requests
Code Organization: Clear separation of frontend and backend logic
Real-time Features: Socket.IO implementation for instant updates
Error Handling: Comprehensive error management and logging
