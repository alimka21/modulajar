
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, LKPDData, QuestionBankConfig, QuestionBankData, MaterialsData, DeepLearningAssessment } from '../types';
import { tokenManager } from "./tokenManager";

/**
 * Model fallback strategy:
 * Sistem akan mencoba model urut dari atas ke bawah.
 * Update (Feb 2026): Menggunakan versi stabil Gemini 3 dan 2.5.
 * Versi "-preview" dan seri 2.0/1.5 telah deprecated/removed.
 */
const MODEL_PRIORITY = [
  'gemini-3-flash',
  'gemini-3-pro',
  'gemini-2.5-flash',
  'gemini-2.5-pro'
];

const cleanApiKey = (key: string | null | undefined): string => {
  if (!key) return "";
  return String(key).trim().replace(/[\r\n"']/g, '');
};

const getSystemApiKey = (): string => {
  // process.env.API_KEY di-inject oleh Vite (lihat vite.config.ts)
  const key = process.env.API_KEY;
  return cleanApiKey(key);
};

// MODIFIED: Uses TokenManager instead of params or sessionStorage
const getClientInfo = () => {
  // 1. Cek User Key dari Token Manager (InMemory Singleton)
  const userApiKey = cleanApiKey(tokenManager.getKey());
  
  if (userApiKey && userApiKey.length > 10) {
    return { 
      client: new GoogleGenAI({ apiKey: userApiKey }), 
      apiKeySource: 'custom_token',
      apiKey: userApiKey
    };
  }

  // 2. Fallback ke System Key (Vercel Env)
  const systemKey = getSystemApiKey();
  
  if (!systemKey || systemKey.length < 10) {
    console.error("System API Key missing in Vercel/Env variables.");
    throw new Error("API Key sistem belum dikonfigurasi. Harap masukkan API Key pribadi di Dashboard.");
  }
  
  return { 
    client: new GoogleGenAI({ apiKey: systemKey }), 
    apiKeySource: 'default_system',
    apiKey: systemKey
  };
};

export const validateApiKey = async (rawApiKey: string): Promise<{ success: boolean; message: string }> => {
    const apiKey = cleanApiKey(rawApiKey);
    if (!apiKey) return { success: false, message: "API Key kosong." };

    // UPDATED: Gunakan 'gemini-2.5-flash' untuk tes koneksi.
    const modelToTest = 'gemini-2.5-flash';

    try {
        const ai = new GoogleGenAI({ apiKey: apiKey });

        // Timeout 15 detik
        const TIMEOUT_MS = 15000;
        
        // FIX: Gunakan simple string prompt untuk memastikan respon text selalu ada.
        // Jangan gunakan struktur object {parts: [...]} untuk tes sederhana.
        const fetchPromise = ai.models.generateContent({
            model: modelToTest, 
            contents: "Say Hello", 
        });

        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout (${TIMEOUT_MS}ms)`)), TIMEOUT_MS)
        );

        const response: any = await Promise.race([fetchPromise, timeoutPromise]);
        
        // Debugging di console browser (F12)
        console.log("[Validation Response]", response);

        if (response && response.text) {
             return { success: true, message: `✅ Koneksi Berhasil! (Model: ${modelToTest})` };
        }
        
        // Analisa detail jika gagal mendapatkan text
        if (response?.candidates?.length === 0) {
             return { success: false, message: "❌ Server merespon tapi jawaban kosong (Safety Filter/Blocked)." };
        }
        
        return { success: false, message: "❌ Tidak ada respon teks dari server AI." };

    } catch (error: any) {
        console.error("[Validation Error]", error);
        const errorMsg = (error.message || String(error)).toLowerCase();
        
        if (errorMsg.includes("failed to fetch") || errorMsg.includes("network error") || errorMsg.includes("typeerror")) {
            return { success: false, message: "❌ Gagal Terhubung (Network Error). Periksa internet/DNS Anda." };
        }
        if (errorMsg.includes("400") || errorMsg.includes("invalid_argument") || errorMsg.includes("invalid api key")) {
             return { success: false, message: "❌ API Key Salah / Format Tidak Valid." };
        }
        if (errorMsg.includes("403") || errorMsg.includes("permission_denied")) {
             return { success: false, message: "❌ API Key Ditolak (403). Cek batasan IP/Project di Google Console." };
        }
        if (errorMsg.includes("401") || errorMsg.includes("unauthenticated")) {
             return { success: false, message: "❌ API Key Tidak Dikenal (401)." };
        }
        if (errorMsg.includes("404") || errorMsg.includes("not_found")) {
             return { success: false, message: `❌ Model AI Tidak Ditemukan (404).` };
        }
        if (errorMsg.includes("429") || errorMsg.includes("quota")) {
             return { success: false, message: "❌ Kuota API Key Habis (429)." };
        }
        
        return { success: false, message: `❌ Error: ${errorMsg.substring(0, 100)}...` };
    }
};

// --- HELPER KOMPLEKSITAS ---
const getComplexityInstruction = (grade: string): string => {
    const g = grade.toLowerCase();
    
    // SMA / Fase F (Tinggi)
    if (g.includes('fase f') || g.includes('xii') || g.includes('xi')) {
        return "TINGKAT KOMPLEKSITAS: TINGGI (High School / Advanced). Gunakan bahasa akademis, analisis mendalam, HOTS Level C4-C6 (Menganalisis, Mengevaluasi, Mencipta), dan studi kasus yang kompleks.";
    }
    // SMA / Fase E
    if (g.includes('fase e') || g.includes('kelas x')) {
        return "TINGKAT KOMPLEKSITAS: MENENGAH-TINGGI (High School). Fokus pada pemahaman konsep abstrak dan aplikasi kontekstual.";
    }
    // SMP / Fase D
    if (g.includes('fase d') || g.includes('vii') || g.includes('viii') || g.includes('ix')) {
        return "TINGKAT KOMPLEKSITAS: MENENGAH (Middle School). Bahasa lugas, fokus pada eksplorasi dan aplikasi konsep.";
    }
    // SD / Fase A, B, C
    if (g.includes('fase a') || g.includes('fase b') || g.includes('fase c') || g.includes('sd')) {
        return "TINGKAT KOMPLEKSITAS: DASAR (Elementary). Gunakan bahasa konkret, sederhana, mudah dipahami anak, dan instruksi yang sangat jelas.";
    }
    
    return "TINGKAT KOMPLEKSITAS: Sesuaikan dengan jenjang pendidikan yang diinput.";
};

const DEEP_LEARNING_INSTRUCTION = `
Anda adalah Pakar Kurikulum & Deep Learning.
Tugas: Menyusun Modul Ajar dan konten pembelajaran berkualitas tinggi.

ATURAN STRICT (JANGAN DILANGGAR):
1. TERMINOLOGI:
   Gunakan kata "Murid" (bukan siswa/peserta didik). Gunakan huruf kapital standar (Sentence case).

2. FORMAT MATEMATIKA & LATEX (SANGAT PENTING):
   - DILARANG MENGGUNAKAN LaTeX ($...$) untuk:
     * Operasi aritmatika dasar (+, -, x, :, =, %)
     * Mata uang (Rp)
     * Teks biasa atau variabel sederhana
   - Gunakan LaTeX ($...$) HANYA untuk rumus kompleks (integral, akar, pangkat, sigma).

3. LANGKAH PEMBELAJARAN:
   Instruksi harus detail per aksi (Micro-steps). Pilih prinsip: "Berkesadaran", "Bermakna", atau "Mengembirakan".

4. FORMAT TABEL:
   Jika diminta membuat tabel, gunakan format Markdown Table standar.
   
Output wajib JSON valid sesuai Schema.
`;

// INSTRUKSI KHUSUS ASESMEN
const ASSESSMENT_INSTRUCTION = `
Anda adalah Pakar Penilaian & Deep Learning.
Tugas: Menyusun Asesmen Pembelajaran berkualitas tinggi.

ATURAN STRICT:
1. KKTP (Kriteria Ketercapaian Tujuan Pembelajaran):
   - Cantumkan 4 level: Perlu Bimbingan, Dasar, Profisien, Mahir
   - Setiap criteria WAJIB punya indicator yang jelas

2. PENILAIAN FORMATIF:
   - Checklist: Aspek + Indikator
   - Feedback Guide: Klarifikasi (koreksi), Apresiasi (pujian), Saran (improvement)

3. PENILAIAN SUMATIF:
   - Grid: Indikator, Level (1-4), Teknik (Tes Tulis, Wawancara, Praktik, dll)

4. PROGRAM INTERVENSI:
   - Untuk setiap level: Perlu Bimbingan, Dasar, Profisien, Mahir
   - Intervensi konkret, bukan hanya penjelasan

5. TERMINOLOGI:
   - Gunakan kata "Murid"

6. OUTPUT: JSON VALID dengan structure yang tepat.
`;

/**
 * HEDGED REQUEST STRATEGY (PARALLEL RACING)
 * Strategy: A starts -> 8s -> B starts. First success wins.
 */
const generateWithHedging = async (
    client: GoogleGenAI, 
    model: string, 
    prompt: string, 
    config: any
): Promise<any> => {
    const HEDGE_DELAY_MS = 8000; // 8 Seconds Delay for Backup Request

    return new Promise((resolve, reject) => {
        let isResolved = false;
        
        // Helper: Standard Request Execution
        const executeRequest = async (tag: string) => {
            try {
                console.log(`[Hedging] Request ${tag} started (${model})...`);
                const response = await client.models.generateContent({
                    model: model,
                    contents: prompt,
                    config: config
                });
                
                if (!isResolved && response && response.text) {
                    isResolved = true;
                    console.log(`[Hedging] Request ${tag} WON.`);
                    resolve(JSON.parse(response.text));
                }
            } catch (e) {
                console.warn(`[Hedging] Request ${tag} failed.`, e);
                // Don't reject immediately, wait for other hedge
            }
        };

        // 1. Primary Request
        executeRequest('PRIMARY');

        // 2. Backup Request (Delayed)
        setTimeout(() => {
            if (!isResolved) {
                executeRequest('BACKUP');
            }
        }, HEDGE_DELAY_MS);

        // Fallback Timeout (Total 45s)
        setTimeout(() => {
            if (!isResolved) {
                reject(new Error("Timeout: Server terlalu sibuk. Coba lagi."));
            }
        }, 45000);
    });
};

const tryGenerate = async (systemInstruction: string, userPrompt: string, responseSchema: any): Promise<any> => {
    const { client, apiKey } = getClientInfo();
    
    let lastError = null;

    for (const model of MODEL_PRIORITY) {
        try {
            console.log(`Trying Model: ${model} with Key: ${apiKey.substring(0,8)}...`);
            
            // USE HEDGING for faster response on supported models
            if (model.includes('flash')) {
                return await generateWithHedging(client, model, userPrompt, {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                    systemInstruction: systemInstruction,
                    temperature: 0.7, // Creativity balance
                });
            } else {
                // Standard await for Pro models (usually stricter rate limits)
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
                return JSON.parse(response.text || "{}");
            }

        } catch (error: any) {
            console.warn(`Model ${model} failed:`, error);
            lastError = error;
            
            // Stop if Auth error (useless to retry other models with same key)
            if (String(error).includes("403") || String(error).includes("API key")) {
                throw new Error("API Key tidak valid atau ditolak. Periksa konfigurasi.");
            }
            
            // Continue to next model in priority list...
        }
    }

    throw new Error(`Gagal generate konten. ${lastError?.message || "Server sibuk."}`);
};

export const generateRPP = async (school: SchoolIdentity, lesson: LessonIdentity): Promise<GeneratedLessonPlan> => {
  const complexity = getComplexityInstruction(lesson.grade);
  
  const prompt = `
    IDENTITAS:
    - Mapel: ${lesson.subject}
    - Kelas: ${lesson.grade}
    - Topik: ${lesson.topic}
    - Tujuan: ${lesson.objectives}
    - Jumlah Pertemuan: ${lesson.meetingCount}
    - Alokasi Waktu: ${lesson.timeAllocation}

    DETAIL TAMBAHAN:
    - Asesmen Awal: ${lesson.initialAssessment}
    - Profil Lulusan: ${lesson.graduateProfileDimensions.join(', ')}
    - Model: ${lesson.pedagogicalPractice}
    - Lingkungan: ${lesson.learningEnvironment}
    - Digital: ${lesson.digitalUtilization}
    - Kemitraan: ${lesson.learningPartnership}

    ${complexity}

    INSTRUKSI GENERASI:
    Buat Modul Ajar lengkap sesuai input di atas. 
    Pastikan "Langkah Pembelajaran" dibagi menjadi ${lesson.meetingCount || "1 Pertemuan"}.
    Untuk setiap pertemuan, rincian langkah (Pendahuluan, Inti, Penutup) harus detail.
    Kegiatan Inti wajib menggunakan alur: Memahami -> Mengaplikasi -> Merefleksi.
  `;

  const schema = {
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
      reflection: { type: Type.OBJECT, properties: { teacher: { type: Type.ARRAY, items: { type: Type.STRING } }, student: { type: Type.ARRAY, items: { type: Type.STRING } } } },
      approval: { type: Type.OBJECT, properties: { location: { type: Type.STRING }, date: { type: Type.STRING }, authorName: { type: Type.STRING }, authorNip: { type: Type.STRING }, principalName: { type: Type.STRING }, principalNip: { type: Type.STRING } } }
    },
    required: ["identitySection", "design", "learningExperience"]
  };

  const result = await tryGenerate(DEEP_LEARNING_INSTRUCTION, prompt, schema);
  
  // Merge hasil AI dengan data input manual untuk memastikan konsistensi
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
    const prompt = `
      Buat instrumen asesmen lengkap untuk modul ini:
      Topik: ${data.identitySection.topic}
      Tujuan: ${data.design.objectives.join(', ')}
      Jenjang: ${data.identitySection.grade}

      Komponen yang diminta:
      1. KKTP (Rubrik) - 4 Level (Perlu Bimbingan, Dasar, Profisien, Mahir)
      2. Formatif (Checklist Observasi & Panduan Feedback)
      3. Sumatif (Kisi-kisi soal)
      4. Rencana Intervensi (Tindak lanjut per level kemampuan)
    `;

    const schema = {
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
                    } 
                } 
            },
            formative: {
                type: Type.OBJECT,
                properties: {
                    checklist: { 
                        type: Type.ARRAY, 
                        items: { type: Type.OBJECT, properties: { aspect: { type: Type.STRING }, indicator: { type: Type.STRING } } } 
                    },
                    feedbackGuide: { 
                        type: Type.OBJECT, 
                        properties: { clarification: { type: Type.STRING }, appreciation: { type: Type.STRING }, suggestion: { type: Type.STRING } } 
                    }
                }
            },
            summative: {
                type: Type.OBJECT,
                properties: {
                    grid: { 
                        type: Type.ARRAY, 
                        items: { type: Type.OBJECT, properties: { indicator: { type: Type.STRING }, level: { type: Type.STRING }, technique: { type: Type.STRING } } } 
                    }
                }
            },
            intervention: {
                type: Type.OBJECT,
                properties: { needsGuidance: { type: Type.STRING }, basic: { type: Type.STRING }, proficient: { type: Type.STRING }, advanced: { type: Type.STRING } }
            }
        }
    };

    return await tryGenerate(ASSESSMENT_INSTRUCTION, prompt, schema);
};

export const generateMaterials = async (data: GeneratedLessonPlan): Promise<MaterialsData> => {
    const prompt = `
      Buat Materi Ajar yang menarik dan mendalam (Deep Learning).
      Topik: ${data.identitySection.topic}
      Tujuan: ${data.design.objectives.join(', ')}
      Jenjang: ${data.identitySection.grade}

      STRUKTUR:
      1. Judul Menarik
      2. Pertanyaan Pemantik (Provokatif/Menantang)
      3. Konsep Inti (Definisi & Penjelasan Bertahap)
      4. Visualisasi Data (Tabel/Diagram dalam bentuk teks Markdown Table)
      5. Contoh Konkret (Dunia Nyata)
      6. Trivia / Tahukah Kamu?
      7. Glosarium
    `;

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
                    tabelVisual: { type: Type.STRING, description: "Markdown Table String representing visual data" }, 
                    contohKonkret: { type: Type.STRING } 
                } 
            },
            trivia: { type: Type.STRING },
            glosarium: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { istilah: { type: Type.STRING }, definisi: { type: Type.STRING } } } }
        }
    };

    return await tryGenerate(DEEP_LEARNING_INSTRUCTION, prompt, schema);
};

export const generateLKPD = async (data: GeneratedLessonPlan): Promise<LKPDData> => {
    const prompt = `
      Buat Lembar Kerja Peserta Didik (LKPD) yang aktif dan kolaboratif.
      Topik: ${data.identitySection.topic}
      Jenjang: ${data.identitySection.grade}

      ISI LKPD:
      1. Identitas & Tujuan
      2. Stimulus (Teks/Kasus/Gambar Deskriptif)
      3. Aktivitas 1: Pemahaman Konsep (Individu/Berpasangan) - Gunakan format isian/tabel
      4. Aktivitas 2: Aplikasi & Diskusi (Kelompok) - Studi Kasus atau Proyek Mini
      5. Refleksi Diri
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
                    activity1: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, content: { type: Type.STRING, description: "Markdown content (tables allowed)" } } },
                    activity2: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, content: { type: Type.STRING, description: "Markdown content (tables allowed)" } } }
                }
            },
            reflection: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
    };

    return await tryGenerate(DEEP_LEARNING_INSTRUCTION, prompt, schema);
};

export const generateQuestionBank = async (data: GeneratedLessonPlan, config: QuestionBankConfig): Promise<QuestionBankData> => {
    
    // 1. Ekstrak Sub-Topik (Context Injection) untuk menghindari "Padding" / Soal Repetitif
    // Jika materi ajar belum digenerate, gunakan Tujuan Pembelajaran sebagai fallback
    const contextSource = data.materials?.subTopik && data.materials.subTopik.length > 0 
        ? `SUB-TOPIK MATERI: \n${data.materials.subTopik.map(s => `- ${s}`).join('\n')}`
        : `TUJUAN PEMBELAJARAN: \n${data.design.objectives.map(o => `- ${o}`).join('\n')}`;

    // 2. Strict Constraint Prompting
    const prompt = `
      TUGAS: Buat Bank Soal Evaluasi.
      Mata Pelajaran: ${data.identitySection.subject}
      Topik Utama: ${data.identitySection.topic}
      Jenjang: ${data.identitySection.grade}
      
      ${contextSource}

      KONFIGURASI SOAL (STRICT):
      1. JUMLAH SOAL: WAJIB TEPAT ${config.count} butir soal. (DILARANG KURANG/LEBIH)
      2. TIPE SOAL YANG DIIZINKAN: ${config.types.join(', ')}.
      3. LEVEL KOGNITIF: ${config.level} (Sesuaikan kompleksitas soal).
      4. DISTRIBUSI: Bagikan jumlah soal secara proporsional untuk setiap tipe yang diminta.
      
      QUALITY CONTROL:
      - Variasi Soal: Gunakan daftar Sub-Topik/Tujuan di atas agar soal TIDAK MENUMPUK di satu aspek saja.
      - Pilihan Ganda: Opsi pengecoh (distractor) harus logis.
      - Uraian: Kunci jawaban harus memuat poin-poin penting penilaian.
      - Hindari soal yang hanya menanyakan definisi hafalan, fokus pada pemahaman dan aplikasi.

      VALIDASI OUTPUT:
      Sebelum mengakhiri respon, hitung kembali jumlah item dalam array 'items'. Harus berjumlah ${config.count}.
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
                        type: { type: Type.STRING, enum: ['Pilihan Ganda', 'Pilihan Ganda Kompleks', 'Menjodohkan', 'Benar/Salah', 'Isian Singkat', 'Uraian'] },
                        stimulus: { type: Type.STRING, nullable: true },
                        question: { type: Type.STRING },
                        options: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
                        matchingPairs: { 
                            type: Type.ARRAY, 
                            items: { type: Type.OBJECT, properties: { left: { type: Type.STRING }, right: { type: Type.STRING } } }, 
                            nullable: true 
                        },
                        answerKey: { type: Type.STRING }
                    },
                    required: ["type", "question", "answerKey"]
                }
            }
        }
    };

    const result = await tryGenerate(DEEP_LEARNING_INSTRUCTION, prompt, schema);

    // --- SERVER-SIDE VALIDATION & FILTERING (DOUBLE SAFETY) ---
    // Pastikan AI tidak halusinasi mengirim tipe soal yang tidak diminta
    if (result && result.items) {
        const allowedTypes = new Set(config.types);
        
        // Filter: Hanya loloskan soal dengan tipe yang ada di config
        result.items = result.items.filter((q: any) => allowedTypes.has(q.type));
        
        // Strict Check Jumlah
        if (result.items.length !== config.count) {
             throw new Error(`AI menghasilkan tipe soal tidak sesuai konfigurasi (Ditemukan ${result.items.length}, Diminta ${config.count}). Silakan generate ulang.`);
        }
    }

    return result;
};
