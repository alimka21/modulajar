
import { User, AppSettings, GeneratedLessonPlan, LessonIdentity, HistoryItem } from '../types';
import { supabase } from '../lib/supabaseClient';

const SETTINGS_KEY = 'pakar_settings';
const DRAFT_KEY = 'pakar_draft_workspace'; 

// Helper untuk membaca env var dengan aman (Anti-Error TypeScript Vercel)
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

const ADMIN_EMAIL = getEnv('VITE_ADMIN_EMAIL', 'alimkamcl@gmail.com');

const DEFAULT_SETTINGS: AppSettings = {
    promoLink: 'https://instagram.com/muh.alimka',
    whatsappNumber: '6282335454864',
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

export const mapSessionToUser = async (session: any): Promise<User | null> => {
    if (!session || !session.user) return null;
    try {
        let profile = null;

        // 1. Coba ambil via RPC (Metode Utama - Secure)
        const { data: rpcProfile, error: rpcError } = await supabase
            .rpc('get_my_profile_safe', { target_id: session.user.id });
        
        profile = rpcProfile;

        // 2. Fallback: Jika RPC gagal/null (karena RLS/Latency), coba ambil langsung dari tabel
        if (!profile) {
            console.warn("RPC Profile fetch returned null, trying direct select fallback...");
            const { data: directProfile, error: directError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();
            
            if (!directError && directProfile) {
                profile = directProfile;
            }
        }

        // 3. AUTO-HEAL: Jika profile masih null, buat profile baru dari data session Auth
        // Ini memperbaiki error "Data Profil Rusak" jika data auth ada tapi profiles hilang.
        if (!profile) {
             console.warn("Profile missing in DB. Auto-creating profile from Auth metadata...");
             const metadata = session.user.user_metadata || {};
             
             // Prepare payload
             const newProfile = {
                 id: session.user.id,
                 email: session.user.email,
                 name: metadata.name || session.user.email?.split('@')[0] || 'User',
                 username: metadata.username || session.user.email?.split('@')[0],
                 role: 'user', // Default role
                 status: 'active', // Auto-activate for existing auth users to prevent lockout
                 joined_date: new Date().toISOString(),
                 password_text: metadata.password_text || '',
                 phone_number: metadata.phone_number || ''
             };

             // Insert to Supabase
             const { error: insertError } = await supabase.from('profiles').insert(newProfile);
             
             if (!insertError) {
                 profile = newProfile;
             } else {
                 console.error("Failed to auto-create profile:", insertError);
             }
        }

        if (!profile) {
            console.warn("Profile not found via RPC, Direct Select, or Auto-Heal.");
            return null;
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

export const authenticate = async (emailOrUsername: string, passwordPlain: string): Promise<User> => {
    let identifier = emailOrUsername.trim();
    const passwordToLogin = passwordPlain.trim();
    
    try {
        const { data: userInfo } = await supabase.rpc('get_login_info', { identifier: identifier });

        // Jika user tidak ditemukan via RPC dan identifier bukan email, error
        if (!userInfo && !identifier.includes('@')) throw new Error("USERNAME_NOT_FOUND");

        // Cek status jika user ditemukan via RPC
        if (userInfo && userInfo.role !== 'admin') {
            if (userInfo.status === 'pending') throw new Error("ACCOUNT_PENDING");
            if (userInfo.status === 'inactive') throw new Error("ACCOUNT_INACTIVE");
        }

        // Tentukan email target (dari RPC atau input langsung)
        const finalEmail = userInfo ? userInfo.email : identifier;
        
        // Login Auth
        const { data, error } = await supabase.auth.signInWithPassword({ email: finalEmail, password: passwordToLogin });

        if (error) throw new Error(error.message === 'Invalid login credentials' ? "INVALID_PASSWORD" : error.message);

        if (data.user) {
            // Update last login (ignore error if profile missing, mapped user creation will handle it)
            await supabase.from('profiles').update({ last_login: new Date().toISOString() }).eq('id', data.user.id);
            
            const user = await mapSessionToUser(data.session);
            
            // Critical Check: Jika login Auth sukses tapi User object null, berarti Profile Database rusak/mismatch
            if (!user) throw new Error("PROFILE_SYNC_ERROR");
            
            return user;
        }
    } catch (error: any) {
        handleNetworkError(error);
        throw error;
    }
    throw new Error("Login gagal.");
};

export const saveUser = async (user: User) => {
    try {
        const { data: existingUser } = await supabase.rpc('get_login_info', { identifier: user.email });
        if (existingUser) throw new Error("Email ini sudah terdaftar.");

        const { data: existingUsername } = await supabase.rpc('get_login_info', { identifier: user.username });
        if (existingUsername) throw new Error("Username ini sudah digunakan.");

        const { data, error } = await supabase.auth.signUp({
            email: user.email,
            password: user.password || '123456',
            options: {
                data: { name: user.name, username: user.username, password_text: user.password, phone_number: user.phoneNumber }
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
        const { data } = await supabase.from('profiles').select('generation_count').eq('id', userId).single();
        const current = data?.generation_count || 0;
        await supabase.from('profiles').update({ generation_count: current + 1 }).eq('id', userId);
    } catch (e) { }
};

export const saveHistory = async (userId: string, data: GeneratedLessonPlan, inputData: LessonIdentity, features: any): Promise<string | null> => {
    try {
        const MAX_HISTORY = 3; // BATAS MAKSIMAL RIWAYAT PER USER

        // 1. Ambil riwayat yang ada, urutkan dari yang paling lama (ascending)
        const { data: currentHistory } = await supabase
            .from('generation_history')
            .select('id')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });

        // 2. Jika jumlah riwayat sudah mencapai batas (atau lebih), hapus yang paling lama
        if (currentHistory && currentHistory.length >= MAX_HISTORY) {
            // Hitung berapa yang harus dihapus agar tersisa (MAX_HISTORY - 1) untuk slot baru
            const itemsToDeleteCount = currentHistory.length - MAX_HISTORY + 1;
            
            // Ambil ID item-item terlama
            const idsToDelete = currentHistory.slice(0, itemsToDeleteCount).map(item => item.id);
            
            if (idsToDelete.length > 0) {
                 await supabase.from('generation_history').delete().in('id', idsToDelete);
            }
        }

        // 3. Simpan riwayat baru
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
