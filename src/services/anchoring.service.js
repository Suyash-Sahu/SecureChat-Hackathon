import { ethers } from 'ethers';
import Anchor from '../models/anchor.models.js';
import SuspiciousFile from '../models/suspiciousFile.models.js';

// Contract ABI (simplified)
const CONTRACT_ABI = [
    {
        "anonymous": false,
        "inputs": [
            {
                "indexed": false,
                "internalType": "bytes32",
                "name": "hashValue",
                "type": "bytes32"
            },
            {
                "indexed": false,
                "internalType": "uint8",
                "name": "role",
                "type": "uint8"
            },
            {
                "indexed": false,
                "internalType": "uint256",
                "name": "timestamp",
                "type": "uint256"
            }
        ],
        "name": "ConsentStored",
        "type": "event"
    },
    {
        "inputs": [
            {
                "internalType": "bytes32",
                "name": "hashValue",
                "type": "bytes32"
            },
            {
                "internalType": "uint8",
                "name": "role",
                "type": "uint8"
            }
        ],
        "name": "storeConsent",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

class AnchoringService {
    constructor() {
        // Load configuration from environment variables
        this.rpcUrl = process.env.RPC_URL || 'https://polygon-amoy.g.alchemy.com/v2/demo';
        this.privateKey = process.env.PRIVATE_KEY;
        this.contractAddress = process.env.CONTRACT_ADDRESS;
        
        // Initialize provider and wallet
        if (this.rpcUrl && this.privateKey) {
            this.provider = new ethers.providers.JsonRpcProvider(this.rpcUrl);
            this.wallet = new ethers.Wallet(this.privateKey, this.provider);
            console.log('Blockchain service initialized with RPC:', this.rpcUrl);
        } else {
            console.warn('Blockchain service not fully configured - RPC_URL and PRIVATE_KEY required');
        }
        
        // Initialize contract if address is provided
        if (this.contractAddress && this.wallet) {
            this.contract = new ethers.Contract(this.contractAddress, CONTRACT_ABI, this.wallet);
            console.log('Contract initialized at:', this.contractAddress);
        }
    }

    /**
     * Anchor a consent hash to the blockchain
     * @param {string} consentHash - The SHA256 hash of the consent string (0x prefixed hex)
     * @param {string} role - Either 'sender' or 'receiver'
     * @param {string} relatedMessageId - The ID of the related message
     * @returns {Object} Transaction details
     */
    async anchorConsent(consentHash, role, relatedMessageId) {
        try {
            if (!this.contract) {
                throw new Error('Blockchain service not properly configured');
            }

            // Convert role to uint8 (0 = sender, 1 = receiver)
            const roleInt = role === 'sender' ? 0 : 1;
            
            // Convert consentHash to bytes32
            const hashBytes32 = ethers.utils.hexZeroPad(consentHash, 32);
            
            console.log(`Anchoring consent hash ${consentHash} for role ${role} (${roleInt})`);
            
            // Call the contract function
            const tx = await this.contract.storeConsent(hashBytes32, roleInt);
            
            // Wait for transaction confirmation
            const receipt = await tx.wait();
            
            console.log(`Transaction confirmed: ${tx.hash}`);
            
            return {
                txHash: tx.hash,
                blockNumber: receipt.blockNumber,
                status: 'confirmed'
            };
        } catch (error) {
            console.error('Anchoring error:', error);
            throw new Error(`Failed to anchor consent to blockchain: ${error.message}`);
        }
    }

    /**
     * Verify an anchor by transaction hash
     * @param {string} txHash - Transaction hash
     * @param {string} expectedHash - Expected consent hash (0x prefixed hex)
     * @returns {boolean} Whether the anchor is valid
     */
    async verifyAnchor(txHash, expectedHash) {
        try {
            if (!this.provider) {
                throw new Error('Blockchain service not properly configured');
            }

            // Fetch the transaction receipt
            const receipt = await this.provider.getTransactionReceipt(txHash);
            
            if (!receipt) {
                console.log(`Transaction ${txHash} not found`);
                return false;
            }
            
            // Parse logs to find ConsentStored event
            const iface = new ethers.utils.Interface(CONTRACT_ABI);
            
            for (const log of receipt.logs) {
                try {
                    const parsedLog = iface.parseLog(log);
                    if (parsedLog.name === 'ConsentStored') {
                        const hashValue = parsedLog.args.hashValue;
                        // Compare with expected hash
                        if (hashValue.toLowerCase() === expectedHash.toLowerCase()) {
                            console.log(`Verified anchor ${txHash} for hash ${expectedHash}`);
                            return true;
                        }
                    }
                } catch (e) {
                    // Not our event, continue
                    continue;
                }
            }
            
            console.log(`No matching ConsentStored event found in transaction ${txHash}`);
            return false;
        } catch (error) {
            console.error('Verification error:', error);
            return false;
        }
    }
    
    /**
     * Get the current wallet address
     * @returns {string} Wallet address
     */
    getWalletAddress() {
        return this.wallet ? this.wallet.address : null;
    }
    
    /**
     * Get network information
     * @returns {Object} Network information
     */
    async getNetworkInfo() {
        if (!this.provider) return null;
        
        try {
            const network = await this.provider.getNetwork();
            const balance = this.wallet ? await this.provider.getBalance(this.wallet.address) : null;
            
            return {
                chainId: network.chainId,
                name: network.name,
                balance: balance ? ethers.utils.formatEther(balance) : null
            };
        } catch (error) {
            console.error('Network info error:', error);
            return null;
        }
    }
}

export default new AnchoringService();