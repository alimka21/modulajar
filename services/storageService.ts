
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
        const cleanEmail = (user.email || '').trim().toLowerCase();
        const cleanUsername = (user.username || user.email.split('@')[0] || '').trim().toLowerCase();
        const targetStatus = (user.status || 'pending').toLowerCase() as 'active' | 'pending';

        // 1. Cek duplikasi email/username di tabel profiles (pencarian case-insensitive)
        const { data: existingUser } = await supabase
            .from('profiles')
            .select('id, email, username, name, status, role')
            .or(`email.ilike.${cleanEmail},username.ilike.${cleanUsername}`)
            .maybeSingle();

        if (existingUser) {
             const statusLabel = existingUser.status === 'active' ? 'Pengguna Aktif' : 'Antrian Aktivasi';
             throw new Error(`Email atau Username sudah terdaftar atas nama "${existingUser.name || existingUser.email}" di tab "${statusLabel}". Silakan periksa atau cari di tab Semua Pengguna.`);
        }

        // 2. Sign Up - Daftarkan akun ke Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email: cleanEmail,
            password: user.password || '123456',
            options: {
                data: { 
                    name: user.name, 
                    username: cleanUsername, 
                    password_text: user.password, 
                    phone_number: user.phoneNumber || '',
                    status: targetStatus
                }
            }
        });

        if (error) {
            // Deteksi jika email ini ternyata ada di auth.users (tertinggal saat hapus lama atau gagal sinkron)
            if (error.message.includes('User already registered') || error.message.includes('already exists')) {
                // Coba pulihkan ke tabel profiles secara otomatis
                try {
                    await syncOrphanedUsers();
                    const { data: recovered } = await supabase
                        .from('profiles')
                        .select('*')
                        .ilike('email', cleanEmail)
                        .maybeSingle();

                    if (recovered) {
                        // Update profil dengan identitas baru & aktifkan
                        await supabase.from('profiles').update({
                            name: user.name,
                            username: cleanUsername,
                            password_text: user.password,
                            status: targetStatus
                        }).eq('id', recovered.id);

                        return { user: recovered, recovered: true };
                    }
                } catch (recErr) {
                    console.warn("Gagal auto-recover:", recErr);
                }

                throw new Error(`Email "${cleanEmail}" sebelumnya sudah tercatat di sistem Auth. Silakan klik tombol 'Sinkron & Pulihkan Akun' di tabel pengguna untuk memulihkan akun ini ke daftar.`);
            }
            throw error;
        }

        // 3. Jika status target adalah 'active' dan ID akun tersedia, pastikan langsung diaktifkan di tabel profiles
        if (data?.user?.id && targetStatus === 'active') {
            try {
                // Beri jeda sangat singkat agar trigger insert selesai
                setTimeout(async () => {
                    await supabase.from('profiles').update({
                        status: 'active',
                        role: user.role || 'user',
                        password_text: user.password
                    }).eq('id', data.user!.id);
                }, 400);
            } catch (upErr) {
                console.warn("Auto-activate profile error:", upErr);
            }
        }

        return data;
    } catch (error: any) {
        handleNetworkError(error);
        throw error;
    }
};

export const getUsers = async (): Promise<User[]> => {
    try {
        let rawUsers: any[] = [];
        const PAGE_SIZE = 1000;
        let from = 0;
        let hasMore = true;

        // Loop pagination otomatis untuk mengambil SEMUA user tanpa terpotong limit 1.000 PostgREST
        while (hasMore) {
            const to = from + PAGE_SIZE - 1;
            let batchData: any[] | null = null;

            // 1. Coba ambil batch via RPC get_all_users_secure
            try {
                const { data: rpcData, error: rpcError } = await supabase
                    .rpc('get_all_users_secure')
                    .range(from, to);
                
                if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
                    batchData = rpcData;
                }
            } catch (e) {
                // Abaikan error RPC, lanjut ke fallback
            }

            // 2. Jika RPC tidak mengembalikan data, coba direct select dari tabel profiles
            if (!batchData || batchData.length === 0) {
                try {
                    const { data: directData, error: directError } = await supabase
                        .from('profiles')
                        .select('*')
                        .order('joined_date', { ascending: false })
                        .range(from, to);
                    
                    if (!directError && Array.isArray(directData) && directData.length > 0) {
                        batchData = directData;
                    }
                } catch (e) {
                    // Selesai jika gagal
                }
            }

            if (batchData && batchData.length > 0) {
                rawUsers = rawUsers.concat(batchData);
                // Jika data yang didapat lebih sedikit dari PAGE_SIZE (1000), berarti sudah mencapai halaman terakhir
                if (batchData.length < PAGE_SIZE) {
                    hasMore = false;
                } else {
                    from += PAGE_SIZE; // Ambil halaman berikutnya (1000..1999, dst.)
                }
            } else {
                hasMore = false;
            }

            // Batas keamanan agar tidak infinite loop (hingga 50.000 user)
            if (from > 50000) {
                break;
            }
        }

        // 3. Normalisasi data dengan pencegahan error null/undefined
        return rawUsers.map((p: any) => {
            const email = (p.email || '').trim();
            const fallbackName = email ? email.split('@')[0] : 'Pengguna';
            const rawStatus = (p.status || 'pending').toString().toLowerCase();

            return {
                id: p.id,
                name: (p.name && p.name.trim()) ? p.name.trim() : fallbackName,
                username: (p.username && p.username.trim()) ? p.username.trim() : fallbackName,
                email: email,
                password: p.password_text || '',
                role: (p.role || 'user').toLowerCase(),
                status: (rawStatus === 'active' ? 'active' : 'pending') as 'active' | 'pending',
                joinedDate: p.joined_date || new Date().toISOString(),
                lastLogin: p.last_login || '',
                generationCount: typeof p.generation_count === 'number' ? p.generation_count : 0,
                apiKey: p.api_key || ''
            };
        });
    } catch (e: any) {
        console.error("Get Users Error:", e);
        return [];
    }
};

export const syncOrphanedUsers = async (): Promise<{ count: number; message: string }> => {
    try {
        const { data, error } = await supabase.rpc('sync_orphaned_users');
        if (!error && typeof data === 'number') {
            return {
                count: data,
                message: data > 0 
                    ? `Sinkronisasi berhasil! ${data} akun yang tersimpan di sistem Auth berhasil dipulihkan ke daftar profil.` 
                    : `Semua akun sudah tersinkronisasi dengan baik antara sistem Autentikasi dan Profil.`
            };
        }
    } catch (e) {
        console.warn("Fungsi sync_orphaned_users belum terpasang di database:", e);
    }

    return { 
        count: 0, 
        message: "Pemeriksaan selesai. Jika masih ada akun auth yang belum muncul, jalankan script SQL di file SUPABASE_FIX_USERS_AND_SYNC.sql pada Supabase SQL Editor." 
    };
};

export const updateUser = async (updatedUser: User) => {
    try {
        // 1. Update data profil di tabel profiles
        const { error } = await supabase.from('profiles').update({
                name: updatedUser.name, 
                username: updatedUser.username, 
                status: updatedUser.status,
                role: updatedUser.role, 
                password_text: updatedUser.password
            }).eq('id', updatedUser.id);
        if (error) throw error;

        // 2. Jika password diisi, sinkronkan juga ke auth.users agar password login benar-benar terupdate
        if (updatedUser.password && updatedUser.password.length >= 6) {
            try {
                await supabase.rpc('admin_set_user_password', {
                    target_user_id: updatedUser.id,
                    new_password: updatedUser.password
                });
            } catch (authErr) {
                console.warn("RPC admin_set_user_password belum dipasang di database:", authErr);
            }
        }
    } catch (e) { handleNetworkError(e); }
};

export const updateUserStatus = async (userId: string, status: 'active' | 'pending') => {
    try {
        // Coba lewat RPC admin_update_user_status (Bypass RLS)
        const { error } = await supabase.rpc('admin_update_user_status', { target_user_id: userId, new_status: status });
        if (error) {
            // Fallback direct update jika RPC bermasalah
            const { error: directErr } = await supabase.from('profiles').update({ status }).eq('id', userId);
            if (directErr) throw directErr;
        }
    } catch (error: any) { handleNetworkError(error); }
};

export const deleteUser = async (id: string) => {
    try {
        // 1. Coba hapus menyeluruh dari auth.users & profiles via RPC
        try {
            const { error: rpcErr } = await supabase.rpc('admin_delete_user', { target_user_id: id });
            if (!rpcErr) return;
        } catch (e) {
            console.warn("RPC admin_delete_user belum dipasang, fallback ke delete profiles:", e);
        }

        // 2. Fallback: Hapus dari tabel profiles
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

export const saveHistory = async (userId: string, data: GeneratedLessonPlan, inputData: LessonIdentity, features: any, userRole?: string): Promise<string | null> => {
    try {
        // 1. CEK DUPLIKASI (Berdasarkan Topik, Kelas, Mapel)
        // Jika user generate ulang modul yang sama, kita update saja entry yang lama
        // agar history tidak penuh dengan item yang identik, dan naikkan ke posisi teratas.
        const { data: existingItem } = await supabase
            .from('generation_history')
            .select('id')
            .eq('user_id', userId)
            .eq('subject', inputData.subject)
            .eq('grade', inputData.grade)
            .eq('topic', inputData.topic)
            .maybeSingle();

        if (existingItem) {
            // Update timestamp ke 'now()' agar naik ke urutan pertama (Recent)
            // Update data konten jika ada perubahan (misal regenerate bagian tertentu)
            await supabase
                .from('generation_history')
                .update({ 
                    created_at: new Date().toISOString(),
                    full_data: data,
                    features: features,
                    input_data: inputData
                })
                .eq('id', existingItem.id);
                
            return existingItem.id;
        }

        // 2. JIKA DATA BARU, CEK LIMIT (Max 10 untuk non-admin)
        if (userRole !== 'admin') {
            const MAX_HISTORY = 10; 
            const { data: currentHistory } = await supabase
                .from('generation_history')
                .select('id')
                .eq('user_id', userId)
                .order('created_at', { ascending: true }); // Oldest first

            if (currentHistory && currentHistory.length >= MAX_HISTORY) {
                // Hapus yang terlama untuk memberi ruang
                const itemsToDeleteCount = currentHistory.length - MAX_HISTORY + 1;
                const idsToDelete = currentHistory.slice(0, itemsToDeleteCount).map(item => item.id);
                if (idsToDelete.length > 0) {
                     await supabase.from('generation_history').delete().in('id', idsToDelete);
                }
            }
        }

        // 3. INSERT DATA BARU
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

export const getHistory = async (userId: string, userRole?: string): Promise<HistoryItem[]> => {
    try {
        let query = supabase.from('generation_history').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        if (userRole !== 'admin') {
            query = query.limit(10);
        }
        const { data, error } = await query;
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
