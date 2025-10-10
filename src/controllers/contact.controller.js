import mongoose from 'mongoose';
import { User } from '../auth/models/user.models.js';
import FriendRequest from '../models/friendRequest.models.js';
import Contact from '../models/contact.models.js';
import BlockList from '../models/blockList.models.js';
import Report from '../models/report.models.js';
import { ApiError } from '../auth/utils/api-error.js';
import { ApiResponse } from '../auth/utils/api-response.js';
import { asyncHandler } from '../auth/utils/async-handler.js';

// Search users
const searchUsers = asyncHandler(async (req, res) => {
    try {
        const { query, limit = 20 } = req.query;
        const userId = req.user._id;

        if (!query || query.trim().length < 2) {
            throw new ApiError(400, 'Search query must be at least 2 characters long');
        }

        const searchQuery = query.trim();
        const searchLimit = Math.min(parseInt(limit), 50); // Max 50 results

        // Get blocked users to exclude from search
        const blockedUsers = await BlockList.find({ userId }).select('blockedUserId');
        const blockedUserIds = blockedUsers.map(block => block.blockedUserId);

        // Search users by username or email
        const users = await User.find({
            $and: [
                { _id: { $ne: userId } }, // Exclude self
                { _id: { $nin: blockedUserIds } }, // Exclude blocked users
                {
                    $or: [
                        { username: { $regex: searchQuery, $options: 'i' } },
                        { email: { $regex: searchQuery, $options: 'i' } }
                    ]
                }
            ]
        })
        .select('username email avatar isEmailVerified createdAt')
        .limit(searchLimit)
        .lean();

        // Check existing friend requests and contacts
        const userIds = users.map(user => user._id);
        
        const [friendRequests, contacts] = await Promise.all([
            FriendRequest.find({
                $or: [
                    { fromUserId: userId, toUserId: { $in: userIds } },
                    { fromUserId: { $in: userIds }, toUserId: userId }
                ]
            }).lean(),
            Contact.find({
                userId,
                contactId: { $in: userIds }
            }).lean()
        ]);

        // Create maps for quick lookup
        const requestMap = {};
        const contactMap = {};

        friendRequests.forEach(request => {
            const targetUserId = request.fromUserId.toString() === userId ? 
                request.toUserId.toString() : request.fromUserId.toString();
            requestMap[targetUserId] = {
                status: request.status,
                isOutgoing: request.fromUserId.toString() === userId
            };
        });

        contacts.forEach(contact => {
            contactMap[contact.contactId.toString()] = true;
        });

        // Add relationship status to users
        const usersWithStatus = users.map(user => ({
            id: user._id,
            username: user.username,
            email: user.email,
            avatar: user.avatar,
            isEmailVerified: user.isEmailVerified,
            createdAt: user.createdAt,
            relationship: contactMap[user._id.toString()] ? 'contact' : 
                         requestMap[user._id.toString()] ? requestMap[user._id.toString()] : 'none'
        }));

        return res.status(200).json(
            new ApiResponse(200, { users: usersWithStatus }, 'Users found successfully')
        );

    } catch (error) {
        console.error('Search users error:', error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, 'Failed to search users');
    }
});

// Send friend request
const sendFriendRequest = asyncHandler(async (req, res) => {
    try {
        const { userId: targetUserId } = req.params;
        const fromUserId = req.user._id;

        if (!targetUserId) {
            throw new ApiError(400, 'User ID is required');
        }

        if (targetUserId === fromUserId.toString()) {
            throw new ApiError(400, 'Cannot send friend request to yourself');
        }

        // Check if target user exists
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            throw new ApiError(404, 'User not found');
        }

        // Check if already blocked
        const isBlocked = await BlockList.findOne({
            $or: [
                { userId: fromUserId, blockedUserId: targetUserId },
                { userId: targetUserId, blockedUserId: fromUserId }
            ]
        });

        if (isBlocked) {
            throw new ApiError(403, 'Cannot send friend request to blocked user');
        }

        // Check if already friends
        const existingContact = await Contact.findOne({
            $or: [
                { userId: fromUserId, contactId: targetUserId },
                { userId: targetUserId, contactId: fromUserId }
            ]
        });

        if (existingContact) {
            throw new ApiError(409, 'Already friends with this user');
        }

        // Check for existing request
        const existingRequest = await FriendRequest.findOne({
            $or: [
                { fromUserId, toUserId: targetUserId },
                { fromUserId: targetUserId, toUserId: fromUserId }
            ]
        });

        if (existingRequest) {
            if (existingRequest.fromUserId.toString() === fromUserId) {
                throw new ApiError(409, 'Friend request already sent');
            } else {
                throw new ApiError(409, 'This user has already sent you a friend request');
            }
        }

        // Create friend request
        const friendRequest = await FriendRequest.create({
            fromUserId,
            toUserId: targetUserId
        });

        return res.status(201).json(
            new ApiResponse(201, { friendRequest }, 'Friend request sent successfully')
        );

    } catch (error) {
        console.error('Send friend request error:', error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, 'Failed to send friend request');
    }
});

// Get friend requests
const getFriendRequests = asyncHandler(async (req, res) => {
    try {
        const userId = req.user._id;
        const { type = 'incoming' } = req.query; // 'incoming' or 'outgoing'

        let query = {};
        if (type === 'incoming') {
            query = { toUserId: userId, status: 'pending' };
        } else if (type === 'outgoing') {
            query = { fromUserId: userId, status: 'pending' };
        } else {
            throw new ApiError(400, 'Invalid type parameter. Use "incoming" or "outgoing"');
        }

        const requests = await FriendRequest.find(query)
            .populate('fromUserId', 'username email avatar')
            .populate('toUserId', 'username email avatar')
            .sort({ createdAt: -1 })
            .lean();

        const formattedRequests = requests.map(request => ({
            id: request._id,
            fromUser: {
                id: request.fromUserId._id,
                username: request.fromUserId.username,
                email: request.fromUserId.email,
                avatar: request.fromUserId.avatar
            },
            toUser: {
                id: request.toUserId._id,
                username: request.toUserId.username,
                email: request.toUserId.email,
                avatar: request.toUserId.avatar
            },
            status: request.status,
            createdAt: request.createdAt
        }));

        return res.status(200).json(
            new ApiResponse(200, { requests: formattedRequests }, 'Friend requests retrieved successfully')
        );

    } catch (error) {
        console.error('Get friend requests error:', error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, 'Failed to get friend requests');
    }
});

// Accept friend request
const acceptFriendRequest = asyncHandler(async (req, res) => {
    try {
        const { requestId } = req.params;
        const userId = req.user._id;

        const friendRequest = await FriendRequest.findOne({
            _id: requestId,
            toUserId: userId,
            status: 'pending'
        });

        if (!friendRequest) {
            throw new ApiError(404, 'Friend request not found or already processed');
        }

        // Start transaction
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Update request status
            friendRequest.status = 'accepted';
            await friendRequest.save({ session });

            // Create contact for both users
            await Contact.create([
                { userId: friendRequest.fromUserId, contactId: friendRequest.toUserId },
                { userId: friendRequest.toUserId, contactId: friendRequest.fromUserId }
            ], { session });

            await session.commitTransaction();

            return res.status(200).json(
                new ApiResponse(200, {}, 'Friend request accepted successfully')
            );

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }

    } catch (error) {
        console.error('Accept friend request error:', error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, 'Failed to accept friend request');
    }
});

// Reject friend request
const rejectFriendRequest = asyncHandler(async (req, res) => {
    try {
        const { requestId } = req.params;
        const userId = req.user._id;

        const friendRequest = await FriendRequest.findOne({
            _id: requestId,
            toUserId: userId,
            status: 'pending'
        });

        if (!friendRequest) {
            throw new ApiError(404, 'Friend request not found or already processed');
        }

        friendRequest.status = 'rejected';
        await friendRequest.save();

        return res.status(200).json(
            new ApiResponse(200, {}, 'Friend request rejected successfully')
        );

    } catch (error) {
        console.error('Reject friend request error:', error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, 'Failed to reject friend request');
    }
});

// Cancel friend request
const cancelFriendRequest = asyncHandler(async (req, res) => {
    try {
        const { requestId } = req.params;
        const userId = req.user._id;

        const friendRequest = await FriendRequest.findOne({
            _id: requestId,
            fromUserId: userId,
            status: 'pending'
        });

        if (!friendRequest) {
            throw new ApiError(404, 'Friend request not found or already processed');
        }

        await FriendRequest.findByIdAndDelete(requestId);

        return res.status(200).json(
            new ApiResponse(200, {}, 'Friend request cancelled successfully')
        );

    } catch (error) {
        console.error('Cancel friend request error:', error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, 'Failed to cancel friend request');
    }
});

// Get contact list
const getContactList = asyncHandler(async (req, res) => {
    try {
        const userId = req.user._id;
        const { limit = 50, cursor } = req.query;

        const query = { userId };
        if (cursor) {
            query._id = { $gt: cursor };
        }

        const contacts = await Contact.find(query)
            .populate('contactId', 'username email avatar isEmailVerified')
            .sort({ createdAt: -1 })
            .limit(Math.min(parseInt(limit), 100))
            .lean();

        const formattedContacts = contacts.map(contact => ({
            id: contact._id,
            contactId: contact.contactId._id,
            username: contact.contactId.username,
            email: contact.contactId.email,
            avatar: contact.contactId.avatar,
            isEmailVerified: contact.contactId.isEmailVerified,
            addedAt: contact.createdAt
        }));

        const nextCursor = contacts.length > 0 ? contacts[contacts.length - 1]._id : null;

        return res.status(200).json(
            new ApiResponse(200, { 
                contacts: formattedContacts, 
                nextCursor 
            }, 'Contact list retrieved successfully')
        );

    } catch (error) {
        console.error('Get contact list error:', error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, 'Failed to get contact list');
    }
});

// Remove contact
const removeContact = asyncHandler(async (req, res) => {
    try {
        const { contactId } = req.params;
        const userId = req.user._id;

        const contact = await Contact.findOne({
            userId,
            contactId
        });

        if (!contact) {
            throw new ApiError(404, 'Contact not found');
        }

        // Remove contact for both users
        await Contact.deleteMany({
            $or: [
                { userId, contactId },
                { userId: contactId, contactId: userId }
            ]
        });

        return res.status(200).json(
            new ApiResponse(200, {}, 'Contact removed successfully')
        );

    } catch (error) {
        console.error('Remove contact error:', error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, 'Failed to remove contact');
    }
});

// Block user
const blockUser = asyncHandler(async (req, res) => {
    try {
        const { userId: targetUserId } = req.params;
        const { reason } = req.body;
        const userId = req.user._id;

        if (targetUserId === userId.toString()) {
            throw new ApiError(400, 'Cannot block yourself');
        }

        // Check if user exists
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            throw new ApiError(404, 'User not found');
        }

        // Check if already blocked
        const existingBlock = await BlockList.findOne({
            userId,
            blockedUserId: targetUserId
        });

        if (existingBlock) {
            throw new ApiError(409, 'User is already blocked');
        }

        // Start transaction
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Create block entry
            await BlockList.create([{
                userId,
                blockedUserId: targetUserId,
                reason
            }], { session });

            // Remove from contacts if exists
            await Contact.deleteMany({
                $or: [
                    { userId, contactId: targetUserId },
                    { userId: targetUserId, contactId: userId }
                ]
            }, { session });

            // Cancel any pending friend requests
            await FriendRequest.deleteMany({
                $or: [
                    { fromUserId: userId, toUserId: targetUserId },
                    { fromUserId: targetUserId, toUserId: userId }
                ]
            }, { session });

            await session.commitTransaction();

            return res.status(200).json(
                new ApiResponse(200, {}, 'User blocked successfully')
            );

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }

    } catch (error) {
        console.error('Block user error:', error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, 'Failed to block user');
    }
});

// Unblock user
const unblockUser = asyncHandler(async (req, res) => {
    try {
        const { userId: targetUserId } = req.params;
        const userId = req.user._id;

        const block = await BlockList.findOneAndDelete({
            userId,
            blockedUserId: targetUserId
        });

        if (!block) {
            throw new ApiError(404, 'User is not blocked');
        }

        return res.status(200).json(
            new ApiResponse(200, {}, 'User unblocked successfully')
        );

    } catch (error) {
        console.error('Unblock user error:', error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, 'Failed to unblock user');
    }
});

// Report user
const reportUser = asyncHandler(async (req, res) => {
    try {
        const { userId: targetUserId } = req.params;
        const { reason } = req.body;
        const userId = req.user._id;

        if (!reason || reason.trim().length < 10) {
            throw new ApiError(400, 'Report reason must be at least 10 characters long');
        }

        if (targetUserId === userId.toString()) {
            throw new ApiError(400, 'Cannot report yourself');
        }

        // Check if user exists
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            throw new ApiError(404, 'User not found');
        }

        // Check if already reported recently (prevent spam)
        const recentReport = await Report.findOne({
            reporterId: userId,
            reportedUserId: targetUserId,
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // 24 hours
        });

        if (recentReport) {
            throw new ApiError(429, 'You have already reported this user recently');
        }

        // Create report
        const report = await Report.create({
            reporterId: userId,
            reportedUserId: targetUserId,
            reason: reason.trim()
        });

        return res.status(201).json(
            new ApiResponse(201, { report }, 'User reported successfully')
        );

    } catch (error) {
        console.error('Report user error:', error);
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(500, 'Failed to report user');
    }
});

export {
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
};
