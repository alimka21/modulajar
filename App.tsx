
import React, { useState, useEffect } from 'react';
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, QuestionBankConfig, User, AppSettings } from './types';
import { INITIAL_SCHOOL_IDENTITY, INITIAL_LESSON_IDENTITY } from './constants';
import { generateRPP, generateLKPD, generateAssessment, generateQuestionBank, generateMaterials } from './services/geminiService';
import { initializeStorage, authenticate, getSettings, incrementGenerationCount, saveHistory, updateHistory } from './services/storageService';
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

// --- WRAPPER COMPONENT UNTUK MENGGUNAKAN AUTH CONTEXT ---
const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  
  // --- APP LOGIC STATE ---
  const [viewMode, setViewMode] = useState<ViewMode>('LOGIN');
  const [appSettings, setAppSettings] = useState<AppSettings>({ promoLink: '', whatsappNumber: '', socialMediaLink: '' });
  const [authError, setAuthError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Modular Loading States
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

  // --- INITIALIZATION ---
  useEffect(() => {
    initializeStorage();
    setAppSettings(getSettings());
    localStorage.setItem('schoolIdentity', JSON.stringify(schoolIdentity));
  }, []);

  // --- HISTORY SAFE WRAPPER ---
  const safeUpdateHistory = (url: string, replace: boolean = false) => {
      // Cek lingkungan Sandbox (Blob / File protocol)
      if (window.location.protocol === 'file:' || window.location.href.startsWith('blob:')) {
          // Jangan lakukan apa-apa di lingkungan ini untuk menghindari error
          return;
      }

      try {
          if (replace) {
              window.history.replaceState(null, '', url);
          } else {
              window.history.pushState(null, '', url);
          }
      } catch (e) {
          // Suppress error agar tidak memenuhi console
          // console.warn("History API blocked (Environment restriction)");
      }
  };

  // --- EFFECT: ROUTING BASED ON AUTH STATE (PROTECTED ROUTE LOGIC) ---
  useEffect(() => {
      if (loading) return;

      if (user) {
          // User Logged In
          setAuthError(null);
          
          if (user.role === 'admin') {
              safeUpdateHistory('/admin', true);
              setViewMode('ADMIN');
          } else {
              if (user.status === 'pending') {
                  // Jika user masih pending dan lolos masuk sini, force logout
                  handleLogout(true); 
                  return;
              }

              // Jika user memaksa URL, kita handle di sini
              const path = window.location.pathname;
              if (path === '/admin') {
                  safeUpdateHistory('/', true); // Tendang user biasa dari admin
                  setViewMode('USER_DASHBOARD');
              } else if (path === '/app') {
                  safeUpdateHistory('/dashboard', true); 
                  setViewMode('USER_DASHBOARD');
              } else {
                  setViewMode('USER_DASHBOARD');
              }
          }
      } else {
          // User Not Logged In (Redirect Logic)
          const path = window.location.pathname;
          
          if (path === '/register') {
              setViewMode('REGISTER');
          } else {
              // HANDLE DIRECT ACCESS TO PROTECTED ROUTES (Like /admin)
              // If path is anything other than /register or /auth, force redirect to /auth
              if (path === '/admin' || path === '/app' || path === '/dashboard') {
                   safeUpdateHistory('/auth', true);
              } else if (path !== '/auth') {
                   safeUpdateHistory('/auth', true);
              }
              setViewMode('LOGIN');
          }
      }
  }, [user, loading]);

  // --- NAVIGATION HELPERS ---
  const navigateTo = (mode: ViewMode, url: string) => {
      safeUpdateHistory(url);
      setViewMode(mode);
  };

  // --- AUTH HANDLERS ---
  const handleLogin = async (email: string, pass: string) => {
    setAuthError(null);
    try {
        const result = await authenticate(email, pass);
        // authenticate function in storageService will now throw specific errors
        if (!result) {
            // This fallback usually won't be reached if authenticate throws error
            setAuthError("Login Gagal. Silakan coba lagi.");
        } else {
            toast.fire({ icon: 'success', title: `Selamat datang!` });
        }
    } catch (e: any) {
        // Tampilkan pesan error spesifik dari storageService (Email tidak terdaftar vs Password salah)
        setAuthError(e.message || "Terjadi kesalahan sistem.");
    }
  };

  const handleLogout = (force: boolean = false) => {
      const performLogout = async () => {
          showLoading('Keluar...', 'Membersihkan sesi...');
          
          // 1. Clear Local Storage explicitly
          // Penting untuk membersihkan semua key Supabase
          Object.keys(localStorage).forEach(key => {
              if (key.startsWith('sb-') || key.includes('supabase') || key === 'custom_api_key' || key === 'schoolIdentity') {
                  localStorage.removeItem(key);
              }
          });

          // 2. Try Supabase SignOut (with timeout to prevent hang)
          try {
              // Gunakan Promise.race agar tidak hang selamanya jika koneksi socket bermasalah
              await Promise.race([
                  supabase.auth.signOut(),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000))
              ]);
          } catch (e) {
              console.warn("Supabase signOut timed out or failed, forcing local cleanup.");
          }

          // 3. Hard Redirect
          // Menggunakan location.href memastikan state React bersih total
          window.location.href = '/';
      };

      if (force) {
          performLogout();
      } else {
          swal.fire({
            title: 'Keluar Aplikasi?',
            text: "Anda akan kembali ke halaman login.",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#f1f5f9',
            confirmButtonText: 'Ya, Keluar',
            cancelButtonText: 'Batal'
          }).then((result: any) => {
            if (result.isConfirmed) {
                performLogout();
            }
          });
      }
  };

  // --- GENERATION LOGIC ---
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
  }, [generatedPlan]);

  // Generators
  const handleGenerateRPP = async () => {
    setIsLoading(true);
    setError(null);
    setCurrentHistoryId(null);
    showLoading('Sedang Menyusun RPM...', 'AI sedang menganalisis kebutuhan...');

    try {
      const rppResult = await generateRPP(schoolIdentity, lessonIdentity);
      setGeneratedPlan(rppResult);
      if (user) incrementGenerationCount(user.id);
      if (user) {
          const newId = await saveHistory(user.id, rppResult, lessonIdentity, {
              rpp: true, assessment: false, materials: false, lkpd: false, questionBank: false
          });
          if (newId) setCurrentHistoryId(newId);
      }
      closeLoading();
      toast.fire({ icon: 'success', title: 'RPM Berhasil Disusun!', text: 'Melanjutkan ke Asesmen...' });
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      setIsLoading(false); 
      setIsGeneratingAssessment(true);
      try {
          const assessmentData = await generateAssessment(rppResult);
          setGeneratedPlan({ ...rppResult, assessment: assessmentData });
          if (user) incrementGenerationCount(user.id);
          toast.fire({ icon: 'success', title: 'Asesmen Siap!' });
      } catch (assessErr: any) {
          console.error("Assessment chain failed", assessErr);
          setError("RPM berhasil dibuat, namun Asesmen gagal.");
      } finally {
          setIsGeneratingAssessment(false);
      }
    } catch (err: any) {
      const errorMessage = err.message || "Gagal menghubungi AI.";
      setError(errorMessage);
      setIsLoading(false);
      swal.fire({ icon: 'error', title: 'Gagal Menyusun RPM', text: errorMessage });
    }
  };

  const handleGenerateMaterials = async () => {
    if (!generatedPlan) return;
    setIsGeneratingMaterials(true);
    showLoading('Sedang Menyusun Materi...', 'AI merangkum materi...');
    try {
      const content = await generateMaterials(generatedPlan);
      setGeneratedPlan(prev => prev ? ({ ...prev, materials: content }) : null);
      if (user) incrementGenerationCount(user.id);
      toast.fire({ icon: 'success', title: 'Materi Siap!' });
    } catch (err: any) { setError(err.message); swal.fire({ icon: 'error', title: 'Gagal', text: err.message }); }
    finally { setIsGeneratingMaterials(false); closeLoading(); }
  };

  const handleGenerateLKPD = async () => {
    if (!generatedPlan) return;
    setIsGeneratingLKPD(true);
    showLoading('Sedang Menyusun LKPD...', 'AI merancang aktivitas...');
    try {
      const data = await generateLKPD(generatedPlan);
      setGeneratedPlan(prev => prev ? ({ ...prev, lkpd: data }) : null);
      if (user) incrementGenerationCount(user.id);
      toast.fire({ icon: 'success', title: 'LKPD Siap!' });
    } catch (err: any) { setError(err.message); swal.fire({ icon: 'error', title: 'Gagal', text: err.message }); }
    finally { setIsGeneratingLKPD(false); closeLoading(); }
  };

  const handleGenerateAssessment = async () => {
    if (!generatedPlan) return;
    setIsGeneratingAssessment(true);
    showLoading('Menyusun Asesmen...', 'AI memperbarui instrumen...');
    try {
      const data = await generateAssessment(generatedPlan);
      setGeneratedPlan(prev => prev ? ({ ...prev, assessment: data }) : null);
      if (user) incrementGenerationCount(user.id);
      toast.fire({ icon: 'success', title: 'Asesmen Diperbarui!' });
    } catch (err: any) { setError(err.message); swal.fire({ icon: 'error', title: 'Gagal', text: err.message }); }
    finally { setIsGeneratingAssessment(false); closeLoading(); }
  };

  const handleGenerateQuestionBank = async (config: QuestionBankConfig) => {
    if (!generatedPlan) return;
    setIsGeneratingQuestionBank(true);
    showLoading('Menyusun Soal...', `AI membuat ${config.count} soal...`);
    try {
      const data = await generateQuestionBank(generatedPlan, config);
      setGeneratedPlan(prev => prev ? ({ ...prev, questionBank: data }) : null);
      if (user) incrementGenerationCount(user.id);
      toast.fire({ icon: 'success', title: 'Bank Soal Selesai!' });
    } catch (err: any) { setError(err.message); swal.fire({ icon: 'error', title: 'Gagal', text: err.message }); }
    finally { setIsGeneratingQuestionBank(false); closeLoading(); }
  };


  // --- RENDER ---
  if (loading) {
      return (
          <div className="min-h-screen bg-white flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="animate-spin text-blue-600 mb-2" size={32} />
              <span className="text-sm font-medium">Memuat Aplikasi...</span>
          </div>
      );
  }

  if (viewMode === 'LOGIN') {
      return <LoginPage onLogin={handleLogin} onGoToRegister={() => setViewMode('REGISTER')} settings={appSettings} error={authError} />;
  }

  if (viewMode === 'REGISTER') {
      return <RegisterPage onBack={() => setViewMode('LOGIN')} settings={appSettings} />;
  }

  // PROTECTED ROUTES (Admin & User Dashboard)
  if (!user) return null; // Should have redirected by useEffect

  if (viewMode === 'ADMIN') {
      return <AdminDashboard onLogout={handleLogout} onGoToApp={() => navigateTo('USER_DASHBOARD', '/')} />;
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
                     <button onClick={() => handleLogout(false)} className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition"><LogOut size={20} /></button>
                  </div>
              </header>
              <UserDashboard user={user} schoolIdentity={schoolIdentity} onSchoolIdentityChange={(data) => { setSchoolIdentity(data); localStorage.setItem('schoolIdentity', JSON.stringify(data)); }} onGoToGenerator={() => navigateTo('APP', '/app')} onLoadHistory={loadHistoryItem} />
          </div>
      );
  }

  // APP GENERATOR VIEW
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
             {user.role === 'admin' && (
                 <button onClick={() => navigateTo('ADMIN', '/admin')} className="text-xs font-bold text-blue-600 hover:underline">KEMBALI KE ADMIN</button>
             )}
             <button onClick={() => navigateTo('USER_DASHBOARD', '/dashboard')} className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600 font-medium transition-colors">
                 <Settings size={18} /><span className="hidden md:inline">Pengaturan</span>
             </button>
             <button onClick={() => handleLogout(false)} className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 font-medium px-3 py-2 rounded-lg transition-colors">
               <LogOut size={18} /> <span className="hidden md:inline">Keluar</span>
             </button>
          </div>
      </header>
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 bg-slate-100 overflow-hidden relative">
            {error && <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 p-2 bg-red-50 text-red-600 text-xs rounded border border-red-100 shadow-lg animate-fade-in-down">{error}</div>}
            <ResultPreview 
                data={generatedPlan} inputData={lessonIdentity} onInputChange={setLessonIdentity} schoolData={schoolIdentity} onSchoolChange={setSchoolIdentity} onGenerate={handleGenerateRPP} isLoading={isLoading}
                onGenerateMaterials={handleGenerateMaterials} isGeneratingMaterials={isGeneratingMaterials}
                onGenerateLKPD={handleGenerateLKPD} isGeneratingLKPD={isGeneratingLKPD}
                onGenerateAssessment={handleGenerateAssessment} isGeneratingAssessment={isGeneratingAssessment}
                onGenerateQuestionBank={handleGenerateQuestionBank} isGeneratingQuestionBank={isGeneratingQuestionBank}
            />
        </main>
      </div>
    </div>
  );
};

// --- MAIN APP ENTRY POINT ---
const App: React.FC = () => {
  // Manual route check for Print (Outside Auth)
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
