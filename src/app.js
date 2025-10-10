import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { UPLOAD_DIR } from './utils/constants.js';
import fileRouter from './routes/file.routes.js';
import healthRouter from './routes/healthCheck.routes.js';
import contactRouter from './routes/contact.routes.js';
import { mountAuth } from './auth/mount.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Core middleware
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(cookieParser());

// CORS
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  })
);

// Static assets
app.use(express.static(join(__dirname, '..', 'public')));

// Serve uploads
app.use('/uploads', express.static(UPLOAD_DIR));

// Routes
app.use('/upload', fileRouter);
app.use('/test', healthRouter);
app.use('/contacts', contactRouter);
import contactManagementRouter from './routes/contactManagement.routes.js';
app.use('/api/v1/contacts', contactManagementRouter);

// Mount auth routes
mountAuth(app);

// Root
app.get('/', (req, res) => {
	res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

// Error handler (upload-specific simplified)
app.use((error, req, res, next) => {
	if (error && error.name === 'MulterError') {
		if (error.code === 'LIMIT_FILE_SIZE') {
			return res.status(400).json({
				error: 'File too large. Maximum size is 25MB.',
				code: error.code,
			});
		}
		return res.status(400).json({ error: 'File upload error', details: error.message, code: error.code });
	}
	if (error && error.message) {
		return res.status(400).json({ error: error.message, details: 'General upload error' });
	}
	return next(error);
});

export default app;


