import mongoose, { Schema } from "mongoose";

const anchorSchema = new Schema(
    {
        consentHash: {
            type: String,
            required: true,
            index: true
        },
        role: {
            type: String,
            enum: ["sender", "receiver"],
            required: true
        },
        txHash: {
            type: String,
            required: true
        },
        blockNumber: {
            type: Number
        },
        status: {
            type: String,
            enum: ["pending", "confirmed", "failed"],
            default: "pending"
        },
        relatedMessageId: {
            type: String,
            required: true
        },
        relatedFileId: {
            type: Schema.Types.ObjectId,
            ref: "SuspiciousFile"
        }
    },
    { timestamps: true }
);

export default mongoose.model("Anchor", anchorSchema);