import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import Note from '../models/Note.js';
import User from '../models/User.js';
import Query from '../models/Query.js';
import Bookmark from '../models/Bookmark.js';
import AuditLog from '../models/AuditLog.js';
import { scanFile } from '../utils/scanner.js';

const DOWNLOAD_SIGN_SECRET = process.env.DOWNLOAD_SIGN_SECRET || 'download_secure_signing_secret_key_9876';

// Helper to log audit events
const logAudit = async (action, actor, targetId, details, req) => {
  try {
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    await AuditLog.create({ action, actor, targetId, details, ipAddress });
  } catch (err) {
    console.error('Audit logging failed:', err);
  }
};

// @desc    Upload new study note
// @route   POST /api/notes
// @access  Private
export const uploadNote = async (req, res, next) => {
  try {
    const { title, description, subject, tags, isPrivate } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please upload a file' });
    }

    if (!title || !description || !subject) {
      // Remove uploaded file if metadata validation fails
      if (req.file.path) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, error: 'Please fill in title, description, and subject' });
    }

    const filePath = req.file.path;
    const fileKey = req.file.filename;

    // Perform Virus/Malware Scan
    const scanResult = await scanFile(filePath);
    if (!scanResult.clean) {
      // Delete file immediately if malware is detected
      fs.unlinkSync(filePath);
      await logAudit('malware_detected', req.user._id, null, `Malware found in upload: ${req.file.originalname}`, req);
      return res.status(400).json({
        success: false,
        error: `Security scan rejected this file: ${scanResult.message}`,
      });
    }

    // Process tags
    let tagsArray = [];
    if (tags) {
      tagsArray = tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    }

    const note = await Note.create({
      uploader: req.user._id,
      title,
      description,
      subject,
      tags: tagsArray,
      fileUrl: `/uploads/${fileKey}`,
      fileKey,
      fileType: path.extname(req.file.originalname).substring(1).toLowerCase(),
      isPrivate: isPrivate === 'true' || isPrivate === true,
      status: 'approved', // Auto-approved in dev, but can be updated by admin
    });

    await logAudit('upload_note', req.user._id, note._id, `Uploaded study note: "${title}"`, req);

    res.status(201).json({
      success: true,
      message: 'Note uploaded and verified successfully',
      note,
    });
  } catch (error) {
    // Cleanup upload file on server crash
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
};

// @desc    Get all notes (Browse/Search with pagination and filters)
// @route   GET /api/notes
// @access  Private (Logged-in users only)
export const getNotes = async (req, res, next) => {
  try {
    const { search, subject, fileType, tag, page = 1, limit = 9, sortBy = 'createdAt' } = req.query;

    const query = {
      $or: [
        { isPrivate: false, status: 'approved' },
        { uploader: req.user._id }, // Let users see their own private/flagged notes
      ],
    };

    // Filter by subject
    if (subject) {
      query.subject = { $regex: new RegExp(subject, 'i') };
    }

    // Filter by fileType
    if (fileType) {
      query.fileType = fileType;
    }

    // Filter by tags
    if (tag) {
      query.tags = tag;
    }

    // Keyword Search (Regex matching across fields for flexibility)
    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { subject: { $regex: search, $options: 'i' } },
          { tags: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const skipIndex = (parseInt(page) - 1) * parseInt(limit);

    // Build sort options
    let sortOptions = {};
    if (sortBy === 'downloads') {
      sortOptions.downloadCount = -1;
    } else {
      sortOptions.createdAt = -1; // Default newest
    }

    const notes = await Note.find(query)
      .populate('uploader', 'name college course role')
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip(skipIndex);

    const totalNotes = await Note.countDocuments(query);

    res.status(200).json({
      success: true,
      count: notes.length,
      totalPages: Math.ceil(totalNotes / parseInt(limit)),
      currentPage: parseInt(page),
      totalNotes,
      notes,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get detailed note by ID
// @route   GET /api/notes/:id
// @access  Private
export const getNoteById = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id).populate('uploader', 'name college course');

    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    // Access control: if private, only uploader or admin can view
    if (note.isPrivate && note.uploader._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied: private note' });
    }

    // Fetch parent queries (top-level threads)
    const queries = await Query.find({ note: note._id, parentQuery: null })
      .populate('user', 'name role')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      note,
      queries,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update note metadata
// @route   PUT /api/notes/:id
// @access  Private
export const updateNote = async (req, res, next) => {
  try {
    let note = await Note.findById(req.params.id);

    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    // Verify owner
    if (note.uploader.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'User not authorized to edit this note' });
    }

    const { title, description, subject, tags, isPrivate } = req.body;

    // Process tags
    let tagsArray = note.tags;
    if (tags) {
      tagsArray = tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
    }

    note.title = title || note.title;
    note.description = description || note.description;
    note.subject = subject || note.subject;
    note.tags = tagsArray;
    if (isPrivate !== undefined) {
      note.isPrivate = isPrivate === 'true' || isPrivate === true;
    }

    await note.save();
    await logAudit('update_note', req.user._id, note._id, `Updated note details for "${note.title}"`, req);

    res.status(200).json({
      success: true,
      message: 'Note updated successfully',
      note,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a note
// @route   DELETE /api/notes/:id
// @access  Private
export const deleteNote = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);

    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    // Verify owner or admin
    if (note.uploader.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'User not authorized to delete this note' });
    }

    // Delete actual file from server uploads folder (if stored locally)
    const filePath = path.join(process.cwd(), 'uploads', note.fileKey);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete bookmarks, queries, and note document
    await Bookmark.deleteMany({ note: note._id });
    await Query.deleteMany({ note: note._id });
    await note.deleteOne();

    await logAudit('delete_note', req.user._id, note._id, `Deleted note: "${note.title}" and associated data`, req);

    res.status(200).json({
      success: true,
      message: 'Note and associated files/comments deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Request signed secure download url
// @route   GET /api/notes/:id/download
// @access  Private
export const getDownloadUrl = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);

    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    // Verify access (private files can only be downloaded by uploader/admin)
    if (note.isPrivate && note.uploader.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied: private note download unauthorized' });
    }

    // Generate a 5-minute cryptographic download token
    const downloadToken = jwt.sign(
      { fileKey: note.fileKey, noteId: note._id },
      DOWNLOAD_SIGN_SECRET,
      { expiresIn: '5m' }
    );

    const downloadUrl = `/api/notes/download/secure/${downloadToken}`;

    res.status(200).json({
      success: true,
      downloadUrl,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Secure, time-limited direct file download
// @route   GET /api/notes/download/secure/:token
// @access  Public (Token verification secures it)
export const downloadFileSecure = async (req, res, next) => {
  try {
    const { token } = req.params;

    // Verify token validity
    let decoded;
    try {
      decoded = jwt.verify(token, DOWNLOAD_SIGN_SECRET);
    } catch (err) {
      return res.status(403).send('<h1>Secure link expired or invalid</h1><p>Please request a new link.</p>');
    }

    const { fileKey, noteId } = decoded;

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).send('<h1>Note no longer exists</h1>');
    }

    // Locate file path on local filesystem
    const filePath = path.join(process.cwd(), 'uploads', fileKey);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('<h1>File not found on server</h1>');
    }

    // Increment download count
    note.downloadCount += 1;
    await note.save();

    // Log the download event
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    await AuditLog.create({
      action: 'download_note',
      actor: note.uploader, // fallback placeholder
      targetId: note._id,
      details: `Note downloaded. Total count: ${note.downloadCount}`,
      ipAddress,
    });

    // Send file attachment
    res.download(filePath, `${note.title}${path.extname(fileKey)}`);
  } catch (error) {
    next(error);
  }
};

// @desc    Get public statistics for homepage
// @route   GET /api/notes/public/stats
// @access  Public
export const getPublicStats = async (req, res, next) => {
  try {
    const studyNotesCount = await Note.countDocuments({ isPrivate: false, status: 'approved' });
    const activeStudentsCount = await User.countDocuments({ role: 'student' });
    const distinctSubjects = await Note.distinct('subject', { isPrivate: false, status: 'approved' });
    const academicProgramsCount = distinctSubjects.length;

    res.status(200).json({
      success: true,
      studyNotesCount,
      activeStudentsCount,
      academicProgramsCount,
    });
  } catch (error) {
    next(error);
  }
};
