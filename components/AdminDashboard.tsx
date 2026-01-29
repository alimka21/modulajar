import React, { useState, useEffect, useRef } from 'react';
import { User, AppSettings } from '../types';
import { getUsers, saveUser, updateUser, deleteUser, getSettings, saveSettings, getAllGenerationStats } from '../services/storageService';
import { swal, toast } from '../services/notificationService';
import { LogOut, Users, Settings, LayoutDashboard, Plus, Trash2, Edit2, CheckCircle, XCircle, Search, Mail, Lock, User as UserIcon, ShieldCheck, Loader2, X, ExternalLink, Activity, BarChart3, AtSign, Zap, GraduationCap, TrendingUp, Key } from 'lucide-react';

declare var Chart: any;

interface AdminDashboardProps {
  onLogout: () => void;
  onGoToApp: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout, onGoToApp }) => {
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'USERS' | 'SETTINGS'>('DASHBOARD');
  const [users, setUsers] = useState<User[]>([]);
  const [genStats, setGenStats] = useState<string[]>([]); // New state for raw generation timestamps
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setAppSettings] = useState<AppSettings>({ promoLink: '', whatsappNumber: '', socialMediaLink: '' });
  
  // User Management State
  const [userTab, setUserTab] = useState<'ACTIVE' | 'PENDING'>('ACTIVE');
  const [searchTerm, setSearchTerm] = useState('');
  
  // ADD User State
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', username: '', email: '', password: '' });

  // EDIT User State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState({ name: '', username: '', email: '', password: '', status: '' });
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Admin Profile State
  const [adminCreds, setAdminCreds] = useState({ username: '', newPassword: '' });

  // Chart Refs
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);
  
  const genChartRef = useRef<HTMLCanvasElement>(null);
  const genChartInstance = useRef<any>(null);

  useEffect(() => {
      refreshData();
  }, []);

  // Initialize Charts when Dashboard tab is active and data is loaded
  useEffect(() => {
      if (activeTab === 'DASHBOARD' && users.length > 0) {
          if (chartRef.current) initRegistrationChart();
          if (genChartRef.current) initGenerationChart();
      }
      return () => {
          if (chartInstance.current) chartInstance.current.destroy();
          if (genChartInstance.current) genChartInstance.current.destroy();
      };
  }, [activeTab, users, genStats]); // Re-render when genStats changes

  const refreshData = async () => {
      setIsLoading(true);
      try {
        // Parallel fetch for speed
        const [allUsers, allGenStats] = await Promise.all([
            getUsers(),
            getAllGenerationStats()
        ]);
        
        setUsers(allUsers);
        setGenStats(allGenStats);
        setAppSettings(getSettings());
        
        const admin = allUsers.find(u => u.role === 'admin');
        if (admin) {
            setAdminCreds(prev => ({ ...prev, username: admin.email }));
        }
      } catch (error) {
          console.error("Failed to refresh data", error);
      } finally {
          setIsLoading(false);
      }
  };

  const formatDate = (dateString: string) => {
      if (!dateString) return "-";
      try {
          const date = new Date(dateString);
          return date.toLocaleDateString('id-ID', {
              day: '2-digit',
              month: 'long',
              year: 'numeric'
          });
      } catch (e) {
          return dateString;
      }
  };

  const formatDateTime = (dateString: string) => {
      if (!dateString) return "-";
      try {
          const date = new Date(dateString);
          return date.toLocaleString('id-ID', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
          }).replace('.', ':');
      } catch (e) {
          return dateString;
      }
  };

  const initRegistrationChart = () => {
      if (!chartRef.current) return;
      
      const counts: Record<string, number> = {};
      const today = new Date();
      // Last 7 Days
      for(let i=6; i>=0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const key = d.toISOString().split('T')[0];
          counts[key] = 0;
      }

      users.forEach(u => {
          if(u.role !== 'admin' && u.joinedDate) {
              const dateKey = u.joinedDate.split('T')[0];
              if (counts[dateKey] !== undefined) {
                  counts[dateKey]++;
              }
          }
      });

      const labels = Object.keys(counts).map(k => {
          const [y, m, d] = k.split('-');
          return `${d}/${m}`;
      });
      const data = Object.values(counts);

      if (chartInstance.current) chartInstance.current.destroy();

      const ctx = chartRef.current.getContext('2d');
      chartInstance.current = new Chart(ctx, {
          type: 'line',
          data: {
              labels: labels,
              datasets: [{
                  label: 'Pendaftar Baru',
                  data: data,
                  borderColor: '#2563eb',
                  backgroundColor: 'rgba(37, 99, 235, 0.1)',
                  tension: 0.4,
                  fill: true,
                  pointBackgroundColor: '#2563eb',
                  pointRadius: 4
              }]
          },
          options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                  y: { beginAtZero: true, ticks: { stepSize: 1 } },
                  x: { grid: { display: false } }
              }
          }
      });
  };

  const initGenerationChart = () => {
      if (!genChartRef.current) return;

      // Group genStats (timestamps) by Date
      const counts: Record<string, number> = {};
      const today = new Date();
      // Last 7 Days
      for(let i=6; i>=0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const key = d.toISOString().split('T')[0];
          counts[key] = 0;
      }

      genStats.forEach(timestamp => {
          if (timestamp) {
              const dateKey = timestamp.split('T')[0];
              if (counts[dateKey] !== undefined) {
                  counts[dateKey]++;
              }
          }
      });

      const labels = Object.keys(counts).map(k => {
          const [y, m, d] = k.split('-');
          return `${d}/${m}`;
      });
      const data = Object.values(counts);

      if (genChartInstance.current) genChartInstance.current.destroy();

      const ctx = genChartRef.current.getContext('2d');
      genChartInstance.current = new Chart(ctx, {
          type: 'bar',
          data: {
              labels: labels,
              datasets: [{
                  label: 'Total Generate',
                  data: data,
                  backgroundColor: '#9333ea', // Purple
                  borderRadius: 4,
                  barThickness: 24
              }]
          },
          options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { 
                  legend: { display: false },
                  tooltip: {
                      callbacks: {
                          label: (context: any) => `Volume: ${context.raw} Modul`
                      }
                  }
              },
              scales: {
                  y: { beginAtZero: true, ticks: { stepSize: 1 } },
                  x: { grid: { display: false } }
              }
          }
      });
  };

  const handleUpdateStatus = (user: User, status: 'active' | 'pending') => {
      swal.fire({
          title: status === 'active' ? 'Aktifkan Pengguna?' : 'Nonaktifkan Pengguna?',
          text: `Apakah Anda yakin ingin mengubah status ${user.name}?`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: '#2563eb',
          confirmButtonText: 'Ya, Ubah'
      }).then(async (result: any) => {
          if (result.isConfirmed) {
              const updatedUsers = users.map(u => u.id === user.id ? { ...u, status: status } : u);
              setUsers(updatedUsers);
              try {
                  await updateUser({ ...user, status });
                  toast.fire({ icon: 'success', title: 'Status Diperbarui', text: `Pengguna berhasil diubah menjadi ${status === 'active' ? 'Aktif' : 'Pending'}.` });
              } catch (error) {
                  refreshData();
                  toast.fire({ icon: 'error', title: 'Gagal Update', text: 'Pastikan Anda sudah menjalankan script SQL Policy di Supabase.' });
              }
          }
      });
  };

  const handleDeleteUser = (id: string) => {
      swal.fire({
          title: 'Hapus Pengguna?',
          text: "Data yang dihapus tidak dapat dikembalikan!",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ef4444',
          confirmButtonText: 'Ya, Hapus'
      }).then(async (result: any) => {
          if (result.isConfirmed) {
              const previousUsers = [...users];
              setUsers(users.filter(u => u.id !== id));
              try {
                  await deleteUser(id);
                  swal.fire('Terhapus!', 'Data pengguna telah dihapus.', 'success');
              } catch (error) {
                  setUsers(previousUsers);
                  toast.fire({ icon: 'error', title: 'Gagal Menghapus', text: 'Terjadi kesalahan server.' });
              }
          }
      });
  };

  const handleAddUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (newUser.password.length < 6) {
          swal.fire({ title: 'Password Terlalu Pendek', text: 'Password harus minimal 6 karakter.', icon: 'warning', confirmButtonColor: '#f59e0b' });
          return;
      }
      setIsSubmittingUser(true);
      try {
        const user: User = {
            id: '',
            name: newUser.name,
            username: newUser.username || newUser.email.split('@')[0],
            email: newUser.email,
            password: newUser.password, 
            role: 'user', 
            status: 'active',
            joinedDate: new Date().toISOString(),
            lastLogin: '',
            generationCount: 0
        };
        await saveUser(user);
        setIsAddingUser(false);
        setNewUser({ name: '', username: '', email: '', password: '' });
        refreshData();
        swal.fire({ title: 'Berhasil!', text: 'Pengguna baru berhasil ditambahkan dan langsung Aktif.', icon: 'success', confirmButtonColor: '#2563eb' });
      } catch (error: any) {
        swal.fire({ title: 'Gagal!', text: error.message || "Email mungkin sudah terdaftar.", icon: 'error' });
      } finally {
        setIsSubmittingUser(false);
      }
  };

  const handleEditClick = (user: User) => {
      setEditingUser(user);
      setEditFormData({ name: user.name, username: user.username || '', email: user.email, password: '', status: user.status });
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingUser) return;
      setIsSubmittingEdit(true);
      try {
          const updatedUser: User = {
              ...editingUser,
              name: editFormData.name,
              username: editFormData.username,
              email: editFormData.email,
              status: editFormData.status as 'active' | 'pending'
          };
          setUsers(prev => prev.map(u => u.id === editingUser.id ? updatedUser : u));
          setEditingUser(null); 
          await updateUser(updatedUser);
          toast.fire({ icon: 'success', title: 'Data Berhasil Diupdate' });
      } catch (error: any) {
          refreshData();
          swal.fire({ title: 'Error!', text: 'Gagal mengupdate data pengguna. Cek console.', icon: 'error' });
      } finally {
          setIsSubmittingEdit(false);
      }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
      e.preventDefault();
      saveSettings(settings);
      swal.fire({ title: 'Tersimpan!', text: 'Pengaturan aplikasi berhasil disimpan.', icon: 'success', confirmButtonColor: '#2563eb' });
  };

  const activeCount = users.filter(u => u.status === 'active' && u.role !== 'admin').length;
  const pendingCount = users.filter(u => u.status === 'pending').length;
  const totalGenerations = users.reduce((acc, user) => acc + (user.generationCount || 0), 0);

  const filteredUsers = users.filter(u => {
      const lowerSearch = searchTerm.toLowerCase();
      const matchSearch = u.name.toLowerCase().includes(lowerSearch) || u.email.toLowerCase().includes(lowerSearch) || (u.username && u.username.toLowerCase().includes(lowerSearch));
      const matchRole = u.role !== 'admin';
      if (userTab === 'ACTIVE') return matchSearch && matchRole && u.status === 'active';
      return matchSearch && matchRole && u.status === 'pending';
  });

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
                 <div className="w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 border border-slate-200"><ShieldCheck size={18} /></div>
             </div>
             <button onClick={onLogout} className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 font-medium px-4 py-2 rounded-lg transition-colors"><LogOut size={16} /> Keluar</button>
          </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
          <aside className="w-64 bg-white border-r border-slate-200 flex flex-col flex-none h-full">
              <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-4 mt-2">Main Menu</div>
                  <button onClick={() => setActiveTab('DASHBOARD')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'DASHBOARD' ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><LayoutDashboard size={18} /><span>Dashboard</span></button>
                  <button onClick={() => setActiveTab('USERS')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'USERS' ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><Users size={18} /><span>Daftar Pengguna</span></button>
                  <button onClick={() => setActiveTab('SETTINGS')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'SETTINGS' ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><Settings size={18} /><span>Pengaturan</span></button>
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
                          <h2 className="text-3xl font-bold mb-2 relative z-10">Selamat Datang, Admin!</h2>
                          <p className="text-blue-100 max-w-2xl relative z-10">Ini adalah panel kontrol utama Anda. Pantau aktivitas pengguna dan kelola aplikasi.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition">
                              <div className="flex justify-between items-start mb-4">
                                  <div className="text-slate-500 text-xs font-bold uppercase">Total User Aktif</div>
                                  <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><Users size={20} /></div>
                              </div>
                              <div className="text-4xl font-black text-slate-800">{activeCount}</div>
                              <div className="text-xs text-green-600 font-medium mt-2 flex items-center gap-1"><Activity size={12} /> User terverifikasi</div>
                          </div>
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition">
                              <div className="flex justify-between items-start mb-4">
                                  <div className="text-slate-500 text-xs font-bold uppercase">Total Aktivitas (Gen)</div>
                                  <div className="bg-purple-50 p-2 rounded-lg text-purple-600"><Zap size={20} /></div>
                              </div>
                              <div className="text-4xl font-black text-slate-800">{totalGenerations}</div>
                              <div className="text-xs text-purple-600 font-medium mt-2">Kali Generate Modul</div>
                          </div>
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition">
                              <div className="flex justify-between items-start mb-4">
                                  <div className="text-slate-500 text-xs font-bold uppercase">Menunggu Konfirmasi</div>
                                  <div className="bg-orange-50 p-2 rounded-lg text-orange-600"><CheckCircle size={20} /></div>
                              </div>
                              <div className="text-4xl font-black text-slate-800">{pendingCount}</div>
                              <div className="text-xs text-orange-600 font-medium mt-2">Butuh tindakan segera</div>
                          </div>
                      </div>

                      {/* CHART GRID SECTION */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Pendaftar Baru Chart */}
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                              <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                                  <TrendingUp size={20} className="text-blue-600" />
                                  Statistik Pendaftar Baru
                              </h3>
                              <div className="h-64 w-full">
                                  <canvas ref={chartRef}></canvas>
                              </div>
                          </div>

                          {/* Top Generators Chart */}
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                              <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                                  <BarChart3 size={20} className="text-purple-600" />
                                  Aktivitas Generate Harian
                              </h3>
                              <div className="h-64 w-full">
                                  <canvas ref={genChartRef}></canvas>
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              {activeTab === 'USERS' && (
                  <div className="space-y-6 animate-fade-in max-w-[95%] mx-auto">
                      <div className="flex justify-between items-center">
                          <h2 className="text-xl font-bold text-slate-800">Master Data Pengguna</h2>
                          <div className="flex gap-2">
                            <button onClick={refreshData} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition"><Activity size={16} /> Refresh</button>
                            <button onClick={() => setIsAddingUser(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition"><Plus size={16} /> Tambah User</button>
                          </div>
                      </div>
                      {isLoading ? (
                        <div className="p-12 flex justify-center items-center bg-white rounded-xl shadow-sm border border-slate-200">
                           <div className="flex flex-col items-center gap-2 text-slate-500"><Loader2 className="animate-spin text-blue-600" size={32} /><span>Memuat data dari server...</span></div>
                        </div>
                      ) : (
                        <>
                        {isAddingUser && (
                            <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-lg mb-6 relative animate-fade-in-down">
                                {isSubmittingUser && <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center rounded-xl"><Loader2 className="animate-spin text-blue-600" size={32} /></div>}
                                <h3 className="font-bold text-base mb-4 text-slate-700">Tambah Pengguna Manual</h3>
                                <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                    <div><label className="block text-xs font-bold text-slate-500 mb-1">Nama Lengkap</label><input required type="text" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Nama User" /></div>
                                    <div><label className="block text-xs font-bold text-slate-500 mb-1">Username</label><input required type="text" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Username" /></div>
                                    <div><label className="block text-xs font-bold text-slate-500 mb-1">Email</label><input required type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" placeholder="email@contoh.com" /></div>
                                    <div><label className="block text-xs font-bold text-slate-500 mb-1">Password</label><input required type="text" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Min 6 karakter" /></div>
                                    <div className="flex gap-2 md:col-span-4 justify-end mt-2">
                                        <button type="button" onClick={() => setIsAddingUser(false)} disabled={isSubmittingUser} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50">Batal</button>
                                        <button type="submit" disabled={isSubmittingUser} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition disabled:opacity-50">Simpan Data</button>
                                    </div>
                                </form>
                            </div>
                        )}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="flex border-b border-slate-200">
                                <button onClick={() => setUserTab('ACTIVE')} className={`flex-1 py-3 text-sm font-bold transition ${userTab === 'ACTIVE' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>Pengguna Aktif ({activeCount})</button>
                                <button onClick={() => setUserTab('PENDING')} className={`flex-1 py-3 text-sm font-bold transition ${userTab === 'PENDING' ? 'bg-white text-orange-600 border-b-2 border-orange-600' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>Calon Pengguna ({pendingCount})</button>
                            </div>
                            <div className="p-4">
                                <div className="relative mb-4 max-w-md">
                                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                    <input type="text" placeholder="Cari Username, Nama atau Email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white" />
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[900px]">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase">
                                                <th className="p-3 font-bold border-b text-center w-12">No</th>
                                                <th className="p-3 font-bold border-b">Nama Pengguna</th>
                                                <th className="p-3 font-bold border-b">Username</th>
                                                <th className="p-3 font-bold border-b">Email</th>
                                                <th className="p-3 font-bold border-b">Password</th>
                                                <th className="p-3 font-bold border-b text-center">Jml Gen</th>
                                                <th className="p-3 font-bold border-b">Tgl Daftar</th>
                                                <th className="p-3 font-bold border-b">Login Terakhir</th>
                                                <th className="p-3 font-bold border-b text-center">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-sm">
                                            {filteredUsers.length > 0 ? filteredUsers.map((user, index) => (
                                                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-3 border-b text-center text-slate-500">{index + 1}</td>
                                                    <td className="p-3 border-b font-medium">{user.name}</td>
                                                    <td className="p-3 border-b text-blue-600 font-medium">{user.username || '-'}</td>
                                                    <td className="p-3 border-b text-slate-600">{user.email}</td>
                                                    <td className="p-3 border-b text-slate-600 font-mono bg-slate-100 px-2 rounded">{user.password || '****'}</td>
                                                    <td className="p-3 border-b text-center font-bold text-slate-700">{user.generationCount || 0}</td>
                                                    <td className="p-3 border-b text-slate-500">{formatDate(user.joinedDate)}</td>
                                                    <td className="p-3 border-b text-slate-500 text-xs">
                                                        {user.lastLogin ? formatDateTime(user.lastLogin) : 'Belum pernah'}
                                                    </td>
                                                    <td className="p-3 border-b">
                                                        <div className="flex justify-center gap-2">
                                                            {user.status === 'pending' ? <button onClick={() => handleUpdateStatus(user, 'active')} className="bg-green-100 text-green-700 p-1.5 rounded-md hover:bg-green-200 transition" title="Konfirmasi Aktif"><CheckCircle size={16} /></button> : <button onClick={() => handleUpdateStatus(user, 'pending')} className="bg-orange-100 text-orange-700 p-1.5 rounded-md hover:bg-orange-200 transition" title="Nonaktifkan"><XCircle size={16} /></button>}
                                                            <button onClick={() => handleEditClick(user)} className="bg-blue-100 text-blue-700 p-1.5 rounded-md hover:bg-blue-200 transition" title="Edit"><Edit2 size={16} /></button>
                                                            <button onClick={() => handleDeleteUser(user.id)} className="bg-red-100 text-red-700 p-1.5 rounded-md hover:bg-red-200 transition" title="Hapus"><Trash2 size={16} /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )) : <tr><td colSpan={9} className="p-8 text-center text-slate-400 italic">Tidak ada data pengguna.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        </>
                      )}
                  </div>
              )}

              {activeTab === 'SETTINGS' && (
                  <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
                      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Settings size={20} /> Pengaturan Aplikasi</h2>
                          <form onSubmit={handleSaveSettings} className="space-y-4">
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Link "Dapatkan Pakar Modul Ajar"</label><input type="text" value={settings.promoLink} onChange={e => setAppSettings({...settings, promoLink: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" /></div>
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Nomor WhatsApp Admin (untuk Pendaftaran)</label><input type="text" value={settings.whatsappNumber} onChange={e => setAppSettings({...settings, whatsappNumber: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Contoh: 62812345678" /></div>
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Link Sosial Media</label><input type="text" value={settings.socialMediaLink} onChange={e => setAppSettings({...settings, socialMediaLink: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" /></div>
                              <div className="pt-2"><button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition shadow-sm w-full md:w-auto text-sm">Simpan Pengaturan</button></div>
                          </form>
                      </div>
                  </div>
              )}
          </main>

          {editingUser && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                  <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden animate-fade-in-up">
                      <div className="flex justify-between items-center p-5 border-b border-slate-100">
                          <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><Edit2 size={20} className="text-blue-600" /> Edit Pengguna</h3>
                          <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600 transition"><X size={24} /></button>
                      </div>
                      <div className="p-6">
                          <form onSubmit={handleSaveEditUser} className="space-y-4">
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Nama Lengkap</label><input type="text" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" required /></div>
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Username</label><input type="text" value={editFormData.username} onChange={e => setEditFormData({...editFormData, username: e.target.value})} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" required /></div>
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Email</label><input type="email" value={editFormData.email} onChange={e => setEditFormData({...editFormData, email: e.target.value})} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none" required /></div>
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Status Akun</label><select value={editFormData.status} onChange={e => setEditFormData({...editFormData, status: e.target.value})} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"><option value="active">Aktif</option><option value="pending">Pending (Belum Dikonfirmasi)</option></select></div>
                              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                                  <button type="button" onClick={() => setEditingUser(null)} className="px-5 py-2.5 text-slate-600 font-bold text-sm bg-slate-100 hover:bg-slate-200 rounded-lg transition">Batal</button>
                                  <button type="submit" disabled={isSubmittingEdit} className="px-6 py-2.5 text-white font-bold text-sm bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition flex items-center gap-2 disabled:opacity-50">{isSubmittingEdit && <Loader2 size={16} className="animate-spin" />} Simpan Perubahan</button>
                              </div>
                          </form>
                      </div>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default AdminDashboard;