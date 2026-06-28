import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { isNative, saveToken, getToken, clearToken } from '../utils/tokenStorage';

if (isNative()) {
  axios.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
} else {
  axios.defaults.withCredentials = true;
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        if (isNative()) await getToken();
        const res = await axios.get('/api/auth/me');
        setUser(res.data.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const login = async (username, password) => {
    const res = await axios.post('/api/auth/login', { username, password });
    if (res.data.token) await saveToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  };

  const register = async (username, password) => {
    const res = await axios.post('/api/auth/register', { username, password });
    if (res.data.token) await saveToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = async () => {
    try { await axios.post('/api/auth/logout'); } catch {}
    await clearToken();
    setUser(null);
  };

  const refreshUser = async () => {
    const res = await axios.get('/api/auth/me');
    setUser(res.data.user);
    return res.data.user;
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
