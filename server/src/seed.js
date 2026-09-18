/**
 * Seed script — populates demo data for local development.
 * Run: node --env-file=.env src/seed.js
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import User from './models/User.js';
import Course from './models/Course.js';
import Attendance from './models/Attendance.js';
import Session from './models/Session.js';

const TEACHER = { name: 'Riya Kapoor', email: 'teacher@attendly.edu', password: 'password123', role: 'teacher' };
const STUDENTS = [
  { name: 'Arjun Singh',   email: 'arjun@attendly.edu',  password: 'password123', role: 'student', rollNo: 'CS21001' },
  { name: 'Aarav Sharma',  email: 'aarav@attendly.edu',  password: 'password123', role: 'student', rollNo: 'CS21002' },
  { name: 'Nisha Shah',    email: 'nisha@attendly.edu',  password: 'password123', role: 'student', rollNo: 'CS21003' },
  { name: 'Rohan Kumar',   email: 'rohan@attendly.edu',  password: 'password123', role: 'student', rollNo: 'CS21004' },
  { name: 'Priya Desai',   email: 'priya@attendly.edu',  password: 'password123', role: 'student', rollNo: 'CS21005' },
  { name: 'Vikram Mehta',  email: 'vikram@attendly.edu', password: 'password123', role: 'student', rollNo: 'CS21006' },
  { name: 'Ananya Verma',  email: 'ananya@attendly.edu', password: 'password123', role: 'student', rollNo: 'CS21007' },
  { name: 'Kabir Joshi',   email: 'kabir@attendly.edu',  password: 'password123', role: 'student', rollNo: 'CS21008' },
];
const COURSES = [
  { title: 'Data Structures',            code: 'CS301', section: 'A', room: 'Room 204', schedule: 'Mon, Wed • 09:00 AM - 10:30 AM' },
  { title: 'Database Management Systems', code: 'CS302', section: 'A', room: 'Room 204', schedule: 'Tue, Thu • 11:00 AM - 12:30 PM' },
  { title: 'Operating Systems',          code: 'CS303', section: 'B', room: 'Room 106', schedule: 'Mon, Fri • 02:00 PM - 03:30 PM' },
  { title: 'Artificial Intelligence',    code: 'CS401', section: 'A', room: 'Hall 302', schedule: 'Wed, Fri • 10:00 AM - 11:30 AM' },
];

async function seed() {
  await connectDatabase();

  // Clear existing
  await Promise.all([User.deleteMany({}), Course.deleteMany({}), Session.deleteMany({}), Attendance.deleteMany({})]);

  // Create teacher
  const teacher = await User.create({ ...TEACHER, password: await bcrypt.hash(TEACHER.password, 12) });
  console.log(`👩‍🏫 Teacher: ${teacher.email}`);

  // Create students
  const students = await Promise.all(
    STUDENTS.map(s => User.create({ ...s, password: bcrypt.hashSync(s.password, 12) }))
  );
  students.forEach(s => console.log(`🎓 Student: ${s.email} (${s.rollNo})`));

  // Create courses and enroll all students
  const createdCourses = [];
  for (const courseData of COURSES) {
    const course = await Course.create({
      title: courseData.title,
      code: courseData.code,
      section: courseData.section,
      room: courseData.room,
      schedule: courseData.schedule,
      teacherId: teacher._id,
      enrolledStudents: students.map(s => s._id),
    });
    createdCourses.push(course);
    console.log(`📚 Course: ${course.code} — ${course.title}`);
  }

  // Create 4 past sessions per course and seed attendance records
  let attendanceCount = 0;
  for (const course of createdCourses) {
    for (let i = 4; i >= 1; i--) {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - (i * 2));
      const startTime = new Date(pastDate);
      startTime.setHours(9, 0, 0);
      const endTime = new Date(pastDate);
      endTime.setHours(10, 30, 0);

      const session = await Session.create({
        courseId: course._id,
        date: pastDate,
        startTime,
        endTime,
        isActive: false,
        currentToken: 'EXPIRED_DEMO_TOKEN',
        tokenExpiresAt: endTime,
      });

      // Mark attendance for 6 out of 8 students (including Arjun) to simulate realistic history
      for (const student of students) {
        // Arjun attends 90% of sessions, others vary
        const isArjun = student.email === 'arjun@attendly.edu';
        const shouldAttend = isArjun ? (i !== 3) : (Math.random() > 0.25);
        if (shouldAttend) {
          const scanTime = new Date(startTime.getTime() + Math.random() * 10 * 60000);
          await Attendance.create({
            sessionId: session._id,
            studentId: student._id,
            status: 'present',
            scannedAt: scanTime,
          });
          attendanceCount++;
        }
      }
    }
  }

  console.log(`\n✅ Seed complete! Seeded ${createdCourses.length} courses and ${attendanceCount} attendance records.`);
  console.log('   Teacher login:  teacher@attendly.edu / password123');
  console.log('   Student login:  arjun@attendly.edu   / password123');
  console.log('   (or any of the 8 student accounts)\n');

  await disconnectDatabase();
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
