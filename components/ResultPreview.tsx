import React, { useState, useRef, useEffect } from 'react';
import { GeneratedLessonPlan, LessonIdentity, SchoolIdentity, DocumentSettings, PaperSize, FontSize, QuestionBankConfig, QuestionType, QuestionLevel, LearningStep, MaterialsData } from '../types.ts';
import { FileDown, FileText, CheckSquare, Layers, ChevronDown, ChevronRight, Sparkles, School, Loader2, ClipboardCheck, Settings2, BookOpen, Wand2, BookText, Printer } from 'lucide-react';
import { downloadDocx, downloadPdf } from '../services/documentService.ts';
import { INDONESIAN_MONTHS } from '../constants.ts';

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
  isOptimizationMode: boolean;
  onOptimize: (text: string) => void;
  
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

type TabType = 'SEMUA' | 'RPP' | 'MATERI' | 'LKPD' | 'ASESMEN' | 'REFLEKSI' | 'SOAL';
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

const QUESTION_TYPES: QuestionType[] = ['Pilihan Ganda', 'Pilihan Ganda Kompleks', 'Menjodohkan', 'Isian Singkat', 'Uraian'];

const safeString = (val: any): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) {
    return val.map(safeString).join(", ");
  }
  if (typeof val === 'object') {
      return val.text || val.content || val.value || val.description || JSON.stringify(val);
  }
  return String(val);
};

const protectLatex = (text: string) => {
    const placeholders: string[] = [];
    const protectedText = text.replace(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g, (match) => {
        placeholders.push(match);
        return `LATEXPLACEHOLDER${placeholders.length - 1}`;
    });
    return { protectedText, placeholders };
};

const restoreLatex = (html: string, placeholders: string[]) => {
    return html.replace(/LATEXPLACEHOLDER(\d+)/g, (_, index) => placeholders[parseInt(index)]);
};

const renderMarkdown = (text: string) => {
    const stringText = safeString(text);
    const { protectedText, placeholders } = protectLatex(stringText);
    const formatted = protectedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    if (typeof marked !== 'undefined') {
        const html = marked.parse(formatted);
        return { __html: restoreLatex(html, placeholders) };
    }
    
    return { __html: restoreLatex(formatted, placeholders) };
};

const renderInlineMarkdown = (text: string) => {
    let stringText = safeString(text);
    stringText = stringText.replace(/^\d+\.\s*/, ''); 

    const { protectedText, placeholders } = protectLatex(stringText);

    if (typeof marked !== 'undefined') {
        let html = "";
        if (typeof marked.parseInline === 'function') {
             html = marked.parseInline(protectedText);
        } else {
             html = marked.parse(protectedText).replace(/<\/?p[^>]*>/g, ""); 
        }
        return { __html: restoreLatex(html, placeholders) };
    }
    
    const formatted = protectedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return { __html: restoreLatex(formatted, placeholders) };
};

const ResultPreview: React.FC<ResultPreviewProps> = ({ 
    data, inputData, onInputChange, schoolData, onSchoolChange, onGenerate, isLoading, isOptimizationMode, onOptimize,
    onGenerateMaterials, isGeneratingMaterials,
    onGenerateLKPD, isGeneratingLKPD, onGenerateAssessment, isGeneratingAssessment,
    onGenerateQuestionBank, isGeneratingQuestionBank
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('RPP');
  const [expandedSection, setExpandedSection] = useState<SectionType>('LESSON');
  const [rawInputText, setRawInputText] = useState('');
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [qbConfig, setQbConfig] = useState<QuestionBankConfig>({
      count: 5,
      level: 'MIXED',
      types: ['Pilihan Ganda']
  });

  useEffect(() => {
    if (data && typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
      const container = document.getElementById('konten-dokumen');
      if (container) {
        MathJax.typesetPromise([container])
          .catch((err: any) => console.log('MathJax typeset failed: ' + err.message));
      }
    }
  }, [data, activeTab]);

  const toggleSection = (section: SectionType) => {
    setExpandedSection(expandedSection === section ? 'LESSON' : section);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  };

  const handleDownloadPDF = () => {
      if(!data) return;
      setIsPdfGenerating(true);
      try {
          downloadPdf(data, { paperSize: 'A4', fontSize: '12pt' });
      } catch (e) {
          console.error(e);
          Swal.fire('Error', 'Gagal generate PDF', 'error');
      } finally {
          setIsPdfGenerating(false);
      }
  };

  // --- DEPENDENCY CHECK LOGIC ---
  const handleGenerateMaterialsClick = () => {
      onGenerateMaterials();
  };

  const handleGenerateLKPDClick = () => {
      if (!data?.materials) {
          Swal.fire({
              icon: 'warning',
              title: 'Alur Belum Sesuai',
              text: 'Maaf, LKPD membutuhkan konten dari Materi Ajar (Tab 2) terlebih dahulu.',
              confirmButtonColor: '#2563eb',
              confirmButtonText: 'Oke, Saya Paham'
          });
          return;
      }
      onGenerateLKPD();
  };

  const handleGenerateAssessmentClick = () => {
      if (!data?.lkpd) {
          Swal.fire({
              icon: 'warning',
              title: 'Alur Belum Sesuai',
              text: 'Maaf, Asesmen membutuhkan detail aktivitas dari LKPD (Tab 3) terlebih dahulu.',
              confirmButtonColor: '#2563eb',
              confirmButtonText: 'Oke, Saya Paham'
          });
          return;
      }
      onGenerateAssessment();
  };

  const handleQuestionConfigSubmit = () => {
      if (!data?.materials) {
          Swal.fire({
              icon: 'error',
              title: 'Data Belum Lengkap',
              text: 'Maaf, Bank Soal membutuhkan Materi Ajar (Tab 2). Silahkan generate Materi dulu.',
              confirmButtonColor: '#2563eb'
          });
          return;
      }
      if (!data?.assessment) {
          Swal.fire({
              icon: 'error',
              title: 'Data Belum Lengkap',
              text: 'Maaf, Bank Soal membutuhkan Indikator KKTP dari Asesmen (Tab 4). Silahkan generate Asesmen dulu.',
              confirmButtonColor: '#2563eb'
          });
          return;
      }
      onGenerateQuestionBank(qbConfig);
  };

  const getMinutesPerJP = (grade: string): string => {
    if (/Kelas (I|II|III|IV|V|VI)\b/.test(grade)) return "35 Menit";
    if (/Kelas (VII|VIII|IX)\b/.test(grade)) return "40 Menit";
    if (/Kelas (X|XI|XII)\b/.test(grade)) return "45 Menit";
    return "45 Menit";
  };

  const handleEditorChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let newData = { ...inputData, [name]: value };
    if (name === 'timeAllocation') {
        const jpMatch = value.match(/^(\d+)\s*(JP)?$/i);
        if (jpMatch && inputData.grade) {
            const jpCount = jpMatch[1];
            const minutes = getMinutesPerJP(inputData.grade);
            newData.timeAllocation = `${jpCount} JP x ${minutes}`;
        }
    }
    onInputChange(newData);
  };

  const handleGradeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedGrade = e.target.value;
      let jpCount = "2";
      if (inputData.timeAllocation) {
          const match = inputData.timeAllocation.match(/^(\d+)/);
          if (match) jpCount = match[1];
      }
      const minutes = getMinutesPerJP(selectedGrade);
      const timeAlloc = `${jpCount} JP x ${minutes}`;
      onInputChange({ ...inputData, grade: selectedGrade, timeAllocation: timeAlloc });
  };

  const handleSchoolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    onSchoolChange({ ...schoolData, [name]: value });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (!val) return;
      const [year, month, day] = val.split('-');
      const monthName = INDONESIAN_MONTHS[parseInt(month) - 1];
      const formattedDate = `${parseInt(day)} ${monthName} ${year}`;
      onSchoolChange({ ...schoolData, date: formattedDate });
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

  const canGenerate = !!(inputData.topic && inputData.subject && schoolData.schoolName && inputData.objectives);
  const getValidationMessage = () => {
      if (!schoolData.schoolName) return "Lengkapi Identitas Sekolah";
      if (!inputData.subject) return "Pilih Mata Pelajaran";
      if (!inputData.topic) return "Isi Topik Pembelajaran";
      if (!inputData.objectives) return "Isi Tujuan Pembelajaran";
      return "";
  };

  const paperStyle = {
      fontFamily: '"Cambria", "Times New Roman", serif', 
      lineHeight: '1.5',
      color: '#000000',
      fontSize: '12pt' 
  };

  const FIXED_DOC_SETTINGS: DocumentSettings = { paperSize: 'A4', fontSize: '12pt' };

  const TabButton = ({ id, label, hasData }: { id: TabType, label: string, hasData: boolean }) => (
    <button 
        onClick={() => handleTabChange(id)}
        className={`px-4 py-3 text-sm font-medium transition-all relative whitespace-nowrap font-sans ${
            activeTab === id 
            ? 'text-blue-600' 
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
        }`}
    >
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
    <div className="w-full bg-blue-50/50 border-b border-blue-100 p-3 flex items-center justify-between animate-fade-in break-inside-avoid font-sans no-print">
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

  const QuestionToolbar = () => (
    <div className="w-full bg-white border-b border-slate-200 p-3 animate-fade-in shadow-[0_2px_4px_-2px_rgba(0,0,0,0.05)] z-10 font-sans no-print">
        <div className="max-w-6xl mx-auto flex flex-col xl:flex-row items-start xl:items-center gap-4 justify-between">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-3 flex-1 w-full xl:w-auto">
                 <div className="hidden xl:flex bg-slate-100 p-1.5 rounded-lg text-slate-600">
                    <Settings2 size={18} />
                 </div>
                 <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
                     <div className="flex flex-col w-full sm:w-24">
                        <label className="text-[10px] font-bold text-slate-500 mb-0.5 uppercase">Jml Soal</label>
                        <select value={qbConfig.count} onChange={(e) => setQbConfig({...qbConfig, count: parseInt(e.target.value)})} className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 outline-none">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (<option key={num} value={num}>{num} Soal</option>))}
                        </select>
                     </div>
                     <div className="flex flex-col w-full sm:w-48">
                        <label className="text-[10px] font-bold text-slate-500 mb-0.5 uppercase">Level Kognitif</label>
                        <select value={qbConfig.level} onChange={(e) => setQbConfig({...qbConfig, level: e.target.value as QuestionLevel})} className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 outline-none">
                            <option value="LOTS">Sederhana (LOTS)</option>
                            <option value="MIXED">Seimbang (LOTS & HOTS)</option>
                            <option value="HOTS">Tinggi (HOTS)</option>
                        </select>
                     </div>
                     <div className="flex flex-col flex-1 min-w-[200px]">
                         <label className="text-[10px] font-bold text-slate-500 mb-0.5 uppercase">Tipe Soal</label>
                         <select 
                            value={qbConfig.types.length > 1 ? 'Campuran' : qbConfig.types[0]} 
                            onChange={(e) => {
                                const val = e.target.value;
                                const newTypes = val === 'Campuran' ? QUESTION_TYPES : [val as QuestionType];
                                setQbConfig({ ...qbConfig, types: newTypes });
                            }} 
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                         >
                             {QUESTION_TYPES.map(type => (
                                 <option key={type} value={type}>{type}</option>
                             ))}
                             <option value="Campuran">Campuran (Semua)</option>
                         </select>
                     </div>
                 </div>
            </div>
            <button onClick={handleQuestionConfigSubmit} disabled={isGeneratingQuestionBank || qbConfig.types.length === 0} className="w-full xl:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 shadow-sm transition-all whitespace-nowrap self-end xl:self-center">
                {isGeneratingQuestionBank ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                Generate Bank Soal
            </button>
        </div>
    </div>
  );

  const BoxSection = ({ title, children, className = "" }: { title: string; children?: React.ReactNode, className?: string }) => (
    <div className={`mb-6 break-inside-avoid ${className}`}>
        <div className="font-bold uppercase mb-2 text-black text-inherit">
            {title}
        </div>
        <div className="text-justify text-black text-inherit">
            {children}
        </div>
    </div>
  );

  const OpenSection = ({ title, children, className = "", contentAlign = "text-justify" }: { title: string; children?: React.ReactNode, className?: string, contentAlign?: string }) => (
    <div className={`mb-6 break-inside-avoid text-black ${className}`}>
        <h3 className="font-bold uppercase mb-2 text-black text-inherit">
            {title}
        </h3>
        <div className={`${contentAlign} text-black text-inherit`}>
            {children}
        </div>
    </div>
  );

  const RubricTable = ({ items }: { items: any[] }) => (
    <div className="mb-8 break-inside-avoid">
        <table className="w-full border-collapse border border-black table-fixed text-black text-inherit">
            <thead>
                <tr className="bg-[#f0f0f0]"> 
                    <th className="border border-black p-2 text-left w-[20%] align-middle font-bold text-inherit">Kriteria</th>
                    <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-inherit">Perlu Bimbingan</th>
                    <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-inherit">Cukup</th>
                    <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-inherit">Baik</th>
                    <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-inherit">Sangat Baik</th>
                </tr>
            </thead>
            <tbody>
                {items.map((item, idx) => (
                    <tr key={idx}>
                        <td className="border border-black p-2 font-bold align-top break-words text-inherit">{safeString(item.criteria)}</td>
                        <td className="border border-black p-2 text-center align-top break-words text-inherit">{safeString(item.needsGuidance)}</td>
                        <td className="border border-black p-2 text-center align-top break-words text-inherit">{safeString(item.basic)}</td>
                        <td className="border border-black p-2 text-center align-top break-words text-inherit">{safeString(item.proficient)}</td>
                        <td className="border border-black p-2 text-center align-top break-words text-inherit">{safeString(item.advanced)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
  );

  const LkpdHeader = () => (
    <div className="mb-8 bg-white text-black text-inherit font-serif">
      <div className="text-center mb-4">
        {/* Header 24pt Bold */}
        <h1 className="font-bold uppercase tracking-wide" style={{ fontSize: '24pt', lineHeight: '1.2' }}>
            LEMBAR KERJA PESERTA DIDIK (LKPD)
        </h1>
        {/* Topic 12pt Bold */}
        <h2 className="uppercase mt-2 font-bold" style={{ fontSize: '12pt' }}>
            TOPIK: {data?.lkpd?.activityTitle || inputData.topic}
        </h2>
      </div>
      
      <div className="w-full my-4" style={{ borderBottom: '1.5pt solid black' }}></div>
      
      {/* Changed grid-cols-2 to flex-col to stack items */}
      <div className="flex flex-col gap-6" style={{ fontSize: '12pt' }}>
        <div className="space-y-1">
           <div className="flex"><span className="font-bold min-w-[150px]">Mata Pelajaran</span><span>: {inputData.subject}</span></div>
           <div className="flex"><span className="font-bold min-w-[150px]">Kelas / Fase</span><span>: {inputData.grade}</span></div>
           <div className="flex"><span className="font-bold min-w-[150px]">Jumlah Pertemuan</span><span>: {inputData.meetingCount}</span></div>
        </div>
        <div>
             <div className="font-bold mb-2">Identitas Kelompok</div>
             <div className="space-y-2">
                 <div className="flex items-end gap-2"><span className="min-w-[140px]">Nama Kelompok</span><div className="flex-1 border-b border-black border-dotted">: ........................................</div></div>
                 <div className="flex items-start gap-2">
                    <span className="min-w-[140px]">Anggota Kelompok</span>
                    <div className="flex-1">
                        <div className="border-b border-black border-dotted mb-1">: 1. .....................................</div>
                        <div className="border-b border-black border-dotted mb-1 ml-2"> 2. .....................................</div>
                        <div className="border-b border-black border-dotted mb-1 ml-2"> 3. .....................................</div>
                        <div className="border-b border-black border-dotted mb-1 ml-2"> 4. .....................................</div>
                    </div>
                 </div>
             </div>
        </div>
      </div>
    </div>
  );

  const LkpdContent = () => {
    if (isGeneratingLKPD) return <div className="text-center py-20">Loading LKPD...</div>;
    if (!data?.lkpd) return <div className="text-center py-20 text-gray-400">Belum ada data LKPD</div>;
    
    return (
        <div className="break-inside-avoid lkpd-reset text-inherit">
            <LkpdHeader />
            
            <div className="mb-6 text-inherit">
                 <h3 className="font-bold uppercase mb-2 text-inherit">Petunjuk Pengerjaan:</h3>
                 <ol className="list-decimal pl-5 space-y-1 text-inherit">
                     {data.lkpd.guides && data.lkpd.guides.length > 0 
                        ? data.lkpd.guides.map((g,i) => <li key={i}>{safeString(g)}</li>)
                        : <li>Bacalah instruksi dengan seksama.</li>
                     }
                 </ol>
            </div>

            <OpenSection title="A. TUJUAN MISI">
                 <div className="markdown-content text-inherit" dangerouslySetInnerHTML={renderMarkdown(data.lkpd.objectives)} />
            </OpenSection>

            <OpenSection title="B. ALAT & BAHAN">
                <ul className="list-disc pl-5 text-inherit">
                    {data.lkpd.toolsMaterials && data.lkpd.toolsMaterials.length > 0 
                        ? data.lkpd.toolsMaterials.map((t, i) => <li key={i}>{safeString(t)}</li>) 
                        : <li>-</li>
                    }
                </ul>
            </OpenSection>

            <OpenSection title="C. LANGKAH KERJA">
                <ol className="list-decimal pl-5 text-inherit">
                    {data.lkpd.instructions.map((t, i) => <li key={i}>{safeString(t)}</li>)}
                </ol>
            </OpenSection>

            <OpenSection title="D. ZONA AKTIVITAS" contentAlign="text-left">
                <div 
                    className="markdown-content text-inherit whitespace-pre-wrap leading-relaxed" 
                    dangerouslySetInnerHTML={renderMarkdown(data.lkpd.activityZone)} 
                />
            </OpenSection>

            <OpenSection title="E. MARI BERDISKUSI">
                <ol className="list-decimal pl-5 space-y-4 text-inherit">
                    {data.lkpd.discussionQuestions.map((t, i) => <li key={i}>{safeString(t)}</li>)}
                </ol>
            </OpenSection>

            <OpenSection title="F. REFLEKSI DIRI" contentAlign="text-left">
                 <div 
                    className="markdown-content text-inherit" 
                    dangerouslySetInnerHTML={renderMarkdown(data.lkpd.reflection)} 
                 />
            </OpenSection>
        </div>
    );
  };

  const AssessmentContent = () => {
      if (isGeneratingAssessment) return <div className="text-center py-20">Loading Asesmen...</div>;
      if (!data?.assessment) return <div className="text-center py-20 text-gray-400">Belum ada data Asesmen</div>;
      
      const { kktp, formative, summative, intervention } = data.assessment;

      return (
          <div className="break-inside-avoid text-inherit">
            <h2 className="text-center mb-2 uppercase" style={{ fontSize: '24pt', fontWeight: 'bold' }}>INSTRUMEN ASESMEN & EVALUASI</h2>
            <h3 className="text-center font-bold mb-8 uppercase" style={{ fontSize: '12pt' }}>TOPIK: {inputData.topic}</h3>
            
            <OpenSection title="1. KKTP (Rubrik Pembelajaran Mendalam)">
                 <p className="italic mb-4 text-inherit">Menggunakan Taksonomi SOLO (Structure of the Observed Learning Outcome)</p>
                 <RubricTable items={kktp} />
            </OpenSection>

            <div className="page-break h-4"></div>

            <OpenSection title="2. Asesmen Formatif (Proses)">
                <div className="mb-6">
                    <h4 className="font-bold mb-2 text-inherit">A. Lembar Observasi (Checklist)</h4>
                    <table className="w-full border-collapse border border-black text-black text-inherit">
                        <thead>
                            <tr className="bg-[#f0f0f0]">
                                <th className="border border-black p-2 text-center w-10 font-bold text-inherit">No</th>
                                <th className="border border-black p-2 text-left font-bold text-inherit">Aspek Pengamatan</th>
                                <th className="border border-black p-2 text-left font-bold text-inherit">Indikator Perilaku</th>
                                <th className="border border-black p-2 text-center w-24 font-bold text-inherit">Ceklis</th>
                            </tr>
                        </thead>
                        <tbody>
                            {formative.checklist.map((item, idx) => (
                                <tr key={idx}>
                                    <td className="border border-black p-2 text-center text-inherit">{idx + 1}</td>
                                    <td className="border border-black p-2 text-inherit">{safeString(item.aspect)}</td>
                                    <td className="border border-black p-2 text-inherit">{safeString(item.indicator)}</td>
                                    <td className="border border-black p-2 text-center text-inherit"></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mb-6">
                    <h4 className="font-bold mb-2 text-inherit">B. Tangga Umpan Balik (Feedback Ladder)</h4>
                    <div className="border border-black p-4 text-inherit">
                        <div className="mb-2">
                            <span className="font-bold text-inherit">KLARIFIKASI: </span>
                            <span className="italic text-inherit">"{safeString(formative.feedbackGuide.clarification)}"</span>
                        </div>
                        <div className="mb-2">
                            <span className="font-bold text-inherit">APRESIASI: </span>
                            <span className="italic text-inherit">"{safeString(formative.feedbackGuide.appreciation)}"</span>
                        </div>
                        <div>
                            <span className="font-bold text-inherit">SARAN: </span>
                            <span className="italic text-inherit">"{safeString(formative.feedbackGuide.suggestion)}"</span>
                        </div>
                    </div>
                </div>
            </OpenSection>
            
            <OpenSection title="3. Asesmen Sumatif (Kisi-Kisi)">
                 <div className="mb-4">
                     <p className="mb-2 text-inherit">Berikut adalah kisi-kisi soal untuk mengukur pencapaian akhir, yang terhubung dengan Bank Soal.</p>
                     <table className="w-full border-collapse border border-black text-inherit">
                        <thead>
                            <tr className="bg-[#f0f0f0]">
                                <th className="border border-black p-2 text-center w-10 font-bold text-inherit">No</th>
                                <th className="border border-black p-2 text-left font-bold text-inherit">Indikator Soal</th>
                                <th className="border border-black p-2 text-center font-bold text-inherit">Level Kognitif</th>
                                <th className="border border-black p-2 text-center font-bold text-inherit">Bentuk Soal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summative.grid && Array.isArray(summative.grid) ? summative.grid.map((item, idx) => (
                                <tr key={idx}>
                                    <td className="border border-black p-2 text-center text-inherit">{idx + 1}</td>
                                    <td className="border border-black p-2 text-inherit">{safeString(item.indicator)}</td>
                                    <td className="border border-black p-2 text-center text-inherit">{safeString(item.level)}</td>
                                    <td className="border border-black p-2 text-center text-inherit">{safeString(item.technique)}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="border border-black p-4 text-center text-inherit">Belum ada kisi-kisi</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                 </div>
            </OpenSection>

            <OpenSection title="4. Tindak Lanjut & Intervensi">
                <table className="w-full border-collapse border border-black text-inherit">
                    <thead>
                        <tr className="bg-[#f0f0f0]">
                            <th className="border border-black p-2 text-left w-1/3 font-bold text-inherit">Kondisi Siswa</th>
                            <th className="border border-black p-2 text-left font-bold text-inherit">Strategi Intervensi</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="border border-black p-2 font-bold text-inherit">Perlu Bimbingan</td>
                            <td className="border border-black p-2 text-inherit">{safeString(intervention.needsGuidance)}</td>
                        </tr>
                        <tr>
                            <td className="border border-black p-2 font-bold text-inherit">Cukup</td>
                            <td className="border border-black p-2 text-inherit">{safeString(intervention.basic)}</td>
                        </tr>
                        <tr>
                            <td className="border border-black p-2 font-bold text-inherit">Baik</td>
                            <td className="border border-black p-2 text-inherit">{safeString(intervention.proficient)}</td>
                        </tr>
                        <tr>
                            <td className="border border-black p-2 font-bold text-inherit">Sangat Baik</td>
                            <td className="border border-black p-2 text-inherit">{safeString(intervention.advanced)}</td>
                        </tr>
                    </tbody>
                </table>
            </OpenSection>
          </div>
      );
  };

  const QuestionBankContent = () => {
    if (isGeneratingQuestionBank) return <div className="text-center py-20">Loading Soal...</div>;
    if (!data?.questionBank) return <div className="text-center py-20 text-gray-400">Belum ada data Bank Soal</div>;
    
    return (
        <div className="break-inside-avoid text-inherit">
            <h2 className="text-center mb-2 uppercase" style={{ fontSize: '24pt', fontWeight: 'bold' }}>BANK SOAL & EVALUASI</h2>
            <h3 className="text-center font-bold mb-8 uppercase" style={{ fontSize: '12pt' }}>TOPIK: {inputData.topic}</h3>
            
            <div className="mb-8">
                {data.questionBank.items.map((item, idx) => (
                    <div key={idx} className="mb-6 break-inside-avoid">
                        <div className="font-bold mb-1 flex gap-2 text-inherit">
                            <span>{item.number}.</span>
                            <span className="uppercase text-xs bg-slate-100 px-2 py-0.5 rounded border text-slate-500 font-sans self-start">{safeString(item.type)}</span>
                        </div>
                        {item.stimulus && (
                            <div className="mb-2 italic text-slate-700 border-l-2 border-slate-300 pl-3 text-inherit">
                                {safeString(item.stimulus)}
                            </div>
                        )}
                        
                        {item.type === 'Menjodohkan' ? (
                             <div className="ml-6 mb-2 text-inherit">
                                <div className="mb-2" dangerouslySetInnerHTML={renderMarkdown(item.question)} />
                                <table className="w-full border-collapse border border-slate-300 text-sm mt-2 font-sans">
                                    <thead>
                                        <tr className="bg-slate-50">
                                            <th className="border border-slate-300 p-2 text-left">Pernyataan</th>
                                            <th className="border border-slate-300 p-2 text-center w-8"></th>
                                            <th className="border border-slate-300 p-2 text-center w-8"></th>
                                            <th className="border border-slate-300 p-2 text-left">Pasangan</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                         {(() => {
                                            const leftLines = item.question.split('\n').filter(l => l.trim().length > 0);
                                            const rightLines = item.options || [];
                                            const maxRows = Math.max(leftLines.length, rightLines.length);
                                            const rows = [];
                                            for(let i=0; i<maxRows; i++) {
                                                rows.push(
                                                    <tr key={i}>
                                                        <td className="border border-slate-300 p-2">{leftLines[i] || ""}</td>
                                                        <td className="border border-slate-300 p-2 text-center"><div className="w-3 h-3 rounded-full border border-slate-400 mx-auto"></div></td>
                                                        <td className="border border-slate-300 p-2 text-center"><div className="w-3 h-3 rounded-full border border-slate-400 mx-auto"></div></td>
                                                        <td className="border border-slate-300 p-2">{rightLines[i] ? rightLines[i].replace(/^[a-eA-E][\.\)]\s*/, '') : ""}</td>
                                                    </tr>
                                                );
                                            }
                                            return rows;
                                         })()}
                                    </tbody>
                                </table>
                             </div>
                        ) : (
                            <>
                                <div className="ml-6 mb-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.question)} />
                                {item.options && item.options.length > 0 && (
                                    <div className="ml-6 space-y-1 text-inherit">
                                        {item.options.map((opt, oIdx) => (
                                            <div key={oIdx} className="flex gap-2">
                                                <span className="font-bold">{String.fromCharCode(65 + oIdx)}.</span>
                                                <span dangerouslySetInnerHTML={renderInlineMarkdown(opt.replace(/^[a-eA-E][\.\)]\s*/, ''))} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ))}
            </div>

            <div className="page-break h-8"></div>
            
            <h3 className="text-center font-bold mb-6 text-xl uppercase text-inherit">KUNCI JAWABAN</h3>
            <table className="w-full border-collapse border border-black text-inherit">
                <thead>
                    <tr className="bg-[#f0f0f0]">
                        <th className="border border-black p-2 text-center w-16 font-bold text-inherit">No</th>
                        <th className="border border-black p-2 text-left font-bold text-inherit">Jawaban</th>
                        <th className="border border-black p-2 text-center w-32 font-bold text-inherit">Tipe</th>
                    </tr>
                </thead>
                <tbody>
                    {data.questionBank.items.map((item, idx) => (
                        <tr key={idx}>
                            <td className="border border-black p-2 text-center font-bold text-inherit">{item.number}</td>
                            <td className="border border-black p-2 font-bold text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(safeString(item.answerKey))} />
                            <td className="border border-black p-2 text-center text-sm text-slate-600 text-inherit">{safeString(item.type)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
  };

  return (
    <div className="flex h-full w-full">
        {/* Sidebar Controls */}
        <div className="w-80 border-r border-slate-200 bg-white flex flex-col h-full overflow-hidden no-print flex-shrink-0 z-20 shadow-lg">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Panel Kontrol</h3>
                <div className="flex gap-2">
                   <button onClick={() => downloadDocx(data!, FIXED_DOC_SETTINGS)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                      <FileDown size={16} /> DOCX
                   </button>
                   <button onClick={handleDownloadPDF} disabled={isPdfGenerating} className="flex-1 bg-slate-700 hover:bg-slate-800 text-white py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                      {isPdfGenerating ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />} PDF
                   </button>
                </div>
                {/* Print Button */}
                <button onClick={() => window.print()} className="w-full mt-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                    <Printer size={16} /> Print Preview
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                
                {/* Section: Identitas Sekolah */}
                <div>
                   <button onClick={() => toggleSection('SCHOOL')} className="flex items-center justify-between w-full text-left mb-2 group">
                      <span className="text-sm font-bold text-slate-700 flex items-center gap-2"><School size={16} className="text-blue-500"/> Identitas Sekolah</span>
                      {expandedSection === 'SCHOOL' ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
                   </button>
                   
                   {expandedSection === 'SCHOOL' && (
                       <div className="space-y-3 pl-2 border-l-2 border-slate-100 ml-2 animate-fade-in">
                           <div>
                               <label className="text-xs text-slate-500 font-medium block mb-1">Nama Sekolah</label>
                               <input type="text" name="schoolName" value={schoolData.schoolName} onChange={handleSchoolChange} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded bg-slate-50 focus:bg-white focus:border-blue-500 outline-none transition-colors" />
                           </div>
                           <div>
                               <label className="text-xs text-slate-500 font-medium block mb-1">Guru Penyusun</label>
                               <input type="text" name="authorName" value={schoolData.authorName} onChange={handleSchoolChange} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded bg-slate-50 focus:bg-white focus:border-blue-500 outline-none transition-colors" />
                           </div>
                           <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-slate-500 font-medium block mb-1">Kota</label>
                                    <input type="text" name="location" value={schoolData.location} onChange={handleSchoolChange} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded bg-slate-50 focus:bg-white focus:border-blue-500 outline-none transition-colors" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 font-medium block mb-1">Tanggal</label>
                                    <input type="date" name="date" value={getIsoDateFromDisplay(schoolData.date)} onChange={handleDateChange} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded bg-slate-50 focus:bg-white focus:border-blue-500 outline-none transition-colors" />
                                </div>
                           </div>
                       </div>
                   )}
                </div>

                {/* Section: Detail Pelajaran */}
                <div>
                   <button onClick={() => toggleSection('LESSON')} className="flex items-center justify-between w-full text-left mb-2 group">
                      <span className="text-sm font-bold text-slate-700 flex items-center gap-2"><BookOpen size={16} className="text-indigo-500"/> Detail Pelajaran</span>
                      {expandedSection === 'LESSON' ? <ChevronDown size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
                   </button>
                   
                   {expandedSection === 'LESSON' && (
                       <div className="space-y-3 pl-2 border-l-2 border-slate-100 ml-2 animate-fade-in">
                           <div>
                               <label className="text-xs text-slate-500 font-medium block mb-1">Mata Pelajaran</label>
                               <select name="subject" value={inputData.subject} onChange={handleEditorChange} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded bg-slate-50 focus:bg-white focus:border-blue-500 outline-none transition-colors">
                                   <option value="" disabled>Pilih Mapel...</option>
                                   {SUBJECT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                               </select>
                           </div>
                           <div>
                               <label className="text-xs text-slate-500 font-medium block mb-1">Kelas / Fase</label>
                               <select name="grade" value={inputData.grade} onChange={handleGradeChange} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded bg-slate-50 focus:bg-white focus:border-blue-500 outline-none transition-colors">
                                   <option value="" disabled>Pilih Kelas...</option>
                                   {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                               </select>
                           </div>
                           <div>
                               <label className="text-xs text-slate-500 font-medium block mb-1">Topik Materi</label>
                               <input type="text" name="topic" value={inputData.topic} onChange={handleEditorChange} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded bg-slate-50 focus:bg-white focus:border-blue-500 outline-none transition-colors" />
                           </div>
                           <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-slate-500 font-medium block mb-1">Alokasi Waktu</label>
                                    <input type="text" name="timeAllocation" value={inputData.timeAllocation} onChange={handleEditorChange} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded bg-slate-50 focus:bg-white focus:border-blue-500 outline-none transition-colors" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500 font-medium block mb-1">Pertemuan</label>
                                    <input type="text" name="meetingCount" value={inputData.meetingCount} onChange={handleEditorChange} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded bg-slate-50 focus:bg-white focus:border-blue-500 outline-none transition-colors" />
                                </div>
                           </div>
                           <div className="pt-2">
                               <button 
                                 onClick={() => {
                                    if (canGenerate) onGenerate();
                                    else Swal.fire('Data Tidak Lengkap', getValidationMessage(), 'warning');
                                 }}
                                 disabled={isLoading}
                                 className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
                               >
                                  {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
                                  {data ? 'Regenerate RPP' : 'Generate RPP'}
                               </button>
                           </div>
                       </div>
                   )}
                </div>

                {/* Quick Edit (Optimization) */}
                {isOptimizationMode && (
                    <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <h4 className="text-xs font-bold text-yellow-800 mb-2 flex items-center gap-1"><Sparkles size={12}/> AI Optimization Active</h4>
                        <div className="text-[10px] text-yellow-700 leading-relaxed mb-2">
                            RPP ini hasil optimasi dari teks mentah Anda. Anda bisa mengedit input di bawah ini dan klik "Update" untuk memperbaiki hasil.
                        </div>
                        <textarea 
                            className="w-full h-24 text-xs p-2 border border-yellow-300 rounded bg-white focus:outline-none focus:border-yellow-500 mb-2"
                            placeholder="Instruksi tambahan..."
                            value={rawInputText}
                            onChange={(e) => setRawInputText(e.target.value)}
                        />
                        <button 
                            onClick={() => onOptimize(rawInputText)}
                            disabled={!rawInputText || isLoading}
                            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-1.5 px-2 rounded text-xs font-bold"
                        >
                            Update Optimasi
                        </button>
                    </div>
                )}
            </div>
        </div>

        {/* Main Preview Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-100 relative">
             {/* Toolbar Tabs */}
             <div className="bg-white border-b border-slate-200 flex overflow-x-auto no-scrollbar shadow-sm z-10 no-print flex-shrink-0">
                  <TabButton id="RPP" label="1. Modul Ajar" hasData={!!data} />
                  <TabButton id="MATERI" label="2. Materi Ajar" hasData={!!data?.materials} />
                  <TabButton id="LKPD" label="3. LKPD" hasData={!!data?.lkpd} />
                  <TabButton id="ASESMEN" label="4. Asesmen" hasData={!!data?.assessment} />
                  <TabButton id="SOAL" label="5. Bank Soal" hasData={!!data?.questionBank} />
             </div>

             {/* Generation Toolbars per Tab */}
             {activeTab === 'MATERI' && !data?.materials && (
                 <GenerationToolbar 
                    title="Materi Ajar belum dibuat." 
                    actionLabel="Buat Materi Ajar (AI)" 
                    onAction={handleGenerateMaterialsClick} 
                    isLoading={isGeneratingMaterials}
                    icon={BookText}
                 />
             )}
             {activeTab === 'LKPD' && !data?.lkpd && (
                 <GenerationToolbar 
                    title="LKPD belum dibuat." 
                    actionLabel="Buat LKPD (AI)" 
                    onAction={handleGenerateLKPDClick} 
                    isLoading={isGeneratingLKPD}
                    icon={ClipboardCheck}
                 />
             )}
             {activeTab === 'ASESMEN' && !data?.assessment && (
                 <GenerationToolbar 
                    title="Instrumen Asesmen belum dibuat." 
                    actionLabel="Buat Asesmen (AI)" 
                    onAction={handleGenerateAssessmentClick} 
                    isLoading={isGeneratingAssessment}
                    icon={CheckSquare}
                 />
             )}
             {activeTab === 'SOAL' && !data?.questionBank && (
                 <QuestionToolbar />
             )}

             {/* Document Viewer */}
             <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center bg-[#525659]">
                 {/* Paper Page */}
                 <div id="konten-dokumen" className="bg-white shadow-2xl w-full max-w-[210mm] min-h-[297mm] p-[20mm] md:p-[25mm] mx-auto document-font paper-content" style={paperStyle}>
                     {isLoading ? (
                         <div className="flex flex-col items-center justify-center h-96 space-y-4">
                             <Loader2 size={48} className="animate-spin text-blue-600" />
                             <p className="text-slate-500 font-medium animate-pulse">Sedang menyusun dokumen cerdas...</p>
                         </div>
                     ) : !data ? (
                         <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4 border-2 border-dashed border-slate-200 rounded-xl m-8">
                             <Layers size={64} className="opacity-20" />
                             <p>Dokumen kosong. Silahkan generate RPP terlebih dahulu.</p>
                         </div>
                     ) : (
                         <>
                            {/* TAB CONTENT SWITCHER */}
                            {activeTab === 'RPP' && (
                                <div className="break-inside-avoid">
                                    <h1 className="text-center font-bold mb-2 uppercase" style={{ fontSize: '24pt' }}>MODUL AJAR</h1>
                                    <h2 className="text-center font-bold mb-8 uppercase" style={{ fontSize: '12pt' }}>TOPIK: {data.identitySection.topic}</h2>

                                    <OpenSection title="I. IDENTITAS UMUM">
                                        <table className="w-full mb-6 table-fixed">
                                            <tbody>
                                                <tr><td className="w-40 py-1 font-bold align-top">Nama Sekolah</td><td className="w-4 align-top">:</td><td className="align-top">{data.identitySection.schoolName}</td></tr>
                                                <tr><td className="py-1 font-bold align-top">Nama Penyusun</td><td className="align-top">:</td><td className="align-top">{data.approval.authorName}</td></tr>
                                                <tr><td className="py-1 font-bold align-top">Mata Pelajaran</td><td className="align-top">:</td><td className="align-top">{data.identitySection.subject}</td></tr>
                                                <tr><td className="py-1 font-bold align-top">Kelas / Fase</td><td className="align-top">:</td><td className="align-top">{data.identitySection.grade}</td></tr>
                                                <tr><td className="py-1 font-bold align-top">Semester</td><td className="align-top">:</td><td className="align-top">{data.identitySection.semester}</td></tr>
                                                <tr><td className="py-1 font-bold align-top">Alokasi Waktu</td><td className="align-top">:</td><td className="align-top">{data.identitySection.timeAllocation}</td></tr>
                                                <tr><td className="py-1 font-bold align-top">Jumlah Pertemuan</td><td className="align-top">:</td><td className="align-top">{data.identitySection.meetingCount}</td></tr>
                                            </tbody>
                                        </table>
                                        
                                        <div className="mb-4">
                                            <div className="font-bold mb-1 uppercase text-sm">Asesmen Awal (Diagnostik)</div>
                                            <div className="text-justify">{safeString(data.initialAssessment)}</div>
                                        </div>
                                        <div className="mb-4">
                                            <div className="font-bold mb-1 uppercase text-sm">Profil Pelajar Pancasila</div>
                                            <ul className="list-disc pl-5">
                                                {data.graduateProfile.map((item, i) => <li key={i}>{safeString(item)}</li>)}
                                            </ul>
                                        </div>
                                    </OpenSection>

                                    <OpenSection title="II. KOMPONEN INTI">
                                        <div className="mb-4">
                                            <div className="font-bold mb-1 uppercase text-sm">1. Tujuan Pembelajaran</div>
                                            <ul className="list-disc pl-5">
                                                {data.design.objectives.map((item, i) => <li key={i}>{safeString(item)}</li>)}
                                            </ul>
                                        </div>
                                        <div className="mb-4">
                                            <div className="font-bold mb-1 uppercase text-sm">2. Pendekatan Pedagogis</div>
                                            <div className="text-justify">{safeString(data.design.pedagogicalPractice)}</div>
                                        </div>
                                        <div className="mb-4">
                                            <div className="font-bold mb-1 uppercase text-sm">3. Lingkungan Pembelajaran</div>
                                            <div className="text-justify">{safeString(data.design.environment)}</div>
                                        </div>
                                        {data.design.digital && (
                                            <div className="mb-4">
                                                <div className="font-bold mb-1 uppercase text-sm">4. Pemanfaatan Digital</div>
                                                <div className="text-justify">{safeString(data.design.digital)}</div>
                                            </div>
                                        )}
                                    </OpenSection>

                                    <OpenSection title="III. LANGKAH PEMBELAJARAN">
                                        {data.learningExperience.map((step, idx) => (
                                            <div key={idx} className="mb-8 border-b border-black pb-4 last:border-0 break-inside-avoid">
                                                <h3 className="font-bold text-center mb-4 uppercase text-lg border-y border-black py-2 bg-gray-50">PERTEMUAN {step.meetingNo}</h3>
                                                
                                                <div className="mb-4">
                                                    <h4 className="font-bold border-b border-gray-300 mb-2">A. Pendahuluan <span className="font-normal italic text-sm ml-2">(Prinsip: {safeString(step.introPrinciple)})</span></h4>
                                                    <div className="pl-4 space-y-2">
                                                        {step.intro.map((act, i) => (
                                                             <div key={i} className="mb-2" dangerouslySetInnerHTML={renderMarkdown(act)} />
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="mb-4">
                                                    <h4 className="font-bold border-b border-gray-300 mb-2">B. Kegiatan Inti <span className="font-normal italic text-sm ml-2">(Prinsip: {safeString(step.corePrinciple)})</span></h4>
                                                    
                                                    <div className="pl-4 space-y-4">
                                                        <div>
                                                            <strong className="underline decoration-dotted text-blue-800">1. Memahami (Acquire)</strong>
                                                            <div className="mt-1 pl-2 border-l-2 border-blue-100 space-y-2">
                                                                {step.core.memahami.map((act, i) => (
                                                                     <div key={i} dangerouslySetInnerHTML={renderMarkdown(act)} />
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <strong className="underline decoration-dotted text-purple-800">2. Mengaplikasi (Connect)</strong>
                                                            <div className="mt-1 pl-2 border-l-2 border-purple-100 space-y-2">
                                                                {step.core.mengaplikasi.map((act, i) => (
                                                                     <div key={i} dangerouslySetInnerHTML={renderMarkdown(act)} />
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <strong className="underline decoration-dotted text-emerald-800">3. Merefleksi (Reflect)</strong>
                                                            <div className="mt-1 pl-2 border-l-2 border-emerald-100 space-y-2">
                                                                {step.core.merefleksi.map((act, i) => (
                                                                     <div key={i} dangerouslySetInnerHTML={renderMarkdown(act)} />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mb-4">
                                                    <h4 className="font-bold border-b border-gray-300 mb-2">C. Penutup <span className="font-normal italic text-sm ml-2">(Prinsip: {safeString(step.closingPrinciple)})</span></h4>
                                                    <div className="pl-4 space-y-2">
                                                        {step.closing.map((act, i) => (
                                                             <div key={i} className="mb-2" dangerouslySetInnerHTML={renderMarkdown(act)} />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </OpenSection>

                                    <div className="break-inside-avoid mt-12 pt-8">
                                        <table className="w-full">
                                            <tbody>
                                                <tr>
                                                    <td className="w-1/2 text-center align-top px-4">
                                                        <div className="mb-20">Mengetahui,<br/>Kepala Sekolah</div>
                                                        <div className="font-bold underline">{safeString(data.approval.principalName)}</div>
                                                        <div>NIP. {safeString(data.approval.principalNip)}</div>
                                                    </td>
                                                    <td className="w-1/2 text-center align-top px-4">
                                                        <div className="mb-20">{safeString(data.approval.location)}, {safeString(data.approval.date)}<br/>Guru Mata Pelajaran</div>
                                                        <div className="font-bold underline">{safeString(data.approval.authorName)}</div>
                                                        <div>NIP. {safeString(data.approval.authorNip)}</div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'MATERI' && (
                                <div className="break-inside-avoid">
                                    {isGeneratingMaterials ? (
                                        <div className="text-center py-20 text-slate-500">
                                            <Loader2 className="animate-spin mx-auto mb-4" />
                                            Sedang menyusun materi ajar...
                                        </div>
                                    ) : !data.materials ? (
                                        <div className="text-center py-20 text-slate-400">
                                            Materi belum dibuat. Klik tombol di atas.
                                        </div>
                                    ) : (
                                        <div className="animate-fade-in">
                                            <h1 className="text-center font-bold mb-4 uppercase" style={{ fontSize: '24pt' }}>{data.materials.judul}</h1>
                                            
                                            <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 italic mb-6 text-justify">
                                                "{safeString(data.materials.pemantik)}"
                                            </div>

                                            <OpenSection title="PETA KONSEP">
                                                <ul className="list-disc pl-5">
                                                    {data.materials.petaKonsep.map((p, i) => <li key={i}>{safeString(p)}</li>)}
                                                </ul>
                                            </OpenSection>

                                            <div className="mb-8">
                                                <h3 className="font-bold uppercase mb-4 text-lg border-b-2 border-black pb-1">MATERI INTI</h3>
                                                {data.materials.materiInti.map((sub, i) => (
                                                    <div key={i} className="mb-6 break-inside-avoid">
                                                        <h4 className="font-bold text-lg mb-2">{i+1}. {safeString(sub.subJudul)}</h4>
                                                        <div className="text-justify mb-3 markdown-content" dangerouslySetInnerHTML={renderMarkdown(sub.penjelasan)} />
                                                        
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            <div className="bg-green-50 p-3 rounded border border-green-200">
                                                                <strong className="text-green-800 block mb-1">✅ Contoh:</strong>
                                                                <div className="text-sm markdown-content" dangerouslySetInnerHTML={renderMarkdown(sub.contoh)} />
                                                            </div>
                                                            <div className="bg-red-50 p-3 rounded border border-red-200">
                                                                <strong className="text-red-800 block mb-1">❌ Bukan Contoh:</strong>
                                                                <div className="text-sm markdown-content" dangerouslySetInnerHTML={renderMarkdown(sub.bukanContoh)} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="mb-6 p-4 border border-black rounded-lg break-inside-avoid">
                                                <h4 className="font-bold uppercase mb-2">💡 Tahukah Kamu?</h4>
                                                <p className="text-justify">{safeString(data.materials.trivia)}</p>
                                            </div>

                                            <div className="break-inside-avoid">
                                                <h4 className="font-bold uppercase mb-2 border-b border-gray-300">GLOSARIUM</h4>
                                                <dl className="space-y-2">
                                                    {data.materials.glosarium.map((g, i) => (
                                                        <div key={i} className="flex gap-2">
                                                            <dt className="font-bold min-w-[120px]">{safeString(g.istilah)}:</dt>
                                                            <dd>{safeString(g.definisi)}</dd>
                                                        </div>
                                                    ))}
                                                </dl>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'LKPD' && <LkpdContent />}
                            {activeTab === 'ASESMEN' && <AssessmentContent />}
                            
                            {activeTab === 'SOAL' && <QuestionBankContent />}

                         </>
                     )}
                 </div>
             </div>
        </div>
    </div>
  );
};

export default ResultPreview;