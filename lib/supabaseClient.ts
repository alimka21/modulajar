import { createClient } from "@supabase/supabase-js";

// Mengambil URL dan Key dari environment variable yang didefinisikan di vite.config.ts
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://pxypfmqvwliqywqlbbkc.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4eXBmbXF2d2xpcXl3cWxiYmtjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODI1OTcsImV4cCI6MjA4NTE1ODU5N30.iST1IVW7X3x1SDwQb3TKWbRlrKQ0mGwkaDV0BnmORW8';

// Langkah 1: Konfigurasi Supabase Client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,      // simpan di localStorage agar tetap login saat tab ditutup
    autoRefreshToken: true,   // refresh token secara otomatis di latar belakang
    detectSessionInUrl: true,
  },
});
