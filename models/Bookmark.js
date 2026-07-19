import mongoose from 'mongoose';

const BookmarkSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    note: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Note',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate bookmarks for the same note by the same user
BookmarkSchema.index({ user: 1, note: 1 }, { unique: true });

const Bookmark = mongoose.model('Bookmark', BookmarkSchema);
export default Bookmark;
