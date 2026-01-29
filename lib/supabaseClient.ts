
import { createClient } from '@supabase/supabase-js';

// URL Project Supabase Anda
const PROVIDED_URL = 'https://pxypfmqvwliqywqlbbkc.supabase.co';
const supabaseUrl = process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_URL !== 'undefined'
    ? process.env.VITE_SUPABASE_URL 
    : PROVIDED_URL;

// Anon Key Supabase (JWT)
const PROVIDED_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4eXBmbXF2d2xpcXl3cWxiYmtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODI1OTcsImV4cCI6MjA4NTE1ODU5N30.iST1IVW7X3x1SDwQb3TKWbRlrKQ0mGwkaDV0BnmORW8';

const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY && process.env.VITE_SUPABASE_ANON_KEY !== 'undefined'
    ? process.env.VITE_SUPABASE_ANON_KEY
    : PROVIDED_KEY;

// Cek status konfigurasi
const isConfigured = supabaseUrl && supabaseAnonKey;

if (!isConfigured) {
  console.group("⚠️ Supabase Configuration Missing");
  console.warn("Fitur login/register akan berjalan dalam mode Offline/Simulasi.");
  console.groupEnd();
}

const validKey = supabaseAnonKey || 'placeholder-key';

export const supabase = createClient(supabaseUrl, validKey, {
  auth: {
    persistSession: true, // WAJIB TRUE agar login bertahan saat refresh
    storage: window.localStorage, // Eksplisit gunakan LocalStorage
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
