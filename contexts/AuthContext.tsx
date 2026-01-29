
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { User } from "../types";
import { mapSessionToUser } from "../services/storageService";
import { swal } from "../services/notificationService";

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

  // Helper untuk memproses session menjadi User App
  const handleSession = async (session: any) => {
    if (!session) {
      setUser(null);
      return;
    }

    try {
      const mappedUser = await mapSessionToUser(session);
      
      // STRICT PENDING CHECK
      if (mappedUser && mappedUser.role !== 'admin' && mappedUser.status === 'pending') {
        console.warn("User pending detected in AuthProvider. Forcing logout.");
        await supabase.auth.signOut();
        setUser(null);
        swal.fire({
            icon: 'info',
            title: 'Menunggu Konfirmasi',
            text: 'Akun Anda belum diaktifkan oleh Admin. Silakan hubungi Admin.',
            confirmButtonColor: '#2563eb'
        });
      } else {
        setUser(mappedUser);
      }
    } catch (error) {
      console.error("Auth Context Mapping Error:", error);
      setUser(null);
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
        // 1. Ambil session awal (Get Session saat mount)
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) await handleSession(session);
      } catch (e) {
        console.error("Init session error", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    // 2. Listener Realtime (onAuthStateChange)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (mounted) {
        // Reset loading to true briefly if needed, or just update user
        await handleSession(session);
        setLoading(false);
      }
    });

    // 3. Timeout Fallback (Anti Loading Forever)
    const timer = setTimeout(() => {
      if (mounted && loading) {
        console.warn("Auth check timed out. Forcing loading false.");
        setLoading(false);
      }
    }, 5000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
