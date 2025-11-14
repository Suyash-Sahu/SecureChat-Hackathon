import fileQuarantineService from './src/services/fileQuarantine.service.js';
import sentryChain from './src/services/sentrychain.service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the path for the blockchain data file
const BLOCKCHAIN_DATA_PATH = path.join(__dirname, 'data', 'chain.json');

async function testFileQuarantineService() {
    console.log('🧪 Testing File Quarantine Service with SentryChain (clean chain)...\n');
    
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
        
        // Test 1: Anchor a suspicious file event
        console.log('1. Anchoring a suspicious file event...');
        const eventData = {
            eventType: "FILE_QUARANTINED",
            fileHash: "sha256:a1b2c3d4e5f6...",
            fileName: "suspicious-document.pdf",
            uploaderId: "user_123",
            conversationId: "conv_456",
            filePath: "/quarantine/suspicious-document.pdf",
            scanReport: {
                method: "PDF_STREAM_BLOCKED",
                reason: "Low entropy stream detected",
                blocked: true
            }
        };
        
        try {
            const result = fileQuarantineService.anchorSuspiciousFileEvent(eventData);
            console.log(`   ✅ Event anchored successfully`);
            console.log(`   Block index: ${result.block.index}`);
            console.log(`   Quarantine ID: ${result.quarantineId}`);
        } catch (error) {
            console.log(`   ❌ Error anchoring event: ${error.message}`);
        }
        
        // Test 2: Anchor another suspicious file event
        console.log('\n2. Anchoring another suspicious file event...');
        const eventData2 = {
            eventType: "FILE_QUARANTINED",
            fileHash: "sha256:f1e2d3c4b5a6...",
            fileName: "hidden-message.png",
            uploaderId: "user_123",
            conversationId: "conv_789",
            filePath: "/quarantine/hidden-message.png",
            scanReport: {
                method: "LSB_BLOCKED",
                reason: "LSB steganography detected",
                blocked: true
            }
        };
        
        try {
            const result2 = fileQuarantineService.anchorSuspiciousFileEvent(eventData2);
            console.log(`   ✅ Event anchored successfully`);
            console.log(`   Block index: ${result2.block.index}`);
            console.log(`   Quarantine ID: ${result2.quarantineId}`);
        } catch (error) {
            console.log(`   ❌ Error anchoring event: ${error.message}`);
        }
        
        // Test 3: Retrieve quarantine by ID
        console.log('\n3. Retrieving quarantine by ID...');
        const quarantines = FreshSentryChain.getChain().filter(block => block.data.eventType === "FILE_QUARANTINED");
        if (quarantines.length > 0) {
            const quarantineId = quarantines[0].data.quarantineId;
            const quarantine = fileQuarantineService.getQuarantineById(quarantineId);
            if (quarantine) {
                console.log(`   ✅ Quarantine found by ID: ${quarantineId}`);
                console.log(`   File name: ${quarantine.data.fileName}`);
                console.log(`   File hash: ${quarantine.data.fileHash}`);
            } else {
                console.log(`   ❌ Quarantine not found by ID: ${quarantineId}`);
            }
        } else {
            console.log('   ❌ No quarantine events found to test');
        }
        
        // Test 4: Retrieve quarantines by user
        console.log('\n4. Retrieving quarantines by user...');
        const userQuarantines = fileQuarantineService.getQuarantinesByUser("user_123");
        console.log(`   Found ${userQuarantines.length} quarantine events for user user_123`);
        
        // Test 5: Retrieve quarantines by conversation
        console.log('\n5. Retrieving quarantines by conversation...');
        const convQuarantines = fileQuarantineService.getQuarantinesByConversation("conv_456");
        console.log(`   Found ${convQuarantines.length} quarantine events for conversation conv_456`);
        
        // Test 6: Retrieve quarantines by file hash
        console.log('\n6. Retrieving quarantines by file hash...');
        const hashQuarantines = fileQuarantineService.getQuarantinesByFileHash("sha256:a1b2c3d4e5f6...");
        console.log(`   Found ${hashQuarantines.length} quarantine events for file hash sha256:a1b2c3d4e5f6...`);
        
        // Test 7: Validate the chain
        console.log('\n7. Validating the blockchain...');
        const validationResult = FreshSentryChain.validateChain();
        console.log(`   Chain valid: ${validationResult.valid}`);
        if (validationResult.length !== undefined) {
            console.log(`   Chain length: ${validationResult.length}`);
        }
        console.log(`   Validation message: ${validationResult.message}`);
        
        // Test 8: Retrieve full chain
        console.log('\n8. Retrieving full blockchain...');
        const chain = FreshSentryChain.getChain();
        console.log(`   Full chain length: ${chain.length}`);
        
        // Display summary of quarantined files
        console.log('\n📋 Summary of quarantined files:');
        const quarantineEvents = chain.filter(block => block.data.eventType === "FILE_QUARANTINED");
        if (quarantineEvents.length > 0) {
            quarantineEvents.forEach((block, index) => {
                console.log(`   ${index + 1}. ${block.data.fileName} (${block.data.fileHash})`);
                console.log(`      Uploaded by: ${block.data.uploaderId}`);
                console.log(`      Conversation: ${block.data.conversationId}`);
                console.log(`      Quarantine ID: ${block.data.quarantineId}`);
                // Check if scanReport exists before accessing reason
                if (block.data.scanReport) {
                    console.log(`      Reason: ${block.data.scanReport.reason}`);
                }
                console.log(`      Block index: ${block.index}`);
                console.log('');
            });
        } else {
            console.log('   No quarantine events found in the blockchain');
        }
        
        console.log('✅ File Quarantine Service tests completed successfully!');
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

// Run the tests
testFileQuarantineService().catch(console.error);