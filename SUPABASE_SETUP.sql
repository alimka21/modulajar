
-- ==========================================
-- SCRIPT SETUP DATABASE SUPABASE (FIXED)
-- COPY & RUN DI: Supabase Dashboard > SQL Editor
-- ==========================================

-- 1. BERSIHKAN TRIGGER LAMA YANG RUSAK (PENTING)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user;
DROP FUNCTION IF EXISTS public.handle_user_update;

-- 2. Pastikan Tabel Profiles Ada
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

-- 3. Fungsi Handler: User Baru (Insert ke Profiles)
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

-- 4. Fungsi Handler: User Login/Update (Sync ke Profiles)
-- FIX: Menggunakan tabel 'profiles' bukan 'users'
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

-- 5. Pasang Trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create trigger on_auth_user_updated
  after update on auth.users
  for each row execute procedure public.handle_user_update();

-- ==========================================
-- SETUP RLS (Row Level Security)
-- ==========================================

alter table public.profiles enable row level security;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Public profiles are viewable by everyone" on public.profiles for select using ( true );

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles for insert with check ( auth.uid() = id );

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update using ( auth.uid() = id );

drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile" on public.profiles for delete using ( auth.uid() = id );

-- ==========================================
-- (OPSIONAL) RESET ADMIN MANUAL
-- Jalankan bagian ini jika Admin tidak bisa login
-- ==========================================
/*
DO $$
BEGIN
    -- Update Password Admin di Auth
    UPDATE auth.users
    SET encrypted_password = crypt('123456', gen_salt('bf'))
    WHERE email = 'alimkamcl@gmail.com';

    -- Pastikan Admin ada di Profiles
    INSERT INTO public.profiles (id, email, name, username, role, status, joined_date, password_text)
    SELECT id, email, 'Super Admin', 'admin', 'admin', 'active', now(), '123456'
    FROM auth.users WHERE email = 'alimkamcl@gmail.com'
    ON CONFLICT (id) DO UPDATE SET role='admin', status='active';
END $$;
*/
