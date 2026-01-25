
export interface SchoolIdentity {
  schoolName: string;
  authorName: string;
  authorNip: string;
  principalName: string;
  principalNip: string;
  location: string;
  date: string;
}

export interface LessonIdentity {
  subject: string;
  grade: string;
  semester: string;
  timeAllocation: string;
  meetingCount: string;
  topic: string;
  objectives: string;
  initialAssessment: string;
  pedagogicalPractice: string;
  learningEnvironment: string;
  digitalUtilization: string;
  learningPartnership: string;
  graduateProfileDimensions: string[];
  customStyle: string;
}

export interface AssessmentItem {
  criteria: string;
  indicator: string;
  technique: string;
  instrument: string;
  form: string;
}

export interface KKTPItem {
  criteria: string;
  needsGuidance: string; 
  basic: string;         
  proficient: string;    
  advanced: string;      
}

export interface DeepLearningAssessment {
  kktp: KKTPItem[];
  formative: {
    checklist: { aspect: string; indicator: string }[];
    feedbackGuide: {
      clarification: string;
      appreciation: string;
      suggestion: string;
    };
  };
  summative: {
    grid: {
        indicator: string;
        level: string; // Relational / Extended Abstract
        technique: string; // Tes Tulis / Proyek
    }[];
  };
  intervention: {
    needsGuidance: string;
    basic: string;
    proficient: string;
    advanced: string;
  };
}

export interface LKPDData {
  activityTitle: string;
  guides: string[]; // Petunjuk Umum Pengerjaan
  objectives: string; // Tujuan Misi (Bahasa Siswa)
  toolsMaterials: string[];
  instructions: string[]; // Langkah Kerja Step-by-step
  activityZone: string; // Markdown string for tables/canvas/spaces
  discussionQuestions: string[];
  reflection: string; // Markdown string for self-reflection checklist
}

// --- QUESTION BANK TYPES ---

export type QuestionLevel = 'LOTS' | 'MIXED' | 'HOTS';
export type QuestionType = 'Pilihan Ganda' | 'Pilihan Ganda Kompleks' | 'Menjodohkan' | 'Isian Singkat' | 'Uraian';

export interface QuestionBankConfig {
  count: number;
  level: QuestionLevel;
  types: QuestionType[];
}

export interface QuestionItem {
  number: number;
  type: string;
  question: string;
  stimulus?: string;
  options?: string[];
  answerKey: string;
}

export interface QuestionBankData {
  items: QuestionItem[];
}

// ---------------------------

export type PaperSize = 'A4' | 'LETTER';
export type FontSize = '10pt' | '11pt' | '12pt';

export interface DocumentSettings {
  paperSize: PaperSize;
  fontSize: FontSize;
}

// Strictly structured materials: Deep Dive Format
export interface MaterialsData {
  judul: string;
  pemantik: string; // Apersepsi / Pemantik Belajar
  petaKonsep: string[]; // List of main scope points
  materiInti: { 
      subJudul: string; 
      penjelasan: string; 
      contoh: string; 
      bukanContoh: string; 
  }[];
  deskripsiIlustrasi: string;
  trivia: string;
  glosarium: { istilah: string; definisi: string }[];
}

export interface LearningStep {
  meetingNo: number;
  intro: string[];
  introPrinciple: string; // Can select 1 or 2 principles
  core: {
    memahami: string[];
    mengaplikasi: string[];
    merefleksi: string[];
  };
  corePrinciple: string; // Can select 1 or 2 principles
  closing: string[];
  closingPrinciple: string; // Can select 1 or 2 principles
}

export interface GeneratedLessonPlan {
  identitySection: {
    schoolName: string;
    subject: string;
    grade: string;
    semester: string;
    timeAllocation: string;
    meetingCount?: string; 
    topic: string;
  };
  initialAssessment: string;
  graduateProfile: string[]; 
  
  design: {
    objectives: string[];
    pedagogicalPractice: string;
    partnership: string;
    environment: string;
    digital: string;
  };

  learningExperience: LearningStep[];

  assessment?: DeepLearningAssessment;
  
  lkpd?: LKPDData;
  questionBank?: QuestionBankData;
  materials?: MaterialsData; 
  
  reflection?: {
      teacher: string[];
      student: string[];
  };

  approval: {
    location: string;
    date: string;
    authorName: string;
    authorNip: string;
    principalName: string;
    principalNip: string;
  };
}
