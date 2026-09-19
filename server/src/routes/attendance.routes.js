import { Router } from 'express';
import Attendance from '../models/Attendance.js';
import Course from '../models/Course.js';
import Session from '../models/Session.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

import User from '../models/User.js';

const router = Router();
const sessionDurationMs = () => Number(process.env.SESSION_AUTO_END_MINUTES || 15) * 60 * 1000;
const sessionAutoEndTime = session => new Date(session.startTime.getTime() + sessionDurationMs());
const isSessionExpired = session => Date.now() >= sessionAutoEndTime(session).getTime();

router.post('/mark', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const { sessionId, token } = req.body;
    const session = await Session.findById(sessionId);
    if (session?.isActive && isSessionExpired(session)) {
      session.isActive = false;
      session.endTime = sessionAutoEndTime(session);
      await session.save();
    }
    if (!session || !session.isActive) return res.status(400).json({ success: false, code: 'SESSION_CLOSED', message: 'Session is closed' });
    const course = await Course.findById(session.courseId);
    if (!course) return res.status(404).json({ success: false, code: 'COURSE_NOT_FOUND', message: 'Course not found' });
    
    // Auto-enroll student into course if not enrolled yet
    if (!course.enrolledStudents.some(id => id.toString() === req.user.id)) {
      course.enrolledStudents.push(req.user.id);
      await course.save();
    }

    if (token !== session.currentToken) return res.status(400).json({ success: false, code: 'INVALID_QR', message: 'This QR code is no longer current' });
    if (Date.now() >= session.tokenExpiresAt.getTime()) return res.status(400).json({ success: false, code: 'QR_EXPIRED', message: 'QR expired, please rescan' });
    
    const attendance = await Attendance.create({ sessionId, studentId: req.user.id });
    let populatedAttendance = await Attendance.findById(attendance._id).populate('studentId', 'name rollNo email');

    if (!populatedAttendance || !populatedAttendance.studentId || typeof populatedAttendance.studentId !== 'object' || !populatedAttendance.studentId.name) {
      const userDoc = await User.findById(req.user.id).select('name rollNo email');
      const attObj = populatedAttendance ? populatedAttendance.toObject() : attendance.toObject();
      attObj.studentId = userDoc 
        ? { _id: userDoc._id, name: userDoc.name, rollNo: userDoc.rollNo, email: userDoc.email }
        : { _id: req.user.id, name: req.user.name || 'Student', rollNo: 'N/A' };
      populatedAttendance = attObj;
    }

    const io = req.app.get('io');
    if (io) {
      const sIdStr = session._id.toString();
      io.to(`session:${sIdStr}`).emit('attendance:marked', { sessionId: sIdStr, attendance: populatedAttendance });
      if (sessionId && sessionId !== sIdStr) {
        io.to(`session:${sessionId}`).emit('attendance:marked', { sessionId, attendance: populatedAttendance });
      }
      io.emit('attendance:marked', { sessionId: sIdStr, attendance: populatedAttendance });
    }

    res.status(201).json({ success: true, message: 'Attendance marked successfully', attendance: populatedAttendance });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, code: 'ALREADY_MARKED', message: 'Attendance already marked for this session' });
    next(error);
  }
});

router.get('/session/:id', requireAuth, requireRole('teacher'), async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id).populate('courseId', 'teacherId');
    if (!session || session.courseId.teacherId.toString() !== req.user.id) {
      return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Session not found' });
    }
    const students = await Attendance.find({ sessionId: req.params.id }).populate('studentId', 'name rollNo email').sort({ scannedAt: 1 });
    const formattedStudents = await Promise.all(students.map(async st => {
      if (st.studentId && typeof st.studentId === 'object' && st.studentId.name) return st;
      const userDoc = await User.findById(st.studentId).select('name rollNo email');
      const obj = st.toObject();
      obj.studentId = userDoc ? { _id: userDoc._id, name: userDoc.name, rollNo: userDoc.rollNo, email: userDoc.email } : { _id: st.studentId, name: 'Student', rollNo: 'N/A' };
      return obj;
    }));
    res.json({ success: true, sessionId: req.params.id, count: formattedStudents.length, students: formattedStudents });
  } catch (error) { next(error); }
});

router.get('/student/:studentId/course/:courseId', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    if (req.params.studentId !== req.user.id) return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'You can only view your own attendance' });
    const sessions = await Session.find({ courseId: req.params.courseId, isActive: false }).select('_id');
    const attended = await Attendance.countDocuments({ studentId: req.user.id, sessionId: { $in: sessions.map(session => session._id) } });
    res.json({ success: true, courseId: req.params.courseId, attended, total: sessions.length, percentage: sessions.length ? Math.round((attended / sessions.length) * 10000) / 100 : 0 });
  } catch (error) { next(error); }
});

router.get('/history', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const records = await Attendance.find({ studentId: req.user.id })
      .populate({
        path: 'sessionId',
        populate: { path: 'courseId', select: 'title code section room schedule' }
      })
      .sort({ scannedAt: -1 });
    res.json({ success: true, history: records });
  } catch (error) { next(error); }
});

router.get('/student/:studentId/history', requireAuth, requireRole('teacher'), async (req, res, next) => {
  try {
    const student = await User.findById(req.params.studentId).select('name rollNo email');
    if (!student) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Student not found' });
    
    const records = await Attendance.find({ studentId: req.params.studentId })
      .populate({
        path: 'sessionId',
        populate: { path: 'courseId', select: 'title code section room schedule' }
      })
      .sort({ scannedAt: -1 });

    const courses = await Course.find({ enrolledStudents: req.params.studentId });
    const courseStats = await Promise.all(courses.map(async c => {
      const sessions = await Session.find({ courseId: c._id, isActive: false }).select('_id');
      const attended = await Attendance.countDocuments({
        studentId: req.params.studentId,
        sessionId: { $in: sessions.map(s => s._id) }
      });
      return {
        courseId: c._id,
        code: c.code,
        title: c.title,
        attended,
        total: sessions.length,
        percentage: sessions.length ? Math.round((attended / sessions.length) * 1000) / 10 : 0
      };
    }));

    res.json({
      success: true,
      student,
      courseStats,
      history: records
    });
  } catch (error) { next(error); }
});

router.get('/export/:courseId', requireAuth, requireRole('teacher'), async (req, res, next) => {
  try {
    const course = await Course.findOne({ _id: req.params.courseId, teacherId: req.user.id });
    if (!course) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Course not found' });
    const sessions = await Session.find({ courseId: course._id, isActive: false }).sort({ startTime: 1 });
    const records = await Attendance.find({ sessionId: { $in: sessions.map(session => session._id) } }).populate('studentId', 'name rollNo email').populate('sessionId', 'date startTime endTime');
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = ['Student Name,Roll No,Email,Session Date,Start Time,End Time,Status,Scanned At'];
    for (const record of records) rows.push([record.studentId.name, record.studentId.rollNo, record.studentId.email, record.sessionId.date.toISOString(), record.sessionId.startTime.toISOString(), record.sessionId.endTime?.toISOString(), record.status, record.scannedAt.toISOString()].map(escape).join(','));
    res.type('text/csv').attachment(`${course.code}-attendance.csv`).send(rows.join('\n'));
  } catch (error) { next(error); }
});

export default router;