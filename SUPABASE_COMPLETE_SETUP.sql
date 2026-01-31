-- ============================================================================
-- PAKAR MODUL AJAR - COMPLETE SETUP & FIX (Jalankan Semua)
-- Script ini akan memperbaiki: Tabel, Fungsi Login, RLS, dan Akun Admin
-- ============================================================================

-- 1. PASTIKAN TABEL PROFILES ADA & BENAR
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE,
  name TEXT,
  username TEXT UNIQUE,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'pending',
  joined_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  last_login TIMESTAMP WITH TIME ZONE,
  generation_count INTEGER DEFAULT 0,
  api_key TEXT,
  password_text TEXT,
  phone_number TEXT
);

-- 2. RESET & AKTIFKAN SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Bersihkan policy lama agar tidak bentrok
DROP POLICY IF EXISTS "policy_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "policy_update_profiles" ON public.profiles;
DROP POLICY IF EXISTS "policy_delete_profiles" ON public.profiles;
DROP POLICY IF EXISTS "policy_insert_profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all" ON public.profiles; -- Bersihkan sisa lama
DROP POLICY IF EXISTS "Users can see own profile" ON public.profiles;

-- 3. FUNGSI SAKTI: CEK ADMIN (Bypass RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER -- Ini kuncinya agar tidak looping/recursion
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin');
END;
$$;

-- 4. PASANG POLICY BARU (CRUD)
CREATE POLICY "policy_select_profiles" ON public.profiles FOR SELECT USING (auth.uid() = id OR is_admin());
CREATE POLICY "policy_update_profiles" ON public.profiles FOR UPDATE USING (auth.uid() = id OR is_admin());
CREATE POLICY "policy_delete_profiles" ON public.profiles FOR DELETE USING (is_admin());
CREATE POLICY "policy_insert_profiles" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id OR is_admin());

-- 5. FUNGSI PENTING UNTUK LOGIN (Ini yang kemungkinan hilang)
-- A. Ambil Info Login (Cek email/username)
CREATE OR REPLACE FUNCTION get_login_info(identifier text)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE result json;
BEGIN
  SELECT row_to_json(p) INTO result FROM profiles p
  WHERE LOWER(p.email) = LOWER(identifier) OR LOWER(p.username) = LOWER(identifier) LIMIT 1;
  RETURN result;
END;
$$;

-- B. Ambil Profil User (Safe Mode)
CREATE OR REPLACE FUNCTION get_my_profile_safe(target_id uuid)
RETURNS json
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT row_to_json(profiles) FROM profiles WHERE id = target_id;
$$;

-- C. Ambil Semua User (Khusus Admin Dashboard)
CREATE OR REPLACE FUNCTION get_all_users_secure()
RETURNS SETOF public.profiles
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Access Denied';
  END IF;
  RETURN QUERY SELECT * FROM profiles ORDER BY joined_date DESC;
END;
$$;

-- D. Update Status User (Tombol Aktifkan di Admin)
CREATE OR REPLACE FUNCTION public.admin_update_user_status(target_user_id uuid, new_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER 
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.profiles SET status = new_status WHERE id = target_user_id;
END;
$$;

-- 6. TRIGGER OTOMATIS (Saat User Baru Daftar)
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, username, password_text, role, status)
  VALUES (
    new.id, new.email, 
    new.raw_user_meta_data->>'name', 
    new.raw_user_meta_data->>'username',
    new.raw_user_meta_data->>'password_text',
    'user', 'pending'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 7. GRANT PERMISSIONS (Agar Frontend bisa akses fungsi)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.profiles TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_login_info TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_my_profile_safe TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_all_users_secure TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_user_status TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin TO authenticated, anon;

-- 8. RESTORE ADMIN (Jaga-jaga profil admin hilang)
DO $$
DECLARE
  target_uid UUID := 'cc8a00aa-ded4-4988-9987-cb31cf5fda25'; -- UID Asli Anda
  target_email TEXT := 'alimkamcl@gmail.com';
BEGIN
  DELETE FROM public.profiles WHERE id = target_uid; -- Reset profil biar bersih
  INSERT INTO public.profiles (id, email, name, username, role, status, joined_date, last_login, generation_count)
  VALUES (target_uid, target_email, 'Super Admin', 'admin', 'admin', 'active', NOW(), NOW(), 999);
END $$;