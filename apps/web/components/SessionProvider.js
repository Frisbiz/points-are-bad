'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getSession } from '../lib/api';

const SessionContext = createContext({
  user: null,
  loading: true,
  refresh: async () => {}
});

export function SessionProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const current = await getSession();
    setUser(current);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <SessionContext.Provider value={{ user, setUser, loading, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
