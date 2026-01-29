
import React, { useState, useEffect } from 'react';
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, QuestionBankConfig, User, AppSettings } from './types';
import { INITIAL_SCHOOL_IDENTITY, INITIAL_LESSON_IDENTITY } from './constants';
import { generateRPP, generateLKPD, generateAssessment, generateQuestionBank, generateMaterials } from './services/geminiService';
import { initializeStorage, authenticate, getSettings, incrementGenerationCount, saveHistory, updateHistory, mapSessionToUser } from './services/storageService';
import { swal, toast, showLoading, closeLoading } from './services/notificationService';
import { supabase } from './lib/supabaseClient';

// Components
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import AdminDashboard from './components/AdminDashboard';
import ResultPreview from './components/ResultPreview';
import PrintPage from './components/PrintPage';
import UserDashboard from './components/UserDashboard'; 

import { GraduationCap, LogOut, Loader2, User as UserIcon, Settings } from 'lucide-react';

type ViewMode = 'LOGIN' | 'REGISTER' | 'APP' | 'ADMIN' | 'USER_DASHBOARD'; 

const App: React.FC = () => {
  // --- MANUAL ROUTING FOR PRINT PAGE ---
  const currentPath = window.location.pathname;
  if (currentPath.startsWith('/print/')) {
      const id = currentPath.split('/')[2];
      return <PrintPage id={id} />;
  }

  // --- AUTH STATE ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true); 
  const [viewMode, setViewMode] = useState<ViewMode>('LOGIN');
  const [authError, setAuthError] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>({ promoLink: '', whatsappNumber: '', socialMediaLink: '' });

  // --- APP LOGIC STATE ---
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

  // History Tracking for current session
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

  // --- HISTORY SAFE WRAPPER ---
  const safeUpdateHistory = (url: string, replace: boolean = false) => {
      try {
          if (replace) {
              window.history.replaceState(null, '', url);
          } else {
              window.history.pushState(null, '', url);
          }
      } catch (e) {
          console.warn("History API blocked:", e);
      }
  };

  // --- INITIALIZATION & ROUTING (ROBUST SESSION HANDLING) ---
  useEffect(() => {
    initializeStorage();
    setAppSettings(getSettings());
    localStorage.setItem('schoolIdentity', JSON.stringify(schoolIdentity));

    // Listen to Supabase Auth Changes (Login, Logout, Refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        // Fix for "Cache Issue": Always wrap async logic in try/finally to ensure loading state turns off.
        try {
            setIsAuthChecking(true);
            
            if (session) {
                // User is logged in (or session restored from local storage)
                const user = await mapSessionToUser(session);
                
                if (user) {
                    // STRICT PENDING CHECK
                    // If user is pending (and not admin), FORCE LOGOUT immediately.
                    if (user.role !== 'admin' && user.status === 'pending') {
                        console.warn("User is pending. Forcing sign out.");
                        await supabase.auth.signOut();
                        setCurrentUser(null);
                        setAuthError("Akun Anda masih dalam antrean konfirmasi Admin.");
                        swal.fire({
                            icon: 'info',
                            title: 'Menunggu Konfirmasi',
                            text: 'Akun Anda belum diaktifkan oleh Admin. Silakan hubungi Admin jika sudah mendaftar.',
                            confirmButtonColor: '#2563eb'
                        });
                        setViewMode('LOGIN');
                        return; // Stop execution
                    }

                    setCurrentUser(user);
                    
                    // Determine View Mode based on Role & Current Path
                    const path = window.location.pathname;
                    
                    if (user.role === 'admin') {
                        safeUpdateHistory('/admin', true);
                        setViewMode('ADMIN');
                    } else {
                        // User Logic
                        if (path === '/admin') {
                            safeUpdateHistory('/', true);
                            setViewMode('USER_DASHBOARD');
                        } else if (path === '/app') {
                            safeUpdateHistory('/dashboard', true); 
                            setViewMode('USER_DASHBOARD');
                        } else {
                            setViewMode('USER_DASHBOARD');
                        }
                    }
                } else {
                    // Session exists but mapping failed
                    setCurrentUser(null);
                    setViewMode('LOGIN');
                }
            } else {
                // No session (Logged out)
                setCurrentUser(null);
                const path = window.location.pathname;
                // Only redirect to login if not already on auth/register page
                if (path !== '/auth' && path !== '/register') {
                    safeUpdateHistory('/auth', true);
                    setViewMode('LOGIN');
                } else if (path === '/register') {
                    setViewMode('REGISTER');
                } else {
                    setViewMode('LOGIN');
                }
            }
        } catch (error) {
            console.error("Auth State Change Error:", error);
            // Fallback to login on critical error
            setViewMode('LOGIN');
        } finally {
            setIsAuthChecking(false);
        }
    });

    // Cleanup subscription
    return () => {
        subscription.unsubscribe();
    };
  }, []);

  // --- NAVIGATION HELPERS ---
  const navigateTo = (mode: ViewMode, url: string) => {
      safeUpdateHistory(url);
      setViewMode(mode);
  };

  // --- AUTH HANDLERS ---
  const handleLogin = async (email: string, pass: string) => {
    // Note: authenticate() internally calls signInWithPassword
    // This triggers onAuthStateChange above, which handles the routing.
    // So here we just handle the error case UI.
    
    setIsAuthChecking(true);
    const user = await authenticate(email, pass);
    
    if (user) {
        // Double check status here just for immediate feedback
        if (user.role === 'user' && user.status === 'pending') {
            setIsAuthChecking(false);
            const msg = "Akun Anda belum dikonfirmasi oleh Admin.";
            setAuthError(msg);
            swal.fire({
                icon: 'warning',
                title: 'Akun Belum Aktif',
                text: msg,
                confirmButtonColor: '#f59e0b',
                confirmButtonText: 'Mengerti'
            });
            await supabase.auth.signOut();
            return;
        }
        
        // Success Logic handled by onAuthStateChange
        toast.fire({
            icon: 'success',
            title: `Selamat datang, ${user.name}!`
        });
    } else {
        setIsAuthChecking(false);
        const msg = "Email atau Password salah.";
        setAuthError(msg);
        swal.fire({
            icon: 'error',
            title: 'Login Gagal',
            text: msg,
            confirmButtonColor: '#ef4444'
        });
    }
  };

  const handleLogout = () => {
      swal.fire({
        title: 'Keluar Aplikasi?',
        text: "Anda akan kembali ke halaman login.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#f1f5f9',
        confirmButtonText: 'Ya, Keluar',
        cancelButtonText: 'Batal'
      }).then(async (result: any) => {
        if (result.isConfirmed) {
            // Sign out triggers onAuthStateChange -> Sets User Null -> Redirects to Login
            await supabase.auth.signOut();
            
            setGeneratedPlan(null);
            setLessonIdentity(INITIAL_LESSON_IDENTITY);
            setCurrentHistoryId(null);
            
            toast.fire({
                icon: 'success',
                title: 'Berhasil Keluar'
            });
        }
      });
  };

  // --- HISTORY SYNC HELPERS ---
  const updateHistoryRecord = async (plan: GeneratedLessonPlan | null) => {
      if (!plan || !currentUser || !currentHistoryId) return;
      
      const features = {
          rpp: true, // Always true if history exists
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
      setCurrentHistoryId(null); // Reset ID so updates don't overwrite old history (treat as read-only view or new branch if they generate again)
      navigateTo('APP', '/app');
  };

  // --- GENERATION HANDLERS ---

  const handleGenerateRPP = async () => {
    setIsLoading(true);
    setError(null);
    setCurrentHistoryId(null); // New Generation, New History
    
    showLoading('Sedang Menyusun RPM...', 'AI sedang menganalisis kebutuhan pembelajaran Anda. Mohon tunggu...');

    try {
      const rppResult = await generateRPP(schoolIdentity, lessonIdentity);
      setGeneratedPlan(rppResult);
      
      // TRACKING
      if (currentUser) incrementGenerationCount(currentUser.id);

      // SAVE HISTORY (Initial)
      if (currentUser) {
          const newId = await saveHistory(currentUser.id, rppResult, lessonIdentity, {
              rpp: true, assessment: false, materials: false, lkpd: false, questionBank: false
          });
          if (newId) setCurrentHistoryId(newId);
      }

      closeLoading();
      
      // Success Notification for RPP/RPM
      toast.fire({
          icon: 'success',
          title: 'RPM Berhasil Disusun!',
          text: 'Melanjutkan otomatis ke Asesmen...'
      });
      
      // Add a small delay
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Auto-chain Assessment
      setIsLoading(false); 
      setIsGeneratingAssessment(true);
      try {
          const assessmentData = await generateAssessment(rppResult);
          
          const updatedPlan = { ...rppResult, assessment: assessmentData };
          setGeneratedPlan(updatedPlan);
          
          // UPDATE HISTORY (With Assessment)
          // We rely on the useEffect below to sync the update, but to be safe for this specific chain:
          if (currentUser && currentHistoryId) {
              // Note: currentHistoryId state might not be updated in this closure yet if it was just set.
              // However, since we re-render, the Effect hook is the safer place for sync.
          }
          
          // TRACKING (Assessment is separate API call)
          if (currentUser) incrementGenerationCount(currentUser.id);

          toast.fire({
            icon: 'success',
            title: 'Asesmen Siap!',
            text: 'Instrumen Asesmen berhasil ditambahkan.'
          });
          
      } catch (assessErr: any) {
          console.error("Assessment chain failed", assessErr);
          setError("RPM berhasil dibuat, namun Asesmen gagal (Server Sibuk).");
          swal.fire({
              icon: 'warning',
              title: 'Asesmen Tertunda',
              text: 'RPM berhasil, namun server sedang sibuk untuk membuat Asesmen. Silakan klik tombol "Buat Asesmen" nanti.',
              confirmButtonColor: '#f59e0b'
          });
      } finally {
          setIsGeneratingAssessment(false);
      }

    } catch (err: any) {
      const errorMessage = err.message || "Terjadi kesalahan saat menghubungi AI.";
      setError(errorMessage);
      setIsLoading(false);
      
      swal.fire({
          icon: 'error',
          title: 'Gagal Menyusun RPM',
          text: errorMessage,
          confirmButtonColor: '#ef4444'
      });
    }
  };
  
  // Effect to sync history when generatedPlan changes significantly? 
  useEffect(() => {
      if (currentHistoryId && generatedPlan) {
          updateHistoryRecord(generatedPlan);
      }
  }, [generatedPlan]); 


  // Modular Generators
  const handleGenerateMaterials = async () => {
    if (!generatedPlan) return;
    setIsGeneratingMaterials(true);
    showLoading('Sedang Menyusun Materi Ajar...', 'AI sedang merangkum materi yang relevan...');
    try {
      const materialContent = await generateMaterials(generatedPlan);
      setGeneratedPlan(prev => prev ? ({ ...prev, materials: materialContent }) : null);
      
      // TRACKING
      if (currentUser) incrementGenerationCount(currentUser.id);

      toast.fire({
        icon: 'success',
        title: 'Materi Ajar Siap!'
      });
    } catch (err: any) { 
        setError(err.message);
        swal.fire({
            icon: 'error',
            title: 'Gagal Membuat Materi',
            text: err.message,
        });
    } finally { 
        setIsGeneratingMaterials(false); 
        closeLoading();
    }
  };

  const handleGenerateLKPD = async () => {
    if (!generatedPlan) return;
    setIsGeneratingLKPD(true);
    showLoading('Sedang Menyusun LKPD...', 'AI sedang merancang aktivitas dan lembar kerja siswa...');
    try {
      const lkpdData = await generateLKPD(generatedPlan);
      setGeneratedPlan(prev => prev ? ({ ...prev, lkpd: lkpdData }) : null);
      
      // TRACKING
      if (currentUser) incrementGenerationCount(currentUser.id);

      toast.fire({
        icon: 'success',
        title: 'LKPD Berhasil Dibuat!'
      });
    } catch (err: any) { 
        setError(err.message);
        swal.fire({
            icon: 'error',
            title: 'Gagal Membuat LKPD',
            text: err.message,
        });
    } finally { 
        setIsGeneratingLKPD(false); 
        closeLoading();
    }
  };

  const handleGenerateAssessment = async () => {
    if (!generatedPlan) return;
    setIsGeneratingAssessment(true);
    showLoading('Sedang Menyusun Asesmen...', 'AI sedang memperbarui instrumen asesmen...');
    try {
      const assessmentData = await generateAssessment(generatedPlan);
      setGeneratedPlan(prev => prev ? ({ ...prev, assessment: assessmentData }) : null);
      
      // TRACKING
      if (currentUser) incrementGenerationCount(currentUser.id);

      toast.fire({
        icon: 'success',
        title: 'Asesmen Diperbarui!'
      });
    } catch (err: any) { 
        setError(err.message);
        swal.fire({
            icon: 'error',
            title: 'Gagal Membuat Asesmen',
            text: err.message,
        });
    } finally { 
        setIsGeneratingAssessment(false); 
        closeLoading();
    }
  };

  const handleGenerateQuestionBank = async (config: QuestionBankConfig) => {
    if (!generatedPlan) return;
    setIsGeneratingQuestionBank(true);
    showLoading('Sedang Menyusun Bank Soal...', `AI sedang membuat ${config.count} soal tipe ${config.level}...`);
    try {
      const questionData = await generateQuestionBank(generatedPlan, config);
      setGeneratedPlan(prev => prev ? ({ ...prev, questionBank: questionData }) : null);
      
      // TRACKING
      if (currentUser) incrementGenerationCount(currentUser.id);

      toast.fire({
        icon: 'success',
        title: 'Bank Soal Selesai!',
        text: `Berhasil membuat ${config.count} soal.`
      });
    } catch (err: any) { 
        setError(err.message);
        swal.fire({
            icon: 'error',
            title: 'Gagal Membuat Soal',
            text: err.message,
        });
    } finally { 
        setIsGeneratingQuestionBank(false); 
        closeLoading();
    }
  };

  // --- LOADING SCREEN (AUTH) ---
  if (isAuthChecking) {
      return (
          <div className="min-h-screen bg-white flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="animate-spin text-blue-600 mb-2" size={32} />
              <span className="text-sm font-medium">Memuat Aplikasi...</span>
          </div>
      );
  }

  // --- RENDER VIEWS ---

  if (viewMode === 'LOGIN') {
      return (
          <LoginPage 
            onLogin={handleLogin} 
            onGoToRegister={() => setViewMode('REGISTER')} 
            settings={appSettings}
            error={authError}
          />
      );
  }

  if (viewMode === 'REGISTER') {
      return <RegisterPage onBack={() => setViewMode('LOGIN')} settings={appSettings} />;
  }

  if (viewMode === 'ADMIN') {
      return <AdminDashboard onLogout={handleLogout} onGoToApp={() => navigateTo('USER_DASHBOARD', '/')} />;
  }
  
  // NEW: USER DASHBOARD VIEW
  if (viewMode === 'USER_DASHBOARD' && currentUser) {
      return (
          <div className="flex flex-col h-screen bg-slate-50 text-[#1f1f1f] font-sans">
              <header className="bg-white border-b border-slate-200 h-16 flex-none px-4 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-blue-600"><GraduationCap size={28} /></span>
                    <h1 className="text-lg font-bold text-slate-800 uppercase hidden md:block">PAKAR MODUL AJAR</h1>
                  </div>
                  <div className="flex items-center gap-4">
                     <span className="text-sm font-semibold text-slate-700 hidden sm:block">
                        {currentUser.name}
                     </span>
                     <button onClick={handleLogout} className="text-red-600 hover:bg-red-50 p-2 rounded-lg transition"><LogOut size={20} /></button>
                  </div>
              </header>
              <UserDashboard 
                  user={currentUser}
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

  // --- MAIN GENERATOR WORKSPACE (viewMode === 'APP') ---
  return (
    <div className="flex flex-col h-screen bg-white text-[#1f1f1f] font-sans overflow-hidden">
      
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 relative h-16 flex-none z-50 px-4 flex items-center justify-between no-print shadow-sm">
          <div className="flex items-center gap-3 select-none">
            <span className="text-blue-600 flex items-center justify-center">
                <GraduationCap size={32} />
            </span>
            <div className="flex flex-col justify-center">
                <h1 className="text-lg font-bold text-slate-800 uppercase leading-none hidden md:block">
                    PAKAR MODUL AJAR
                </h1>
                <h1 className="text-lg font-bold text-slate-800 uppercase leading-none md:hidden">
                    PAKAR MODUL
                </h1>
                <span className="text-[10px] text-slate-500 font-medium">Generator Modul Ajar</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             {currentUser?.role === 'admin' && (
                 <button onClick={() => navigateTo('ADMIN', '/admin')} className="text-xs font-bold text-blue-600 hover:underline">
                     KEMBALI KE ADMIN
                 </button>
             )}
             
             {/* Back to Dashboard Button */}
             <button 
                 onClick={() => navigateTo('USER_DASHBOARD', '/dashboard')}
                 className="flex items-center gap-2 text-sm text-slate-600 hover:text-blue-600 font-medium transition-colors"
             >
                 <Settings size={18} />
                 <span className="hidden md:inline">Pengaturan</span>
             </button>

             <button 
               onClick={handleLogout} 
               className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 font-medium px-3 py-2 rounded-lg transition-colors"
             >
               <LogOut size={18} /> <span className="hidden md:inline">Keluar</span>
             </button>
          </div>
      </header>

      {/* Main Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* RIGHT SIDE: PREVIEW */}
        <main className="flex-1 bg-slate-100 overflow-hidden relative">
            {error && (
                 <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 p-2 bg-red-50 text-red-600 text-xs rounded border border-red-100 shadow-lg animate-fade-in-down">
                    {error}
                </div>
            )}
            
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

export default App;
