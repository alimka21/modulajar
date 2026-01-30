
import React, { useState, useEffect } from 'react';
import { SchoolIdentity, User, HistoryItem, GeneratedLessonPlan, LessonIdentity } from '../types';
import { INDONESIAN_MONTHS } from '../constants';
import { validateApiKey } from '../services/geminiService';
import { getHistory, saveUserApiKey } from '../services/storageService';
import { useAuth } from '../contexts/AuthContext';
import { Save, User as UserIcon, School, FileText, Key, Eye, EyeOff, CheckCircle, AlertTriangle, Zap, Trash2, HelpCircle, ArrowRight, Clock, BookOpen, Layers, CheckSquare, Eye as ViewIcon, Loader2, RefreshCw, Edit3, X, Info } from 'lucide-react';
import { swal, toast } from '../services/notificationService';

interface UserDashboardProps {
  user: User;
  schoolIdentity: SchoolIdentity;
  onSchoolIdentityChange: (data: SchoolIdentity) => void;
  onGoToGenerator: () => void;
  onLoadHistory: (data: GeneratedLessonPlan, input: LessonIdentity) => void;
}

const UserDashboard: React.FC<UserDashboardProps> = ({ user, schoolIdentity, onSchoolIdentityChange, onGoToGenerator, onLoadHistory }) => {
  const { refreshAuth } = useAuth();
  const [identityData, setIdentityData] = useState<SchoolIdentity>(schoolIdentity);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [isKeyValidated, setIsKeyValidated] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'NONE' | 'VALID' | 'INVALID'>('NONE');
  const [testMessage, setTestMessage] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
      const currentKey = user.apiKey || sessionStorage.getItem('custom_api_key') || '';
      setApiKey(currentKey);
      if (currentKey) {
          setKeyStatus('VALID');
          setIsKeyValidated(true);
          setIsEditingKey(false);
      } else {
          setIsEditingKey(true);
      }
      setIdentityData(schoolIdentity);
      loadHistoryData();
  }, [schoolIdentity, user]);

  const loadHistoryData = async () => {
      setIsLoadingHistory(true);
      const data = await getHistory(user.id);
      setHistory(data);
      setIsLoadingHistory(false);
  };

  const handleIdentityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setIdentityData(prev => ({ ...prev, [name]: value }));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (!val) return;
      const [year, month, day] = val.split('-');
      const monthName = INDONESIAN_MONTHS[parseInt(month) - 1];
      const formattedDate = `${parseInt(day)} ${monthName} ${year}`;
      setIdentityData(prev => ({ ...prev, date: formattedDate }));
  };

  const saveIdentity = () => {
      onSchoolIdentityChange(identityData);
      localStorage.setItem('schoolIdentity', JSON.stringify(identityData));
      toast.fire({ icon: 'success', title: 'Identitas Berhasil Disimpan!' });
  };

  const getIsoDateFromDisplay = (displayDate: string) => {
    if (!displayDate) return "";
    const parts = displayDate.split(' ');
    if (parts.length < 3) return "";
    const day = parts[0].padStart(2, '0');
    const monthIndex = INDONESIAN_MONTHS.indexOf(parts[1]);
    if (monthIndex === -1) return "";
    const year = parts[2];
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${day}`;
  };

  const handleStartEditing = () => {
      setIsEditingKey(true);
      setIsKeyValidated(false);
      setKeyStatus('NONE');
      setTestMessage('Silakan masukkan key baru dan klik Tes Koneksi.');
  };

  const handleCancelEditing = () => {
      const originalKey = user.apiKey || '';
      setApiKey(originalKey);
      setIsEditingKey(false);
      if (originalKey) {
          setIsKeyValidated(true);
          setKeyStatus('VALID');
          setTestMessage('');
      }
  };

  const handleTestKey = async () => {
      if (!apiKey.trim()) {
          swal.fire({ icon: 'warning', title: 'Input Kosong', text: 'Mohon masukkan API Key terlebih dahulu.' });
          return;
      }
      setIsTestingKey(true);
      setTestMessage('Sedang menguji koneksi...');
      const result = await validateApiKey(apiKey);
      setIsTestingKey(false);
      if (result.success) {
          setKeyStatus('VALID');
          setIsKeyValidated(true);
          setTestMessage('Koneksi Berhasil! Sekarang Anda bisa menekan tombol Simpan.');
          toast.fire({ icon: 'success', title: 'API Key Valid!' });
      } else {
          setKeyStatus('INVALID');
          setIsKeyValidated(false);
          setTestMessage(result.message);
          swal.fire({ icon: 'error', title: 'Koneksi Gagal', text: result.message });
      }
  };

  const handleSaveApiKey = async () => {
      if (!isKeyValidated) return;
      try {
          await saveUserApiKey(user.id, apiKey);
          sessionStorage.setItem('custom_api_key', apiKey);
          setIsEditingKey(false);
          await refreshAuth();
          swal.fire({ icon: 'success', title: 'Tersimpan!', text: 'Sistem telah dikunci untuk selalu menggunakan API Key Anda.' });
      } catch (e) {
          swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: 'Terjadi gangguan sinkronisasi.' });
      }
  };

  const handleDeleteApiKey = () => {
      swal.fire({
          title: 'Hapus API Key?',
          text: "Sistem akan kembali menggunakan kuota server bersama.",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ef4444',
          confirmButtonText: 'Ya, Hapus'
      }).then(async (result: any) => {
          if (result.isConfirmed) {
              try {
                  await saveUserApiKey(user.id, null);
                  sessionStorage.removeItem('custom_api_key');
                  setApiKey('');
                  setKeyStatus('NONE');
                  setIsKeyValidated(false);
                  setIsEditingKey(true);
                  setTestMessage('');
                  await refreshAuth();
                  toast.fire({ icon: 'success', title: 'API Key Dihapus' });
              } catch (e) {
                  toast.fire({ icon: 'error', title: 'Gagal Menghapus' });
              }
          }
      });
  };

  const formatDate = (dateString: string) => {
      try {
          const date = new Date(dateString);
          return date.toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
          });
      } catch (e) {
          return "-";
      }
  };

  return (
    <div className="flex-1 bg-slate-50 p-4 md:p-8 overflow-y-auto h-full">
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Halo, {user.name} 👋</h1>
                <p className="text-slate-500 text-sm mt-1">Kelola identitas modul dan konfigurasi AI Anda di sini.</p>
            </div>
            <button 
                onClick={onGoToGenerator}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all"
            >
                <span>Mulai Buat Modul</span>
                <ArrowRight size={20} />
            </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h2 className="font-bold text-slate-700 flex items-center gap-2">
                            <School size={20} className="text-blue-600" />
                            Identitas Sekolah & Penyusun
                        </h2>
                        <button onClick={saveIdentity} className="text-xs bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-lg hover:bg-blue-200 transition">
                            Simpan Identitas
                        </button>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Data Sekolah</h3>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Nama Sekolah</label>
                                <input name="schoolName" value={identityData.schoolName} onChange={handleIdentityChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="SMAN 1..." />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Kota / Kabupaten</label>
                                <input name="location" value={identityData.location} onChange={handleIdentityChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="Jakarta" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Tanggal Modul</label>
                                <input type="date" value={getIsoDateFromDisplay(identityData.date)} onChange={handleDateChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                            </div>
                        </div>
                        <div className="space-y-4">
                             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Data Guru & Kepsek</h3>
                             <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Nama Penyusun (Anda)</label>
                                <input name="authorName" value={identityData.authorName} onChange={handleIdentityChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="Nama Lengkap & Gelar" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">NIP Penyusun</label>
                                <input name="authorNip" value={identityData.authorNip} onChange={handleIdentityChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" placeholder="NIP / NUPTK" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nama Kepsek</label>
                                    <input name="principalName" value={identityData.principalName} onChange={handleIdentityChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">NIP Kepsek</label>
                                    <input name="principalNip" value={identityData.principalNip} onChange={handleIdentityChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h2 className="font-bold text-slate-700 flex items-center gap-2">
                            <Key size={20} className="text-amber-500" />
                            Gemini API Key Mandiri
                        </h2>
                        {user.apiKey && !isEditingKey && (
                            <button 
                                onClick={handleStartEditing}
                                className="text-xs bg-amber-100 text-amber-700 font-bold px-3 py-1.5 rounded-lg hover:bg-amber-200 transition flex items-center gap-1"
                            >
                                <Edit3 size={14} /> Ubah API Key
                            </button>
                        )}
                    </div>
                    
                    <div className="p-6">
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-bold text-slate-700">Google Gemini API Key</label>
                        </div>
                        <div className="relative mb-2">
                            <input 
                                type={showKey ? "text" : "password"} 
                                value={apiKey}
                                disabled={!isEditingKey}
                                onChange={(e) => {
                                    setApiKey(e.target.value);
                                    setIsKeyValidated(false);
                                    setKeyStatus('NONE');
                                }}
                                className={`w-full pl-4 pr-12 py-3 border rounded-lg text-sm outline-none transition ${
                                    !isEditingKey ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' :
                                    keyStatus === 'VALID' ? 'bg-white border-green-500 focus:ring-2 focus:ring-green-500' : 
                                    keyStatus === 'INVALID' ? 'bg-white border-red-500 focus:ring-2 focus:ring-red-500' :
                                    'bg-white border-slate-300 focus:ring-2 focus:ring-blue-500'
                                }`}
                                placeholder={isEditingKey ? "Tempel API Key Anda di sini..." : "API Key telah dikunci"}
                            />
                            <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {testMessage && (
                            <div className={`text-xs font-medium mb-4 flex items-center gap-1 ${keyStatus === 'VALID' ? 'text-green-600' : 'text-red-600'}`}>
                                {keyStatus === 'VALID' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                                {testMessage}
                            </div>
                        )}
                        <div className="flex flex-wrap gap-3 mt-4">
                            {isEditingKey ? (
                                <>
                                    <button onClick={handleTestKey} disabled={isTestingKey || !apiKey.trim()} className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-6 rounded-lg text-sm flex items-center gap-2 shadow-sm transition disabled:opacity-50">
                                        {isTestingKey ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} />}
                                        {isTestingKey ? 'Sedang Tes...' : 'Tes Koneksi'}
                                    </button>
                                    <button onClick={handleSaveApiKey} disabled={!isKeyValidated || isTestingKey} className={`font-bold py-2.5 px-6 rounded-lg text-sm flex items-center gap-2 shadow-md transition-all ${isKeyValidated ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-200 text-slate-400'}`}>
                                        <Save size={16} /> Simpan
                                    </button>
                                </>
                            ) : (
                                <button onClick={handleDeleteApiKey} className="bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 font-bold py-2.5 px-4 rounded-lg text-sm flex items-center gap-2 shadow-sm transition">
                                    <Trash2 size={16} /> Hapus API Key
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <HelpCircle size={18} className="text-blue-600" />
                        Panduan API Key
                    </h3>
                    <div className="space-y-4 text-sm text-slate-600">
                        <p>1. Login ke <strong>Google AI Studio</strong>.</p>
                        <p>2. Buat API key baru.</p>
                        <p>3. Tes & Simpan di sini.</p>
                    </div>
                </div>
            </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between bg-slate-50 gap-2">
                <div className="flex items-center gap-2">
                    <Clock size={20} className="text-blue-600" />
                    <h2 className="text-lg font-bold text-slate-800">Riwayat Modul</h2>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full">
                    <Info size={14} />
                    Hanya 10 modul terakhir yang disimpan
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-xs">
                        <tr>
                            <th className="p-4 border-b">Waktu</th>
                            <th className="p-4 border-b">Mata Pelajaran</th>
                            <th className="p-4 border-b">Topik</th>
                            <th className="p-4 border-b text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {isLoadingHistory ? (
                             <tr><td colSpan={4} className="p-8 text-center"><Loader2 size={24} className="animate-spin mx-auto" /></td></tr>
                        ) : history.length === 0 ? (
                             <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">Belum ada riwayat.</td></tr>
                        ) : (
                             history.map((item) => (
                                 <tr key={item.id} className="hover:bg-blue-50/30 transition">
                                     <td className="p-4 whitespace-nowrap">{formatDate(item.created_at)}</td>
                                     <td className="p-4 font-medium text-slate-800">{item.subject}</td>
                                     <td className="p-4 max-w-xs truncate">{item.topic}</td>
                                     <td className="p-4 text-center">
                                         <button 
                                            onClick={() => onLoadHistory(item.full_data, item.input_data)}
                                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 mx-auto"
                                         >
                                             <ViewIcon size={12} /> Buka
                                         </button>
                                     </td>
                                 </tr>
                             ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

      </div>
    </div>
  );
};

export default UserDashboard;
