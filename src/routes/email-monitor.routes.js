import express from 'express';
import { getEmailQueueStatus } from '../auth/utils/enhanced-mail.js';

const router = express.Router();

// Email queue monitoring endpoint (for admin use)
router.get('/status', (req, res) => {
    try {
        const status = getEmailQueueStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get email queue status',
            message: error.message
        });
    }
});

export default router;