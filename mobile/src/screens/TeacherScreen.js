import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, Modal, TextInput,
  Share, Platform,
} from 'react-native';
import { io } from 'socket.io-client';
import QRCode from 'react-native-qrcode-svg';
import { palette, getInitials, getAvatarColor, fmt12 } from '../theme';
import {
  getCourses, startSession, stopSession, getSocketUrl,
  getStudents, createCourse, updateProfile, exportAttendanceCsv,
} from '../api';

const QR_TTL = 8;

export default function TeacherScreen({ user, token, onLogout }) {
  const [activeTab, setActiveTab] = useState('courses');
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [activeCourse, setActiveCourse] = useState(null);
  const [session, setSession] = useState(null);
  const [roster, setRoster] = useState([]);
  const [qrPayload, setQrPayload] = useState('');
  const [countdown, setCountdown] = useState(QR_TTL);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);
  const [exporting, setExporting] = useState(null); // courseId being exported

  // New course form
  const [formTitle, setFormTitle] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formSection, setFormSection] = useState('A');
  const [formRoom, setFormRoom] = useState('Room 101');
  const [formSchedule, setFormSchedule] = useState('Mon, Wed • 09:00 AM - 10:30 AM');
  const [formSaving, setFormSaving] = useState(false);

  // Profile
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [profileSaving, setProfileSaving] = useState(false);

  const socketRef = useRef(null);
  const countdownRef = useRef(null);

  /* ── Data fetchers ─────────────────────────────────────────── */
  const fetchCourses = useCallback(async () => {
    try {
      const data = await getCourses();
      setCourses(data || []);
      if (data?.length && !activeCourse) setActiveCourse(data[0]);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not load courses');
    } finally { setLoading(false); setRefreshing(false); }
  }, [activeCourse]);

  const fetchStudents = useCallback(async () => {
    try { setStudents((await getStudents()) || []); }
    catch { /* silent */ }
  }, []);

  useEffect(() => { fetchCourses(); fetchStudents(); }, []);

  /* ── QR countdown & socket ─────────────────────────────────── */
  const startCountdown = useCallback(expiresAt => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(Math.max(0, Math.ceil((new Date(expiresAt) - Date.now()) / 1000)));
    }, 500);
  }, []);

  const connectSocket = useCallback(sessionId => {
    if (socketRef.current) socketRef.current.disconnect();
    const socket = io(getSocketUrl(), {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket', 'polling'],
    });
    socket.on('connect', () => socket.emit('session:join', sessionId));
    socket.on('session:token', p => {
      setQrPayload(JSON.stringify({ sessionId: p.sessionId, token: p.token }));
      startCountdown(p.expiresAt);
    });
    socket.on('attendance:marked', p => {
      setRoster(prev => {
        const att = p.attendance || p;
        if (prev.find(r => r._id === att._id)) return prev;
        return [att, ...prev];
      });
    });
    socketRef.current = socket;
  }, [token, startCountdown]);

  /* ── Session actions ───────────────────────────────────────── */
  const handleStart = async () => {
    if (!activeCourse) return Alert.alert('Select a course first');
    setStarting(true);
    try {
      const s = await startSession(activeCourse._id);
      setSession(s);
      setRoster([]);
      setQrPayload(JSON.stringify({ sessionId: s._id, token: s.currentToken }));
      startCountdown(s.tokenExpiresAt);
      connectSocket(s._id);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not start session');
    } finally { setStarting(false); }
  };

  const handleStop = () => {
    Alert.alert('End session?', 'Students will no longer be able to scan.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End session', style: 'destructive', onPress: async () => {
          try { await stopSession(session._id); } catch { /* ignore */ }
          setSession(null); setQrPayload('');
          if (countdownRef.current) clearInterval(countdownRef.current);
          if (socketRef.current) { socketRef.current.disconnect(); socketRef.current = null; }
        },
      },
    ]);
  };

  /* ── Create course ─────────────────────────────────────────── */
  const handleCreateCourse = async () => {
    if (!formTitle.trim() || !formCode.trim()) return Alert.alert('Error', 'Title and Code are required.');
    setFormSaving(true);
    try {
      await createCourse({ title: formTitle.trim(), code: formCode.trim(), section: formSection.trim(), room: formRoom.trim(), schedule: formSchedule.trim() });
      Alert.alert('Success', 'Course created!');
      setShowAddCourseModal(false);
      setFormTitle(''); setFormCode('');
      fetchCourses();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not create course');
    } finally { setFormSaving(false); }
  };

  /* ── Export CSV ─────────────────────────────────────────────── */
  const handleExport = async (course) => {
    setExporting(course._id);
    try {
      const csv = await exportAttendanceCsv(course._id);
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${course.code}-attendance.csv`; a.click();
      } else {
        await Share.share({ message: csv, title: `${course.code} Attendance Export` });
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Export failed');
    } finally { setExporting(null); }
  };

  /* ── Profile ───────────────────────────────────────────────── */
  const handleSaveProfile = async () => {
    setProfileSaving(true);
    try {
      await updateProfile({ name: profileName.trim(), email: profileEmail.trim() });
      Alert.alert('Success', 'Profile updated!');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not update profile');
    } finally { setProfileSaving(false); }
  };

  useEffect(() => () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (socketRef.current) socketRef.current.disconnect();
  }, []);

  if (loading) return <View style={s.center}><ActivityIndicator color={palette.coral} size="large" /></View>;

  const enrolled = activeCourse?.enrolledStudents?.length || 0;

  /* ── Render ────────────────────────────────────────────────── */
  return (
    <View style={s.root}>
      {/* ── Top bar ────────────────────────────────────────── */}
      <View style={s.topbar}>
        <View style={s.topLeft}>
          <View style={s.brandMark}><Text style={s.brandMarkText}>A</Text></View>
          <View>
            <Text style={s.topTitle}>Teacher Console</Text>
            <Text style={s.topSub}>{user.name}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
          <Text style={s.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab bar ────────────────────────────────────────── */}
      <View style={s.tabBar}>
        {[
          { key: 'courses', label: '📚 Courses' },
          { key: 'session', label: '⚡ Live' },
          { key: 'export', label: '📤 Export' },
          { key: 'profile', label: '👤 Profile' },
        ].map(t => (
          <TouchableOpacity key={t.key} style={[s.tabItem, activeTab === t.key && s.tabItemActive]} onPress={() => setActiveTab(t.key)}>
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchCourses(); fetchStudents(); }} tintColor={palette.coral} />}
      >
        {/* ══════════════════════════════════════════════════ *
         *  TAB 1 — COURSE MANAGEMENT (Teacher-only: FR-2)   *
         * ══════════════════════════════════════════════════ */}
        {activeTab === 'courses' && (
          <>
            {/* Quick stats */}
            <View style={s.statsRow}>
              <StatCard label="My Courses" value={String(courses.length).padStart(2, '0')} color={palette.coral} />
              <StatCard label="Students" value={String(students.length).padStart(2, '0')} color={palette.blue} />
            </View>

            {/* Create course button */}
            <TouchableOpacity style={s.createBtn} onPress={() => setShowAddCourseModal(true)} activeOpacity={0.85}>
              <Text style={s.createBtnIcon}>＋</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.createBtnTitle}>Create New Course</Text>
                <Text style={s.createBtnSub}>Add a subject to your teaching roster</Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </TouchableOpacity>

            {/* Course list */}
            {courses.length > 0 ? (
              <View style={s.card}>
                <Text style={s.sectionTitle}>My Courses</Text>
                {courses.map((c, i) => {
                  const enrollCount = c.enrolledStudents?.length || 0;
                  const tagColors = [
                    { bg: palette.coralLight, fg: palette.coralDark },
                    { bg: palette.mintLight, fg: '#2d7a55' },
                    { bg: palette.blueLight, fg: '#2e5fa1' },
                    { bg: palette.yellowLight, fg: '#9a6e1a' },
                  ];
                  const tc = tagColors[i % tagColors.length];
                  return (
                    <View key={c._id} style={[s.courseRow, i === courses.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={[s.codeTag, { backgroundColor: tc.bg }]}>
                        <Text style={[s.codeTagText, { color: tc.fg }]}>{c.code}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.courseTitle}>{c.title}</Text>
                        <Text style={s.courseSub}>Section {c.section || 'A'} · {c.room || 'TBD'}</Text>
                        <Text style={s.courseSub}>🕒 {c.schedule || 'Schedule not set'}</Text>
                        <View style={s.enrollPill}>
                          <Text style={s.enrollText}>👥 {enrollCount} student{enrollCount !== 1 ? 's' : ''} enrolled</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={s.emptyCard}>
                <Text style={s.emptyIcon}>📚</Text>
                <Text style={s.emptyTitle}>No courses yet</Text>
                <Text style={s.emptyText}>Create your first course to get started.</Text>
              </View>
            )}

            {/* Students directory */}
            {students.length > 0 && (
              <View style={s.card}>
                <Text style={s.sectionTitle}>Registered Students ({students.length})</Text>
                {students.map((st, i) => {
                  const col = getAvatarColor(st.name);
                  const pct = st.overallPct ?? 100;
                  return (
                    <TouchableOpacity
                      key={st.id || i}
                      style={[s.studentRow, i === students.length - 1 && { borderBottomWidth: 0 }]}
                      onPress={() => {
                        Alert.alert(
                          `📊 ${st.name} — Attendance`,
                          `Roll No: ${st.rollNo || 'N/A'}\nEmail: ${st.email}\n\n` +
                          `Overall Attendance: ${pct.toFixed(1)}%\n` +
                          `Sessions Attended: ${st.attendedSessions || 0} / ${st.totalSessions || 0}\n` +
                          `Enrolled Courses: ${st.coursesCount || 0}`
                        );
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[s.avatarSm, { backgroundColor: col.bg }]}>
                        <Text style={[s.avatarSmText, { color: col.fg }]}>{getInitials(st.name)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={s.studentName}>{st.name}</Text>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: pct >= 85 ? palette.mint : pct >= 75 ? palette.blue : palette.coral }}>
                            {pct.toFixed(1)}%
                          </Text>
                        </View>
                        <Text style={s.studentSub}>{st.rollNo || 'No Roll'} · {st.email}</Text>
                        <Text style={{ fontSize: 10, color: palette.inkFaint, marginTop: 2 }}>
                          {st.attendedSessions || 0} of {st.totalSessions || 0} sessions attended · Tap for history
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════ *
         *  TAB 2 — LIVE SESSION (FR-3, FR-4, FR-9)          *
         * ══════════════════════════════════════════════════ */}
        {activeTab === 'session' && (
          <>
            <View style={s.card}>
              <View style={s.cardHeader}>
                <View style={s.cardHeaderLeft}>
                  {session && <View style={s.liveDot} />}
                  <Text style={s.cardHeaderLabel}>{session ? 'Live session' : 'Start a session'}</Text>
                </View>
                {session && (
                  <TouchableOpacity onPress={handleStop} style={s.stopBtn}>
                    <Text style={s.stopBtnText}>■ End</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!session && (
                <>
                  <TouchableOpacity style={s.coursePickerBtn} onPress={() => setShowCourseModal(true)} activeOpacity={0.75}>
                    <View style={s.coursePickerLeft}>
                      <Text style={s.coursePickerCode}>{activeCourse?.code || '—'}</Text>
                      <Text style={s.coursePickerTitle} numberOfLines={1}>{activeCourse?.title || 'Select a course'}</Text>
                    </View>
                    <Text style={s.chevron}>›</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.startBtn, (starting || !activeCourse) && { opacity: 0.5 }]} onPress={handleStart} disabled={starting || !activeCourse} activeOpacity={0.8}>
                    <Text style={s.startBtnText}>{starting ? 'Starting…' : '▶  Start attendance session'}</Text>
                  </TouchableOpacity>
                </>
              )}

              {session && !!qrPayload && (
                <>
                  <Text style={s.sessionCourse}>{activeCourse?.title} · {activeCourse?.code}</Text>
                  <Text style={s.sessionMeta}>Section {activeCourse?.section || 'A'} · {activeCourse?.room || 'Room TBD'}</Text>

                  {/* QR Display (FR-3, FR-4) */}
                  <View style={s.qrContainer}>
                    <View style={s.qrFrame}>
                      <QRCode value={qrPayload} size={180} color={palette.ink} backgroundColor={palette.paper} />
                    </View>
                    <View style={s.qrMeta}>
                      <View style={s.countdownBadge}>
                        <Text style={s.countdownNum}>{String(countdown).padStart(2, '0')}</Text>
                        <Text style={s.countdownLabel}>seconds left</Text>
                      </View>
                      <Text style={s.qrHint}>QR rotates automatically{'\n'}every {QR_TTL} seconds</Text>
                    </View>
                  </View>

                  {/* Live attendance count */}
                  <View style={s.presentRow}>
                    <Text style={s.presentNum}>{roster.length}</Text>
                    <Text style={s.presentOf}> / {enrolled}</Text>
                    <Text style={s.presentLabel}>  students present</Text>
                  </View>
                </>
              )}
            </View>

            {/* Live Attendance Dashboard (FR-9) */}
            {session && roster.length > 0 && (
              <View style={s.card}>
                <Text style={s.sectionTitle}>Live Attendance Dashboard</Text>
                <View style={s.dashboardHeader}>
                  <Text style={s.dashHeaderText}>Name</Text>
                  <Text style={s.dashHeaderText}>Roll No</Text>
                  <Text style={s.dashHeaderText}>Time</Text>
                </View>
                {roster.map((r, i) => {
                  const stu = r.studentId || {};
                  const col = getAvatarColor(stu.name || '');
                  return (
                    <View key={r._id || i} style={[s.rosterRow, i === roster.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={[s.avatarSm, { backgroundColor: col.bg }]}>
                        <Text style={[s.avatarSmText, { color: col.fg }]}>{getInitials(stu.name)}</Text>
                      </View>
                      <View style={s.rosterInfo}>
                        <Text style={s.rosterName}>{stu.name || 'Student'}</Text>
                        <Text style={s.rosterSub}>{stu.rollNo || '—'}</Text>
                      </View>
                      <View style={s.timeStamp}>
                        <Text style={s.timeText}>{fmt12(r.scannedAt)}</Text>
                      </View>
                      <Text style={s.checkmark}>✓</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {session && roster.length === 0 && (
              <View style={s.emptyCard}>
                <Text style={s.emptyIcon}>📡</Text>
                <Text style={s.emptyTitle}>Waiting for students…</Text>
                <Text style={s.emptyText}>Students will appear here as they scan the QR code.</Text>
              </View>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════ *
         *  TAB 3 — EXPORT ATTENDANCE (FR-11)                *
         * ══════════════════════════════════════════════════ */}
        {activeTab === 'export' && (
          <>
            <View style={s.exportHeader}>
              <Text style={s.exportHeaderIcon}>📤</Text>
              <Text style={s.exportHeaderTitle}>Export Attendance</Text>
              <Text style={s.exportHeaderSub}>Download attendance records as CSV for any of your courses</Text>
            </View>

            {courses.length === 0 ? (
              <View style={s.emptyCard}>
                <Text style={s.emptyIcon}>📭</Text>
                <Text style={s.emptyTitle}>No courses to export</Text>
                <Text style={s.emptyText}>Create a course and run sessions first.</Text>
              </View>
            ) : (
              courses.map((c, i) => (
                <View key={c._id} style={s.exportRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.exportCourseTitle}>{c.title}</Text>
                    <Text style={s.exportCourseSub}>{c.code} · Section {c.section || 'A'}</Text>
                  </View>
                  <TouchableOpacity
                    style={[s.exportBtn, exporting === c._id && { opacity: 0.5 }]}
                    onPress={() => handleExport(c)}
                    disabled={exporting === c._id}
                    activeOpacity={0.8}
                  >
                    {exporting === c._id
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={s.exportBtnText}>⬇ CSV</Text>
                    }
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════ *
         *  TAB 4 — PROFILE                                   *
         * ══════════════════════════════════════════════════ */}
        {activeTab === 'profile' && (
          <View style={s.card}>
            <View style={s.profileHeader}>
              <View style={[s.avatarXL, { backgroundColor: palette.coralLight }]}>
                <Text style={{ color: palette.coralDark, fontSize: 24, fontWeight: '800' }}>{getInitials(user.name)}</Text>
              </View>
              <Text style={s.profileName}>{user.name}</Text>
              <Text style={s.profileEmail}>{user.email}</Text>
              <View style={s.roleBadge}><Text style={s.roleBadgeText}>TEACHER ACCOUNT</Text></View>
            </View>

            <View style={{ padding: 16 }}>
              <Text style={s.fieldLabel}>Full Name</Text>
              <TextInput style={s.input} value={profileName} onChangeText={setProfileName} />

              <Text style={s.fieldLabel}>Email Address</Text>
              <TextInput style={s.input} value={profileEmail} onChangeText={setProfileEmail} keyboardType="email-address" />

              <TouchableOpacity style={[s.startBtn, { marginTop: 14 }]} onPress={handleSaveProfile} disabled={profileSaving}>
                <Text style={s.startBtnText}>{profileSaving ? 'Saving...' : 'Save Profile'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[s.signOutBtn, { marginTop: 16 }]} onPress={onLogout}>
                <Text style={s.signOutText}>Sign Out of Account</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Course picker modal ────────────────────────────── */}
      <Modal visible={showCourseModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCourseModal(false)}>
        <View style={s.modalRoot}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Select course</Text>
            <TouchableOpacity onPress={() => setShowCourseModal(false)} style={s.modalCloseBtn}>
              <Text style={s.modalCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView>
            {courses.map((c, i) => (
              <TouchableOpacity key={c._id} style={s.modalRow} onPress={() => { setActiveCourse(c); setShowCourseModal(false); }} activeOpacity={0.7}>
                <View style={[s.codeTag, { backgroundColor: [palette.coralLight, palette.mintLight, palette.blueLight][i % 3] }]}>
                  <Text style={s.codeTagText}>{c.code}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.courseRowTitle}>{c.title}</Text>
                  <Text style={s.courseRowSub}>Section {c.section || 'A'} · {c.room || 'TBD'}</Text>
                </View>
                {activeCourse?._id === c._id && <Text style={{ color: palette.coral, fontWeight: '800' }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Create course modal ────────────────────────────── */}
      <Modal visible={showAddCourseModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddCourseModal(false)}>
        <View style={s.modalRoot}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Create New Course</Text>
            <TouchableOpacity onPress={() => setShowAddCourseModal(false)} style={s.modalCloseBtn}>
              <Text style={s.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 18 }}>
            <Text style={s.fieldLabel}>Course / Subject Name</Text>
            <TextInput style={s.input} placeholder="e.g. Artificial Intelligence" placeholderTextColor={palette.inkFaint} value={formTitle} onChangeText={setFormTitle} />

            <Text style={s.fieldLabel}>Course Code</Text>
            <TextInput style={s.input} placeholder="e.g. CS401" placeholderTextColor={palette.inkFaint} value={formCode} onChangeText={setFormCode} />

            <Text style={s.fieldLabel}>Section</Text>
            <TextInput style={s.input} placeholder="e.g. Section A" placeholderTextColor={palette.inkFaint} value={formSection} onChangeText={setFormSection} />

            <Text style={s.fieldLabel}>Room / Hall</Text>
            <TextInput style={s.input} placeholder="e.g. Room 302" placeholderTextColor={palette.inkFaint} value={formRoom} onChangeText={setFormRoom} />

            <Text style={s.fieldLabel}>Schedule</Text>
            <TextInput style={s.input} placeholder="e.g. Mon, Wed • 10:00 AM" placeholderTextColor={palette.inkFaint} value={formSchedule} onChangeText={setFormSchedule} />

            <TouchableOpacity style={[s.startBtn, { marginTop: 16 }]} onPress={handleCreateCourse} disabled={formSaving}>
              <Text style={s.startBtnText}>{formSaving ? 'Creating...' : 'Create Course'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function StatCard({ label, value, color }) {
  return (
    <View style={s.statCard}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────────── */
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper },
  topbar: { backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, paddingTop: 52 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { backgroundColor: palette.coral, width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  topTitle: { fontWeight: '800', fontSize: 15, color: palette.ink, letterSpacing: -0.2 },
  topSub: { color: palette.inkFaint, fontSize: 11, marginTop: 1 },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: palette.border },
  logoutText: { color: palette.inkMuted, fontSize: 12, fontWeight: '700' },

  tabBar: { flexDirection: 'row', backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.border, paddingHorizontal: 4 },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: { borderBottomColor: palette.coral },
  tabText: { fontSize: 11, fontWeight: '600', color: palette.inkFaint },
  tabTextActive: { color: palette.coralDark, fontWeight: '800' },

  scroll: { padding: 16, paddingBottom: 40 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, alignItems: 'center' },
  statValue: { fontWeight: '800', fontSize: 26, letterSpacing: -0.5 },
  statLabel: { color: palette.inkFaint, fontSize: 10, marginTop: 3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Create course CTA
  createBtn: { backgroundColor: palette.coral, borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  createBtnIcon: { color: '#fff', fontSize: 22, fontWeight: '800', width: 38, height: 38, lineHeight: 38, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 19, overflow: 'hidden' },
  createBtnTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  createBtnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },

  // Card
  card: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14, overflow: 'hidden' },
  sectionTitle: { fontWeight: '800', fontSize: 14, color: palette.ink, padding: 16, paddingBottom: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: palette.border },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardHeaderLabel: { color: palette.inkMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },

  // Course rows
  courseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.border },
  codeTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginTop: 2 },
  codeTagText: { fontWeight: '800', fontSize: 11 },
  courseTitle: { fontWeight: '700', fontSize: 14, color: palette.ink },
  courseSub: { color: palette.inkFaint, fontSize: 11, marginTop: 2 },
  enrollPill: { alignSelf: 'flex-start', backgroundColor: palette.mintLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginTop: 6 },
  enrollText: { color: '#2d7a55', fontSize: 10, fontWeight: '700' },
  chevron: { color: palette.inkFaint, fontSize: 22, marginLeft: 8 },

  // Students
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.border },
  avatarSm: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarSmText: { fontWeight: '800', fontSize: 11 },
  studentName: { fontWeight: '700', fontSize: 13, color: palette.ink },
  studentSub: { color: palette.inkFaint, fontSize: 11, marginTop: 1 },
  moreText: { padding: 14, textAlign: 'center', color: palette.inkFaint, fontSize: 12, fontWeight: '600' },

  // Session
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.coral },
  stopBtn: { backgroundColor: palette.coralLight, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(242,126,104,.25)' },
  stopBtnText: { color: palette.coralDark, fontWeight: '800', fontSize: 13 },
  coursePickerBtn: { flexDirection: 'row', alignItems: 'center', margin: 14, borderWidth: 1.5, borderColor: palette.border, borderRadius: 12, padding: 14, backgroundColor: palette.paper },
  coursePickerLeft: { flex: 1 },
  coursePickerCode: { fontSize: 10, fontWeight: '800', color: palette.inkFaint, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  coursePickerTitle: { fontSize: 15, fontWeight: '700', color: palette.ink },
  startBtn: { backgroundColor: palette.coral, marginHorizontal: 14, marginBottom: 14, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sessionCourse: { fontSize: 16, fontWeight: '800', color: palette.ink, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 2 },
  sessionMeta: { fontSize: 12, color: palette.inkFaint, paddingHorizontal: 16, paddingBottom: 10 },
  qrContainer: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16 },
  qrFrame: { backgroundColor: palette.paper, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: palette.border },
  qrMeta: { flex: 1, alignItems: 'center', gap: 10 },
  countdownBadge: { backgroundColor: palette.navy, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center' },
  countdownNum: { color: '#fff', fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  countdownLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  qrHint: { color: palette.inkFaint, fontSize: 11, textAlign: 'center', lineHeight: 17 },
  presentRow: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 16, paddingBottom: 16 },
  presentNum: { fontWeight: '800', fontSize: 28, color: palette.mint },
  presentOf: { fontWeight: '700', fontSize: 20, color: palette.inkFaint },
  presentLabel: { color: palette.inkFaint, fontSize: 13, fontWeight: '600' },

  // Dashboard
  dashboardHeader: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: palette.paper, borderBottomWidth: 1, borderBottomColor: palette.border },
  dashHeaderText: { flex: 1, fontSize: 10, fontWeight: '700', color: palette.inkFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.border },
  rosterInfo: { flex: 1 },
  rosterName: { fontWeight: '700', fontSize: 13, color: palette.ink },
  rosterSub: { color: palette.inkFaint, fontSize: 11, marginTop: 1 },
  timeStamp: { backgroundColor: palette.paper, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  timeText: { fontSize: 10, fontWeight: '700', color: palette.inkMuted },
  checkmark: { color: palette.mint, fontSize: 18, fontWeight: '800' },

  // Export
  exportHeader: { alignItems: 'center', padding: 24, marginBottom: 14 },
  exportHeaderIcon: { fontSize: 40, marginBottom: 10 },
  exportHeaderTitle: { fontSize: 20, fontWeight: '800', color: palette.ink, marginBottom: 4 },
  exportHeaderSub: { color: palette.inkFaint, fontSize: 13, textAlign: 'center' },
  exportRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderRadius: 14, borderWidth: 1, borderColor: palette.border, padding: 16, marginBottom: 10, gap: 14 },
  exportCourseTitle: { fontWeight: '700', fontSize: 14, color: palette.ink },
  exportCourseSub: { color: palette.inkFaint, fontSize: 11, marginTop: 2 },
  exportBtn: { backgroundColor: palette.mint, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  exportBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  // Profile
  profileHeader: { alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.paper },
  avatarXL: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  profileName: { fontSize: 18, fontWeight: '800', color: palette.ink },
  profileEmail: { fontSize: 12, color: palette.inkFaint, marginTop: 2 },
  roleBadge: { backgroundColor: palette.coralLight, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginTop: 8 },
  roleBadgeText: { color: palette.coralDark, fontSize: 10, fontWeight: '800' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: palette.inkMuted, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: palette.ink, marginVertical: 6 },
  signOutBtn: { backgroundColor: palette.coralLight, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(242,126,104,.25)' },
  signOutText: { color: palette.coralDark, fontWeight: '800', fontSize: 14 },

  // Empty
  emptyCard: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, alignItems: 'center', padding: 36, marginBottom: 14 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontWeight: '800', fontSize: 16, color: palette.ink, marginBottom: 6 },
  emptyText: { color: palette.inkFaint, fontSize: 13, textAlign: 'center' },

  // Modals
  modalRoot: { flex: 1, backgroundColor: palette.paper },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, paddingTop: 20, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.surface },
  modalTitle: { fontWeight: '800', fontSize: 17, color: palette.ink },
  modalCloseBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: palette.coralLight, borderRadius: 8 },
  modalCloseText: { color: palette.coralDark, fontWeight: '800', fontSize: 13 },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.surface, marginBottom: 1 },
  courseRowTitle: { fontWeight: '700', fontSize: 14, color: palette.ink },
  courseRowSub: { color: palette.inkFaint, fontSize: 11, marginTop: 2 },
});
