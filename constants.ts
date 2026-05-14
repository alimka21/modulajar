import { SchoolIdentity, LessonIdentity } from './types';

export const INITIAL_SCHOOL_IDENTITY: SchoolIdentity = {
  schoolName: '',
  authorName: '',
  authorNip: '',
  principalName: '',
  principalNip: '',
  location: '',
  date: new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }),
};

export const PEDAGOGIES = [
  {
    category: "Biarkan AI yang Rekomendasikan Praktik Pedagogis",
    options: []
  },
  {
    category: "Model Pembelajaran",
    options: [
      "Problem Based Learning (PBL)",
      "Project Based Learning (PjBL)",
      "Inquiry Based Learning",
      "Discovery Learning",
      "Problem Solving",
      "Cooperative Learning (Type Jigsaw/STAD/TGT)",
      "Design Thinking"
    ]
  },
  {
    category: "Strategi Pembelajaran",
    options: [
      "Strategi Pembelajaran Diferensiasi",
      "Strategi Inkuiri",
      "Strategi Ekspositori",
      "Strategi Berbasis Masalah (SPBM)",
      "Strategi Afektif",
      "Strategi Kooperatif"
    ]
  },
  {
    category: "Metode Pembelajaran",
    options: [
      "Diskusi Kelompok",
      "Simulasi / Role Play",
      "Eksperimen / Percobaan",
      "Demonstrasi",
      "Tanya Jawab Sosokratik",
      "Resitasi (Penugasan)",
      "Mind Mapping",
      "Debat Aktif",
      "Field Trip (Karya Wisata)"
    ]
  }
];

export const INITIAL_LESSON_IDENTITY: LessonIdentity = {
  subject: '',
  grade: '',
  semester: 'Ganjil',
  timeAllocation: '2 JP x 45 Menit',
  meetingCount: '1 Pertemuan', // Default
  topic: '',
  objectives: [''],
  initialAssessment: '',
  pedagogicalPractice: '',
  learningEnvironment: '',
  digitalUtilization: '',
  learningPartnership: '',
  graduateProfileDimensions: [],
  customStyle: '',
};

export const GRADUATE_PROFILE_DIMENSIONS = [
  "Keimanan dan Ketakwaan terhadap Tuhan Yang Maha Esa",
  "Kewargaan",
  "Penalaran Kritis",
  "Kreativitas",
  "Kolaborasi",
  "Kemandirian",
  "Kesehatan",
  "Komunikasi"
];

export const INDONESIAN_MONTHS = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];