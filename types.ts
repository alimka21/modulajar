
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
    // objectiveTest removed as requested
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

export interface LKPDActivity {
  content: string;
  activityType: string;
}

export interface LKPDData {
  title: string;          
  objectives: string;     
  instructions: string[]; 
  stimulus: string;       
  activities: {
      level1: string | LKPDActivity;     
      level2: string | LKPDActivity;     
      level3: string | LKPDActivity;     
  };
  reflection: string[];   
}

// --- QUESTION BANK TYPES ---

export type QuestionLevel = 'LOTS' | 'HOTS' | 'CAMPURAN';

export type QuestionType = 
  | 'Pilihan Ganda' 
  | 'Pilihan Ganda Kompleks' 
  | 'Menjodohkan' 
  | 'Benar/Salah' 
  | 'Isian Singkat' 
  | 'Uraian';

export interface QuestionBankConfig {
  count: number;
  level: QuestionLevel;
  types: QuestionType[];
}

export interface QuestionItem {
  number: number;
  type: QuestionType; 
  question: string;
  stimulus?: string;
  // For PG & PG Kompleks
  options?: string[]; 
  // For Matching (Menjodohkan)
  matchingPairs?: { left: string; right: string }[]; 
  // Answer key (Text for essays/short, Option letter for PG, Boolean for T/F)
  answerKey: string;
}

export interface QuestionBankData {
  config?: QuestionBankConfig; // Store the config used to generate
  items: QuestionItem[];
}

// ---------------------------

export type PaperSize = 'A4' | 'LETTER';
export type FontSize = '10pt' | '11pt' | '12pt';

export interface DocumentSettings {
  paperSize: PaperSize;
  fontSize: FontSize;
}

export interface MaterialsData {
  judul: string; 
  pemantik: string; 
  subTopik: string[]; 
  konsepInti: {
      definisi: string; 
      penjelasanBertahap: string[]; 
      tabelVisual: string | { headers: string[]; rows: string[][] }; 
      contohKonkret: string; 
  };
  trivia: string;
  glosarium: { istilah: string; definisi: string }[];
}

export interface LearningStep {
  meetingNo: number;
  intro: string[];
  introPrinciple: string; 
  core: {
    memahami: string[];
    mengaplikasi: string[];
    merefleksi: string[];
  };
  corePrinciple: string; 
  closing: string[];
  closingPrinciple: string; 
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

export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'pending';

export interface User {
  id: string;
  name: string;
  username?: string; 
  email: string;
  password?: string; 
  role: UserRole;
  status: UserStatus;
  joinedDate: string;
  lastLogin?: string; 
  generationCount?: number;
  apiKey?: string; // New Field: Stores the user's custom API Key
  phoneNumber?: string;
}

export interface AppSettings {
  promoLink: string;
  whatsappNumber: string;
  socialMediaLink: string;
}

export interface HistoryItem {
    id: string;
    created_at: string;
    subject: string;
    grade: string;
    topic: string;
    features: {
        rpp: boolean;
        materials: boolean;
        lkpd: boolean;
        assessment: boolean;
        questionBank: boolean;
    };
    full_data: GeneratedLessonPlan;
    input_data: LessonIdentity;
}
