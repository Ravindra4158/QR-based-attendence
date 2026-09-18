import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  scannedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['present', 'late'], default: 'present' }
});

attendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });
export default mongoose.model('Attendance', attendanceSchema);