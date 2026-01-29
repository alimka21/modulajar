
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
      
      // Delay print slightly to ensure render finishes and MathJax runs
      setTimeout(() => {
        window.print();
      }, 1000);
    }
  }, [id]);

  if (!data || !inputData) {
    return <div className="p-10 text-center">Memuat dokumen...</div>;
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="page">
        <DocumentContent data={data} inputData={inputData} activeTab="SEMUA" />
      </div>
    </div>
  );
}
