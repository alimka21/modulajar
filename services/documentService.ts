import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, VerticalAlign } from "docx";
import * as FileSaver from "file-saver";
import { GeneratedLessonPlan, AssessmentItem, KKTPItem, DocumentSettings, LearningStep, MaterialsData, LKPDData, QuestionBankData, DeepLearningAssessment } from "../types.ts";

declare var pdfMake: any;

// Constants for 1 inch Margins (2.54 cm)
const MARGIN_DOCX = 1440; // 1 inch in TWIPS
const MARGIN_PDF = 72;    // 1 inch in Points
const FONT_FACE = "Cambria"; // CHANGED TO CAMBRIA
const LINE_SPACING = 360; // 1.5 lines (240 = 1 line)

// Helper to safely extract string from potential objects
const safeString = (val: any): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) {
    return val.map(safeString).join(", ");
  }
  if (typeof val === 'object') {
      return val.text || val.content || val.value || val.description || JSON.stringify(val);
  }
  return String(val);
};

// Helper to handle file-saver import inconsistencie across environments
const saveAs = (blob: Blob, name: string) => {
  const saver = (FileSaver as any).default || (FileSaver as any).saveAs || FileSaver;
  if (typeof saver === 'function') {
      saver(blob, name);
  } else if (saver && typeof saver.saveAs === 'function') {
      saver.saveAs(blob, name);
  } else {
      console.error("FileSaver not working", FileSaver);
      alert("Gagal menyimpan file. Browser tidak mendukung FileSaver.");
  }
};

// Helper to sanitize text (Remove Lightbulb icon and Markdown Blockquote markers)
const cleanText = (text: any): string => {
  const str = safeString(text);
  if (!str) return "";
  return str.replace(/💡/g, "").replace(/^>\s*/, "").trim();
};

// Helper to clean Option labels (Remove "A. ", "a. ", etc if they exist double)
const cleanOptionText = (text: any): string => {
  const str = safeString(text);
  if (!str) return "";
  return str.replace(/^[A-Ea-e][\.\)]\s*/, "").trim();
};

// ==========================================
// DOCX GENERATION FUNCTION
// ==========================================
export const downloadDocx = async (data: GeneratedLessonPlan, settings: DocumentSettings) => {
  const { identitySection, approval } = data;

  // Font Size: 10pt=20, 11pt=22, 12pt=24
  // Force base size to 24 (12pt) regardless of setting for consistency with new design
  const baseSize = 24; 
  
  // --- HELPERS ---

  const createText = (text: string, options?: { bold?: boolean; italics?: boolean; size?: number; color?: string }) => {
      return new TextRun({
          text: text,
          font: FONT_FACE,
          size: options?.size || baseSize,
          bold: options?.bold,
          italics: options?.italics,
          color: options?.color || "000000"
      });
  };

  const createPara = (children: any[], options?: { 
      alignment?: any; 
      spacing?: any; 
      numbering?: any; 
      bullet?: any; 
      shading?: any; 
      heading?: any; 
      border?: any;
      indent?: any;
      pageBreakBefore?: boolean;
  }) => {
      return new Paragraph({
          children: children,
          alignment: options?.alignment,
          spacing: { line: LINE_SPACING, ...options?.spacing }, // Default 1.5 line spacing
          numbering: options?.numbering,
          bullet: options?.bullet,
          shading: options?.shading,
          heading: options?.heading,
          border: options?.border,
          indent: options?.indent,
          pageBreakBefore: options?.pageBreakBefore
      });
  };

  // Main Title Heading (24pt)
  const createHeading = (text: string) => createPara(
    [createText(safeString(text), { bold: true, size: 48 })], // 48 half-points = 24pt
    { alignment: AlignmentType.CENTER, spacing: { before: 300, after: 150 } }
  );

  // Subtitle/Topic Heading (12pt)
  const createTopicHeading = (text: string) => createPara(
    [createText(safeString(text), { bold: true, size: 24 })], // 24 half-points = 12pt
    { alignment: AlignmentType.CENTER, spacing: { before: 150, after: 300 } }
  );

  // Section Title (Standard 12pt Bold Uppercase) or Larger
  const createSectionTitle = (text: string, pageBreak = false) => new Paragraph({
    children: [createText(safeString(text).toUpperCase(), { bold: true, size: 24 })], // 12pt
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 240, line: LINE_SPACING },
    pageBreakBefore: pageBreak
  });

  const createLargeSectionTitle = (text: string, pageBreak = false) => new Paragraph({
    children: [createText(safeString(text).toUpperCase(), { bold: true, size: 48 })], // 24pt
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 240, line: LINE_SPACING },
    pageBreakBefore: pageBreak
  });

  // Table Styles
  const BORDER_STYLE_SOLID = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
  const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  
  const createBorders = () => ({
      top: BORDER_STYLE_SOLID, bottom: BORDER_STYLE_SOLID, left: BORDER_STYLE_SOLID, right: BORDER_STYLE_SOLID,
      insideHorizontal: BORDER_STYLE_SOLID, insideVertical: BORDER_STYLE_SOLID
  });

  const createCell = (content: Paragraph[], widthPercent?: number, hasBorder: boolean = true, shadingColor?: string) => {
      return new TableCell({
          children: content,
          width: widthPercent ? { size: widthPercent, type: WidthType.PERCENTAGE } : undefined,
          borders: hasBorder ? createBorders() : { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
          shading: shadingColor ? { fill: shadingColor, type: ShadingType.CLEAR, color: "auto" } : undefined,
          verticalAlign: VerticalAlign.TOP,
          margins: { top: 100, bottom: 100, left: 100, right: 100 }
      });
  };

  const createCellContent = (text: any, isBold = false, forceBullet = false): Paragraph[] => {
      if (!text) return [createPara([createText("-")])];

      const cleanedText = cleanText(text);

      return cleanedText.split('\n').map(line => {
          const cleanLine = line.trim();
          let contentText = cleanLine;
          let shouldBullet = forceBullet;

          if (cleanLine.startsWith('- ') || cleanLine.startsWith('• ') || cleanLine.startsWith('1. ')) {
              shouldBullet = true;
              contentText = cleanLine.replace(/^[-•]\s*|^\d+\.\s*/, '');
          }

          return createPara(
              [createText(contentText, { bold: isBold })],
              { bullet: shouldBullet ? { level: 0 } : undefined, spacing: { after: 0, line: LINE_SPACING } }
          );
      });
  };

  const createBoxedSection = (title: string, contentParagraphs: Paragraph[]) => {
      const titlePara = createPara(
          [createText(safeString(title).toUpperCase(), { bold: true })],
          { spacing: { after: 100, before: 100 } }
      );

      return [
        titlePara,
        ...contentParagraphs,
        createPara([], { spacing: { after: 200 } })
      ];
  };

  const createIdentityTable = (data: GeneratedLessonPlan) => {
    const createRow = (label: string, value: any) => new TableRow({
      children: [
        createCell([createPara([createText(label, { bold: true })], { spacing: { after: 0, line: LINE_SPACING } })], 30, false),
        createCell([createPara([createText(":")], { spacing: { after: 0, line: LINE_SPACING } })], 2, false),
        createCell([createPara([createText(safeString(value) || "-")], { spacing: { after: 0, line: LINE_SPACING } })], 68, false),
      ],
    });
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        createRow("Nama Sekolah", data.identitySection.schoolName),
        createRow("Nama Penyusun", data.approval.authorName),
        createRow("Mata Pelajaran", data.identitySection.subject),
        createRow("Kelas / Fase", data.identitySection.grade),
        createRow("Semester", data.identitySection.semester),
        createRow("Alokasi Waktu", data.identitySection.timeAllocation),
        createRow("Jumlah Pertemuan", data.identitySection.meetingCount || "1 Pertemuan"),
      ],
      borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER }
    });
  };

  // --- FIXED NUMBERING LOGIC ---
  const createCoreActivitiesContent = (items: string[]) => {
    return items.map((item, index) => {
        const text = safeString(item);
        // Check for Tip style
        if (text.match(/>\s*💡?\s*Tips?:?/i) || text.trim().startsWith(">")) {
            return createPara(
                [createText(text.replace(/^>\s*💡?\s*Tips?:?\s*/i, '💡 Tips: '), { bold: true, italics: true })],
                {
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 200, after: 200, line: LINE_SPACING },
                    shading: { type: ShadingType.CLEAR, fill: "F8F9FA", color: "auto" },
                    border: { top: { style: BorderStyle.SINGLE, space: 5, color: "E2E8F0" }, bottom: { style: BorderStyle.SINGLE, space: 5, color: "E2E8F0" } }
                }
            );
        }
        // Standard Numbered Item (MANUAL NUMBERING)
        return createPara(
            [
                createText(`${index + 1}. `, { bold: true }),
                createText(cleanText(item).replace(/^\d+\.\s*/, ''))
            ],
            {
                // Simulate list indentation manually
                indent: { left: 720, hanging: 360 }, 
                spacing: { after: 100, line: LINE_SPACING }
            }
        );
    });
  };

  const createCoreSection = (core: LearningStep['core']) => {
    return [
      createPara([createText("1. Memahami", { bold: true })], { spacing: { before: 100, after: 50, line: LINE_SPACING } }),
      ...createCoreActivitiesContent(core.memahami),
      
      createPara([createText("2. Mengaplikasi", { bold: true })], { spacing: { before: 100, after: 50, line: LINE_SPACING } }),
      ...createCoreActivitiesContent(core.mengaplikasi),
      
      createPara([createText("3. Merefleksi", { bold: true })], { spacing: { before: 100, after: 50, line: LINE_SPACING } }),
      ...createCoreActivitiesContent(core.merefleksi),
    ];
  };

  const createApprovalTable = (approval: GeneratedLessonPlan['approval']) => {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createCell([
                createPara([createText("Mengetahui,")], { alignment: AlignmentType.CENTER }),
                createPara([createText("Kepala Sekolah")], { alignment: AlignmentType.CENTER }),
                createPara([], { spacing: { before: 800 } }),
                createPara([createText(safeString(approval.principalName), { bold: true })], { alignment: AlignmentType.CENTER }),
                createPara([createText(`NIP. ${safeString(approval.principalNip)}`)], { alignment: AlignmentType.CENTER }),
            ], 50, false),
            createCell([
                createPara([createText(`${safeString(approval.location)}, ${safeString(approval.date)}`)], { alignment: AlignmentType.CENTER }),
                createPara([createText("Guru Mata Pelajaran")], { alignment: AlignmentType.CENTER }),
                createPara([], { spacing: { before: 800 } }),
                createPara([createText(safeString(approval.authorName), { bold: true })], { alignment: AlignmentType.CENTER }),
                createPara([createText(`NIP. ${safeString(approval.authorNip)}`)], { alignment: AlignmentType.CENTER }),
            ], 50, false),
          ],
        }),
      ],
      borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER }
    });
  };

  const createMaterialsSection = (m: MaterialsData) => {
      return [
          createLargeSectionTitle(`MATERI: ${safeString(m.judul)}`, true),
          
          ...createBoxedSection("Ilustrasi", [createPara([createText(safeString(m.deskripsiIlustrasi), { italics: true })])]),
          
          createPara([createText("PEMANTIK BELAJAR", { bold: true, size: baseSize + 2 })], { spacing: { before: 200, after: 100 } }),
          createPara([createText(safeString(m.pemantik), { italics: true })], { border: { left: { style: BorderStyle.SINGLE, size: 2, space: 10, color: "000000" } } }),

          createPara([createText("PETA KONSEP", { bold: true, size: baseSize + 2 })], { spacing: { before: 200, after: 100 } }),
          ...(m.petaKonsep || []).map(p => createPara([createText(safeString(p))], { bullet: { level: 0 } })),

          ...m.materiInti.flatMap((sub, i) => [
              createPara([createText(`${i+1}. ${safeString(sub.subJudul)}`, { bold: true, size: baseSize + 2 })], { spacing: { before: 200, after: 100 } }),
              createPara([createText(safeString(sub.penjelasan || "").replace(/\*\*/g, ""))]),
              
              // Contoh / Bukan Contoh Table or Box
              createPara([createText("✅ Contoh:", { bold: true })], { spacing: { before: 100 } }),
              createPara([createText(safeString(sub.contoh))]),
              createPara([createText("❌ Bukan Contoh:", { bold: true })], { spacing: { before: 100 } }),
              createPara([createText(safeString(sub.bukanContoh))]),
          ]),

          ...createBoxedSection("Tahukah Kamu?", [createPara([createText(safeString(m.trivia))])]),
          createPara([createText("GLOSARIUM", { bold: true })], { spacing: { before: 200, after: 100 } }),
          ...m.glosarium.map(g => createPara([createText(`${safeString(g.istilah)}: `, { bold: true }), createText(safeString(g.definisi))]))
      ];
  };

  const createOpenSectionTitle = (title: string) => {
      return createPara([createText(safeString(title).toUpperCase(), { bold: true })], { spacing: { after: 100, before: 200 } });
  };

  const createLkpdSection = (l: LKPDData) => {
      const processMarkdownLikeText = (text: string) => {
          const str = safeString(text);
          if (!str) return [createPara([createText("-")])];
          return str.split('\n').map(line => createPara([createText(line)]));
      };

      return [
          createLargeSectionTitle("LEMBAR KERJA PESERTA DIDIK (LKPD)", true),
          createTopicHeading(`TOPIK: ${safeString(l.activityTitle).toUpperCase()}`),
          
          createOpenSectionTitle("Petunjuk Pengerjaan"),
          ...(l.guides && l.guides.length > 0 ? l.guides : ["Berdoa sebelum memulai.", "Baca dengan teliti."]).map((g, i) => createPara([createText(`${i+1}. ${safeString(g)}`)])),

          createOpenSectionTitle("A. TUJUAN MISI"),
          createPara([createText(safeString(l.objectives))]),

          createOpenSectionTitle("B. ALAT & BAHAN"),
          ...l.toolsMaterials.map(t => createPara([createText(safeString(t))], { bullet: { level: 0 } })),

          createOpenSectionTitle("C. LANGKAH KERJA"),
          ...l.instructions.map((t, i) => createPara([createText(`${i+1}. ${safeString(t)}`)])),

          createOpenSectionTitle("D. ZONA AKTIVITAS"),
          ...processMarkdownLikeText(l.activityZone),

          createOpenSectionTitle("E. MARI BERDISKUSI"),
          ...l.discussionQuestions.map((t, i) => createPara([createText(`${i+1}. ${safeString(t)}`)])),

          createOpenSectionTitle("F. REFLEKSI DIRI"),
          ...processMarkdownLikeText(l.reflection),
      ];
  };

  const createAssessmentSection = (a: DeepLearningAssessment) => {
    if(!a) return [];
    
    // 1. KKTP Table (With Borders)
    const kktpTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ children: ['Kriteria', 'Perlu Bimbingan', 'Cukup', 'Baik', 'Sangat Baik'].map(h => createCell([createPara([createText(h, { bold: true })])], undefined, true, "F0F0F0")) }),
            ...a.kktp.map(item => new TableRow({
                children: [
                    createCell(createCellContent(safeString(item.criteria), true)),
                    createCell(createCellContent(safeString(item.needsGuidance))),
                    createCell(createCellContent(safeString(item.basic))),
                    createCell(createCellContent(safeString(item.proficient))),
                    createCell(createCellContent(safeString(item.advanced))),
                ]
            }))
        ]
    });

    // 2. Formative (Checklist)
    const checklistTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ children: ['No', 'Aspek Pengamatan', 'Indikator', 'Ceklis'].map((h, i) => createCell([createPara([createText(h, { bold: true })])], i===0 ? 5 : i===3 ? 10 : 42, true, "F0F0F0")) }),
            ...a.formative.checklist.map((item, idx) => new TableRow({
                children: [
                    createCell([createPara([createText(String(idx + 1))], { alignment: AlignmentType.CENTER })]),
                    createCell(createCellContent(safeString(item.aspect))),
                    createCell(createCellContent(safeString(item.indicator))),
                    createCell([]), // Checkbox area
                ]
            }))
        ]
    });

    // 3. Formative (Feedback Ladder)
    const feedbackLadder = [
        createPara([createText("B. Tangga Umpan Balik (Feedback Ladder)", { bold: true })], { spacing: { before: 100, after: 50 } }),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({ children: [createCell([
                    createPara([createText("KLARIFIKASI: ", { bold: true }), createText(safeString(a.formative.feedbackGuide.clarification), { italics: true })]),
                    createPara([createText("APRESIASI: ", { bold: true }), createText(safeString(a.formative.feedbackGuide.appreciation), { italics: true })], { spacing: { before: 100 } }),
                    createPara([createText("SARAN: ", { bold: true }), createText(safeString(a.formative.feedbackGuide.suggestion), { italics: true })], { spacing: { before: 100 } }),
                ])] })
            ]
        })
    ];

    // 4. Summative Grid (Kisi-Kisi)
    const summativeGrid = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ children: ['No', 'Indikator Soal', 'Level Kognitif', 'Bentuk Soal'].map((h, i) => createCell([createPara([createText(h, { bold: true })])], i===0 ? 5 : undefined, true, "F0F0F0")) }),
            ...a.summative.grid.map((item, idx) => new TableRow({
                children: [
                    createCell([createPara([createText(String(idx + 1))], { alignment: AlignmentType.CENTER })]),
                    createCell(createCellContent(safeString(item.indicator))),
                    createCell(createCellContent(safeString(item.level))),
                    createCell(createCellContent(safeString(item.technique))),
                ]
            }))
        ]
    });

    // 5. Intervention
    const interventionTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ children: ['Kondisi Siswa', 'Strategi Intervensi'].map(h => createCell([createPara([createText(h, { bold: true })])], undefined, true, "F0F0F0")) }),
            new TableRow({ children: [ createCell([createPara([createText("Perlu Bimbingan", { bold: true })])]), createCell(createCellContent(safeString(a.intervention.needsGuidance))) ] }),
            new TableRow({ children: [ createCell([createPara([createText("Cukup", { bold: true })])]), createCell(createCellContent(safeString(a.intervention.basic))) ] }),
            new TableRow({ children: [ createCell([createPara([createText("Baik", { bold: true })])]), createCell(createCellContent(safeString(a.intervention.proficient))) ] }),
            new TableRow({ children: [ createCell([createPara([createText("Sangat Baik", { bold: true })])]), createCell(createCellContent(safeString(a.intervention.advanced))) ] }),
        ]
    });

    return [
        createLargeSectionTitle("INSTRUMEN ASESMEN & EVALUASI", true),
        createTopicHeading(`TOPIK: ${safeString(data.identitySection.topic).toUpperCase()}`),
        
        createOpenSectionTitle("1. KKTP (Rubrik Pembelajaran Mendalam)"),
        kktpTable,

        createOpenSectionTitle("2. Asesmen Formatif (Proses)"),
        createPara([createText("A. Lembar Observasi (Checklist)", { bold: true })], { spacing: { before: 50, after: 50 } }),
        checklistTable,
        ...feedbackLadder,

        createOpenSectionTitle("3. Asesmen Sumatif (Kisi-Kisi)"),
        summativeGrid,

        createOpenSectionTitle("4. Tindak Lanjut & Intervensi"),
        interventionTable
    ];
  };

  const createQuestionBankSection = (qb: QuestionBankData) => {
      const items: (Paragraph | Table)[] = [
          createLargeSectionTitle("BANK SOAL & EVALUASI", true),
          createTopicHeading(`TOPIK: ${safeString(data.identitySection.topic).toUpperCase()}`),
      ];
      
      qb.items.forEach(item => {
          items.push(createPara([createText(`${item.number}. ${safeString(item.type)}`, { bold: true })], { spacing: { before: 100 } }));
          if (item.stimulus) items.push(createPara([createText(safeString(item.stimulus), { italics: true })], { spacing: { after: 50 } }));
          
          if (item.type === 'Menjodohkan') {
               const leftLines = item.question.split('\n').filter(l => l.trim().length > 0);
               const rightLines = item.options || [];
               const maxRows = Math.max(leftLines.length, rightLines.length);

               // Use a single table with 4 columns for perfect alignment
               const tableRows = [
                   new TableRow({
                       children: [
                           createCell([createPara([createText("Daftar Pernyataan", { bold: true })])], 45, false), // No border for header for cleaner look inside question
                           createCell([], 5, false),
                           createCell([], 5, false),
                           createCell([createPara([createText("Respon", { bold: true })])], 45, false),
                       ]
                   })
               ];

               for (let i = 0; i < maxRows; i++) {
                   tableRows.push(new TableRow({
                       children: [
                           createCell([createPara([createText(leftLines[i] || "")])], 45, true),
                           createCell([createPara([createText(leftLines[i] ? "O" : "")], { alignment: AlignmentType.CENTER })], 5, false),
                           createCell([createPara([createText(rightLines[i] ? "O" : "")], { alignment: AlignmentType.CENTER })], 5, false),
                           createCell([createPara([createText(rightLines[i] ? cleanOptionText(rightLines[i]) : "")])], 45, true),
                       ]
                   }));
               }

               items.push(new Table({
                   width: { size: 100, type: WidthType.PERCENTAGE },
                   rows: tableRows,
                   borders: {
                       top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
                       insideHorizontal: NO_BORDER, insideVertical: NO_BORDER
                   }
               }));

          } else {
              items.push(createPara([createText(safeString(item.question))]));
              
              if (item.options && item.options.length > 0) {
                  item.options.forEach((opt, idx) => {
                      const cleanOpt = cleanOptionText(opt);
                      items.push(createPara(
                          [createText(`${String.fromCharCode(65+idx)}. `, { bold: true }), createText(cleanOpt)],
                          { indent: { left: 400, hanging: 0 } }
                      ));
                  });
              }
          }
          items.push(createPara([]));
      });

      items.push(createPara([], { pageBreakBefore: true }));
      items.push(createPara([createText("KUNCI JAWABAN", { bold: true, size: 28 })], { alignment: AlignmentType.CENTER, spacing: { after: 200 } }));
      
      const keyTable = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
              new TableRow({ children: ['No', 'Jawaban', 'Tipe'].map(h => createCell([createPara([createText(h, { bold: true })])], undefined, true, "F0F0F0")) }),
              ...qb.items.map(item => new TableRow({
                  children: [
                      createCell([createPara([createText(String(item.number))], { alignment: AlignmentType.CENTER })]),
                      createCell([createPara([createText(safeString(item.answerKey), { bold: true })])]),
                      createCell([createPara([createText(safeString(item.type), { italics: true })])]),
                  ]
              }))
          ]
      });
      items.push(keyTable);

      return items;
  };

  // --- ASSEMBLE DOCX ---
  
  const identityTable = createIdentityTable(data);
  const approvalTable = createApprovalTable(approval);
  
  const rppChildren = [
      createHeading("MODUL AJAR"),
      createTopicHeading(`TOPIK: ${safeString(data.identitySection.topic).toUpperCase()}`),
      createSectionTitle("I. IDENTITAS UMUM"),
      identityTable,
      
      ...createBoxedSection("Asesmen Awal (Diagnostik)", [createPara([createText(safeString(data.initialAssessment) || "Belum ada data.")])]),
      ...createBoxedSection("Dimensi Profil Lulusan", data.graduateProfile.map(g => createPara([createText(safeString(g))], { bullet: { level: 0 } }))),

      createSectionTitle("II. KOMPONEN INTI"),
      ...createBoxedSection("1. Tujuan Pembelajaran", data.design.objectives.map(o => createPara([createText(safeString(o))], { bullet: { level: 0 } }))),
      ...createBoxedSection("2. Praktik Pedagogis", [createPara([createText(safeString(data.design.pedagogicalPractice))])]),
      ...(data.design.partnership ? createBoxedSection("3. Kemitraan", [createPara([createText(safeString(data.design.partnership))])]) : []),
      ...createBoxedSection(data.design.partnership ? "4. Lingkungan Belajar" : "3. Lingkungan Belajar", [createPara([createText(safeString(data.design.environment))])]),
      ...(data.design.digital ? createBoxedSection(data.design.partnership ? "5. Pemanfaatan Digital" : "4. Pemanfaatan Digital", [createPara([createText(safeString(data.design.digital))])]) : []),

      createSectionTitle("III. LANGKAH PEMBELAJARAN", true),
      ...data.learningExperience.flatMap((step, idx) => [
          createPara([createText(`PERTEMUAN ${step.meetingNo}`, { bold: true, size: baseSize + 2 })], { spacing: { before: 200, after: 100, line: LINE_SPACING }, alignment: AlignmentType.CENTER }),
          
          ...createBoxedSection("A. Pendahuluan", [
             createPara([createText(`Prinsip: ${safeString(step.introPrinciple)}`, { italics: true, bold: true })]),
             ...createCoreActivitiesContent(step.intro)
          ]),
          ...createBoxedSection("B. Kegiatan Inti", [
             createPara([createText(`Prinsip: ${safeString(step.corePrinciple)}`, { italics: true, bold: true })]),
             ...createCoreSection(step.core)
          ]),
          ...createBoxedSection("C. Penutup", [
             createPara([createText(`Prinsip: ${safeString(step.closingPrinciple)}`, { italics: true, bold: true })]),
             ...createCoreActivitiesContent(step.closing)
          ]),
          createPara([], { pageBreakBefore: idx < data.learningExperience.length - 1 })
      ]),
      
      createPara([], { spacing: { before: 500 } }),
      approvalTable
  ];
  
  const materialsChildren = data.materials ? createMaterialsSection(data.materials) : [];
  const lkpdChildren = data.lkpd ? createLkpdSection(data.lkpd) : [];
  const assessmentChildren = data.assessment ? createAssessmentSection(data.assessment) : [];
  const reflectionChildren = data.reflection ? [
      createLargeSectionTitle("REFLEKSI PEMBELAJARAN", true),
      ...createBoxedSection("Refleksi Guru", data.reflection.teacher.map(t => createPara([createText(safeString(t))], { bullet: { level: 0 } }))),
      ...createBoxedSection("Refleksi Murid", data.reflection.student.map(t => createPara([createText(safeString(t))], { bullet: { level: 0 } })))
  ] : [];
  const qbChildren = data.questionBank ? createQuestionBankSection(data.questionBank) : [];

  const allChildren = [
      ...rppChildren,
      ...materialsChildren,
      ...lkpdChildren,
      ...assessmentChildren,
      ...reflectionChildren,
      ...qbChildren
  ];

  const doc = new Document({
      sections: [{
          properties: {
             page: {
                 margin: {
                     top: MARGIN_DOCX,
                     right: MARGIN_DOCX,
                     bottom: MARGIN_DOCX,
                     left: MARGIN_DOCX,
                 }
             }
          },
          children: allChildren
      }]
      // Removed global numbering config to rely on manual text numbers
  });

  Packer.toBlob(doc).then(blob => {
      saveAs(blob, `RPP_${safeString(data.identitySection.topic).replace(/\s+/g, "_")}.docx`);
  });
};

// ==========================================
// PDF GENERATION FUNCTION
// ==========================================

export const downloadPdf = (data: GeneratedLessonPlan, settings: DocumentSettings) => {
  // Hardcoded to 12 as per request
  const fontSize = 12;
  const pageSize = settings.paperSize;

  const { identitySection, initialAssessment, graduateProfile, design, learningExperience, assessment, approval, lkpd, questionBank, materials, reflection } = data;

  // --- PDF HELPERS ---
  const parseTextWithBold = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/);
    return {
        text: parts.map(part => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return { text: part.slice(2, -2), bold: true };
            }
            return part;
        })
    };
  };

  const parseStringBlock = (text: string, size: number) => {
      if (!text) return { text: '-' };
      return { text: safeString(text), fontSize: size };
  };

  // Header 24pt, Subtitle 12pt
  const createPdfHeader = (title: string, subtitle: string) => [
      { text: title, fontSize: 24, bold: true, alignment: 'center', margin: [0, 0, 0, 2] },
      { text: subtitle, fontSize: 12, bold: true, alignment: 'center', margin: [0, 0, 0, 10] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5 }] },
      { text: '\n' }
  ];

  const createPdfBox = (title: string, content: any) => ({
      stack: [
          { text: safeString(title).toUpperCase(), fontSize: 12, bold: true, margin: [0, 5, 0, 0] },
          {
              stack: Array.isArray(content) ? content : [content], margin: [0, 2, 0, 0]
          }
      ],
      margin: [0, 0, 0, 10]
  });

  const createPdfCoreActivities = (core: any) => {
      const processItems = (items: string[]) => {
          return items.map((t, i) => {
              const text = safeString(t);
              if (text.match(/>\s*💡?\s*Tips?:?/i) || text.trim().startsWith(">")) {
                  return {
                      text: text.replace(/^>\s*💡?\s*Tips?:?\s*/i, '💡 Tips: '),
                      bold: true,
                      italics: true,
                      alignment: 'center',
                      background: '#F8F9FA',
                      margin: [0, 10, 0, 10]
                  };
              }
              return { 
                  text: [ { text: `${i+1}. `, bold: true }, ...parseTextWithBold(cleanText(t).replace(/^\d+\.\s*/, '')).text ],
                  fontSize,
                  margin: [10, 2, 0, 2]
              };
          });
      };

      return [
          { text: '1. Memahami', bold: true, fontSize, margin: [0, 5, 0, 2] },
          { stack: processItems(core.memahami) },
          { text: '2. Mengaplikasi', bold: true, fontSize, margin: [0, 5, 0, 2] },
          { stack: processItems(core.mengaplikasi) },
          { text: '3. Merefleksi', bold: true, fontSize, margin: [0, 5, 0, 2] },
          { stack: processItems(core.merefleksi) }
      ];
  };

  const createPdfIntroClosing = (items: string[]) => {
       return items.map((t, i) => {
              const text = safeString(t);
              if (text.match(/>\s*💡?\s*Tips?:?/i) || text.trim().startsWith(">")) {
                  return {
                      text: text.replace(/^>\s*💡?\s*Tips?:?\s*/i, '💡 Tips: '),
                      bold: true,
                      italics: true,
                      alignment: 'center',
                      background: '#F8F9FA',
                      margin: [0, 10, 0, 10]
                  };
              }
              return { 
                  text: [ { text: `${i+1}. `, bold: true }, ...parseTextWithBold(cleanText(t).replace(/^\d+\.\s*/, '')).text ],
                  fontSize,
                  margin: [10, 2, 0, 2]
              };
       });
  }

  const createPdfMaterialsImproved = (m: MaterialsData) => [
      { text: safeString(m.judul).toUpperCase(), fontSize: 24, bold: true, alignment: 'center', margin: [0, 10] },
      { text: safeString(m.pemantik), italics: true, margin: [0, 0, 0, 10], background: '#fffbeb', padding: 5 },
      { ul: (m.petaKonsep || []).map(safeString), margin: [0, 0, 0, 10] },
      ...m.materiInti.map((sub, i) => ({
          stack: [
              { text: `${i+1}. ${safeString(sub.subJudul)}`, bold: true, fontSize: fontSize + 2, margin: [0, 10, 0, 5] },
              { text: safeString(sub.penjelasan || "").replace(/\*\*/g, ""), fontSize },
              { text: 'Contoh:', bold: true, margin: [0, 5, 0, 0] },
              { text: safeString(sub.contoh), fontSize },
              { text: 'Bukan Contoh:', bold: true, margin: [0, 5, 0, 0] },
              { text: safeString(sub.bukanContoh), fontSize }
          ]
      })),
      { text: 'Tahukah Kamu?', bold: true, margin: [0, 10, 0, 2] },
      { text: safeString(m.trivia), italics: true },
      { text: 'Glosarium', bold: true, margin: [0, 10, 0, 2] },
      { ul: m.glosarium.map(g => `${safeString(g.istilah)}: ${safeString(g.definisi)}`) }
  ];

  const createPdfLkpd = (l: LKPDData) => [
      { text: 'LEMBAR KERJA PESERTA DIDIK', style: 'header', alignment: 'center', bold: true, fontSize: 24 },
      { text: `TOPIK: ${safeString(l.activityTitle).toUpperCase()}`, alignment: 'center', bold: true, fontSize: 12, margin: [0, 0, 0, 20] },
      { text: 'Petunjuk:', bold: true },
      { ul: (l.guides || []).map(safeString) },
      { text: 'A. Tujuan', bold: true, margin: [0, 10, 0, 0] },
      { text: safeString(l.objectives) },
      { text: 'B. Alat & Bahan', bold: true, margin: [0, 10, 0, 0] },
      { ul: l.toolsMaterials.map(safeString) },
      { text: 'C. Langkah Kerja', bold: true, margin: [0, 10, 0, 0] },
      { ol: l.instructions.map(safeString) },
      { text: 'D. Zona Aktivitas', bold: true, margin: [0, 10, 0, 0] },
      { text: safeString(l.activityZone), fontSize: fontSize - 1 },
      { text: 'E. Diskusi', bold: true, margin: [0, 10, 0, 0] },
      { ol: l.discussionQuestions.map(safeString) },
      { text: 'F. Refleksi', bold: true, margin: [0, 10, 0, 0] },
      { text: safeString(l.reflection) }
  ];

  const createPdfAssessment = (a: DeepLearningAssessment) => {
      if (!a) return [];
      
      const kktpTable = {
          table: {
              headerRows: 1,
              widths: ['auto', '*', '*', '*', '*'],
              body: [
                  ['Kriteria', 'Perlu Bimbingan', 'Cukup', 'Baik', 'Sangat Baik'].map(h => ({ text: h, bold: true, fillColor: '#f0f0f0', fontSize: fontSize - 2 })),
                  ...a.kktp.map(k => [k.criteria, k.needsGuidance, k.basic, k.proficient, k.advanced].map(val => ({ text: safeString(val), fontSize: fontSize - 2 })))
              ]
          },
          margin: [0, 0, 0, 15]
      };

      const checklistTable = {
          table: {
              headerRows: 1,
              widths: ['auto', '*', '*', 'auto'],
              body: [
                  ['No', 'Aspek Pengamatan', 'Indikator', 'Ceklis'].map(h => ({ text: h, bold: true, fillColor: '#f0f0f0' })),
                  ...a.formative.checklist.map((c, i) => [String(i+1), safeString(c.aspect), safeString(c.indicator), ''])
              ]
          },
          margin: [0, 0, 0, 10]
      };

      const feedbackBox = {
          stack: [
              { text: 'B. Tangga Umpan Balik (Feedback Ladder)', bold: true, fontSize: fontSize, margin: [0,10,0,5] },
              {
                  table: {
                      widths: ['*'],
                      body: [[
                          { stack: [
                              { text: `KLARIFIKASI: ${safeString(a.formative.feedbackGuide.clarification)}`, italics: true, fontSize: fontSize - 1 },
                              { text: `APRESIASI: ${safeString(a.formative.feedbackGuide.appreciation)}`, italics: true, fontSize: fontSize - 1, margin: [0,5,0,0] },
                              { text: `SARAN: ${safeString(a.formative.feedbackGuide.suggestion)}`, italics: true, fontSize: fontSize - 1, margin: [0,5,0,0] }
                          ]}
                      ]]
                  }
              }
          ],
          margin: [0, 0, 0, 15]
      };
      
      const summativeGridTable = {
          table: {
              headerRows: 1,
              widths: ['auto', '*', 'auto', 'auto'],
              body: [
                  ['No', 'Indikator Soal', 'Level Kognitif', 'Bentuk Soal'].map(h => ({ text: h, bold: true, fillColor: '#f0f0f0' })),
                  ...a.summative.grid.map((s, i) => [String(i+1), safeString(s.indicator), safeString(s.level), safeString(s.technique)])
              ]
          },
          margin: [0, 0, 0, 10]
      };

      const interventionTable = {
          table: {
              headerRows: 1,
              widths: ['30%', '*'],
              body: [
                  ['Level Siswa', 'Strategi Intervensi'].map(h => ({ text: h, bold: true, fillColor: '#f0f0f0' })),
                  ['Perlu Bimbingan', safeString(a.intervention.needsGuidance)],
                  ['Cukup', safeString(a.intervention.basic)],
                  ['Baik', safeString(a.intervention.proficient)],
                  ['Sangat Baik', safeString(a.intervention.advanced)]
              ]
          },
          margin: [0, 0, 0, 10]
      };

      return [
          { text: 'INSTRUMEN ASESMEN & EVALUASI', fontSize: 24, bold: true, alignment: 'center', margin: [0, 20, 0, 10] },
          { text: `TOPIK: ${safeString(data.identitySection.topic).toUpperCase()}`, bold: true, fontSize: 12, alignment: 'center', margin: [0,0,0,15] },
          { text: '1. KKTP (Rubrik Pembelajaran Mendalam)', bold: true, margin: [0, 5] },
          kktpTable,
          { text: '2. Asesmen Formatif (Proses)', bold: true, margin: [0, 5] },
          { text: 'A. Lembar Observasi', bold: true, margin: [0, 5] },
          checklistTable,
          feedbackBox,
          { text: '3. Sumatif (Kisi-Kisi)', bold: true, margin: [0, 5] },
          summativeGridTable,
          { text: '4. Intervensi', bold: true, margin: [0, 5] },
          interventionTable
      ];
  };

  const createPdfReflection = (r: GeneratedLessonPlan['reflection']) => {
      if (!r) return [];
      return [
          { text: 'REFLEKSI PEMBELAJARAN', fontSize: 24, alignment: 'center', bold: true, margin: [0, 20, 0, 10] },
          createPdfBox('Refleksi Guru', { ul: r.teacher.map(t => ({ text: safeString(t), fontSize })) }),
          createPdfBox('Refleksi Murid', { ul: r.student.map(t => ({ text: safeString(t), fontSize })) })
      ];
  };

  const createPdfQuestionBank = (qb: QuestionBankData) => {
      const items = qb.items.map(item => {
        if (item.type === 'Menjodohkan') {
            const leftLines = item.question.split('\n').filter(l => l.trim().length > 0);
            const rightLines = item.options || [];
            const maxRows = Math.max(leftLines.length, rightLines.length);
            
            const tableBody: any[] = [
                ['Daftar Pernyataan', '', '', 'Respon'].map(h => ({ text: h, bold: true, fillColor: '#ffffff' })) // White header matching prompt visually
            ];

            for (let i = 0; i < maxRows; i++) {
                tableBody.push([
                    { text: leftLines[i] || '', margin: [0, 5] },
                    { text: leftLines[i] ? 'O' : '', alignment: 'center', margin: [0, 5], bold: true }, // Simple O representation
                    { text: rightLines[i] ? 'O' : '', alignment: 'center', margin: [0, 5], bold: true },
                    { text: rightLines[i] ? cleanOptionText(rightLines[i]) : '', margin: [0, 5] }
                ]);
            }

            return {
                stack: [
                    { text: `${item.number}. ${safeString(item.type)}`, bold: true, margin: [0, 5] },
                    item.stimulus ? { text: safeString(item.stimulus), italics: true, margin: [0, 0, 0, 5] } : null,
                    {
                        table: {
                            widths: ['40%', '5%', '5%', '50%'],
                            body: tableBody
                        },
                        layout: 'noBorders' // Or minimalistic borders if preferred
                    },
                    { text: '' }
                ].filter(Boolean)
            };
        }

        return {
            stack: [
                { text: `${item.number}. ${safeString(item.type)}`, bold: true, margin: [0, 5] },
                item.stimulus ? { text: safeString(item.stimulus), italics: true, margin: [0, 0, 0, 5] } : null,
                { text: safeString(item.question) },
                item.options && item.options.length ? { ul: item.options.map(safeString), margin: [15, 0, 0, 0] } : null,
                { text: '' }
            ].filter(Boolean)
        };
      });
      
      const keyBody = [
          [{ text: 'No', bold: true }, { text: 'Jawaban', bold: true }, { text: 'Tipe', bold: true }],
          ...qb.items.map(i => [i.number, safeString(i.answerKey), safeString(i.type)])
      ];

      return [
          { text: 'BANK SOAL', fontSize: 24, alignment: 'center', bold: true, margin: [0, 20, 0, 10] },
          { text: `TOPIK: ${safeString(data.identitySection.topic).toUpperCase()}`, bold: true, fontSize: 12, alignment: 'center', margin: [0,0,0,15] },
          ...items,
          { text: 'KUNCI JAWABAN', fontSize: 24, alignment: 'center', bold: true, margin: [0, 20, 0, 10], pageBreak: 'before' },
          {
              table: {
                  widths: ['auto', '*', 'auto'],
                  body: keyBody
              }
          }
      ];
  };

  // --- IDENTITY TABLE (PDF) ---
  const identityTable = {
    table: {
      widths: ['30%', '2%', '68%'],
      body: [
        ['Nama Sekolah', ':', identitySection.schoolName],
        ['Penyusun', ':', approval.authorName],
        ['Mata Pelajaran', ':', identitySection.subject],
        ['Kelas / Fase', ':', identitySection.grade],
        ['Semester', ':', identitySection.semester],
        ['Alokasi Waktu', ':', identitySection.timeAllocation],
        ['Pertemuan', ':', identitySection.meetingCount]
      ].map(row => row.map(cell => ({ text: safeString(cell), fontSize })))
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 10]
  };

  const approvalSection = {
      table: {
          widths: ['*', '*'],
          body: [
              [
                  { text: `Mengetahui,\nKepala Sekolah\n\n\n\n${safeString(approval.principalName)}\nNIP. ${safeString(approval.principalNip)}`, alignment: 'center', fontSize },
                  { text: `${safeString(approval.location)}, ${safeString(approval.date)}\nGuru Mata Pelajaran\n\n\n\n${safeString(approval.authorName)}\nNIP. ${safeString(approval.authorNip)}`, alignment: 'center', fontSize }
              ]
          ]
      },
      layout: 'noBorders',
      margin: [0, 20, 0, 0]
  };

  // --- PDF DOCUMENT DEFINITION ---
  const docDefinition = {
    pageSize: pageSize,
    pageMargins: [MARGIN_PDF, MARGIN_PDF, MARGIN_PDF, MARGIN_PDF],
    content: [
      ...createPdfHeader('MODUL AJAR', `TOPIK: ${safeString(identitySection.topic).toUpperCase()}`),
      { text: 'I. IDENTITAS UMUM', bold: true, margin: [0, 0, 0, 5], fontSize: fontSize },
      identityTable,
      
      createPdfBox('Asesmen Awal', parseStringBlock(initialAssessment, fontSize)),
      createPdfBox('Profil Lulusan', { ul: graduateProfile.length ? graduateProfile.map(safeString) : ['-'] }),

      { text: 'II. KOMPONEN INTI', bold: true, margin: [0, 15, 0, 5], fontSize: fontSize },
      createPdfBox('Tujuan Pembelajaran', { ul: design.objectives.map(safeString) }),
      createPdfBox('Praktik Pedagogis', parseStringBlock(design.pedagogicalPractice, fontSize)),
      createPdfBox('Lingkungan Pembelajaran', parseStringBlock(design.environment, fontSize)),
      design.partnership ? createPdfBox('Kemitraan', parseStringBlock(design.partnership, fontSize)) : null,
      design.digital ? createPdfBox('Digital', parseStringBlock(design.digital, fontSize)) : null,

      { text: 'III. LANGKAH PEMBELAJARAN', bold: true, margin: [0, 15, 0, 5], fontSize: fontSize },
      ...learningExperience.flatMap((step) => [
          { text: `PERTEMUAN ${step.meetingNo}`, bold: true, margin: [0, 10, 0, 5], fontSize: fontSize + 1, alignment: 'center' },
          createPdfBox('A. Pendahuluan', [
              { text: `Prinsip: ${safeString(step.introPrinciple)}`, italics: true, bold: true, fontSize: fontSize-1, margin: [0,0,0,5] },
              { stack: createPdfIntroClosing(step.intro) }
          ]),
          createPdfBox('B. Kegiatan Inti', [
              { text: `Prinsip: ${safeString(step.corePrinciple)}`, italics: true, bold: true, fontSize: fontSize-1, margin: [0,0,0,5] },
              ...createPdfCoreActivities(step.core)
          ]),
          createPdfBox('C. Penutup', [
              { text: `Prinsip: ${safeString(step.closingPrinciple)}`, italics: true, bold: true, fontSize: fontSize-1, margin: [0,0,0,5] },
              { stack: createPdfIntroClosing(step.closing) }
          ]),
      ]),

      { text: '\n' },
      approvalSection,

      ...(materials ? [
        { text: '', pageBreak: 'before' },
        ...createPdfMaterialsImproved(materials)
      ] : []),

      ...(lkpd ? [
        { text: '', pageBreak: 'before' },
        ...createPdfLkpd(lkpd)
      ] : []),

      ...(assessment ? [
        { text: '', pageBreak: 'before' },
        ...createPdfAssessment(assessment)
      ] : []),

      ...(reflection ? [
         { text: '', pageBreak: 'before' },
         ...createPdfReflection(reflection)
      ] : []),

      ...(questionBank ? [
         { text: '', pageBreak: 'before' },
         ...createPdfQuestionBank(questionBank)
      ] : []),
    ].filter(Boolean),
    defaultStyle: { fontSize: fontSize, font: 'Cambria' } // CHANGED TO CAMBRIA
  };

  pdfMake.fonts = {
      Cambria: {
          normal: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf', // Fallback, real custom fonts need vfs setup
          bold: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Medium.ttf',
          italics: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Italic.ttf',
          bolditalics: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-MediumItalic.ttf'
      },
      Roboto: {
          normal: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf',
          bold: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Medium.ttf',
          italics: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Italic.ttf',
          bolditalics: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-MediumItalic.ttf'
      }
  }

  pdfMake.createPdf(docDefinition).download(`RPP_${safeString(identitySection.topic).replace(/\s+/g, "_")}.pdf`);
};
