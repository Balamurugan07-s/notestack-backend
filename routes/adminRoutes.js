import express from 'express';
import {
  getFlaggedNotes,
  moderateNoteStatus,
  getUsers,
  changeUserRole,
  getPlatformAnalytics,
} from '../controllers/adminController.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Double protection: require authentication AND admin authorization role check
router.use(protect);
router.use(adminOnly);

router.get('/notes/flagged', getFlaggedNotes);
router.put('/notes/:id/status', moderateNoteStatus);
router.get('/users', getUsers);
router.put('/users/:id/role', changeUserRole);
router.get('/analytics', getPlatformAnalytics);

export default router;
