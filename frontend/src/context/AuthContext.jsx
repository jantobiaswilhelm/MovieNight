import { createContext, useContext, useState, useEffect } from 'react';
import { getMe, getLoginUrl, checkAdmin } from '../api/client';

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
    localStorage.removeItem('token');
    setUser(null);
    setIsAdmin(false);
  };

  const handleCallback = async (token) => {
    localStorage.setItem('token', token);
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
