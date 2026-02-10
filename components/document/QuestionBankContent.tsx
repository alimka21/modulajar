
import React from 'react';
import { GeneratedLessonPlan, QuestionItem } from '../../types';
import { renderMarkdown, renderInlineMarkdown } from './utils';

interface QuestionBankContentProps {
    data: GeneratedLessonPlan;
    isMathSubject: boolean;
}

const QuestionBankContent: React.FC<QuestionBankContentProps> = ({ data, isMathSubject }) => {
    if (!data.questionBank) return null;

    const groupedItems = (data.questionBank?.items || []).reduce((acc, item) => {
        if (!acc[item.type]) acc[item.type] = [];
        acc[item.type].push(item);
        return acc;
    }, {} as Record<string, QuestionItem[]>);

    return (
        <div className="text-inherit">
          <h1 className="text-inherit font-bold text-center mb-6 mt-12">LAMPIRAN 3: BANK SOAL & EVALUASI</h1>
          
          {Object.entries(groupedItems).map(([type, items], groupIndex) => (
              <div key={type} className="mb-8">
                  <h3 className="text-inherit border-b border-black pb-1 mb-4 font-bold">
                      {String.fromCharCode(65 + groupIndex)}. {type.toUpperCase()}
                  </h3>
                  
                  <div className="space-y-6">
                      {(items as any[]).map((item, idx) => (
                          <div key={idx} className="break-inside-avoid">
                              <div className="flex gap-2 text-sm">
                                  <span className="font-bold text-inherit">{idx + 1}.</span>
                                  <div className="flex-1 text-inherit">
                                      {item.stimulus && !['Menjodohkan', 'Benar/Salah'].includes(item.type) && (
                                          <div className="mb-2 italic text-gray-700 text-inherit bg-slate-50 p-3 border-l-4 border-slate-300 text-xs" dangerouslySetInnerHTML={renderMarkdown(item.stimulus, isMathSubject)} />
                                      )}
                                      <div className="mb-2 text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.question, isMathSubject)} />
                                      {(item.type === 'Pilihan Ganda' || item.type === 'Pilihan Ganda Kompleks') && item.options && (
                                          <div className="grid grid-cols-1 gap-y-1 text-inherit mt-1 ml-4 text-xs">
                                              {(item.options || []).map((opt: string, i: number) => (
                                                  <div key={i} className="flex gap-2 text-inherit">
                                                      <span className="font-bold min-w-[20px] text-inherit">{String.fromCharCode(65 + i)}.</span>
                                                      <span className="text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(opt, isMathSubject)} />
                                                  </div>
                                              ))}
                                          </div>
                                      )}
                                      {item.type === 'Menjodohkan' && item.matchingPairs && (
                                          <div className="mt-4 ml-4 grid grid-cols-2 gap-8 text-xs">
                                              <div className="space-y-2">
                                                  <div className="font-bold border-b border-black pb-1">Premis</div>
                                                  {(item.matchingPairs || []).map((pair: any, i: number) => (
                                                      <div key={i} className="flex gap-2 items-start py-1">
                                                          <div className="font-bold min-w-[20px]">{i+1}.</div>
                                                          <div className="text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(pair.left, isMathSubject)} />
                                                      </div>
                                                  ))}
                                              </div>
                                              <div className="space-y-2">
                                                  <div className="font-bold border-b border-black pb-1">Pilihan Jawaban</div>
                                                  {[...(item.matchingPairs || [])].sort((a: any, b: any) => a.right.localeCompare(b.right)).map((pair: any, i: number) => (
                                                      <div key={i} className="flex gap-2 items-start py-1">
                                                          <div className="font-bold min-w-[20px]">{String.fromCharCode(65+i)}.</div>
                                                          <div className="text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(pair.right, isMathSubject)} />
                                                      </div>
                                                  ))}
                                              </div>
                                          </div>
                                      )}
                                      {item.type === 'Benar/Salah' && (
                                          <div className="mt-2 ml-4 flex gap-8 text-xs pt-1">
                                               <span className="font-bold">( ) Benar</span>
                                               <span className="font-bold">( ) Salah</span>
                                          </div>
                                      )}
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          ))}

          <div className="mt-8 pt-6 border-t-2 border-black break-inside-avoid">
              <h3 className="text-lg font-bold text-center mb-4 uppercase">KUNCI JAWABAN</h3>
              <div className="flex flex-col gap-6">
                  {Object.entries(groupedItems).map(([type, items], groupIndex) => (
                      <div key={type} className="text-xs">
                          <h4 className="font-bold text-inherit mb-1 border-b border-black pb-1">
                              {String.fromCharCode(65 + groupIndex)}. {type.toUpperCase()}
                          </h4>
                          <ol className="list-decimal pl-6 space-y-1 text-inherit">
                              {(items as any[]).map((item, idx) => {
                                  let displayKey = item.answerKey;
                                  if (item.type === 'Menjodohkan' && item.matchingPairs) {
                                      const sortedRight = [...(item.matchingPairs || [])].map((p: any) => p.right).sort((a: string, b: string) => a.localeCompare(b));
                                      const keyParts = (item.matchingPairs || []).map((pair: any, i: number) => {
                                          const matchIndex = sortedRight.indexOf(pair.right);
                                          const letter = String.fromCharCode(65 + matchIndex);
                                          return `${i+1} - ${letter}`;
                                      });
                                      displayKey = keyParts.join(", ");
                                  }
                                  return (
                                      <li key={idx}>
                                          <span className="text-inherit" dangerouslySetInnerHTML={renderInlineMarkdown(displayKey, isMathSubject)} />
                                      </li>
                                  );
                              })}
                          </ol>
                      </div>
                  ))}
              </div>
          </div>
        </div>
    );
};

export default QuestionBankContent;
