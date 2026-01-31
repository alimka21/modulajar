
-- ==========================================
-- SCRIPT SETUP DATABASE SUPABASE (FIXED & SECURE)
-- COPY & RUN DI: Supabase Dashboard > SQL Editor
-- ==========================================

-- 1. BERSIHKAN POLICY & FUNGSI LAMA YANG BERMASALAH
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.get_login_info(text);
DROP FUNCTION IF EXISTS public.check_user_status(text);

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

-- 3. FUNGSI KHUSUS LOGIN (RPC) - AGAR FRONTEND BISA CEK STATUS TANPA KENA BLOKIR RLS
CREATE OR REPLACE FUNCTION public.get_login_info(identifier text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- Berjalan dengan hak akses admin (bypass RLS)
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
-- Izinkan fungsi ini dipanggil oleh siapapun (termasuk sebelum login)
GRANT EXECUTE ON FUNCTION public.get_login_info TO anon, authenticated;

-- 4. FUNGSI CEK ADMIN (UNTUK POLICY)
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

-- D. User baru (insert) ditangani oleh Trigger Auth (lihat di bawah), tapi policy ini disiapkan
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

