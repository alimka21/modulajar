
import React, { useState, useEffect } from 'react';
import { User, AppSettings } from '../types';
import { getUsers, saveUser, updateUser, updateUserStatus, deleteUser, getSettings, saveSettings, updateAdminPassword, syncOrphanedUsers } from '../services/storageService';
import { swal, toast } from '../services/notificationService';
import { LogOut, Users, Settings, LayoutDashboard, Plus, Trash2, Edit2, CheckCircle, XCircle, Search, Activity, Zap, GraduationCap, TrendingUp, Clock, Circle, HelpCircle, Key, Lock, ExternalLink, Loader2, X, RefreshCw, Sparkles, FileCode, Copy, Check, ShieldCheck, AlertCircle } from 'lucide-react';

interface AdminDashboardProps {
  onLogout: () => void;
  onGoToApp: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout, onGoToApp }) => {
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'USERS' | 'SETTINGS'>('DASHBOARD');
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setAppSettings] = useState<AppSettings>({ promoLink: '', whatsappNumber: '', socialMediaLink: '' });
  
  // Default ke 'ALL' agar admin melihat seluruh pengguna tanpa ada akun tersembunyi
  const [userTab, setUserTab] = useState<'ALL' | 'ACTIVE' | 'PENDING'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', username: '', email: '', password: '', status: 'active' });

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState({ name: '', username: '', email: '', password: '', status: '' });
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [isUpdatingPass, setIsUpdatingPass] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
      refreshData();
      const interval = setInterval(refreshData, 30000);
      return () => clearInterval(interval);
  }, []);

  const refreshData = async () => {
      try {
        const allUsers = await getUsers();
        setUsers(allUsers);
        setAppSettings(getSettings());
      } catch (error) {
          console.error("Failed to refresh data (background)", error);
      }
  };

  const handleSyncOrphaned = async () => {
      setIsSyncing(true);
      try {
          const result = await syncOrphanedUsers();
          await refreshData();
          swal.fire({
              title: 'Sinkronisasi Selesai',
              text: result.message,
              icon: 'success',
              confirmButtonColor: '#2563eb'
          });
      } catch (e: any) {
          swal.fire({
              title: 'Info Sinkronisasi',
              text: e.message || 'Gagal menjalankan sinkronisasi otomatis.',
              icon: 'info'
          });
      } finally {
          setIsSyncing(false);
      }
  };

  const getRelativeTime = (dateString: string) => {
      if (!dateString) return "Belum pernah";
      const now = new Date();
      const past = new Date(dateString);
      const diffInMs = now.getTime() - past.getTime();
      const diffInMins = Math.floor(diffInMs / (1000 * 60));
      const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
      const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

      if (diffInMins < 1) return "Baru saja";
      if (diffInMins < 60) return `${diffInMins} menit lalu`;
      if (diffInHours < 24) return `${diffInHours} jam lalu`;
      if (diffInDays < 7) return `${diffInDays} hari lalu`;
      
      return past.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  const isUserOnline = (dateString: string) => {
      if (!dateString) return false;
      const now = new Date();
      const past = new Date(dateString);
      const diffInMins = Math.floor((now.getTime() - past.getTime()) / (1000 * 60));
      return diffInMins < 15;
  };

  const handleUpdateStatus = (user: User, status: 'active' | 'pending') => {
      swal.fire({
          title: status === 'active' ? 'Aktifkan Pengguna?' : 'Pindahkan ke Pending?',
          text: status === 'active' 
            ? `Pengguna ${user.name} akan dapat langsung login dan menggunakan aplikasi.`
            : `Pengguna ${user.name} akan dinonaktifkan sementara dan dipindah ke antrian aktivasi.`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: status === 'active' ? '#16a34a' : '#d97706',
          confirmButtonText: status === 'active' ? 'Ya, Aktifkan' : 'Ya, Nonaktifkan'
      }).then(async (result: any) => {
          if (result.isConfirmed) {
              const updatedUsers = users.map(u => u.id === user.id ? { ...u, status: status } : u);
              setUsers(updatedUsers);
              
              try {
                  await updateUserStatus(user.id, status);
                  toast.fire({ icon: 'success', title: status === 'active' ? 'Akun Berhasil Diaktifkan' : 'Akun Dinonaktifkan' });
                  refreshData();
              } catch (error: any) {
                  refreshData();
                  toast.fire({ 
                    icon: 'error', 
                    title: 'Gagal Update Status', 
                    text: error.message || "Periksa koneksi internet Anda." 
                  });
              }
          }
      });
  };

  const handleDeleteUser = (user: User) => {
      swal.fire({
          title: `Hapus Akun ${user.name}?`,
          text: `Email "${user.email}" akan dihapus dari sistem. Tindakan ini tidak dapat dibatalkan.`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ef4444',
          cancelButtonColor: '#64748b',
          confirmButtonText: 'Ya, Hapus Sekarang',
          cancelButtonText: 'Batal'
      }).then(async (result: any) => {
          if (result.isConfirmed) {
              const previousUsers = [...users];
              setUsers(users.filter(u => u.id !== user.id));
              try {
                  await deleteUser(user.id);
                  swal.fire('Terhapus!', `Akun ${user.name} (${user.email}) telah dihapus dari sistem.`, 'success');
                  refreshData();
              } catch (error: any) {
                  setUsers(previousUsers);
                  toast.fire({ icon: 'error', title: 'Gagal Menghapus', text: error.message });
              }
          }
      });
  };

  const handleGeneratePassword = () => {
      const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
      let pass = '';
      for (let i = 0; i < 6; i++) {
          pass += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      setNewUser(prev => ({ ...prev, password: pass }));
  };

  const handleAddUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newUser.email || !newUser.name) {
          swal.fire({ title: 'Data Belum Lengkap', text: 'Nama dan Email wajib diisi.', icon: 'warning' });
          return;
      }
      if (newUser.password.length < 6) {
          swal.fire({ title: 'Password Terlalu Pendek', text: 'Password harus minimal 6 karakter.', icon: 'warning' });
          return;
      }

      setIsSubmittingUser(true);
      try {
        const generatedUsername = (newUser.username || newUser.email.split('@')[0] || '').trim().toLowerCase();
        const user: User = {
            id: '',
            name: newUser.name.trim(),
            username: generatedUsername,
            email: newUser.email.trim().toLowerCase(),
            password: newUser.password, 
            role: 'user', 
            status: newUser.status as 'active' | 'pending',
            joinedDate: new Date().toISOString(),
            lastLogin: '',
            generationCount: 0
        };

        const res: any = await saveUser(user);
        setIsAddingUser(false);
        setNewUser({ name: '', username: '', email: '', password: '', status: 'active' });
        await refreshData();

        if (res && res.recovered) {
            swal.fire({ 
                title: 'Akun Berhasil Dipulihkan & Diaktifkan!', 
                text: `Email "${user.email}" sebelumnya pernah terdaftar di Auth dan kini telah dipulihkan ke daftar profil dengan status ${user.status === 'active' ? 'Aktif' : 'Pending'}.`, 
                icon: 'success' 
            });
        } else {
            swal.fire({ 
                title: 'Pengguna Berhasil Ditambahkan!', 
                text: `Pengguna ${user.name} telah terdaftar dengan status ${user.status === 'active' ? 'Aktif' : 'Pending'}.`, 
                icon: 'success' 
            });
        }

        // Otomatis pindah tab ke status yang baru dibuat agar langsung terlihat
        if (user.status === 'active') {
            setUserTab('ACTIVE');
        } else {
            setUserTab('PENDING');
        }

      } catch (error: any) {
        swal.fire({ 
            title: 'Pemberitahuan Pendaftaran', 
            text: error.message || "Terjadi kesalahan.", 
            icon: 'error' 
        });
      } finally {
        setIsSubmittingUser(false);
      }
  };

  const handleEditClick = (user: User) => {
      setEditingUser(user);
      setEditFormData({ 
          name: user.name, 
          username: user.username || user.email.split('@')[0] || '', 
          email: user.email, 
          password: user.password || '', 
          status: user.status 
      });
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingUser) return;
      setIsSubmittingEdit(true);
      try {
          const updatedUser: User = {
              ...editingUser,
              name: editFormData.name.trim(),
              username: editFormData.username.trim().toLowerCase(),
              email: editFormData.email.trim().toLowerCase(),
              password: editFormData.password,
              status: editFormData.status as 'active' | 'pending'
          };
          setUsers(prev => prev.map(u => u.id === editingUser.id ? updatedUser : u));
          setEditingUser(null); 
          await updateUser(updatedUser);
          toast.fire({ icon: 'success', title: 'Data Berhasil Diupdate' });
          refreshData();
      } catch (error: any) {
          refreshData();
          swal.fire({ title: 'Error!', text: error.message || 'Gagal mengupdate data.', icon: 'error' });
      } finally {
          setIsSubmittingEdit(false);
      }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
      e.preventDefault();
      saveSettings(settings);
      swal.fire({ title: 'Tersimpan!', text: 'Pengaturan berhasil disimpan.', icon: 'success' });
  };

  const handleUpdateAdminPassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (newAdminPassword.length < 6) {
          swal.fire({ title: 'Password Terlalu Pendek', text: 'Minimal 6 karakter.', icon: 'warning' });
          return;
      }
      setIsUpdatingPass(true);
      try {
          await updateAdminPassword(newAdminPassword);
          setNewAdminPassword('');
          swal.fire({ title: 'Selesai!', text: 'Kata sandi admin berhasil diperbarui.', icon: 'success' });
      } catch (e: any) {
          swal.fire({ title: 'Gagal!', text: e.message || "Gagal update password.", icon: 'error' });
      } finally {
          setIsUpdatingPass(false);
      }
  };

  // Filter khusus non-admin agar dashboard admin fokus pada pengguna
  const nonAdminUsers = users.filter(u => u.role !== 'admin');
  const totalUserCount = nonAdminUsers.length;
  const activeCount = nonAdminUsers.filter(u => u.status === 'active').length;
  const pendingCount = nonAdminUsers.filter(u => u.status === 'pending').length;
  const totalGenerations = nonAdminUsers.reduce((sum, user) => sum + (user.generationCount || 0), 0);

  // Pencarian yang aman terhadap nilai null/undefined
  const lowerSearch = searchTerm.trim().toLowerCase();
  const filteredUsers = nonAdminUsers.filter(u => {
      const nameMatch = (u.name || '').toLowerCase().includes(lowerSearch);
      const emailMatch = (u.email || '').toLowerCase().includes(lowerSearch);
      const userMatch = (u.username || '').toLowerCase().includes(lowerSearch);
      const matchSearch = !lowerSearch || nameMatch || emailMatch || userMatch;
      
      if (!matchSearch) return false;
      if (userTab === 'ALL') return true;
      if (userTab === 'ACTIVE') return u.status === 'active';
      if (userTab === 'PENDING') return u.status === 'pending';
      return true;
  });

  // Cek apakah ada pencarian yang cocok di tab lain saat tab aktif kosong
  const matchInOtherTab = lowerSearch && filteredUsers.length === 0 && nonAdminUsers.some(u => 
      (u.name || '').toLowerCase().includes(lowerSearch) || 
      (u.email || '').toLowerCase().includes(lowerSearch) ||
      (u.username || '').toLowerCase().includes(lowerSearch)
  );

  const copySqlToClipboard = () => {
      const sqlText = `-- Jalankan di Supabase Dashboard > SQL Editor
CREATE OR REPLACE FUNCTION public.sync_orphaned_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  recovered_count integer := 0;
BEGIN
  INSERT INTO public.profiles (id, email, name, username, role, status, joined_date, last_login, generation_count, password_text)
  SELECT 
    au.id, au.email, 
    COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)), 
    COALESCE(au.raw_user_meta_data->>'username', split_part(au.email, '@', 1)), 
    'user', 'active', au.created_at, au.last_sign_in_at, 0,
    COALESCE(au.raw_user_meta_data->>'password_text', '123456')
  FROM auth.users au
  LEFT JOIN public.profiles p ON au.id = p.id
  WHERE p.id IS NULL
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  GET DIAGNOSTICS recovered_count = ROW_COUNT;
  RETURN recovered_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.sync_orphaned_users TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = target_user_id;
  DELETE FROM public.profiles WHERE id = target_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_user TO authenticated;

SELECT public.sync_orphaned_users();`;

      navigator.clipboard.writeText(sqlText);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
      toast.fire({ icon: 'success', title: 'Script SQL Berhasil Disalin!' });
  };

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden text-[#1f1f1f] font-sans">
      <header className="bg-white border-b border-slate-200 relative h-16 flex-none z-50 px-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 select-none">
            <span className="text-blue-600"><GraduationCap size={28} /></span>
            <div><h1 className="text-lg font-bold text-slate-800 uppercase leading-none">PAKAR MODUL AJAR</h1><span className="text-[10px] text-slate-500 font-medium">Admin Portal</span></div>
          </div>
          <div className="flex items-center gap-4">
             <div className="hidden md:flex items-center gap-2 mr-4">
                 <div className="text-right"><div className="text-sm font-bold text-slate-700">Administrator</div><div className="text-[10px] text-green-600 font-medium bg-green-50 px-2 rounded-full inline-block">Online</div></div>
                 <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 border border-slate-200"><Key size={18} /></div>
             </div>
             <button onClick={onLogout} className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 font-medium px-4 py-2 rounded-lg transition-colors"><LogOut size={16} /> Keluar</button>
          </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
          <aside className="w-64 bg-white border-r border-slate-200 flex flex-col flex-none h-full">
              <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-4 mt-2">Main Menu</div>
                  <button onClick={() => setActiveTab('DASHBOARD')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'DASHBOARD' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><LayoutDashboard size={18} /><span>Dashboard</span></button>
                  <button onClick={() => setActiveTab('USERS')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'USERS' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><Users size={18} /><span>Daftar Pengguna ({totalUserCount})</span></button>
                  <button onClick={() => setActiveTab('SETTINGS')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'SETTINGS' ? 'bg-blue-50 text-blue-600 font-bold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><Settings size={18} /><span>Pengaturan</span></button>
              </nav>
              <div className="p-4 border-t border-slate-200 bg-slate-50 mt-auto">
                   <button onClick={onGoToApp} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"><ExternalLink size={18} /> LIHAT APLIKASI</button>
              </div>
          </aside>

          <main className="flex-1 overflow-y-auto bg-slate-100 p-8 relative">
              {activeTab === 'DASHBOARD' && (
                  <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
                      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
                          <div className="absolute right-0 top-0 opacity-10 transform translate-x-10 -translate-y-10"><Activity size={200} /></div>
                          <h2 className="text-3xl font-bold mb-2 relative z-10">Statistik Sistem</h2>
                          <p className="text-blue-100 max-w-2xl relative z-10">Pantau performa aplikasi dan aktivitas pengguna secara real-time.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition">
                              <div className="flex justify-between items-start mb-4">
                                  <div className="text-slate-500 text-xs font-bold uppercase">Total User Terdaftar</div>
                                  <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><Users size={20} /></div>
                              </div>
                              <div className="text-4xl font-black text-slate-800">{totalUserCount}</div>
                              <div className="text-xs text-slate-500 font-medium mt-2 flex items-center gap-2">
                                  <span className="text-green-600 font-bold flex items-center gap-0.5"><CheckCircle size={12} /> {activeCount} Aktif</span>
                                  <span>•</span>
                                  <span className="text-amber-600 font-bold flex items-center gap-0.5"><Clock size={12} /> {pendingCount} Pending</span>
                              </div>
                          </div>
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition">
                              <div className="flex justify-between items-start mb-4">
                                  <div className="text-slate-500 text-xs font-bold uppercase">Total Generate Modul</div>
                                  <div className="bg-purple-50 p-2 rounded-lg text-purple-600"><Zap size={20} /></div>
                              </div>
                              <div className="text-4xl font-black text-slate-800">{totalGenerations}</div>
                              <div className="text-xs text-purple-600 font-medium mt-2 flex items-center gap-1"><TrendingUp size={12} /> Akumulasi Seluruh User</div>
                          </div>
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition">
                              <div className="flex justify-between items-start mb-4">
                                  <div className="text-slate-500 text-xs font-bold uppercase">Antrian Aktivasi</div>
                                  <div className="bg-orange-50 p-2 rounded-lg text-orange-600"><Clock size={20} /></div>
                              </div>
                              <div className="text-4xl font-black text-slate-800">{pendingCount}</div>
                              <div className="text-xs text-orange-600 font-medium mt-2">Menunggu Persetujuan</div>
                          </div>
                      </div>

                      {/* Kotak Info Ringkas untuk Admin */}
                      <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Sparkles size={20} /></div>
                              <div>
                                  <h4 className="font-bold text-slate-800 text-sm">Sinkronisasi Database Otomatis</h4>
                                  <p className="text-xs text-slate-600 mt-0.5">Semua data akun ({totalUserCount} pengguna) ditampilkan utuh. Jika ada akun yang pernah dihapus lama atau tertinggal di Auth, Anda dapat memulihkannya kapan saja.</p>
                              </div>
                          </div>
                          <button onClick={handleSyncOrphaned} disabled={isSyncing} className="bg-white text-blue-600 hover:bg-blue-100 border border-blue-200 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition whitespace-nowrap">
                              <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                              {isSyncing ? "Menyinkronkan..." : "Sinkronkan Akun"}
                          </button>
                      </div>
                  </div>
              )}

              {activeTab === 'USERS' && (
                  <div className="space-y-6 animate-fade-in max-w-[95%] mx-auto">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                  <Users size={24} className="text-blue-600" />
                                  Manajemen Pengguna
                                  <span className="text-xs bg-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full font-bold">Total: {totalUserCount}</span>
                              </h2>
                              <p className="text-xs text-slate-500 mt-1">Kelola data, aktivasi akun baru, dan pantau status login pengguna.</p>
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-2">
                            <button 
                                onClick={handleSyncOrphaned} 
                                disabled={isSyncing} 
                                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition"
                                title="Periksa dan pulihkan akun yang ada di sistem Auth ke tabel profil"
                            >
                                <RefreshCw size={15} className={isSyncing ? "animate-spin" : ""} />
                                <span>{isSyncing ? "Sinkron..." : "Sinkron & Pulihkan Akun"}</span>
                            </button>

                            <button 
                                onClick={() => setShowSqlModal(true)} 
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
                                title="Buka panduan script SQL perbaikan jika ada error auth"
                            >
                                <FileCode size={15} />
                                <span>Script SQL</span>
                            </button>

                            <button 
                                onClick={refreshData} 
                                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
                            >
                                <Activity size={15} />
                                <span>Refresh</span>
                            </button>

                            <button 
                                onClick={() => setIsAddingUser(true)} 
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                            >
                                <Plus size={16} />
                                <span>Tambah User</span>
                            </button>
                          </div>
                      </div>
                      
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                          {/* TAB NAVIGASI STATUS PENGGUNA */}
                          <div className="flex border-b border-slate-200 bg-slate-50/50">
                              <button 
                                  onClick={() => setUserTab('ALL')} 
                                  className={`flex-1 py-3 text-sm font-bold transition flex items-center justify-center gap-2 ${userTab === 'ALL' ? 'bg-white text-blue-600 border-b-2 border-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                              >
                                  <span>Semua Pengguna</span>
                                  <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{totalUserCount}</span>
                              </button>
                              <button 
                                  onClick={() => setUserTab('ACTIVE')} 
                                  className={`flex-1 py-3 text-sm font-bold transition flex items-center justify-center gap-2 ${userTab === 'ACTIVE' ? 'bg-white text-emerald-600 border-b-2 border-emerald-600 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                              >
                                  <CheckCircle size={14} className="text-emerald-600" />
                                  <span>Pengguna Aktif</span>
                                  <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">{activeCount}</span>
                              </button>
                              <button 
                                  onClick={() => setUserTab('PENDING')} 
                                  className={`flex-1 py-3 text-sm font-bold transition flex items-center justify-center gap-2 ${userTab === 'PENDING' ? 'bg-white text-amber-600 border-b-2 border-amber-600 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}
                              >
                                  <Clock size={14} className="text-amber-600" />
                                  <span>Antrian Aktivasi</span>
                                  <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{pendingCount}</span>
                              </button>
                          </div>

                          <div className="p-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                                  <div className="relative flex-1 max-w-md">
                                      <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                      <input 
                                          type="text" 
                                          placeholder="Cari nama, email, atau username..." 
                                          value={searchTerm} 
                                          onChange={e => setSearchTerm(e.target.value)} 
                                          className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white" 
                                      />
                                      {searchTerm && (
                                          <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"><X size={15} /></button>
                                      )}
                                  </div>

                                  <div className="text-xs text-slate-500">
                                      Menampilkan <strong className="text-slate-800">{filteredUsers.length}</strong> dari {totalUserCount} pengguna
                                  </div>
                              </div>

                              {/* Pemberitahuan jika hasil ditemukan di tab lain */}
                              {matchInOtherTab && (
                                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-800 animate-fade-in">
                                      <div className="flex items-center gap-2">
                                          <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
                                          <span>Akun yang dicari tidak ada di tab ini, tetapi ditemukan di tab status lain!</span>
                                      </div>
                                      <button onClick={() => setUserTab('ALL')} className="font-bold underline text-amber-900 hover:text-amber-700 ml-3 whitespace-nowrap">
                                          Buka Tab Semua Pengguna &rarr;
                                      </button>
                                  </div>
                              )}

                              <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse min-w-[1000px]">
                                      <thead>
                                          <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                              <th className="p-3 font-bold border-b text-center w-12">No</th>
                                              <th className="p-3 font-bold border-b text-center">Status</th>
                                              <th className="p-3 font-bold border-b">Nama & Username</th>
                                              <th className="p-3 font-bold border-b">Email</th>
                                              <th className="p-3 font-bold border-b">Password (PT)</th>
                                              <th className="p-3 font-bold border-b text-center">Gen</th>
                                              <th className="p-3 font-bold border-b">Aktivitas Terakhir</th>
                                              <th className="p-3 font-bold border-b">Bergabung</th>
                                              <th className="p-3 font-bold border-b text-center">Aksi</th>
                                          </tr>
                                      </thead>
                                      <tbody className="text-sm">
                                          {filteredUsers.length > 0 ? filteredUsers.map((user, index) => (
                                              <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                                                  <td className="p-3 border-b text-center text-slate-400 text-xs font-mono">{index + 1}</td>
                                                  <td className="p-3 border-b text-center">
                                                      <div className="flex flex-col items-center gap-1">
                                                          {user.status === 'active' ? (
                                                              <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1">
                                                                  <CheckCircle size={11} /> Aktif
                                                              </span>
                                                          ) : (
                                                              <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 animate-pulse">
                                                                  <Clock size={11} /> Pending
                                                              </span>
                                                          )}
                                                          <div className="flex items-center gap-1 text-[9px] text-slate-400">
                                                              <Circle size={7} className={isUserOnline(user.lastLogin || '') ? 'fill-green-500 text-green-500' : 'fill-slate-300 text-slate-300'} />
                                                              <span>{isUserOnline(user.lastLogin || '') ? 'ONLINE' : 'OFFLINE'}</span>
                                                          </div>
                                                      </div>
                                                  </td>
                                                  <td className="p-3 border-b">
                                                      <div className="flex flex-col">
                                                          <span className="font-bold text-slate-800">{user.name}</span>
                                                          <span className="text-xs text-slate-400 font-mono">@{user.username || user.email.split('@')[0]}</span>
                                                      </div>
                                                  </td>
                                                  <td className="p-3 border-b">
                                                      <span className="text-slate-600 font-medium text-xs">{user.email}</span>
                                                  </td>
                                                  <td className="p-3 border-b">
                                                      <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded text-slate-700 border border-slate-200">{user.password || '-'}</span>
                                                  </td>
                                                  <td className="p-3 border-b text-center">
                                                      <div className="bg-purple-50 text-purple-700 px-2.5 py-1 rounded-md font-bold text-xs inline-block border border-purple-100">
                                                          {user.generationCount || 0}
                                                      </div>
                                                  </td>
                                                  <td className="p-3 border-b">
                                                      <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                                                          <Clock size={13} className="text-slate-400" />
                                                          <span>{getRelativeTime(user.lastLogin || '')}</span>
                                                      </div>
                                                  </td>
                                                  <td className="p-3 border-b text-slate-500 text-xs">
                                                      {new Date(user.joinedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                  </td>
                                                  <td className="p-3 border-b">
                                                      <div className="flex justify-center items-center gap-1.5">
                                                          {user.status === 'pending' ? (
                                                              <button 
                                                                  onClick={() => handleUpdateStatus(user, 'active')} 
                                                                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg transition text-xs font-bold flex items-center gap-1 shadow-sm"
                                                                  title="Aktifkan Akun Ini"
                                                              >
                                                                  <CheckCircle size={13} />
                                                                  <span>Aktifkan</span>
                                                              </button>
                                                          ) : (
                                                              <button 
                                                                  onClick={() => handleUpdateStatus(user, 'pending')} 
                                                                  className="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 p-1.5 rounded-lg transition" 
                                                                  title="Nonaktifkan (Pindah ke Pending)"
                                                              >
                                                                  <XCircle size={15} />
                                                              </button>
                                                          )}
                                                          <button 
                                                              onClick={() => handleEditClick(user)} 
                                                              className="bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 p-1.5 rounded-lg transition" 
                                                              title="Edit Data Pengguna"
                                                          >
                                                              <Edit2 size={15} />
                                                          </button>
                                                          <button 
                                                              onClick={() => handleDeleteUser(user)} 
                                                              className="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 p-1.5 rounded-lg transition" 
                                                              title="Hapus Akun Pengguna"
                                                          >
                                                              <Trash2 size={15} />
                                                          </button>
                                                      </div>
                                                  </td>
                                              </tr>
                                          )) : (
                                              <tr>
                                                  <td colSpan={9} className="p-12 text-center">
                                                      <div className="flex flex-col items-center gap-2 text-slate-400">
                                                          <Search size={36} className="text-slate-300" />
                                                          <span className="font-medium text-sm">Tidak ada data pengguna ditemukan.</span>
                                                          {searchTerm && (
                                                              <button onClick={() => { setSearchTerm(''); setUserTab('ALL'); }} className="text-xs text-blue-600 font-bold hover:underline mt-1">
                                                                  Reset Pencarian & Tampilkan Semua Pengguna
                                                              </button>
                                                          )}
                                                      </div>
                                                  </td>
                                              </tr>
                                          )}
                                      </tbody>
                                  </table>
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {activeTab === 'SETTINGS' && (
                  <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
                      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Settings size={20} className="text-blue-600" /> Pengaturan Aplikasi</h2>
                          <form onSubmit={handleSaveSettings} className="space-y-4">
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Link Promo / Landing Page</label><input type="text" value={settings.promoLink} onChange={e => setAppSettings({...settings, promoLink: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" /></div>
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Nomor WhatsApp Admin (Aktivasi)</label><input type="text" value={settings.whatsappNumber} onChange={e => setAppSettings({...settings, whatsappNumber: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" /></div>
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Link Social Media</label><input type="text" value={settings.socialMediaLink} onChange={e => setAppSettings({...settings, socialMediaLink: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" /></div>
                              <div className="pt-2"><button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition shadow-sm text-sm">Simpan Konfigurasi</button></div>
                          </form>
                      </div>

                      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Lock size={20} className="text-red-600" /> Ubah Kata Sandi Admin</h2>
                          <form onSubmit={handleUpdateAdminPassword} className="space-y-4">
                              <div className="relative">
                                  <label className="block text-xs font-bold text-slate-500 mb-1">Kata Sandi Baru</label>
                                  <input 
                                      type="password" 
                                      value={newAdminPassword} 
                                      onChange={e => setNewAdminPassword(e.target.value)} 
                                      className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-red-500 outline-none" 
                                      placeholder="Minimal 6 karakter"
                                  />
                              </div>
                              <div className="pt-2">
                                  <button 
                                      type="submit" 
                                      disabled={isUpdatingPass} 
                                      className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition shadow-sm text-sm flex items-center gap-2"
                                  >
                                      {isUpdatingPass && <Loader2 size={16} className="animate-spin" />}
                                      Update Kata Sandi
                                  </button>
                              </div>
                          </form>
                      </div>
                  </div>
              )}
          </main>

          {/* MODAL TAMBAH PENGGUNA BARU */}
          {isAddingUser && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden animate-fade-in-up">
                      <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
                          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                              <Plus size={20} className="text-blue-600" /> 
                              Tambah Pengguna Baru
                          </h3>
                          <button onClick={() => setIsAddingUser(false)} className="text-slate-400 hover:text-slate-600 transition"><X size={22} /></button>
                      </div>
                      <div className="p-6">
                          <form onSubmit={handleAddUser} className="space-y-4">
                              <div>
                                  <label className="block text-xs font-bold text-slate-600 mb-1">Nama Lengkap *</label>
                                  <input 
                                      type="text" 
                                      value={newUser.name} 
                                      onChange={e => setNewUser({...newUser, name: e.target.value})} 
                                      placeholder="Contoh: Dra. Hj. Siti Aminah" 
                                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" 
                                      required 
                                  />
                              </div>

                              <div>
                                  <label className="block text-xs font-bold text-slate-600 mb-1">Email Pengguna *</label>
                                  <input 
                                      type="email" 
                                      value={newUser.email} 
                                      onChange={e => setNewUser({...newUser, email: e.target.value})} 
                                      placeholder="guru@sekolah.sch.id" 
                                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" 
                                      required 
                                  />
                              </div>

                              <div>
                                  <label className="block text-xs font-bold text-slate-600 mb-1">Username (Opsional)</label>
                                  <input 
                                      type="text" 
                                      value={newUser.username} 
                                      onChange={e => setNewUser({...newUser, username: e.target.value})} 
                                      placeholder="Otomatis diambil dari email jika kosong" 
                                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs" 
                                  />
                              </div>

                              <div>
                                  <div className="flex justify-between items-center mb-1">
                                      <label className="block text-xs font-bold text-slate-600">Password *</label>
                                      <button type="button" onClick={handleGeneratePassword} className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1">
                                          <Sparkles size={12} /> Acak Password
                                      </button>
                                  </div>
                                  <input 
                                      type="text" 
                                      value={newUser.password} 
                                      onChange={e => setNewUser({...newUser, password: e.target.value})} 
                                      placeholder="Minimal 6 karakter" 
                                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono" 
                                      required 
                                  />
                              </div>

                              <div>
                                  <label className="block text-xs font-bold text-slate-600 mb-1">Status Awal Akun</label>
                                  <select 
                                      value={newUser.status} 
                                      onChange={e => setNewUser({...newUser, status: e.target.value})} 
                                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                  >
                                      <option value="active">Aktif (Bisa Langsung Login & Akses Generator)</option>
                                      <option value="pending">Pending (Menunggu Persetujuan Aktivasi)</option>
                                  </select>
                              </div>

                              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                                  <button type="button" onClick={() => setIsAddingUser(false)} className="px-5 py-2.5 text-slate-600 font-bold text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition">Batal</button>
                                  <button type="submit" disabled={isSubmittingUser} className="px-6 py-2.5 text-white font-bold text-sm bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 shadow-md transition disabled:opacity-50">
                                      {isSubmittingUser && <Loader2 size={16} className="animate-spin" />}
                                      <span>Simpan & Daftarkan</span>
                                  </button>
                              </div>
                          </form>
                      </div>
                  </div>
              </div>
          )}

          {/* MODAL EDIT PENGGUNA */}
          {editingUser && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden animate-fade-in-up">
                      <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
                          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><Edit2 size={20} className="text-blue-600" /> Edit Pengguna</h3>
                          <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600 transition"><X size={22} /></button>
                      </div>
                      <div className="p-6">
                          <form onSubmit={handleSaveEditUser} className="space-y-4">
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Nama Lengkap</label><input type="text" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" required /></div>
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Username</label><input type="text" value={editFormData.username} onChange={e => setEditFormData({...editFormData, username: e.target.value})} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" required /></div>
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Email</label><input type="email" value={editFormData.email} onChange={e => setEditFormData({...editFormData, email: e.target.value})} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" required /></div>
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Kata Sandi (PT)</label><input type="text" value={editFormData.password} onChange={e => setEditFormData({...editFormData, password: e.target.value})} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono" /></div>
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Status Akun</label><select value={editFormData.status} onChange={e => setEditFormData({...editFormData, status: e.target.value})} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"><option value="active">Aktif</option><option value="pending">Pending</option></select></div>
                              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                                  <button type="button" onClick={() => setEditingUser(null)} className="px-5 py-2.5 text-slate-600 font-bold text-sm bg-slate-100 hover:bg-slate-200 rounded-lg">Batal</button>
                                  <button type="submit" disabled={isSubmittingEdit} className="px-6 py-2.5 text-white font-bold text-sm bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 shadow-md">{isSubmittingEdit && <Loader2 size={16} className="animate-spin" />} Simpan Perubahan</button>
                              </div>
                          </form>
                      </div>
                  </div>
              </div>
          )}

          {/* MODAL PANDUAN SQL SINKRONISASI */}
          {showSqlModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden animate-fade-in-up">
                      <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
                          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                              <ShieldCheck size={20} className="text-indigo-600" />
                              Solusi & Panduan Akun Supabase
                          </h3>
                          <button onClick={() => setShowSqlModal(false)} className="text-slate-400 hover:text-slate-600 transition"><X size={22} /></button>
                      </div>
                      <div className="p-6 space-y-4 text-xs text-slate-600">
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-blue-900 space-y-2">
                              <h4 className="font-bold text-sm flex items-center gap-1.5">
                                  <AlertCircle size={16} className="text-blue-600" />
                                  Mengapa Akun Terasa Hilang atau Muncul "Sudah Terdaftar"?
                              </h4>
                              <ul className="list-disc list-inside space-y-1 text-xs">
                                  <li><strong>Berada di Antrian Aktivasi:</strong> Akun baru sering kali masuk ke status <em>Pending</em> sehingga tidak terlihat jika Anda hanya membuka tab <em>Pengguna Aktif</em>. Tab <strong>Semua Pengguna</strong> kini menampilkan seluruh akun.</li>
                                  <li><strong>Tertinggal di Supabase Auth:</strong> Penghapusan akun lama hanya menghapus baris di tabel profil, namun email masih tercatat di sistem Auth Supabase.</li>
                              </ul>
                          </div>

                          <div>
                              <div className="flex justify-between items-center mb-1.5">
                                  <span className="font-bold text-slate-700">Script SQL Sinkronisasi & Fix Lengkap:</span>
                                  <button onClick={copySqlToClipboard} className="text-blue-600 font-bold flex items-center gap-1 hover:underline">
                                      {copiedSql ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                                      <span>{copiedSql ? "Tersalin!" : "Salin Script"}</span>
                                  </button>
                              </div>
                              <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-[11px] overflow-x-auto max-h-48 border border-slate-800">
{`-- Jalankan script ini di: Supabase Dashboard > SQL Editor > Run
CREATE OR REPLACE FUNCTION public.sync_orphaned_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE recovered_count integer := 0;
BEGIN
  INSERT INTO public.profiles (id, email, name, username, role, status, joined_date, last_login, generation_count, password_text)
  SELECT 
    au.id, au.email, 
    COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)), 
    COALESCE(au.raw_user_meta_data->>'username', split_part(au.email, '@', 1)), 
    'user', 'active', au.created_at, au.last_sign_in_at, 0,
    COALESCE(au.raw_user_meta_data->>'password_text', '123456')
  FROM auth.users au
  LEFT JOIN public.profiles p ON au.id = p.id
  WHERE p.id IS NULL
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  GET DIAGNOSTICS recovered_count = ROW_COUNT;
  RETURN recovered_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.sync_orphaned_users TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = target_user_id;
  DELETE FROM public.profiles WHERE id = target_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_user TO authenticated;

SELECT public.sync_orphaned_users();`}
                              </pre>
                              <p className="text-[11px] text-slate-400 mt-1">Script lengkap ini juga tersimpan di file <strong>SUPABASE_FIX_USERS_AND_SYNC.sql</strong>.</p>
                          </div>

                          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                              <button onClick={() => setShowSqlModal(false)} className="px-5 py-2 text-slate-600 font-bold text-xs bg-slate-100 hover:bg-slate-200 rounded-lg">Tutup</button>
                              <button onClick={copySqlToClipboard} className="px-5 py-2 text-white font-bold text-xs bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5 shadow-sm">
                                  {copiedSql ? <Check size={14} /> : <Copy size={14} />}
                                  <span>{copiedSql ? "Berhasil Disalin" : "Salin Script SQL"}</span>
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default AdminDashboard;
