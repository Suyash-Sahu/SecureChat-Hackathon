import Mailgen from "mailgen";
import nodemailer from "nodemailer";

// Create a single transporter instance
let transporter;
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      },
      pool: true, // Use pooled connections
      maxConnections: 5, // Maximum number of simultaneous connections
      maxMessages: 100, // Maximum messages per connection
      rateLimit: 5, // Max messages per second
      rateDelta: 1000
    });
  }
  return transporter;
};

// Simple email queue to handle concurrency
const emailQueue = [];
let isProcessing = false;

const processEmailQueue = async () => {
  if (isProcessing || emailQueue.length === 0) {
    return;
  }

  isProcessing = true;

  while (emailQueue.length > 0) {
    const { options, resolve, reject } = emailQueue.shift();
    
    try {
      const transporter = getTransporter();
      const mailGenerator = new Mailgen({
        theme: 'default',
        product: {
          name: 'Secure Chat',
          link: process.env.FRONTEND_URL || 'http://localhost:3000',
        },
      });

      // Generate email content
      const emailTextual = mailGenerator.generatePlaintext(options.mailgenContent);
      const emailHtml = mailGenerator.generate(options.mailgenContent);

      const mailOptions = {
        from: `"Secure Chat" <${process.env.EMAIL_USER}>`,
        to: options.email,
        subject: options.subject || 'No Subject',
        text: emailTextual,
        html: emailHtml,
      };

      console.log('Sending email with options:', {
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject
      });

      // Send the email
      const info = await transporter.sendMail(mailOptions);
      
      console.log('Email sent successfully:', {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected
      });

      resolve(info);
    } catch (error) {
      console.error('Email sending failed:', {
        error: error.message,
        stack: error.stack,
        code: error.code
      });
      
      // Provide more specific error messages for common issues
      if (error.code === 'EAUTH') {
        reject(new Error('Authentication failed. Please check your email credentials.'));
      } else if (error.code === 'ECONNECTION') {
        reject(new Error('Could not connect to the email server. Please check your internet connection.'));
      } else if (error.code === 'EENVELOPE') {
        reject(new Error('Invalid email address. Please check the recipient email.'));
      }
      
      reject(new Error(`Failed to send email: ${error.message}`));
    }
    
    // Small delay to prevent overwhelming the email server
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  isProcessing = false;
};

const sendEmail = async (options) => {
  console.log('Preparing to send email to:', options.email);
  
  try {
    // Verify required environment variables
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      throw new Error('Email configuration is incomplete. Please check your .env file for EMAIL_USER and EMAIL_PASS.');
    }

    // Return a promise that will be resolved when the email is sent
    return new Promise((resolve, reject) => {
      emailQueue.push({ options, resolve, reject });
      processEmailQueue();
    });
  } catch (error) {
    console.error('Email preparation failed:', error);
    throw new Error(`Failed to prepare email: ${error.message}`);
  }
};

const emailVerificationMailContent = (username, verificationUrl) => {
  // Extract OTP from verification URL
  const otp = verificationUrl.split('otp=')[1];
  
  return {
    body: {
      name: username,
      intro: [
        "Welcome to Secure Chat!",
        "Here's your verification code:"
      ],
      // Display OTP in a large, easy-to-read format
      table: {
        data: [
          {
            otp: otp,
            validity: "This code is valid for 10 minutes"
          }
        ],
        columns: {
          customWidth: {
            otp: "60%",
            validity: "40%"
          }
        }
      },
      // Keep the verification button as a fallback
      action: {
        instructions: "Or click the button below to verify your email:",
        button: {
          color: "#22BC66",
          text: "Verify Email",
          link: verificationUrl,
        },
      },
      outro: [
        "If you didn't request this email, you can safely ignore it.",
        "Need help? Just reply to this email, we'd love to help."
      ]
    },
  };
};

const forgotPasswordMailContent = (username, passwordResetUrl) => {
  return {
    body: {
      name: username,
      intro: "We got the request to reset the password of your account",
      action: {
        instructions:
          "To reset you password please click on the following button or link",
        button: {
          color: "#22BC66",
          text: "Reset password",
          link: passwordResetUrl,
        },
      },
      outro:
        "Need help, or have question? Just reply to this email, we'd love to help.",
    },
  };
};

export { emailVerificationMailContent, forgotPasswordMailContent, sendEmail };