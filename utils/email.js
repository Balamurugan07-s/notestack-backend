import nodemailer from 'nodemailer';

let transporter = null;

export const sendEmail = async ({ to, subject, text, html }) => {
  try {
    if (!transporter) {
      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = process.env.SMTP_PORT || 587;
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;

      if (smtpHost && smtpUser && smtpPass) {
        transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(smtpPort),
          secure: smtpPort == 465,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
        });
        console.log('📧 Nodemailer SMTP transporter configured.');
      } else {
        console.log('⚠️ SMTP environment variables missing. Generating Ethereal test account...');
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        console.log(`📧 Ethereal test account generated. User: ${testAccount.user}`);
      }
    }

    const mailOptions = {
      from: process.env.FROM_EMAIL || '"NoteStack Support" <noreply@notestack.com>',
      to,
      subject,
      text,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Email sent successfully: ${info.messageId}`);
    
    // Log Ethereal preview link if applicable
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`🔗 Preview Email Link: ${previewUrl}`);
      return { success: true, previewUrl };
    }

    return { success: true };
  } catch (error) {
    console.error(`❌ Email send error: ${error.message}`);
    return { success: false, error: error.message };
  }
};
