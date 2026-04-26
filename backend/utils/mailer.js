const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendVerificationEmail(email, name, token) {
  const verifyUrl = `${process.env.APP_URL || 'http://localhost:3000'}/#verify?token=${token}`;

  await transporter.sendMail({
    from: `"GST Compliance System" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify your email address',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px">
        <h2 style="color:#1a202c">Hi ${name},</h2>
        <p style="color:#4a5568">Thanks for registering. Please verify your email to activate your account.</p>
        <a href="${verifyUrl}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#4f7ef8;color:white;border-radius:8px;text-decoration:none;font-weight:600">
          Verify Email
        </a>
        <p style="color:#a0aec0;font-size:0.8rem">This link expires in 24 hours. If you didn't register, ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail };
