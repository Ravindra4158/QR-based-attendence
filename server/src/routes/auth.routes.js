import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Course from '../models/Course.js';
import Session from '../models/Session.js';
import Attendance from '../models/Attendance.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const publicUser = user => ({ id: user._id, name: user.name, email: user.email, role: user.role, rollNo: user.rollNo, createdAt: user.createdAt });

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role, rollNo } = req.body;
    if (!name || !email || !password || !['student', 'teacher'].includes(role)) {
      return res.status(400).json({ success: false, code: 'INVALID_INPUT', message: 'Name, email, password, and role are required' });
    }
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 12), role, rollNo });
    
    // Auto-enroll new student in all existing courses
    if (role === 'student') {
      await Course.updateMany({}, { $addToSet: { enrolledStudents: user._id } });
    }

    res.status(201).json({ success: true, user: publicUser(user) });
  } catch (error) { next(error); }
});

router.post('/login', async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user || !(await bcrypt.compare(req.body.password || '', user.password))) {
      return res.status(401).json({ success: false, code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' });
    }
    const token = jwt.sign({ id: user._id.toString(), role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: publicUser(user) });
  } catch (error) { next(error); }
});

// Get profile of current user
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'User not found' });
    res.json({ success: true, user: publicUser(user) });
  } catch (error) { next(error); }
});

// Update profile details
router.put('/profile', requireAuth, async (req, res, next) => {
  try {
    const { name, email, rollNo } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;
    if (rollNo && req.user.role === 'student') updates.rollNo = rollNo;

    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
    res.json({ success: true, user: publicUser(user) });
  } catch (error) { next(error); }
});

// Get all students directory with attendance stats (Teacher only)
router.get('/students', requireAuth, requireRole('teacher'), async (req, res, next) => {
  try {
    const students = await User.find({ role: 'student' }).select('name email rollNo createdAt').sort({ rollNo: 1, name: 1 });
    const courses = await Course.find({ teacherId: req.user.id }).select('title code enrolledStudents');
    
    const studentList = await Promise.all(students.map(async st => {
      const enrolled = courses.filter(c => c.enrolledStudents.some(id => id.toString() === st._id.toString()));
      const enrolledCourseIds = enrolled.map(c => c._id);
      const pastSessions = await Session.find({ courseId: { $in: enrolledCourseIds }, isActive: false }).select('_id');
      const totalSessions = pastSessions.length;
      const attendedSessions = await Attendance.countDocuments({
        studentId: st._id,
        sessionId: { $in: pastSessions.map(s => s._id) }
      });

      const overallPct = totalSessions > 0 ? Math.round((attendedSessions / totalSessions) * 1000) / 10 : 100;

      return {
        id: st._id,
        name: st.name,
        email: st.email,
        rollNo: st.rollNo || 'N/A',
        createdAt: st.createdAt,
        coursesCount: enrolled.length,
        courses: enrolled.map(c => ({ id: c._id, code: c.code, title: c.title })),
        totalSessions,
        attendedSessions,
        overallPct,
      };
    }));

    res.json({ success: true, students: studentList });
  } catch (error) { next(error); }
});

export default router;