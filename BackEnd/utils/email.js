// utils/email.js
const nodemailer = require("nodemailer");

async function sendVerificationEmail(email, token) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("Email configuration missing");
    throw new Error("EMAIL_USER or EMAIL_PASS not configured");
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      // Add timeout settings
      connectionTimeout: 10000,
      greetingTimeout: 5000,
    });

    // Use BACKEND_URL env var so you can change domain easily
    const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
    const url = `${BACKEND_URL.replace(/\/$/, "")}/api/auth/verify-email?token=${token}`;

    const mailOptions = {
      from: `"VTcade" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify Your Email - VTcade",
      html: `
        <div style="font-family: 'Courier New', monospace; background: #000; color: #00ff00; padding: 20px;">
          <h2 style="color: #00ff00;">VTcade Email Verification</h2>
          <p>Click the link below to verify your email address:</p>
          <p><a href="${url}" style="color: #00ff00; text-decoration: underline;">Verify Email</a></p>
          <p>Or copy and paste this URL into your browser:</p>
          <p style="word-break: break-all;">${url}</p>
          <br>
          <p style="font-size: 12px; color: #008800;">If you didn't create an account, please ignore this email.</p>
        </div>
      `
    };

    console.log("Sending verification email to:", email);
    await transporter.sendMail(mailOptions);
    console.log("✓ Verification email sent successfully to:", email);
    
  } catch (err) {
    console.error("✗ Failed to send verification email:", err.message);
    console.error("  Full error:", err);
    throw err;
  }
}

module.exports = sendVerificationEmail;