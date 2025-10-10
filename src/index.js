const fs = require('fs');
const path = require('path');

// Load env vars from .env if present
try {
	if (fs.existsSync(path.join(__dirname, '..', '.env'))) {
		require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
		console.log('✅ Loaded environment variables from .env');
	}
} catch (e) {
	console.warn('⚠️ Could not load .env:', e && e.message);
}

const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { mountAuth } = require('./auth/mount');
const { initSocket } = require('./services/socket.service');
const { UPLOAD_DIR } = require('./utils/constants');

const server = http.createServer(app);
const io = new Server(server);

initSocket(io);

// Mount authentication (optional; will skip DB if no URI)
(async () => {
	await mountAuth(app);
})();

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

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


