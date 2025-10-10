const activeUsers = new Map(); // socketId -> { username, socketId, connectedAt }
const userMessages = new Map(); // username -> messages[]

module.exports = {
	activeUsers,
	userMessages,
};


