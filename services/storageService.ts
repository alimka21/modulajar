
import { User, AppSettings, GeneratedLessonPlan, LessonIdentity, HistoryItem } from '../types';
import { supabase } from '../lib/supabaseClient';

const USERS_KEY = 'pakar_users';
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

// --- AUTHENTICATION VIA SUPABASE ---

export const authenticate = async (email: string, passwordPlain: string): Promise<User | null> => {
    // 1. Attempt Supabase Login
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: passwordPlain,
        });

        if (error) {
            throw error;
        }

        if (data && data.user) {
            const adminEmail = process.env.VITE_ADMIN_EMAIL || 'alimka21@gmail.com';
            const role = data.user.email === adminEmail ? 'admin' : 'user';
            
            // Get Metadata from Cloud (Supabase)
            const meta = data.user.user_metadata || {};
            const cloudGenCount = meta.generationCount !== undefined ? parseInt(meta.generationCount) : 0;
            const newLastLogin = new Date().toISOString();

            // Update Last Login to Supabase Cloud immediately
            await supabase.auth.updateUser({
                data: { lastLogin: newLastLogin }
            });

            const user: User = {
                id: data.user.id,
                name: meta.name || email.split('@')[0],
                username: meta.username || email.split('@')[0],
                email: data.user.email || '',
                role: role,
                status: 'active',
                joinedDate: data.user.created_at,
                lastLogin: newLastLogin,
                generationCount: cloudGenCount // Use Cloud Data
            };

            // Sync to Local Storage
            syncUserToLocal(user);

            // Return the user object
            return user;
        }
    } catch (err: any) {
        const msg = err?.message || String(err);
        console.warn("Supabase Auth skipped or failed:", msg);
    }

    // 2. CHECK LOCAL STORAGE (Fallback / Offline / Simulation)
    const users = getUsers();
    const localUser = users.find(u => 
        (u.email.toLowerCase() === email.toLowerCase() || (u.username && u.username.toLowerCase() === email.toLowerCase())) && 
        u.password === passwordPlain
    );

    if (localUser) {
        // Update Local Login Time
        const updatedUser = { ...localUser, lastLogin: new Date().toISOString() };
        updateUser(updatedUser);
        return updatedUser;
    }

    // 3. HARDCODED ADMIN FALLBACK
    if ((email === 'alimka21' || email === 'alimka21@gmail.com') && passwordPlain === 'alimka21') {
        const devAdmin: User = {
            id: 'dev-admin-local',
            name: 'Administrator (Local)',
            username: 'admin',
            email: 'alimka21@gmail.com',
            role: 'admin',
            status: 'active',
            joinedDate: new Date().toISOString(),
            lastLogin: new Date().toISOString(),
            generationCount: 0
        };
        syncUserToLocal(devAdmin);
        return devAdmin;
    }

    return null;
};

// --- RESTORE SESSION ON RELOAD ---
export const restoreSession = async (): Promise<User | null> => {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (session && session.user) {
             const adminEmail = process.env.VITE_ADMIN_EMAIL || 'alimka21@gmail.com';
             const role = session.user.email === adminEmail ? 'admin' : 'user';
             const meta = session.user.user_metadata || {};
             
             return {
                id: session.user.id,
                name: meta.name || session.user.email?.split('@')[0] || 'User',
                username: meta.username,
                email: session.user.email || '',
                role: role,
                status: 'active',
                joinedDate: session.user.created_at,
                lastLogin: meta.lastLogin || new Date().toISOString(),
                generationCount: meta.generationCount ? parseInt(meta.generationCount) : 0
             };
        }
    } catch (e) {
        console.warn("Restore session failed", e);
    }
    
    // Fallback: Check if we have a simulated user in localStorage that shouldn't expire (dev only)
    // Note: For production security, better to rely on Supabase only.
    return null;
};

export const saveUser = async (user: User) => {
    // Initialize generation count for new users
    const userWithDefaults = { 
        ...user, 
        generationCount: 0,
        lastLogin: '' 
    };

    try {
        // 1. Register in Supabase & Save Metadata to Cloud
        const { data, error } = await supabase.auth.signUp({
            email: userWithDefaults.email,
            password: userWithDefaults.password || '123456',
            options: {
                data: {
                    name: userWithDefaults.name,
                    username: userWithDefaults.username,
                    generationCount: 0, // Save initial count to cloud
                    lastLogin: ''
                }
            }
        });

        if (error) throw error;

        if (data.user) {
             // Success: Sync to Local
             const newUser = { ...userWithDefaults, id: data.user.id }; 
             syncUserToLocal(newUser);
        }
        
        return data;
    } catch (err: any) {
        const msg = (err?.message || String(err)).toLowerCase();
        
        const shouldFallback = 
            msg.includes('fetch') || 
            msg.includes('url') || 
            msg.includes('apikey') || 
            msg.includes('network') ||
            msg.includes('connection') ||
            msg.includes('invalid') || 
            msg.includes('password') || 
            msg.includes('security') ||
            msg.includes('rate limit');

        if (shouldFallback) {
             console.warn(`Supabase error (${msg}). Falling back to local storage.`);
             const mockUser = { ...userWithDefaults, id: `mock-${Date.now()}` }; 
             syncUserToLocal(mockUser);
             return { user: mockUser, session: null };
        }
        
        throw new Error(err?.message || "Gagal mendaftar ke server.");
    }
};

// --- HISTORY MANAGEMENT (SUPABASE) ---

export const saveHistory = async (
    userId: string, 
    data: GeneratedLessonPlan, 
    inputData: LessonIdentity,
    features: { rpp: boolean; materials: boolean; lkpd: boolean; assessment: boolean; questionBank: boolean }
): Promise<string | null> => {
    try {
        // Insert new record
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
        return null; // Fail silently or handle UI error
    }
};

export const updateHistory = async (
    historyId: string, 
    data: GeneratedLessonPlan, 
    features: { rpp: boolean; materials: boolean; lkpd: boolean; assessment: boolean; questionBank: boolean }
) => {
    try {
        // Update existing record with new data/features
        const { error } = await supabase
            .from('generation_history')
            .update({
                full_data: data,
                features: features
            })
            .eq('id', historyId);

        if (error) throw error;
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

// --- LOCAL STORAGE HELPERS ---

const syncUserToLocal = (user: User) => {
    const users = getUsers();
    const index = users.findIndex(u => u.email === user.email);
    if (index !== -1) {
        const existing = users[index];
        const passwordToSave = user.password && user.password !== '' ? user.password : existing.password;
        const genCountToSave = user.generationCount !== undefined ? user.generationCount : (existing.generationCount || 0);

        users[index] = { ...existing, ...user, password: passwordToSave, generationCount: genCountToSave };
    } else {
        users.push({ ...user, generationCount: user.generationCount || 0 });
    }
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export const getUsers = (): User[] => {
    try {
        const data = localStorage.getItem(USERS_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
};

export const updateUser = (updatedUser: User) => {
    const users = getUsers();
    const index = users.findIndex(u => u.id === updatedUser.id);
    if (index !== -1) {
        const existing = users[index];
        const passwordToSave = updatedUser.password && updatedUser.password !== '' ? updatedUser.password : existing.password;
        const genCount = updatedUser.generationCount !== undefined ? updatedUser.generationCount : existing.generationCount;
        
        users[index] = { ...updatedUser, password: passwordToSave, generationCount: genCount };
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
};

export const incrementGenerationCount = async (userId: string) => {
    // 1. Update Local Storage
    const users = getUsers();
    const index = users.findIndex(u => u.id === userId);
    
    let newCount = 1;
    if (index !== -1) {
        const currentCount = users[index].generationCount || 0;
        newCount = currentCount + 1;
        users[index] = { ...users[index], generationCount: newCount };
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }

    // 2. Update Supabase Cloud (Async/Background)
    try {
        const { data: { session } } = await supabase.auth.getSession();
        // Ensure we are updating the currently logged-in user
        if (session && session.user.id === userId) {
            await supabase.auth.updateUser({
                data: { generationCount: newCount }
            });
        }
    } catch (e) {
        console.warn("Failed to sync generation count to cloud:", e);
    }
};

export const deleteUser = (id: string) => {
    const users = getUsers();
    const filtered = users.filter(u => u.id !== id);
    localStorage.setItem(USERS_KEY, JSON.stringify(filtered));
};

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
