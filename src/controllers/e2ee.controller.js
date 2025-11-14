import { User } from '../auth/models/user.models.js';
import EncryptedMessage from '../models/encryptedMessage.models.js';
import SuspiciousFile from '../models/suspiciousFile.models.js';
import Anchor from '../models/anchor.models.js';
import { ApiError } from '../auth/utils/api-error.js';
import { ApiResponse } from '../auth/utils/api-response.js';
import { asyncHandler } from '../auth/utils/async-handler.js';
import crypto from 'crypto';
import { enqueueAnchoringJob } from '../jobs/anchoring.job.js';

// Upload public keys
const uploadPrekeys = asyncHandler(async (req, res) => {
    try {
        const { identityPublicKey, signedPreKeyPublic, signedPreKeySig, oneTimePreKeys } = req.body;
        const userId = req.user._id;

        // Validate input
        if (!identityPublicKey || !signedPreKeyPublic || !signedPreKeySig || !oneTimePreKeys) {
            throw new ApiError(400, "Missing required prekey data");
        }

        // Update user with prekey data
        const user = await User.findByIdAndUpdate(
            userId,
            {
                identityPublicKey,
                signedPreKeyPublic,
                signedPreKeySignature: signedPreKeySig,
                oneTimePreKeys
            },
            { new: true }
        ).select('identityPublicKey signedPreKeyPublic oneTimePreKeys');

        if (!user) {
            throw new ApiError(404, "User not found");
        }

        return res.status(200).json(
            new ApiResponse(200, { user }, "Prekeys uploaded successfully")
        );
    } catch (error) {
        console.error('Upload prekeys error:', error);
        throw new ApiError(500, "Failed to upload prekeys");
    }
});

// Fetch public keys for a user
const fetchPrekeys = asyncHandler(async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            throw new ApiError(400, "User ID is required");
        }

        // Find user and select prekey data
        const user = await User.findById(userId).select(
            'identityPublicKey signedPreKeyPublic oneTimePreKeys'
        );

        if (!user) {
            throw new ApiError(404, "User not found");
        }

        // Get one unused one-time prekey and mark it as consumed
        let oneTimePreKey = null;
        if (user.oneTimePreKeys && user.oneTimePreKeys.length > 0) {
            oneTimePreKey = user.oneTimePreKeys[0];
            // In a full implementation, we would remove this prekey from the array
            // and save the user document
        }

        const prekeyData = {
            identityPublicKey: user.identityPublicKey,
            signedPreKeyPublic: user.signedPreKeyPublic,
            oneTimePreKey
        };

        return res.status(200).json(
            new ApiResponse(200, prekeyData, "Prekeys fetched successfully")
        );
    } catch (error) {
        console.error('Fetch prekeys error:', error);
        throw new ApiError(500, "Failed to fetch prekeys");
    }
});

// Send encrypted message
const sendEncryptedMessage = asyncHandler(async (req, res) => {
    try {
        const { conversationId, recipientId, ciphertext, ratchetHeader, messageType, fileMetadata } = req.body;
        const senderId = req.user._id;

        // Validate input
        if (!conversationId || !recipientId || !ciphertext || !ratchetHeader) {
            throw new ApiError(400, "Missing required message data");
        }

        // Create encrypted message document
        const encryptedMessage = await EncryptedMessage.create({
            conversationId,
            senderId,
            recipientId,
            ciphertext,
            ratchetHeader,
            messageType: messageType || "text",
            fileMetadata: fileMetadata || null
        });

        return res.status(201).json(
            new ApiResponse(201, { encryptedMessage }, "Encrypted message sent successfully")
        );
    } catch (error) {
        console.error('Send encrypted message error:', error);
        throw new ApiError(500, "Failed to send encrypted message");
    }
});

// Upload encrypted file
const uploadEncryptedFile = asyncHandler(async (req, res) => {
    try {
        // This would handle uploading already encrypted files
        // Implementation would be similar to the existing file upload but for encrypted files
        return res.status(501).json(
            new ApiResponse(501, {}, "Encrypted file upload not implemented yet")
        );
    } catch (error) {
        console.error('Upload encrypted file error:', error);
        throw new ApiError(500, "Failed to upload encrypted file");
    }
});

// Upload suspicious file with consent
const uploadSuspiciousFile = asyncHandler(async (req, res) => {
    try {
        const { messageId, conversationId, fileSHA256, consentHash, signature, scanReport, ts, originalName, size, mimetype, filePath } = req.body;
        const senderId = req.user._id;

        // Validate input
        if (!messageId || !conversationId || !fileSHA256 || !consentHash || !signature || !scanReport) {
            throw new ApiError(400, "Missing required suspicious file data");
        }

        // In a full implementation, we would verify the signature here
        // using the sender's identity public key

        // Create suspicious file document
        const suspiciousFile = await SuspiciousFile.create({
            fileSHA256,
            conversationId,
            messageId,
            senderId,
            consentHash_sender: consentHash,
            sig_sender: signature,
            scanReport,
            originalName,
            size,
            mimetype,
            filePath
        });

        // Enqueue anchoring job for sender consent
        await enqueueAnchoringJob(consentHash, 'sender', messageId, suspiciousFile._id);

        return res.status(201).json(
            new ApiResponse(201, { suspiciousFile, suspiciousId: suspiciousFile._id }, "Suspicious file uploaded successfully")
        );
    } catch (error) {
        console.error('Upload suspicious file error:', error);
        throw new ApiError(500, "Failed to upload suspicious file");
    }
});

// Receiver consent for suspicious file
const receiverConsent = asyncHandler(async (req, res) => {
    try {
        const { suspiciousId, consentHash, signature } = req.body;
        const receiverId = req.user._id;

        // Validate input
        if (!suspiciousId || !consentHash || !signature) {
            throw new ApiError(400, "Missing required consent data");
        }

        // Find the suspicious file
        const suspiciousFile = await SuspiciousFile.findById(suspiciousId);
        if (!suspiciousFile) {
            throw new ApiError(404, "Suspicious file not found");
        }

        // In a full implementation, we would verify the signature here
        // using the receiver's identity public key

        // Update suspicious file with receiver consent
        suspiciousFile.consentHash_receiver = consentHash;
        suspiciousFile.sig_receiver = signature;
        suspiciousFile.status = "receiver_anchored";
        await suspiciousFile.save();

        // Enqueue anchoring job for receiver consent
        await enqueueAnchoringJob(consentHash, 'receiver', suspiciousFile.messageId, suspiciousFile._id);

        return res.status(200).json(
            new ApiResponse(200, { suspiciousFile }, "Receiver consent recorded successfully")
        );
    } catch (error) {
        console.error('Receiver consent error:', error);
        throw new ApiError(500, "Failed to record receiver consent");
    }
});

// Get anchor transactions for a message
const getAnchors = asyncHandler(async (req, res) => {
    try {
        const { messageId } = req.params;

        if (!messageId) {
            throw new ApiError(400, "Message ID is required");
        }

        // Find anchors related to this message
        const anchors = await Anchor.find({ relatedMessageId: messageId });

        return res.status(200).json(
            new ApiResponse(200, { anchors }, "Anchors retrieved successfully")
        );
    } catch (error) {
        console.error('Get anchors error:', error);
        throw new ApiError(500, "Failed to retrieve anchors");
    }
});

export {
    uploadPrekeys,
    fetchPrekeys,
    sendEncryptedMessage,
    uploadEncryptedFile,
    uploadSuspiciousFile,
    receiverConsent,
    getAnchors
};