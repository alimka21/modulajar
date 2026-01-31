
import React, { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { GeneratedLessonPlan, LessonIdentity, SchoolIdentity, DocumentSettings, PaperSize, FontSize, QuestionBankConfig, QuestionType, QuestionLevel, LearningStep, MaterialsData, QuestionItem, DeepLearningAssessment } from '../types';
import { FileDown, FileText, CheckSquare, Layers, ChevronDown, ChevronRight, Sparkles, School, Loader2, ClipboardCheck, Settings2, BookOpen, Wand2, BookText, Printer, BookKey, X, SlidersHorizontal, AlertCircle, Info, Edit3 } from 'lucide-react';
import { downloadDocx } from '../services/documentService';
import { INDONESIAN_MONTHS } from '../constants';
import DocumentContent from './DocumentContent';

declare var marked: any;
declare var Swal: any;
declare var MathJax: any;

interface ResultPreviewProps {
  data: GeneratedLessonPlan | null;
  inputData: LessonIdentity;
  onInputChange: (data: LessonIdentity) => void;
  schoolData: SchoolIdentity;
  onSchoolChange: (data: SchoolIdentity) => void;
  onGenerate: () => void;
  isLoading: boolean;
  
  onGenerateMaterials: () => void;
  isGeneratingMaterials: boolean;
  onGenerateLKPD: () => void;
  isGeneratingLKPD: boolean;
  onGenerateAssessment: () => void;
  isGeneratingAssessment: boolean;
  onGenerateQuestionBank: (config: QuestionBankConfig) => void;
  isGeneratingQuestionBank: boolean;
}

type TabType = 'SEMUA' | 'RPP_PLUS' | 'MATERI' | 'LKPD' | 'SOAL';
type SectionType = 'LESSON' | 'SCHOOL_VIEW';

const GRADE_OPTIONS = [
    "Kelas I Fase A", "Kelas II Fase A",
    "Kelas III Fase B", "Kelas IV Fase B",
    "Kelas V Fase C", "Kelas VI Fase C",
    "Kelas VII Fase D", "Kelas VIII Fase D", "Kelas IX Fase D",
    "Kelas X Fase E", "Kelas XI Fase F", "Kelas XII Fase F"
];

const SUBJECT_OPTIONS = [
    "Pendidikan Agama dan Budi Pekerti", "Pendidikan Pancasila", "Bahasa Indonesia", "Matematika",
    "Ilmu Pengetahuan Alam dan Sosial (IPAS)", "Ilmu Pengetahuan Alam (IPA)", "Ilmu Pengetahuan Sosial (IPS)",
    "Bahasa Inggris", "Pendidikan Jasmani, Olahraga, dan Kesehatan (PJOK)", "Informatika",
    "Seni Musik", "Seni Rupa", "Seni Teater", "Seni Tari", "Prakarya", "Sejarah", "Geografi",
    "Ekonomi", "Sosiologi", "Biologi", "Kimia", "Fisika", "Antropologi", "Lainnya"
];

const QUESTION_COUNTS = [5, 10, 15, 20];
const QUESTION_LEVELS: QuestionLevel[] = ['LOTS', 'HOTS', 'CAMPURAN'];
const QUESTION_TYPES: QuestionType[] = ['Pilihan Ganda', 'Pilihan Ganda Kompleks', 'Menjodohkan', 'Benar/Salah', 'Isian Singkat', 'Uraian'];

const ResultPreview: React.FC<ResultPreviewProps> = ({ 
    data, inputData, onInputChange, schoolData, onSchoolChange, onGenerate, isLoading,
    onGenerateMaterials, isGeneratingMaterials,
    onGenerateLKPD, isGeneratingLKPD, onGenerateAssessment, isGeneratingAssessment,
    onGenerateQuestionBank, isGeneratingQuestionBank
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('RPP_PLUS');
  const [expandedSection, setExpandedSection] = useState<SectionType>('LESSON');
  const [isPrinting, setIsPrinting] = useState(false);
  
  // Mobile Sidebar State
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [questionConfig, setQuestionConfig] = useState<QuestionBankConfig>({
      count: 10,
      level: 'CAMPURAN',
      types: ['Pilihan Ganda', 'Uraian']
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const toggleSection = (section: SectionType) => {
    setExpandedSection(expandedSection === section ? 'LESSON' : section);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  const handlePrintDocument = () => {
    if (!data) return;
    const id = Date.now().toString();
    localStorage.setItem(`print_data_${id}`, JSON.stringify({ data: data, inputData: inputData }));
    window.open(`/print/${id}`, '_blank');
  };

  const getMinutesPerJP = (grade: string): string => {
    if (/Kelas (I|II|III|IV|V|VI)\b/.test(grade)) return "35 Menit";
    if (/Kelas (VII|VIII|IX)\b/.test(grade)) return "40 Menit";
    if (/Kelas (X|XI|XII)\b/.test(grade)) return "45 Menit";
    return "45 Menit";
  };

  const handleEditorChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    let { name, value } = e.target;
    let newData = { ...inputData, [name]: value };
    if (name === 'timeAllocation') {
        let jpMatch = value.match(/^(\d+)\s*(JP)?$/i);
        if (jpMatch && inputData.grade) {
            let jpCount = jpMatch[1];
            let minutes = getMinutesPerJP(inputData.grade);
            newData.timeAllocation = `${jpCount} JP x ${minutes}`;
        }
    }
    onInputChange(newData);
  };

  const handleGradeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      let selectedGrade = e.target.value;
      let jpCount = "2";
      if (inputData.timeAllocation) {
          let match = inputData.timeAllocation.match(/^(\d+)/);
          if (match) jpCount = match[1];
      }
      let minutes = getMinutesPerJP(selectedGrade);
      let timeAlloc = `${jpCount} JP x ${minutes}`;
      onInputChange({ ...inputData, grade: selectedGrade, timeAllocation: timeAlloc });
  };

  const toggleQuestionType = (type: QuestionType) => {
      const current = questionConfig.types;
      if (current.includes(type)) {
          setQuestionConfig({...questionConfig, types: current.filter(t => t !== type)});
      } else {
          setQuestionConfig({...questionConfig, types: [...current, type]});
      }
  };

  const handleSubmitQuestionGen = () => {
      if (questionConfig.types.length === 0) {
          alert("Pilih minimal satu tipe soal!");
          return;
      }
      setShowQuestionModal(false);
      onGenerateQuestionBank(questionConfig);
  };

  // LESSON IDENTITY VALIDATION
  const canGenerate = !!(
      inputData.subject && 
      inputData.grade && 
      inputData.topic && 
      inputData.objectives
  );

  let paperStyle = {
      fontFamily: "Cambria, Georgia, serif", 
      lineHeight: '1.5',
      color: '#000000',
      fontSize: '12pt',
      padding: '25mm',
      width: '210mm',
      minHeight: '297mm'
  };

  const FIXED_DOC_SETTINGS: DocumentSettings = { paperSize: 'A4', fontSize: '12pt' };

  const TabButton = ({ id, label, hasData, icon: Icon }: { id: TabType, label: string, hasData: boolean, icon: any }) => (
    <button 
        onClick={() => handleTabChange(id)}
        className={`px-4 py-3 text-sm font-medium transition-all relative whitespace-nowrap font-sans flex items-center gap-2 ${
            activeTab === id 
            ? 'text-blue-600 bg-blue-50/50' 
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
        }`}
    >
        <Icon size={16} />
        <span className="flex items-center gap-2">
            {label}
            {data && id !== 'SEMUA' && (
                <span className={`w-1.5 h-1.5 rounded-full ${hasData ? 'bg-green-500' : 'bg-slate-200'}`} />
            )}
        </span>
        {activeTab === id && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full"></div>
        )}
    </button>
  );

  const GenerationToolbar = ({ title, onAction, isLoading, actionLabel, icon: Icon }: any) => (
    <div className="w-full bg-blue-50 border-b border-blue-100 p-3 flex items-center justify-between animate-fade-in font-sans no-print">
        <div className="flex items-center gap-3 px-2">
            <div className="bg-blue-100 p-1.5 rounded-lg text-blue-600"><Icon size={18} /></div>
            <div className="text-sm text-blue-900 font-bold">{title}</div>
        </div>
        <button onClick={onAction} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-md transition-all">
            {isLoading ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
            {actionLabel}
        </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none bg-white border-b border-slate-200 relative z-20 no-print shadow-sm">
        <div className="flex flex-col md:flex-row items-center justify-between px-4">
            <div className="flex w-full md:w-auto overflow-x-auto no-scrollbar">
                 <TabButton id="RPP_PLUS" label="RPM + Asesmen" hasData={!!data} icon={Layers} />
                 <TabButton id="MATERI" label="Materi Ajar" hasData={!!data?.materials} icon={BookOpen} />
                 <TabButton id="LKPD" label="Lembar Kerja" hasData={!!data?.lkpd} icon={ClipboardCheck} />
                 <TabButton id="SOAL" label="Bank Soal" hasData={!!data?.questionBank} icon={BookKey} />
                 <TabButton id="SEMUA" label="Semua" hasData={true} icon={FileText} />
            </div>
            <div className="flex items-center gap-2 py-2 md:py-0 border-t md:border-t-0 border-slate-100 w-full md:w-auto justify-end">
                <button onClick={() => data && downloadDocx(data, FIXED_DOC_SETTINGS)} disabled={!data} className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition disabled:opacity-50"><FileDown size={14} /><span>DOCX</span></button>
                <button onClick={handlePrintDocument} disabled={!data || isPrinting} className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-xs font-bold transition disabled:opacity-50">
                    {isPrinting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                    <span>CETAK</span>
                </button>
            </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* MOBILE TOGGLE FOR SIDEBAR */}
        <div className="absolute top-2 left-2 z-40 md:hidden">
            <button 
                onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
                className="bg-blue-600 text-white p-3 rounded-full shadow-lg flex items-center justify-center"
                title="Edit Data Modul"
            >
                <Edit3 size={20} />
            </button>
        </div>

        {/* SIDEBAR CONTAINER */}
        <div className={`
            fixed inset-0 z-50 bg-white transform transition-transform duration-300 ease-in-out
            md:relative md:translate-x-0 md:w-[30%] md:min-w-[340px] md:flex-none md:border-r md:border-slate-200 md:block
            ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            overflow-y-auto no-print shadow-2xl md:shadow-none
        `}>
             <div className="p-5 space-y-4 pt-6">
                {/* Close Button Mobile */}
                <div className="flex justify-between items-center md:hidden mb-4">
                    <h3 className="font-bold text-slate-800 text-lg">Input Data Modul</h3>
                    <button onClick={() => setIsMobileSidebarOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-500"><X size={20}/></button>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-2 text-slate-700 font-bold text-xs uppercase mb-2">
                        <School size={16} className="text-blue-600" />
                        Identitas Terkunci
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium">Data sekolah diambil otomatis dari dashboard.</p>
                    <div className="mt-2 text-xs font-bold text-slate-800 truncate">{schoolData.schoolName}</div>
                </div>

                <div className="border rounded-xl border-slate-200 overflow-hidden shadow-sm">
                   <div className="w-full flex items-center justify-between p-4 bg-white border-b border-slate-100 text-left">
                       <div className="flex items-center gap-2 text-sm font-bold text-slate-800"><BookOpen size={18} className="text-indigo-600" /><span>Detail Pembelajaran</span></div>
                   </div>
                   <div className="p-4 space-y-4 bg-white">
                      <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mata Pelajaran *</label><select name="subject" value={inputData.subject} onChange={handleEditorChange} className="w-full mt-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"><option value="">Pilih Mapel...</option>{SUBJECT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                      <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Kelas / Fase *</label><select name="grade" value={inputData.grade} onChange={handleGradeChange} className="w-full mt-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"><option value="">Pilih Kelas...</option>{GRADE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Semester</label><select name="semester" value={inputData.semester} onChange={handleEditorChange} className="w-full mt-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"><option value="Ganjil">Ganjil</option><option value="Genap">Genap</option></select></div>
                        <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alokasi Waktu</label><input name="timeAllocation" value={inputData.timeAllocation} onChange={handleEditorChange} className="w-full mt-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" /></div>
                      </div>
                      
                      <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Jumlah Pertemuan</label>
                          <select name="meetingCount" value={inputData.meetingCount} onChange={handleEditorChange} className="w-full mt-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                              <option value="1 Pertemuan">1 Pertemuan</option>
                              <option value="2 Pertemuan">2 Pertemuan</option>
                              <option value="3 Pertemuan">3 Pertemuan</option>
                          </select>
                      </div>

                      <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Topik / Materi *</label><input name="topic" value={inputData.topic} onChange={handleEditorChange} className="w-full mt-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" placeholder="Contoh: Energi Terbarukan" /></div>
                      <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tujuan Pembelajaran *</label><textarea name="objectives" value={inputData.objectives} onChange={handleEditorChange} rows={4} className="w-full mt-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Murid mampu menganalisis..." /></div>
                      
                      <div className="pt-4">
                        <button 
                            onClick={() => {
                                setIsMobileSidebarOpen(false); // Close sidebar on generate
                                onGenerate();
                            }} 
                            disabled={isLoading || !canGenerate} 
                            className={`w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl text-sm font-black transition-all shadow-xl ${
                                isLoading || !canGenerate 
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none' 
                                : 'bg-blue-600 hover:bg-blue-700 text-white transform hover:-translate-y-1'
                            }`}
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                            {isLoading ? "PROSES GENERATE..." : "GENERATE MODUL"}
                        </button>
                        
                        {!canGenerate && !isLoading && (
                            <div className="bg-amber-50 border border-amber-100 p-3 mt-4 rounded-xl flex items-start gap-2 animate-fade-in">
                                <AlertCircle size={16} className="text-amber-500 flex-none mt-0.5" />
                                <p className="text-[10px] text-amber-700 font-bold leading-relaxed uppercase">Mohon lengkapi seluruh kolom bertanda bintang (*)</p>
                            </div>
                        )}
                      </div>
                   </div>
                </div>
             </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 bg-slate-100 overflow-hidden relative flex flex-col items-center">
            {/* Overlay for mobile when sidebar open */}
            {isMobileSidebarOpen && (
                <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsMobileSidebarOpen(false)} />
            )}

            {/* MANUAL ASSESSMENT TOOLBAR */}
            {(activeTab === 'RPP_PLUS' || activeTab === 'SEMUA') && !data?.assessment && data && !isGeneratingAssessment && (
                <GenerationToolbar 
                    title="Asesmen Belum Tersedia" 
                    onAction={onGenerateAssessment} 
                    isLoading={isGeneratingAssessment} 
                    actionLabel="Susun Asesmen" 
                    icon={CheckSquare} 
                />
            )}

            {(activeTab === 'MATERI' || activeTab === 'SEMUA') && !data?.materials && data && !isGeneratingMaterials && (<GenerationToolbar title="Materi Ajar Belum Tersedia" onAction={onGenerateMaterials} isLoading={isGeneratingMaterials} actionLabel="Buat Materi" icon={BookText} />)}
            {(activeTab === 'LKPD' || activeTab === 'SEMUA') && !data?.lkpd && data && !isGeneratingLKPD && (<GenerationToolbar title="Lembar Kerja Belum Tersedia" onAction={onGenerateLKPD} isLoading={isGeneratingLKPD} actionLabel="Buat LKPD" icon={ClipboardCheck} />)}
            {(activeTab === 'SOAL' || activeTab === 'SEMUA') && !data?.questionBank && data && !isGeneratingQuestionBank && (<GenerationToolbar title="Bank Soal Belum Tersedia" onAction={() => setShowQuestionModal(true)} isLoading={isGeneratingQuestionBank} actionLabel="Buat Bank Soal" icon={BookKey} />)}

            {showQuestionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-fade-in-up">
                        <div className="flex justify-between items-center p-5 border-b border-slate-100">
                            <h3 className="font-black text-slate-800 flex items-center gap-2 uppercase tracking-wide"><SlidersHorizontal size={18} className="text-blue-600" /> Konfigurasi Soal</h3>
                            <button onClick={() => setShowQuestionModal(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Jumlah Butir Soal</label><div className="grid grid-cols-4 gap-2">{QUESTION_COUNTS.map(c => <button key={c} onClick={() => setQuestionConfig({...questionConfig, count: c})} className={`py-2 text-sm rounded-xl border font-bold transition ${questionConfig.count === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{c}</button>)}</div></div>
                            <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Level Kognitif</label><div className="grid grid-cols-3 gap-2">{QUESTION_LEVELS.map(l => <button key={l} onClick={() => setQuestionConfig({...questionConfig, level: l})} className={`py-2 text-xs rounded-xl border font-bold transition ${questionConfig.level === l ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{l}</button>)}</div></div>
                            <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Tipe Soal</label><div className="grid grid-cols-2 gap-2">{QUESTION_TYPES.map(t => <button key={t} onClick={() => toggleQuestionType(t)} className={`flex items-center justify-between px-3 py-2 text-xs rounded-xl border transition ${questionConfig.types.includes(t) ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-bold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}><span>{t}</span>{questionConfig.types.includes(t) && <CheckSquare size={14} />}</button>)}</div></div>
                        </div>
                        <div className="p-5 bg-slate-50 border-t border-slate-100 flex justify-end"><button onClick={handleSubmitQuestionGen} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-black shadow-lg transition flex items-center justify-center gap-2 uppercase tracking-wide"><Sparkles size={18} /> Mulai Generate</button></div>
                    </div>
                </div>
            )}

            <div ref={scrollContainerRef} className="flex-1 w-full overflow-y-auto pt-8">
                <div id="konten-dokumen" className="bg-white shadow-2xl mx-auto transition-all paper-content relative" style={{ ...paperStyle }}>
                    {!data ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 font-sans no-print">
                             <div className="bg-slate-50 p-8 rounded-full mb-6 mx-auto w-fit border border-slate-100"><Sparkles size={64} className="text-blue-300 animate-pulse" /></div>
                             <h3 className="text-2xl font-black text-slate-800 mb-3 uppercase tracking-tight">Siap Untuk Beraksi?</h3>
                             <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                                <span className="md:hidden">Tekan tombol <span className="text-blue-600 font-bold"><Edit3 size={12} className="inline"/></span> di pojok kiri atas untuk mengisi data.</span>
                                <span className="hidden md:inline">Pilih mata pelajaran, topik, dan tujuan pembelajaran di panel kiri untuk memulai proses penyusunan modul oleh AI.</span>
                             </p>
                        </div>
                    ) : (
                        <div className="animate-fade-in"><DocumentContent data={data} inputData={inputData} activeTab={activeTab} /></div>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ResultPreview;
