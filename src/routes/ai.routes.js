import express from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import { aiChat } from '../controllers/ai.controller.js';

const router = express.Router();

// Apply JWT middleware to all routes
router.use(verifyJWT);

// AI chat endpoint
router.post('/chat', aiChat);

export default router;