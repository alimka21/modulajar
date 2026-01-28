
import React, { useState, useEffect } from 'react';
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, QuestionBankConfig, User, AppSettings } from './types';
import { INITIAL_SCHOOL_IDENTITY, INITIAL_LESSON_IDENTITY } from './constants';
import { generateRPP, generateLKPD, generateAssessment, generateQuestionBank, generateMaterials } from './services/geminiService';
import { initializeStorage, authenticate, getSettings } from './services/storageService';

// Components
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import AdminDashboard from './components/AdminDashboard';
import ResultPreview from './components/ResultPreview';

import { GraduationCap, LogOut } from 'lucide-react';

type ViewMode = 'LOGIN' | 'REGISTER' | 'APP' | 'ADMIN';

const App: React.FC = () => {
  // --- AUTH STATE ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
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

  // --- INITIALIZATION ---
  useEffect(() => {
    initializeStorage();
    setAppSettings(getSettings());
    localStorage.setItem('schoolIdentity', JSON.stringify(schoolIdentity));
  }, [schoolIdentity]);

  // --- AUTH HANDLERS ---
  const handleLogin = async (email: string, pass: string) => {
    // Authenticate is now async because of hashing
    const user = await authenticate(email, pass);
    
    if (user) {
        if (user.role === 'user' && user.status === 'pending') {
            setAuthError("Akun Anda belum dikonfirmasi oleh Admin.");
            return;
        }
        
        setCurrentUser(user);
        setAuthError(null);
        
        if (user.role === 'admin') {
            setViewMode('ADMIN');
        } else {
            setViewMode('APP');
        }
    } else {
        setAuthError("Email atau Password salah.");
    }
  };

  const handleLogout = () => {
      setCurrentUser(null);
      setViewMode('LOGIN');
      setGeneratedPlan(null);
      setLessonIdentity(INITIAL_LESSON_IDENTITY);
  };

  // --- GENERATION HANDLERS ---

  const handleGenerateRPP = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rppResult = await generateRPP(schoolIdentity, lessonIdentity);
      setGeneratedPlan(rppResult);
      
      // Add a small delay to avoid hitting Rate Limit immediately after RPP generation
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Auto-chain Assessment
      setIsLoading(false); 
      setIsGeneratingAssessment(true);
      try {
          const assessmentData = await generateAssessment(rppResult);
          setGeneratedPlan(prev => prev ? ({ ...prev, assessment: assessmentData }) : null);
      } catch (assessErr: any) {
          console.error("Assessment chain failed", assessErr);
          setError("RPP berhasil dibuat, namun Asesmen gagal (Server Sibuk). Anda bisa mencoba generate Asesmen lagi secara manual.");
      } finally {
          setIsGeneratingAssessment(false);
      }

    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat menghubungi AI.");
      setIsLoading(false);
    }
  };

  // Modular Generators
  const handleGenerateMaterials = async () => {
    if (!generatedPlan) return;
    setIsGeneratingMaterials(true);
    try {
      const materialContent = await generateMaterials(generatedPlan);
      setGeneratedPlan(prev => prev ? ({ ...prev, materials: materialContent }) : null);
    } catch (err: any) { setError(err.message); } finally { setIsGeneratingMaterials(false); }
  };

  const handleGenerateLKPD = async () => {
    if (!generatedPlan) return;
    setIsGeneratingLKPD(true);
    try {
      const lkpdData = await generateLKPD(generatedPlan);
      setGeneratedPlan(prev => prev ? ({ ...prev, lkpd: lkpdData }) : null);
    } catch (err: any) { setError(err.message); } finally { setIsGeneratingLKPD(false); }
  };

  const handleGenerateAssessment = async () => {
    if (!generatedPlan) return;
    setIsGeneratingAssessment(true);
    try {
      const assessmentData = await generateAssessment(generatedPlan);
      setGeneratedPlan(prev => prev ? ({ ...prev, assessment: assessmentData }) : null);
    } catch (err: any) { setError(err.message); } finally { setIsGeneratingAssessment(false); }
  };

  const handleGenerateQuestionBank = async (config: QuestionBankConfig) => {
    if (!generatedPlan) return;
    setIsGeneratingQuestionBank(true);
    try {
      const questionData = await generateQuestionBank(generatedPlan, config);
      setGeneratedPlan(prev => prev ? ({ ...prev, questionBank: questionData }) : null);
    } catch (err: any) { setError(err.message); } finally { setIsGeneratingQuestionBank(false); }
  };

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
      return <AdminDashboard onLogout={handleLogout} onGoToApp={() => setViewMode('APP')} />;
  }

  // --- MAIN APPLICATION WORKSPACE ---
  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden text-[#1f1f1f] font-sans">
      
      {/* HEADER (AREA 1 Cleaned) */}
      <header className="bg-white border-b border-slate-200 relative h-16 flex-none z-50 px-4 flex items-center justify-between no-print shadow-sm">
          <div className="flex items-center gap-2 select-none">
            <span className="text-blue-600">
                <GraduationCap size={28} />
            </span>
            <div>
                <h1 className="text-lg font-bold text-slate-800 uppercase leading-none">
                    PAKAR MODUL AJAR
                </h1>
                <span className="text-[10px] text-slate-500 font-medium">Platform Pembelajaran Mendalam</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             {currentUser?.role === 'admin' && (
                 <button onClick={() => setViewMode('ADMIN')} className="text-xs font-bold text-blue-600 hover:underline">
                     KEMBALI KE ADMIN
                 </button>
             )}
             <div className="hidden md:flex flex-col items-end mr-2">
                 <span className="text-xs font-bold text-slate-700">{currentUser?.name}</span>
                 <span className="text-[10px] text-slate-500">{currentUser?.email}</span>
             </div>
             <button 
               onClick={handleLogout} 
               className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 font-medium px-4 py-2 rounded-lg transition-colors"
             >
               <LogOut size={16} /> Keluar
             </button>
          </div>
      </header>

      {/* Main Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* RIGHT SIDE: PREVIEW */}
        <main className="flex-1 bg-slate-100 overflow-hidden relative">
            {error && (
                 <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 p-2 bg-red-50 text-red-600 text-xs rounded border border-red-100 shadow-lg">
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
