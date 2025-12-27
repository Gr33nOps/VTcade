// utils/email.js
const nodemailer = require("nodemailer");

async function sendVerificationEmail(email, token) {
  // Check if email credentials are configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("❌ Email configuration missing");
    throw new Error("EMAIL_USER or EMAIL_PASS not configured in environment variables");
  }

  try {
    console.log("📧 Configuring email transporter...");
    
    // Create transporter with increased timeouts for Render cold starts
    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      // Increased timeouts to handle Render cold starts and slow networks
      connectionTimeout: 30000,  // 30 seconds (was 10)
      greetingTimeout: 30000,    // 30 seconds (was 5)
      socketTimeout: 30000,      // 30 seconds (new)
      // Add debug logging if needed
      logger: false,
      debug: false
    });

    // Verify transporter configuration
    console.log("🔍 Verifying SMTP connection...");
    await transporter.verify();
    console.log("✓ SMTP connection verified");

    // Construct verification URL
    const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
    const verificationUrl = `${BACKEND_URL.replace(/\/$/, "")}/api/auth/verify-email?token=${token}`;

    console.log("🔗 Verification URL:", verificationUrl);

    // Email options
    const mailOptions = {
      from: `"VTcade" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Verify Your Email - VTcade",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>VTcade Email Verification</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Courier New', monospace; background-color: #000000;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #000000;">
            <tr>
              <td align="center" style="padding: 40px 20px;">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #000000; border: 2px solid #00ff00;">
                  <!-- Header -->
                  <tr>
                    <td align="center" style="padding: 30px 20px; border-bottom: 2px solid #00ff00;">
                      <h1 style="color: #00ff00; margin: 0; font-size: 32px; text-shadow: 0 0 10px #00ff00;">
                        VTcade
                      </h1>
                      <p style="color: #00ff00; margin: 10px 0 0 0; font-size: 14px;">
                        Play Like It's 1980
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Body -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <h2 style="color: #00ff00; margin: 0 0 20px 0; font-size: 24px;">
                        Email Verification Required
                      </h2>
                      
                      <p style="color: #00ff00; margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
                        Thank you for signing up! Please verify your email address to activate your account and start playing.
                      </p>
                      
                      <!-- CTA Button -->
                      <table cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                        <tr>
                          <td align="center" style="background-color: #00ff00; padding: 15px 40px; border-radius: 4px;">
                            <a href="${verificationUrl}" 
                               style="color: #000000; text-decoration: none; font-size: 18px; font-weight: bold; display: block;">
                              VERIFY EMAIL
                            </a>
                          </td>
                        </tr>
                      </table>
                      
                      <p style="color: #00ff00; margin: 20px 0 0 0; font-size: 14px; line-height: 1.5;">
                        Or copy and paste this link into your browser:
                      </p>
                      
                      <p style="color: #00aa00; margin: 10px 0 0 0; font-size: 12px; word-break: break-all;">
                        ${verificationUrl}
                      </p>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="padding: 20px 30px; border-top: 2px solid #00ff00;">
                      <p style="color: #008800; margin: 0; font-size: 12px; line-height: 1.5;">
                        This verification link will expire in 24 hours.
                      </p>
                      <p style="color: #008800; margin: 10px 0 0 0; font-size: 12px; line-height: 1.5;">
                        If you didn't create an account with VTcade, please ignore this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      // Plain text fallback
      text: `
VTcade - Email Verification

Thank you for signing up! Please verify your email address to activate your account.

Click here to verify: ${verificationUrl}

Or copy and paste this URL into your browser:
${verificationUrl}

This verification link will expire in 24 hours.

If you didn't create an account with VTcade, please ignore this email.

---
VTcade - Play Like It's 1980
      `.trim()
    };

    // Send email
    console.log("📤 Sending verification email to:", email);
    const info = await transporter.sendMail(mailOptions);
    
    console.log("✓ Verification email sent successfully");
    console.log("  Message ID:", info.messageId);
    console.log("  Accepted:", info.accepted);
    console.log("  Response:", info.response);
    
    return info;
    
  } catch (err) {
    console.error("✗ Failed to send verification email");
    console.error("  Error type:", err.name);
    console.error("  Error message:", err.message);
    
    // Log specific error details
    if (err.code) {
      console.error("  Error code:", err.code);
    }
    if (err.command) {
      console.error("  SMTP command:", err.command);
    }
    if (err.responseCode) {
      console.error("  Response code:", err.responseCode);
    }
    
    // Provide helpful error messages
    if (err.message.includes('Invalid login')) {
      console.error("  ℹ Check your EMAIL_USER and EMAIL_PASS in .env");
      console.error("  ℹ Gmail requires an 'App Password', not your regular password");
      console.error("  ℹ Generate one at: https://myaccount.google.com/apppasswords");
    } else if (err.message.includes('timeout')) {
      console.error("  ℹ Email service timed out - this is common on Render cold starts");
      console.error("  ℹ Consider making email verification optional");
    } else if (err.message.includes('ECONNREFUSED')) {
      console.error("  ℹ Cannot connect to Gmail SMTP server");
      console.error("  ℹ Check your internet connection and firewall settings");
    }
    
    console.error("  Full error:", err);
    
    throw err;
  }
}

module.exports = sendVerificationEmail;