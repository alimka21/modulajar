
-- ================================================================
-- FIX CRITICAL ERROR: INFINITE RECURSION IN RLS POLICIES
-- Jalankan script ini di Supabase > SQL Editor > Run
-- ================================================================

-- 1. Reset Semua Policy yang Bermasalah
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

-- 2. Buat Fungsi Cek Admin yang AMAN (SECURITY DEFINER = Bypass RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- Cek langsung tanpa memicu policy lain karena Security Definer
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 3. Fungsi RPC Khusus Admin Dashboard (Mengambil semua user tanpa terkena RLS)
CREATE OR REPLACE FUNCTION public.get_all_users_secure()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Hanya admin yang boleh eksekusi
  IF (SELECT public.is_admin()) THEN
      RETURN QUERY SELECT * FROM public.profiles ORDER BY joined_date DESC;
  ELSE
      RETURN; -- Kembalikan kosong jika bukan admin
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_all_users_secure TO authenticated;

-- 4. Fungsi Safe Fetch Profile (Untuk Login agar tidak infinite loop)
CREATE OR REPLACE FUNCTION public.get_my_profile_safe(target_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  -- Hanya boleh mengambil data diri sendiri ATAU jika requester adalah admin
  IF (auth.uid() = target_id) OR (SELECT public.is_admin()) THEN
      SELECT row_to_json(p) INTO result
      FROM public.profiles p
      WHERE id = target_id;
      RETURN result;
  ELSE
      RETURN NULL;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_profile_safe TO authenticated, anon;

-- 5. Terapkan Policy Baru yang Aman

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- A. User Biasa: Hanya lihat & edit data sendiri
CREATE POLICY "Users view own profile" ON public.profiles
FOR SELECT USING ( auth.uid() = id );

CREATE POLICY "Users update own profile" ON public.profiles
FOR UPDATE USING ( auth.uid() = id );

CREATE POLICY "Users insert own profile" ON public.profiles
FOR INSERT WITH CHECK ( auth.uid() = id );

-- B. Admin: Bisa lihat, edit, hapus semua (Via is_admin yang sudah aman)
CREATE POLICY "Admins view all profiles" ON public.profiles
FOR SELECT USING ( public.is_admin() );

CREATE POLICY "Admins update all profiles" ON public.profiles
FOR UPDATE USING ( public.is_admin() );

CREATE POLICY "Admins delete profiles" ON public.profiles
FOR DELETE USING ( public.is_admin() );
