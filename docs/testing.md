# Test Plan — QR Attendance System

## 1. Test Objectives

Verify:

- Authentication.
- Role authorization.
- Course ownership.
- Session lifecycle.
- QR rotation.
- Token expiry.
- Attendance marking.
- Duplicate prevention.
- Student percentage calculation.
- Live dashboard updates.
- CSV export.
- Browser compatibility.
- Performance targets.

The original test plan explicitly covers valid scan, expired token, duplicate scan, unauthorized access, inactive session, and attendance percentage. fileciteturn0file0L201-L220

---

## 2. Functional Test Cases

| ID | Test | Expected Result |
|---|---|---|
| TC-01 | Register student | Student created |
| TC-02 | Register teacher | Teacher created |
| TC-03 | Login valid credentials | JWT returned |
| TC-04 | Login invalid password | Authentication rejected |
| TC-05 | Student accesses teacher route | 403 |
| TC-06 | Teacher creates course | Course created |
| TC-07 | Unauthorized teacher edits another course | Rejected |
| TC-08 | Teacher starts session | Active session created |
| TC-09 | QR rotates | New token displayed |
| TC-10 | Valid scan within expiry | Attendance recorded |
| TC-11 | Expired scan | QR expired error |
| TC-12 | Duplicate scan | Already marked |
| TC-13 | Scan after stop | Session closed |
| TC-14 | Non-enrolled student scans | Rejected |
| TC-15 | Teacher sees live attendance | Record appears |
| TC-16 | Student views percentage | Correct percentage |
| TC-17 | Teacher exports CSV | Valid CSV generated |

---

## 3. Exact Source Test Scenarios

### Valid scan

Teacher starts session → student immediately scans.

Expected:

```text
Attendance recorded
+
Teacher dashboard updates instantly
```

### Expired token

Student scans QR image older than eight seconds.

Expected:

```text
QR expired
```

### Duplicate

Same student scans twice.

Expected:

```text
already marked
```

### Unauthorized

Attendance request without valid JWT.

Expected:

```text
401 Unauthorized
```

### Closed session

Teacher stops session → student scans.

Expected:

```text
session closed
```

### Percentage

8 attended out of 10.

Expected:

```text
80%
```

These scenarios are directly specified by the original test table. fileciteturn0file0L203-L220

---

## 4. API Tests

Use Postman/Newman or another HTTP test runner.

Test:

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

---

## 5. Concurrency Test

Target from source:

```text
≥ 200 concurrent students
```

Test model:

```text
200 authenticated clients
        │
        ├── scan same current QR
        │
        ▼
POST /api/attendance/mark
```

Measure:

- Response time.
- Error rate.
- Database write rate.
- Duplicate handling.
- Socket update behavior.

The source requires support for at least 200 concurrent students in a session window. fileciteturn0file0L97-L104

---

## 6. Performance Test

Target:

```text
Average QR validation API response < 300 ms
```

Test with realistic database state.

Do not evaluate only an empty development database.

---

## 7. Security Tests

- Invalid JWT.
- Expired JWT.
- Wrong role.
- Another student's ID in request.
- Another teacher's course ID.
- Invalid session ID.
- Expired token.
- Reused token.
- Duplicate attendance.
- Malformed JSON.
- Excessively large input.
- Authentication brute-force behavior.

---

## 8. Browser Tests

Test:

- Chrome desktop.
- Chrome mobile.
- Safari mobile.
- Edge desktop.

Verify:

- Camera permission.
- QR scan.
- Responsive teacher QR display.
- Socket reconnect.
- Browser refresh.
- CSV download.

The source explicitly targets modern Chrome, Safari, and Edge browsers. fileciteturn0file0L97-L104

---

## 9. Regression Checklist

Before every demo/release:

```text
[ ] Login works
[ ] Teacher can create course
[ ] Teacher can start session
[ ] QR appears
[ ] QR rotates
[ ] Student scanner opens
[ ] Valid scan succeeds
[ ] Expired QR fails
[ ] Duplicate fails
[ ] Closed session fails
[ ] Live count updates
[ ] Student percentage is correct
[ ] CSV exports
[ ] Refresh does not lose session/attendance data
[ ] Production environment variables are configured
[ ] HTTPS works
```
