
import { GoogleGenAI, Type } from "@google/genai";
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, LKPDData, AssessmentItem, KKTPItem, QuestionBankConfig, QuestionBankData, MaterialsData, DeepLearningAssessment } from '../types';
import { GRADUATE_PROFILE_DIMENSIONS } from '../constants';

// Helper to get client with priority: LocalStorage > Env Var
const getClient = () => {
  const customKey = localStorage.getItem('custom_api_key');
  const envKey = process.env.API_KEY;
  
  const apiKey = customKey || envKey;

  if (!apiKey) {
    throw new Error("API Key tidak ditemukan. Harap set API Key di pengaturan atau hubungi admin.");
  }
  return new GoogleGenAI({ apiKey: apiKey });
};

// Validasi Koneksi API Key (Updated to return detailed error)
export const validateApiKey = async (apiKey: string): Promise<{ success: boolean; message: string }> => {
    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        // Gunakan model paling ringan dan stabil untuk testing
        await ai.models.generateContent({
            model: 'gemini-1.5-flash', 
            contents: 'Test connection',
        });
        return { success: true, message: "Koneksi Berhasil" };
    } catch (error: any) {
        console.error("API Key Validation Failed:", error);
        
        let msg = error.message || "Gagal menghubungi server AI.";
        
        // Terjemahkan Error Umum Google Gemini
        if (msg.includes("403") || msg.includes("permission")) {
            msg = "Akses Ditolak (403). Cek 'API Restrictions' di Google Cloud Console. Pastikan domain vercel.app diizinkan atau matikan restriction sementara.";
        } else if (msg.includes("400") || msg.includes("INVALID_ARGUMENT")) {
            msg = "API Key Tidak Valid (400). Pastikan tidak ada spasi saat copy-paste.";
        } else if (msg.includes("429") || msg.includes("quota")) {
            msg = "Kuota Habis (429). Limit penggunaan API Key ini telah tercapai.";
        } else if (msg.includes("API key not valid")) {
            msg = "API Key Salah. Periksa kembali karakter key Anda.";
        }

        return { success: false, message: msg };
    }
};

// ------------------------------------
// HELPER: RETRY LOGIC FOR 429 ERRORS
// ------------------------------------
const generateWithRetry = async (
  prompt: string, 
  schema: any, 
  // UBAH DEFAULT KE 1.5-flash AGAR LEBIH STABIL & HEMAT KUOTA
  model: string = 'gemini-1.5-flash',
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
        error.message?.toLowerCase().includes('exhausted') ||
        error.message?.toLowerCase().includes('quota') ||
        error.message?.includes('FetchError') ||
        error.message?.includes('Failed to fetch');

      if (isRateLimit) {
        if (attempt < retries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          console.warn(`Rate limit terdeteksi. Mencoba lagi dalam ${delay/1000} detik...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else {
          throw new Error("Server sedang sibuk (Limit Kuota Tercapai). Mohon tunggu 1-2 menit sebelum mencoba lagi, atau gunakan API Key Sendiri di menu Profil.");
        }
      }
      
      // Jika error 404 (Model not found), coba fallback ke 1.5-pro
      if (error.message?.includes('404') || error.message?.includes('not found')) {
          console.warn("Model not found, retrying with fallback model...");
          try {
               const fallbackResponse = await ai.models.generateContent({
                    model: 'gemini-1.5-pro',
                    contents: prompt,
                    config: { responseMimeType: "application/json", responseSchema: schema }
               });
               return JSON.parse(fallbackResponse.text || "{}");
          } catch (e) {
              throw error; // Throw original error if fallback fails
          }
      }

      throw error;
    }
  }
};

// ------------------------------------
// CONTEXT AWARENESS (RAG)
// ------------------------------------
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
    
    // MODIFIED: Strict Array of Strings for Graduate Profile
    graduateProfile: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING },
        description: "List of selected graduate profile dimensions (2-3 items only, no explanation)." 
    },
    
    design: {
      type: Type.OBJECT,
      properties: {
        objectives: { type: Type.ARRAY, items: { type: Type.STRING } },
        pedagogicalPractice: { type: Type.STRING, description: "Sebutkan Model/Metode Pembelajaran, lalu berikan penjelasan singkat mengapa metode ini dipilih." },
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
        tabelVisual: { type: Type.STRING, description: "JANGAN GUNAKAN TABEL MARKDOWN. Gunakan Format LIST (Bullet Points) atau Deskripsi Poin agar tampilan rapi." },
        contohKonkret: { type: Type.STRING }
      },
      required: ['definisi', 'penjelasanBertahap', 'tabelVisual', 'contohKonkret']
    },
    trivia: { type: Type.STRING },
    glosarium: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          istilah: { type: Type.STRING },
          definisi: { type: Type.STRING }
        },
        required: ['istilah', 'definisi']
      }
    }
  },
  required: ['judul', 'pemantik', 'subTopik', 'konsepInti', 'trivia', 'glosarium']
};

const LKPD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Judul kegiatan saja, tanpa kata LKPD/Lembar Kerja." },
    objectives: { type: Type.STRING },
    instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
    stimulus: { type: Type.STRING },
    activities: {
      type: Type.OBJECT,
      properties: {
        level1: { type: Type.STRING, description: "HARUS BERISI TABEL MARKDOWN dengan kolom kosong." },
        level2: { type: Type.STRING, description: "HARUS BERISI TABEL MARKDOWN dengan kolom kosong." },
        level3: { type: Type.STRING, description: "Soal Uraian / Diskusi" }
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
                    properties: {
                        aspect: { type: Type.STRING },
                        indicator: { type: Type.STRING }
                    },
                    required: ['aspect', 'indicator']
                }
            },
            feedbackGuide: {
                type: Type.OBJECT,
                properties: {
                    clarification: { type: Type.STRING },
                    appreciation: { type: Type.STRING },
                    suggestion: { type: Type.STRING }
                },
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
                    properties: {
                        indicator: { type: Type.STRING },
                        level: { type: Type.STRING },
                        technique: { type: Type.STRING }
                    },
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
                  properties: {
                      left: { type: Type.STRING },
                      right: { type: Type.STRING }
                  }
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

// ------------------------------------
// GENERATION FUNCTIONS
// ------------------------------------

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

    INSTRUKSI KHUSUS "DIMENSI PROFIL LULUSAN":
    - Pilih SECARA OTOMATIS **minimal 2 dan maksimal 3** Dimensi yang paling relevan dengan topik ini dari daftar berikut: [${availableDimensions}].
    - Output di JSON harus berupa Array String yang HANYA berisi nama dimensinya saja.
    - DILARANG memberikan penjelasan atau deskripsi untuk dimensi tersebut. HANYA NAMA.
    
    INSTRUKSI LAIN:
    - Di bagian 'pedagogicalPractice', sebutkan Model/Metode Pembelajaran yang dipilih secara spesifik, lalu berikan penjelasan singkat mengapa metode ini dipilih untuk topik tersebut.
    
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
  
  // Use AI generated dimensions if lessonData doesn't have specific override, or blend them
  // The prompt ensures AI picks 2-3 relevant ones.
  // If user selected manually in UI, lessonData.graduateProfileDimensions might have value.
  // Logic: If User selected > 0, use User's. Else use AI's.
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
    const context = `Topik: ${rppData.identitySection.topic}, Tujuan: ${rppData.design.objectives.join(', ')}`;
    const prompt = `
    Susun Materi Ajar Deep Learning.
    ${context}
    ATURAN: Bahasa anak sesuai jenjang ${rppData.identitySection.grade}, Singkat & Padat.
    Isi: Judul, Pemantik, Sub Topik, Konsep Inti (Definisi, Penjelasan Bertahap, Tabel Visual, Contoh), Trivia, Glosarium.
    
    Untuk 'tabelVisual': JANGAN GUNAKAN TABEL MARKDOWN jika isinya teks panjang. Gunakan Format LIST (Bullet Points) atau Deskripsi Poin agar tampilan rapi di Mobile/Word.
    Output JSON.
    `;
    return await generateWithRetry(prompt, MATERIALS_SCHEMA);
};

export const generateLKPD = async (rppData: GeneratedLessonPlan): Promise<LKPDData> => {
  const objectivesContext = rppData.design.objectives.join("; ");
  const prompt = `
  Anda adalah Spesialis Desain Instruksional.
  Tugas: Buat Lembar Kerja Murid (LKPD) Akademik.
  
  KONTEKS:
  - Topik: ${rppData.identitySection.topic}
  - Jenjang: ${rppData.identitySection.grade}
  
  ATURAN KRUSIAL (WAJIB DIPATUHI):
  1. Judul: Tuliskan JUDUL KEGIATANNYA SAJA secara spesifik (Contoh: "Eksperimen Hukum Newton", "Analisis Teks Prosedur"). JANGAN tulis kata "Lembar Kerja Peserta Didik" atau "LKPD".
  2. **AKTIVITAS BERBASIS TABEL**: Untuk Aktivitas 1 dan 2, Anda HARUS menyajikan output dalam format TABEL MARKDOWN.
  3. **KOLOM KOSONG**: Pastikan ada kolom jawaban yang KOSONG untuk diisi murid.
  4. **FALLBACK**: Jika Tabel tidak memungkinkan, gunakan format ISIAN SINGKAT (Titik-titik). JANGAN GUNAKAN format Paragraf Narasi.

  INSTRUKSI STRUKTUR:
  1. Judul & Tujuan Formal.
  2. Stimulus Data/Gambar.
  3. **Aktivitas 1 (Dasar)**: 
     - Berikan instruksi.
     - **WAJIB**: Buat TABEL MARKDOWN dengan kolom [No, Aspek/Objek, Temuan/Jawaban (Biarkan Kosong)].
  4. **Aktivitas 2 (Aplikasi)**:
     - Berikan instruksi.
     - **WAJIB**: Buat TABEL MARKDOWN Perbandingan atau Klasifikasi dengan sel kosong.
  5. **Aktivitas 3 (HOTS)**:
     - Soal Essay / Studi Kasus.
  
  Hasilkan JSON Sesuai Schema LKPD.
  `;
  return await generateWithRetry(prompt, LKPD_SCHEMA);
};

export const generateAssessment = async (rppData: GeneratedLessonPlan): Promise<DeepLearningAssessment> => {
  const prompt = `
  Tugas: Menyusun instrumen asesmen (KKTP, Formatif, Sumatif).
  Topik: ${rppData.identitySection.topic}. Jenjang: ${rppData.identitySection.grade}.
  1. KKTP: Rubrik Bloom (Perlu Bimbingan s/d Sangat Baik).
  2. Formatif: Checklist Observasi & Feedback Ladder.
  3. Sumatif: Kisi-Kisi Soal (Grid).
  4. Intervensi: Strategi tindak lanjut.
  Hasilkan JSON sesuai schema.
  `;
  return await generateWithRetry(prompt, ASSESSMENT_SCHEMA);
};

export const generateQuestionBank = async (rppData: GeneratedLessonPlan, config: QuestionBankConfig): Promise<QuestionBankData> => {
  const context = `TOPIK: ${rppData.identitySection.topic}, JENJANG: ${rppData.identitySection.grade}`;
  const typesList = config.types.join(', ');
  const prompt = `
    Buat Bank Soal. Jumlah: ${config.count}. Level: ${config.level}. Tipe: ${typesList}.
    ${context}
    Setiap soal WAJIB ada STIMULUS (Narasi/Data) yang relevan.
    Output JSON sesuai schema.
  `;
  return await generateWithRetry(prompt, QUESTION_BANK_SCHEMA);
};
