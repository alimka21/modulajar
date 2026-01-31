
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, LKPDData, QuestionBankConfig, QuestionBankData, MaterialsData, DeepLearningAssessment } from '../types';
import { GRADUATE_PROFILE_DIMENSIONS } from '../constants';

/**
 * Model fallback strategy:
 * Sistem akan mencoba model urut dari atas ke bawah.
 */
const MODEL_PRIORITY = [
  'gemini-3-flash-preview', 
  'gemini-2.0-flash-exp',   
  'gemini-1.5-flash',       
  'gemini-1.5-pro'          
];

const cleanApiKey = (key: string | null | undefined): string => {
  if (!key) return "";
  return String(key).trim().replace(/[\r\n"']/g, '');
};

const getEnvApiKey = (): string => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
      // @ts-ignore
      return import.meta.env.VITE_API_KEY;
    }
  } catch (e) {
    console.warn("Gagal membaca env var:", e);
  }
  return "";
};

const getClientInfo = () => {
  let rawSessionKey = sessionStorage.getItem('custom_api_key');
  let apiKeySource: 'custom' | 'default' = 'default';
  
  let apiKey = cleanApiKey(rawSessionKey);

  if (apiKey && apiKey.length > 10) {
    apiKeySource = 'custom';
    return { 
      client: new GoogleGenAI({ apiKey: apiKey }), 
      apiKeySource,
      apiKey: apiKey
    };
  }

  const rawEnvKey = getEnvApiKey();
  apiKey = cleanApiKey(rawEnvKey);
  
  if (!apiKey || apiKey.length < 10) {
    throw new Error("API Key tidak ditemukan. Harap masukkan API Key di Dashboard atau cek konfigurasi Vercel.");
  }
  
  return { 
    client: new GoogleGenAI({ apiKey: apiKey }), 
    apiKeySource,
    apiKey: apiKey
  };
};

export const validateApiKey = async (rawApiKey: string): Promise<{ success: boolean; message: string }> => {
    const apiKey = cleanApiKey(rawApiKey);
    if (!apiKey) return { success: false, message: "API Key kosong." };

    const ai = new GoogleGenAI({ apiKey: apiKey });
    const modelsToTest = ['gemini-3-flash-preview', 'gemini-2.0-flash-exp', 'gemini-1.5-flash'];
    let lastErrorMsg = "";

    for (const model of modelsToTest) {
        try {
            const response = await ai.models.generateContent({
                model: model, 
                contents: 'Tes koneksi',
                config: { maxOutputTokens: 1 }
            });
            if (response) return { success: true, message: `✅ Koneksi Berhasil! (Model: ${model})` };
        } catch (error: any) {
            lastErrorMsg = error.message || JSON.stringify(error);
            const errorStr = lastErrorMsg.toLowerCase();
            if (errorStr.includes("400") || errorStr.includes("invalid_argument") || errorStr.includes("api key not valid")) {
                return { success: false, message: "❌ API Key Salah (400)." };
            }
        }
    }
    return { success: false, message: `❌ Validasi Gagal: ${lastErrorMsg.substring(0, 80)}...` };
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
   Gunakan kata "MURID" (bukan siswa/peserta didik).

2. PRINSIP PEMBELAJARAN:
   Pada langkah pembelajaran, pilih prinsip: "Berkesadaran", "Bermakna", atau "Mengembirakan".

3. LANGKAH PEMBELAJARAN (MICRO-STEPS):
   Instruksi harus detail per aksi (Micro-steps).

4. FORMAT MATEMATIKA (LATEX):
   Gunakan format $...$ untuk rumus. Contoh: $x^2$.

5. FORMAT TABEL:
   Jika diminta membuat tabel, gunakan format Markdown Table standar.
   
Output wajib JSON valid sesuai Schema.
`;

const generateWithRetry = async (
  prompt: string, 
  schema: Schema, 
  systemInstruction: string = DEEP_LEARNING_INSTRUCTION,
): Promise<any> => {
  let clientInfo: any;
  let lastError: any = null;

  for (let i = 0; i < MODEL_PRIORITY.length; i++) {
    const currentModel = MODEL_PRIORITY[i];
    try {
      clientInfo = getClientInfo();
      const { client } = clientInfo;
      console.log(`[Generate] Trying model: ${currentModel}`);

      const response = await client.models.generateContent({
        model: currentModel,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          systemInstruction: systemInstruction,
          temperature: 0.7, 
          maxOutputTokens: 8000,
        }
      });

      if (!response.text) throw new Error("Empty response");
      let cleanText = response.text.trim().replace(/^```json\n/, '').replace(/\n```$/, '').replace(/^```\n/, '');
      return JSON.parse(cleanText);

    } catch (error: any) {
      lastError = error;
      const msg = error.message || "";
      console.warn(`[Generate] Failed with ${currentModel}:`, msg);
      if (msg.includes('401') || msg.includes('API key not valid')) throw new Error("API Key Tidak Valid.");
      if (msg.includes('429') || msg.includes('quota')) throw new Error("Kuota API Habis. Ganti API Key.");
      continue;
    }
  }
  throw lastError || new Error("Gagal generate konten. Server AI sibuk.");
};

// --- WRAPPER FUNCTIONS ---

export const generateRPP = async (schoolData: SchoolIdentity, lessonData: LessonIdentity): Promise<GeneratedLessonPlan> => {
  const meetingNum = parseInt((lessonData.meetingCount || '1').split(' ')[0]) || 1;
  const complexity = getComplexityInstruction(lessonData.grade);
  
  const prompt = `
    Susun MODUL AJAR (RPM) Deep Learning.
    Sekolah: ${schoolData.schoolName}, Mapel: ${lessonData.subject}, Kelas: ${lessonData.grade}, Topik: ${lessonData.topic}
    Tujuan: ${lessonData.objectives}
    Jumlah Pertemuan: ${meetingNum}
    
    ${complexity}
    
    DETAIL:
    1. Prinsip (intro/core/closing): Pilih salah satu -> Berkesadaran, Bermakna, Mengembirakan.
    2. Langkah: Micro-steps (detail per aksi guru/murid).
    3. Math: Gunakan LaTeX ($...$).
    4. Profil Lulusan: List saja dimensinya (contoh: "Bernalar Kritis", "Kreatif"), jangan ada penjelasan.
    5. Praktik Pedagogis: Pilih SATU Model/Metode (misal: PBL), lalu jelaskan singkat dalam 1 paragraf.
    
    Wajib JSON Valid.
  `;
  
  const aiResult = await generateWithRetry(prompt, RPP_SCHEMA);
  
  return {
      ...aiResult,
      approval: {
          location: schoolData.location,
          date: schoolData.date,
          authorName: schoolData.authorName,
          authorNip: schoolData.authorNip,
          principalName: schoolData.principalName,
          principalNip: schoolData.principalNip
      }
  };
};

export const generateMaterials = async (rppData: GeneratedLessonPlan): Promise<MaterialsData> => {
    const complexity = getComplexityInstruction(rppData.identitySection.grade);
    
    // POIN 4: Sertakan Mapel dan Tujuan
    const prompt = `Buat Materi Ajar: ${rppData.identitySection.topic}. 
    Mata Pelajaran: ${rppData.identitySection.subject}.
    Tujuan Pembelajaran: ${rppData.design.objectives.join(", ")}.
    Bahasa untuk MURID. 
    ${complexity}
    
    Aturan Konten:
    1. Penjelasan Bertahap: JANGAN BUAT LANGKAH-LANGKAH/PROSEDUR. Berikan URAIAN MATERI/PENJELASAN KONSEP TOPIK & SUB-TOPIK secara naratif dan mendalam.
    2. Tabel Visual: Bagian ini WAJIB berformat MARKDOWN TABLE. Buatlah rangkuman, perbandingan, atau data penting dalam bentuk tabel yang rapi. Jangan gunakan list atau paragraf untuk bagian ini.
    3. Trivia: Berikan fakta unik yang menarik ("Tahukah Kamu?").
    4. LaTeX ($...$) untuk rumus.
    Output JSON.`;
    return await generateWithRetry(prompt, MATERIALS_SCHEMA);
};

export const generateLKPD = async (rppData: GeneratedLessonPlan): Promise<LKPDData> => {
  const complexity = getComplexityInstruction(rppData.identitySection.grade);
  
  // POIN 4: Sertakan Mapel dan Tujuan
  const prompt = `Buat Lembar Kerja Murid (Tanpa kata "LKPD" di judul): ${rppData.identitySection.topic}.
  Mata Pelajaran: ${rppData.identitySection.subject}.
  Tujuan Pembelajaran: ${rppData.design.objectives.join(", ")}.
  ${complexity}
  
  Aturan:
  1. Petunjuk Pengerjaan: Berikan langkah teknis cara mengerjakan lembar ini.
  2. Aktivitas: Buat 3 level aktivitas (Dasar, Menengah, Lanjut). 
     - JANGAN tuliskan prinsip pembelajaran (Berkesadaran, Bermakna, Mengembirakan) di teks aktivitas. Prinsip hanya untuk guru di RPP.
     - WAJIB: Salah satu aktivitas HARUS berupa TABEL ISIAN (Markdown Table) untuk dikerjakan murid.
     - Sesuaikan kesulitan dengan fase murid.
  3. Gunakan kata "Murid".
  Output JSON.`;
  return await generateWithRetry(prompt, LKPD_SCHEMA);
};

export const generateAssessment = async (rppData: GeneratedLessonPlan): Promise<DeepLearningAssessment> => {
  const complexity = getComplexityInstruction(rppData.identitySection.grade);
  
  // POIN 4: Sertakan Mapel dan Tujuan
  const prompt = `Buat Asesmen Deep Learning: KKTP, Rubrik, Checklist, Kisi-kisi Sumatif. 
  Topik: ${rppData.identitySection.topic}.
  Mata Pelajaran: ${rppData.identitySection.subject}.
  Tujuan Pembelajaran: ${rppData.design.objectives.join(", ")}.
  ${complexity}
  Output JSON.`;
  return await generateWithRetry(prompt, ASSESSMENT_SCHEMA);
};

export const generateQuestionBank = async (rppData: GeneratedLessonPlan, config: QuestionBankConfig): Promise<QuestionBankData> => {
  const complexity = getComplexityInstruction(rppData.identitySection.grade);
  
  // POIN 4: Sertakan Mapel dan Tujuan
  const prompt = `Buat ${config.count} Soal (${config.types.join(', ')}). 
  ${complexity}
  Topik: ${rppData.identitySection.topic}.
  Mata Pelajaran: ${rppData.identitySection.subject}.
  Tujuan Pembelajaran: ${rppData.design.objectives.join(", ")}.
  
  Aturan Khusus:
  1. Menjodohkan: Field 'matchingPairs' wajib diisi array object {left: "pertanyaan/premis", right: "jawaban/pasangan"}.
  2. Benar/Salah: Soal berupa pernyataan.
  3. Gunakan kata "Murid".
  4. LaTeX ($...$) untuk rumus.
  
  Output JSON.`;
  return await generateWithRetry(prompt, QUESTION_BANK_SCHEMA);
};

// --- SCHEMAS ---
const LEARNING_STEP_SCHEMA: Schema = { type: Type.OBJECT, properties: { meetingNo: { type: Type.INTEGER }, intro: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Micro-steps kegiatan awal" }, introPrinciple: { type: Type.STRING, description: "Pilih: Berkesadaran, Bermakna, atau Mengembirakan" }, core: { type: Type.OBJECT, properties: { memahami: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Micro-steps Memahami" }, mengaplikasi: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Micro-steps Mengaplikasi" }, merefleksi: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Micro-steps Merefleksi" } }, required: ['memahami', 'mengaplikasi', 'merefleksi'] }, corePrinciple: { type: Type.STRING, description: "Pilih: Berkesadaran, Bermakna, atau Mengembirakan" }, closing: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Micro-steps kegiatan penutup" }, closingPrinciple: { type: Type.STRING, description: "Pilih: Berkesadaran, Bermakna, atau Mengembirakan" } }, required: ['meetingNo', 'intro', 'introPrinciple', 'core', 'corePrinciple', 'closing', 'closingPrinciple'] };
const RPP_SCHEMA: Schema = { type: Type.OBJECT, properties: { identitySection: { type: Type.OBJECT, properties: { schoolName: { type: Type.STRING }, subject: { type: Type.STRING }, grade: { type: Type.STRING }, semester: { type: Type.STRING }, timeAllocation: { type: Type.STRING }, meetingCount: { type: Type.STRING }, topic: { type: Type.STRING } }, required: ['schoolName', 'subject', 'topic'] }, initialAssessment: { type: Type.STRING }, graduateProfile: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Hanya nama dimensi, tanpa penjelasan" }, design: { type: Type.OBJECT, properties: { objectives: { type: Type.ARRAY, items: { type: Type.STRING } }, pedagogicalPractice: { type: Type.STRING, description: "Satu metode dan penjelasan singkat" }, partnership: { type: Type.STRING }, environment: { type: Type.STRING }, digital: { type: Type.STRING } }, required: ['objectives', 'pedagogicalPractice', 'environment'] }, learningExperience: { type: Type.ARRAY, items: LEARNING_STEP_SCHEMA }, reflection: { type: Type.OBJECT, properties: { teacher: { type: Type.ARRAY, items: { type: Type.STRING } }, student: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['teacher', 'student'] } }, required: ['identitySection', 'design', 'learningExperience', 'reflection'] };
const MATERIALS_SCHEMA: Schema = { type: Type.OBJECT, properties: { judul: { type: Type.STRING }, pemantik: { type: Type.STRING }, subTopik: { type: Type.ARRAY, items: { type: Type.STRING } }, konsepInti: { type: Type.OBJECT, properties: { definisi: { type: Type.STRING }, penjelasanBertahap: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Uraian materi/konsep, bukan langkah kerja" }, tabelVisual: { type: Type.STRING, description: "Markdown Table String Only" }, contohKonkret: { type: Type.STRING } }, required: ['definisi', 'penjelasanBertahap', 'tabelVisual', 'contohKonkret'] }, trivia: { type: Type.STRING }, glosarium: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { istilah: { type: Type.STRING }, definisi: { type: Type.STRING } }, required: ['istilah', 'definisi'] } } }, required: ['judul', 'pemantik', 'subTopik', 'konsepInti', 'trivia', 'glosarium'] };
const LKPD_SCHEMA: Schema = { type: Type.OBJECT, properties: { title: { type: Type.STRING }, objectives: { type: Type.STRING }, instructions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Langkah teknis pengerjaan" }, stimulus: { type: Type.STRING }, activities: { type: Type.OBJECT, properties: { level1: { type: Type.STRING }, level2: { type: Type.STRING }, level3: { type: Type.STRING } }, required: ['level1', 'level2', 'level3'] }, reflection: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ['title', 'objectives', 'instructions', 'stimulus', 'activities', 'reflection'] };
const ASSESSMENT_SCHEMA: Schema = { type: Type.OBJECT, properties: { kktp: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { criteria: { type: Type.STRING }, needsGuidance: { type: Type.STRING }, basic: { type: Type.STRING }, proficient: { type: Type.STRING }, advanced: { type: Type.STRING } }, required: ['criteria', 'needsGuidance', 'basic', 'proficient', 'advanced'] } }, formative: { type: Type.OBJECT, properties: { checklist: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { aspect: { type: Type.STRING }, indicator: { type: Type.STRING } }, required: ['aspect', 'indicator'] } }, feedbackGuide: { type: Type.OBJECT, properties: { clarification: { type: Type.STRING }, appreciation: { type: Type.STRING }, suggestion: { type: Type.STRING } }, required: ['clarification', 'appreciation', 'suggestion'] } }, required: ['checklist', 'feedbackGuide'] }, summative: { type: Type.OBJECT, properties: { grid: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { indicator: { type: Type.STRING }, level: { type: Type.STRING }, technique: { type: Type.STRING } }, required: ['indicator', 'level', 'technique'] } } }, required: ['grid'] }, intervention: { type: Type.OBJECT, properties: { needsGuidance: { type: Type.STRING }, basic: { type: Type.STRING }, proficient: { type: Type.STRING }, advanced: { type: Type.STRING } }, required: ['needsGuidance', 'basic', 'proficient', 'advanced'] } }, required: ['kktp', 'formative', 'summative', 'intervention'] };
const QUESTION_BANK_SCHEMA: Schema = { type: Type.OBJECT, properties: { items: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { number: { type: Type.NUMBER }, type: { type: Type.STRING }, question: { type: Type.STRING }, stimulus: { type: Type.STRING }, options: { type: Type.ARRAY, items: { type: Type.STRING } }, matchingPairs: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { left: { type: Type.STRING }, right: { type: Type.STRING } } } }, answerKey: { type: Type.STRING } }, required: ['number', 'type', 'question', 'answerKey'] } } }, required: ['items'] };
