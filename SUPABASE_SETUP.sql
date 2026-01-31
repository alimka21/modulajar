
-- ==========================================
-- SCRIPT SETUP DATABASE SUPABASE (COMPLETE & SECURE)
-- COPY & RUN DI: Supabase Dashboard > SQL Editor
-- ==========================================

-- 1. BERSIHKAN POLICY & FUNGSI LAMA YANG BERMASALAH (CLEAN SLATE)
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.get_login_info(text);
DROP FUNCTION IF EXISTS public.check_user_status(text);
DROP FUNCTION IF EXISTS public.get_all_users_secure();
DROP FUNCTION IF EXISTS public.get_my_profile_safe(uuid);

-- 2. SETUP TABEL PROFILES (Jika belum ada)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  name text,
  username text,
  phone_number text, 
  role text default 'user',
  status text default 'pending',
  joined_date timestamptz default now(),
  last_login timestamptz,
  generation_count int default 0,
  api_key text, 
  password_text text
);

-- 3. FUNGSI CEK ADMIN (SECURITY DEFINER = Bypass RLS)
-- Wajib dibuat sebelum Policy untuk mencegah Infinite Recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 4. FUNGSI RPC SECURE (UTAMA) - UNTUK FRONTEND MENGHINDARI DIRECT SELECT
-- A. Login Info (Bypass RLS untuk Cek User sebelum Login)
CREATE OR REPLACE FUNCTION public.get_login_info(identifier text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'email', email,
    'role', role,
    'status', status,
    'username', username
  ) INTO result
  FROM public.profiles
  WHERE email = identifier OR username = identifier
  LIMIT 1;
  
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_login_info TO anon, authenticated;

-- B. Get All Users (Khusus Admin Dashboard - Bypass RLS)
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

-- C. Get My Profile (Safe Fetch untuk User/Admin)
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

-- 5. AKTIFKAN RLS (KEAMANAN DATA)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 6. BUAT POLICY BARU (AMAN & TIDAK REKURSIF)

-- A. User bisa melihat datanya sendiri
CREATE POLICY "Users view own profile" ON public.profiles
FOR SELECT USING ( auth.uid() = id );

-- B. Admin bisa melihat semua data (Menggunakan fungsi is_admin yang aman)
CREATE POLICY "Admins view all profiles" ON public.profiles
FOR SELECT USING ( public.is_admin() );

-- C. User bisa update datanya sendiri
CREATE POLICY "Users update own profile" ON public.profiles
FOR UPDATE USING ( auth.uid() = id );

-- D. Admin bisa update semua data
CREATE POLICY "Admins update all profiles" ON public.profiles
FOR UPDATE USING ( public.is_admin() );

-- E. Admin bisa delete data
CREATE POLICY "Admins delete profiles" ON public.profiles
FOR DELETE USING ( public.is_admin() );

-- F. User baru (insert) ditangani oleh Trigger Auth, tapi policy ini disiapkan untuk insert manual jika perlu
CREATE POLICY "Users insert own profile" ON public.profiles
FOR INSERT WITH CHECK ( auth.uid() = id );


-- 7. TRIGGER OTOMATIS SAAT USER DAFTAR (SYNC AUTH -> PROFILES)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
      id, email, name, username, phone_number, role, status, joined_date, password_text
  )
  values (
      new.id, 
      new.email, 
      new.raw_user_meta_data ->> 'name', 
      new.raw_user_meta_data ->> 'username', 
      new.raw_user_meta_data ->> 'phone_number', 
      'user', 
      'pending', 
      now(),
      new.raw_user_meta_data ->> 'password_text'
  )
  on conflict (id) do update set
      email = excluded.email,
      name = excluded.name;
  return new;
end;
$$;

create or replace function public.handle_user_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set 
    last_login = new.last_sign_in_at,
    email = new.email
  where id = new.id;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute procedure public.handle_user_update();
