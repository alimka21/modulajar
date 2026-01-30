
import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { User } from "../types";
import { mapSessionToUser } from "../services/storageService";
import { swal } from "../services/notificationService";

// 3 Jam dalam milidetik (3 * 60 * 60 * 1000)
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

  // --- LOGIC: IDLE TIMEOUT (3 JAM) ---
  const handleIdleLogout = async () => {
    // Cek double confirmation: apakah benar-benar idle?
    const now = Date.now();
    if (now - lastActivityRef.current < IDLE_TIMEOUT) {
        // Jika ternyata ada aktivitas baru-baru ini yang belum mereset timer, jadwalkan ulang
        resetIdleTimer();
        return;
    }

    if (user) {
      console.warn("Session timeout due to inactivity (3 hours).");
      await supabase.auth.signOut();
      setUser(null);
      sessionStorage.removeItem('custom_api_key');
      
      swal.fire({
        icon: 'warning',
        title: 'Sesi Berakhir',
        text: 'Anda telah tidak aktif selama 3 jam. Silakan login kembali untuk keamanan.',
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

  // Helper untuk memproses session menjadi User App
  const handleSession = async (session: any) => {
    if (!session) {
      setUser(null);
      sessionStorage.removeItem('custom_api_key');
      return;
    }

    try {
      // Optimasi: Jika user ID sama dengan yang sekarang, mungkin tidak perlu fetch ulang profile penuh kecuali refresh eksplisit
      // Namun untuk keamanan (role/status check), kita fetch ulang.
      const mappedUser = await mapSessionToUser(session);
      
      if (mappedUser && mappedUser.role !== 'admin' && mappedUser.status === 'pending') {
        // User ada sesi tapi status PENDING di database
        await supabase.auth.signOut();
        setUser(null);
        sessionStorage.removeItem('custom_api_key');
        
        // Hanya tampilkan pesan jika user memang mencoba login aktif (bukan saat init background)
        if (!loading) {
            swal.fire({
                icon: 'info',
                title: 'Akses Dicabut',
                text: 'Akun Anda memerlukan konfirmasi ulang dari Admin.',
                confirmButtonColor: '#2563eb'
            });
        }
      } else {
        setUser(mappedUser);
        
        // SYNC API KEY KE SESSION STORAGE
        if (mappedUser?.apiKey) {
            sessionStorage.setItem('custom_api_key', mappedUser.apiKey);
        }
        
        resetIdleTimer();
      }
    } catch (error) {
      console.error("Auth Context Mapping Error:", error);
      // Fallback: jangan logout paksa jika hanya error jaringan sesaat, biarkan user null sementara atau retry
    }
  };

  const refreshAuth = async () => {
    const { data } = await supabase.auth.getSession();
    await handleSession(data.session);
  };

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // PENTING: Gunakan getSession() untuk recovery cepat saat refresh
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
            console.warn("Session error:", error.message);
            throw error;
        }
        
        if (mounted) {
           await handleSession(session);
        }
      } catch (e) {
        // Silent fail on init
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      if (event === 'SIGNED_OUT') {
          setUser(null);
          sessionStorage.removeItem('custom_api_key');
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          setLoading(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          await handleSession(session);
          setLoading(false);
      }
    });

    // Throttled Activity Listener
    // Kita tidak perlu reset timer di SETIAP event mousemove, cukup sekali tiap menit misal.
    // Tapi sederhananya, kita pakai debounce sederhana via resetIdleTimer yang clearTimeout.
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
