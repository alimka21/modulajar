
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

  // --- LOGIC: IDLE TIMEOUT (3 JAM) ---
  const handleIdleLogout = async () => {
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
      const mappedUser = await mapSessionToUser(session);
      
      if (mappedUser && mappedUser.role !== 'admin' && mappedUser.status === 'pending') {
        await supabase.auth.signOut();
        setUser(null);
        sessionStorage.removeItem('custom_api_key');
        
        // Hanya tampilkan pesan jika user memang mencoba login (bukan saat init background)
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
        if (error) throw error;
        
        if (mounted) {
           await handleSession(session);
        }
      } catch (e) {
        console.error("Init session error:", e);
      } finally {
        // Apapun yang terjadi, hentikan loading agar aplikasi tidak stuck
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (mounted) {
        if (event === 'SIGNED_OUT') {
            setUser(null);
            sessionStorage.removeItem('custom_api_key');
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            await handleSession(session);
        }
        setLoading(false);
      }
    });

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const resetWrapper = () => resetIdleTimer();
    activityEvents.forEach(evt => window.addEventListener(evt, resetWrapper));

    return () => {
      mounted = false;
      subscription.unsubscribe();
      activityEvents.forEach(evt => window.removeEventListener(evt, resetWrapper));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
