
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, LKPDData, QuestionBankConfig, QuestionBankData, MaterialsData, DeepLearningAssessment } from '../types';
import { GRADUATE_PROFILE_DIMENSIONS } from '../constants';

const getClient = () => {
  const customKey = sessionStorage.getItem('custom_api_key');
  const envKey = process.env.API_KEY;
  const apiKey = customKey || envKey;

  if (!apiKey) {
    throw new Error("API Key tidak ditemukan. Harap set API Key di dashboard atau hubungi admin.");
  }
  return new GoogleGenAI({ apiKey: apiKey });
};

export const validateApiKey = async (apiKey: string): Promise<{ success: boolean; message: string }> => {
    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        // Use a simple prompt and model to validate
        await ai.models.generateContent({
            model: 'gemini-3-flash-preview', 
            contents: 'Test connection',
        });
        return { success: true, message: "Koneksi Berhasil" };
    } catch (error: any) {
        console.error("API Key Validation Failed:", error);
        let msg = error.message || "Gagal menghubungi server AI.";
        if (msg.includes("403")) msg = "Akses Ditolak (403). Periksa API Restrictions.";
        else if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) msg = "Kuota Habis (429). Silakan gunakan API Key lain.";
        else if (msg.includes("Failed to fetch")) msg = "Koneksi Gagal. Periksa internet atau API Key Anda.";
        return { success: false, message: msg };
    }
};

const DEEP_LEARNING_INSTRUCTION = `
Anda adalah Pakar Kurikulum Nasional & Praktisi Deep Learning (Pembelajaran Mendalam).
Tugas Anda adalah menyusun perangkat ajar yang:
1. Berpusat pada Murid (Student-Centered). Gunakan istilah "Murid", bukan "Siswa".
2. Mengikuti siklus Deep Learning: Memahami (Understanding), Mengaplikasi (Applying), Merefleksi (Reflecting).
3. Menggunakan bahasa yang operasional, konkret, dan menggembirakan.
4. Menghasilkan output strictly valid JSON sesuai schema yang diminta.
`;

const generateWithRetry = async (
  prompt: string, 
  schema: Schema, 
  systemInstruction: string = DEEP_LEARNING_INSTRUCTION,
  model: string = 'gemini-3-flash-preview', 
  retries: number = 3
): Promise<any> => {
  const ai = getClient();
  const baseDelay = 3000; 

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          systemInstruction: systemInstruction,
          temperature: 0.7, 
          topP: 0.95,
        }
      });

      if (!response.text) {
         throw new Error("AI memberikan respons kosong.");
      }
      
      // Sanitasi response text
      let cleanText = response.text.trim();
      if (cleanText.startsWith('```json')) {
          cleanText = cleanText.replace(/^```json\n/, '').replace(/\n```$/, '');
      } else if (cleanText.startsWith('```')) {
          cleanText = cleanText.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      return JSON.parse(cleanText);

    } catch (error: any) {
      console.warn(`Attempt ${attempt + 1} failed:`, error.message);
      
      const isResourceExhausted = 
          error.message?.includes('429') || 
          error.status === 429 || 
          error.message?.includes('RESOURCE_EXHAUSTED') ||
          JSON.stringify(error).includes('RESOURCE_EXHAUSTED');

      const isNetworkError = error.message?.includes('Failed to fetch');

      if (isResourceExhausted) {
          throw new Error("Kuota API Habis (Limit Harian/Menit Tercapai). Mohon ganti API Key pribadi di menu Dashboard atau tunggu beberapa saat.");
      }

      if (isNetworkError && attempt === retries - 1) {
          throw new Error("Gagal terhubung ke Google AI (Network Error). Periksa koneksi internet Anda atau status API Key.");
      }

      if (attempt < retries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
      }
      throw error;
    }
  }
};

// --- SCHEMAS ---
// Using explicit string types if Type enum is unstable, but based on SDK it should be fine.
// We strictly follow the provided SDK format.

const LEARNING_STEP_SCHEMA: Schema = {
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

const RPP_SCHEMA: Schema = {
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
    }
  },
  required: ['identitySection', 'design', 'learningExperience', 'reflection']
};

export const generateRPP = async (schoolData: SchoolIdentity, lessonData: LessonIdentity): Promise<GeneratedLessonPlan> => {
  const availableDimensions = GRADUATE_PROFILE_DIMENSIONS.join(", ");
  
  // Extract number from string "1 Pertemuan", "2 Pertemuan" etc.
  const meetingNum = parseInt((lessonData.meetingCount || '1').split(' ')[0]) || 1;

  const prompt = `
    Susun MODUL AJAR (RPM) Lengkap berbasis Deep Learning.
    
    INFO INPUT:
    Sekolah: ${schoolData.schoolName}
    Mapel: ${lessonData.subject}
    Kelas: ${lessonData.grade}
    Topik: ${lessonData.topic}
    Tujuan Khusus: ${lessonData.objectives || "Otomatis sesuai standar kurikulum"}
    Lama Pertemuan: ${lessonData.timeAllocation}
    Jumlah Pertemuan: ${meetingNum} Pertemuan
    
    INSTRUKSI UTAMA:
    1. Dimensi Profil Murid Pancasila: Pilih minimal 2 dari [${availableDimensions}].
    2. PRAKTIK PEDAGOGIS: Pilih HANYA SATU Model/Metode Pembelajaran (Misal: PBL, Inquiry, dll). Jelaskan alasan singkat.
    3. LANGKAH PEMBELAJARAN (MICRO-STEPS ACADEMIC):
       - Array 'learningExperience' HARUS berisi persis ${meetingNum} item.
       - BAGIAN PENDAHULUAN (INTRO) WAJIB MEMILIKI MINIMAL 4-5 LANGKAH. 
         (Cakup: Salam & Doa, Cek Kehadiran, Apersepsi, Pertanyaan Pemantik, Penyampaian Tujuan).
       - BAGIAN INTI (CORE) harus detail dan operasional (jangan terlalu singkat).
       - Tiap pertemuan WAJIB memiliki siklus inti: Memahami (Understanding), Mengaplikasi (Applying), Merefleksi (Reflecting).
       - PRINSIP: Untuk field 'introPrinciple', 'corePrinciple', 'closingPrinciple', WAJIB memilih 1 atau 2 nilai dari: ["Berkesadaran", "Bermakna", "Mengembirakan"].
    4. Materi Matematika/Sains: Gunakan $...$ untuk simbol.
  `;
  
  const parsed = await generateWithRetry(prompt, RPP_SCHEMA);
  
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
    const prompt = `
      Susun MATERI AJAR yang komprehensif untuk murid.
      Mapel: ${rppData.identitySection.subject}
      Topik: ${rppData.identitySection.topic}
      Tujuan: ${rppData.design.objectives[0]}
      
      Instruksi Khusus:
      - Gunakan bahasa komunikatif untuk Murid.
      - Bagian 'konsepInti' > 'penjelasanBertahap': Jelaskan poin demi poin secara rapi.
      - Bagian 'tabelVisual': WAJIB !!! HARUS BERUPA FORMAT MARKDOWN TABLE.
        JANGAN GUNAKAN LIST/BULLET. HARUS TABEL.
        Contoh:
        | Fitur | Deskripsi |
        |-------|-----------|
        | A     | B         |
        
        Tabel ini digunakan untuk perbandingan, klasifikasi, atau rangkuman agar mudah dibaca.
    `;
    
    const MATERIALS_SCHEMA: Schema = {
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
            tabelVisual: { type: Type.STRING, description: "Strictly Markdown Table format" },
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
    
    return await generateWithRetry(prompt, MATERIALS_SCHEMA);
};

export const generateLKPD = async (rppData: GeneratedLessonPlan): Promise<LKPDData> => {
  const prompt = `
    Susun LEMBAR KERJA MURID (LKPD) yang menantang nalar kritis.
    Topik: ${rppData.identitySection.topic}
    Fase: ${rppData.identitySection.grade}
    
    Kriteria Aktivitas:
    - Level 1: Mengingat & Menemukan Informasi.
    - Level 2: Eksplorasi & Kolaborasi Kelompok.
    - Level 3: Kreasi & Refleksi Mandiri.
    
    INSTRUKSI WAJIB (STRICT):
    - SALAH SATU Aktivitas (Level 1, Level 2, atau Level 3) HARUS berisi instruksi pengisian TABEL PENGAMATAN/ANALISIS.
    - Sediakan kerangka TABEL KOSONG (Format Markdown Table) di dalam teks aktivitas tersebut agar siswa bisa mengisinya.
      Contoh output di dalam string:
      "Lakukan pengamatan lalu isi tabel berikut:\n\n| No | Objek | Hasil |\n|----|-------|-------|\n| 1  | ...   | ...   |\n| 2  | ...   | ...   |"
  `;
  
  const LKPD_SCHEMA: Schema = {
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
  
  return await generateWithRetry(prompt, LKPD_SCHEMA);
};

export const generateAssessment = async (rppData: GeneratedLessonPlan): Promise<DeepLearningAssessment> => {
  const prompt = `
    Susun INSTRUMEN ASESMEN lengkap berbasis Deep Learning.
    Tujuan Utama: ${rppData.design.objectives.join(", ")}
    
    Wajib ada:
    1. KKTP (Rubrik deskriptif).
    2. Checklist observasi formatif selama proses.
    3. Kisi-kisi sumatif (Indikator soal, Level Kognitif).
  `;
  
  const ASSESSMENT_SCHEMA: Schema = {
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
  
  return await generateWithRetry(prompt, ASSESSMENT_SCHEMA);
};

export const generateQuestionBank = async (rppData: GeneratedLessonPlan, config: QuestionBankConfig): Promise<QuestionBankData> => {
  const prompt = `
    Buat BANK SOAL Variatif.
    Jumlah: ${config.count} butir soal.
    Kognitif: ${config.level}
    Tipe: ${config.types.join(', ')}
    Materi: ${rppData.identitySection.topic}
    
    Aturan:
    - Berikan kunci jawaban yang jelas.
    - Soal HOTS harus disertai stimulus (teks/data/gambar deskriptif).
  `;
  
  const QUESTION_BANK_SCHEMA: Schema = {
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
  
  return await generateWithRetry(prompt, QUESTION_BANK_SCHEMA);
};
