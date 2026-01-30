
import React, { useState, useEffect } from 'react';
import { SchoolIdentity, User, HistoryItem, GeneratedLessonPlan, LessonIdentity } from '../types';
import { INDONESIAN_MONTHS } from '../constants';
import { validateApiKey } from '../services/geminiService';
import { getHistory, saveUserApiKey } from '../services/storageService';
import { useAuth } from '../contexts/AuthContext';
import { Save, User as UserIcon, School, FileText, Key, Eye, EyeOff, CheckCircle, AlertTriangle, Zap, Trash2, HelpCircle, ArrowRight, Clock, BookOpen, Layers, CheckSquare, Eye as ViewIcon, Loader2, RefreshCw, Edit3, X, Info, AlertCircle, ExternalLink } from 'lucide-react';
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
  const [isIdentitySaved, setIsIdentitySaved] = useState(false);

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
      
      // Cek apakah data sudah ada di localstorage untuk mengaktifkan tombol jika data sudah pernah disimpan sebelumnya
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
      setIsIdentitySaved(false); // Reset status simpan jika ada perubahan
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
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-l-4 border-indigo-500 pl-3">Data Guru & Kepsek</h3>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Nama Penyusun (Guru) *</label>
                                    <input name="authorName" value={identityData.authorName} onChange={handleIdentityChange} className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all shadow-sm" placeholder="Nama Lengkap & Gelar" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">NIP Guru *</label>
                                    <input name="authorNip" value={identityData.authorNip} onChange={handleIdentityChange} className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all shadow-sm" placeholder="Masukkan NIP atau -" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Nama Kepsek *</label>
                                        <input name="principalName" value={identityData.principalName} onChange={handleIdentityChange} className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all shadow-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">NIP Kepsek *</label>
                                        <input name="principalNip" value={identityData.principalNip} onChange={handleIdentityChange} className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white transition-all shadow-sm" />
                                    </div>
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

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h2 className="font-bold text-slate-700 flex items-center gap-2">
                            <Key size={20} className="text-amber-500" />
                            Konfigurasi Gemini API
                        </h2>
                        {user.apiKey && !isEditingKey && (
                            <button onClick={handleStartEditing} className="text-xs bg-amber-100 text-amber-700 font-bold px-3 py-1.5 rounded-lg hover:bg-amber-200 transition flex items-center gap-1"><Edit3 size={14} /> Ubah API Key</button>
                        )}
                    </div>
                    <div className="p-6">
                        <div className="relative mb-2">
                            <input 
                                type={showKey ? "text" : "password"} 
                                value={apiKey}
                                disabled={!isEditingKey}
                                onChange={(e) => { setApiKey(e.target.value); setIsKeyValidated(false); setKeyStatus('NONE'); }}
                                className={`w-full pl-4 pr-12 py-3 border rounded-xl text-sm outline-none transition ${!isEditingKey ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' : keyStatus === 'VALID' ? 'bg-white border-green-500 focus:ring-2 focus:ring-green-500' : keyStatus === 'INVALID' ? 'bg-white border-red-500 focus:ring-2 focus:ring-red-500' : 'bg-white border-slate-300 focus:ring-2 focus:ring-blue-500'}`}
                                placeholder={isEditingKey ? "Paste your API Key here..." : "API Key is locked"}
                            />
                            <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">{showKey ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                        </div>
                        {testMessage && <div className={`text-[11px] font-bold mb-4 flex items-center gap-1 ${keyStatus === 'VALID' ? 'text-green-600' : 'text-red-600'}`}>{keyStatus === 'VALID' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}{testMessage}</div>}
                        <div className="flex gap-3 mt-4">
                            {isEditingKey ? (
                                <>
                                    <button onClick={handleTestKey} disabled={isTestingKey || !apiKey.trim()} className="bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 px-6 rounded-xl text-sm flex items-center gap-2 shadow-sm disabled:opacity-50">{isTestingKey ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} />}{isTestingKey ? 'Testing...' : 'Test Connection'}</button>
                                    <button onClick={handleSaveApiKey} disabled={!isKeyValidated || isTestingKey} className={`font-bold py-2.5 px-6 rounded-xl text-sm flex items-center gap-2 shadow-md transition-all ${isKeyValidated ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-200 text-slate-400'}`}><Save size={16} /> Simpan Key</button>
                                </>
                            ) : (
                                <button onClick={handleDeleteApiKey} className="bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 font-bold py-2.5 px-4 rounded-xl text-sm flex items-center gap-2 transition"><Trash2 size={16} /> Remove Key</button>
                            )}
                        </div>
                        
                        <div className="mt-8 p-4 bg-amber-50 rounded-xl border border-amber-100">
                             <h4 className="text-xs font-black text-amber-800 mb-2 flex items-center gap-2">
                                <Info size={14} /> CARA MENDAPATKAN API KEY (GRATIS)
                             </h4>
                             <ol className="text-[11px] text-amber-700 space-y-1.5 list-decimal pl-4">
                                 <li>Kunjungi <strong><a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline font-bold">Google AI Studio</a></strong>.</li>
                                 <li>Login menggunakan akun Google Anda.</li>
                                 <li>Klik tombol <strong>"Create API key"</strong>.</li>
                                 <li>Pilih <strong>"Create API key in new project"</strong>.</li>
                                 <li>Salin (Copy) kode yang muncul dan tempelkan di kotak di atas.</li>
                             </ol>
                             <p className="text-[10px] text-amber-600 mt-2 italic font-medium">Satu API Key bisa digunakan untuk membuat ribuan modul setiap bulannya.</p>
                        </div>
                    </div>
                </div>
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
                <div className="flex items-center gap-2 text-xs font-semibold bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full"><Info size={14} />Hanya 10 modul terakhir yang disimpan</div>
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
