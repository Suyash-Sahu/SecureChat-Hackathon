import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the path for the blockchain data file
const BLOCKCHAIN_DATA_PATH = path.join(__dirname, '..', '..', 'data', 'chain.json');

// File locking utilities
const lockFilePath = path.join(__dirname, '..', '..', 'data', 'chain.lock');

/**
 * Acquire a lock for blockchain operations
 * @param {number} timeout - Timeout in milliseconds
 * @returns {boolean} Whether the lock was acquired
 */
function acquireLock(timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
        try {
            // Try to create the lock file
            const fd = fs.openSync(lockFilePath, 'wx');
            fs.closeSync(fd);
            return true;
        } catch (error) {
            if (error.code === 'EEXIST') {
                // Lock file exists, wait and retry
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
                continue;
            }
            throw error;
        }
    }
    
    return false; // Timeout
}

/**
 * Release the lock
 */
function releaseLock() {
    try {
        if (fs.existsSync(lockFilePath)) {
            fs.unlinkSync(lockFilePath);
        }
    } catch (error) {
        console.error('Error releasing lock:', error);
    }
}

/**
 * SentryChain - A lightweight private blockchain for secure chat audit logging
 */
class SentryChain {
    constructor() {
        // Ensure the data directory exists
        const dataDir = path.join(__dirname, '..', '..', 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Load or initialize the blockchain
        this.chain = [];
        this.loadChain();
        
        // Create genesis block if chain is empty
        if (this.chain.length === 0) {
            this.createGenesisBlock();
        }
    }

    /**
     * Create the genesis block
     */
    createGenesisBlock() {
        const genesisBlock = {
            index: 0,
            timestamp: Date.now(),
            data: "GENESIS_BLOCK",
            previousHash: "0",
            hash: ""
        };
        
        genesisBlock.hash = this.calculateHash(genesisBlock);
        this.chain.push(genesisBlock);
        this.saveChain();
        console.log('Genesis block created');
    }

    /**
     * Calculate the SHA-256 hash of a block
     * @param {Object} block - The block to hash
     * @returns {string} The hash of the block
     */
    calculateHash(block) {
        const dataString = typeof block.data === 'string' ? block.data : JSON.stringify(block.data);
        const hashInput = block.index + block.timestamp + dataString + block.previousHash;
        return crypto.createHash('sha256').update(hashInput).digest('hex');
    }

    /**
     * Get the latest block in the chain
     * @returns {Object} The latest block
     */
    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    /**
     * Add a new block to the blockchain with concurrency protection
     * @param {Object} data - The data to store in the block
     * @returns {Object} The newly created block
     */
    addBlock(data) {
        // Acquire lock before writing to blockchain
        const lockAcquired = acquireLock();
        if (!lockAcquired) {
            throw new Error('Timeout while acquiring blockchain lock');
        }
        
        try {
            // Reload chain to ensure we have the latest state
            this.loadChain();
            
            const previousBlock = this.getLatestBlock();
            const newBlock = {
                index: previousBlock.index + 1,
                timestamp: Date.now(),
                data: data,
                previousHash: previousBlock.hash,
                hash: ""
            };
            
            newBlock.hash = this.calculateHash(newBlock);
            this.chain.push(newBlock);
            this.saveChain();
            
            return newBlock;
        } finally {
            // Always release the lock
            releaseLock();
        }
    }

    /**
     * Validate the integrity of the blockchain
     * @returns {Object} Validation result with validity status and message
     */
    validateChain() {
        // Acquire lock for reading
        const lockAcquired = acquireLock(1000); // Short timeout for read operations
        if (!lockAcquired) {
            // If we can't acquire lock quickly, proceed with current chain state
            console.warn('Could not acquire lock for validation, using current chain state');
        }
        
        try {
            // Reload chain to ensure we have the latest state for validation
            this.loadChain();
            
            // Check genesis block
            if (this.chain.length === 0) {
                return { valid: false, message: "Chain is empty" };
            }

            const genesisBlock = this.chain[0];
            if (genesisBlock.index !== 0 || 
                genesisBlock.previousHash !== "0" || 
                genesisBlock.hash !== this.calculateHash(genesisBlock)) {
                return { valid: false, message: "Invalid genesis block" };
            }

            // Check each block in the chain
            for (let i = 1; i < this.chain.length; i++) {
                const currentBlock = this.chain[i];
                const previousBlock = this.chain[i - 1];

                // Validate hash integrity
                if (currentBlock.hash !== this.calculateHash(currentBlock)) {
                    return { 
                        valid: false, 
                        message: `Invalid hash at block ${i}`,
                        blockIndex: i
                    };
                }

                // Validate chain linkage
                if (currentBlock.previousHash !== previousBlock.hash) {
                    return { 
                        valid: false, 
                        message: `Invalid previous hash at block ${i}`,
                        blockIndex: i
                    };
                }

                // Validate required fields
                if (!currentBlock.index || !currentBlock.timestamp || !currentBlock.data || 
                    !currentBlock.previousHash || !currentBlock.hash) {
                    return { 
                        valid: false, 
                        message: `Missing fields at block ${i}`,
                        blockIndex: i
                    };
                }
            }

            return { 
                valid: true, 
                message: `Chain valid up to block ${this.chain.length - 1}`,
                length: this.chain.length
            };
        } catch (error) {
            console.error('Error during chain validation:', error);
            return { 
                valid: false, 
                message: `Validation error: ${error.message}`
            };
        } finally {
            // Release lock if we acquired it
            if (lockAcquired) {
                releaseLock();
            }
        }
    }

    /**
     * Get the full blockchain
     * @returns {Array} The complete blockchain
     */
    getChain() {
        // Reload chain to ensure we have the latest state
        this.loadChain();
        return this.chain;
    }

    /**
     * Get a specific block by index
     * @param {number} index - The index of the block to retrieve
     * @returns {Object|null} The block at the specified index or null if not found
     */
    getBlockByIndex(index) {
        // Reload chain to ensure we have the latest state
        this.loadChain();
        
        if (index >= 0 && index < this.chain.length) {
            return this.chain[index];
        }
        return null;
    }

    /**
     * Save the blockchain to a file with concurrency protection
     */
    saveChain() {
        try {
            fs.writeFileSync(BLOCKCHAIN_DATA_PATH, JSON.stringify({ chain: this.chain }, null, 2));
        } catch (error) {
            console.error('Error saving blockchain:', error);
            throw error;
        }
    }

    /**
     * Load the blockchain from a file
     */
    loadChain() {
        try {
            if (fs.existsSync(BLOCKCHAIN_DATA_PATH)) {
                const data = fs.readFileSync(BLOCKCHAIN_DATA_PATH, 'utf8');
                const parsed = JSON.parse(data);
                this.chain = parsed.chain || [];
            }
        } catch (error) {
            console.error('Error loading blockchain:', error);
            this.chain = [];
        }
    }
}

export default new SentryChain();