import express from 'express';
import { addReply, toggleHelpful } from '../controllers/queriesController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all query interactions
router.use(protect);

router.post('/:id/reply', addReply);
router.post('/:id/helpful', toggleHelpful);

export default router;
