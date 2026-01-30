
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, VerticalAlign, AlignmentType } from "docx";
import * as FileSaver from "file-saver";
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
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(safeString).join(", ");
  if (typeof val === 'object') return val.text || val.content || val.value || JSON.stringify(val);
  return String(val);
};

const cleanText = (text: any): string => {
  const str = safeString(text);
  if (!str) return "";
  // Remove markdown bold/italic markers but keep content
  return str.replace(/💡/g, "").replace(/^>\s*/, "").replace(/\*\*/g, "").replace(/#/g, "").trim();
};

// Helper to handle multiline text from AI (preserves line breaks in Word)
const createMultilineText = (text: string) => {
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
        // Numbered list approximation
        if (/^\d+\./.test(trimmed)) {
             return new Paragraph({
                children: [new TextRun({ text: trimmed, font: FONT_FACE, size: SIZE_BODY })],
                spacing: { after: 120, line: LINE_SPACING_BODY },
                indent: { left: 425, hanging: 283 }
             });
        }
        return new Paragraph({
            children: [new TextRun({ text: trimmed, font: FONT_FACE, size: SIZE_BODY })],
            spacing: { after: 120, line: LINE_SPACING_BODY } // Slightly tighter than standard paragraphs
        });
    }).filter(Boolean) as Paragraph[];
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
  
  // Adjusted spacing after to 80 (approx 4pt)
  const createSubSectionTitle = (text: string, hasUnderline = true) => createPara([createText(safeString(text), { bold: true, size: SIZE_H3 })], { 
      spacing: { before: 240, after: 80, line: LINE_SPACING_BODY }, 
      keepNext: true, // Crucial: Keep header with content
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
        createRow("Nama Penyusun", data.approval.authorName),
        createRow("Mata Pelajaran", data.identitySection.subject),
        createRow("Kelas / Fase", data.identitySection.grade),
        createRow("Semester", data.identitySection.semester),
        createRow("Alokasi Waktu", data.identitySection.timeAllocation),
        createRow("Jumlah Pertemuan", data.identitySection.meetingCount || "1 Pertemuan"),
      ],
      borders: { top: { style: BorderStyle.NONE, size: 0, color: "auto" }, bottom: { style: BorderStyle.NONE, size: 0, color: "auto" }, left: { style: BorderStyle.NONE, size: 0, color: "auto" }, right: { style: BorderStyle.NONE, size: 0, color: "auto" }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" }, insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" } }
    });
  };

  // Build the dynamic RPP sections
  const rppSections: any[] = [
      createHeading("MODUL AJAR"),
      createTopicSubTitle(`TOPIK: ${safeString(data.identitySection.topic)}`),
      createSectionTitle("I. IDENTITAS UMUM"),
      createIdentityTable(data),
      
      createSubSectionTitle("Asesmen Awal (Opsional)"),
      ...createMultilineText(data.initialAssessment || "Belum ada data"),
      
      createSubSectionTitle("Dimensi Profil Lulusan"), // Changed from "Profil Lulusan"
      ...data.graduateProfile.map(g => createListItem(g)),
      
      createSectionTitle("II. KOMPONEN INTI"),
      
      // 1. Objectives
      createSubSectionTitle("1. Tujuan Pembelajaran"),
      ...data.design.objectives.map(o => createListItem(o)),
      
      // 2. Pedagogical
      createSubSectionTitle("2. Praktik Pedagogis"),
      ...createMultilineText(data.design.pedagogicalPractice),
  ];

  // 3. Partnership (Optional)
  if (data.design.partnership) {
      rppSections.push(createSubSectionTitle("3. Kemitraan (Opsional)"));
      rppSections.push(...createMultilineText(data.design.partnership));
  }

  // 4/3. Environment (Numbering logic)
  const envNumber = data.design.partnership ? "4" : "3";
  rppSections.push(createSubSectionTitle(`${envNumber}. Lingkungan Belajar`));
  rppSections.push(...createMultilineText(data.design.environment));

  // 5/4. Digital (Optional)
  if (data.design.digital) {
      const digNumber = data.design.partnership ? "5" : "4";
      rppSections.push(createSubSectionTitle(`${digNumber}. Pemanfaatan Digital (Opsional)`));
      rppSections.push(...createMultilineText(data.design.digital));
  }

  // III. LEARNING STEPS
  rppSections.push(createSectionTitle("III. LANGKAH PEMBELAJARAN", false)); // Removed pageBreak true, kept flow
  
  data.learningExperience.forEach(step => {
      rppSections.push(
          createPara([createText(`PERTEMUAN ${step.meetingNo}`, { bold: true })], { alignment: AlignmentType.CENTER, shading: { fill: COLOR_ACCENT, type: ShadingType.CLEAR, color: "auto" }, spacing: { before: 240, after: 240, line: LINE_SPACING_BODY } })
      );

      // Pendahuluan
      rppSections.push(createSubSectionTitle("A. Pendahuluan", false));
      rppSections.push(createPara([createText(`Prinsip: ${safeString(step.introPrinciple)}`, { italics: true })]));
      step.intro.forEach(i => rppSections.push(createListItem(i)));

      // Inti
      rppSections.push(createSubSectionTitle("B. Kegiatan Inti", false));
      rppSections.push(createPara([createText(`Prinsip: ${safeString(step.corePrinciple)}`, { italics: true })]));
      
      rppSections.push(createPara([createText("1. Memahami:", { bold: true })], { spacing: { before: 120, after: 60, line: LINE_SPACING_BODY }}));
      step.core.memahami.forEach(i => rppSections.push(createListItem(i, 1)));
      
      rppSections.push(createPara([createText("2. Mengaplikasi:", { bold: true })], { spacing: { before: 120, after: 60, line: LINE_SPACING_BODY }}));
      step.core.mengaplikasi.forEach(i => rppSections.push(createListItem(i, 1)));
      
      rppSections.push(createPara([createText("3. Merefleksi:", { bold: true })], { spacing: { before: 120, after: 60, line: LINE_SPACING_BODY }}));
      step.core.merefleksi.forEach(i => rppSections.push(createListItem(i, 1)));

      // Penutup
      rppSections.push(createSubSectionTitle("C. Penutup", false));
      rppSections.push(createPara([createText(`Prinsip: ${safeString(step.closingPrinciple)}`, { italics: true })]));
      step.closing.forEach(i => rppSections.push(createListItem(i)));
  });


  // 1. ASSESSMENT GENERATOR
  const createAssessmentSection = (assessment: DeepLearningAssessment | undefined) => {
    if (!assessment) return [];

    const kktpRows = assessment.kktp.map(item => new TableRow({
        children: [
            new TableCell({ children: [createPara([createText(safeString(item.criteria))])], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            new TableCell({ children: [createPara([createText(safeString(item.needsGuidance))])], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            new TableCell({ children: [createPara([createText(safeString(item.basic))])], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            new TableCell({ children: [createPara([createText(safeString(item.proficient))])], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            new TableCell({ children: [createPara([createText(safeString(item.advanced))])], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
        ]
    }));

    const kktpTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: ["Kriteria", "Perlu Bimbingan", "Cukup", "Baik", "Sangat Baik"].map(text => 
                    new TableCell({ children: [createPara([createText(text, { bold: true })], { alignment: AlignmentType.CENTER })], shading: { fill: COLOR_ACCENT, type: ShadingType.CLEAR, color: "auto" }, margins: CELL_MARGIN })
                )
            }),
            ...kktpRows
        ]
    });

    const formativeRows = (assessment.formative.checklist || []).map((item, idx) => new TableRow({
        children: [
            new TableCell({ children: [createPara([createText(String(idx + 1))])], width: { size: 5, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            new TableCell({ children: [createPara([createText(safeString(item.aspect))])], width: { size: 35, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            new TableCell({ children: [createPara([createText(safeString(item.indicator))])], width: { size: 45, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            new TableCell({ children: [], width: { size: 15, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }), // Ceklis
        ]
    }));

    const formativeTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: [
                    { text: "No", w: 5 }, { text: "Aspek", w: 35 }, { text: "Indikator", w: 45 }, { text: "Ceklis", w: 15 }
                ].map(col => 
                    new TableCell({ children: [createPara([createText(col.text, { bold: true })], { alignment: AlignmentType.CENTER })], width: { size: col.w, type: WidthType.PERCENTAGE }, shading: { fill: COLOR_ACCENT, type: ShadingType.CLEAR, color: "auto" }, margins: CELL_MARGIN })
                )
            }),
            ...formativeRows
        ]
    });

    const summativeGrid = Array.isArray(assessment.summative.grid) ? assessment.summative.grid : [];
    const summativeRows = summativeGrid.map((item, idx) => new TableRow({
        children: [
            new TableCell({ children: [createPara([createText(String(idx + 1))])], width: { size: 5, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            new TableCell({ children: [createPara([createText(safeString(item.indicator))])], width: { size: 55, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            new TableCell({ children: [createPara([createText(safeString(item.level))])], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
            new TableCell({ children: [createPara([createText(safeString(item.technique))])], width: { size: 20, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
        ]
    }));

    const summativeTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: [
                    { text: "No", w: 5 }, { text: "Indikator", w: 55 }, { text: "Level", w: 20 }, { text: "Bentuk", w: 20 }
                ].map(col => 
                    new TableCell({ children: [createPara([createText(col.text, { bold: true })], { alignment: AlignmentType.CENTER })], width: { size: col.w, type: WidthType.PERCENTAGE }, shading: { fill: COLOR_ACCENT, type: ShadingType.CLEAR, color: "auto" }, margins: CELL_MARGIN })
                )
            }),
            ...summativeRows
        ]
    });

    const interventionTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: ["Kondisi", "Strategi Intervensi"].map(text => 
                    new TableCell({ children: [createPara([createText(text, { bold: true })], { alignment: AlignmentType.CENTER })], shading: { fill: COLOR_ACCENT, type: ShadingType.CLEAR, color: "auto" }, margins: CELL_MARGIN })
                )
            }),
            ...[
                { k: "Perlu Bimbingan", v: assessment.intervention.needsGuidance },
                { k: "Cukup", v: assessment.intervention.basic },
                { k: "Baik", v: assessment.intervention.proficient },
                { k: "Sangat Baik", v: assessment.intervention.advanced }
            ].map(row => new TableRow({
                children: [
                    new TableCell({ children: [createPara([createText(row.k, { bold: true })])], width: { size: 30, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN }),
                    new TableCell({ children: [createPara([createText(safeString(row.v))])], width: { size: 70, type: WidthType.PERCENTAGE }, margins: CELL_MARGIN })
                ]
            }))
        ]
    });

    return [
        createSectionTitle("IV. ASESMEN PEMBELAJARAN", false), // No Page Break forced
        createSubSectionTitle("1. KKTP (Rubrik)"),
        createPara([createText("Catatan: Menggunakan Taksonomi Bloom (Revisi Anderson & Krathwohl)", { italics: true })]),
        kktpTable,
        createPara([]), // Spacer
        createSubSectionTitle("2. Asesmen Formatif (Checklist)"),
        formativeTable,
        
        createSubSectionTitle("Umpan Balik"),
        createPara([createText(`Klarifikasi: ${safeString(assessment.formative.feedbackGuide.clarification)}`)]),
        createPara([createText(`Apresiasi: ${safeString(assessment.formative.feedbackGuide.appreciation)}`)]),
        createPara([createText(`Saran: ${safeString(assessment.formative.feedbackGuide.suggestion)}`)]),
        
        createSubSectionTitle("3. Asesmen Sumatif (Kisi-Kisi)"),
        summativeTable,
        
        createSubSectionTitle("4. Tindak Lanjut"),
        interventionTable
    ];
  };

  // 2. APPROVAL SIGNATURE
  const createApprovalSection = (approval: any) => {
      if(!approval) return [];
      
      const sigTable = new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE } },
          rows: [
              new TableRow({
                  children: [
                      new TableCell({
                          children: [
                              createPara([createText("Mengetahui,")], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG, after: 0 } }),
                              createPara([createText("Kepala Sekolah")], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG, after: 0 } }),
                              createPara([], { spacing: { after: 1200, line: LINE_SPACING_SIG } }), // Space for sign
                              createPara([createText(safeString(approval.principalName), { bold: true, underline: true })], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG, after: 0 } }),
                              createPara([createText(`NIP. ${safeString(approval.principalNip)}`)], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG, after: 0 } }),
                          ],
                          width: { size: 50, type: WidthType.PERCENTAGE }
                      }),
                      new TableCell({
                          children: [
                              createPara([createText(`${safeString(approval.location)}, ${safeString(approval.date)}`)], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG, after: 0 } }),
                              createPara([createText("Guru Mata Pelajaran")], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG, after: 0 } }),
                              createPara([], { spacing: { after: 1200, line: LINE_SPACING_SIG } }), // Space for sign
                              createPara([createText(safeString(approval.authorName), { bold: true, underline: true })], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG, after: 0 } }),
                              createPara([createText(`NIP. ${safeString(approval.authorNip)}`)], { alignment: AlignmentType.CENTER, spacing: { line: LINE_SPACING_SIG, after: 0 } }),
                          ],
                          width: { size: 50, type: WidthType.PERCENTAGE }
                      })
                  ]
              })
          ]
      });

      return [createPara([], { spacing: { before: 480, line: LINE_SPACING_BODY } }), sigTable];
  };

  // 3. REFLECTION GENERATOR
  const createReflectionSection = (reflection: any) => {
      if (!reflection) return [];
      
      return [
          createSectionTitle("V. REFLEKSI PEMBELAJARAN", false), // No Page Break forced
          createSubSectionTitle("1. Refleksi Guru"),
          ...(reflection.teacher || []).map((r: string) => createListItem(r)),
          createSubSectionTitle("2. Refleksi Murid"),
          ...(reflection.student || []).map((r: string) => createListItem(r)),
      ];
  };

  // 4. MATERIALS GENERATOR
  const createMaterialsSection = (m: MaterialsData | undefined) => {
      if (!m) return [];
      return [
          createSectionTitle("LAMPIRAN 1: MATERI AJAR", true), // Keep page break for separate attachment
          createHeading(m.judul),
          createSubSectionTitle("Pemantik"), createPara([createText(safeString(m.pemantik), { italics: true })]),
          createSubSectionTitle("Sub Topik"), ...m.subTopik.map(s => createListItem(s)),
          createSubSectionTitle("Konsep Inti"),
          createPara([createText("Definisi: ", { bold: true }), createText(safeString(m.konsepInti.definisi))]),
          createPara([createText("Penjelasan:", { bold: true })]), ...m.konsepInti.penjelasanBertahap.map(p => createListItem(p)),
          createPara([createText("Contoh:", { bold: true })]), ...createMultilineText(m.konsepInti.contohKonkret),
          
          // Fixed multiline for tableVisual (now rendered as list/text in Docx)
          createPara([createText("Visualisasi / Poin Penting:", { bold: true })]), 
          ...createMultilineText(m.konsepInti.tabelVisual),
          
          createSubSectionTitle("Glosarium"), ...m.glosarium.map(g => createListItem(`${g.istilah}: ${g.definisi}`))
      ];
  };

  // 5. LKPD GENERATOR
  const createLKPDSection = (l: LKPDData | undefined) => {
      if (!l) return [];
      return [
          createSectionTitle("LAMPIRAN 2: LEMBAR KERJA (LKPD)", true), // Keep page break for separate attachment
          createHeading(l.title),
          createSubSectionTitle("Tujuan"), createPara([createText(cleanText(l.objectives))]),
          createSubSectionTitle("Petunjuk"), ...l.instructions.map(i => createListItem(i)),
          
          createSubSectionTitle("Stimulus"), 
          ...createMultilineText(l.stimulus),
          
          createSubSectionTitle("Aktivitas 1"), 
          ...createMultilineText(l.activities.level1),
          
          createSubSectionTitle("Aktivitas 2"), 
          ...createMultilineText(l.activities.level2),
          
          createSubSectionTitle("Aktivitas 3"), 
          ...createMultilineText(l.activities.level3),
          
          createSubSectionTitle("Refleksi"), ...l.reflection.map(r => createListItem(r))
      ];
  };

  // 6. QUESTION BANK GENERATOR
  const createQuestionBankSection = (q: QuestionBankData | undefined) => {
      if (!q) return [];
      return [
          createSectionTitle("LAMPIRAN 3: BANK SOAL", true), // Keep page break for separate attachment
          ...q.items.flatMap(item => {
              const paras = [
                  createPara([createText(`${item.number}. ${cleanText(item.question)}`, { bold: true })], { spacing: { before: 240, line: LINE_SPACING_BODY } })
              ];
              
              if (item.stimulus) {
                   paras.push(...createMultilineText(item.stimulus));
              }
              
              if (item.options) {
                  item.options.forEach((opt, idx) => {
                      paras.push(createPara([createText(`${String.fromCharCode(65 + idx)}. ${cleanText(opt)}`)]));
                  });
              }
              if (item.matchingPairs) {
                   item.matchingPairs.forEach(p => paras.push(createPara([createText(`${p.left}  ---  ${p.right}`)])));
              }
              
              return paras;
          }),
          createSubSectionTitle("KUNCI JAWABAN"),
          ...q.items.map(item => createListItem(`${item.number}. ${cleanText(item.answerKey)}`))
      ];
  };

  // COMBINE ALL SECTIONS - UPDATED ORDER
  // RPM -> Assessment -> Reflection -> Signature -> Others
  const allChildren = [
      ...rppSections,
      ...createAssessmentSection(data.assessment),
      ...createReflectionSection(data.reflection), // Reflection moved UP
      ...createApprovalSection(data.approval),     // Signature moved DOWN
      
      // These will only appear if the data exists
      ...createMaterialsSection(data.materials),
      ...createLKPDSection(data.lkpd),
      ...createQuestionBankSection(data.questionBank)
  ];

  const doc = new Document({
      sections: [{
          properties: {
            page: {
                margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } // 1 inch margin
            }
          },
          children: allChildren
      }]
  });

  const blob = await Packer.toBlob(doc);
  const saver = (FileSaver as any).default || (FileSaver as any).saveAs || FileSaver;
  saver(blob, `${data.identitySection.subject.replace(/\s+/g, '_')}_Modul_Ajar.docx`);
};
