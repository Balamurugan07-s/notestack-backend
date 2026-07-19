import express from 'express';
import {
  uploadNote,
  getNotes,
  getNoteById,
  updateNote,
  deleteNote,
  getDownloadUrl,
  downloadFileSecure,
  getPublicStats,
} from '../controllers/notesController.js';
import { addQuery, getQueries } from '../controllers/queriesController.js';
import { toggleBookmark } from '../controllers/usersController.js';
import { protect } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { generalLimiter } from '../middleware/security.js';

const router = express.Router();

// Secure download delivery (Secured by cryptographic token validation, rate-limited)
router.get('/download/secure/:token', generalLimiter, downloadFileSecure);

// Public stats route
router.get('/public/stats', getPublicStats);

// Protect all note management routes below
router.use(protect);

router.route('/')
  .get(getNotes)
  .post(upload.single('file'), uploadNote);

router.route('/:id')
  .get(getNoteById)
  .put(updateNote)
  .delete(deleteNote);

router.get('/:id/download', getDownloadUrl);

// Threaded query comments scoped to notes
router.route('/:id/queries')
  .get(getQueries)
  .post(addQuery);

// Bookmark toggle routing
router.post('/:id/bookmark', toggleBookmark);

export default router;
