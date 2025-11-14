import mongoose, { Schema } from "mongoose";

const encryptedMessageSchema = new Schema(
    {
        conversationId: {
            type: String,
            required: true,
            index: true
        },
        senderId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        recipientId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        ciphertext: {
            type: String,
            required: true
        },
        ratchetHeader: {
            type: Schema.Types.Mixed,
            required: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        isE2EE: {
            type: Boolean,
            default: true
        },
        messageType: {
            type: String,
            enum: ["text", "file"],
            default: "text"
        },
        fileMetadata: {
            fileSHA256: String,
            originalName: String,
            size: Number,
            mimetype: String,
            url: String
        }
    },
    { timestamps: true }
);

export default mongoose.model("EncryptedMessage", encryptedMessageSchema);