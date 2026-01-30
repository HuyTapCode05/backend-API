import nodemailer from 'nodemailer';

// Email configuration from environment variables
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = process.env.EMAIL_PORT || 587;
const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;

// Create transporter
let transporter = null;

export function initEmailTransporter() {
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn('⚠️  Email credentials not configured. Email sending will be disabled.');
    console.warn('   Set EMAIL_USER and EMAIL_PASS environment variables to enable email.');
    return false;
  }

  try {
    transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: EMAIL_PORT,
      secure: EMAIL_PORT === 465, // true for 465, false for other ports
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
      }
    });

    console.log('✅ Email transporter initialized');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize email transporter:', error);
    return false;
  }
}

/**
 * Send verification email with code
 * @param {string} to - Recipient email
 * @param {string} username - Username
 * @param {string} verificationCode - 6-digit verification code
 * @returns {Promise<boolean>}
 */
export async function sendVerificationEmail(to, username, verificationCode) {
  if (!transporter) {
    console.warn('⚠️  Email transporter not initialized. Email not sent.');
    return false;
  }

  try {
    const mailOptions = {
      from: `"Chat App" <${EMAIL_FROM}>`,
      to: to,
      subject: 'Xác thực email đăng ký tài khoản',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background-color: #f9f9f9;
              border-radius: 10px;
              padding: 30px;
              margin: 20px 0;
            }
            .code-box {
              background-color: #fff;
              border: 2px dashed #4CAF50;
              border-radius: 8px;
              padding: 20px;
              text-align: center;
              margin: 20px 0;
            }
            .code {
              font-size: 32px;
              font-weight: bold;
              color: #4CAF50;
              letter-spacing: 5px;
              font-family: 'Courier New', monospace;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              font-size: 12px;
              color: #666;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Xin chào ${username}!</h2>
            <p>Cảm ơn bạn đã đăng ký tài khoản. Để hoàn tất đăng ký, vui lòng sử dụng mã xác thực sau:</p>
            
            <div class="code-box">
              <div class="code">${verificationCode}</div>
            </div>
            
            <p><strong>Mã này có hiệu lực trong 24 giờ.</strong></p>
            <p>Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email này.</p>
            
            <div class="footer">
              <p>Trân trọng,<br>Đội ngũ Chat App</p>
              <p style="color: #999; font-size: 11px;">Email này được gửi tự động, vui lòng không trả lời.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Xin chào ${username}!
        
        Cảm ơn bạn đã đăng ký tài khoản. Mã xác thực của bạn là:
        
        ${verificationCode}
        
        Mã này có hiệu lực trong 24 giờ.
        
        Trân trọng,
        Đội ngũ Chat App
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Verification email sent to ${to}:`, info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    return false;
  }
}

/**
 * Send password reset email
 * @param {string} to - Recipient email
 * @param {string} username - Username
 * @param {string} resetCode - 6-digit reset code
 * @returns {Promise<boolean>}
 */
export async function sendPasswordResetEmail(to, username, resetCode) {
  if (!transporter) {
    console.warn('⚠️  Email transporter not initialized. Email not sent.');
    return false;
  }

  try {
    const mailOptions = {
      from: `"Chat App" <${EMAIL_FROM}>`,
      to: to,
      subject: 'Khôi phục mật khẩu',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .container {
              background-color: #f9f9f9;
              border-radius: 10px;
              padding: 30px;
              margin: 20px 0;
            }
            .code-box {
              background-color: #fff;
              border: 2px dashed #FF9800;
              border-radius: 8px;
              padding: 20px;
              text-align: center;
              margin: 20px 0;
            }
            .code {
              font-size: 32px;
              font-weight: bold;
              color: #FF9800;
              letter-spacing: 5px;
              font-family: 'Courier New', monospace;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              font-size: 12px;
              color: #666;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Xin chào ${username}!</h2>
            <p>Bạn đã yêu cầu khôi phục mật khẩu. Sử dụng mã sau để đặt lại mật khẩu:</p>
            
            <div class="code-box">
              <div class="code">${resetCode}</div>
            </div>
            
            <p><strong>Mã này có hiệu lực trong 1 giờ.</strong></p>
            <p>Nếu bạn không yêu cầu khôi phục mật khẩu, vui lòng bỏ qua email này.</p>
            
            <div class="footer">
              <p>Trân trọng,<br>Đội ngũ Chat App</p>
              <p style="color: #999; font-size: 11px;">Email này được gửi tự động, vui lòng không trả lời.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Xin chào ${username}!
        
        Bạn đã yêu cầu khôi phục mật khẩu. Mã khôi phục của bạn là:
        
        ${resetCode}
        
        Mã này có hiệu lực trong 1 giờ.
        
        Trân trọng,
        Đội ngũ Chat App
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${to}:`, info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    return false;
  }
}

/**
 * Test email configuration
 * @returns {Promise<boolean>}
 */
export async function testEmailConnection() {
  if (!transporter) {
    return false;
  }

  try {
    await transporter.verify();
    console.log('✅ Email server connection verified');
    return true;
  } catch (error) {
    console.error('❌ Email server connection failed:', error);
    return false;
  }
}

