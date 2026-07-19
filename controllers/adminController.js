import fs from 'fs';
import path from 'path';
import User from '../models/User.js';
import Note from '../models/Note.js';
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

// @desc    Get all flagged notes
// @route   GET /api/admin/notes/flagged
// @access  Private/Admin
export const getFlaggedNotes = async (req, res, next) => {
  try {
    const notes = await Note.find({ status: 'flagged' })
      .populate('uploader', 'name email college course')
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      count: notes.length,
      notes,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Moderate note status (Approve, Flag, or Delete/Reject)
// @route   PUT /api/admin/notes/:id/status
// @access  Private/Admin
export const moderateNoteStatus = async (req, res, next) => {
  try {
    const { status } = req.body; // 'approved', 'flagged', or 'rejected'
    const noteId = req.params.id;

    if (!['approved', 'flagged', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value' });
    }

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    if (status === 'rejected') {
      // Physical delete for rejected content
      const filePath = path.join(process.cwd(), 'uploads', note.fileKey);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      await note.deleteOne();
      await logAudit('admin_reject_note', req.user._id, noteId, `Rejected and deleted note: "${note.title}"`, req);

      return res.status(200).json({
        success: true,
        message: 'Note rejected and deleted successfully',
      });
    }

    note.status = status;
    await note.save();
    
    await logAudit(`admin_moderate_${status}`, req.user._id, noteId, `Moderated note status to: "${status}" for "${note.title}"`, req);

    res.status(200).json({
      success: true,
      message: `Note status updated to ${status}`,
      note,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all users (with role filter)
// @route   GET /api/admin/users
// @access  Private/Admin
export const getUsers = async (req, res, next) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user role (student <-> admin)
// @route   PUT /api/admin/users/:id/role
// @access  Private/Admin
export const changeUserRole = async (req, res, next) => {
  try {
    const { role } = req.body; // 'student' or 'admin'
    const userId = req.params.id;

    if (!['student', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role value' });
    }

    // Prevent admin from demoting themselves
    if (userId.toString() === req.user._id.toString() && role !== 'admin') {
      return res.status(400).json({ success: false, error: 'Admins cannot change their own role' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    user.role = role;
    await user.save();

    await logAudit('admin_change_role', req.user._id, userId, `Changed user ${user.email} role to: "${role}"`, req);

    res.status(200).json({
      success: true,
      message: `User role updated to ${role}`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get platform metrics analytics
// @route   GET /api/admin/analytics
// @access  Private/Admin
export const getPlatformAnalytics = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments({});
    const totalNotes = await Note.countDocuments({});
    const flaggedNotes = await Note.countDocuments({ status: 'flagged' });

    // Aggregate total downloads
    const notes = await Note.find({});
    const totalDownloads = notes.reduce((acc, note) => acc + note.downloadCount, 0);

    // Subject breakdown
    const subjectBreakdown = await Note.aggregate([
      { $group: { _id: '$subject', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    // File type breakdown
    const fileTypeBreakdown = await Note.aggregate([
      { $group: { _id: '$fileType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Recent activity audit logs
    const recentLogs = await AuditLog.find({})
      .populate('actor', 'name email')
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      analytics: {
        totalUsers,
        totalNotes,
        totalDownloads,
        flaggedNotes,
        subjectBreakdown: subjectBreakdown.map((s) => ({ subject: s._id, count: s.count })),
        fileTypeBreakdown: fileTypeBreakdown.map((f) => ({ fileType: f._id, count: f.count })),
        recentLogs,
      },
    });
  } catch (error) {
    next(error);
  }
};
