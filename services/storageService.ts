
import { User, AppSettings, GeneratedLessonPlan, LessonIdentity, HistoryItem } from '../types';
import { supabase } from '../lib/supabaseClient';

const SETTINGS_KEY = 'pakar_settings';

const DEFAULT_SETTINGS: AppSettings = {
    promoLink: 'https://instagram.com/muh.alimka',
    whatsappNumber: '6282335454864',
    socialMediaLink: 'https://instagram.com/muh.alimka'
};

export const initializeStorage = () => {
    if (!localStorage.getItem(SETTINGS_KEY)) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    }
};

// --- HELPER: CONVERT SUPABASE SESSION TO APP USER ---
export const mapSessionToUser = async (session: any): Promise<User | null> => {
    if (!session || !session.user) return null;

    try {
        const adminEmail = process.env.VITE_ADMIN_EMAIL || 'alimka21@gmail.com';
        
        // 1. Coba ambil data profile dari DB
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (error && error.code !== 'PGRST116') {
             console.warn("Error fetching profile:", error);
             // Jangan return null jika error koneksi, return data dasar dari session agar tidak stuck
        }

        // 2. Tentukan Role & Status
        const isAdminEmail = session.user.email === adminEmail;
        const userRole = isAdminEmail ? 'admin' : (profile?.role || 'user');
        const userStatus = isAdminEmail ? 'active' : (profile?.status || 'pending');

        const meta = session.user.user_metadata || {};

        return {
            id: session.user.id,
            name: profile?.name || meta.name || session.user.email?.split('@')[0] || 'User',
            username: profile?.username || meta.username || session.user.email?.split('@')[0],
            email: session.user.email || '',
            password: profile?.password_text || '', // Retrieve password text
            role: userRole,
            status: userStatus,
            joinedDate: profile?.joined_date || session.user.created_at,
            lastLogin: profile?.last_login || new Date().toISOString(),
            generationCount: profile?.generation_count || 0
        };
    } catch (e) {
        console.error("Error mapping session to user:", e);
        return null;
    }
};

// --- AUTHENTICATION ---
export const authenticate = async (email: string, passwordPlain: string): Promise<User | null> => {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: passwordPlain,
        });

        if (error) throw error;

        if (data && data.session) {
            const newLastLogin = new Date().toISOString();
            await supabase.from('profiles').update({ last_login: newLastLogin }).eq('id', data.user.id);
            return await mapSessionToUser(data.session);
        }
    } catch (err: any) {
        console.warn("Login failed:", err.message);
    }
    return null;
};

export const restoreSession = async (): Promise<User | null> => {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (session) {
             return await mapSessionToUser(session);
        }
    } catch (e) {
        console.warn("Restore session failed", e);
    }
    return null;
};

// --- USER MANAGEMENT ---
export const saveUser = async (user: User) => {
    try {
        // 1. CEK DUPLIKAT DI PROFILES DULU (Username / Email)
        const { data: existingUser, error: checkError } = await supabase
            .from('profiles')
            .select('id, email, username')
            .or(`email.eq.${user.email},username.eq.${user.username}`)
            .maybeSingle(); // Gunakan maybeSingle agar tidak error jika kosong

        if (existingUser) {
            if (existingUser.email === user.email) throw new Error("Email sudah terdaftar. Silakan login.");
            if (existingUser.username === user.username) throw new Error("Username sudah digunakan. Pilih username lain.");
        }

        // 2. DAFTAR KE SUPABASE AUTH
        const { data, error } = await supabase.auth.signUp({
            email: user.email,
            password: user.password || '123456',
            options: {
                data: {
                    name: user.name,
                    username: user.username,
                }
            }
        });

        if (error) throw error;

        // 3. SIMPAN KE PROFILES (Termasuk Password Text)
        if (data.user) {
             const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: data.user.id,
                    email: user.email,
                    name: user.name,
                    username: user.username,
                    role: 'user',
                    status: 'pending',
                    generation_count: 0,
                    joined_date: new Date().toISOString(),
                    password_text: user.password // FIX: PASTIKAN PASSWORD DISIMPAN
                });
            
            if (profileError) {
                console.error("Profile insert failed:", profileError);
                // Jika gagal simpan profile, mungkin perlu rollback atau log
            }
        }
        
        return data;
    } catch (err: any) {
        throw new Error(err?.message || "Gagal mendaftar ke server.");
    }
};

export const getUsers = async (): Promise<User[]> => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('joined_date', { ascending: false });

        if (error) throw error;

        return data.map((p: any) => ({
            id: p.id,
            name: p.name,
            username: p.username,
            email: p.email,
            password: p.password_text, // Map from DB column
            role: p.role as any,
            status: p.status as any,
            joinedDate: p.joined_date,
            lastLogin: p.last_login,
            generationCount: p.generation_count
        }));
    } catch (e) {
        console.error("Failed to fetch users:", e);
        return [];
    }
};

export const updateUser = async (updatedUser: User) => {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({
                name: updatedUser.name,
                username: updatedUser.username,
                status: updatedUser.status,
                role: updatedUser.role
            })
            .eq('id', updatedUser.id);
            
        if (error) throw error;
    } catch (e) {
        console.error("Update failed:", e);
        throw e;
    }
};

export const incrementGenerationCount = async (userId: string) => {
    try {
        const { data } = await supabase.from('profiles').select('generation_count').eq('id', userId).single();
        const current = data?.generation_count || 0;
        await supabase.from('profiles').update({ generation_count: current + 1 }).eq('id', userId);
    } catch (e) {
        console.warn("Failed to increment count:", e);
    }
};

export const deleteUser = async (id: string) => {
    try {
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (error) throw error;
    } catch (e) {
        console.error("Delete failed:", e);
    }
};

// --- HISTORY MANAGEMENT ---

export const saveHistory = async (
    userId: string, 
    data: GeneratedLessonPlan, 
    inputData: LessonIdentity,
    features: { rpp: boolean; materials: boolean; lkpd: boolean; assessment: boolean; questionBank: boolean }
): Promise<string | null> => {
    try {
        const { data: result, error } = await supabase
            .from('generation_history')
            .insert({
                user_id: userId,
                subject: inputData.subject,
                grade: inputData.grade,
                topic: inputData.topic,
                features: features,
                full_data: data,
                input_data: inputData
            })
            .select()
            .single();

        if (error) throw error;
        return result.id;
    } catch (err) {
        console.error("Failed to save history:", err);
        return null;
    }
};

export const updateHistory = async (
    historyId: string, 
    data: GeneratedLessonPlan, 
    features: { rpp: boolean; materials: boolean; lkpd: boolean; assessment: boolean; questionBank: boolean }
) => {
    try {
        await supabase
            .from('generation_history')
            .update({
                full_data: data,
                features: features
            })
            .eq('id', historyId);
    } catch (err) {
        console.error("Failed to update history:", err);
    }
};

export const getHistory = async (userId: string): Promise<HistoryItem[]> => {
    try {
        const { data, error } = await supabase
            .from('generation_history')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as HistoryItem[];
    } catch (err) {
        console.error("Failed to fetch history:", err);
        return [];
    }
};

// NEW FUNCTION: Get all generation timestamps for Admin Chart
export const getAllGenerationStats = async (): Promise<string[]> => {
    try {
        // We only need the timestamp, minimal data transfer
        const { data, error } = await supabase
            .from('generation_history')
            .select('created_at')
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data.map((d: any) => d.created_at);
    } catch (e) {
        console.error("Failed to fetch all stats:", e);
        return [];
    }
};

// --- SETTINGS ---
export const getSettings = (): AppSettings => {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : DEFAULT_SETTINGS;
};

export const saveSettings = (settings: AppSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const hashPassword = async (password: string): Promise<string> => {
    return password; 
};
