# Product Requirements Document — QR Attendance System

## 1. Purpose

This PRD defines the product requirements, scope, users, features, success metrics, and acceptance criteria for the QR-Code Based Smart Attendance System.

The original document describes this as a MERN-stack project intended to act as the single reference for development, evaluation, and viva/demo. fileciteturn0file0L20-L24

## 2. Problem

Manual roll calls and registers consume classroom time and can permit proxy attendance. They also make real-time attendance analytics harder for faculty and administration. fileciteturn0file0L25-L28

## 3. Solution

A teacher starts a class session and displays a rotating QR code. The QR contains a short-lived random token. Students scan the currently visible QR with an authenticated device. The backend validates the token and identity before recording attendance. fileciteturn0file0L29-L34

## 4. Personas

### Teacher

Needs:
- Start attendance quickly.
- Display QR.
- See live attendance.
- Stop session.
- Review attendance.
- Export records.

### Student

Needs:
- Scan QR quickly.
- Receive immediate success/failure feedback.
- View attendance history.
- View course percentage.

### Admin — optional/stretch

Needs:
- Manage users/courses.
- Review department-wide records.
- Generate reports.

The source identifies Teacher, Student, and optional Admin personas. fileciteturn0file0L43-L52

## 5. User Stories

- Teacher starts a session so students can mark themselves present.
- Teacher gets automatic QR refresh so screenshots are less useful for proxy attendance.
- Teacher sees students who scanned.
- Teacher exports CSV/PDF where supported by the selected release.
- Student scans using phone camera.
- Student sees percentage per subject.
- Student cannot mark attendance without scanning the live QR.

The PDF export is categorized as a future/optional capability in the original prioritization, while CSV is a core planned capability. fileciteturn0file0L53-L72

## 6. Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Register/login as student or teacher | Must |
| FR-2 | Teacher creates course/session | Must |
| FR-3 | Generate random token and rotate every N seconds, default 8s | Must |
| FR-4 | Display current token as QR | Must |
| FR-5 | Authenticated student scans and submits token | Must |
| FR-6 | Validate active session, current token, expiry, and duplicate state | Must |
| FR-7 | Record server timestamp | Must |
| FR-8 | Reject expired/duplicate QR | Must |
| FR-9 | Live attendance count/list | Should |
| FR-10 | Student history and percentage | Should |
| FR-11 | Teacher CSV export | Should |

These requirements directly follow FR-1 through FR-11 in the source. fileciteturn0file0L77-L92

## 7. Non-Functional Requirements

| Category | Target |
|---|---|
| Performance | Average QR validation under 300 ms |
| Security | bcrypt passwords, JWT authentication, short-lived single-use QR behavior |
| Scalability | At least 200 concurrent students in a session window |
| Usability | Scan-to-mark in 3 taps or fewer |
| Reliability | Attendance persists through teacher browser refresh |
| Compatibility | Modern Chrome, Safari, Edge |

Source: technical requirements section. fileciteturn0file0L97-L104

## 8. Success Metrics

- Attendance for approximately 60 students: under 2 minutes.
- Proxy incidents targeted toward near zero through token expiry.
- Class-hour uptime target: 99%+.

These are targets from the source document, not guarantees of the final implementation. fileciteturn0file0L73-L76

## 9. Product Rules

1. A student must be authenticated.
2. A session must be active.
3. The QR token must be current.
4. The token must not be expired.
5. The student must belong to the course roster.
6. The student may have at most one attendance record per session.
7. Attendance timestamp comes from the server.
8. A stopped session cannot accept attendance.

## 10. UX Principles

### Teacher

- One-click session start.
- Large QR suitable for projector display.
- Countdown/expiry indicator.
- Live attendance count.
- Clear session status.
- Clear stop control.

### Student

- Large scan action.
- Camera permission guidance.
- Success state immediately after marking.
- Clear expired-QR retry.
- Avoid exposing implementation details.

## 11. Out-of-Scope v1

- Native app.
- Biometrics.
- Multi-institution tenancy.

## 12. Future Enhancements

- Geofencing.
- Push notifications.
- Admin analytics.
- Native React Native client.

The source lists these as future enhancements. fileciteturn0file0L241-L245
