
import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { User } from "../types";
import { mapSessionToUser } from "../services/storageService";
import { swal } from "../services/notificationService";
import { tokenManager } from "../services/tokenManager";

// 3 Jam dalam milidetik
const IDLE_TIMEOUT = 10800000;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  refreshAuth: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refreshAuth: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Optimized Session Handler
  const handleSession = async (session: any) => {
    if (!session) {
      setUser(null);
      sessionStorage.removeItem('custom_api_key');
      tokenManager.clearKey();
      setLoading(false);
      return;
    }

    try {
      // mapSessionToUser now uses optimized Direct Select (no RPC)
      const mappedUser = await mapSessionToUser(session);
      
      if (mappedUser) {
        setUser(mappedUser);
        
        // 1. Set TokenManager (Singleton) for Service access
        tokenManager.setKey(mappedUser.apiKey || null);

        // 2. Set Session Storage (Legacy/UI Persistence)
        if (mappedUser.apiKey && mappedUser.apiKey.length > 5) {
            sessionStorage.setItem('custom_api_key', mappedUser.apiKey);
        } else {
            sessionStorage.removeItem('custom_api_key');
        }
        
        resetIdleTimer();
      } else {
        // Sesi ada, tapi profil DB tidak ditemukan
        console.warn("User authenticated but no profile found.");
        setUser(null);
        tokenManager.clearKey();
      }
    } catch (error) {
      console.error("Auth Context Error:", error);
      setUser(null);
      tokenManager.clearKey();
    } finally {
      setLoading(false);
    }
  };

  const refreshAuth = async () => {
    const { data } = await supabase.auth.getSession();
    await handleSession(data.session);
  };

  const handleIdleLogout = async () => {
    const now = Date.now();
    if (now - lastActivityRef.current < IDLE_TIMEOUT) {
        resetIdleTimer();
        return;
    }
    if (user) {
      await supabase.auth.signOut();
      setUser(null);
      sessionStorage.removeItem('custom_api_key');
      tokenManager.clearKey();
      swal.fire({
        icon: 'warning',
        title: 'Sesi Berakhir',
        text: 'Anda telah tidak aktif selama 3 jam.',
        confirmButtonColor: '#2563eb'
      });
    }
  };

  const resetIdleTimer = () => {
    lastActivityRef.current = Date.now();
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (user) {
      idleTimerRef.current = setTimeout(handleIdleLogout, IDLE_TIMEOUT);
    }
  };

  useEffect(() => {
    let mounted = true;

    // 1. Initial Check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) handleSession(session);
    });

    // 2. Real-time Subscription (onAuthStateChange)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          handleSession(session);
      } else if (event === 'SIGNED_OUT') {
          setUser(null);
          sessionStorage.removeItem('custom_api_key');
          tokenManager.clearKey();
          setLoading(false);
      }
    });

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const activityHandler = () => resetIdleTimer();
    activityEvents.forEach(evt => window.addEventListener(evt, activityHandler));

    return () => {
      mounted = false;
      subscription.unsubscribe();
      activityEvents.forEach(evt => window.removeEventListener(evt, activityHandler));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
