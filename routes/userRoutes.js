import express from 'express';
import {
  getProfile,
  updateProfile,
  updatePassword,
  gdprDeleteAccount,
  getBookmarks,
} from '../controllers/usersController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Enforce authentication for all user management paths
router.use(protect);

router.route('/me')
  .get(getProfile)
  .put(updateProfile)
  .delete(gdprDeleteAccount); // GDPR purge account & files

router.put('/me/password', updatePassword);
router.get('/bookmarks', getBookmarks);

export default router;
