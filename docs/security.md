# Security Design — QR Attendance System

## 1. Security Objectives

The security design focuses on:

- Authentication.
- Role-based authorization.
- Password protection.
- Short-lived QR tokens.
- Duplicate-attendance prevention.
- Server-side validation.
- Protection of attendance records.

The source explicitly identifies bcrypt, JWT, and short-lived single-use QR tokens as security controls. fileciteturn0file0L97-L104

---

## 2. Password Security

Passwords must never be stored as plaintext.

Flow:

```text
Registration
   ↓
Password
   ↓
bcrypt hash
   ↓
MongoDB

Login
   ↓
Password + stored hash
   ↓
bcrypt comparison
   ↓
JWT if valid
```

Recommended operational rules:

- Use a suitable bcrypt cost factor.
- Never log passwords.
- Never include passwords in API responses.
- Keep secrets in environment variables.

---

## 3. JWT

JWT should identify:

```json
{
  "sub": "<user-id>",
  "role": "student"
}
```

The server verifies:

- Signature.
- Expiry.
- Required claims.
- User existence where required.

For higher-security production deployments, short access-token lifetimes and refresh-token rotation can be considered, although refresh-token behavior is not part of the original v1 specification.

---

## 4. QR Security

### Threat

A student screenshots the classroom QR and sends it to another person.

### Primary control

The server changes the token frequently.

Default:

```text
Token lifetime ≈ 8 seconds
```

The source describes a random token stored on the session, regenerated and broadcast every eight seconds. fileciteturn0file0L131-L142

### Important implementation rule

The QR should not be considered valid merely because its contents are structurally correct.

The server must compare the submitted token with the session's current token.

---

## 5. Duplicate Attendance

Application checks alone are not sufficient under concurrency.

Use both:

1. Application-level duplicate check.
2. Unique database index on `(sessionId, studentId)`.

---

## 6. Authorization

### Teacher

A teacher may:

- Create owned courses.
- Start sessions for owned courses.
- Stop owned sessions.
- View attendance for owned courses.
- Export owned course attendance.

### Student

A student may:

- Mark their own attendance.
- View their own attendance.
- Read courses they are enrolled in.

Students must not be able to submit another student's identity.

---

## 7. Server Time

Attendance timestamps must be server generated.

Do not accept:

```json
{
  "scannedAt": "client-controlled-time"
}
```

Instead:

```js
scannedAt: new Date()
```

The source explicitly requires a server timestamp rather than client timestamp. fileciteturn0file0L172-L177

---

## 8. Transport Security

Production deployment should use HTTPS/WSS.

Required production configuration:

- HTTPS for frontend/API.
- Secure WebSocket connection.
- Secure cookie configuration if cookies are used.
- CORS restricted to the deployed frontend origin.
- No development secrets in source control.

---

## 9. Input Validation

Validate:

- Email format.
- Password requirements.
- Role enum.
- Course title/code.
- ObjectId parameters.
- Session ID.
- Token presence/format.
- Export course ownership.

Reject malformed input before database operations.

---

## 10. Threat Model

| Threat | Control |
|---|---|
| Password theft from database | bcrypt |
| Fake role supplied by client | JWT/server authorization |
| Screenshot of old QR | Short token lifetime |
| Repeated scan | Unique attendance record |
| Fake timestamp | Server timestamp |
| Unauthorized teacher access | Course ownership check |
| Unauthorized student attendance | Roster membership check |
| Invalid session | Session-state validation |
| API abuse | Rate limiting and request validation |
| Data interception | HTTPS/WSS |

---

## 11. Important Limitation

A rotating QR code alone does not prove physical presence with absolute certainty. If a valid QR is photographed while it is currently displayed, another person may potentially scan it before expiry.

The original design treats short-lived rotation as the primary anti-proxy mechanism. Geofencing/campus Wi-Fi verification is listed as a future enhancement. fileciteturn0file0L241-L245

For a later version, additional controls can be evaluated without changing the basic attendance API:
- classroom network verification,
- geofencing,
- device/session binding,
- stronger administrative audit logs.

