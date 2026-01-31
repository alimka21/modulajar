
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, VerticalAlign, AlignmentType } from "docx";
import FileSaver from "file-saver";
import { GeneratedLessonPlan, DocumentSettings, MaterialsData, LKPDData, QuestionBankData, DeepLearningAssessment } from "../types";

const LINE_SPACING_BODY = 312; // 1.3 Line Spacing (240 * 1.3)
const LINE_SPACING_TABLE = 312;
const LINE_SPACING_SIG = 264; // 1.1 Line Spacing for Signature
const SPACING_AFTER_PARA = 160;
const SPACING_AFTER_LIST = 120;
const FONT_FACE = "Cambria";
const SIZE_H1 = 48; // 24pt
const SIZE_H2 = 28; // 14pt
const SIZE_H3 = 28; // 14pt
const SIZE_BODY = 24; // 12pt
const SIZE_TABLE = 22; // 11pt
const COLOR_ACCENT = "87CEFA";
const COLOR_WHITE = "FFFFFF";

// Padding for table cells (Twips: 1/1440 inch). 120 = ~2mm
const CELL_MARGIN = { top: 120, bottom: 120, left: 120, right: 120 };

const safeString = (val: any): string => {
  if (val === null || val === undefined) return "";
  // Use "Murid" (Title Case) instead of "murid" (lowercase) for better aesthetics
  if (typeof val === 'string') return val.replace(/siswa|peserta didik/gi, 'Murid');
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(safeString).join(", ");
  if (typeof val === 'object') return (val.text || val.content || val.value || JSON.stringify(val)).replace(/siswa|peserta didik/gi, 'Murid');
  return String(val);
};

const cleanText = (text: any): string => {
  const str = safeString(text);
  if (!str) return "";
  // Remove markdown bold/italic markers but keep content
  return str.replace(/💡/g, "").replace(/^>\s*/, "").replace(/\*\*/g, "").replace(/#/g, "").trim();
};

// Helper to handle multiline text from AI (preserves line breaks in Word)
const createMultilineText = (text: string): any[] => {
    // Basic Markdown Table Parser
    if (text.includes("|") && text.includes("---")) {
        return createTableFromMarkdown(text);
    }

    const lines = cleanText(text).split('\n');
    return lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        // Simple bullet handling
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
             return new Paragraph({
                children: [new TextRun({ text: trimmed.substring(2), font: FONT_FACE, size: SIZE_BODY })],
                bullet: { level: 0 },
                spacing: { after: 120, line: LINE_SPACING_BODY }
             });
        }
        // Numbered list approximation (1. , 2. , etc)
        // Improved Regex to catch "1. Text" or "1.Text"
        if (/^\d+\./.test(trimmed)) {
             // Remove the number from the text because numbering instance handles it? 
             // NO, docx bullet/numbering is complex. 
             // Hack: Use Indent to simulate hanging indent for manually numbered text
             return new Paragraph({
                children: [new TextRun({ text: trimmed, font: FONT_FACE, size: SIZE_BODY })],
                spacing: { after: 120, line: LINE_SPACING_BODY },
                indent: { left: 425, hanging: 283 } // Hanging indent for "1. "
             });
        }
        return new Paragraph({
            children: [new TextRun({ text: trimmed, font: FONT_FACE, size: SIZE_BODY })],
            spacing: { after: 120, line: LINE_SPACING_BODY } 
        });
    }).filter(Boolean);
};

// Simple Markdown Table to Docx Table Converter
const createTableFromMarkdown = (mdTable: string): any[] => {
    try {
        const lines = mdTable.split('\n').filter(l => l.trim().length > 0);
        const validRows = lines.filter(l => l.includes('|') && !l.includes('---')); // Exclude separator lines
        
        if (validRows.length < 1) return [new Paragraph(mdTable)]; // Fallback

        const rows = validRows.map((line, rowIndex) => {
            // Split by pipe, ignore first/last empty elements from leading/trailing pipes
            const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
            
            return new TableRow({
                children: cells.map(cellText => new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: cellText, font: FONT_FACE, size: SIZE_BODY, bold: rowIndex === 0 })] })],
                    margins: CELL_MARGIN,
                    shading: rowIndex === 0 ? { fill: "f3f4f6", type: ShadingType.CLEAR, color: "auto" } : undefined
                }))
            });
        });

        return [new Table({
            rows: rows,
            width: { size: 100, type: WidthType.PERCENTAGE }
        }), new Paragraph("")]; // Add spacer
    } catch (e) {
        return [new Paragraph(mdTable)];
    }
};

export const downloadDocx = async (data: GeneratedLessonPlan, settings: DocumentSettings) => {
  // HELPERS
  const createText = (text: string, options?: any) => new TextRun({
      text: text, font: FONT_FACE, size: SIZE_BODY, color: "000000", ...options
  });

  const createPara = (children: any[], options?: any) => new Paragraph({
      children: children,
      alignment: AlignmentType.LEFT,
      spacing: { line: LINE_SPACING_BODY, after: SPACING_AFTER_PARA, ...options?.spacing },
      ...options
  });

  const createHeading = (text: string) => createPara([createText(safeString(text).toUpperCase(), { bold: true, size: SIZE_H1 })], { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 240, line: LINE_SPACING_BODY } });
  
  const createSectionTitle = (text: string, pageBreak = false) => createPara([createText(safeString(text).toUpperCase(), { bold: true, size: SIZE_H2 })], { 
      alignment: AlignmentType.CENTER, 
      spacing: { before: 240, after: 240, line: LINE_SPACING_BODY }, 
      pageBreakBefore: pageBreak, 
      keepNext: true // Keep with following content
  });
  
  const createSubSectionTitle = (text: string, hasUnderline = true) => createPara([createText(safeString(text), { bold: true, size: SIZE_H3 })], { 
      spacing: { before: 240, after: 80, line: LINE_SPACING_BODY }, 
      keepNext: true, 
      border: hasUnderline ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT } } : undefined 
  });
  
  const createTopicSubTitle = (text: string) => createPara([createText(safeString(text).toUpperCase(), { bold: true, size: SIZE_H3 })], { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 360, line: LINE_SPACING_BODY } });

  const createListItem = (text: string, level = 0) => {
      const cleanLine = cleanText(text).replace(/^\d+\.\s*/, '');
      return createPara([createText(cleanLine)], { bullet: { level }, spacing: { after: SPACING_AFTER_LIST, line: LINE_SPACING_BODY }, indent: { left: 425, hanging: 283 } });
  };

  // --- CONTENT BUILDERS ---

  // 1. RPP Content
  const createIdentityTable = (data: GeneratedLessonPlan) => {
    // Safety fallback
    const approval = data.approval || { authorName: '-' };
    
    const createRow = (label: string, value: any) => new TableRow({
      children: [
        new TableCell({ children: [createPara([createText(label, { bold: true })], { spacing: { after: 0, line: LINE_SPACING_TABLE } })], width: { size: 30, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: { top: { style: BorderStyle.NONE, size: 0, color: "auto" }, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" }, left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" } } }),
        new TableCell({ children: [createPara([createText(":")], { spacing: { after: 0, line: LINE_SPACING_TABLE } })], width: { size: 2, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: { top: { style: BorderStyle.NONE, size: 0, color: "auto" }, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" }, left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" } } }),
        new TableCell({ children: [createPara([createText(safeString(value) || "-")], { spacing: { after: 0, line: LINE_SPACING_TABLE } })], width: { size: 68, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: { top: { style: BorderStyle.NONE, size: 0, color: "auto" }, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" }, left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" } } }),
      ],
    });
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        createRow("Nama Sekolah", data.identitySection.schoolName),
        createRow("Nama Penyusun", approval.authorName),
        createRow("Mata Pelajaran", data.identitySection.subject),
        createRow("Kelas / Fase", data.identitySection.grade),
        createRow("Semester", data.identitySection.semester),
        createRow("Alokasi Waktu", data.identitySection.timeAllocation),
        createRow("Jumlah Pertemuan", data.identitySection.meetingCount || "1 Pertemuan"),
      ],
      borders: { top: { style: BorderStyle.NONE, size: 0, color: "auto" }, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" }, left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" } }
    });
  };

  // Build the dynamic RPP sections - USE ANY[] TO AVOID TYPE ERRORS
  const rppSections: any[] = [
      createHeading("MODUL AJAR"),
      createTopicSubTitle(`TOPIK: ${safeString(data.identitySection.topic)}`),
      createSectionTitle("I. IDENTITAS UMUM"),
      createIdentityTable(data),
      
      createSubSectionTitle("Asesmen Awal (Opsional)"),
      ...createMultilineText(data.initialAssessment || "Belum ada data"),
      
      createSubSectionTitle("Dimensi Profil Lulusan"),
      createPara([createText("Dimensi yang dikuatkan:", { italics: true })]),
      ...data.graduateProfile.map(g => createListItem(g)),
      
      createSectionTitle("II. KOMPONEN INTI"),
      
      createSubSectionTitle("1. Tujuan Pembelajaran"),
      ...data.design.objectives.map(o => createListItem(o)),
      
      createSubSectionTitle("2. Praktik Pedagogis"),
      ...createMultilineText(data.design.pedagogicalPractice),
  ];

  if (data.design.partnership) {
      rppSections.push(createSubSectionTitle("3. Kemitraan (Opsional)"));
      rppSections.push(...createMultilineText(data.design.partnership));
  }

  const envNumber = data.design.partnership ? "4" : "3";
  rppSections.push(createSubSectionTitle(`${envNumber}. Lingkungan Belajar`));
  rppSections.push(...createMultilineText(data.design.environment));

  if (data.design.digital) {
      const digNumber = data.design.partnership ? "5" : "4";
      rppSections.push(createSubSectionTitle(`${digNumber}. Pemanfaatan Digital (Opsional)`));
      rppSections.push(...createMultilineText(data.design.digital));
  }

  rppSections.push(createSectionTitle("III. LANGKAH PEMBELAJARAN", false));
  
  data.learningExperience.forEach(step => {
      rppSections.push(
          createPara([createText(`PERTEMUAN ${step.meetingNo}`, { bold: true })], { alignment: AlignmentType.CENTER, shading: { fill: COLOR_ACCENT, type: ShadingType.CLEAR, color: "auto" }, spacing: { before: 240, after: 240, line: LINE_SPACING_BODY } })
      );

      rppSections.push(createSubSectionTitle("A. Pendahuluan", false));
      rppSections.push(createPara([createText(`Prinsip: ${safeString(step.introPrinciple)}`, { italics: true })]));
      step.intro.forEach(i => rppSections.push(createListItem(i)));

      rppSections.push(createSubSectionTitle("B. Kegiatan Inti", false));
      rppSections.push(createPara([createText(`Prinsip: ${safeString(step.corePrinciple)}`, { italics: true })]));
      
      rppSections.push(createPara([createText("1. Memahami:", { bold: true })], { spacing: { before: 120, after: 60, line: LINE_SPACING_BODY }}));
      step.core.memahami.forEach(i => rppSections.push(createListItem(i, 1)));
      
      rppSections.push(createPara([createText("2. Mengaplikasi:", { bold: true })], { spacing: { before: 120, after: 60, line: LINE_SPACING_BODY }}));
      step.core.mengaplikasi.forEach(i => rppSections.push(createListItem(i, 1)));
      
      rppSections.push(createPara([createText("3. Merefleksi:", { bold: true })], { spacing: { before: 120, after: 60, line: LINE_SPACING_BODY }}));
      step.core.merefleksi.forEach(i => rppSections.push(createListItem(i, 1)));

      rppSections.push(createSubSectionTitle("C. Penutup", false));
      rppSections.push(createPara([createText(`Prinsip: ${safeString(step.closingPrinciple)}`, { italics: true })]));
      step.closing.forEach(i => rppSections.push(createListItem(i)));
  });


  // 1. ASSESSMENT GENERATOR - USE ANY[]
  const createAssessmentSection = (assessment: DeepLearningAssessment | undefined): any[] => {
    if (!assessment) return [];
    
    const elements: any[] = [];
    
    elements.push(createSectionTitle("IV. ASESMEN PEMBELAJARAN", false));
    elements.push(createSubSectionTitle("1. KKTP (Rubrik Pembelajaran Mendalam)"));

    const kktpRows = assessment.kktp.map(item => new TableRow({
        children: [
            new TableCell({ children: [createPara([createText(safeString(item.criteria))])], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            new TableCell({ children: [createPara([createText(safeString(item.needsGuidance))])], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            new TableCell({ children: [createPara([createText(safeString(item.basic))])], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            new TableCell({ children: [createPara([createText(safeString(item.proficient))])], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            new TableCell({ children: [createPara([createText(safeString(item.advanced))])], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
        ]
    }));

    elements.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: ["Kriteria", "Perlu Bimbingan", "Cukup", "Baik", "Sangat Baik"].map(text => 
                    new TableCell({ children: [createPara([createText(text, { bold: true })], { alignment: AlignmentType.CENTER })], shading: { fill: COLOR_ACCENT, type: ShadingType.CLEAR, color: "auto" }, margins: CELL_MARGIN })
                )
            }),
            ...kktpRows
        ]
    }));
    
    elements.push(createSubSectionTitle("2. Asesmen Formatif"));
    
    // Checklist
    if (assessment.formative.checklist.length > 0) {
        elements.push(createPara([createText("A. Checklist Observasi", { bold: true })]));
        const checkRows = assessment.formative.checklist.map((item, idx) => new TableRow({
            children: [
                new TableCell({ children: [createPara([createText(String(idx + 1))])], width: { size: 5, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
                new TableCell({ children: [createPara([createText(safeString(item.aspect))])], width: { size: 45, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
                new TableCell({ children: [createPara([createText(safeString(item.indicator))])], width: { size: 40, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
                new TableCell({ children: [createPara([createText("")])], width: { size: 10, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            ]
        }));
        elements.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: ["No", "Aspek", "Indikator", "Cek"].map((t, i) => new TableCell({ children: [createPara([createText(t, { bold: true })])], width: { size: i === 0 ? 5 : i === 1 ? 45 : i === 2 ? 40 : 10, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, shading: { fill: COLOR_ACCENT, type: ShadingType.CLEAR, color: "auto" } }))
                }),
                ...checkRows
            ]
        }));
    }

    elements.push(createPara([createText("B. Tangga Umpan Balik", { bold: true })], { spacing: { before: 240 } }));
    if (assessment.formative.feedbackGuide) {
        elements.push(createListItem(`Klarifikasi: ${assessment.formative.feedbackGuide.clarification}`));
        elements.push(createListItem(`Apresiasi: ${assessment.formative.feedbackGuide.appreciation}`));
        elements.push(createListItem(`Saran: ${assessment.formative.feedbackGuide.suggestion}`));
    }
    
    elements.push(createSubSectionTitle("3. Asesmen Sumatif (Kisi-Kisi)"));
    if (assessment.summative.grid && assessment.summative.grid.length > 0) {
        const gridRows = assessment.summative.grid.map((item, idx) => new TableRow({
            children: [
                new TableCell({ children: [createPara([createText(String(idx + 1))])], width: { size: 5, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
                new TableCell({ children: [createPara([createText(safeString(item.indicator))])], width: { size: 55, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
                new TableCell({ children: [createPara([createText(safeString(item.level))])], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
                new TableCell({ children: [createPara([createText(safeString(item.technique))])], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            ]
        }));
        elements.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: ["No", "Indikator Soal", "Level Kognitif", "Bentuk Soal"].map(t => new TableCell({ children: [createPara([createText(t, { bold: true })])], margins: CELL_MARGIN, shading: { fill: COLOR_ACCENT, type: ShadingType.CLEAR, color: "auto" } }))
                }),
                ...gridRows
            ]
        }));
    }

    return elements;
  };
  
  const createMaterialsSection = (materials: MaterialsData | undefined): any[] => {
      if (!materials) return [];
      const elements: any[] = [];
      elements.push(createSectionTitle("LAMPIRAN 1: MATERI AJAR", true));
      elements.push(createHeading(materials.judul));

      elements.push(createSubSectionTitle("Pemantik"));
      elements.push(...createMultilineText(materials.pemantik));

      // FIX 1: Tampilkan Sub Topik di Export
      if (materials.subTopik && materials.subTopik.length > 0) {
          elements.push(createSubSectionTitle("Sub Topik"));
          materials.subTopik.forEach(topic => elements.push(createListItem(topic)));
      }

      elements.push(createSubSectionTitle("Konsep Inti"));
      elements.push(createPara([createText("Definisi: ", { bold: true }), createText(materials.konsepInti.definisi)]));
      
      elements.push(createPara([createText("Uraian Materi:", { bold: true })]));
      materials.konsepInti.penjelasanBertahap.forEach(p => elements.push(...createMultilineText(p)));
      
      elements.push(createPara([createText("Visualisasi:", { bold: true })]));
      
      // Handle Table Visual - Object vs String
      if (typeof materials.konsepInti.tabelVisual === 'object' && materials.konsepInti.tabelVisual !== null && !Array.isArray(materials.konsepInti.tabelVisual)) {
          const tableObj = materials.konsepInti.tabelVisual as any;
          const docTable = new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                  new TableRow({
                      children: tableObj.headers.map((h: string) => new TableCell({
                          children: [new Paragraph({ children: [new TextRun({ text: h, font: FONT_FACE, size: SIZE_BODY, bold: true })] })],
                          margins: CELL_MARGIN,
                          shading: { fill: "f3f4f6", type: ShadingType.CLEAR, color: "auto" }
                      }))
                  }),
                  ...tableObj.rows.map((row: string[]) => new TableRow({
                      children: row.map((cell: string) => new TableCell({
                          children: [new Paragraph({ children: [new TextRun({ text: cell, font: FONT_FACE, size: SIZE_BODY })] })],
                          margins: CELL_MARGIN
                      }))
                  }))
              ]
           });
           elements.push(docTable);
           elements.push(new Paragraph("")); // spacer
      } else {
           elements.push(...createMultilineText(String(materials.konsepInti.tabelVisual)));
      }

      elements.push(createSubSectionTitle("Glosarium"));
      materials.glosarium.forEach(g => elements.push(createListItem(`${g.istilah}: ${g.definisi}`)));

      return elements;
  };
  
  const createLKPDSection = (lkpd: LKPDData | undefined): any[] => {
      if (!lkpd) return [];
      const elements: any[] = [];
      elements.push(createSectionTitle("LAMPIRAN 2: LEMBAR KERJA (LKPD)", true));
      elements.push(createHeading(lkpd.title));

      elements.push(createPara([createText("Nama: ...................................  Kelas: ...................................")], { spacing: { after: 240 } }));

      // Restore underline for LKPD titles in DOCX
      elements.push(createSubSectionTitle("Tujuan"));
      elements.push(createPara([createText(lkpd.objectives)]));

      elements.push(createSubSectionTitle("Petunjuk"));
      lkpd.instructions.forEach(i => elements.push(createListItem(i)));

      // FIX 2: Better activity rendering (Handle Lists/Numbering)
      const renderActivityContent = (levelData: any) => {
          let content = "";
          if (typeof levelData === 'object' && levelData !== null) {
              content = levelData.content;
          } else {
              content = String(levelData);
          }
          
          return createMultilineText(content);
      }

      elements.push(createSubSectionTitle("Aktivitas 1 (Dasar)"));
      elements.push(...renderActivityContent(lkpd.activities.level1));

      elements.push(createSubSectionTitle("Aktivitas 2 (Menengah)"));
      elements.push(...renderActivityContent(lkpd.activities.level2));

      elements.push(createSubSectionTitle("Aktivitas 3 (Lanjut)"));
      elements.push(...renderActivityContent(lkpd.activities.level3));
      
      elements.push(createSubSectionTitle("Refleksi Diri"));
      lkpd.reflection.forEach(r => elements.push(createListItem(r)));

      return elements;
  };

  const createQuestionBankSection = (qb: QuestionBankData | undefined): any[] => {
      if (!qb) return [];
      const elements: any[] = [];
      elements.push(createSectionTitle("LAMPIRAN 3: BANK SOAL", true));

      qb.items.forEach((item, idx) => {
          elements.push(createPara([createText(`${idx + 1}. ${item.question}`)], { spacing: { before: 120 } }));
          
          if (item.options) {
              item.options.forEach((opt, i) => {
                  elements.push(createPara([createText(`${String.fromCharCode(65+i)}. ${opt}`)], { indent: { left: 425 } }));
              });
          }

          // FIX 3: Matching Questions Layout (2 Column Table)
          if (item.matchingPairs) {
              // Prepare sorted answers for column 2 (Similar to Preview)
              const sortedPairs = [...item.matchingPairs].sort((a, b) => a.right.localeCompare(b.right));
              
              // Column 1 Content
              const col1Elements = [
                  createPara([createText("Premis", { bold: true, underline: true })]),
                  ...item.matchingPairs.map((pair, i) => 
                      createPara([createText(`${i + 1}. ${pair.left}`)], { indent: { left: 240, hanging: 240 }, spacing: { after: 60, line: LINE_SPACING_BODY } })
                  )
              ];

              // Column 2 Content
              const col2Elements = [
                  createPara([createText("Pilihan Jawaban", { bold: true, underline: true })]),
                  ...sortedPairs.map((pair, i) => 
                      createPara([createText(`${String.fromCharCode(65 + i)}. ${pair.right}`)], { indent: { left: 240, hanging: 240 }, spacing: { after: 60, line: LINE_SPACING_BODY } })
                  )
              ];

              const table = new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: [
                      new TableRow({
                          children: [
                              new TableCell({ children: col1Elements, margins: CELL_MARGIN, width: { size: 50, type: WidthType.PERCENTAGE } }),
                              new TableCell({ children: col2Elements, margins: CELL_MARGIN, width: { size: 50, type: WidthType.PERCENTAGE } })
                          ]
                      })
                  ],
                  // Invisible borders
                  borders: {
                      top: { style: BorderStyle.NONE, size: 0, color: "auto" },
                      bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
                      left: { style: BorderStyle.NONE, size: 0, color: "auto" },
                      right: { style: BorderStyle.NONE, size: 0, color: "auto" },
                      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
                      insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" }
                  }
              });
              elements.push(table);
              elements.push(new Paragraph("")); // Spacer
          }
      });

      elements.push(createSubSectionTitle("Kunci Jawaban"));
      qb.items.forEach((item, idx) => {
           let displayKey = item.answerKey;
           
           // For matching, reconstruct the key display like preview: "1-A, 2-C"
           if (item.matchingPairs) {
                const sortedRight = [...item.matchingPairs].map(p => p.right).sort((a, b) => a.localeCompare(b));
                const keyParts = item.matchingPairs.map((pair, i) => {
                    const matchIndex = sortedRight.indexOf(pair.right);
                    const letter = String.fromCharCode(65 + matchIndex);
                    return `${i+1} - ${letter}`;
                });
                displayKey = keyParts.join(", ");
           }

           elements.push(createPara([createText(`${idx + 1}. ${displayKey}`)]));
      });

      return elements;
  };
  
  const doc = new Document({
      sections: [{
          properties: {
              page: {
                  size: {
                      orientation: "portrait" as any,
                      width: 11906, 
                      height: 16838,
                  },
                  margin: {
                      top: 1440,
                      right: 1440,
                      bottom: 1440,
                      left: 1440
                  }
              }
          },
          children: [
              ...rppSections,
              ...createAssessmentSection(data.assessment),
              ...createMaterialsSection(data.materials),
              ...createLKPDSection(data.lkpd),
              ...createQuestionBankSection(data.questionBank)
          ]
      }]
  });

  Packer.toBlob(doc).then((blob) => {
      // Robust handling: FileSaver might be the function itself, or an object with saveAs
      const saveAs = (FileSaver as any).saveAs || FileSaver;
      saveAs(blob, `Modul Ajar - ${data.identitySection.topic}.docx`);
  });
};
