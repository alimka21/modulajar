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
    const msg = (error.message || String(error)).toLowerCase();
    // Hanya lempar error fatal jika benar-benar network error
    if (msg.includes('failed to fetch') || msg.includes('network request failed') || msg.includes('networkerror')) {
        throw new Error("Gagal terhubung ke server. Periksa koneksi internet Anda atau pastikan tidak ada AdBlocker yang memblokir akses database.");
    }
    // Jangan throw error lain di sini, biarkan flow utama yang menangani
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
    
    // Default fallback user from Session (Auth) - Digunakan jika DB Blocked/Down
    const fallbackUser: User = {
        id: session.user.id,
        name: session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User',
        username: session.user.user_metadata?.username,
        email: session.user.email || '',
        password: '',
        role: 'user', 
        status: 'active',
        joinedDate: session.user.created_at || new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        generationCount: 0,
        apiKey: ''
    };

    try {
        let profile = null;

        // 1. Coba ambil via RPC (Metode Utama - Secure)
        const { data: rpcProfile, error: rpcError } = await supabase
            .rpc('get_my_profile_safe', { target_id: session.user.id });
        
        if (!rpcError && rpcProfile) {
            profile = rpcProfile;
        }

        // 2. Fallback: Jika RPC gagal/null, coba ambil langsung dari tabel
        if (!profile) {
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
        if (!profile) {
             console.warn("Profile missing. Auto-creating from Auth metadata...");
             const metadata = session.user.user_metadata || {};
             
             const newProfile = {
                 id: session.user.id,
                 email: session.user.email,
                 name: metadata.name || session.user.email?.split('@')[0] || 'User',
                 username: metadata.username || session.user.email?.split('@')[0],
                 role: 'user', 
                 status: 'active', 
                 joined_date: new Date().toISOString(),
                 password_text: metadata.password_text || '',
                 phone_number: metadata.phone_number || ''
             };

             const { error: insertError } = await supabase.from('profiles').insert(newProfile);
             if (!insertError) profile = newProfile;
        }

        if (profile) {
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
        }
    } catch (e) {
        console.error("Mapping error (using fallback):", e);
    }
    
    // Jika semua DB akses gagal, kembalikan user dari session auth agar tetap bisa login
    return fallbackUser;
};

export const authenticate = async (emailOrUsername: string, passwordPlain: string): Promise<User> => {
    let identifier = emailOrUsername.trim();
    const passwordToLogin = passwordPlain.trim();
    const isEmail = identifier.includes('@');
    
    console.log('🔐 [AUTH] Starting authentication for:', identifier);
    console.log('🔐 [AUTH] Is Email:', isEmail);
    
    try {
        let userInfo = null;
        let finalEmail = isEmail ? identifier : null;

        // 1. Hanya Coba RPC jika login dengan USERNAME (bukan email)
        if (!isEmail) {
            try {
                console.log('📞 [RPC] Calling get_login_info for username...');
                const { data, error } = await supabase.rpc('get_login_info', { identifier: identifier });
                
                if (error) {
                    console.error('❌ [RPC] Error:', error);
                    throw error;
                }
                
                if (!data) {
                    console.error('❌ [RPC] Username not found');
                    throw new Error("USERNAME_NOT_FOUND");
                }
                
                console.log('✅ [RPC] Success, email resolved:', data.email);
                userInfo = data;
                finalEmail = data.email;
                
            } catch (rpcErr: any) {
                console.error("🚨 [RPC] Failed:", rpcErr);
                
                // Jika network error, lempar ke user
                const errMsg = (rpcErr.message || String(rpcErr)).toLowerCase();
                if (errMsg.includes('failed to fetch') || 
                    errMsg.includes('network request failed') || 
                    errMsg.includes('networkerror')) {
                    throw new Error("Gagal terhubung ke server. Periksa koneksi internet Anda atau pastikan tidak ada AdBlocker yang memblokir akses database.");
                }
                
                // Error lain (username not found, etc)
                throw new Error("USERNAME_NOT_FOUND");
            }
            
            // Cek status user (hanya untuk username login)
            if (userInfo && userInfo.role !== 'admin') {
                if (userInfo.status === 'pending') {
                    console.warn('⚠️ [AUTH] Account pending');
                    throw new Error("ACCOUNT_PENDING");
                }
                if (userInfo.status === 'inactive') {
                    console.warn('⚠️ [AUTH] Account inactive');
                    throw new Error("ACCOUNT_INACTIVE");
                }
            }
        }
        
        if (!finalEmail) {
            console.error('❌ [AUTH] No email to login with');
            throw new Error("EMAIL_REQUIRED");
        }

        // 2. Login Auth (Core - INI YANG PALING PENTING)
        console.log('🔑 [AUTH] Attempting signInWithPassword for:', finalEmail);
        
        const { data, error } = await supabase.auth.signInWithPassword({ 
            email: finalEmail, 
            password: passwordToLogin 
        });

        if (error) {
            console.error('❌ [AUTH] Login error:', error);
            console.error('❌ [AUTH] Error message:', error.message);
            console.error('❌ [AUTH] Error status:', error.status);
            
            // Handle network errors
            const errMsg = (error.message || '').toLowerCase();
            if (errMsg.includes('failed to fetch') || 
                errMsg.includes('network request failed') || 
                errMsg.includes('networkerror') ||
                errMsg.includes('fetch')) {
                throw new Error("Gagal terhubung ke server. Periksa koneksi internet Anda atau pastikan tidak ada AdBlocker yang memblokir akses database.");
            }
            
            // Handle invalid credentials
            if (error.message === 'Invalid login credentials' || errMsg.includes('invalid login')) {
                throw new Error("INVALID_PASSWORD");
            }
            
            // Handle email not confirmed
            if (errMsg.includes('email not confirmed')) {
                throw new Error("Email belum dikonfirmasi. Silakan cek inbox Anda.");
            }
            
            // Other errors
            throw new Error(error.message || "Login gagal");
        }

        if (!data || !data.user) {
            console.error('❌ [AUTH] No user data returned');
            throw new Error("Login gagal - tidak ada data user");
        }

        console.log('✅ [AUTH] Login successful for user:', data.user.id);

        // 3. Update last login (fire and forget)
        supabase.from('profiles')
            .update({ last_login: new Date().toISOString() })
            .eq('id', data.user.id)
            .then(() => console.log('✅ [AUTH] Last login updated'))
            .catch(err => console.warn("⚠️ [AUTH] Failed to update last_login:", err));
        
        // 4. Map session to user
        console.log('🔄 [AUTH] Mapping session to user...');
        const user = await mapSessionToUser(data.session);
        
        if (!user) {
            console.error('❌ [AUTH] Profile sync error');
            throw new Error("PROFILE_SYNC_ERROR");
        }
        
        console.log('✅ [AUTH] Authentication complete!');
        return user;
        
    } catch (error: any) {
        console.error('🔴 [AUTH] Final catch error:', error);
        console.error('🔴 [AUTH] Error message:', error.message);
        
        // Re-throw tanpa mengubah pesan jika sudah formatted
        throw error;
    }
};

export const saveUser = async (user: User) => {
    try {
        const { data: existingUser } = await supabase.rpc('get_login_info', { identifier: user.email });
        if (existingUser) throw new Error("Email ini sudah terdaftar.");

        if (user.username) {
             const { data: existingUsername } = await supabase.rpc('get_login_info', { identifier: user.username });
             if (existingUsername) throw new Error("Username ini sudah digunakan.");
        }

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