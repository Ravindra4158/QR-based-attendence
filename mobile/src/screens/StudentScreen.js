import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, Modal, TextInput, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { palette, getInitials, getAvatarColor, fmt12 } from '../theme';
import { getCourses, getAttendancePct, markAttendance, updateProfile, getCourseDetail } from '../api';

export default function StudentScreen({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('scan');
  const [courses, setCourses] = useState([]);
  const [stats, setStats] = useState({});       // courseId → { attended, total, percentage }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = React.useRef(false);

  // Course detail modal
  const [detailCourse, setDetailCourse] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState(null);

  // Profile form
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [profileRollNo, setProfileRollNo] = useState(user.rollNo || '');
  const [profileSaving, setProfileSaving] = useState(false);

  /* ── Data fetchers ─────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    try {
      const data = await getCourses();
      setCourses(data || []);
      const pcts = {};
      await Promise.all((data || []).map(async c => {
        try { pcts[c._id] = await getAttendancePct(user.id, c._id); }
        catch { pcts[c._id] = { attended: 0, total: 0, percentage: 0 }; }
      }));
      setStats(pcts);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not load data');
    } finally { setLoading(false); setRefreshing(false); }
  }, [user.id]);

  useEffect(() => { fetchData(); }, []);

  /* ── QR scanning ───────────────────────────────────────────── */
  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera required', 'Please allow camera access to scan QR codes.');
        return;
      }
    }
    scannedRef.current = false;
    setScanResult(null);
    setScannerVisible(true);
  };

  const handleBarcodeScan = async ({ data }) => {
    if (scannedRef.current || scannerBusy) return;
    scannedRef.current = true;
    setScannerBusy(true);
    try {
      const payload = JSON.parse(data);
      if (!payload.sessionId || !payload.token) throw new Error('Invalid QR code');
      await markAttendance(payload.sessionId, payload.token);
      setScanResult({ success: true, message: 'Attendance marked successfully! You are present.' });
      await fetchData();
    } catch (err) {
      const codeMap = {
        SESSION_CLOSED: 'Session is closed. Ask your teacher to start it.',
        INVALID_QR: 'QR code is invalid. Try scanning again.',
        QR_EXPIRED: 'QR code expired — scan the screen again quickly!',
        ALREADY_MARKED: 'Your attendance is already marked for this session.',
        NOT_ENROLLED: 'You are not enrolled in this course.',
      };
      const code = err.response?.data?.code;
      setScanResult({ success: false, message: codeMap[code] || (err.response?.data?.message || err.message) });
    } finally { setScannerBusy(false); }
  };

  const closeScanner = () => {
    setScannerVisible(false);
    scannedRef.current = false;
    setScannerBusy(false);
  };

  /* ── Course detail ─────────────────────────────────────────── */
  const openCourseDetail = async (course) => {
    setDetailCourse(course);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const full = await getCourseDetail(course._id);
      setDetailData(full);
    } catch (e) {
      Alert.alert('Error', 'Could not load course details');
      setDetailCourse(null);
    } finally { setDetailLoading(false); }
  };

  /* ── Profile ───────────────────────────────────────────────── */
  const handleSaveProfile = async () => {
    setProfileSaving(true);
    try {
      await updateProfile({ name: profileName.trim(), email: profileEmail.trim(), rollNo: profileRollNo.trim() });
      Alert.alert('Success', 'Profile updated!');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not update profile');
    } finally { setProfileSaving(false); }
  };

  /* ── Aggregated stats ──────────────────────────────────────── */
  const totalAttended = Object.values(stats).reduce((s, r) => s + (r.attended || 0), 0);
  const totalSessions = Object.values(stats).reduce((s, r) => s + (r.total || 0), 0);
  const overallPct = totalSessions > 0 ? ((totalAttended / totalSessions) * 100).toFixed(1) : '—';
  const isOnTrack = parseFloat(overallPct) >= 75;

  const avatarCol = getAvatarColor(user.name);

  if (loading) return <View style={s.center}><ActivityIndicator color={palette.blue} size="large" /></View>;

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
            <Text style={s.topTitle}>attendly</Text>
            <Text style={s.topSub}>{user.name} · {user.rollNo || 'Student'}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onLogout} style={s.logoutBtn}>
          <Text style={s.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab bar ────────────────────────────────────────── */}
      <View style={s.tabBar}>
        {[
          { key: 'scan', label: 'Scan QR' },
          { key: 'attendance', label: 'Attendance' },
          { key: 'courses', label: 'Courses' },
          { key: 'profile', label: 'Profile' },
        ].map(t => (
          <TouchableOpacity key={t.key} style={[s.tabItem, activeTab === t.key && s.tabItemActive]} onPress={() => setActiveTab(t.key)}>
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={palette.blue} />}
      >
        {/* ══════════════════════════════════════════════════ *
         *  TAB 1 — SCAN QR                                  *
         * ══════════════════════════════════════════════════ */}
        {activeTab === 'scan' && (
          <>
            {/* Hero banner */}
            <View style={s.hero}>
              <View style={s.heroLeft}>
                <Text style={s.heroEyebrow}>STUDENT CONSOLE</Text>
                <Text style={s.heroTitle}>
                  {overallPct !== '—' ? (isOnTrack ? 'On track' : 'Needs improvement') : 'Welcome back!'}
                </Text>
                <Text style={s.heroSub}>{courses.length} course{courses.length !== 1 ? 's' : ''} enrolled</Text>
              </View>
              <View style={s.heroBadge}>
                <Text style={s.heroBadgeNum}>{overallPct}{overallPct !== '—' ? '%' : ''}</Text>
                <Text style={s.heroBadgeLabel}>overall</Text>
              </View>
            </View>

            {/* Quick stats */}
            <View style={s.statsRow}>
              <StatCard label="Attended" value={String(totalAttended)} color={palette.mint} />
              <StatCard label="Total" value={String(totalSessions)} color={palette.blue} />
              <StatCard label="Courses" value={String(courses.length)} color={palette.yellow} />
            </View>

            {/* Scan CTA */}
            <TouchableOpacity style={s.scanBtn} onPress={openScanner} activeOpacity={0.85}>
              <View style={s.scanIconWrap}>
                <Text style={s.scanIconText}>[QR]</Text>
              </View>
              <View style={s.scanBtnTextWrap}>
                <Text style={s.scanBtnTitle}>Mark Attendance</Text>
                <Text style={s.scanBtnSub}>Scan the live classroom QR code</Text>
              </View>
              <Text style={s.scanArrow}>›</Text>
            </TouchableOpacity>

            {/* Quick info */}
            <View style={s.infoBox}>
              <Text style={s.infoIconText}>i</Text>
              <Text style={s.infoText}>Point your camera at the QR code displayed on the classroom projector. Codes refresh every 8 seconds.</Text>
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════ *
         *  TAB 2 — MY ATTENDANCE                            *
         * ══════════════════════════════════════════════════ */}
        {activeTab === 'attendance' && (
          <>
            {/* Overall summary */}
            <View style={s.summaryCard}>
              <View style={s.summaryTop}>
                <Text style={s.summaryPct}>{overallPct}{overallPct !== '—' ? '%' : ''}</Text>
                <View style={[s.statusDot, { backgroundColor: isOnTrack ? palette.mint : palette.coral }]} />
                <Text style={[s.statusText, { color: isOnTrack ? palette.mint : palette.coral }]}>
                  {overallPct === '—' ? 'No data' : isOnTrack ? 'Good standing' : 'Below 75%'}
                </Text>
              </View>
              <Text style={s.summarySub}>{totalAttended} of {totalSessions} sessions attended across {courses.length} courses</Text>
            </View>

            {/* Per-course breakdown */}
            {courses.length > 0 ? (
              <View style={s.card}>
                <Text style={s.sectionTitle}>Attendance by Course</Text>
                {courses.map((c, i) => {
                  const r = stats[c._id] || { attended: 0, total: 0, percentage: 0 };
                  const pct = r.percentage || 0;
                  const isGood = pct >= 85;
                  const isWarn = pct >= 75 && pct < 85;
                  const barColor = isGood ? palette.mint : isWarn ? palette.yellow : palette.coral;
                  const tagColors = [
                    { bg: palette.blueLight, fg: '#2e5fa1' },
                    { bg: palette.mintLight, fg: '#2d7a55' },
                    { bg: palette.yellowLight, fg: '#9a6e1a' },
                    { bg: palette.coralLight, fg: palette.coralDark },
                  ];
                  const tc = tagColors[i % tagColors.length];
                  return (
                    <View key={c._id} style={[s.courseRow, i === courses.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={[s.codeTag, { backgroundColor: tc.bg }]}>
                        <Text style={[s.codeTagText, { color: tc.fg }]}>{c.code}</Text>
                      </View>
                      <View style={s.courseInfo}>
                        <View style={s.courseInfoTop}>
                          <Text style={s.courseTitle} numberOfLines={1}>{c.title}</Text>
                          <Text style={[s.coursePct, { color: barColor }]}>{pct.toFixed(1)}%</Text>
                        </View>
                        <Text style={s.courseSub}>{r.attended} of {r.total} sessions attended</Text>
                        <View style={s.progressTrack}>
                          <View style={[s.progressBar, { width: `${pct}%`, backgroundColor: barColor }]} />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={s.emptyCard}>
                <Text style={s.emptyTitle}>No attendance data</Text>
                <Text style={s.emptyText}>Enroll in courses and attend sessions to see your attendance.</Text>
              </View>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════ *
         *  TAB 3 — COURSE DETAILS                           *
         * ══════════════════════════════════════════════════ */}
        {activeTab === 'courses' && (
          <>
            {courses.length > 0 ? (
              <View style={s.card}>
                <Text style={s.sectionTitle}>My Enrolled Courses</Text>
                {courses.map((c, i) => (
                  <TouchableOpacity
                    key={c._id}
                    style={[s.courseDetailRow, i === courses.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => openCourseDetail(c)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.courseDetailTitle}>{c.title}</Text>
                      <Text style={s.courseDetailSub}>{c.code} · Section {c.section || 'A'}</Text>
                      <Text style={s.courseDetailSub}>Schedule: {c.schedule || 'Schedule not set'}</Text>
                      <Text style={s.courseDetailSub}>Room: {c.room || 'Room TBD'}</Text>
                      <Text style={s.courseDetailSub}>Faculty: {c.teacherId?.name || 'Faculty'}</Text>
                    </View>
                    <Text style={s.detailArrow}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={s.emptyCard}>
                <Text style={s.emptyTitle}>No courses yet</Text>
                <Text style={s.emptyText}>Ask your teacher to enroll you in a course.</Text>
              </View>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════ *
         *  TAB 4 — PROFILE                                   *
         * ══════════════════════════════════════════════════ */}
        {activeTab === 'profile' && (
          <View style={s.card}>
            <View style={s.profileHeader}>
              <View style={[s.avatarXL, { backgroundColor: palette.blueLight }]}>
                <Text style={{ color: '#2e5fa1', fontSize: 24, fontWeight: '800' }}>{getInitials(user.name)}</Text>
              </View>
              <Text style={s.profileName}>{user.name}</Text>
              <Text style={s.profileEmail}>{user.email}</Text>
              <View style={s.roleBadge}><Text style={s.roleBadgeText}>STUDENT ACCOUNT</Text></View>
            </View>

            <View style={{ padding: 16 }}>
              <Text style={s.fieldLabel}>Full Name</Text>
              <TextInput style={s.input} value={profileName} onChangeText={setProfileName} />

              <Text style={s.fieldLabel}>Email Address</Text>
              <TextInput style={s.input} value={profileEmail} onChangeText={setProfileEmail} keyboardType="email-address" />

              <Text style={s.fieldLabel}>Roll / Student ID Number</Text>
              <TextInput style={s.input} value={profileRollNo} onChangeText={setProfileRollNo} />

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
              <View style={[s.drawerAvatar, { backgroundColor: palette.blueLight }]}>
                <Text style={s.drawerAvatarText}>{getInitials(user.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.drawerTitle}>attendly</Text>
                <Text style={s.drawerUser}>{user.name}</Text>
                <Text style={s.drawerRole}>STUDENT</Text>
              </View>
              <TouchableOpacity onPress={() => setDrawerOpen(false)} style={s.drawerCloseBtn}>
                <Text style={s.drawerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={s.drawerNav}>
              {[
                { key: 'scan', label: 'Scan QR Code' },
                { key: 'attendance', label: 'My Attendance' },
                { key: 'courses', label: 'My Courses' },
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

      {/* ── Scanner modal ──────────────────────────────────── */}
      <Modal visible={scannerVisible} animationType="slide" onRequestClose={closeScanner}>
        <View style={s.scannerRoot}>
          <View style={s.scannerTopbar}>
            <Text style={s.scannerTitle}>Scan classroom QR</Text>
            <TouchableOpacity onPress={closeScanner} style={s.closeScanBtn}>
              <Text style={s.closeScanText}>Close</Text>
            </TouchableOpacity>
          </View>

          {scanResult ? (
            <View style={s.scanResultWrap}>
              <View style={[s.scanResultCard, { borderColor: scanResult.success ? palette.mint : palette.coral }]}>
                <Text style={[s.scanResultTitle, { color: scanResult.success ? palette.mint : palette.coralDark }]}>
                  {scanResult.success ? 'Marked Present' : 'Scan Failed'}
                </Text>
                <Text style={s.scanResultMsg}>{scanResult.message}</Text>
                {!scanResult.success && (
                  <TouchableOpacity style={s.retryBtn} onPress={() => { scannedRef.current = false; setScanResult(null); }}>
                    <Text style={s.retryText}>Try again</Text>
                  </TouchableOpacity>
                )}
                {scanResult.success && (
                  <TouchableOpacity style={[s.retryBtn, { backgroundColor: palette.mint }]} onPress={closeScanner}>
                    <Text style={[s.retryText, { color: '#fff' }]}>Done</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : (
            <>
              <View style={s.cameraWrap}>
                {permission?.granted ? (
                  <CameraView
                    style={StyleSheet.absoluteFill}
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={scannerBusy ? undefined : handleBarcodeScan}
                  />
                ) : (
                  <View style={s.permissionBox}>
                    <Text style={s.permText}>Camera access is needed to scan QR codes.</Text>
                    <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
                      <Text style={s.permBtnText}>Allow camera</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <View style={s.scanOverlay}>
                  <View style={s.scanBox} />
                </View>
              </View>
              {scannerBusy && (
                <View style={s.scanBusyRow}>
                  <ActivityIndicator color={palette.blue} />
                  <Text style={s.scanBusyText}>Marking attendance…</Text>
                </View>
              )}
              <Text style={s.scanHint}>Align the QR code displayed in class within the frame</Text>
            </>
          )}
        </View>
      </Modal>

      {/* ── Course detail modal ────────────────────────────── */}
      <Modal visible={!!detailCourse} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailCourse(null)}>
        <View style={s.modalRoot}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Course Details</Text>
            <TouchableOpacity onPress={() => setDetailCourse(null)} style={s.modalCloseBtn}>
              <Text style={s.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 18 }}>
            {detailLoading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator color={palette.blue} size="large" />
              </View>
            ) : detailData ? (
              <>
                <View style={s.detailCard}>
                  <Text style={s.detailName}>{detailData.title}</Text>
                  <View style={s.detailPill}><Text style={s.detailPillText}>{detailData.code}</Text></View>
                  <Text style={s.detailMeta}>Room: {detailData.room || 'Room TBD'} · Section {detailData.section || 'A'}</Text>
                  <Text style={s.detailMeta}>Schedule: {detailData.schedule || 'Schedule not set'}</Text>
                  <Text style={s.detailMeta}>Instructor: {detailData.teacherId?.name || 'Faculty'} ({detailData.teacherId?.email || ''})</Text>
                </View>

                {/* My stats for this course */}
                {stats[detailData._id] && (
                  <View style={s.detailStatsCard}>
                    <Text style={s.detailStatsTitle}>My Attendance</Text>
                    <View style={s.detailStatsRow}>
                      <View style={s.detailStatItem}>
                        <Text style={[s.detailStatNum, { color: palette.mint }]}>{stats[detailData._id].attended}</Text>
                        <Text style={s.detailStatLabel}>Attended</Text>
                      </View>
                      <View style={s.detailStatItem}>
                        <Text style={[s.detailStatNum, { color: palette.blue }]}>{stats[detailData._id].total}</Text>
                        <Text style={s.detailStatLabel}>Total</Text>
                      </View>
                      <View style={s.detailStatItem}>
                        <Text style={[s.detailStatNum, { color: stats[detailData._id].percentage >= 75 ? palette.mint : palette.coral }]}>
                          {(stats[detailData._id].percentage || 0).toFixed(1)}%
                        </Text>
                        <Text style={s.detailStatLabel}>Rate</Text>
                      </View>
                    </View>
                  </View>
                )}

                {/* Enrolled classmates */}
                {detailData.enrolledStudents?.length > 0 && (
                  <View style={[s.card, { marginTop: 14 }]}>
                    <Text style={s.sectionTitle}>Classmates ({detailData.enrolledStudents.length})</Text>
                    {detailData.enrolledStudents.map((st, i) => {
                      const col = getAvatarColor(st.name || '');
                      return (
                        <View key={st._id || i} style={[s.classmateRow, i === detailData.enrolledStudents.length - 1 && { borderBottomWidth: 0 }]}>
                          <View style={[s.avatarSm, { backgroundColor: col.bg }]}>
                            <Text style={[s.avatarSmText, { color: col.fg }]}>{getInitials(st.name)}</Text>
                          </View>
                          <View>
                            <Text style={s.classmateName}>{st.name}</Text>
                            <Text style={s.classmateSub}>{st.rollNo || 'No Roll'}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            ) : null}
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
  topbar: { backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, paddingTop: 52 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuBtn: { paddingHorizontal: 8, paddingVertical: 4, marginRight: 2 },
  menuIcon: { fontSize: 22, fontWeight: '700', color: palette.ink },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800', fontSize: 12 },
  brandMark: { width: 32, height: 32, borderRadius: 8, backgroundColor: palette.coral, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  topTitle: { fontWeight: '800', fontSize: 16, color: palette.ink, fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium' },
  topSub: { color: palette.inkFaint, fontSize: 11, marginTop: 1 },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: palette.border },
  logoutText: { color: palette.inkMuted, fontSize: 12, fontWeight: '700' },

  // Tab bar — blue accent for students
  tabBar: { flexDirection: 'row', backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.border, paddingHorizontal: 4 },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive: { borderBottomColor: palette.blue },
  tabText: { fontSize: 11, fontWeight: '600', color: palette.inkFaint },
  tabTextActive: { color: '#2e5fa1', fontWeight: '800' },

  scroll: { padding: 16, paddingBottom: 40 },

  // Hero
  hero: { backgroundColor: '#1a2f4a', borderRadius: 18, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  heroLeft: { flex: 1 },
  heroEyebrow: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
  heroSub: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  heroBadge: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, alignItems: 'center', minWidth: 80 },
  heroBadgeNum: { color: '#fff', fontWeight: '800', fontSize: 28, letterSpacing: -0.5 },
  heroBadgeLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, alignItems: 'center' },
  statValue: { fontWeight: '800', fontSize: 26, letterSpacing: -0.5 },
  statLabel: { color: palette.inkFaint, fontSize: 10, marginTop: 3, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Scan CTA — blue accent
  scanBtn: { backgroundColor: palette.blue, borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  scanIconWrap: { width: 46, height: 46, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  scanIconText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },
  scanBtnTextWrap: { flex: 1 },
  scanBtnTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  scanBtnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  scanArrow: { color: 'rgba(255,255,255,0.6)', fontSize: 28 },

  // Info box
  infoBox: { flexDirection: 'row', gap: 10, backgroundColor: palette.blueLight, borderRadius: 12, padding: 14, alignItems: 'flex-start' },
  infoIconText: { fontSize: 13, fontWeight: '800', color: '#2e5fa1', width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#2e5fa1', textAlign: 'center', lineHeight: 16 },
  infoText: { flex: 1, fontSize: 12, color: '#2e5fa1', lineHeight: 18 },

  // Cards
  card: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14, overflow: 'hidden' },
  sectionTitle: { fontWeight: '800', fontSize: 14, color: palette.ink, padding: 16, paddingBottom: 8 },

  // Summary
  summaryCard: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: 20, marginBottom: 14, alignItems: 'center' },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  summaryPct: { fontWeight: '800', fontSize: 32, color: palette.ink, letterSpacing: -0.5 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontWeight: '700', fontSize: 13 },
  summarySub: { color: palette.inkFaint, fontSize: 12 },

  // Course attendance rows
  courseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.border },
  codeTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginTop: 2 },
  codeTagText: { fontWeight: '800', fontSize: 11 },
  courseInfo: { flex: 1 },
  courseInfoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  courseTitle: { fontWeight: '700', fontSize: 14, color: palette.ink, flex: 1, marginRight: 8 },
  coursePct: { fontWeight: '800', fontSize: 15 },
  courseSub: { color: palette.inkFaint, fontSize: 11, marginBottom: 8 },
  progressTrack: { height: 5, backgroundColor: palette.border, borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 3 },

  // Course detail rows
  courseDetailRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: palette.border },
  courseDetailTitle: { fontWeight: '700', fontSize: 15, color: palette.ink, marginBottom: 4 },
  courseDetailSub: { color: palette.inkMuted, fontSize: 12, marginTop: 1 },
  detailArrow: { color: palette.inkFaint, fontSize: 24, marginLeft: 10 },

  // Profile
  profileHeader: { alignItems: 'center', padding: 24, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.paper },
  avatarXL: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  profileName: { fontSize: 18, fontWeight: '800', color: palette.ink },
  profileEmail: { fontSize: 12, color: palette.inkFaint, marginTop: 2 },
  roleBadge: { backgroundColor: palette.blueLight, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginTop: 8 },
  roleBadgeText: { color: '#2e5fa1', fontSize: 10, fontWeight: '800' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: palette.inkMuted, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: palette.ink, marginVertical: 6 },
  saveBtn: { backgroundColor: palette.blue, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  signOutBtn: { backgroundColor: palette.coralLight, paddingVertical: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(242,126,104,.25)' },
  signOutText: { color: palette.coralDark, fontWeight: '800', fontSize: 14 },

  // Empty
  emptyCard: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, alignItems: 'center', padding: 36, marginBottom: 14 },
  emptyTitle: { fontWeight: '800', fontSize: 16, color: palette.ink, marginBottom: 6 },
  emptyText: { color: palette.inkFaint, fontSize: 13, textAlign: 'center' },

  // Drawer Sidebar
  drawerOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.4)' },
  drawerBackdrop: { flex: 1 },
  drawerContent: { width: 280, backgroundColor: palette.surface, height: '100%', borderRightWidth: 1, borderRightColor: palette.border, padding: 20, paddingTop: 56 },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: palette.border, marginBottom: 16 },
  drawerAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  drawerAvatarText: { color: '#2e5fa1', fontWeight: '800', fontSize: 16 },
  drawerTitle: { fontWeight: '800', fontSize: 16, color: palette.ink },
  drawerUser: { fontSize: 13, fontWeight: '600', color: palette.inkMuted, marginTop: 1 },
  drawerRole: { fontSize: 10, fontWeight: '700', color: palette.blue, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
  drawerCloseBtn: { padding: 6 },
  drawerCloseText: { fontSize: 18, color: palette.inkFaint, fontWeight: '700' },
  drawerNav: { flex: 1 },
  drawerNavItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  drawerNavItemActive: { backgroundColor: palette.blueLight },
  drawerNavText: { fontSize: 14, fontWeight: '600', color: palette.inkMuted },
  drawerNavTextActive: { color: '#2e5fa1', fontWeight: '800' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2e5fa1' },
  drawerFooter: { borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 16 },
  drawerLogoutBtn: { backgroundColor: palette.coralLight, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  drawerLogoutText: { color: palette.coralDark, fontWeight: '800', fontSize: 14 },

  // Scanner
  scannerRoot: { flex: 1, backgroundColor: '#111' },
  scannerTopbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, paddingTop: 56, backgroundColor: '#1a2f4a' },
  scannerTitle: { color: '#fff', fontWeight: '800', fontSize: 17 },
  closeScanBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8 },
  closeScanText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  cameraWrap: { flex: 1, position: 'relative' },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanBox: { width: 220, height: 220, borderWidth: 3, borderColor: palette.blue, borderRadius: 14, backgroundColor: 'transparent', shadowColor: palette.blue, shadowRadius: 20, shadowOpacity: 0.4 },
  scanHint: { textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 13, padding: 20, backgroundColor: '#1a2f4a' },
  scanBusyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', backgroundColor: '#1a2f4a', paddingVertical: 12 },
  scanBusyText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  permissionBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  permText: { color: '#fff', fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 22 },
  permBtn: { backgroundColor: palette.blue, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  permBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  scanResultWrap: { flex: 1, backgroundColor: '#1a2f4a', alignItems: 'center', justifyContent: 'center', padding: 30 },
  scanResultCard: { backgroundColor: palette.surface, borderRadius: 20, borderWidth: 2, padding: 32, alignItems: 'center', width: '100%', maxWidth: 340 },
  scanResultTitle: { fontWeight: '800', fontSize: 22, marginBottom: 8 },
  scanResultMsg: { color: palette.inkMuted, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 22 },
  retryBtn: { backgroundColor: palette.blueLight, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 },
  retryText: { color: '#2e5fa1', fontWeight: '800', fontSize: 14 },

  // Course detail modal
  modalRoot: { flex: 1, backgroundColor: palette.paper },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, paddingTop: 20, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.surface },
  modalTitle: { fontWeight: '800', fontSize: 17, color: palette.ink },
  modalCloseBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: palette.blueLight, borderRadius: 8 },
  modalCloseText: { color: '#2e5fa1', fontWeight: '800', fontSize: 13 },

  detailCard: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: 20 },
  detailName: { fontWeight: '800', fontSize: 18, color: palette.ink, marginBottom: 8 },
  detailPill: { alignSelf: 'flex-start', backgroundColor: palette.blueLight, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, marginBottom: 12 },
  detailPillText: { color: '#2e5fa1', fontWeight: '800', fontSize: 12 },
  detailMeta: { fontSize: 13, color: palette.inkMuted, marginTop: 4, lineHeight: 20 },

  detailStatsCard: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, padding: 20, marginTop: 14 },
  detailStatsTitle: { fontWeight: '800', fontSize: 14, color: palette.ink, marginBottom: 14 },
  detailStatsRow: { flexDirection: 'row', gap: 12 },
  detailStatItem: { flex: 1, alignItems: 'center' },
  detailStatNum: { fontWeight: '800', fontSize: 24, letterSpacing: -0.5 },
  detailStatLabel: { color: palette.inkFaint, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },

  classmateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: palette.border },
  avatarSm: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarSmText: { fontWeight: '800', fontSize: 11 },
  classmateName: { fontWeight: '700', fontSize: 13, color: palette.ink },
  classmateSub: { color: palette.inkFaint, fontSize: 11 },
});
