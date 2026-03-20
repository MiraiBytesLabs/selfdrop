import { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [username, setUsername] = useState(null);

  const saveToken = useCallback((token, persistent = true) => {
    const storage = persistent ? localStorage : sessionStorage;
    storage.setItem('selfdrop_token', token);
  }, []);

  const clearToken = useCallback(() => {
    localStorage.removeItem('selfdrop_token');
    sessionStorage.removeItem('selfdrop_token');
    setUsername(null);
  }, []);

  const getToken = useCallback(() =>
    localStorage.getItem('selfdrop_token')
    || sessionStorage.getItem('selfdrop_token')
    || null
  , []);

  return (
    <AuthContext.Provider value={{ username, setUsername, saveToken, clearToken, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
