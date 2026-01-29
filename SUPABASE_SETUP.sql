
-- ==========================================
-- SCRIPT SETUP DATABASE SUPABASE (UPDATED)
-- COPY & RUN DI: Supabase Dashboard > SQL Editor
-- ==========================================

-- 1. Pastikan Tabel Profiles Ada dengan Kolom Lengkap
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
  api_key text, -- Kolom API Key
  password_text text
);

-- (Opsional/Safety) Jika tabel sudah ada tapi kolom belum ada
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS api_key text;

-- 2. Buat Fungsi Trigger (Handler)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (
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
  values (
      new.id, 
      new.email, 
      new.raw_user_meta_data ->> 'name', 
      new.raw_user_meta_data ->> 'username', 
      new.raw_user_meta_data ->> 'phone_number', 
      'user', 
      'pending', 
      now(),
      'encrypted' 
  )
  on conflict (id) do update set
      email = excluded.email,
      name = excluded.name,
      username = excluded.username,
      phone_number = excluded.phone_number;
      
  return new;
end;
$$;

-- 3. Pasang Trigger
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==========================================
-- SETUP RLS (Row Level Security)
-- ==========================================

alter table public.profiles enable row level security;

-- PENTING: Policy ini diperlukan agar saat login kita bisa mengecek apakah email terdaftar di profiles
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using ( true );

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check ( auth.uid() = id );

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using ( auth.uid() = id );

drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile"
  on public.profiles for delete
  using ( auth.uid() = id );
