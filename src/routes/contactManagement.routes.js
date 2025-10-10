import express from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
    searchUsers,
    sendFriendRequest,
    getFriendRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    getContactList,
    removeContact,
    blockUser,
    unblockUser,
    reportUser
} from '../controllers/contact.controller.js';

const router = express.Router();

// Apply JWT middleware to all routes
router.use(verifyJWT);

// Search users
router.get('/search', searchUsers);

// Friend request management
router.post('/request/:userId', sendFriendRequest);
router.get('/requests', getFriendRequests);
router.post('/request/:requestId/accept', acceptFriendRequest);
router.post('/request/:requestId/reject', rejectFriendRequest);
router.delete('/request/:requestId/cancel', cancelFriendRequest);

// Contact list management
router.get('/list', getContactList);
router.delete('/:contactId/remove', removeContact);

// Blocking and reporting
router.post('/:userId/block', blockUser);
router.post('/:userId/unblock', unblockUser);
router.post('/:userId/report', reportUser);

export default router;
