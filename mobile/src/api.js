import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import {
  offlineLogin,
  offlineRegister,
  offlineGetCourses,
  offlineCreateCourse,
  offlineStartSession,
  offlineStopSession,
  offlineMarkAttendance,
  offlineGetAttendancePct,
  offlineGetStudents,
  offlineGetCourseDetail,
  offlineExportCsv,
} from './offlineBackend';

const DEFAULT_SERVER_URL = 'https://attendly-app-gg6q.onrender.com';
let _cachedHost = null;

// Determine host: Custom URL (if set) > Render Production URL (default) > Fallback
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
  timeout: 4000,
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

/* ── Fallback Helpers ─────────────────────────────────────────────────── */

export const login = async (email, password) => {
  try {
    const res = await api.post('/auth/login', { email, password });
    await AsyncStorage.setItem('attendly_token', res.data.token);
    await AsyncStorage.setItem('attendly_user', JSON.stringify(res.data.user));
    setAuthToken(res.data.token);
    return res.data;
  } catch (err) {
    // Offline fallback
    const res = await offlineLogin(email, password);
    await AsyncStorage.setItem('attendly_token', res.token);
    await AsyncStorage.setItem('attendly_user', JSON.stringify(res.user));
    setAuthToken(res.token);
    return res;
  }
};

export const register = async (name, email, password, role, rollNo) => {
  try {
    const res = await api.post('/auth/register', { name, email, password, role, rollNo: rollNo || undefined });
    return res.data;
  } catch (err) {
    return await offlineRegister(name, email, password, role, rollNo);
  }
};

export const logout = async () => {
  await AsyncStorage.removeItem('attendly_token');
  await AsyncStorage.removeItem('attendly_user');
  setAuthToken(null);
};

export const getProfile = async () => {
  try {
    const res = await api.get('/auth/me');
    return res.data.user;
  } catch (err) {
    const raw = await AsyncStorage.getItem('attendly_user');
    return raw ? JSON.parse(raw) : null;
  }
};

export const updateProfile = async data => {
  try {
    const res = await api.put('/auth/profile', data);
    await AsyncStorage.setItem('attendly_user', JSON.stringify(res.data.user));
    return res.data.user;
  } catch (err) {
    const raw = await AsyncStorage.getItem('attendly_user');
    const user = raw ? JSON.parse(raw) : {};
    const updated = { ...user, ...data };
    await AsyncStorage.setItem('attendly_user', JSON.stringify(updated));
    return updated;
  }
};

export const getStudents = async () => {
  try {
    const res = await api.get('/auth/students');
    return res.data.students;
  } catch (err) {
    return await offlineGetStudents();
  }
};

export const getCourses = async () => {
  try {
    const res = await api.get('/courses');
    return res.data.courses;
  } catch (err) {
    return await offlineGetCourses();
  }
};

export const createCourse = async data => {
  try {
    const res = await api.post('/courses', data);
    return res.data.course;
  } catch (err) {
    return await offlineCreateCourse(data);
  }
};

export const startSession = async courseId => {
  try {
    const res = await api.post('/sessions/start', { courseId });
    return res.data.session;
  } catch (err) {
    return await offlineStartSession(courseId);
  }
};

export const stopSession = async sessionId => {
  try {
    const res = await api.post(`/sessions/${sessionId}/stop`);
    return res.data.session;
  } catch (err) {
    return await offlineStopSession(sessionId);
  }
};

export const getSessionRoster = async sessionId => {
  try {
    const res = await api.get(`/attendance/session/${sessionId}`);
    return res.data;
  } catch (err) {
    return { success: true, sessionId, count: 0, students: [] };
  }
};

export const markAttendance = async (sessionId, token) => {
  try {
    const res = await api.post('/attendance/mark', { sessionId, token });
    return res.data;
  } catch (err) {
    return await offlineMarkAttendance(sessionId, token);
  }
};

export const getAttendancePct = async (studentId, courseId) => {
  try {
    const res = await api.get(`/attendance/student/${studentId}/course/${courseId}`);
    return res.data;
  } catch (err) {
    return await offlineGetAttendancePct(studentId, courseId);
  }
};

export const getCourseDetail = async courseId => {
  try {
    const res = await api.get(`/courses/${courseId}`);
    return res.data.course;
  } catch (err) {
    return await offlineGetCourseDetail(courseId);
  }
};

export const exportAttendanceCsv = async courseId => {
  try {
    const res = await api.get(`/attendance/export/${courseId}`, { responseType: 'text' });
    return res.data;
  } catch (err) {
    return await offlineExportCsv(courseId);
  }
};

export default api;