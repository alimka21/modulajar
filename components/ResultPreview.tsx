import React, { useState, useRef, useEffect } from 'react';
import { GeneratedLessonPlan, LessonIdentity, SchoolIdentity, DocumentSettings, PaperSize, FontSize, QuestionBankConfig, QuestionType, QuestionLevel, LearningStep, MaterialsData } from '../types';
import { FileDown, FileText, CheckSquare, Layers, ChevronDown, ChevronRight, Sparkles, School, Loader2, ClipboardCheck, Settings2, BookOpen, Wand2, BookText, Printer } from 'lucide-react';
import { downloadDocx } from '../services/documentService';
import { INDONESIAN_MONTHS } from '../constants';

declare var marked: any;
declare var Swal: any;
declare var MathJax: any;
declare var html2pdf: any;

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
    const element = document.getElementById('konten-dokumen');
    if (!element) return;

    setIsPdfGenerating(true);

    const opt = {
      margin:       [15, 15, 15, 15], 
      filename:     `Modul_Ajar_${inputData.topic.replace(/\s+/g, '_')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { 
        scale: 2, 
        useCORS: true, 
        scrollY: 0,
        windowWidth: 800 // Fix layout shift
      },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        setIsPdfGenerating(false);
    }).catch((err: any) => {
        console.error(err);
        setIsPdfGenerating(false);
        Swal.fire('Gagal', 'Terjadi kesalahan saat membuat PDF', 'error');
    });
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
                                    <td colSpan={4} className="border border-black p-4 text-center italic text-inherit">
                                        Data kisi-kisi belum tersedia.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                     </table>
                 </div>
            </OpenSection>

            <div className="page-break h-4"></div>

            <OpenSection title="4. Tindak Lanjut & Intervensi Guru">
                 <table className="w-full border-collapse border border-black text-inherit">
                    <thead>
                        <tr className="bg-[#f0f0f0]">
                            <th className="border border-black p-2 text-left font-bold w-1/3 text-inherit">Kondisi Siswa</th>
                            <th className="border border-black p-2 text-left font-bold text-inherit">Strategi Intervensi</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="border border-black p-3 font-bold align-top text-inherit">Perlu Bimbingan</td>
                            <td className="border border-black p-3 align-top text-inherit">{safeString(intervention.needsGuidance)}</td>
                        </tr>
                        <tr>
                            <td className="border border-black p-3 font-bold align-top text-inherit">Cukup</td>
                            <td className="border border-black p-3 align-top text-inherit">{safeString(intervention.basic)}</td>
                        </tr>
                        <tr>
                            <td className="border border-black p-3 font-bold align-top text-inherit">Baik</td>
                            <td className="border border-black p-3 align-top text-inherit">{safeString(intervention.proficient)}</td>
                        </tr>
                        <tr>
                            <td className="border border-black p-3 font-bold align-top text-inherit">Sangat Baik</td>
                            <td className="border border-black p-3 align-top text-inherit">{safeString(intervention.advanced)}</td>
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
            <h3 className="text-center font-bold mb-8 uppercase" style={{ fontSize: '12pt' }}>TOPIK: {data.identitySection.topic}</h3>
            
            <div className="space-y-8">
                {data.questionBank.items.map((item, idx) => (
                    <div key={idx} className="break-inside-avoid-page pb-4">
                        <div className="flex gap-4">
                            <span className="font-bold text-inherit">{item.number}.</span>
                            <div className="flex-1 text-inherit">
                                {item.stimulus && (
                                    <div className="mb-2 italic text-gray-800 text-inherit">
                                        {safeString(item.stimulus)}
                                    </div>
                                )}
                                
                                {item.type !== 'Menjodohkan' && (
                                    <p className="mb-4 whitespace-pre-wrap text-inherit">{safeString(item.question)}</p>
                                )}
                                
                                {item.type === 'Menjodohkan' ? (
                                    <div className="mt-4">
                                        <table className="w-full border-collapse border border-black text-inherit">
                                            <thead>
                                                <tr className="bg-white">
                                                    <th className="p-2 font-bold text-left w-[40%] text-inherit">Daftar Pernyataan</th>
                                                    <th className="p-2 w-[10%]"></th>
                                                    <th className="p-2 w-[10%]"></th>
                                                    <th className="p-2 font-bold text-left w-[40%] text-inherit">Respon</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                    const leftLines = item.question.includes('\n') ? item.question.split('\n').filter(l => l.trim().length > 0) : [item.question];
                                                    const rightLines = item.options || [];
                                                    const maxRows = Math.max(leftLines.length, rightLines.length);
                                                    
                                                    return Array.from({ length: maxRows }).map((_, i) => (
                                                        <tr key={i}>
                                                            <td className="p-2 align-middle text-inherit">
                                                                {leftLines[i] || ""}
                                                            </td>
                                                            <td className="p-2 align-middle text-center">
                                                                {leftLines[i] && <div className="w-5 h-5 rounded-full border-2 border-black bg-white mx-auto print:bg-white print:border-black"></div>}
                                                            </td>
                                                            <td className="p-2 align-middle text-center">
                                                                {rightLines[i] && <div className="w-5 h-5 rounded-full border-2 border-black bg-white mx-auto print:bg-white print:border-black"></div>}
                                                            </td>
                                                            <td className="p-2 align-middle text-inherit">
                                                                {rightLines[i] ? rightLines[i].replace(/^[A-Za-z][.)]\s*/, '') : ""}
                                                            </td>
                                                        </tr>
                                                    ));
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : item.options && item.options.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-8 mt-2 text-inherit">
                                        {item.options.map((opt, i) => (
                                            <div key={i} className="flex gap-2 text-inherit">
                                                <span className="font-bold min-w-[20px] text-inherit">{String.fromCharCode(65 + i)}.</span>
                                                <span className="text-inherit">{safeString(opt).replace(/^[A-Za-z][.)]\s*/, '')}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-12 pt-8 border-t-2 border-black page-break">
                <h3 className="text-lg font-bold text-center mb-6 uppercase">KUNCI JAWABAN & PEDOMAN PENSKORAN</h3>
                <div className="max-w-2xl mx-auto">
                    <table className="w-full border-collapse border border-black text-inherit">
                        <thead>
                            <tr className="bg-[#f0f0f0]">
                                <th className="border border-black p-2 text-center w-16 font-bold text-inherit">No</th>
                                <th className="border border-black p-2 text-left font-bold text-inherit">Jawaban Benar</th>
                                <th className="border border-black p-2 text-right w-32 font-bold text-inherit">Tipe Soal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.questionBank.items.map((item, idx) => (
                                <tr key={idx}>
                                    <td className="border border-black p-2 align-top text-center font-bold text-inherit">{item.number}</td>
                                    <td className="border border-black p-2 align-top font-bold text-inherit">
                                        {safeString(item.answerKey)}
                                    </td>
                                    <td className="border border-black p-2 align-top text-right text-sm italic text-inherit">
                                        {safeString(item.type)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
          </div>
      );
  };

  const MaterialsContent = () => {
    if (isGeneratingMaterials) return <div className="text-center py-20">Loading Materi...</div>;
    if (!data?.materials) return <div className="text-center py-20 text-gray-400">Belum ada data Materi</div>;
    
    const m = data.materials as MaterialsData;
    return (
        <div className="break-inside-avoid text-inherit">
            <h2 className="text-center mb-6 uppercase" style={{ fontSize: '24pt', fontWeight: 'bold' }}>MATERI: {m.judul}</h2>
            
            <div className="mb-6 border border-black p-4 text-inherit">
               <h4 className="font-bold text-sm uppercase mb-1 text-inherit">Ilustrasi / Visual</h4>
               <p className="italic text-inherit">{m.deskripsiIlustrasi}</p>
            </div>

            <div className="space-y-6 text-inherit">
                <div>
                   <h4 className="font-bold uppercase mb-2 text-inherit">PEMANTIK BELAJAR</h4>
                   <p className="italic pl-4 border-l-2 border-black text-inherit">{m.pemantik}</p>
                </div>

                <div>
                   <h4 className="font-bold uppercase mb-2 text-inherit">PETA KONSEP</h4>
                   <ul className="list-disc pl-5 text-inherit">
                       {m.petaKonsep && m.petaKonsep.map((point, idx) => (
                           <li key={idx}>{safeString(point)}</li>
                       ))}
                   </ul>
                </div>

                {m.materiInti && m.materiInti.map((sub, i) => (
                    <div key={i}>
                        <h3 className="text-lg font-bold uppercase mb-2 border-b border-black inline-block">{i + 1}. {sub.subJudul}</h3>
                        <div className="text-justify mb-4 text-inherit" dangerouslySetInnerHTML={{ __html: safeString(sub.penjelasan || "").replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-inherit">
                            <div className="border border-black p-2">
                                <div className="font-bold uppercase text-xs mb-1 text-inherit">✅ Contoh Konkret</div>
                                <p className="text-sm text-inherit">{sub.contoh}</p>
                            </div>
                            <div className="border border-black p-2">
                                <div className="font-bold uppercase text-xs mb-1 text-inherit">❌ Bukan Contoh</div>
                                <p className="text-sm text-inherit">{sub.bukanContoh}</p>
                            </div>
                        </div>
                    </div>
                ))}
                
                <div className="mt-8 border border-black p-4 text-inherit">
                   <h4 className="font-bold uppercase mb-2 text-inherit">Tahukah Kamu?</h4>
                   <p className="text-inherit">{m.trivia}</p>
                </div>

                <div className="mt-8 text-inherit">
                    <h4 className="font-bold uppercase mb-2 border-b border-black text-inherit">Glosarium</h4>
                    <dl className="grid grid-cols-1 gap-2 text-inherit">
                        {m.glosarium.map((g, i) => (
                            <div key={i} className="grid grid-cols-[150px_1fr] text-inherit">
                                <dt className="font-bold text-inherit">{g.istilah}</dt>
                                <dd className="text-inherit">{g.definisi}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>
        </div>
    );
  };

  const ReflectionContent = () => {
    if (!data?.reflection) return null;
    return (
        <div className="break-inside-avoid text-inherit">
            <h2 className="text-center mb-6 uppercase" style={{ fontSize: '24pt', fontWeight: 'bold' }}>REFLEKSI PEMBELAJARAN</h2>
            <BoxSection title="Refleksi Guru">
                <ul className="list-disc pl-5 text-inherit">
                    {data.reflection.teacher.map((item, i) => <li key={i}>{safeString(item)}</li>)}
                </ul>
            </BoxSection>
            <BoxSection title="Refleksi Murid">
                <ul className="list-disc pl-5 text-inherit">
                    {data.reflection.student.map((item, i) => <li key={i}>{safeString(item)}</li>)}
                </ul>
            </BoxSection>
        </div>
    );
  };

  const RppContent = () => {
    if (!data) return null;
    return (
    <div className="text-inherit">
      <div className="mb-6 text-center">
        {/* Header 24pt Bold */}
        <h1 className="uppercase mb-1 text-inherit" style={{ fontSize: '24pt', fontWeight: 'bold' }}>MODUL AJAR</h1>
        {/* Topic 12pt Bold */}
        <h2 className="uppercase text-inherit" style={{ fontSize: '12pt', fontWeight: 'bold' }}>TOPIK: {data.identitySection.topic}</h2>
      </div>

      <h3 className="font-bold uppercase mb-2 border-b border-black text-inherit">I. IDENTITAS UMUM</h3>
      <table className="w-full mb-6 text-inherit">
          <tbody>
              {[
                ['Nama Sekolah', schoolData.schoolName],
                ['Nama Penyusun', schoolData.authorName],
                ['Mata Pelajaran', inputData.subject],
                ['Kelas / Fase', inputData.grade],
                ['Semester', inputData.semester],
                ['Alokasi Waktu', inputData.timeAllocation],
                ['Jumlah Pertemuan', inputData.meetingCount]
              ].map(([label, value], i) => (
                <tr key={i}>
                  <td className="w-1/3 font-bold py-1 align-top text-inherit">{label}</td>
                  <td className="w-4 py-1 align-top text-inherit">:</td>
                  <td className="py-1 align-top text-inherit">{value}</td>
                </tr>
              ))}
          </tbody>
      </table>

      <BoxSection title="A. Asesmen Awal (Diagnostik)">
          <p className="text-inherit">{data.initialAssessment || "Belum ada data asesmen awal."}</p>
      </BoxSection>

      <BoxSection title="B. Dimensi Profil Lulusan">
          <ul className="list-disc pl-5 text-inherit">
              {data.graduateProfile.length > 0 ? data.graduateProfile.map((item, i) => <li key={i}>{safeString(item)}</li>) : <li>Tidak ada dimensi dipilih.</li>}
          </ul>
      </BoxSection>

      <div className="my-6 text-center text-inherit">
        <h3 className="font-bold uppercase border-b border-black inline-block text-inherit">II. KOMPONEN INTI</h3>
      </div>

      <BoxSection title="1. Tujuan Pembelajaran">
          <ul className="list-disc pl-5 text-inherit">{data.design.objectives.map((item, i) => <li key={i}>{safeString(item)}</li>)}</ul>
      </BoxSection>

      <BoxSection title="2. Praktik Pedagogis (Model)">
          <p className="text-inherit">{data.design.pedagogicalPractice}</p>
      </BoxSection>
      
      {data.design.partnership && (
          <BoxSection title="3. Kemitraan Pembelajaran">
              <p className="text-inherit">{data.design.partnership}</p>
          </BoxSection>
      )}
      
      <BoxSection title={data.design.partnership ? "4. Lingkungan Pembelajaran" : "3. Lingkungan Pembelajaran"}>
          <p className="text-inherit">{data.design.environment}</p>
      </BoxSection>
      
      {data.design.digital && (
          <BoxSection title={data.design.partnership ? "5. Pemanfaatan Digital" : "4. Pemanfaatan Digital"}>
              <p className="text-inherit">{data.design.digital}</p>
          </BoxSection>
      )}

      <div className="page-break h-4"></div>
      
      <div className="my-6 text-center text-inherit">
        <h3 className="font-bold uppercase border-b border-black inline-block text-inherit">III. LANGKAH PEMBELAJARAN</h3>
      </div>

      {data.learningExperience.map((step: LearningStep, idx) => (
          <div key={idx} className="mb-8 text-inherit">
              <h4 className="font-bold text-lg mb-4 uppercase text-center text-inherit">Pertemuan {step.meetingNo}</h4>
              
              <BoxSection title="A. Pendahuluan">
                  <p className="mb-2 text-sm italic font-bold text-inherit">Prinsip: {step.introPrinciple}</p>
                  <ol className="list-decimal list-outside ml-6 space-y-2 font-normal text-inherit">
                      {step.intro.map((item, i) => {
                          const text = safeString(item);
                          if (text.match(/>\s*💡?\s*Tips?:?/i) || text.trim().startsWith(">")) {
                              return (
                                  <li key={i} className="list-none my-6 text-center font-bold italic text-slate-700 bg-slate-50 border-y border-slate-100 py-2 -ml-6 text-inherit">
                                      {text.replace(/^>\s*💡?\s*Tips?:?\s*/i, '💡 Tips: ')}
                                  </li>
                              );
                          }
                          return (
                              <li key={i} className="pl-1 text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(text)} />
                          );
                      })}
                  </ol>
              </BoxSection>

              <BoxSection title="B. Kegiatan Inti">
                  <p className="mb-2 text-sm italic font-bold text-inherit">Prinsip: {step.corePrinciple}</p>
                  <div className="mb-4 text-inherit">
                      <span className="font-bold block mb-1 text-inherit">1. Memahami</span>
                      <ol className="list-decimal list-outside ml-6 space-y-2 font-normal text-inherit">
                         {step.core.memahami.map((item, i) => {
                             const text = safeString(item);
                             if (text.match(/>\s*💡?\s*Tips?:?/i) || text.trim().startsWith(">")) {
                                 return <li key={i} className="list-none my-6 text-center font-bold italic text-slate-700 bg-slate-50 border-y border-slate-100 py-2 -ml-6 text-inherit">{text.replace(/^>\s*💡?\s*Tips?:?\s*/i, '💡 Tips: ')}</li>;
                             }
                             return <li key={i} className="pl-1 text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(text)} />;
                         })}
                      </ol>
                  </div>
                  <div className="mb-4 text-inherit">
                      <span className="font-bold block mb-1 text-inherit">2. Mengaplikasi</span>
                      <ol className="list-decimal list-outside ml-6 space-y-2 font-normal text-inherit">
                          {step.core.mengaplikasi.map((item, i) => {
                             const text = safeString(item);
                             if (text.match(/>\s*💡?\s*Tips?:?/i) || text.trim().startsWith(">")) {
                                 return <li key={i} className="list-none my-6 text-center font-bold italic text-slate-700 bg-slate-50 border-y border-slate-100 py-2 -ml-6 text-inherit">{text.replace(/^>\s*💡?\s*Tips?:?\s*/i, '💡 Tips: ')}</li>;
                             }
                             return <li key={i} className="pl-1 text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(text)} />;
                          })}
                      </ol>
                  </div>
                  <div className="text-inherit">
                      <span className="font-bold block mb-1 text-inherit">3. Merefleksi</span>
                      <ol className="list-decimal list-outside ml-6 space-y-2 font-normal text-inherit">
                          {step.core.merefleksi.map((item, i) => {
                             const text = safeString(item);
                             if (text.match(/>\s*💡?\s*Tips?:?/i) || text.trim().startsWith(">")) {
                                 return <li key={i} className="list-none my-6 text-center font-bold italic text-slate-700 bg-slate-50 border-y border-slate-100 py-2 -ml-6 text-inherit">{text.replace(/^>\s*💡?\s*Tips?:?\s*/i, '💡 Tips: ')}</li>;
                             }
                             return <li key={i} className="pl-1 text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(text)} />;
                          })}
                      </ol>
                  </div>
              </BoxSection>

              <BoxSection title="C. Penutup">
                  <p className="mb-2 text-sm italic font-bold text-inherit">Prinsip: {step.closingPrinciple}</p>
                  <ol className="list-decimal list-outside ml-6 space-y-2 font-normal text-inherit">
                      {step.closing.map((item, i) => {
                          const text = safeString(item);
                          if (text.match(/>\s*💡?\s*Tips?:?/i) || text.trim().startsWith(">")) {
                              return <li key={i} className="list-none my-6 text-center font-bold italic text-slate-700 bg-slate-50 border-y border-slate-100 py-2 -ml-6 text-inherit">{text.replace(/^>\s*💡?\s*Tips?:?\s*/i, '💡 Tips: ')}</li>;
                          }
                          return <li key={i} className="pl-1 text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(text)} />;
                      })}
                  </ol>
              </BoxSection>
              {idx < data.learningExperience.length - 1 && <div className="page-break h-4"></div>}
          </div>
      ))}

      <div className="mt-12 px-8 text-inherit">
          <div className="flex justify-between text-center">
              <div className="w-1/3">
                  <p>Mengetahui,</p>
                  <p>Kepala Sekolah</p>
                  <br /><br /><br />
                  <p className="font-bold underline text-inherit">{schoolData.principalName}</p>
                  <p>NIP. {schoolData.principalNip}</p>
              </div>
              <div className="w-1/3">
                  <p>{schoolData.location}, {schoolData.date}</p>
                  <p>Guru Mata Pelajaran</p>
                  <br /><br /><br />
                  <p className="font-bold underline text-inherit">{schoolData.authorName}</p>
                  <p>NIP. {schoolData.authorNip}</p>
              </div>
          </div>
      </div>
    </div>
  )};

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none bg-white border-b border-slate-200 z-20 no-print">
        <div className="flex flex-col md:flex-row items-center justify-between px-4">
            <div className="flex w-full md:w-auto overflow-x-auto no-scrollbar">
                 <TabButton id="RPP" label="1. RPP" hasData={!!data} />
                 <TabButton id="MATERI" label="2. Materi" hasData={!!data?.materials} />
                 <TabButton id="LKPD" label="3. LKPD" hasData={!!data?.lkpd} />
                 <TabButton id="ASESMEN" label="4. Asesmen" hasData={!!data?.assessment} />
                 <TabButton id="SOAL" label="5. Bank Soal" hasData={!!data?.questionBank} />
                 <TabButton id="REFLEKSI" label="6. Refleksi" hasData={!!data?.reflection} />
                 <TabButton id="SEMUA" label="Semua" hasData={true} />
            </div>
            <div className="flex items-center gap-2 py-2 md:py-0 border-t md:border-t-0 border-slate-100 w-full md:w-auto justify-end">
                <button onClick={() => data && downloadDocx(data, FIXED_DOC_SETTINGS)} disabled={!data} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md text-xs font-medium transition disabled:opacity-50" title="Download Word"><FileDown size={14} /><span className="hidden sm:inline">Word</span></button>
                <button 
                    onClick={handleDownloadPDF} 
                    disabled={!data || isPdfGenerating} 
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-md text-xs font-medium transition disabled:opacity-50" 
                    title="Download PDF"
                >
                    {isPdfGenerating ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                    <span className="hidden sm:inline">{isPdfGenerating ? 'Generating...' : 'Download PDF'}</span>
                </button>
            </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[30%] min-w-[320px] flex-none bg-white border-r border-slate-200 overflow-y-auto hidden md:block z-0 no-print">
             <div className="p-4 space-y-4">
                <div className="border rounded-lg border-slate-200 overflow-hidden">
                   <button onClick={() => toggleSection('SCHOOL')} className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition text-left"><div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><School size={16} /><span>Identitas Sekolah</span></div>{expandedSection === 'SCHOOL' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                   {expandedSection === 'SCHOOL' && (
                      <div className="p-3 space-y-3 bg-white animate-fade-in">
                          <div><label className="text-xs font-medium text-slate-500">Nama Sekolah</label><input name="schoolName" value={schoolData.schoolName} onChange={handleSchoolChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" /></div>
                          <div><label className="text-xs font-medium text-slate-500">Nama Kepala Sekolah</label><input name="principalName" value={schoolData.principalName} onChange={handleSchoolChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" /></div>
                          <div><label className="text-xs font-medium text-slate-500">NIP Kepala Sekolah</label><input name="principalNip" value={schoolData.principalNip} onChange={handleSchoolChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" /></div>
                          <div><label className="text-xs font-medium text-slate-500">Nama Guru</label><input name="authorName" value={schoolData.authorName} onChange={handleSchoolChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" /></div>
                          <div><label className="text-xs font-medium text-slate-500">NIP Guru</label><input name="authorNip" value={schoolData.authorNip} onChange={handleSchoolChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" /></div>
                          <div><label className="text-xs font-medium text-slate-500">Lokasi & Tanggal</label><div className="flex gap-2"><input name="location" value={schoolData.location} onChange={handleSchoolChange} className="w-1/2 mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" placeholder="Kota" /><input type="date" value={getIsoDateFromDisplay(schoolData.date)} onChange={handleDateChange} className="w-1/2 mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" placeholder="Tanggal" /></div></div>
                      </div>
                   )}
                </div>
                <div className="border rounded-lg border-slate-200 overflow-hidden">
                   <button onClick={() => toggleSection('LESSON')} className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition text-left"><div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><BookOpen size={16} /><span>Detail Pelajaran</span></div>{expandedSection === 'LESSON' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                   {expandedSection === 'LESSON' && (
                      <div className="p-3 space-y-3 bg-white animate-fade-in">
                          <div><label className="text-xs font-medium text-slate-500">Mata Pelajaran</label><select name="subject" value={inputData.subject} onChange={handleEditorChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white"><option value="">Pilih Mapel...</option>{SUBJECT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                          <div><label className="text-xs font-medium text-slate-500">Kelas / Fase</label><select name="grade" value={inputData.grade} onChange={handleGradeChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white"><option value="">Pilih Kelas...</option>{GRADE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>
                          <div><label className="text-xs font-medium text-slate-500">Semester</label><select name="semester" value={inputData.semester} onChange={handleEditorChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white"><option value="Ganjil">Ganjil</option><option value="Genap">Genap</option></select></div>
                          <div><label className="text-xs font-medium text-slate-500">Alokasi Waktu</label><input name="timeAllocation" value={inputData.timeAllocation} onChange={handleEditorChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" /></div>
                          <div><label className="text-xs font-medium text-slate-500">Jumlah Pertemuan</label><select name="meetingCount" value={inputData.meetingCount} onChange={handleEditorChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white"><option value="1 Pertemuan">1 Pertemuan</option><option value="2 Pertemuan">2 Pertemuan</option></select></div>
                          <div><label className="text-xs font-medium text-slate-500">Topik / Materi</label><input name="topic" value={inputData.topic} onChange={handleEditorChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" placeholder="Topik Utama" /></div>
                          <div><label className="text-xs font-medium text-slate-500">Tujuan Pembelajaran</label><textarea name="objectives" value={inputData.objectives} onChange={handleEditorChange} rows={4} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm resize-none bg-white" placeholder="Contoh: Peserta didik mampu menganalisis struktur teks..." /></div>
                          <div className="pt-2"><button onClick={onGenerate} disabled={isLoading || !canGenerate || (isOptimizationMode && !!data)} className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition ${isLoading || !canGenerate || (isOptimizationMode && !!data) ? 'bg-slate-300 text-white cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>{isLoading ? <Loader2 className="animate-spin" size={16} /> : (isOptimizationMode && !!data ? <CheckSquare size={16} /> : <Sparkles size={16} />)}{isLoading ? "Menyusun..." : (isOptimizationMode && !!data ? "Modul Siap (Optimasi)" : "Update RPP")}</button>{!canGenerate && <p className="text-[10px] text-red-500 text-center mt-1">{getValidationMessage()}</p>}</div>
                      </div>
                   )}
                </div>
             </div>
        </div>

        <div className="flex-1 bg-slate-100 overflow-hidden relative flex flex-col items-center">
            {(activeTab === 'MATERI' || activeTab === 'SEMUA') && !data?.materials && data && !isGeneratingMaterials && (<GenerationToolbar title="Materi Ajar Belum Tersedia" onAction={handleGenerateMaterialsClick} isLoading={isGeneratingMaterials} actionLabel="Buat Materi" icon={BookText} />)}
            {(activeTab === 'LKPD' || activeTab === 'SEMUA') && !data?.lkpd && data && !isGeneratingLKPD && (<GenerationToolbar title="LKPD Belum Tersedia" onAction={handleGenerateLKPDClick} isLoading={isGeneratingLKPD} actionLabel="Buat LKPD" icon={ClipboardCheck} />)}
            {(activeTab === 'ASESMEN' || activeTab === 'SEMUA') && !data?.assessment && data && !isGeneratingAssessment && (<GenerationToolbar title="Asesmen Belum Tersedia" onAction={handleGenerateAssessmentClick} isLoading={isGeneratingAssessment} actionLabel="Buat Asesmen" icon={CheckSquare} />)}
            {(activeTab === 'SOAL' || activeTab === 'SEMUA') && !data?.questionBank && data && !isGeneratingQuestionBank && (<QuestionToolbar />)}

            <div ref={scrollContainerRef} className="flex-1 w-full overflow-y-auto p-4 md:p-8">
                {/* PAPER VIEW CONTAINER */}
                <div 
                    id="konten-dokumen"
                    className="bg-white shadow-lg mx-auto min-h-[1000px] transition-all paper-content" 
                    style={{ 
                        width: '210mm', 
                        padding: '25.4mm', 
                        ...paperStyle 
                    }}
                >
                    {!data ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 font-sans no-print">
                             <div className="bg-slate-50 p-6 rounded-full mb-6 mx-auto w-fit"><Sparkles size={48} className="text-blue-200" /></div>
                             <h3 className="text-xl font-bold text-slate-700 mb-2">Modul Ajar Belum Dibuat</h3>
                             <p className="text-sm text-slate-500 max-w-md mx-auto mb-8">Silahkan isi detail di panel kiri dan klik "Update RPP", atau tempel teks RPP mentah di bawah ini untuk dioptimalkan.</p>
                             <div className="w-full max-w-2xl mx-auto bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner">
                                <textarea value={rawInputText} onChange={(e) => setRawInputText(e.target.value)} placeholder="Tempel teks RPP atau Modul Ajar mentah di sini untuk dirapikan secara otomatis..." className="w-full h-32 bg-white border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none mb-3 text-slate-700 font-sans" />
                                <button onClick={() => onOptimize(rawInputText)} disabled={!rawInputText || isLoading} className={`w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all ${!rawInputText || isLoading ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md'}`}>{isLoading ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}{isLoading ? 'Sedang Mengoptimalkan...' : 'Optimalkan Struktur RPP'}</button>
                             </div>
                        </div>
                    ) : (
                        <div className="animate-fade-in">
                            {/* Insert Style Override for Lists */}
                            <style>{`
                                /* Force Font Uniformity to Cambria 12pt */
                                .paper-content, 
                                .paper-content p, 
                                .paper-content li, 
                                .paper-content td, 
                                .paper-content th, 
                                .paper-content span, 
                                .paper-content div {
                                    font-size: 12pt !important;
                                    line-height: 1.5 !important;
                                    font-family: 'Cambria', 'Times New Roman', serif !important;
                                    color: #000000 !important;
                                }
                                
                                /* Header exceptions - 24pt Bold for Titles, 12pt for Topics */
                                .paper-content h1 { font-size: 24pt !important; line-height: 1.2 !important; font-weight: bold !important; }
                                .paper-content h2 { font-size: 12pt !important; line-height: 1.2 !important; font-weight: bold !important; } 
                                .paper-content h3 { font-size: 12pt !important; line-height: 1.2 !important; font-weight: bold !important; }
                                .paper-content h4 { font-size: 12pt !important; text-transform: uppercase; }

                                .lkpd-reset h1, .lkpd-reset h2, .lkpd-reset h3, .lkpd-reset h4, .lkpd-reset h5, .lkpd-reset h6 {
                                    font-size: inherit !important;
                                    font-weight: bold;
                                    margin-bottom: 0.5em;
                                    margin-top: 1em;
                                }
                                
                                /* Update Table Styles for Markdown Content */
                                .markdown-content table {
                                    width: 100%;
                                    border-collapse: collapse;
                                    margin: 1em 0;
                                }
                                .markdown-content th, .markdown-content td {
                                    border: 1px solid #000;
                                    padding: 8px;
                                    text-align: left;
                                }
                                .markdown-content th {
                                    background-color: #f0f0f0;
                                }
                            `}</style>

                            {(activeTab === 'RPP' || activeTab === 'SEMUA') && <RppContent />}
                            
                            {(activeTab === 'MATERI' || activeTab === 'SEMUA') && (
                                <>
                                    {activeTab === 'SEMUA' && data.materials && <div className="h-8 border-t border-dashed border-slate-300 my-8 print:break-before-page page-break"></div>}
                                    <MaterialsContent />
                                </>
                            )}
                            
                            {(activeTab === 'LKPD' || activeTab === 'SEMUA') && (
                                <>
                                    {activeTab === 'SEMUA' && data.lkpd && <div className="h-8 border-t border-dashed border-slate-300 my-8 print:break-before-page page-break"></div>}
                                    <LkpdContent />
                                </>
                            )}
                            
                            {(activeTab === 'ASESMEN' || activeTab === 'SEMUA') && (
                                <>
                                    {activeTab === 'SEMUA' && data.assessment && <div className="h-8 border-t border-dashed border-slate-300 my-8 print:break-before-page page-break"></div>}
                                    <AssessmentContent />
                                </>
                            )}

                             {(activeTab === 'SOAL' || activeTab === 'SEMUA') && (
                                <>
                                    {activeTab === 'SEMUA' && data.questionBank && <div className="h-8 border-t border-dashed border-slate-300 my-8 print:break-before-page page-break"></div>}
                                    <QuestionBankContent />
                                </>
                            )}
                            
                            {(activeTab === 'REFLEKSI' || activeTab === 'SEMUA') && (
                                <>
                                    {activeTab === 'SEMUA' && data.reflection && <div className="h-8 border-t border-dashed border-slate-300 my-8 print:break-before-page page-break"></div>}
                                    <ReflectionContent />
                                </>
                            )}
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