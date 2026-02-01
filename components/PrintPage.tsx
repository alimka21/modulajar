
import React, { useEffect, useState } from 'react';
import DocumentContent from './DocumentContent';
import { GeneratedLessonPlan, LessonIdentity } from '../types';

declare var MathJax: any;

interface PrintPageProps {
  id: string;
}

export default function PrintPage({ id }: PrintPageProps) {
  const [data, setData] = useState<GeneratedLessonPlan | null>(null);
  const [inputData, setInputData] = useState<LessonIdentity | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(`print_data_${id}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      setData(parsed.data);
      setInputData(parsed.inputData);
      
      const preparePrint = async () => {
          // 1. Beri jeda sedikit agar React selesai merender DOM awal
          await new Promise(resolve => setTimeout(resolve, 500));

          // 2. Tunggu MathJax selesai merender rumus (Promise-based)
          if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
              try {
                  // Typeset ulang seluruh dokumen untuk memastikan rumus tampil
                  await MathJax.typesetPromise();
              } catch (e) {
                  console.warn("MathJax typeset error:", e);
              }
          }

          // 3. Jeda sangat singkat setelah render rumus, lalu buka dialog print
          setTimeout(() => {
              window.print();
          }, 300);
      };

      preparePrint();
    }
  }, [id]);

  if (!data || !inputData) {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen font-sans bg-white p-10">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
            <p className="text-slate-600 font-medium">Menyiapkan dokumen...</p>
            <p className="text-xs text-slate-400 mt-2">Merender rumus matematika & tata letak.</p>
        </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      {/* 
        TEKNIK TABLE HEADER REPEAT:
        Browser secara otomatis mengulang <thead> dan <tfoot> di setiap halaman cetak.
        Kita menggunakan div kosong (spacer) di dalam thead/tfoot untuk memaksa margin
        atas dan bawah di setiap halaman, meskipun setting margin browser dimatikan (0mm).
      */}
      <table className="print-layout-table">
        <thead>
          <tr>
            <td>
              {/* Header Spacer - Menciptakan margin atas di setiap halaman */}
              <div className="print-header-space"></div>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div className="print-content-wrapper">
                <DocumentContent data={data} inputData={inputData} activeTab="SEMUA" />
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>
              {/* Footer Spacer - Menciptakan margin bawah di setiap halaman */}
              <div className="print-footer-space"></div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
