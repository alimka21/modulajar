
import React, { useState, useRef, useEffect } from 'react';
import { GeneratedLessonPlan, LessonIdentity, SchoolIdentity, DocumentSettings, PaperSize, FontSize, QuestionBankConfig, QuestionType, QuestionLevel, LearningStep, MaterialsData, QuestionItem, DeepLearningAssessment } from '../types';
import { FileDown, FileText, CheckSquare, Layers, ChevronDown, ChevronRight, Sparkles, School, Loader2, ClipboardCheck, Settings2, BookOpen, Wand2, BookText, Printer, BookKey, X, SlidersHorizontal } from 'lucide-react';
import { downloadDocx } from '../services/documentService';
import { INDONESIAN_MONTHS } from '../constants';

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

// --- CLEANER UTILITY ---
const cleanupUnnecessaryLatex = (text: string): string => {
    // Replace $number$ with number (e.g. $5$ -> 5, $1$ -> 1)
    let cleaned = text.replace(/\$\s*(\d+)\s*\$/g, '$1');
    // Replace $number.number$ with number.number
    cleaned = cleaned.replace(/\$\s*(\d+[\.,]\d+)\s*\$/g, '$1');
    return cleaned;
};

const protectLatex = (text: string) => {
    let placeholders: string[] = [];
    let protectedText = text.replace(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g, (match) => {
        placeholders.push(match);
        return `LATEXPLACEHOLDER${placeholders.length - 1}`;
    });
    return { protectedText, placeholders };
};

const restoreLatex = (html: string, placeholders: string[]) => {
    return html.replace(/LATEXPLACEHOLDER(\d+)/g, (_, index) => placeholders[parseInt(index)]);
};

const renderMarkdown = (text: string) => {
    let stringText = safeString(text);
    stringText = cleanupUnnecessaryLatex(stringText);

    let { protectedText, placeholders } = protectLatex(stringText);
    let formatted = protectedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    if (typeof marked !== 'undefined') {
        let html = marked.parse(formatted);
        return { __html: restoreLatex(html, placeholders) };
    }
    
    return { __html: restoreLatex(formatted, placeholders) };
};

const renderInlineMarkdown = (text: string) => {
    let stringText = safeString(text);
    stringText = stringText.replace(/^\d+\.\s*/, ''); 
    stringText = cleanupUnnecessaryLatex(stringText);

    let { protectedText, placeholders } = protectLatex(stringText);

    if (typeof marked !== 'undefined') {
        let html = "";
        if (typeof marked.parseInline === 'function') {
             html = marked.parseInline(protectedText);
        } else {
             html = marked.parse(protectedText).replace(/<\/?p[^>]*>/g, ""); 
        }
        return { __html: restoreLatex(html, placeholders) };
    }
    
    let formatted = protectedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return { __html: restoreLatex(formatted, placeholders) };
};

// MOVED OUTSIDE: OpenSection Component
interface OpenSectionProps {
  title: string;
  children?: React.ReactNode;
  className?: string;
  contentAlign?: string;
}

const OpenSection: React.FC<OpenSectionProps> = ({ title, children, className = "", contentAlign = "text-left" }) => (
  <div className={`mb-6 break-inside-avoid text-black ${className}`}>
      <h3 className="text-inherit font-sans font-bold text-[14pt] uppercase mb-2 mt-4">
          {title}
      </h3>
      <div className={`${contentAlign} text-black text-inherit font-sans`}>
          {children}
      </div>
  </div>
);

// MOVED OUTSIDE: RubricTable Component
const RubricTable = ({ items }: { items: any[] }) => (
  <div className="mb-8 break-inside-avoid">
      <table className="w-full border-collapse border border-black table-fixed text-black text-inherit font-sans">
          <thead>
              <tr className="bg-[#87CEFA]"> 
                  <th className="border border-black p-2 text-left w-[20%] align-middle font-bold text-center text-inherit">Kriteria</th>
                  <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-center text-inherit">Perlu Bimbingan</th>
                  <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-center text-inherit">Cukup</th>
                  <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-center text-inherit">Baik</th>
                  <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-center text-inherit">Sangat Baik</th>
              </tr>
          </thead>
          <tbody>
              {items.map((item, idx) => (
                  <tr key={idx}>
                      <td className="border border-black p-2 font-bold align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.criteria)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.needsGuidance)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.basic)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.proficient)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.advanced)} />
                  </tr>
              ))}
          </tbody>
      </table>
  </div>
);

const ResultPreview: React.FC<ResultPreviewProps> = ({ 
    data, inputData, onInputChange, schoolData, onSchoolChange, onGenerate, isLoading,
    onGenerateMaterials, isGeneratingMaterials,
    onGenerateLKPD, isGeneratingLKPD, onGenerateAssessment, isGeneratingAssessment,
    onGenerateQuestionBank, isGeneratingQuestionBank
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('RPP_PLUS');
  const [expandedSection, setExpandedSection] = useState<SectionType>('LESSON');
  
  // Question Modal State
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [questionConfig, setQuestionConfig] = useState<QuestionBankConfig>({
      count: 10,
      level: 'CAMPURAN',
      types: ['Pilihan Ganda', 'Uraian']
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (data && typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
      let container = document.getElementById('konten-dokumen');
      if (container) {
        setTimeout(() => {
            MathJax.typesetPromise([container])
            .catch((err: any) => {
                console.warn('MathJax typeset failed, retrying...', err);
                setTimeout(() => MathJax.typesetPromise([container]).catch((e:any) => console.error(e)), 500);
            });
        }, 300);
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
    window.print();
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

  const canGenerate = !!(inputData.topic && inputData.subject && schoolData.schoolName && inputData.objectives);
  const getValidationMessage = () => {
      if (!schoolData.schoolName) return "Lengkapi Identitas Sekolah";
      if (!inputData.subject) return "Pilih Mata Pelajaran";
      if (!inputData.topic) return "Isi Topik Pembelajaran";
      if (!inputData.objectives) return "Isi Tujuan Pembelajaran";
      return "";
  };

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

  const RppContent = () => {
    if (!data) return null;
    const { identitySection, initialAssessment, graduateProfile, design, learningExperience } = data;

    return (
        <div className="break-inside-avoid text-inherit font-sans">
            <h1 className="text-inherit font-sans font-bold text-[24pt] text-center mb-6">MODUL AJAR</h1>
            <h2 className="text-inherit font-sans text-[14pt] text-center mb-8 uppercase">TOPIK: {identitySection.topic}</h2>

            <OpenSection title="I. IDENTITAS UMUM">
                <table className="w-full border-collapse border border-white mb-6 text-inherit identity-table">
                    <tbody>
                        <tr><td className="border border-white p-1 font-bold w-[30%] text-inherit">Nama Sekolah</td><td className="border border-white p-1 w-[2%] text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.schoolName}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Nama Penyusun</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{data.approval.authorName}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Mata Pelajaran</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.subject}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Kelas / Fase</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.grade}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Semester</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.semester}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Alokasi Waktu</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.timeAllocation}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Jumlah Pertemuan</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.meetingCount}</td></tr>
                    </tbody>
                </table>

                <h4 className="font-bold mb-2 text-inherit font-sans text-[13pt]">Asesmen Awal (Diagnostik)</h4>
                <div className="mb-4 text-inherit" dangerouslySetInnerHTML={renderMarkdown(initialAssessment || "Belum ada data.")} />

                <h4 className="font-bold mb-2 text-inherit font-sans text-[13pt]">Dimensi Profil Lulusan</h4>
                <ul className="list-disc pl-6 mb-4 text-inherit">
                    {(graduateProfile || []).map((g, i) => <li key={i} className="text-inherit">{g}</li>)}
                </ul>
            </OpenSection>

            <OpenSection title="II. KOMPONEN INTI">
                <h4 className="font-bold mb-2 text-inherit font-sans text-[13pt]">1. Tujuan Pembelajaran</h4>
                <ul className="list-disc pl-6 mb-4 text-inherit">
                    {(design.objectives || []).map((o, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(o)} />)}
                </ul>

                <h4 className="font-bold mb-2 text-inherit font-sans text-[13pt]">2. Praktik Pedagogis</h4>
                <div className="mb-4 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.pedagogicalPractice)} />

                {design.partnership && (
                    <>
                        <h4 className="font-bold mb-2 text-inherit font-sans text-[13pt]">3. Kemitraan</h4>
                        <div className="mb-4 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.partnership)} />
                    </>
                )}

                <h4 className="font-bold mb-2 text-inherit font-sans text-[13pt]">{design.partnership ? '4.' : '3.'} Lingkungan Belajar</h4>
                <div className="mb-4 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.environment)} />

                {design.digital && (
                    <>
                        <h4 className="font-bold mb-2 text-inherit font-sans text-[13pt]">{design.partnership ? '5.' : '4.'} Pemanfaatan Digital</h4>
                        <div className="mb-4 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.digital)} />
                    </>
                )}
            </OpenSection>

            <div className="page-break h-2"></div>

            <OpenSection title="III. LANGKAH PEMBELAJARAN">
                {learningExperience.map((step, idx) => (
                    <div key={idx} className="mb-8 break-inside-avoid text-inherit">
                        <div className="bg-[#87CEFA] p-2 text-center font-bold mb-4 text-inherit rounded-sm font-sans">
                            PERTEMUAN {step.meetingNo}
                        </div>

                        <div className="mb-4">
                            <h4 className="font-bold text-inherit font-sans text-[13pt]">A. Pendahuluan</h4>
                            <p className="italic text-sm text-slate-600 mb-2 text-inherit">Prinsip: {step.introPrinciple}</p>
                            <ul className="list-disc pl-6 text-inherit">
                                {step.intro.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                            </ul>
                        </div>

                        <div className="mb-4">
                            <h4 className="font-bold text-inherit font-sans text-[13pt]">B. Kegiatan Inti</h4>
                            <p className="italic text-sm text-slate-600 mb-2 text-inherit">Prinsip: {step.corePrinciple}</p>
                            
                            <p className="font-bold mt-2 mb-1 text-inherit">1. Memahami</p>
                            <ul className="list-disc pl-6 mb-2 text-inherit">
                                {step.core.memahami.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                            </ul>
                            
                            <p className="font-bold mt-2 mb-1 text-inherit">2. Mengaplikasi</p>
                            <ul className="list-disc pl-6 mb-2 text-inherit">
                                {step.core.mengaplikasi.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                            </ul>

                            <p className="font-bold mt-2 mb-1 text-inherit">3. Merefleksi</p>
                            <ul className="list-disc pl-6 mb-2 text-inherit">
                                {step.core.merefleksi.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                            </ul>
                        </div>

                        <div className="mb-4">
                            <h4 className="font-bold text-inherit font-sans text-[13pt]">C. Penutup</h4>
                            <p className="italic text-sm text-slate-600 mb-2 text-inherit">Prinsip: {step.closingPrinciple}</p>
                            <ul className="list-disc pl-6 text-inherit">
                                {step.closing.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                            </ul>
                        </div>
                    </div>
                ))}
            </OpenSection>
        </div>
    );
  }

  const ApprovalSignature = () => {
    if (!data) return null;
    const { approval } = data;
    return (
        <div className="break-inside-avoid text-inherit font-sans mt-8">
            <table className="w-full border-none text-inherit">
                <tbody>
                    <tr>
                        <td className="w-1/2 text-center align-top border-none p-4 text-inherit">
                            <p className="mb-0 text-inherit">Mengetahui,</p>
                            <p className="mb-0 text-inherit">Kepala Sekolah</p>
                            <div className="h-24"></div> 
                            <p className="font-bold underline text-inherit">{approval.principalName}</p>
                            <p className="text-inherit">NIP. {approval.principalNip}</p>
                        </td>
                        <td className="w-1/2 text-center align-top border-none p-4 text-inherit">
                            <p className="mb-0 text-inherit">{approval.location}, {approval.date}</p>
                            <p className="mb-0 text-inherit">Guru Mata Pelajaran</p>
                            <div className="h-24"></div>
                            <p className="font-bold underline text-inherit">{approval.authorName}</p>
                            <p className="text-inherit">NIP. {approval.authorNip}</p>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
  }

  const ReflectionContent = () => {
    if (!data?.reflection) return null;
    const { teacher, student } = data.reflection;
    return (
        <div className="break-inside-avoid text-inherit font-sans">
             <h1 className="text-inherit font-sans font-bold text-[24pt] text-center mb-6">REFLEKSI PEMBELAJARAN</h1>
             
             <OpenSection title="1. Refleksi Guru">
                <ul className="list-disc pl-6 text-inherit">
                    {teacher.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                </ul>
             </OpenSection>

             <OpenSection title="2. Refleksi Murid">
                <ul className="list-disc pl-6 text-inherit">
                    {student.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                </ul>
             </OpenSection>
        </div>
    );
  }

  const MaterialsContent = () => {
    if (isGeneratingMaterials) return <div className="text-center py-20"><Loader2 className="animate-spin inline mr-2" />Sedang menyusun Materi Ajar...</div>;
    if (!data?.materials) return <div className="text-center py-20 text-gray-400">Belum ada materi ajar</div>;
    const m = data.materials;

    return (
        <div className="break-inside-avoid text-inherit font-sans">
            <h1 className="text-inherit font-sans font-bold text-[24pt] text-center mb-6">MATERI AJAR</h1>
            <h2 className="text-inherit font-sans text-[14pt] text-center mb-8 uppercase">{m.judul}</h2>

            <div className="mb-6 text-inherit">
                <h3 className="font-bold text-inherit mb-2 font-sans text-[14pt] border-b-2 border-[#87CEFA] text-left uppercase mt-4">PEMANTIK BELAJAR</h3>
                <p className="italic text-lg text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(m.pemantik)} />
            </div>

            <OpenSection title="SUB TOPIK">
                <ul className="list-disc pl-6 text-inherit">
                    {m.subTopik.map((t, i) => <li key={i} className="text-inherit">{t}</li>)}
                </ul>
            </OpenSection>

            <OpenSection title="KONSEP INTI">
                 <div className="mb-6 text-inherit">
                    <h4 className="font-bold mb-2 text-inherit font-sans text-[13pt]">Definisi</h4>
                    <div dangerouslySetInnerHTML={renderMarkdown(m.konsepInti.definisi)} />
                 </div>

                 <h4 className="font-bold mb-2 text-inherit font-sans text-[13pt]">Penjelasan Materi</h4>
                 <div className="mb-6 pl-4 border-l-4 border-blue-200 text-inherit">
                     <ul className="list-disc pl-6 space-y-2 text-inherit">
                        {m.konsepInti.penjelasanBertahap.map((p, i) => (
                             <li key={i} dangerouslySetInnerHTML={renderMarkdown(p)} />
                        ))}
                     </ul>
                 </div>

                 <h4 className="font-bold mb-2 text-inherit font-sans text-[13pt]">Visualisasi / Tabel</h4>
                 <div className="mb-6 overflow-x-auto markdown-content text-inherit" dangerouslySetInnerHTML={renderMarkdown(m.konsepInti.tabelVisual)} />

                 <div className="mb-6 text-inherit">
                    <h3 className="text-inherit font-sans font-bold text-[14pt] uppercase mb-2 mt-6 border-b-2 border-[#87CEFA] text-left">CONTOH NYATA</h3>
                    <div className="italic text-inherit" dangerouslySetInnerHTML={renderMarkdown(m.konsepInti.contohKonkret)} />
                 </div>
            </OpenSection>

            <div className="page-break h-4"></div>

            <div className="mt-8 text-inherit">
                <div className="mb-8">
                    <h3 className="font-bold border-b-2 border-[#87CEFA] pb-2 mb-4 text-inherit font-sans text-[14pt] uppercase">TAHUKAH KAMU?</h3>
                    <div className="text-sm text-inherit" dangerouslySetInnerHTML={renderMarkdown(m.trivia)} />
                </div>
                
                <div>
                    <h3 className="font-bold border-b-2 border-[#87CEFA] pb-2 mb-4 text-inherit font-sans text-[14pt] uppercase">GLOSARIUM</h3>
                    <ul className="text-sm space-y-2 text-inherit">
                        {m.glosarium.map((g, i) => (
                            <li key={i}>
                                <span className="font-bold text-inherit">{g.istilah}: </span>
                                <span className="text-inherit">{g.definisi}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
  }

  const LkpdHeader = () => (
    <div className="mb-8 bg-white text-black text-inherit font-sans">
      <div className="text-center mb-6">
        <h1 className="text-inherit font-sans" style={{ fontSize: '24pt', fontWeight: 'bold', lineHeight: '1.2' }}>
            LEMBAR KERJA MURID
        </h1>
        <h2 className="text-inherit font-sans" style={{ fontSize: '14pt', fontWeight: 'normal', lineHeight: '1.2' }}>
            {data?.lkpd?.title || inputData.topic}
        </h2>
      </div>
      
      <div className="w-full my-6" style={{ borderBottom: '2px solid black' }}></div>
      
      <div className="flex flex-col gap-4 font-sans" style={{ fontSize: '12pt' }}>
        <div className="space-y-1">
           <div className="flex"><span className="font-bold min-w-[180px]">Mata Pelajaran</span><span>: {inputData.subject}</span></div>
           <div className="flex"><span className="font-bold min-w-[180px]">Kelas / Fase</span><span>: {inputData.grade}</span></div>
           <div className="flex"><span className="font-bold min-w-[180px]">Jumlah Pertemuan</span><span>: {inputData.meetingCount}</span></div>
        </div>
        <div>
             <div className="font-bold mb-2">Identitas Kelompok</div>
             <div className="space-y-1">
                 <div className="flex items-end gap-2"><span className="min-w-[170px]">Nama Kelompok</span><div className="flex-1 border-b border-black border-dashed">:</div></div>
                 <div className="flex items-start gap-2">
                    <span className="min-w-[170px]">Anggota Kelompok</span>
                    <div className="flex-1">
                        <div className="mb-2 border-b border-black border-dashed">: 1. </div>
                        <div className="mb-2 ml-2 border-b border-black border-dashed"> 2. </div>
                        <div className="mb-2 ml-2 border-b border-black border-dashed"> 3. </div>
                        <div className="mb-2 ml-2 border-b border-black border-dashed"> 4. </div>
                    </div>
                 </div>
             </div>
        </div>
      </div>
    </div>
  );

  const LkpdContent = () => {
    if (isGeneratingLKPD) return <div className="text-center py-20"><Loader2 className="animate-spin inline mr-2" />Sedang menyusun Lembar Kerja...</div>;
    if (!data?.lkpd) return <div className="text-center py-20 text-gray-400">Belum ada data Lembar Kerja</div>;
    
    return (
        <div className="break-inside-avoid lkpd-reset text-inherit font-sans">
            <LkpdHeader />
            
            <OpenSection title="A. TUJUAN PEMBELAJARAN">
                 <div className="markdown-content text-inherit" dangerouslySetInnerHTML={renderMarkdown(data.lkpd.objectives)} />
            </OpenSection>

            <OpenSection title="B. PETUNJUK PENGERJAAN">
                 <ol className="list-decimal pl-6 space-y-2 text-inherit">
                     {data.lkpd.instructions && data.lkpd.instructions.length > 0 
                        ? (data.lkpd.instructions as string[]).map((g,i) => <li key={i} dangerouslySetInnerHTML={renderInlineMarkdown(g)} />)
                        : <li>Bacalah instruksi dengan seksama.</li>
                     }
                 </ol>
            </OpenSection>

            {/* STIMULUS SECTION */}
            <div className="mb-6 break-inside-avoid text-inherit">
                <h3 className="text-inherit font-sans font-bold text-[14pt] uppercase mb-3">C. STIMULUS</h3>
                <div className="italic text-inherit mt-2">
                    <div dangerouslySetInnerHTML={renderMarkdown(data.lkpd.stimulus)} />
                </div>
            </div>

            <div className="page-break h-2"></div>

            <h3 className="text-inherit mb-4 font-sans font-bold text-[14pt] uppercase mt-6">D. AKTIVITAS BERTAHAP</h3>

            {/* LEVEL 1 */}
            <div className="mb-6 break-inside-avoid text-inherit">
                <div className="font-bold text-inherit mb-2 border-b border-black inline-block font-sans">
                    AKTIVITAS 1
                </div>
                <div 
                    className="markdown-content text-inherit whitespace-pre-wrap leading-relaxed" 
                    dangerouslySetInnerHTML={renderMarkdown(data.lkpd.activities.level1)} 
                />
            </div>

            {/* LEVEL 2 */}
            <div className="mb-6 break-inside-avoid text-inherit">
                <div className="font-bold text-inherit mb-2 border-b border-black inline-block font-sans">
                    AKTIVITAS 2
                </div>
                <div 
                    className="markdown-content text-inherit whitespace-pre-wrap leading-relaxed" 
                    dangerouslySetInnerHTML={renderMarkdown(data.lkpd.activities.level2)} 
                />
            </div>

            {/* LEVEL 3 */}
            <div className="mb-6 break-inside-avoid text-inherit">
                <div className="font-bold text-inherit mb-2 border-b border-black inline-block font-sans">
                    AKTIVITAS 3
                </div>
                <div 
                    className="markdown-content text-inherit whitespace-pre-wrap leading-relaxed" 
                    dangerouslySetInnerHTML={renderMarkdown(data.lkpd.activities.level3)} 
                />
            </div>

            <div className="page-break h-2"></div>

            <OpenSection title="E. REFLEKSI DIRI">
                <ol className="list-decimal pl-6 space-y-6 text-inherit">
                    {data.lkpd.reflection.map((t, i) => (
                        <li key={i}>
                            <div className="mb-3 font-medium" dangerouslySetInnerHTML={renderInlineMarkdown(t)} />
                            <div className="border-b border-black border-dashed h-8 w-full opacity-30"></div>
                            <div className="border-b border-black border-dashed h-8 w-full opacity-30"></div>
                        </li>
                    ))}
                </ol>
            </OpenSection>
        </div>
    );
  };

  const AssessmentContent = () => {
      if (!data?.assessment) {
          if (isGeneratingAssessment) return <div className="text-center py-10 border-t border-slate-200 mt-10"><Loader2 className="animate-spin inline mr-2" />Sedang menyusun Instrumen Asesmen...</div>;
          return null; 
      }
      
      let { kktp, formative, summative, intervention } = data.assessment as DeepLearningAssessment;
      const summativeGrid = summative?.grid;

      return (
          <div className="break-inside-avoid text-inherit font-sans assessment-reset">
            <div className="page-break h-8"></div>
            <h1 className="text-inherit font-sans font-bold text-[24pt] text-center mb-6">INSTRUMEN ASESMEN & EVALUASI</h1>
            <h2 className="text-inherit font-sans text-[14pt] text-center mb-8 uppercase">TOPIK: {inputData.topic}</h2>
            
            <OpenSection title="1. KKTP (Rubrik Pembelajaran Mendalam)">
                 <p className="italic mb-4 text-inherit text-slate-600">Menggunakan Taksonomi Bloom (Revisi Anderson & Krathwohl)</p>
                 <RubricTable items={kktp} />
            </OpenSection>

            <div className="page-break h-4"></div>

            <OpenSection title="2. Asesmen Formatif (Proses)">
                <div className="mb-8">
                    <h4 className="font-bold mb-4 text-inherit font-sans text-[13pt]">A. Lembar Observasi (Checklist)</h4>
                    <table className="w-full border-collapse border border-black text-black text-inherit">
                        <thead>
                            <tr className="bg-[#87CEFA]">
                                <th className="border border-black p-2 text-center w-12 font-bold text-center text-inherit">No</th>
                                <th className="border border-black p-2 text-left font-bold text-center text-inherit">Aspek Pengamatan</th>
                                <th className="border border-black p-2 text-left font-bold text-center text-inherit">Indikator Perilaku</th>
                                <th className="border border-black p-2 text-center w-28 font-bold text-center text-inherit">Ceklis</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(formative.checklist || []).map((item: any, idx: number) => (
                                <tr key={idx}>
                                    <td className="border border-black p-2 text-center text-inherit">{idx + 1}</td>
                                    <td className="border border-black p-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.aspect)} />
                                    <td className="border border-black p-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.indicator)} />
                                    <td className="border border-black p-2 text-center text-inherit"></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mb-8">
                    <h4 className="font-bold mb-4 text-inherit font-sans text-[13pt]">B. Tangga Umpan Balik (Feedback Ladder)</h4>
                    <div className="border border-black p-6 text-inherit rounded-sm">
                        <div className="mb-4">
                            <span className="font-bold text-inherit block mb-1">KLARIFIKASI: </span>
                            <span className="italic text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(`"${safeString(formative.feedbackGuide.clarification)}"`)} />
                        </div>
                        <div className="mb-4">
                            <span className="font-bold text-inherit block mb-1">APRESIASI: </span>
                            <span className="italic text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(`"${safeString(formative.feedbackGuide.appreciation)}"`)} />
                        </div>
                        <div>
                            <span className="font-bold text-inherit block mb-1">SARAN: </span>
                            <span className="italic text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(`"${safeString(formative.feedbackGuide.suggestion)}"`)} />
                        </div>
                    </div>
                </div>
            </OpenSection>
            
            <OpenSection title="3. Asesmen Sumatif (Kisi-Kisi)">
                 <div className="mb-6">
                     <table className="w-full border-collapse border border-black text-inherit">
                        <thead>
                            <tr className="bg-[#87CEFA]">
                                <th className="border border-black p-2 text-center w-12 font-bold text-center text-inherit">No</th>
                                <th className="border border-black p-2 text-left font-bold text-center text-inherit">Indikator Soal</th>
                                <th className="border border-black p-2 text-center font-bold text-center text-inherit">Level Kognitif</th>
                                <th className="border border-black p-2 text-center font-bold text-center text-inherit">Bentuk Soal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.isArray(summativeGrid) ? (summativeGrid as any[]).map((item: any, idx: number) => (
                                <tr key={idx}>
                                    <td className="border border-black p-2 text-center text-inherit">{idx + 1}</td>
                                    <td className="border border-black p-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.indicator)} />
                                    <td className="border border-black p-2 text-center text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(item.level)} />
                                    <td className="border border-black p-2 text-center text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(item.technique)} />
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="border border-black p-6 text-center italic text-inherit">
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
                        <tr className="bg-[#87CEFA]">
                            <th className="border border-black p-2 text-left font-bold w-1/3 text-center text-inherit">Kondisi Siswa</th>
                            <th className="border border-black p-2 text-left font-bold text-center text-inherit">Strategi Intervensi</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="border border-black p-2 font-bold align-top text-inherit">Perlu Bimbingan</td>
                            <td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.needsGuidance)} />
                        </tr>
                        <tr>
                            <td className="border border-black p-2 font-bold align-top text-inherit">Cukup</td>
                            <td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.basic)} />
                        </tr>
                        <tr>
                            <td className="border border-black p-2 font-bold align-top text-inherit">Baik</td>
                            <td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.proficient)} />
                        </tr>
                        <tr>
                            <td className="border border-black p-2 font-bold align-top text-inherit">Sangat Baik</td>
                            <td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.advanced)} />
                        </tr>
                    </tbody>
                 </table>
            </OpenSection>
          </div>
      );
  };

  const QuestionBankContent = () => {
      if (isGeneratingQuestionBank) return <div className="text-center py-20"><Loader2 className="animate-spin inline mr-2" />Sedang menyusun Bank Soal...</div>;
      if (!data?.questionBank) return <div className="text-center py-20 text-gray-400">Belum ada data Bank Soal</div>;

      const groupedItems = data.questionBank.items.reduce((acc, item) => {
          if (!acc[item.type]) acc[item.type] = [];
          acc[item.type].push(item);
          return acc;
      }, {} as Record<string, QuestionItem[]>);

      return (
          <div className="break-inside-avoid text-inherit font-sans">
            <h1 className="text-inherit font-sans font-bold text-[24pt] text-center mb-6">BANK SOAL & EVALUASI</h1>
            <h2 className="text-inherit font-sans text-[14pt] text-center mb-8 uppercase">TOPIK: {data.identitySection.topic}</h2>
            
            {/* Render items by group type */}
            {Object.entries(groupedItems).map(([type, items], groupIndex) => (
                <div key={type} className="mb-10">
                    <h3 className="text-inherit border-b border-black pb-2 mb-6 font-sans font-bold text-[14pt]">
                        {String.fromCharCode(65 + groupIndex)}. {type.toUpperCase()}
                    </h3>
                    
                    <div className="space-y-8">
                        {(items as any[]).map((item, idx) => (
                            <div key={idx} className="break-inside-avoid-page">
                                <div className="flex gap-4">
                                    <span className="font-bold text-inherit">{idx + 1}.</span>
                                    <div className="flex-1 text-inherit">
                                        {item.stimulus && (
                                            <div className="mb-3 italic text-gray-700 text-inherit bg-slate-50 p-4 border-l-4 border-slate-300" dangerouslySetInnerHTML={renderMarkdown(item.stimulus)} />
                                        )}
                                        <div className="mb-3 whitespace-pre-wrap text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.question)} />
                                        
                                        {/* OPTION RENDERING */}
                                        {(item.type === 'Pilihan Ganda') && item.options && (
                                            <div className="grid grid-cols-1 gap-y-2 text-inherit mt-1 ml-4">
                                                {(item.options as any[]).map((opt, i) => (
                                                    <div key={i} className="flex gap-2 text-inherit">
                                                        <span className="font-bold min-w-[24px] text-inherit">{String.fromCharCode(65 + i)}.</span>
                                                        <span className="text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(opt)} />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {(item.type === 'Pilihan Ganda Kompleks') && item.options && (
                                            <div className="grid grid-cols-1 gap-y-2 text-inherit mt-1 ml-4">
                                                {(item.options as any[]).map((opt, i) => (
                                                    <div key={i} className="flex gap-2 text-inherit items-center">
                                                        <div className="w-5 h-5 border border-black mr-2 bg-white"></div>
                                                        <span className="text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(opt)} />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {(item.type === 'Menjodohkan') && item.matchingPairs && Array.isArray(item.matchingPairs) && (
                                            <div className="mt-4 ml-4">
                                                <table className="w-full border-collapse border border-black">
                                                    <thead>
                                                        <tr className="bg-slate-100">
                                                            <th className="border border-black p-2">Premis</th>
                                                            <th className="border border-black p-2">Pilihan Jawaban</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(item.matchingPairs as any[]).map((pair: any, i: number) => (
                                                            <tr key={i}>
                                                                <td className="border border-black p-2">{pair.left}</td>
                                                                <td className="border border-black p-2">{pair.right}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {(item.type === 'Benar/Salah') && (
                                            <div className="flex gap-6 mt-3 ml-4 font-bold">
                                                <div className="border border-black px-6 py-2">BENAR</div>
                                                <div className="border border-black px-6 py-2">SALAH</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            <div className="mt-16 pt-10 border-t-2 border-black page-break">
                <h3 className="text-lg font-bold text-center mb-8 uppercase font-sans text-[14pt]">KUNCI JAWABAN</h3>
                
                <div className="flex flex-col gap-10">
                    {Object.entries(groupedItems).map(([type, items], groupIndex) => (
                        <div key={type}>
                            <h4 className="font-bold text-inherit mb-4 border-b border-black pb-2 font-sans text-[13pt]">
                                {String.fromCharCode(65 + groupIndex)}. {type.toUpperCase()}
                            </h4>
                            <ol className="list-decimal pl-6 space-y-3 text-inherit">
                                {(items as any[]).map((item, idx) => (
                                    <li key={idx}>
                                        <span className="font-bold text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.answerKey)} />
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ))}
                </div>
            </div>
          </div>
      );
  };

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
                    onClick={handleDownloadPDF} 
                    disabled={!data} 
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-md text-xs font-medium transition disabled:opacity-50" 
                    title="Cetak / PDF"
                >
                    <Printer size={14} />
                    <span className="hidden sm:inline">Cetak / PDF</span>
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
                          <div><label className="text-xs font-medium text-slate-500">Jumlah Pertemuan</label><select name="meetingCount" value={inputData.meetingCount} onChange={handleEditorChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white"><option value="1 Pertemuan">1 Pertemuan</option><option value="2 Pertemuan">2 Pertemuan</option><option value="3 Pertemuan">3 Pertemuan</option></select></div>
                          <div><label className="text-xs font-medium text-slate-500">Topik / Materi</label><input name="topic" value={inputData.topic} onChange={handleEditorChange} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm bg-white" placeholder="Topik Utama" /></div>
                          <div><label className="text-xs font-medium text-slate-500">Tujuan Pembelajaran</label><textarea name="objectives" value={inputData.objectives} onChange={handleEditorChange} rows={4} className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm resize-none bg-white" placeholder="Contoh: Peserta didik mampu menganalisis struktur teks..." /></div>
                          <div className="pt-2"><button onClick={onGenerate} disabled={isLoading || !canGenerate} className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition ${isLoading || !canGenerate ? 'bg-slate-300 text-white cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>{isLoading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}{isLoading ? "Menyusun RPM + Asesmen..." : "Generate RPM + Asesmen"}</button>{!canGenerate && <p className="text-[10px] text-red-500 text-center mt-1">{getValidationMessage()}</p>}</div>
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

            <div ref={scrollContainerRef} className="flex-1 w-full overflow-y-auto p-4 md:p-8">
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
                            {/* Insert Style Override for Lists */}
                            <style>{`
                                /* Force Font Uniformity to Cambria */
                                .paper-content, 
                                .paper-content p, 
                                .paper-content li, 
                                .paper-content td, 
                                .paper-content th, 
                                .paper-content span, 
                                .paper-content div {
                                    font-size: 12pt !important;
                                    line-height: 1.5 !important;
                                    font-family: 'Cambria', Georgia, serif !important;
                                    color: #000000 !important;
                                }
                                
                                .paper-content p {
                                    margin-bottom: 8pt !important;
                                    text-align: justify;
                                }

                                .paper-content li {
                                    margin-bottom: 0px !important;
                                    text-align: justify;
                                    padding-left: 8px;
                                }
                                
                                /* Header exceptions */
                                .paper-content h1 { font-size: 24pt !important; line-height: 1.2 !important; font-weight: bold !important; text-align: center; margin-bottom: 0pt; margin-top: 0; }
                                .paper-content h2 { font-size: 14pt !important; line-height: 1.2 !important; font-weight: bold !important; text-align: center; margin-bottom: 12pt; margin-top: 0pt; text-transform: uppercase; }
                                
                                /* H3 Default: Blue Underline */
                                .paper-content h3 { font-size: 14pt !important; line-height: 1.2 !important; font-weight: bold !important; text-transform: uppercase; margin-bottom: 8pt; margin-top: 18pt; border-bottom: 2px solid #87CEFA; display: block; text-align: left !important; }
                                
                                /* Assessment H3 Override */
                                .assessment-reset h3 { border-bottom: none !important; }

                                .paper-content h4 { font-size: 13pt !important; text-transform: uppercase; font-weight: bold !important; margin-bottom: 6pt; margin-top: 12pt; }

                                /* LKPD Headers Specifics - Override generic inheritance */
                                .lkpd-reset h1 {
                                    font-size: 24pt !important;
                                    font-weight: bold !important;
                                    margin-bottom: 12pt;
                                    text-align: center !important;
                                }
                                .lkpd-reset h2 {
                                    font-size: 14pt !important;
                                    font-weight: normal !important;
                                    text-transform: uppercase;
                                    text-align: center !important;
                                    margin-bottom: 24pt;
                                }
                                
                                /* Update Table Styles for Markdown Content */
                                .markdown-content table {
                                    width: 100% !important;
                                    border-collapse: collapse !important;
                                    border: 1px solid #000 !important;
                                    margin: 12pt 0;
                                }
                                .markdown-content th {
                                    background-color: #87CEFA !important;
                                    font-weight: bold !important;
                                    border: 1px solid #000 !important;
                                    padding: 6pt 8pt;
                                    text-align: center !important;
                                    font-size: 11pt !important;
                                }
                                .markdown-content td {
                                    border: 1px solid #000 !important;
                                    padding: 6pt 8pt;
                                    text-align: left;
                                    vertical-align: top;
                                    font-size: 11pt !important;
                                }
                                
                                /* Override paragraph spacing inside tables to be tighter */
                                .paper-content table p, .paper-content table li {
                                    margin-bottom: 0px !important;
                                    text-align: left !important;
                                    font-size: 11pt !important;
                                }

                                /* Identity Table Specifics */
                                .identity-table td { border-color: white !important; padding: 2pt 4pt !important; }
                                .identity-table { border-color: white !important; margin-bottom: 0 !important; }
                            `}</style>

                            {(activeTab === 'RPP_PLUS' || activeTab === 'SEMUA') && (
                                <>
                                    <RppContent />
                                    <div className="h-8 border-t border-dashed border-slate-300 my-8 print:break-before-page page-break"></div>
                                    <AssessmentContent />
                                    <div className="h-8"></div>
                                    <ApprovalSignature />
                                    <div className="h-8 border-t border-dashed border-slate-300 my-8 print:break-before-page page-break"></div>
                                    <ReflectionContent />
                                </>
                            )}
                            
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

                             {(activeTab === 'SOAL' || activeTab === 'SEMUA') && (
                                <>
                                    {activeTab === 'SEMUA' && data.questionBank && <div className="h-8 border-t border-dashed border-slate-300 my-8 print:break-before-page page-break"></div>}
                                    <QuestionBankContent />
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
