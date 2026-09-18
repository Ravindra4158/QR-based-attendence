# Database Design — QR Attendance System

## 1. Database

MongoDB is the selected database. Mongoose is the ODM.

The source specifies four core collections: User, Course, Session, and Attendance. fileciteturn0file0L143-L145

---

## 2. User Collection

```js
{
  _id: ObjectId,
  name: String,
  email: String,
  password: String,
  role: "student" | "teacher",
  rollNo: String,
  createdAt: Date
}
```

### Rules

- `name`: required.
- `email`: required and unique.
- `password`: required and stored hashed.
- `role`: required enum.
- `rollNo`: applicable to students.

The source explicitly defines these fields and constraints. fileciteturn0file0L150-L157

### Recommended indexes

```text
email: unique
```

---

## 3. Course Collection

```js
{
  _id: ObjectId,
  title: String,
  code: String,
  teacherId: ObjectId,
  enrolledStudents: [ObjectId]
}
```

### Rules

- `title`: required.
- `code`: course identifier.
- `teacherId`: references User.
- `enrolledStudents`: references User documents.

Source field definitions: fileciteturn0file0L158-L163

### Authorization

Only the owning teacher should be allowed to modify the course.

---

## 4. Session Collection

```js
{
  _id: ObjectId,
  courseId: ObjectId,
  date: Date,
  startTime: Date,
  endTime: Date,
  currentToken: String,
  tokenExpiresAt: Date,
  isActive: Boolean
}
```

The source defines `courseId`, `date`, `startTime/endTime`, `currentToken`, `tokenExpiresAt`, and `isActive`. fileciteturn0file0L164-L171

### Session lifecycle

```text
created
   │
   ▼
active
   │
   ▼
stopped
```

### Token state

Only the currently stored token should be accepted.

---

## 5. Attendance Collection

```js
{
  _id: ObjectId,
  sessionId: ObjectId,
  studentId: ObjectId,
  scannedAt: Date,
  status: "present" | "late"
}
```

The source specifies server-side `scannedAt` and `present|late` status values. fileciteturn0file0L172-L177

### Critical uniqueness rule

Create a unique compound index:

```text
{ sessionId: 1, studentId: 1 }
```

This makes duplicate attendance impossible at the database level even if two requests arrive concurrently.

---

## 6. Relationships

```text
User (Teacher)
      │
      │ teacherId
      ▼
   Course
      │
      │ courseId
      ▼
   Session
      │
      │ sessionId
      ▼
 Attendance
      ▲
      │ studentId
      │
 User (Student)
```

The database diagram on page 6 of the source shows User → Course → Session → Attendance relationships and User references for teachers/students. fileciteturn0file0L143-L145

---

## 7. Attendance Percentage

For one course:

```text
attendancePercentage =
    attendedSessions / totalSessions * 100
```

Example:

```text
8 attended / 10 total = 80%
```

The source uses this exact example in its test plan. fileciteturn0file0L219-L220

Define carefully what counts as a total session. A session should normally count only after it has been completed/closed, so an unfinished live session does not unexpectedly reduce a student's percentage.

---

## 8. Transaction/Concurrency Considerations

Two scan requests may arrive nearly simultaneously.

Required protection:

1. Validate the session/token.
2. Attempt attendance insertion.
3. Let the unique `(sessionId, studentId)` index enforce uniqueness.
4. If duplicate-key error occurs, return `ALREADY_MARKED`.

This is safer than relying only on an application-level "find then insert" check.

---

## 9. Suggested Mongoose Models

### User

```js
const UserSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["student", "teacher"], required: true },
  rollNo: { type: String, trim: true },
  createdAt: { type: Date, default: Date.now }
});
```

### Course

```js
const CourseSchema = new Schema({
  title: { type: String, required: true },
  code: { type: String, required: true },
  teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  enrolledStudents: [{ type: Schema.Types.ObjectId, ref: "User" }]
});
```

### Session

```js
const SessionSchema = new Schema({
  courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
  date: { type: Date, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  currentToken: { type: String, required: true },
  tokenExpiresAt: { type: Date, required: true },
  isActive: { type: Boolean, default: true }
});
```

### Attendance

```js
const AttendanceSchema = new Schema({
  sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true },
  studentId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  scannedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ["present", "late"], default: "present" }
});

AttendanceSchema.index(
  { sessionId: 1, studentId: 1 },
  { unique: true }
);
```

---

## 10. Data Integrity Rules

- Never store plaintext passwords.
- Never accept `studentId` from the client as authoritative; derive the student identity from the verified JWT.
- Use server time for `scannedAt`.
- Do not trust client-provided session ownership.
- Check teacher ownership before session creation/stopping.
- Check roster membership before attendance creation.
- Use database uniqueness for duplicate prevention.
