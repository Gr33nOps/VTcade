// utils/email.js
const { Resend } = require('resend');

async function sendVerificationEmail(email, token) {
  // Check if Resend API key is configured
  if (!process.env.RESEND_API_KEY) {
    console.error("❌ Resend API key missing");
    throw new Error("RESEND_API_KEY not configured in environment variables");
  }

  // Check if sender email is configured
  if (!process.env.RESEND_FROM_EMAIL) {
    console.error("❌ Resend sender email missing");
    throw new Error("RESEND_FROM_EMAIL not configured in environment variables");
  }

  try {
    console.log("📧 Configuring Resend...");
    
    // Initialize Resend
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Construct verification URL
    const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";
    const verificationUrl = `${BACKEND_URL.replace(/\/$/, "")}/api/auth/verify-email?token=${token}`;

    console.log("🔗 Verification URL:", verificationUrl);

    // Send email using Resend
    console.log("📤 Sending verification email to:", email);
    
    const data = await resend.emails.send({
      from: `VTcade <${process.env.RESEND_FROM_EMAIL}>`,
      to: [email],
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
    });
    
    console.log("✓ Verification email sent successfully");
    console.log("  Email ID:", data.id);
    
    return data;
    
  } catch (err) {
    console.error("✗ Failed to send verification email");
    console.error("  Error type:", err.name);
    console.error("  Error message:", err.message);
    
    // Provide helpful error messages
    if (err.message.includes('Invalid API key')) {
      console.error("  ℹ Check your RESEND_API_KEY in .env");
      console.error("  ℹ Get your API key from: https://resend.com/api-keys");
    } else if (err.message.includes('from')) {
      console.error("  ℹ Check your RESEND_FROM_EMAIL in .env");
      console.error("  ℹ Make sure you've verified your domain in Resend");
      console.error("  ℹ Or use onboarding@resend.dev for testing");
    } else if (err.message.includes('domain')) {
      console.error("  ℹ You need to verify your domain in Resend");
      console.error("  ℹ Go to: https://resend.com/domains");
      console.error("  ℹ Or use 'onboarding@resend.dev' for testing");
    }
    
    console.error("  Full error:", err);
    
    throw err;
  }
}

module.exports = sendVerificationEmail;