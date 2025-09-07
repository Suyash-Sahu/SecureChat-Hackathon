const fs = require('fs');
// Load env vars from .env if present
try {
	if (fs.existsSync(require('path').join(__dirname, '.env'))) {
		require('dotenv').config();
		console.log('✅ Loaded environment variables from .env');
	}
} catch (e) {
	console.warn('⚠️ Could not load .env:', e && e.message);
}

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const Jimp = require('jimp');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configure uploads directory (cloud-friendly)
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
try {
	if (!fs.existsSync(UPLOAD_DIR)) {
		fs.mkdirSync(UPLOAD_DIR, { recursive: true });
		console.log(`📁 Created upload directory at: ${UPLOAD_DIR}`);
	} else {
		console.log(`📁 Using upload directory: ${UPLOAD_DIR}`);
	}
} catch (e) {
	console.error('Failed to prepare upload directory:', e);
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

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
		const extension = path.extname(file.originalname);
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
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
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

// File upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
	console.log('=== FILE UPLOAD REQUEST START ===');
	
	try {
		// Log the entire request
		console.log('📥 Upload request received at:', new Date().toISOString());
		console.log('🔍 Request method:', req.method);
		console.log('🔍 Request URL:', req.url);
		console.log('🔍 Request headers:', JSON.stringify(req.headers, null, 2));
		console.log('🔍 Request body keys:', Object.keys(req.body || {}));
		console.log('🔍 Request file:', req.file ? {
			fieldname: req.file.fieldname,
			originalname: req.file.originalname,
			encoding: req.file.encoding,
			mimetype: req.file.mimetype,
			size: req.file.size,
			destination: req.file.destination,
			filename: req.file.filename,
			path: req.file.path
		} : 'NO FILE');

		// Check if file exists
		if (!req.file) {
			console.log('❌ No file in request - sending 400 error');
			return res.status(400).json({ 
				error: 'No file uploaded',
				details: 'The request did not contain a file',
				received: {
					body: req.body,
					headers: req.headers
				}
			});
		}

		// Validate file properties
		console.log('✅ File validation passed');
		console.log('📁 File details:', {
			name: req.file.originalname,
			size: req.file.size,
			type: req.file.mimetype,
			storedAs: req.file.filename
		});

		// If PNG image, run LSB steganography detection before accepting
		const isPng = (req.file.mimetype === 'image/png') || (path.extname(req.file.originalname || '').toLowerCase() === '.png');
		if (isPng) {
			const filePath = req.file.path;
			try {
				const image = await Jimp.read(filePath);
				const data = image.bitmap.data; // RGBA sequential
				const bits = [];
				for (let i = 0; i < data.length; i += 4) {
					bits.push(data[i] & 1);     // R
					bits.push(data[i + 1] & 1); // G
					bits.push(data[i + 2] & 1); // B
				}

				const nBytes = Math.floor(bits.length / 8);
				let message = '';
				for (let b = 0; b < nBytes; b++) {
					let val = 0;
					for (let j = 0; j < 8; j++) {
						val |= (bits[b * 8 + j] & 1) << (7 - j);
					}
					if (val === 0) break; // null terminator
					if (val >= 32 && val <= 126) {
						message += String.fromCharCode(val);
						if (message.length > 2048) break; // cap length
					} else {
						break;
					}
				}

				if (message.length > 0) {
					try { fs.unlinkSync(filePath); } catch (e) {}
					console.log('🛑 Image blocked due to suspected LSB payload');
					return res.status(400).json({
						error: 'Image blocked: suspected hidden data detected',
						code: 'LSB_BLOCKED'
					});
				}
			} catch (err) {
				console.warn('LSB analysis skipped due to unreadable PNG:', err && err.message);
				// Do not block the upload if analysis fails; proceed safely
			}
		} else if (req.file.mimetype && req.file.mimetype.startsWith('image/')) {
			console.log('Skipping LSB analysis for non-PNG image:', req.file.mimetype);
		}

		// Get the current host and protocol
		const host = req.get('host') || 'localhost:3000';
		const protocol = req.get('x-forwarded-proto') || 'http';
		
		console.log('🌐 Host info:', { host, protocol });
		
		// Generate public file URL
		const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
		console.log('🔗 Generated file URL:', fileUrl);
		
		// Return file information
		const response = {
			success: true,
			file: {
				originalName: req.file.originalname,
				filename: req.file.filename,
				size: req.file.size,
				mimetype: req.file.mimetype,
				url: fileUrl
			}
		};
		
		console.log('✅ Upload successful, sending response:', JSON.stringify(response, null, 2));
		console.log('=== FILE UPLOAD REQUEST END ===');
		
		res.json(response);
		
	} catch (error) {
		console.error('💥 CRITICAL UPLOAD ERROR:', error);
		console.error('💥 Error stack:', error.stack);
		console.error('💥 Error details:', {
			name: error.name,
			message: error.message,
			code: error.code
		});
		console.log('=== FILE UPLOAD REQUEST END WITH ERROR ===');
		
		res.status(500).json({ 
			error: 'Upload failed: ' + error.message,
			details: error.stack,
			timestamp: new Date().toISOString()
		});
	}
});

// Error handling for file uploads
app.use((error, req, res, next) => {
	console.log('=== ERROR HANDLING MIDDLEWARE ===');
	console.log('🚨 Error caught in middleware:', error);
	console.log('🚨 Error type:', error.constructor.name);
	console.log('🚨 Error message:', error.message);
	console.log('🚨 Error code:', error.code);
	console.log('🚨 Request URL:', req.url);
	console.log('🚨 Request method:', req.method);
	
	if (error instanceof multer.MulterError) {
		console.log('🚨 Multer error detected');
		if (error.code === 'LIMIT_FILE_SIZE') {
			console.log('🚨 File size limit exceeded');
			return res.status(400).json({ 
				error: 'File too large. Maximum size is 25MB.',
				details: `File size: ${error.field} bytes`,
				code: error.code
			});
		}
		if (error.code === 'LIMIT_FILE_COUNT') {
			console.log('🚨 File count limit exceeded');
			return res.status(400).json({ 
				error: 'Too many files uploaded.',
				details: `Maximum allowed: 1 file`,
				code: error.code
			});
		}
		if (error.code === 'LIMIT_UNEXPECTED_FILE') {
			console.log('🚨 Unexpected file field');
			return res.status(400).json({ 
				error: 'Unexpected file field.',
				details: `Field name: ${error.field}`,
				code: error.code
			});
		}
		console.log('🚨 Unknown multer error:', error.code);
		return res.status(400).json({ 
			error: 'File upload error',
			details: error.message,
			code: error.code
		});
	}
	
	if (error.message) {
		console.log('🚨 General error with message');
		return res.status(400).json({ 
			error: error.message,
			details: 'General upload error',
			timestamp: new Date().toISOString()
		});
	}
	
	console.log('🚨 Unknown error, passing to next middleware');
	next(error);
});

// Socket.IO connection handling
io.on('connection', (socket) => {
	console.log('New client connected:', socket.id);

	// Handle user login
	socket.on('userLogin', (username) => {
		// Check if username is already taken
		const isUsernameTaken = Array.from(activeUsers.values()).some(user => user.username === username);
		
		if (isUsernameTaken) {
			socket.emit('loginError', 'Username already taken');
			return;
		}

		// Store user information
		activeUsers.set(socket.id, {
			username: username,
			socketId: socket.id,
			connectedAt: new Date()
		});

		// Initialize user's message history if it doesn't exist
		if (!userMessages.has(username)) {
			userMessages.set(username, []);
		}

		// Send login success and user list
		socket.emit('loginSuccess', {
			username: username,
			users: Array.from(activeUsers.values()).map(user => user.username)
		});

		// Broadcast to other users that a new user joined
		socket.broadcast.emit('userJoined', username);
		
		console.log(`User ${username} logged in`);
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

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Listen on all network interfaces

server.listen(PORT, HOST, () => {
	console.log(`🚀 Server running on port ${PORT}`);
	console.log(`📍 Local access: http://localhost:${PORT}`);
	console.log(`🌐 Network access: http://0.0.0.0:${PORT}`);
	console.log(`📁 Upload dir: ${UPLOAD_DIR}`);
	console.log('\n📱 For multi-device testing:');
	console.log('   • LAN: Use your device\'s local IP address');
	console.log('   • Internet: Use ngrok or deploy to cloud hosting');
	console.log('\n💡 Get your local IP with: ipconfig (Windows) or ifconfig (Linux/Mac)');
});
