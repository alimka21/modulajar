
-- ================================================================
-- FIX ADMIN ACCESS (Jalankan di Supabase SQL Editor)
-- Script ini menyinkronkan ID Auth dengan ID Profil
-- ================================================================

DO $$
DECLARE
  v_auth_id uuid;
  v_email text := 'alimkamcl@gmail.com'; -- Email Admin
BEGIN
  -- 1. Ambil ID Asli dari sistem Auth Supabase
  SELECT id INTO v_auth_id FROM auth.users WHERE email = v_email;

  -- 2. Cek apakah user benar-benar ada di Auth
  IF v_auth_id IS NULL THEN
     RAISE NOTICE 'User % tidak ditemukan di Auth. Silakan Daftar/Sign Up terlebih dahulu.', v_email;
  ELSE
     -- 3. Hapus profil yang ID-nya salah (Mismatch/Hardcoded lama)
     DELETE FROM public.profiles WHERE email = v_email AND id != v_auth_id;

     -- 4. Masukkan/Update Profil dengan ID yang BENAR
     INSERT INTO public.profiles (
       id, email, name, username, role, status, joined_date, generation_count, password_text
     )
     VALUES (
       v_auth_id, 
       v_email, 
       'Super Admin', 
       'admin', 
       'admin', 
       'active', 
       now(),
       9999,
       '123456'
     )
     ON CONFLICT (id) DO UPDATE SET
       role = 'admin',
       status = 'active';

     RAISE NOTICE 'Sukses! Akses Admin untuk % telah diperbaiki.', v_email;
  END IF;
END $$;
