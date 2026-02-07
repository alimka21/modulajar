
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
    
    let visualContent = null;
    
    // LOGIC BARU: Jika objek, pakai TableRenderer. Jika string, cek apakah tabel.
    if (typeof m.konsepInti.tabelVisual === 'object' && m.konsepInti.tabelVisual !== null && !Array.isArray(m.konsepInti.tabelVisual)) {
        visualContent = <TableRenderer table={m.konsepInti.tabelVisual as any} isMathSubject={isMathSubject} />;
    } else {
        const rawText = String(m.konsepInti.tabelVisual);
        // Coba parse string markdown menjadi objek tabel
        const parsedTable = parseMarkdownTable(rawText);
        if (parsedTable) {
            visualContent = <TableRenderer table={parsedTable} isMathSubject={isMathSubject} />;
        } else {
            // Fallback ke rendering biasa
            visualContent = <div className="mb-2 pl-4 text-inherit force-table-styles" dangerouslySetInnerHTML={renderMarkdown(rawText, isMathSubject)} />;
        }
    }
    
    return (
        <div className="text-inherit">
          <h1 className="text-inherit font-bold text-center mb-6 mt-12 page-break-before">LAMPIRAN 1: MATERI AJAR</h1>
          <h2 className="text-inherit text-center mb-6 uppercase">{m.judul}</h2>
          
          <div className="mb-4 text-inherit">
              <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">Pemantik</h3>
              <p className="italic text-inherit" dangerouslySetInnerHTML={renderMarkdown(m.pemantik, isMathSubject)} />
          </div>

          <div className="mb-4 text-inherit">
              <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">Sub Topik</h3>
              <ul className="list-disc pl-6 text-inherit">
                   {m.subTopik.map((s, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(s, isMathSubject)} />)}
              </ul>
          </div>

          <div className="mb-4 text-inherit">
              <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">Konsep Inti</h3>
              <div className="mb-2 text-inherit">
                  <strong className="text-inherit">Definisi:</strong> <span dangerouslySetInnerHTML={renderInlineMarkdown(m.konsepInti.definisi, isMathSubject)} />
              </div>
              
              <strong className="text-inherit">Uraian Materi:</strong>
              <ul className="list-disc pl-6 mb-2 text-inherit">
                   {m.konsepInti.penjelasanBertahap.map((p, i) => <li key={i} dangerouslySetInnerHTML={renderMarkdown(p, isMathSubject)} />)}
              </ul>

              <strong className="text-inherit">Contoh Konkret:</strong>
              <div className="mb-2 pl-4 text-inherit" dangerouslySetInnerHTML={renderMarkdown(m.konsepInti.contohKonkret, isMathSubject)} />

              <strong className="text-inherit">Visualisasi / Rangkuman Data:</strong>
              {visualContent}
          </div>
          
          <div className="mb-4 text-inherit">
               <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">TAHUKAH KAMU?</h3>
               <div className="text-inherit" dangerouslySetInnerHTML={renderMarkdown(m.trivia, isMathSubject)} />
          </div>

          <div className="mb-4 text-inherit">
              <h3 className="font-bold uppercase mb-2 text-inherit border-b border-black pb-1">Glosarium</h3>
              <ul className="list-disc pl-6 text-inherit">
                   {m.glosarium.map((g, i) => (
                       <li key={i}>
                           <strong className="text-inherit">{g.istilah}:</strong> <span dangerouslySetInnerHTML={renderInlineMarkdown(g.definisi, isMathSubject)} />
                       </li>
                   ))}
              </ul>
          </div>
        </div>
    );
};

export default MaterialsContent;
