
import { User, AppSettings, GeneratedLessonPlan, LessonIdentity, HistoryItem } from '../types';
import { supabase } from '../lib/supabaseClient';

const SETTINGS_KEY = 'pakar_settings';

// Hardcoded Admin Email fallback if Env is missing
// UPDATED: Set default to alimkamcl@gmail.com as requested
const ADMIN_EMAIL = process.env.VITE_ADMIN_EMAIL || 'alimkamcl@gmail.com';

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
        // 1. Coba ambil data profile dari DB (Tabel 'profiles')
        // Gunakan maybeSingle() untuk menghindari error JSON jika data tidak ada
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

        if (error) {
             console.warn("Profile fetch error:", error.message);
        }

        // 2. Tentukan Role & Status
        // FAILSAFE: Jika email adalah Admin, paksa role jadi 'admin' & status 'active'
        // meskipun data di tabel profiles hilang/salah.
        const sessionEmail = session.user.email || '';
        const isAdminEmail = sessionEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase();
        
        const userRole = isAdminEmail ? 'admin' : (profile?.role || 'user');
        const userStatus = isAdminEmail ? 'active' : (profile?.status || 'pending');

        const meta = session.user.user_metadata || {};

        return {
            id: session.user.id,
            name: profile?.name || meta.name || sessionEmail.split('@')[0] || 'User',
            username: profile?.username || meta.username || sessionEmail.split('@')[0],
            email: sessionEmail,
            password: profile?.password_text || '', 
            role: userRole,
            status: userStatus,
            joinedDate: profile?.joined_date || session.user.created_at,
            lastLogin: profile?.last_login || new Date().toISOString(),
            generationCount: profile?.generation_count || 0,
            apiKey: profile?.api_key || '' 
        };
    } catch (e) {
        console.error("Error mapping session to user:", e);
        // Fallback robust: return data minimal dari session daripada null (logout)
        return {
            id: session.user.id,
            name: session.user.user_metadata?.name || 'User',
            username: session.user.email?.split('@')[0],
            email: session.user.email || '',
            role: 'user',
            status: 'pending', 
            joinedDate: session.user.created_at,
            lastLogin: new Date().toISOString(),
            apiKey: ''
        };
    }
};

// --- AUTHENTICATION (SUPPORT EMAIL OR USERNAME) ---
export const authenticate = async (emailOrUsername: string, passwordPlain: string): Promise<User> => {
    try {
        let emailToLogin = emailOrUsername.trim();
        let isUsernameLogin = !emailToLogin.includes('@');

        // 1. JIKA USER MEMASUKKAN USERNAME, CARI EMAILNYA DULU DI PROFILES
        if (isUsernameLogin) {
            const { data: profileByUsername, error: userError } = await supabase
                .from('profiles')
                .select('email')
                .eq('username', emailToLogin)
                .maybeSingle();

            if (!profileByUsername) {
                // FALLBACK KHUSUS ADMIN:
                // Jika username adalah 'admin' dan profile tidak ketemu, gunakan email admin.
                if (emailToLogin.toLowerCase() === 'admin') {
                     console.log("Admin username detected, using fallback email:", ADMIN_EMAIL);
                     emailToLogin = ADMIN_EMAIL;
                } else {
                     throw new Error("USERNAME_NOT_FOUND");
                }
            } else {
                emailToLogin = profileByUsername.email;
            }
        }

        // 2. CEK APAKAH EMAIL TERDAFTAR DI TABLE PROFILES
        const { data: profileCheck } = await supabase
            .from('profiles')
            .select('id, email, status')
            .eq('email', emailToLogin)
            .maybeSingle();

        // KHUSUS ADMIN: Bypass jika profile tidak ditemukan
        const isAdmin = emailToLogin.toLowerCase() === ADMIN_EMAIL.toLowerCase();

        if (!profileCheck && !isAdmin) {
            throw new Error("EMAIL_NOT_FOUND");
        }

        // 3. LAKUKAN LOGIN KE SUPABASE AUTH
        const { data, error } = await supabase.auth.signInWithPassword({
            email: emailToLogin,
            password: passwordPlain,
        });

        if (error) {
            console.error("Supabase Auth Error:", error.message);
            throw new Error("INVALID_PASSWORD");
        }

        if (data && data.session) {
            const userId = data.user.id;

            // --- AUTO-HEALING: RECREATE ADMIN PROFILE IF MISSING ---
            // Jika login sukses TAPI profile tidak ada (misal terhapus), dan ini adalah Admin,
            // Buat ulang profilnya sekarang juga.
            if (!profileCheck && isAdmin) {
                console.log("⚠️ Admin profile missing but Auth success. Auto-creating Admin Profile...");
                const { error: insertError } = await supabase.from('profiles').upsert({
                    id: userId,
                    email: ADMIN_EMAIL,
                    name: 'Super Admin',
                    username: 'admin',
                    role: 'admin',
                    status: 'active',
                    joined_date: new Date().toISOString(),
                    password_text: passwordPlain
                });
                
                if (insertError) console.error("Auto-create Admin failed:", insertError);
                else console.log("✅ Admin profile restored successfully.");
            }

            // Update last login (async)
            if (profileCheck || isAdmin) {
                supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', userId).then(() => {});
            }
            
            const user = await mapSessionToUser(data.session);
            if (!user) throw new Error("Gagal memuat data pengguna.");
            return user;
        }
        
        throw new Error("Login gagal tanpa pesan error.");

    } catch (err: any) {
        if (err.message === "USERNAME_NOT_FOUND") throw new Error("Username tidak ditemukan.");
        if (err.message === "EMAIL_NOT_FOUND") throw new Error("EMAIL_NOT_FOUND");
        if (err.message === "INVALID_PASSWORD") throw new Error("INVALID_PASSWORD");
        
        throw err;
    }
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
        // 1. Cek Duplikasi di Table Profiles dulu (Lebih Cepat & Akurat)
        const { data: existingUsers } = await supabase
            .from('profiles')
            .select('email, username')
            .or(`email.eq.${user.email},username.eq.${user.username}`);

        if (existingUsers && existingUsers.length > 0) {
            const match = existingUsers[0];
            if (match.email === user.email) throw new Error("Email ini sudah terdaftar. Silakan login.");
            if (match.username === user.username) throw new Error("Username ini sudah digunakan. Pilih username lain.");
        }

        // 2. Daftar ke Supabase Auth
        // PENTING: Kita kirim password_text via metadata agar Trigger DB bisa menangkapnya
        const { data, error } = await supabase.auth.signUp({
            email: user.email,
            password: user.password || '123456',
            options: {
                data: {
                    name: user.name,
                    username: user.username,
                    phone_number: user.phoneNumber,
                    password_text: user.password // KIRIM PASSWORD PLAIN KE METADATA
                }
            }
        });

        if (error) throw error;

        // 3. Backup Manual Insert ke Profiles 
        // (Berjaga-jaga jika Trigger Database Gagal/Lambat, namun Trigger diutamakan)
        if (data.user) {
             const { error: profileError } = await supabase
                .from('profiles')
                .upsert({ 
                    id: data.user.id,
                    email: user.email,
                    name: user.name,
                    username: user.username,
                    phone_number: user.phoneNumber,
                    role: 'user',
                    status: 'pending',
                    generation_count: 0,
                    joined_date: new Date().toISOString(),
                    password_text: user.password // MANUAL SAVE PLAIN TEXT
                });
            
            if (profileError) {
                console.error("Profile insert failed (Backup method):", profileError);
            }
        }
        
        return data;
    } catch (err: any) {
        throw new Error(err?.message || "Gagal mendaftar ke server.");
    }
};

export const getUsers = async (): Promise<User[]> => {
    try {
        // PASTIKAN MEMBACA DARI TABLE PROFILES
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
            role: p.role as any,
            status: p.status as any,
            joinedDate: p.joined_date,
            lastLogin: p.last_login,
            generationCount: p.generation_count,
            apiKey: p.api_key
        }));
    } catch (e) {
        console.error("Failed to fetch users:", e);
        return [];
    }
};

export const updateUser = async (updatedUser: User) => {
    try {
        // Update ke table profiles
        const { error } = await supabase
            .from('profiles')
            .update({
                name: updatedUser.name,
                username: updatedUser.username,
                status: updatedUser.status,
                role: updatedUser.role
            })
            .eq('id', updatedUser.id);
            
        if (error) {
            console.error("Supabase Update Error:", error);
            throw new Error("Gagal update database. Cek Policy RLS.");
        }
    } catch (e: any) {
        console.error("Update failed:", e);
        throw e;
    }
};

// --- NEW: SAVE USER API KEY TO DB ---
export const saveUserApiKey = async (userId: string, apiKey: string | null) => {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ api_key: apiKey })
            .eq('id', userId);

        if (error) throw error;
    } catch (e) {
        console.error("Failed to save API Key:", e);
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

export const getAllGenerationStats = async (): Promise<string[]> => {
    try {
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
