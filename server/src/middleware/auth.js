import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Login required' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
}

export function requireRole(role) {
  return (req, res, next) => req.user.role === role
    ? next()
    : res.status(403).json({ success: false, code: 'FORBIDDEN', message: `${role} access required` });
}