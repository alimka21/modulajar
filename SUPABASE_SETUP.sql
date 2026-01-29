
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
  phone_number text, -- Pastikan kolom ini ada
  role text default 'user',
  status text default 'pending',
  joined_date timestamptz default now(),
  last_login timestamptz,
  generation_count int default 0,
  api_key text,
  password_text text
);

-- (Opsional/Safety) Jika tabel sudah ada tapi kolom phone_number belum ada
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number text;

-- 2. Buat Fungsi Trigger (Handler)
-- Fungsi ini akan dijalankan setiap kali ada baris baru di auth.users
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
      'encrypted' -- Placeholder keamanan
  )
  -- Jika data sudah ada (misal karena manual insert di frontend), update data tersebut.
  on conflict (id) do update set
      email = excluded.email,
      name = excluded.name,
      username = excluded.username,
      phone_number = excluded.phone_number;
      
  return new;
end;
$$;

-- 3. Pasang Trigger pada tabel auth.users
-- Hapus trigger lama dulu jika ada agar tidak error saat recreate
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==========================================
-- SETUP RLS (Row Level Security)
-- ==========================================

-- Izinkan RLS
alter table public.profiles enable row level security;

-- Policy untuk SELECT (Publik boleh baca profile dasar, atau batasi jika perlu)
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using ( true );

-- Policy untuk INSERT (User boleh insert dirinya sendiri)
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check ( auth.uid() = id );

-- Policy untuk UPDATE (User boleh update dirinya sendiri)
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using ( auth.uid() = id );

-- Policy untuk DELETE
drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile"
  on public.profiles for delete
  using ( auth.uid() = id );
