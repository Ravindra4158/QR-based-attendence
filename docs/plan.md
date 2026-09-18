# QR-Code Based Smart Attendance System — Development Plan

## 1. Project Overview

The QR-Code Based Smart Attendance System is a MERN-stack web application designed to reduce manual attendance effort and proxy attendance. A teacher starts an attendance session and displays a short-lived rotating QR code. Logged-in students scan the currently visible QR code, and the backend validates the session, token freshness, student identity, and duplicate-attendance condition before recording attendance.

The source PRD defines the core stack as MongoDB, Express.js, React.js, and Node.js, with JWT authentication, bcrypt password hashing, and Socket.IO for real-time QR rotation and live attendance updates.

Source baseline: PRD/Technical Design, pages 3–9. fileciteturn0file0L20-L41

---

## 2. Goals

### Primary goals

1. Replace manual roll-call with QR-based attendance.
2. Reduce attendance completion time to under two minutes for a class of approximately 60 students.
3. Use short-lived, rotating QR tokens to make screenshots less useful for proxy attendance.
4. Ensure one attendance record per student per session.
5. Give teachers a live attendance view.
6. Give students attendance history and course-wise percentage.
7. Allow teachers to export course/session attendance as CSV.
8. Keep the first version simple enough to build, test, demonstrate, and deploy.

The PRD identifies rotating QR tokens, real-time dashboards, attendance percentages, and CSV export as the central product capabilities. fileciteturn0file0L67-L76

---

## 3. Scope

### Version 1 — Must Have

- Student/teacher registration and login.
- JWT authentication.
- Role-based authorization.
- Teacher course creation.
- Student enrollment/roster management.
- Teacher attendance-session creation.
- Server-generated rotating QR token.
- QR display on teacher screen.
- Student QR scanning through a browser camera.
- Backend token validation.
- Duplicate scan prevention.
- Attendance persistence.
- Teacher live attendance count/list.
- Student attendance history and percentage.
- CSV export.

### Version 1 — Should Have

- Socket.IO live attendance updates.
- Attendance percentage calculations.
- Polished responsive dashboards.

### Version 1 — Could Have

- Push/email notifications.
- PDF reports.
- Geofencing/campus verification.

### Explicitly out of scope for v1

- Native mobile application.
- Biometric verification.
- Multi-institution/multi-tenant deployment.

These priorities follow the original MoSCoW table. fileciteturn0file0L67-L72

---

## 4. Milestones

### Phase 1 — Project Setup

**Tasks**
- Create frontend and backend applications.
- Configure environment variables.
- Connect MongoDB.
- Configure Mongoose.
- Add Express middleware.
- Configure React Router.
- Add Axios API client.
- Add ESLint/formatting if desired.
- Create Git repository and initial README.

**Deliverable**
- Running MERN skeleton.

### Phase 2 — Authentication

**Tasks**
- User registration.
- Login.
- Password hashing with bcrypt.
- JWT generation.
- JWT verification middleware.
- Student/teacher role middleware.
- Protected frontend routes.
- Persistent login state.

**Deliverable**
- Working student and teacher authentication.

### Phase 3 — Course Management

**Tasks**
- Teacher creates course.
- Course has title and code.
- Teacher ownership is stored.
- Roster/enrolled students are associated with course.
- Course details endpoint.
- Course dashboard.

**Deliverable**
- Teacher can create/manage a course and view roster.

### Phase 4 — Attendance Session

**Tasks**
- Teacher starts session for a course.
- Server records start time.
- Session receives active state.
- Server creates cryptographically random current token.
- Token expiry is stored.
- QR payload contains session ID and current token.
- Session stops through teacher action.
- Active-session state survives browser refresh.

**Deliverable**
- Teacher can open a live attendance session.

### Phase 5 — QR Rotation and Realtime

**Tasks**
- Implement server-side token rotation.
- Default token lifetime: 8 seconds.
- Broadcast current QR payload using Socket.IO.
- Refresh teacher display automatically.
- Broadcast attendance updates.
- Handle Socket.IO reconnection.

**Deliverable**
- Live rotating QR display.

### Phase 6 — Student Scanning

**Tasks**
- Add browser camera scanner.
- Decode QR.
- Extract session ID/token.
- Send authenticated request to backend.
- Validate session.
- Validate token.
- Validate token expiry.
- Validate duplicate attendance.
- Validate student eligibility for the course.
- Create attendance record.
- Return clear success/error response.

**Deliverable**
- End-to-end scan-to-attendance workflow.

### Phase 7 — Dashboards

**Teacher**
- Active session status.
- Current QR.
- Attendance count.
- Live student list.
- Start/stop controls.
- Course attendance history.
- CSV export.

**Student**
- Current scan action.
- Course list.
- Attendance history.
- Course-wise attendance percentage.

**Deliverable**
- Complete user-facing application.

### Phase 8 — Testing and Deployment

**Tasks**
- Functional tests.
- Authentication tests.
- QR expiry tests.
- Duplicate scan tests.
- Session state tests.
- Attendance percentage tests.
- CSV export tests.
- Responsive-browser testing.
- Load testing around the target of 200 concurrent students.
- Deploy frontend/backend.
- Configure production database.
- Configure HTTPS.
- Final demonstration.

**Deliverable**
- Demo-ready deployment.

The source implementation plan follows the same six broad stages: setup, auth, core feature, scanning, dashboards, and testing/deployment. fileciteturn0file0L221-L240

---

## 5. Definition of Done

A feature is complete when:

- Backend behavior is implemented.
- Frontend UI is connected to the backend.
- Authentication/authorization rules are enforced.
- Errors are handled.
- Data is persisted where required.
- The main success path has been tested.
- Relevant failure cases have been tested.
- The feature works after a browser refresh where persistence is required.
- Documentation has been updated.

---

## 6. Core Acceptance Criteria

### Attendance

A student is marked present only when:

1. The student is authenticated.
2. The session exists.
3. The session is active.
4. The submitted token matches the current session token.
5. The token has not expired.
6. The student has not already been marked for the session.
7. The attendance record can be persisted.

### Expired QR

If the QR was generated more than its configured validity window ago, the backend rejects it.

### Duplicate attendance

A second attendance attempt for the same student/session is rejected.

### Session closure

Once the teacher stops a session, further attendance attempts are rejected.

### Live updates

A successful attendance submission causes the teacher's live dashboard to update without manual polling.

The original functional requirements specify these validation conditions and behaviors. fileciteturn0file0L77-L92

---

## 7. Suggested Repository Structure

```text
qr-attendance/
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── context/
│   │   ├── utils/
│   │   └── App.jsx
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── sockets/
│   │   ├── utils/
│   │   └── server.js
│   └── package.json
│
├── docs/
├── .env.example
├── .gitignore
├── docker-compose.yml
└── README.md
```

---

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Student uses screenshot | Proxy attendance | Short-lived rotating server token |
| Token expiry due to slow network | Student cannot mark | Clear retry/rescan UX |
| Teacher refreshes browser | Session display interruption | Persist session in DB |
| Socket disconnect | QR display stops updating | Reconnect and fetch current state |
| Duplicate requests | Duplicate records | Unique session/student constraint |
| Camera permission denied | Student cannot scan | Explain permission and provide retry |
| MongoDB unavailable | Attendance cannot persist | Show controlled error and log failure |
| High simultaneous scans | Slow responses | Proper indexes, stateless API, load test |
| Clock differences | Incorrect expiry behavior | Use server time for validation |
| Student not on course roster | Unauthorized attendance | Verify course enrollment before insertion |

---

## 9. Future Roadmap

The original document proposes:

- Geofencing/campus Wi-Fi verification.
- Push notifications.
- Department-level admin analytics.
- Native React Native application using the same backend.

These are future enhancements rather than v1 requirements. fileciteturn0file0L241-L245
