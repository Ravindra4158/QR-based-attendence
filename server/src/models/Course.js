import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, required: true, uppercase: true, trim: true },
  section: { type: String, default: 'A', trim: true },
  room: { type: String, default: '', trim: true },
  schedule: { type: String, default: 'Mon, Wed • 09:00 AM - 10:30 AM', trim: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  enrolledStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

export default mongoose.model('Course', courseSchema);