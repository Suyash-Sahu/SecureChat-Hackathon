import Mailgen from "mailgen";
import nodemailer from "nodemailer";

const sendEmail = async (options) => {
  console.log('Preparing to send email to:', options.email);
  
  try {
    // Verify required environment variables
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      throw new Error('Email configuration is incomplete. Please check your .env file for EMAIL_USER and EMAIL_PASS.');
    }

    const mailGenerator = new Mailgen({
      theme: 'default',
      product: {
        name: 'Secure Chat',
        link: 'http://your-app-url.com',
      },
    });

    // Generate email content
    const emailTextual = mailGenerator.generatePlaintext(options.mailgenContent);
    const emailHtml = mailGenerator.generate(options.mailgenContent);

    console.log('Creating transporter with user:', process.env.EMAIL_USER);
    
    // Configure transporter with Gmail SMTP using explicit settings
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // true for 465, false for other ports
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false
      },
      debug: true,
      logger: true
    });

    // Verify connection configuration
    await transporter.verify((error, success) => {
      if (error) {
        console.error('SMTP Connection Error:', error);
        throw new Error(`SMTP Connection failed: ${error.message}`);
      } else {
        console.log('Server is ready to take our messages');
      }
    });

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
      rejected: info.rejected,
      pending: info.pending,
      response: info.response
    });

    return info;
  } catch (error) {
    console.error('Email sending failed:', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      responseMessage: error.responseMessage
    });
    
    // Provide more specific error messages for common issues
    if (error.code === 'EAUTH') {
      throw new Error('Authentication failed. Please check your email credentials.');
    } else if (error.code === 'ECONNECTION') {
      throw new Error('Could not connect to the email server. Please check your internet connection.');
    } else if (error.code === 'EENVELOPE') {
      throw new Error('Invalid email address. Please check the recipient email.');
    }
    
    throw new Error(`Failed to send email: ${error.message}`);
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
