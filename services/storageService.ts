
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
        // UPDATE: Set email admin sesuai akun Anda
        const adminEmail = (process.env.VITE_ADMIN_EMAIL || 'alimkamcl@gmail.com').toLowerCase().trim();
        const currentUserEmail = (session.user.email || '').toLowerCase().trim();
        
        // 1. Coba ambil data profile dari DB
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (error) {
             console.warn("Profile fetch warning (might be new user):", error.message);
        }

        // 2. Tentukan Role & Status
        // Logic: Jika email sama dengan Super Admin, paksa jadi ADMIN dan ACTIVE
        const isAdminEmail = currentUserEmail === adminEmail;
        
        const userRole = isAdminEmail ? 'admin' : (profile?.role || 'user');
        const userStatus = isAdminEmail ? 'active' : (profile?.status || 'pending');

        const meta = session.user.user_metadata || {};

        return {
            id: session.user.id,
            name: profile?.name || meta.name || session.user.email?.split('@')[0] || 'User',
            username: profile?.username || meta.username || session.user.email?.split('@')[0],
            email: session.user.email || '',
            phoneNumber: profile?.phone_number || '', // Mapped from DB
            apiKey: profile?.api_key || '', // Mapped from DB
            password: profile?.password_text || '', 
            role: userRole,
            status: userStatus,
            joinedDate: profile?.joined_date || session.user.created_at,
            lastLogin: profile?.last_login || new Date().toISOString(),
            generationCount: profile?.generation_count || 0
        };
    } catch (e) {
        console.error("Error mapping session to user:", e);
        // Fallback object agar tidak crash total
        return {
            id: session.user.id,
            name: session.user.user_metadata?.name || 'User',
            username: session.user.email?.split('@')[0],
            email: session.user.email || '',
            role: 'user',
            status: 'pending', 
            joinedDate: session.user.created_at,
            lastLogin: new Date().toISOString()
        };
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
            // Fire and forget update
            supabase.from('profiles').update({ last_login: newLastLogin }).eq('id', data.user.id).then(() => {});
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
        const { data: existingUsers, error: checkError } = await supabase
            .from('profiles')
            .select('email, username')
            .or(`email.eq.${user.email},username.eq.${user.username}`);

        if (checkError) throw checkError;

        if (existingUsers && existingUsers.length > 0) {
            const match = existingUsers[0];
            if (match.email === user.email) throw new Error("Email ini sudah terdaftar. Silakan login.");
            if (match.username === user.username) throw new Error("Username ini sudah digunakan. Pilih username lain.");
        }

        // 2. DAFTAR KE SUPABASE AUTH
        const { data, error } = await supabase.auth.signUp({
            email: user.email,
            password: user.password || '123456',
            options: {
                data: {
                    name: user.name,
                    username: user.username,
                    phone_number: user.phoneNumber // Meta data
                }
            }
        });

        if (error) throw error;

        // 3. SIMPAN KE PROFILES
        if (data.user) {
             const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: data.user.id,
                    email: user.email,
                    name: user.name,
                    username: user.username,
                    phone_number: user.phoneNumber, // SAVE PHONE NUMBER TO DB
                    role: 'user',
                    status: 'pending',
                    generation_count: 0,
                    joined_date: new Date().toISOString(),
                    password_text: user.password
                });
            
            if (profileError) {
                console.error("Profile insert failed:", profileError);
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
            password: p.password_text,
            phoneNumber: p.phone_number, // Fetch Phone
            apiKey: p.api_key, // Fetch API Key
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
                role: updatedUser.role,
                phone_number: updatedUser.phoneNumber
                // Note: Password and API Key usually updated separately for security
            })
            .eq('id', updatedUser.id);
            
        if (error) throw error;
    } catch (e) {
        console.error("Update failed:", e);
        throw e;
    }
};

// NEW FUNCTION: Update API Key in Database
export const updateUserApiKey = async (userId: string, apiKey: string) => {
    try {
        // Simpan ke DB
        const { error } = await supabase
            .from('profiles')
            .update({ api_key: apiKey })
            .eq('id', userId);

        if (error) throw error;
        
        // Simpan juga ke LocalStorage untuk kompatibilitas service
        if (apiKey) {
            localStorage.setItem('custom_api_key', apiKey);
        } else {
            localStorage.removeItem('custom_api_key');
        }

    } catch (e: any) {
        console.error("Failed to update API Key:", e);
        throw new Error(e.message || "Gagal menyimpan API Key ke database.");
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
