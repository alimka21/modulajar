export type ApiKeyMode = 'gemini' | 'vertex_express';

const USER_KEY_PREFIX = 'pakar_user_api_key_';
const USER_MODE_PREFIX = 'pakar_user_api_mode_';

// Legacy unscoped keys that previously caused cross-account leakage
const LEGACY_KEYS = ['pakar_user_custom_api_key', 'custom_api_key'];

let activeUserId: string | null = null;
let inMemoryKey: string | null = null;
let inMemoryMode: ApiKeyMode = 'gemini';

export const sanitizeApiKeyString = (key: string | null | undefined): string | null => {
  if (!key) return null;
  const cleaned = String(key)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '') // Zero-width & non-breaking spaces
    .replace(/["'`\r\n\t\s]/g, '')               // Quotes, backticks, whitespace
    .trim();
  return cleaned.length >= 10 ? cleaned : null;
};

const clearLegacyGlobalKeys = () => {
  try {
    for (const k of LEGACY_KEYS) {
      sessionStorage.removeItem(k);
      localStorage.removeItem(k);
    }
  } catch (e) {
    // Ignore storage errors
  }
};

export const tokenManager = {
  /**
   * Bind tokenManager to the currently authenticated user account.
   * Ensures strict isolation so API keys never leak across different accounts on the same device.
   */
  setActiveUser: (userId: string | null, dbApiKey?: string | null) => {
    clearLegacyGlobalKeys();
    activeUserId = userId;

    if (!userId) {
      inMemoryKey = null;
      inMemoryMode = 'gemini';
      return;
    }

    const cleanedDbKey = sanitizeApiKeyString(dbApiKey);

    try {
      const storedMode = localStorage.getItem(USER_MODE_PREFIX + userId);
      inMemoryMode = storedMode === 'vertex_express' ? 'vertex_express' : 'gemini';
    } catch (e) {
      inMemoryMode = 'gemini';
    }

    if (cleanedDbKey) {
      inMemoryKey = cleanedDbKey;
      try {
        localStorage.setItem(USER_KEY_PREFIX + userId, cleanedDbKey);
      } catch (e) { }
    } else {
      // Only fall back to this specific user's local backup — never another user's key
      try {
        const localUserKey = sanitizeApiKeyString(localStorage.getItem(USER_KEY_PREFIX + userId));
        inMemoryKey = localUserKey;
      } catch (e) {
        inMemoryKey = null;
      }
    }
  },

  setKey: (key: string | null, userId?: string | null, mode?: ApiKeyMode) => {
    clearLegacyGlobalKeys();
    const targetUserId = userId ?? activeUserId;
    const cleaned = sanitizeApiKeyString(key);

    if (targetUserId && targetUserId === activeUserId) {
      inMemoryKey = cleaned;
      if (mode) {
        inMemoryMode = mode;
      } else if (!cleaned) {
        inMemoryMode = 'gemini';
      }
    } else if (!activeUserId) {
      inMemoryKey = cleaned;
      if (mode) inMemoryMode = mode;
    }

    if (targetUserId) {
      try {
        if (cleaned) {
          localStorage.setItem(USER_KEY_PREFIX + targetUserId, cleaned);
          if (mode) {
            localStorage.setItem(USER_MODE_PREFIX + targetUserId, mode);
          }
        } else {
          localStorage.removeItem(USER_KEY_PREFIX + targetUserId);
          localStorage.removeItem(USER_MODE_PREFIX + targetUserId);
        }
      } catch (e) {
        // Ignore storage quota/security errors
      }
    }
  },

  getKey: (userId?: string | null): string | null => {
    const targetUserId = userId ?? activeUserId;

    // If asking for currently active user and memory has it
    if (targetUserId && targetUserId === activeUserId && inMemoryKey) {
      return inMemoryKey;
    }

    if (targetUserId) {
      try {
        const stored = sanitizeApiKeyString(localStorage.getItem(USER_KEY_PREFIX + targetUserId));
        if (targetUserId === activeUserId) {
          inMemoryKey = stored;
        }
        return stored;
      } catch (e) {
        return null;
      }
    }

    return inMemoryKey;
  },

  setMode: (mode: ApiKeyMode, userId?: string | null) => {
    const targetUserId = userId ?? activeUserId;
    if (!targetUserId || targetUserId === activeUserId) {
      inMemoryMode = mode;
    }
    if (targetUserId) {
      try {
        localStorage.setItem(USER_MODE_PREFIX + targetUserId, mode);
      } catch (e) { }
    }
  },

  getMode: (userId?: string | null): ApiKeyMode => {
    const targetUserId = userId ?? activeUserId;
    if (targetUserId && targetUserId === activeUserId) {
      return inMemoryMode;
    }
    if (targetUserId) {
      try {
        const stored = localStorage.getItem(USER_MODE_PREFIX + targetUserId);
        return stored === 'vertex_express' ? 'vertex_express' : 'gemini';
      } catch (e) {
        return 'gemini';
      }
    }
    return inMemoryMode;
  },

  /**
   * Explicitly deletes the user's saved API key from memory and local backup.
   */
  clearKey: (userId?: string | null) => {
    clearLegacyGlobalKeys();
    const targetUserId = userId ?? activeUserId;
    if (!targetUserId || targetUserId === activeUserId) {
      inMemoryKey = null;
      inMemoryMode = 'gemini';
    }
    if (targetUserId) {
      try {
        localStorage.removeItem(USER_KEY_PREFIX + targetUserId);
        localStorage.removeItem(USER_MODE_PREFIX + targetUserId);
      } catch (e) { }
    }
  },

  /**
   * Clears active in-memory session on logout without erasing other accounts' isolated backups.
   */
  resetSession: () => {
    clearLegacyGlobalKeys();
    activeUserId = null;
    inMemoryKey = null;
    inMemoryMode = 'gemini';
  },

  isCustomKeyActive: (): boolean => {
    const key = tokenManager.getKey();
    return !!(key && key.length >= 10);
  }
};
