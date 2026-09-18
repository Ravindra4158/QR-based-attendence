# Deployment Guide — QR Attendance System

## 1. Deployment Target

The original technical design proposes:

- Frontend: Vercel or Netlify.
- Backend: Render or Railway.
- Database: MongoDB Atlas.

This document turns that architecture into an implementation checklist. fileciteturn0file0L123-L130

---

## 2. Production Components

```text
User Browser
    │
    │ HTTPS
    ▼
React Frontend
    │
    │ REST + WSS
    ▼
Node/Express Backend
    │
    │ MongoDB connection
    ▼
MongoDB Atlas
```

---

## 3. Environment Variables

### Backend

```env
NODE_ENV=production
PORT=8000
MONGODB_URI=<mongodb-atlas-uri>
JWT_SECRET=<strong-secret>
CLIENT_URL=https://<frontend-domain>
QR_TOKEN_TTL_SECONDS=8
```

Never commit real secrets.

### Frontend

```env
VITE_API_URL=https://<backend-domain>
VITE_SOCKET_URL=https://<backend-domain>
```

If Create React App is used instead, use the appropriate environment-variable prefix for that build system.

---

## 4. MongoDB Atlas

Checklist:

```text
[ ] Create database
[ ] Create application DB user
[ ] Configure network access
[ ] Add production connection string
[ ] Create indexes
[ ] Verify backup/retention settings as appropriate
[ ] Test connection from backend
```

Critical index:

```js
db.attendance.createIndex(
  { sessionId: 1, studentId: 1 },
  { unique: true }
)
```

---

## 5. Backend Deployment

Build:

```bash
cd server
npm ci
npm run build
```

If plain Node.js is used without a build step:

```bash
npm ci
npm start
```

Health endpoint recommendation:

```text
GET /health
```

Response:

```json
{
  "status": "ok"
}
```

Production checks:

```text
[ ] Server starts
[ ] MongoDB connects
[ ] JWT works
[ ] CORS allows only frontend
[ ] Socket.IO connection works
[ ] Session token rotation works
[ ] Attendance insertion works
```

---

## 6. Frontend Deployment

```bash
cd client
npm ci
npm run build
```

Deploy the generated production assets to Vercel/Netlify or another static hosting service.

---

## 7. HTTPS

Camera access is generally dependent on a secure browser context in production.

Therefore:

```text
Use HTTPS
```

and make sure the backend WebSocket endpoint is also exposed securely.

---

## 8. CORS

Development may use:

```text
http://localhost:5173
```

Production should use the exact deployed frontend origin.

Avoid:

```text
Access-Control-Allow-Origin: *
```

for an authenticated production application unless the architecture specifically requires it.

---

## 9. Socket.IO Deployment

The teacher dashboard depends on realtime communication.

Verify:

```text
Browser
   │
   ▼
WSS
   │
   ▼
Socket.IO server
```

Test:

- connection,
- authentication if Socket.IO is protected,
- token events,
- attendance events,
- reconnect behavior.

If multiple backend instances are introduced later, configure a shared Socket.IO adapter/broker.

---

## 10. Deployment Smoke Test

After deployment:

1. Register teacher.
2. Register student.
3. Enroll student.
4. Teacher logs in.
5. Teacher creates course.
6. Teacher starts session.
7. QR appears.
8. Student logs in on phone.
9. Student grants camera permission.
10. Student scans QR.
11. Attendance appears.
12. Teacher sees live update.
13. Student checks percentage.
14. Teacher exports CSV.
15. Stop session.
16. Try scanning again and verify rejection.

---

## 11. Rollback

Keep deployments reproducible through:

- Git commits.
- Locked package versions.
- Environment-variable documentation.
- Database migrations/index scripts where needed.

If a release breaks attendance, deploy the last known-good application version and investigate before resuming normal use.

---

## 12. Demo Deployment Checklist

```text
[ ] Frontend deployed
[ ] Backend deployed
[ ] MongoDB connected
[ ] HTTPS active
[ ] Camera works on phone
[ ] Socket.IO works
[ ] Environment variables set
[ ] Sample teacher account
[ ] Sample student accounts
[ ] Sample course
[ ] QR rotation verified
[ ] Expired QR verified
[ ] Duplicate scan verified
[ ] CSV export verified
```
