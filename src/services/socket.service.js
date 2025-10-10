const { activeUsers, userMessages } = require('../models/chat.models');

function initSocket(io) {
	io.on('connection', (socket) => {
		console.log('New client connected:', socket.id);

		// Handle user login
		socket.on('userLogin', (username) => {
			const isUsernameTaken = Array.from(activeUsers.values()).some(user => user.username === username);
			if (isUsernameTaken) {
				socket.emit('loginError', 'Username already taken');
				return;
			}

			activeUsers.set(socket.id, {
				username,
				socketId: socket.id,
				connectedAt: new Date(),
			});

			if (!userMessages.has(username)) {
				userMessages.set(username, []);
			}

			socket.emit('loginSuccess', {
				username,
				users: Array.from(activeUsers.values()).map(user => user.username),
			});

			socket.broadcast.emit('userJoined', username);
			console.log(`User ${username} logged in`);
		});

		// Handle private messages
		socket.on('privateMessage', (data) => {
			const sender = activeUsers.get(socket.id);
			if (!sender) return;

			const { to, message, file } = data;
			const recipientSocket = Array.from(activeUsers.entries()).find(([id, user]) => user.username === to);
			if (recipientSocket) {
				const [recipientId] = recipientSocket;
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
}

module.exports = {
	initSocket,
};


