// ============================================================================
// PATCH: LkpdContent.tsx (FULL REPLACEMENT)
// Ganti seluruh isi file ini.
// Perubahan utama:
// 1. renderActivity lebih robust — handle tabel, numbered list, dan teks biasa
// 2. Normalisasi "objectives" string sebelum ditampilkan
// 3. Tambah guard null check yang lebih ketat
// ============================================================================

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

    // ▼ Helper: Ambil content string dari activity (apapun bentuk datanya)
    const extractContent = (activity: any): string => {
        if (!activity) return "";
        if (typeof activity === 'string') return activity;
        if (typeof activity === 'object') return activity.content || "";
        return String(activity);
    };

    // ▼ Render Aktivitas: deteksi tabel → render tabel, atau render markdown biasa
    const renderActivity = (activity: any) => {
        const content = extractContent(activity).trim();
        if (!content) return null;

        // 1. Coba parse sebagai tabel markdown
        const parsedTable = parseMarkdownTable(content);
        if (parsedTable) {
            return <TableRenderer table={parsedTable} isMathSubject={isMathSubject} />;
        }

        // 2. Render sebagai markdown biasa (handle bold, list, numbering, dll)
        return (
            <div
                className="text-inherit force-table-styles prose-lkpd"
                dangerouslySetInnerHTML={renderMarkdown(content, isMathSubject)}
            />
        );
    };

    // ▼ Render objectives: bisa berupa string multi-baris dengan bullet
    const renderObjectives = (objectives: string) => {
        if (!objectives) return null;
        // Split per baris, filter kosong, render sebagai list
        const lines = objectives
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (lines.length === 1) {
            // Satu baris: render langsung
            return (
                <div
                    className="text-inherit"
                    dangerouslySetInnerHTML={renderMarkdown(objectives, isMathSubject)}
                />
            );
        }

        // Multi baris: render sebagai list
        return (
            <ul className="list-disc pl-6 text-inherit">
                {lines.map((line, i) => {
                    // Bersihkan bullet character yang sudah ada
                    const clean = line.replace(/^[•\-\*]\s*/, '').replace(/^\d+\.\s*/, '');
                    return (
                        <li
                            key={i}
                            dangerouslySetInnerHTML={renderMarkdown(clean, isMathSubject)}
                        />
                    );
                })}
            </ul>
        );
    };

    return (
        <div className="text-inherit">
            <h1 className="text-inherit font-bold text-center mb-6 mt-12 page-break-before">
                LEMBAR KERJA
            </h1>
            <h2 className="text-inherit text-center mb-6 uppercase">{l.title}</h2>

            <OpenSection title="Identitas">
                <p className="text-inherit">Nama: ...........................................................</p>
                <p className="text-inherit">Kelas: ...........................................................</p>
            </OpenSection>

            <OpenSection title="Tujuan Pembelajaran">
                {renderObjectives(l.objectives)}
            </OpenSection>

            <OpenSection title="Petunjuk Pengerjaan">
                <ol className="list-decimal pl-5 text-inherit" style={{ listStylePosition: 'outside', marginLeft: '1rem' }}>
                    {(l.instructions || []).map((ins, i) => (
                        <li
                            key={i}
                            className="pl-2 mb-1"
                            dangerouslySetInnerHTML={renderMarkdown(ins, isMathSubject)}
                        />
                    ))}
                </ol>
            </OpenSection>

            <OpenSection title="Stimulus">
                <div
                    className="text-inherit italic leading-relaxed"
                    dangerouslySetInnerHTML={renderMarkdown(l.stimulus, isMathSubject)}
                />
            </OpenSection>

            {/* ▼ Aktivitas 1 */}
            <OpenSection title={l.activities?.activity1?.title || "Aktivitas 1: Pemahaman Konsep"}>
                {renderActivity(l.activities?.activity1)}
            </OpenSection>

            {/* ▼ Aktivitas 2 */}
            <OpenSection title={l.activities?.activity2?.title || "Aktivitas 2: Aplikasi & Diskusi"}>
                {renderActivity(l.activities?.activity2)}
            </OpenSection>

            <OpenSection title="Refleksi Diri">
                <ul className="list-disc pl-6 text-inherit">
                    {(l.reflection || []).map((r, i) => (
                        <li
                            key={i}
                            dangerouslySetInnerHTML={renderMarkdown(r, isMathSubject)}
                        />
                    ))}
                </ul>
            </OpenSection>
        </div>
    );
};

export default LkpdContent;