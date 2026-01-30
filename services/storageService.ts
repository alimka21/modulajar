
import { User, AppSettings, GeneratedLessonPlan, LessonIdentity, HistoryItem } from '../types';
import { supabase } from '../lib/supabaseClient';

const SETTINGS_KEY = 'pakar_settings';
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

export const mapSessionToUser = async (session: any): Promise<User | null> => {
    if (!session || !session.user) return null;
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

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
    let emailToLogin = emailOrUsername.trim();
    let passwordToLogin = passwordPlain.trim();
    let isUsernameLogin = !emailToLogin.includes('@');

    if (isUsernameLogin) {
        const { data: profileByUsername } = await supabase
            .from('profiles')
            .select('email')
            .eq('username', emailToLogin)
            .maybeSingle();

        if (!profileByUsername) {
            if (emailToLogin.toLowerCase() === 'admin') emailToLogin = ADMIN_EMAIL;
            else throw new Error("USERNAME_NOT_FOUND");
        } else {
            emailToLogin = profileByUsername.email;
        }
    }

    const { data: profileCheck } = await supabase
        .from('profiles')
        .select('id, email, status')
        .eq('email', emailToLogin)
        .maybeSingle();

    const isAdmin = emailToLogin.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (!profileCheck && !isAdmin) throw new Error("EMAIL_NOT_FOUND");

    const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToLogin,
        password: passwordToLogin,
    });

    if (error) throw new Error("INVALID_PASSWORD");

    if (data && data.session) {
        const userId = data.user.id;
        if (!profileCheck && isAdmin) {
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
        supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', userId).then(() => {});
        const user = await mapSessionToUser(data.session);
        if (!user) throw new Error("Gagal memuat data pengguna.");
        return user;
    }
    throw new Error("Login gagal.");
};

export const saveUser = async (user: User) => {
    const { data: existingUsers } = await supabase
        .from('profiles')
        .select('email, username')
        .or(`email.eq.${user.email},username.eq.${user.username}`);

    if (existingUsers && existingUsers.length > 0) {
        const match = existingUsers[0];
        if (match.email === user.email) throw new Error("Email ini sudah terdaftar.");
        if (match.username === user.username) throw new Error("Username ini sudah digunakan.");
    }

    const { data, error } = await supabase.auth.signUp({
        email: user.email,
        password: user.password || '123456',
        options: {
            data: {
                name: user.name,
                username: user.username,
                password_text: user.password
            }
        }
    });

    if (error) throw error;
    return data;
};

export const getUsers = async (): Promise<User[]> => {
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
};

export const updateUser = async (updatedUser: User) => {
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
};

export const saveUserApiKey = async (userId: string, apiKey: string | null) => {
    const { error } = await supabase.from('profiles').update({ api_key: apiKey }).eq('id', userId);
    if (error) throw error;
};

export const incrementGenerationCount = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('generation_count').eq('id', userId).single();
    const current = data?.generation_count || 0;
    await supabase.from('profiles').update({ generation_count: current + 1 }).eq('id', userId);
};

export const deleteUser = async (id: string) => {
    await supabase.from('profiles').delete().eq('id', id);
};

// --- HISTORY MANAGEMENT (WITH 10 LIMIT) ---

export const saveHistory = async (
    userId: string, 
    data: GeneratedLessonPlan, 
    inputData: LessonIdentity,
    features: { rpp: boolean; materials: boolean; lkpd: boolean; assessment: boolean; questionBank: boolean }
): Promise<string | null> => {
    try {
        // 1. Cek jumlah riwayat saat ini
        const { data: currentHistory, error: countError } = await supabase
            .from('generation_history')
            .select('id')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });

        if (countError) throw countError;

        // 2. Jika sudah mencapai 10, hapus yang paling lama (FIFO)
        if (currentHistory && currentHistory.length >= 10) {
            const oldestId = currentHistory[0].id;
            await supabase
                .from('generation_history')
                .delete()
                .eq('id', oldestId);
        }

        // 3. Simpan data baru
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
