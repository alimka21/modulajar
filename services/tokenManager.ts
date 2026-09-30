
const STORAGE_KEY = 'pakar_user_custom_api_key';

let inMemoryKey: string | null = null;

const clean = (key: string | null | undefined): string | null => {
  if (!key) return null;
  const trimmed = String(key).trim().replace(/[\r\n"']/g, '');
  return trimmed.length > 5 ? trimmed : null;
};

export const tokenManager = {
  setKey: (key: string | null) => {
    const cleaned = clean(key);
    inMemoryKey = cleaned;
    try {
      if (cleaned) {
        sessionStorage.setItem('custom_api_key', cleaned);
        localStorage.setItem(STORAGE_KEY, cleaned);
      } else {
        sessionStorage.removeItem('custom_api_key');
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      // Ignore storage quota/security errors
    }
  },

  getKey: (): string | null => {
    // 1. Check in-memory
    if (inMemoryKey) {
      return inMemoryKey;
    }

    // 2. Check sessionStorage
    try {
      const sess = clean(sessionStorage.getItem('custom_api_key'));
      if (sess) {
        inMemoryKey = sess;
        return inMemoryKey;
      }
    } catch (e) { }

    // 3. Check localStorage
    try {
      const local = clean(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('custom_api_key'));
      if (local) {
        inMemoryKey = local;
        // Keep sessionStorage in sync
        try { sessionStorage.setItem('custom_api_key', local); } catch (err) { }
        return inMemoryKey;
      }
    } catch (e) { }

    return null;
  },

  clearKey: () => {
    inMemoryKey = null;
    try {
      sessionStorage.removeItem('custom_api_key');
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('custom_api_key');
    } catch (e) { }
  },

  isCustomKeyActive: (): boolean => {
    const key = tokenManager.getKey();
    return !!(key && key.length > 5);
  }
};

