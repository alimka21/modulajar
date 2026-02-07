
import React from 'react';
import { renderInlineMarkdown, renderMarkdown } from './utils';

// DIRECT JSX TABLE RENDERER
export const TableRenderer = ({ table, isMathSubject }: { table: { headers: string[], rows: string[][] }, isMathSubject: boolean }) => (
  <div className="mb-4 overflow-x-auto break-inside-avoid">
    <table className="w-full border-collapse border border-black text-inherit table-fixed">
      <thead>
        <tr className="bg-[#f3f4f6]">
          {table.headers.map((h, i) => (
            <th key={i} className="border border-black p-2 text-center font-bold align-middle bg-[#f3f4f6]">
               <span dangerouslySetInnerHTML={renderInlineMarkdown(h, isMathSubject)} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} className="border border-black p-2 align-top text-left">
                <span dangerouslySetInnerHTML={renderInlineMarkdown(cell, isMathSubject)} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const OpenSection: React.FC<{ title: string; children?: React.ReactNode; className?: string; contentAlign?: string; noBorder?: boolean }> = ({ title, children, className = "", contentAlign = "text-left", noBorder = false }) => (
  <div className={`mb-4 text-black ${className}`}>
      <h3 
        className="text-inherit font-bold text-[14pt] uppercase mb-3 mt-4" 
        style={noBorder ? { borderBottom: 'none' } : {}}
      >
          {title}
      </h3>
      <div className={`${contentAlign} text-black text-inherit`}>
          {children}
      </div>
  </div>
);

export const RubricTable = ({ items, isMathSubject }: { items: any[], isMathSubject: boolean }) => (
  <div className="mb-6 break-inside-avoid">
      <table className="w-full border-collapse border border-black table-fixed text-black text-inherit">
          <thead>
              <tr className="bg-[#87CEFA]"> 
                  <th className="border border-black p-2 text-left w-[20%] align-middle font-bold text-center text-inherit">Kriteria</th>
                  <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-center text-inherit">Perlu Bimbingan</th>
                  <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-center text-inherit">Cukup</th>
                  <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-center text-inherit">Baik</th>
                  <th className="border border-black p-2 text-center w-[20%] align-middle font-bold text-center text-inherit">Sangat Baik</th>
              </tr>
          </thead>
          <tbody>
              {items.map((item, idx) => (
                  <tr key={idx}>
                      <td className="border border-black p-2 text-left font-bold align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.criteria, isMathSubject)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.needsGuidance, isMathSubject)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.basic, isMathSubject)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.proficient, isMathSubject)} />
                      <td className="border border-black p-2 text-left align-top break-words text-inherit" dangerouslySetInnerHTML={renderMarkdown(item.advanced, isMathSubject)} />
                  </tr>
              ))}
          </tbody>
      </table>
  </div>
);

export const ApprovalSignature = ({ approval }: { approval: any }) => {
    if (!approval) return null;

    return (
        <div className="break-inside-avoid mt-8 signature-area">
            <table className="w-full border-none text-center table-fixed" style={{ border: 'none' }}>
                <tbody>
                    <tr>
                        <td className="w-1/2 p-2 align-top border-none" style={{ border: 'none', fontSize: '11pt', lineHeight: '1.2' }}>
                            <p className="mb-20">
                                Mengetahui,<br/>
                                Kepala Sekolah<br/><br/><br/><br/>
                            </p>
                            <p className="font-bold underline break-words">{approval.principalName}</p>
                            <p className="break-words">NIP. {approval.principalNip}</p>
                        </td>
                        <td className="w-1/2 p-2 align-top border-none" style={{ border: 'none', fontSize: '11pt', lineHeight: '1.2' }}>
                            <p className="mb-20">
                                {approval.location}, {approval.date}<br/>
                                Guru Mata Pelajaran<br/><br/><br/><br/>
                            </p>
                            <p className="font-bold underline break-words">{approval.authorName}</p>
                            <p className="break-words">NIP. {approval.authorNip}</p>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};
