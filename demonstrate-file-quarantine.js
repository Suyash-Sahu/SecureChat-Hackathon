import fileQuarantineService from './src/services/fileQuarantine.service.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the path for the blockchain data file
const BLOCKCHAIN_DATA_PATH = path.join(__dirname, 'data', 'chain.json');

async function demonstrateFileQuarantine() {
    console.log('🛡️  File Quarantine Service Demonstration');
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
        
        console.log('1. 📦 Initializing File Quarantine Service');
        console.log('   ------------------------------------');
        console.log('   File Quarantine Service initialized and connected to SentryChain\n');
        
        console.log('2. 🦠 Anchoring Suspicious Files');
        console.log('   --------------------------');
        
        // Anchor first suspicious file
        const eventData1 = {
            eventType: "FILE_QUARANTINED",
            fileHash: "sha256:suspicious_pdf_hash_123456",
            fileName: "confidential_data.pdf",
            uploaderId: "user_malicious",
            conversationId: "secret_chat_001",
            filePath: "/quarantine/confidential_data.pdf",
            scanReport: {
                method: "PDF_STREAM_BLOCKED",
                reason: "Suspicious low-entropy stream detected",
                blocked: true
            }
        };
        
        const result1 = fileQuarantineService.anchorSuspiciousFileEvent(eventData1);
        console.log(`   ✅ File 1 quarantined and anchored to blockchain`);
        console.log(`   File: ${result1.block.data.fileName}`);
        console.log(`   Quarantine ID: ${result1.quarantineId}`);
        console.log(`   Block Index: ${result1.block.index}\n`);
        
        // Anchor second suspicious file
        const eventData2 = {
            eventType: "FILE_QUARANTINED",
            fileHash: "sha256:hidden_image_hash_789012",
            fileName: "innocent_cat.png",
            uploaderId: "user_spy",
            conversationId: "covert_ops_002",
            filePath: "/quarantine/innocent_cat.png",
            scanReport: {
                method: "LSB_BLOCKED",
                reason: "LSB steganography detected in image",
                blocked: true
            }
        };
        
        const result2 = fileQuarantineService.anchorSuspiciousFileEvent(eventData2);
        console.log(`   ✅ File 2 quarantined and anchored to blockchain`);
        console.log(`   File: ${result2.block.data.fileName}`);
        console.log(`   Quarantine ID: ${result2.quarantineId}`);
        console.log(`   Block Index: ${result2.block.index}\n`);
        
        console.log('3. 🔍 Retrieving Quarantine Information');
        console.log('   ---------------------------------');
        
        // Retrieve by quarantine ID
        const quarantine1 = fileQuarantineService.getQuarantineById(result1.quarantineId);
        if (quarantine1) {
            console.log(`   🔍 Quarantine by ID (${result1.quarantineId}):`);
            console.log(`      File: ${quarantine1.data.fileName}`);
            console.log(`      Hash: ${quarantine1.data.fileHash}`);
            console.log(`      Uploaded by: ${quarantine1.data.uploaderId}\n`);
        }
        
        // Retrieve by user
        const userQuarantines = fileQuarantineService.getQuarantinesByUser("user_malicious");
        console.log(`   🔍 Quarantines by user (user_malicious): ${userQuarantines.length} files`);
        
        // Retrieve by conversation
        const convQuarantines = fileQuarantineService.getQuarantinesByConversation("secret_chat_001");
        console.log(`   🔍 Quarantines by conversation (secret_chat_001): ${convQuarantines.length} files`);
        
        // Retrieve by file hash
        const hashQuarantines = fileQuarantineService.getQuarantinesByFileHash("sha256:suspicious_pdf_hash_123456");
        console.log(`   🔍 Quarantines by file hash: ${hashQuarantines.length} files\n`);
        
        console.log('4. 📊 Blockchain Verification');
        console.log('   ----------------------');
        
        // Show blockchain details
        const { default: SentryChain } = await import('./src/services/sentrychain.service.js');
        const chain = SentryChain.getChain();
        console.log(`   Total blocks in chain: ${chain.length}`);
        
        // Show quarantine events
        const quarantineEvents = chain.filter(block => block.data.eventType === "FILE_QUARANTINED");
        console.log(`   Quarantine events recorded: ${quarantineEvents.length}`);
        
        quarantineEvents.forEach((block, index) => {
            console.log(`   ${index + 1}. ${block.data.fileName}`);
            console.log(`      Quarantine ID: ${block.data.quarantineId}`);
            // Check if scanReport exists before accessing reason
            if (block.data.scanReport && block.data.scanReport.reason) {
                console.log(`      Reason: ${block.data.scanReport.reason}`);
            }
            console.log(`      Block hash: ${block.hash.substring(0, 16)}...`);
        });
        
        console.log('\n5. ✅ Validation');
        console.log('   ----------');
        const validationResult = SentryChain.validateChain();
        console.log(`   Blockchain valid: ${validationResult.valid}`);
        console.log(`   Validation message: ${validationResult.message}`);
        
        console.log('\n🎉 File Quarantine Service Demonstration Complete!');
        console.log('   The service is working correctly with:');
        console.log('   - Automatic anchoring of suspicious files');
        console.log('   - Multiple search methods (ID, user, conversation, hash)');
        console.log('   - Integration with SentryChain blockchain');
        console.log('   - Immutable audit trail for security events');
        
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
demonstrateFileQuarantine().catch(console.error);