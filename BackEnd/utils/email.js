const nodemailer = require("nodemailer");

async function sendVerificationEmail(email, token) {
    // Configure transporter (use Gmail, Outlook, or any SMTP)
    const transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: {
            user: process.env.EMAIL_USER,   // your email
            pass: process.env.EMAIL_PASS    // your email password or app password
        }
    });

    const url = `http://localhost:5000/api/auth/verify-email?token=${token}`;

    const mailOptions = {
        from: `"My App" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Verify Your Email",
        html: `<p>Click the link to verify your email: <a href="${url}">Verify Email</a></p>`
    };

    await transporter.sendMail(mailOptions);
}

module.exports = sendVerificationEmail;
