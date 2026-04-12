const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'sandbox.smtp.mailtrap.io',
  port: process.env.MAIL_PORT || 2525,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

exports.sendResetEmail = async (email, token) => {
  const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  
  const mailOptions = {
    from: '"Tashgheel Support" <support@tashgheel.com>',
    to: email,
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="color: #333;">Password Reset</h2>
        <p>You requested a password reset for your Tashgheel CRM account.</p>
        <p>Click the button below to reset your password. This link is valid for 15 minutes.</p>
        <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px;">Reset Password</a>
        <p style="margin-top: 30px; font-size: 12px; color: #777;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `
  };

  return transporter.sendMail(mailOptions);
};
