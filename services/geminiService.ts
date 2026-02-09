
import { GoogleGenAI, Type } from "@google/genai";
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, LKPDData, QuestionBankConfig, QuestionBankData, MaterialsData, DeepLearningAssessment } from '../types';
import { tokenManager } from "./tokenManager";
import { supabase } from "../lib/supabaseClient";

/**
 * Model Priority Strategy:
 * 1. 'gemini-3-flash-preview': Cerdas & Cepat (Primary).
 * 2. 'gemini-2.5-flash': Sangat Cepat & Stabil.
 * 3. 'gemini-flash-latest': Fallback Umum.
 */
const MODEL_PRIORITY = [
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-flash-latest'
];

const CACHE_PREFIX = 'pakar_ai_v5_direct_'; // Versi cache local
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Jam

const cleanApiKey = (key: string | null | undefined): string => {
  if (!key) return "";
  return String(key).trim().replace(/[\r\n"']/g, '');
};

// --- CLIENT-SIDE CACHE UTILS ---

const generateHash = async (str: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const getLocalCache = (key: string): any | null => {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (!raw) return null;
        
        const { data, expiry } = JSON.parse(raw);
        if (Date.now() > expiry) {
            localStorage.removeItem(CACHE_PREFIX + key);
            return null;
        }
        return data;
    } catch (e) {
        return null;
    }
};

const setLocalCache = (key: string, data: any) => {
    try {
        if (!data) return;
        const payload = JSON.stringify({
            data: data,
            expiry: Date.now() + CACHE_TTL_MS
        });
        localStorage.setItem(CACHE_PREFIX + key, payload);
    } catch (e) {
        console.warn("Cache storage full", e);
    }
};

// --- GLOBAL SUPABASE CACHE UTILS (SYSTEM KEY ONLY) ---
// Tabel 'global_cache' harus dibuat di Supabase: (hash text PK, response jsonb, created_at timestamp)
const getGlobalCache = async (hash: string): Promise<any | null> => {
    try {
        const { data, error } = await supabase
            .from('global_cache')
            .select('response')
            .eq('hash', hash)
            .single();
        
        if (error || !data) return null;
        return data.response;
    } catch (error) {
        return null; // Fail silent jika tabel tidak ada
    }
};

const saveGlobalCache = async (hash: string, response: any) => {
    try {
        // Fire and forget, jangan await blocking terlalu lama
        supabase.from('global_cache').upsert({ 
            hash: hash, 
            response: response,
            created_at: new Date().toISOString()
        }).then(({ error }) => {
            if (error) console.warn("Failed to save global cache (Table might be missing)", error.message);
        });
    } catch (error) {
        // Ignore
    }
};

// --- RETRY LOGIC ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const runWithRetry = async (fn: () => Promise<any>, retries = 3, label = "Operation"): Promise<any> => {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            console.warn(`[${label}] Attempt ${i + 1} failed: ${error.message}`);
            
            // Critical Auth Error: Jangan retry, langsung lempar keluar
            if (String(error).includes("API key not valid") || String(error).includes("key expired")) {
                throw error;
            }

            if (i < retries - 1) {
                await sleep(1000 * Math.pow(2, i));
            }
        }
    }
    throw lastError;
};

// Validasi API Key User
export const validateApiKey = async (rawApiKey: string): Promise<{ success: boolean; message: string }> => {
    const apiKey = cleanApiKey(rawApiKey);
    if (!apiKey) return { success: false, message: "API Key kosong." };

    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const modelToTest = 'gemini-flash-latest';
        
        const response = await ai.models.generateContent({
            model: modelToTest, 
            contents: "Tes koneksi.", 
        });

        if (response && response.text) {
             return { success: true, message: `✅ Koneksi Berhasil!` };
        }
        return { success: false, message: "❌ Tidak ada respon." };

    } catch (error: any) {
        return { success: false, message: `❌ Gagal: ${error.message || "Key tidak valid"}` };
    }
};

// --- CORE GENERATION LOGIC ---
const tryGenerate = async (systemInstruction: string, userPrompt: string, responseSchema: any): Promise<any> => {
    
    // 0. Identifikasi Key & Mode
    const userKey = cleanApiKey(tokenManager.getKey());
    const systemKey = cleanApiKey(process.env.API_KEY);
    
    // Jika user punya key sendiri, pakai itu. Jika tidak, pakai system key.
    const isUserCustomKey = !!userKey; 
    const apiKey = isUserCustomKey ? userKey : systemKey;

    if (!apiKey) {
        throw new Error("API Key Kosong. Silakan masukkan API Key Google AI Studio Anda di menu Dashboard.");
    }

    // 1. Generate Hash untuk Cache Key
    const signature = userPrompt + JSON.stringify(responseSchema) + systemInstruction;
    const cacheKey = await generateHash(signature);

    // 2. Cek LOCAL Cache (Browser) - Berlaku untuk semua mode (Cepat)
    const localData = getLocalCache(cacheKey);
    if (localData) {
        console.log("[Cache] Hit from Browser LocalStorage");
        return localData;
    }

    // 3. Cek GLOBAL Cache (Supabase) - HANYA JIKA MENGGUNAKAN SYSTEM KEY
    // Alasan: Key user bersifat privat, hasilnya mungkin mengandung data sensitif/spesifik yang tidak boleh dishare.
    // Key System adalah public/shared resource, jadi kita bisa share hasil generatenya untuk hemat kuota.
    if (!isUserCustomKey) {
        const globalData = await getGlobalCache(cacheKey);
        if (globalData) {
            console.log("[Cache] Hit from Supabase Global");
            setLocalCache(cacheKey, globalData); // Simpan ke local juga biar next time lebih cepat
            return globalData;
        }
    }

    // 4. Generate AI (Direct Call)
    const client = new GoogleGenAI({ apiKey: apiKey });
    let lastError = null;
    let finalResult = null;

    for (const model of MODEL_PRIORITY) {
        try {
            console.log(`[Direct-AI] Generating with ${model} using ${isUserCustomKey ? 'USER' : 'SYSTEM'} Key...`);
            
            finalResult = await runWithRetry(async () => {
                const response = await client.models.generateContent({
                    model: model,
                    contents: userPrompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: responseSchema,
                        systemInstruction: systemInstruction,
                        temperature: 0.7,
                    }
                });
                
                let parsedData;
                try {
                    parsedData = JSON.parse(response.text || "{}");
                } catch (e) {
                    throw new Error("Format respon AI tidak valid JSON.");
                }
                
                if (Object.keys(parsedData).length === 0) throw new Error("Respon AI kosong.");
                return parsedData;
            }, 2, `Gen-${model}`);

            // Berhasil generate, keluar loop
            break; 

        } catch (error: any) {
            console.warn(`[Direct-AI] Model ${model} failed:`, error.message);
            lastError = error;
            
            const errStr = String(error);
            if (errStr.includes("API key not valid") || errStr.includes("key expired") || errStr.includes("API_KEY_INVALID")) {
                throw new Error("API Key Tidak Valid. Silakan periksa atau ganti API Key di Dashboard.");
            }
        }
    }

    if (!finalResult) {
        throw new Error(`Gagal Generate (Semua Model Sibuk/Limit): ${lastError?.message || "Silakan coba lagi nanti."}`);
    }

    // 5. Simpan Cache
    
    // A. Simpan ke Local (Browser) - Selalu
    setLocalCache(cacheKey, finalResult);

    // B. Simpan ke Global (Supabase) - HANYA JIKA SYSTEM KEY
    if (!isUserCustomKey) {
        // Async non-blocking save
        saveGlobalCache(cacheKey, finalResult);
    }

    return finalResult;
};

// --- HELPER PROMPTING ---

const getComplexityInstruction = (grade: string): string => {
    const g = grade.toLowerCase();
    if (g.includes('fase f') || g.includes('xii') || g.includes('xi')) return "TINGKAT KOMPLEKSITAS: TINGGI (High School / Advanced). Analisis mendalam, HOTS Level C4-C6.";
    if (g.includes('fase e') || g.includes('kelas x')) return "TINGKAT KOMPLEKSITAS: MENENGAH-TINGGI (High School). Pemahaman konsep abstrak.";
    if (g.includes('fase d') || g.includes('smp')) return "TINGKAT KOMPLEKSITAS: MENENGAH (Middle School). Bahasa lugas, eksplorasi konsep.";
    if (g.includes('sd') || g.includes('fase a') || g.includes('fase b') || g.includes('fase c')) return "TINGKAT KOMPLEKSITAS: DASAR (Elementary). Konkret, sederhana, ramah anak.";
    return "TINGKAT KOMPLEKSITAS: Sesuaikan dengan jenjang.";
};

const DEEP_LEARNING_INSTRUCTION = `
Anda adalah Pakar Kurikulum & Deep Learning.
Gunakan kata "Murid". Jangan gunakan LaTeX ($..$) untuk teks biasa, hanya untuk rumus kompleks.
Output wajib JSON valid sesuai Schema.
`;

const ASSESSMENT_INSTRUCTION = `
Anda adalah Pakar Penilaian & Deep Learning.
Buat Rubrik KKTP, Asesmen Formatif (Checklist & Feedback), Sumatif, dan Intervensi.
Output wajib JSON valid.
`;

// --- EXPORTED FUNCTIONS ---

export const generateRPP = async (school: SchoolIdentity, lesson: LessonIdentity): Promise<GeneratedLessonPlan> => {
  const complexity = getComplexityInstruction(lesson.grade);
  const prompt = `
    BUAT MODUL AJAR KURIKULUM MERDEKA.
    Mapel: ${lesson.subject}, Kelas: ${lesson.grade}, Topik: ${lesson.topic}
    Tujuan: ${lesson.objectives}
    Waktu: ${lesson.timeAllocation}, Pertemuan: ${lesson.meetingCount}
    
    DETAIL:
    - Model: ${lesson.pedagogicalPractice}
    - Asesmen Awal: ${lesson.initialAssessment}
    
    ATURAN PROFIL LULUSAN (Deep Learning):
    Input User: ${lesson.graduateProfileDimensions.length > 0 ? lesson.graduateProfileDimensions.join(', ') : "Tentukan otomatis oleh AI"}
    
    ATURAN STRICT PROFIL LULUSAN:
    Pilih minimal 2 sampai 4 dimensi profil lulusan.
    WAJIB dipilih HANYA dari 8 dimensi berikut ini (Jangan buat dimensi baru):
    1. Keimanan dan Ketaqwaan terhadap Tuhan YME
    2. Kewargaan
    3. Penalaran Kritis
    4. Kreativitas
    5. Kolaborasi
    6. Kemandirian
    7. Kesehatan
    8. Komunikasi
    
    ATURAN STRICT PRINSIP PEMBELAJARAN (DEEP LEARNING):
    Untuk field 'introPrinciple', 'corePrinciple', dan 'closingPrinciple', Anda WAJIB mengikuti aturan ini:
    1. HANYA BOLEH menggunakan kata kunci: "Berkesadaran", "Bermakna", "Mengembirakan".
    2. Pilih minimal 1 kata, maksimal 2 kata untuk setiap prinsip.
    3. Jika memilih 2 kata, gabungkan dengan kata "dan".
    4. DILARANG membuat kalimat deskriptif atau menggunakan kata lain.
    
    Contoh Output Valid:
    - "Berkesadaran"
    - "Bermakna"
    - "Mengembirakan"
    - "Berkesadaran dan Bermakna"
    - "Bermakna dan Mengembirakan"
    
    ${complexity}

    INSTRUKSI:
    Rincikan langkah pembelajaran (Pendahuluan, Inti, Penutup) untuk SETIAP PERTEMUAN (${lesson.meetingCount}).
    Kegiatan Inti WAJIB alur: Memahami -> Mengaplikasi -> Merefleksi.
  `;

  const schema = {
    type: Type.OBJECT,
    properties: {
      identitySection: { type: Type.OBJECT, properties: { schoolName: {type: Type.STRING}, subject: {type: Type.STRING}, grade: {type: Type.STRING}, semester: {type: Type.STRING}, timeAllocation: {type: Type.STRING}, meetingCount: {type: Type.STRING}, topic: {type: Type.STRING} } },
      initialAssessment: { type: Type.STRING },
      graduateProfile: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "Array of strings containing 2 to 4 selected graduate profile dimensions." 
      },
      design: { type: Type.OBJECT, properties: { objectives: { type: Type.ARRAY, items: { type: Type.STRING } }, pedagogicalPractice: { type: Type.STRING }, partnership: { type: Type.STRING }, environment: { type: Type.STRING }, digital: { type: Type.STRING } } },
      learningExperience: { 
          type: Type.ARRAY, 
          items: { 
              type: Type.OBJECT, 
              properties: { 
                  meetingNo: { type: Type.INTEGER },
                  intro: { type: Type.ARRAY, items: { type: Type.STRING } },
                  introPrinciple: { type: Type.STRING, description: "Must be 'Berkesadaran', 'Bermakna', 'Mengembirakan', or a combination of two with 'dan'." },
                  core: { 
                      type: Type.OBJECT, 
                      properties: {
                          memahami: { type: Type.ARRAY, items: { type: Type.STRING } },
                          mengaplikasi: { type: Type.ARRAY, items: { type: Type.STRING } },
                          merefleksi: { type: Type.ARRAY, items: { type: Type.STRING } }
                      }
                  },
                  corePrinciple: { type: Type.STRING, description: "Must be 'Berkesadaran', 'Bermakna', 'Mengembirakan', or a combination of two with 'dan'." },
                  closing: { type: Type.ARRAY, items: { type: Type.STRING } },
                  closingPrinciple: { type: Type.STRING, description: "Must be 'Berkesadaran', 'Bermakna', 'Mengembirakan', or a combination of two with 'dan'." }
              } 
          } 
      },
      reflection: { type: Type.OBJECT, properties: { teacher: { type: Type.ARRAY, items: { type: Type.STRING } }, student: { type: Type.ARRAY, items: { type: Type.STRING } } } },
      approval: { type: Type.OBJECT, properties: { location: { type: Type.STRING }, date: { type: Type.STRING }, authorName: { type: Type.STRING }, authorNip: { type: Type.STRING }, principalName: { type: Type.STRING }, principalNip: { type: Type.STRING } } }
    },
    required: ["identitySection", "design", "learningExperience", "graduateProfile"]
  };

  const result = await tryGenerate(DEEP_LEARNING_INSTRUCTION, prompt, schema);
  
  return {
      ...result,
      identitySection: {
          ...result.identitySection,
          schoolName: school.schoolName,
          subject: lesson.subject,
          grade: lesson.grade,
          semester: lesson.semester,
          timeAllocation: lesson.timeAllocation,
          meetingCount: lesson.meetingCount,
          topic: lesson.topic
      },
      approval: {
          location: school.location,
          date: school.date,
          authorName: school.authorName,
          authorNip: school.authorNip,
          principalName: school.principalName,
          principalNip: school.principalNip
      }
  };
};

export const generateAssessment = async (data: GeneratedLessonPlan): Promise<DeepLearningAssessment> => {
    const prompt = `Buat instrumen asesmen lengkap untuk topik: ${data.identitySection.topic} (${data.identitySection.grade}). Komponen: KKTP (4 Level), Formatif (Checklist & Feedback), Sumatif (Kisi-kisi), Intervensi.`;
    const schema = {
        type: Type.OBJECT,
        properties: {
            kktp: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { criteria: { type: Type.STRING }, needsGuidance: { type: Type.STRING }, basic: { type: Type.STRING }, proficient: { type: Type.STRING }, advanced: { type: Type.STRING } } } },
            formative: { type: Type.OBJECT, properties: { checklist: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { aspect: { type: Type.STRING }, indicator: { type: Type.STRING } } } }, feedbackGuide: { type: Type.OBJECT, properties: { clarification: { type: Type.STRING }, appreciation: { type: Type.STRING }, suggestion: { type: Type.STRING } } } } },
            summative: { type: Type.OBJECT, properties: { grid: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { indicator: { type: Type.STRING }, level: { type: Type.STRING }, technique: { type: Type.STRING } } } } } },
            intervention: { type: Type.OBJECT, properties: { needsGuidance: { type: Type.STRING }, basic: { type: Type.STRING }, proficient: { type: Type.STRING }, advanced: { type: Type.STRING } } }
        }
    };
    return await tryGenerate(ASSESSMENT_INSTRUCTION, prompt, schema);
};

export const generateMaterials = async (data: GeneratedLessonPlan): Promise<MaterialsData> => {
    const prompt = `Buat Materi Ajar: Judul, Pemantik, Konsep Inti (Definisi, Uraian, Tabel Visual), Trivia, Glosarium. Topik: ${data.identitySection.topic}`;
    const schema = {
        type: Type.OBJECT,
        properties: {
            judul: { type: Type.STRING },
            pemantik: { type: Type.STRING },
            subTopik: { type: Type.ARRAY, items: { type: Type.STRING } },
            konsepInti: { type: Type.OBJECT, properties: { definisi: { type: Type.STRING }, penjelasanBertahap: { type: Type.ARRAY, items: { type: Type.STRING } }, tabelVisual: { type: Type.STRING }, contohKonkret: { type: Type.STRING } } },
            trivia: { type: Type.STRING },
            glosarium: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { istilah: { type: Type.STRING }, definisi: { type: Type.STRING } } } }
        }
    };
    return await tryGenerate(DEEP_LEARNING_INSTRUCTION, prompt, schema);
};

export const generateLKPD = async (data: GeneratedLessonPlan): Promise<LKPDData> => {
    const prompt = `Buat LKPD: Judul, Tujuan, Petunjuk, Stimulus, Aktivitas 1 (Pemahaman), Aktivitas 2 (Aplikasi), Refleksi. Topik: ${data.identitySection.topic}`;
    const schema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            objectives: { type: Type.STRING },
            instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
            stimulus: { type: Type.STRING },
            activities: { type: Type.OBJECT, properties: { activity1: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, content: { type: Type.STRING } } }, activity2: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, content: { type: Type.STRING } } } } },
            reflection: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
    };
    return await tryGenerate(DEEP_LEARNING_INSTRUCTION, prompt, schema);
};

export const generateQuestionBank = async (data: GeneratedLessonPlan, config: QuestionBankConfig): Promise<QuestionBankData> => {
    const contextSource = data.materials?.subTopik ? `Subtopik: ${data.materials.subTopik.join(', ')}` : `Tujuan: ${data.design.objectives.join(', ')}`;
    const prompt = `Buat ${config.count} Soal Evaluasi. Tipe: ${config.types.join(', ')}. Level: ${config.level}. Konteks: ${contextSource}. Topik: ${data.identitySection.topic}.`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            items: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        number: { type: Type.INTEGER },
                        type: { type: Type.STRING },
                        stimulus: { type: Type.STRING, nullable: true },
                        question: { type: Type.STRING },
                        options: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
                        matchingPairs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { left: { type: Type.STRING }, right: { type: Type.STRING } } }, nullable: true },
                        answerKey: { type: Type.STRING }
                    },
                    required: ["type", "question", "answerKey"]
                }
            }
        }
    };

    const result = await tryGenerate(DEEP_LEARNING_INSTRUCTION, prompt, schema);
    
    // Filter & Validasi Server-Side
    if (result && result.items) {
        const allowedTypes = new Set(config.types);
        result.items = result.items.filter((q: any) => allowedTypes.has(q.type));
    }

    return result;
};
