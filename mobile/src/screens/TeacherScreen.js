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
  getSessionRoster,
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
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const fetchCurrentRoster = useCallback(async (sessionId) => {
    try {
      const data = await getSessionRoster(sessionId);
      if (data?.students) {
        setRoster(data.students);
      }
    } catch { /* silent */ }
  }, []);

  const connectSocket = useCallback(sessionId => {
    if (socketRef.current) socketRef.current.disconnect();
    const socket = io(getSocketUrl(), {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket', 'polling'],
    });

    const joinRoom = () => socket.emit('session:join', sessionId);
    socket.on('connect', joinRoom);
    if (socket.connected) joinRoom();

    socket.on('session:token', p => {
      setQrPayload(JSON.stringify({ sessionId: p.sessionId, token: p.token }));
      startCountdown(p.expiresAt);
    });

    socket.on('attendance:marked', p => {
      const att = p.attendance || p;
      if (!att || !att.studentId) return;
      setRoster(prev => {
        const stuId = att.studentId._id || att.studentId;
        const exists = prev.some(r => r._id === att._id || (r.studentId?._id || r.studentId) === stuId);
        if (exists) return prev;
        return [att, ...prev];
      });
    });

    socketRef.current = socket;
    fetchCurrentRoster(sessionId);
  }, [token, startCountdown, fetchCurrentRoster]);

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
          <TouchableOpacity style={s.menuBtn} onPress={() => setDrawerOpen(true)}>
            <Text style={s.menuIcon}>☰</Text>
          </TouchableOpacity>
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
          { key: 'courses', label: 'Courses' },
          { key: 'session', label: 'Live Session' },
          { key: 'export', label: 'Export Data' },
          { key: 'profile', label: 'Profile' },
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
         *  TAB 1 — COURSE MANAGEMENT                         *
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
              <Text style={s.createBtnIcon}>+</Text>
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
                      <View style={s.courseInfo}>
                        <Text style={s.courseTitle}>{c.title}</Text>
                        <Text style={s.courseMeta}>Section {c.section || 'A'} · {c.room || 'Room TBD'} · {enrollCount} student{enrollCount !== 1 ? 's' : ''}</Text>
                        <Text style={s.courseMeta}>{c.schedule || 'Schedule not set'}</Text>
                      </View>
                      <TouchableOpacity
                        style={[s.startBtn, activeCourse?._id === c._id && s.startBtnActive]}
                        onPress={() => { setActiveCourse(c); setActiveTab('session'); }}
                      >
                        <Text style={[s.startBtnText, activeCourse?._id === c._id && s.startBtnTextActive]}>
                          {session && activeCourse?._id === c._id ? 'Live' : 'Select'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={s.emptyCard}>
                <Text style={s.emptyTitle}>No courses yet</Text>
                <Text style={s.emptyText}>Create your first course to start taking attendance.</Text>
              </View>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════ *
         *  TAB 2 — LIVE SESSION                              *
         * ══════════════════════════════════════════════════ */}
        {activeTab === 'session' && (
          <>
            {/* Course Selector */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>Active Course</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {courses.map(c => (
                    <TouchableOpacity
                      key={c._id}
                      disabled={!!session}
                      style={[s.coursePill, activeCourse?._id === c._id && s.coursePillActive]}
                      onPress={() => setActiveCourse(c)}
                    >
                      <Text style={[s.coursePillCode, activeCourse?._id === c._id && s.coursePillCodeActive]}>{c.code}</Text>
                      <Text style={[s.coursePillTitle, activeCourse?._id === c._id && s.coursePillTitleActive]} numberOfLines={1}>{c.title}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Session Controls / QR Display */}
            <View style={s.card}>
              {!session ? (
                <View style={s.startBox}>
                  <Text style={s.startBoxTitle}>Ready to take attendance?</Text>
                  <Text style={s.startBoxSub}>
                    {activeCourse ? `Selected: ${activeCourse.title} (${activeCourse.code})` : 'Select a course above'}
                  </Text>
                  <TouchableOpacity
                    style={[s.heroStartBtn, !activeCourse && { opacity: 0.5 }]}
                    disabled={!activeCourse || starting}
                    onPress={handleStart}
                  >
                    {starting ? <ActivityIndicator color="#fff" /> : <Text style={s.heroStartBtnText}>Start Attendance Session</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={s.liveHeader}>
                    <View style={s.liveHeaderLeft}>
                      <View style={s.liveDot} />
                      <Text style={s.liveHeaderTitle}>Session Active</Text>
                    </View>
                    <TouchableOpacity style={s.stopBtn} onPress={handleStop}>
                      <Text style={s.stopBtnText}>End Session</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={s.qrBox}>
                    <View style={s.qrWrap}>
                      {qrPayload ? (
                        <QRCode value={qrPayload} size={200} color={palette.ink} backgroundColor="#fff" />
                      ) : (
                        <ActivityIndicator color={palette.coral} />
                      )}
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

            {/* Live Attendance Dashboard */}
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
                <Text style={s.emptyTitle}>Waiting for students…</Text>
                <Text style={s.emptyText}>Students will appear here in real time as they scan the QR code.</Text>
              </View>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════ *
         *  TAB 3 — EXPORT DATA                               *
         * ══════════════════════════════════════════════════ */}
        {activeTab === 'export' && (
          <View style={s.card}>
            <Text style={s.sectionTitle}>Export Attendance Reports</Text>
            {courses.length > 0 ? (
              courses.map((c, i) => (
                <View key={c._id} style={[s.exportRow, i === courses.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.exportCourseTitle}>{c.title}</Text>
                    <Text style={s.exportCourseSub}>{c.code} · Section {c.section || 'A'}</Text>
                  </View>
                  <TouchableOpacity
                    style={s.exportBtn}
                    disabled={exporting === c._id}
                    onPress={() => handleExport(c)}
                  >
                    {exporting === c._id ? (
                      <ActivityIndicator color={palette.coral} size="small" />
                    ) : (
                      <Text style={s.exportBtnText}>Export CSV</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={s.emptyText}>No courses to export.</Text>
              </View>
            )}
          </View>
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
              <View style={s.roleBadge}><Text style={s.roleBadgeText}>FACULTY ACCOUNT</Text></View>
            </View>

            <View style={{ padding: 16 }}>
              <Text style={s.fieldLabel}>Full Name</Text>
              <TextInput style={s.input} value={profileName} onChangeText={setProfileName} />

              <Text style={s.fieldLabel}>Email Address</Text>
              <TextInput style={s.input} value={profileEmail} onChangeText={setProfileEmail} keyboardType="email-address" />

              <TouchableOpacity style={[s.saveBtn, { marginTop: 14 }]} onPress={handleSaveProfile} disabled={profileSaving}>
                <Text style={s.saveBtnText}>{profileSaving ? 'Saving...' : 'Save Profile'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[s.signOutBtn, { marginTop: 16 }]} onPress={onLogout}>
                <Text style={s.signOutText}>Sign Out of Account</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Sidebar Drawer ─────────────────────────────────── */}
      <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
        <View style={s.drawerOverlay}>
          <TouchableOpacity style={s.drawerBackdrop} activeOpacity={1} onPress={() => setDrawerOpen(false)} />
          <View style={s.drawerContent}>
            <View style={s.drawerHeader}>
              <View style={[s.drawerAvatar, { backgroundColor: palette.coralLight }]}>
                <Text style={s.drawerAvatarText}>{getInitials(user.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.drawerTitle}>attendly</Text>
                <Text style={s.drawerUser}>{user.name}</Text>
                <Text style={s.drawerRole}>FACULTY</Text>
              </View>
              <TouchableOpacity onPress={() => setDrawerOpen(false)} style={s.drawerCloseBtn}>
                <Text style={s.drawerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={s.drawerNav}>
              {[
                { key: 'courses', label: 'My Courses' },
                { key: 'session', label: 'Live Session' },
                { key: 'export', label: 'Export Data' },
                { key: 'profile', label: 'Profile' },
              ].map(item => (
                <TouchableOpacity
                  key={item.key}
                  style={[s.drawerNavItem, activeTab === item.key && s.drawerNavItemActive]}
                  onPress={() => {
                    setActiveTab(item.key);
                    setDrawerOpen(false);
                  }}
                >
                  <Text style={[s.drawerNavText, activeTab === item.key && s.drawerNavTextActive]}>
                    {item.label}
                  </Text>
                  {activeTab === item.key && <View style={s.activeDot} />}
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.drawerFooter}>
              <TouchableOpacity style={s.drawerLogoutBtn} onPress={() => { setDrawerOpen(false); onLogout(); }}>
                <Text style={s.drawerLogoutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Add Course Modal ───────────────────────────────── */}
      <Modal visible={showAddCourseModal} animationType="slide" transparent onRequestClose={() => setShowAddCourseModal(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalCardTitle}>Create New Course</Text>
            <Text style={s.fieldLabel}>Course Title</Text>
            <TextInput style={s.input} placeholder="e.g. Data Structures" value={formTitle} onChangeText={setFormTitle} />
            <Text style={s.fieldLabel}>Course Code</Text>
            <TextInput style={s.input} placeholder="e.g. CS201" value={formCode} onChangeText={setFormCode} autoCapitalize="characters" />
            <Text style={s.fieldLabel}>Section</Text>
            <TextInput style={s.input} placeholder="e.g. A" value={formSection} onChangeText={setFormSection} />
            <Text style={s.fieldLabel}>Room / Venue</Text>
            <TextInput style={s.input} placeholder="e.g. Room 101" value={formRoom} onChangeText={setFormRoom} />
            <Text style={s.fieldLabel}>Schedule</Text>
            <TextInput style={s.input} placeholder="e.g. Mon, Wed • 09:00 AM" value={formSchedule} onChangeText={setFormSchedule} />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowAddCourseModal(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSaveBtn} onPress={handleCreateCourse} disabled={formSaving}>
                <Text style={s.modalSaveText}>{formSaving ? 'Creating...' : 'Create Course'}</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  topbar: { backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, paddingTop: 52 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuBtn: { paddingHorizontal: 8, paddingVertical: 4, marginRight: 2 },
  menuIcon: { fontSize: 22, fontWeight: '700', color: palette.ink },
  brandMark: { width: 32, height: 32, borderRadius: 8, backgroundColor: palette.coral, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  topTitle: { fontWeight: '800', fontSize: 16, color: palette.ink },
  topSub: { color: palette.inkFaint, fontSize: 11, marginTop: 1 },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: palette.border },
  logoutText: { color: palette.inkMuted, fontSize: 12, fontWeight: '700' },

  tabBar: { flexDirection: 'row', backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.border, paddingHorizontal: 4 },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: { borderBottomColor: palette.coral },
  tabText: { fontSize: 11, fontWeight: '600', color: palette.inkFaint },
  tabTextActive: { color: palette.coralDark, fontWeight: '800' },

  scroll: { padding: 16, paddingBottom: 40 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, alignItems: 'center' },
  statValue: { fontWeight: '800', fontSize: 26, letterSpacing: -0.5 },
  statLabel: { color: palette.inkFaint, fontSize: 10, marginTop: 3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  createBtn: { backgroundColor: palette.coral, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  createBtnIcon: { color: '#fff', fontSize: 22, fontWeight: '800' },
  createBtnTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  createBtnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 1 },
  chevron: { color: 'rgba(255,255,255,0.6)', fontSize: 24 },

  card: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14, overflow: 'hidden' },
  sectionTitle: { fontWeight: '800', fontSize: 14, color: palette.ink, padding: 16, paddingBottom: 8 },

  courseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.border },
  codeTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  codeTagText: { fontWeight: '800', fontSize: 11 },
  courseInfo: { flex: 1 },
  courseTitle: { fontWeight: '700', fontSize: 14, color: palette.ink, marginBottom: 2 },
  courseMeta: { color: palette.inkFaint, fontSize: 11, marginTop: 1 },
  startBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.border },
  startBtnActive: { backgroundColor: palette.coral, borderColor: palette.coral },
  startBtnText: { fontSize: 12, fontWeight: '700', color: palette.inkMuted },
  startBtnTextActive: { color: '#fff' },

  coursePill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.paper, marginRight: 8, minWidth: 110 },
  coursePillActive: { backgroundColor: palette.coralLight, borderColor: palette.coral },
  coursePillCode: { fontSize: 10, fontWeight: '800', color: palette.inkFaint, textTransform: 'uppercase' },
  coursePillCodeActive: { color: palette.coralDark },
  coursePillTitle: { fontSize: 13, fontWeight: '700', color: palette.ink, marginTop: 2 },
  coursePillTitleActive: { color: palette.coralDark },

  startBox: { padding: 24, alignItems: 'center' },
  startBoxTitle: { fontSize: 16, fontWeight: '800', color: palette.ink, marginBottom: 4 },
  startBoxSub: { fontSize: 12, color: palette.inkFaint, marginBottom: 16 },
  heroStartBtn: { backgroundColor: palette.coral, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center' },
  heroStartBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  liveHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: palette.border },
  liveHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.mint },
  liveHeaderTitle: { fontWeight: '800', fontSize: 14, color: palette.ink },
  stopBtn: { backgroundColor: palette.coralLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  stopBtnText: { color: palette.coralDark, fontWeight: '800', fontSize: 12 },

  qrBox: { padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: palette.border },
  qrWrap: { padding: 14, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 16 },
  qrMeta: { alignItems: 'center' },
  countdownBadge: { backgroundColor: palette.paper, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  countdownNum: { fontWeight: '800', fontSize: 16, color: palette.coral },
  countdownLabel: { fontSize: 11, color: palette.inkFaint, fontWeight: '600' },
  qrHint: { textAlign: 'center', color: palette.inkFaint, fontSize: 11, lineHeight: 16 },

  presentRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', padding: 16 },
  presentNum: { fontSize: 28, fontWeight: '800', color: palette.mint },
  presentOf: { fontSize: 16, fontWeight: '700', color: palette.inkFaint },
  presentLabel: { fontSize: 13, color: palette.inkMuted, fontWeight: '600' },

  dashboardHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: palette.paper, borderBottomWidth: 1, borderBottomColor: palette.border },
  dashHeaderText: { fontSize: 11, fontWeight: '700', color: palette.inkFaint, textTransform: 'uppercase' },

  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.border },
  avatarSm: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarSmText: { fontWeight: '800', fontSize: 11 },
  rosterInfo: { flex: 1 },
  rosterName: { fontWeight: '700', fontSize: 13, color: palette.ink },
  rosterSub: { color: palette.inkFaint, fontSize: 11, marginTop: 1 },
  timeStamp: { marginRight: 8 },
  timeText: { fontSize: 11, color: palette.inkFaint },
  checkmark: { color: palette.mint, fontWeight: '800', fontSize: 14 },

  exportRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.border },
  exportCourseTitle: { fontWeight: '700', fontSize: 14, color: palette.ink },
  exportCourseSub: { fontSize: 11, color: palette.inkFaint, marginTop: 2 },
  exportBtn: { backgroundColor: palette.coralLight, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  exportBtnText: { color: palette.coralDark, fontWeight: '800', fontSize: 12 },

  profileHeader: { alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.paper },
  avatarXL: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  profileName: { fontSize: 18, fontWeight: '800', color: palette.ink },
  profileEmail: { fontSize: 12, color: palette.inkFaint, marginTop: 2 },
  roleBadge: { backgroundColor: palette.coralLight, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginTop: 8 },
  roleBadgeText: { color: palette.coralDark, fontSize: 10, fontWeight: '800' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: palette.inkMuted, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: palette.ink, marginVertical: 6 },
  saveBtn: { backgroundColor: palette.coral, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  signOutBtn: { backgroundColor: palette.coralLight, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(242,126,104,.25)' },
  signOutText: { color: palette.coralDark, fontWeight: '800', fontSize: 14 },

  emptyCard: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, alignItems: 'center', padding: 36, marginBottom: 14 },
  emptyTitle: { fontWeight: '800', fontSize: 16, color: palette.ink, marginBottom: 6 },
  emptyText: { color: palette.inkFaint, fontSize: 13, textAlign: 'center' },

  // Drawer Sidebar
  drawerOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.4)' },
  drawerBackdrop: { flex: 1 },
  drawerContent: { width: 280, backgroundColor: palette.surface, height: '100%', borderRightWidth: 1, borderRightColor: palette.border, padding: 20, paddingTop: 56 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: palette.border, marginBottom: 16 },
  drawerAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  drawerAvatarText: { color: palette.coralDark, fontWeight: '800', fontSize: 16 },
  drawerTitle: { fontWeight: '800', fontSize: 16, color: palette.ink },
  drawerUser: { fontSize: 13, fontWeight: '600', color: palette.inkMuted, marginTop: 1 },
  drawerRole: { fontSize: 10, fontWeight: '700', color: palette.coral, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  drawerCloseBtn: { padding: 6 },
  drawerCloseText: { fontSize: 18, color: palette.inkFaint, fontWeight: '700' },
  drawerNav: { flex: 1 },
  drawerNavItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  drawerNavItemActive: { backgroundColor: palette.coralLight },
  drawerNavText: { fontSize: 14, fontWeight: '600', color: palette.inkMuted },
  drawerNavTextActive: { color: palette.coralDark, fontWeight: '800' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.coralDark },
  drawerFooter: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 16 },
  drawerLogoutBtn: { backgroundColor: palette.coralLight, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  drawerLogoutText: { color: palette.coralDark, fontWeight: '800', fontSize: 14 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: palette.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: palette.border },
  modalCardTitle: { fontSize: 18, fontWeight: '800', color: palette.ink, marginBottom: 14 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: palette.border, alignItems: 'center' },
  modalCancelText: { fontWeight: '700', color: palette.inkMuted, fontSize: 14 },
  modalSaveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: palette.coral, alignItems: 'center' },
  modalSaveText: { fontWeight: '800', color: '#fff', fontSize: 14 },
});
