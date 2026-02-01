
import React, { useEffect } from 'react';
import { GeneratedLessonPlan, LessonIdentity, DeepLearningAssessment, QuestionItem } from '../types';
import { INDONESIAN_MONTHS } from '../constants';

declare var marked: any;
declare var MathJax: any;

interface DocumentContentProps {
  data: GeneratedLessonPlan;
  inputData: LessonIdentity;
  activeTab: string; // 'SEMUA' | 'RPP_PLUS' | 'MATERI' | 'LKPD' | 'SOAL'
}

/**
 * ============================================
 * TABLE POST-PROCESSING ENGINE (OPTIMIZED v3)
 * High Performance with Early Exits & Safe Regex
 * ============================================
 */

// Helper: Cek apakah baris ini adalah separator tabel markdown (e.g. |---|---|)
const isSeparatorRow = (line: string) => {
    return /^\|\s*[:\-]*-+[:\-]*(\s*\|\s*[:\-]*-+[:\-]*)*\s*\|?$/.test(line);
};

// Helper: Cek apakah baris ini terlihat seperti baris tabel (e.g. | Data | Data |)
const isTableLine = (line: string) => {
    return line.trim().startsWith('|') || (line.includes('|') && line.split('|').length > 2);
};

// Fungsi 1: Convert Bullet Points ke Tabel (Logic Baru: Linear Builder)
const convertBulletPointsToTable = (text: string): string => {
  // Check if text already has table structure
  if (text.includes('|') && text.includes('---')) return text;

  const lines = text.split('\n');
  const cleanLines = lines.map(l => l.trim()).filter(l => l.length > 0);
  
  // Jika teks pendek, coba ubah list menjadi tabel langsung.
  if (cleanLines.length > 0) {
      // Cek apakah ini list?
      const isList = cleanLines.every(l => /^\d+\.|^[-•·]/.test(l));
      
      // Jika ini list atau kita mau paksa jadi tabel
      if (isList || cleanLines.length >= 2) {
          const tableString = createTableFromBulletPoints(cleanLines);
          if (tableString) return tableString;
      }
  }
  
  return text; // Return original if conversion fails
};

const createTableFromBulletPoints = (lines: string[]): string | null => {
    // Heuristic: Cek apakah ada ':' untuk pemisah kolom
    const cleanLines = lines.map(l => l.replace(/^[\s]*[-•·\d\.]+\s*/, '').trim());
    if (cleanLines.length === 0) return null;

    const hasColon = cleanLines[0].includes(':');
    
    // Header default jika tidak terdeteksi struktur key:value
    let header = hasColon ? '| Aspek / Kategori | Keterangan |' : '| No | Poin Penting |';
    let separator = hasColon ? '|---|---|' : '|:-:|---|';
    
    const rows = cleanLines.map((content, idx) => {
        // Sanitasi konten agar tidak merusak markdown table
        let safeContent = content.replace(/\|/g, '/'); 

        if (hasColon && safeContent.includes(':')) {
            const parts = safeContent.split(':');
            const col1 = parts[0].trim();
            const col2 = parts.slice(1).join(':').trim();
            return `| ${col1} | ${col2} |`;
        }
        return `| ${idx + 1} | ${safeContent} |`;
    });
    
    return [header, separator, ...rows].join('\n');
};

// Helper to convert Table Object to Markdown String (for Materials Schema v2)
const convertTableObjectToMarkdown = (tableObj: { headers: string[], rows: string[][] }): string => {
    if (!tableObj || !tableObj.headers || !tableObj.rows) return "";
    
    const headerRow = `| ${tableObj.headers.join(' | ')} |`;
    const separatorRow = `| ${tableObj.headers.map(() => '---').join(' | ')} |`;
    const dataRows = tableObj.rows.map(row => `| ${row.join(' | ')} |`).join('\n');
    
    return `${headerRow}\n${separatorRow}\n${dataRows}`;
};

// Fungsi 2: Fix Markdown Table Format (Logic Baru: Block Processor)
const fixMarkdownTableFormat = (text: string): string => {
  // OPTIMASI: Skip jika tidak ada karakter pipa (|)
  if (!text.includes('|')) return text;

  const lines = text.split('\n');
  const resultLines: string[] = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // Deteksi awal blok tabel
    if (isTableLine(line)) {
        const tableBlock: string[] = [];
        let j = i;
        
        // Ambil semua baris yang terlihat seperti tabel
        while (j < lines.length && isTableLine(lines[j])) {
            tableBlock.push(lines[j]);
            j++;
        }
        
        // Proses blok tabel jika valid
        if (tableBlock.length >= 1) {
            const processedTable = processTableBlock(tableBlock);
            resultLines.push(...processedTable);
            i = j; // Loncat index
        } else {
            resultLines.push(line);
            i++;
        }
    } else {
        resultLines.push(line);
        i++;
    }
  }
  
  return resultLines.join('\n');
};

const processTableBlock = (tableLines: string[]): string[] => {
  if (tableLines.length === 0) return tableLines;
  
  // 1. Normalize Header
  let headerRow = normalizeTableRow(tableLines[0]);
  const headerCols = getColumnCount(headerRow);
  
  // Jika cuma 1 baris, kembalikan saja (bukan tabel valid)
  if (tableLines.length < 2) return [headerRow];

  const processedLines: string[] = [headerRow];
  let startIndex = 1;

  // 2. Cek Separator
  let separatorRow = tableLines[1];
  if (isSeparatorRow(separatorRow)) {
      processedLines.push(separatorRow); 
      startIndex = 2;
  } else {
      processedLines.push(generateSeparatorRow(headerCols)); 
      startIndex = 1;
  }
  
  // 3. Process Data Rows
  for (let k = startIndex; k < tableLines.length; k++) {
      if (isSeparatorRow(tableLines[k])) continue;
      const normalized = normalizeTableRow(tableLines[k], headerCols);
      if (normalized.replace(/\||\s/g, '').length > 0) { 
          processedLines.push(normalized);
      }
  }
  
  return processedLines;
};

const normalizeTableRow = (row: string, expectedCols?: number): string => {
  let cleanRow = row.trim();
  if (!cleanRow.startsWith('|')) cleanRow = '| ' + cleanRow;
  if (!cleanRow.endsWith('|')) cleanRow = cleanRow + ' |';
  
  const cells = cleanRow.split('|');
  const validCells = cells.slice(1, cells.length - 1).map(c => c.trim());
  
  // Adjust columns count
  if (expectedCols) {
      while (validCells.length < expectedCols) validCells.push('');
      while (validCells.length > expectedCols) validCells.pop();
  }
  
  return '| ' + validCells.join(' | ') + ' |';
};

const getColumnCount = (row: string): number => {
    return row.split('|').length - 2;
};

const generateSeparatorRow = (colCount: number): string => {
    return '|' + Array(colCount).fill('---').join('|') + '|';
};

const ensureProperTableSpacing = (text: string): string => {
  if (!text.includes('|')) return text;
  return text.replace(/([^\n\|])\n(\|)/g, '$1\n\n$2');
};

const normalizeTableFormat = (text: string): string => {
  if (!text || text.length < 5) return text;
  
  const hasPipe = text.includes('|');
  if (!hasPipe) return text; 

  try {
      // Pipeline urutan eksekusi:
      let stage1 = convertBulletPointsToTable(text);
      let stage2 = fixMarkdownTableFormat(stage1);
      let stage3 = ensureProperTableSpacing(stage2);
      return stage3;
  } catch (e) {
      console.error("Table processing error:", e);
      return text; 
  }
};

// ============================================

const safeString = (val: any): string => {
  if (val === null || val === undefined) return "";
  // Use "Murid" (Title Case) instead of "murid" (lowercase) for better aesthetics
  if (typeof val === 'string') return val.replace(/siswa|peserta didik/gi, 'Murid');
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(safeString).join(", ");
  if (typeof val === 'object') return (val.text || val.content || val.value || val.description || JSON.stringify(val)).replace(/siswa|peserta didik/gi, 'Murid');
  return String(val);
};

// UPDATE: Improved cleanup logic based on subject context
const cleanupUnnecessaryLatex = (text: string, isMathSubject: boolean): string => {
    // 1. Jika BUKAN Matematika/Sains, hapus SEMUA tanda $ (cegah teks biasa dianggap rumus)
    if (!isMathSubject) {
        return text.replace(/\$/g, '');
    }

    // 2. Jika Matematika/Sains, hanya hapus angka sederhana yang tidak perlu LaTeX
    // Contoh: $10$ -> 10, $50%$ -> 50%, $5.5$ -> 5.5
    // Tapi biarkan $x^2$, $\frac{1}{2}$ dll.
    let cleaned = text.replace(/\$(\d+(?:[.,]\d+)?\s?%?)\$/g, '$1');
    return cleaned;
};

const protectLatex = (text: string) => {
    let placeholders: string[] = [];
    let protectedText = text.replace(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g, (match) => {
        placeholders.push(match);
        return `LATEXPLACEHOLDER${placeholders.length - 1}`;
    });
    return { protectedText, placeholders };
};

const restoreLatex = (html: string, placeholders: string[]) => {
    return html.replace(/LATEXPLACEHOLDER(\d+)/g, (_, index) => placeholders[parseInt(index)]);
};

const renderMarkdown = (text: string, isMathSubject: boolean) => {
    let stringText = safeString(text);
    stringText = cleanupUnnecessaryLatex(stringText, isMathSubject);
    stringText = normalizeTableFormat(stringText); 

    let { protectedText, placeholders } = protectLatex(stringText);

    try {
        if (typeof marked !== 'undefined') {
            let html = marked.parse(protectedText);
            return { __html: restoreLatex(html, placeholders) };
        }
    } catch (e) {
        console.warn("Markdown parsing failed, fallback to raw text", e);
    }
    
    let formatted = protectedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return { __html: restoreLatex(formatted, placeholders) };
};

const renderInlineMarkdown = (text: string, isMathSubject: boolean) => {
    let stringText = safeString(text);
    stringText = stringText.replace(/^\d+\.\s*/, ''); 
    stringText = cleanupUnnecessaryLatex(stringText, isMathSubject);

    let { protectedText, placeholders } = protectLatex(stringText);

    try {
        if (typeof marked !== 'undefined') {
            let html = "";
            if (typeof marked.parseInline === 'function') {
                 html = marked.parseInline(protectedText);
            } else {
                 html = marked.parse(protectedText).replace(/<\/?p[^>]*>/g, ""); 
            }
            return { __html: restoreLatex(html, placeholders) };
        }
    } catch(e) {
        // Fallback
    }
    
    let formatted = protectedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return { __html: restoreLatex(formatted, placeholders) };
};

const OpenSection: React.FC<{ title: string; children?: React.ReactNode; className?: string; contentAlign?: string; noBorder?: boolean }> = ({ title, children, className = "", contentAlign = "text-left", noBorder = false }) => (
  <div className={`mb-4 break-inside-avoid text-black ${className}`}>
      <h3 
        className="text-inherit font-bold text-[14pt] uppercase mb-3 mt-4" 
        style={noBorder ? { borderBottom: 'none' } : {}}
      >
          {title}
      </h3>
      <div className={`${contentAlign} text-black text-inherit`}>
          {children}
      </div>
  </div>
);

const RubricTable = ({ items, isMathSubject }: { items: any[], isMathSubject: boolean }) => (
  <div className="mb-6 break-inside-avoid">
      <table className="w-full border-collapse border border-black table-fixed text-black text-inherit">
          <thead>
              <tr className="bg-[#87CEFA]"> 
                  <th className="border border-black p-2 text-left w-[20%] align-middle font-bold text-center text-inherit">Kriteria</th>
                  <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-center text-inherit">Perlu Bimbingan</th>
                  <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-center text-inherit">Cukup</th>
                  <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-center text-inherit">Baik</th>
                  <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-center text-inherit">Sangat Baik</th>
              </tr>
          </thead>
          <tbody>
              {items.map((item, idx) => (
                  <tr key={idx}>
                      {/* Poin 1: Semua sel dibuat text-left */}
                      <td className="border border-black p-2 text-left font-bold align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.criteria, isMathSubject)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.needsGuidance, isMathSubject)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.basic, isMathSubject)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.proficient, isMathSubject)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.advanced, isMathSubject)} />
                  </tr>
              ))}
          </tbody>
      </table>
  </div>
);

const DocumentContent: React.FC<DocumentContentProps> = ({ data, inputData, activeTab }) => {
  
  // DETERMINE IF SUBJECT REQUIRES MATHJAX
  const isMathSubject = React.useMemo(() => {
    const subject = (inputData.subject || "").toLowerCase();
    const mathKeywords = ['matematika', 'fisika', 'kimia', 'ipa', 'sains', 'ilmu pengetahuan alam', 'kalkulus', 'statistik', 'aljabar', 'geometri', 'numerasi'];
    return mathKeywords.some(keyword => subject.includes(keyword));
  }, [inputData.subject]);

  useEffect(() => {
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
      const container = document.getElementById('konten-dokumen');
      if (container) {
        setTimeout(() => {
            MathJax.typesetPromise([container]).catch((e:any) => console.warn("MathJax Error:", e));
        }, 100);
      }
    }
  }, [data, activeTab, isMathSubject]);

  const RppContent = () => {
    if (!data.identitySection || !data.design || !data.learningExperience) return null;

    const { identitySection, initialAssessment, graduateProfile, design, learningExperience } = data;
    const approval = data.approval || { 
        authorName: '-', authorNip: '-', principalName: '-', principalNip: '-', location: '-', date: '-' 
    };

    return (
        <div className="text-inherit">
            <h1 className="text-inherit font-bold text-center mb-6">MODUL AJAR</h1>
            <h2 className="text-inherit text-center mb-6 uppercase">TOPIK: {identitySection.topic}</h2>

            <OpenSection title="I. IDENTITAS UMUM">
                <table className="w-full border-collapse border border-white mb-4 text-inherit identity-table">
                    <tbody>
                        <tr><td className="border border-white p-1 font-bold w-[30%] text-inherit">Nama Sekolah</td><td className="border border-white p-1 w-[2%] text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.schoolName}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Nama Penyusun</td><td className="border border-white p-1 w-[2%] text-inherit">:</td><td className="border border-white p-1 text-inherit">{approval.authorName}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Mata Pelajaran</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.subject}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Kelas / Fase</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.grade}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Semester</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.semester}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Alokasi Waktu</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.timeAllocation}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Jumlah Pertemuan</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.meetingCount}</td></tr>
                    </tbody>
                </table>

                <h4 className="font-bold mb-1 text-inherit">Asesmen Awal (Opsional)</h4>
                <div className="mb-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(initialAssessment || "Belum ada data.", isMathSubject)} />

                <h4 className="font-bold mb-1 text-inherit">Dimensi Profil Lulusan</h4>
                <div className="pl-0 mb-2 text-inherit">
                    <ul className="list-disc pl-6 text-inherit font-medium">
                        {(graduateProfile || []).map((g, i) => <li key={i} className="text-inherit">{safeString(g)}</li>)}
                    </ul>
                </div>
            </OpenSection>

            <OpenSection title="II. KOMPONEN INTI">
                <h4 className="font-bold mb-1 text-inherit">1. Tujuan Pembelajaran</h4>
                <ul className="list-disc pl-6 mb-2 text-inherit">
                    {(design.objectives || []).map((o, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(o, isMathSubject)} />)}
                </ul>

                <h4 className="font-bold mb-1 text-inherit">2. Praktik Pedagogis</h4>
                <div className="mb-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.pedagogicalPractice, isMathSubject)} />

                {design.partnership && (
                    <>
                        <h4 className="font-bold mb-1 text-inherit">3. Kemitraan (Opsional)</h4>
                        <div className="mb-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.partnership, isMathSubject)} />
                    </>
                )}

                <h4 className="font-bold mb-1 text-inherit">{design.partnership ? '4.' : '3.'} Lingkungan Belajar</h4>
                <div className="mb-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.environment, isMathSubject)} />

                {design.digital && (
                    <>
                        <h4 className="font-bold mb-1 text-inherit">{design.partnership ? '5.' : '4.'} Pemanfaatan Digital (Opsional)</h4>
                        <div className="mb-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.digital, isMathSubject)} />
                    </>
                )}
            </OpenSection>

            <OpenSection title="III. LANGKAH PEMBELAJARAN">
                {learningExperience.map((step, idx) => (
                    <div key={idx} className="mb-6 break-inside-avoid text-inherit">
                        <div className="bg-[#87CEFA] p-1.5 text-center font-bold mb-3 text-inherit rounded-sm">
                            PERTEMUAN {step.meetingNo}
                        </div>

                        <div className="mb-3">
                            <h4 className="font-bold text-inherit">A. Pendahuluan</h4>
                            <p className="italic text-xs text-slate-600 mb-1 text-inherit">Prinsip: <strong>{step.introPrinciple}</strong></p>
                            <ul className="list-disc pl-6 text-inherit">
                                {step.intro.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item, isMathSubject)} />)}
                            </ul>
                        </div>

                        <div className="mb-3">
                            <h4 className="font-bold text-inherit">B. Kegiatan Inti</h4>
                            <p className="italic text-xs text-slate-600 mb-1 text-inherit">Prinsip: <strong>{step.corePrinciple}</strong></p>
                            
                            <p className="font-bold mt-1 mb-1 text-inherit">1. Memahami</p>
                            <ul className="list-disc pl-6 mb-1 text-inherit">
                                {step.core.memahami.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item, isMathSubject)} />)}
                            </ul>
                            
                            <p className="font-bold mt-1 mb-1 text-inherit">2. Mengaplikasi</p>
                            <ul className="list-disc pl-6 mb-1 text-inherit">
                                {step.core.mengaplikasi.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item, isMathSubject)} />)}
                            </ul>

                            <p className="font-bold mt-1 mb-1 text-inherit">3. Merefleksi</p>
                            <ul className="list-disc pl-6 mb-1 text-inherit">
                                {step.core.merefleksi.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item, isMathSubject)} />)}
                            </ul>
                        </div>

                        <div className="mb-3">
                            <h4 className="font-bold text-inherit">C. Penutup</h4>
                            <p className="italic text-xs text-slate-600 mb-1 text-inherit">Prinsip: <strong>{step.closingPrinciple}</strong></p>
                            <ul className="list-disc pl-6 text-inherit">
                                {step.closing.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item, isMathSubject)} />)}
                            </ul>
                        </div>
                    </div>
                ))}
            </OpenSection>
        </div>
    );
  };

  const AssessmentContent = () => {
      if (!data?.assessment) return null;
      
      const assessment = data.assessment as DeepLearningAssessment;
      
      const kktp = Array.isArray(assessment.kktp) ? assessment.kktp : [];
      
      const formative = assessment.formative || {} as any;
      const checklist = Array.isArray(formative.checklist) ? formative.checklist : [];
      const feedback = formative.feedbackGuide || { clarification: '-', appreciation: '-', suggestion: '-' };
      
      const summative = assessment.summative || {} as any;
      const grid = Array.isArray(summative.grid) ? summative.grid : [];
      
      const intervention = assessment.intervention || { needsGuidance: '-', basic: '-', proficient: '-', advanced: '-' };

      return (
          // Poin 2: Removed 'assessment-reset' class to allow blue underline on h3
          <div className="text-inherit">
            <OpenSection title="IV. ASESMEN PEMBELAJARAN">
                
                <h4 className="font-bold mb-2 text-inherit">1. KKTP (Rubrik Pembelajaran Mendalam)</h4>
                <p className="italic mb-2 text-inherit text-slate-600 text-xs">Menggunakan Taksonomi Bloom (Revisi Anderson & Krathwohl)</p>
                {kktp.length > 0 ? <RubricTable items={kktp} isMathSubject={isMathSubject} /> : <p className="text-red-500 italic">Data KKTP tidak tersedia.</p>}

                <h4 className="font-bold mb-2 text-inherit">2. Asesmen Formatif (Proses)</h4>
                <div className="mb-6 break-inside-avoid">
                    <p className="font-bold mb-1 text-inherit">A. Lembar Observasi (Checklist)</p>
                    {checklist.length > 0 ? (
                        <table className="w-full border-collapse border border-black text-black text-inherit">
                            <thead>
                                <tr className="bg-[#87CEFA]">
                                    <th className="border border-black p-2 text-center w-12 font-bold text-center text-inherit">No</th>
                                    <th className="border border-black p-2 text-left font-bold text-center text-inherit">Aspek Pengamatan</th>
                                    <th className="border border-black p-2 text-left font-bold text-center text-inherit">Indikator Perilaku</th>
                                    <th className="border border-black p-2 text-center w-20 font-bold text-center text-inherit">Ceklis</th>
                                </tr>
                            </thead>
                            <tbody>
                                {checklist.map((item: any, idx: number) => (
                                    <tr key={idx}>
                                        <td className="border border-black p-2 text-center text-inherit">{idx + 1}</td>
                                        <td className="border border-black p-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.aspect || '-', isMathSubject)} />
                                        <td className="border border-black p-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.indicator || '-', isMathSubject)} />
                                        <td className="border border-black p-2 text-center text-inherit"></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : <p className="italic text-slate-500">Checklist tidak tersedia.</p>}
                </div>

                <div className="mb-6 break-inside-avoid">
                    <p className="font-bold mb-1 text-inherit">B. Tangga Umpan Balik (Feedback Ladder)</p>
                    <div className="pl-4 text-inherit">
                        <ul className="list-disc pl-5 space-y-2">
                            <li>
                                <span className="font-bold text-inherit">KLARIFIKASI: </span>
                                <span className="italic text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(safeString(feedback.clarification), isMathSubject)} />
                            </li>
                            <li>
                                <span className="font-bold text-inherit">APRESIASI: </span>
                                <span className="italic text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(safeString(feedback.appreciation), isMathSubject)} />
                            </li>
                            <li>
                                <span className="font-bold text-inherit">SARAN: </span>
                                <span className="italic text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(safeString(feedback.suggestion), isMathSubject)} />
                            </li>
                        </ul>
                    </div>
                </div>
            
                <h4 className="font-bold mb-2 text-inherit">3. Asesmen Sumatif (Kisi-Kisi)</h4>
                 <div className="mb-6 break-inside-avoid">
                     {grid.length > 0 ? (
                         <table className="w-full border-collapse border border-black text-inherit">
                            <thead>
                                <tr className="bg-[#87CEFA]">
                                    <th className="border border-black p-2 text-center w-12 font-bold text-center text-inherit">No</th>
                                    <th className="border border-black p-2 text-left font-bold text-center text-inherit">Indikator Soal</th>
                                    <th className="border border-black p-2 text-center font-bold text-center text-inherit">Level Kognitif</th>
                                    <th className="border border-black p-2 text-center font-bold text-center text-inherit">Bentuk Soal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {grid.map((item: any, idx: number) => (
                                    <tr key={idx}>
                                        <td className="border border-black p-2 text-center text-inherit">{idx + 1}</td>
                                        <td className="border border-black p-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.indicator || '-', isMathSubject)} />
                                        <td className="border border-black p-2 text-center text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(item.level || '-', isMathSubject)} />
                                        <td className="border border-black p-2 text-center text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(item.technique || '-', isMathSubject)} />
                                    </tr>
                                ))}
                            </tbody>
                         </table>
                     ) : <p className="italic text-slate-500">Kisi-kisi tidak tersedia.</p>}
                 </div>

                <h4 className="font-bold mb-2 text-inherit">4. Tindak Lanjut & Intervensi Guru</h4>
                 <div className="break-inside-avoid">
                    <table className="w-full border-collapse border border-black text-inherit">
                        <thead>
                            <tr className="bg-[#87CEFA]">
                                <th className="border border-black p-2 text-left font-bold w-1/3 text-center text-inherit">Kondisi Murid</th>
                                <th className="border border-black p-2 text-left font-bold text-center text-inherit">Strategi Intervensi</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="border border-black p-2 font-bold align-top text-inherit">Perlu Bimbingan</td>
                                <td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.needsGuidance || '-', isMathSubject)} />
                            </tr>
                            <tr>
                                <td className="border border-black p-2 font-bold align-top text-inherit">Cukup</td>
                                <td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.basic || '-', isMathSubject)} />
                            </tr>
                            <tr>
                                <td className="border border-black p-2 font-bold align-top text-inherit">Baik</td>
                                <td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.proficient || '-', isMathSubject)} />
                            </tr>
                            <tr>
                                <td className="border border-black p-2 font-bold align-top text-inherit">Sangat Baik</td>
                                <td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.advanced || '-', isMathSubject)} />
                            </tr>
                        </tbody>
                    </table>
                 </div>
            </OpenSection>
          </div>
      );
  };

  const QuestionBankContent = () => {
      if (!data.questionBank) return null;

      const groupedItems = data.questionBank.items.reduce((acc, item) => {
          if (!acc[item.type]) acc[item.type] = [];
          acc[item.type].push(item);
          return acc;
      }, {} as Record<string, QuestionItem[]>);

      return (
          <div className="text-inherit">
            <h1 className="text-inherit font-bold text-center mb-6 mt-12">LAMPIRAN 3: BANK SOAL & EVALUASI</h1>
            
            {Object.entries(groupedItems).map(([type, items], groupIndex) => (
                <div key={type} className="mb-8">
                    <h3 className="text-inherit border-b border-black pb-1 mb-4 font-bold">
                        {String.fromCharCode(65 + groupIndex)}. {type.toUpperCase()}
                    </h3>
                    
                    <div className="space-y-6">
                        {(items as any[]).map((item, idx) => (
                            <div key={idx} className="break-inside-avoid">
                                <div className="flex gap-2 text-sm">
                                    <span className="font-bold text-inherit">{idx + 1}.</span>
                                    <div className="flex-1 text-inherit">
                                        {/* Stimulus: Sembunyikan untuk tipe Menjodohkan dan Benar/Salah */}
                                        {item.stimulus && !['Menjodohkan', 'Benar/Salah'].includes(item.type) && (
                                            <div className="mb-2 italic text-gray-700 text-inherit bg-slate-50 p-3 border-l-4 border-slate-300 text-xs" dangerouslySetInnerHTML={renderMarkdown(item.stimulus, isMathSubject)} />
                                        )}
                                        
                                        <div className="mb-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.question, isMathSubject)} />
                                        
                                        {(item.type === 'Pilihan Ganda' || item.type === 'Pilihan Ganda Kompleks') && item.options && (
                                            <div className="grid grid-cols-1 gap-y-1 text-inherit mt-1 ml-4 text-xs">
                                                {(item.options as any[]).map((opt, i) => (
                                                    <div key={i} className="flex gap-2 text-inherit">
                                                        <span className="font-bold min-w-[20px] text-inherit">{String.fromCharCode(65 + i)}.</span>
                                                        <span className="text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(opt, isMathSubject)} />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        
                                        {/* Perbaikan Matching (Menjodohkan) - Hapus Border */}
                                        {item.type === 'Menjodohkan' && item.matchingPairs && (
                                            <div className="mt-4 ml-4 grid grid-cols-2 gap-8 text-xs">
                                                <div className="space-y-2">
                                                    <div className="font-bold border-b border-black pb-1">Premis</div>
                                                    {(item.matchingPairs as any[]).map((pair, i) => (
                                                        <div key={i} className="flex gap-2 items-start py-1">
                                                            <div className="font-bold min-w-[20px]">{i+1}.</div>
                                                            <div className="text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(pair.left, isMathSubject)} />
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="font-bold border-b border-black pb-1">Pilihan Jawaban</div>
                                                    {[...item.matchingPairs].sort((a: any, b: any) => a.right.localeCompare(b.right)).map((pair, i) => (
                                                        <div key={i} className="flex gap-2 items-start py-1">
                                                            <div className="font-bold min-w-[20px]">{String.fromCharCode(65+i)}.</div>
                                                            <div className="text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(pair.right, isMathSubject)} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* Perbaikan Benar/Salah - Hapus Border, Ganti Format Text */}
                                        {item.type === 'Benar/Salah' && (
                                            <div className="mt-2 ml-4 flex gap-8 text-xs pt-1">
                                                 <span className="font-bold">( ) Benar</span>
                                                 <span className="font-bold">( ) Salah</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            <div className="mt-8 pt-6 border-t-2 border-black break-inside-avoid">
                <h3 className="text-lg font-bold text-center mb-4 uppercase">KUNCI JAWABAN</h3>
                <div className="flex flex-col gap-6">
                    {Object.entries(groupedItems).map(([type, items], groupIndex) => (
                        <div key={type} className="text-xs">
                            <h4 className="font-bold text-inherit mb-1 border-b border-black pb-1">
                                {String.fromCharCode(65 + groupIndex)}. {type.toUpperCase()}
                            </h4>
                            <ol className="list-decimal pl-6 space-y-1 text-inherit">
                                {(items as any[]).map((item, idx) => {
                                    // Generate dynamic key for Matching to match the randomized display
                                    let displayKey = item.answerKey;
                                    
                                    if (item.type === 'Menjodohkan' && item.matchingPairs) {
                                        // Re-simulate the randomization (Sort Right Alphabetically)
                                        const sortedRight = [...item.matchingPairs].map((p: any) => p.right).sort((a: string, b: string) => a.localeCompare(b));
                                        
                                        // Build Key: "1 - [Letter], 2 - [Letter]"
                                        const keyParts = item.matchingPairs.map((pair: any, i: number) => {
                                            const matchIndex = sortedRight.indexOf(pair.right);
                                            const letter = String.fromCharCode(65 + matchIndex);
                                            return `${i+1} - ${letter}`;
                                        });
                                        displayKey = keyParts.join(", ");
                                    }

                                    return (
                                        <li key={idx}>
                                            <span className="text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(displayKey, isMathSubject)} />
                                        </li>
                                    );
                                })}
                            </ol>
                        </div>
                    ))}
                </div>
            </div>
          </div>
      );
  };
  
  const ReflectionContent = () => {
    if (!data.reflection) return null;
    return (
        <div className="text-inherit">
            <OpenSection title="V. REFLEKSI PEMBELAJARAN">
                <h4 className="font-bold mb-1 text-inherit">1. Refleksi Guru</h4>
                <ul className="list-disc pl-6 mb-4 text-inherit">
                    {(data.reflection.teacher || []).map((r, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(r, isMathSubject)} />)}
                </ul>

                <h4 className="font-bold mb-1 text-inherit">2. Refleksi Murid</h4>
                <ul className="list-disc pl-6 text-inherit">
                    {(data.reflection.student || []).map((r, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(r, isMathSubject)} />)}
                </ul>
            </OpenSection>
        </div>
    );
  };

  const ApprovalSignature = () => {
      const approval = data.approval;
      if (!approval) return null;

      return (
          <div className="break-inside-avoid mt-8 text-inherit signature-area">
              <table className="w-full border-none text-center text-inherit" style={{ border: 'none' }}>
                  <tbody>
                      <tr>
                          <td className="w-1/2 p-4 align-top text-inherit border-none" style={{ border: 'none' }}>
                              <p className="mb-4 text-inherit">
                                  Mengetahui,<br/>
                                  Kepala Sekolah
                              </p>
                              {/* Tambahan Jarak TTD (Sekitar 6rem/96px = 4-5 Enter) */}
                              <div className="h-24"></div>
                              <p className="font-bold underline text-inherit">{approval.principalName}</p>
                              <p className="text-inherit">NIP. {approval.principalNip}</p>
                          </td>
                          <td className="w-1/2 p-4 align-top text-inherit border-none" style={{ border: 'none' }}>
                              <p className="mb-4 text-inherit">
                                  {approval.location}, {approval.date}<br/>
                                  Guru Mata Pelajaran
                              </p>
                              {/* Tambahan Jarak TTD */}
                              <div className="h-24"></div>
                              <p className="font-bold underline text-inherit">{approval.authorName}</p>
                              <p className="text-inherit">NIP. {approval.authorNip}</p>
                          </td>
                      </tr>
                  </tbody>
              </table>
          </div>
      );
  };

  const MaterialsContent = () => {
      if (!data.materials) return null;
      const m = data.materials;
      
      let visualContent = "";
      
      if (typeof m.konsepInti.tabelVisual === 'object' && m.konsepInti.tabelVisual !== null && !Array.isArray(m.konsepInti.tabelVisual)) {
          // Handle Object format
          const tableObj = m.konsepInti.tabelVisual as any;
          visualContent = convertTableObjectToMarkdown(tableObj);
      } else {
          // Handle String format (legacy)
          const rawText = String(m.konsepInti.tabelVisual);
          visualContent = (!rawText.includes('|')) 
              ? convertBulletPointsToTable(rawText) 
              : rawText;
      }
      
      return (
          <div className="text-inherit">
            <h1 className="text-inherit font-bold text-center mb-6 mt-12 page-break-before">LAMPIRAN 1: MATERI AJAR</h1>
            <h2 className="text-inherit text-center mb-6 uppercase">{m.judul}</h2>
            
            <div className="mb-4 text-inherit">
                <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">Pemantik</h3>
                <p className="italic text-inherit" dangerouslySetInnerHTML={renderMarkdown(m.pemantik, isMathSubject)} />
            </div>

            <div className="mb-4 text-inherit">
                <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">Sub Topik</h3>
                <ul className="list-disc pl-6 text-inherit">
                     {m.subTopik.map((s, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(s, isMathSubject)} />)}
                </ul>
            </div>

            <div className="mb-4 text-inherit">
                <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">Konsep Inti</h3>
                <div className="mb-2 text-inherit">
                    <strong className="text-inherit">Definisi:</strong> <span dangerouslySetInnerHTML={renderInlineMarkdown(m.konsepInti.definisi, isMathSubject)} />
                </div>
                
                <strong className="text-inherit">Uraian Materi:</strong>
                <ul className="list-disc pl-6 mb-2 text-inherit">
                     {m.konsepInti.penjelasanBertahap.map((p, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(p, isMathSubject)} />)}
                </ul>

                <strong className="text-inherit">Contoh Konkret:</strong>
                <div className="mb-2 pl-4 text-inherit" dangerouslySetInnerHTML={renderMarkdown(m.konsepInti.contohKonkret, isMathSubject)} />

                <strong className="text-inherit">Visualisasi / Rangkuman Data:</strong>
                <div className="mb-2 pl-4 text-inherit force-table-styles" dangerouslySetInnerHTML={renderMarkdown(visualContent, isMathSubject)} />
            </div>
            
            <div className="mb-4 text-inherit">
                 <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">TAHUKAH KAMU?</h3>
                 <div className="text-inherit" dangerouslySetInnerHTML={renderMarkdown(m.trivia, isMathSubject)} />
            </div>

            <div className="mb-4 text-inherit">
                <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">Glosarium</h3>
                <ul className="list-disc pl-6 text-inherit">
                     {m.glosarium.map((g, i) => (
                         <li key={i}>
                             <strong className="text-inherit">{g.istilah}:</strong> <span dangerouslySetInnerHTML={renderInlineMarkdown(g.definisi, isMathSubject)} />
                         </li>
                     ))}
                </ul>
            </div>
          </div>
      );
  };

  const LkpdContent = () => {
      if (!data.lkpd) return null;
      const l = data.lkpd;

      // POIN 3: Helper untuk render Aktivitas (Tabel atau Numbering)
      const renderActivity = (activity: any) => {
          let text = "";
          let activityType = "";

          // Check if activity is object or string
          if (typeof activity === 'object' && activity !== null) {
              text = activity.content || "";
              activityType = activity.activityType || "";
          } else {
              text = String(activity);
          }

          const trimmed = text.trim();
          
          // Jika sudah tabel, render tabel
          if (trimmed.includes('|') && trimmed.includes('---')) {
               return <div className="text-inherit force-table-styles" dangerouslySetInnerHTML={renderMarkdown(trimmed, isMathSubject)} />;
          }
          
          // Jika sudah ada bullet/numbering di awal, render biasa
          if (/^\d+\.|^[-•]/.test(trimmed)) {
               return <div className="text-inherit force-table-styles" dangerouslySetInnerHTML={renderMarkdown(trimmed, isMathSubject)} />;
          }
          
          // Jika teks paragraf biasa, paksa jadi numbering untuk soal (jika banyak baris)
          const lines = trimmed.split('\n').filter(t => t.trim() !== '');
          if (lines.length > 1) {
              const numberedText = lines.map((line, idx) => {
                   if (/^\d+\./.test(line)) return line;
                   return `${idx + 1}. ${line}`;
              }).join('\n');
              return <div className="text-inherit force-table-styles" dangerouslySetInnerHTML={renderMarkdown(numberedText, isMathSubject)} />;
          }
          
          return <div className="text-inherit force-table-styles" dangerouslySetInnerHTML={renderMarkdown(trimmed, isMathSubject)} />;
      };

      return (
          <div className="text-inherit">
              <h1 className="text-inherit font-bold text-center mb-6 mt-12 page-break-before">LEMBAR KERJA</h1>
              <h2 className="text-inherit text-center mb-6 uppercase">{l.title}</h2>
              
              <OpenSection title="Identitas">
                  <p className="text-inherit">Nama: ...........................................................</p>
                  <p className="text-inherit">Kelas: ...........................................................</p>
              </OpenSection>

              <OpenSection title="Tujuan Pembelajaran">
                  <div className="text-inherit" dangerouslySetInnerHTML={renderMarkdown(l.objectives, isMathSubject)} />
              </OpenSection>

              <OpenSection title="Petunjuk Pengerjaan">
                  <ul className="list-decimal pl-5 text-inherit" style={{ listStylePosition: 'outside', marginLeft: '1rem' }}>
                      {l.instructions.map((ins, i) => <li key={i} className="pl-2 mb-1" dangerouslySetInnerHTML={renderMarkdown(ins, isMathSubject)} />)}
                  </ul>
              </OpenSection>

              <OpenSection title="Stimulus">
                  <div className="text-inherit italic" dangerouslySetInnerHTML={renderMarkdown(l.stimulus, isMathSubject)} />
              </OpenSection>

              <OpenSection title="Aktivitas 1 (Level Dasar)">
                   {renderActivity(l.activities.level1)}
              </OpenSection>

              <OpenSection title="Aktivitas 2 (Level Menengah)">
                   {renderActivity(l.activities.level2)}
              </OpenSection>

              <OpenSection title="Aktivitas 3 (Level Lanjut)">
                   {renderActivity(l.activities.level3)}
              </OpenSection>
              
              <OpenSection title="Refleksi Diri">
                   <ul className="list-disc pl-6 text-inherit">
                      {l.reflection.map((r, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(r, isMathSubject)} />)}
                   </ul>
              </OpenSection>
          </div>
      );
  };

  return (
    <div id="konten-dokumen">
        <style>{`
            /* Force Tables in Markdown Content to look like Tables */
            .force-table-styles table {
                width: 100% !important;
                border-collapse: collapse !important;
                border: 1px solid black !important;
                margin-bottom: 1rem;
            }
            .force-table-styles th, .force-table-styles td {
                border: 1px solid black !important;
                padding: 4px 8px !important;
                text-align: left;
                vertical-align: top;
            }
            .force-table-styles th {
                background-color: #f3f4f6 !important;
                font-weight: bold;
                text-align: center;
            }
            
            #konten-dokumen, #konten-dokumen * {
                font-size: 12pt !important;
                line-height: 1.3 !important;
                font-family: 'Cambria', Georgia, serif !important;
                color: #000000 !important;
            }
            
            #konten-dokumen p {
                margin-bottom: 4pt !important;
                text-align: justify;
            }
            
            /* ADD NEW RULE HERE FOR TABLE CONTENT ALIGNMENT */
            #konten-dokumen table td, #konten-dokumen table td * {
                text-align: left !important;
            }
            #konten-dokumen table th {
                text-align: center !important;
            }
            #konten-dokumen table td p {
                text-align: left !important;
                margin-bottom: 0 !important;
            }

            #konten-dokumen li {
                margin-bottom: 2pt !important;
                text-align: justify;
                padding-left: 4px;
            }
            
            #konten-dokumen h1 { 
                font-size: 24pt !important; 
                line-height: 1.2 !important; 
                font-weight: bold !important; 
                text-align: center; 
                margin-bottom: 12pt; 
                margin-top: 24pt !important; 
            }
            
            #konten-dokumen h2 { font-size: 14pt !important; line-height: 1.2 !important; font-weight: bold !important; text-align: center; margin-bottom: 10pt; margin-top: 0pt; text-transform: uppercase; }
            
            #konten-dokumen h3 { 
                font-size: 14pt !important; 
                line-height: 1.2 !important; 
                font-weight: bold !important; 
                text-transform: uppercase; 
                margin-bottom: 4pt !important; 
                margin-top: 18pt !important; 
                border-bottom: 2px solid #87CEFA; 
                display: block; 
                text-align: left !important;
                page-break-after: avoid !important; 
            }
            
            #konten-dokumen h4 { font-size: 12pt !important; text-transform: uppercase; font-weight: bold !important; margin-bottom: 4pt; margin-top: 8pt; page-break-after: avoid !important; }
            
            .markdown-content table {
                width: 100% !important;
                border-collapse: collapse !important;
                border: 1px solid #000 !important;
                margin: 8pt 0;
            }
            .markdown-content th {
                background-color: #f0f0f0 !important;
                font-weight: bold !important;
                border: 1px solid #000 !important;
                padding: 4pt 6pt;
                text-align: center !important;
                font-size: 10pt !important;
            }
            .markdown-content td {
                border: 1px solid #000 !important;
                padding: 4pt 6pt;
                text-align: left;
                vertical-align: top;
                font-size: 10pt !important;
            }
            
            .identity-table td { border-color: white !important; padding: 1pt 4pt !important; }
            .identity-table { border-color: white !important; margin-bottom: 0 !important; }

            @media print {
                .page-break-divider { display: none !important; }
                .signature-area td { background: transparent !important; box-shadow: none !important; }
            }
        `}</style>

        {(activeTab === 'RPP_PLUS' || activeTab === 'SEMUA') && (
            <>
                <RppContent />
                <AssessmentContent />
                <ReflectionContent />
                <ApprovalSignature />
            </>
        )}
        
        {(activeTab === 'MATERI' || activeTab === 'SEMUA') && (
            <MaterialsContent />
        )}
        
        {(activeTab === 'LKPD' || activeTab === 'SEMUA') && (
            <LkpdContent />
        )}

        {(activeTab === 'SOAL' || activeTab === 'SEMUA') && (
            <QuestionBankContent />
        )}
    </div>
  );
};

export default DocumentContent;
