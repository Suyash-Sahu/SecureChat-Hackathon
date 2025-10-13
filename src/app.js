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
import { setCsrfCookie, verifyCsrfToken } from './middlewares/csrf.middleware.js';
import helmet from 'helmet';
import hpp from 'hpp';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Core middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));
app.use(hpp());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(cookieParser());
app.use(setCsrfCookie);

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
app.use('/test', healthRouter);

// Rate limiters for auth + OTP endpoints
// More scalable rate limiting configuration
const authLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, 
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication requests from this IP, please try again later.",
    code: "TOO_MANY_REQUESTS"
  }
});

// Per-key rate limiting for OTP requests to allow more concurrent users
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // Limit each email/IP to 5 OTP requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use email as key for OTP requests if available, otherwise use IP
    if (req.body && req.body.email) {
      return req.body.email;
    }
    return req.ip;
  },
  message: {
    success: false,
    message: "Too many OTP requests. Please wait before requesting another code.",
    code: "TOO_MANY_OTP_REQUESTS"
  }
});

app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/auth/refresh-token', authLimiter);
app.use('/api/v1/auth/request-email-otp', otpLimiter);
app.use('/api/v1/auth/verify-email-otp', otpLimiter);

// Mount auth routes BEFORE CSRF (auth routes are entry points)
// Note: mountAuth is async and will be handled in server.js
// Apply CSRF verification for state-changing routes
app.use(verifyCsrfToken);
app.use('/upload', fileRouter);
app.use('/contacts', contactRouter);
import contactManagementRouter from './routes/contactManagement.routes.js';
app.use('/api/v1/contacts', contactManagementRouter);

// Auth routes already mounted above

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