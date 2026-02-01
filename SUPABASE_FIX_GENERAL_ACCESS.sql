
-- ================================================================
-- FIX USER ACCESS (Jalankan di Supabase > SQL Editor)
-- Script ini akan memperbaiki profil "Rusak" untuk semua user
-- ================================================================

DO $$
BEGIN
  -- 1. Cari user yang ada di Auth tapi tidak ada di Profiles (Data Rusak)
  -- 2. Masukkan mereka ke tabel Profiles secara otomatis
  INSERT INTO public.profiles (
    id, 
    email, 
    name, 
    username, 
    role, 
    status, 
    joined_date,
    password_text
  )
  SELECT 
    au.id, 
    au.email, 
    COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)), 
    COALESCE(au.raw_user_meta_data->>'username', split_part(au.email, '@', 1)), 
    'user', -- Default Role
    'active', -- Default Status (Diaktifkan otomatis agar bisa login)
    au.created_at,
    au.raw_user_meta_data->>'password_text'
  FROM auth.users au
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = au.id
  );

  RAISE NOTICE 'Sinkronisasi Selesai. Semua user yang rusak telah diperbaiki.';
END $$;
