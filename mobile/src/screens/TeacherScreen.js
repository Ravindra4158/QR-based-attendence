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
  getSessionRoster, getStudentHistory,
} from '../api';

const QR_TTL = 8;

export default function TeacherScreen({ user, token, onLogout }) {
  const [activeNav, setActiveNav] = useState('overview'); // 'overview' | 'students' | 'timetable' | 'profile'
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

  // Search filter for students directory
  const [searchQuery, setSearchQuery] = useState('');

  // Student Detail History Modal
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [studentDetail, setStudentDetail] = useState(null);

  // Add Subject Modal
  const [showAddSubjectModal, setShowAddSubjectModal] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formSection, setFormSection] = useState('Section A');
  const [formRoom, setFormRoom] = useState('Room 302');
  const [formSchedule, setFormSchedule] = useState('Mon, Wed • 10:00 AM - 11:30 AM');
  const [formSaving, setFormSaving] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Profile form
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [profileSaving, setProfileSaving] = useState(false);

  const socketRef = useRef(null);
  const countdownRef = useRef(null);

  /* ── Data fetchers ─────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    try {
      const [coursesData, studentsData] = await Promise.all([
        getCourses().catch(() => []),
        getStudents().catch(() => []),
      ]);
      setCourses(coursesData || []);
      setStudents(studentsData || []);
      if (coursesData?.length && !activeCourse) setActiveCourse(coursesData[0]);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not load workspace data');
    } finally { setLoading(false); setRefreshing(false); }
  }, [activeCourse]);

  useEffect(() => { fetchData(); }, []);

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
      if (data?.students) setRoster(data.students);
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

  /* ── Student History Detail Modal ──────────────────────────── */
  const openStudentDetail = async (studentId) => {
    setSelectedStudentId(studentId);
    setDetailLoading(true);
    setStudentDetail(null);
    try {
      const data = await getStudentHistory(studentId);
      setStudentDetail(data);
    } catch (e) {
      Alert.alert('Error', 'Could not load student attendance history');
      setSelectedStudentId(null);
    } finally { setDetailLoading(false); }
  };

  /* ── Create Subject ────────────────────────────────────────── */
  const handleCreateSubject = async () => {
    if (!formTitle.trim() || !formCode.trim()) return Alert.alert('Error', 'Title and Code are required.');
    setFormSaving(true);
    try {
      await createCourse({
        title: formTitle.trim(),
        code: formCode.trim(),
        section: formSection.trim(),
        room: formRoom.trim(),
        schedule: formSchedule.trim(),
      });
      Alert.alert('Success', 'Subject created successfully!');
      setShowAddSubjectModal(false);
      setFormTitle(''); setFormCode('');
      fetchData();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not create subject');
    } finally { setFormSaving(false); }
  };

  /* ── Export CSV ─────────────────────────────────────────────── */
  const handleExportCSV = async () => {
    const courseId = session?.courseId || activeCourse?._id;
    if (!courseId) return Alert.alert('Error', 'Select an active course to export CSV.');
    setExporting(true);
    try {
      const csv = await exportAttendanceCsv(courseId);
      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `${activeCourse?.code || 'attendance'}.csv`; a.click();
      } else {
        await Share.share({ message: csv, title: `${activeCourse?.code || 'Attendance'} CSV Export` });
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Export failed');
    } finally { setExporting(false); }
  };

  /* ── Save Profile ───────────────────────────────────────────── */
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

  const enrolledCount = activeCourse?.enrolledStudents?.length || 0;
  const filteredStudents = students.filter(st => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (st.name || '').toLowerCase().includes(q) || (st.rollNo || '').toLowerCase().includes(q) || (st.email || '').toLowerCase().includes(q);
  });

  /* ── Aggregated Stats ───────────────────────────────────────── */
  const totalEnrolledAcrossCourses = students.length;
  const activeCoursesCount = courses.length;

  return (
    <View style={s.root}>
      {/* ── Topbar (Mobile Menu Toggle + Brand) ───────────── */}
      <View style={s.topbar}>
        <View style={s.topLeft}>
          <TouchableOpacity style={s.menuBtn} onPress={() => setDrawerOpen(true)}>
            <Text style={s.menuIcon}>☰</Text>
          </TouchableOpacity>
          <View style={s.brandMark}><Text style={s.brandMarkText}>A</Text></View>
          <View>
            <Text style={s.topTitle}>attendly</Text>
            <Text style={s.topSub}>Teacher Workspace · {user.name}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
          <Text style={s.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* ── Breadcrumb View Title ─────────────────────────── */}
      <View style={s.breadcrumbBar}>
        <Text style={s.breadcrumbMuted}>Workspace</Text>
        <Text style={s.breadcrumbArrow}>›</Text>
        <Text style={s.breadcrumbActive}>
          {activeNav === 'overview' ? 'Overview' : activeNav === 'students' ? 'All Students' : activeNav === 'timetable' ? 'Timetable' : 'Profile'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={palette.coral} />}
      >
        {/* ══════════════════════════════════════════════════ *
         *  VIEW 1 — OVERVIEW (Teacher Dashboard)             *
         * ══════════════════════════════════════════════════ */}
        {activeNav === 'overview' && (
          <>
            {/* Heading */}
            <View style={s.pageHeading}>
              <Text style={s.greetingTitle}>Good morning ✦</Text>
              <Text style={s.greetingSub}>Here is what is happening with your classes today.</Text>
            </View>

            {/* 4 Stats Cards */}
            <View style={s.statsGrid}>
              <View style={s.statCard}>
                <Text style={s.statLabel}>Classes today</Text>
                <Text style={[s.statVal, { color: palette.mint }]}>{String(activeCoursesCount).padStart(2, '0')}</Text>
                <Text style={s.statSub}>Active courses</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statLabel}>Avg. attendance</Text>
                <Text style={[s.statVal, { color: palette.yellow }]}>88.5%</Text>
                <Text style={s.statSub}>Across all sessions</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statLabel}>Students enrolled</Text>
                <Text style={[s.statVal, { color: palette.blue }]}>{String(totalEnrolledAcrossCourses).padStart(2, '0')}</Text>
                <Text style={s.statSub}>Across your courses</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: palette.coralLight, borderColor: 'rgba(242,126,104,0.3)' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[s.statLabel, { color: palette.coralDark }]}>Session status</Text>
                  {session && <View style={s.liveBadge}><Text style={s.liveBadgeText}>Live</Text></View>}
                </View>
                <Text style={[s.statVal, { color: palette.coralDark }]}>{session ? 'Active' : '00'}</Text>
                <Text style={[s.statSub, { color: palette.coralDark }]}>{session ? 'Session in progress' : 'No active session'}</Text>
              </View>
            </View>

            {/* Live Session Panel */}
            <View style={s.panel}>
              <View style={s.panelHeader}>
                <View>
                  <View style={s.titleWithDot}>
                    <View style={[s.statusDot, { backgroundColor: session ? palette.mint : palette.inkFaint }]} />
                    <Text style={s.panelDotTitle}>{session ? 'Live session' : 'No session active'}</Text>
                  </View>
                  <Text style={s.panelMainTitle}>
                    {session ? (activeCourse ? `${activeCourse.title} · ${activeCourse.code}` : 'Live session') : 'Select a course to start'}
                  </Text>
                  {activeCourse && (
                    <Text style={s.panelSubTitle}>Section {activeCourse.section || 'A'} · {activeCourse.room || 'Room TBD'}</Text>
                  )}
                </View>
              </View>

              {/* Course Selector (when inactive) */}
              {!session ? (
                <View style={s.courseSelectWrap}>
                  <Text style={s.fieldLabel}>Choose Course</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {courses.map(c => (
                        <TouchableOpacity
                          key={c._id}
                          style={[s.coursePill, activeCourse?._id === c._id && s.coursePillActive]}
                          onPress={() => setActiveCourse(c)}
                        >
                          <Text style={[s.coursePillCode, activeCourse?._id === c._id && s.coursePillCodeActive]}>{c.code}</Text>
                          <Text style={[s.coursePillTitle, activeCourse?._id === c._id && s.coursePillTitleActive]} numberOfLines={1}>{c.title}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                  <TouchableOpacity
                    style={[s.startSessionBtn, (!activeCourse || starting) && { opacity: 0.5 }]}
                    disabled={!activeCourse || starting}
                    onPress={handleStart}
                  >
                    {starting ? <ActivityIndicator color="#fff" /> : <Text style={s.startSessionBtnText}>▶ Start Attendance Session</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                /* Session Active QR Display */
                <View style={s.sessionLiveBody}>
                  <View style={s.qrBox}>
                    <View style={s.qrWrap}>
                      {qrPayload ? (
                        <QRCode value={qrPayload} size={190} color={palette.ink} backgroundColor="#fff" />
                      ) : (
                        <ActivityIndicator color={palette.coral} />
                      )}
                    </View>
                    <View style={s.qrRefreshRow}>
                      <View style={s.countdownBadge}>
                        <Text style={s.countdownNum}>{String(countdown).padStart(2, '0')}</Text>
                        <Text style={s.countdownLabel}>seconds left</Text>
                      </View>
                      <Text style={s.qrHint}>QR rotates automatically every {QR_TTL}s</Text>
                    </View>
                  </View>

                  <View style={s.sessionMetaRow}>
                    <View style={s.metaItem}>
                      <Text style={s.metaItemLabel}>Present</Text>
                      <Text style={s.metaItemValue}>{roster.length} / {enrolledCount}</Text>
                    </View>
                    <TouchableOpacity style={s.stopBtn} onPress={handleStop}>
                      <Text style={s.stopBtnText}>■ End Session</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Today's Live Roster Panel */}
            <View style={s.panel}>
              <View style={s.panelHeaderRow}>
                <View>
                  <View style={s.titleWithDot}>
                    <View style={[s.statusDot, { backgroundColor: palette.blue }]} />
                    <Text style={s.panelDotTitle}>Live attendance</Text>
                  </View>
                  <Text style={s.panelMainTitle}>Today's roster</Text>
                </View>
                <TouchableOpacity style={s.exportBtn} onPress={handleExportCSV} disabled={exporting}>
                  <Text style={s.exportBtnText}>{exporting ? 'Exporting...' : 'Export CSV'}</Text>
                </TouchableOpacity>
              </View>

              <View style={s.rosterSummaryRow}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text style={s.rosterCountBig}>{roster.length}</Text>
                  <Text style={s.rosterLabel}>present</Text>
                </View>
                <View style={s.progressTrack}>
                  <View style={[s.progressBar, { width: `${enrolledCount ? (roster.length / enrolledCount) * 100 : 0}%` }]} />
                </View>
                <Text style={s.rosterTotal}>of {enrolledCount} students</Text>
              </View>

              {roster.length > 0 ? (
                <View style={s.studentList}>
                  {roster.map((r, i) => {
                    const stu = (r && typeof r.studentId === 'object' && r.studentId !== null) ? r.studentId : (r.student || r.user || r);
                    const stuName = stu.name || r.name || r.studentName || 'Student';
                    const stuRoll = stu.rollNo || r.rollNo || '—';
                    const col = getAvatarColor(stuName);
                    return (
                      <View key={r._id || i} style={[s.rosterRow, i === roster.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={[s.avatarSm, { backgroundColor: col.bg }]}>
                          <Text style={[s.avatarSmText, { color: col.fg }]}>{getInitials(stuName)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.rosterName}>{stuName}</Text>
                          <Text style={s.rosterSub}>{stuRoll !== '—' ? `(${stuRoll})` : '—'} · Verified scan</Text>
                        </View>
                        <Text style={s.scanTime}>{fmt12(r.scannedAt || new Date())}</Text>
                        <Text style={s.presentCheck}>✓</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={s.emptyRosterBox}>
                  <Text style={s.emptyRosterTitle}>Waiting for students to scan…</Text>
                  <Text style={s.emptyRosterSub}>Scanned students will automatically appear here in real time.</Text>
                </View>
              )}
            </View>

            {/* Courses List */}
            <View style={s.panel}>
              <View style={s.panelHeader}>
                <Text style={s.panelMainTitle}>Your courses</Text>
              </View>
              {courses.map((c, i) => (
                <View key={c._id} style={[s.courseListItem, i === courses.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={s.codeTag}><Text style={s.codeTagText}>{c.code}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.courseListTitle}>{c.title}</Text>
                    <Text style={s.courseListSub}>Section {c.section || 'A'} · {c.room || 'Room TBD'} · {c.enrolledStudents?.length || 0} enrolled</Text>
                    <Text style={s.courseListSub}>{c.schedule || 'Schedule not set'}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Quick Insight Card */}
            <View style={s.insightCard}>
              <Text style={s.insightEyebrow}>QUICK INSIGHT</Text>
              <Text style={s.insightTitle}>QR attendance refreshes every 8s.</Text>
              <Text style={s.insightText}>Short-lived tokens make screenshots useless for proxy attendance. Students must be present in class to scan the live code.</Text>
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════ *
         *  VIEW 2 — ALL STUDENTS DIRECTORY                   *
         * ══════════════════════════════════════════════════ */}
        {activeNav === 'students' && (
          <View style={s.panel}>
            <View style={s.panelHeader}>
              <Text style={s.panelMainTitle}>All Registered Students</Text>
              <Text style={s.panelSubTitle}>Directory & Attendance History</Text>
            </View>

            <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
              <TextInput
                style={s.searchInput}
                placeholder="Search by name or roll number..."
                placeholderTextColor={palette.inkFaint}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {filteredStudents.length > 0 ? (
              filteredStudents.map((st, i) => {
                const col = getAvatarColor(st.name || '');
                const pct = st.overallPct ?? 100;
                const badgeColor = pct >= 85 ? palette.mint : pct >= 75 ? palette.blue : palette.coral;
                return (
                  <TouchableOpacity
                    key={st.id || st._id || i}
                    style={[s.studentCardRow, i === filteredStudents.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => openStudentDetail(st.id || st._id)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.avatarLg, { backgroundColor: col.bg }]}>
                      <Text style={[s.avatarLgText, { color: col.fg }]}>{getInitials(st.name)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={s.studentCardName}>{st.name}</Text>
                        <View style={[s.pctBadge, { backgroundColor: badgeColor + '20' }]}>
                          <Text style={[s.pctBadgeText, { color: badgeColor }]}>{pct.toFixed(1)}%</Text>
                        </View>
                      </View>
                      <Text style={s.studentCardSub}>{st.email}</Text>
                      <Text style={s.rollBadgeText}>Roll No: {st.rollNo || 'N/A'}</Text>
                      <Text style={s.studentAttSub}>{st.attendedSessions || 0} of {st.totalSessions || 0} sessions attended</Text>
                      <Text style={s.viewHistoryLink}>Past Attendance History ›</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <Text style={s.emptyRosterSub}>No registered students found matching your search.</Text>
              </View>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════ *
         *  VIEW 3 — TIMETABLE & SUBJECTS                     *
         * ══════════════════════════════════════════════════ */}
        {activeNav === 'timetable' && (
          <View style={s.panel}>
            <View style={s.panelHeaderRow}>
              <View>
                <Text style={s.panelMainTitle}>Class Timetable & Subjects</Text>
                <Text style={s.panelSubTitle}>Manage active subjects and schedules</Text>
              </View>
              <TouchableOpacity style={s.addSubjectBtn} onPress={() => setShowAddSubjectModal(true)}>
                <Text style={s.addSubjectBtnText}>+ Add Subject</Text>
              </TouchableOpacity>
            </View>

            {courses.length > 0 ? (
              courses.map((c, i) => (
                <View key={c._id} style={[s.timetableCard, i === courses.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={s.timetableHeader}>
                    <Text style={s.timetableTitle}>{c.title}</Text>
                    <View style={s.codeTag}><Text style={s.codeTagText}>{c.code}</Text></View>
                  </View>
                  <Text style={s.timetableSub}>Instructor: {c.teacherId?.name || user.name}</Text>
                  <View style={{ marginTop: 8 }}>
                    <Text style={s.timetableMeta}>Schedule: {c.schedule || 'Mon, Wed • 10:00 AM - 11:30 AM'}</Text>
                    <Text style={s.timetableMeta}>Venue: {c.room || 'Room 302'}</Text>
                    <Text style={s.timetableMeta}>Section {c.section || 'A'} · {c.enrolledStudents?.length || 0} enrolled</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={{ padding: 30, alignItems: 'center' }}>
                <Text style={s.emptyRosterSub}>No subjects scheduled yet. Click "+ Add Subject" to create one.</Text>
              </View>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════ *
         *  VIEW 4 — PROFILE                                  *
         * ══════════════════════════════════════════════════ */}
        {activeNav === 'profile' && (
          <View style={s.panel}>
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

      {/* ── Sidebar Navigation Drawer ──────────────────────── */}
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
                { key: 'overview', label: 'Overview' },
                { key: 'students', label: 'All Students' },
                { key: 'timetable', label: 'Timetable' },
                { key: 'profile', label: 'Profile' },
              ].map(item => (
                <TouchableOpacity
                  key={item.key}
                  style={[s.drawerNavItem, activeNav === item.key && s.drawerNavItemActive]}
                  onPress={() => {
                    setActiveNav(item.key);
                    setDrawerOpen(false);
                  }}
                >
                  <Text style={[s.drawerNavText, activeNav === item.key && s.drawerNavTextActive]}>
                    {item.label}
                  </Text>
                  {activeNav === item.key && <View style={s.activeDot} />}
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

      {/* ── Student History Detail Modal ────────────────────── */}
      <Modal visible={!!selectedStudentId} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedStudentId(null)}>
        <View style={s.modalRoot}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Student Attendance Record</Text>
            <TouchableOpacity onPress={() => setSelectedStudentId(null)} style={s.modalCloseBtn}>
              <Text style={s.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ padding: 18 }}>
            {detailLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator color={palette.coral} size="large" />
              </View>
            ) : studentDetail ? (
              <>
                <View style={s.studentDetailHeader}>
                  <View style={[s.avatarLg, { backgroundColor: palette.coralLight }]}>
                    <Text style={[s.avatarLgText, { color: palette.coralDark }]}>{getInitials(studentDetail.student?.name)}</Text>
                  </View>
                  <View>
                    <Text style={s.studentDetailName}>{studentDetail.student?.name}</Text>
                    <Text style={s.studentDetailSub}>Roll No: {studentDetail.student?.rollNo || 'N/A'} · {studentDetail.student?.email}</Text>
                  </View>
                </View>

                {/* Course Breakdown */}
                <Text style={s.sectionHeader}>Course Attendance Breakdown</Text>
                {studentDetail.courseStats?.map(c => (
                  <View key={c.courseId} style={s.breakdownRow}>
                    <View>
                      <Text style={s.breakdownTitle}>{c.code} — {c.title}</Text>
                      <Text style={s.breakdownSub}>{c.attended} of {c.total} sessions attended</Text>
                    </View>
                    <Text style={[s.breakdownPct, { color: c.percentage >= 75 ? palette.mint : palette.coral }]}>{c.percentage}%</Text>
                  </View>
                ))}

                {/* History Log */}
                <Text style={[s.sectionHeader, { marginTop: 16 }]}>Past Scan History Log</Text>
                {studentDetail.history?.length > 0 ? (
                  studentDetail.history.map((h, i) => (
                    <View key={h._id || i} style={s.historyLogRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.historyCourseTitle}>{h.sessionId?.courseId?.code || 'CS'} — {h.sessionId?.courseId?.title || 'Session'}</Text>
                        <Text style={s.historyDate}>{h.scannedAt ? new Date(h.scannedAt).toLocaleDateString() : '—'} · {fmt12(h.scannedAt)}</Text>
                      </View>
                      <Text style={s.verifiedBadge}>Verified ✓</Text>
                    </View>
                  ))
                ) : (
                  <Text style={s.emptyRosterSub}>No past scan history records available.</Text>
                )}
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Add Subject Modal ───────────────────────────────── */}
      <Modal visible={showAddSubjectModal} animationType="slide" transparent onRequestClose={() => setShowAddSubjectModal(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalCardTitle}>Add New Subject</Text>
            <Text style={s.fieldLabel}>Subject / Course Title</Text>
            <TextInput style={s.input} placeholder="e.g. Artificial Intelligence" value={formTitle} onChangeText={setFormTitle} />
            <Text style={s.fieldLabel}>Course Code</Text>
            <TextInput style={s.input} placeholder="e.g. CS401" value={formCode} onChangeText={setFormCode} autoCapitalize="characters" />
            <Text style={s.fieldLabel}>Section</Text>
            <TextInput style={s.input} placeholder="e.g. Section A" value={formSection} onChangeText={setFormSection} />
            <Text style={s.fieldLabel}>Room / Hall</Text>
            <TextInput style={s.input} placeholder="e.g. Room 302" value={formRoom} onChangeText={setFormRoom} />
            <Text style={s.fieldLabel}>Timetable Schedule</Text>
            <TextInput style={s.input} placeholder="e.g. Mon, Wed • 10:00 AM" value={formSchedule} onChangeText={setFormSchedule} />

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowAddSubjectModal(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSaveBtn} onPress={handleCreateSubject} disabled={formSaving}>
                <Text style={s.modalSaveText}>{formSaving ? 'Creating...' : 'Create Subject'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  breadcrumbBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.border },
  breadcrumbMuted: { fontSize: 12, color: palette.inkFaint },
  breadcrumbArrow: { fontSize: 14, color: palette.inkFaint },
  breadcrumbActive: { fontSize: 12, fontWeight: '800', color: palette.ink },

  scroll: { padding: 16, paddingBottom: 40 },

  pageHeading: { marginBottom: 14 },
  greetingTitle: { fontSize: 20, fontWeight: '800', color: palette.ink, marginBottom: 2 },
  greetingSub: { fontSize: 13, color: palette.inkFaint },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border },
  statLabel: { fontSize: 11, fontWeight: '600', color: palette.inkFaint },
  statVal: { fontSize: 24, fontWeight: '800', marginVertical: 4 },
  statSub: { fontSize: 10, color: palette.inkFaint, fontWeight: '600' },
  liveBadge: { backgroundColor: palette.mint, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  liveBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  panel: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14, overflow: 'hidden' },
  panelHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: palette.border },
  panelHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: palette.border },
  titleWithDot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  panelDotTitle: { fontSize: 11, fontWeight: '700', color: palette.inkFaint, textTransform: 'uppercase', letterSpacing: 0.5 },
  panelMainTitle: { fontSize: 16, fontWeight: '800', color: palette.ink },
  panelSubTitle: { fontSize: 12, color: palette.inkFaint, marginTop: 2 },

  courseSelectWrap: { padding: 16 },
  coursePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.paper, marginRight: 8 },
  coursePillActive: { backgroundColor: palette.coralLight, borderColor: palette.coral },
  coursePillCode: { fontSize: 10, fontWeight: '800', color: palette.inkFaint },
  coursePillCodeActive: { color: palette.coralDark },
  coursePillTitle: { fontSize: 12, fontWeight: '700', color: palette.ink, marginTop: 1 },
  coursePillTitleActive: { color: palette.coralDark },
  startSessionBtn: { backgroundColor: palette.coral, paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  startSessionBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  sessionLiveBody: { padding: 16 },
  qrBox: { alignItems: 'center', marginBottom: 14 },
  qrWrap: { padding: 14, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 12 },
  qrRefreshRow: { alignItems: 'center' },
  countdownBadge: { backgroundColor: palette.paper, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  countdownNum: { fontWeight: '800', fontSize: 15, color: palette.coral },
  countdownLabel: { fontSize: 11, color: palette.inkFaint },
  qrHint: { fontSize: 11, color: palette.inkFaint, textAlign: 'center' },

  sessionMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.border },
  metaItem: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  metaItemLabel: { fontSize: 12, color: palette.inkFaint, fontWeight: '600' },
  metaItemValue: { fontSize: 18, fontWeight: '800', color: palette.mint },
  stopBtn: { backgroundColor: palette.coralLight, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  stopBtnText: { color: palette.coralDark, fontWeight: '800', fontSize: 12 },

  exportBtn: { backgroundColor: palette.coralLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  exportBtnText: { color: palette.coralDark, fontWeight: '800', fontSize: 12 },

  rosterSummaryRow: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: palette.border },
  rosterCountBig: { fontSize: 24, fontWeight: '800', color: palette.ink },
  rosterLabel: { fontSize: 12, color: palette.inkFaint, fontWeight: '600' },
  progressTrack: { flex: 1, height: 6, backgroundColor: palette.border, borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: palette.mint },
  rosterTotal: { fontSize: 11, color: palette.inkFaint },

  studentList: { paddingHorizontal: 16 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.border },
  avatarSm: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarSmText: { fontWeight: '800', fontSize: 11 },
  rosterName: { fontWeight: '700', fontSize: 13, color: palette.ink },
  rosterSub: { color: palette.inkFaint, fontSize: 11, marginTop: 1 },
  scanTime: { fontSize: 11, color: palette.inkFaint, marginRight: 6 },
  presentCheck: { color: palette.mint, fontWeight: '800', fontSize: 14 },
  emptyRosterBox: { padding: 30, alignItems: 'center' },
  emptyRosterTitle: { fontWeight: '800', fontSize: 15, color: palette.ink, marginBottom: 4 },
  emptyRosterSub: { fontSize: 12, color: palette.inkFaint, textAlign: 'center' },

  courseListItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.border },
  codeTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: palette.coralLight },
  codeTagText: { fontWeight: '800', fontSize: 11, color: palette.coralDark },
  courseListTitle: { fontWeight: '700', fontSize: 14, color: palette.ink, marginBottom: 2 },
  courseListSub: { fontSize: 11, color: palette.inkFaint, marginTop: 1 },

  insightCard: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: 18, marginBottom: 14 },
  insightEyebrow: { fontSize: 10, fontWeight: '800', color: palette.coral, letterSpacing: 1, marginBottom: 6 },
  insightTitle: { fontSize: 16, fontWeight: '800', color: palette.ink, marginBottom: 6 },
  insightText: { fontSize: 12, color: palette.inkMuted, lineHeight: 18 },

  searchInput: { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: palette.ink },
  studentCardRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.border },
  avatarLg: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarLgText: { fontWeight: '800', fontSize: 15 },
  studentCardName: { fontSize: 14, fontWeight: '800', color: palette.ink },
  studentCardSub: { fontSize: 12, color: palette.inkFaint, marginTop: 2 },
  rollBadgeText: { fontSize: 11, color: palette.inkMuted, marginTop: 2, fontWeight: '600' },
  studentAttSub: { fontSize: 11, color: palette.inkFaint, marginTop: 4 },
  pctBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pctBadgeText: { fontSize: 11, fontWeight: '800' },
  viewHistoryLink: { fontSize: 12, color: palette.coral, fontWeight: '700', marginTop: 8 },

  addSubjectBtn: { backgroundColor: palette.coral, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addSubjectBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  timetableCard: { padding: 16, borderBottomWidth: 1, borderBottomColor: palette.border },
  timetableHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  timetableTitle: { fontSize: 15, fontWeight: '800', color: palette.ink },
  timetableSub: { fontSize: 12, color: palette.inkFaint },
  timetableMeta: { fontSize: 12, color: palette.inkMuted, marginTop: 2 },

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

  // Drawer
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

  modalRoot: { flex: 1, backgroundColor: palette.paper },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, paddingTop: 50, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.surface },
  modalTitle: { fontWeight: '800', fontSize: 17, color: palette.ink },
  modalCloseBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: palette.coralLight, borderRadius: 8 },
  modalCloseText: { color: palette.coralDark, fontWeight: '800', fontSize: 13 },
  studentDetailHeader: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 16 },
  studentDetailName: { fontSize: 18, fontWeight: '800', color: palette.ink },
  studentDetailSub: { fontSize: 12, color: palette.inkFaint, marginTop: 2 },
  sectionHeader: { fontSize: 13, fontWeight: '800', color: palette.ink, marginBottom: 10 },
  breakdownRow: { backgroundColor: palette.surface, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  breakdownTitle: { fontSize: 13, fontWeight: '700', color: palette.ink },
  breakdownSub: { fontSize: 11, color: palette.inkFaint, marginTop: 1 },
  breakdownPct: { fontSize: 14, fontWeight: '800' },
  historyLogRow: { backgroundColor: palette.surface, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  historyCourseTitle: { fontSize: 13, fontWeight: '700', color: palette.ink },
  historyDate: { fontSize: 11, color: palette.inkFaint, marginTop: 1 },
  verifiedBadge: { fontSize: 11, fontWeight: '800', color: palette.mint },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: palette.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: palette.border },
  modalCardTitle: { fontSize: 18, fontWeight: '800', color: palette.ink, marginBottom: 14 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: palette.border, alignItems: 'center' },
  modalCancelText: { fontWeight: '700', color: palette.inkMuted, fontSize: 14 },
  modalSaveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: palette.coral, alignItems: 'center' },
  modalSaveText: { fontWeight: '800', color: '#fff', fontSize: 14 },
});
