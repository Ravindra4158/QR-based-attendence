# Implementation Details — QR Attendance System

## 1. Backend Modules

```text
server/src/
├── config/
│   └── db.js
├── controllers/
│   ├── auth.controller.js
│   ├── course.controller.js
│   ├── session.controller.js
│   └── attendance.controller.js
├── middleware/
│   ├── auth.middleware.js
│   ├── role.middleware.js
│   └── error.middleware.js
├── models/
│   ├── User.js
│   ├── Course.js
│   ├── Session.js
│   └── Attendance.js
├── routes/
│   ├── auth.routes.js
│   ├── course.routes.js
│   ├── session.routes.js
│   └── attendance.routes.js
├── services/
│   ├── auth.service.js
│   ├── session.service.js
│   ├── qr.service.js
│   └── attendance.service.js
├── sockets/
│   └── session.socket.js
└── server.js
```

---

## 2. Attendance Service Pseudocode

```text
markAttendance(user, sessionId, token):

    require user.role == "student"

    session = find session by sessionId

    if session does not exist:
        reject SESSION_NOT_FOUND

    if session.isActive == false:
        reject SESSION_CLOSED

    course = find course by session.courseId

    if user._id is not in course.enrolledStudents:
        reject NOT_ENROLLED

    if token != session.currentToken:
        reject INVALID_QR

    if serverNow >= session.tokenExpiresAt:
        reject QR_EXPIRED

    try:
        attendance = insert:
            sessionId = session._id
            studentId = user._id
            scannedAt = serverNow
            status = "present"

    if unique constraint fails:
        reject ALREADY_MARKED

    emit attendance:marked

    return success
```

---

## 3. QR Rotation Service

Pseudo-implementation:

```text
startRotation(sessionId):

    every configured interval:

        session = load active session

        if session does not exist:
            stop timer

        if session.isActive == false:
            stop timer

        token = cryptographicallyRandomToken()

        expiry = serverNow + configuredTTL

        update session:
            currentToken = token
            tokenExpiresAt = expiry

        emit session:token
```

Important: the exact token rotation mechanism should have one authoritative server-side timer. Do not let each teacher browser independently generate what it considers to be the valid token.

---

## 4. Frontend Teacher Flow

```text
Teacher Dashboard
      │
      ├── Select course
      │
      └── Start session
              │
              ▼
        Session screen
              │
              ├── Socket connection
              ├── Current QR
              ├── Expiry countdown
              ├── Attendance count
              └── Student list
```

On refresh:

```text
load active session
      ↓
connect Socket.IO
      ↓
request/recover current token
      ↓
restore dashboard
```

---

## 5. Frontend Student Flow

```text
Student Dashboard
      │
      ▼
Mark Attendance
      │
      ▼
Camera permission
      │
      ▼
QR scanner
      │
      ▼
Decode sessionId/token
      │
      ▼
POST /api/attendance/mark
      │
      ├── success → Present
      ├── expired → Rescan
      ├── duplicate → Already marked
      └── closed → Session closed
```

---

## 6. State Management

Minimum frontend state:

### Authentication

```js
{
  user,
  token,
  isAuthenticated
}
```

### Teacher session

```js
{
  sessionId,
  courseId,
  currentToken,
  tokenExpiresAt,
  isActive,
  attendanceCount,
  students
}
```

### Student scan

```js
{
  scannerOpen,
  status,
  message
}
```

---

## 7. Socket.IO Events

Suggested payloads.

### `session:token`

```json
{
  "sessionId": "...",
  "token": "...",
  "expiresAt": "..."
}
```

### `attendance:marked`

```json
{
  "sessionId": "...",
  "attendance": {
    "studentId": "...",
    "studentName": "...",
    "rollNo": "...",
    "scannedAt": "...",
    "status": "present"
  }
}
```

### `session:stopped`

```json
{
  "sessionId": "..."
}
```

---

## 8. QR Rendering

Teacher browser receives:

```json
{
  "sessionId": "...",
  "token": "..."
}
```

It serializes the payload:

```text
{"sessionId":"...","token":"..."}
```

and renders it using a QR component.

The QR must be large enough for projector readability.

---

## 9. Attendance Percentage Query

Conceptually:

```text
total completed sessions for course
            ↓
attendance records for student
            ↓
count attended
            ↓
(attended / total) × 100
```

Example:

```text
8 / 10 × 100 = 80%
```

---

## 10. CSV Generation

Recommended CSV shape:

```csv
Student Name,Roll No,Email,Session Date,Start Time,End Time,Status,Scanned At
Student A,21IT001,a@example.com,2026-09-18,10:00,11:00,present,2026-09-18T10:03:21Z
```

The source explicitly requires course/session CSV export as part of the planned feature set. fileciteturn0file0L182-L200

---

## 11. Error Handling

Backend should use centralized error handling.

Example:

```js
next({
  status: 400,
  code: "QR_EXPIRED",
  message: "QR expired, please rescan"
});
```

Frontend should map machine-readable codes to user-friendly messages.

---

## 12. Logging

Log:

- Server start.
- Database connection.
- Session start/stop.
- Token rotation failures.
- Attendance validation failures.
- Unexpected exceptions.

Do not log:

- Passwords.
- JWT secrets.
- Full access tokens.
- Sensitive personal information unnecessarily.

---

## 13. Implementation Order

```text
1. Models
2. Database connection
3. Auth
4. JWT middleware
5. Role middleware
6. Course API
7. Session API
8. Token service
9. Socket.IO
10. Attendance API
11. Student scanner
12. Teacher dashboard
13. Student dashboard
14. CSV export
15. Testing
16. Deployment
```
