import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAuthToken } from './src/api';
import LoginScreen from './src/screens/LoginScreen';
import TeacherScreen from './src/screens/TeacherScreen';
import StudentScreen from './src/screens/StudentScreen';

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [booting, setBooting] = useState(true);

  // Restore session from storage on launch
  useEffect(() => {
    (async () => {
      try {
        const storedToken = await AsyncStorage.getItem('attendly_token');
        const storedUser = await AsyncStorage.getItem('attendly_user');
        if (storedToken && storedUser) {
          const parsedUser = JSON.parse(storedUser);
          setAuthToken(storedToken);
          setToken(storedToken);
          setUser(parsedUser);
        }
      } catch { /* ignore parse errors */ }
      finally { setBooting(false); }
    })();
  }, []);

  const handleLogin = ({ user: u, token: t }) => {
    setUser(u);
    setToken(t);
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['attendly_token', 'attendly_user']);
    setAuthToken(null);
    setUser(null);
    setToken(null);
  };

  if (booting) {
    return (
      <View style={styles.boot}>
        <View style={styles.bootBrand}>
          <View style={styles.bootMark}><ActivityIndicator color="#fff" /></View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!user ? (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <LoginScreen onLogin={handleLogin} />
        </SafeAreaView>
      ) : user.role === 'teacher' ? (
        <TeacherScreen user={user} token={token} onLogout={handleLogout} />
      ) : (
        <StudentScreen user={user} onLogout={handleLogout} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7f2' },
  boot: { flex: 1, backgroundColor: '#f7f7f2', alignItems: 'center', justifyContent: 'center' },
  bootBrand: { backgroundColor: '#f27e68', width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  bootMark: { alignItems: 'center', justifyContent: 'center' },
});