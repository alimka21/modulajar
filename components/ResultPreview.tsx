
import React, { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { GeneratedLessonPlan, LessonIdentity, SchoolIdentity, DocumentSettings, PaperSize, FontSize, QuestionBankConfig, QuestionType, QuestionLevel, LearningStep, MaterialsData, QuestionItem, DeepLearningAssessment } from '../types';
import { FileDown, FileText, CheckSquare, Layers, ChevronDown, ChevronRight, Sparkles, School, Loader2, ClipboardCheck, Settings2, BookOpen, Wand2, BookText, Printer, BookKey, X, SlidersHorizontal, AlertCircle } from 'lucide-react';
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
  
  // Modular generation props
  onGenerateMaterials: () => void;
  isGeneratingMaterials: boolean;
  onGenerateLKPD: () => void;
  isGeneratingLKPD: boolean;
  onGenerateAssessment: () => void;
  isGeneratingAssessment: boolean;
  onGenerateQuestionBank: (config: QuestionBankConfig) => void;
  isGeneratingQuestionBank: boolean;
}

// Updated Tab Types
type TabType = 'SEMUA' | 'RPP_PLUS' | 'MATERI' | 'LKPD' | 'SOAL';
type SectionType = 'SCHOOL' | 'LESSON' | 'SETTINGS';

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

// Question Config Constants
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
  
  // Question Modal State
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
    
    // Create unique ID
    const id = Date.now().toString();
    
    // Save data to localStorage
    localStorage.setItem(`print_data_${id}`, JSON.stringify({ 
        data: data, 
        inputData: inputData 
    }));
    
    // Open print route
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

  const handleSchoolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let { name, value } = e.target;
    onSchoolChange({ ...schoolData, [name]: value });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value;
      if (!val) return;
      let [year, month, day] = val.split('-');
      let monthName = INDONESIAN_MONTHS[parseInt(month) - 1];
      let formattedDate = `${parseInt(day)} ${monthName} ${year}`;
      onSchoolChange({ ...schoolData, date: formattedDate });
  };

  const getIsoDateFromDisplay = (displayDate: string) => {
      if (!displayDate) return "";
      let parts = displayDate.split(' ');
      if (parts.length < 3) return "";
      let day = parts[0].padStart(2, '0');
      let monthIndex = INDONESIAN_MONTHS.indexOf(parts[1]);
      if (monthIndex === -1) return "";
      let year = parts[2];
      return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${day}`;
  };

  // --- QUESTION MODAL LOGIC ---
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

  // STRICK VALIDATION: Check for mandatory school and lesson fields
  const canGenerate = !!(
      schoolData.schoolName && 
      schoolData.authorName && 
      schoolData.principalName && 
      schoolData.location &&
      inputData.subject && 
      inputData.grade && 
      inputData.topic && 
      inputData.objectives
  );

  const getValidationMessage = () => {
      if (!schoolData.schoolName) return "Nama Sekolah wajib diisi.";
      if (!schoolData.authorName) return "Nama Penyusun (Guru) wajib diisi.";
      if (!schoolData.principalName) return "Nama Kepala Sekolah wajib diisi.";
      if (!schoolData.location) return "Kota/Lokasi wajib diisi.";
      if (!inputData.subject) return "Pilih Mata Pelajaran.";
      if (!inputData.grade) return "Pilih Kelas / Fase.";
      if (!inputData.topic) return "Isi Topik / Materi Pembelajaran.";
      if (!inputData.objectives) return "Isi Tujuan Pembelajaran.";
      return "";
  };

  // NOTE: In Print Mode, @media print CSS will override width/padding to A4 standard (20mm margin)
  // This JS style is primarily for SCREEN visualization.
  let paperStyle = {
      fontFamily: "Cambria, Georgia, serif", 
      lineHeight: '1.5',
      color: '#000000',
      fontSize: '12pt',
      padding: '25mm', // Visual padding for screen, Print uses @page margin
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
                <span className={`w-1.5 h-1.5 rounded-full ${
                    hasData ? 'bg-green-500' : 'bg-slate-200'
                }`} />
            )}
        </span>
        {activeTab === id && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-t-full"></div>
        )}
    </button>
  );

  const GenerationToolbar = ({ title, onAction, isLoading, actionLabel, icon: Icon }: any) => (
    <div className="w-full bg-blue-50/50 border-b border-blue-100 p-3 flex items-center justify-between animate-fade-in break-inside-avoid font-sans no-print generation-toolbar">
        <div className="flex items-center gap-3 px-2">
            <div className="bg-blue-100 p-1.5 rounded-lg text-blue-600">
                <Icon size={18} />
            </div>
            <div className="text-sm text-blue-900 font-medium">
                {title}
            </div>
        </div>
        <button 
            onClick={onAction}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 shadow-sm transition-all whitespace-nowrap"
        >
            {isLoading ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
            {actionLabel}
        </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* AREA 3: TOP BAR KANAN (Cleaned) */}
      <div className="flex-none bg-white border-b border-slate-200 relative z-20 no-print">
        <div className="flex flex-col md:flex-row items-center justify-between px-4">
            <div className="flex w-full md:w-auto overflow-x-auto no-scrollbar">
                 <TabButton id="RPP_PLUS" label="RPM + Asesmen" hasData={!!data} icon={Layers} />
                 <TabButton id="MATERI" label="Materi Ajar" hasData={!!data?.materials} icon={BookOpen} />
                 <TabButton id="LKPD" label="Lembar Kerja" hasData={!!data?.lkpd} icon={ClipboardCheck} />
                 <TabButton id="SOAL" label="Bank Soal" hasData={!!data?.questionBank} icon={BookKey} />
                 <TabButton id="SEMUA" label="Semua" hasData={true} icon={FileText} />
            </div>
            <div className="flex items-center gap-2 py-2 md:py-0 border-t md:border-t-0 border-slate-100 w-full md:w-auto justify-end">
                <button onClick={() => data && downloadDocx(data, FIXED_DOC_SETTINGS)} disabled={!data} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md text-xs font-medium transition disabled:opacity-50" title="Download Word"><FileDown size={14} /><span className="hidden sm:inline">Word</span></button>
                <button 
                    onClick={handlePrintDocument} 
                    disabled={!data || isPrinting} 
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-md text-xs font-medium transition disabled:opacity-50" 
                    title="Cetak / PDF"
                >
                    {isPrinting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                    <span className="hidden sm:inline">{isPrinting ? 'Memuat...' : 'Cetak / PDF'}</span>
                </button>
            </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* AREA 4: SIDEBAR TENGAH (Cleaned, No Labels, Always Visible on MD) */}
        <div className="w-[30%] min-w-[320px] flex-none bg-white border-r border-slate-200 relative overflow-y-auto hidden md:block z-0 no-print">
             <div className="p-4 space-y-4 pt-8">
                <div className="border rounded-lg border-slate-200 overflow-hidden">
                   <button onClick={() => toggleSection('SCHOOL')} className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition text-left"><div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><School size={16} /><span>Identitas Sekolah</span></div>{expandedSection === 'SCHOOL' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                   {expandedSection === 'SCHOOL' && (
                      <div className="p-3 space-y-3 bg-white animate-fade-in">
                          <div><label className="text-xs font-medium text-slate-500">Nama Sekolah *</label><input name="schoolName" value={schoolData.schoolName} onChange={handleSchoolChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" /></div>
                          <div><label className="text-xs font-medium text-slate-500">Nama Kepala Sekolah *</label><input name="principalName" value={schoolData.principalName} onChange={handleSchoolChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" /></div>
                          <div><label className="text-xs font-medium text-slate-500">NIP Kepala Sekolah</label><input name="principalNip" value={schoolData.principalNip} onChange={handleSchoolChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" /></div>
                          <div><label className="text-xs font-medium text-slate-500">Nama Guru (Penyusun) *</label><input name="authorName" value={schoolData.authorName} onChange={handleSchoolChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" /></div>
                          <div><label className="text-xs font-medium text-slate-500">NIP Guru</label><input name="authorNip" value={schoolData.authorNip} onChange={handleSchoolChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" /></div>
                          <div><label className="text-xs font-medium text-slate-500">Lokasi & Tanggal *</label><div className="flex gap-2"><input name="location" value={schoolData.location} onChange={handleSchoolChange} className="w-1/2 mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" placeholder="Kota" /><input type="date" value={getIsoDateFromDisplay(schoolData.date)} onChange={handleDateChange} className="w-1/2 mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" placeholder="Tanggal" /></div></div>
                      </div>
                   )}
                </div>
                <div className="border rounded-lg border-slate-200 overflow-hidden">
                   <button onClick={() => toggleSection('LESSON')} className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition text-left"><div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><BookOpen size={16} /><span>Detail Pelajaran</span></div>{expandedSection === 'LESSON' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                   {expandedSection === 'LESSON' && (
                      <div className="p-3 space-y-3 bg-white animate-fade-in">
                          <div><label className="text-xs font-medium text-slate-500">Mata Pelajaran *</label><select name="subject" value={inputData.subject} onChange={handleEditorChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white"><option value="">Pilih Mapel...</option>{SUBJECT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                          <div><label className="text-xs font-medium text-slate-500">Kelas / Fase *</label><select name="grade" value={inputData.grade} onChange={handleGradeChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white"><option value="">Pilih Kelas...</option>{GRADE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                          <div><label className="text-xs font-medium text-slate-500">Semester</label><select name="semester" value={inputData.semester} onChange={handleEditorChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white"><option value="Ganjil">Ganjil</option><option value="Genap">Genap</option></select></div>
                          <div><label className="text-xs font-medium text-slate-500">Alokasi Waktu</label><input name="timeAllocation" value={inputData.timeAllocation} onChange={handleEditorChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" /></div>
                          <div><label className="text-xs font-medium text-slate-500">Jumlah Pertemuan</label><select name="meetingCount" value={inputData.meetingCount} onChange={handleEditorChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white"><option value="1 Pertemuan">1 Pertemuan</option><option value="2 Pertemuan">2 Pertemuan</option><option value="3 Pertemuan">3 Pertemuan</option></select></div>
                          <div><label className="text-xs font-medium text-slate-500">Topik / Materi *</label><input name="topic" value={inputData.topic} onChange={handleEditorChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" placeholder="Topik Utama" /></div>
                          <div><label className="text-xs font-medium text-slate-500">Tujuan Pembelajaran *</label><textarea name="objectives" value={inputData.objectives} onChange={handleEditorChange} rows={4} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm resize-none bg-white" placeholder="Contoh: Murid mampu menganalisis struktur teks..." /></div>
                          
                          <div className="pt-2">
                            <button 
                                onClick={onGenerate} 
                                disabled={isLoading || !canGenerate} 
                                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all shadow-md ${
                                    isLoading || !canGenerate 
                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                                    : 'bg-blue-600 hover:bg-blue-700 text-white transform hover:-translate-y-0.5'
                                }`}
                            >
                                {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                                {isLoading ? "Menyusun RPM..." : "Generate RPM + Asesmen"}
                            </button>
                            
                            {!canGenerate && !isLoading && (
                                <div className="bg-amber-50 border border-amber-200 p-2 mt-3 rounded-md flex items-start gap-2 animate-fade-in">
                                    <AlertCircle size={14} className="text-amber-600 flex-none mt-0.5" />
                                    <p className="text-[10px] text-amber-700 font-medium leading-relaxed">
                                        {getValidationMessage()}
                                    </p>
                                </div>
                            )}
                          </div>
                      </div>
                   )}
                </div>
             </div>
        </div>

        <div className="flex-1 bg-slate-100 overflow-hidden relative flex flex-col items-center">
            {(activeTab === 'MATERI' || activeTab === 'SEMUA') && !data?.materials && data && !isGeneratingMaterials && (<GenerationToolbar title="Materi Ajar Belum Tersedia" onAction={onGenerateMaterials} isLoading={isGeneratingMaterials} actionLabel="Buat Materi" icon={BookText} />)}
            {(activeTab === 'LKPD' || activeTab === 'SEMUA') && !data?.lkpd && data && !isGeneratingLKPD && (<GenerationToolbar title="Lembar Kerja Belum Tersedia" onAction={onGenerateLKPD} isLoading={isGeneratingLKPD} actionLabel="Buat Lembar Kerja" icon={ClipboardCheck} />)}
            {(activeTab === 'SOAL' || activeTab === 'SEMUA') && !data?.questionBank && data && !isGeneratingQuestionBank && (
                <GenerationToolbar 
                    title="Bank Soal Belum Tersedia" 
                    onAction={() => setShowQuestionModal(true)} // Open Modal instead of direct generate
                    isLoading={isGeneratingQuestionBank} 
                    actionLabel="Buat Soal" 
                    icon={BookKey} 
                />
            )}

            {/* QUESTION CONFIG MODAL */}
            {showQuestionModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-fade-in-up">
                        <div className="flex justify-between items-center p-4 border-b border-slate-100">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <SlidersHorizontal size={18} className="text-blue-600" />
                                Konfigurasi Bank Soal
                            </h3>
                            <button onClick={() => setShowQuestionModal(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-5">
                            {/* Count */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Jumlah Soal</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {QUESTION_COUNTS.map(c => (
                                        <button 
                                            key={c}
                                            onClick={() => setQuestionConfig({...questionConfig, count: c})}
                                            className={`py-2 text-sm rounded-lg border font-medium transition ${
                                                questionConfig.count === c 
                                                ? 'bg-blue-600 text-white border-blue-600' 
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Level */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Konsep Soal</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {QUESTION_LEVELS.map(l => (
                                        <button 
                                            key={l}
                                            onClick={() => setQuestionConfig({...questionConfig, level: l})}
                                            className={`py-2 text-xs rounded-lg border font-medium transition ${
                                                questionConfig.level === l 
                                                ? 'bg-indigo-600 text-white border-indigo-600' 
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            {l}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Types */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Tipe Soal (Bisa lebih dari satu)</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {QUESTION_TYPES.map(t => (
                                        <button 
                                            key={t}
                                            onClick={() => toggleQuestionType(t)}
                                            className={`flex items-center justify-between px-3 py-2 text-sm rounded-lg border transition ${
                                                questionConfig.types.includes(t)
                                                ? 'bg-emerald-50 border-emerald-500 text-emerald-700 font-medium'
                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            <span>{t}</span>
                                            {questionConfig.types.includes(t) && <CheckSquare size={16} />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                            <button 
                                onClick={handleSubmitQuestionGen}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold shadow-sm transition flex items-center gap-2"
                            >
                                <Sparkles size={16} />
                                Generate Soal
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div ref={scrollContainerRef} className="flex-1 w-full overflow-y-auto">
                {/* AREA 5: DOKUMEN (Cleaned, No Label, No Border) */}
                <div 
                    id="konten-dokumen"
                    className="bg-white shadow-lg mx-auto min-h-[1000px] transition-all paper-content relative" 
                    style={{ 
                        ...paperStyle 
                    }}
                >
                    {!data ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 font-sans no-print">
                             <div className="bg-slate-50 p-6 rounded-full mb-6 mx-auto w-fit"><Sparkles size={48} className="text-blue-200" /></div>
                             <h3 className="text-xl font-bold text-slate-700 mb-2">Modul Ajar Belum Dibuat</h3>
                             <p className="text-sm text-slate-500 max-w-md mx-auto mb-8">
                                Silahkan lengkapi <strong>Identitas Sekolah</strong> dan <strong>Detail Pelajaran</strong> pada panel di sebelah kiri, lalu klik tombol <strong>Generate RPM + Asesmen</strong>.
                             </p>
                        </div>
                    ) : (
                        <div className="animate-fade-in">
                            <DocumentContent 
                                data={data} 
                                inputData={inputData} 
                                activeTab={activeTab} 
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ResultPreview;
