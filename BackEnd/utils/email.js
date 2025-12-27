// utils/email.js
const nodemailer = require("nodemailer");

async function sendVerificationEmail(email, token) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error("EMAIL_USER or EMAIL_PASS not configured");
  }

  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    }
  });

  // Use BACKEND_URL env var so you can change domain easily
  const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
  const url = `${BACKEND_URL.replace(/\/$/, "")}/api/auth/verify-email?token=${token}`;

  const mailOptions = {
    from: `"VTcade" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Verify Your Email",
    html: `<p>Click the link to verify your email: <a href="${url}">Verify Email</a></p>`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Verification email sent to:", email);
  } catch (err) {
    console.error("Failed to send verification email:", err);
    // rethrow so caller (signup route) can handle and return 500 with useful logs
    throw err;
  }
}

module.exports = sendVerificationEmail;
