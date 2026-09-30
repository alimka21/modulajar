
import React from 'react';
import { GeneratedLessonPlan, DeepLearningAssessment } from '../../types';
import { renderMarkdown, renderInlineMarkdown, safeString } from './utils';
import { OpenSection, RubricTable } from './SharedComponents';

interface AssessmentContentProps {
    data: GeneratedLessonPlan;
    isMathSubject: boolean;
    onGenerateAssessment?: () => void;
    isGeneratingAssessment?: boolean;
}

const AssessmentContent: React.FC<AssessmentContentProps> = ({ 
    data, 
    isMathSubject,
    onGenerateAssessment,
    isGeneratingAssessment
}) => {
    if (!data?.assessment) {
        return (
            <div className="text-inherit py-10 px-6 my-6 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/80 text-center font-sans">
                <div className="w-12 h-12 mx-auto mb-3 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center font-bold text-xl">
                    📊
                </div>
                <h3 className="text-base font-bold text-slate-800 mb-1">Instrumen Asesmen Belum Disusun</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mb-4 leading-relaxed">
                    Rubrik Ketercapaian Tujuan Pembelajaran (KKTP), Lembar Observasi Formatif, Panduan Umpan Balik, Kisi-kisi Sumatif, dan Rencana Intervensi dapat disusun secara otomatis.
                </p>
                {onGenerateAssessment && (
                    <button
                        onClick={onGenerateAssessment}
                        disabled={isGeneratingAssessment}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50"
                    >
                        {isGeneratingAssessment ? "Sedang Menyusun Asesmen..." : "✨ Susun Instrumen Asesmen"}
                    </button>
                )}
            </div>
        );
    }
    
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

export default AssessmentContent;
