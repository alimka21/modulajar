
import React, { useState, useEffect } from 'react';
import { User, AppSettings } from '../types';
import { getUsers, saveUser, updateUser, deleteUser, getSettings, saveSettings, hashPassword } from '../services/storageService';
import { LogOut, Users, Settings, LayoutDashboard, Plus, Trash2, Edit2, CheckCircle, XCircle, Search, Mail, Lock, User as UserIcon, GraduationCap, ShieldCheck, Loader2 } from 'lucide-react';

interface AdminDashboardProps {
  onLogout: () => void;
  onGoToApp: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onLogout, onGoToApp }) => {
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'USERS' | 'SETTINGS'>('DASHBOARD');
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setAppSettings] = useState<AppSettings>({ promoLink: '', whatsappNumber: '', socialMediaLink: '' });
  
  // User Management State
  const [userTab, setUserTab] = useState<'ACTIVE' | 'PENDING'>('ACTIVE');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false); // Loading state for submit
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });

  // Admin Profile State
  const [adminCreds, setAdminCreds] = useState({ username: '', newPassword: '' });

  useEffect(() => {
      refreshData();
  }, []);

  const refreshData = () => {
      const allUsers = getUsers();
      setUsers(allUsers);
      setAppSettings(getSettings());
      
      const admin = allUsers.find(u => u.role === 'admin');
      if (admin) {
          setAdminCreds(prev => ({ ...prev, username: admin.email }));
      }
  };

  const handleUpdateStatus = (user: User, status: 'active' | 'pending') => {
      updateUser({ ...user, status });
      refreshData();
  };

  const handleDeleteUser = (id: string) => {
      if (confirm('Apakah Anda yakin ingin menghapus pengguna ini?')) {
          deleteUser(id);
          refreshData();
      }
  };

  const handleAddUser = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmittingUser(true); // Start loading

      try {
        const hashedPassword = await hashPassword(newUser.password);
        
        const user: User = {
            id: Date.now().toString(), // Will be overwritten by Supabase ID if online
            name: newUser.name,
            email: newUser.email,
            password: hashedPassword,
            role: 'user',
            status: 'active', // Manual add is directly active
            joinedDate: new Date().toISOString()
        };
        
        // Await the save process so we catch errors and don't refresh too early
        await saveUser(user);
        
        setIsAddingUser(false);
        setNewUser({ name: '', email: '', password: '' });
        refreshData();
        alert('Pengguna berhasil ditambahkan!');

      } catch (error: any) {
        console.error("Gagal menambah user:", error);
        alert(`Gagal menambah pengguna: ${error.message || "Terjadi kesalahan sistem."}`);
      } finally {
        setIsSubmittingUser(false); // Stop loading
      }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
      e.preventDefault();
      saveSettings(settings);
      alert('Pengaturan berhasil disimpan!');
  };

  const handleUpdateAdmin = async (e: React.FormEvent) => {
      e.preventDefault();
      const admin = users.find(u => u.role === 'admin');
      if (!admin) return;

      if (!adminCreds.username) {
          alert("Username tidak boleh kosong");
          return;
      }

      const updatedAdmin: User = {
          ...admin,
          email: adminCreds.username, // Using email field as username for admin
      };

      if (adminCreds.newPassword) {
          updatedAdmin.password = await hashPassword(adminCreds.newPassword);
      }

      updateUser(updatedAdmin);
      refreshData();
      setAdminCreds(prev => ({ ...prev, newPassword: '' })); // Clear password field
      alert("Kredensial Admin berhasil diperbarui!");
  };

  // Stats
  const activeCount = users.filter(u => u.status === 'active' && u.role !== 'admin').length;
  const pendingCount = users.filter(u => u.status === 'pending').length;

  const filteredUsers = users.filter(u => {
      const matchSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchRole = u.role !== 'admin'; // Hide admin in list usually
      if (userTab === 'ACTIVE') return matchSearch && matchRole && u.status === 'active';
      return matchSearch && matchRole && u.status === 'pending';
  });

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden text-[#1f1f1f] font-sans">
      
      {/* HEADER (Matches App.tsx) */}
      <header className="bg-white border-b border-slate-200 relative h-16 flex-none z-50 px-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2 select-none">
            <span className="text-blue-600">
                <GraduationCap size={28} />
            </span>
            <div>
                <h1 className="text-lg font-bold text-slate-800 uppercase leading-none">
                    PAKAR MODUL AJAR
                </h1>
                <span className="text-[10px] text-slate-500 font-medium">Admin Portal</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             <button onClick={onGoToApp} className="text-xs font-bold text-blue-600 hover:underline">
                 LIHAT APLIKASI
             </button>
             <button 
               onClick={onLogout} 
               className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 font-medium px-4 py-2 rounded-lg transition-colors"
             >
               <LogOut size={16} /> Keluar
             </button>
          </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
          {/* Sidebar (Light Themed) */}
          <aside className="w-64 bg-white border-r border-slate-200 flex flex-col flex-none">
              <nav className="flex-1 p-4 space-y-2">
                  <button onClick={() => setActiveTab('DASHBOARD')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'DASHBOARD' ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                      <LayoutDashboard size={18} />
                      <span>Dashboard</span>
                  </button>
                  <button onClick={() => setActiveTab('USERS')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'USERS' ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                      <Users size={18} />
                      <span>Daftar Pengguna</span>
                  </button>
                  <button onClick={() => setActiveTab('SETTINGS')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition ${activeTab === 'SETTINGS' ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                      <Settings size={18} />
                      <span>Pengaturan</span>
                  </button>
              </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto bg-slate-100 p-8">
              
              {/* DASHBOARD TAB */}
              {activeTab === 'DASHBOARD' && (
                  <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
                      <h2 className="text-xl font-bold text-slate-800">Dashboard Overview</h2>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition">
                              <div className="text-slate-500 text-xs font-bold uppercase mb-2">Total User Aktif</div>
                              <div className="text-3xl font-black text-blue-600">{activeCount}</div>
                          </div>
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition">
                              <div className="text-slate-500 text-xs font-bold uppercase mb-2">Menunggu Konfirmasi</div>
                              <div className="text-3xl font-black text-orange-500">{pendingCount}</div>
                          </div>
                          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition">
                              <div className="text-slate-500 text-xs font-bold uppercase mb-2">Total Semua Akun</div>
                              <div className="text-3xl font-black text-slate-800">{users.length}</div>
                          </div>
                      </div>
                  </div>
              )}

              {/* USERS TAB */}
              {activeTab === 'USERS' && (
                  <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
                      <div className="flex justify-between items-center">
                          <h2 className="text-xl font-bold text-slate-800">Master Pengguna</h2>
                          <button onClick={() => setIsAddingUser(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm transition">
                              <Plus size={16} /> Tambah User
                          </button>
                      </div>

                      {/* Add User Modal/Form */}
                      {isAddingUser && (
                          <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-lg mb-6 relative">
                              {isSubmittingUser && (
                                <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center rounded-xl">
                                    <Loader2 className="animate-spin text-blue-600" size={32} />
                                </div>
                              )}
                              <h3 className="font-bold text-base mb-4 text-slate-700">Tambah Pengguna Manual</h3>
                              <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                  <div>
                                      <label className="block text-xs font-bold text-slate-500 mb-1">Nama Lengkap</label>
                                      <div className="relative">
                                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                              <UserIcon className="text-slate-400" size={14} />
                                          </div>
                                          <input required type="text" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" />
                                      </div>
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-slate-500 mb-1">Email</label>
                                      <div className="relative">
                                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                              <Mail className="text-slate-400" size={14} />
                                          </div>
                                          <input required type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" />
                                      </div>
                                  </div>
                                  <div>
                                      <label className="block text-xs font-bold text-slate-500 mb-1">Password</label>
                                      <div className="relative">
                                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                              <Lock className="text-slate-400" size={14} />
                                          </div>
                                          <input required type="text" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none" />
                                      </div>
                                  </div>
                                  <div className="flex gap-2">
                                      <button type="submit" disabled={isSubmittingUser} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition disabled:opacity-50">Simpan</button>
                                      <button type="button" onClick={() => setIsAddingUser(false)} disabled={isSubmittingUser} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50">Batal</button>
                                  </div>
                              </form>
                          </div>
                      )}

                      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                          {/* Sub-Tabs */}
                          <div className="flex border-b border-slate-200">
                              <button onClick={() => setUserTab('ACTIVE')} className={`flex-1 py-3 text-sm font-bold transition ${userTab === 'ACTIVE' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                                  Pengguna Aktif ({activeCount})
                              </button>
                              <button onClick={() => setUserTab('PENDING')} className={`flex-1 py-3 text-sm font-bold transition ${userTab === 'PENDING' ? 'bg-white text-orange-600 border-b-2 border-orange-600' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>
                                  Calon Pengguna ({pendingCount})
                              </button>
                          </div>

                          {/* Search & Table */}
                          <div className="p-4">
                              <div className="relative mb-4 max-w-md">
                                  <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                  <input 
                                      type="text" 
                                      placeholder="Cari nama atau email..." 
                                      value={searchTerm}
                                      onChange={e => setSearchTerm(e.target.value)}
                                      className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-white"
                                  />
                              </div>

                              <table className="w-full text-left border-collapse">
                                  <thead>
                                      <tr className="bg-slate-50 text-slate-500 text-xs uppercase">
                                          <th className="p-3 font-bold border-b">Nama</th>
                                          <th className="p-3 font-bold border-b">Email</th>
                                          <th className="p-3 font-bold border-b">Tanggal Daftar</th>
                                          <th className="p-3 font-bold border-b text-center">Aksi</th>
                                      </tr>
                                  </thead>
                                  <tbody className="text-sm">
                                      {filteredUsers.length > 0 ? filteredUsers.map(user => (
                                          <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                              <td className="p-3 border-b font-medium">{user.name}</td>
                                              <td className="p-3 border-b text-slate-600">{user.email}</td>
                                              <td className="p-3 border-b text-slate-500">{new Date(user.joinedDate).toLocaleDateString()}</td>
                                              <td className="p-3 border-b">
                                                  <div className="flex justify-center gap-2">
                                                      {user.status === 'pending' ? (
                                                          <button onClick={() => handleUpdateStatus(user, 'active')} className="bg-green-100 text-green-700 p-1.5 rounded-md hover:bg-green-200 transition" title="Konfirmasi Aktif">
                                                              <CheckCircle size={16} />
                                                          </button>
                                                      ) : (
                                                           <button onClick={() => handleUpdateStatus(user, 'pending')} className="bg-orange-100 text-orange-700 p-1.5 rounded-md hover:bg-orange-200 transition" title="Nonaktifkan">
                                                              <XCircle size={16} />
                                                          </button>
                                                      )}
                                                      <button onClick={() => alert('Fitur edit detail belum tersedia.')} className="bg-blue-100 text-blue-700 p-1.5 rounded-md hover:bg-blue-200 transition" title="Edit">
                                                          <Edit2 size={16} />
                                                      </button>
                                                      <button onClick={() => handleDeleteUser(user.id)} className="bg-red-100 text-red-700 p-1.5 rounded-md hover:bg-red-200 transition" title="Hapus">
                                                          <Trash2 size={16} />
                                                      </button>
                                                  </div>
                                              </td>
                                          </tr>
                                      )) : (
                                          <tr>
                                              <td colSpan={4} className="p-8 text-center text-slate-400 italic">Tidak ada data pengguna.</td>
                                          </tr>
                                      )}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  </div>
              )}

              {/* SETTINGS TAB */}
              {activeTab === 'SETTINGS' && (
                  <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
                      
                      {/* Section: Admin Credentials */}
                      <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100 relative overflow-hidden">
                          <div className="absolute top-0 right-0 p-3 opacity-10">
                              <ShieldCheck size={100} className="text-indigo-600" />
                          </div>
                          <h2 className="text-lg font-bold text-indigo-900 mb-4 flex items-center gap-2">
                              <ShieldCheck size={20} /> Kelola Akun Admin
                          </h2>
                          <form onSubmit={handleUpdateAdmin} className="space-y-4 relative z-10">
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1">Username Admin (Login)</label>
                                  <input 
                                      type="text" 
                                      value={adminCreds.username}
                                      onChange={e => setAdminCreds({...adminCreds, username: e.target.value})}
                                      className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1">Password Baru (Biarkan kosong jika tidak ubah)</label>
                                  <input 
                                      type="text" 
                                      value={adminCreds.newPassword}
                                      onChange={e => setAdminCreds({...adminCreds, newPassword: e.target.value})}
                                      placeholder="Masukkan password baru..."
                                      className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-indigo-500 outline-none"
                                  />
                              </div>
                              <div className="pt-2">
                                <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition shadow-sm w-full md:w-auto text-sm">
                                    Update Akun Admin
                                </button>
                              </div>
                          </form>
                      </div>

                      {/* Section: App Settings */}
                      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                              <Settings size={20} /> Pengaturan Aplikasi
                          </h2>
                          <form onSubmit={handleSaveSettings} className="space-y-4">
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1">Link "Dapatkan Pakar Modul Ajar"</label>
                                  <input 
                                      type="text" 
                                      value={settings.promoLink}
                                      onChange={e => setAppSettings({...settings, promoLink: e.target.value})}
                                      className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1">Nomor WhatsApp Admin (untuk Pendaftaran)</label>
                                  <input 
                                      type="text" 
                                      value={settings.whatsappNumber}
                                      onChange={e => setAppSettings({...settings, whatsappNumber: e.target.value})}
                                      className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                      placeholder="Contoh: 62812345678"
                                  />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-slate-500 mb-1">Link Sosial Media</label>
                                  <input 
                                      type="text" 
                                      value={settings.socialMediaLink}
                                      onChange={e => setAppSettings({...settings, socialMediaLink: e.target.value})}
                                      className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                                  />
                              </div>
                              <div className="pt-2">
                                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition shadow-sm w-full md:w-auto text-sm">
                                    Simpan Pengaturan
                                </button>
                              </div>
                          </form>
                      </div>
                  </div>
              )}

          </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
