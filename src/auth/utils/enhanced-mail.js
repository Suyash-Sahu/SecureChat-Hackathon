import Mailgen from "mailgen";
import nodemailer from "nodemailer";
import { setTimeout } from "timers/promises";

// Email delivery status tracking
const emailDeliveryStats = {
  sent: 0,
  failed: 0,
  queued: 0,
  lastError: null
};

// Enhanced transporter configuration with better pooling
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
      pool: true,
      maxConnections: 10, // Increased from 5 to 10
      maxMessages: 50, // Reduced from 100 to 50 for better reliability
      rateLimit: 3, // Reduced from 5 to 3 emails per second
      rateDelta: 1000,
      socketTimeout: 10000, // 10 seconds timeout
      greetingTimeout: 5000, // 5 seconds greeting timeout
    });
  }
  return transporter;
};

// Enhanced email queue with priority and retry logic
class EmailQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 seconds
    this.batchSize = 3; // Process 3 emails at a time
  }

  // Add email to queue with priority
  add(options, priority = 0) {
    return new Promise((resolve, reject) => {
      const emailEntry = {
        options,
        priority,
        resolve,
        reject,
        attempts: 0,
        addedAt: new Date()
      };
      
      // Insert in priority order (higher priority first)
      const insertIndex = this.queue.findIndex(item => item.priority < priority);
      if (insertIndex === -1) {
        this.queue.push(emailEntry);
      } else {
        this.queue.splice(insertIndex, 0, emailEntry);
      }
      
      emailDeliveryStats.queued++;
      this.processQueue();
    });
  }

  // Process email queue
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      // Process emails in batches
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, Math.min(this.batchSize, this.queue.length));
        emailDeliveryStats.queued -= batch.length;
        
        // Process batch concurrently
        const promises = batch.map(entry => this.processEmail(entry));
        await Promise.allSettled(promises);
        
        // Small delay between batches to prevent overwhelming the server
        await setTimeout(500);
      }
    } catch (error) {
      console.error('Error processing email queue:', error);
    } finally {
      this.processing = false;
    }
  }

  // Process individual email with retry logic
  async processEmail(entry) {
    try {
      const transporter = getTransporter();
      const mailGenerator = new Mailgen({
        theme: 'default',
        product: {
          name: 'Secure Chat',
          link: process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000',
        },
      });

      // Generate email content
      const emailTextual = mailGenerator.generatePlaintext(entry.options.mailgenContent);
      const emailHtml = mailGenerator.generate(entry.options.mailgenContent);

      const mailOptions = {
        from: `"Secure Chat" <${process.env.EMAIL_USER}>`,
        to: entry.options.email,
        subject: entry.options.subject || 'No Subject',
        text: emailTextual,
        html: emailHtml,
        priority: entry.priority > 0 ? 'high' : 'normal'
      };

      console.log(`📧 Sending email to ${entry.options.email} (Priority: ${entry.priority}, Attempt: ${entry.attempts + 1})`);

      // Send the email
      const info = await transporter.sendMail(mailOptions);
      
      console.log(`✅ Email sent successfully to ${entry.options.email}`, {
        messageId: info.messageId,
        response: info.response
      });
      
      emailDeliveryStats.sent++;
      entry.resolve(info);
    } catch (error) {
      entry.attempts++;
      emailDeliveryStats.lastError = {
        timestamp: new Date(),
        error: error.message,
        recipient: entry.options.email
      };
      
      console.error(`❌ Email sending failed for ${entry.options.email} (Attempt ${entry.attempts}):`, {
        error: error.message,
        code: error.code,
        command: error.command
      });
      
      // Retry logic for temporary failures
      if (entry.attempts < this.maxRetries && this.isRetryableError(error)) {
        console.log(`🔄 Retrying email to ${entry.options.email} in ${this.retryDelay}ms...`);
        await setTimeout(this.retryDelay);
        this.queue.push(entry); // Re-queue for retry
        emailDeliveryStats.queued++;
      } else {
        // Final failure
        emailDeliveryStats.failed++;
        const errorMessage = this.getFriendlyErrorMessage(error);
        entry.reject(new Error(`Failed to send email after ${entry.attempts} attempts: ${errorMessage}`));
      }
    }
  }

  // Determine if an error is retryable
  isRetryableError(error) {
    const retryableCodes = ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNRESET', 'EPIPE'];
    const retryableResponses = [429, 450, 451, 554]; // Rate limited, temporary unavailable
    
    return retryableCodes.includes(error.code) || 
           retryableResponses.includes(error.responseCode) ||
           error.message.includes('timeout') ||
           error.message.includes('connection');
  }

  // Get user-friendly error messages
  getFriendlyErrorMessage(error) {
    if (error.code === 'EAUTH') {
      return 'Authentication failed. Please check your email credentials.';
    } else if (error.code === 'ECONNECTION') {
      return 'Could not connect to the email server. This might be a temporary network issue.';
    } else if (error.code === 'EENVELOPE') {
      return 'Invalid email address. Please check the recipient email.';
    } else if (error.code === 'ESOCKET' || error.code === 'ECONNRESET') {
      return 'Connection to email server was interrupted. This might be a temporary issue.';
    } else if (error.responseCode === 535) {
      return 'Email authentication failed. Please verify your EMAIL_USER and EMAIL_PASS environment variables.';
    } else if (error.responseCode === 550) {
      return 'Email rejected by server. This might be due to spam filtering.';
    } else if (error.responseCode === 429) {
      return 'Rate limit exceeded. Please try again later.';
    }
    
    return error.message || 'Unknown error occurred while sending email.';
  }

  // Get queue status
  getStatus() {
    return {
      queued: this.queue.length,
      processing: this.processing,
      stats: { ...emailDeliveryStats }
    };
  }
}

// Create singleton instance
const emailQueue = new EmailQueue();

// Main send email function
const sendEmail = async (options, priority = 0) => {
  console.log(`📨 Queueing email to ${options.email} with priority ${priority}`);
  
  // Verify required environment variables
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    const errorMsg = 'Email configuration is incomplete. Please check your environment variables for EMAIL_USER and EMAIL_PASS.';
    console.warn(errorMsg);
    throw new Error(errorMsg);
  }

  return emailQueue.add(options, priority);
};

// High priority email sending (for critical notifications)
const sendHighPriorityEmail = async (options) => {
  return sendEmail(options, 1);
};

// Get email queue status
const getEmailQueueStatus = () => {
  return emailQueue.getStatus();
};

// Email content templates
const emailVerificationMailContent = (username, otp) => {
  return {
    body: {
      name: username,
      intro: [
        "Welcome to Secure Chat!",
        "Here's your verification code:"
      ],
      table: {
        data: [
          {
            otp: `<h1 style="font-size: 32px; font-weight: bold; letter-spacing: 5px;">${otp}</h1>`,
            validity: "This code is valid for 10 minutes"
          }
        ],
        columns: {
          customWidth: {
            otp: "40%",
            validity: "60%"
          }
        }
      },
      outro: [
        "If you didn't request this email, you can safely ignore it.",
        "Do not reply to this email."
      ]
    },
  };
};

const forgotPasswordMailContent = (username, otp) => {
  return {
    body: {
      name: username,
      intro: "We received a request to reset your password.",
      table: {
        data: [
          {
            "Reset Code": `<h1 style="font-size: 32px; font-weight: bold; letter-spacing: 5px;">${otp}</h1>`,
            "Valid For": "10 minutes"
          }
        ],
        columns: {
          customWidth: {
            "Reset Code": "40%",
            "Valid For": "60%"
          }
        }
      },
      outro: [
        "If you didn't request a password reset, you can safely ignore this email.",
        "For security reasons, please do not share this code with anyone.",
        "Do not reply to this email."
      ]
    },
  };
};

export { 
  emailVerificationMailContent, 
  forgotPasswordMailContent, 
  sendEmail,
  sendHighPriorityEmail,
  getEmailQueueStatus
};