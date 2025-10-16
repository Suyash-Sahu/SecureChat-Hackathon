import mongoose from 'mongoose';
import { User } from '../auth/models/user.models.js';
import FriendRequest from '../models/friendRequest.models.js';
import Friend from '../models/friend.models.js';
import { ApiError } from '../auth/utils/api-error.js';
import { ApiResponse } from '../auth/utils/api-response.js';
import { asyncHandler } from '../auth/utils/async-handler.js';

// Search users
const searchUsers = asyncHandler(async (req, res) => {
    try {
        const { query } = req.query;
        const currentUserId = req.user._id;

        if (!query || query.trim().length < 2) {
            throw new ApiError(400, 'Search query must be at least 2 characters long');
        }

        // Search users by username or email (excluding current user)
        const users = await User.find({
            $and: [
                {
                    $or: [
                        { username: { $regex: query, $options: 'i' } },
                        { email: { $regex: query, $options: 'i' } }
                    ]
                },
                { _id: { $ne: currentUserId } }
            ]
        })
        .select('username email')
        .limit(20);

        // Check friendship status for each user
        const usersWithStatus = await Promise.all(users.map(async (user) => {
            // Check if they are already friends
            const isFriend = await Friend.findOne({
                $or: [
                    { userId: currentUserId, friendId: user._id },
                    { userId: user._id, friendId: currentUserId }
                ]
            });

            // Check if there's a pending friend request
            const friendRequest = await FriendRequest.findOne({
                $or: [
                    { senderId: currentUserId, receiverId: user._id },
                    { senderId: user._id, receiverId: currentUserId }
                ]
            });

            let relationshipStatus = 'none';
            if (isFriend) {
                relationshipStatus = 'friend';
            } else if (friendRequest) {
                relationshipStatus = friendRequest.senderId.toString() === currentUserId.toString() 
                    ? 'outgoing_request' 
                    : 'incoming_request';
            }

            return {
                id: user._id,
                username: user.username,
                email: user.email,
                relationshipStatus
            };
        }));

        return res.status(200).json(
            new ApiResponse(200, { users: usersWithStatus }, 'Users found successfully')
        );

    } catch (error) {
        console.error('Search users error:', error);
        throw new ApiError(500, 'Failed to search users');
    }
});

// Send friend request
const sendFriendRequest = asyncHandler(async (req, res) => {
    try {
        const { receiverId } = req.params;
        const senderId = req.user._id;

        // Validate that sender and receiver are different
        if (senderId.toString() === receiverId) {
            throw new ApiError(400, 'Cannot send friend request to yourself');
        }

        // Check if receiver exists
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            throw new ApiError(404, 'User not found');
        }

        // Check if already friends
        const existingFriendship = await Friend.findOne({
            $or: [
                { userId: senderId, friendId: receiverId },
                { userId: receiverId, friendId: senderId }
            ]
        });

        if (existingFriendship) {
            throw new ApiError(400, 'Already friends with this user');
        }

        // Check for existing request
        const existingRequest = await FriendRequest.findOne({
            $or: [
                { senderId, receiverId },
                { senderId: receiverId, receiverId: senderId }
            ]
        });

        if (existingRequest) {
            if (existingRequest.senderId.toString() === senderId.toString()) {
                throw new ApiError(400, 'Friend request already sent');
            } else {
                throw new ApiError(400, 'This user has already sent you a friend request');
            }
        }

        // Create friend request
        const friendRequest = await FriendRequest.create({
            senderId,
            receiverId
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

        let requests = [];
        if (type === 'incoming') {
            requests = await FriendRequest.find({ receiverId: userId, status: 'pending' })
                .populate('senderId', 'username email')
                .sort({ createdAt: -1 });
        } else if (type === 'outgoing') {
            requests = await FriendRequest.find({ senderId: userId, status: 'pending' })
                .populate('receiverId', 'username email')
                .sort({ createdAt: -1 });
        } else {
            throw new ApiError(400, 'Invalid type parameter. Use "incoming" or "outgoing"');
        }

        const formattedRequests = requests.map(request => ({
            id: request._id,
            sender: request.senderId ? {
                id: request.senderId._id,
                username: request.senderId.username,
                email: request.senderId.email
            } : null,
            receiver: request.receiverId ? {
                id: request.receiverId._id,
                username: request.receiverId.username,
                email: request.receiverId.email
            } : null,
            status: request.status,
            createdAt: request.createdAt
        }));

        return res.status(200).json(
            new ApiResponse(200, { requests: formattedRequests }, 'Friend requests retrieved successfully')
        );

    } catch (error) {
        console.error('Get friend requests error:', error);
        throw new ApiError(500, 'Failed to get friend requests');
    }
});

// Accept friend request
const acceptFriendRequest = asyncHandler(async (req, res) => {
    try {
        const { requestId } = req.params;
        const userId = req.user._id;

        // Find the friend request where user is the receiver
        const friendRequest = await FriendRequest.findOne({
            _id: requestId,
            receiverId: userId,
            status: 'pending'
        });

        if (!friendRequest) {
            throw new ApiError(404, 'Friend request not found or already processed');
        }

        // Update request status
        friendRequest.status = 'accepted';
        await friendRequest.save();

        // Create friendship in both directions
        await Friend.create([
            { userId: friendRequest.senderId, friendId: friendRequest.receiverId },
            { userId: friendRequest.receiverId, friendId: friendRequest.senderId }
        ]);

        return res.status(200).json(
            new ApiResponse(200, {}, 'Friend request accepted successfully')
        );

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

        // Find the friend request where user is the receiver
        const friendRequest = await FriendRequest.findOne({
            _id: requestId,
            receiverId: userId,
            status: 'pending'
        });

        if (!friendRequest) {
            throw new ApiError(404, 'Friend request not found or already processed');
        }

        // Update request status
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

        // Find the friend request where user is the sender
        const friendRequest = await FriendRequest.findOne({
            _id: requestId,
            senderId: userId,
            status: 'pending'
        });

        if (!friendRequest) {
            throw new ApiError(404, 'Friend request not found or already processed');
        }

        // Delete the friend request
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

// Get friends list
const getFriends = asyncHandler(async (req, res) => {
    try {
        const userId = req.user._id;

        // Get all friends
        const friendships = await Friend.find({ userId })
            .populate('friendId', 'username email');

        const friends = friendships.map(friendship => ({
            id: friendship.friendId._id,
            username: friendship.friendId.username,
            email: friendship.friendId.email,
            createdAt: friendship.createdAt
        }));

        return res.status(200).json(
            new ApiResponse(200, { friends }, 'Friends list retrieved successfully')
        );

    } catch (error) {
        console.error('Get friends error:', error);
        throw new ApiError(500, 'Failed to get friends list');
    }
});

// Remove friend
const removeFriend = asyncHandler(async (req, res) => {
    try {
        const { friendId } = req.params;
        const userId = req.user._id;

        // Remove friendship in both directions
        await Friend.deleteMany({
            $or: [
                { userId, friendId },
                { userId: friendId, friendId: userId }
            ]
        });

        // Also remove any pending friend requests between these users
        await FriendRequest.deleteMany({
            $or: [
                { senderId: userId, receiverId: friendId },
                { senderId: friendId, receiverId: userId }
            ]
        });

        return res.status(200).json(
            new ApiResponse(200, {}, 'Friend removed successfully')
        );

    } catch (error) {
        console.error('Remove friend error:', error);
        throw new ApiError(500, 'Failed to remove friend');
    }
});

export {
    searchUsers,
    sendFriendRequest,
    getFriendRequests,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    getFriends,
    removeFriend
};
