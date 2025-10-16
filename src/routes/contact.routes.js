import express from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
    searchUsers,
    sendFriendRequest,
    getFriendRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    getFriends,
    removeFriend
} from '../controllers/contact.controller.js';

const router = express.Router();

// Apply JWT middleware to all routes
router.use(verifyJWT);

// Search users
router.get('/search', searchUsers);

// Friend request management
router.post('/request/:receiverId', sendFriendRequest);
router.get('/requests', getFriendRequests);
router.post('/request/:requestId/accept', acceptFriendRequest);
router.post('/request/:requestId/reject', rejectFriendRequest);
router.delete('/request/:requestId/cancel', cancelFriendRequest);

// Friends management
router.get('/friends', getFriends);
router.delete('/friend/:friendId', removeFriend);

export default router;


