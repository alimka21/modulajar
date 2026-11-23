-- ============================================================================
-- PAKAR MODUL AJAR - FIX PENYIMPANAN API KEY PER USER (RLS + RPC AMAN)
-- Opsional: Jalankan di Supabase Dashboard > SQL Editor > New Query > RUN
-- Memastikan kolom api_key ada, policy UPDATE mengizinkan tiap user menyimpan
-- API key ke baris profilnya sendiri, serta menambahkan RPC save_my_api_key.
-- ============================================================================

-- 1. Pastikan kolom api_key tersedia di tabel public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS api_key TEXT;

-- 2. Pastikan RLS policy UPDATE untuk pemilik akun memiliki USING dan WITH CHECK
DROP POLICY IF EXISTS "policy_update_profiles" ON public.profiles;
CREATE POLICY "policy_update_profiles"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id OR is_admin())
WITH CHECK (auth.uid() = id OR is_admin());

-- 3. Fungsi RPC aman untuk menyimpan/menghapus API Key milik akun yang sedang login
CREATE OR REPLACE FUNCTION public.save_my_api_key(new_api_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_meta jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: silakan login terlebih dahulu.';
  END IF;

  UPDATE public.profiles
  SET api_key = NULLIF(TRIM(COALESCE(new_api_key, '')), '')
  WHERE id = v_uid;

  -- Jika baris profil belum ada, buat otomatis dari data auth.users
  IF NOT FOUND THEN
    SELECT email, raw_user_meta_data INTO v_email, v_meta
    FROM auth.users WHERE id = v_uid;

    INSERT INTO public.profiles (id, email, name, username, role, status, api_key)
    VALUES (
      v_uid,
      v_email,
      COALESCE(v_meta->>'name', split_part(v_email, '@', 1)),
      COALESCE(v_meta->>'username', split_part(v_email, '@', 1)),
      COALESCE(v_meta->>'role', 'user'),
      'active',
      NULLIF(TRIM(COALESCE(new_api_key, '')), '')
    )
    ON CONFLICT (id) DO UPDATE SET
      api_key = EXCLUDED.api_key;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_my_api_key(text) TO authenticated;
