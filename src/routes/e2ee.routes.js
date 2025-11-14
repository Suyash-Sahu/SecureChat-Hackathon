import express from 'express';
import { verifyJWT } from '../middlewares/auth.middleware.js';
import {
    uploadPrekeys,
    fetchPrekeys,
    sendEncryptedMessage,
    uploadEncryptedFile,
    uploadSuspiciousFile,
    receiverConsent,
    getAnchors
} from '../controllers/e2ee.controller.js';

const router = express.Router();

// Apply JWT middleware to all routes
router.use(verifyJWT);

// Prekey management
router.post('/prekeys/upload', uploadPrekeys);
router.get('/prekeys/fetch', fetchPrekeys);

// Encrypted message handling
router.post('/messages/send', sendEncryptedMessage);

// Encrypted file handling
router.post('/files/upload/encrypted', uploadEncryptedFile);
router.post('/files/upload/suspicious', uploadSuspiciousFile);

router.post('/suspicious/receiver-consent', receiverConsent);

router.get('/anchors/:messageId', getAnchors);

export default router;