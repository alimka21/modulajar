import React, { useState, useEffect } from 'react';
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, QuestionBankConfig } from './types.ts';
import { INITIAL_SCHOOL_IDENTITY, INITIAL_LESSON_IDENTITY } from './constants.ts';
import { generateRPP, generateLKPD, generateAssessment, generateQuestionBank, optimizeExistingPlan, generateMaterials } from './services/geminiService.ts';
import ResultPreview from './components/ResultPreview.tsx';
import LandingPage from './components/LandingPage.tsx';
import { GraduationCap, Layout, ArrowLeft } from 'lucide-react';

type ViewMode = 'LANDING' | 'WORKSPACE';

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('LANDING');
  
  // Loading states for different parts
  const [isLoading, setIsLoading] = useState<boolean>(false); // General/RPP loading
  const [isGeneratingMaterials, setIsGeneratingMaterials] = useState<boolean>(false);
  const [isGeneratingLKPD, setIsGeneratingLKPD] = useState<boolean>(false);
  const [isGeneratingAssessment, setIsGeneratingAssessment] = useState<boolean>(false);
  const [isGeneratingQuestionBank, setIsGeneratingQuestionBank] = useState<boolean>(false);
  
  const [error, setError] = useState<string | null>(null);

  // Mode state for disabling generation button
  const [isOptimizationMode, setIsOptimizationMode] = useState<boolean>(false);

  // Persistent School Identity
  const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity>(() => {
    const saved = localStorage.getItem('schoolIdentity');
    return saved ? JSON.parse(saved) : INITIAL_SCHOOL_IDENTITY;
  });

  // Dynamic Lesson Identity
  const [lessonIdentity, setLessonIdentity] = useState<LessonIdentity>(INITIAL_LESSON_IDENTITY);
  
  // Generated Result
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedLessonPlan | null>(null);

  // Save Identity on Change
  useEffect(() => {
    localStorage.setItem('schoolIdentity', JSON.stringify(schoolIdentity));
  }, [schoolIdentity]);

  // Handle "Buat dari Awal"
  const handleCreateNew = () => {
    setLessonIdentity(INITIAL_LESSON_IDENTITY);
    setGeneratedPlan(null);
    setIsOptimizationMode(false);
    setViewMode('WORKSPACE');
  };

  // Handle "Optimalkan" (Generate from Text)
  const handleOptimize = async (text: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await optimizeExistingPlan(text);
      
      // Populate states with the parsed result
      setGeneratedPlan(result);
      
      // Update Inputs so they match the result
      setLessonIdentity({
        ...INITIAL_LESSON_IDENTITY,
        subject: result.identitySection.subject || '',
        grade: result.identitySection.grade || '',
        semester: result.identitySection.semester || 'Ganjil',
        timeAllocation: result.identitySection.timeAllocation || '',
        topic: result.identitySection.topic || '',
        objectives: result.design.objectives.join('\n') || '',
      });

      // Update School Identity ONLY if extracted data is present
      setSchoolIdentity(prev => ({
        ...prev,
        schoolName: result.identitySection.schoolName || prev.schoolName,
        authorName: result.approval.authorName || prev.authorName,
        authorNip: result.approval.authorNip || prev.authorNip,
        principalName: result.approval.principalName || prev.principalName,
        principalNip: result.approval.principalNip || prev.principalNip,
        location: result.approval.location || prev.location,
        date: result.approval.date || prev.date,
      }));

      // Switch view and set mode
      setIsOptimizationMode(true);
      setViewMode('WORKSPACE');

    } catch (err: any) {
      setError(err.message || "Gagal mengoptimalkan teks. Pastikan format teks sesuai.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateRPP = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Step 1: Generate RPP Core
      const result = await generateRPP(schoolIdentity, lessonIdentity);
      setGeneratedPlan(result);
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan saat menghubungi AI.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateMaterials = async () => {
    if (!generatedPlan) return;
    setIsGeneratingMaterials(true);
    try {
      const materialContent = await generateMaterials(generatedPlan);
      setGeneratedPlan(prev => prev ? ({ ...prev, materials: materialContent }) : null);
    } catch (err: any) {
      setError(err.message || "Gagal membuat Materi Ajar.");
    } finally {
      setIsGeneratingMaterials(false);
    }
  };

  const handleGenerateLKPD = async () => {
    if (!generatedPlan) return;
    setIsGeneratingLKPD(true);
    try {
      const lkpdData = await generateLKPD(generatedPlan);
      setGeneratedPlan(prev => prev ? ({ ...prev, lkpd: lkpdData }) : null);
    } catch (err: any) {
      setError(err.message || "Gagal membuat LKPD.");
    } finally {
      setIsGeneratingLKPD(false);
    }
  };

  const handleGenerateAssessment = async () => {
    if (!generatedPlan) return;
    setIsGeneratingAssessment(true);
    try {
      const assessmentData = await generateAssessment(generatedPlan);
      setGeneratedPlan(prev => prev ? ({ ...prev, assessment: assessmentData }) : null);
    } catch (err: any) {
      setError(err.message || "Gagal membuat Asesmen.");
    } finally {
      setIsGeneratingAssessment(false);
    }
  };

  const handleGenerateQuestionBank = async (config: QuestionBankConfig) => {
    if (!generatedPlan) return;
    setIsGeneratingQuestionBank(true);
    try {
      const questionData = await generateQuestionBank(generatedPlan, config);
      setGeneratedPlan(prev => prev ? ({ ...prev, questionBank: questionData }) : null);
    } catch (err: any) {
      setError(err.message || "Gagal membuat Bank Soal.");
    } finally {
      setIsGeneratingQuestionBank(false);
    }
  };

  const handleReset = () => {
    setViewMode('LANDING');
    setLessonIdentity(INITIAL_LESSON_IDENTITY);
    setGeneratedPlan(null);
    setIsOptimizationMode(false);
  }

  // --- RENDER ---

  if (viewMode === 'LANDING') {
    return (
      <>
        {error && (
             <div className="fixed top-4 right-4 z-[60] bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg shadow-lg flex items-center gap-4 animate-fade-in font-sans">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="font-bold">✕</button>
             </div>
        )}
        <LandingPage 
          onOptimize={handleOptimize} 
          onCreateNew={handleCreateNew} 
          isOptimizing={isLoading} 
        />
      </>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden text-[#1f1f1f] font-sans">
      {/* Header - Google App Bar Style */}
      <header className="bg-white border-b border-slate-200 h-16 flex-none z-50 px-4 flex items-center justify-between no-print">
          <div className="flex items-center gap-4">
            <button onClick={() => setViewMode('LANDING')} className="p-2 hover:bg-slate-100 rounded-full text-[#444746] transition-colors">
                <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-2 select-none">
              <span className="text-blue-600">
                 <GraduationCap size={24} />
              </span>
              <h1 className="text-[1.1rem] font-medium text-[#444746] uppercase">
                PAKAR MODUL AJAR
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <div className="hidden md:block text-xs text-[#444746] font-medium mr-2">
                Draft tersimpan otomatis
             </div>
             <button 
               onClick={handleReset} 
               className="text-sm text-[#444746] hover:text-black font-medium px-4 py-2 rounded-full hover:bg-slate-100 transition-colors"
             >
               Kembali ke Home
             </button>
          </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 flex overflow-hidden relative bg-slate-50">
        {error && (
             <div className="absolute top-4 right-4 z-[60] bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg shadow-lg flex items-center gap-4 animate-fade-in no-print">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="font-bold">✕</button>
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
          isOptimizationMode={isOptimizationMode}
          onOptimize={handleOptimize}
          
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
  );
};

export default App;