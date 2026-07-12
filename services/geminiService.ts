
import { GoogleGenAI, Type } from "@google/genai";
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, LKPDData, QuestionBankConfig, QuestionBankData, MaterialsData, DeepLearningAssessment } from '../types';
import { tokenManager } from "./tokenManager";
import { supabase } from "../lib/supabaseClient";
// @ts-ignore
import sintaksModelMD from '../rpp-pembelajaran-mendalam/sintaks-model-pembelajaran.md?raw';

const CACHE_PREFIX = 'pakar_ai_v5_direct_'; // Versi cache local
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Jam
const REQUEST_TIMEOUT_MS = 120000; // 120 Detik per model karena instruksi yang sangat panjang

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
import { jsonrepair } from 'jsonrepair';

const cleanJsonOutput = (text: string): string => {
    if (!text) return "{}";
    // We don't need firstBrace/lastBrace hack if we just rely on jsonrepair.
    // Replace markdown formatting if any.
    let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return cleaned;
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
const executeSmartStrategy = async (client: GoogleGenAI, requestOptions: any): Promise<any> => {
    
    // Config Strategy
    const ATTEMPTS = [
        { model: 'gemini-2.5-flash', label: 'Model A (Primary)' },
        { model: 'gemini-3-flash-preview', label: 'Model B (Secondary)' }
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
            let cleanedText = cleanJsonOutput(response.text || "");
            let parsedData;
            try {
                parsedData = JSON.parse(cleanedText);
            } catch (err: any) {
                console.warn("[AI] JSON Parse gagal, mencoba jsonrepair...");
                try {
                    const repairedText = jsonrepair(cleanedText);
                    parsedData = JSON.parse(repairedText);
                    console.log("[AI] jsonrepair berhasil memperbaiki JSON.");
                } catch (repairErr: any) {
                    console.error("[AI] jsonrepair juga gagal:", repairErr.message, "Teks awal:", cleanedText.substring(0, 150), "...");
                    throw new Error("Output AI terpotong atau tidak valid meskipun sudah diperbaiki. Silakan coba klik GENERATE lagi.");
                }
            }
            
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
            
            // Loop akan berakhir jika ini satu-satunya model
        }
    }

    // Jika semua model gagal
    throw new Error(`Gagal Generate. Server sedang sibuk atau kuota habis. Error terakhir: ${lastError?.message || "Unknown Error"}`);
};

// Validasi API Key User
export const validateApiKey = async (rawApiKey: string): Promise<{ success: boolean; message: string }> => {
    const apiKey = cleanApiKey(rawApiKey);
    if (!apiKey) return { success: false, message: "API Key kosong." };

    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });
        const modelToTest = 'gemini-3.1-flash-lite'; // Gunakan model ringan untuk tes koneksi
        
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
            temperature: 0.3,
            maxOutputTokens: 65536
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
    if (g.includes('paud') || g.includes('usia dini')) return "TINGKAT KOMPLEKSITAS: SANGAT DASAR (PAUD). Penekanan pada bermain sambil belajar, pengenalan emosi, motorik kasar/halus, interaksi sosial, eksplorasi konkret, sangat ramah anak.";
    if (g.includes('fase f') || g.includes('xii') || g.includes('xi')) return "TINGKAT KOMPLEKSITAS: TINGGI (High School / Advanced). Analisis mendalam, HOTS Level C4-C6.";
    if (g.includes('fase e') || g.includes('kelas x')) return "TINGKAT KOMPLEKSITAS: MENENGAH-TINGGI (High School). Pemahaman konsep abstrak.";
    if (g.includes('fase d') || g.includes('smp')) return "TINGKAT KOMPLEKSITAS: MENENGAH (Middle School). Bahasa lugas, eksplorasi konsep.";
    if (g.includes('sd') || g.includes('fase a') || g.includes('fase b') || g.includes('fase c')) return "TINGKAT KOMPLEKSITAS: DASAR (Elementary). Konkret, sederhana, ramah anak.";
    return "TINGKAT KOMPLEKSITAS: Sesuaikan dengan jenjang.";
};

const DEEP_LEARNING_INSTRUCTION = `
Anda adalah Pakar Kurikulum, Pedagogi, dan Deep Learning.
Tugas Anda adalah menyusun dokumen pembelajaran (Modul Ajar/RPP, Materi, LKPD, Asesmen) dengan kualitas tinggi dan narasi yang kaya.

ATURAN UTAMA:
1. Selalu gunakan istilah "Murid" (bukan siswa atau peserta didik).
2. Jangan menggunakan format LaTeX ($..$) untuk teks biasa, hanya untuk rumus yang kompleks.
3. Output WAJIB 100% JSON valid sesuai Schema. DILARANG membalas di luar struktur JSON atau menambahkan markdown \`\`\`json.
4. FORMAT LANGKAH & KUALITAS NARASI: Jabarkan setiap tahapan pembelajaran ke dalam poin-poin langkah yang sangat rinci dan detail. Karena struktur JSON meminta Array of Strings untuk langkah pembelajaran, setiap string dalam array WAJIB berupa satu kalimat aksi tunggal yang jelas dan padat. JANGAN membuat kalimat panjang yang menggabungkan banyak aksi dalam satu string. (Contoh BENAR dalam array: ["Guru memulai pembelajaran dengan salam hangat dan berdoa.", "Guru menciptakan suasana kelas yang tenang.", "Guru memeriksa kehadiran murid satu per satu."]). Pastikan menyertakan instruksi guru, pertanyaan pemantik, dan respons murid sebagai item string yang terpisah di dalam array.
5. INTEGRASI MODEL PEMELAJARAN & DISTRIBUSI PERTEMUAN: 
   - Apapun model pembelajarannya (Discovery, PBL, PjBL, dll), WAJIB diintegrasikan dengan mulus ke dalam struktur 'memahami', 'mengaplikasi', dan 'merefleksi'.
   - JIKA jumlah pertemuan lebih dari 1 (misalnya 2 atau 3 pertemuan), SANGAT DILARANG menggunakan/menumpuk seluruh sintaks model ke dalam 1 pertemuan saja! Anda WAJIB mendistribusikan sintaks/langkah model pembelajaran secara logis sepanjang seluruh pertemuan.
   - Contoh (Discovery Learning - 6 Sintaks untk 2 Pertemuan): 
     * Pertemuan 1 difokuskan pada fase Membangun Konsep: Di 'memahami', masukkan langkah [Stimulasi] dan [Identifikasi Masalah]. Di 'mengaplikasi', masukkan [Pengumpulan Data].
     * Pertemuan 2 difokuskan pada Validasi dan Generalisasi: Di 'mengaplikasi', masukkan [Pengolahan Data]. Di 'merefleksi', masukkan [Pembuktian] dan [Menarik Kesimpulan].
     * Jabarkan langkah sintaksnya secara eksplisit dalam kalimat naratif di struktur JSON.
6. PRAKTIK PEDAGOGIS: 
   - JIKA Praktik Pedagogis bernilai "Biarkan AI merekomendasikan...", JANGAN SELALU memilih Discovery Learning! Pilih secara cerdas berdasarkan **Tujuan Pembelajaran** dan **Topik**.
   - **PERTIMBANGAN KRITIS:** Jika HANYA 1 PERTEMUAN, sangat tidak logis menggunakan "Model Pembelajaran" utuh (PBL, PjBL, Discovery) karena memakan waktu panjang. Gunakanlah "Metode Pembelajaran" atau "Strategi Pembelajaran" (misal: Diskusi Kelompok, Jigsaw, Role-play, Simulasi, dsb). Jika 2 pertemuan atau lebih, barulah "Model Pembelajaran" cocok digunakan.
   - Pada field "pedagogicalPractice", berikan penjelasan SINGKAT (maksimal 1 paragraf, 3-4 kalimat saja). Sebutkan secara spesifik dan akurat nama praktiknya dan PENGELOMPOKKANNYA (apakah itu "Metode Pembelajaran", "Strategi Pembelajaran", atau "Model Pembelajaran"). Contoh SALAH: "Model pembelajaran yang digunakan adalah Diskusi Kelompok". Contoh BENAR: "Metode Pembelajaran yang digunakan adalah Diskusi Kelompok". Jelaskan APA yang dipilih, MENGAPA dipilih, dan BAGAIMANA hubungannya dengan langkah pembelajaran serta pencapaian Tujuan Pembelajaran.

BERIKUT ADALAH REFERENSI MODEL PEMBELAJARAN DAN SINTAKSNYA:
${sintaksModelMD}
`;

const ASSESSMENT_INSTRUCTION = `
Anda adalah Pakar Penilaian & Deep Learning.
Buat Rubrik KKTP, Asesmen Formatif (Checklist & Feedback), Sumatif, dan Intervensi berdasarkan prinsip backward design.
Output wajib JSON valid sesuai Schema. Jangan tambahkan markdown block atau teks pendamping. Kalimat pada rubrik dan indikator harus operasional dan mudah diukur.

ATURAN KKTP (Kriteria Ketercapaian Tujuan Pembelajaran):
Anda WAJIB mengisi keempat level pencapaian secara lengkap dan detail (TIDAK BOLEH ADA YANG KOSONG):
1. 'needsGuidance' untuk kolom (Perlu Bimbingan): Deskripsi level terendah
2. 'basic' untuk kolom (Cukup): Deskripsi level menengah bawah
3. 'proficient' untuk kolom (Baik): Deskripsi level menengah atas (BAGIAN INI SERING TERLEWAT, ANDA WAJIB MENGISINYA DENGAN DESKRIPSI YANG JELAS, TIDAK BOLEH STRING KOSONG)
4. 'advanced' untuk kolom (Sangat Baik): Deskripsi level tertinggi
`;

// --- EXPORTED FUNCTIONS ---

export const generateRPP = async (school: SchoolIdentity, lesson: LessonIdentity): Promise<GeneratedLessonPlan> => {
  const complexity = getComplexityInstruction(lesson.grade);
  const prompt = `
    BUAT MODUL AJAR KURIKULUM MERDEKA.
    Mapel: ${lesson.subject}, Kelas: ${lesson.grade}, Topik: ${lesson.topic}
    Tujuan: 
${lesson.objectives.map(o => `    - ${o}`).join('\n')}
    Waktu: ${lesson.timeAllocation}, Pertemuan: ${lesson.meetingCount}
    
    KUNCI UTAMA (MATA PELAJARAN & TOPIK):
    - Anda WAJIB menyusun seluruh modul ajar ini secara ketat berfokus pada mata pelajaran "${lesson.subject}" dengan topik "${lesson.topic}" untuk kelas "${lesson.grade}".
    - DILARANG KERAS mencampuradukkan, melenceng, atau menghasilkan konten dari mata pelajaran lain. Jika Mata Pelajaran adalah "Bahasa Indonesia", maka seluruh materi pembelajaran, langkah, diskusi, teks analisis, aktivitas, dan evaluasi harus menggunakan kaidah dan konteks pembelajaran Bahasa Indonesia (seperti analisis struktur teks, tata bahasa, menulis, membaca, menyimak, dll), bukan membahas ilmu sains/sosial murninya meskipun topiknya mirip.
    
    DETAIL:
    - Praktik Pedagogis (Model/Strategi/Metode): ${lesson.pedagogicalPractice || "Biarkan AI merekomendasikan Praktik Pedagogis yang relevan"}
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
    
    ATURAN TUJUAN PEMBELAJARAN:
    Field 'design.objectives' WAJIB didetailkan penjabarannya menjadi menjadi 2-3 tujuan pembelajaran yang terukur dan saling berkesinambungan (JANGAN HANYA 1). Gunakan/kembangkan tujuan dari input user. Ini akan menjadi pondasi untuk Pembuatan Lembar Kerja (LKPD), sehingga penjabarannya harus rinci.
    
    ${complexity}

    INSTRUKSI:
    Rincikan langkah pembelajaran (Pendahuluan, Inti, Penutup) untuk SETIAP PERTEMUAN (${lesson.meetingCount}). Anda WAJIB membuat TEPAT array sejumlah total pertemuan yang diminta. Jika diminta 2 pertemuan, output 'learningExperience' WAJIB memiliki tepat 2 elemen!
    JABARKAN SETIAP LANGKAH SECARA MIKRO DAN SANGAT PANJANG (BERLAKU UNTUK SEMUA JENJANG, MULAI DARI PAUD HINGGA SMA/SMK):
    - Jelaskan secara detail instruksi spesifik apa yang diucapkan guru dan bagaimana respons murid.
    - Deskripsikan interaksi, aktivitas, diskusi, permainan, atau penalaran kognitif yang dilakukan.
    - Setiap poin kegiatan HARUS berupa narasi komprehensif, BUKAN sekadar kalimat singkat.
    - Kegiatan Inti WAJIB mengikuti alur: Memahami -> Mengaplikasi -> Merefleksi.
    - Setiap tahapan dalam kegiatan inti harus dijabarkan dengan narasi yang kaya dan rinci (minimal 3 kalimat panjang per poin kegiatan).
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
    const subject = data.identitySection.subject;
    const topic = data.identitySection.topic;
    const grade = data.identitySection.grade;
    const prompt = `
Buat instrumen asesmen lengkap untuk mata pelajaran: ${subject}, topik: ${topic}, kelas: ${grade}. 
Komponen: KKTP (4 Level: Perlu Bimbingan, Cukup, Baik, Sangat Baik), Formatif (Checklist & Feedback), Sumatif (Kisi-kisi), Intervensi. 

ATURAN UTAMA:
- Seluruh butir kriteria, indikator penilaian, dan tugas asesmen wajib berfokus 100% pada aspek kompetensi mata pelajaran "${subject}" dan topik "${topic}".
- Jangan pernah beralih atau mencampuradukkan dengan materi dari mata pelajaran lain.
- PASTIKAN SEMUA LEVEL KKTP DIISI SECARA LENGKAP.
`;
    const schema = {
        type: Type.OBJECT,
        properties: {
            kktp: { 
                type: Type.ARRAY, 
                items: { 
                    type: Type.OBJECT, 
                    properties: { 
                        criteria: { type: Type.STRING, description: "Kriteria penilaian" }, 
                        needsGuidance: { type: Type.STRING, description: "Deskripsi detail untuk level C (Perlu Bimbingan). Jangan kosong." }, 
                        basic: { type: Type.STRING, description: "Deskripsi detail untuk level B (Cukup). Jangan kosong." }, 
                        proficient: { type: Type.STRING, description: "Deskripsi detail untuk level A (Baik). WAJIB MENGANDUNG DESKRIPSI (TIDAK BOLEH KOSONG ATAU STRING KOSONG)." }, 
                        advanced: { type: Type.STRING, description: "Deskripsi detail untuk level A+ (Sangat Baik). Jangan kosong." } 
                    },
                    required: ["criteria", "needsGuidance", "basic", "proficient", "advanced"]
                } 
            },
            formative: { type: Type.OBJECT, properties: { checklist: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { aspect: { type: Type.STRING }, indicator: { type: Type.STRING } } } }, feedbackGuide: { type: Type.OBJECT, properties: { clarification: { type: Type.STRING }, appreciation: { type: Type.STRING }, suggestion: { type: Type.STRING } } } } },
            summative: { type: Type.OBJECT, properties: { grid: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { indicator: { type: Type.STRING }, level: { type: Type.STRING }, technique: { type: Type.STRING } } } } } },
            intervention: { 
                type: Type.OBJECT, 
                properties: { 
                    needsGuidance: { type: Type.STRING, description: "Tindakan intervensi untuk level Perlu Bimbingan" }, 
                    basic: { type: Type.STRING, description: "Tindakan intervensi untuk level Cukup" }, 
                    proficient: { type: Type.STRING, description: "Tindakan pengayaan untuk level Baik" }, 
                    advanced: { type: Type.STRING, description: "Tindakan pengayaan eksplorasi untuk level Sangat Baik" } 
                },
                required: ["needsGuidance", "basic", "proficient", "advanced"]
            }
        },
        required: ["kktp", "formative", "summative", "intervention"]
    };
    return await tryGenerate(ASSESSMENT_INSTRUCTION, prompt, schema);
};

// ============================================================================
// PATCH: generateMaterials di geminiService.ts
// Ganti fungsi generateMaterials yang ada (sekitar line 450) dengan versi ini.
// ============================================================================

export const generateMaterials = async (data: GeneratedLessonPlan): Promise<MaterialsData> => {
    const subject = data.identitySection.subject;
    const topic = data.identitySection.topic;
    const grade = data.identitySection.grade;
    const objectives = (data.design.objectives || []).slice(0, 3).map((o, i) => `${i+1}. ${o}`).join('\n');

    const prompt = `
Buat Materi Ajar yang lengkap, menarik, dan sesuai jenjang untuk keperluan pembelajaran.

## KONTEKS
- Mata Pelajaran: ${subject}
- Topik: ${topic}
- Kelas / Fase: ${grade}
- Tujuan Pembelajaran:
${objectives}

## MANDAT KHUSUS (JANGKAR KONTEN)
- Anda wajib membatasi dan menyusun seluruh isi materi, penjelasan, tabel, dan trivia secara ketat 100% di dalam ruang lingkup mata pelajaran "${subject}" dan topik "${topic}". 
- Jangan pernah melenceng ke mata pelajaran lain! Jika mata pelajarannya adalah Bahasa Indonesia, seluruh materi harus membahas tentang aspek kebahasaan, cara membaca, menulis, menyimak, atau mempresentasikan teks/topik tersebut sesuai kaidah Bahasa Indonesia, bukan membahas sains/sosialnya secara murni.

## ATURAN PER FIELD (WAJIB DIPATUHI)

### A. Field "judul"
Judul materi yang spesifik dan menarik. Boleh berbeda dari nama topik agar lebih engaging.
Contoh untuk topik "Sistem Pencernaan": "Perjalanan Ajaib Makanan dalam Tubuh Kita"

### B. Field "pemantik"
WAJIB berupa 1-2 pertanyaan provokatif ATAU 1 pernyataan mengejutkan yang memicu rasa ingin tahu.
BUKAN ringkasan materi. BUKAN tujuan pembelajaran.
Contoh: "Tahukah kamu bahwa usus halus manusia jika direntangkan bisa mencapai panjang 6 meter? Lalu mengapa makanan yang kita makan tidak terasa seperti perjalanan sejauh itu?"

### C. Field "subTopik"
Array 3-5 string, masing-masing adalah nama sub-topik yang akan dibahas.
Contoh: ["Organ-Organ Sistem Pencernaan", "Proses Pencernaan Mekanis", "Proses Pencernaan Kimiawi", "Gangguan Sistem Pencernaan"]

### D. Field "konsepInti.definisi"
1 kalimat definisi ringkas dan tepat tentang topik utama.

### E. Field "konsepInti.penjelasanBertahap"
Array 4-6 string. Setiap string adalah 1 paragraf penjelasan naratif (2-4 kalimat) yang mengalir dari konsep dasar ke konsep lanjut.
BUKAN bullet point. BUKAN satu kalimat pendek. Harus naratif dan mengalir.

### F. Field "konsepInti.contohKonkret"
1-2 paragraf yang memberikan contoh nyata dari kehidupan sehari-hari yang relevan dengan topik.
Buat kontekstual dan relatable untuk murid sesuai jenjang.

### G. Field "konsepInti.tabelVisual" ← PALING PENTING
WAJIB berupa string tabel markdown yang valid dengan header, separator, dan data.
Format yang WAJIB diikuti:
| Kolom1 | Kolom2 | Kolom3 |
|--------|--------|--------|
| data   | data   | data   |

Buat tabel yang RELEVAN dengan topik. Pilih salah satu format yang paling cocok:
- Tabel perbandingan (misal: organ vs fungsi vs lokasi)
- Tabel proses/tahapan (misal: langkah → nama → keterangan)
- Tabel klasifikasi (misal: jenis → contoh → ciri)
Minimal 4 baris data (di luar header).
JANGAN buat tabel kosong atau dengan data placeholder "...".

### H. Field "trivia"
1-2 kalimat fakta menarik/mengejutkan yang berkaitan dengan topik.
Harus informatif dan membuat murid berkata "wow". 
Contoh: "Lambung manusia menghasilkan asam klorida (HCl) yang cukup kuat untuk melarutkan logam seng, namun lapisan lendir lambung melindunginya dari kerusakan!"

### I. Field "glosarium"
Array 6-8 objek { istilah, definisi }. Pilih istilah-istilah teknis penting dari topik.
Setiap definisi 1 kalimat yang jelas dan mudah dipahami sesuai jenjang.

## CONTOH OUTPUT YANG BENAR (TIRU POLA, BUKAN ISINYA)
{
  "judul": "Perjalanan Ajaib Makanan dalam Tubuh Kita",
  "pemantik": "Tahukah kamu bahwa makanan yang kamu makan bisa membutuhkan waktu 24-72 jam untuk melewati seluruh sistem pencernaanmu? Apa saja yang terjadi selama perjalanan panjang tersebut?",
  "subTopik": ["Organ-Organ Sistem Pencernaan", "Pencernaan Mekanis", "Pencernaan Kimiawi", "Nutrisi dan Penyerapan", "Gangguan Sistem Pencernaan"],
  "konsepInti": {
    "definisi": "Sistem pencernaan adalah rangkaian organ yang bekerja sama untuk mengurai makanan menjadi nutrisi yang dapat diserap dan digunakan oleh sel-sel tubuh.",
    "penjelasanBertahap": [
      "Proses pencernaan dimulai di mulut, tempat makanan dihancurkan secara mekanis oleh gigi dan dicampur dengan air liur yang mengandung enzim amilase. Enzim ini mulai memecah karbohidrat kompleks menjadi bentuk yang lebih sederhana bahkan sebelum makanan meninggalkan mulut.",
      "Setelah ditelan, makanan melewati kerongkongan menuju lambung melalui gerakan peristaltik. Di lambung, makanan dicampur dengan asam lambung (HCl) dan enzim pepsin yang memecah protein, mengubah makanan menjadi massa setengah cair yang disebut kimus.",
      "Usus halus adalah tempat penyerapan nutrisi terbesar terjadi. Kimus yang masuk dari lambung bertemu dengan enzim dari pankreas dan empedu dari kantong empedu, yang bersama-sama memecah lemak, protein, dan karbohidrat menjadi molekul-molekul kecil yang siap diserap oleh vili usus.",
      "Nutrisi yang telah diserap masuk ke aliran darah dan dibawa ke seluruh tubuh untuk digunakan sebagai energi, bahan bangunan sel, dan berbagai fungsi metabolisme. Sisa makanan yang tidak dapat dicerna kemudian masuk ke usus besar untuk proses reabsorpsi air sebelum akhirnya dikeluarkan."
    ],
    "contohKonkret": "Bayangkan ketika kamu memakan sepotong roti. Gigi di mulutmu menghancurkannya menjadi potongan kecil (pencernaan mekanis), sementara air liur mulai memecah pati dalam roti menjadi gula sederhana (pencernaan kimiawi). Pernahkah kamu merasakan roti tawar menjadi sedikit manis jika dikunyah lama? Itulah enzim amilase bekerja mengubah pati menjadi glukosa!",
    "tabelVisual": "| Organ | Fungsi Utama | Jenis Pencernaan | Enzim/Zat yang Terlibat |\n|-------|-------------|-----------------|-------------------------|\n| Mulut | Menghancurkan dan melembapkan makanan | Mekanis & Kimiawi | Amilase (saliva) |\n| Lambung | Mencampur dan mengurai protein | Mekanis & Kimiawi | Pepsin, HCl |\n| Usus Halus | Menyerap nutrisi | Kimiawi | Lipase, Protease, Amilase pankreas |\n| Usus Besar | Menyerap air, membentuk feses | Mekanis | Bakteri usus |\n| Pankreas | Memproduksi enzim pencernaan | - | Lipase, Amilase, Protease |"
  },
  "trivia": "Usus halus manusia memiliki permukaan penyerapan seluas lapangan tenis (sekitar 250 m²) berkat jutaan tonjolan kecil yang disebut vili dan mikrovili. Tanpa struktur ini, tubuh kita tidak akan mampu menyerap cukup nutrisi dari makanan!",
  "glosarium": [
    { "istilah": "Enzim", "definisi": "Protein yang berfungsi sebagai katalis biologis untuk mempercepat reaksi kimia dalam pencernaan." },
    { "istilah": "Peristaltik", "definisi": "Gerakan otot bergelombang pada saluran pencernaan yang mendorong makanan maju." },
    { "istilah": "Vili", "definisi": "Tonjolan-tonjolan kecil pada dinding usus halus yang berfungsi memperluas permukaan penyerapan nutrisi." },
    { "istilah": "Kimus", "definisi": "Massa makanan setengah cair yang terbentuk setelah dicampur dengan asam dan enzim di lambung." },
    { "istilah": "Amilase", "definisi": "Enzim yang diproduksi di mulut dan pankreas untuk memecah karbohidrat (pati) menjadi gula sederhana." }
  ]
}

---
PENTING: Output WAJIB JSON valid sesuai schema.
- Field "tabelVisual" WAJIB string markdown table yang valid, BUKAN objek JSON.
- JANGAN copy contoh di atas — buat konten baru yang sesuai topik "${topic}" untuk kelas ${grade}.
- Gunakan kata "Murid", bukan "Siswa".
`;

    // CATATAN PENTING TENTANG SCHEMA:
    // tabelVisual dikunci sebagai Type.STRING saja (bukan object).
    // Ini memastikan AI selalu output markdown table string, bukan JSON object.
    // Hal ini menyederhanakan logic di MaterialsContent.tsx dan documentService.ts.
    const schema = {
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
                    tabelVisual: {
                        type: Type.STRING,
                        description: "A valid markdown table string with header row, separator row (|---|), and minimum 4 data rows. Must be relevant to the topic."
                    },
                    contohKonkret: { type: Type.STRING }
                },
                required: ["definisi", "penjelasanBertahap", "tabelVisual", "contohKonkret"]
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
                    required: ["istilah", "definisi"]
                }
            }
        },
        required: ["judul", "pemantik", "subTopik", "konsepInti", "trivia", "glosarium"]
    };

    return await tryGenerate(DEEP_LEARNING_INSTRUCTION, prompt, schema);
};

// ============================================================================
// PATCH FINAL: generateLKPD di geminiService.ts
//
// ROOT CAUSE dari screenshot:
// 1. Prompt LKPD cuma 1 baris → AI tidak tahu harus generate apa
// 2. DEEP_LEARNING_INSTRUCTION berisi sintaks model pembelajaran (Discovery, PBL, dll)
//    via ${sintaksModelMD} → AI "bocor" dan menuang instruksi RPP itu ke content aktivitas
//
// SOLUSI:
// - Buat LKPD_INSTRUCTION terpisah yang TIDAK mengandung sintaks model pembelajaran
// - Prompt eksplisit dengan few-shot example agar AI tahu persis format yang diharapkan
// ============================================================================

// ▼ TAMBAHKAN konstanta ini di dekat DEEP_LEARNING_INSTRUCTION dan ASSESSMENT_INSTRUCTION
// (sekitar line 289 di geminiService.ts)
const LKPD_INSTRUCTION = `
Anda adalah Pakar Pedagogik yang ahli membuat Lembar Kerja Peserta Didik (LKPD).
Tugas Anda adalah menyusun LKPD yang interaktif, kontekstual, dan sesuai jenjang.

ATURAN MUTLAK:
1. Gunakan kata "Murid", bukan "Siswa" atau "Peserta Didik".
2. Output WAJIB 100% JSON valid sesuai Schema. DILARANG menambahkan teks di luar JSON.
3. Field "activities.activity1.content" WAJIB berupa tabel markdown — BUKAN narasi, BUKAN deskripsi model pembelajaran.
4. Field "activities.activity2.content" WAJIB berupa pertanyaan diskusi bernomor — BUKAN deskripsi model pembelajaran.
5. DILARANG menyebut nama model pembelajaran (Discovery Learning, PBL, dll) di dalam konten LKPD.
6. DILARANG menulis "PEMBELAJARAN MENDALAM", "FASE", atau istilah kurikulum di dalam konten aktivitas.
`;

// ▼ GANTI fungsi generateLKPD yang ada dengan versi ini
export const generateLKPD = async (data: GeneratedLessonPlan): Promise<LKPDData> => {
    const subject = data.identitySection.subject;
    const topic = data.identitySection.topic;
    const grade = data.identitySection.grade;
    const objectives = (data.design.objectives || [])
        .slice(0, 3)
        .map((o, i) => `${i + 1}. ${o}`)
        .join('\n');

    const prompt = `
Buat Lembar Kerja Peserta Didik (LKPD) untuk mata pelajaran dan topik berikut.

## KONTEKS
- Mata Pelajaran: ${subject}
- Topik: ${topic}
- Kelas: ${grade}
- Tujuan Pembelajaran:
${objectives}

## MANDAT KHUSUS
- Lembar kerja (LKPD) ini harus disusun 100% secara ketat berfokus pada mata pelajaran "${subject}" dengan topik "${topic}".
- Semua aktivitas, stimulus, petunjuk, tabel pemahaman, dan pertanyaan diskusi wajib menggunakan konteks pembelajaran "${subject}". Dilarang keras beralih atau mencampur dengan mata pelajaran lain!

---

## INSTRUKSI PER FIELD

**"title"** → Judul LKPD yang spesifik dan menarik untuk topik ini.

**"objectives"** → String berisi TUJUAN PEMBELAJARAN. Anda WAJIB PERSIS MENYALIN "Tujuan Pembelajaran" yang ada di bagian KONTEKS di atas, jangan diubah kata-katanya. Ubah formatnya menjadi bullet string seperti ini:
"• [Tujuan 1 yang disalin]\n• [Tujuan 2 yang disalin]\n• [Tujuan 3 yang disalin]"

**"instructions"** → Array 4-5 petunjuk pengerjaan. Singkat dan berurutan.
Contoh: ["Baca stimulus dengan seksama.", "Kerjakan Aktivitas 1 secara mandiri.", ...]

**"stimulus"** → Paragraf narasi 3-5 kalimat. Berupa teks kontekstual yang memancing rasa ingin tahu tentang topik. BUKAN instruksi. BUKAN pertanyaan langsung.

**"activities.activity1"** →
- "title": "Aktivitas 1: Pemahaman Konsep"
- "content": WAJIB tabel markdown. Format:
| No | [Header Kolom 2] | [Header Kolom 3] |
|----|------------------|------------------|
| 1  | [isian]          | ................ |
| 2  | [isian]          | ................ |
Buat minimal 5 baris. Isi kolom pertama dengan data/konsep spesifik dari topik "${topic}".
Kolom terakhir biarkan "................" sebagai ruang jawaban murid.

**"activities.activity2"** →
- "title": "Aktivitas 2: Aplikasi & Diskusi"
- "content": Teks naratif berisi 2-3 pertanyaan diskusi HOTS bernomor. Format:
"Diskusikan pertanyaan berikut bersama kelompokmu:\n\n1. [Pertanyaan analisis spesifik]\n2. [Pertanyaan evaluasi spesifik]\n3. [Pertanyaan koneksi ke kehidupan nyata]"

**"reflection"** → Array 3-4 pertanyaan refleksi metakognitif singkat.

---

## CONTOH OUTPUT (TIRU FORMAT, BUAT KONTEN BARU UNTUK TOPIK "${topic}")

Contoh untuk topik "Sistem Pencernaan Manusia":

activity1.content yang BENAR:
"| No | Organ Pencernaan | Fungsi Utama | Jenis Pencernaan |\n|----|-----------------|--------------|------------------|\n| 1  | Mulut | ................ | ................ |\n| 2  | Kerongkongan | ................ | ................ |\n| 3  | Lambung | ................ | ................ |\n| 4  | Usus Halus | ................ | ................ |\n| 5  | Usus Besar | ................ | ................ |"

activity1.content yang SALAH (JANGAN LAKUKAN INI):
"AKTIVITAS 1: PEMAHAMAN KONSEP - PEMBELAJARAN MENDALAM FASE 1 DISCOVERY LEARNING..."
← Ini SALAH karena bukan tabel, memuat nama model pembelajaran, dan memuat narasi RPP.

activity2.content yang BENAR:
"Diskusikan pertanyaan berikut bersama kelompokmu:\n\n1. Apa yang akan terjadi jika enzim pencernaan di lambung tidak bekerja?\n2. Mengapa usus halus jauh lebih panjang dari usus besar padahal fungsinya berbeda?\n3. Bagaimana kebiasaan makanmu sehari-hari bisa memengaruhi kesehatan sistem pencernaanmu?"

---

Output WAJIB JSON valid. JANGAN copy contoh — buat konten baru untuk topik "${topic}".
`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            objectives: { type: Type.STRING },
            instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
            stimulus: { type: Type.STRING },
            activities: {
                type: Type.OBJECT,
                properties: {
                    activity1: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            content: {
                                type: Type.STRING,
                                description: "MUST be a valid markdown table string with | separator, header row, separator row with ---, and minimum 5 data rows. The last column must be blank (............) as answer space for students. DO NOT write model pembelajaran names or RPP narrative here."
                            }
                        },
                        required: ["title", "content"]
                    },
                    activity2: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING },
                            content: {
                                type: Type.STRING,
                                description: "Numbered discussion questions (1, 2, 3) in plain text. DO NOT write model pembelajaran names or RPP narrative here."
                            }
                        },
                        required: ["title", "content"]
                    }
                },
                required: ["activity1", "activity2"]
            },
            reflection: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["title", "objectives", "instructions", "stimulus", "activities", "reflection"]
    };

    // ▼ KUNCI: Pakai LKPD_INSTRUCTION, BUKAN DEEP_LEARNING_INSTRUCTION
    // Ini mencegah sintaks model pembelajaran "bocor" ke konten aktivitas
    return await tryGenerate(LKPD_INSTRUCTION, prompt, schema);
};

// ============================================================================
// PATCH: generateQuestionBank di geminiService.ts
//
// Tambahkan konstanta QUESTION_BANK_INSTRUCTION di dekat konstanta lainnya,
// lalu ganti fungsi generateQuestionBank dengan versi di bawah.
// ============================================================================

// ▼ TAMBAHKAN di dekat LKPD_INSTRUCTION dan ASSESSMENT_INSTRUCTION
const QUESTION_BANK_INSTRUCTION = `
Anda adalah Pakar Evaluasi Pembelajaran yang ahli membuat soal berkualitas tinggi.
Tugas Anda adalah membuat soal evaluasi yang valid, reliabel, dan sesuai jenjang.

ATURAN MUTLAK:
1. Gunakan kata "Murid", bukan "Siswa".
2. Output WAJIB 100% JSON valid sesuai Schema. Tanpa teks di luar JSON.
3. Setiap soal WAJIB sesuai tipe yang diminta — jangan campur format antar tipe.
4. Dilarang menulis narasi model pembelajaran (Discovery Learning, PBL, dll) di dalam soal.

ATURAN PER TIPE SOAL:

[Pilihan Ganda]
- Field "options": array TEPAT 4 string. Isi LANGSUNG teks jawabannya — TANPA prefix "A.", "B.", "C.", "D.".
  BENAR: ["Fotosintesis", "Respirasi", "Fermentasi", "Transpirasi"]
  SALAH: ["A. Fotosintesis", "B. Respirasi", ...]  ← DILARANG, akan double prefix
- Field "answerKey": 1 huruf kapital saja: "A", "B", "C", atau "D". Sesuai urutan options.
- Hindari opsi "Semua benar" atau "Semua salah".

[Pilihan Ganda Kompleks]
- Field "options": array TEPAT 4-5 string. Isi LANGSUNG teks — TANPA prefix huruf.
- Field "answerKey": huruf-huruf yang benar dipisah koma: "A, C" atau "B, D, E".
- Pertanyaan biasanya dimulai dengan "Pernyataan yang benar adalah..."

[Menjodohkan]
- Field "matchingPairs": array objek { left, right } dengan jumlah SAMA (minimal 5 pasang).
  "left" berisi premis/pernyataan, "right" berisi jawaban/pasangan.
- Field "answerKey": "1-C, 2-A, 3-E, 4-B, 5-D" (format: nomor premis - huruf jawaban).
- Pastikan semua nilai "right" UNIK (tidak ada duplikat) agar bisa dijodohkan.

[Benar/Salah]
- Field "question": pernyataan yang bisa dinilai benar atau salah.
- Field "answerKey": tepat 1 kata: "Benar" atau "Salah".
- Jangan buat pertanyaan, buat PERNYATAAN.

[Isian Singkat]
- Field "answerKey": 1-5 kata kunci yang merupakan jawaban yang benar.
- Pertanyaan diakhiri dengan "..." atau titik-titik.

[Uraian]
- Field "answerKey": poin-poin kunci jawaban, 2-4 kalimat sebagai rubrik penilaian.
- Pertanyaan harus HOTS (menganalisis, mengevaluasi, atau mencipta).
- Gunakan kata kerja operasional: "Jelaskan mengapa...", "Analisislah...", "Bandingkan...".
`;

// ▼ GANTI fungsi generateQuestionBank yang ada
export const generateQuestionBank = async (
    data: GeneratedLessonPlan,
    config: QuestionBankConfig
): Promise<QuestionBankData> => {

    const subject = data.identitySection.subject;
    const topic = data.identitySection.topic;
    const grade = data.identitySection.grade;
    const contextSource = data.materials?.subTopik?.length
        ? `Sub-topik: ${data.materials.subTopik.join(', ')}`
        : `Tujuan Pembelajaran: ${(data.design.objectives || []).join('; ')}`;

    // Hitung distribusi soal per tipe yang diminta
    const typeCount = config.types.length;
    const basePerType = Math.floor(config.count / typeCount);
    const remainder = config.count % typeCount;
    const distribution = config.types.map((t, i) =>
        `${t}: ${basePerType + (i < remainder ? 1 : 0)} soal`
    ).join(', ');

    // Instruksi spesifik per level
    const levelInstruction = {
        'LOTS': 'Level LOTS (C1-C3): Mengingat, Memahami, Menerapkan. Gunakan kata kerja: sebutkan, jelaskan, tentukan, hitung, identifikasi.',
        'HOTS': 'Level HOTS (C4-C6): Menganalisis, Mengevaluasi, Mencipta. Gunakan kata kerja: analisis, evaluasi, bandingkan, simpulkan, rancang, prediksi.',
        'CAMPURAN': 'Campuran LOTS dan HOTS. Bagi merata: sekitar 40% LOTS (C1-C3) dan 60% HOTS (C4-C6).'
    }[config.level] || '';

    const prompt = `
Buat ${config.count} soal evaluasi berkualitas tinggi.

## KONTEKS
- Mata Pelajaran: ${subject}
- Topik: ${topic}
- Kelas: ${grade}
- ${contextSource}

## MANDAT KHUSUS
- Seluruh butir soal (${config.count} soal) wajib berfokus 100% pada aspek kompetensi mata pelajaran "${subject}" dan topik "${topic}".
- Jangan membuat soal yang melenceng ke mata pelajaran lain. Kaidah bahasa, pemahaman teks, dan evaluasi harus mengikuti konteks "${subject}".

## KONFIGURASI SOAL
- Jumlah Total: ${config.count} soal
- Distribusi per Tipe: ${distribution}
- Level Kognitif: ${levelInstruction}

## ATURAN WAJIB (BACA DENGAN TELITI)

### Aturan Umum
1. Setiap soal WAJIB relevan dengan topik "${topic}" dan jenjang ${grade}.
2. Teks soal harus jelas, tidak ambigu, dan menggunakan bahasa Indonesia baku.
3. Satu soal hanya menanyakan SATU hal (tidak majemuk).
4. Stimulus (bacaan/grafik/kasus) HANYA untuk soal PG dan PG Kompleks, dan tidak wajib semua soal.

### Aturan Pilihan Ganda & PG Kompleks — PALING KRITIS
- Field "options" WAJIB diisi LANGSUNG dengan teks jawaban, TANPA prefix huruf.
- BENAR: ["Proses fotosintesis", "Proses respirasi", "Proses fermentasi", "Proses transpirasi"]
- SALAH: ["A. Proses fotosintesis", "B. Proses respirasi", ...] ← DILARANG KERAS
- Field "answerKey" untuk PG: 1 huruf saja ("A", "B", "C", atau "D")
- Field "answerKey" untuk PG Kompleks: huruf-huruf benar dipisah koma ("A, C" atau "B, D")

### Aturan Menjodohkan
- Minimal 5 pasang (matchingPairs)
- Nilai "right" pada setiap pasang WAJIB unik
- answerKey format: "1-C, 2-A, 3-E, 4-B, 5-D"

### Aturan Benar/Salah
- Buat PERNYATAAN (bukan pertanyaan)
- answerKey: tepat "Benar" atau "Salah"

### Aturan Isian Singkat
- answerKey: kata kunci jawaban (1-5 kata)

### Aturan Uraian
- answerKey: rubrik jawaban 2-4 kalimat (poin-poin kunci)

## CONTOH BENAR vs SALAH

Soal PG yang BENAR:
{
  "number": 1,
  "type": "Pilihan Ganda",
  "question": "Organ pencernaan yang menghasilkan enzim pepsin adalah...",
  "options": ["Mulut", "Lambung", "Usus halus", "Pankreas"],
  "answerKey": "B"
}

Soal PG yang SALAH (JANGAN BUAT SEPERTI INI):
{
  "options": ["A. Mulut", "B. Lambung", "C. Usus halus", "D. Pankreas"],
  "answerKey": "B. Lambung"
}

---
Output JSON valid. Buat ${config.count} soal yang seluruhnya relevan dengan topik "${topic}".
`;

    const schema = {
        type: Type.OBJECT,
        properties: {
            items: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        number: { type: Type.INTEGER },
                        type: {
                            type: Type.STRING,
                            description: "Exactly one of: 'Pilihan Ganda', 'Pilihan Ganda Kompleks', 'Menjodohkan', 'Benar/Salah', 'Isian Singkat', 'Uraian'"
                        },
                        stimulus: {
                            type: Type.STRING,
                            nullable: true,
                            description: "Optional reading passage/case. Only for Pilihan Ganda and Pilihan Ganda Kompleks."
                        },
                        question: { type: Type.STRING },
                        options: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            nullable: true,
                            description: "For PG/PGK only. MUST contain plain text without any letter prefix like 'A.', 'B.', etc."
                        },
                        matchingPairs: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    left: { type: Type.STRING },
                                    right: { type: Type.STRING }
                                },
                                required: ["left", "right"]
                            },
                            nullable: true,
                            description: "For Menjodohkan only. All 'right' values must be unique."
                        },
                        answerKey: {
                            type: Type.STRING,
                            description: "PG: single letter 'A'/'B'/'C'/'D'. PGK: letters with comma 'A, C'. Menjodohkan: '1-C, 2-A, 3-B'. Benar/Salah: 'Benar' or 'Salah'. Isian Singkat: keyword answer. Uraian: scoring rubric points."
                        }
                    },
                    required: ["number", "type", "question", "answerKey"]
                }
            }
        },
        required: ["items"]
    };

    const result = await tryGenerate(QUESTION_BANK_INSTRUCTION, prompt, schema);

    // ▼ Post-processing: Bersihkan prefix huruf dari options jika AI masih generate dengan prefix
    if (result?.items) {
        result.items = result.items.map((q: any) => {
            // Bersihkan prefix dari options PG/PGK
            if (q.options && Array.isArray(q.options)) {
                q.options = q.options.map((opt: string) =>
                    String(opt).replace(/^[A-Ea-e][\.\)]\s*/g, '').trim()
                );
            }
            // Normalisasi answerKey Benar/Salah
            if (q.type === 'Benar/Salah') {
                const key = String(q.answerKey).toLowerCase().trim();
                if (key === 'true' || key === 'benar' || key === 'b') q.answerKey = 'Benar';
                else if (key === 'false' || key === 'salah' || key === 's') q.answerKey = 'Salah';
            }
            // Normalisasi answerKey PG: ambil hanya huruf pertama jika AI tulis "A. Fotosintesis"
            if (q.type === 'Pilihan Ganda') {
                const key = String(q.answerKey).trim();
                if (key.length > 1 && /^[A-Da-d][\.\)]/i.test(key)) {
                    q.answerKey = key[0].toUpperCase();
                }
            }
            return q;
        });

        // Filter tipe yang tidak diminta (lebih toleran: case-insensitive + trim)
        const allowedTypes = new Set(config.types.map(t => t.toLowerCase().trim()));
        const validItems = result.items.filter((q: any) =>
            allowedTypes.has(String(q.type).toLowerCase().trim())
        );

        // Jika filter terlalu agresif dan hasilkan < 50% soal, gunakan semua
        result.items = validItems.length >= result.items.length * 0.5
            ? validItems
            : result.items;
    }

    return result;
};

// ============================================================================
// PATCH: refineDocument di geminiService.ts
// Ganti fungsi refineDocument yang ada (sekitar line 1003).
//
// Perubahan kunci:
// 1. Tiap target pakai System Instruction yang TEPAT (bukan DEEP_LEARNING_INSTRUCTION untuk semua)
// 2. Prompt menekankan "HANYA ubah yang diminta, pertahankan sisanya"
// 3. Skip cache untuk refine (selalu fresh generate)
// 4. Schema tetap sama (kompatibel dengan UI yang sudah ada)
// ============================================================================

// ▼ TAMBAHKAN konstanta ini jika belum ada (dari patch sebelumnya)
// Jika sudah ada LKPD_INSTRUCTION dan QUESTION_BANK_INSTRUCTION, skip bagian ini.

/*
const LKPD_INSTRUCTION = `...`;     // dari PATCH_generateLKPD_v2.ts
const QUESTION_BANK_INSTRUCTION = `...`;  // dari PATCH_generateQuestionBank.ts
*/

// ▼ Tambahkan konstanta instruction khusus untuk refine
const REFINE_INSTRUCTION = `
Anda adalah Pakar Kurikulum yang bertugas MEMPERBAIKI dokumen pembelajaran yang sudah ada.

ATURAN MUTLAK:
1. Gunakan kata "Murid", bukan "Siswa".
2. Output WAJIB 100% JSON valid sesuai Schema.
3. ANDA HANYA BOLEH MENGUBAH BAGIAN YANG DIMINTA PENGGUNA.
4. Bagian yang TIDAK disebutkan dalam saran perbaikan WAJIB dipertahankan persis seperti data aslinya.
5. JANGAN menulis ulang seluruh dokumen — salin data lama dan hanya ubah yang relevan.
6. Jika saran perbaikan ambigu, interpretasikan secara konservatif — ubah sesedikit mungkin.
`;

// ▼ GANTI fungsi refineDocument
export const refineDocument = async (
    data: GeneratedLessonPlan,
    target: 'RPP' | 'MATERI' | 'LKPD' | 'SOAL',
    feedback: string
): Promise<any> => {
    let schema: any;
    let systemInstruction: string;

    // ▼ Header prompt yang sama untuk semua target
    const header = `
# TUGAS: PERBAIKI DOKUMEN BERDASARKAN SARAN PENGGUNA

## SARAN PERBAIKAN DARI PENGGUNA:
"${feedback}"

## ATURAN PERBAIKAN (WAJIB DIPATUHI):
1. BACA saran perbaikan di atas dengan seksama.
2. IDENTIFIKASI bagian mana saja yang perlu diubah berdasarkan saran tersebut.
3. UBAH HANYA bagian yang relevan dengan saran — sisanya SALIN PERSIS dari data asli.
4. JANGAN menghapus atau mengubah bagian yang tidak disebutkan dalam saran.
5. Output WAJIB JSON valid sesuai schema, lengkap semua field.

`;

    if (target === 'RPP') {
        const docData = {
            identitySection: data.identitySection,
            initialAssessment: data.initialAssessment,
            graduateProfile: data.graduateProfile,
            design: data.design,
            learningExperience: data.learningExperience,
            assessment: data.assessment,
            reflection: data.reflection
        };

        const prompt = header + `
## DATA DOKUMEN RPP SAAT INI (SALIN BAGIAN YANG TIDAK DIUBAH):
${JSON.stringify(docData, null, 2)}

## INSTRUKSI TAMBAHAN UNTUK RPP:
- Kegiatan Inti WAJIB tetap menggunakan struktur: memahami → mengaplikasi → merefleksi.
- Jika saran meminta ubah model pembelajaran, integrasikan sintaks baru KE DALAM narasi 3 tahap tersebut.
- Field prinsip (introPrinciple, corePrinciple, closingPrinciple) HANYA boleh berisi: "Berkesadaran", "Bermakna", "Mengembirakan", atau kombinasi 2 dengan "dan".
- Dimensi Profil Lulusan HANYA dari 8 dimensi resmi.
- Jika saran hanya menyebut 1 pertemuan, JANGAN ubah pertemuan lainnya — salin persis.
`;

        systemInstruction = REFINE_INSTRUCTION + `\n\nKonteks tambahan: Ini adalah dokumen RPP/Modul Ajar Kurikulum Merdeka dengan pendekatan Pembelajaran Mendalam (Deep Learning).`;

        schema = {
            type: Type.OBJECT,
            properties: {
                identitySection: { type: Type.OBJECT, properties: { schoolName: {type: Type.STRING}, subject: {type: Type.STRING}, grade: {type: Type.STRING}, semester: {type: Type.STRING}, timeAllocation: {type: Type.STRING}, meetingCount: {type: Type.STRING}, topic: {type: Type.STRING} } },
                initialAssessment: { type: Type.STRING },
                graduateProfile: { type: Type.ARRAY, items: { type: Type.STRING } },
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
                assessment: { type: Type.OBJECT, properties: { kktp: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { criteria: { type: Type.STRING }, needsGuidance: { type: Type.STRING }, basic: { type: Type.STRING }, proficient: { type: Type.STRING, description: "WAJIB MENGANDUNG DESKRIPSI (TIDAK BOLEH STRING KOSONG)." }, advanced: { type: Type.STRING } }, required: ["criteria", "needsGuidance", "basic", "proficient", "advanced"] } }, formative: { type: Type.OBJECT, properties: { checklist: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { aspect: { type: Type.STRING }, indicator: { type: Type.STRING } } } }, feedbackGuide: { type: Type.OBJECT, properties: { clarification: { type: Type.STRING }, appreciation: { type: Type.STRING }, suggestion: { type: Type.STRING } } } } }, summative: { type: Type.OBJECT, properties: { grid: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { indicator: { type: Type.STRING }, level: { type: Type.STRING }, technique: { type: Type.STRING } } } } } }, intervention: { type: Type.OBJECT, properties: { needsGuidance: { type: Type.STRING }, basic: { type: Type.STRING }, proficient: { type: Type.STRING }, advanced: { type: Type.STRING } }, required: ["needsGuidance", "basic", "proficient", "advanced"] } }, nullable: true },
                reflection: { type: Type.OBJECT, properties: { teacher: { type: Type.ARRAY, items: { type: Type.STRING } }, student: { type: Type.ARRAY, items: { type: Type.STRING } } }, nullable: true },
                approval: { type: Type.OBJECT, properties: { location: { type: Type.STRING }, date: { type: Type.STRING }, authorName: { type: Type.STRING }, authorNip: { type: Type.STRING }, principalName: { type: Type.STRING }, principalNip: { type: Type.STRING } } }
            },
            required: ["identitySection", "design", "learningExperience", "graduateProfile"]
        };

    } else if (target === 'MATERI') {
        const prompt = header + `
## DATA MATERI AJAR SAAT INI (SALIN BAGIAN YANG TIDAK DIUBAH):
${JSON.stringify(data.materials, null, 2)}

## INSTRUKSI TAMBAHAN UNTUK MATERI:
- Field tabelVisual WAJIB berupa string markdown table (bukan objek JSON).
- Jika saran hanya menyebut 1 bagian (misal "perbaiki glosarium"), salin semua field lain persis.
`;

        systemInstruction = REFINE_INSTRUCTION;

        schema = {
            type: Type.OBJECT,
            properties: {
                judul: { type: Type.STRING },
                pemantik: { type: Type.STRING },
                subTopik: { type: Type.ARRAY, items: { type: Type.STRING } },
                konsepInti: { type: Type.OBJECT, properties: {
                    definisi: { type: Type.STRING },
                    penjelasanBertahap: { type: Type.ARRAY, items: { type: Type.STRING } },
                    tabelVisual: { type: Type.STRING, description: "Must be a valid markdown table string." },
                    contohKonkret: { type: Type.STRING }
                }},
                trivia: { type: Type.STRING },
                glosarium: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { istilah: { type: Type.STRING }, definisi: { type: Type.STRING } } } }
            }
        };

    } else if (target === 'LKPD') {
        const prompt = header + `
## DATA LKPD SAAT INI (SALIN BAGIAN YANG TIDAK DIUBAH):
${JSON.stringify(data.lkpd, null, 2)}

## INSTRUKSI TAMBAHAN UNTUK LKPD:
- activity1.content HARUS berupa tabel markdown (dengan |, ---, header row). BUKAN narasi.
- activity2.content HARUS berupa pertanyaan diskusi bernomor. BUKAN narasi model pembelajaran.
- DILARANG menyebut nama model pembelajaran (Discovery Learning, PBL, dll) di content aktivitas.
`;

        systemInstruction = REFINE_INSTRUCTION;

        schema = {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING },
                objectives: { type: Type.STRING },
                instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
                stimulus: { type: Type.STRING },
                activities: { type: Type.OBJECT, properties: {
                    activity1: { type: Type.OBJECT, properties: {
                        title: { type: Type.STRING },
                        content: { type: Type.STRING, description: "Must be a valid markdown table." }
                    }},
                    activity2: { type: Type.OBJECT, properties: {
                        title: { type: Type.STRING },
                        content: { type: Type.STRING, description: "Numbered discussion questions in plain text." }
                    }}
                }},
                reflection: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
        };

    } else if (target === 'SOAL') {
        const prompt = header + `
## DATA BANK SOAL SAAT INI (SALIN SOAL YANG TIDAK DIUBAH):
${JSON.stringify(data.questionBank, null, 2)}

## INSTRUKSI TAMBAHAN UNTUK BANK SOAL:
- Field "options" untuk PG/PGK: isi LANGSUNG teks jawaban TANPA prefix huruf (A., B., dll).
- answerKey untuk PG: 1 huruf saja ("A", "B", "C", "D").
- answerKey untuk Benar/Salah: "Benar" atau "Salah".
- Jika saran hanya mengubah beberapa soal, SALIN soal lain persis dari data asli.
`;

        systemInstruction = REFINE_INSTRUCTION + `\n\nKonteks: Anda memperbaiki Bank Soal evaluasi pembelajaran.`;

        schema = {
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
                            options: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true, description: "Plain text options WITHOUT letter prefix." },
                            matchingPairs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { left: { type: Type.STRING }, right: { type: Type.STRING } } }, nullable: true },
                            answerKey: { type: Type.STRING }
                        },
                        required: ["number", "type", "question", "answerKey"]
                    }
                }
            },
            required: ["items"]
        };
    }

    // ▼ KUNCI: Bypass cache untuk refine — selalu fresh generate
    // Kita panggil tryGenerate tapi karena setiap feedback unik,
    // cache HAMPIR pasti miss. Namun untuk amannya, tambahkan timestamp ke signature.
    const timestampedPrompt = prompt! + `\n\n<!-- refine_ts: ${Date.now()} -->`;

    return await tryGenerate(systemInstruction!, timestampedPrompt, schema);
};
