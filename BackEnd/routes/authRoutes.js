// routes/authRoutes.js
const router = require("express").Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const sendVerificationEmail = require("../utils/email");

// ---------------- SIGNUP ----------------
router.post("/signup", async (req, res) => {
  try {
    console.log("Signup request received:", req.body.email);
    
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      console.log("Signup failed: Missing fields");
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log("Signup failed: Email already exists:", email);
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString("hex");

    const user = await User.create({
      username,
      email,
      password: hashed,
      verified: false,
      verifyToken: token
    });

    console.log("User created:", user.email);

    // Send verification email (non-blocking if it fails)
    try {
      await sendVerificationEmail(email, token);
    } catch (emailErr) {
      console.error("Email sending failed but user was created:", emailErr.message);
      // Still return success since user was created
    }

    res.json({ 
      message: "Signup successful! Check your email to verify your account.",
      email: email 
    });

  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ 
      message: "Server error", 
      detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
    });
  }
});

// ---------------- LOGIN ----------------
router.post("/login", async (req, res) => {
  try {
    console.log("Login request received:", req.body.email);
    
    const { email, password } = req.body;

    if (!email || !password) {
      console.log("Login failed: Missing fields");
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      console.log("Login failed: Email not found:", email);
      return res.status(400).json({ message: "Email not registered" });
    }

    if (!user.verified) {
      console.log("Login failed: Email not verified:", email);
      return res.status(400).json({ message: "Please verify your email first" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      console.log("Login failed: Incorrect password for:", email);
      return res.status(400).json({ message: "Incorrect password" });
    }

    console.log("✓ Login successful:", user.username);
    res.json({ 
      username: user.username,
      email: user.email 
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ 
      message: "Server error", 
      detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
    });
  }
});

// ---------------- VERIFY EMAIL ----------------
router.get("/verify-email", async (req, res) => {
  try {
    console.log("Email verification request received");
    
    const { token } = req.query;
    if (!token) {
      console.log("Verification failed: No token provided");
      return res.status(400).send(`
        <html>
          <body style="font-family: 'Courier New', monospace; background: #000; color: #00ff00; padding: 20px;">
            <h2>Invalid Token</h2>
            <p>The verification link is invalid or expired.</p>
          </body>
        </html>
      `);
    }

    const user = await User.findOne({ verifyToken: token });
    if (!user) {
      console.log("Verification failed: Invalid token");
      return res.status(400).send(`
        <html>
          <body style="font-family: 'Courier New', monospace; background: #000; color: #00ff00; padding: 20px;">
            <h2>Invalid or Expired Token</h2>
            <p>This verification link is invalid or has already been used.</p>
          </body>
        </html>
      `);
    }

    user.verified = true;
    user.verifyToken = undefined;
    await user.save();

    console.log("✓ Email verified successfully:", user.email);
    
    res.send(`
      <html>
        <body style="font-family: 'Courier New', monospace; background: #000; color: #00ff00; padding: 20px; text-align: center;">
          <h1 style="color: #00ff00;">✓ Email Verified Successfully!</h1>
          <p>Your email has been verified. You can now login to VTcade.</p>
          <br>
          <p><a href="/login" style="color: #00ff00; text-decoration: underline;">Click here to login</a></p>
        </body>
      </html>
    `);

  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).send(`
      <html>
        <body style="font-family: 'Courier New', monospace; background: #000; color: #00ff00; padding: 20px;">
          <h2>Server Error</h2>
          <p>An error occurred while verifying your email. Please try again later.</p>
        </body>
      </html>
    `);
  }
});

module.exports = router;