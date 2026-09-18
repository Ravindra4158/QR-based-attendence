/* ==========================================================
   Attendly — app.js
   Full client: Auth, Teacher dashboard, Student dashboard,
   Students Directory, Timetable, Profile,
   Socket.IO live QR + roster, Camera QR scanner
   ========================================================== */

const API = window.location.origin;   // same-origin: http://localhost:4000
const QR_TTL = 8;                     // seconds — must match server .env QR_TTL_SECONDS

/* -------- State ------------------------------------------ */
const state = {
  user: null,
  token: null,
  role: null,           // 'teacher' | 'student'
  courses: [],
  activeSession: null,  // { _id, courseId, currentToken, tokenExpiresAt, … }
  roster: [],           // attendance records for active session
  socket: null,
  countdownTimer: null,
  scannerStream: null,
  scannerRaf: null,
};

let _allStudents = [];

/* ==========================================================
   Utilities
   ========================================================== */
function $(id) { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }

function renderIcons() { if (window.lucide) lucide.createIcons(); }

function fmt12(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function today() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
}

function initials(name) {
  return (name || 'U U').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

const avatarColors = ['coral', 'mint', 'blue', 'yellow'];
function avatarColor(name) {
  const c = (name || '').charCodeAt(0) % avatarColors.length;
  return avatarColors[c];
}

/* -------- Toast ------------------------------------------ */
function toast(msg, type = 'default', duration = 3500) {
  const icons = { success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle', default: 'info' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i data-lucide="${icons[type] || icons.default}"></i><span>${msg}</span>`;
  $('toast-container').appendChild(el);
  renderIcons();
  setTimeout(() => {
    el.classList.add('removing');
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}

/* -------- API helper ------------------------------------- */
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(`${API}/api${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Request failed'), { code: data.code, status: res.status });
  return data;
}

/* ==========================================================
   AUTH
   ========================================================== */
function saveSession(token, user) {
  state.token = token;
  state.user = user;
  state.role = user.role;
  localStorage.setItem('attendly_token', token);
  localStorage.setItem('attendly_user', JSON.stringify(user));
}

function clearSession() {
  state.token = null;
  state.user = null;
  state.role = null;
  state.activeSession = null;
  state.courses = [];
  state.roster = [];
  localStorage.removeItem('attendly_token');
  localStorage.removeItem('attendly_user');
  if (state.socket) { state.socket.disconnect(); state.socket = null; }
  clearCountdown();
}

function restoreSession() {
  const token = localStorage.getItem('attendly_token');
  const userStr = localStorage.getItem('attendly_user');
  if (token && userStr) {
    try {
      const user = JSON.parse(userStr);
      state.token = token;
      state.user = user;
      state.role = user.role;
      return true;
    } catch { return false; }
  }
  return false;
}

function showAuthOverlay() { $('auth-overlay').classList.remove('hidden'); }
function hideAuthOverlay() { $('auth-overlay').classList.add('hidden'); }
function setAuthError(msg) {
  const el = $('auth-error');
  el.textContent = msg;
  el.classList.toggle('visible', !!msg);
}

async function doLogin(email, password) {
  const btn = $('login-btn');
  btn.disabled = true; btn.textContent = 'Signing in…';
  setAuthError('');
  try {
    const { token, user } = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    saveSession(token, user);
    hideAuthOverlay();
    await initApp();
  } catch (err) {
    setAuthError(err.message || 'Login failed. Check credentials.');
  } finally {
    btn.disabled = false; btn.textContent = 'Sign in';
  }
}

async function doRegister(name, email, password, role, rollNo) {
  const btn = $('register-btn');
  btn.disabled = true; btn.textContent = 'Creating account…';
  setAuthError('');
  try {
    await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, role, rollNo: rollNo || undefined }) });
    // Auto-login
    const { token, user } = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    saveSession(token, user);
    hideAuthOverlay();
    await initApp();
    toast('Account created! Welcome to Attendly.', 'success');
  } catch (err) {
    setAuthError(err.message || 'Registration failed.');
  } finally {
    btn.disabled = false; btn.textContent = 'Create account';
  }
}

/* ---- Auth tab toggle ------------------------------------ */
function initAuthUI() {
  document.querySelectorAll('#auth-tabs .modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#auth-tabs .modal-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      $('login-form').style.display = isLogin ? '' : 'none';
      $('register-form').style.display = isLogin ? 'none' : '';
      setAuthError('');
    });
  });

  $('reg-role').addEventListener('change', () => {
    $('rollno-field').style.display = $('reg-role').value === 'student' ? '' : 'none';
  });

  $('login-form').addEventListener('submit', e => {
    e.preventDefault();
    doLogin($('login-email').value.trim(), $('login-password').value);
  });

  $('register-form').addEventListener('submit', e => {
    e.preventDefault();
    doRegister(
      $('reg-name').value.trim(),
      $('reg-email').value.trim(),
      $('reg-password').value,
      $('reg-role').value,
      $('reg-rollno').value.trim()
    );
  });

  $('demo-teacher-btn').addEventListener('click', () => {
    $('login-email').value = 'teacher@attendly.edu';
    $('login-password').value = 'password123';
    doLogin('teacher@attendly.edu', 'password123');
  });
  $('demo-student-btn').addEventListener('click', () => {
    $('login-email').value = 'arjun@attendly.edu';
    $('login-password').value = 'password123';
    doLogin('arjun@attendly.edu', 'password123');
  });
}

/* ==========================================================
   APP INIT
   ========================================================== */
async function initApp() {
  const user = state.user;
  if (!user) return showAuthOverlay();

  // Update UI identity
  const av = initials(user.name);
  const col = avatarColor(user.name);
  $('user-avatar').textContent = av;
  $('user-avatar').className = `avatar avatar-${col}`;
  $('user-name-sidebar').textContent = user.name;
  $('user-role-sidebar').textContent = user.role + ' account';
  $('date-eyebrow').textContent = today();
  $('greeting-heading').innerHTML = `Good morning, ${user.name.split(' ')[0]} <span class="wave">✦</span>`;

  const isTeacher = user.role === 'teacher';
  renderSidebar();
  switchView('overview');

  if (isTeacher) {
    await loadTeacherData();
  } else {
    await loadStudentData();
  }

  renderIcons();
}

/* ==========================================================
   ROLE-BASED SIDEBAR
   ========================================================== */
function renderSidebar() {
  const nav = $('main-nav');
  if (!nav) return;
  const isTeacher = state.role === 'teacher';

  const labelEl = $('workspace-role-label');
  if (labelEl) labelEl.textContent = isTeacher ? 'Teacher Console' : 'Student Console';

  if (isTeacher) {
    nav.innerHTML = `
      <button class="nav-item active" data-view="overview" id="nav-overview">
        <i data-lucide="layout-dashboard"></i><span>Start Session & QR</span>
      </button>
      <button class="nav-item" data-view="timetable" id="nav-timetable">
        <i data-lucide="book-open"></i><span>Course Management</span>
      </button>
      <button class="nav-item" data-view="students" id="nav-students">
        <i data-lucide="users"></i><span>All Students</span>
      </button>
      <button class="nav-item" data-view="export" id="nav-export">
        <i data-lucide="download"></i><span>Export Attendance</span>
      </button>
      <button class="nav-item" data-view="profile" id="nav-profile">
        <i data-lucide="user"></i><span>Profile</span>
      </button>
    `;
  } else {
    nav.innerHTML = `
      <button class="nav-item active" data-view="overview" id="nav-overview">
        <i data-lucide="scan-line"></i><span>Scan QR</span>
      </button>
      <button class="nav-item" data-view="attendance" id="nav-attendance">
        <i data-lucide="bar-chart-2"></i><span>My Attendance</span>
      </button>
      <button class="nav-item" data-view="timetable" id="nav-timetable">
        <i data-lucide="book-open"></i><span>Course Details</span>
      </button>
      <button class="nav-item" data-view="profile" id="nav-profile">
        <i data-lucide="user"></i><span>Profile</span>
      </button>
    `;
  }

  nav.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  renderIcons();
}

/* ==========================================================
   VIEW ROUTING
   ========================================================== */
function switchView(viewName) {
  document.querySelectorAll('.nav-item[data-view]').forEach(b => b.classList.remove('active'));
  const navBtn = $(`nav-${viewName}`);
  if (navBtn) navBtn.classList.add('active');

  document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));

  const titles = {
    overview: state.role === 'teacher' ? 'Live Session & QR' : 'Scan QR & Console',
    attendance: 'My Attendance & History',
    timetable: state.role === 'teacher' ? 'Course Management' : 'Course Details',
    students: 'All Students Directory',
    export: 'Export Attendance',
    profile: 'User Profile'
  };

  $('breadcrumb-label').textContent = titles[viewName] || (viewName.charAt(0).toUpperCase() + viewName.slice(1));

  if (viewName === 'overview') {
    if (state.role === 'teacher') $('teacher-view').classList.remove('hidden');
    else $('student-view').classList.remove('hidden');
  } else if (viewName === 'attendance') {
    $('student-view').classList.remove('hidden');
    renderStudentCourses();
    renderStudentHistory();
    const historyPanel = $('history-panel');
    if (historyPanel) historyPanel.scrollIntoView({ behavior: 'smooth' });
  } else if (viewName === 'students') {
    $('students-view').classList.remove('hidden');
    loadStudentsDirectory();
  } else if (viewName === 'timetable') {
    $('timetable-view').classList.remove('hidden');
    loadTimetable();
  } else if (viewName === 'export') {
    if (state.role === 'teacher') {
      exportCSV();
      $('teacher-view').classList.remove('hidden');
    }
  } else if (viewName === 'profile') {
    $('profile-view').classList.remove('hidden');
    loadProfile();
  }
  renderIcons();
}

/* ==========================================================
   TEACHER DASHBOARD
   ========================================================== */
async function loadTeacherData() {
  try {
    const { courses } = await apiFetch('/courses');
    state.courses = courses || [];
    renderCourseSelect();
    renderCourseScheduleList();
    updateTeacherStats();
  } catch (err) {
    toast('Could not load courses: ' + err.message, 'error');
  }
}

function updateTeacherStats() {
  $('stat-classes').textContent = String(state.courses.length).padStart(2, '0');
  const totalStudents = state.courses.reduce((s, c) => s + (c.enrolledStudents?.length || 0), 0);
  $('stat-enrolled').textContent = String(totalStudents).padStart(2, '0');
  $('stat-avg').textContent = '—';
  const hasSession = !!state.activeSession;
  $('stat-sessions').textContent = hasSession ? '01' : '00';
  $('stat-sessions-label').textContent = hasSession ? 'Class currently in progress' : 'No active session';
  $('live-pill-stat').style.display = hasSession ? '' : 'none';
}

function renderCourseSelect() {
  const sel = $('course-select');
  if (state.courses.length === 0) {
    sel.innerHTML = '<option value="">No courses yet — create one</option>';
    $('start-session-btn').disabled = true;
    return;
  }
  sel.innerHTML = state.courses.map(c =>
    `<option value="${c._id}">${c.code} — ${c.title}</option>`
  ).join('');
  $('start-session-btn').disabled = false;
}

function renderCourseScheduleList() {
  const el = $('course-schedule-list');
  if (state.courses.length === 0) {
    el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-faint);font-size:13px">No courses yet. Create your first course.</div>`;
    return;
  }
  el.innerHTML = state.courses.map((c) => `
    <div class="schedule-row">
      <div class="time">${c.code.slice(-2) || '--'}<br/><small>${c.section || 'A'}</small></div>
      <div class="schedule-line"><span></span></div>
      <div class="course-block">
        <strong>${c.title}</strong>
        <span>${c.code} · Section ${c.section || 'A'} · ${c.room || 'TBD'}</span>
        <div style="font-size:11px;color:var(--coral);margin-top:2px">${c.schedule || ''}</div>
      </div>
      <span class="upcoming-tag">${c.enrolledStudents?.length || 0} enrolled</span>
    </div>
  `).join('');
}

/* ---- Start session -------------------------------------- */
async function startSession() {
  const courseId = $('course-select').value;
  if (!courseId) return toast('Select a course first', 'warning');
  const btn = $('start-session-btn');
  btn.disabled = true; btn.innerHTML = '<i data-lucide="loader"></i> Starting…';
  renderIcons();
  try {
    const { session } = await apiFetch('/sessions/start', { method: 'POST', body: JSON.stringify({ courseId }) });
    state.activeSession = session;
    const course = state.courses.find(c => c._id === courseId || c._id === session.courseId);
    state.activeSession._course = course;
    onSessionStarted(session, course);
    connectSocket(session._id);
    toast('Session started — show the QR code!', 'success');
  } catch (err) {
    toast(err.message || 'Could not start session', 'error');
    btn.disabled = false; btn.innerHTML = '<i data-lucide="play"></i> Start';
    renderIcons();
  }
}

function onSessionStarted(session, course) {
  $('session-dot').style.display = '';
  $('session-status-label').textContent = 'Live session';
  $('session-course-title').textContent = course ? `${course.title} · ${course.code}` : 'Live session';
  $('session-course-meta').textContent = course ? `Section ${course.section || 'A'} · ${course.room || 'Room TBD'}` : '';
  $('session-start-time').textContent = fmt12(session.startTime || new Date());
  const enrolled = course?.enrolledStudents?.length || '?';
  $('present-count').innerHTML = `0 <em>/ ${enrolled}</em>`;
  $('roster-total').textContent = `of ${enrolled} students`;

  $('course-select-row').style.display = 'none';
  $('session-body').style.display = '';

  const stopBtn = $('stop-session');
  stopBtn.classList.remove('stopped');
  stopBtn.innerHTML = '<i data-lucide="square"></i> End session';
  renderIcons();

  if (session.currentToken) updateQR(session.currentToken);
  startCountdownFromExpiry(session.tokenExpiresAt);
  updateTeacherStats();
  updateRosterSummary();
}

/* ---- Stop session --------------------------------------- */
async function stopSession() {
  if (!state.activeSession) return;
  try {
    await apiFetch(`/sessions/${state.activeSession._id}/stop`, { method: 'POST' });
    onSessionStopped();
    toast('Session ended — attendance saved.', 'success');
  } catch (err) {
    toast(err.message || 'Could not stop session', 'error');
  }
}

function onSessionStopped() {
  state.activeSession = null;
  state.roster = [];
  clearCountdown();
  if (state.socket) { state.socket.disconnect(); state.socket = null; }

  $('session-dot').style.display = 'none';
  $('session-status-label').textContent = 'No session active';
  $('session-course-title').textContent = 'Select a course to start';
  $('session-course-meta').textContent = '';
  $('course-select-row').style.display = '';
  $('session-body').style.display = 'none';
  const btn = $('start-session-btn');
  btn.disabled = false;
  btn.innerHTML = '<i data-lucide="play"></i> Start';
  renderIcons();
  updateTeacherStats();
  updateRosterSummary();
}

/* ---- QR display ---------------------------------------- */
function updateQR(token) {
  const payload = JSON.stringify({ sessionId: state.activeSession?._id, token });
  const encoded = encodeURIComponent(payload);
  $('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&color=1f2523&bgcolor=f7f7f2&qzone=1&data=${encoded}`;
  const ring = $('refresh-ring');
  ring.classList.remove('spinning');
  void ring.offsetWidth;
  ring.classList.add('spinning');
  ring.addEventListener('animationend', () => ring.classList.remove('spinning'), { once: true });
}

/* ---- Countdown ------------------------------------------ */
let _remaining = QR_TTL;
function startCountdownFromExpiry(expiresAt) {
  clearCountdown();
  const update = () => {
    const diff = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt) - Date.now()) / 1000)) : 0;
    _remaining = diff;
    $('countdown').textContent = String(diff).padStart(2, '0');
    const pct = (diff / QR_TTL) * 100;
    $('refresh-ring').style.setProperty('--progress', pct);
    if (diff <= 0 && state.activeSession) {
      $('countdown').textContent = '…';
    }
  };
  update();
  state.countdownTimer = setInterval(update, 500);
}

function clearCountdown() {
  if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
}

/* ---- Roster -------------------------------------------- */
function updateRosterSummary() {
  const count = state.roster.length;
  const total = state.activeSession?._course?.enrolledStudents?.length || 0;
  $('roster-count').textContent = count;
  $('present-count').innerHTML = `${count} <em>/ ${total || '—'}</em>`;
  $('roster-progress').style.width = total ? `${(count / total) * 100}%` : '0%';
}

function addStudentToRoster(record) {
  if (state.roster.find(r => r.studentId?._id === record.studentId?._id || r.studentId === record.studentId)) return;
  state.roster.push(record);
  updateRosterSummary();
  prependRosterRow(record);
}

function prependRosterRow(record) {
  const student = record.studentId || {};
  const name = student.name || 'Student';
  const col = avatarColor(name);
  const time = fmt12(record.scannedAt);
  const row = document.createElement('div');
  row.className = 'student-row';
  row.innerHTML = `
    <span class="avatar avatar-${col}">${initials(name)}</span>
    <span class="student-name">${name}<small>Present · verified scan</small></span>
    <span class="scan-time">${time}</span>
    <span class="present-check"><i data-lucide="check"></i></span>
  `;
  const list = $('student-list');
  list.prepend(row);
  renderIcons();
}

/* ---- Socket.IO ------------------------------------------ */
function connectSocket(sessionId) {
  if (state.socket) state.socket.disconnect();
  state.socket = io(API, { auth: { token: `Bearer ${state.token}` }, transports: ['websocket', 'polling'] });

  state.socket.on('connect', () => {
    state.socket.emit('session:join', sessionId);
  });

  state.socket.on('session:token', payload => {
    if (!state.activeSession) return;
    state.activeSession.currentToken = payload.token;
    state.activeSession.tokenExpiresAt = payload.expiresAt;
    updateQR(payload.token);
    startCountdownFromExpiry(payload.expiresAt);
  });

  state.socket.on('attendance:marked', payload => {
    if (payload.sessionId !== sessionId) return;
    addStudentToRoster(payload.attendance || payload);
    toast(`${payload.attendance?.studentId?.name || 'A student'} marked attendance ✓`, 'success');
  });
}

/* ---- Export CSV ----------------------------------------- */
async function exportCSV() {
  const courseId = state.activeSession?.courseId || state.activeSession?._course?._id;
  if (!courseId) {
    if (state.roster.length === 0) return toast('No attendance data to export', 'warning');
    const rows = [['Student', 'Status', 'Scanned at'], ...state.roster.map(r => [r.studentId?.name || 'Unknown', 'Present', r.scannedAt || ''])];
    const csv = rows.map(r => r.join(',')).join('\n');
    downloadBlob(csv, 'attendance.csv');
    return;
  }
  try {
    const res = await fetch(`${API}/api/attendance/export/${courseId}`, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'attendance.csv'; a.click();
    URL.revokeObjectURL(url);
    toast('CSV exported!', 'success');
  } catch (err) {
    toast('Export failed: ' + err.message, 'error');
  }
}

function downloadBlob(content, filename) {
  const link = document.createElement('a');
  link.href = `data:text/csv;charset=utf-8,${encodeURIComponent(content)}`;
  link.download = filename;
  link.click();
}

/* ==========================================================
   STUDENT DIRECTORY
   ========================================================== */
async function loadStudentsDirectory() {
  const container = $('students-grid');
  try {
    const { students } = await apiFetch('/auth/students');
    _allStudents = students || [];
    renderStudentsDirectory(_allStudents);
  } catch (err) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--coral-dark);font-size:13px">${err.message || 'Only teachers can view the students directory.'}</div>`;
  }
}

function renderStudentsDirectory(students) {
  const container = $('students-grid');
  if (!students.length) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-faint);font-size:13px">No students registered yet.</div>`;
    return;
  }
  container.innerHTML = students.map(st => {
    const col = avatarColor(st.name);
    const pct = st.overallPct ?? 100;
    const pctBadgeClass = pct >= 85 ? 'var(--mint-light)' : pct >= 75 ? 'var(--blue-light)' : 'rgba(235, 94, 85, 0.15)';
    const pctColor = pct >= 85 ? 'var(--mint-dark)' : pct >= 75 ? 'var(--blue)' : 'var(--coral-dark)';

    return `
      <div class="student-card" style="display:flex;flex-direction:column;justify-content:space-between;cursor:pointer" onclick="openStudentDetailModal('${st.id}')">
        <div style="display:flex;gap:12px;align-items:flex-start">
          <div class="avatar avatar-${col} avatar-lg">${initials(st.name)}</div>
          <div class="student-card-info" style="flex:1">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <strong>${st.name}</strong>
              <span class="badge" style="background:${pctBadgeClass};color:${pctColor};font-size:11px;font-weight:700;padding:2px 8px">${pct.toFixed(1)}%</span>
            </div>
            <p>${st.email}</p>
            <span class="roll-badge">Roll No: ${st.rollNo || 'N/A'}</span>
            <p style="font-size:11px;color:var(--ink-faint);margin-top:6px">${st.attendedSessions || 0} of ${st.totalSessions || 0} sessions attended</p>
          </div>
        </div>
        <button class="text-button" style="font-size:12px;margin-top:12px;align-self:flex-start;color:var(--coral)" onclick="event.stopPropagation(); openStudentDetailModal('${st.id}')">
          <i data-lucide="history"></i> Past Attendance History <i data-lucide="chevron-right"></i>
        </button>
      </div>
    `;
  }).join('');
  renderIcons();
}

async function openStudentDetailModal(studentId) {
  const modal = $('student-detail-modal');
  modal.classList.add('visible');
  $('modal-student-name').textContent = 'Loading student…';
  $('modal-student-meta').textContent = 'Fetching attendance history…';
  $('modal-student-pct').textContent = '—%';
  $('modal-student-sessions').textContent = '—';
  $('modal-student-courses').innerHTML = `<div style="font-size:12px;color:var(--ink-faint)">Loading breakdown…</div>`;
  $('modal-student-history').innerHTML = `<div style="font-size:12px;color:var(--ink-faint)">Loading history log…</div>`;

  try {
    const data = await apiFetch(`/attendance/student/${studentId}/history`);
    const student = data.student || {};
    const stats = data.courseStats || [];
    const history = data.history || [];

    const col = avatarColor(student.name);
    $('modal-student-avatar').textContent = initials(student.name);
    $('modal-student-avatar').className = `avatar avatar-${col} avatar-lg`;
    $('modal-student-name').textContent = student.name;
    $('modal-student-meta').textContent = `Roll No: ${student.rollNo || 'N/A'} · ${student.email}`;

    let totalAttended = 0, totalSessions = 0;
    stats.forEach(s => {
      totalAttended += s.attended;
      totalSessions += s.total;
    });

    const overallPct = totalSessions > 0 ? (totalAttended / totalSessions) * 100 : 100;
    $('modal-student-pct').textContent = `${overallPct.toFixed(1)}%`;
    $('modal-student-sessions').textContent = `${totalAttended} / ${totalSessions}`;

    // Render course breakdown
    $('modal-student-courses').innerHTML = stats.length === 0 ? `<div style="font-size:12px;color:var(--ink-faint)">No courses enrolled</div>` : stats.map(c => `
      <div style="background:var(--paper);padding:10px 14px;border-radius:var(--radius-md);border:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div>
          <strong style="font-size:12px;color:var(--ink)">${c.code} — ${c.title}</strong>
          <div style="font-size:11px;color:var(--ink-faint)">${c.attended} of ${c.total} sessions attended</div>
        </div>
        <strong style="font-size:13px;color:${c.percentage >= 75 ? 'var(--mint-dark)' : 'var(--coral-dark)'}">${c.percentage}%</strong>
      </div>
    `).join('');

    // Render past attendance history
    $('modal-student-history').innerHTML = history.length === 0 ? `<div style="font-size:12px;color:var(--ink-faint)">No past attendance records</div>` : history.map(item => {
      const course = item.sessionId?.courseId || {};
      const scanTime = fmt12(item.scannedAt);
      const scanDate = item.scannedAt ? new Date(item.scannedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—';
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--paper);border:1px solid var(--border);border-radius:var(--radius-md)">
          <div>
            <strong style="font-size:12px;display:block;color:var(--ink)">${course.code || 'CS'} — ${course.title || 'Class Session'}</strong>
            <span style="font-size:11px;color:var(--ink-faint)">${scanDate} · ${course.room || 'Room 204'}</span>
          </div>
          <div style="text-align:right">
            <span class="badge" style="background:var(--mint-light);color:var(--mint-dark);font-size:10px;padding:2px 8px">Verified ✓</span>
            <div style="font-size:10.5px;color:var(--ink-faint);margin-top:2px">${scanTime}</div>
          </div>
        </div>
      `;
    }).join('');

    renderIcons();
  } catch (err) {
    toast('Could not load student detail: ' + err.message, 'error');
  }
}
window.openStudentDetailModal = openStudentDetailModal;

/* ==========================================================
   TIMETABLE & SUBJECT MANAGEMENT
   ========================================================== */
async function loadTimetable() {
  const container = $('timetable-grid');
  try {
    const { courses } = await apiFetch('/courses');
    state.courses = courses || [];
    renderTimetableCards(state.courses);
    $('open-add-subject-modal').style.display = state.role === 'teacher' ? 'block' : 'none';
  } catch (err) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-faint);font-size:13px">Could not load timetable: ${err.message}</div>`;
  }
}

function renderTimetableCards(courses) {
  const container = $('timetable-grid');
  if (!courses.length) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-faint);font-size:13px">No subjects scheduled yet.</div>`;
    return;
  }
  container.innerHTML = courses.map(c => `
    <div class="timetable-card">
      <div class="timetable-card-header">
        <div>
          <h3>${c.title}</h3>
          <span style="font-size:11px;color:var(--ink-faint)">Instructor: ${c.teacherId?.name || state.user?.name || 'Faculty'}</span>
        </div>
        <span class="code-pill">${c.code}</span>
      </div>
      <div class="timetable-card-body">
        <div><i data-lucide="clock"></i> <strong>${c.schedule || 'Mon, Wed • 09:00 AM - 10:30 AM'}</strong></div>
        <div><i data-lucide="map-pin"></i> <span>${c.room || 'Room 204'}</span></div>
        <div><i data-lucide="users"></i> <span>Section ${c.section || 'A'} · ${c.enrolledStudents?.length || 0} enrolled</span></div>
      </div>
    </div>
  `).join('');
  renderIcons();
}

async function handleAddSubjectSubmit(e) {
  e.preventDefault();
  const btn = $('save-subject-btn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const payload = {
      title: $('sub-title').value.trim(),
      code: $('sub-code').value.trim(),
      section: $('sub-section').value.trim(),
      room: $('sub-room').value.trim(),
      schedule: $('sub-schedule').value.trim(),
    };
    await apiFetch('/courses', { method: 'POST', body: JSON.stringify(payload) });
    toast('New subject created successfully!', 'success');
    $('add-subject-modal').classList.remove('visible');
    $('add-subject-form').reset();
    await loadTimetable();
    await loadTeacherData();
  } catch (err) {
    toast(err.message || 'Could not create subject', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Create Subject';
  }
}

/* ==========================================================
   PROFILE MANAGEMENT
   ========================================================== */
function loadProfile() {
  const user = state.user;
  if (!user) return;
  $('profile-avatar-large').textContent = initials(user.name);
  $('profile-avatar-large').className = `avatar avatar-${avatarColor(user.name)} avatar-lg`;
  $('profile-full-name').textContent = user.name;
  $('profile-email-label').textContent = user.email;
  $('profile-role-badge').textContent = user.role.toUpperCase();
  
  $('profile-input-name').value = user.name;
  $('profile-input-email').value = user.email;
  $('profile-input-rollno').value = user.rollNo || '';
  $('profile-rollno-group').style.display = user.role === 'student' ? '' : 'none';
}

async function handleSaveProfile(e) {
  e.preventDefault();
  try {
    const { user } = await apiFetch('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: $('profile-input-name').value.trim(),
        email: $('profile-input-email').value.trim(),
        rollNo: $('profile-input-rollno').value.trim()
      })
    });
    saveSession(state.token, user);
    await initApp();
    loadProfile();
    toast('Profile updated successfully!', 'success');
  } catch (err) {
    toast(err.message || 'Could not update profile', 'error');
  }
}

/* ==========================================================
   STUDENT DASHBOARD
   ========================================================== */
async function loadStudentData() {
  const user = state.user;
  $('student-greeting').textContent = `Welcome back, ${user.name.split(' ')[0]}! ✦`;
  try {
    const { courses } = await apiFetch('/courses');
    state.courses = courses || [];
    $('stu-courses').textContent = String(state.courses.length).padStart(2, '0');
    await renderStudentCourses();
    await renderStudentHistory();
  } catch (err) {
    toast('Could not load courses: ' + err.message, 'error');
  }
}

async function renderStudentHistory() {
  const container = $('student-history-list');
  if (!container) return;
  try {
    const { history } = await apiFetch('/attendance/history');
    if (!history || !history.length) {
      container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-faint);font-size:13px">No past attendance records found yet.</div>`;
      return;
    }
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${history.map(item => {
          const course = item.sessionId?.courseId || {};
          const scanTime = fmt12(item.scannedAt);
          const scanDate = item.scannedAt ? new Date(item.scannedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—';
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--paper);border:1px solid var(--border);border-radius:var(--radius-md)">
              <div style="display:flex;align-items:center;gap:12px">
                <span class="code-pill">${course.code || 'CS'}</span>
                <div>
                  <strong style="font-size:13px;display:block;color:var(--ink);font-weight:600">${course.title || 'Course Session'}</strong>
                  <span style="font-size:11px;color:var(--ink-faint)">${scanDate} · ${course.room || 'Room 204'} · ${course.schedule || 'Regular Class'}</span>
                </div>
              </div>
              <div style="text-align:right">
                <span class="badge" style="background:var(--mint-light);color:var(--mint-dark);font-size:11px;padding:3px 10px;font-weight:600;border-radius:12px">Present ✓</span>
                <div style="font-size:11px;color:var(--ink-faint);margin-top:3px">${scanTime}</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
    renderIcons();
  } catch (err) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-faint);font-size:13px">Could not load history: ${err.message}</div>`;
  }
}

async function renderStudentCourses() {
  const list = $('student-course-list');
  if (state.courses.length === 0) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-faint);font-size:13px">You are not enrolled in any courses yet.</div>`;
    return;
  }
  list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-faint);font-size:13px">Loading attendance…</div>`;

  const bgClasses = ['coral-bg', 'mint-bg', 'blue-bg'];

  try {
    const results = await Promise.all(state.courses.map(c =>
      apiFetch(`/attendance/student/${state.user.id}/course/${c._id}`).catch(() => ({ attended: 0, total: 0, percentage: 0 }))
    ));

    let totalAttended = 0, totalSessions = 0;
    list.innerHTML = state.courses.map((c, i) => {
      const r = results[i];
      totalAttended += r.attended || 0;
      totalSessions += r.total || 0;
      const pct = r.percentage || 0;
      const pctClass = pct >= 85 ? 'good' : pct >= 75 ? '' : 'warning';
      const progressClass = pct >= 85 ? 'mint-progress' : pct >= 75 ? '' : 'yellow-progress';
      return `
        <div class="course-item">
          <span class="course-code ${bgClasses[i % bgClasses.length]}">${c.code}</span>
          <div>
            <strong>${c.title}</strong>
            <small>${r.attended || 0} of ${r.total || 0} sessions attended · ${c.schedule || ''}</small>
          </div>
          <strong class="course-percent ${pctClass}">${pct.toFixed(1)}%</strong>
          <div class="mini-progress ${progressClass}"><span style="width:${pct}%"></span></div>
        </div>
      `;
    }).join('');

    const overallPct = totalSessions ? Math.round((totalAttended / totalSessions) * 1000) / 10 : 0;
    $('stu-pct').textContent = overallPct.toFixed(1) + '%';
    $('student-overall-pct').textContent = overallPct.toFixed(1) + '%';
    $('stu-pct-label').textContent = overallPct >= 75 ? '✓ On track' : '⚠ Below 75% threshold';
    $('stu-status').textContent = state.courses.length > 0 ? 'Active' : '—';
    $('stu-status-label').textContent = `${state.courses.length} course${state.courses.length !== 1 ? 's' : ''}`;
  } catch (err) {
    list.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-faint);font-size:13px">Could not load attendance: ${err.message}</div>`;
  }
}

/* ==========================================================
   QR CAMERA SCANNER (Student)
   ========================================================== */
function openScanner() {
  const overlay = $('scanner-modal');
  overlay.classList.add('visible');
  $('scanner-hint').textContent = 'Requesting camera access…';
  startCameraScanner();
  renderIcons();
}

function closeScanner() {
  stopCameraScanner();
  $('scanner-modal').classList.remove('visible');
}

async function startCameraScanner() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    state.scannerStream = stream;
    const video = $('camera-video');
    video.srcObject = stream;
    await video.play();
    $('scanner-hint').textContent = 'Align the QR code within the frame…';
    scanFrame();
  } catch (err) {
    $('scanner-hint').textContent = 'Camera access denied. Please allow camera permissions.';
    toast('Camera access denied', 'error');
  }
}

function stopCameraScanner() {
  if (state.scannerRaf) { cancelAnimationFrame(state.scannerRaf); state.scannerRaf = null; }
  if (state.scannerStream) { state.scannerStream.getTracks().forEach(t => t.stop()); state.scannerStream = null; }
  const video = $('camera-video');
  video.srcObject = null;
}

function scanFrame() {
  const video = $('camera-video');
  const canvas = $('camera-canvas');
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.height = video.videoHeight;
    canvas.width = video.videoWidth;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = window.jsQR ? jsQR(imageData.data, imageData.width, imageData.height) : null;
    if (code) {
      handleScannedQR(code.data);
      return;
    }
  }
  state.scannerRaf = requestAnimationFrame(scanFrame);
}

async function handleScannedQR(data) {
  closeScanner();
  $('scanner-hint').textContent = 'Processing…';
  try {
    const payload = JSON.parse(data);
    if (!payload.sessionId || !payload.token) throw new Error('Invalid QR code');
    await apiFetch('/attendance/mark', { method: 'POST', body: JSON.stringify({ sessionId: payload.sessionId, token: payload.token }) });
    toast('Attendance marked successfully! You are present ✓', 'success');
    await renderStudentCourses();
  } catch (err) {
    const codeMsg = {
      SESSION_CLOSED: 'Session is closed. Ask your teacher to start the session.',
      INVALID_QR: 'This QR is invalid. The code may have rotated — try scanning again.',
      QR_EXPIRED: 'QR expired. Scan the screen again quickly!',
      ALREADY_MARKED: 'Your attendance was already marked for this session.',
      NOT_ENROLLED: 'You are not enrolled in this course.',
    };
    toast(codeMsg[err.code] || err.message || 'Could not mark attendance', 'error');
  }
}

/* ==========================================================
   NAVIGATION & LISTENERS
   ========================================================== */
function initNav() {
  document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
    });
  });

  const performLogout = () => {
    clearSession();
    $('student-list').innerHTML = '';
    $('course-schedule-list').innerHTML = '';
    showAuthOverlay();
    toast('Signed out successfully', 'default');
    renderIcons();
  };

  $('logout-btn').addEventListener('click', performLogout);
  $('profile-logout-btn').addEventListener('click', performLogout);
  $('profile-mini').addEventListener('click', () => switchView('profile'));

  $('start-session-btn').addEventListener('click', startSession);
  $('stop-session').addEventListener('click', async () => {
    if (!state.activeSession) return;
    await stopSession();
  });

  $('export-csv').addEventListener('click', exportCSV);

  $('scan-btn').addEventListener('click', openScanner);
  $('scanner-close').addEventListener('click', closeScanner);
  $('scanner-modal').addEventListener('click', e => {
    if (e.target === $('scanner-modal')) closeScanner();
  });

  $('refresh-student-btn').addEventListener('click', async () => {
    await renderStudentCourses();
    toast('Attendance data refreshed', 'success');
  });

  // Students search filter
  $('students-search').addEventListener('input', e => {
    const query = e.target.value.toLowerCase().trim();
    const filtered = _allStudents.filter(st => st.name.toLowerCase().includes(query) || (st.rollNo && st.rollNo.toLowerCase().includes(query)) || st.email.toLowerCase().includes(query));
    renderStudentsDirectory(filtered);
  });

  // Add Subject modal & form
  $('open-add-subject-modal').addEventListener('click', () => $('add-subject-modal').classList.add('visible'));
  $('add-subject-close').addEventListener('click', () => $('add-subject-modal').classList.remove('visible'));
  $('add-subject-form').addEventListener('submit', handleAddSubjectSubmit);

  // Student detail attendance history modal
  const closeStudentDetailModal = () => $('student-detail-modal').classList.remove('visible');
  $('student-detail-close').addEventListener('click', closeStudentDetailModal);
  $('student-detail-modal').addEventListener('click', e => {
    if (e.target === $('student-detail-modal')) closeStudentDetailModal();
  });

  // Profile form
  $('profile-form').addEventListener('submit', handleSaveProfile);
}

/* ==========================================================
   BOOT
   ========================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  initAuthUI();
  initNav();
  renderIcons();

  if (restoreSession()) {
    hideAuthOverlay();
    await initApp();
  } else {
    showAuthOverlay();
  }
});