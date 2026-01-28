import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, VerticalAlign, AlignmentType } from "docx";
import * as FileSaver from "file-saver";
import { GeneratedLessonPlan, DocumentSettings, LearningStep, MaterialsData, LKPDData, QuestionBankData, DeepLearningAssessment } from "../types";

declare var pdfMake: any;

// === CONSTANTS FOR PROFESSIONAL LAYOUT ===
// 1 inch = 1440 TWIPS. 25mm approx 1417 TWIPS.
const MARGIN_DOCX = 1417; // 25mm (Atas, Bawah, Kiri, Kanan)
const FONT_FACE = "Cambria"; 
const FONT_MATH = "Cambria Math";
const COLOR_ACCENT = "87CEFA"; // Light Blue
const COLOR_WHITE = "FFFFFF";

// Spacing Constants (in TWIPS, 20 twips = 1pt)
const LINE_SPACING_BODY = 360; // 1.5 lines (240 = 1 line single)
const LINE_SPACING_TABLE = 312; // 1.3 lines for tables
const SPACING_AFTER_PARA = 160; // 8pt
const SPACING_AFTER_LIST = 120; // 6pt

// Font Sizes (Half-points, e.g., 24 = 12pt)
const SIZE_H1 = 48;   // 24pt
const SIZE_H2 = 28;   // 14pt (Requested Change)
const SIZE_H3 = 28;   // 14pt
const SIZE_BODY = 24; // 12pt
const SIZE_TABLE = 22; // 11pt

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

  // --- TYPOGRAPHY HELPERS ---

  const createText = (text: string, options?: { bold?: boolean; italics?: boolean; size?: number; color?: string; font?: string }) => {
      return new TextRun({
          text: text,
          font: options?.font || FONT_FACE,
          size: options?.size || SIZE_BODY,
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
      keepNext?: boolean;
  }) => {
      return new Paragraph({
          children: children,
          alignment: options?.alignment || AlignmentType.LEFT, 
          // Default Body: 1.5 spacing, 8pt after (160 twips)
          spacing: { line: LINE_SPACING_BODY, after: SPACING_AFTER_PARA, ...options?.spacing }, 
          numbering: options?.numbering,
          bullet: options?.bullet,
          shading: options?.shading,
          heading: options?.heading,
          border: options?.border,
          indent: options?.indent,
          pageBreakBefore: options?.pageBreakBefore,
          keepNext: options?.keepNext
      });
  };

  // H1: Cambria Bold, 24pt, Spasi Sebelum 0, Sesudah 0, Center
  const createHeading = (text: string) => createPara(
    [createText(safeString(text).toUpperCase(), { bold: true, size: SIZE_H1 })], 
    { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: LINE_SPACING_BODY } }
  );

  // H2: Cambria Bold, 14pt (SIZE_H2), Spasi Sebelum 0, Sesudah 12pt, Center
  const createSectionTitle = (text: string, pageBreak = false) => createPara(
    [createText(safeString(text).toUpperCase(), { bold: true, size: SIZE_H2 })],
    { 
        alignment: AlignmentType.CENTER, 
        spacing: { before: 0, after: 240, line: LINE_SPACING_BODY },
        pageBreakBefore: pageBreak,
        keepNext: true
    }
  );

  // H3: Cambria Bold, 14pt, Spasi Sebelum 12pt, Sesudah 8pt, Left, Blue Underline (Conditional)
  const createSubSectionTitle = (text: string, hasUnderline: boolean = true) => createPara(
    [createText(safeString(text), { bold: true, size: SIZE_H3 })],
    { 
        alignment: AlignmentType.LEFT, 
        spacing: { before: 240, after: 160, line: LINE_SPACING_BODY },
        keepNext: true,
        border: hasUnderline ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT } } : undefined
    }
  );

  // Topic Subtitle (Under H1)
  const createTopicSubTitle = (text: string) => createPara(
    [createText(safeString(text).toUpperCase(), { bold: true, size: SIZE_H3 })], 
    { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 360, line: LINE_SPACING_BODY } }
  );

  // --- TABLE HELPERS ---
  const BORDER_STYLE_SOLID = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
  const BORDER_STYLE_WHITE = { style: BorderStyle.SINGLE, size: 1, color: COLOR_WHITE };
  const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  
  const createBorders = (isWhite: boolean = false) => {
      const style = isWhite ? BORDER_STYLE_WHITE : BORDER_STYLE_SOLID;
      return {
          top: style, bottom: style, left: style, right: style,
          insideHorizontal: style, insideVertical: style
      };
  };

  const createCell = (
      content: Paragraph[], 
      widthPercent?: number, 
      hasBorder: boolean = true, 
      shadingColor?: string, 
      isWhiteBorder: boolean = false,
      tightPadding: boolean = false
  ) => {
      const marginSize = tightPadding ? 40 : 160; // 40 twips = 2pt approx, 160 = 8pt
      return new TableCell({
          children: content,
          width: widthPercent ? { size: widthPercent, type: WidthType.PERCENTAGE } : undefined,
          borders: hasBorder ? createBorders(isWhiteBorder) : { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
          shading: shadingColor ? { fill: shadingColor, type: ShadingType.CLEAR, color: "auto" } : undefined,
          verticalAlign: VerticalAlign.TOP,
          margins: { top: marginSize, bottom: marginSize, left: marginSize, right: marginSize }
      });
  };

  const createCellContent = (text: any, isBold = false, forceBullet = false): Paragraph[] => {
      if (!text) return [createPara([createText("-", { size: SIZE_TABLE })], { spacing: { after: 0, line: LINE_SPACING_TABLE } })];

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
              [createText(contentText, { bold: isBold, size: SIZE_TABLE })],
              { 
                  bullet: shouldBullet ? { level: 0 } : undefined, 
                  spacing: { line: LINE_SPACING_TABLE, after: 0 }, // Tight spacing in tables
                  alignment: AlignmentType.LEFT 
              }
          );
      });
  };

  // --- COMPONENT BUILDERS ---

  const createIdentityTable = (data: GeneratedLessonPlan) => {
    // Identity Table: White Borders, Tight Padding, No Extra Spacing
    const createRow = (label: string, value: any) => new TableRow({
      children: [
        createCell([createPara([createText(label, { bold: true })], { spacing: { after: 0, line: 240 } })], 30, true, undefined, true, true),
        createCell([createPara([createText(":")], { spacing: { after: 0, line: 240 } })], 2, true, undefined, true, true),
        createCell([createPara([createText(safeString(value) || "-")], { spacing: { after: 0, line: 240 } })], 68, true, undefined, true, true),
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
      borders: createBorders(true) // White borders for the table container too
    });
  };

  // List Item Styles: Spacing 6pt (120 twips), Indent 0.5cm (283 twips approx)
  const createListItem = (text: string, level = 0) => {
      const cleanLine = cleanText(text).replace(/^\d+\.\s*/, '');
      return createPara(
          [createText(cleanLine)],
          {
              bullet: { level },
              spacing: { after: SPACING_AFTER_LIST, line: LINE_SPACING_BODY },
              indent: { left: 425, hanging: 283 } // Approx 0.75cm indent
          }
      );
  };

  const createCoreActivitiesContent = (items: string[]) => {
    return items.map((item) => createListItem(item));
  };

  const createApprovalTable = (approval: GeneratedLessonPlan['approval']) => {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createCell([
                createPara([createText("Mengetahui,")], { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
                createPara([createText("Kepala Sekolah")], { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
                createPara([], { spacing: { before: 1200 } }), // Space for signature
                createPara([createText(safeString(approval.principalName), { bold: true })], { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
                createPara([createText(`NIP. ${safeString(approval.principalNip)}`)], { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
            ], 50, false),
            createCell([
                createPara([createText(`${safeString(approval.location)}, ${safeString(approval.date)}`)], { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
                createPara([createText("Guru Mata Pelajaran")], { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
                createPara([], { spacing: { before: 1200 } }),
                createPara([createText(safeString(approval.authorName), { bold: true })], { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
                createPara([createText(`NIP. ${safeString(approval.authorNip)}`)], { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
            ], 50, false),
          ],
        }),
      ],
      borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER }
    });
  };

  // --- SECTION ASSEMBLERS ---

  const identityTable = createIdentityTable(data);
  const approvalTable = createApprovalTable(approval);

  const rppChildren = [
      createHeading("MODUL AJAR"),
      createTopicSubTitle(`TOPIK: ${safeString(data.identitySection.topic)}`),
      createSectionTitle("I. IDENTITAS UMUM"),
      identityTable,
      
      createSubSectionTitle("Asesmen Awal (Diagnostik)"),
      createPara([createText(safeString(data.initialAssessment) || "Belum ada data.")]),
      
      createSubSectionTitle("Dimensi Profil Lulusan"),
      ...data.graduateProfile.map(g => createListItem(safeString(g))),

      createSectionTitle("II. KOMPONEN INTI"),
      createSubSectionTitle("1. Tujuan Pembelajaran"),
      ...data.design.objectives.map(o => createListItem(safeString(o))),
      
      createSubSectionTitle("2. Praktik Pedagogis"),
      createPara([createText(safeString(data.design.pedagogicalPractice))]),
      
      ...(data.design.partnership ? [
          createSubSectionTitle("3. Kemitraan"),
          createPara([createText(safeString(data.design.partnership))])
      ] : []),
      
      createSubSectionTitle(data.design.partnership ? "4. Lingkungan Belajar" : "3. Lingkungan Belajar"),
      createPara([createText(safeString(data.design.environment))]),
      
      ...(data.design.digital ? [
          createSubSectionTitle(data.design.partnership ? "5. Pemanfaatan Digital" : "4. Pemanfaatan Digital"),
          createPara([createText(safeString(data.design.digital))])
      ] : []),

      createSectionTitle("III. LANGKAH PEMBELAJARAN", true),
      ...data.learningExperience.flatMap((step, idx) => [
          createPara([createText(`PERTEMUAN ${step.meetingNo}`, { bold: true, size: SIZE_H3 })], { 
              spacing: { before: 240, after: 120, line: LINE_SPACING_BODY }, 
              alignment: AlignmentType.CENTER, 
              shading: { fill: COLOR_ACCENT, type: ShadingType.CLEAR, color: "auto" } 
              // Background color #87CEFA for Meeting Header
          }),
          
          createSubSectionTitle("A. Pendahuluan"),
          createPara([createText(`Prinsip: ${safeString(step.introPrinciple)}`, { italics: true })]),
          ...createCoreActivitiesContent(step.intro),
          
          createSubSectionTitle("B. Kegiatan Inti"),
          createPara([createText(`Prinsip: ${safeString(step.corePrinciple)}`, { italics: true })]),
          
          createPara([createText("1. Memahami", { bold: true })], { spacing: { before: 120, after: 60 } }),
          ...createCoreActivitiesContent(step.core.memahami),
          createPara([createText("2. Mengaplikasi", { bold: true })], { spacing: { before: 120, after: 60 } }),
          ...createCoreActivitiesContent(step.core.mengaplikasi),
          createPara([createText("3. Merefleksi", { bold: true })], { spacing: { before: 120, after: 60 } }),
          ...createCoreActivitiesContent(step.core.merefleksi),

          createSubSectionTitle("C. Penutup"),
          createPara([createText(`Prinsip: ${safeString(step.closingPrinciple)}`, { italics: true })]),
          ...createCoreActivitiesContent(step.closing),
          
          createPara([], { pageBreakBefore: idx < data.learningExperience.length - 1 })
      ]),
  ];

  const assessmentChildren = (a: DeepLearningAssessment) => {
      if(!a) return [];
      
      // Helper for header cells with Accent Color
      const createHeaderCell = (text: string, widthPercent?: number) => 
          createCell([createPara([createText(text, { bold: true, size: SIZE_TABLE })], { alignment: AlignmentType.CENTER, spacing: { after: 0 } })], widthPercent, true, COLOR_ACCENT);

      const kktpTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ children: ['Kriteria', 'Perlu Bimbingan', 'Cukup', 'Baik', 'Sangat Baik'].map(h => createHeaderCell(h)) }),
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

      const checklistTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ children: ['No', 'Aspek Pengamatan', 'Indikator', 'Ceklis'].map((h, i) => createHeaderCell(h, i===0 ? 5 : i===3 ? 10 : 42)) }),
            ...a.formative.checklist.map((item, i) => new TableRow({
                children: [
                    createCell([createPara([createText(String(i + 1))], { alignment: AlignmentType.CENTER })]),
                    createCell(createCellContent(safeString(item.aspect))),
                    createCell(createCellContent(safeString(item.indicator))),
                    createCell([]), // Checkbox empty
                ]
            }))
        ]
      });

      const summativeTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ children: ['No', 'Indikator Soal', 'Level Kognitif', 'Bentuk Soal'].map((h, i) => createHeaderCell(h, i===0 ? 5 : undefined)) }),
            ...a.summative.grid.map((item, i) => new TableRow({
                children: [
                    createCell([createPara([createText(String(i + 1))], { alignment: AlignmentType.CENTER })]),
                    createCell(createCellContent(safeString(item.indicator))),
                    createCell(createCellContent(safeString(item.level))),
                    createCell(createCellContent(safeString(item.technique))),
                ]
            }))
        ]
      });

      const interventionTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({ children: ['Kondisi Siswa', 'Strategi Intervensi'].map((h, i) => createHeaderCell(h, i===0 ? 30 : 70)) }),
            new TableRow({ children: [ createCell([createPara([createText("Perlu Bimbingan", { bold: true })])]), createCell(createCellContent(safeString(a.intervention.needsGuidance))) ] }),
            new TableRow({ children: [ createCell([createPara([createText("Cukup", { bold: true })])]), createCell(createCellContent(safeString(a.intervention.basic))) ] }),
            new TableRow({ children: [ createCell([createPara([createText("Baik", { bold: true })])]), createCell(createCellContent(safeString(a.intervention.proficient))) ] }),
            new TableRow({ children: [ createCell([createPara([createText("Sangat Baik", { bold: true })])]), createCell(createCellContent(safeString(a.intervention.advanced))) ] }),
        ]
      });

      return [
        createSectionTitle("INSTRUMEN ASESMEN & EVALUASI", true),
        createTopicSubTitle(`TOPIK: ${safeString(data.identitySection.topic)}`),
        
        // No Underline for Assessment H3s
        createSubSectionTitle("1. KKTP (Rubrik Pembelajaran Mendalam)", false),
        kktpTable,

        createSubSectionTitle("2. Asesmen Formatif (Proses)", false),
        createPara([createText("A. Lembar Observasi (Checklist)", { bold: true, size: 26 })]),
        checklistTable,

        createPara([createText("B. Tangga Umpan Balik (Feedback Ladder)", { bold: true, size: 26 })], { spacing: { before: 240 } }),
        new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({ children: [ createCell(createCellContent(`KLARIFIKASI:\n${safeString(a.formative.feedbackGuide.clarification)}`), undefined) ] }),
                new TableRow({ children: [ createCell(createCellContent(`APRESIASI:\n${safeString(a.formative.feedbackGuide.appreciation)}`), undefined) ] }),
                new TableRow({ children: [ createCell(createCellContent(`SARAN:\n${safeString(a.formative.feedbackGuide.suggestion)}`), undefined) ] }),
            ]
        }),

        createSubSectionTitle("3. Asesmen Sumatif (Kisi-Kisi)", false),
        summativeTable,

        createSubSectionTitle("4. Tindak Lanjut & Intervensi Guru", false),
        interventionTable
      ];
  };

  // --- MERGE & DOWNLOAD ---

  const doc = new Document({
      sections: [{
          properties: {
              page: {
                  margin: { top: MARGIN_DOCX, right: MARGIN_DOCX, bottom: MARGIN_DOCX, left: MARGIN_DOCX }
              }
          },
          children: [
              ...rppChildren,
              ...(data.assessment ? assessmentChildren(data.assessment) : []),
              createPara([], { spacing: { before: 480 } }),
              approvalTable
          ]
      }]
  });

  const blob = await Packer.toBlob(doc);
  const safeTitle = data.identitySection.topic.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
  saveAs(blob, `Modul_Ajar_${safeTitle}.docx`);
};