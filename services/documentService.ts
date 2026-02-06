
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

// Standard border style for tables to ensure visibility in Word
const TABLE_BORDERS_FULL = {
    top: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
    bottom: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
    left: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
    right: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
    insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "000000" },
};

const safeString = (val: any): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === 'string') return val.replace(/siswa|peserta didik/gi, 'Murid');
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(safeString).join(", ");
  if (typeof val === 'object') return (val.text || val.content || val.value || JSON.stringify(val)).replace(/siswa|peserta didik/gi, 'Murid');
  return String(val);
};

const cleanText = (text: any): string => {
  const str = safeString(text);
  if (!str) return "";
  // Remove markdown bold/italic/latex markers but keep content
  // Also handle basic XML escaping implicitly by removing dangerous control chars if any
  return str
    .replace(/💡/g, "")
    .replace(/^>\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/#/g, "")
    .replace(/\$/g, "") // Remove LaTeX delimiters to prevent confusion
    .trim();
};

// --- STRICT FORMATTING ENGINE ---
const enforceStrictFormatting = (text: string): string => {
    if (!text) return "";
    let res = text;

    // 1. Strict List Spacing
    res = res.replace(/([^\n])\s+([-•]|\d+\.)\s+/g, '$1\n$2 ');

    // 2. Strict Table Spacing
    res = res.replace(/(\|\s*)(\|[ :\-]+)/g, '$1\n$2');
    res = res.replace(/(\|\s*)(\|)/g, '$1\n$2');

    return res;
};

const createMultilineText = (text: string, align = AlignmentType.BOTH): any[] => {
    // Basic Markdown Table Parser
    if (text.includes("|") && text.includes("---")) {
        return createTableFromMarkdown(text);
    }

    const formattedText = enforceStrictFormatting(cleanText(text));
    
    const lines = formattedText.split('\n');
    return lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
             return new Paragraph({
                children: [new TextRun({ text: trimmed.substring(2), font: FONT_FACE, size: SIZE_BODY })],
                bullet: { level: 0 },
                spacing: { after: 120, line: LINE_SPACING_BODY },
                alignment: AlignmentType.BOTH
             });
        }
        
        if (/^\d+\./.test(trimmed)) {
             return new Paragraph({
                children: [new TextRun({ text: trimmed, font: FONT_FACE, size: SIZE_BODY })],
                spacing: { after: 120, line: LINE_SPACING_BODY },
                indent: { left: 720, hanging: 360 }, 
                alignment: AlignmentType.BOTH
             });
        }
        return new Paragraph({
            children: [new TextRun({ text: trimmed, font: FONT_FACE, size: SIZE_BODY })],
            spacing: { after: 120, line: LINE_SPACING_BODY },
            alignment: align
        });
    }).filter(Boolean);
};

// --- ROBUST TABLE PARSER (Prevents "Word experienced an error") ---
const createTableFromMarkdown = (mdTable: string): any[] => {
    try {
        const formattedTable = enforceStrictFormatting(mdTable);
        const lines = formattedTable.split('\n').filter(l => l.trim().length > 0);
        
        // Helper to safely split cells, ignoring outer pipes
        const parseCells = (rowStr: string) => {
             return rowStr.trim()
                .replace(/^\|/, '') // Remove leading pipe
                .replace(/\|$/, '') // Remove trailing pipe
                .split('|')
                .map(c => c.trim());
        };

        // 1. Find the Header Row (First valid row)
        const headerRowIndex = lines.findIndex(l => l.includes('|') && !l.includes('---'));
        if (headerRowIndex === -1) return [new Paragraph(mdTable)];

        const headerCells = parseCells(lines[headerRowIndex]);
        const columnCount = headerCells.length; // THIS IS THE SOURCE OF TRUTH

        if (columnCount === 0) return [new Paragraph(mdTable)];

        const rows: TableRow[] = [];

        // 2. Process all rows (Header + Data)
        lines.forEach((line, idx) => {
            // Skip Separator Rows
            if (line.includes('---')) return;
            // Skip non-table lines
            if (!line.includes('|')) return;

            let cells = parseCells(line);

            // 3. NORMALIZE COLUMNS (CRITICAL FIX)
            // Ensure every row has exactly 'columnCount' cells
            if (cells.length < columnCount) {
                // Pad missing cells with empty strings
                const missingCount = columnCount - cells.length;
                for(let i=0; i<missingCount; i++) cells.push("");
            } else if (cells.length > columnCount) {
                // Truncate extra cells
                cells = cells.slice(0, columnCount);
            }

            // Create DOCX Row
            const isHeader = rows.length === 0; // First row added is header
            
            const tableRow = new TableRow({
                children: cells.map(cellText => new TableCell({
                    children: [new Paragraph({ 
                        children: [new TextRun({ text: cleanText(cellText), font: FONT_FACE, size: SIZE_BODY, bold: isHeader })],
                        alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT
                    })],
                    margins: CELL_MARGIN,
                    shading: isHeader ? { fill: "f3f4f6", type: ShadingType.CLEAR, color: "auto" } : undefined,
                    width: { size: 100 / columnCount, type: WidthType.PERCENTAGE }, // Distribute width evenly
                    borders: TABLE_BORDERS_FULL
                }))
            });

            rows.push(tableRow);
        });

        return [new Table({
            rows: rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: TABLE_BORDERS_FULL 
        }), new Paragraph("")]; 

    } catch (e) {
        console.error("Table Generation Error:", e);
        return [new Paragraph(mdTable)]; // Fallback to raw text if fail
    }
};

export const downloadDocx = async (data: GeneratedLessonPlan, settings: DocumentSettings) => {
  const createText = (text: string, options?: any) => new TextRun({
      text: text, font: FONT_FACE, size: SIZE_BODY, color: "000000", ...options
  });

  const createPara = (children: any[], options?: any) => new Paragraph({
      children: children,
      alignment: AlignmentType.BOTH, 
      spacing: { line: LINE_SPACING_BODY, after: SPACING_AFTER_PARA, ...options?.spacing },
      ...options
  });

  const createHeading = (text: string) => createPara([createText(safeString(text).toUpperCase(), { bold: true, size: SIZE_H1 })], { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 240, line: LINE_SPACING_BODY } });
  
  const createSectionTitle = (text: string, pageBreak = false) => createPara([createText(safeString(text).toUpperCase(), { bold: true, size: SIZE_H2 })], { 
      alignment: AlignmentType.LEFT,  
      spacing: { before: 240, after: 240, line: LINE_SPACING_BODY }, 
      pageBreakBefore: pageBreak, 
      keepNext: true, 
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COLOR_ACCENT } } 
  });
  
  const createSubSectionTitle = (text: string, hasUnderline = true) => createPara([createText(safeString(text), { bold: true, size: SIZE_H3 })], { 
      alignment: AlignmentType.LEFT, 
      spacing: { before: 240, after: 80, line: LINE_SPACING_BODY }, 
      keepNext: true, 
      border: hasUnderline ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_ACCENT } } : undefined 
  });
  
  const createTopicSubTitle = (text: string) => createPara([createText(safeString(text).toUpperCase(), { bold: true, size: SIZE_H3 })], { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 360, line: LINE_SPACING_BODY } });

  const createListItem = (text: string, level = 0) => {
      const cleanLine = cleanText(text).replace(/^\d+\.\s*/, '');
      return createPara([createText(cleanLine)], { bullet: { level }, spacing: { after: SPACING_AFTER_LIST, line: LINE_SPACING_BODY }, indent: { left: 425, hanging: 283 }, alignment: AlignmentType.BOTH });
  };

  // --- CONTENT BUILDERS ---

  // 1. RPP Content
  const createIdentityTable = (data: GeneratedLessonPlan) => {
    const approval = data.approval || { authorName: '-' };
    
    const createCellPara = (text: string, bold = false) => new Paragraph({
        children: [createText(text, { bold })],
        alignment: AlignmentType.LEFT, 
        spacing: { after: 0, line: LINE_SPACING_TABLE }
    });

    const createRow = (label: string, value: any) => new TableRow({
      children: [
        new TableCell({ children: [createCellPara(label, true)], width: { size: 30, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: { top: { style: BorderStyle.NONE, size: 0, color: "auto" }, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" }, left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" } } }),
        new TableCell({ children: [createCellPara(":")], width: { size: 2, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: { top: { style: BorderStyle.NONE, size: 0, color: "auto" }, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" }, left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" } } }),
        new TableCell({ children: [createCellPara(safeString(value) || "-")], width: { size: 68, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: { top: { style: BorderStyle.NONE, size: 0, color: "auto" }, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" }, left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" } } }),
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


  const createAssessmentSection = (assessment: DeepLearningAssessment | undefined): any[] => {
    if (!assessment) return [];
    
    const elements: any[] = [];
    
    const createTablePara = (text: string, bold = false) => new Paragraph({
        children: [createText(text, { bold })],
        alignment: AlignmentType.LEFT 
    });

    elements.push(createSectionTitle("IV. ASESMEN PEMBELAJARAN", false));
    elements.push(createSubSectionTitle("1. KKTP (Rubrik Pembelajaran Mendalam)"));

    const kktpRows = assessment.kktp.map(item => new TableRow({
        children: [
            new TableCell({ children: [createTablePara(safeString(item.criteria))], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: TABLE_BORDERS_FULL }),
            new TableCell({ children: [createTablePara(safeString(item.needsGuidance))], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: TABLE_BORDERS_FULL }),
            new TableCell({ children: [createTablePara(safeString(item.basic))], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: TABLE_BORDERS_FULL }),
            new TableCell({ children: [createTablePara(safeString(item.proficient))], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: TABLE_BORDERS_FULL }),
            new TableCell({ children: [createTablePara(safeString(item.advanced))], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: TABLE_BORDERS_FULL }),
        ]
    }));

    elements.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: ["Kriteria", "Perlu Bimbingan", "Cukup", "Baik", "Sangat Baik"].map(text => 
                    new TableCell({ children: [createPara([createText(text, { bold: true })], { alignment: AlignmentType.CENTER })], shading: { fill: COLOR_ACCENT, type: ShadingType.CLEAR, color: "auto" }, margins: CELL_MARGIN, borders: TABLE_BORDERS_FULL })
                )
            }),
            ...kktpRows
        ],
        borders: TABLE_BORDERS_FULL
    }));
    
    elements.push(createSubSectionTitle("2. Asesmen Formatif"));
    
    if (assessment.formative.checklist.length > 0) {
        elements.push(createPara([createText("A. Checklist Observasi", { bold: true })]));
        const checkRows = assessment.formative.checklist.map((item, idx) => new TableRow({
            children: [
                new TableCell({ children: [createTablePara(String(idx + 1))], width: { size: 5, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: TABLE_BORDERS_FULL }),
                new TableCell({ children: [createTablePara(safeString(item.aspect))], width: { size: 45, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: TABLE_BORDERS_FULL }),
                new TableCell({ children: [createTablePara(safeString(item.indicator))], width: { size: 40, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: TABLE_BORDERS_FULL }),
                new TableCell({ children: [createTablePara("")], width: { size: 10, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: TABLE_BORDERS_FULL }),
            ]
        }));
        elements.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: ["No", "Aspek", "Indikator", "Cek"].map((t, i) => new TableCell({ children: [createTablePara(t, true)], width: { size: i === 0 ? 5 : i === 1 ? 45 : i === 2 ? 40 : 10, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, shading: { fill: COLOR_ACCENT, type: ShadingType.CLEAR, color: "auto" }, borders: TABLE_BORDERS_FULL }))
                }),
                ...checkRows
            ],
            borders: TABLE_BORDERS_FULL
        }));
    }

    elements.push(createPara([createText("B. Tangga Umpan Balik", { bold: true })], { spacing: { before: 240, after: 120 } }));
    
    if (assessment.formative.feedbackGuide) {
        elements.push(createListItem(`Klarifikasi: ${cleanText(assessment.formative.feedbackGuide.clarification)}`));
        elements.push(createListItem(`Apresiasi: ${cleanText(assessment.formative.feedbackGuide.appreciation)}`));
        elements.push(createListItem(`Saran: ${cleanText(assessment.formative.feedbackGuide.suggestion)}`));
    }
    
    elements.push(new Paragraph(""));
    
    elements.push(createSubSectionTitle("3. Asesmen Sumatif (Kisi-Kisi)"));
    if (assessment.summative.grid && assessment.summative.grid.length > 0) {
        const gridRows = assessment.summative.grid.map((item, idx) => new TableRow({
            children: [
                new TableCell({ children: [createTablePara(String(idx + 1))], width: { size: 5, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: TABLE_BORDERS_FULL }),
                new TableCell({ children: [createTablePara(safeString(item.indicator))], width: { size: 55, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: TABLE_BORDERS_FULL }),
                new TableCell({ children: [createTablePara(safeString(item.level))], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: TABLE_BORDERS_FULL }),
                new TableCell({ children: [createTablePara(safeString(item.technique))], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN, borders: TABLE_BORDERS_FULL }),
            ]
        }));
        elements.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: ["No", "Indikator Soal", "Level Kognitif", "Bentuk Soal"].map(t => new TableCell({ children: [createTablePara(t, true)], margins: CELL_MARGIN, shading: { fill: COLOR_ACCENT, type: ShadingType.CLEAR, color: "auto" }, borders: TABLE_BORDERS_FULL }))
                }),
                ...gridRows
            ],
            borders: TABLE_BORDERS_FULL
        }));
    }

    return elements;
  };

  const createReflectionSection = (reflection: any): any[] => {
      if (!reflection) return [];
      const elements: any[] = [];
      
      elements.push(createSectionTitle("V. REFLEKSI PEMBELAJARAN"));
      
      elements.push(createSubSectionTitle("1. Refleksi Guru"));
      (reflection.teacher || []).forEach((r: string) => elements.push(createListItem(r)));

      elements.push(createSubSectionTitle("2. Refleksi Murid"));
      (reflection.student || []).forEach((r: string) => elements.push(createListItem(r)));

      return elements;
  };

  const createApprovalSection = (approval: any): any[] => {
      if (!approval) return [];
      
      const sigTable = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
              new TableRow({
                  children: [
                      new TableCell({
                          children: [
                              createPara([createText("Mengetahui,")], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG } }),
                              createPara([createText("Kepala Sekolah")], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG } }),
                              createPara([createText("")], { spacing: { before: 800 } }), 
                              createPara([createText(approval.principalName, { bold: true, underline: true })], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG } }),
                              createPara([createText(`NIP. ${approval.principalNip}`)], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG } }),
                          ],
                          width: { size: 50, type: WidthType.PERCENTAGE },
                          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }
                      }),
                      new TableCell({
                          children: [
                              createPara([createText(`${approval.location}, ${approval.date}`)], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG } }),
                              createPara([createText("Guru Mata Pelajaran")], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG } }),
                              createPara([createText("")], { spacing: { before: 800 } }), 
                              createPara([createText(approval.authorName, { bold: true, underline: true })], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG } }),
                              createPara([createText(`NIP. ${approval.authorNip}`)], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG } }),
                          ],
                          width: { size: 50, type: WidthType.PERCENTAGE },
                          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }
                      })
                  ]
              })
          ],
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE } }
      });

      return [new Paragraph(""), new Paragraph(""), sigTable];
  };
  
  const createMaterialsSection = (materials: MaterialsData | undefined): any[] => {
      if (!materials) return [];
      const elements: any[] = [];
      elements.push(createSectionTitle("LAMPIRAN 1: MATERI AJAR", true));
      elements.push(createHeading(materials.judul));

      elements.push(createSubSectionTitle("Pemantik"));
      elements.push(...createMultilineText(materials.pemantik));

      if (materials.subTopik && materials.subTopik.length > 0) {
          elements.push(createSubSectionTitle("Sub Topik"));
          materials.subTopik.forEach(topic => elements.push(createListItem(topic)));
      }

      elements.push(createSubSectionTitle("Konsep Inti"));
      elements.push(createPara([createText("Definisi: ", { bold: true }), createText(materials.konsepInti.definisi)]));
      
      elements.push(createPara([createText("Uraian Materi:", { bold: true })]));
      materials.konsepInti.penjelasanBertahap.forEach(p => elements.push(...createMultilineText(p)));
      
      elements.push(createPara([createText("Visualisasi:", { bold: true })]));
      
      if (typeof materials.konsepInti.tabelVisual === 'object' && materials.konsepInti.tabelVisual !== null && !Array.isArray(materials.konsepInti.tabelVisual)) {
          const tableObj = materials.konsepInti.tabelVisual as any;
          const docTable = new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                  new TableRow({
                      children: tableObj.headers.map((h: string) => new TableCell({
                          children: [new Paragraph({ children: [new TextRun({ text: h, font: FONT_FACE, size: SIZE_BODY, bold: true })], alignment: AlignmentType.CENTER })],
                          margins: CELL_MARGIN,
                          shading: { fill: "f3f4f6", type: ShadingType.CLEAR, color: "auto" },
                          borders: TABLE_BORDERS_FULL
                      }))
                  }),
                  ...tableObj.rows.map((row: string[]) => new TableRow({
                      children: row.map((cell: string) => new TableCell({
                          children: [new Paragraph({ children: [new TextRun({ text: cell, font: FONT_FACE, size: SIZE_BODY })], alignment: AlignmentType.LEFT })],
                          margins: CELL_MARGIN,
                          borders: TABLE_BORDERS_FULL
                      }))
                  }))
              ],
              borders: TABLE_BORDERS_FULL
           });
           elements.push(docTable);
           elements.push(new Paragraph(""));
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

      elements.push(createSubSectionTitle("Tujuan"));
      const objectivesList = lkpd.objectives.split(/\n|(?=\d+\.\s)/).map(o => o.trim()).filter(o => o.length > 0);
      objectivesList.forEach(obj => {
          const cleanObj = obj.replace(/^\d+[\.\)]\s*/, '').replace(/^- \s*/, ''); 
          elements.push(createListItem(cleanObj));
      });

      elements.push(createSubSectionTitle("Petunjuk"));
      lkpd.instructions.forEach(i => elements.push(createListItem(i)));

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

      const groupedItems: Record<string, any[]> = {};
      qb.items.forEach(item => {
          if (!groupedItems[item.type]) groupedItems[item.type] = [];
          groupedItems[item.type].push(item);
      });

      const types = Object.keys(groupedItems);

      types.forEach((type, groupIdx) => {
          const headerText = `${String.fromCharCode(65 + groupIdx)}. ${type.toUpperCase()}`;
          elements.push(createPara([createText(headerText, { bold: true })], { 
              spacing: { before: 240, after: 120 },
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } }
          }));

          const items = groupedItems[type];

          items.forEach((item, idx) => {
              const itemNum = idx + 1;

              if (item.stimulus && (item.type === 'Pilihan Ganda' || item.type === 'Pilihan Ganda Kompleks')) {
                   elements.push(createPara([createText(`${itemNum}. Stimulus:`, { bold: true })], { spacing: { after: 120 }, alignment: AlignmentType.LEFT }));
                   elements.push(createPara([createText(safeString(item.stimulus), { italics: true })], { spacing: { after: 120 }, indent: { left: 425 }, alignment: AlignmentType.BOTH }));
                   elements.push(createPara([createText("Soal:", { bold: true })], { spacing: { after: 120 }, indent: { left: 425 }, alignment: AlignmentType.LEFT }));
                   elements.push(createPara([createText(cleanText(item.question))], { spacing: { after: 120 }, indent: { left: 425 }, alignment: AlignmentType.BOTH }));
              } else {
                   if (item.stimulus && !['Menjodohkan', 'Benar/Salah'].includes(item.type)) {
                       elements.push(createPara([createText(`${itemNum}. Stimulus:`, { bold: true })], { spacing: { after: 60 }, alignment: AlignmentType.LEFT }));
                       elements.push(createPara([createText(safeString(item.stimulus), { italics: true })], { spacing: { after: 120 }, indent: { left: 425 }, alignment: AlignmentType.BOTH }));
                       elements.push(createPara([createText(cleanText(item.question))], { spacing: { before: 120 }, indent: { left: 425 }, alignment: AlignmentType.BOTH }));
                   } else {
                       elements.push(createPara([createText(`${itemNum}. ${cleanText(item.question)}`)], { spacing: { before: 120 }, alignment: AlignmentType.BOTH }));
                   }
              }
              
              if (item.options) {
                  item.options.forEach((opt: string, i: number) => {
                      const cleanOpt = cleanText(opt).replace(/^(?:[A-Ea-e0-9]|Option\s*[A-E])[\.\)\-]\s*/i, '').replace(/^\*\*(?:[A-Ea-e0-9]|Option\s*[A-E])[\.\)\-]\*\*\s*/i, '').trim();
                      
                      elements.push(createPara([createText(`${String.fromCharCode(65+i)}. ${cleanOpt}`)], { 
                          indent: { left: 680, hanging: 360 }, 
                          spacing: { before: 0, after: 0, line: 240 }, 
                          alignment: AlignmentType.LEFT
                      }));
                  });
              }
    
              if (item.matchingPairs) {
                  const sortedPairs = [...item.matchingPairs].sort((a: any, b: any) => a.right.localeCompare(b.right));
                  
                  const createMatchPara = (text: string, bold = false, underline = false, indent = 0) => new Paragraph({
                      children: [createText(text, { bold, underline })],
                      alignment: AlignmentType.LEFT,
                      indent: indent ? { left: indent, hanging: indent } : undefined,
                      spacing: { after: 60, line: LINE_SPACING_BODY }
                  });
    
                  const col1Elements = [
                      createMatchPara("Premis", true, true),
                      ...item.matchingPairs.map((pair: any, i: number) => 
                          createMatchPara(`${i + 1}. ${pair.left}`, false, false, 240)
                      )
                  ];
    
                  const col2Elements = [
                      createMatchPara("Pilihan Jawaban", true, true),
                      ...sortedPairs.map((pair: any, i: number) => 
                          createMatchPara(`${String.fromCharCode(65 + i)}. ${pair.right}`, false, false, 240)
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
                      borders: { top: { style: BorderStyle.NONE, size: 0, color: "auto" }, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" }, left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" } }
                  });
                  elements.push(table);
                  elements.push(new Paragraph(""));
              }
          });
      });

      elements.push(createSubSectionTitle("Kunci Jawaban"));
      types.forEach((type, groupIdx) => {
          const headerText = `${String.fromCharCode(65 + groupIdx)}. ${type.toUpperCase()}`;
          elements.push(createPara([createText(headerText, { bold: true })], { spacing: { before: 120, after: 60 } }));
          
          const items = groupedItems[type];
          items.forEach((item, idx) => {
               let displayKey = item.answerKey;
               const itemNum = idx + 1;
               
               if (item.matchingPairs) {
                    const sortedRight = [...item.matchingPairs].map((p: any) => p.right).sort((a: string, b: string) => a.localeCompare(b));
                    const keyParts = item.matchingPairs.map((pair: any, i: number) => {
                        const matchIndex = sortedRight.indexOf(pair.right);
                        const letter = String.fromCharCode(65 + matchIndex);
                        return `${i+1} - ${letter}`;
                    });
                    displayKey = keyParts.join(", ");
               }
    
               elements.push(createPara([createText(`${itemNum}. ${cleanText(displayKey)}`)]));
          });
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
              ...createReflectionSection(data.reflection), 
              ...createApprovalSection(data.approval),
              ...createMaterialsSection(data.materials),
              ...createLKPDSection(data.lkpd),
              ...createQuestionBankSection(data.questionBank)
          ]
      }]
  });

  Packer.toBlob(doc).then((blob) => {
      const saveAs = (FileSaver as any).saveAs || FileSaver;
      saveAs(blob, `Modul Ajar - ${cleanText(data.identitySection.topic)}.docx`);
  });
};
