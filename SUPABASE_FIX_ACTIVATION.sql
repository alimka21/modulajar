
-- ================================================================
-- FIX: GAGAL UPDATE STATUS USER (ACTIVE/PENDING)
-- Jalankan script ini di Supabase > SQL Editor > Run
-- ================================================================

-- 1. Buat Fungsi Khusus Admin untuk Update Status (Bypass RLS)
-- Fungsi ini berjalan dengan hak akses 'SECURITY DEFINER' (hak pemilik DB)
-- sehingga tidak akan diblokir oleh Policy standar, asalkan pemanggil adalah Admin.

CREATE OR REPLACE FUNCTION public.admin_update_user_status(target_user_id uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- 1. Validasi Keamanan: Pastikan yang memanggil adalah Admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can perform this action.';
  END IF;

  -- 2. Eksekusi Update
  UPDATE public.profiles
  SET status = new_status
  WHERE id = target_user_id;
  
END;
$$;

-- 2. Berikan izin eksekusi ke user yang login
GRANT EXECUTE ON FUNCTION public.admin_update_user_status TO authenticated;

-- Selesai. Sekarang tombol "Aktifkan" di Dashboard Admin akan berfungsi.
