
import React, { useEffect, useMemo } from 'react';
import { GeneratedLessonPlan, LessonIdentity } from '../../types';
import { renderMarkdown } from './utils';
import { OpenSection, ApprovalSignature } from './SharedComponents';

// Import Section Components
import RppContent from './RppContent';
import AssessmentContent from './AssessmentContent';
import MaterialsContent from './MaterialsContent';
import LkpdContent from './LkpdContent';
import QuestionBankContent from './QuestionBankContent';

declare var MathJax: any;

interface DocumentContentProps {
  data: GeneratedLessonPlan;
  inputData: LessonIdentity;
  activeTab: string; // 'SEMUA' | 'RPP_PLUS' | 'MATERI' | 'LKPD' | 'SOAL'
}

const DocumentContent: React.FC<DocumentContentProps> = ({ data, inputData, activeTab }) => {
  
  const isMathSubject = useMemo(() => {
    const subject = (inputData.subject || "").toLowerCase();
    const mathKeywords = ['matematika', 'fisika', 'kimia', 'ipa', 'sains', 'ilmu pengetahuan alam', 'kalkulus', 'statistik', 'aljabar', 'geometri', 'numerasi'];
    return mathKeywords.some(keyword => subject.includes(keyword));
  }, [inputData.subject]);

  useEffect(() => {
    if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
      const container = document.getElementById('konten-dokumen');
      if (container) {
        setTimeout(() => {
            MathJax.typesetPromise([container]).catch((e:any) => console.warn("MathJax Error:", e));
        }, 100);
      }
    }
  }, [data, activeTab, isMathSubject]);

  const ReflectionContent = () => {
    if (!data.reflection) return null;
    return (
        <div className="text-inherit">
            <OpenSection title="V. REFLEKSI PEMBELAJARAN">
                <h4 className="font-bold mb-1 text-inherit">1. Refleksi Guru</h4>
                <ul className="list-disc pl-6 mb-4 text-inherit">
                    {(data.reflection.teacher || []).map((r, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(r, isMathSubject)} />)}
                </ul>

                <h4 className="font-bold mb-1 text-inherit">2. Refleksi Murid</h4>
                <ul className="list-disc pl-6 text-inherit">
                    {(data.reflection.student || []).map((r, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(r, isMathSubject)} />)}
                </ul>
            </OpenSection>
        </div>
    );
  };

  return (
    <div id="konten-dokumen">
        <style>{`
            /* Force Tables in Markdown Content to look like Tables */
            .force-table-styles table {
                width: 100% !important;
                border-collapse: collapse !important;
                border: 1px solid black !important;
                margin-bottom: 1rem;
            }
            .force-table-styles th, .force-table-styles td {
                border: 1px solid black !important;
                padding: 4px 8px !important;
                text-align: left;
                vertical-align: top;
            }
            .force-table-styles th {
                background-color: #f3f4f6 !important;
                font-weight: bold;
                text-align: center;
            }
            
            #konten-dokumen, #konten-dokumen * {
                font-size: 12pt !important;
                line-height: 1.3 !important;
                font-family: 'Cambria', Georgia, serif !important;
                color: #000000 !important;
            }
            
            #konten-dokumen p {
                margin-bottom: 4pt !important;
                text-align: justify;
            }
            
            #konten-dokumen table td, #konten-dokumen table td * {
                text-align: left !important;
            }
            #konten-dokumen table th {
                text-align: center !important;
            }
            #konten-dokumen table td p {
                text-align: left !important;
                margin-bottom: 0 !important;
            }

            #konten-dokumen li {
                margin-bottom: 2pt !important;
                text-align: justify;
                padding-left: 4px;
            }

            /* FIX: Explicit List Styles for Markdown Content */
            #konten-dokumen ul {
                list-style-type: disc !important;
                padding-left: 1.5rem !important;
            }
            #konten-dokumen ol {
                list-style-type: decimal !important;
                padding-left: 1.5rem !important;
            }
            /* Remove list style inside tables to avoid double bullets */
            #konten-dokumen table ul, #konten-dokumen table ol {
                list-style-type: none !important;
                padding-left: 0 !important;
            }
            
            #konten-dokumen h1 { 
                font-size: 24pt !important; 
                line-height: 1.2 !important; 
                font-weight: bold !important; 
                text-align: center; 
                margin-bottom: 12pt; 
                margin-top: 24pt !important; 
            }
            
            #konten-dokumen h2 { font-size: 14pt !important; line-height: 1.2 !important; font-weight: bold !important; text-align: center; margin-bottom: 10pt; margin-top: 0pt; text-transform: uppercase; }
            
            #konten-dokumen h3 { 
                font-size: 14pt !important; 
                line-height: 1.2 !important; 
                font-weight: bold !important; 
                text-transform: uppercase; 
                margin-bottom: 4pt !important; 
                margin-top: 18pt !important; 
                border-bottom: 2px solid #87CEFA; 
                display: block; 
                text-align: left !important;
                page-break-after: avoid !important; 
            }
            
            #konten-dokumen h4 { font-size: 12pt !important; text-transform: uppercase; font-weight: bold !important; margin-bottom: 4pt; margin-top: 8pt; page-break-after: avoid !important; }
            
            .identity-table td { border-color: white !important; padding: 1pt 4pt !important; }
            .identity-table { border-color: white !important; margin-bottom: 0 !important; }

            @media print {
                .page-break-divider { display: none !important; }
                .signature-area td { background: transparent !important; box-shadow: none !important; }
            }
        `}</style>

        {(activeTab === 'RPP_PLUS' || activeTab === 'SEMUA') && (
            <>
                <RppContent data={data} isMathSubject={isMathSubject} />
                <AssessmentContent data={data} isMathSubject={isMathSubject} />
                <ReflectionContent />
                <ApprovalSignature approval={data.approval} />
            </>
        )}
        
        {(activeTab === 'MATERI' || activeTab === 'SEMUA') && (
            <MaterialsContent data={data} isMathSubject={isMathSubject} />
        )}
        
        {(activeTab === 'LKPD' || activeTab === 'SEMUA') && (
            <LkpdContent data={data} isMathSubject={isMathSubject} />
        )}

        {(activeTab === 'SOAL' || activeTab === 'SEMUA') && (
            <QuestionBankContent data={data} isMathSubject={isMathSubject} />
        )}
    </div>
  );
};

export default DocumentContent;
