
import { GoogleGenAI, Type } from "@google/genai";
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, LKPDData, AssessmentItem, KKTPItem, QuestionBankConfig, QuestionBankData, MaterialsData, DeepLearningAssessment } from '../types';
import { GRADUATE_PROFILE_DIMENSIONS } from '../constants';

// Helper to get client with priority: SessionStorage > Env Var
const getClient = () => {
  // Pindah ke sessionStorage agar selaras dengan Auth
  const customKey = sessionStorage.getItem('custom_api_key');
  const envKey = process.env.API_KEY;
  
  const apiKey = customKey || envKey;

  if (!apiKey) {
    throw new Error("API Key tidak ditemukan. Harap set API Key di pengaturan atau hubungi admin.");
  }
  return new GoogleGenAI({ apiKey: apiKey });
};

// Validasi Koneksi API Key
export const validateApiKey = async (apiKey: string): Promise<{ success: boolean; message: string }> => {
    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        await ai.models.generateContent({
            model: 'gemini-3-flash-preview', 
            contents: 'Test connection',
        });
        return { success: true, message: "Koneksi Berhasil (Gemini 3 Flash)" };
    } catch (error: any) {
        console.error("API Key Validation Failed:", error);
        
        if (error.message?.includes("404") || error.message?.includes("not found")) {
            try {
                const ai = new GoogleGenAI({ apiKey: apiKey });
                await ai.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: 'Test fallback connection',
                });
                return { success: true, message: "Koneksi Berhasil (Fallback ke Gemini 2.0)" };
            } catch (e) { }
        }
        
        let msg = error.message || "Gagal menghubungi server AI.";
        if (msg.includes("403")) msg = "Akses Ditolak (403). Periksa API Restrictions.";
        else if (msg.includes("429")) msg = "Kuota Habis (429).";

        return { success: false, message: msg };
    }
};

// ------------------------------------
// HELPER: RETRY LOGIC FOR 429 ERRORS
// ------------------------------------
const generateWithRetry = async (
  prompt: string, 
  schema: any, 
  model: string = 'gemini-3-flash-preview',
  retries: number = 4
): Promise<any> => {
  const ai = getClient();
  const baseDelay = 6000;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });

      if (!response.text) {
         throw new Error("AI memberikan respons kosong.");
      }
      
      return JSON.parse(response.text);

    } catch (error: any) {
      const isRateLimit = 
        error.message?.includes('429') || 
        error.status === 429 || 
        error.message?.toLowerCase().includes('quota');

      if (isRateLimit && attempt < retries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
      }
      
      if (error.message?.includes('404') || error.message?.includes('not found')) {
          try {
               const fallbackResponse = await ai.models.generateContent({
                    model: 'gemini-2.0-flash',
                    contents: prompt,
                    config: { responseMimeType: "application/json", responseSchema: schema }
               });
               return JSON.parse(fallbackResponse.text || "{}");
          } catch (e) {
              throw error;
          }
      }
      throw error;
    }
  }
};

const DEEP_LEARNING_GUIDELINES = `
PRINSIP DASAR PENYUSUNAN MODUL AJAR (WAJIB DIPATUHI):
1. **Istilah Murid**: Gunakan istilah "Murid", BUKAN "Siswa".
2. **Prinsip Pembelajaran**: Pilih HANYA: (Berkesadaran, Bermakna, Mengembirakan).
3. **Analisis Kompleksitas Berbasis Fase**:
   - SD: Konkret, Bermain, C1-C3.
   - SMP: Inkuiri Terbimbing, C3-C4.
   - SMA: Berpikir Kritis, C4-C6.
4. **Tujuan Pembelajaran**: Spesifik, Terukur (Taksonomi Bloom).
5. **GRANULARITAS AKTIVITAS**: Pecah aktivitas besar menjadi langkah mikro (Micro-Steps).
6. **FORMAT MATEMATIKA**: LaTeX ($...$) HANYA untuk rumus. JANGAN untuk angka biasa.
`;

const LEARNING_STEP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    meetingNo: { type: Type.INTEGER },
    intro: { type: Type.ARRAY, items: { type: Type.STRING } },
    introPrinciple: { type: Type.STRING },
    core: {
      type: Type.OBJECT,
      properties: {
        memahami: { type: Type.ARRAY, items: { type: Type.STRING } },
        mengaplikasi: { type: Type.ARRAY, items: { type: Type.STRING } },
        merefleksi: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['memahami', 'mengaplikasi', 'merefleksi']
    },
    corePrinciple: { type: Type.STRING },
    closing: { type: Type.ARRAY, items: { type: Type.STRING } },
    closingPrinciple: { type: Type.STRING }
  },
  required: ['meetingNo', 'intro', 'introPrinciple', 'core', 'corePrinciple', 'closing', 'closingPrinciple']
};

const RPP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    identitySection: {
      type: Type.OBJECT,
      properties: {
        schoolName: { type: Type.STRING },
        subject: { type: Type.STRING },
        grade: { type: Type.STRING },
        semester: { type: Type.STRING },
        timeAllocation: { type: Type.STRING },
        meetingCount: { type: Type.STRING },
        topic: { type: Type.STRING },
      },
      required: ['schoolName', 'subject', 'topic']
    },
    initialAssessment: { type: Type.STRING },
    graduateProfile: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING }
    },
    design: {
      type: Type.OBJECT,
      properties: {
        objectives: { type: Type.ARRAY, items: { type: Type.STRING } },
        pedagogicalPractice: { type: Type.STRING },
        partnership: { type: Type.STRING },
        environment: { type: Type.STRING },
        digital: { type: Type.STRING },
      },
      required: ['objectives', 'pedagogicalPractice', 'environment']
    },
    learningExperience: { type: Type.ARRAY, items: LEARNING_STEP_SCHEMA },
    reflection: {
        type: Type.OBJECT,
        properties: {
            teacher: { type: Type.ARRAY, items: { type: Type.STRING } },
            student: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['teacher', 'student']
    },
    approval: {
      type: Type.OBJECT,
      properties: {
        location: { type: Type.STRING },
        date: { type: Type.STRING },
        authorName: { type: Type.STRING },
        authorNip: { type: Type.STRING },
        principalName: { type: Type.STRING },
        principalNip: { type: Type.STRING }
      },
      required: ['location', 'date', 'authorName', 'principalName']
    }
  },
  required: ['identitySection', 'design', 'learningExperience', 'reflection', 'approval']
};

const MATERIALS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    judul: { type: Type.STRING },
    pemantik: { type: Type.STRING },
    subTopik: { type: Type.ARRAY, items: { type: Type.STRING } },
    konsepInti: {
      type: Type.OBJECT,
      properties: {
        definisi: { type: Type.STRING },
        penjelasanBertahap: { type: Type.ARRAY, items: { type: Type.STRING } },
        tabelVisual: { type: Type.STRING },
        contohKonkret: { type: Type.STRING }
      },
      required: ['definisi', 'penjelasanBertahap', 'tabelVisual', 'contohKonkret']
    },
    trivia: { type: Type.STRING },
    glosarium: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { istilah: { type: Type.STRING }, definisi: { type: Type.STRING } },
        required: ['istilah', 'definisi']
      }
    }
  },
  required: ['judul', 'pemantik', 'subTopik', 'konsepInti', 'trivia', 'glosarium']
};

const LKPD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    objectives: { type: Type.STRING },
    instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
    stimulus: { type: Type.STRING },
    activities: {
      type: Type.OBJECT,
      properties: {
        level1: { type: Type.STRING },
        level2: { type: Type.STRING },
        level3: { type: Type.STRING }
      },
      required: ['level1', 'level2', 'level3']
    },
    reflection: { type: Type.ARRAY, items: { type: Type.STRING } }
  },
  required: ['title', 'objectives', 'instructions', 'stimulus', 'activities', 'reflection']
};

const ASSESSMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    kktp: { 
      type: Type.ARRAY, 
      items: { 
          type: Type.OBJECT,
          properties: {
            criteria: { type: Type.STRING },
            needsGuidance: { type: Type.STRING },
            basic: { type: Type.STRING },
            proficient: { type: Type.STRING },
            advanced: { type: Type.STRING }
          },
          required: ['criteria', 'needsGuidance', 'basic', 'proficient', 'advanced']
      } 
    },
    formative: {
        type: Type.OBJECT,
        properties: {
            checklist: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: { aspect: { type: Type.STRING }, indicator: { type: Type.STRING } },
                    required: ['aspect', 'indicator']
                }
            },
            feedbackGuide: {
                type: Type.OBJECT,
                properties: { clarification: { type: Type.STRING }, appreciation: { type: Type.STRING }, suggestion: { type: Type.STRING } },
                required: ['clarification', 'appreciation', 'suggestion']
            }
        },
        required: ['checklist', 'feedbackGuide']
    },
    summative: {
        type: Type.OBJECT,
        properties: {
            grid: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: { indicator: { type: Type.STRING }, level: { type: Type.STRING }, technique: { type: Type.STRING } },
                    required: ['indicator', 'level', 'technique']
                }
            }
        },
        required: ['grid']
    },
    intervention: {
        type: Type.OBJECT,
        properties: {
            needsGuidance: { type: Type.STRING },
            basic: { type: Type.STRING },
            proficient: { type: Type.STRING },
            advanced: { type: Type.STRING }
        },
        required: ['needsGuidance', 'basic', 'proficient', 'advanced']
    }
  },
  required: ['kktp', 'formative', 'summative', 'intervention']
};

const QUESTION_BANK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          number: { type: Type.NUMBER },
          type: { type: Type.STRING },
          question: { type: Type.STRING },
          stimulus: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          matchingPairs: { 
              type: Type.ARRAY, 
              items: { 
                  type: Type.OBJECT,
                  properties: { left: { type: Type.STRING }, right: { type: Type.STRING } }
              }
          },
          answerKey: { type: Type.STRING }
        },
        required: ['number', 'type', 'question', 'answerKey']
      }
    }
  },
  required: ['items']
};

export const generateRPP = async (schoolData: SchoolIdentity, lessonData: LessonIdentity): Promise<GeneratedLessonPlan> => {
  const availableDimensions = GRADUATE_PROFILE_DIMENSIONS.join(", ");
  const prompt = `
    Bertindaklah sebagai Pakar Kurikulum & Deep Learning.
    Tugas: Menyusun RENCANA PEMBELAJARAN (RPP) formal.
    ${DEEP_LEARNING_GUIDELINES}
    INFO INPUT:
    Sekolah: ${schoolData.schoolName}
    Mapel: ${lessonData.subject}
    Kelas: ${lessonData.grade}
    Topik: ${lessonData.topic}
    Tujuan: ${lessonData.objectives || "Sesuai topik"}
    Pertemuan: ${lessonData.meetingCount}
    Pilih SECARA OTOMATIS **minimal 2 dan maksimal 3** Dimensi yang paling relevan dari [${availableDimensions}].
    Hasilkan output JSON Sesuai Schema RPP.
  `;
  const parsed = await generateWithRetry(prompt, RPP_SCHEMA);
  parsed.identitySection.schoolName = schoolData.schoolName;
  parsed.identitySection.subject = lessonData.subject;
  parsed.identitySection.grade = lessonData.grade;
  parsed.identitySection.semester = lessonData.semester;
  parsed.identitySection.timeAllocation = lessonData.timeAllocation;
  parsed.identitySection.meetingCount = lessonData.meetingCount;
  parsed.identitySection.topic = lessonData.topic;
  
  if (lessonData.graduateProfileDimensions?.length > 0) {
      parsed.graduateProfile = lessonData.graduateProfileDimensions;
  }
  
  parsed.approval = {
    location: schoolData.location,
    date: schoolData.date,
    authorName: schoolData.authorName,
    authorNip: schoolData.authorNip,
    principalName: schoolData.principalName,
    principalNip: schoolData.principalNip
  };
  return parsed;
};

export const generateMaterials = async (rppData: GeneratedLessonPlan): Promise<MaterialsData> => {
    const prompt = `Susun Materi Ajar Deep Learning untuk Topik: ${rppData.identitySection.topic}. Output JSON.`;
    return await generateWithRetry(prompt, MATERIALS_SCHEMA);
};

export const generateLKPD = async (rppData: GeneratedLessonPlan): Promise<LKPDData> => {
  const prompt = `Buat Lembar Kerja Murid (LKPD) Akademik untuk Topik: ${rppData.identitySection.topic}. Output JSON.`;
  return await generateWithRetry(prompt, LKPD_SCHEMA);
};

export const generateAssessment = async (rppData: GeneratedLessonPlan): Promise<DeepLearningAssessment> => {
  const prompt = `Menyusun instrumen asesmen untuk Topik: ${rppData.identitySection.topic}. Output JSON.`;
  return await generateWithRetry(prompt, ASSESSMENT_SCHEMA);
};

export const generateQuestionBank = async (rppData: GeneratedLessonPlan, config: QuestionBankConfig): Promise<QuestionBankData> => {
  const prompt = `Buat Bank Soal. Jumlah: ${config.count}. Level: ${config.level}. Tipe: ${config.types.join(', ')}. Topik: ${rppData.identitySection.topic}. Output JSON.`;
  return await generateWithRetry(prompt, QUESTION_BANK_SCHEMA);
};
