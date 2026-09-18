# API Specification — QR Attendance System

## 1. API Conventions

Base URL:

```text
/api
```

Content type:

```text
application/json
```

Authentication:

```http
Authorization: Bearer <JWT>
```

Protected endpoints must reject missing or invalid authentication.

---

## 2. Authentication

### POST `/api/auth/register`

Register a student or teacher.

Request:

```json
{
  "name": "Ravi",
  "email": "ravi@example.com",
  "password": "strong-password",
  "role": "student",
  "rollNo": "21IT001"
}
```

Response:

```json
{
  "success": true,
  "user": {
    "id": "...",
    "name": "Ravi",
    "email": "ravi@example.com",
    "role": "student",
    "rollNo": "21IT001"
  }
}
```

### POST `/api/auth/login`

Request:

```json
{
  "email": "ravi@example.com",
  "password": "strong-password"
}
```

Response:

```json
{
  "success": true,
  "token": "<JWT>",
  "user": {
    "id": "...",
    "name": "Ravi",
    "role": "student"
  }
}
```

The source defines register/login as public endpoints and login as returning a JWT. fileciteturn0file0L182-L185

---

## 3. Courses

### POST `/api/courses`

**Auth:** Teacher

Request:

```json
{
  "title": "Data Structures",
  "code": "CS301"
}
```

Behavior:

- Verify teacher role.
- Create course.
- Set `teacherId` from authenticated user.
- Initialize roster.

### GET `/api/courses/:id`

**Auth:** Teacher/Student

Returns:

- Course details.
- Teacher information where appropriate.
- Roster according to authorization.

Source endpoint: fileciteturn0file0L186-L188

---

## 4. Sessions

### POST `/api/sessions/start`

**Auth:** Teacher

Request:

```json
{
  "courseId": "<course-id>"
}
```

Server:

1. Verify teacher owns course.
2. Ensure a conflicting active session does not already exist.
3. Create random token.
4. Set expiry to current server time + configured lifetime.
5. Set `isActive=true`.
6. Return session information.

Response:

```json
{
  "success": true,
  "session": {
    "id": "...",
    "courseId": "...",
    "isActive": true,
    "tokenExpiresAt": "..."
  }
}
```

### POST `/api/sessions/:id/stop`

**Auth:** Teacher

Behavior:

- Verify teacher ownership.
- Set `isActive=false`.
- Set end time.
- Stop token rotation.
- Broadcast session closure.

The source defines start/stop endpoints and teacher authorization. fileciteturn0file0L189-L192

---

## 5. Current Token

The original document lists:

```text
GET /api/sessions/:id/token
```

but notes that current token/expiry is delivered via Socket.IO.

Recommended implementation:

- REST endpoint for initial/recovery state.
- Socket.IO for continuous updates.

Response:

```json
{
  "sessionId": "...",
  "token": "...",
  "expiresAt": "..."
}
```

Source endpoint specification: fileciteturn0file0L193-L194

---

## 6. Mark Attendance

### POST `/api/attendance/mark`

**Auth:** Student

Request:

```json
{
  "sessionId": "<session-id>",
  "token": "<scanned-token>"
}
```

The authenticated user's ID must be obtained from the JWT rather than trusted from a client-supplied `studentId`.

Validation order:

```text
JWT valid?
   ↓
Student role?
   ↓
Session exists?
   ↓
Session active?
   ↓
Course exists?
   ↓
Student enrolled?
   ↓
Token equals currentToken?
   ↓
Current time < tokenExpiresAt?
   ↓
Already marked?
   ↓
Create attendance
```

Success:

```json
{
  "success": true,
  "message": "Attendance marked successfully",
  "attendance": {
    "sessionId": "...",
    "studentId": "...",
    "scannedAt": "...",
    "status": "present"
  }
}
```

Error codes:

```text
QR_EXPIRED
INVALID_QR
SESSION_CLOSED
NOT_ENROLLED
ALREADY_MARKED
UNAUTHORIZED
```

The source specifies `POST /api/attendance/mark` and requires active-session, token-match, expiry, and duplicate validation. fileciteturn0file0L195-L196

---

## 7. Teacher Attendance

### GET `/api/attendance/session/:id`

**Auth:** Teacher

Returns the live list/count of students marked for a session.

Response:

```json
{
  "success": true,
  "sessionId": "...",
  "count": 42,
  "students": [
    {
      "studentId": "...",
      "name": "Student Name",
      "rollNo": "21IT001",
      "scannedAt": "...",
      "status": "present"
    }
  ]
}
```

Source endpoint: fileciteturn0file0L197-L197

---

## 8. Student Attendance Percentage

### GET `/api/attendance/student/:id/course/:courseId`

**Auth:** Student

Recommended authorization:

- The `:id` must equal the authenticated student ID.

Response:

```json
{
  "success": true,
  "courseId": "...",
  "attended": 8,
  "total": 10,
  "percentage": 80
}
```

Source endpoint and example calculation: fileciteturn0file0L198-L200

---

## 9. CSV Export

### GET `/api/attendance/export/:courseId`

**Auth:** Teacher

Behavior:

- Verify teacher owns course.
- Query sessions and attendance.
- Generate CSV.
- Return downloadable response.

Suggested columns:

```text
Student Name
Roll No
Email
Session Date
Session Start
Session End
Status
Scanned At
```

Source defines course attendance CSV export. fileciteturn0file0L200-L200

---

## 10. HTTP Status Codes

| Status | Meaning |
|---|---|
| 200 | Successful read/action |
| 201 | Resource created |
| 400 | Invalid request/business validation |
| 401 | Missing/invalid authentication |
| 403 | Authenticated but not authorized |
| 404 | Resource not found |
| 409 | Duplicate/conflicting operation |
| 500 | Unexpected server error |

---

## 11. Error Format

Use a consistent shape:

```json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "Human-readable message"
}
```

---

## 12. API Security Rules

- Validate request bodies.
- Sanitize appropriate user-controlled text.
- Never trust role from request body for protected operations.
- Never trust `studentId` from attendance request.
- Verify teacher ownership.
- Rate-limit authentication and attendance endpoints where appropriate.
- Do not expose password hashes.
- Do not return JWT secrets.
