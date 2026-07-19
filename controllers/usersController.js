import fs from 'fs';
import path from 'path';
import User from '../models/User.js';
import Note from '../models/Note.js';
import Bookmark from '../models/Bookmark.js';
import Query from '../models/Query.js';
import AuditLog from '../models/AuditLog.js';

// Helper to log audit events
const logAudit = async (action, actor, targetId, details, req) => {
  try {
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    await AuditLog.create({ action, actor, targetId, details, ipAddress });
  } catch (err) {
    console.error('Audit logging failed:', err);
  }
};

// @desc    Get current user profile & platform stats
// @route   GET /api/users/me
// @access  Private
export const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    // Calculate user upload stats
    const uploadsCount = await Note.countDocuments({ uploader: user._id });
    const userNotes = await Note.find({ uploader: user._id });
    
    // Sum up downloads for all notes uploaded by this user
    const totalDownloads = userNotes.reduce((acc, note) => acc + note.downloadCount, 0);

    // Get bookmark count
    const bookmarksCount = await Bookmark.countDocuments({ user: user._id });

    // Fetch user uploaded notes
    const uploads = await Note.find({ uploader: user._id }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        college: user.college,
        course: user.course,
        year: user.year,
        role: user.role,
        isVerified: user.isVerified,
        createdAt: user.createdAt,
      },
      stats: {
        uploadsCount,
        totalDownloads,
        bookmarksCount,
      },
      uploads,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user profile details
// @route   PUT /api/users/me
// @access  Private
export const updateProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    const { name, college, course, year } = req.body;

    user.name = name || user.name;
    user.college = college !== undefined ? college : user.college;
    user.course = course !== undefined ? course : user.course;
    user.year = year !== undefined ? year : user.year;

    await user.save();
    await logAudit('update_profile', user._id, user._id, 'User updated profile details', req);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        college: user.college,
        course: user.course,
        year: user.year,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user password
// @route   PUT /api/users/me/password
// @access  Private
export const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Please enter current and new password' });
    }

    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Incorrect current password' });
    }

    if (newPassword.length < 8 || !/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 8 characters long and contain both letters and numbers',
      });
    }

    user.password = newPassword;
    await user.save();

    await logAudit('update_password', user._id, user._id, 'User changed password', req);

    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    GDPR-compliant Account Deletion
// @route   DELETE /api/users/me
// @access  Private
export const gdprDeleteAccount = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // 1. Fetch user uploaded notes to delete files from disk
    const notes = await Note.find({ uploader: userId });
    for (const note of notes) {
      const filePath = path.join(process.cwd(), 'uploads', note.fileKey);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      // Delete all comments/bookmarks related to this note
      await Query.deleteMany({ note: note._id });
      await Bookmark.deleteMany({ note: note._id });
    }

    // 2. Delete all of user's notes document from DB
    await Note.deleteMany({ uploader: userId });

    // 3. Delete comments posted by this user
    await Query.deleteMany({ user: userId });

    // 4. Delete user's bookmarks
    await Bookmark.deleteMany({ user: userId });

    // 5. Log audit trail (we use actor = userId, but user is deleting themselves)
    await logAudit('gdpr_delete_user', userId, userId, `User ${req.user.email} purged all account data`, req);

    // 6. Delete user document
    await User.findByIdAndDelete(userId);

    // 7. Clear refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.status(200).json({
      success: true,
      message: 'GDPR Request completed. Your account and all associated files/comments have been permanently deleted.',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle bookmark status for a note (on/off)
// @route   POST /api/bookmarks/note/:id
// @access  Private
export const toggleBookmark = async (req, res, next) => {
  try {
    const noteId = req.params.id;
    const userId = req.user._id;

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    const existingBookmark = await Bookmark.findOne({ user: userId, note: noteId });

    if (existingBookmark) {
      // Remove bookmark
      await existingBookmark.deleteOne();
      return res.status(200).json({
        success: true,
        bookmarked: false,
        message: 'Note removed from bookmarks',
      });
    } else {
      // Create bookmark
      await Bookmark.create({ user: userId, note: noteId });
      return res.status(201).json({
        success: true,
        bookmarked: true,
        message: 'Note added to bookmarks',
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get all bookmarked notes for logged-in user
// @route   GET /api/bookmarks
// @access  Private
export const getBookmarks = async (req, res, next) => {
  try {
    const bookmarks = await Bookmark.find({ user: req.user._id })
      .populate({
        path: 'note',
        populate: {
          path: 'uploader',
          select: 'name college course',
        },
      })
      .sort({ createdAt: -1 });

    // Filter out bookmarks where notes have been deleted
    const validBookmarks = bookmarks.filter((b) => b.note !== null);

    res.status(200).json({
      success: true,
      count: validBookmarks.length,
      bookmarks: validBookmarks.map((b) => b.note),
    });
  } catch (error) {
    next(error);
  }
};
