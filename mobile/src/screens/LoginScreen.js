import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Modal, Alert,
  TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { palette } from '../theme';
import { login, register, getHost, setCustomServerUrl } from '../api';

export default function LoginScreen({ onLogin }) {
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('student');
  const [rollNo, setRollNo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Server URL settings
  const [showServerModal, setShowServerModal] = useState(false);
  const [currentServer, setCurrentServer] = useState('');
  const [inputServer, setInputServer] = useState('');

  useEffect(() => {
    getHost().then(h => {
      setCurrentServer(h);
      setInputServer(h);
    });
  }, []);

  const autofill = isTeacher => {
    if (isTeacher) { setEmail('teacher@attendly.edu'); setPassword('password123'); }
    else            { setEmail('arjun@attendly.edu');  setPassword('password123'); }
    setTab('login');
    setError('');
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) return setError('Email and password are required.');
    setBusy(true); setError('');
    try {
      const result = await login(email.trim().toLowerCase(), password);
      onLogin(result);
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Check your credentials and server connection.');
    } finally { setBusy(false); }
  };

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) return setError('All fields are required.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true); setError('');
    try {
      await register(name.trim(), email.trim().toLowerCase(), password, role, rollNo.trim());
      const result = await login(email.trim().toLowerCase(), password);
      onLogin(result);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed.');
    } finally { setBusy(false); }
  };

  const handleSaveServer = async () => {
    await setCustomServerUrl(inputServer);
    const updated = await getHost();
    setCurrentServer(updated);
    setShowServerModal(false);
    Alert.alert('Server Updated', `Connecting to ${updated}`);
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Brand */}
          <View style={s.brandRow}>
            <View style={s.brandMark}><Text style={s.brandMarkText}>A</Text></View>
            <Text style={s.brandText}>attendly</Text>
          </View>
          <Text style={s.tagline}>Sign in to manage or mark attendance</Text>

          {/* Card */}
          <View style={s.card}>
            {/* Tabs */}
            <View style={s.tabs}>
              {['login', 'register'].map(t => (
                <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => { setTab(t); setError(''); }}>
                  <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                    {t === 'login' ? 'Sign in' : 'Register'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {!!error && <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>}

            {tab === 'login' ? (
              <>
                <Field label="Email address" value={email} onChangeText={setEmail} placeholder="you@university.edu" keyboardType="email-address" autoCapitalize="none" />
                <Field label="Password" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
                <PrimaryButton label={busy ? 'Signing in…' : 'Sign in'} onPress={handleLogin} disabled={busy} />
                <Text style={s.demoLabel}>Quick demo :</Text>
                <View style={s.demoRow}>
                  <TouchableOpacity style={s.demoBtn} onPress={() => autofill(true)}>
                    <Text style={s.demoBtnText}>Teacher</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.demoBtn} onPress={() => autofill(false)}>
                    <Text style={s.demoBtnText}>Student</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Field label="Full name" value={name} onChangeText={setName} placeholder="Jane Smith" />
                <Field label="Email address" value={email} onChangeText={setEmail} placeholder="you@university.edu" keyboardType="email-address" autoCapitalize="none" />
                <Field label="Password (min 8 chars)" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
                
                <Text style={s.fieldLabel}>I am a</Text>
                <View style={s.roleRow}>
                  {['student', 'teacher'].map(r => (
                    <TouchableOpacity key={r} style={[s.roleChip, role === r && s.roleChipActive]} onPress={() => setRole(r)}>
                      <Text style={[s.roleChipText, role === r && s.roleChipTextActive]}>
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {role === 'student' && (
                  <Field label="Roll / Student ID" value={rollNo} onChangeText={setRollNo} placeholder="CS21001" />
                )}
                <PrimaryButton label={busy ? 'Creating account…' : 'Create account'} onPress={handleRegister} disabled={busy} />
              </>
            )}

            {/* Server Config Footer */}
            <TouchableOpacity style={s.serverFooter} onPress={() => setShowServerModal(true)}>
              <Text style={s.serverFooterText}>🌐 Server: {currentServer || 'Auto'}</Text>
            </TouchableOpacity>
          </View>

          {/* Server Config Modal */}
          <Modal visible={showServerModal} transparent animationType="fade" onRequestClose={() => setShowServerModal(false)}>
            <View style={s.modalBackdrop}>
              <View style={s.modalCard}>
                <Text style={s.modalTitle}>Backend Server Settings</Text>
                <Text style={s.modalSub}>Enter your backend API URL (e.g. http://192.168.1.10:4000 or http://10.0.2.2:4000)</Text>
                
                <TextInput
                  style={s.input}
                  value={inputServer}
                  onChangeText={setInputServer}
                  placeholder="http://192.168.1.100:4000"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity style={[s.demoBtn, { flex: 1 }]} onPress={() => setShowServerModal(false)}>
                    <Text style={{ color: palette.inkMuted, fontWeight: '700' }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.primaryBtn, { flex: 1, marginTop: 0 }]} onPress={handleSaveServer}>
                    <Text style={s.primaryBtnText}>Save URL</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor={palette.inkFaint} {...props} />
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled }) {
  return (
    <TouchableOpacity style={[s.primaryBtn, disabled && { opacity: 0.6 }]} onPress={onPress} disabled={disabled} activeOpacity={0.85}>
      <Text style={s.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.paper },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 22, paddingTop: 50 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6, justifyContent: 'center' },
  brandMark: { backgroundColor: palette.coral, width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  brandText: { color: palette.ink, fontWeight: '800', fontSize: 22, letterSpacing: -0.4 },
  tagline: { textAlign: 'center', color: palette.inkFaint, fontSize: 13, marginBottom: 24 },
  card: { backgroundColor: palette.surface, borderRadius: 18, padding: 22, borderWidth: 1, borderColor: palette.border },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: palette.border, marginBottom: 18 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  tabActive: { borderBottomColor: palette.coral },
  tabText: { fontSize: 13.5, fontWeight: '600', color: palette.inkFaint },
  tabTextActive: { color: palette.coralDark, fontWeight: '700' },
  errorBox: { backgroundColor: palette.coralLight, padding: 12, borderRadius: 8, marginBottom: 14 },
  errorText: { color: palette.coralDark, fontSize: 13 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: palette.inkMuted, marginBottom: 6 },
  input: { backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.border, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: palette.ink },
  primaryBtn: { backgroundColor: palette.ink, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 6 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
  demoLabel: { textAlign: 'center', marginTop: 16, color: palette.inkFaint, fontSize: 12, fontWeight: '600' },
  demoRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  demoBtn: { flex: 1, borderWidth: 1, borderColor: palette.border, borderRadius: 8, paddingVertical: 10, alignItems: 'center', backgroundColor: palette.paper },
  demoBtnText: { color: palette.coralDark, fontWeight: '700', fontSize: 13 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  roleChip: { flex: 1, borderWidth: 1, borderColor: palette.border, borderRadius: 8, paddingVertical: 10, alignItems: 'center', backgroundColor: palette.paper },
  roleChipActive: { backgroundColor: palette.coralLight, borderColor: palette.coral },
  roleChipText: { fontWeight: '700', fontSize: 13, color: palette.inkMuted },
  roleChipTextActive: { color: palette.coralDark },
  serverFooter: { marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: palette.border, alignItems: 'center' },
  serverFooterText: { fontSize: 11, fontWeight: '600', color: palette.inkFaint },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: palette.surface, borderRadius: 18, padding: 22, borderWidth: 1, borderColor: palette.border },
  modalTitle: { fontWeight: '800', fontSize: 16, color: palette.ink, marginBottom: 4 },
  modalSub: { fontSize: 12, color: palette.inkFaint, marginBottom: 14, lineHeight: 17 },
});
