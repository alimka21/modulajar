
import { GoogleGenAI, Type } from "@google/genai";
import { SchoolIdentity, LessonIdentity, GeneratedLessonPlan, LKPDData, AssessmentItem, KKTPItem, QuestionBankConfig, QuestionBankData, MaterialsData, DeepLearningAssessment } from '../types';

const getClient = () => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// ------------------------------------
// HELPER: RETRY LOGIC FOR 429 ERRORS
// ------------------------------------
const generateWithRetry = async (
  prompt: string, 
  schema: any, 
  model: string = 'gemini-3-flash-preview',
  retries: number = 4 // Increased retries
): Promise<any> => {
  const ai = getClient();
  const baseDelay = 6000; // Increased base delay to 6 seconds

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
      // Deteksi Error 429 atau Resource Exhausted
      const isRateLimit = 
        error.message?.includes('429') || 
        error.status === 429 || 
        error.message?.toLowerCase().includes('exhausted') ||
        error.message?.toLowerCase().includes('quota') ||
        error.message?.includes('FetchError') ||
        error.message?.includes('Failed to fetch');

      if (isRateLimit) {
        if (attempt < retries - 1) {
          // Exponential Backoff: 6s, 12s, 24s...
          const delay = baseDelay * Math.pow(2, attempt);
          console.warn(`Rate limit terdeteksi. Mencoba lagi dalam ${delay/1000} detik... (Percobaan ${attempt + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Coba lagi
        } else {
          // Jika sudah habis kesempatan retry
          throw new Error("Server sedang sibuk (Limit Kuota Tercapai). Mohon tunggu 1-2 menit sebelum mencoba lagi.");
        }
      }
      
      // Jika error lain, throw langsung
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
2. **Prinsip Pembelajaran**:
   - Pilih HANYA dari daftar ini: (Berkesadaran, Bermakna, Mengembirakan).
3. **Analisis Kompleksitas Berbasis Fase (CRITICAL)**:
   - **SD (Fase A-C)**: Aktivitas HARUS Konkret, Bermain, Eksplorasi Fisik. Fokus C1-C3 (Mengingat, Memahami, Menerapkan sederhana). Hindari ceramah panjang.
   - **SMP (Fase D)**: Transisi Konkret ke Abstrak. Mulai Inkuiri Terbimbing. Fokus C3-C4 (Menerapkan, Menganalisis).
   - **SMA (Fase E-F)**: Aktivitas Abstrak, Berpikir Kritis, Problem Based. Fokus C4-C6 (Menganalisis, Mengevaluasi, Mencipta).
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
6. **FORMAT MATEMATIKA (WAJIB)**:
   - Gunakan format LaTeX ($...$) HANYA untuk rumus, persamaan, variabel, atau simbol matematika yang kompleks.
   - **DILARANG KERAS** menggunakan LaTeX untuk angka biasa (Contoh SALAH: $1$, $5$, $100$. Contoh BENAR: 1, 5, 100).
   - **DILARANG** menggunakan LaTeX untuk teks biasa.
   - Pastikan sintaks LaTeX valid (Gunakan \\circ untuk komposisi fungsi, bukan huruf 'o').
   - Gunakan format inline: $E=mc^2$ atau $\\frac{1}{2}$.
   - Gunakan format block: $$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$
`;

// ------------------------------------
// SCHEMAS FOR MODULAR GENERATION
// ------------------------------------

const LEARNING_STEP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    meetingNo: { type: Type.INTEGER },
    intro: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Langkah detail (Micro-steps). Gunakan LaTeX $...$ HANYA untuk rumus matematika." },
    introPrinciple: { type: Type.STRING, description: "Pilih 1 atau 2 dari: Berkesadaran, Bermakna, Mengembirakan" },
    core: {
      type: Type.OBJECT,
      properties: {
        memahami: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Micro-steps detail. Gunakan LaTeX $...$ HANYA untuk rumus matematika." },
        mengaplikasi: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Micro-steps detail. Gunakan LaTeX $...$ HANYA untuk rumus matematika." },
        merefleksi: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Micro-steps detail. Gunakan LaTeX $...$ HANYA untuk rumus matematika." },
      },
      required: ['memahami', 'mengaplikasi', 'merefleksi']
    },
    corePrinciple: { type: Type.STRING, description: "Pilih 1 atau 2 dari: Berkesadaran, Bermakna, Mengembirakan" },
    closing: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Langkah detail (Micro-steps). Gunakan LaTeX $...$ HANYA untuk rumus matematika." },
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
        pedagogicalPractice: { type: Type.STRING, description: "Sebutkan nama Model/Strategi/Metode (misal PBL), lalu jelaskan sedikit penerapannya." },
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
    judul: { type: Type.STRING, description: "Judul Materi (Singkat & Jelas)." },
    pemantik: { type: Type.STRING, description: "1 Pertanyaan Pemantik sederhana yang relevan dengan dunia anak." },
    subTopik: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Daftar sub-topik yang berkaitan langsung dengan topik utama." },
    konsepInti: {
      type: Type.OBJECT,
      properties: {
        definisi: { type: Type.STRING, description: "Definisi yang sangat sederhana (Bahasa Anak)." },
        penjelasanBertahap: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Penjelasan materi yang dipecah menjadi potongan-potongan pendek (chunks). Hindari paragraf panjang. Jelaskan setiap sub-topik di sini. Gunakan Markdown BOLD (**) untuk kata kunci. " },
        tabelVisual: { type: Type.STRING, description: "Tabel atau Diagram Text dalam format Markdown untuk memvisualisasikan konsep/perbandingan." },
        contohKonkret: { type: Type.STRING, description: "Contoh kecil yang nyata di kehidupan sehari-hari." }
      },
      required: ['definisi', 'penjelasanBertahap', 'tabelVisual', 'contohKonkret']
    },
    trivia: { type: Type.STRING, description: "Fakta seru 'Tahukah Kamu?'." },
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
      description: "3 istilah penting."
    }
  },
  required: ['judul', 'pemantik', 'subTopik', 'konsepInti', 'trivia', 'glosarium']
};

// UPDATED: LKPD SCHEMA (Strictly Academic)
const LKPD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Judul Akademik yang Jelas dan Formal. Contoh: 'Lembar Kerja - Struktur Sel Hewan'." },
    objectives: { type: Type.STRING, description: "Tujuan Pembelajaran yang diambil dari RPP." },
    instructions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Petunjuk pengerjaan yang sistematis." },
    stimulus: { type: Type.STRING, description: "Data/Gambar/Kasus/Teks Pendek sebagai bahan observasi awal." },
    activities: {
      type: Type.OBJECT,
      properties: {
        level1: { type: Type.STRING, description: "Aktivitas 1 (Dasar). Berikan instruksi singkat, lalu sajikan Tabel Markdown dengan KOLOM KOSONG agar murid bisa mengisi." },
        level2: { type: Type.STRING, description: "Aktivitas 2 (Menengah). Berikan instruksi singkat, lalu sajikan Tabel/Bagan Markdown dengan BAGIAN KOSONG untuk diisi murid." },
        level3: { type: Type.STRING, description: "Aktivitas 3 (Lanjutan). Berikan instruksi, lalu pertanyaan essay atau tabel analisis KOSONG untuk dikerjakan." }
      },
      required: ['level1', 'level2', 'level3']
    },
    reflection: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Pertanyaan refleksi pemahaman konsep." }
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
            criteria: { type: Type.STRING, description: "Kriteria penilaian spesifik topik." },
            needsGuidance: { type: Type.STRING, description: "Deskripsi level 1 (Perlu Bimbingan) - Level C1/C2 Bloom" },
            basic: { type: Type.STRING, description: "Deskripsi level 2 (Cukup) - Level C2/C3 Bloom" },
            proficient: { type: Type.STRING, description: "Deskripsi level 3 (Baik) - Level C3/C4 Bloom" },
            advanced: { type: Type.STRING, description: "Deskripsi level 4 (Sangat Baik) - Level C5/C6 Bloom" }
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
                },
                description: "Bagian A. Lembar Observasi (Checklist)"
            },
            // Objective Test Removed
            feedbackGuide: {
                type: Type.OBJECT,
                properties: {
                    clarification: { type: Type.STRING, description: "Contoh kalimat pertanyaan klarifikasi." },
                    appreciation: { type: Type.STRING, description: "Contoh kalimat apresiasi spesifik." },
                    suggestion: { type: Type.STRING, description: "Contoh kalimat saran untuk naik level." }
                },
                required: ['clarification', 'appreciation', 'suggestion'],
                description: "Bagian C. Tangga Umpan Balik"
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
                        indicator: { type: Type.STRING, description: "Indikator Soal yang spesifik. Gunakan LaTeX HANYA jika ada rumus." },
                        level: { type: Type.STRING, description: "Level Kognitif Bloom (C1-C6)." },
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
          number: { type: Type.NUMBER, description: "Nomor urut soal." },
          type: { type: Type.STRING, description: "Tipe soal (Pilihan Ganda, Uraian, Menjodohkan, dll)." },
          question: { type: Type.STRING, description: "Pertanyaan atau instruksi soal. Gunakan LaTeX $...$ untuk rumus." },
          stimulus: { type: Type.STRING, description: "Stimulus (Narasi/Data/Kasus)." },
          options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Opsi jawaban (Untuk Pilihan Ganda / Kompleks)." },
          matchingPairs: { 
              type: Type.ARRAY, 
              items: { 
                  type: Type.OBJECT,
                  properties: {
                      left: { type: Type.STRING },
                      right: { type: Type.STRING }
                  }
              },
              description: "Pasangan soal dan jawaban (Hanya untuk Menjodohkan)."
          },
          answerKey: { type: Type.STRING, description: "Kunci jawaban lengkap." }
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
    
    PENTING - PENYESUAIAN KOMPLEKSITAS & KEDALAMAN (STRICT):
    Jenjang: ${lessonData.grade}

    1. **JIKA FASE A-C (SD)**:
       - Aktivitas HARUS dominan konkret, manipulatif (memegang benda), dan bermain.
       - Gunakan istilah sederhana. Hindari jargon teoretis.
       - Kompleksitas: C1-C3 (Mengingat, Memahami, Menerapkan sederhana).
       - Contoh: "Murid mengelompokkan kancing berdasarkan warna" (bukan "Murid menganalisis klasifikasi objek").

    2. **JIKA FASE D (SMP)**:
       - Transisi dari konkret ke abstrak. Mulai perkenalkan studi kasus sederhana.
       - Kompleksitas: C3-C5 (Menerapkan, Menganalisis, Mengevaluasi).
       - Contoh: "Murid menyelidiki pengaruh sinar matahari terhadap tanaman di halaman".

    3. **JIKA FASE E-F (SMA/SMK)**:
       - Aktivitas dominan abstrak, analisis kritis, pemecahan masalah kompleks, dan proyek.
       - Kompleksitas: C4-C6 (Menganalisis, Mengevaluasi, Mencipta).
       - Contoh: "Murid merancang prototipe energi terbarukan berdasarkan data lingkungan sekolah".

    INSTRUKSI TAMBAHAN:
    - Kembangkan aktivitas menjadi sangat detail (Micro-steps).
    - **JANGAN BUAT TIPS PEDAGOGIS / SIDE NOTES.** Hapus bagian "Tips" dari output.
    - **Pastikan semua rumus matematika ditulis dalam LaTeX, tetapi JANGAN gunakan LaTeX untuk angka biasa.**

    Hasilkan output JSON Sesuai Schema RPP.
  `;

  // USE RETRY LOGIC
  const parsed = await generateWithRetry(prompt, RPP_SCHEMA);
  
  parsed.identitySection.schoolName = schoolData.schoolName;
  parsed.identitySection.subject = lessonData.subject;
  parsed.identitySection.grade = lessonData.grade;
  parsed.identitySection.semester = lessonData.semester;
  parsed.identitySection.timeAllocation = lessonData.timeAllocation;
  parsed.identitySection.meetingCount = lessonData.meetingCount;
  parsed.identitySection.topic = lessonData.topic;
  
  if (lessonData.graduateProfileDimensions && lessonData.graduateProfileDimensions.length > 0) {
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
    // CONTEXT INJECTION (DEPENDENCY: RPP)
    const context = `
    KONTEKS DARI RPP (WAJIB SESUAI):
    - Topik Utama: ${rppData.identitySection.topic}
    - Tujuan Pembelajaran: ${rppData.design.objectives.join(', ')}
    - JENJANG: ${rppData.identitySection.grade}
    `;

    const prompt = `
    Susun Materi Ajar Deep Learning (Tahap 2: The Content).
    ${context}
    
    ATURAN PENYUSUNAN MATERI (STRICT):
    1. **BAHASA ANAK**: Sesuaikan bahasa dengan jenjang ${rppData.identitySection.grade}. Gunakan kalimat sederhana, to-the-point, dan mudah dicerna.
    2. **SINGKAT & PADAT**: Hindari paragraf panjang. Pecah materi menjadi poin-poin pendek (chunks).
    3. **TANPA JUDUL KREATIF**: Gunakan judul yang langsung pada topik, tidak perlu metafora berlebihan.

    STRUKTUR KONTEN:
    1. JUDUL: Topik Utama (Singkat).
    2. PEMANTIK BELAJAR: 1 Pertanyaan sederhana untuk memancing rasa ingin tahu.
    3. SUB TOPIK: List sub-topik yang akan dibahas (berkaitan langsung dengan topik utama).
    4. KONSEP INTI (Inti Materi):
       - **Definisi**: Jelaskan konsep utama dalam 1-2 kalimat sederhana.
       - **Penjelasan Bertahap**: Pecah penjelasan menjadi daftar poin (bullet points). Jelaskan setiap Sub Topik secara berurutan di sini. Gunakan Markdown BOLD (**) untuk kata kunci.
       - **Tabel/Diagram**: Sajikan visualisasi data, perbandingan, atau alur dalam bentuk Tabel Markdown.
       - **Contoh Kecil**: Berikan contoh konkret yang dekat dengan kehidupan murid.
    
    5. TRIVIA: Fakta seru singkat.
    6. GLOSARIUM: 3 Istilah penting.
    
    WAJIB FORMAT LATEX ($...$) HANYA UNTUK RUMUS MATEMATIKA.
    Output JSON.
    `;
    
    // USE RETRY LOGIC
    return await generateWithRetry(prompt, MATERIALS_SCHEMA);
};

export const generateLKPD = async (rppData: GeneratedLessonPlan): Promise<LKPDData> => {
  // 1. EXTRACT OBJECTIVES FOR CONTEXT
  const objectivesContext = rppData.design.objectives.join("; ");
  
  // 2. EXTRACT ASSESSMENT FOR SCAFFOLDING LOGIC
  // We use the KKTP (Criteria) to guide the level difficulty
  let assessmentContext = "";
  if (rppData.assessment && rppData.assessment.kktp) {
      assessmentContext = JSON.stringify(rppData.assessment.kktp.map(k => ({
          criteria: k.criteria,
          lowLevel: k.needsGuidance,
          midLevel: k.basic,
          highLevel: k.proficient
      })));
  }

  const activityTypesList = `
  DAFTAR REFERENSI TIPE AKTIVITAS (PILIH YANG SESUAI):
  1. Observasi (amati gambar/tabel/video, tulis temuan)
  2. Klasifikasi (kelompokkan, cocokkan, sortir)
  3. Melengkapi pola (lanjutkan, isi kosong)
  4. Praktik langsung (hitung, ukur, coba)
  5. Manipulatif (potong-tempel, susun kartu, drag-drop)
  6. Diskusi (bahas berpasangan, jawab bersama)
  7. Pemecahan masalah (soal cerita, kasus nyata)
  8. Analisis (bandingkan, cari kesalahan)
  9. Proyek mini (buat poster/model/flowchart)
  10. Refleksi (tulis pengalaman, cek pemahaman)
  `;

  const prompt = `
  Anda adalah Spesialis Desain Instruksional & Akademik.
  Tugas: Buat Lembar Kerja Murid yang AKADEMIK dan FORMAL.

  KONTEKS:
  - Topik: ${rppData.identitySection.topic}
  - Jenjang: ${rppData.identitySection.grade}
  - TUJUAN PEMBELAJARAN (MATERIAL CONTEXT): ${objectivesContext}
  - ACUAN LEVEL AKTIVITAS (DARI ASESMEN): ${assessmentContext || "Gunakan Taksonomi Bloom C1-C6"}

  ATURAN UTAMA (STRICT):
  1. **KONSEP AKTIVITAS (HANDS-ON)**: Aktivitas adalah tempat murid mengerjakan sesuatu. Jangan berikan materi text panjang. Berikan tabel/isian/bagan.
  2. **KOLOM KOSONG**: Jika membuat tabel, pastikan ada kolom atau baris yang KOSONG untuk diisi murid. Jangan isi semua sel tabel.
  3. **INSTRUKSI JELAS**: Sebelum setiap tabel/aktivitas, berikan instruksi singkat tentang apa yang harus dilakukan murid.
  4. **FORMAT MATEMATIKA**: Gunakan LaTeX ($...$) untuk rumus.

  ${activityTypesList}

  INSTRUKSI STRUKTUR KONTEN (WAJIB):
  
  1. **Judul (Title)**: Judul Formal/Akademik. Contoh: "Lembar Kerja: [Nama Topik]".
  2. **Tujuan (Objectives)**: Tujuan Pembelajaran (Bahasa Murid).
  3. **Petunjuk (Instructions)**: Langkah pengerjaan formal.
  4. **STIMULUS**: Sajikan data/gambar/teks pendek sebagai bahan observasi awal.
  
  5. **AKTIVITAS BERTAHAP (Scaffolding)**:
     
     - **Aktivitas 1 (Dasar/Fondasi)**: 
       * Gunakan kata "Aktivitas 1".
       * Tipe: Observasi / Identifikasi.
       * Konten: Berikan instruksi "Amati... lalu lengkapi...". Lalu buat TABEL MARKDOWN dengan kolom jawaban yang KOSONG.
     
     - **Aktivitas 2 (Menengah/Aplikasi)**: 
       * Gunakan kata "Aktivitas 2".
       * Tipe: Penerapan / Praktik.
       * Konten: Berikan instruksi. Buat soal isian atau TABEL MARKDOWN yang lebih kompleks dengan bagian KOSONG.
     
     - **Aktivitas 3 (Lanjutan/HOTS)**: 
       * Gunakan kata "Aktivitas 3".
       * Tipe: Analisis / Evaluasi.
       * Konten: Pertanyaan terbuka (Essay) atau Studi Kasus yang harus dijawab.

  6. **Refleksi**: Gunakan tipe aktivitas **Refleksi** (3 pertanyaan).

  Hasilkan output JSON Sesuai Schema LKPD.
  `;
  
  // USE RETRY LOGIC
  return await generateWithRetry(prompt, LKPD_SCHEMA);
};

export const generateAssessment = async (rppData: GeneratedLessonPlan): Promise<DeepLearningAssessment> => {
  const prompt = `
  ROLE: Anda adalah Spesialis Asesmen Kurikulum Merdeka. 
  Tugas: Menyusun instrumen asesmen lengkap (KKTP, Formatif, Sumatif) berdasarkan RPP.

  INPUT CONTEXT:
  - TOPIK: ${rppData.identitySection.topic}
  - TUJUAN PEMBELAJARAN (TP): ${rppData.design.objectives.join(', ')}
  - JENJANG: ${rppData.identitySection.grade}

  STRUKTUR OUTPUT TAB ASESMEN (MARKDOWN):

  ## 1. 📊 KKTP: Rubrik Pembelajaran Mendalam
  Gunakan **Taksonomi Bloom (Revisi Anderson & Krathwohl)**.
  4 Level: Perlu Bimbingan, Cukup, Baik, Sangat Baik.
  - Perlu Bimbingan: Setara C1 (Mengingat) / C2 (Memahami) parsial.
  - Cukup: Setara C2 (Memahami) / C3 (Menerapkan) sederhana.
  - Baik: Setara C3 (Menerapkan) / C4 (Menganalisis).
  - Sangat Baik: Setara C5 (Mengevaluasi) / C6 (Mencipta).
  Sesuaikan kriteria dengan kemampuan rata-rata anak jenjang ${rppData.identitySection.grade}.

  ## 2. 🔍 Asesmen Formatif (Proses)
  - A. Lembar Observasi (Checklist): Tabel checklist perilaku.
  - **HAPUS BAGIAN TES OBJEKTIF (INDIKATOR SOAL). JANGAN BUAT BAGIAN B.**
  - Bagian C: Tangga Umpan Balik (Feedback Ladder): Clarification, Appreciation, Suggestion.

  ## 3. 📝 Asesmen Sumatif (Evaluation)
  - Buatkan Kisi-Kisi Soal (Grid) indikator & level kognitif (C1-C6 Bloom).
  - **Pastikan indikator yang mengandung rumus menggunakan format LaTeX.**

  ## 4. Intervensi
  - Strategi tindak lanjut.

  Hasilkan JSON sesuai schema.
  `;
  
  // USE RETRY LOGIC
  return await generateWithRetry(prompt, ASSESSMENT_SCHEMA);
};

export const generateQuestionBank = async (rppData: GeneratedLessonPlan, config: QuestionBankConfig): Promise<QuestionBankData> => {
  
  const context = `
  TOPIK: ${rppData.identitySection.topic}
  JENJANG: ${rppData.identitySection.grade}
  TUJUAN PEMBELAJARAN: ${rppData.design.objectives.join(', ')}
  `;

  const typesList = config.types.join(', ');

  const prompt = `
    Bertindaklah sebagai Penulis Soal Profesional (Tahap 5: The Instrument). 
    Gunakan istilah "Murid".
    
    TUGAS UTAMA:
    Buatlah Bank Soal berdasarkan konfigurasi berikut:
    - **Jumlah Soal**: ${config.count} Soal.
    - **Tingkat Kesulitan (Konsep Soal)**: ${config.level} (LOTS/HOTS/Campuran).
    - **Tipe Soal**: ${typesList}.
    
    ${context}

    INSTRUKSI KHUSUS STIMULUS (WAJIB):
    Setiap soal atau kelompok soal HARUS memiliki STIMULUS.
    Aturan Stimulus:
    - Berupa Narasi, Deskripsi Data, Teks, Tabel, atau Grafik (dijelaskan dalam teks).
    - Konteks **personal / sosial-budaya / saintifik** (pilih yang paling relevan dengan topik).
    - Bersifat menarik, autentik, dan **menjadi dasar bernalar**.
    - **Tidak mengandung jawaban eksplisit**.

    INSTRUKSI TEKNIS BERDASARKAN TIPE SOAL:
    1. **Pilihan Ganda**: Sediakan opsi A, B, C, D, E.
    2. **Pilihan Ganda Kompleks**: Sediakan opsi (Checkboxes), jawaban benar bisa lebih dari satu.
    3. **Menjodohkan**: Gunakan field 'matchingPairs', buat pasangan premis (kiri) dan jawaban (kanan).
    4. **Benar/Salah**: Buat pernyataan yang harus dinilai. Kunci jawaban adalah 'Benar' atau 'Salah'.
    5. **Isian Singkat / Uraian**: Pertanyaan terbuka.

    **FORMAT MATEMATIKA:** 
    - WAJIB gunakan LaTeX ($...$) untuk semua rumus, persamaan.
    - **JANGAN gunakan LaTeX untuk angka biasa (1, 2, 5) atau huruf biasa.**
    
    **VALIDITAS:** 
    - Soal harus valid secara materi dan sesuai level murid jenjang ${rppData.identitySection.grade}.
    - Jika Konsep Soal adalah **HOTS**, pastikan soal membutuhkan analisis, evaluasi, atau kreasi (C4-C6).
    - Jika Konsep Soal adalah **LOTS**, fokus pada ingatan dan pemahaman (C1-C3).

    Hasilkan JSON sesuai schema Question Bank.
  `;
  
  // USE RETRY LOGIC
  return await generateWithRetry(prompt, QUESTION_BANK_SCHEMA);
};
