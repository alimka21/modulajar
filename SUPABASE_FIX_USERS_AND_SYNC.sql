-- ============================================================================
-- PAKAR MODUL AJAR - FIX AKUN HILANG & SINKRONISASI LENGKAP
-- Jalankan script ini di: Supabase Dashboard > SQL Editor > New Query > RUN
-- ============================================================================

-- 1. FUNGSI SINKRONISASI OTOMATIS: PULIHKAN AKUN DARI AUTH KE PROFILES
-- Jika ada akun yang ada di auth.users tapi profilnya terhapus / hilang,
-- fungsi ini akan langsung memasukkannya kembali ke public.profiles secara otomatis.
CREATE OR REPLACE FUNCTION public.sync_orphaned_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  recovered_count integer := 0;
BEGIN
  -- Masukkan semua user dari auth.users yang belum punya baris di public.profiles
  INSERT INTO public.profiles (
    id, 
    email, 
    name, 
    username, 
    role, 
    status, 
    joined_date, 
    last_login, 
    generation_count, 
    password_text
  )
  SELECT 
    au.id, 
    au.email, 
    COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)), 
    COALESCE(au.raw_user_meta_data->>'username', split_part(au.email, '@', 1)), 
    COALESCE(au.raw_user_meta_data->>'role', 'user'), 
    COALESCE(au.raw_user_meta_data->>'status', 'active'), -- Pulihkan sebagai active agar langsung bisa login
    au.created_at,
    au.last_sign_in_at,
    0,
    COALESCE(au.raw_user_meta_data->>'password_text', '123456')
  FROM auth.users au
  LEFT JOIN public.profiles p ON au.id = p.id
  WHERE p.id IS NULL
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(public.profiles.name, EXCLUDED.name);

  GET DIAGNOSTICS recovered_count = ROW_COUNT;
  RETURN recovered_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_orphaned_users TO authenticated, anon;


-- 2. FUNGSI HAPUS USER LENGKAP (AUTH.USERS + PROFILES)
-- Mengatasi masalah "saya hapus akun, tapi pas mau tambah lagi notif sudah terdaftar".
-- Dengan fungsi ini, saat admin menghapus akun, akun benar-benar dihapus dari auth.users
-- sehingga email tersebut dapat didaftarkan kembali tanpa error duplikat.
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Cek otorisasi: hanya admin yang boleh menghapus
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only admin can delete users.';
  END IF;

  -- Hapus dari auth.users (akan otomatis cascade ke profiles jika FK cascade aktif)
  DELETE FROM auth.users WHERE id = target_user_id;
  DELETE FROM public.profiles WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user TO authenticated;


-- 3. PERBAIKAN TRIGGER REGISTER SUPABASE
-- Memastikan saat user baru didaftarkan oleh admin (dengan status active),
-- profil yang terbuat menghormati status 'active' tersebut dan tidak dipaksa 'pending'.
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    email, 
    name, 
    username, 
    phone_number, 
    role, 
    status, 
    joined_date, 
    password_text
  )
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), 
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), 
    new.raw_user_meta_data->>'phone_number', 
    COALESCE(new.raw_user_meta_data->>'role', 'user'), 
    COALESCE(new.raw_user_meta_data->>'status', 'pending'), -- Pakai status dari payload, default pending
    NOW(), 
    new.raw_user_meta_data->>'password_text'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(EXCLUDED.name, public.profiles.name),
    status = COALESCE(EXCLUDED.status, public.profiles.status);
    
  RETURN new;
END;
$$;

-- Pasang ulang trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created 
  AFTER INSERT ON auth.users 
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 4. NORMALISASI STATUS DATA LAMA
-- Pastikan tidak ada profil yang statusnya bernilai NULL atau huruf besar tidak seragam
UPDATE public.profiles 
SET status = 'active' 
WHERE status IS NULL OR status = '' OR LOWER(status) = 'active';

UPDATE public.profiles 
SET status = 'pending' 
WHERE LOWER(status) = 'pending';


-- 5. JALANKAN SINKRONISASI AWAL SEKARANG
-- Mengembalikan semua akun auth yang saat ini belum ada di profiles
SELECT public.sync_orphaned_users() AS akun_berhasil_dipulihkan;

-- ============================================================================
-- Selesai! Seluruh data akun kini tersinkronisasi dan aman dari error duplikasi.
-- ============================================================================
