import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  date: { type: Date, default: Date.now },
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  currentToken: { type: String, required: true },
  tokenExpiresAt: { type: Date, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('Session', sessionSchema);