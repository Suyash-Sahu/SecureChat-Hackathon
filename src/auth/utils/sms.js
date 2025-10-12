// Email OTP service using Nodemailer with Gmail SMTP
import nodemailer from 'nodemailer';

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // Use Gmail App Password
    },
});

export async function sendEmailOtp({ to, otp, username }) {
    if (!to || !otp) {
        throw new Error('Email OTP: missing email or OTP');
    }

    try {
        const mailOptions = {
            from: `"Secure Chat Network" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: 'Your Email Verification Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">Secure Chat Network</h1>
                        <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Email Verification</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <h2 style="color: #333; margin-bottom: 20px;">Hello ${username || 'User'}!</h2>
                        
                        <p style="color: #666; font-size: 16px; line-height: 1.6;">
                            Thank you for registering with Secure Chat Network. To complete your registration, 
                            please use the verification code below:
                        </p>
                        
                        <div style="background: #f8f9fa; border: 2px dashed #667eea; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px;">
                            <h1 style="color: #667eea; font-size: 36px; margin: 0; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                                ${otp}
                            </h1>
                        </div>
                        
                        <p style="color: #666; font-size: 14px; margin-top: 20px;">
                            <strong>Important:</strong> This code will expire in 5 minutes for security reasons.
                        </p>
                        
                        <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                            If you didn't request this verification code, please ignore this email.
                        </p>
                    </div>
                </div>
            `,
            text: `
                Secure Chat Network - Email Verification
                
                Hello ${username || 'User'}!
                
                Your verification code is: ${otp}
                
                This code will expire in 5 minutes.
                
                If you didn't request this verification code, please ignore this email.
            `
        };

        const result = await transporter.sendMail(mailOptions);
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


