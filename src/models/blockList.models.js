import mongoose from 'mongoose';

const blockListSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    blockedUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String,
        maxlength: 500
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for efficient queries
blockListSchema.index({ userId: 1, blockedUserId: 1 });
blockListSchema.index({ blockedUserId: 1 });

// Prevent duplicate blocks
blockListSchema.index({ userId: 1, blockedUserId: 1 }, { unique: true });

const BlockList = mongoose.model('BlockList', blockListSchema);

export default BlockList;
