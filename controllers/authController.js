import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { sendEmail } from '../utils/email.js';

// Password complexity regex (min 8 chars, at least one letter and one number)
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

/**
 * Helper to register audit logs
 */
const logAudit = async (action, actor, targetId, details, req) => {
  try {
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    await AuditLog.create({ action, actor, targetId, details, ipAddress });
  } catch (err) {
    console.error('Audit logging failed:', err);
  }
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res, next) => {
  try {
    const { name, email, password, college, course, year } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Please enter all required fields' });
    }

    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long and contain at least one letter and one number',
      });
    }

    // Check for existing user
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // Create user (unverified by default)
    const user = await User.create({
      name,
      email,
      password,
      college,
      course,
      year,
      verificationOTP: otp,
      verificationOTPExpires: otpExpiry,
    });

    // Send verification email
    const emailResult = await sendEmail({
      to: user.email,
      subject: 'Verify your NoteStack Account',
      text: `Your verification OTP code is: ${otp}. It will expire in 15 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #4F46E5;">Welcome to NoteStack!</h2>
          <p>Hi ${user.name},</p>
          <p>Thank you for registering. Please verify your email using the verification code below:</p>
          <div style="font-size: 24px; font-weight: bold; background-color: #F3F4F6; padding: 15px; text-align: center; letter-spacing: 5px; color: #1F2937; margin: 20px 0; border-radius: 5px;">
            ${otp}
          </div>
          <p style="color: #6B7280; font-size: 12px;">This verification code will expire in 15 minutes.</p>
        </div>
      `,
    });

    await logAudit('register_user', user._id, user._id, 'User account registered, pending verification', req);

    res.status(201).json({
      success: true,
      message: 'Registration successful. Verification OTP sent to email.',
      previewUrl: emailResult.previewUrl || null,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify user email with OTP
// @route   POST /api/auth/verify-email
// @access  Public
export const verifyEmail = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, error: 'Please provide email and verification code' });
    }

    const user = await User.findOne({
      email,
      verificationOTP: otp,
      verificationOTPExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired verification code' });
    }

    user.isVerified = true;
    user.verificationOTP = null;
    user.verificationOTPExpires = null;
    await user.save();

    await logAudit('verify_email', user._id, user._id, 'User email verified successfully', req);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully. You can now login.',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please enter email and password' });
    }

    // Find user and select password
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check verification status
    if (!user.isVerified) {
      // Re-trigger verification OTP if not verified
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.verificationOTP = otp;
      user.verificationOTPExpires = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();

      const emailResult = await sendEmail({
        to: user.email,
        subject: 'Verify your NoteStack Account (Resend)',
        text: `Your verification OTP code is: ${otp}. It will expire in 15 minutes.`,
        html: `<div style="font-family: Arial, sans-serif; padding: 20px;"><p>Your verification code is <b>${otp}</b>.</p></div>`,
      });

      return res.status(403).json({
        success: false,
        error: 'Email is not verified. A new verification OTP has been sent to your email.',
        unverified: true,
        previewUrl: emailResult.previewUrl || null,
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Set refresh token in httpOnly secure cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    await logAudit('login_user', user._id, user._id, 'User logged in successfully', req);

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        college: user.college,
        course: user.course,
        year: user.year,
      },
      token: accessToken,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Refresh access token
// @route   POST /api/auth/refresh-token
// @access  Public
export const refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'Refresh token not found' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    const accessToken = generateAccessToken(user);

    res.status(200).json({
      success: true,
      token: accessToken,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout user & clear cookie
// @route   POST /api/auth/logout
// @access  Public
export const logout = async (req, res, next) => {
  try {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Request forgot password OTP
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Please provide your email address' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Don't leak user existence for security, return generic success in production
      // For development, we return a friendly error or mock success
      return res.status(200).json({
        success: true,
        message: 'If the email exists, a password reset code has been sent.',
      });
    }

    // Generate password reset OTP (valid for 15m)
    const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordToken = resetOtp;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    // Send email
    const emailResult = await sendEmail({
      to: user.email,
      subject: 'NoteStack Password Reset',
      text: `Your password reset code is: ${resetOtp}. It will expire in 15 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Password Reset Request</h2>
          <p>Hello,</p>
          <p>We received a request to reset your password. Use the code below to complete the reset:</p>
          <div style="font-size: 24px; font-weight: bold; background-color: #F3F4F6; padding: 15px; text-align: center; letter-spacing: 5px; color: #DC2626; margin: 20px 0; border-radius: 5px;">
            ${resetOtp}
          </div>
          <p>If you did not request a password reset, please ignore this email.</p>
        </div>
      `,
    });

    await logAudit('forgot_password_request', user._id, user._id, 'Password reset OTP requested', req);

    res.status(200).json({
      success: true,
      message: 'If the email exists, a password reset code has been sent.',
      previewUrl: emailResult.previewUrl || null,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset password using OTP
// @route   POST /api/auth/reset-password
// @access  Public
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, error: 'Please enter all fields' });
    }

    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long and contain at least one letter and one number',
      });
    }

    const user = await User.findOne({
      email,
      resetPasswordToken: otp,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset code' });
    }

    // Set new password (the schema pre-save hook will hash it)
    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    await logAudit('reset_password_success', user._id, user._id, 'Password reset completed successfully', req);

    res.status(200).json({
      success: true,
      message: 'Password reset successful. You can now login with your new password.',
    });
  } catch (error) {
    next(error);
  }
};
