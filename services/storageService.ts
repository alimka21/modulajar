
import { User, AppSettings, GeneratedLessonPlan, LessonIdentity, HistoryItem } from '../types';
import { supabase } from '../lib/supabaseClient';

const SETTINGS_KEY = 'pakar_settings';
const DRAFT_KEY = 'pakar_draft_workspace'; // Key untuk Auto-Save
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

// --- DRAFT / PERSISTENCE FUNCTIONS ---

export const saveDraft = (data: { lessonIdentity: LessonIdentity, generatedPlan: GeneratedLessonPlan | null, historyId: string | null }) => {
    try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch (e) {
        console.error("Failed to save draft:", e);
    }
};

export const getDraft = () => {
    try {
        const data = localStorage.getItem(DRAFT_KEY);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        return null;
    }
};

export const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
};

// -------------------------------------

export const mapSessionToUser = async (session: any): Promise<User | null> => {
    if (!session || !session.user) return null;
    try {
        // PERBAIKAN: Gunakan RPC 'get_my_profile_safe' alih-alih select langsung.
        let profile: any = null;

        const { data: rpcData, error: rpcError } = await supabase
            .rpc('get_my_profile_safe', { target_id: session.user.id });

        if (!rpcError && rpcData) {
            profile = rpcData;
        } else {
            // Fallback ke cara lama jika fungsi SQL belum di-update user
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();
            profile = data;
        }

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
        return null;
    }
};

export const authenticate = async (emailOrUsername: string, passwordPlain: string): Promise<User> => {
    let identifier = emailOrUsername.trim();
    let passwordToLogin = passwordPlain.trim();
    
    // Khusus login "admin" biasa (fallback legacy)
    if (identifier.toLowerCase() === 'admin') identifier = ADMIN_EMAIL;

    try {
        // 1. Resolve Identifier (Username/Email) via RPC
        const { data: userInfo, error: rpcError } = await supabase
            .rpc('get_login_info', { identifier: identifier });

        const isAdminEmail = identifier.toLowerCase() === ADMIN_EMAIL.toLowerCase();

        // 2. Logic Check User Existence
        if (!userInfo) {
            // Jika tidak ketemu di Profile, tapi input terlihat seperti email, 
            // kita biarkan lanjut ke Auth Supabase (siapa tahu profile belum sync)
            // Tapi jika input username, maka pasti gagal.
            if (!isAdminEmail && !identifier.includes('@')) {
                throw new Error("USERNAME_NOT_FOUND");
            }
        }

        // 3. Logic Check Status (Pending/Inactive) - Skip for Admin
        if (userInfo && userInfo.role !== 'admin' && !isAdminEmail) {
            if (userInfo.status === 'pending') {
                throw new Error("ACCOUNT_PENDING");
            }
            if (userInfo.status === 'inactive') {
                throw new Error("ACCOUNT_INACTIVE");
            }
        }

        // 4. Determine Email for Auth
        // Jika userInfo ada, pakai email dari userInfo (karena user mungkin input username)
        // Jika tidak ada (case admin atau error sync), pakai identifier asli
        const finalEmail = userInfo ? userInfo.email : identifier;

        // 5. Authenticate via Supabase Auth (Checks Password Hash)
        const { data, error } = await supabase.auth.signInWithPassword({
            email: finalEmail,
            password: passwordToLogin,
        });

        if (error) {
            // Handle specific Supabase auth errors
            if (error.message === 'Invalid login credentials') {
                throw new Error("INVALID_PASSWORD");
            }
            throw error; 
        }

        if (data && data.session) {
            const userId = data.user.id;
            
            // Auto-create Admin Profile if missing
            if (!userInfo && isAdminEmail) {
                await supabase.from('profiles').upsert({
                    id: userId,
                    email: ADMIN_EMAIL,
                    name: 'Super Admin',
                    username: 'admin',
                    role: 'admin',
                    status: 'active',
                    joined_date: new Date().toISOString(),
                    password_text: passwordToLogin
                });
            }
            
            // Update Last Login
            await supabase.from('profiles')
                .update({ last_login: new Date().toISOString() })
                .eq('id', userId);
            
            // Map Session to App User Object
            const user = await mapSessionToUser(data.session);
            if (!user) throw new Error("Gagal memuat data pengguna.");
            
            return user;
        }
    } catch (error: any) {
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'))) {
            throw new Error("CONNECTION_ERROR");
        }
        throw error;
    }
    
    throw new Error("Login gagal.");
};

export const saveUser = async (user: User) => {
    try {
        const { data: existingUser } = await supabase
            .rpc('get_login_info', { identifier: user.email });
        
        if (existingUser) throw new Error("Email ini sudah terdaftar.");

        const { data: existingUserByUsername } = await supabase
            .rpc('get_login_info', { identifier: user.username });

        if (existingUserByUsername) throw new Error("Username ini sudah digunakan.");

        const { data, error } = await supabase.auth.signUp({
            email: user.email,
            password: user.password || '123456',
            options: {
                data: {
                    name: user.name,
                    username: user.username,
                    password_text: user.password,
                    phone_number: user.phoneNumber
                }
            }
        });

        if (error) throw error;
        return data;
    } catch (error: any) {
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'))) {
            throw new Error("Koneksi gagal. Cek internet atau konfigurasi server.");
        }
        throw error;
    }
};

export const getUsers = async (): Promise<User[]> => {
    // METODE 1: Coba pakai RPC 'get_all_users_secure' (Paling Aman, Bypass RLS)
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_all_users_secure');

    if (!rpcError && rpcData) {
         return rpcData.map((p: any) => ({
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
    }

    // METODE 2: Fallback ke Select Biasa (Jika RPC belum di-run user)
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('joined_date', { ascending: false });
        
    if (error) {
        if (error.code === '42P17') {
            console.error("Critical RLS Error: Infinite Recursion Detected. Please Run SUPABASE_RECURSION_FIX.sql in Supabase SQL Editor.");
            return []; // Return empty agar UI tidak crash
        }
        throw error;
    }
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
};

export const updateUser = async (updatedUser: User) => {
    const { error } = await supabase
        .from('profiles')
        .update({
            name: updatedUser.name,
            username: updatedUser.username,
            status: updatedUser.status,
            role: updatedUser.role,
            password_text: updatedUser.password
        })
        .eq('id', updatedUser.id);
    if (error) throw error;
};

// --- FUNGSI UPDATE STATUS USER (PERBAIKAN) ---
export const updateUserStatus = async (userId: string, status: 'active' | 'pending') => {
    // METODE 1: Gunakan RPC Khusus Admin (Paling Kuat/Aman dari RLS)
    // Pastikan Anda sudah menjalankan SQL 'admin_update_user_status' di Supabase
    const { error: rpcError } = await supabase.rpc('admin_update_user_status', {
        target_user_id: userId,
        new_status: status
    });

    if (!rpcError) return; // Berhasil update via RPC

    // METODE 2: Fallback ke Update Biasa 
    // (Hanya berhasil jika Policy 'Admins update all profiles' sudah benar)
    console.warn("RPC update failed/missing, trying direct update...", rpcError);
    const { error } = await supabase
        .from('profiles')
        .update({ status: status })
        .eq('id', userId);

    if (error) throw error;
};
// ---------------------------------------------

export const updateAdminPassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
        password: newPassword
    });
    if (error) throw error;
    
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        await supabase.from('profiles').update({ password_text: newPassword }).eq('id', user.id);
    }
};

export const saveUserApiKey = async (userId: string, apiKey: string | null) => {
    const { error } = await supabase.from('profiles').update({ api_key: apiKey }).eq('id', userId);
    if (error) throw error; // Pastikan error dilempar agar UI tahu
};

export const incrementGenerationCount = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('generation_count').eq('id', userId).single();
    const current = data?.generation_count || 0;
    await supabase.from('profiles').update({ generation_count: current + 1 }).eq('id', userId);
};

export const deleteUser = async (id: string) => {
    // Note: Deleting from profiles will cascade delete from auth.users if configured, 
    // but usually standard Supabase flow requires calling auth.admin.deleteUser via Server Side.
    // For Client Side, we can only delete from public.profiles.
    // However, if we delete from profiles, the user cannot login due to checks in authenticate().
    await supabase.from('profiles').delete().eq('id', id);
};

export const saveHistory = async (
    userId: string, 
    data: GeneratedLessonPlan, 
    inputData: LessonIdentity,
    features: { rpp: boolean; materials: boolean; lkpd: boolean; assessment: boolean; questionBank: boolean }
): Promise<string | null> => {
    try {
        const { data: currentHistory, error: countError } = await supabase
            .from('generation_history')
            .select('id')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });

        if (countError) throw countError;

        if (currentHistory && currentHistory.length >= 10) {
            const oldestId = currentHistory[0].id;
            await supabase
                .from('generation_history')
                .delete()
                .eq('id', oldestId);
        }

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

export const getSettings = (): AppSettings => {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : DEFAULT_SETTINGS;
};

export const saveSettings = (settings: AppSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};
