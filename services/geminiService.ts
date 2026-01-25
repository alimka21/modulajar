import { GoogleGenAI, Type } from "@google/genai";
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, LKPDData, AssessmentItem, KKTPItem, QuestionBankConfig, QuestionBankData, MaterialsData, DeepLearningAssessment } from '../types';

const getClient = () => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// ------------------------------------
// CONTEXT AWARENESS (RAG)
// ------------------------------------
const DEEP_LEARNING_GUIDELINES = `
PRINSIP DASAR PENYUSUNAN MODUL AJAR (WAJIB DIPATUHI):
1. **Istilah Murid**: Gunakan istilah "Murid", BUKAN "Siswa".
2. **Prinsip Pembelajaran**:
   - Pilih HANYA dari daftar ini: (Berkesadaran, Bermakna, Mengembirakan).
3. **Analisis Kompleksitas**:
   - Jika KOMPLEKS (>1 keterampilan, C4-C6, Produk Akhir, >4JP): Gunakan Model Pembelajaran (PBL/PjBL/Inkuiri). Sintaks model HARUS masuk di Kegiatan Inti.
4. **Tujuan Pembelajaran**: Harus Spesifik, Terukur, Dapat diamati, menggunakan KKO Operasional (Taksonomi Bloom).
5. **GRANULARITAS AKTIVITAS (CRITICAL)**:
   - Pecah setiap aktivitas besar menjadi 7-10 langkah mikro (Micro-Steps).
   - JANGAN TULIS: "Guru membagi kelompok". 
   - TULIS PEMECAHANNYA: 
     a. Guru menjelaskan aturan main. 
     b. Guru menggunakan teknik berhitung 1-5 untuk pembagian acak. 
     c. Murid berkumpul sesuai nomor. 
     d. Setiap kelompok menunjuk Ketua dan Notulen (Pembagian Peran).
   - JANGAN TULIS: "Murid berdiskusi".
   - TULIS PEMECAHANNYA:
     a. Murid membaca stimulus/kasus.
     b. Murid mencatat poin kunci secara individu.
     c. Murid saling bertukar pendapat.
     d. Guru berkeliling memberikan scaffolding (bantuan terbatas).
6. **FITUR SIDE-NOTES (TIPS GURU)**:
   - Wajib sertakan tips pedagogis praktis di sela-sela langkah pembelajaran.
   - Gunakan format Markdown Blockquote persis seperti ini: "> 💡 Tips: [Isi Tips]".
   - Contoh: "> 💡 Tips: Gunakan timer visual 5 menit agar diskusi murid tetap fokus dan efisien."
7. **FORMAT MATEMATIKA (WAJIB)**:
   - Untuk semua persamaan, rumus, variabel, dan angka yang bersifat matematis, WAJIB menggunakan format LaTeX.
   - Gunakan format inline: $E=mc^2$ atau $\frac{1}{2}$.
   - Gunakan format block: $$x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$$
   - Jangan gunakan simbol unicode biasa untuk matematika kompleks.
`;

// ------------------------------------
// SCHEMAS FOR MODULAR GENERATION
// ------------------------------------

const LEARNING_STEP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    meetingNo: { type: Type.INTEGER },
    intro: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Langkah detail + Tips Guru (Format Markdown >). Gunakan LaTeX $...$ untuk matematika." },
    introPrinciple: { type: Type.STRING, description: "Pilih 1 atau 2 dari: Berkesadaran, Bermakna, Mengembirakan" },
    core: {
      type: Type.OBJECT,
      properties: {
        memahami: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Micro-steps detail + Tips Guru. Gunakan LaTeX $...$ untuk matematika." },
        mengaplikasi: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Micro-steps detail + Tips Guru. Gunakan LaTeX $...$ untuk matematika." },
        merefleksi: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Micro-steps detail + Tips Guru. Gunakan LaTeX $...$ untuk matematika." },
      },
      required: ['memahami', 'mengaplikasi', 'merefleksi']
    },
    corePrinciple: { type: Type.STRING, description: "Pilih 1 atau 2 dari: Berkesadaran, Bermakna, Mengembirakan" },
    closing: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Langkah detail + Tips Guru. Gunakan LaTeX $...$ untuk matematika." },
    closingPrinciple: { type: Type.STRING, description: "Pilih 1 atau 2 dari: Berkesadaran, Bermakna, Mengembirakan" }
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
    graduateProfile: { type: Type.ARRAY, items: { type: Type.STRING } },
    
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

    learningExperience: {
      type: Type.ARRAY,
      items: LEARNING_STEP_SCHEMA
    },
    
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
    judul: { type: Type.STRING, description: "Judul menarik." },
    pemantik: { type: Type.STRING, description: "Apersepsi berupa paragraf naratif pendek atau pertanyaan retoris untuk menghubungkan pengalaman murid." },
    petaKonsep: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3-5 poin utama scope materi." },
    materiInti: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          subJudul: { type: Type.STRING },
          penjelasan: { type: Type.STRING, description: "Penjelasan mendalam. Gunakan markdown BOLD (**) untuk kata kunci. WAJIB LaTeX $...$ untuk rumus." },
          contoh: { type: Type.STRING, description: "Contoh konkret dari konsep tersebut. WAJIB LaTeX $...$ untuk rumus." },
          bukanContoh: { type: Type.STRING, description: "Contoh salah (counter-example) untuk mempertajam pemahaman." }
        },
        required: ['subJudul', 'penjelasan', 'contoh', 'bukanContoh']
      },
      description: "Minimal 3 sub-bab deep dive."
    },
    deskripsiIlustrasi: { type: Type.STRING, description: "Deskripsi gambar pendukung yang relevan." },
    trivia: { type: Type.STRING, description: "Satu fakta unik 'Tahukah Kamu?'." },
    glosarium: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          istilah: { type: Type.STRING },
          definisi: { type: Type.STRING }
        },
        required: ['istilah', 'definisi']
      },
      description: "Jelaskan 3 istilah sulit."
    }
  },
  required: ['judul', 'pemantik', 'petaKonsep', 'materiInti', 'deskripsiIlustrasi', 'trivia', 'glosarium']
};

const LKPD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    activityTitle: { type: Type.STRING, description: "Judul Kreatif dan Menarik untuk siswa" },
    guides: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4-5 Petunjuk Umum pengerjaan LKPD dengan bahasa formal akademik (Misal: 'Berdoalah...', 'Pelajari materi...', 'Diskusikan...')." },
    objectives: { type: Type.STRING, description: "Tujuan Misi/Petualangan (Bahasa siswa: 'Hari ini kita akan menjadi...')" },
    toolsMaterials: { type: Type.ARRAY, items: { type: Type.STRING } },
    instructions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Langkah Kerja step-by-step yang singkat dan operasional." },
    activityZone: { type: Type.STRING, description: "Isi Inti LKPD. WAJIB GUNAKAN TABEL MARKDOWN untuk struktur yang rapi (misal: Tabel Pengamatan, Tabel Isian, atau Tabel Perbandingan). Jika butuh area untuk siswa mengisi, gunakan garis bawah panjang di dalam sel tabel (misal: '____________'). Gunakan LaTeX $...$ untuk rumus." },
    discussionQuestions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3-4 Pertanyaan HOTS untuk diskusi" },
    reflection: { type: Type.STRING, description: "Refleksi diri. GUNAKAN TABEL MARKDOWN untuk Checklist Refleksi. Kolom: (No, Pernyataan, Ya, Tidak)." }
  },
  required: ['activityTitle', 'guides', 'objectives', 'toolsMaterials', 'instructions', 'activityZone', 'discussionQuestions', 'reflection']
};

const ASSESSMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    kktp: { 
      type: Type.ARRAY, 
      items: { 
          type: Type.OBJECT,
          properties: {
            criteria: { type: Type.STRING, description: "Kriteria penilaian spesifik topik." },
            needsGuidance: { type: Type.STRING, description: "Deskripsi untuk level Perlu Bimbingan." },
            basic: { type: Type.STRING, description: "Deskripsi untuk level Cukup." },
            proficient: { type: Type.STRING, description: "Deskripsi untuk level Baik." },
            advanced: { type: Type.STRING, description: "Deskripsi untuk level Sangat Baik." }
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
                        aspect: { type: Type.STRING, description: "Aspek perilaku yang diobservasi." },
                        indicator: { type: Type.STRING, description: "Indikator perilaku spesifik." }
                    },
                    required: ['aspect', 'indicator']
                }
            },
            feedbackGuide: {
                type: Type.OBJECT,
                properties: {
                    clarification: { type: Type.STRING, description: "Contoh kalimat pertanyaan klarifikasi." },
                    appreciation: { type: Type.STRING, description: "Contoh kalimat apresiasi spesifik." },
                    suggestion: { type: Type.STRING, description: "Contoh kalimat saran untuk naik level." }
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
                        indicator: { type: Type.STRING, description: "Indikator Soal yang spesifik. Gunakan LaTeX jika ada rumus." },
                        level: { type: Type.STRING, description: "Level Kognitif (Relational / Extended Abstract)." },
                        technique: { type: Type.STRING, description: "Bentuk Soal/Teknik (Tes Tulis/Proyek)." }
                    },
                    required: ['indicator', 'level', 'technique']
                },
                description: "Kisi-kisi soal sumatif."
            }
        },
        required: ['grid']
    },
    intervention: {
        type: Type.OBJECT,
        properties: {
            needsGuidance: { type: Type.STRING, description: "Intervensi untuk siswa 'Perlu Bimbingan'." },
            basic: { type: Type.STRING, description: "Intervensi untuk siswa 'Cukup'." },
            proficient: { type: Type.STRING, description: "Intervensi untuk siswa 'Baik'." },
            advanced: { type: Type.STRING, description: "Tantangan untuk siswa 'Sangat Baik'." }
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
          question: { type: Type.STRING, description: "Soal pertanyaan. WAJIB LaTeX $...$ untuk rumus/angka matematis." },
          stimulus: { type: Type.STRING, description: "Teks bacaan atau konteks soal jika ada. Gunakan LaTeX untuk data numerik." },
          options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Pilihan jawaban. WAJIB LaTeX $...$ untuk rumus." },
          answerKey: { type: Type.STRING, description: "Kunci jawaban. WAJIB LaTeX." }
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

export const generateRPP = async (
  schoolData: SchoolIdentity,
  lessonData: LessonIdentity
): Promise<GeneratedLessonPlan> => {
  const ai = getClient();

  const prompt = `
    Bertindaklah sebagai Pakar Kurikulum & Deep Learning.
    Tugas Anda adalah menyusun RENCANA PEMBELAJARAN (RPP) formal. (Tahap 1: The Root)

    ${DEEP_LEARNING_GUIDELINES}

    INFO INPUT:
    Sekolah: ${schoolData.schoolName}
    Mata Pelajaran: ${lessonData.subject}
    Kelas/Fase: ${lessonData.grade}
    Topik: ${lessonData.topic}
    Tujuan Pembelajaran: ${lessonData.objectives || "Sesuai topik"}
    Jumlah Pertemuan: ${lessonData.meetingCount}
    
    PENTING:
    - Kembangkan aktivitas menjadi sangat detail (Micro-steps).
    - Sertakan "> 💡 Tips: ..." di setiap tahapan (Pendahuluan, Inti, Penutup).
    - **Pastikan semua elemen matematika ditulis dalam LaTeX.**

    Hasilkan output JSON Sesuai Schema RPP.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: RPP_SCHEMA
    }
  });

  if (!response.text) {
    throw new Error("Gagal menghasilkan konten dari AI.");
  }

  const parsed = JSON.parse(response.text);
  
  parsed.identitySection.schoolName = schoolData.schoolName;
  parsed.identitySection.subject = lessonData.subject;
  parsed.identitySection.grade = lessonData.grade;
  parsed.identitySection.semester = lessonData.semester;
  parsed.identitySection.timeAllocation = lessonData.timeAllocation;
  parsed.identitySection.meetingCount = lessonData.meetingCount;
  parsed.identitySection.topic = lessonData.topic;
  
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
    const ai = getClient();
    
    // CONTEXT INJECTION (DEPENDENCY: RPP)
    const context = `
    KONTEKS DARI RPP (WAJIB SESUAI):
    - Topik Utama: ${rppData.identitySection.topic}
    - Tujuan Pembelajaran: ${rppData.design.objectives.join(', ')}
    `;

    const prompt = `
    Susun Materi Ajar Deep Learning (Tahap 2: The Content).
    ${context}
    
    WAJIB IKUTI STRUKTUR "DEEP DIVE" INI:
    1. JUDUL: Menarik & Relevan dengan Topik RPP.
    2. PEMANTIK BELAJAR (Apersepsi): Paragraf naratif pendek/pertanyaan retoris.
    3. PETA KONSEP: 3-5 poin utama (Scope materi).
    4. MATERI INTI (3-4 Sub-bab):
       - Sesuaikan dengan Tujuan Pembelajaran.
       - Penjelasan mendalam per sub-topik.
       - SERTAKAN "Contoh" (Konkret) dan "Bukan Contoh" (Counter-example).
       - BOLD (markdown **) kata-kata kunci penting.
       - **MATEMATIKA: WAJIB LaTeX ($...$) untuk semua rumus.**
    5. DESKRIPSI ILUSTRASI: Deskripsi visual.
    6. TRIVIA: Fakta unik.
    7. GLOSARIUM: Istilah sulit & definisi.
    
    Gaya bahasa: Akademis namun mudah dimengerti, eksploratif. Output JSON.
    `;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: "application/json", responseSchema: MATERIALS_SCHEMA }
    });
    return JSON.parse(response.text || '{}');
};

export const generateLKPD = async (rppData: GeneratedLessonPlan): Promise<LKPDData> => {
  const ai = getClient();
  
  // CONTEXT INJECTION (DEPENDENCY: RPP + MATERIALS)
  // We check if materials exist, otherwise fallback to simple extraction
  let materialContext = "";
  if (rppData.materials) {
      materialContext = `GUNAKAN ISTILAH/KONSEP DARI MATERI INI AGAR KONSISTEN: ${JSON.stringify(rppData.materials.materiInti.map(m => m.subJudul))}`;
  }

  const prompt = `
  Anda adalah Spesialis Desain Instruksional.
  Tugas: Terjemahkan Rencana Pembelajaran menjadi LKPD (Tahap 3: The Activity).

  KONTEKS DARI RPP (WAJIB SESUAI):
  - Kegiatan Inti (Learning Experience): ${JSON.stringify(rppData.learningExperience.map(l => l.core))}
  ${materialContext}

  INSTRUKSI KONTEN (WAJIB):
  1. **Activity Title**: Sesuaikan dengan Aktivitas di RPP.
  2. **Petunjuk (Guides)**: Instruksi formal.
  3. **Objectives**: Ambil dari TP RPP: ${rppData.design.objectives.join(', ')}.
  4. **Activity Zone (Inti LKPD)**: 
     - **WAJIB GUNAKAN TABEL MARKDOWN** untuk struktur yang rapi (misal: Tabel Pengamatan, Tabel Isian, atau Tabel Perbandingan).
     - Jika butuh area untuk siswa mengisi, gunakan garis bawah panjang di dalam sel tabel (misal: "____________").
     - Buat tata letak yang profesional dan mudah dibaca.
     - **Gunakan LaTeX ($...$) untuk persamaan matematika.**
  5. **Reflection**: 
     - **GUNAKAN TABEL MARKDOWN** untuk Checklist Refleksi.
     - Contoh kolom: No, Pernyataan, Ya (Ceklis), Tidak (Ceklis).

  Hasilkan output JSON Sesuai Schema LKPD.
  `;
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: LKPD_SCHEMA }
  });
  return JSON.parse(response.text || '{}');
};

export const generateAssessment = async (rppData: GeneratedLessonPlan): Promise<DeepLearningAssessment> => {
  const ai = getClient();
  
  // CONTEXT INJECTION (DEPENDENCY: RPP + LKPD)
  let lkpdContext = "";
  if (rppData.lkpd) {
      lkpdContext = `
      FOKUSKAN ASESMEN PADA AKTIVITAS LKPD BERIKUT:
      - Judul Aktivitas: ${rppData.lkpd.activityTitle}
      - Zona Aktivitas: ${rppData.lkpd.activityZone}
      `;
  }

  const prompt = `
  ROLE: Anda adalah Spesialis Asesmen Kurikulum Merdeka dengan fokus pada "Deep Learning" (Pembelajaran Mendalam). 
  Tugas Anda adalah menyusun instrumen asesmen yang valid menggunakan pendekatan kualitatif (Rubrik) yang mengukur kedalaman berpikir siswa.

  INPUT CONTEXT:
  1. TUJUAN PEMBELAJARAN (TP): ${rppData.design.objectives.join(', ')}
  2. AKTIVITAS: ${lkpdContext}

  STRUKTUR OUTPUT TAB ASESMEN (MARKDOWN):

  ## 1. 📊 KKTP: Rubrik Pembelajaran Mendalam
  Gunakan "Pendekatan 2: Menggunakan Rubrik". Jangan gunakan persentase atau interval angka semata.
  Buatkan Tabel Rubrik dengan 4 Level Kualitas:
  - Perlu Bimbingan 
  - Cukup
  - Baik
  - Sangat Baik

  *Instruksi Pengisian Rubrik:*
  - Sesuaikan deskripsi di dalam sel tabel dengan Topik Materi yang sedang dibahas.
  - JANGAN sertakan teks label SOLO dalam kurung seperti (Unistructural), (Multistructural) di dalam output text. Cukup deskripsi perilakunya.
  - Pastikan gradasi dari kiri ke kanan menunjukkan peningkatan kualitas berpikir (Low Order -> High Order Thinking).

  ## 2. 🔍 Asesmen Formatif (Proses)
  *Tujuan:* Umpan balik proses (Assessment for Learning).

  ### Asesmen Proses
  - Gunakan Teknik **Observasi** atau **CATs**.
  - Sajikan **Tabel Checklist Observasi** sederhana.
  - Sediakan panduan **Umpan Balik Berjenjang** (Tangga Umpan Balik).

  ## 3. 📝 Asesmen Sumatif (Evaluation)
  *Tujuan:* Menilai pencapaian akhir (Assessment of Learning).
  - Buatkan Kisi-Kisi Soal (Grid) yang menghubungkan indikator soal dengan level kognitif tinggi (Relational & Extended Abstract).
  - Hubungkan ini sebagai dasar untuk pembuatan Bank Soal nanti.
  - **Pastikan indikator yang mengandung rumus menggunakan format LaTeX.**

  ATURAN:
  1. KKTP wajib berbentuk Rubrik Deskriptif.
  2. Indikator Sumatif harus selaras dengan indikator "Sangat Baik" pada KKTP.
  3. Gunakan Font yang seragam, hanya Judul/Sub-judul yang Bold.
  `;
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: ASSESSMENT_SCHEMA }
  });
  return JSON.parse(response.text || '{}');
};

export const generateQuestionBank = async (rppData: GeneratedLessonPlan, config: QuestionBankConfig): Promise<QuestionBankData> => {
  const ai = getClient();
  
  // CONTEXT INJECTION (DEPENDENCY: MATERIALS + ASSESSMENT)
  let context = `TOPIK: ${rppData.identitySection.topic}`;
  
  if (rppData.materials) {
      context += `\nBAHAN MATERI (SUMBER SOAL): ${JSON.stringify(rppData.materials.materiInti)}`;
  }
  
  if (rppData.assessment) {
      context += `
      \nACUAN KISI-KISI SUMATIF (KORELASI WAJIB):
      ${JSON.stringify(rppData.assessment.summative.grid)}
      `;
  }

  const prompt = `
    Bertindaklah sebagai Penulis Soal Profesional (Tahap 5: The Instrument). 
    Gunakan istilah "Murid".
    Buat ${config.count} soal tipe ${config.types.join(', ')} level ${config.level}.
    
    ${context}

    INSTRUKSI KHUSUS:
    - Pastikan soal valid secara materi (ambil dari Bahan Materi).
    - Pastikan tingkat kesulitan sesuai Acuan Kisi-kisi Sumatif.
    - **FORMAT MATEMATIKA: WAJIB gunakan LaTeX ($...$) untuk semua rumus, persamaan, dan angka matematis dalam Soal dan Opsi Jawaban.**
    
    INSTRUKSI TIPE SOAL 'MENJODOHKAN' (PENTING!):
      - **BATASAN JUMLAH:** Minimal 2 pasang, Maksimal 4 pasang item per soal.
      - **FORMAT:**
        - 'question': Isi dengan daftar 'Pernyataan' (Sisi Kiri), dipisahkan dengan baris baru (\\n). JANGAN ISI dengan teks instruksi seperti "Jodohkanlah...".
        - 'options': Isi dengan daftar 'Respon/Jawaban' (Sisi Kanan).
      - **KESEIMBANGAN:** Pastikan jumlah item di 'question' SAMA dengan jumlah item di 'options'.

    Hasilkan JSON sesuai schema Question Bank.
  `;
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: QUESTION_BANK_SCHEMA }
  });
  return JSON.parse(response.text || '{}');
};

export const optimizeExistingPlan = async (rawText: string): Promise<GeneratedLessonPlan> => {
  const ai = getClient();
  const prompt = `
  Anda adalah Pakar Deep Learning & Instructional Designer.
  Tugas Anda: MELAKUKAN OPTIMASI & PENGAYAAN (ENRICHMENT) pada teks RPP mentah berikut.
  
  ${DEEP_LEARNING_GUIDELINES}
  
  INSTRUKSI SPESIFIK OPTIMASI:
  1. **Granularitas (Wajib)**: Jika input hanya "Guru membagi kelompok", ubah menjadi 3-4 langkah mikro (misal: menjelaskan aturan, teknik berhitung, pembagian peran dalam kelompok).
  2. **Pengayaan (Wajib)**: Sisipkan "> 💡 Tips: ..." pada bagian yang membutuhkan strategi kelas (Classroom Management) atau Diferensiasi.
  3. **HOTS**: Pastikan pertanyaan pemantik dan aktivitas memancing berpikir kritis, bukan hanya menyalin.
  4. **Matematika**: Ubah semua rumus atau persamaan matematika yang berantakan menjadi format LaTeX yang rapi ($...$).
  
  TEKS ASAL DARI USER: 
  ${rawText}`;
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: RPP_SCHEMA }
  });
  return JSON.parse(response.text || '{}');
};