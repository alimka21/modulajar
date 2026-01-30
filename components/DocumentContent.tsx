
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

const cleanupUnnecessaryLatex = (text: string): string => {
    let cleaned = text.replace(/\$\s*(\d+)\s*\$/g, '$1');
    cleaned = cleaned.replace(/\$\s*(\d+[\.,]\d+)\s*\$/g, '$1');
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

const renderMarkdown = (text: string) => {
    let stringText = safeString(text);
    stringText = cleanupUnnecessaryLatex(stringText);

    let { protectedText, placeholders } = protectLatex(stringText);
    let formatted = protectedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    if (typeof marked !== 'undefined') {
        let html = marked.parse(formatted);
        return { __html: restoreLatex(html, placeholders) };
    }
    
    return { __html: restoreLatex(formatted, placeholders) };
};

const renderInlineMarkdown = (text: string) => {
    let stringText = safeString(text);
    stringText = stringText.replace(/^\d+\.\s*/, ''); 
    stringText = cleanupUnnecessaryLatex(stringText);

    let { protectedText, placeholders } = protectLatex(stringText);

    if (typeof marked !== 'undefined') {
        let html = "";
        if (typeof marked.parseInline === 'function') {
             html = marked.parseInline(protectedText);
        } else {
             html = marked.parse(protectedText).replace(/<\/?p[^>]*>/g, ""); 
        }
        return { __html: restoreLatex(html, placeholders) };
    }
    
    let formatted = protectedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return { __html: restoreLatex(formatted, placeholders) };
};

const OpenSection: React.FC<{ title: string; children?: React.ReactNode; className?: string; contentAlign?: string; }> = ({ title, children, className = "", contentAlign = "text-left" }) => (
  <div className={`mb-4 break-inside-avoid text-black ${className}`}>
      <h3 className="text-inherit font-bold text-[14pt] uppercase mb-2 mt-4">
          {title}
      </h3>
      <div className={`${contentAlign} text-black text-inherit`}>
          {children}
      </div>
  </div>
);

const RubricTable = ({ items }: { items: any[] }) => (
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
                      <td className="border border-black p-2 font-bold align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.criteria)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.needsGuidance)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.basic)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.proficient)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.advanced)} />
                  </tr>
              ))}
          </tbody>
      </table>
  </div>
);

const DocumentContent: React.FC<DocumentContentProps> = ({ data, inputData, activeTab }) => {
  
  useEffect(() => {
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
      const container = document.getElementById('konten-dokumen');
      if (container) {
        setTimeout(() => {
            MathJax.typesetPromise([container]).catch((e:any) => console.warn(e));
        }, 300);
      }
    }
  }, [data, activeTab]);

  const RppContent = () => {
    const { identitySection, initialAssessment, graduateProfile, design, learningExperience } = data;
    return (
        <div className="text-inherit">
            <h1 className="text-inherit font-bold text-[24pt] text-center mb-4">MODUL AJAR</h1>
            <h2 className="text-inherit text-[14pt] text-center mb-6 uppercase">TOPIK: {identitySection.topic}</h2>

            <OpenSection title="I. IDENTITAS UMUM">
                <table className="w-full border-collapse border border-white mb-4 text-inherit identity-table">
                    <tbody>
                        <tr><td className="border border-white p-1 font-bold w-[30%] text-inherit">Nama Sekolah</td><td className="border border-white p-1 w-[2%] text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.schoolName}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Nama Penyusun</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{data.approval.authorName}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Mata Pelajaran</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.subject}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Kelas / Fase</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.grade}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Semester</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.semester}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Alokasi Waktu</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.timeAllocation}</td></tr>
                        <tr><td className="border border-white p-1 font-bold text-inherit">Jumlah Pertemuan</td><td className="border border-white p-1 text-inherit">:</td><td className="border border-white p-1 text-inherit">{identitySection.meetingCount}</td></tr>
                    </tbody>
                </table>

                <h4 className="font-bold mb-1 text-inherit text-[13pt]">Asesmen Awal (Opsional)</h4>
                <div className="mb-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(initialAssessment || "Belum ada data.")} />

                <h4 className="font-bold mb-1 text-inherit text-[13pt]">Dimensi Profil Lulusan</h4>
                <ul className="list-disc pl-6 mb-2 text-inherit">
                    {(graduateProfile || []).map((g, i) => <li key={i} className="text-inherit">{g}</li>)}
                </ul>
            </OpenSection>

            <OpenSection title="II. KOMPONEN INTI">
                <h4 className="font-bold mb-1 text-inherit text-[13pt]">1. Tujuan Pembelajaran</h4>
                <ul className="list-disc pl-6 mb-2 text-inherit">
                    {(design.objectives || []).map((o, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(o)} />)}
                </ul>

                <h4 className="font-bold mb-1 text-inherit text-[13pt]">2. Praktik Pedagogis</h4>
                <div className="mb-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.pedagogicalPractice)} />

                {design.partnership && (
                    <>
                        <h4 className="font-bold mb-1 text-inherit text-[13pt]">3. Kemitraan (Opsional)</h4>
                        <div className="mb-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.partnership)} />
                    </>
                )}

                <h4 className="font-bold mb-1 text-inherit text-[13pt]">{design.partnership ? '4.' : '3.'} Lingkungan Belajar</h4>
                <div className="mb-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.environment)} />

                {design.digital && (
                    <>
                        <h4 className="font-bold mb-1 text-inherit text-[13pt]">{design.partnership ? '5.' : '4.'} Pemanfaatan Digital (Opsional)</h4>
                        <div className="mb-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.digital)} />
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
                            <h4 className="font-bold text-inherit text-[13pt]">A. Pendahuluan</h4>
                            <p className="italic text-xs text-slate-600 mb-1 text-inherit">Prinsip: {step.introPrinciple}</p>
                            <ul className="list-disc pl-6 text-inherit">
                                {step.intro.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                            </ul>
                        </div>

                        <div className="mb-3">
                            <h4 className="font-bold text-inherit text-[13pt]">B. Kegiatan Inti</h4>
                            <p className="italic text-xs text-slate-600 mb-1 text-inherit">Prinsip: {step.corePrinciple}</p>
                            
                            <p className="font-bold mt-1 mb-1 text-inherit">1. Memahami</p>
                            <ul className="list-disc pl-6 mb-1 text-inherit">
                                {step.core.memahami.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                            </ul>
                            
                            <p className="font-bold mt-1 mb-1 text-inherit">2. Mengaplikasi</p>
                            <ul className="list-disc pl-6 mb-1 text-inherit">
                                {step.core.mengaplikasi.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                            </ul>

                            <p className="font-bold mt-1 mb-1 text-inherit">3. Merefleksi</p>
                            <ul className="list-disc pl-6 mb-1 text-inherit">
                                {step.core.merefleksi.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                            </ul>
                        </div>

                        <div className="mb-3">
                            <h4 className="font-bold text-inherit text-[13pt]">C. Penutup</h4>
                            <p className="italic text-xs text-slate-600 mb-1 text-inherit">Prinsip: {step.closingPrinciple}</p>
                            <ul className="list-disc pl-6 text-inherit">
                                {step.closing.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
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
      
      let { kktp, formative, summative, intervention } = data.assessment as DeepLearningAssessment;
      const summativeGrid = summative?.grid;

      return (
          <div className="text-inherit assessment-reset">
            <h1 className="text-inherit font-bold text-[24pt] text-center mb-4 mt-8">ASESMEN PEMBELAJARAN</h1>
            
            <OpenSection title="1. KKTP (Rubrik Pembelajaran Mendalam)">
                 <p className="italic mb-2 text-inherit text-slate-600 text-xs">Menggunakan Taksonomi Bloom (Revisi Anderson & Krathwohl)</p>
                 <RubricTable items={kktp} />
            </OpenSection>

            <OpenSection title="2. Asesmen Formatif (Proses)">
                <div className="mb-6 break-inside-avoid">
                    <h4 className="font-bold mb-2 text-inherit text-[13pt]">A. Lembar Observasi (Checklist)</h4>
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
                            {(formative.checklist || []).map((item: any, idx: number) => (
                                <tr key={idx}>
                                    <td className="border border-black p-2 text-center text-inherit">{idx + 1}</td>
                                    <td className="border border-black p-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.aspect)} />
                                    <td className="border border-black p-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.indicator)} />
                                    <td className="border border-black p-2 text-center text-inherit"></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="mb-6 break-inside-avoid">
                    <h4 className="font-bold mb-2 text-inherit text-[13pt]">B. Tangga Umpan Balik (Feedback Ladder)</h4>
                    <div className="border border-black p-4 text-inherit rounded-sm">
                        <div className="mb-2">
                            <span className="font-bold text-inherit block mb-1">KLARIFIKASI: </span>
                            <span className="italic text-inherit text-sm" dangerouslySetInnerHTML={renderInlineMarkdown(`"${safeString(formative.feedbackGuide.clarification)}"`)} />
                        </div>
                        <div className="mb-2">
                            <span className="font-bold text-inherit block mb-1">APRESIASI: </span>
                            <span className="italic text-inherit text-sm" dangerouslySetInnerHTML={renderInlineMarkdown(`"${safeString(formative.feedbackGuide.appreciation)}"`)} />
                        </div>
                        <div>
                            <span className="font-bold text-inherit block mb-1">SARAN: </span>
                            <span className="italic text-inherit text-sm" dangerouslySetInnerHTML={renderInlineMarkdown(`"${safeString(formative.feedbackGuide.suggestion)}"`)} />
                        </div>
                    </div>
                </div>
            </OpenSection>
            
            <OpenSection title="3. Asesmen Sumatif (Kisi-Kisi)">
                 <div className="mb-6 break-inside-avoid">
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
                            {Array.isArray(summativeGrid) ? (summativeGrid as any[]).map((item: any, idx: number) => (
                                <tr key={idx}>
                                    <td className="border border-black p-2 text-center text-inherit">{idx + 1}</td>
                                    <td className="border border-black p-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.indicator)} />
                                    <td className="border border-black p-2 text-center text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(item.level)} />
                                    <td className="border border-black p-2 text-center text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(item.technique)} />
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="border border-black p-4 text-center italic text-inherit">
                                        Data kisi-kisi belum tersedia.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                     </table>
                 </div>
            </OpenSection>

            <OpenSection title="4. Tindak Lanjut & Intervensi Guru">
                 <div className="break-inside-avoid">
                    <table className="w-full border-collapse border border-black text-inherit">
                        <thead>
                            <tr className="bg-[#87CEFA]">
                                <th className="border border-black p-2 text-left font-bold w-1/3 text-center text-inherit">Kondisi Siswa</th>
                                <th className="border border-black p-2 text-left font-bold text-center text-inherit">Strategi Intervensi</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="border border-black p-2 font-bold align-top text-inherit">Perlu Bimbingan</td>
                                <td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.needsGuidance)} />
                            </tr>
                            <tr>
                                <td className="border border-black p-2 font-bold align-top text-inherit">Cukup</td>
                                <td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.basic)} />
                            </tr>
                            <tr>
                                <td className="border border-black p-2 font-bold align-top text-inherit">Baik</td>
                                <td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.proficient)} />
                            </tr>
                            <tr>
                                <td className="border border-black p-2 font-bold align-top text-inherit">Sangat Baik</td>
                                <td className="border border-black p-2 align-top text-inherit" dangerouslySetInnerHTML={renderMarkdown(intervention.advanced)} />
                            </tr>
                        </tbody>
                    </table>
                 </div>
            </OpenSection>
          </div>
      );
  };

  const ApprovalSignature = () => {
    const { approval } = data;
    return (
        <div className="break-inside-avoid text-inherit mt-8 signature-area">
            <table className="w-full border-none text-inherit bg-transparent">
                <tbody>
                    <tr>
                        <td className="w-1/2 text-center align-top border-none p-4 text-inherit bg-transparent">
                            <p className="mb-0 text-inherit">Mengetahui,</p>
                            <p className="mb-0 text-inherit">Kepala Sekolah</p>
                            <div className="h-16"></div> 
                            <p className="font-bold underline text-inherit">{approval.principalName}</p>
                            <p className="text-inherit">NIP. {approval.principalNip}</p>
                        </td>
                        <td className="w-1/2 text-center align-top border-none p-4 text-inherit bg-transparent">
                            <p className="mb-0 text-inherit">{approval.location}, {approval.date}</p>
                            <p className="mb-0 text-inherit">Guru Mata Pelajaran</p>
                            <div className="h-16"></div>
                            <p className="font-bold underline text-inherit">{approval.authorName}</p>
                            <p className="text-inherit">NIP. {approval.authorNip}</p>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
  };

  const ReflectionContent = () => {
    if (!data.reflection) return null;
    const { teacher, student } = data.reflection;
    return (
        <div className="text-inherit">
             <h1 className="text-inherit font-bold text-[24pt] text-center mb-4 mt-8">REFLEKSI PEMBELAJARAN</h1>
             
             <OpenSection title="1. Refleksi Guru">
                <ul className="list-disc pl-6 text-inherit">
                    {teacher.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                </ul>
             </OpenSection>

             <OpenSection title="2. Refleksi Murid">
                <ul className="list-disc pl-6 text-inherit">
                    {student.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                </ul>
             </OpenSection>
        </div>
    );
  };

  const MaterialsContent = () => {
    const m = data.materials;
    if (!m) return null;

    return (
        <div className="text-inherit">
            <h1 className="text-inherit font-bold text-[24pt] text-center mb-4 mt-12">LAMPIRAN 1: MATERI AJAR</h1>
            <h2 className="text-inherit text-[14pt] text-center mb-6 uppercase">{m.judul}</h2>

            <div className="mb-4 text-inherit">
                <h3 className="font-bold text-inherit mb-2 text-[14pt] border-b-2 border-[#87CEFA] text-left uppercase mt-4">PEMANTIK BELAJAR</h3>
                <p className="italic text-lg text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(m.pemantik)} />
            </div>

            <OpenSection title="SUB TOPIK">
                <ul className="list-disc pl-6 text-inherit">
                    {m.subTopik.map((t, i) => <li key={i} className="text-inherit">{t}</li>)}
                </ul>
            </OpenSection>

            <OpenSection title="KONSEP INTI">
                 <div className="mb-4 text-inherit">
                    <h4 className="font-bold mb-1 text-inherit text-[13pt]">Definisi</h4>
                    <div dangerouslySetInnerHTML={renderMarkdown(m.konsepInti.definisi)} />
                 </div>

                 <h4 className="font-bold mb-1 text-inherit text-[13pt]">Penjelasan Materi</h4>
                 <div className="mb-4 pl-4 text-inherit">
                     <ul className="list-disc pl-6 space-y-1 text-inherit">
                        {m.konsepInti.penjelasanBertahap.map((p, i) => (
                             <li key={i} dangerouslySetInnerHTML={renderMarkdown(p)} />
                        ))}
                     </ul>
                 </div>

                 <h4 className="font-bold mb-1 text-inherit text-[13pt]">Visualisasi / Tabel</h4>
                 <div className="mb-4 overflow-x-auto markdown-content text-inherit" dangerouslySetInnerHTML={renderMarkdown(m.konsepInti.tabelVisual)} />

                 <div className="mb-4 text-inherit">
                    <h3 className="text-inherit font-bold text-[14pt] uppercase mb-2 mt-4 border-b-2 border-[#87CEFA] text-left">CONTOH NYATA</h3>
                    <div className="italic text-inherit text-sm" dangerouslySetInnerHTML={renderMarkdown(m.konsepInti.contohKonkret)} />
                 </div>
            </OpenSection>

            <div className="mt-4 text-inherit break-inside-avoid">
                <div className="mb-6">
                    <h3 className="font-bold border-b-2 border-[#87CEFA] pb-1 mb-2 text-inherit text-[14pt] uppercase">TAHUKAH KAMU?</h3>
                    <div className="text-sm text-inherit" dangerouslySetInnerHTML={renderMarkdown(m.trivia)} />
                </div>
                
                <div>
                    <h3 className="font-bold border-b-2 border-[#87CEFA] pb-1 mb-2 text-inherit text-[14pt] uppercase">GLOSARIUM</h3>
                    <ul className="text-xs space-y-1 text-inherit">
                        {m.glosarium.map((g, i) => (
                            <li key={i}>
                                <span className="font-bold text-inherit">{g.istilah}: </span>
                                <span className="text-inherit">{g.definisi}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
  };

  const LkpdContent = () => {
    if (!data.lkpd) return null;
    
    const rawTitle = data.lkpd.title || inputData.topic;
    const cleanTitle = rawTitle.replace(/^(Lembar Kerja Peserta Didik|LKPD|Lembar Kerja Murid)(\s*\(LKPD\))?(\s*:\s*|\s+-\s+|\s+)/i, "").trim();

    return (
        <div className="lkpd-reset text-inherit">
            <div className="mb-6 bg-white text-black text-inherit mt-12">
              <div className="text-center mb-4">
                <h1 className="text-inherit" style={{ fontSize: '24pt', fontWeight: 'bold', lineHeight: '1.2' }}>
                    LAMPIRAN 2: LEMBAR KERJA MURID
                </h1>
                <h2 className="text-inherit" style={{ fontSize: '14pt', fontWeight: 'normal', lineHeight: '1.2' }}>
                    {cleanTitle}
                </h2>
              </div>
              <div className="w-full my-4" style={{ borderBottom: '2px solid black' }}></div>
              <div className="flex flex-col gap-2" style={{ fontSize: '11pt' }}>
                <div className="space-y-1">
                   <div className="flex"><span className="font-bold min-w-[150px]">Mata Pelajaran</span><span>: {inputData.subject}</span></div>
                   <div className="flex"><span className="font-bold min-w-[150px]">Kelas / Fase</span><span>: {inputData.grade}</span></div>
                </div>
                <div>
                     <div className="font-bold mb-1">Identitas Kelompok:</div>
                     <div className="space-y-1">
                         <div className="flex items-end gap-2"><span className="min-w-[150px]">Nama Kelompok</span><div className="flex-1 border-b border-black border-dashed">:</div></div>
                         <div className="flex items-start gap-2">
                            <span className="min-w-[150px]">Anggota</span>
                            <div className="flex-1 border-b border-black border-dashed">: .................................................................................</div>
                         </div>
                     </div>
                </div>
              </div>
            </div>
            
            <OpenSection title="A. TUJUAN PEMBELAJARAN">
                 <div className="markdown-content text-inherit text-sm" dangerouslySetInnerHTML={renderMarkdown(data.lkpd.objectives)} />
            </OpenSection>

            <OpenSection title="B. PETUNJUK PENGERJAAN">
                 <ol className="list-decimal pl-6 space-y-1 text-inherit text-sm">
                     {data.lkpd.instructions && data.lkpd.instructions.length > 0 
                        ? (data.lkpd.instructions as string[]).map((g,i) => <li key={i} dangerouslySetInnerHTML={renderInlineMarkdown(g)} />)
                        : <li>Bacalah instruksi dengan seksama.</li>
                     }
                 </ol>
            </OpenSection>

            <div className="mb-4 break-inside-avoid text-inherit">
                <h3 className="text-inherit font-bold text-[14pt] uppercase mb-2">C. STIMULUS</h3>
                <div className="italic text-inherit text-sm">
                    <div dangerouslySetInnerHTML={renderMarkdown(data.lkpd.stimulus)} />
                </div>
            </div>

            <h3 className="text-inherit mb-3 font-bold text-[14pt] uppercase mt-4">D. AKTIVITAS BERTAHAP</h3>

            <div className="mb-4 break-inside-avoid text-inherit">
                <div className="font-bold text-inherit mb-1 border-b border-black inline-block text-sm">
                    AKTIVITAS 1
                </div>
                <div 
                    className="markdown-content text-inherit text-sm whitespace-pre-wrap" 
                    dangerouslySetInnerHTML={renderMarkdown(data.lkpd.activities.level1)} 
                />
            </div>

            <div className="mb-4 break-inside-avoid text-inherit">
                <div className="font-bold text-inherit mb-1 border-b border-black inline-block text-sm">
                    AKTIVITAS 2
                </div>
                <div 
                    className="markdown-content text-inherit text-sm whitespace-pre-wrap" 
                    dangerouslySetInnerHTML={renderMarkdown(data.lkpd.activities.level2)} 
                />
            </div>

            <div className="mb-4 break-inside-avoid text-inherit">
                <div className="font-bold text-inherit mb-1 border-b border-black inline-block text-sm">
                    AKTIVITAS 3
                </div>
                <div 
                    className="markdown-content text-inherit text-sm whitespace-pre-wrap" 
                    dangerouslySetInnerHTML={renderMarkdown(data.lkpd.activities.level3)} 
                />
            </div>

            <OpenSection title="E. REFLEKSI DIRI">
                <ol className="list-decimal pl-6 space-y-4 text-inherit text-sm">
                    {data.lkpd.reflection.map((t, i) => (
                        <li key={i} className="break-inside-avoid">
                            <div className="mb-1 font-medium" dangerouslySetInnerHTML={renderInlineMarkdown(t)} />
                            <div className="border-b border-black border-dashed h-6 w-full opacity-30"></div>
                            <div className="border-b border-black border-dashed h-6 w-full opacity-30"></div>
                        </li>
                    ))}
                </ol>
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
            <h1 className="text-inherit font-bold text-[24pt] text-center mb-4 mt-12">LAMPIRAN 3: BANK SOAL & EVALUASI</h1>
            
            {Object.entries(groupedItems).map(([type, items], groupIndex) => (
                <div key={type} className="mb-8">
                    <h3 className="text-inherit border-b border-black pb-1 mb-4 font-bold text-[14pt]">
                        {String.fromCharCode(65 + groupIndex)}. {type.toUpperCase()}
                    </h3>
                    
                    <div className="space-y-6">
                        {(items as any[]).map((item, idx) => (
                            <div key={idx} className="break-inside-avoid">
                                <div className="flex gap-2 text-sm">
                                    <span className="font-bold text-inherit">{idx + 1}.</span>
                                    <div className="flex-1 text-inherit">
                                        {item.stimulus && (
                                            <div className="mb-2 italic text-gray-700 text-inherit bg-slate-50 p-3 border-l-4 border-slate-300 text-xs" dangerouslySetInnerHTML={renderMarkdown(item.stimulus)} />
                                        )}
                                        <div className="mb-1 text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.question)} />
                                        
                                        {(item.type === 'Pilihan Ganda') && item.options && (
                                            <div className="grid grid-cols-1 gap-y-1 text-inherit mt-1 ml-4 text-xs">
                                                {(item.options as any[]).map((opt, i) => (
                                                    <div key={i} className="flex gap-2 text-inherit">
                                                        <span className="font-bold min-w-[20px] text-inherit">{String.fromCharCode(65 + i)}.</span>
                                                        <span className="text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(opt)} />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {/* Other types logic preserved */}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            <div className="mt-8 pt-6 border-t-2 border-black break-inside-avoid">
                <h3 className="text-lg font-bold text-center mb-4 uppercase text-[14pt]">KUNCI JAWABAN</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                    {Object.entries(groupedItems).map(([type, items], groupIndex) => (
                        <div key={type} className="text-xs">
                            <h4 className="font-bold text-inherit mb-1 border-b border-black pb-1">
                                {String.fromCharCode(65 + groupIndex)}. {type.toUpperCase()}
                            </h4>
                            <ol className="list-decimal pl-6 space-y-1 text-inherit">
                                {(items as any[]).map((item, idx) => (
                                    <li key={idx}>
                                        <span className="text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(item.answerKey)} />
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ))}
                </div>
            </div>
          </div>
      );
  };

  return (
    <div id="konten-dokumen">
        <style>{`
            #konten-dokumen, 
            #konten-dokumen p, 
            #konten-dokumen li, 
            #konten-dokumen td, 
            #konten-dokumen th, 
            #konten-dokumen span, 
            #konten-dokumen div {
                font-size: 11pt !important;
                line-height: 1.4 !important;
                font-family: 'Cambria', Georgia, serif !important;
                color: #000000 !important;
                box-shadow: none !important;
            }
            
            #konten-dokumen p {
                margin-bottom: 4pt !important;
                text-align: justify;
            }

            #konten-dokumen li {
                margin-bottom: 2pt !important;
                text-align: justify;
                padding-left: 4px;
            }
            
            #konten-dokumen h1 { font-size: 20pt !important; line-height: 1.2 !important; font-weight: bold !important; text-align: center; margin-bottom: 8pt; margin-top: 0; }
            #konten-dokumen h2 { font-size: 14pt !important; line-height: 1.2 !important; font-weight: bold !important; text-align: center; margin-bottom: 10pt; margin-top: 0pt; text-transform: uppercase; }
            
            #konten-dokumen h3 { 
                font-size: 13pt !important; 
                line-height: 1.2 !important; 
                font-weight: bold !important; 
                text-transform: uppercase; 
                margin-bottom: 6pt; 
                margin-top: 12pt; 
                border-bottom: 2px solid #87CEFA; 
                display: block; 
                text-align: left !important;
                page-break-after: avoid !important; 
            }
            
            .assessment-reset h3, .lkpd-reset h3 { border-bottom: none !important; }

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
            
            #konten-dokumen table p, #konten-dokumen table li {
                margin-bottom: 0px !important;
                text-align: left !important;
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
