import { createClient } from "@supabase/supabase-js";

// Helper untuk membaca env var dengan aman (Anti-Error TypeScript Vercel)
const getEnv = (key: string, fallback: string) => {
  // 1. Coba Vite Environment (dengan casting 'as any' agar TS tidak rewel)
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
      return (import.meta as any).env[key];
    }
  } catch (e) {
    // Abaikan error akses import.meta
  }

  // 2. Coba Process Environment (Standard Node.js/Vercel)
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) {
    // Abaikan error akses process
  }

  // 3. Kembalikan Fallback jika tidak ditemukan
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