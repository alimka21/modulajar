import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { User } from "../types";
import { mapSessionToUser } from "../services/storageService";
import { swal } from "../services/notificationService";

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
  const [loading, setLoading] = useState(true); // Default true agar aman

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Helper mapping session
  const handleSession = async (session: any) => {
    if (!session) {
      setUser(null);
      sessionStorage.removeItem('custom_api_key');
      return;
    }

    try {
      const mappedUser = await mapSessionToUser(session);
      if (mappedUser) {
        setUser(mappedUser);
        if (mappedUser.apiKey && mappedUser.apiKey.length > 5) {
            sessionStorage.setItem('custom_api_key', mappedUser.apiKey);
        } else {
            sessionStorage.removeItem('custom_api_key');
        }
        resetIdleTimer();
      } else {
        // Session ada tapi data user di DB tidak valid
        setUser(null);
      }
    } catch (error) {
      console.error("Auth Mapping Error:", error);
      setUser(null);
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

    const initAuth = async () => {
      try {
        // Cek session dari Supabase
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        if (mounted) await handleSession(session);
      } catch (e) {
        console.error("Init Auth Error:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    // SAFETY GUARD: Force stop loading after 5 seconds
    // Ini solusi untuk masalah "Stuck Loading"
    const safetyTimeout = setTimeout(() => {
        if (mounted && loading) {
            console.warn("Loading took too long, forcing render.");
            setLoading(false);
        }
    }, 5000); 

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
          setUser(null);
          sessionStorage.removeItem('custom_api_key');
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          setLoading(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          await handleSession(session);
          setLoading(false);
      }
    });

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    const activityHandler = () => resetIdleTimer();
    activityEvents.forEach(evt => window.addEventListener(evt, activityHandler));

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
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