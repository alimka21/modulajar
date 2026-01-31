import { createClient } from "@supabase/supabase-js";

// Helper untuk membaca env var dengan aman (mendukung Vite 'import.meta.env' dan standar 'process.env')
const getEnv = (key: string, fallback: string) => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return fallback;
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL', 'https://pxypfmqvwliqywqlbbkc.supabase.co');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4eXBmbXF2d2xpcXl3cWxiYmtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODI1OTcsImV4cCI6MjA4NTE1ODU5N30.iST1IVW7X3x1SDwQb3TKWbRlrKQ0mGwkaDV0BnmORW8');

// Konfigurasi Supabase Client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});