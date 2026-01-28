
import { createClient } from '@supabase/supabase-js';

// Load variables from environment
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

// Check configuration status for debugging
const isConfigured = supabaseUrl && supabaseAnonKey && 
                     !supabaseUrl.includes('placeholder') && 
                     supabaseUrl !== 'undefined';

if (!isConfigured) {
  console.warn("⚠️ Supabase Credentials missing or placeholder detected. Auth features will run in Dev/Offline mode.");
  // Ini akan membantu melihat apa yang sebenarnya terbaca (jika null/undefined)
  console.debug("Debug Supabase URL:", supabaseUrl ? "Set (Hidden)" : "Not Set"); 
} else {
  console.log("✅ Supabase Client initialized successfully.");
}

// Use fallback URL and Key to prevent "supabaseUrl is required" error which crashes the app on load.
// If variables are missing, Auth calls will fail gracefully with network errors instead of a whitespace crash.
const validUrl = isConfigured ? supabaseUrl : 'https://placeholder.supabase.co';
const validKey = isConfigured ? supabaseAnonKey : 'placeholder-key';

export const supabase = createClient(validUrl, validKey);
