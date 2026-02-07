
import React from 'react';
import { GeneratedLessonPlan } from '../../types';
import { renderMarkdown, safeString } from './utils';
import { OpenSection } from './SharedComponents';

interface RppContentProps {
    data: GeneratedLessonPlan;
    isMathSubject: boolean;
}

const RppContent: React.FC<RppContentProps> = ({ data, isMathSubject }) => {
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

export default RppContent;
