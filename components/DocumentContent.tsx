
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
  <div className={`mb-6 break-inside-avoid text-black ${className}`}>
      <h3 className="text-inherit font-bold text-[14pt] uppercase mb-2 mt-4">
          {title}
      </h3>
      <div className={`${contentAlign} text-black text-inherit`}>
          {children}
      </div>
  </div>
);

const RubricTable = ({ items }: { items: any[] }) => (
  <div className="mb-8 break-inside-avoid">
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
        <div className="break-inside-avoid text-inherit">
            <h1 className="text-inherit font-bold text-[24pt] text-center mb-6">MODUL AJAR</h1>
            <h2 className="text-inherit text-[14pt] text-center mb-8 uppercase">TOPIK: {identitySection.topic}</h2>

            <OpenSection title="I. IDENTITAS UMUM">
                <table className="w-full border-collapse border border-white mb-6 text-inherit identity-table">
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

                <h4 className="font-bold mb-2 text-inherit text-[13pt]">Asesmen Awal (Opsional)</h4>
                <div className="mb-4 text-inherit" dangerouslySetInnerHTML={renderMarkdown(initialAssessment || "Belum ada data.")} />

                <h4 className="font-bold mb-2 text-inherit text-[13pt]">Dimensi Profil Lulusan</h4>
                <ul className="list-disc pl-6 mb-4 text-inherit">
                    {(graduateProfile || []).map((g, i) => <li key={i} className="text-inherit">{g}</li>)}
                </ul>
            </OpenSection>

            <OpenSection title="II. KOMPONEN INTI">
                <h4 className="font-bold mb-2 text-inherit text-[13pt]">1. Tujuan Pembelajaran</h4>
                <ul className="list-disc pl-6 mb-4 text-inherit">
                    {(design.objectives || []).map((o, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(o)} />)}
                </ul>

                <h4 className="font-bold mb-2 text-inherit text-[13pt]">2. Praktik Pedagogis</h4>
                <div className="mb-4 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.pedagogicalPractice)} />

                {design.partnership && (
                    <>
                        <h4 className="font-bold mb-2 text-inherit text-[13pt]">3. Kemitraan (Opsional)</h4>
                        <div className="mb-4 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.partnership)} />
                    </>
                )}

                <h4 className="font-bold mb-2 text-inherit text-[13pt]">{design.partnership ? '4.' : '3.'} Lingkungan Belajar</h4>
                <div className="mb-4 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.environment)} />

                {design.digital && (
                    <>
                        <h4 className="font-bold mb-2 text-inherit text-[13pt]">{design.partnership ? '5.' : '4.'} Pemanfaatan Digital (Opsional)</h4>
                        <div className="mb-4 text-inherit" dangerouslySetInnerHTML={renderMarkdown(design.digital)} />
                    </>
                )}
            </OpenSection>

            {/* SPACER ONLY, NO PAGE BREAK */}
            <div className="h-8"></div>

            <OpenSection title="III. LANGKAH PEMBELAJARAN">
                {learningExperience.map((step, idx) => (
                    <div key={idx} className="mb-8 break-inside-avoid text-inherit">
                        <div className="bg-[#87CEFA] p-2 text-center font-bold mb-4 text-inherit rounded-sm">
                            PERTEMUAN {step.meetingNo}
                        </div>

                        <div className="mb-4">
                            <h4 className="font-bold text-inherit text-[13pt]">A. Pendahuluan</h4>
                            <p className="italic text-sm text-slate-600 mb-2 text-inherit">Prinsip: {step.introPrinciple}</p>
                            <ul className="list-disc pl-6 text-inherit">
                                {step.intro.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                            </ul>
                        </div>

                        <div className="mb-4">
                            <h4 className="font-bold text-inherit text-[13pt]">B. Kegiatan Inti</h4>
                            <p className="italic text-sm text-slate-600 mb-2 text-inherit">Prinsip: {step.corePrinciple}</p>
                            
                            <p className="font-bold mt-2 mb-1 text-inherit">1. Memahami</p>
                            <ul className="list-disc pl-6 mb-2 text-inherit">
                                {step.core.memahami.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                            </ul>
                            
                            <p className="font-bold mt-2 mb-1 text-inherit">2. Mengaplikasi</p>
                            <ul className="list-disc pl-6 mb-2 text-inherit">
                                {step.core.mengaplikasi.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                            </ul>

                            <p className="font-bold mt-2 mb-1 text-inherit">3. Merefleksi</p>
                            <ul className="list-disc pl-6 mb-2 text-inherit">
                                {step.core.merefleksi.map((item, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(item)} />)}
                            </ul>
                        </div>

                        <div className="mb-4">
                            <h4 className="font-bold text-inherit text-[13pt]">C. Penutup</h4>
                            <p className="italic text-sm text-slate-600 mb-2 text-inherit">Prinsip: {step.closingPrinciple}</p>
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
          <div className="break-inside-avoid text-inherit assessment-reset">
            {/* NO PAGE BREAK */}
            <div className="h-8"></div>
            
            <h1 className="text-inherit font-bold text-[24pt] text-center mb-6">ASESMEN PEMBELAJARAN</h1>
            <h2 className="text-inherit text-[14pt] text-center mb-8 uppercase">TOPIK: {inputData.topic}</h2>
            
            <OpenSection title="1. KKTP (Rubrik Pembelajaran Mendalam)">
                 <p className="italic mb-4 text-inherit text-slate-600">Menggunakan Taksonomi Bloom (Revisi Anderson & Krathwohl)</p>
                 <RubricTable items={kktp} />
            </OpenSection>

            {/* SPACER ONLY */}
            <div className="h-8"></div>

            <OpenSection title="2. Asesmen Formatif (Proses)">
                <div className="mb-8">
                    <h4 className="font-bold mb-4 text-inherit text-[13pt]">A. Lembar Observasi (Checklist)</h4>
                    <table className="w-full border-collapse border border-black text-black text-inherit">
                        <thead>
                            <tr className="bg-[#87CEFA]">
                                <th className="border border-black p-2 text-center w-12 font-bold text-center text-inherit">No</th>
                                <th className="border border-black p-2 text-left font-bold text-center text-inherit">Aspek Pengamatan</th>
                                <th className="border border-black p-2 text-left font-bold text-center text-inherit">Indikator Perilaku</th>
                                <th className="border border-black p-2 text-center w-28 font-bold text-center text-inherit">Ceklis</th>
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

                <div className="mb-8">
                    <h4 className="font-bold mb-4 text-inherit text-[13pt]">B. Tangga Umpan Balik (Feedback Ladder)</h4>
                    <div className="border border-black p-6 text-inherit rounded-sm">
                        <div className="mb-4">
                            <span className="font-bold text-inherit block mb-1">KLARIFIKASI: </span>
                            <span className="italic text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(`"${safeString(formative.feedbackGuide.clarification)}"`)} />
                        </div>
                        <div className="mb-4">
                            <span className="font-bold text-inherit block mb-1">APRESIASI: </span>
                            <span className="italic text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(`"${safeString(formative.feedbackGuide.appreciation)}"`)} />
                        </div>
                        <div>
                            <span className="font-bold text-inherit block mb-1">SARAN: </span>
                            <span className="italic text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(`"${safeString(formative.feedbackGuide.suggestion)}"`)} />
                        </div>
                    </div>
                </div>
            </OpenSection>
            
            <OpenSection title="3. Asesmen Sumatif (Kisi-Kisi)">
                 <div className="mb-6">
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
                                    <td colSpan={4} className="border border-black p-6 text-center italic text-inherit">
                                        Data kisi-kisi belum tersedia.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                     </table>
                 </div>
            </OpenSection>

            {/* SPACER ONLY */}
            <div className="h-8"></div>

            <OpenSection title="4. Tindak Lanjut & Intervensi Guru">
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
            </OpenSection>
          </div>
      );
  };

  const ApprovalSignature = () => {
    const { approval } = data;
    return (
        <div className="break-inside-avoid text-inherit mt-8">
            <table className="w-full border-none text-inherit">
                <tbody>
                    <tr>
                        <td className="w-1/2 text-center align-top border-none p-4 text-inherit">
                            <p className="mb-0 text-inherit">Mengetahui,</p>
                            <p className="mb-0 text-inherit">Kepala Sekolah</p>
                            <div className="h-24"></div> 
                            <p className="font-bold underline text-inherit">{approval.principalName}</p>
                            <p className="text-inherit">NIP. {approval.principalNip}</p>
                        </td>
                        <td className="w-1/2 text-center align-top border-none p-4 text-inherit">
                            <p className="mb-0 text-inherit">{approval.location}, {approval.date}</p>
                            <p className="mb-0 text-inherit">Guru Mata Pelajaran</p>
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

  const ReflectionContent = () => {
    if (!data.reflection) return null;
    const { teacher, student } = data.reflection;
    return (
        <div className="break-inside-avoid text-inherit">
             {/* NO PAGE BREAK */}
             <div className="h-8"></div>
             <h1 className="text-inherit font-bold text-[24pt] text-center mb-6">REFLEKSI PEMBELAJARAN</h1>
             
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
        <div className="break-inside-avoid text-inherit">
            <h1 className="text-inherit font-bold text-[24pt] text-center mb-6">MATERI AJAR</h1>
            <h2 className="text-inherit text-[14pt] text-center mb-8 uppercase">{m.judul}</h2>

            <div className="mb-6 text-inherit">
                <h3 className="font-bold text-inherit mb-2 text-[14pt] border-b-2 border-[#87CEFA] text-left uppercase mt-4">PEMANTIK BELAJAR</h3>
                <p className="italic text-lg text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(m.pemantik)} />
            </div>

            <OpenSection title="SUB TOPIK">
                <ul className="list-disc pl-6 text-inherit">
                    {m.subTopik.map((t, i) => <li key={i} className="text-inherit">{t}</li>)}
                </ul>
            </OpenSection>

            <OpenSection title="KONSEP INTI">
                 <div className="mb-6 text-inherit">
                    <h4 className="font-bold mb-2 text-inherit text-[13pt]">Definisi</h4>
                    <div dangerouslySetInnerHTML={renderMarkdown(m.konsepInti.definisi)} />
                 </div>

                 <h4 className="font-bold mb-2 text-inherit text-[13pt]">Penjelasan Materi</h4>
                 <div className="mb-6 pl-4 text-inherit">
                     <ul className="list-disc pl-6 space-y-2 text-inherit">
                        {m.konsepInti.penjelasanBertahap.map((p, i) => (
                             <li key={i} dangerouslySetInnerHTML={renderMarkdown(p)} />
                        ))}
                     </ul>
                 </div>

                 <h4 className="font-bold mb-2 text-inherit text-[13pt]">Visualisasi / Tabel</h4>
                 <div className="mb-6 overflow-x-auto markdown-content text-inherit" dangerouslySetInnerHTML={renderMarkdown(m.konsepInti.tabelVisual)} />

                 <div className="mb-6 text-inherit">
                    <h3 className="text-inherit font-bold text-[14pt] uppercase mb-2 mt-6 border-b-2 border-[#87CEFA] text-left">CONTOH NYATA</h3>
                    <div className="italic text-inherit" dangerouslySetInnerHTML={renderMarkdown(m.konsepInti.contohKonkret)} />
                 </div>
            </OpenSection>

            <div className="mt-4 text-inherit">
                <div className="mb-8">
                    <h3 className="font-bold border-b-2 border-[#87CEFA] pb-2 mb-4 text-inherit text-[14pt] uppercase">TAHUKAH KAMU?</h3>
                    <div className="text-sm text-inherit" dangerouslySetInnerHTML={renderMarkdown(m.trivia)} />
                </div>
                
                <div>
                    <h3 className="font-bold border-b-2 border-[#87CEFA] pb-2 mb-4 text-inherit text-[14pt] uppercase">GLOSARIUM</h3>
                    <ul className="text-sm space-y-2 text-inherit">
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
    
    // Header logic copied for DocumentContent
    const rawTitle = data.lkpd.title || inputData.topic;
    const cleanTitle = rawTitle.replace(/^(Lembar Kerja Peserta Didik|LKPD|Lembar Kerja Murid)(\s*\(LKPD\))?(\s*:\s*|\s+-\s+|\s+)/i, "").trim();

    return (
        <div className="break-inside-avoid lkpd-reset text-inherit">
            <div className="mb-8 bg-white text-black text-inherit">
              <div className="text-center mb-6">
                <h1 className="text-inherit" style={{ fontSize: '24pt', fontWeight: 'bold', lineHeight: '1.2' }}>
                    LEMBAR KERJA MURID
                </h1>
                <h2 className="text-inherit" style={{ fontSize: '14pt', fontWeight: 'normal', lineHeight: '1.2' }}>
                    {cleanTitle}
                </h2>
              </div>
              <div className="w-full my-6" style={{ borderBottom: '2px solid black' }}></div>
              <div className="flex flex-col gap-4" style={{ fontSize: '12pt' }}>
                <div className="space-y-1">
                   <div className="flex"><span className="font-bold min-w-[180px]">Mata Pelajaran</span><span>: {inputData.subject}</span></div>
                   <div className="flex"><span className="font-bold min-w-[180px]">Kelas / Fase</span><span>: {inputData.grade}</span></div>
                   <div className="flex"><span className="font-bold min-w-[180px]">Jumlah Pertemuan</span><span>: {inputData.meetingCount}</span></div>
                </div>
                <div>
                     <div className="font-bold mb-2">Identitas Kelompok</div>
                     <div className="space-y-1">
                         <div className="flex items-end gap-2"><span className="min-w-[170px]">Nama Kelompok</span><div className="flex-1 border-b border-black border-dashed">:</div></div>
                         <div className="flex items-start gap-2">
                            <span className="min-w-[170px]">Anggota Kelompok</span>
                            <div className="flex-1">
                                <div className="mb-2 border-b border-black border-dashed">: 1. </div>
                                <div className="mb-2 ml-2 border-b border-black border-dashed"> 2. </div>
                                <div className="mb-2 ml-2 border-b border-black border-dashed"> 3. </div>
                                <div className="mb-2 ml-2 border-b border-black border-dashed"> 4. </div>
                            </div>
                         </div>
                     </div>
                </div>
              </div>
            </div>
            
            <OpenSection title="A. TUJUAN PEMBELAJARAN">
                 <div className="markdown-content text-inherit" dangerouslySetInnerHTML={renderMarkdown(data.lkpd.objectives)} />
            </OpenSection>

            <OpenSection title="B. PETUNJUK PENGERJAAN">
                 <ol className="list-decimal pl-6 space-y-2 text-inherit">
                     {data.lkpd.instructions && data.lkpd.instructions.length > 0 
                        ? (data.lkpd.instructions as string[]).map((g,i) => <li key={i} dangerouslySetInnerHTML={renderInlineMarkdown(g)} />)
                        : <li>Bacalah instruksi dengan seksama.</li>
                     }
                 </ol>
            </OpenSection>

            <div className="mb-6 break-inside-avoid text-inherit">
                <h3 className="text-inherit font-bold text-[14pt] uppercase mb-3">C. STIMULUS</h3>
                <div className="italic text-inherit mt-2">
                    <div dangerouslySetInnerHTML={renderMarkdown(data.lkpd.stimulus)} />
                </div>
            </div>

            <div className="page-break h-2"></div>

            <h3 className="text-inherit mb-4 font-bold text-[14pt] uppercase mt-6">D. AKTIVITAS BERTAHAP</h3>

            <div className="mb-6 break-inside-avoid text-inherit">
                <div className="font-bold text-inherit mb-2 border-b border-black inline-block">
                    AKTIVITAS 1
                </div>
                <div 
                    className="markdown-content text-inherit whitespace-pre-wrap leading-relaxed" 
                    dangerouslySetInnerHTML={renderMarkdown(data.lkpd.activities.level1)} 
                />
            </div>

            <div className="mb-6 break-inside-avoid text-inherit">
                <div className="font-bold text-inherit mb-2 border-b border-black inline-block">
                    AKTIVITAS 2
                </div>
                <div 
                    className="markdown-content text-inherit whitespace-pre-wrap leading-relaxed" 
                    dangerouslySetInnerHTML={renderMarkdown(data.lkpd.activities.level2)} 
                />
            </div>

            <div className="mb-6 break-inside-avoid text-inherit">
                <div className="font-bold text-inherit mb-2 border-b border-black inline-block">
                    AKTIVITAS 3
                </div>
                <div 
                    className="markdown-content text-inherit whitespace-pre-wrap leading-relaxed" 
                    dangerouslySetInnerHTML={renderMarkdown(data.lkpd.activities.level3)} 
                />
            </div>

            <OpenSection title="E. REFLEKSI DIRI">
                <ol className="list-decimal pl-6 space-y-6 text-inherit">
                    {data.lkpd.reflection.map((t, i) => (
                        <li key={i}>
                            <div className="mb-3 font-medium" dangerouslySetInnerHTML={renderInlineMarkdown(t)} />
                            <div className="border-b border-black border-dashed h-8 w-full opacity-30"></div>
                            <div className="border-b border-black border-dashed h-8 w-full opacity-30"></div>
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
          <div className="break-inside-avoid text-inherit">
            <h1 className="text-inherit font-bold text-[24pt] text-center mb-6">BANK SOAL & EVALUASI</h1>
            <h2 className="text-inherit text-[14pt] text-center mb-8 uppercase">TOPIK: {data.identitySection.topic}</h2>
            
            {Object.entries(groupedItems).map(([type, items], groupIndex) => (
                <div key={type} className="mb-10">
                    <h3 className="text-inherit border-b border-black pb-2 mb-6 font-bold text-[14pt]">
                        {String.fromCharCode(65 + groupIndex)}. {type.toUpperCase()}
                    </h3>
                    
                    <div className="space-y-8">
                        {(items as any[]).map((item, idx) => (
                            <div key={idx} className="break-inside-avoid-page">
                                <div className="flex gap-4">
                                    <span className="font-bold text-inherit">{idx + 1}.</span>
                                    <div className="flex-1 text-inherit">
                                        {item.stimulus && (
                                            <div className="mb-3 italic text-gray-700 text-inherit bg-slate-50 p-4 border-l-4 border-slate-300" dangerouslySetInnerHTML={renderMarkdown(item.stimulus)} />
                                        )}
                                        <div className="mb-1 whitespace-pre-wrap text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.question)} />
                                        
                                        {(item.type === 'Pilihan Ganda') && item.options && (
                                            <div className="grid grid-cols-1 gap-y-2 text-inherit mt-1 ml-4">
                                                {(item.options as any[]).map((opt, i) => (
                                                    <div key={i} className="flex gap-2 text-inherit">
                                                        <span className="font-bold min-w-[24px] text-inherit">{String.fromCharCode(65 + i)}.</span>
                                                        <span className="text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(opt)} />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {(item.type === 'Pilihan Ganda Kompleks') && item.options && (
                                            <div className="grid grid-cols-1 gap-y-2 text-inherit mt-1 ml-4">
                                                {(item.options as any[]).map((opt, i) => (
                                                    <div key={i} className="flex gap-2 text-inherit items-center">
                                                        <div className="w-5 h-5 border border-black mr-2 bg-white"></div>
                                                        <span className="text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(opt)} />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {(item.type === 'Menjodohkan') && item.matchingPairs && Array.isArray(item.matchingPairs) && (
                                            <div className="mt-4 ml-4">
                                                <table className="w-full border-collapse border border-black">
                                                    <thead>
                                                        <tr className="bg-slate-100">
                                                            <th className="border border-black p-2">Premis</th>
                                                            <th className="border border-black p-2">Pilihan Jawaban</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(item.matchingPairs as any[]).map((pair: any, i: number) => (
                                                            <tr key={i}>
                                                                <td className="border border-black p-2">{pair.left}</td>
                                                                <td className="border border-black p-2">{pair.right}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        {(item.type === 'Benar/Salah') && (
                                            <div className="flex gap-6 mt-3 ml-4 font-bold">
                                                <div className="border border-black px-6 py-2">BENAR</div>
                                                <div className="border border-black px-6 py-2">SALAH</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            <div className="mt-16 pt-10 border-t-2 border-black page-break">
                <h3 className="text-lg font-bold text-center mb-8 uppercase text-[14pt]">KUNCI JAWABAN</h3>
                
                <div className="flex flex-col gap-10">
                    {Object.entries(groupedItems).map(([type, items], groupIndex) => (
                        <div key={type}>
                            <h4 className="font-bold text-inherit mb-4 border-b border-black pb-2 text-[13pt]">
                                {String.fromCharCode(65 + groupIndex)}. {type.toUpperCase()}
                            </h4>
                            <ol className="list-decimal pl-6 space-y-3 text-inherit">
                                {(items as any[]).map((item, idx) => (
                                    <li key={idx}>
                                        <span className="text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.answerKey)} />
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
            /* Force Font Uniformity to Cambria */
            #konten-dokumen, 
            #konten-dokumen p, 
            #konten-dokumen li, 
            #konten-dokumen td, 
            #konten-dokumen th, 
            #konten-dokumen span, 
            #konten-dokumen div {
                font-size: 12pt !important;
                line-height: 1.5 !important;
                font-family: 'Cambria', Georgia, serif !important;
                color: #000000 !important;
            }
            
            #konten-dokumen p {
                margin-bottom: 8pt !important;
                text-align: justify;
            }

            #konten-dokumen li {
                margin-bottom: 0px !important;
                text-align: justify;
                padding-left: 8px;
            }
            
            /* Header exceptions */
            #konten-dokumen h1 { font-size: 24pt !important; line-height: 1.2 !important; font-weight: bold !important; text-align: center; margin-bottom: 0pt; margin-top: 0; }
            #konten-dokumen h2 { font-size: 14pt !important; line-height: 1.2 !important; font-weight: bold !important; text-align: center; margin-bottom: 12pt; margin-top: 0pt; text-transform: uppercase; }
            
            /* H3 Default: Blue Underline */
            #konten-dokumen h3 { 
                font-size: 14pt !important; 
                line-height: 1.2 !important; 
                font-weight: bold !important; 
                text-transform: uppercase; 
                margin-bottom: 8pt; 
                margin-top: 18pt; 
                border-bottom: 2px solid #87CEFA; 
                display: block; 
                text-align: left !important;
                page-break-after: avoid !important; 
            }
            
            /* Assessment H3 Override */
            .assessment-reset h3 { border-bottom: none !important; }

            #konten-dokumen h4 { font-size: 13pt !important; text-transform: uppercase; font-weight: bold !important; margin-bottom: 6pt; margin-top: 12pt; page-break-after: avoid !important; }

            /* LKPD Headers Specifics */
            .lkpd-reset h1 {
                font-size: 24pt !important;
                font-weight: bold !important;
                margin-bottom: 12pt;
                text-align: center !important;
            }
            .lkpd-reset h2 {
                font-size: 14pt !important;
                font-weight: normal !important;
                text-transform: uppercase;
                text-align: center !important;
                margin-bottom: 24pt;
            }
            
            /* Update Table Styles for Markdown Content */
            .markdown-content table {
                width: 100% !important;
                border-collapse: collapse !important;
                border: 1px solid #000 !important;
                margin: 12pt 0;
            }
            .markdown-content th {
                background-color: #87CEFA !important;
                font-weight: bold !important;
                border: 1px solid #000 !important;
                padding: 6pt 8pt;
                text-align: center !important;
                font-size: 11pt !important;
            }
            .markdown-content td {
                border: 1px solid #000 !important;
                padding: 6pt 8pt;
                text-align: left;
                vertical-align: top;
                font-size: 11pt !important;
            }
            
            /* Override paragraph spacing inside tables to be tighter */
            #konten-dokumen table p, #konten-dokumen table li {
                margin-bottom: 0px !important;
                text-align: left !important;
                font-size: 11pt !important;
            }

            /* Identity Table Specifics */
            .identity-table td { border-color: white !important; padding: 2pt 4pt !important; }
            .identity-table { border-color: white !important; margin-bottom: 0 !important; }

            /* Print Specific Overrides to ensure text color is solid black */
            @media print {
                .text-slate-600 {
                    color: #000000 !important;
                }
            }
        `}</style>

        {(activeTab === 'RPP_PLUS' || activeTab === 'SEMUA') && (
            <>
                <RppContent />
                
                {/* SPACER ONLY */}
                <div className="h-8 border-t border-dashed border-slate-300 my-8"></div>
                
                <AssessmentContent />
                
                {/* SPACER ONLY */}
                <div className="h-8 border-t border-dashed border-slate-300 my-8"></div>
                
                <ReflectionContent />
                
                {/* SPACER ONLY */}
                <div className="h-8"></div>
                
                <ApprovalSignature />
            </>
        )}
        
        {(activeTab === 'MATERI' || activeTab === 'SEMUA') && (
            <>
                {activeTab === 'SEMUA' && data.materials && <div className="h-8 border-t border-dashed border-slate-300 my-8 print:break-before-page page-break"></div>}
                <MaterialsContent />
            </>
        )}
        
        {(activeTab === 'LKPD' || activeTab === 'SEMUA') && (
            <>
                {activeTab === 'SEMUA' && data.lkpd && <div className="h-8 border-t border-dashed border-slate-300 my-8 print:break-before-page page-break"></div>}
                <LkpdContent />
            </>
        )}

            {(activeTab === 'SOAL' || activeTab === 'SEMUA') && (
            <>
                {activeTab === 'SEMUA' && data.questionBank && <div className="h-8 border-t border-dashed border-slate-300 my-8 print:break-before-page page-break"></div>}
                <QuestionBankContent />
            </>
        )}
    </div>
  );
};

export default DocumentContent;
