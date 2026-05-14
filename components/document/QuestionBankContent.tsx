// ============================================================================
// PATCH: QuestionBankContent.tsx (FULL REPLACEMENT)
//
// Perubahan dari versi lama:
// 1. Tambah cleanOption() — bersihkan prefix huruf dari options PG/PGK
//    agar tidak double prefix ("A. A. Jawaban" → "A. Jawaban")
// 2. cleanAnswerKey() — normalisasi tampilan kunci jawaban per tipe soal
// 3. Stimulus sekarang tampil untuk SEMUA tipe soal yang punya stimulus (bukan hanya PG)
// 4. Nomor soal berurutan global (tidak reset per grup tipe)
// ============================================================================

import React from 'react';
import { GeneratedLessonPlan, QuestionItem } from '../../types';
import { renderMarkdown, renderInlineMarkdown } from './utils';

interface QuestionBankContentProps {
    data: GeneratedLessonPlan;
    isMathSubject: boolean;
}

// ▼ Bersihkan prefix huruf dari opsi (A., B., A), B), dll)
const cleanOption = (opt: string): string => {
    return String(opt || '').replace(/^[A-Ea-e][\.\)]\s*/g, '').trim();
};

// ▼ Normalisasi answerKey untuk tampilan yang bersih
const cleanAnswerKey = (item: QuestionItem): string => {
    const key = String(item.answerKey || '').trim();

    if (item.type === 'Menjodohkan' && item.matchingPairs) {
        // Hitung ulang dari matchingPairs untuk akurasi
        const sortedRight = [...(item.matchingPairs || [])]
            .map(p => p.right)
            .sort((a, b) => a.localeCompare(b));
        const keyParts = (item.matchingPairs || []).map((pair, i) => {
            const matchIndex = sortedRight.indexOf(pair.right);
            const letter = matchIndex >= 0 ? String.fromCharCode(65 + matchIndex) : '?';
            return `${i + 1}-${letter}`;
        });
        return keyParts.join(', ');
    }

    if (item.type === 'Pilihan Ganda') {
        // Ambil hanya huruf pertama jika AI generate "A. Jawaban..."
        if (key.length > 1 && /^[A-Da-d][\.\)]/i.test(key)) return key[0].toUpperCase();
        return key.toUpperCase();
    }

    if (item.type === 'Pilihan Ganda Kompleks') {
        // Pastikan format "A, C" bukan "A,C" atau "A.C"
        return key.replace(/[,\s]+/g, ', ').replace(/[\.]/g, '').toUpperCase();
    }

    return key;
};

const QuestionBankContent: React.FC<QuestionBankContentProps> = ({ data, isMathSubject }) => {
    if (!data.questionBank) return null;

    const groupedItems = (data.questionBank?.items || []).reduce((acc, item) => {
        if (!acc[item.type]) acc[item.type] = [];
        acc[item.type].push(item);
        return acc;
    }, {} as Record<string, QuestionItem[]>);

    // Nomor soal global (berurutan lintas tipe)
    let globalNumber = 0;

    return (
        <div className="text-inherit">
            <h1 className="text-inherit font-bold text-center mb-6 mt-12">
                LAMPIRAN 3: BANK SOAL & EVALUASI
            </h1>

            {Object.entries(groupedItems).map(([type, items], groupIndex) => (
                <div key={type} className="mb-8">
                    <h3 className="text-inherit border-b border-black pb-1 mb-4 font-bold">
                        {String.fromCharCode(65 + groupIndex)}. {type.toUpperCase()}
                    </h3>

                    <div className="space-y-6">
                        {(items as QuestionItem[]).map((item, idx) => {
                            globalNumber++;
                            const currentNum = globalNumber;

                            return (
                                <div key={idx} className="break-inside-avoid">
                                    <div className="flex gap-2 text-sm">
                                        <span className="font-bold text-inherit shrink-0">{currentNum}.</span>
                                        <div className="flex-1 text-inherit">

                                            {/* ▼ Stimulus: tampil untuk semua tipe yang punya stimulus */}
                                            {item.stimulus && (
                                                <div
                                                    className="mb-2 italic text-gray-700 bg-slate-50 p-3 border-l-4 border-slate-300 text-xs"
                                                    dangerouslySetInnerHTML={renderMarkdown(item.stimulus, isMathSubject)}
                                                />
                                            )}

                                            {/* ▼ Pertanyaan */}
                                            <div
                                                className="mb-2 text-inherit"
                                                dangerouslySetInnerHTML={renderMarkdown(item.question, isMathSubject)}
                                            />

                                            {/* ▼ Pilihan Ganda & PG Kompleks */}
                                            {(item.type === 'Pilihan Ganda' || item.type === 'Pilihan Ganda Kompleks') && item.options && (
                                                <div className="grid grid-cols-1 gap-y-1 text-inherit mt-1 ml-4 text-xs">
                                                    {(item.options || []).map((opt, i) => (
                                                        <div key={i} className="flex gap-2 text-inherit">
                                                            <span className="font-bold min-w-[20px] shrink-0 text-inherit">
                                                                {String.fromCharCode(65 + i)}.
                                                            </span>
                                                            {/* ▼ cleanOption() mencegah double prefix */}
                                                            <span
                                                                className="text-inherit"
                                                                dangerouslySetInnerHTML={renderInlineMarkdown(cleanOption(opt), isMathSubject)}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* ▼ Menjodohkan */}
                                            {item.type === 'Menjodohkan' && item.matchingPairs && (
                                                <div className="mt-4 ml-4 grid grid-cols-2 gap-8 text-xs">
                                                    <div className="space-y-2">
                                                        <div className="font-bold border-b border-black pb-1">Premis</div>
                                                        {(item.matchingPairs || []).map((pair, i) => (
                                                            <div key={i} className="flex gap-2 items-start py-1">
                                                                <div className="font-bold min-w-[20px] shrink-0">{i + 1}.</div>
                                                                <div
                                                                    className="text-inherit"
                                                                    dangerouslySetInnerHTML={renderInlineMarkdown(pair.left, isMathSubject)}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div className="font-bold border-b border-black pb-1">Pilihan Jawaban</div>
                                                        {[...(item.matchingPairs || [])]
                                                            .sort((a, b) => a.right.localeCompare(b.right))
                                                            .map((pair, i) => (
                                                                <div key={i} className="flex gap-2 items-start py-1">
                                                                    <div className="font-bold min-w-[20px] shrink-0">
                                                                        {String.fromCharCode(65 + i)}.
                                                                    </div>
                                                                    <div
                                                                        className="text-inherit"
                                                                        dangerouslySetInnerHTML={renderInlineMarkdown(pair.right, isMathSubject)}
                                                                    />
                                                                </div>
                                                            ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* ▼ Benar/Salah */}
                                            {item.type === 'Benar/Salah' && (
                                                <div className="mt-2 ml-4 flex gap-8 text-xs pt-1">
                                                    <span className="font-bold">( ) Benar</span>
                                                    <span className="font-bold">( ) Salah</span>
                                                </div>
                                            )}

                                            {/* ▼ Isian Singkat: tambah garis jawaban */}
                                            {item.type === 'Isian Singkat' && (
                                                <div className="mt-2 ml-4 text-xs">
                                                    <span className="text-gray-400">Jawaban: ___________________________</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* ▼ KUNCI JAWABAN */}
            <div className="mt-8 pt-6 border-t-2 border-black break-inside-avoid">
                <h3 className="text-lg font-bold text-center mb-4 uppercase">KUNCI JAWABAN</h3>
                <div className="flex flex-col gap-6">
                    {(() => {
                        // Reset nomor untuk kunci jawaban
                        let keyNumber = 0;
                        return Object.entries(groupedItems).map(([type, items], groupIndex) => (
                            <div key={type} className="text-xs">
                                <h4 className="font-bold text-inherit mb-2 border-b border-black pb-1">
                                    {String.fromCharCode(65 + groupIndex)}. {type.toUpperCase()}
                                </h4>
                                <ol className="space-y-1 text-inherit list-none">
                                    {(items as QuestionItem[]).map((item, idx) => {
                                        keyNumber++;
                                        return (
                                            <li key={idx} className="flex gap-2">
                                                <span className="font-semibold min-w-[24px] shrink-0">{keyNumber}.</span>
                                                <span
                                                    className="text-inherit"
                                                    dangerouslySetInnerHTML={renderInlineMarkdown(cleanAnswerKey(item), isMathSubject)}
                                                />
                                            </li>
                                        );
                                    })}
                                </ol>
                            </div>
                        ));
                    })()}
                </div>
            </div>
        </div>
    );
};

export default QuestionBankContent;