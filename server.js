import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as Jimp from 'jimp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env if it exists
if (existsSync(join(__dirname, '.env'))) {
    dotenv.config();
    console.log('✅ Loaded environment variables from .env');
}

// Normalize Jimp across different module export styles
let JimpInstance = Jimp;
if (!Jimp.read && (Jimp.Jimp || Jimp.default)) {
    JimpInstance = Jimp.Jimp || Jimp.default;
}

// Import the configured app from src/app.js
import app from './src/app.js';
import connectDB from './src/auth/database/index.js';
import { mountAuth } from './src/auth/mount.js';
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
    credentials: true
  }
});

// Configure uploads directory (cloud-friendly)
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(__dirname, 'uploads');
try {
    if (!existsSync(UPLOAD_DIR)) {
        import('fs').then(fs => {
            fs.mkdirSync(UPLOAD_DIR, { recursive: true });
            console.log(`📁 Created upload directory at: ${UPLOAD_DIR}`);
        });
    } else {
        console.log(`📁 Using upload directory: ${UPLOAD_DIR}`);
    }
} catch (e) {
    console.error('Failed to prepare upload directory:', e);
}

// Static files and uploads are now handled in src/app.js

// In-memory storage for active users and messages
const activeUsers = new Map(); // socketId -> userInfo
const userMessages = new Map(); // username -> messages array

// File upload configuration
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, UPLOAD_DIR);
	},
	filename: function (req, file, cb) {
		// Generate unique filename with original extension
		const uniqueName = uuidv4();
        const extension = extname(file.originalname);
		cb(null, uniqueName + extension);
	}
});

const upload = multer({
	storage: storage,
	limits: {
		fileSize: 25 * 1024 * 1024, // 25MB limit
	},
	fileFilter: function (req, file, cb) {
		// Allowed file types
		const allowedTypes = [
			'image/jpeg',
			'image/jpg',
			'image/png',
			'image/gif',
			'application/pdf',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
			'text/plain'
		];
		
		if (allowedTypes.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(new Error('Invalid file type. Only images, PDFs, documents, and text files are allowed.'), false);
		}
	}
});

// Serve the main page
app.get('/', (req, res) => {
	res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Test endpoint to verify server is working
app.get('/test', (req, res) => {
	console.log('🧪 Test endpoint hit at:', new Date().toISOString());
	res.json({ 
		message: 'Server is working!', 
		timestamp: new Date().toISOString(),
		endpoints: {
			upload: '/upload (POST)',
			test: '/test (GET)',
			root: '/ (GET)'
		}
	});
});

// File upload and other routes are now handled in src/app.js

// Error handling is now handled in src/app.js

// Socket.IO connection handling
io.use((socket, next) => {
  try {
    // Try auth.token first
    let token = (socket.handshake.auth && socket.handshake.auth.token) || '';
    // Try Authorization header
    if (!token && socket.handshake.headers) {
      const authHeader = socket.handshake.headers['authorization'] || '';
      if (authHeader.startsWith('Bearer ')) token = authHeader.replace('Bearer ', '');
    }
    // Try cookie
    if (!token && socket.handshake.headers && socket.handshake.headers.cookie) {
      const cookies = cookie.parse(socket.handshake.headers.cookie || '');
      if (cookies && cookies.accessToken) token = cookies.accessToken;
    }

    if (!token) {
      return next(new Error('AUTH_REQUIRED'));
    }

    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    if (!decoded || !decoded._id || !decoded.username) {
      return next(new Error('INVALID_TOKEN'));
    }
    socket.user = { id: decoded._id, email: decoded.email, username: decoded.username };
    return next();
  } catch (e) {
    return next(new Error('AUTH_FAILED'));
  }
});

io.on('connection', (socket) => {
	console.log('New client connected:', socket.id);

	// Handle user login
	socket.on('userLogin', (username) => {
		// Check if username is already taken
    const finalUsername = (socket.user && socket.user.username) || username;
    const isUsernameTaken = Array.from(activeUsers.values()).some(user => user.username === finalUsername);
		
		if (isUsernameTaken) {
			socket.emit('loginError', 'Username already taken');
			return;
		}

		// Store user information
    activeUsers.set(socket.id, {
      username: finalUsername,
			socketId: socket.id,
			connectedAt: new Date()
		});

		// Initialize user's message history if it doesn't exist
		if (!userMessages.has(username)) {
			userMessages.set(username, []);
		}

		// Send login success and user list
    socket.emit('loginSuccess', {
      username: finalUsername,
			users: Array.from(activeUsers.values()).map(user => user.username)
		});

		// Broadcast to other users that a new user joined
    socket.broadcast.emit('userJoined', finalUsername);
    
    console.log(`User ${finalUsername} logged in`);
	});

	// Handle private messages
	socket.on('privateMessage', (data) => {
		const sender = activeUsers.get(socket.id);
		if (!sender) return;

		const { to, message, file } = data;
		
		// Find recipient's socket
		const recipientSocket = Array.from(activeUsers.entries())
			.find(([id, user]) => user.username === to);

		if (recipientSocket) {
			const [recipientId, recipientUser] = recipientSocket;
			
			// Create message object
			const messageObj = {
				from: sender.username,
				to: to,
				message: message,
				timestamp: new Date(),
				id: Date.now() + Math.random()
			};

			// Add file information if present
			if (file) {
				messageObj.file = file;
			}

			// Store message in both users' history
			if (!userMessages.has(sender.username)) {
				userMessages.set(sender.username, []);
			}
			if (!userMessages.has(to)) {
				userMessages.set(to, []);
			}

			userMessages.get(sender.username).push(messageObj);
			userMessages.get(to).push(messageObj);

			// Send message to recipient
			io.to(recipientId).emit('newMessage', messageObj);
			
			// Send confirmation to sender
			socket.emit('messageSent', messageObj);
			
			if (file) {
				console.log(`File message from ${sender.username} to ${to}: ${message} (${file.originalName})`);
			} else {
				console.log(`Message from ${sender.username} to ${to}: ${message}`);
			}
		} else {
			socket.emit('messageError', 'User not found');
		}
	});

	// Handle user logout
	socket.on('logout', () => {
		const user = activeUsers.get(socket.id);
		if (user) {
			activeUsers.delete(socket.id);
			socket.broadcast.emit('userLeft', user.username);
			console.log(`User ${user.username} logged out`);
		}
	});

	// Handle disconnect
	socket.on('disconnect', () => {
		const user = activeUsers.get(socket.id);
		if (user) {
			activeUsers.delete(socket.id);
			socket.broadcast.emit('userLeft', user.username);
			console.log(`User ${user.username} disconnected`);
		}
	});

	// Send current user list to newly connected user
	socket.emit('userList', Array.from(activeUsers.values()).map(user => user.username));
});

// Start server with database connection
const startServer = async () => {
    try {
        console.log('🚀 Starting Secure Chat Server...\n');
        
        // Connect to MongoDB first
        console.log('📊 Connecting to database...');
        await connectDB();
        
        // Mount auth routes
        console.log('🔐 Mounting authentication routes...');
        await mountAuth(app);
        
        // Start the server
        const PORT = process.env.PORT || 3000;
        const HOST = '0.0.0.0'; // Listen on all network interfaces
        
        server.listen(PORT, HOST, () => {
            console.log(`\n🎉 Server started successfully!`);
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📍 Local access: http://localhost:${PORT}`);
            console.log(`🌐 Network access: http://0.0.0.0:${PORT}`);
            console.log(`📁 Upload dir: ${UPLOAD_DIR}`);
            console.log('\n📱 For multi-device testing:');
            console.log('   • LAN: Use your device\'s local IP address');
            console.log('   • Internet: Use ngrok or deploy to cloud hosting');
            console.log('\n💡 Get your local IP with: ipconfig (Windows) or ifconfig (Linux/Mac)');
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};

// Start the server
startServer();
