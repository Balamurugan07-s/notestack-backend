import mongoose from 'mongoose';

const NoteSchema = new mongoose.Schema(
  {
    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'Please provide a title'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Please provide a description'],
    },
    subject: {
      type: String,
      required: [true, 'Please provide a subject/course name'],
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    fileUrl: {
      type: String,
      required: [true, 'Please provide the file URL'],
    },
    fileKey: {
      type: String,
      required: [true, 'Please provide a storage file key'],
    },
    fileType: {
      type: String,
      required: true,
      enum: ['pdf', 'docx', 'png', 'jpg', 'jpeg', 'txt'],
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'flagged'],
      default: 'approved', // Dev default is auto-approved, but can be flagged
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for search performance
NoteSchema.index({ title: 'text', description: 'text', subject: 'text', tags: 'text' });

const Note = mongoose.model('Note', NoteSchema);
export default Note;
