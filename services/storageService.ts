
import { User, AppSettings, GeneratedLessonPlan, LessonIdentity, HistoryItem } from '../types';
import { supabase } from '../lib/supabaseClient';

const SETTINGS_KEY = 'pakar_settings';
const DRAFT_KEY = 'pakar_draft_workspace'; 

// Helper untuk membaca env var dengan aman
const getEnv = (key: string, fallback: string) => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
      return (import.meta as any).env[key];
    }
  } catch (e) { }

  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) { }

  return fallback;
};

const DEFAULT_SETTINGS: AppSettings = {
    promoLink: 'https://instagram.com/muh.alimka',
    whatsappNumber: '6285191537712', // UPDATED NUMBER
    socialMediaLink: 'https://instagram.com/muh.alimka'
};

const handleNetworkError = (error: any) => {
    if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'))) {
        throw new Error("Gagal terhubung ke server. Periksa koneksi internet Anda.");
    }
    throw error;
};

export const initializeStorage = () => {
    if (!localStorage.getItem(SETTINGS_KEY)) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    }
};

export const saveDraft = (data: { lessonIdentity: LessonIdentity, generatedPlan: GeneratedLessonPlan | null, historyId: string | null }) => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch (e) { console.error("Failed to save draft:", e); }
};

export const getDraft = () => {
    try { const data = localStorage.getItem(DRAFT_KEY); return data ? JSON.parse(data) : null; } catch (e) { return null; }
};

export const clearDraft = () => { localStorage.removeItem(DRAFT_KEY); };

// OPTIMIZED: Direct Select Profile (No RPC overhead)
export const mapSessionToUser = async (session: any): Promise<User | null> => {
    if (!session || !session.user) return null;
    try {
        // 1. Langsung ambil data dari tabel 'profiles' (Cepat & Efisien)
        // Trigger server-side menjamin data ini ada saat signup.
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (error || !profile) {
            console.warn("Profile fetch failed, attempting auto-recovery from Auth Metadata...");
            // Fallback: Jika profile belum terbuat (race condition trigger), gunakan metadata Auth
            const metadata = session.user.user_metadata || {};
            return {
                id: session.user.id,
                email: session.user.email || '',
                name: metadata.name || session.user.email?.split('@')[0],
                username: metadata.username || session.user.email?.split('@')[0],
                password: metadata.password_text || '',
                role: 'user',
                status: 'active', // Assume active if auth passed to prevent lockout
                joinedDate: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
                generationCount: 0,
                apiKey: ''
            };
        }

        return {
            id: session.user.id,
            name: profile.name || session.user.email?.split('@')[0],
            username: profile.username,
            email: session.user.email || '',
            password: profile.password_text || '', 
            role: profile.role || 'user',
            status: profile.status || 'pending',
            joinedDate: profile.joined_date,
            lastLogin: profile.last_login,
            generationCount: profile.generation_count || 0,
            apiKey: profile.api_key || '' 
        };
    } catch (e) {
        console.error("Mapping error:", e);
        return null;
    }
};

// OPTIMIZED: Streamlined Authentication Flow
export const authenticate = async (emailOrUsername: string, passwordPlain: string): Promise<User> => {
    let email = emailOrUsername.trim();
    const password = passwordPlain.trim();
    
    try {
        // 1. Resolve Email jika user input Username
        if (!email.includes('@')) {
            const { data: userProfile } = await supabase
                .from('profiles')
                .select('email')
                .eq('username', email)
                .single();
            
            if (!userProfile) throw new Error("USERNAME_NOT_FOUND");
            email = userProfile.email;
        }

        // 2. Direct Auth Login (Validasi Password ditangani Supabase)
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (authError) {
            throw new Error(authError.message === 'Invalid login credentials' ? "INVALID_PASSWORD" : authError.message);
        }

        if (!authData.user) throw new Error("Login failed (No Session)");

        // 3. Ambil Profile (Paralel update last_login agar user tidak menunggu)
        const [profileResult, _] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', authData.user.id).single(),
            supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', authData.user.id)
        ]);

        const profile = profileResult.data;

        // 4. Validasi Status (Client-Side Check)
        if (profile) {
            if (profile.role !== 'admin') {
                if (profile.status === 'pending') {
                    // STRICT: Force logout if pending so AuthContext doesn't pick it up
                    await supabase.auth.signOut();
                    throw new Error("ACCOUNT_PENDING");
                }
                if (profile.status === 'inactive') {
                    // STRICT: Force logout if inactive
                    await supabase.auth.signOut();
                    throw new Error("ACCOUNT_INACTIVE");
                }
            }
            
            // Map result
            return {
                id: authData.user.id,
                name: profile.name,
                username: profile.username,
                email: authData.user.email || '',
                password: profile.password_text,
                role: profile.role,
                status: profile.status,
                joinedDate: profile.joined_date,
                lastLogin: profile.last_login,
                generationCount: profile.generation_count,
                apiKey: profile.api_key
            };
        } else {
            // Jika profile null tapi auth sukses (Kasus sangat jarang)
            throw new Error("PROFILE_SYNC_ERROR");
        }

    } catch (error: any) {
        handleNetworkError(error);
        throw error;
    }
};

export const saveUser = async (user: User) => {
    try {
        // Cek duplikasi email/username via select cepat (bukan RPC)
        const { data: existingUser } = await supabase
            .from('profiles')
            .select('email')
            .or(`email.eq.${user.email},username.eq.${user.username}`)
            .maybeSingle();

        if (existingUser) {
             throw new Error("Email atau Username sudah terdaftar.");
        }

        // Sign Up - Trigger Database akan menangani pembuatan profile
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
        handleNetworkError(error);
        throw error;
    }
};

export const getUsers = async (): Promise<User[]> => {
    try {
        // Admin Dashboard tetap butuh RPC untuk bypass RLS read-all
        const { data, error } = await supabase.rpc('get_all_users_secure');
        if (error) throw error;
        return (data || []).map((p: any) => ({
            id: p.id, name: p.name, username: p.username, email: p.email, password: p.password_text, 
            role: p.role, status: p.status, joinedDate: p.joined_date, lastLogin: p.last_login,
            generationCount: p.generation_count, apiKey: p.api_key
        }));
    } catch (e: any) {
        console.error("Get Users Error:", e);
        return [];
    }
};

export const updateUser = async (updatedUser: User) => {
    try {
        const { error } = await supabase.from('profiles').update({
                name: updatedUser.name, username: updatedUser.username, status: updatedUser.status,
                role: updatedUser.role, password_text: updatedUser.password
            }).eq('id', updatedUser.id);
        if (error) throw error;
    } catch (e) { handleNetworkError(e); }
};

export const updateUserStatus = async (userId: string, status: 'active' | 'pending') => {
    try {
        const { error } = await supabase.rpc('admin_update_user_status', { target_user_id: userId, new_status: status });
        if (error) throw error;
    } catch (error: any) { handleNetworkError(error); }
};

export const deleteUser = async (id: string) => {
    try {
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (error) throw error;
    } catch (e) { handleNetworkError(e); }
};

export const getSettings = (): AppSettings => {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : DEFAULT_SETTINGS;
};

export const saveSettings = (settings: AppSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const updateAdminPassword = async (newPassword: string) => {
    try {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('profiles').update({ password_text: newPassword }).eq('id', user.id);
    } catch (e) { handleNetworkError(e); }
};

export const getAllGenerationStats = async (): Promise<string[]> => {
    try {
        const { data, error } = await supabase.from('generation_history').select('created_at').order('created_at', { ascending: true });
        if (error) return [];
        return data.map((d: any) => d.created_at);
    } catch (e) { return []; }
};

export const incrementGenerationCount = async (userId: string) => {
    try {
        // Atomic increment (jika database mendukung) atau fetch-update
        const { data } = await supabase.from('profiles').select('generation_count').eq('id', userId).single();
        const current = data?.generation_count || 0;
        await supabase.from('profiles').update({ generation_count: current + 1 }).eq('id', userId);
    } catch (e) { }
};

export const saveHistory = async (userId: string, data: GeneratedLessonPlan, inputData: LessonIdentity, features: any): Promise<string | null> => {
    try {
        const MAX_HISTORY = 3;
        const { data: currentHistory } = await supabase
            .from('generation_history')
            .select('id')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });

        if (currentHistory && currentHistory.length >= MAX_HISTORY) {
            const itemsToDeleteCount = currentHistory.length - MAX_HISTORY + 1;
            const idsToDelete = currentHistory.slice(0, itemsToDeleteCount).map(item => item.id);
            if (idsToDelete.length > 0) {
                 await supabase.from('generation_history').delete().in('id', idsToDelete);
            }
        }

        const { data: result, error } = await supabase.from('generation_history').insert({
                user_id: userId, 
                subject: inputData.subject, 
                grade: inputData.grade, 
                topic: inputData.topic,
                features: features, 
                full_data: data, 
                input_data: inputData
            }).select().single();

        if (error) throw error;
        return result.id;
    } catch (err) { 
        console.error("Save History Error:", err);
        return null; 
    }
};

export const updateHistory = async (historyId: string, data: GeneratedLessonPlan, features: any) => {
    try { await supabase.from('generation_history').update({ full_data: data, features: features }).eq('id', historyId); } catch (err) { }
};

export const getHistory = async (userId: string): Promise<HistoryItem[]> => {
    try {
        const { data, error } = await supabase.from('generation_history').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (error) throw error;
        return data as HistoryItem[];
    } catch (err) { return []; }
};

export const saveUserApiKey = async (userId: string, apiKey: string | null) => {
    try { 
        const { error } = await supabase.from('profiles').update({ api_key: apiKey }).eq('id', userId);
        if (error) throw error;
    } catch (e) {
        handleNetworkError(e);
        throw e; 
    }
};
