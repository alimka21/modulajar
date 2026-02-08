
import { GoogleGenAI, Type } from "@google/genai";
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, LKPDData, QuestionBankConfig, QuestionBankData, MaterialsData, DeepLearningAssessment } from '../types';
import { tokenManager } from "./tokenManager";
import { supabase } from "../lib/supabaseClient";

/**
 * Model Priority Strategy:
 * 1. 'gemini-3-flash-preview': Cerdas & Cepat (Primary).
 * 2. 'gemini-flash-latest': Fallback Super Cepat.
 * 3. 'gemini-3-pro-preview': Penalaran Kompleks (Backup).
 */
const MODEL_PRIORITY = [
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-3-pro-preview',
  'gemini-2.5-flash'
];

const CACHE_PREFIX = 'pakar_ai_v4_'; // Naikkan versi cache untuk invalidasi data lama
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Jam Client Cache TTL

const cleanApiKey = (key: string | null | undefined): string => {
  if (!key) return "";
  return String(key).trim().replace(/[\r\n"']/g, '');
};

// --- CLIENT-SIDE CACHE UTILS (L1 CACHE) ---

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
        
        console.log(`[L1 Local] HIT: ${key.substring(0, 8)}...`);
        return data;
    } catch (e) {
        return null;
    }
};

const setLocalCache = (key: string, data: any) => {
    try {
        if (!data) return; // Jangan simpan data kosong
        const payload = JSON.stringify({
            data: data,
            expiry: Date.now() + CACHE_TTL_MS
        });
        localStorage.setItem(CACHE_PREFIX + key, payload);
    } catch (e) {
        console.warn("[L1 Local] Failed to save (Storage Full):", e);
    }
};

// --- RETRY LOGIC (EXPONENTIAL BACKOFF) ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const runWithRetry = async (fn: () => Promise<any>, retries = 3, label = "Operation"): Promise<any> => {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            console.warn(`[${label}] Attempt ${i + 1} failed: ${error.message}`);
            
            // Jangan retry jika error Authentication (403/401) atau Rate Limit serius
            if (String(error).includes("403") || String(error).includes("API key") || String(error).includes("Unauthorized")) {
                throw error;
            }

            if (i < retries - 1) {
                const waitTime = 1000 * Math.pow(2, i); // 1s, 2s, 4s
                await sleep(waitTime);
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
        
        const fetchPromise = ai.models.generateContent({
            model: modelToTest, 
            contents: "Tes koneksi server.", 
        });

        const TIMEOUT_MS = 10000;
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout (${TIMEOUT_MS}ms)`)), TIMEOUT_MS)
        );

        const response: any = await Promise.race([fetchPromise, timeoutPromise]);

        if (response && response.text) {
             return { success: true, message: `✅ Koneksi Berhasil!` };
        }
        return { success: false, message: "❌ Tidak ada respon teks dari server AI." };

    } catch (error: any) {
        console.error("[Validation Error]", error);
        return { success: false, message: `❌ Gagal: ${error.message || "Key tidak valid"}` };
    }
};

// --- CORE GENERATION LOGIC ---
const tryGenerate = async (systemInstruction: string, userPrompt: string, responseSchema: any): Promise<any> => {
    
    // 1. Generate Hash Key
    const signature = userPrompt + JSON.stringify(responseSchema) + systemInstruction;
    const cacheKey = await generateHash(signature);

    // 2. Cek L1 Cache (LocalStorage)
    const localData = getLocalCache(cacheKey);
    if (localData) return localData;

    // 3. Tentukan Mode
    const userApiKey = cleanApiKey(tokenManager.getKey());
    
    // ==========================================
    // JALUR 1: DIRECT MODE (USER KEY)
    // ==========================================
    if (userApiKey) {
        const client = new GoogleGenAI({ apiKey: userApiKey });
        let lastError = null;

        for (const model of MODEL_PRIORITY) {
            try {
                console.log(`[Direct-AI] Attempting ${model}...`);
                
                const result = await runWithRetry(async () => {
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
                        console.warn("JSON Parse Error (Direct)", response.text);
                        throw new Error("Respon AI tidak valid JSON.");
                    }
                    
                    // Basic Validation: Jika object kosong, anggap gagal
                    if (Object.keys(parsedData).length === 0) throw new Error("Respon AI kosong.");
                    
                    return parsedData;
                }, 3, `Direct-${model}`);

                setLocalCache(cacheKey, result);
                return result;

            } catch (error: any) {
                console.warn(`[Direct-AI] Model ${model} failed.`);
                lastError = error;
                if (String(error).includes("403") || String(error).includes("API key")) {
                    throw new Error("API Key pribadi Anda ditolak oleh Google. Periksa quota atau validitas key.");
                }
            }
        }
        throw new Error(`Gagal generate (Direct). ${lastError?.message || "Server sibuk."}`);
    }

    // ==========================================
    // JALUR 2: PROXY MODE (SYSTEM KEY)
    // ==========================================
    let proxyError = null;
    
    for (const model of MODEL_PRIORITY) {
        try {
            console.log(`[Proxy-AI] Requesting via Supabase (${model})...`);
            
            const result = await runWithRetry(async () => {
                const { data, error } = await supabase.functions.invoke('gemini-proxy', {
                    body: {
                        model: model,
                        prompt: userPrompt,
                        systemInstruction: systemInstruction,
                        schema: responseSchema,
                        config: { temperature: 0.7 }
                    }
                });

                if (error) {
                    console.error("[Proxy-AI] Supabase Error:", error);
                    throw new Error(error.message || "Gagal menghubungi Proxy Server.");
                }
                
                if (data && data.error) {
                    console.error("[Proxy-AI] Functional Error:", data.error);
                    throw new Error(data.error);
                }

                if (!data) {
                    throw new Error("Proxy mengembalikan data kosong.");
                }
                
                return data;
            }, 2, `Proxy-${model}`);

            // Validasi hasil
            if (result && Object.keys(result).length > 0) {
                setLocalCache(cacheKey, result);
                return result;
            } else {
                throw new Error("Hasil dari Proxy kosong (Invalid JSON).");
            }

        } catch (err: any) {
            console.warn(`[Proxy-AI] Model ${model} failed:`, err);
            proxyError = err;
            
            if (err.message && (err.message.includes("Unauthorized") || err.message.includes("jwt"))) {
                throw new Error("Sesi login berakhir. Silakan refresh halaman dan login kembali.");
            }
            if (err.message && err.message.includes("FunctionsFetchError")) {
                // Ini biasanya jika Edge Function belum dideploy atau 404
                throw new Error("Server AI belum siap (Edge Function Missing). Silakan gunakan API Key pribadi untuk sementara.");
            }
        }
    }

    throw new Error(`Gagal generate via Server. ${proxyError?.message || "Layanan sedang sibuk."}`);
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
                  introPrinciple: { type: Type.STRING },
                  core: { 
                      type: Type.OBJECT, 
                      properties: {
                          memahami: { type: Type.ARRAY, items: { type: Type.STRING } },
                          mengaplikasi: { type: Type.ARRAY, items: { type: Type.STRING } },
                          merefleksi: { type: Type.ARRAY, items: { type: Type.STRING } }
                      }
                  },
                  corePrinciple: { type: Type.STRING },
                  closing: { type: Type.ARRAY, items: { type: Type.STRING } },
                  closingPrinciple: { type: Type.STRING }
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
