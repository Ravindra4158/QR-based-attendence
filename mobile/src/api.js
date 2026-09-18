import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_SERVER_URL = 'https://attendly-app-gg6q.onrender.com';
let _cachedHost = null;

// Determine host: Custom URL (if set) > Render Production URL (default)
export const getHost = async () => {
  try {
    const custom = await AsyncStorage.getItem('attendly_server_url');
    if (custom && custom.trim()) {
      _cachedHost = custom.trim().replace(/\/+$/, '');
      return _cachedHost;
    }
  } catch {}

  _cachedHost = DEFAULT_SERVER_URL;
  return _cachedHost;
};

export const getSocketUrl = () => _cachedHost || DEFAULT_SERVER_URL;

export const setCustomServerUrl = async (url) => {
  if (url && url.trim()) {
    const formatted = url.trim().replace(/\/+$/, '');
    await AsyncStorage.setItem('attendly_server_url', formatted);
    _cachedHost = formatted;
  } else {
    await AsyncStorage.removeItem('attendly_server_url');
    _cachedHost = null;
    await getHost();
  }
};

const api = axios.create({
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach base URL & JWT from storage to every request
api.interceptors.request.use(async config => {
  const host = _cachedHost || (await getHost());
  config.baseURL = `${host}/api`;
  const token = await AsyncStorage.getItem('attendly_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const setAuthToken = token => {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
};

/* ── API Route Methods (Strictly Online Server) ────────────────────────── */

export const login = async (email, password) => {
  const res = await api.post('/auth/login', { email, password });
  await AsyncStorage.setItem('attendly_token', res.data.token);
  await AsyncStorage.setItem('attendly_user', JSON.stringify(res.data.user));
  setAuthToken(res.data.token);
  return res.data;
};

export const register = async (name, email, password, role, rollNo) => {
  const res = await api.post('/auth/register', { name, email, password, role, rollNo: rollNo || undefined });
  return res.data;
};

export const logout = async () => {
  await AsyncStorage.removeItem('attendly_token');
  await AsyncStorage.removeItem('attendly_user');
  setAuthToken(null);
};

export const getProfile = async () => {
  const res = await api.get('/auth/me');
  return res.data.user;
};

export const updateProfile = async data => {
  const res = await api.put('/auth/profile', data);
  await AsyncStorage.setItem('attendly_user', JSON.stringify(res.data.user));
  return res.data.user;
};

export const getStudents = async () => {
  const res = await api.get('/auth/students');
  return res.data.students;
};

export const getCourses = async () => {
  const res = await api.get('/courses');
  return res.data.courses;
};

export const createCourse = async data => {
  const res = await api.post('/courses', data);
  return res.data.course;
};

export const startSession = async courseId => {
  const res = await api.post('/sessions/start', { courseId });
  return res.data.session;
};

export const stopSession = async sessionId => {
  const res = await api.post(`/sessions/${sessionId}/stop`);
  return res.data.session;
};

export const getSessionRoster = async sessionId => {
  const res = await api.get(`/attendance/session/${sessionId}`);
  return res.data;
};

export const markAttendance = async (sessionId, token) => {
  const res = await api.post('/attendance/mark', { sessionId, token });
  return res.data;
};

export const getAttendancePct = async (studentId, courseId) => {
  const res = await api.get(`/attendance/student/${studentId}/course/${courseId}`);
  return res.data;
};

export const getCourseDetail = async courseId => {
  const res = await api.get(`/courses/${courseId}`);
  return res.data.course;
};

export const exportAttendanceCsv = async courseId => {
  const res = await api.get(`/attendance/export/${courseId}`, { responseType: 'text' });
  return res.data;
};

export const getStudentHistory = async studentId => {
  const res = await api.get(`/attendance/student/${studentId}/history`);
  return res.data;
};

export const getAttendanceHistory = async () => {
  const res = await api.get('/attendance/history');
  return res.data;
};

export default api;