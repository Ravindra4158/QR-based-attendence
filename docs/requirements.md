# Software Requirements Specification — QR Attendance System

## 1. Functional Requirements

| ID | Requirement |
|---|---|
| FR-1 | System shall allow registration/login with Student or Teacher role. |
| FR-2 | Teacher shall create a course and class session. |
| FR-3 | System shall generate a unique random QR token and rotate it every N seconds; default 8 seconds. |
| FR-4 | Teacher screen shall render the current token as a scannable QR code. |
| FR-5 | Authenticated student shall scan QR using device camera and submit token. |
| FR-6 | Backend shall validate active session, token match, token expiry, and duplicate state. |
| FR-7 | Successful attendance shall be stored with a server timestamp. |
| FR-8 | Expired or reused attendance attempts shall be rejected. |
| FR-9 | Teacher shall receive live attendance count/list during an active session. |
| FR-10 | Student shall view attendance history and course percentage. |
| FR-11 | Teacher shall export session/course attendance as CSV. |

Source: FR-1 through FR-11. fileciteturn0file0L77-L92

## 2. Non-Functional Requirements

### Performance

Average QR validation response should be below 300 ms.

### Security

Passwords use bcrypt. Authentication uses JWT. QR tokens are short-lived and single-use in the attendance context.

### Scalability

Support at least 200 concurrent students scanning during a session window.

### Usability

Student scan-to-mark process should require three taps or fewer.

### Reliability

Attendance must persist through teacher browser refresh.

### Compatibility

Support modern Chrome, Safari, and Edge browsers.

Source: fileciteturn0file0L97-L104

## 3. Assumptions

- Students have camera-enabled smartphones.
- Students are logged in during class.
- Classroom has a projector/shared display.
- Students can reach the backend through Wi-Fi or mobile data.
- v1 is single-institution.

Source: fileciteturn0file0L105-L109

## 4. Acceptance Rules

Attendance succeeds only if all required validation conditions pass.

Attendance fails if:

- JWT is invalid.
- User is not a student.
- Session does not exist.
- Session is inactive.
- Student is not enrolled.
- Token does not match.
- Token has expired.
- Student is already marked.
