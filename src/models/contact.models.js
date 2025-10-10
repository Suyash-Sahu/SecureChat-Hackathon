import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['accepted', 'pending', 'blocked'],
        default: 'accepted'
    },
    addedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Create compound index to ensure unique contact relationships
contactSchema.index({ userId: 1, contactId: 1 }, { unique: true });

// Create index for efficient querying
contactSchema.index({ userId: 1, addedAt: -1 });

const Contact = mongoose.model('Contact', contactSchema);

export default Contact;


