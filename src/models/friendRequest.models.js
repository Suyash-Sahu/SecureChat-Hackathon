import mongoose from 'mongoose';

const friendRequestSchema = new mongoose.Schema({
    fromUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    toUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes
// Prevent duplicate requests between same pair
friendRequestSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });
// Query helpers
friendRequestSchema.index({ toUserId: 1, status: 1 });
friendRequestSchema.index({ fromUserId: 1, status: 1 });

const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);

export default FriendRequest;
