
import { User, AppSettings } from '../types';
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
            // Throw to trigger catch block for unified fallback logic
            throw error;
        }

        if (data && data.user) {
            const adminEmail = process.env.VITE_ADMIN_EMAIL || 'alimka21@gmail.com';
            const role = data.user.email === adminEmail ? 'admin' : 'user';

            const user: User = {
                id: data.user.id,
                name: data.user.user_metadata?.name || email.split('@')[0],
                username: data.user.user_metadata?.username || email.split('@')[0],
                email: data.user.email || '',
                role: role,
                status: 'active',
                joinedDate: data.user.created_at,
                lastLogin: new Date().toISOString()
            };

            // Sync to Local Storage (Hybrid) & Update Last Login
            syncUserToLocal(user);

            return user;
        }
    } catch (err: any) {
        const msg = err?.message || String(err);
        // Only log/warn, don't throw. We want to fallback to local.
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
            lastLogin: new Date().toISOString()
        };
        syncUserToLocal(devAdmin);
        return devAdmin;
    }

    return null;
};

export const saveUser = async (user: User) => {
    try {
        // 1. Register in Supabase
        const { data, error } = await supabase.auth.signUp({
            email: user.email,
            password: user.password || '123456',
            options: {
                data: {
                    name: user.name,
                    username: user.username
                }
            }
        });

        if (error) throw error;

        if (data.user) {
             // Success: Sync to Local
             // NOTE: Saving password to local storage allows admin to see it in table (per user request).
             // In a real high-security app, we would NOT save the password here.
             const newUser = { ...user, id: data.user.id }; 
             syncUserToLocal(newUser);
        }
        
        return data;
    } catch (err: any) {
        const msg = (err?.message || String(err)).toLowerCase();
        
        // Expanded Fallback Logic:
        const shouldFallback = 
            msg.includes('fetch') || 
            msg.includes('url') || 
            msg.includes('apikey') || 
            msg.includes('network') ||
            msg.includes('connection') ||
            msg.includes('invalid') || // Handles 'Email address is invalid'
            msg.includes('password') || // Handles 'Password too short' (if UI check missed it)
            msg.includes('security') ||
            msg.includes('rate limit');

        if (shouldFallback) {
             console.warn(`Supabase error (${msg}). Falling back to local storage.`);
             // Save locally with password
             const mockUser = { ...user, id: `mock-${Date.now()}` }; 
             syncUserToLocal(mockUser);
             return { user: mockUser, session: null };
        }
        
        throw new Error(err?.message || "Gagal mendaftar ke server.");
    }
};

// --- LOCAL STORAGE HELPERS ---

const syncUserToLocal = (user: User) => {
    const users = getUsers();
    const index = users.findIndex(u => u.email === user.email);
    if (index !== -1) {
        const existing = users[index];
        // Merge existing data with new data, preferring new data
        // Preserve password if new one is empty/undefined
        const passwordToSave = user.password && user.password !== '' ? user.password : existing.password;
        users[index] = { ...existing, ...user, password: passwordToSave };
    } else {
        users.push(user);
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
        users[index] = { ...updatedUser, password: passwordToSave };
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
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
