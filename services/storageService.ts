
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
// Ini helper penting agar logic pembuatan user konsisten
export const mapSessionToUser = async (session: any): Promise<User | null> => {
    if (!session || !session.user) return null;

    try {
        const adminEmail = process.env.VITE_ADMIN_EMAIL || 'alimka21@gmail.com';
        
        // 1. Coba ambil data profile dari DB
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        // 2. Tentukan Role & Status
        // Jika email sesuai hardcode admin, paksa jadi admin & active
        const isAdminEmail = session.user.email === adminEmail;
        const userRole = isAdminEmail ? 'admin' : (profile?.role || 'user');
        const userStatus = isAdminEmail ? 'active' : (profile?.status || 'pending');

        // 3. Fallback Metadata jika profile null (misal user lama atau deleted profile)
        const meta = session.user.user_metadata || {};

        return {
            id: session.user.id,
            name: profile?.name || meta.name || session.user.email?.split('@')[0] || 'User',
            username: profile?.username || meta.username || session.user.email?.split('@')[0],
            email: session.user.email || '',
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

// --- AUTHENTICATION VIA SUPABASE ---

export const authenticate = async (email: string, passwordPlain: string): Promise<User | null> => {
    try {
        // 1. Auth dengan Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: passwordPlain,
        });

        if (error) throw error;

        if (data && data.session) {
            // Update Last Login saat login eksplisit
            const newLastLogin = new Date().toISOString();
            await supabase.from('profiles').update({ last_login: newLastLogin }).eq('id', data.user.id);
            
            // Gunakan helper yang sama
            return await mapSessionToUser(data.session);
        }
    } catch (err: any) {
        console.warn("Login failed:", err.message);
    }
    return null;
};

// --- RESTORE SESSION ON RELOAD ---
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

// --- USER MANAGEMENT (DB BASED) ---

export const saveUser = async (user: User) => {
    try {
        // 1. Register Auth User
        const { data, error } = await supabase.auth.signUp({
            email: user.email,
            password: user.password || '123456', // Password asli (raw) diperlukan disini
            options: {
                data: {
                    name: user.name,
                    username: user.username,
                }
            }
        });

        if (error) throw error;

        if (data.user) {
             // 2. Insert ke Tabel Public Profiles (Agar Admin bisa baca)
             const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: data.user.id,
                    email: user.email,
                    name: user.name,
                    username: user.username,
                    role: 'user',
                    status: 'pending', // Default pending
                    generation_count: 0,
                    joined_date: new Date().toISOString()
                });
            
            if (profileError) {
                console.error("Profile insert failed:", profileError);
                // Jika user auth berhasil tapi profile gagal (misal duplikat), kita anggap sukses auth saja
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
        // Update Profile Data
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

        // Note: Password update requires Admin Auth Client (service role) or user changing own password.
        // We cannot securely update another user's password from client-side without Admin API enabled.
    } catch (e) {
        console.error("Update failed:", e);
        throw e;
    }
};

export const incrementGenerationCount = async (userId: string) => {
    try {
        // Gunakan RPC (Remote Procedure Call) atau fetch-update manual
        // Cara manual (fetch then update)
        const { data } = await supabase.from('profiles').select('generation_count').eq('id', userId).single();
        const current = data?.generation_count || 0;
        
        await supabase.from('profiles').update({ generation_count: current + 1 }).eq('id', userId);
    } catch (e) {
        console.warn("Failed to increment count:", e);
    }
};

export const deleteUser = async (id: string) => {
    try {
        // Delete from profiles (Cascade should handle auth if set up, but usually we just remove profile access)
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

// --- SETTINGS ---

export const getSettings = (): AppSettings => {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : DEFAULT_SETTINGS;
};

export const saveSettings = (settings: AppSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const hashPassword = async (password: string): Promise<string> => {
    return password; // No hashing client side for Auth flow, Supabase handles it.
};
