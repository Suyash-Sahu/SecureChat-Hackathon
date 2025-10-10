import Mailgen from "mailgen";
import nodemailer from "nodemailer";

const sendEmail = async (options) => {
  const mailGenerator = new Mailgen({
    theme: "default",
    product: {
      name: "Task manager",
      link: "https;//taskmanagelink.com",
    },
  });

  const emailTextual = mailGenerator.generatePlaintext(options.mailgenContent);
  const emailHtml = mailGenerator.generate(options.mailgenContent);

  const transpoter = nodemailer.createTransport({
    host: process.env.MAILTRAP_SMTP_HOST,
    port: process.env.MAILTRAP_SMTP_PORT,
    auth: {
      user: process.env.MAILTRAP_SMTP_USER,
      pass: process.env.MAILTRAP_SMTP_PASS,
    },
  });

  const mail = {
    from: "mail.taskmanage@example.com",
    to: options.email,
    subject: options.subject,
    text: emailTextual,
    html: emailHtml,
  };

  try {
    await transpoter.sendMail(mail);
  } catch (error) {
    console.error(
      "Email service failed silently. make sure that you have provided you mailtrap credential in .env file",
    );
    console.error("Error:", error);
  }
};

const emailVerificationMailContent = (username, verificationUrl) => {
  return {
    body: {
      name: username,
      intro: "Welcome to our App!",
      action: {
        instructions:
          "To verify your email please click on the following button",
        button: {
          color: "#22BC66",
          text: "Verify your email",
          link: verificationUrl,
        },
      },
      outro:
        "Need help, or have question? Just reply to this email, we'd love to help.",
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
