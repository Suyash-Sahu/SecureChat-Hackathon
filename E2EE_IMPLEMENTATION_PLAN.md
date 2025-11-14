# E2EE with Blockchain Implementation Plan

## Overview
This document outlines the implementation of End-to-End Encryption (E2EE) with blockchain anchoring for consent verification in the secure chat application.

## Completed Implementation

### 1. Data Models
- Updated User model with E2EE fields (identityPublicKey, signedPreKeyPublic, etc.)
- Created EncryptedMessage model for storing encrypted messages
- Created SuspiciousFile model for handling suspicious files with consent data
- Created Anchor model for storing blockchain anchoring records

### 2. Backend API
- Created E2EE routes for all required endpoints
- Implemented controllers for:
  - Prekey management (upload/fetch)
  - Encrypted message handling
  - Suspicious file handling with consent
  - Receiver consent processing
  - Anchor transaction retrieval

### 3. Blockchain Integration
- Created anchoring service placeholder
- Implemented job queue for anchoring tasks using Bull
- Added enqueueing of anchoring jobs for sender and receiver consent

### 4. Smart Contract
- Created ConsentStorage.sol contract for storing consent hashes on blockchain

### 5. Frontend Components
- Created useE2EE.js hook for E2EE functionality
- Created useStegoScanner.js hook for steganography detection
- Created ConsentModal.js component for user consent handling
- Created consent-modal.css for styling the consent modal

## Remaining Implementation Tasks

### 1. Client-Side E2EE Implementation
- Integrate libsignal-protocol or double-ratchet-js library
- Implement key generation (Ed25519 identity key, X25519 prekeys)
- Implement X3DH handshake protocol
- Implement Double Ratchet algorithm for message encryption/decryption
- Implement secure key storage using WebCrypto API or IndexedDB

### 2. Steganography Scanner Integration
- Integrate WASM-based steganography detection library
- Implement file type-specific detection algorithms:
  - LSB/MSB analysis for PNG images
  - MSB/LSB extraction for WAV audio
  - Direct byte analysis for MP4 video
  - Delimiter search and entropy analysis for PDF documents
- Implement SHA256 hashing using WebCrypto API

### 3. Blockchain Integration
- Install and configure ethers.js library
- Deploy ConsentStorage.sol contract to Mumbai/Sepolia testnet
- Implement contract interaction in anchoring service:
  - Initialize provider and signer
  - Load contract ABI and address
  - Implement storeConsent function call
  - Implement event verification for anchor validation
- Set up Redis for production job queue

### 4. Signature Verification
- Implement Ed25519 signature verification on backend
- Verify sender and receiver signatures before anchoring
- Add proper error handling for invalid signatures

### 5. Frontend Integration
- Integrate E2EE hooks with existing chat interface
- Replace current Socket.IO messaging with encrypted messaging
- Implement file encryption/decryption for clean files
- Integrate steganography scanner with file upload flow
- Implement consent modal in file sharing flow
- Add UI for displaying blockchain transaction links

### 6. Security Enhancements
- Implement proper key rotation mechanisms
- Add replay attack protection
- Implement secure session management
- Add proper error handling and logging
- Implement rate limiting for E2EE endpoints

### 7. Testing
- Unit tests for all E2EE components
- Integration tests for end-to-end flow
- Security testing for encryption implementation
- Performance testing for blockchain anchoring
- Negative testing for edge cases

## Testing Checklist

### Core Functionality
- [ ] Key upload: client uploads public prekeys to server and server stores them
- [ ] Handshake: Alice fetches Bob prekeys; X3DH produces the same shared secret as Bob when he consumes the one-time prekey
- [ ] Message roundtrip: send a message Alice→server→Bob; Bob decrypts successfully and content matches plaintext
- [ ] Rekeying: ratchet advances correctly across multiple messages
- [ ] File clean path: safe file scanned → encrypted locally → uploaded → receiver decrypts
- [ ] File suspicious path: sender consent signed & anchored on-chain; receiver notified; receiver signs & anchors and receives file only after anchored
- [ ] Signature verification: backend rejects invalid signatures
- [ ] Anchor verification: verifyAnchor(txHash, expectedHash) returns true by reading emitted event

### Negative Tests
- [ ] Revoked key handling
- [ ] Replay attack protection
- [ ] Malformed headers rejection
- [ ] Invalid signature rejection

## Development Task Allocation

### Person A (E2EE Lead)
- Implement client key generation
- Implement prekey upload API
- Implement X3DH + double ratchet logic (useE2EE hook)
- Implement message encryption/decryption
- Implement file encryption on client

### Person B (Backend & Anchoring Lead)
- Implement prekeys endpoints
- Implement message storage changes
- Implement suspicious endpoints
- Implement anchoring.service + job worker
- Implement contract deployment scripts
- Implement anchor DB model

### Person C (Frontend + Stego + UX)
- Integrate WASM scanner
- Implement ConsentModal & SuspiciousInbox UI
- Implement file picker integration
- Implement admin dashboards and tx link displays
- Implement testing flows

## Quick Verification Commands

### Verify Anchor Event (Backend)
- Use ethers.js to fetch logs with event signature and check hashValue equals consentHash

### Hardhat Local Development
- Start local chain
- Deploy contract
- Set RPC_URL=http://localhost:8545 in .env for testing

## Gotchas and Considerations

1. **Metadata Leak**: E2EE implies metadata leak - server still knows conversation participants, timestamps, and message sizes. Consider padding if you care.

2. **Signing Order**: Sign canonical hash of the file after file SHA256 is computed to avoid mismatch.

3. **Clock Skew**: Client timestamps must be checked only for human-readable; canonical string includes ts but verification can accept small skew tolerance; the hash includes ts so a different ts will alter H and the signature — ensure clients send their exact ts used to compute H.

4. **One-time Prekey Consumption**: Mark one-time prekeys consumed immediately on server when fetched, to prevent reuse.

## Final Correct Sequence

### STEP 1 - User A selects a file
- User picks an image/file from their device
- No encryption yet

### STEP 2 - Client-side steganography scan
- WASM scanner runs locally
- Scan file for LSB/MSB patterns
- Detect anomalies
- Possibly detect text hidden in image
- Result: verdict = "clean" or "suspicious", confidence, scanReport

### STEP 3 - If CLEAN → Normal E2EE flow
- User A encrypts the file using the ratchet session key
- Sends ciphertext → server → user B
- User B decrypts with their own ratchet key
- No blockchain step for clean files

### STEP 4 - If SUSPICIOUS → Ask User A for CONSENT
- Before encryption, before sending anything
- User A must approve sending a suspicious file
- ConsentModal shows why the file is suspicious, risks, and explains blockchain proof storage
- If user A approves, proceed to next step

### STEP 5 - Compute SHA256 hash of RAW file
- Hash the original file bytes (NOT encrypted file, NOT base64, NOT metadata)
- fileSHA256 = SHA256(file_bytes)
- This hash becomes the identity of the file

### STEP 6 - Build the Canonical Consent String
```
consent_v1|sender|fileSHA256|conversationId|messageId|senderIdHash|timestamp
```
Then:
```
H = SHA256(canonical_string)
signature = Sign_Ed25519(H)
```

### STEP 7 - Send to Backend
- POST to `/api/files/upload/suspicious` including message metadata, fileSHA256, consentHash (H), signature, and scanReport
- Backend verifies signature using sender's identity public key
- If verified, creates suspicious record and enqueues anchor job for consentHash_sender

### STEP 8 - Notify Receiver
- Backend sends notification to receiver with link to txHash_sender and scan report
- Receiver can accept or reject the file

### STEP 9 - Receiver Consent
- If receiver accepts, they compute consentHash_receiver, sign it, and POST to `/suspicious/receiver-consent`
- Backend verifies receiver signature
- If verified, enqueues anchor job for consentHash_receiver

### STEP 10 - File Delivery
- Once txHash_receiver is confirmed, backend sets status=delivered
- Either unlocks encrypted file to receiver or sends encrypted blob to receiver for client-side decryption
- If receiver rejects, delete quarantine copy
- If anchoring fails after retries, notify both parties and keep in pending state