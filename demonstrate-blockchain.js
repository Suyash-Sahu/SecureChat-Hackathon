import SentryChain from './src/services/sentrychain.service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the path for the blockchain data file
const BLOCKCHAIN_DATA_PATH = path.join(__dirname, 'data', 'chain.json');

async function demonstrateBlockchain() {
    console.log('🔐 SentryChain Blockchain Demonstration');
    console.log('=====================================\n');
    
    // Backup the original chain data if it exists
    let backupChainData = null;
    if (fs.existsSync(BLOCKCHAIN_DATA_PATH)) {
        const data = fs.readFileSync(BLOCKCHAIN_DATA_PATH, 'utf8');
        backupChainData = JSON.parse(data);
    }
    
    try {
        // Create a fresh chain by removing the existing data file
        if (fs.existsSync(BLOCKCHAIN_DATA_PATH)) {
            fs.unlinkSync(BLOCKCHAIN_DATA_PATH);
        }
        
        // Reinitialize SentryChain with a fresh instance
        const { default: FreshSentryChain } = await import('./src/services/sentrychain.service.js?t=' + Date.now());
        
        console.log('1. 📦 Blockchain Initialization');
        console.log('   --------------------------');
        const chain = FreshSentryChain.getChain();
        console.log(`   Genesis block created with index: ${chain[0].index}`);
        console.log(`   Genesis block hash: ${chain[0].hash.substring(0, 16)}...`);
        console.log(`   Chain length: ${chain.length}\n`);
        
        console.log('2. ➕ Adding Blocks to Chain');
        console.log('   ----------------------');
        
        // Add first block - suspicious file
        const block1Data = {
            eventType: "FILE_QUARANTINED",
            fileHash: "sha256:a1b2c3d4e5f6...",
            fileName: "malicious-document.pdf",
            uploaderId: "user_hacker",
            conversationId: "conv_secret",
            quarantineId: "q_demo1",
            scanReport: {
                method: "PDF_STREAM_BLOCKED",
                reason: "Low entropy stream detected",
                blocked: true
            }
        };
        
        const block1 = FreshSentryChain.addBlock(block1Data);
        console.log(`   Block 1 added - Index: ${block1.index}`);
        console.log(`   File: ${block1.data.fileName}`);
        console.log(`   Hash: ${block1.hash.substring(0, 16)}...`);
        console.log(`   Previous Hash: ${block1.previousHash.substring(0, 16)}...\n`);
        
        // Add second block - another suspicious file
        const block2Data = {
            eventType: "FILE_QUARANTINED",
            fileHash: "sha256:f1e2d3c4b5a6...",
            fileName: "hidden-message.png",
            uploaderId: "user_spy",
            conversationId: "conv_covert",
            quarantineId: "q_demo2",
            scanReport: {
                method: "LSB_BLOCKED",
                reason: "LSB steganography detected",
                blocked: true
            }
        };
        
        const block2 = FreshSentryChain.addBlock(block2Data);
        console.log(`   Block 2 added - Index: ${block2.index}`);
        console.log(`   File: ${block2.data.fileName}`);
        console.log(`   Hash: ${block2.hash.substring(0, 16)}...`);
        console.log(`   Previous Hash: ${block2.previousHash.substring(0, 16)}...\n`);
        
        console.log('3. 🔍 Chain Validation');
        console.log('   -----------------');
        const validationResult = FreshSentryChain.validateChain();
        console.log(`   Chain valid: ${validationResult.valid}`);
        console.log(`   Chain length: ${validationResult.length}`);
        console.log(`   Message: ${validationResult.message}\n`);
        
        console.log('4. 📋 Retrieving Chain Data');
        console.log('   ---------------------');
        const fullChain = FreshSentryChain.getChain();
        console.log(`   Total blocks in chain: ${fullChain.length}`);
        
        // Display block details
        fullChain.forEach((block, index) => {
            if (index === 0) {
                console.log(`   Block ${index} (Genesis): ${block.data}`);
            } else {
                console.log(`   Block ${index}: ${block.data.fileName || 'N/A'} (${block.data.fileHash || 'N/A'})`);
            }
        });
        
        console.log('\n5. 🔓 Tamper Detection Demo');
        console.log('   ---------------------');
        
        // Load current chain data
        let currentChainData = null;
        if (fs.existsSync(BLOCKCHAIN_DATA_PATH)) {
            const data = fs.readFileSync(BLOCKCHAIN_DATA_PATH, 'utf8');
            currentChainData = JSON.parse(data);
        }
        
        if (currentChainData && currentChainData.chain.length > 1) {
            // Tamper with block 1
            const originalHash = currentChainData.chain[1].hash;
            currentChainData.chain[1].hash = "tampered_fake_hash";
            
            // Save tampered chain
            fs.writeFileSync(BLOCKCHAIN_DATA_PATH, JSON.stringify(currentChainData, null, 2));
            FreshSentryChain.loadChain();
            
            // Validate tampered chain
            const tamperResult = FreshSentryChain.validateChain();
            console.log(`   Tamper detection working: ${!tamperResult.valid}`);
            console.log(`   Tamper message: ${tamperResult.message}`);
            
            // Restore original hash
            currentChainData.chain[1].hash = originalHash;
            fs.writeFileSync(BLOCKCHAIN_DATA_PATH, JSON.stringify(currentChainData, null, 2));
            FreshSentryChain.loadChain();
        }
        
        console.log('\n6. ✅ Final Validation');
        console.log('   -----------------');
        const finalValidation = FreshSentryChain.validateChain();
        console.log(`   Chain valid: ${finalValidation.valid}`);
        console.log(`   Chain length: ${finalValidation.length}`);
        console.log(`   Final message: ${finalValidation.message}\n`);
        
        console.log('🎉 SentryChain Demonstration Complete!');
        console.log('   The blockchain is working correctly with:');
        console.log('   - Immutable append-only structure');
        console.log('   - SHA-256 cryptographic hashing');
        console.log('   - Tamper detection capabilities');
        console.log('   - Persistent file-based storage');
        
    } finally {
        // Restore the original chain data if we had a backup
        if (backupChainData) {
            fs.writeFileSync(BLOCKCHAIN_DATA_PATH, JSON.stringify(backupChainData, null, 2));
        } else if (fs.existsSync(BLOCKCHAIN_DATA_PATH)) {
            // If there was no backup, remove the test chain file
            fs.unlinkSync(BLOCKCHAIN_DATA_PATH);
        }
    }
}

// Run the demonstration
demonstrateBlockchain().catch(console.error);