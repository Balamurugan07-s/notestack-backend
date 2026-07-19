import mongoose from 'mongoose';

const QuerySchema = new mongoose.Schema(
  {
    note: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Note',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    parentQuery: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Query',
      default: null, // If null, this is a top-level thread query. Otherwise, it is a reply.
    },
    content: {
      type: String,
      required: [true, 'Please enter your query or comment'],
      trim: true,
    },
    helpfulVotes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Query = mongoose.model('Query', QuerySchema);
export default Query;
