import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import anchoringService from './src/services/anchoring.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
if (join(__dirname, '.env')) {
    dotenv.config();
    console.log('✅ Loaded environment variables from .env');
}

// Test the blockchain integration
async function testBlockchain() {
    console.log('Testing blockchain integration...\n');
    
    // Check if service is configured
    const walletAddress = anchoringService.getWalletAddress();
    if (!walletAddress) {
        console.log('❌ Wallet not configured. Please set RPC_URL and PRIVATE_KEY in .env');
        return;
    }
    
    console.log(`✅ Wallet configured: ${walletAddress}`);
    
    // Get network info
    try {
        const networkInfo = await anchoringService.getNetworkInfo();
        if (networkInfo) {
            console.log(`🌐 Network: ${networkInfo.name} (Chain ID: ${networkInfo.chainId})`);
            console.log(`💰 Balance: ${networkInfo.balance} ETH`);
        }
    } catch (error) {
        console.log('❌ Failed to get network info:', error.message);
    }
    
    // Test anchoring (only if contract is configured)
    if (process.env.CONTRACT_ADDRESS) {
        try {
            console.log('\n🧪 Testing consent anchoring...');
            
            // Generate a test hash
            const testHash = '0x' + 'a'.repeat(64); // 32 bytes hex string
            const role = 'sender';
            const messageId = 'test-message-123';
            
            console.log(`   Hash: ${testHash}`);
            console.log(`   Role: ${role}`);
            console.log(`   Message ID: ${messageId}`);
            
            // Anchor the consent
            const result = await anchoringService.anchorConsent(testHash, role, messageId);
            console.log(`✅ Consent anchored successfully!`);
            console.log(`   Transaction: ${result.txHash}`);
            console.log(`   Block: ${result.blockNumber}`);
            
            // Verify the anchor
            console.log('\n🔍 Verifying anchor...');
            const isVerified = await anchoringService.verifyAnchor(result.txHash, testHash);
            if (isVerified) {
                console.log('✅ Anchor verified successfully!');
            } else {
                console.log('❌ Anchor verification failed');
            }
            
        } catch (error) {
            console.log('❌ Blockchain test failed:', error.message);
        }
    } else {
        console.log('\n⚠️  Contract not configured. Set CONTRACT_ADDRESS in .env to test anchoring.');
    }
}

// Run the test
testBlockchain().catch(console.error);