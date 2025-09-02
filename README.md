# Chat Network - Stage 1 (Multi-Device)

A minimal chat network where users on different devices can connect, log in with unique identities, and exchange messages in real-time using WebSocket communication.

## Features

- **Real-time Messaging**: Instant message delivery using Socket.IO
- **User Authentication**: Simple username-based login system
- **Private Messaging**: Messages are sent only to the intended recipient
- **Session Management**: In-memory session storage for active users
- **Modern UI**: Clean, responsive design with real-time updates
- **Multi-Device Support**: Connect from different devices on the same network or over the internet
- **Network Flexibility**: Works on LAN, Wi-Fi, or public internet via tunneling services

## Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

## Installation

1. **Clone or download the project files**
2. **Install dependencies**:
   ```bash
   npm install
   ```

## Running the Application

1. **Start the server**:
   ```bash
   npm start
   ```
   
   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

2. **Create internet tunnel** (optional):
   ```bash
   ngrok http 3000
   ```
   This creates a public URL that anyone can access from anywhere in the world.
   **Note**: You need to install ngrok separately from [https://ngrok.com/download](https://ngrok.com/download)

2. **Open your browser** and navigate to `http://localhost:3000`

## Testing the Application

### Single Device Testing
To test with multiple browser sessions on the same device:

1. **Open a normal browser tab** and navigate to `http://localhost:3000`
2. **Log in as "Alice"** (or any username you prefer)
3. **Open an incognito/private browser window** and navigate to `http://localhost:3000`
4. **Log in as "Bob"** (or a different username)
5. **Start chatting** between the two sessions

### Multi-Device Testing
To test across different devices:

1. **Start the server** on your main device
2. **Get your device's IP address** (see `MULTI-DEVICE-GUIDE.md`)
3. **Connect from another device** using your IP address
4. **Test real-time messaging** between devices

For internet testing, install ngrok and use:
```bash
ngrok http 3000
```

**Note**: You need to install ngrok separately from [https://ngrok.com/download](https://ngrok.com/download)

See `MULTI-DEVICE-GUIDE.md` for detailed instructions.

## Project Structure

```
chat-network/
├── server.js          # Main server file with Socket.IO
├── package.json       # Dependencies and scripts
├── public/            # Frontend files
│   ├── index.html     # Main HTML page
│   ├── styles.css     # CSS styling
│   └── script.js      # Frontend JavaScript logic
└── README.md          # This file
```

## Technical Details

### Backend
- **Node.js** with **Express** framework
- **Socket.IO** for WebSocket communication
- In-memory storage for users and messages
- Real-time event handling for user connections and messaging

### Frontend
- **Vanilla JavaScript** (no frameworks)
- **Socket.IO client** for WebSocket communication
- **Responsive CSS** with modern design
- Real-time UI updates

### Message Flow
1. User A sends a message to User B
2. Server receives the message and forwards it to User B
3. User B receives the message instantly
4. Both users see the message in their chat history

## API Events

### Client to Server
- `userLogin`: Send username to join chat
- `privateMessage`: Send a private message to another user
- `logout`: Logout from the chat

### Server to Client
- `loginSuccess`: Confirmation of successful login
- `loginError`: Login error message
- `newMessage`: New message received
- `messageSent`: Confirmation of sent message
- `userJoined`: Notification when a user joins
- `userLeft`: Notification when a user leaves
- `userList`: List of currently online users

## Development

### Adding New Features
- The modular structure makes it easy to add new features
- Socket.IO events can be extended for additional functionality
- CSS is organized for easy customization

### Debugging
- Check browser console for client-side errors
- Check terminal for server-side logs
- Socket.IO provides built-in debugging information

## Future Enhancements (Not in Stage 1)

- File sharing (images, PDFs, etc.)
- Message encryption
- Database persistence
- Advanced security features
- Steganography detection
- Group chat functionality
- Message search and history
- User authentication and authorization
- Message persistence across sessions

## Troubleshooting

### Common Issues

1. **Port already in use**: Change the port in `server.js` or kill the process using the port
2. **Messages not sending**: Check if both users are logged in and connected
3. **UI not updating**: Refresh the page and check browser console for errors

### Logs
- Server logs appear in the terminal
- Client logs appear in the browser console
- Socket.IO provides connection status information

## License

MIT License - feel free to use and modify as needed.

## Support

If you encounter any issues or have questions, check the browser console and server logs for error messages.
