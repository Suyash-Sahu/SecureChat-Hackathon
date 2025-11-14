import sentryChain from './sentrychain.service.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * FileQuarantineService - Service for handling quarantined files and anchoring events to SentryChain
 */
class FileQuarantineService {
    /**
     * Anchor a suspicious file event to the SentryChain blockchain
     * @param {Object} eventData - The event data to anchor
     * @param {string} eventData.eventType - Type of event (e.g., "FILE_QUARANTINED")
     * @param {string} eventData.fileHash - SHA-256 hash of the file
     * @param {string} eventData.fileName - Original name of the file
     * @param {string} eventData.uploaderId - ID of the user who uploaded the file
     * @param {string} eventData.conversationId - ID of the conversation
     * @param {string} eventData.filePath - Path to the quarantined file
     * @param {Object} eventData.scanReport - Report from the steganography scanner
     * @returns {Object} The newly created block
     */
    anchorSuspiciousFileEvent(eventData) {
        try {
            // Generate a unique quarantine ID
            const quarantineId = `q_${uuidv4().substring(0, 8)}`;
            
            // Prepare the block data according to PRD specification
            const blockData = {
                eventType: eventData.eventType || "FILE_QUARANTINED",
                fileHash: eventData.fileHash,
                fileName: eventData.fileName,
                uploaderId: eventData.uploaderId,
                conversationId: eventData.conversationId,
                quarantineId: quarantineId,
                scanReport: eventData.scanReport,
                timestamp: Date.now()
            };
            
            // Add the block to the SentryChain
            const newBlock = sentryChain.addBlock(blockData);
            
            console.log(`✅ Suspicious file event anchored to blockchain - Block Index: ${newBlock.index}`);
            
            return {
                block: newBlock,
                quarantineId: quarantineId
            };
        } catch (error) {
            console.error('❌ Error anchoring suspicious file event:', error);
            throw new Error(`Failed to anchor suspicious file event: ${error.message}`);
        }
    }
    
    /**
     * Get quarantine information by quarantine ID
     * @param {string} quarantineId - The quarantine ID to search for
     * @returns {Object|null} The block containing the quarantine information or null if not found
     */
    getQuarantineById(quarantineId) {
        try {
            const chain = sentryChain.getChain();
            
            // Search through the chain for a block with the matching quarantineId
            for (let i = 1; i < chain.length; i++) { // Start from 1 to skip genesis block
                const block = chain[i];
                if (block.data.quarantineId === quarantineId) {
                    return block;
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error retrieving quarantine information:', error);
            return null;
        }
    }
    
    /**
     * Get all quarantine events for a specific user
     * @param {string} uploaderId - The user ID to search for
     * @returns {Array} Array of blocks containing quarantine events for the user
     */
    getQuarantinesByUser(uploaderId) {
        try {
            const chain = sentryChain.getChain();
            const quarantines = [];
            
            // Search through the chain for blocks with matching uploaderId
            for (let i = 1; i < chain.length; i++) { // Start from 1 to skip genesis block
                const block = chain[i];
                if (block.data.uploaderId === uploaderId && block.data.eventType === "FILE_QUARANTINED") {
                    quarantines.push(block);
                }
            }
            
            return quarantines;
        } catch (error) {
            console.error('Error retrieving user quarantines:', error);
            return [];
        }
    }
    
    /**
     * Get all quarantine events for a specific conversation
     * @param {string} conversationId - The conversation ID to search for
     * @returns {Array} Array of blocks containing quarantine events for the conversation
     */
    getQuarantinesByConversation(conversationId) {
        try {
            const chain = sentryChain.getChain();
            const quarantines = [];
            
            // Search through the chain for blocks with matching conversationId
            for (let i = 1; i < chain.length; i++) { // Start from 1 to skip genesis block
                const block = chain[i];
                if (block.data.conversationId === conversationId && block.data.eventType === "FILE_QUARANTINED") {
                    quarantines.push(block);
                }
            }
            
            return quarantines;
        } catch (error) {
            console.error('Error retrieving conversation quarantines:', error);
            return [];
        }
    }
    
    /**
     * Search for quarantine events by file hash
     * @param {string} fileHash - The file hash to search for
     * @returns {Array} Array of blocks containing quarantine events with the file hash
     */
    getQuarantinesByFileHash(fileHash) {
        try {
            const chain = sentryChain.getChain();
            const quarantines = [];
            
            // Search through the chain for blocks with matching fileHash
            for (let i = 1; i < chain.length; i++) { // Start from 1 to skip genesis block
                const block = chain[i];
                if (block.data.fileHash === fileHash && block.data.eventType === "FILE_QUARANTINED") {
                    quarantines.push(block);
                }
            }
            
            return quarantines;
        } catch (error) {
            console.error('Error retrieving file hash quarantines:', error);
            return [];
        }
    }
}

export default new FileQuarantineService();