const { activeUsers, userMessages } = require('../models/chat.models');
const User = require('../auth/models/user.models.js');
const Friend = require('../models/friend.models.js');

function initSocket(io) {
	io.use((socket, next) => {
		// Authentication middleware (existing code)
		// ... existing authentication code ...
		next();
	});

	io.on('connection', (socket) => {
		console.log('New client connected:', socket.id);

		// Handle user login
		socket.on('userLogin', async (username) => {
			const isUsernameTaken = Array.from(activeUsers.values()).some(user => user.username === username);
			if (isUsernameTaken) {
				socket.emit('loginError', 'Username already taken');
				return;
			}

			// Get user ID from socket (assuming it's attached during authentication)
			const userId = socket.user ? socket.user.id : null;
			
			activeUsers.set(socket.id, {
				username,
				socketId: socket.id,
				connectedAt: new Date(),
				userId: userId
			});

			if (!userMessages.has(username)) {
				userMessages.set(username, []);
			}

			// Get friends who are online
			let onlineFriends = [];
			if (userId) {
				try {
					// Get user's friends
					const friendships = await Friend.find({ userId }).populate('friendId', 'username');
					
					// Filter active users to only include friends
					onlineFriends = Array.from(activeUsers.values())
						.filter(user => {
							// Don't include self
							if (user.username === username) return false;
							
							// Check if this user is a friend
							return friendships.some(friendship => 
								friendship.friendId && friendship.friendId.username === user.username
							);
						})
						.map(user => user.username);
				} catch (error) {
					console.error('Error fetching friends list:', error);
					// Fallback to empty list if there's an error
					onlineFriends = [];
				}
			}

			socket.emit('loginSuccess', {
				username,
				users: onlineFriends
			});

			// Notify friends that this user is online
			if (userId) {
				// Broadcast to friends only that this user joined
				socket.broadcast.emit('userJoined', username);
			}
			
			console.log(`User ${username} logged in`);
		});

		// Handle private messages
		socket.on('privateMessage', async (data) => {
			const sender = activeUsers.get(socket.id);
			if (!sender) return;

			const { to, message, file } = data;
			
			// Check if sender and recipient are friends
			let canSendMessage = false;
			let recipientUserId = null;
			
			if (sender.userId) {
				try {
					// Get recipient user ID
					const recipientUser = await User.findOne({ username: to });
					if (recipientUser) {
						recipientUserId = recipientUser._id;
						
						// Check if they are friends
						const friendship = await Friend.findOne({
							userId: sender.userId,
							friendId: recipientUserId
						});
						canSendMessage = !!friendship;
					}
				} catch (error) {
					console.error('Error checking friendship status:', error);
				}
			}
			
			// Only allow messaging if users are friends
			if (!canSendMessage) {
				socket.emit('messageError', 'You can only message your friends');
				return;
			}
			
			const recipientSocket = Array.from(activeUsers.entries()).find(([id, user]) => user.username === to);
			
			if (recipientSocket) {
				const [recipientId, recipient] = recipientSocket;
				const messageObj = {
					from: sender.username,
					to,
					message,
					timestamp: new Date(),
					id: Date.now() + Math.random(),
				};
				if (file) {
					messageObj.file = file;
				}

				if (!userMessages.has(sender.username)) userMessages.set(sender.username, []);
				if (!userMessages.has(to)) userMessages.set(to, []);
				userMessages.get(sender.username).push(messageObj);
				userMessages.get(to).push(messageObj);

				io.to(recipientId).emit('newMessage', messageObj);
				socket.emit('messageSent', messageObj);
				if (file) {
					console.log(`File message from ${sender.username} to ${to}: ${message} (${file.originalName})`);
				} else {
					console.log(`Message from ${sender.username} to ${to}: ${message}`);
				}
			} else {
				socket.emit('messageError', 'User not found or not online');
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

		// Send current user list to newly connected user (friends only)
		const onlineUsers = Array.from(activeUsers.values())
			.map(user => user.username);
		socket.emit('userList', onlineUsers);
	});
}

module.exports = {
	initSocket,
};