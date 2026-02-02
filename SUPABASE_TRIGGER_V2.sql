
-- ============================================================================
-- SQL TRIGGER: AUTO-CREATE PROFILE ON SIGNUP
-- Pastikan script ini dijalankan di Supabase SQL Editor.
-- Ini menjamin data user (profiles) selalu ada ketika user berhasil SignUp.
-- ============================================================================

-- 1. Create Function Handler
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- Insert ke tabel profiles
  -- Data diambil dari metadata yang dikirim saat SignUp (raw_user_meta_data)
  INSERT INTO public.profiles (
    id, 
    email, 
    name, 
    username, 
    password_text, -- Note: Menyimpan password text hanya untuk referensi admin (sesuai request fitur sebelumnya)
    phone_number,
    role, 
    status,
    joined_date
  )
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), 
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'password_text',
    new.raw_user_meta_data->>'phone_number',
    'user', 
    'pending', -- Default status pending
    now()
  ) 
  ON CONFLICT (id) DO NOTHING; -- Hindari error jika sudah ada

  RETURN new;
END;
$$;

-- 2. Bind Function ke Event User Created
-- Hapus trigger lama jika ada untuk menghindari duplikasi
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created 
AFTER INSERT ON auth.users 
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Selesai. Sekarang setiap kali ada User baru di Auth, Profil akan otomatis dibuat.
