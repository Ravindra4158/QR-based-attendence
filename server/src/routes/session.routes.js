import { Router } from 'express';
import crypto from 'node:crypto';
import Course from '../models/Course.js';
import Session from '../models/Session.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const ttl = () => Number(process.env.QR_TTL_SECONDS || 8) * 1000;
const sessionDurationMs = () => Number(process.env.SESSION_AUTO_END_MINUTES || 15) * 60 * 1000;
const nextToken = () => ({ token: crypto.randomBytes(24).toString('hex'), expires: new Date(Date.now() + ttl()) });
const publish = (app, session) => app.get('io').to(`session:${session._id}`).emit('session:token', { sessionId: session._id, token: session.currentToken, expiresAt: session.tokenExpiresAt });
const sessionAutoEndTime = session => new Date(session.startTime.getTime() + sessionDurationMs());
const isSessionExpired = session => Date.now() >= sessionAutoEndTime(session).getTime();
async function closeSession(session, endTime = new Date()) {
  if (!session?.isActive) return false;
  session.isActive = false;
  session.endTime = endTime;
  await session.save();
  return true;
}

router.post('/start', requireAuth, requireRole('teacher'), async (req, res, next) => {
  try {
    const course = await Course.findOne({ _id: req.body.courseId, teacherId: req.user.id });
    if (!course) return res.status(404).json({ success: false, code: 'COURSE_NOT_FOUND', message: 'Course not found' });
    const active = await Session.findOne({ courseId: course._id, isActive: true });
    if (active && isSessionExpired(active)) await closeSession(active, sessionAutoEndTime(active));
    if (active?.isActive) return res.status(409).json({ success: false, code: 'SESSION_ACTIVE', message: 'A session is already active' });
    const current = nextToken();
    const session = await Session.create({ courseId: course._id, currentToken: current.token, tokenExpiresAt: current.expires });
    rotate(req.app, session);
    res.status(201).json({ success: true, session });
  } catch (error) { next(error); }
});
router.post('/:id/stop', requireAuth, requireRole('teacher'), async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id).populate('courseId');
    if (!session || session.courseId.teacherId.toString() !== req.user.id) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Session not found' });
    await closeSession(session, new Date());
    res.json({ success: true, session });
  } catch (error) { next(error); }
});
router.get('/:id/token', requireAuth, async (req, res, next) => { try { const session = await Session.findById(req.params.id).populate('courseId', 'teacherId'); if (!session || (req.user.role === 'teacher' && session.courseId.teacherId.toString() !== req.user.id)) return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Session not found' }); res.json({ sessionId: session._id, token: session.currentToken, expiresAt: session.tokenExpiresAt }); } catch (error) { next(error); } });
function rotate(app, session) {
  const timer = setInterval(async () => {
    const current = await Session.findById(session._id);
    if (!current?.isActive) return clearInterval(timer);
    if (isSessionExpired(current)) {
      await closeSession(current, sessionAutoEndTime(current));
      return clearInterval(timer);
    }
    const next = nextToken();
    current.currentToken = next.token;
    current.tokenExpiresAt = next.expires;
    await current.save();
    publish(app, current);
  }, ttl());
}
export default router;