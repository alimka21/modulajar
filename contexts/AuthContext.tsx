
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
      
      // STRICT PENDING CHECK - Kecuali Admin
      if (mappedUser && mappedUser.role !== 'admin' && mappedUser.status === 'pending') {
        // Jangan langsung SignOut di sini jika ini hanya refresh halaman, 
        // biarkan UI (App.tsx) yang menangani redirect atau pesan.
        // Tapi set user tetap null atau flag khusus agar tidak masuk dashboard
        console.warn("User status pending.");
      } 
      
      setUser(mappedUser);
    } catch (error) {
      console.error("Auth Context Mapping Error:", error);
      setUser(null);
    }
  };

  const refreshAuth = async () => {
    setLoading(true);
    const { data } = await supabase.auth.getSession();
    await handleSession(data.session);
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // 1. Ambil session awal (Get Session saat mount)
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
            console.error("Session error:", error);
            if (mounted) setUser(null);
        } else {
            if (mounted) await handleSession(session);
        }
      } catch (e) {
        console.error("Init session unexpected error", e);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    // 2. Listener Realtime (onAuthStateChange)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // console.log("Auth Event:", event);
      if (mounted) {
        if (event === 'SIGNED_OUT') {
            setUser(null);
            setLoading(false);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            await handleSession(session);
            setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
