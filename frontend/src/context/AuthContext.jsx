import { createContext, useContext, useState, useEffect } from 'react';
import { getMe, getLoginUrl, checkAdmin, exchangeAuthCode, logoutRequest } from '../api/client';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAdminStatus = async () => {
    try {
      const result = await checkAdmin();
      setIsAdmin(result.isAdmin);
    } catch {
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      getMe()
        .then(async (userData) => {
          setUser(userData);
          await fetchAdminStatus();
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = () => {
    window.location.href = getLoginUrl();
  };

  const logout = () => {
    // Revoke server-side first (bumps token_version). Keep tokens in storage
    // until it settles so an expired access token can still refresh-and-revoke;
    // then clear them. UI state is cleared immediately either way.
    logoutRequest()
      .catch(() => {})
      .finally(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
      });
    setUser(null);
    setIsAdmin(false);
  };

  const handleCallback = async (code) => {
    const { token, refreshToken } = await exchangeAuthCode(code);
    localStorage.setItem('token', token);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    const userData = await getMe();
    setUser(userData);
    await fetchAdminStatus();
    return userData;
  };

  const value = {
    user,
    loading,
    login,
    logout,
    handleCallback,
    isAuthenticated: !!user,
    isAdmin
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
