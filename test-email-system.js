import { sendEmail, getEmailQueueStatus } from './src/auth/utils/enhanced-mail.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
if (existsSync(join(__dirname, '.env'))) {
    dotenv.config();
    console.log('✅ Loaded environment variables from .env');
}

// Test the enhanced email system
async function testEmailSystem() {
    console.log('Testing enhanced email system...\n');
    
    // Check if email credentials are configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.log('❌ Email credentials not configured. Please set EMAIL_USER and EMAIL_PASS environment variables.');
        return;
    }
    
    console.log(`📧 Email user configured: ${process.env.EMAIL_USER}`);
    
    try {
        // Send test emails with different priorities
        console.log('\n📨 Sending test emails...');
        
        // Send normal priority email
        const email1 = sendEmail({
            email: process.env.EMAIL_USER,
            subject: 'Test Email - Normal Priority',
            mailgenContent: {
                body: {
                    name: 'Test User',
                    intro: 'This is a test email with normal priority.',
                    outro: 'This email was sent to test the enhanced email system.'
                }
            }
        });
        
        // Send high priority email
        const email2 = sendEmail({
            email: process.env.EMAIL_USER,
            subject: 'Test Email - High Priority',
            mailgenContent: {
                body: {
                    name: 'Test User',
                    intro: 'This is a test email with high priority.',
                    outro: 'This email was sent to test the enhanced email system.'
                }
            }
        }, 1);
        
        // Wait for emails to be sent
        await Promise.allSettled([email1, email2]);
        
        console.log('\n✅ Test emails sent successfully!');
        
        // Check queue status
        const status = getEmailQueueStatus();
        console.log('\n📊 Email Queue Status:');
        console.log(`   Queued: ${status.queued}`);
        console.log(`   Processing: ${status.processing}`);
        console.log(`   Sent: ${status.stats.sent}`);
        console.log(`   Failed: ${status.stats.failed}`);
        
        if (status.stats.lastError) {
            console.log(`   Last Error: ${status.stats.lastError.error} (${status.stats.lastError.timestamp})`);
        }
        
    } catch (error) {
        console.error('❌ Error testing email system:', error.message);
    }
}

// Run the test
testEmailSystem().catch(console.error);