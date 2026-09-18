# QR-Code Based Smart Attendance System

A MERN-stack web application for classroom attendance using short-lived rotating QR tokens.

## Core idea

```text
Teacher starts class
       ↓
Server creates short-lived random token
       ↓
QR displayed on teacher screen
       ↓
QR rotates every ~8 seconds
       ↓
Student scans current QR
       ↓
Backend validates
       ↓
Attendance recorded
       ↓
Teacher dashboard updates live
```

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React.js |
| Routing | React Router |
| API client | Axios |
| QR rendering/scanning | QR/browser camera tooling |
| Backend | Node.js + Express.js |
| Database | MongoDB + Mongoose |
| Realtime | Socket.IO |
| Authentication | JWT |
| Password hashing | bcrypt.js |
| Demo frontend hosting | Vercel/Netlify |
| Demo backend hosting | Render/Railway |

This stack follows the supplied PRD/Technical Design. fileciteturn0file0L116-L130

## Documentation

- [`plan.md`](plan.md) — complete implementation roadmap.
- [`prd.md`](prd.md) — product requirements.
- [`system-architecture.md`](system-architecture.md) — architecture and data flow.
- [`database.md`](database.md) — MongoDB schema and integrity rules.
- [`api.md`](api.md) — REST API specification.
- [`security.md`](security.md) — authentication, authorization, and QR security.
- [`testing.md`](testing.md) — test strategy and test cases.
- [`deployment.md`](deployment.md) — production/demo deployment.
- [`implementation.md`](implementation.md) — backend/frontend implementation details.

## Main Roles

### Teacher

- Create course.
- Start/stop attendance session.
- Display rotating QR.
- Monitor live attendance.
- Export attendance.

### Student

- Log in.
- Scan classroom QR.
- View attendance history.
- View course attendance percentage.

## Main Data Model

```text
User
 ├── Teacher → Course
 └── Student → Attendance

Course
 └── Session

Session
 └── Attendance
```

## Main API

```text
POST /api/auth/register
POST /api/auth/login

POST /api/courses
GET  /api/courses/:id

POST /api/sessions/start
POST /api/sessions/:id/stop

POST /api/attendance/mark
GET  /api/attendance/session/:id
GET  /api/attendance/student/:id/course/:courseId
GET  /api/attendance/export/:courseId
```

## v1 Scope

The supplied PRD lists native mobile apps, biometric verification, and multi-institution support as outside v1. Geofencing, notifications, admin analytics, and a native app are future enhancements. fileciteturn0file0L67-L72 fileciteturn0file0L241-L245

## Key Performance Targets

- QR validation average: under 300 ms.
- At least 200 concurrent students in a session window.
- Scan-to-mark flow: 3 taps or fewer.
- Attendance for about 60 students: under 2 minutes.
- Class-hour uptime target: 99%+.

These are project targets defined by the source document. fileciteturn0file0L73-L76 fileciteturn0file0L97-L104

## Important Security Note

Rotating QR tokens reduce the usefulness of screenshots but do not by themselves mathematically prove physical presence. The original design lists geofencing/campus Wi-Fi verification as a future enhancement.

## Development

See `plan.md` for the recommended build order and acceptance criteria.
