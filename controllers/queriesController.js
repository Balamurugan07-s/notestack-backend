import Query from '../models/Query.js';
import Note from '../models/Note.js';

// @desc    Add a top-level query/comment to a note
// @route   POST /api/notes/:id/queries
// @access  Private
export const addQuery = async (req, res, next) => {
  try {
    const { content } = req.body;
    const noteId = req.params.id;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Please enter a comment' });
    }

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    const query = await Query.create({
      note: noteId,
      user: req.user._id,
      content,
    });

    // Populate user info for immediate display
    const populatedQuery = await Query.findById(query._id).populate('user', 'name role');

    res.status(201).json({
      success: true,
      message: 'Comment posted successfully',
      query: populatedQuery,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all queries for a specific note (threaded)
// @route   GET /api/notes/:id/queries
// @access  Private
export const getQueries = async (req, res, next) => {
  try {
    const noteId = req.params.id;

    // Fetch all queries for this note
    const allQueries = await Query.find({ note: noteId })
      .populate('user', 'name role')
      .sort({ createdAt: 1 }); // Oldest first to preserve chronological conversation

    // Organize queries into threads
    const topLevelQueries = [];
    const repliesMap = {};

    allQueries.forEach((q) => {
      if (q.parentQuery === null) {
        topLevelQueries.push(q.toObject());
      } else {
        const parentId = q.parentQuery.toString();
        if (!repliesMap[parentId]) {
          repliesMap[parentId] = [];
        }
        repliesMap[parentId].push(q.toObject());
      }
    });

    // Nest replies within top level queries
    const threadedQueries = topLevelQueries.map((tq) => {
      tq.replies = repliesMap[tq._id.toString()] || [];
      return tq;
    });

    // Sort top level queries: newest at the top
    threadedQueries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json({
      success: true,
      queries: threadedQueries,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reply to an existing query
// @route   POST /api/queries/:id/reply
// @access  Private
export const addReply = async (req, res, next) => {
  try {
    const { content } = req.body;
    const parentQueryId = req.params.id;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Please enter a reply' });
    }

    const parentQuery = await Query.findById(parentQueryId);
    if (!parentQuery) {
      return res.status(404).json({ success: false, error: 'Original thread query not found' });
    }

    const query = await Query.create({
      note: parentQuery.note,
      user: req.user._id,
      parentQuery: parentQueryId,
      content,
    });

    const populatedReply = await Query.findById(query._id).populate('user', 'name role');

    res.status(201).json({
      success: true,
      message: 'Reply posted successfully',
      reply: populatedReply,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark a query as helpful (upvote toggle)
// @route   POST /api/queries/:id/helpful
// @access  Private
export const toggleHelpful = async (req, res, next) => {
  try {
    const query = await Query.findById(req.params.id);

    if (!query) {
      return res.status(404).json({ success: false, error: 'Query not found' });
    }

    const userId = req.user._id;
    const alreadyVoted = query.helpfulVotes.includes(userId);

    if (alreadyVoted) {
      // Remove upvote
      query.helpfulVotes = query.helpfulVotes.filter((id) => id.toString() !== userId.toString());
    } else {
      // Add upvote
      query.helpfulVotes.push(userId);
    }

    await query.save();

    res.status(200).json({
      success: true,
      helpfulVotesCount: query.helpfulVotes.length,
      isHelpful: !alreadyVoted,
    });
  } catch (error) {
    next(error);
  }
};
