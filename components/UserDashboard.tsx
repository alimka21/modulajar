
import React, { useState, useEffect } from 'react';
import { SchoolIdentity, User, HistoryItem, GeneratedLessonPlan, LessonIdentity } from '../types';
import { INDONESIAN_MONTHS } from '../constants';
import { validateApiKey } from '../services/geminiService';
import { getHistory, saveUserApiKey } from '../services/storageService';
import { useAuth } from '../contexts/AuthContext';
import { Save, User as UserIcon, School, FileText, Key, Eye, EyeOff, CheckCircle, AlertTriangle, Zap, Trash2, HelpCircle, ArrowRight, Clock, BookOpen, Layers, CheckSquare, Eye as ViewIcon, Loader2, RefreshCw, Edit3, X, Info, AlertCircle, ExternalLink, XCircle } from 'lucide-react';
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
  
  // State Key Management
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false); // State Loading Simpan
  const [isKeyValidated, setIsKeyValidated] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'NONE' | 'VALID' | 'INVALID'>('NONE');
  const [testMessage, setTestMessage] = useState('');
  
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isIdentitySaved, setIsIdentitySaved] = useState(false);

  useEffect(() => {
      // Ambil key dari user (DB) atau session, lakukan sanitasi basic
      const currentKey = (user.apiKey || sessionStorage.getItem('custom_api_key') || '').trim();
      setApiKey(currentKey);
      if (currentKey && currentKey.length > 10) {
          setKeyStatus('VALID');
          setIsKeyValidated(true);
          setIsEditingKey(false);
      } else {
          setIsEditingKey(true);
      }
      setIdentityData(schoolIdentity);
      loadHistoryData();
      
      const saved = localStorage.getItem('schoolIdentity');
      if (saved) {
          setIsIdentitySaved(true);
      }
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
      setIsIdentitySaved(false); 
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (!val) return;
      const [year, month, day] = val.split('-');
      const monthName = INDONESIAN_MONTHS[parseInt(month) - 1];
      const formattedDate = `${parseInt(day)} ${monthName} ${year}`;
      setIdentityData(prev => ({ ...prev, date: formattedDate }));
      setIsIdentitySaved(false);
  };

  const saveIdentity = () => {
      if (!identityData.schoolName || !identityData.authorName || !identityData.principalName || !identityData.location || !identityData.authorNip || !identityData.principalNip) {
          swal.fire({ 
              icon: 'warning', 
              title: 'Data Belum Lengkap', 
              text: 'Harap isi seluruh kolom identitas sekolah dan penyusun yang bertanda bintang (*).',
              confirmButtonColor: '#f59e0b'
          });
          return;
      }
      onSchoolIdentityChange(identityData);
      localStorage.setItem('schoolIdentity', JSON.stringify(identityData));
      setIsIdentitySaved(true);
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

  const handleTestKey = async () => {
      const cleanKey = apiKey.trim();
      if (!cleanKey) {
          swal.fire({ icon: 'warning', title: 'Input Kosong', text: 'Mohon masukkan API Key terlebih dahulu.' });
          return;
      }
      
      setIsTestingKey(true);
      setTestMessage('Sedang menguji koneksi...');
      
      // Kirim cleanKey, jangan raw apiKey state yang mungkin masih ada spasi
      const result = await validateApiKey(cleanKey);
      
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
      
      setIsSavingKey(true); // Mulai Loading
      const cleanKey = apiKey.trim();
      
      try {
          // 1. Simpan ke database
          await saveUserApiKey(user.id, cleanKey);
          
          // 2. Set Session (Optimistic update agar langsung bisa dipakai)
          sessionStorage.setItem('custom_api_key', cleanKey);
          
          // 3. Refresh Auth Context (Sync dari DB agar state global update)
          await refreshAuth();
          
          setIsEditingKey(false);
          swal.fire({ icon: 'success', title: 'Tersimpan!', text: 'Sistem telah dikunci untuk selalu menggunakan API Key Anda.' });
      } catch (e: any) {
          console.error(e);
          swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: e.message || 'Terjadi gangguan sinkronisasi database.' });
      } finally {
          setIsSavingKey(false); // Selesai Loading
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
                  // 1. Hapus dari DB
                  await saveUserApiKey(user.id, null);
                  
                  // 2. Clear Session
                  sessionStorage.removeItem('custom_api_key');
                  
                  // 3. Reset State Lokal
                  setApiKey('');
                  setKeyStatus('NONE');
                  setIsKeyValidated(false);
                  setIsEditingKey(true);
                  setTestMessage('');
                  
                  // 4. Refresh Auth Context
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

  const isFormFilled = !!(
      identityData.schoolName && 
      identityData.authorName && 
      identityData.authorNip && 
      identityData.principalName && 
      identityData.principalNip && 
      identityData.location && 
      identityData.date
  );

  return (
    <div className="flex-1 bg-slate-50 p-4 md:p-8 overflow-y-auto h-full">
      <div className="max-w-6xl mx-auto space-y-8 pb-12">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div>
                <h1 className="text-2xl font-bold text-slate-800">Halo, {user.name} 👋</h1>
                <p className="text-slate-500 text-sm mt-1">Kelola identitas modul dan konfigurasi AI Anda di sini.</p>
            </div>
            <div className="flex flex-col items-end gap-2">
                <button 
                    onClick={onGoToGenerator}
                    disabled={!isFormFilled || !isIdentitySaved}
                    className={`flex items-center gap-2 font-bold py-3 px-8 rounded-xl shadow-lg transition-all transform ${
                        isFormFilled && isIdentitySaved
                        ? 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-xl hover:-translate-y-1' 
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                    }`}
                >
                    <span>Mulai Buat Modul</span>
                    <ArrowRight size={20} />
                </button>
                {(!isFormFilled || !isIdentitySaved) && (
                    <span className="text-[11px] text-red-600 font-bold flex items-center gap-1 bg-red-50 px-3 py-1.5 rounded-full border border-red-100 animate-pulse">
                        <AlertCircle size={14} /> {isFormFilled ? "Klik Simpan Identitas untuk membuka akses" : "Lengkapi identitas untuk membuka akses"}
                    </span>
                )}
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h2 className="font-bold text-slate-700 flex items-center gap-2 text-lg">
                            <School size={22} className="text-blue-600" />
                            Identitas Sekolah & Penyusun (Wajib Isi)
                        </h2>
                    </div>
                    <div className="p-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            <div className="space-y-5">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-l-4 border-blue-500 pl-3">Data Sekolah</h3>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Nama Sekolah *</label>
                                    <input name="schoolName" value={identityData.schoolName} onChange={handleIdentityChange} className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all shadow-sm" placeholder="Contoh: SMAN 1 Jakarta" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Kota / Kabupaten *</label>
                                    <input name="location" value={identityData.location} onChange={handleIdentityChange} className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all shadow-sm" placeholder="Contoh: Jakarta Pusat" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Tanggal Modul *</label>
                                    <input type="date" value={getIsoDateFromDisplay(identityData.date)} onChange={handleDateChange} className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all shadow-sm" />
                                </div>
                            </div>

                            <div className="space-y-5">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-l-4 border-purple-500 pl-3">Data Penyusun Modul</h3>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Nama Penyusun *</label>
                                    <input name="authorName" value={identityData.authorName} onChange={handleIdentityChange} className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white transition-all shadow-sm" placeholder="Nama Guru" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">NIP Penyusun *</label>
                                    <input name="authorNip" value={identityData.authorNip} onChange={handleIdentityChange} className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white transition-all shadow-sm" placeholder="NIP" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Nama Kepala Sekolah *</label>
                                    <input name="principalName" value={identityData.principalName} onChange={handleIdentityChange} className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white transition-all shadow-sm" placeholder="Nama Kepala Sekolah" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">NIP Kepala Sekolah *</label>
                                    <input name="principalNip" value={identityData.principalNip} onChange={handleIdentityChange} className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white transition-all shadow-sm" placeholder="NIP" />
                                </div>
                            </div>
                        </div>
                        <div className="pt-8 border-t border-slate-100">
                            <button 
                                onClick={saveIdentity} 
                                className={`w-full text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 transition-all hover:scale-[1.01] active:scale-100 ${isIdentitySaved ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                                {isIdentitySaved ? <CheckCircle size={24} /> : <Save size={24} />}
                                {isIdentitySaved ? "IDENTITAS TELAH DISIMPAN" : "SIMPAN IDENTITAS MODUL"}
                            </button>
                            <p className="text-center text-[10px] text-slate-400 mt-3 font-medium italic">Data ini akan dicantumkan secara otomatis pada setiap modul yang Anda buat.</p>
                        </div>
                    </div>
                </div>

                {/* ===== API KEY MANAGEMENT SECTION (ENHANCED) ===== */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-5 bg-slate-50 border-b border-slate-200">
                        <h2 className="font-bold text-slate-700 flex items-center gap-2 text-lg">
                            <Key size={22} className="text-purple-600" />
                            Manajemen API Key Gemini
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">Kelola API Key untuk AI Module Generator</p>
                    </div>

                    <div className="p-8 space-y-6">
                        
                        {/* Info Box */}
                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                            <div className="flex gap-3">
                                <HelpCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-blue-900">
                                    <p className="font-semibold mb-1">Bagaimana Sistem API Key Bekerja?</p>
                                    <ul className="text-xs space-y-1 list-disc list-inside">
                                        <li>Aplikasi memiliki API Key <strong>bawaan</strong> (server bersama) untuk semua pengguna</li>
                                        <li>Anda bisa menggunakan <strong>API Key pribadi</strong> Anda sendiri untuk kuota unlimited</li>
                                        <li>Prioritas: Jika ada API Key pribadi yang valid, sistem menggunakan itu terlebih dahulu</li>
                                        <li>Jika API Key pribadi habis atau dihapus, sistem otomatis kembali ke API Key bawaan</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Current Status */}
                        <div>
                            <h3 className="font-semibold text-slate-700 mb-3">Status API Key Anda</h3>
                            
                            <div className={`p-4 rounded-xl border-2 ${
                                isKeyValidated && keyStatus === 'VALID'
                                    ? 'bg-green-50 border-green-300'
                                    : isKeyValidated && keyStatus === 'INVALID'
                                    ? 'bg-red-50 border-red-300'
                                    : 'bg-yellow-50 border-yellow-300'
                            }`}>
                                <div className="flex items-start gap-3">
                                    {isKeyValidated && keyStatus === 'VALID' ? (
                                        <CheckCircle className="text-green-600 flex-shrink-0 mt-1" size={20} />
                                    ) : isKeyValidated && keyStatus === 'INVALID' ? (
                                        <XCircle className="text-red-600 flex-shrink-0 mt-1" size={20} />
                                    ) : (
                                        <AlertCircle className="text-yellow-600 flex-shrink-0 mt-1" size={20} />
                                    )}
                                    
                                    <div className="flex-1">
                                        <p className={`font-semibold ${
                                            isKeyValidated && keyStatus === 'VALID'
                                                ? 'text-green-900'
                                                : isKeyValidated && keyStatus === 'INVALID'
                                                ? 'text-red-900'
                                                : 'text-yellow-900'
                                        }`}>
                                            {isKeyValidated && keyStatus === 'VALID' 
                                                ? '✅ API Key Valid & Siap Digunakan'
                                                : isKeyValidated && keyStatus === 'INVALID'
                                                ? '❌ API Key Tidak Valid'
                                                : '⚠️ API Key Belum Dikonfigurasi'
                                            }
                                        </p>
                                        
                                        {isKeyValidated && keyStatus === 'VALID' && (
                                            <div className="text-xs text-slate-600 mt-2 space-y-1">
                                                <p>
                                                    <strong>Sumber:</strong> {
                                                        apiKey && apiKey.length > 0
                                                            ? '🔐 API Key Pribadi Anda'
                                                            : '🌐 API Key Bawaan Server'
                                                    }
                                                </p>
                                                {apiKey && apiKey.length > 0 && (
                                                    <p>
                                                        <strong>Tersimpan:</strong> Ya (di Database)
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                        
                                        {isKeyValidated && keyStatus === 'INVALID' && (
                                            <p className="text-xs text-red-700 mt-2">
                                                Periksa kembali API Key Anda atau hubungi support jika mengalami kesulitan.
                                            </p>
                                        )}
                                        
                                        {!isKeyValidated && (
                                            <p className="text-xs text-yellow-700 mt-2">
                                                Gunakan API Key bawaan server atau masukkan API Key pribadi untuk mulai membuat modul.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* API Key Input Form */}
                        <div>
                            <h3 className="font-semibold text-slate-700 mb-3">
                                {isEditingKey ? 'Masukkan API Key Pribadi' : 'API Key Pribadi Anda'}
                            </h3>

                            {!isEditingKey && apiKey && keyStatus === 'VALID' ? (
                                <div className="p-4 rounded-xl border border-slate-300 bg-slate-50 space-y-3">
                                    <p className="text-xs text-slate-600">
                                        API Key Anda tersimpan di database. Ditampilkan sebagian untuk keamanan:
                                    </p>
                                    <div className="font-mono text-sm bg-white p-3 rounded border border-slate-200">
                                        {apiKey.substring(0, 10)}...{apiKey.substring(apiKey.length - 10)}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleStartEditing}
                                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Edit3 size={16} />
                                            Ubah API Key
                                        </button>
                                        <button
                                            onClick={handleDeleteApiKey}
                                            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Trash2 size={16} />
                                            Hapus API Key
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-2">
                                            Paste API Key Anda dari Google AI Studio:
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showKey ? "text" : "password"}
                                                value={apiKey}
                                                onChange={(e) => { 
                                                    setApiKey(e.target.value); 
                                                    setIsKeyValidated(false); 
                                                    setKeyStatus('NONE'); 
                                                }}
                                                placeholder="sk-proj-xxxxxxxxxxxxxxxxxxxxx"
                                                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white transition-all shadow-sm font-mono"
                                            />
                                            <button
                                                onClick={() => setShowKey(!showKey)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                            >
                                                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2">
                                            🔒 API Key Anda akan dienkripsi dan disimpan dengan aman di database kami.
                                        </p>
                                    </div>

                                    {/* Test Message */}
                                    {testMessage && (
                                        <div className={`p-3 rounded-lg text-xs ${
                                            keyStatus === 'VALID'
                                                ? 'bg-green-50 border border-green-200 text-green-800'
                                                : keyStatus === 'INVALID'
                                                ? 'bg-red-50 border border-red-200 text-red-800'
                                                : 'bg-yellow-50 border border-yellow-200 text-yellow-800'
                                        }`}>
                                            {testMessage}
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleTestKey}
                                            disabled={!apiKey.trim() || isTestingKey || isSavingKey}
                                            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                                                !apiKey.trim() || isTestingKey
                                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                    : 'bg-yellow-600 text-white hover:bg-yellow-700'
                                            }`}
                                        >
                                            {isTestingKey ? (
                                                <>
                                                    <Loader2 size={16} className="animate-spin" />
                                                    Menguji...
                                                </>
                                            ) : (
                                                <>
                                                    <Zap size={16} />
                                                    Tes Koneksi
                                                </>
                                            )}
                                        </button>

                                        <button
                                            onClick={handleSaveApiKey}
                                            disabled={!isKeyValidated || isTestingKey || isSavingKey}
                                            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                                                isKeyValidated && !isTestingKey && !isSavingKey
                                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                            }`}
                                        >
                                            {isSavingKey ? (
                                                <>
                                                    <Loader2 size={16} className="animate-spin" />
                                                    Menyimpan...
                                                </>
                                            ) : (
                                                <>
                                                    <Save size={16} />
                                                    Simpan API Key
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {isEditingKey && (
                                        <button
                                            onClick={() => {
                                                setIsEditingKey(false);
                                                setApiKey(user.apiKey || sessionStorage.getItem('custom_api_key') || '');
                                                setKeyStatus('NONE');
                                                setTestMessage('');
                                            }}
                                            className="w-full px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors"
                                        >
                                            Batal
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Tip Box */}
                        <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                            <div className="flex gap-3">
                                <Info size={20} className="text-purple-600 flex-shrink-0 mt-0.5" />
                                <div className="text-xs text-purple-900">
                                    <p className="font-semibold mb-1">💡 Tips:</p>
                                    <ul className="space-y-1 list-disc list-inside">
                                        <li>Dapatkan API Key gratis di: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline font-semibold hover:no-underline">aistudio.google.com/apikey</a></li>
                                        <li>Jangan share API Key Anda dengan orang lain</li>
                                        <li>Satu API Key bisa digunakan untuk multiple project</li>
                                        <li>Monitor quota penggunaan di Google Cloud Console</li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Quota Information */}
                        {isKeyValidated && keyStatus === 'VALID' && (
                            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                                <div className="flex gap-3">
                                    <Clock size={20} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-xs text-indigo-900">
                                        <p className="font-semibold mb-1">📊 Informasi Quota:</p>
                                        <p>
                                            Jika Anda melihat error <strong>"Kuota Habis"</strong>, berarti Anda telah mencapai batas {
                                                apiKey && apiKey.length > 0 ? 'API pribadi' : 'server bersama'
                                            } untuk periode ini.
                                        </p>
                                        <p className="mt-2">
                                            Solusi: {
                                                apiKey && apiKey.length > 0
                                                    ? '🔄 Gunakan API Key lain atau tunggu reset quota (biasanya setiap hari)'
                                                    : '🔐 Gunakan API Key pribadi Anda untuk quota unlimited'
                                            }
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {/* ===== END API KEY MANAGEMENT SECTION ===== */}
            </div>

            <div className="space-y-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><HelpCircle size={18} className="text-blue-600" /> Panduan Pengisian</h3>
                    <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
                        <div className="flex gap-3"><span className="flex-none w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">1</span><p>Isi seluruh <strong>Identitas Sekolah & Penyusun</strong>. Kolom ini wajib agar hasil cetak Anda profesional.</p></div>
                        <div className="flex gap-3"><span className="flex-none w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</span><p>Klik tombol <strong>Simpan</strong> di bagian bawah form untuk mengaktifkan generator.</p></div>
                        <div className="flex gap-3"><span className="flex-none w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">3</span><p>Pastikan API Key valid untuk mulai menyusun modul secara otomatis.</p></div>
                    </div>
                </div>
                
                <div className="bg-indigo-600 rounded-2xl shadow-lg p-6 text-white overflow-hidden relative">
                    <Zap className="absolute -right-4 -bottom-4 text-indigo-500 opacity-20" size={120} />
                    <h3 className="font-bold text-lg mb-2">Pakar Modul AI</h3>
                    <p className="text-xs text-indigo-100 leading-relaxed">Sistem kami menggunakan algoritma Deep Learning untuk menyusun modul yang berkesadaran, bermakna, dan menggembirakan.</p>
                </div>
            </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between bg-slate-50 gap-2">
                <div className="flex items-center gap-2"><Clock size={20} className="text-blue-600" /><h2 className="text-lg font-bold text-slate-800">Riwayat Modul Terakhir</h2></div>
                <div className="flex items-center gap-2 text-xs font-semibold bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full"><Info size={14} />Hanya 3 modul terakhir yang disimpan</div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-xs">
                        <tr><th className="p-4 border-b">Waktu</th><th className="p-4 border-b">Mata Pelajaran</th><th className="p-4 border-b">Topik</th><th className="p-4 border-b text-center">Aksi</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {isLoadingHistory ? (
                             <tr><td colSpan={4} className="p-8 text-center"><Loader2 size={24} className="animate-spin mx-auto" /></td></tr>
                        ) : history.length === 0 ? (
                             <tr><td colSpan={4} className="p-8 text-center text-slate-400 italic">Belum ada riwayat pengerjaan.</td></tr>
                        ) : (
                             history.map((item) => (
                                 <tr key={item.id} className="hover:bg-blue-50/30 transition">
                                     <td className="p-4 whitespace-nowrap">{formatDate(item.created_at)}</td>
                                     <td className="p-4 font-bold text-slate-800">{item.subject}</td>
                                     <td className="p-4 max-w-xs truncate">{item.topic}</td>
                                     <td className="p-4 text-center">
                                         <button onClick={() => onLoadHistory(item.full_data, item.input_data)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 mx-auto shadow-sm"><ViewIcon size={14} /> Buka Modul</button>
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
