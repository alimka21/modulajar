
import React from 'react';
import { GeneratedLessonPlan } from '../../types';
import { renderMarkdown, parseMarkdownTable } from './utils';
import { OpenSection, TableRenderer } from './SharedComponents';

interface LkpdContentProps {
    data: GeneratedLessonPlan;
    isMathSubject: boolean;
}

const LkpdContent: React.FC<LkpdContentProps> = ({ data, isMathSubject }) => {
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

export default LkpdContent;
