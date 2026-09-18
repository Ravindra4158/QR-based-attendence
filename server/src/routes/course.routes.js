import { Router } from 'express';
import Course from '../models/Course.js';
import User from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Create new course / subject (Teacher only)
router.post('/', requireAuth, requireRole('teacher'), async (req, res, next) => {
  try {
    const { title, code, section, room, schedule } = req.body;
    if (!title || !code) {
      return res.status(400).json({ success: false, code: 'INVALID_INPUT', message: 'Title and Code are required' });
    }
    
    // Auto-enroll all existing students by default if not specified
    const allStudents = await User.find({ role: 'student' }).select('_id');
    const studentIds = allStudents.map(s => s._id);

    const course = await Course.create({
      title,
      code,
      section: section || 'A',
      room: room || 'Room 101',
      schedule: schedule || 'Mon, Wed • 09:00 AM - 10:30 AM',
      teacherId: req.user.id,
      enrolledStudents: studentIds,
    });

    res.status(201).json({ success: true, course });
  } catch (error) { next(error); }
});

// Get course list with schedule & details
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const filter = req.user.role === 'teacher' ? { teacherId: req.user.id } : { enrolledStudents: req.user.id };
    const courses = await Course.find(filter)
      .select('title code section room schedule teacherId enrolledStudents')
      .populate('teacherId', 'name email')
      .sort({ code: 1 });
    res.json({ success: true, courses });
  } catch (error) { next(error); }
});

// Get specific course detail
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('teacherId', 'name email')
      .populate('enrolledStudents', 'name rollNo email');
    if (!course) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Course not found' });
    res.json({ success: true, course });
  } catch (error) { next(error); }
});

export default router;