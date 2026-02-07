
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
 * UTILITIES
 * ============================================
 */

const safeString = (val: any): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === 'string') return val.replace(/siswa|peserta didik/gi, 'Murid');
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(safeString).join(", ");
  if (typeof val === 'object') return (val.text || val.content || val.value || val.description || JSON.stringify(val)).replace(/siswa|peserta didik/gi, 'Murid');
  return String(val);
};

// --- MARKDOWN & LATEX RENDERING ---

const cleanupUnnecessaryLatex = (text: string, isMathSubject: boolean): string => {
    if (!isMathSubject) {
        return text.replace(/\$/g, '');
    }
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
    // Note: We don't need normalizeTableFormat anymore for sections using TableRenderer
    // But kept for other sections just in case.
    
    let { protectedText, placeholders } = protectLatex(stringText);

    try {
        if (typeof marked !== 'undefined') {
            let html = marked.parse(protectedText);
            return { __html: restoreLatex(html, placeholders) };
        }
    } catch (e) {
        console.warn("Markdown parsing failed", e);
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
    } catch(e) { }
    
    let formatted = protectedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return { __html: restoreLatex(formatted, placeholders) };
};

// --- TABLE PARSING UTILS (NEW) ---

// Parse string Markdown Table menjadi Object untuk TableRenderer
const parseMarkdownTable = (mdText: string): { headers: string[], rows: string[][] } | null => {
    if (!mdText || !mdText.includes('|')) return null;
    
    const lines = mdText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Cari baris header (baris pertama yang punya pipe)
    const headerIndex = lines.findIndex(l => l.startsWith('|') || (l.split('|').length > 2));
    if (headerIndex === -1) return null;

    const parseRow = (row: string) => {
        return row.split('|').slice(1, -1).map(c => c.trim());
    };

    try {
        const headers = parseRow(lines[headerIndex]);
        const rows: string[][] = [];

        for (let i = headerIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            // Skip separator line (e.g., |---|---|)
            if (line.match(/^\|\s*[:\-]+\s*\|/)) continue;
            // Stop if line doesn't look like table
            if (!line.includes('|')) break;
            
            const cells = parseRow(line);
            if (cells.length > 0) {
                // Normalize row length
                while(cells.length < headers.length) cells.push("");
                rows.push(cells.slice(0, headers.length));
            }
        }

        if (headers.length === 0 || rows.length === 0) return null;
        return { headers, rows };
    } catch (e) {
        return null;
    }
};

/**
 * ============================================
 * COMPONENTS
 * ============================================
 */

// DIRECT JSX TABLE RENDERER (PENGGANTI DANGEROUS HTML)
const TableRenderer = ({ table, isMathSubject }: { table: { headers: string[], rows: string[][] }, isMathSubject: boolean }) => (
  <div className="mb-4 overflow-x-auto break-inside-avoid">
    <table className="w-full border-collapse border border-black text-inherit table-fixed">
      <thead>
        <tr className="bg-[#f3f4f6]">
          {table.headers.map((h, i) => (
            <th key={i} className="border border-black p-2 text-center font-bold align-middle bg-[#f3f4f6]">
               <span dangerouslySetInnerHTML={renderInlineMarkdown(h, isMathSubject)} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} className="border border-black p-2 align-top text-left">
                <span dangerouslySetInnerHTML={renderInlineMarkdown(cell, isMathSubject)} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const OpenSection: React.FC<{ title: string; children?: React.ReactNode; className?: string; contentAlign?: string; noBorder?: boolean }> = ({ title, children, className = "", contentAlign = "text-left", noBorder = false }) => (
  <div className={`mb-4 text-black ${className}`}>
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
                            <li><span className="font-bold text-inherit">KLARIFIKASI: </span><span className="italic text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(safeString(feedback.clarification), isMathSubject)} /></li>
                            <li><span className="font-bold text-inherit">APRESIASI: </span><span className="italic text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(safeString(feedback.appreciation), isMathSubject)} /></li>
                            <li><span className="font-bold text-inherit">SARAN: </span><span className="italic text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(safeString(feedback.suggestion), isMathSubject)} /></li>
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
                            <tr><td className="border border-black p-2 font-bold align-top text-inherit">Perlu Bimbingan</td><td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.needsGuidance || '-', isMathSubject)} /></tr>
                            <tr><td className="border border-black p-2 font-bold align-top text-inherit">Cukup</td><td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.basic || '-', isMathSubject)} /></tr>
                            <tr><td className="border border-black p-2 font-bold align-top text-inherit">Baik</td><td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.proficient || '-', isMathSubject)} /></tr>
                            <tr><td className="border border-black p-2 font-bold align-top text-inherit">Sangat Baik</td><td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.advanced || '-', isMathSubject)} /></tr>
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
                                    let displayKey = item.answerKey;
                                    if (item.type === 'Menjodohkan' && item.matchingPairs) {
                                        const sortedRight = [...item.matchingPairs].map((p: any) => p.right).sort((a: string, b: string) => a.localeCompare(b));
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
          <div className="break-inside-avoid mt-8 signature-area">
              <table className="w-full border-none text-center table-fixed" style={{ border: 'none' }}>
                  <tbody>
                      <tr>
                          <td className="w-1/2 p-2 align-top border-none" style={{ border: 'none', fontSize: '11pt', lineHeight: '1.2' }}>
                              <p className="mb-20">
                                  Mengetahui,<br/>
                                  Kepala Sekolah<br/><br/><br/><br/>
                              </p>
                              <p className="font-bold underline break-words">{approval.principalName}</p>
                              <p className="break-words">NIP. {approval.principalNip}</p>
                          </td>
                          <td className="w-1/2 p-2 align-top border-none" style={{ border: 'none', fontSize: '11pt', lineHeight: '1.2' }}>
                              <p className="mb-20">
                                  {approval.location}, {approval.date}<br/>
                                  Guru Mata Pelajaran<br/><br/><br/><br/>
                              </p>
                              <p className="font-bold underline break-words">{approval.authorName}</p>
                              <p className="break-words">NIP. {approval.authorNip}</p>
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
      
      let visualContent = null;
      
      // LOGIC BARU: Jika objek, pakai TableRenderer. Jika string, cek apakah tabel.
      if (typeof m.konsepInti.tabelVisual === 'object' && m.konsepInti.tabelVisual !== null && !Array.isArray(m.konsepInti.tabelVisual)) {
          visualContent = <TableRenderer table={m.konsepInti.tabelVisual as any} isMathSubject={isMathSubject} />;
      } else {
          const rawText = String(m.konsepInti.tabelVisual);
          // Coba parse string markdown menjadi objek tabel
          const parsedTable = parseMarkdownTable(rawText);
          if (parsedTable) {
              visualContent = <TableRenderer table={parsedTable} isMathSubject={isMathSubject} />;
          } else {
              // Fallback ke rendering biasa
              visualContent = <div className="mb-2 pl-4 text-inherit force-table-styles" dangerouslySetInnerHTML={renderMarkdown(rawText, isMathSubject)} />;
          }
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
                {visualContent}
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

      // Helper untuk render Aktivitas dengan deteksi Tabel Pintar
      const renderActivity = (activity: any) => {
          let text = "";
          if (typeof activity === 'object' && activity !== null) {
              text = activity.content || "";
          } else {
              text = String(activity);
          }

          const trimmed = text.trim();
          
          // 1. Coba parse tabel markdown
          const parsedTable = parseMarkdownTable(trimmed);
          if (parsedTable) {
              return <TableRenderer table={parsedTable} isMathSubject={isMathSubject} />;
          }
          
          // 2. Jika bukan tabel, render biasa (termasuk list numbering)
          // HAPUS LOGIC MANUAL NUMBERING: Biarkan markdown renderer yang bekerja
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

              <OpenSection title="Aktivitas 1: Pemahaman Konsep">
                   {renderActivity(l.activities.activity1)}
              </OpenSection>

              <OpenSection title="Aktivitas 2: Aplikasi & Diskusi">
                   {renderActivity(l.activities.activity2)}
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

            /* FIX: Explicit List Styles for Markdown Content */
            #konten-dokumen ul {
                list-style-type: disc !important;
                padding-left: 1.5rem !important;
            }
            #konten-dokumen ol {
                list-style-type: decimal !important;
                padding-left: 1.5rem !important;
            }
            /* Remove list style inside tables to avoid double bullets */
            #konten-dokumen table ul, #konten-dokumen table ol {
                list-style-type: none !important;
                padding-left: 0 !important;
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
