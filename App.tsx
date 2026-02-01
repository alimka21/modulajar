
import React, { useState, useEffect } from 'react';
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, QuestionBankConfig, User, AppSettings } from './types';
import { INITIAL_SCHOOL_IDENTITY, INITIAL_LESSON_IDENTITY } from './constants';
import { generateRPP, generateLKPD, generateAssessment, generateQuestionBank, generateMaterials } from './services/geminiService';
import { initializeStorage, authenticate, getSettings, incrementGenerationCount, saveHistory, updateHistory, saveDraft, getDraft, clearDraft } from './services/storageService';
import { swal, toast, showLoading, closeLoading } from './services/notificationService';
import { supabase } from './lib/supabaseClient';
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Components
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import AdminDashboard from './components/AdminDashboard';
import ResultPreview from './components/ResultPreview';
import PrintPage from './components/PrintPage';
import UserDashboard from './components/UserDashboard'; 

import { GraduationCap, LogOut, Loader2, Settings } from 'lucide-react';

type ViewMode = 'LOGIN' | 'REGISTER' | 'APP' | 'ADMIN' | 'USER_DASHBOARD'; 

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  
  const [viewMode, setViewMode] = useState<ViewMode>('LOGIN');
  const [appSettings, setAppSettings] = useState<AppSettings>({ promoLink: '', whatsappNumber: '', socialMediaLink: '' });
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const [isGeneratingMaterials, setIsGeneratingMaterials] = useState<boolean>(false);
  const [isGeneratingLKPD, setIsGeneratingLKPD] = useState<boolean>(false);
  const [isGeneratingAssessment, setIsGeneratingAssessment] = useState<boolean>(false);
  const [isGeneratingQuestionBank, setIsGeneratingQuestionBank] = useState<boolean>(false);
  
  const [error, setError] = useState<string | null>(null);

  const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity>(() => {
    const saved = localStorage.getItem('schoolIdentity');
    return saved ? JSON.parse(saved) : INITIAL_SCHOOL_IDENTITY;
  });

  const [lessonIdentity, setLessonIdentity] = useState<LessonIdentity>(INITIAL_LESSON_IDENTITY);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedLessonPlan | null>(null);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

  // --- INITIALIZATION & HYDRATION ---
  useEffect(() => {
    initializeStorage();
    setAppSettings(getSettings());
    
    // Clean up temporary print data
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('print_data_')) {
            localStorage.removeItem(key);
        }
    });
    
    // PERSISTENCE: Try to load draft from localStorage
    const draft = getDraft();
    if (draft && draft.lessonIdentity) {
        setLessonIdentity(draft.lessonIdentity);
        setGeneratedPlan(draft.generatedPlan);
        setCurrentHistoryId(draft.historyId || null);
    } else {
        // Only set default if no draft exists
        if (!generatedPlan) {
             setLessonIdentity(INITIAL_LESSON_IDENTITY);
        }
    }
  }, []);

  // --- AUTO-SAVE WATCHER ---
  useEffect(() => {
     saveDraft({
         lessonIdentity,
         generatedPlan,
         historyId: currentHistoryId
     });
  }, [lessonIdentity, generatedPlan, currentHistoryId]);

  const safeUpdateHistory = (url: string, replace: boolean = false) => {
      if (typeof window === 'undefined' || !window.history) return;
      if (window.location.protocol === 'data:' || window.location.protocol === 'blob:' || window.location.protocol === 'file:') return;
      try {
          if (replace) {
              window.history.replaceState(null, '', url);
          } else {
              window.history.pushState(null, '', url);
          }
      } catch (e) { }
  };

  useEffect(() => {
      // Tunggu sampai loading selesai
      if (loading) return;

      const path = window.location.pathname;

      if (user) {
          // User sudah login
          setAuthError(null);
          
          if (user.role === 'admin') {
              // Admin
              if (path === '/app') {
                  setViewMode('APP');
              } else if (path === '/dashboard') {
                  setViewMode('USER_DASHBOARD');
              } else {
                  if (viewMode !== 'ADMIN' && viewMode !== 'APP' && viewMode !== 'USER_DASHBOARD') {
                      safeUpdateHistory('/admin', true);
                      setViewMode('ADMIN');
                  } else if (path !== '/admin' && path !== '/app' && path !== '/dashboard') {
                      safeUpdateHistory('/admin', true);
                      setViewMode('ADMIN');
                  }
              }
          } else {
              // User biasa
              if (path === '/app') {
                  setViewMode('APP');
              } else if (path === '/dashboard') {
                  setViewMode('USER_DASHBOARD');
              } else {
                  // Default ke dashboard jika path tidak dikenal
                  safeUpdateHistory('/dashboard', true);
                  setViewMode('USER_DASHBOARD');
              }
          }
      } else {
          // User belum login
          if (path === '/register') {
              setViewMode('REGISTER');
          } else {
              safeUpdateHistory('/auth', true);
              setViewMode('LOGIN');
          }
      }
  }, [user, loading]); 

  const navigateTo = (mode: ViewMode, url: string) => {
      safeUpdateHistory(url);
      setViewMode(mode);
  };

  const handleLogin = async (email: string, pass: string) => {
    setAuthError(null);
    try {
        await authenticate(email, pass);
    } catch (e: any) {
        const errorMessage = e.message || "Gagal login.";
        
        if (errorMessage === "USERNAME_NOT_FOUND") {
            setAuthError("Username tidak ditemukan. Silakan periksa kembali username Anda.");
        } else if (errorMessage === "EMAIL_NOT_FOUND") {
            setAuthError("Email tidak terdaftar. Silakan daftar terlebih dahulu.");
        } else if (errorMessage === "INVALID_PASSWORD") {
            setAuthError("Password salah. Silakan coba lagi.");
        } else if (errorMessage === "ACCOUNT_PENDING") {
            setAuthError("Akun Anda sedang menunggu verifikasi dari Admin.");
            swal.fire({
                icon: 'info',
                title: 'Akun Belum Diverifikasi',
                text: 'Akun Anda telah terdaftar namun masih menunggu verifikasi dari Admin. Silakan hubungi Admin untuk mempercepat proses verifikasi.',
                confirmButtonColor: '#2563eb'
            });
        } else if (errorMessage === "PROFILE_SYNC_ERROR") {
            // ERROR KHUSUS KETIKA DATA ADMIN RUSAK (Mismatch Auth vs Public)
            setAuthError("Data profil tidak sinkron. Harap jalankan script perbaikan SQL.");
            swal.fire({
                icon: 'error',
                title: 'Data Profil Rusak',
                text: 'Akun terautentikasi tetapi profil tidak ditemukan. Harap jalankan script "SUPABASE_FIX_ADMIN_ACCESS.sql" di database untuk memperbaiki ID Mismatch.',
                confirmButtonColor: '#ef4444'
            });
        } else if (errorMessage === "CONNECTION_ERROR") {
            setAuthError("Gagal terhubung ke server. Periksa koneksi internet Anda.");
            swal.fire({ icon: 'error', title: 'Koneksi Gagal', text: 'Sistem tidak dapat menghubungi server database.' });
        } else {
            setAuthError(errorMessage);
        }
    }
  };

  const handleLogout = async () => {
      swal.fire({
        title: 'Keluar Aplikasi?',
        text: "Anda akan kembali ke halaman login.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Ya, Keluar'
      }).then(async (result: any) => {
        if (result.isConfirmed) {
            setViewMode('LOGIN'); 
            safeUpdateHistory('/auth', true);
            setGeneratedPlan(null);
            setLessonIdentity(INITIAL_LESSON_IDENTITY);
            setCurrentHistoryId(null);
            clearDraft();
            sessionStorage.removeItem('custom_api_key');
            await supabase.auth.signOut();
        }
      });
  };

  const updateHistoryRecord = async (plan: GeneratedLessonPlan | null) => {
      if (!plan || !user || !currentHistoryId) return;
      const features = { 
          rpp: true, 
          assessment: !!plan.assessment, 
          materials: !!plan.materials, 
          lkpd: !!plan.lkpd, 
          questionBank: !!plan.questionBank 
      };
      await updateHistory(currentHistoryId, plan, features);
  };

  const loadHistoryItem = (data: GeneratedLessonPlan, input: LessonIdentity) => {
      setGeneratedPlan(data);
      setLessonIdentity(input);
      setCurrentHistoryId(null);
      navigateTo('APP', '/app');
  };

  useEffect(() => {
      if (currentHistoryId && generatedPlan) {
          updateHistoryRecord(generatedPlan);
      }
  }, [generatedPlan, currentHistoryId, user]);

  const handleGenerateRPP = async () => {
    if (!schoolIdentity.schoolName || !lessonIdentity.topic || !lessonIdentity.subject) {
        swal.fire({ icon: 'warning', title: 'Data Belum Lengkap', text: 'Pastikan seluruh identitas sudah diisi di Dashboard.' });
        return;
    }
    setIsLoading(true);
    showLoading('Menyusun RPM', 'AI sedang menganalisis kurikulum dan menyusun langkah pembelajaran...');
    try {
      const rppResult = await generateRPP(schoolIdentity, lessonIdentity);
      closeLoading();
      setGeneratedPlan(rppResult);
      if (user) incrementGenerationCount(user.id);
      if (user) {
          const newId = await saveHistory(user.id, rppResult, lessonIdentity, { 
              rpp: true, assessment: false, materials: false, lkpd: false, questionBank: false 
          });
          if (newId) setCurrentHistoryId(newId);
      }
      toast.fire({ icon: 'success', title: 'RPM Berhasil! Silakan lanjut susun Asesmen.' });
    } catch (e: any) {
        closeLoading();
        swal.fire({ icon: 'error', title: 'Gagal', text: e.message || "Terjadi kesalahan saat generate RPP." });
    } finally {
        setIsLoading(false);
    }
  };

  const handleGenerateMaterials = async () => {
    if (!generatedPlan) return;
    setIsGeneratingMaterials(true);
    showLoading('Menyusun Materi Ajar...', 'AI sedang membedah konsep inti...');
    try {
        const data = await generateMaterials(generatedPlan);
        closeLoading();
        setGeneratedPlan(prev => prev ? ({ ...prev, materials: data }) : null);
        if (user) incrementGenerationCount(user.id);
        toast.fire({ icon: 'success', title: 'Materi Ajar Selesai!' });
    } catch (e: any) {
        closeLoading();
        swal.fire({ icon: 'error', title: 'Gagal', text: e.message });
    } finally {
        setIsGeneratingMaterials(false);
    }
  };

  const handleGenerateLKPD = async () => {
    if (!generatedPlan) return;
    setIsGeneratingLKPD(true);
    showLoading('Menyusun LKPD...', 'Membangun aktivitas murid bertahap...');
    try {
        const data = await generateLKPD(generatedPlan);
        closeLoading();
        setGeneratedPlan(prev => prev ? ({ ...prev, lkpd: data }) : null);
        if (user) incrementGenerationCount(user.id);
        toast.fire({ icon: 'success', title: 'Lembar Kerja Selesai!' });
    } catch (e: any) {
        closeLoading();
        swal.fire({ icon: 'error', title: 'Gagal', text: e.message });
    } finally {
        setIsGeneratingLKPD(false);
    }
  };

  const handleGenerateAssessment = async () => {
    if (!generatedPlan) return;
    setIsGeneratingAssessment(true);
    showLoading('Menyusun Asesmen...', 'Sinkronisasi instrumen evaluasi...');
    try {
        const data = await generateAssessment(generatedPlan);
        closeLoading();
        setGeneratedPlan(prev => prev ? ({ ...prev, assessment: data }) : null);
        toast.fire({ icon: 'success', title: 'Asesmen Selesai!' });
    } catch (e: any) {
        closeLoading();
        swal.fire({ icon: 'error', title: 'Gagal', text: e.message });
    } finally {
        setIsGeneratingAssessment(false);
    }
  };

  const handleGenerateQuestionBank = async (config: QuestionBankConfig) => {
    if (!generatedPlan) return;
    setIsGeneratingQuestionBank(true);
    showLoading('Menyusun Bank Soal...', `AI sedang membuat ${config.count} soal berkualitas...`);
    try {
        const data = await generateQuestionBank(generatedPlan, config);
        closeLoading();
        setGeneratedPlan(prev => prev ? ({ ...prev, questionBank: data }) : null);
        if (user) incrementGenerationCount(user.id);
        toast.fire({ icon: 'success', title: 'Bank Soal Selesai!' });
    } catch (e: any) {
        closeLoading();
        swal.fire({ icon: 'error', title: 'Gagal', text: e.message });
    } finally {
        setIsGeneratingQuestionBank(false);
    }
  };

  if (loading) {
      return (
          <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center animate-fade-in">
              <div className="bg-white p-8 rounded-3xl shadow-xl flex flex-col items-center gap-4 border border-slate-100">
                  <div className="relative">
                      <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                          <GraduationCap className="text-blue-600" size={24} />
                      </div>
                  </div>
                  <div className="text-center">
                      <h3 className="font-bold text-slate-800">Menyiapkan Sesi</h3>
                      <p className="text-xs text-slate-500">Mohon tunggu sebentar...</p>
                  </div>
              </div>
          </div>
      );
  }

  if (viewMode === 'LOGIN') {
      return <LoginPage onLogin={handleLogin} onGoToRegister={() => navigateTo('REGISTER', '/register')} settings={appSettings} error={authError} />;
  }

  if (viewMode === 'REGISTER') {
      return <RegisterPage onBack={() => navigateTo('LOGIN', '/auth')} settings={appSettings} />;
  }

  if (!user) return null;

  if (viewMode === 'ADMIN') {
      return <AdminDashboard onLogout={handleLogout} onGoToApp={() => navigateTo('USER_DASHBOARD', '/dashboard')} />;
  }

  if (viewMode === 'USER_DASHBOARD') {
      return (
          <div className="flex flex-col h-screen bg-slate-50 text-[#1f1f1f] font-sans">
              <header className="bg-white border-b border-slate-200 h-16 flex-none px-4 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-blue-600"><GraduationCap size={28} /></span>
                    <h1 className="text-lg font-bold text-slate-800 uppercase hidden md:block">PAKAR MODUL AJAR</h1>
                  </div>
                  <div className="flex items-center gap-4">
                     <span className="text-sm font-semibold text-slate-700 hidden sm:block">{user.name}</span>
                     <button onClick={handleLogout} className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition"><LogOut size={20} /></button>
                  </div>
              </header>
              <UserDashboard 
                user={user} 
                schoolIdentity={schoolIdentity} 
                onSchoolIdentityChange={(data) => { 
                    setSchoolIdentity(data); 
                    localStorage.setItem('schoolIdentity', JSON.stringify(data)); 
                }} 
                onGoToGenerator={() => navigateTo('APP', '/app')} 
                onLoadHistory={loadHistoryItem} 
              />
          </div>
      );
  }

  return (
    <div className="flex flex-col h-screen bg-white text-[#1f1f1f] font-sans overflow-hidden">
      <header className="bg-white border-b border-slate-200 relative h-16 flex-none z-50 px-4 flex items-center justify-between no-print shadow-sm">
          <div className="flex items-center gap-3 select-none">
            <span className="text-blue-600 flex items-center justify-center"><GraduationCap size={32} /></span>
            <div className="flex flex-col justify-center">
                <h1 className="text-lg font-bold text-slate-800 uppercase leading-none hidden md:block">PAKAR MODUL AJAR</h1>
                <h1 className="text-lg font-bold text-slate-800 uppercase leading-none md:hidden">PAKAR MODUL</h1>
                <span className="text-[10px] text-slate-500 font-medium">Generator Modul Ajar</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <button onClick={() => navigateTo('USER_DASHBOARD', '/dashboard')} className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600 font-medium transition-colors">
                 <Settings size={18} /><span className="hidden md:inline">Dashboard</span>
             </button>
             <button onClick={handleLogout} className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 font-medium px-3 py-2 rounded-lg transition-colors">
               <LogOut size={18} /> <span className="hidden md:inline">Keluar</span>
             </button>
          </div>
      </header>
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 bg-slate-100 overflow-hidden relative">
            {error && <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 p-2 bg-red-50 text-red-600 text-xs rounded border border-red-100 shadow-lg">{error}</div>}
            <ResultPreview 
                data={generatedPlan} 
                inputData={lessonIdentity} 
                onInputChange={setLessonIdentity} 
                schoolData={schoolIdentity} 
                onSchoolChange={setSchoolIdentity} 
                onGenerate={handleGenerateRPP} 
                isLoading={isLoading}
                onGenerateMaterials={handleGenerateMaterials} 
                isGeneratingMaterials={isGeneratingMaterials}
                onGenerateLKPD={handleGenerateLKPD} 
                isGeneratingLKPD={isGeneratingLKPD}
                onGenerateAssessment={handleGenerateAssessment} 
                isGeneratingAssessment={isGeneratingAssessment}
                onGenerateQuestionBank={handleGenerateQuestionBank} 
                isGeneratingQuestionBank={isGeneratingQuestionBank}
            />
        </main>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  if (window.location.pathname.startsWith('/print/')) {
      const id = window.location.pathname.split('/')[2];
      return <PrintPage id={id} />;
  }
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
