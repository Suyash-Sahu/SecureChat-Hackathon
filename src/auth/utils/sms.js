// Email OTP service using the shared Nodemailer transporter
import { sendEmail, emailVerificationMailContent } from './mail.js';

export async function sendEmailOtp({ to, otp, username }) {
    if (!to || !otp) {
        throw new Error('Email OTP: missing email or OTP');
    }

    try {
        // Use the shared email sending function with proper content
        const emailContent = {
            email: to,
            subject: 'Your Email Verification Code',
            mailgenContent: emailVerificationMailContent(
                username || 'User',
                otp // Pass only the OTP, not a verification URL
            )
        };

        const result = await sendEmail(emailContent);
        console.log(`[EMAIL OTP] Sent to ${to} - Message ID: ${result.messageId}`);
        
        return { 
            success: true, 
            messageId: result.messageId 
        };
        
    } catch (error) {
        console.error('[EMAIL OTP] Error:', error);
        throw new Error(`Failed to send email OTP: ${error.message}`);
    }
}