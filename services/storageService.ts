
import { User, AppSettings } from '../types';
import { supabase } from '../lib/supabaseClient';

const USERS_KEY = 'pakar_users';
const SETTINGS_KEY = 'pakar_settings';

// Default Settings kept local for simplicity in this version
const DEFAULT_SETTINGS: AppSettings = {
    promoLink: 'https://instagram.com/muh.alimka',
    whatsappNumber: '6282335454864',
    socialMediaLink: 'https://instagram.com/muh.alimka'
};

export const initializeStorage = () => {
    // Only initialize settings locally
    if (!localStorage.getItem(SETTINGS_KEY)) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    }
    // We do NOT initialize default admin user locally anymore.
    // Admin must be created in Supabase Auth.
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
             // If this is a fetch error (Supabase not configured/placeholder), throw to catch block
             if (error.message.includes('fetch') || error.message.includes('URL')) {
                 throw error;
             }
        }

        if (!error && data.user) {
            // Check if this is the Super Admin defined in ENV
            const adminEmail = process.env.VITE_ADMIN_EMAIL || 'alimka21@gmail.com'; // Fallback
            const role = data.user.email === adminEmail ? 'admin' : 'user';

            // Construct User Object
            const user: User = {
                id: data.user.id,
                name: data.user.user_metadata?.name || email.split('@')[0],
                email: data.user.email || '',
                role: role,
                status: 'active', // Supabase users are active if they can login
                joinedDate: data.user.created_at
            };

            // Sync to Local Storage for Admin Dashboard visibility (Hybrid approach)
            syncUserToLocal(user);

            return user;
        }
    } catch (err: any) {
        console.warn("Supabase Auth failed or offline, checking local dev bypass...");
    }

    // 2. DEV BYPASS / FALLBACK
    // Jika Supabase belum dikonfigurasi atau gagal, izinkan login default admin
    // Ini berguna untuk tahap pengembangan.
    if ((email === 'alimka21' || email === 'alimka21@gmail.com') && passwordPlain === 'alimka21') {
        const devAdmin: User = {
            id: 'dev-admin-local',
            name: 'Administrator (Local)',
            email: 'alimka21',
            role: 'admin',
            status: 'active',
            joinedDate: new Date().toISOString()
        };
        syncUserToLocal(devAdmin); // Ensure it appears in dashboard list
        return devAdmin;
    }

    return null;
};

export const saveUser = async (user: User) => {
    // This function is now used for REGISTRATION (and Manual Add by Admin)
    try {
        // 1. Register in Supabase
        // user.password passed here MUST be the raw password for SignUp to work.
        // If coming from RegisterPage or AdminDashboard, it should be passed correctly.
        
        const { data, error } = await supabase.auth.signUp({
            email: user.email,
            password: user.password!, 
            options: {
                data: {
                    name: user.name,
                }
            }
        });

        if (error) {
            // If dev mode/placeholder, just simulate success for UI testing
            if (error.message.includes('fetch') || error.message.includes('URL')) {
                 console.warn("Supabase not connected. Simulating registration locally.");
                 const mockUser = { ...user, id: `mock-${Date.now()}`, password: '' };
                 syncUserToLocal(mockUser);
                 return { user: mockUser, session: null };
            }
            // CRITICAL: Throw so UI knows it failed (e.g. email exists)
            throw new Error(error.message);
        }

        if (data.user) {
             // 2. Sync to Local Storage (Hybrid)
             // We overwrite the ID with the actual Supabase ID
             const newUser = { ...user, id: data.user.id, password: '' }; // Don't store password locally
             syncUserToLocal(newUser);
        }
        
        return data;
    } catch (err: any) {
        // If it was the fetch error that was rethrown, catch it here again if needed or let it propagate
        if (err.message && (err.message.includes('fetch') || err.message.includes('URL'))) {
             console.warn("Supabase fetch failed during saveUser, falling back to local simulation.");
             const mockUser = { ...user, id: `mock-${Date.now()}`, password: '' };
             syncUserToLocal(mockUser);
             return { user: mockUser, session: null };
        }
        // Re-throw so AdminDashboard can catch it
        throw new Error(err.message || "Gagal mendaftar ke server.");
    }
};

// --- LOCAL STORAGE HELPERS (FOR ADMIN DASHBOARD DISPLAY ONLY) ---
// Since we don't have a dedicated 'profiles' SQL table setup script here,
// we will keep using LocalStorage to *Display* the list of users in the dashboard.
// The actual *Security* comes from the authenticate() function above.

const syncUserToLocal = (user: User) => {
    const users = getUsers();
    const index = users.findIndex(u => u.email === user.email);
    if (index !== -1) {
        // Update existing
        users[index] = { ...users[index], ...user };
    } else {
        // Add new
        users.push(user);
    }
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export const getUsers = (): User[] => {
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : [];
};

export const updateUser = (updatedUser: User) => {
    const users = getUsers();
    const index = users.findIndex(u => u.id === updatedUser.id);
    if (index !== -1) {
        users[index] = updatedUser;
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    }
    // Note: This only updates local display data. 
    // Changing email/password in Supabase requires separate API calls not implemented in this basic migration.
};

export const deleteUser = (id: string) => {
    const users = getUsers();
    const filtered = users.filter(u => u.id !== id);
    localStorage.setItem(USERS_KEY, JSON.stringify(filtered));
    // Note: Does not delete from Supabase Auth in this basic version
};

export const getSettings = (): AppSettings => {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : DEFAULT_SETTINGS;
};

export const saveSettings = (settings: AppSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const hashPassword = async (password: string): Promise<string> => {
    // Deprecated: Supabase handles hashing. 
    // We just return the password as is to be sent to Supabase API.
    return password;
};
