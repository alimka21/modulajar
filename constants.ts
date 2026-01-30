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

export const INITIAL_LESSON_IDENTITY: LessonIdentity = {
  subject: '',
  grade: '',
  semester: 'Ganjil',
  timeAllocation: '2 JP x 45 Menit',
  meetingCount: '1 Pertemuan', // Default
  topic: '',
  objectives: '',
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