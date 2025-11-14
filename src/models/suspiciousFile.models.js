import mongoose, { Schema } from "mongoose";

const suspiciousFileSchema = new Schema(
    {
        fileSHA256: {
            type: String,
            required: true,
            index: true
        },
        conversationId: {
            type: String,
            required: true
        },
        messageId: {
            type: String,
            required: true
        },
        senderId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        // Sender consent data
        consentHash_sender: {
            type: String,
            required: true
        },
        sig_sender: {
            type: String,
            required: true
        },
        txHash_sender: {
            type: String,
            default: ""
        },
        // Receiver consent data
        consentHash_receiver: {
            type: String,
            default: ""
        },
        sig_receiver: {
            type: String,
            default: ""
        },
        txHash_receiver: {
            type: String,
            default: ""
        },
        status: {
            type: String,
            enum: ["pending", "sender_anchored", "receiver_anchored", "delivered", "rejected", "failed"],
            default: "pending"
        },
        scanReport: {
            type: Schema.Types.Mixed
        },
        filePath: {
            type: String,
            required: true
        },
        originalName: {
            type: String,
            required: true
        },
        size: {
            type: Number,
            required: true
        },
        mimetype: {
            type: String,
            required: true
        }
    },
    { timestamps: true }
);

export default mongoose.model("SuspiciousFile", suspiciousFileSchema);