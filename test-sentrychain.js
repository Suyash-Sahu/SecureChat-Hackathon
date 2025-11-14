import SentryChain from './src/services/sentrychain.service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the path for the blockchain data file
const BLOCKCHAIN_DATA_PATH = path.join(__dirname, 'data', 'chain.json');

async function testSentryChain() {
    console.log('🧪 Testing SentryChain implementation...\n');
    
    // Backup the original chain data
    let backupChainData = null;
    if (fs.existsSync(BLOCKCHAIN_DATA_PATH)) {
        const data = fs.readFileSync(BLOCKCHAIN_DATA_PATH, 'utf8');
        backupChainData = JSON.parse(data);
    }
    
    try {
        // Test 1: Check if chain is initialized with genesis block
        console.log('1. Checking chain initialization...');
        const chain = SentryChain.getChain();
        console.log(`   Chain length: ${chain.length}`);
        console.log(`   Genesis block exists: ${chain.length > 0}`);
        
        if (chain.length > 0) {
            const genesisBlock = chain[0];
            console.log(`   Genesis block index: ${genesisBlock.index}`);
            console.log(`   Genesis block data: ${genesisBlock.data}`);
            console.log(`   Genesis block hash: ${genesisBlock.hash}`);
        }
        
        // Test 2: Add a sample block
        console.log('\n2. Adding a sample block...');
        const sampleData = {
            eventType: "FILE_QUARANTINED",
            fileHash: "sha256:abcd1234...",
            fileName: "suspicious-image.png",
            uploaderId: "user_21",
            conversationId: "c_54",
            quarantineId: "q_77"
        };
        
        try {
            const newBlock = SentryChain.addBlock(sampleData);
            console.log(`   ✅ Added block with index: ${newBlock.index}`);
            console.log(`   Block hash: ${newBlock.hash}`);
            console.log(`   Previous hash: ${newBlock.previousHash}`);
        } catch (error) {
            console.log(`   ❌ Error adding block: ${error.message}`);
        }
        
        // Test 3: Validate the chain
        console.log('\n3. Validating the chain...');
        const validationResult = SentryChain.validateChain();
        console.log(`   Chain valid: ${validationResult.valid}`);
        console.log(`   Validation message: ${validationResult.message}`);
        
        // Test 4: Retrieve specific block
        console.log('\n4. Retrieving specific block...');
        const block = SentryChain.getBlockByIndex(1);
        if (block) {
            console.log(`   ✅ Retrieved block index: ${block.index}`);
            console.log(`   Block data: ${JSON.stringify(block.data)}`);
        } else {
            console.log('   Block not found');
        }
        
        // Test 5: Get full chain
        console.log('\n5. Retrieving full chain...');
        const fullChain = SentryChain.getChain();
        console.log(`   Full chain length: ${fullChain.length}`);
        
        // Test 6: Tamper with chain and validate
        console.log('\n6. Testing tamper detection...');
        if (fullChain.length > 1) {
            // Load the current chain data
            let currentChainData = null;
            if (fs.existsSync(BLOCKCHAIN_DATA_PATH)) {
                const data = fs.readFileSync(BLOCKCHAIN_DATA_PATH, 'utf8');
                currentChainData = JSON.parse(data);
            }
            
            if (currentChainData) {
                // Temporarily modify a block to test validation
                const originalHash = currentChainData.chain[1].hash;
                currentChainData.chain[1].hash = "tampered_hash";
                
                // Save the tampered chain
                try {
                    fs.writeFileSync(BLOCKCHAIN_DATA_PATH, JSON.stringify(currentChainData, null, 2));
                    
                    // Reload the chain in SentryChain to reflect the tampering
                    SentryChain.loadChain();
                    
                    const tamperValidation = SentryChain.validateChain();
                    console.log(`   Tamper detection working: ${!tamperValidation.valid}`);
                    console.log(`   Tamper message: ${tamperValidation.message}`);
                } catch (error) {
                    console.log(`   Error during tamper test: ${error.message}`);
                }
                
                // Restore the original hash
                currentChainData.chain[1].hash = originalHash;
                fs.writeFileSync(BLOCKCHAIN_DATA_PATH, JSON.stringify(currentChainData, null, 2));
                
                // Reload the chain in SentryChain to reflect the restoration
                SentryChain.loadChain();
            }
        }
        
        // Test 7: Test concurrency with multiple blocks
        console.log('\n7. Testing concurrent block additions...');
        for (let i = 0; i < 5; i++) {
            const testData = {
                eventType: "FILE_QUARANTINED",
                fileHash: `sha256:concurrent_${i}...`,
                fileName: `concurrent-file-${i}.png`,
                uploaderId: "user_concurrent",
                conversationId: "c_concurrent"
            };
            
            // Add blocks synchronously to test concurrency protection
            try {
                const block = SentryChain.addBlock(testData);
                console.log(`   ✅ Added concurrent block ${i} with index: ${block.index}`);
            } catch (error) {
                console.log(`   ❌ Error adding concurrent block ${i}: ${error.message}`);
            }
        }
        
        // Final validation
        console.log('\n8. Final chain validation...');
        const finalValidation = SentryChain.validateChain();
        console.log(`   Final chain valid: ${finalValidation.valid}`);
        if (finalValidation.length !== undefined) {
            console.log(`   Final chain length: ${finalValidation.length}`);
        }
        console.log(`   Final validation message: ${finalValidation.message}`);
        
        console.log('\n✅ SentryChain tests completed!');
    } finally {
        // Restore the original chain data if we had a backup
        if (backupChainData) {
            fs.writeFileSync(BLOCKCHAIN_DATA_PATH, JSON.stringify(backupChainData, null, 2));
            SentryChain.loadChain();
        }
    }
}

// Run the tests
testSentryChain().catch(console.error);