
import React, { useState, useEffect, useRef } from 'react';
import { User, AppSettings } from '../types';
import { getUsers, saveUser, updateUser, updateUserStatus, deleteUser, getSettings, saveSettings, getAllGenerationStats, updateAdminPassword } from '../services/storageService';
import { swal, toast } from '../services/notificationService';
import { LogOut, Users, Settings, LayoutDashboard, Plus, Trash2, Edit2, CheckCircle, XCircle, Search, Mail, Lock, User as UserIcon, ShieldCheck, Loader2, X, ExternalLink, Activity, BarChart3, AtSign, Zap, GraduationCap, TrendingUp, Key, Clock, Circle, Eye, EyeOff } from 'lucide-react';

declare var Chart: any;

interface AdminDashboardProps {
  onLogout: () => void;
  onGoToApp: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout, onGoToApp }) => {
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'USERS' | 'SETTINGS'>('DASHBOARD');
  const [users, setUsers] = useState<User[]>([]);
  const [genStats, setGenStats] = useState<string[]>([]); 
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setAppSettings] = useState<AppSettings>({ promoLink: '', whatsappNumber: '', socialMediaLink: '' });
  
  const [userTab, setUserTab] = useState<'ACTIVE' | 'PENDING'>('ACTIVE');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', username: '', email: '', password: '' });

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState({ name: '', username: '', email: '', password: '', status: '' });
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [isUpdatingPass, setIsUpdatingPass] = useState(false);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<any>(null);
  
  const genChartRef = useRef<HTMLCanvasElement>(null);
  const genChartInstance = useRef<any>(null);

  useEffect(() => {
      refreshData();
      const interval = setInterval(refreshData, 30000);
      return () => clearInterval(interval);
  }, []);

  useEffect(() => {
      if (activeTab === 'DASHBOARD' && users.length > 0) {
          if (chartRef.current) initRegistrationChart();
          if (genChartRef.current) initGenerationChart();
      }
      return () => {
          if (chartInstance.current) chartInstance.current.destroy();
          if (genChartInstance.current) genChartInstance.current.destroy();
      };
  }, [activeTab, users, genStats]);

  const refreshData = async () => {
      try {
        const [allUsers, allGenStats] = await Promise.all([
            getUsers(),
            getAllGenerationStats()
        ]);
        
        setUsers(allUsers);
        setGenStats(allGenStats);
        setAppSettings(getSettings());
      } catch (error) {
          console.error("Failed to refresh data (background)", error);
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

  const initRegistrationChart = () => {
      if (!chartRef.current) return;
      const counts: Record<string, number> = {};
      const today = new Date();
      for(let i=6; i>=0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const key = d.toISOString().split('T')[0];
          counts[key] = 0;
      }
      users.forEach(u => {
          if(u.role !== 'admin' && u.joinedDate) {
              const dateKey = u.joinedDate.split('T')[0];
              if (counts[dateKey] !== undefined) counts[dateKey]++;
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
      const counts: Record<string, number> = {};
      const today = new Date();
      for(let i=6; i>=0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const key = d.toISOString().split('T')[0];
          counts[key] = 0;
      }
      genStats.forEach(timestamp => {
          if (timestamp) {
              const dateKey = timestamp.split('T')[0];
              if (counts[dateKey] !== undefined) counts[dateKey]++;
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
                  label: 'Generate Harian',
                  data: data,
                  backgroundColor: '#9333ea', 
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
                      callbacks: { label: (context: any) => `Volume: ${context.raw} Modul` }
                  }
              },
              scales: {
                  y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
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
              // Optimistic update
              const updatedUsers = users.map(u => u.id === user.id ? { ...u, status: status } : u);
              setUsers(updatedUsers);
              
              try {
                  // Use new specific function
                  await updateUserStatus(user.id, status);
                  toast.fire({ icon: 'success', title: 'Status Diperbarui' });
                  
                  // Trigger refresh to ensure sync
                  refreshData();
              } catch (error: any) {
                  refreshData(); // Revert on error
                  // Display real error message to user
                  toast.fire({ 
                    icon: 'error', 
                    title: 'Gagal Update', 
                    text: error.message || "Periksa koneksi internet Anda." 
                  });
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
              } catch (error: any) {
                  setUsers(previousUsers);
                  toast.fire({ icon: 'error', title: 'Gagal Menghapus', text: error.message });
              }
          }
      });
  };

  const handleAddUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (newUser.password.length < 6) {
          swal.fire({ title: 'Password Terlalu Pendek', text: 'Password harus minimal 6 karakter.', icon: 'warning' });
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
        swal.fire({ title: 'Berhasil!', text: 'Pengguna baru berhasil ditambahkan.', icon: 'success' });
      } catch (error: any) {
        swal.fire({ title: 'Gagal!', text: error.message || "Terjadi kesalahan.", icon: 'error' });
      } finally {
        setIsSubmittingUser(false);
      }
  };

  const handleEditClick = (user: User) => {
      setEditingUser(user);
      setEditFormData({ name: user.name, username: user.username || '', email: user.email, password: user.password || '', status: user.status });
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
              password: editFormData.password,
              status: editFormData.status as 'active' | 'pending'
          };
          setUsers(prev => prev.map(u => u.id === editingUser.id ? updatedUser : u));
          setEditingUser(null); 
          await updateUser(updatedUser);
          toast.fire({ icon: 'success', title: 'Data Berhasil Diupdate' });
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

  const activeCount = users.filter(u => u.status === 'active' && u.role !== 'admin').length;
  const pendingCount = users.filter(u => u.status === 'pending').length;
  const totalGenerations = genStats.length;

  // REFRESH FILTERED USERS AUTOMATICALLY WHEN USERS STATE CHANGES
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
                          <h2 className="text-3xl font-bold mb-2 relative z-10">Statistik Sistem</h2>
                          <p className="text-blue-100 max-w-2xl relative z-10">Pantau performa aplikasi dan aktivitas pengguna secara real-time.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition">
                              <div className="flex justify-between items-start mb-4">
                                  <div className="text-slate-500 text-xs font-bold uppercase">Total User Terdaftar</div>
                                  <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><Users size={20} /></div>
                              </div>
                              <div className="text-4xl font-black text-slate-800">{activeCount}</div>
                              <div className="text-xs text-green-600 font-medium mt-2 flex items-center gap-1"><CheckCircle size={12} /> Akun Aktif</div>
                          </div>
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition">
                              <div className="flex justify-between items-start mb-4">
                                  <div className="text-slate-500 text-xs font-bold uppercase">Total Generate Modul</div>
                                  <div className="bg-purple-50 p-2 rounded-lg text-purple-600"><Zap size={20} /></div>
                              </div>
                              <div className="text-4xl font-black text-slate-800">{totalGenerations}</div>
                              <div className="text-xs text-purple-600 font-medium mt-2 flex items-center gap-1"><TrendingUp size={12} /> Seluruh Riwayat</div>
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

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                              <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                                  <TrendingUp size={20} className="text-blue-600" />
                                  Tren Pendaftar Baru (7 Hari)
                              </h3>
                              <div className="h-64 w-full">
                                  <canvas ref={chartRef}></canvas>
                              </div>
                          </div>

                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                              <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                                  <BarChart3 size={20} className="text-purple-600" />
                                  Volume Generate Harian (7 Hari)
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
                          <h2 className="text-xl font-bold text-slate-800">Manajemen Pengguna</h2>
                          <div className="flex gap-2">
                            <button onClick={refreshData} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition"><Activity size={16} /> Refresh</button>
                            <button onClick={() => setIsAddingUser(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition"><Plus size={16} /> Tambah User</button>
                          </div>
                      </div>
                      
                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                          <div className="flex border-b border-slate-200">
                              <button onClick={() => setUserTab('ACTIVE')} className={`flex-1 py-3 text-sm font-bold transition ${userTab === 'ACTIVE' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>Pengguna Aktif ({activeCount})</button>
                              <button onClick={() => setUserTab('PENDING')} className={`flex-1 py-3 text-sm font-bold transition ${userTab === 'PENDING' ? 'bg-white text-orange-600 border-b-2 border-orange-600' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>Antrian Aktivasi ({pendingCount})</button>
                          </div>
                          <div className="p-4">
                              <div className="relative mb-4 max-w-md">
                                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                  <input type="text" placeholder="Cari nama atau email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white" />
                              </div>
                              <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse min-w-[1000px]">
                                      <thead>
                                          <tr className="bg-slate-50 text-slate-500 text-xs uppercase">
                                              <th className="p-3 font-bold border-b text-center w-12">No</th>
                                              <th className="p-3 font-bold border-b text-center">Status</th>
                                              <th className="p-3 font-bold border-b">Nama & Email</th>
                                              <th className="p-3 font-bold border-b">Password (PT)</th>
                                              <th className="p-3 font-bold border-b text-center">Gen</th>
                                              <th className="p-3 font-bold border-b">Aktivitas Terakhir</th>
                                              <th className="p-3 font-bold border-b">Bergabung</th>
                                              <th className="p-3 font-bold border-b text-center">Aksi</th>
                                          </tr>
                                      </thead>
                                      <tbody className="text-sm">
                                          {filteredUsers.length > 0 ? filteredUsers.map((user, index) => (
                                              <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                                  <td className="p-3 border-b text-center text-slate-500">{index + 1}</td>
                                                  <td className="p-3 border-b text-center">
                                                      <div className="flex flex-col items-center gap-1">
                                                          <Circle size={10} className={`${isUserOnline(user.lastLogin || '') ? 'fill-green-500 text-green-500' : 'fill-slate-300 text-slate-300'}`} />
                                                          <span className={`text-[10px] font-bold ${isUserOnline(user.lastLogin || '') ? 'text-green-600' : 'text-slate-400'}`}>
                                                              {isUserOnline(user.lastLogin || '') ? 'ONLINE' : 'OFFLINE'}
                                                          </span>
                                                      </div>
                                                  </td>
                                                  <td className="p-3 border-b">
                                                      <div className="flex flex-col">
                                                          <span className="font-bold text-slate-800">{user.name}</span>
                                                          <span className="text-xs text-slate-500">{user.email}</span>
                                                      </div>
                                                  </td>
                                                  <td className="p-3 border-b">
                                                      <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded text-slate-700">{user.password || '-'}</span>
                                                  </td>
                                                  <td className="p-3 border-b text-center">
                                                      <div className="bg-purple-50 text-purple-700 px-2 py-1 rounded-md font-bold text-xs inline-block">
                                                          {user.generationCount || 0}
                                                      </div>
                                                  </td>
                                                  <td className="p-3 border-b">
                                                      <div className="flex items-center gap-2 text-slate-600">
                                                          <Clock size={14} className="text-slate-400" />
                                                          <span>{getRelativeTime(user.lastLogin || '')}</span>
                                                      </div>
                                                  </td>
                                                  <td className="p-3 border-b text-slate-500 italic text-xs">
                                                      {new Date(user.joinedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                                                  </td>
                                                  <td className="p-3 border-b">
                                                      <div className="flex justify-center gap-2">
                                                          {user.status === 'pending' ? (
                                                              <button onClick={() => handleUpdateStatus(user, 'active')} className="bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 transition text-xs font-bold flex items-center gap-1">
                                                                  <CheckCircle size={14} /> Aktifkan
                                                              </button>
                                                          ) : (
                                                              <button onClick={() => handleUpdateStatus(user, 'pending')} className="bg-slate-100 text-slate-600 p-2 rounded-md hover:bg-slate-200 transition" title="Nonaktifkan">
                                                                  <XCircle size={16} />
                                                              </button>
                                                          )}
                                                          <button onClick={() => handleEditClick(user)} className="bg-blue-50 text-blue-600 p-2 rounded-md hover:bg-blue-100 transition" title="Edit">
                                                              <Edit2 size={16} />
                                                          </button>
                                                          {/* Delete button is available for both Pending and Active users now */}
                                                          <button onClick={() => handleDeleteUser(user.id)} className="bg-red-50 text-red-600 p-2 rounded-md hover:bg-red-100 transition" title="Hapus">
                                                              <Trash2 size={16} />
                                                          </button>
                                                      </div>
                                                  </td>
                                              </tr>
                                          )) : (
                                              <tr>
                                                  <td colSpan={8} className="p-12 text-center">
                                                      <div className="flex flex-col items-center gap-2 text-slate-400 italic">
                                                          <Search size={32} />
                                                          <span>Tidak ada data ditemukan.</span>
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
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Kata Sandi (PT)</label><input type="text" value={editFormData.password} onChange={e => setEditFormData({...editFormData, password: e.target.value})} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none font-mono" /></div>
                              <div><label className="block text-xs font-bold text-slate-500 mb-1">Status Akun</label><select value={editFormData.status} onChange={e => setEditFormData({...editFormData, status: e.target.value})} className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"><option value="active">Aktif</option><option value="pending">Pending</option></select></div>
                              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                                  <button type="button" onClick={() => setEditingUser(null)} className="px-5 py-2.5 text-slate-600 font-bold text-sm bg-slate-100 rounded-lg">Batal</button>
                                  <button type="submit" disabled={isSubmittingEdit} className="px-6 py-2.5 text-white font-bold text-sm bg-blue-600 rounded-lg flex items-center gap-2 shadow-md">{isSubmittingEdit && <Loader2 size={16} className="animate-spin" />} Simpan Perubahan</button>
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
