
import { GoogleGenAI, Type } from "@google/genai";
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, LKPDData, QuestionBankConfig, QuestionBankData, MaterialsData, DeepLearningAssessment } from '../types';
import { tokenManager } from "./tokenManager";
import { supabase } from "../lib/supabaseClient";

const CACHE_PREFIX = 'pakar_ai_v5_direct_'; // Versi cache local
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Jam
const REQUEST_TIMEOUT_MS = 45000; // 45 Detik per model

const cleanApiKey = (key: string | null | undefined): string => {
  if (!key) return "";
  return String(key).trim().replace(/[\r\n"']/g, '');
};

// --- HELPER: TIMEOUT WRAPPER WITH ABORT CONTROLLER ---
const withTimeout = async <T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  errorMsg: string
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, ms);

  try {
    return await fn(controller.signal);
  } catch (error: any) {
    if (controller.signal.aborted || error.name === 'AbortError') {
        throw new Error(errorMsg);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

// --- HELPER: JSON CLEANER ---
const cleanJsonOutput = (text: string): string => {
    if (!text) return "{}";
    let cleaned = text.replace(/```json/g, '').replace(/```/g, '');
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
    return cleaned.trim();
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

// --- GLOBAL SUPABASE CACHE UTILS ---
const getGlobalCache = async (hash: string): Promise<any | null> => {
    try {
        const { data, error } = await supabase.from('global_cache').select('response').eq('hash', hash).single();
        if (error || !data) return null;
        return data.response;
    } catch (error) { return null; }
};

const saveGlobalCache = async (hash: string, response: any) => {
    try {
        supabase.from('global_cache').upsert({ hash: hash, response: response, created_at: new Date().toISOString() }).then(({ error }) => {
            if (error) console.warn("Failed to save global cache", error.message);
        });
    } catch (error) { /* Ignore */ }
};

// --- STRATEGI: SMART SEQUENTIAL FALLBACK (Hemat Kuota) ---
// 1. Model A (Primary) -> gemini-2.5-flash
// 2. Model B (Backup)  -> gemini-flash-latest
const executeSmartStrategy = async (client: GoogleGenAI, requestOptions: any): Promise<any> => {
    
    // Config Strategy
    const ATTEMPTS = [
        { model: 'gemini-2.5-flash', label: 'Model A (Primary)' },
        { model: 'gemini-flash-latest', label: 'Model B (Backup)' }
    ];

    let lastError = null;

    for (const attempt of ATTEMPTS) {
        try {
            console.log(`[AI] Mencoba ${attempt.label}: ${attempt.model}...`);
            
            // Single Request dengan Timeout
            const response: any = await withTimeout(
                async (signal) => {
                    const res = await client.models.generateContent({
                        model: attempt.model,
                        ...requestOptions
                    });
                    return res;
                },
                REQUEST_TIMEOUT_MS,
                `Timeout pada ${attempt.label}`
            );

            // Parsing
            const cleanedText = cleanJsonOutput(response.text || "");
            const parsedData = JSON.parse(cleanedText);
            
            if (Object.keys(parsedData).length === 0) throw new Error("Output JSON kosong.");
            
            console.log(`[AI] ✅ Sukses menggunakan ${attempt.label}`);
            return parsedData;

        } catch (e: any) {
            console.warn(`[AI] ⚠️ Gagal pada ${attempt.label}:`, e.message);
            lastError = e;

            // Jika errornya adalah Auth/API Key Invalid, JANGAN RETRY, langsung throw agar user sadar
            const errStr = String(e.message || e).toLowerCase();
            if (errStr.includes("api_key") || errStr.includes("unauthenticated") || errStr.includes("invalid argument")) {
                throw new Error("API Key Tidak Valid atau Konfigurasi Salah.");
            }
            
            // Lanjut ke model berikutnya (Sequential Fallback)
        }
    }

    // Jika Model B juga gagal
    throw new Error(`Gagal Generate. Server sedang sibuk atau kuota habis. Error terakhir: ${lastError?.message || "Unknown Error"}`);
};

// Validasi API Key User
export const validateApiKey = async (rawApiKey: string): Promise<{ success: boolean; message: string }> => {
    const apiKey = cleanApiKey(rawApiKey);
    if (!apiKey) return { success: false, message: "API Key kosong." };

    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const modelToTest = 'gemini-flash-latest'; // Gunakan model paling ringan untuk tes koneksi
        
        const response: any = await withTimeout(
            (signal) => ai.models.generateContent({
                model: modelToTest, 
                contents: "Tes koneksi.", 
            }),
            10000, // 10s timeout
            "Koneksi timeout (10s)"
        );

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
    // Prioritas: Token Manager (Memory) > Process Env
    const memoryKey = tokenManager.getKey();
    const userKey = cleanApiKey(memoryKey);
    const systemKey = cleanApiKey(process.env.API_KEY);
    
    const isUserCustomKey = !!userKey; 
    const apiKey = isUserCustomKey ? userKey : systemKey;

    if (!apiKey) {
        throw new Error("API Key Kosong. Silakan masukkan API Key Google AI Studio Anda di menu Dashboard.");
    }

    // 1. Generate Hash untuk Cache Key
    const signature = userPrompt + JSON.stringify(responseSchema) + systemInstruction;
    const cacheKey = await generateHash(signature);

    // 2. Cek LOCAL Cache (Browser)
    const localData = getLocalCache(cacheKey);
    if (localData) {
        console.log("[Cache] Hit from Browser LocalStorage");
        return localData;
    }

    // 3. Cek GLOBAL Cache (Supabase) - HANYA JIKA PAKAI SYSTEM KEY
    if (!isUserCustomKey) {
        const globalData = await getGlobalCache(cacheKey);
        if (globalData) {
            console.log("[Cache] Hit from Supabase Global");
            setLocalCache(cacheKey, globalData); 
            return globalData;
        }
    }

    // 4. Generate AI (Smart Strategy)
    const client = new GoogleGenAI({ apiKey: apiKey });
    
    const requestOptions = {
        contents: userPrompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            systemInstruction: systemInstruction,
            temperature: 0.7,
        }
    };

    let finalResult = null;

    try {
        finalResult = await executeSmartStrategy(client, requestOptions);
    } catch (e: any) {
        // Pretty Print Error untuk User
        let msg = e.message || "Gagal Generate.";
        if (msg.includes("429")) msg = "Kuota API Key Anda Habis (Limit Google). Silakan tunggu sebentar atau ganti API Key.";
        if (msg.includes("403")) msg = "API Key tidak memiliki izin (Permission Denied).";
        throw new Error(msg);
    }

    // 5. Simpan Cache
    if (finalResult) {
        setLocalCache(cacheKey, finalResult);
        if (!isUserCustomKey) {
            saveGlobalCache(cacheKey, finalResult);
        }
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
Output wajib JSON valid sesuai Schema. Jangan tambahkan markdown block seperti \`\`\`json.
`;

const ASSESSMENT_INSTRUCTION = `
Anda adalah Pakar Penilaian & Deep Learning.
Buat Rubrik KKTP, Asesmen Formatif (Checklist & Feedback), Sumatif, dan Intervensi.
Output wajib JSON valid. Jangan tambahkan markdown block.
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
