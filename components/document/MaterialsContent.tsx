// ============================================================================
// PATCH: MaterialsContent.tsx (FULL REPLACEMENT)
// Perubahan dari versi lama:
// 1. tabelVisual: karena schema sekarang paksa STRING, logic disederhanakan
//    (tidak perlu cek objek lagi — tapi tetap ada fallback untuk data lama)
// 2. trivia: ganti dari renderMarkdown (block) ke renderInlineMarkdown agar
//    tidak ada margin berlebih untuk teks pendek
// 3. contohKonkret: tambah null guard
// 4. pemantik: ganti dari <p> biasa ke renderMarkdown agar bold/italic tertangani
// ============================================================================

import React from 'react';
import { GeneratedLessonPlan } from '../../types';
import { renderMarkdown, renderInlineMarkdown, parseMarkdownTable } from './utils';
import { TableRenderer } from './SharedComponents';

interface MaterialsContentProps {
    data: GeneratedLessonPlan;
    isMathSubject: boolean;
}

const MaterialsContent: React.FC<MaterialsContentProps> = ({ data, isMathSubject }) => {
    if (!data.materials) return null;
    const m = data.materials;

    // ▼ Render tabelVisual — schema baru selalu string, tapi tetap handle data lama (objek)
    const renderTabelVisual = () => {
        const tv = m.konsepInti?.tabelVisual;
        if (!tv) return null;

        // Kasus 1: Data lama — objek { headers, rows }
        if (typeof tv === 'object' && !Array.isArray(tv)) {
            return <TableRenderer table={tv as any} isMathSubject={isMathSubject} />;
        }

        // Kasus 2: String (output baru dari schema yang diperbaiki)
        const rawText = String(tv).trim();
        if (!rawText) return null;

        // Coba parse sebagai markdown table
        const parsedTable = parseMarkdownTable(rawText);
        if (parsedTable) {
            return <TableRenderer table={parsedTable} isMathSubject={isMathSubject} />;
        }

        // Fallback: render sebagai teks biasa
        return (
            <div
                className="mb-2 pl-4 text-inherit force-table-styles"
                dangerouslySetInnerHTML={renderMarkdown(rawText, isMathSubject)}
            />
        );
    };

    return (
        <div className="text-inherit">
            <h1 className="text-inherit font-bold text-center mb-6 mt-12 page-break-before">
                LAMPIRAN 1: MATERI AJAR
            </h1>
            <h2 className="text-inherit text-center mb-6 uppercase">{m.judul}</h2>

            {/* PEMANTIK */}
            <div className="mb-4 text-inherit">
                <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">Pemantik</h3>
                {/* Ganti dari <p dangerouslySetInnerHTML> ke div agar block markdown (bold, list) tertangani */}
                <div
                    className="italic text-inherit"
                    dangerouslySetInnerHTML={renderMarkdown(m.pemantik, isMathSubject)}
                />
            </div>

            {/* SUB TOPIK */}
            <div className="mb-4 text-inherit">
                <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">Sub Topik</h3>
                <ul className="list-disc pl-6 text-inherit">
                    {(m.subTopik || []).map((s, i) => (
                        <li key={i} dangerouslySetInnerHTML={renderMarkdown(s, isMathSubject)} />
                    ))}
                </ul>
            </div>

            {/* KONSEP INTI */}
            <div className="mb-4 text-inherit">
                <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">Konsep Inti</h3>

                {/* Definisi */}
                <div className="mb-2 text-inherit">
                    <strong className="text-inherit">Definisi: </strong>
                    <span dangerouslySetInnerHTML={renderInlineMarkdown(m.konsepInti.definisi, isMathSubject)} />
                </div>

                {/* Uraian Materi */}
                <div className="mb-2 text-inherit">
                    <strong className="text-inherit">Uraian Materi:</strong>
                    <ul className="list-disc pl-6 mt-1 text-inherit">
                        {(m.konsepInti?.penjelasanBertahap || []).map((p, i) => (
                            <li key={i} dangerouslySetInnerHTML={renderMarkdown(p, isMathSubject)} />
                        ))}
                    </ul>
                </div>

                {/* Contoh Konkret — sebelumnya tidak ada di versi lama */}
                {m.konsepInti?.contohKonkret && (
                    <div className="mb-2 text-inherit">
                        <strong className="text-inherit">Contoh Konkret:</strong>
                        <div
                            className="mt-1 pl-4 text-inherit"
                            dangerouslySetInnerHTML={renderMarkdown(m.konsepInti.contohKonkret, isMathSubject)}
                        />
                    </div>
                )}

                {/* Tabel Visual */}
                <div className="mb-2 text-inherit">
                    <strong className="text-inherit">Visualisasi / Rangkuman Data:</strong>
                    <div className="mt-1">
                        {renderTabelVisual()}
                    </div>
                </div>
            </div>

            {/* TRIVIA */}
            <div className="mb-4 text-inherit">
                <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">TAHUKAH KAMU?</h3>
                {/* Ganti dari renderMarkdown (block) ke renderInlineMarkdown
                    karena trivia biasanya 1-2 kalimat — hindari margin besar dari <p> */}
                <p className="text-inherit">
                    <span dangerouslySetInnerHTML={renderInlineMarkdown(m.trivia, isMathSubject)} />
                </p>
            </div>

            {/* GLOSARIUM */}
            <div className="mb-4 text-inherit">
                <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">Glosarium</h3>
                <ul className="list-disc pl-6 text-inherit">
                    {(m.glosarium || []).map((g, i) => (
                        <li key={i}>
                            <strong className="text-inherit">{g.istilah}: </strong>
                            <span dangerouslySetInnerHTML={renderInlineMarkdown(g.definisi, isMathSubject)} />
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default MaterialsContent;