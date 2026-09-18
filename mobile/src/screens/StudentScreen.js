import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, Modal, TextInput, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { palette, getInitials, getAvatarColor, fmt12 } from '../theme';
import {
  getCourses, getAttendancePct, markAttendance, updateProfile,
  getCourseDetail, getAttendanceHistory,
} from '../api';

export default function StudentScreen({ user, onLogout }) {
  const [activeNav, setActiveNav] = useState('overview'); // 'overview' | 'profile'
  const [courses, setCourses] = useState([]);
  const [stats, setStats] = useState({});       // courseId → { attended, total, percentage }
  const [historyLog, setHistoryLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Scanner modal
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
      const [coursesData, historyData] = await Promise.all([
        getCourses().catch(() => []),
        getAttendanceHistory().catch(() => ({ history: [] })),
      ]);
      setCourses(coursesData || []);
      setHistoryLog(historyData?.history || []);

      const pcts = {};
      await Promise.all((coursesData || []).map(async c => {
        try { pcts[c._id] = await getAttendancePct(user.id, c._id); }
        catch { pcts[c._id] = { attended: 0, total: 0, percentage: 0 }; }
      }));
      setStats(pcts);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Could not load student data');
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

  if (loading) return <View style={s.center}><ActivityIndicator color={palette.blue} size="large" /></View>;

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
            <Text style={s.topSub}>Student Console · {user.name}</Text>
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
          {activeNav === 'overview' ? 'Overview' : 'Profile'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={palette.blue} />}
      >
        {/* ══════════════════════════════════════════════════ *
         *  VIEW 1 — OVERVIEW (Student Console)               *
         * ══════════════════════════════════════════════════ */}
        {activeNav === 'overview' && (
          <>
            {/* Student Hero Banner */}
            <View style={s.hero}>
              <View style={s.heroLeft}>
                <Text style={s.heroEyebrow}>STUDENT CONSOLE</Text>
                <Text style={s.heroTitle}>Welcome back!</Text>
                <Text style={s.heroSub}>Your attendance is synced with the server.</Text>
              </View>
              <View style={s.heroBadge}>
                <Text style={s.heroBadgeNum}>{overallPct}{overallPct !== '—' ? '%' : ''}</Text>
                <Text style={s.heroBadgeLabel}>overall</Text>
              </View>
            </View>

            {/* Quick stats */}
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statLabel}>Overall attendance</Text>
                <Text style={[s.statVal, { color: palette.blue }]}>{overallPct}{overallPct !== '—' ? '%' : ''}</Text>
                <Text style={s.statSub}>{totalAttended} of {totalSessions} sessions</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statLabel}>Courses enrolled</Text>
                <Text style={[s.statVal, { color: palette.mint }]}>{courses.length}</Text>
                <Text style={s.statSub}>Active this semester</Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statLabel}>Status</Text>
                <Text style={[s.statVal, { color: isOnTrack ? palette.mint : palette.coral }]}>
                  {overallPct === '—' ? 'Good' : isOnTrack ? 'Good' : 'Warn'}
                </Text>
                <Text style={s.statSub}>{overallPct === '—' ? 'No sessions' : isOnTrack ? 'Good standing' : 'Below 75%'}</Text>
              </View>
            </View>

            {/* Scan CTA Button */}
            <TouchableOpacity style={s.scanBtn} onPress={openScanner} activeOpacity={0.85}>
              <View style={s.scanIconWrap}>
                <Text style={s.scanIconText}>[QR]</Text>
              </View>
              <View style={s.scanBtnTextWrap}>
                <Text style={s.scanBtnTitle}>Mark attendance</Text>
                <Text style={s.scanBtnSub}>Scan the live classroom QR code</Text>
              </View>
              <Text style={s.scanArrow}>›</Text>
            </TouchableOpacity>

            {/* My Courses Attendance Panel */}
            <View style={s.panel}>
              <View style={s.panelHeader}>
                <Text style={s.panelMainTitle}>Attendance by course</Text>
                <Text style={s.panelSubTitle}>Per-subject percentage breakdown</Text>
              </View>

              {courses.length > 0 ? (
                courses.map((c, i) => {
                  const r = stats[c._id] || { attended: 0, total: 0, percentage: 0 };
                  const pct = r.percentage || 0;
                  const isGood = pct >= 85;
                  const isWarn = pct >= 75 && pct < 85;
                  const barColor = isGood ? palette.mint : isWarn ? palette.yellow : palette.coral;
                  return (
                    <TouchableOpacity
                      key={c._id}
                      style={[s.courseRow, i === courses.length - 1 && { borderBottomWidth: 0 }]}
                      onPress={() => openCourseDetail(c)}
                      activeOpacity={0.7}
                    >
                      <View style={s.codeTag}>
                        <Text style={s.codeTagText}>{c.code}</Text>
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
                      <Text style={s.detailArrow}>›</Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={s.emptyCard}>
                  <Text style={s.emptyTitle}>No courses enrolled</Text>
                  <Text style={s.emptyText}>Ask your teacher to enroll you in a course.</Text>
                </View>
              )}
            </View>

            {/* Scan Records / Attendance History Panel */}
            <View style={s.panel}>
              <View style={s.panelHeader}>
                <Text style={s.panelMainTitle}>Attendance History</Text>
                <Text style={s.panelSubTitle}>Verified scan records</Text>
              </View>

              {historyLog.length > 0 ? (
                historyLog.map((item, i) => {
                  const course = item.sessionId?.courseId || {};
                  const scanDate = item.scannedAt ? new Date(item.scannedAt).toLocaleDateString() : '—';
                  return (
                    <View key={item._id || i} style={[s.historyRow, i === historyLog.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.historyCourseTitle}>{course.code || 'CS'} — {course.title || 'Class Session'}</Text>
                        <Text style={s.historyMeta}>{scanDate} · {course.room || 'Room 302'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={s.verifiedTag}>Verified ✓</Text>
                        <Text style={s.historyTime}>{fmt12(item.scannedAt)}</Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={s.emptyCard}>
                  <Text style={s.emptyTitle}>No scan records yet</Text>
                  <Text style={s.emptyText}>When you scan classroom QR codes, your history log will appear here.</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ══════════════════════════════════════════════════ *
         *  VIEW 2 — PROFILE                                  *
         * ══════════════════════════════════════════════════ */}
        {activeNav === 'profile' && (
          <View style={s.panel}>
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

      {/* ── Sidebar Navigation Drawer ──────────────────────── */}
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
                { key: 'overview', label: 'Overview' },
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

      {/* ── Scanner Modal ──────────────────────────────────── */}
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

      {/* ── Course Detail Modal ────────────────────────────── */}
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

                {detailData.enrolledStudents?.length > 0 && (
                  <View style={[s.panel, { marginTop: 14 }]}>
                    <Text style={s.panelMainTitle}>Classmates ({detailData.enrolledStudents.length})</Text>
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

  hero: { backgroundColor: '#1a2f4a', borderRadius: 18, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  heroLeft: { flex: 1 },
  heroEyebrow: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 4 },
  heroSub: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  heroBadge: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, alignItems: 'center', minWidth: 80 },
  heroBadgeNum: { color: '#fff', fontWeight: '800', fontSize: 28, letterSpacing: -0.5 },
  heroBadgeLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: palette.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: palette.border, alignItems: 'center' },
  statLabel: { fontSize: 10, fontWeight: '600', color: palette.inkFaint, textTransform: 'uppercase' },
  statVal: { fontSize: 24, fontWeight: '800', marginVertical: 4 },
  statSub: { fontSize: 10, color: palette.inkFaint, fontWeight: '600' },

  scanBtn: { backgroundColor: palette.blue, borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  scanIconWrap: { width: 46, height: 46, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  scanIconText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  scanBtnTextWrap: { flex: 1 },
  scanBtnTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  scanBtnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  scanArrow: { color: 'rgba(255,255,255,0.6)', fontSize: 28 },

  panel: { backgroundColor: palette.surface, borderRadius: 16, borderWidth: 1, borderColor: palette.border, marginBottom: 14, overflow: 'hidden' },
  panelHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: palette.border },
  panelMainTitle: { fontSize: 16, fontWeight: '800', color: palette.ink },
  panelSubTitle: { fontSize: 12, color: palette.inkFaint, marginTop: 2 },

  courseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.border },
  codeTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: palette.blueLight },
  codeTagText: { fontWeight: '800', fontSize: 11, color: '#2e5fa1' },
  courseInfo: { flex: 1 },
  courseInfoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  courseTitle: { fontWeight: '700', fontSize: 14, color: palette.ink, flex: 1, marginRight: 8 },
  coursePct: { fontWeight: '800', fontSize: 15 },
  courseSub: { color: palette.inkFaint, fontSize: 11, marginBottom: 8 },
  progressTrack: { height: 5, backgroundColor: palette.border, borderRadius: 3, overflow: 'hidden' },
  progressBar: { height: '100%', borderRadius: 3 },
  detailArrow: { color: palette.inkFaint, fontSize: 22 },

  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.border },
  historyCourseTitle: { fontSize: 13, fontWeight: '700', color: palette.ink },
  historyMeta: { fontSize: 11, color: palette.inkFaint, marginTop: 2 },
  verifiedTag: { fontSize: 11, fontWeight: '800', color: palette.mint },
  historyTime: { fontSize: 10, color: palette.inkFaint, marginTop: 2 },

  emptyCard: { padding: 30, alignItems: 'center' },
  emptyTitle: { fontWeight: '800', fontSize: 15, color: palette.ink, marginBottom: 4 },
  emptyText: { fontSize: 12, color: palette.inkFaint, textAlign: 'center' },

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

  modalRoot: { flex: 1, backgroundColor: palette.paper },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, paddingTop: 50, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.surface },
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
