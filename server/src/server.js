import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { connectDatabase } from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import courseRoutes from './routes/course.routes.js';
import sessionRoutes from './routes/session.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

const app = express();
const httpServer = http.createServer(app);

const isDev = process.env.NODE_ENV !== 'production';
const corsEnv = process.env.CORS_ORIGIN;
const allowedOrigins = (isDev || !corsEnv || corsEnv.trim() === '*')
  ? true  // allow all origins
  : corsEnv.split(',').map(o => o.trim()).filter(Boolean);

const io = new Server(httpServer, { cors: { origin: allowedOrigins } });
app.set('io', io);
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: allowedOrigins }));
app.use(compression());
app.use(express.json());

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/attendance/mark', rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, service: 'attendly-api' }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/attendance', attendanceRoutes);

// Serve frontend static files from project root
const frontendRoot = path.resolve(__dirname, '../..');
app.use(express.static(frontendRoot, { index: 'index.html' }));
app.get('*', (_req, res) => res.sendFile(path.join(frontendRoot, 'index.html')));

// Global error handler
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'Something went wrong' });
});

// Socket.IO auth middleware
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token?.replace('Bearer ', '');
    if (!token) return next(new Error('Unauthorized'));
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { next(new Error('Unauthorized')); }
});

io.on('connection', socket => {
  socket.on('session:join', sessionId => socket.join(`session:${sessionId}`));
});

const port = Number(process.env.PORT || 4000);
connectDatabase()
  .then(() => httpServer.listen(port, () => {
    console.log(`🚀 Attendly API + UI  →  http://localhost:${port}`);
    
    // Auto Keep-Alive for Render (self-pings /health every 12 mins to prevent sleep)
    const renderUrl = process.env.RENDER_EXTERNAL_URL || process.env.SELF_PING_URL;
    if (renderUrl) {
      console.log(`📡 Render Keep-Alive active: ${renderUrl}`);
      setInterval(() => {
        const https = require('node:https');
        const httpLib = renderUrl.startsWith('https') ? https : http;
        httpLib.get(`${renderUrl}/health`, (res) => {
          console.log(`[Keep-Alive Ping] /health -> ${res.statusCode}`);
        }).on('error', (err) => console.log(`[Keep-Alive Ping Error]: ${err.message}`));
      }, 12 * 60 * 1000);
    }
  }))
  .catch(error => { console.error(error.message); process.exit(1); });

process.on('SIGTERM', () => httpServer.close(() => process.exit(0)));