
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
      localStorage.removeItem('custom_api_key');
      return;
    }

    try {
      const mappedUser = await mapSessionToUser(session);
      
      // STRICT PENDING CHECK
      // Note: role 'admin' always passes.
      if (mappedUser && mappedUser.role !== 'admin' && mappedUser.status === 'pending') {
        console.warn("User pending detected in AuthProvider. Forcing logout.");
        await supabase.auth.signOut();
        setUser(null);
        localStorage.removeItem('custom_api_key');
        swal.fire({
            icon: 'info',
            title: 'Menunggu Konfirmasi',
            text: 'Akun Anda belum diaktifkan oleh Admin. Silakan hubungi Admin.',
            confirmButtonColor: '#2563eb'
        });
      } else {
        setUser(mappedUser);
        
        // SYNC API KEY
        if (mappedUser?.apiKey) {
            localStorage.setItem('custom_api_key', mappedUser.apiKey);
        } else {
            localStorage.removeItem('custom_api_key');
        }
      }
    } catch (error) {
      console.error("Auth Context Mapping Error:", error);
      // Jangan set User ke null di sini jika error network, biarkan state sebelumnya (jika ada)
      // atau set null hanya jika fatal. Untuk amannya:
      // setUser(null); 
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
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted) {
           await handleSession(session);
        }
      } catch (e) {
        console.error("Init session error", e);
      } finally {
        // PENTING: Selalu set loading false apapun yang terjadi
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (mounted) {
        if (event === 'SIGNED_OUT') {
            setUser(null);
            localStorage.removeItem('custom_api_key');
        } else if (session) {
            await handleSession(session);
        }
        setLoading(false);
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
