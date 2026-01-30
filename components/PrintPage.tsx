
import React, { useEffect, useState } from 'react';
import DocumentContent from './DocumentContent';
import { GeneratedLessonPlan, LessonIdentity } from '../types';

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
      
      // Tunggu render selesai dan MathJax memproses rumus
      setTimeout(() => {
        window.print();
      }, 1500);
    }
  }, [id]);

  if (!data || !inputData) {
    return <div className="p-10 text-center font-sans">Memuat dokumen untuk dicetak...</div>;
  }

  return (
    <div className="bg-white min-h-screen">
      {/* print-container memberikan margin internal saat margin browser diatur ke 0 */}
      <div className="print-container">
        <DocumentContent data={data} inputData={inputData} activeTab="SEMUA" />
      </div>
    </div>
  );
}
