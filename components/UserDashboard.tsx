
import React, { useState, useEffect } from 'react';
import { SchoolIdentity, User, HistoryItem, GeneratedLessonPlan, LessonIdentity } from '../types';
import { INDONESIAN_MONTHS } from '../constants';
import { validateApiKey } from '../services/geminiService';
import { getHistory, saveUserApiKey } from '../services/storageService';
import { Save, User as UserIcon, School, FileText, Key, Eye, EyeOff, CheckCircle, AlertTriangle, Zap, Trash2, HelpCircle, ArrowRight, Clock, BookOpen, Layers, CheckSquare, Eye as ViewIcon, Loader2 } from 'lucide-react';
import { swal, toast } from '../services/notificationService';

interface UserDashboardProps {
  user: User;
  schoolIdentity: SchoolIdentity;
  onSchoolIdentityChange: (data: SchoolIdentity) => void;
  onGoToGenerator: () => void;
  onLoadHistory: (data: GeneratedLessonPlan, input: LessonIdentity) => void;
}

const UserDashboard: React.FC<UserDashboardProps> = ({ user, schoolIdentity, onSchoolIdentityChange, onGoToGenerator, onLoadHistory }) => {
  // Identity State
  const [identityData, setIdentityData] = useState<SchoolIdentity>(schoolIdentity);
  
  // API Key State
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'NONE' | 'VALID' | 'INVALID'>('NONE');

  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
      // 1. Load API Key (Priority from User Profile in DB, which is passed via props)
      // AuthContext syncs DB -> LocalStorage, so we can check props.user.apiKey
      if (user.apiKey) {
          setApiKey(user.apiKey);
          setKeyStatus('VALID');
      } else {
          // Fallback to local storage just in case
          const savedKey = localStorage.getItem('custom_api_key');
          if (savedKey) {
              setApiKey(savedKey);
              setKeyStatus('VALID'); 
          }
      }

      setIdentityData(schoolIdentity);

      // Load History
      loadHistoryData();
  }, [schoolIdentity, user]);

  const loadHistoryData = async () => {
      setIsLoadingHistory(true);
      const data = await getHistory(user.id);
      setHistory(data);
      setIsLoadingHistory(false);
  };

  // --- IDENTITY HANDLERS ---
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

  // --- API KEY HANDLERS ---
  const handleSaveApiKey = async () => {
      if (!apiKey.trim()) {
          swal.fire({ icon: 'warning', title: 'Input Kosong', text: 'Mohon masukkan API Key terlebih dahulu.' });
          return;
      }
      
      setIsTestingKey(true);
      const isValid = await validateApiKey(apiKey);
      setIsTestingKey(false);

      if (isValid) {
          try {
              // 1. Save to Database (Persistent)
              await saveUserApiKey(user.id, apiKey);
              
              // 2. Sync to LocalStorage (Immediate use for Service)
              localStorage.setItem('custom_api_key', apiKey);
              
              setKeyStatus('VALID');
              swal.fire({ icon: 'success', title: 'Terkoneksi!', text: 'API Key valid dan telah disimpan ke Akun Anda.' });
          } catch (e) {
              swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: 'Gagal menyimpan ke database. Cek koneksi.' });
          }
      } else {
          setKeyStatus('INVALID');
          swal.fire({ icon: 'error', title: 'Koneksi Gagal', text: 'API Key tidak valid atau kuota habis.' });
      }
  };

  const handleDeleteApiKey = () => {
      swal.fire({
          title: 'Hapus API Key?',
          text: "Anda akan kembali menggunakan kuota server (Public).",
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ef4444',
          confirmButtonText: 'Ya, Hapus'
      }).then(async (result: any) => {
          if (result.isConfirmed) {
              try {
                  // 1. Remove from Database
                  await saveUserApiKey(user.id, null);
                  
                  // 2. Remove from LocalStorage
                  localStorage.removeItem('custom_api_key');
                  
                  setApiKey('');
                  setKeyStatus('NONE');
                  toast.fire({ icon: 'success', title: 'API Key Dihapus dari Akun' });
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
        
        {/* HEADER SECTION */}
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
            {/* LEFT COLUMN: IDENTITY SETTINGS */}
            <div className="lg:col-span-2 space-y-6">
                
                {/* IDENTITY CARD */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                        <h2 className="font-bold text-slate-700 flex items-center gap-2">
                            <School size={20} className="text-blue-600" />
                            Identitas Sekolah & Penyusun
                        </h2>
                        <button onClick={saveIdentity} className="text-xs bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-lg hover:bg-blue-200 transition">
                            Simpan Perubahan
                        </button>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Sekolah */}
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
                        {/* Personal */}
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

                {/* API KEY CONFIGURATION */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200">
                        <h2 className="font-bold text-slate-700 flex items-center gap-2">
                            <Key size={20} className="text-amber-500" />
                            Set API Key Mandiri
                        </h2>
                    </div>
                    
                    <div className="p-6">
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                             <AlertTriangle className="text-amber-600 flex-none mt-0.5" size={20} />
                             <div className="text-sm text-amber-800">
                                 <p className="font-bold mb-1">Disimpan di Akun Anda:</p>
                                 <p>API Key akan disimpan secara aman di database akun Anda. Anda tidak perlu memasukkannya lagi saat login dari perangkat lain.</p>
                             </div>
                        </div>

                        <label className="block text-sm font-bold text-slate-700 mb-2">Google Gemini API Key</label>
                        <div className="flex gap-2 mb-4">
                            <div className="relative flex-1">
                                <input 
                                    type={showKey ? "text" : "password"} 
                                    value={apiKey}
                                    onChange={(e) => {
                                        setApiKey(e.target.value);
                                        setKeyStatus('NONE');
                                    }}
                                    className={`w-full pl-4 pr-12 py-3 border rounded-lg text-sm outline-none focus:ring-2 transition bg-white ${
                                        keyStatus === 'VALID' ? 'border-green-500 focus:ring-green-500' : 
                                        keyStatus === 'INVALID' ? 'border-red-500 focus:ring-red-500' :
                                        'border-slate-300 focus:ring-blue-500'
                                    }`}
                                    placeholder="Tempel AIzaSy..."
                                />
                                <button 
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                                >
                                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button 
                                onClick={handleSaveApiKey}
                                disabled={isTestingKey}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm flex items-center gap-2 shadow-sm transition disabled:opacity-50"
                            >
                                {isTestingKey ? 'Menyimpan & Menguji...' : 'Simpan ke Akun'}
                            </button>
                            
                            {keyStatus === 'VALID' && (
                                <button 
                                    onClick={handleDeleteApiKey}
                                    className="bg-white border border-red-200 text-red-600 hover:bg-red-50 font-bold py-2 px-4 rounded-lg text-sm flex items-center gap-2 shadow-sm transition"
                                >
                                    <Trash2 size={16} /> Hapus Key
                                </button>
                            )}
                        </div>
                    </div>
                </div>

            </div>

            {/* RIGHT COLUMN: INSTRUCTIONS & INFO */}
            <div className="space-y-6">
                
                {/* BENEFITS */}
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-lg p-6 text-white relative overflow-hidden">
                    <Zap className="absolute top-0 right-0 opacity-20 -translate-y-4 translate-x-4" size={120} />
                    <h3 className="font-bold text-lg mb-4 relative z-10">Keuntungan Pakai API Key Sendiri</h3>
                    <ul className="space-y-3 text-sm relative z-10">
                        <li className="flex items-start gap-2">
                            <CheckCircle className="flex-none text-emerald-200 mt-0.5" size={16} />
                            <span>Kuota milik pribadi (tidak rebutan dengan user lain).</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckCircle className="flex-none text-emerald-200 mt-0.5" size={16} />
                            <span>Tersimpan otomatis di akun Anda (Cloud).</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckCircle className="flex-none text-emerald-200 mt-0.5" size={16} />
                            <span>Minim error limit penggunaan harian.</span>
                        </li>
                    </ul>
                </div>

                {/* TUTORIAL */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <HelpCircle size={18} className="text-blue-600" />
                        Cara Mendapatkan API Key (GRATIS)
                    </h3>
                    
                    <div className="space-y-6 text-sm text-slate-600">
                        
                        <div className="relative pl-6 border-l-2 border-slate-200">
                            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-100 border-2 border-blue-500"></div>
                            <h4 className="font-bold text-slate-800">1. Buka Google AI Studio</h4>
                            <p className="mt-1 mb-2">Kunjungi link di bawah ini dan login dengan akun Google Anda:</p>
                            <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium break-all">
                                https://aistudio.google.com
                            </a>
                        </div>

                        <div className="relative pl-6 border-l-2 border-slate-200">
                            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-100 border-2 border-blue-500"></div>
                            <h4 className="font-bold text-slate-800">2. Masuk ke Menu API Key</h4>
                            <p className="mt-1">Klik tombol <strong>"Get API key"</strong> atau icon kunci di menu sebelah kiri dashboard.</p>
                        </div>

                        <div className="relative pl-6 border-l-2 border-slate-200">
                            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-100 border-2 border-blue-500"></div>
                            <h4 className="font-bold text-slate-800">3. Buat API Key Baru</h4>
                            <p className="mt-1">Klik <strong>Create API Key</strong> → Pilih <strong>Create API key in new project</strong>.</p>
                        </div>

                        <div className="relative pl-6 border-l-2 border-slate-200">
                            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-100 border-2 border-blue-500"></div>
                            <h4 className="font-bold text-slate-800">4. Salin & Tempel</h4>
                            <p className="mt-1">Salin kode yang muncul (dimulai dengan <code>AIzaSy...</code>) dan tempelkan pada kolom input di halaman ini.</p>
                        </div>

                    </div>
                </div>

            </div>
        </div>

        {/* HISTORY SECTION */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Clock size={20} className="text-blue-600" />
                    Riwayat Generate
                </h2>
                <button onClick={loadHistoryData} className="text-sm text-blue-600 hover:underline font-medium flex items-center gap-1">
                    {isLoadingHistory ? <Loader2 size={14} className="animate-spin" /> : null}
                    Refresh Data
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-bold text-xs">
                        <tr>
                            <th className="p-4 border-b text-center w-12">No</th>
                            <th className="p-4 border-b">Waktu</th>
                            <th className="p-4 border-b">Mata Pelajaran</th>
                            <th className="p-4 border-b">Topik</th>
                            <th className="p-4 border-b">Kelas</th>
                            <th className="p-4 border-b text-center">Output</th>
                            <th className="p-4 border-b text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {isLoadingHistory ? (
                             <tr>
                                 <td colSpan={7} className="p-8 text-center text-slate-400">
                                     <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                                     Memuat riwayat...
                                 </td>
                             </tr>
                        ) : history.length === 0 ? (
                             <tr>
                                 <td colSpan={7} className="p-8 text-center text-slate-400 italic">Belum ada riwayat generate.</td>
                             </tr>
                        ) : (
                             history.map((item, idx) => (
                                 <tr key={item.id} className="hover:bg-blue-50/30 transition">
                                     <td className="p-4 text-center">{idx + 1}</td>
                                     <td className="p-4 whitespace-nowrap">{formatDate(item.created_at)}</td>
                                     <td className="p-4 font-medium text-slate-800">{item.subject}</td>
                                     <td className="p-4 max-w-xs truncate" title={item.topic}>{item.topic}</td>
                                     <td className="p-4">{item.grade}</td>
                                     <td className="p-4">
                                         <div className="flex justify-center gap-2">
                                            {/* RPP+Asesmen */}
                                            <div title="RPM + Asesmen" className={`w-6 h-6 rounded flex items-center justify-center ${item.features.rpp ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-300'}`}>
                                                <Layers size={14} />
                                            </div>
                                            {/* Materi */}
                                            <div title="Materi Ajar" className={`w-6 h-6 rounded flex items-center justify-center ${item.features.materials ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-300'}`}>
                                                <BookOpen size={14} />
                                            </div>
                                            {/* LKPD */}
                                            <div title="Lembar Kerja" className={`w-6 h-6 rounded flex items-center justify-center ${item.features.lkpd ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-300'}`}>
                                                <FileText size={14} />
                                            </div>
                                            {/* Soal */}
                                            <div title="Bank Soal" className={`w-6 h-6 rounded flex items-center justify-center ${item.features.questionBank ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-300'}`}>
                                                <CheckSquare size={14} />
                                            </div>
                                         </div>
                                     </td>
                                     <td className="p-4 text-center">
                                         <button 
                                            onClick={() => onLoadHistory(item.full_data, item.input_data)}
                                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 mx-auto shadow-sm transition"
                                         >
                                             <ViewIcon size={12} /> Lihat
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
