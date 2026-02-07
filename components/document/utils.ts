
declare var marked: any;

export const safeString = (val: any): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === 'string') return val.replace(/siswa|peserta didik/gi, 'Murid');
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(safeString).join(", ");
  if (typeof val === 'object') return (val.text || val.content || val.value || val.description || JSON.stringify(val)).replace(/siswa|peserta didik/gi, 'Murid');
  return String(val);
};

export const cleanupUnnecessaryLatex = (text: string, isMathSubject: boolean): string => {
    if (!isMathSubject) {
        return text.replace(/\$/g, '');
    }
    let cleaned = text.replace(/\$(\d+(?:[.,]\d+)?\s?%?)\$/g, '$1');
    return cleaned;
};

export const protectLatex = (text: string) => {
    let placeholders: string[] = [];
    let protectedText = text.replace(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g, (match) => {
        placeholders.push(match);
        return `LATEXPLACEHOLDER${placeholders.length - 1}`;
    });
    return { protectedText, placeholders };
};

export const restoreLatex = (html: string, placeholders: string[]) => {
    return html.replace(/LATEXPLACEHOLDER(\d+)/g, (_, index) => placeholders[parseInt(index)]);
};

export const renderMarkdown = (text: string, isMathSubject: boolean) => {
    let stringText = safeString(text);
    stringText = cleanupUnnecessaryLatex(stringText, isMathSubject);
    
    let { protectedText, placeholders } = protectLatex(stringText);

    try {
        if (typeof marked !== 'undefined') {
            let html = marked.parse(protectedText);
            return { __html: restoreLatex(html, placeholders) };
        }
    } catch (e) {
        console.warn("Markdown parsing failed", e);
    }
    
    let formatted = protectedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return { __html: restoreLatex(formatted, placeholders) };
};

export const renderInlineMarkdown = (text: string, isMathSubject: boolean) => {
    let stringText = safeString(text);
    stringText = stringText.replace(/^\d+\.\s*/, ''); 
    stringText = cleanupUnnecessaryLatex(stringText, isMathSubject);

    let { protectedText, placeholders } = protectLatex(stringText);

    try {
        if (typeof marked !== 'undefined') {
            let html = "";
            if (typeof marked.parseInline === 'function') {
                 html = marked.parseInline(protectedText);
            } else {
                 html = marked.parse(protectedText).replace(/<\/?p[^>]*>/g, ""); 
            }
            return { __html: restoreLatex(html, placeholders) };
        }
    } catch(e) { }
    
    let formatted = protectedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return { __html: restoreLatex(formatted, placeholders) };
};

export const parseMarkdownTable = (mdText: string): { headers: string[], rows: string[][] } | null => {
    if (!mdText || !mdText.includes('|')) return null;
    
    const lines = mdText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // Cari baris header (baris pertama yang punya pipe)
    const headerIndex = lines.findIndex(l => l.startsWith('|') || (l.split('|').length > 2));
    if (headerIndex === -1) return null;

    const parseRow = (row: string) => {
        return row.split('|').slice(1, -1).map(c => c.trim());
    };

    try {
        const headers = parseRow(lines[headerIndex]);
        const rows: string[][] = [];

        for (let i = headerIndex + 1; i < lines.length; i++) {
            const line = lines[i];
            // Skip separator line (e.g., |---|---|)
            if (line.match(/^\|\s*[:\-]+\s*\|/)) continue;
            // Stop if line doesn't look like table
            if (!line.includes('|')) break;
            
            const cells = parseRow(line);
            if (cells.length > 0) {
                // Normalize row length
                while(cells.length < headers.length) cells.push("");
                rows.push(cells.slice(0, headers.length));
            }
        }

        if (headers.length === 0 || rows.length === 0) return null;
        return { headers, rows };
    } catch (e) {
        return null;
    }
};
