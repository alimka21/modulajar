
-- ==========================================
-- SCRIPT OTOMATISASI PROFIL USER SUPABASE (REVISI)
-- COPY & RUN DI: Supabase Dashboard > SQL Editor
-- ==========================================

-- 1. Buat Fungsi Trigger (Handler)
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
  -- Jika data sudah ada (misal karena manual insert di frontend), update saja.
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 2. Buat Trigger pada tabel auth.users
-- Hapus trigger lama dulu jika ada agar tidak error saat recreate
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ==========================================
-- SETUP TABEL & RLS (AMAN DIJALANKAN ULANG)
-- ==========================================

-- Pastikan tabel profiles ada
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

-- Izinkan RLS
alter table public.profiles enable row level security;

-- 3. PERBAIKAN POLICY (Drop dulu sebelum Create)
-- Ini mengatasi error "policy already exists"

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

-- Optional: Policy untuk delete (jika diperlukan)
drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile"
  on public.profiles for delete
  using ( auth.uid() = id );
