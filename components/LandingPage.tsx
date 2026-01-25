import React, { useState, useRef } from 'react';
import { GraduationCap, Loader2, Sparkles, Plus, ExternalLink, Upload, FileText, X } from 'lucide-react';

// Declare globals for libraries loaded in index.html
declare var mammoth: any;
declare var pdfjsLib: any;

interface LandingPageProps {
  onOptimize: (text: string) => void;
  onCreateNew: () => void;
  isOptimizing: boolean;
}

const LandingPage: React.FC<LandingPageProps> = ({ onOptimize, onCreateNew, isOptimizing }) => {
  const [inputText, setInputText] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- File Handling Logic ---

  const processFile = async (file: File) => {
    setIsReadingFile(true);
    try {
      let text = "";
      
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        text = result.value;
      } else if (file.name.endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";
        
        // Loop through all pages
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + "\n\n";
        }
        text = fullText;
      } else if (file.name.endsWith('.txt')) {
        text = await file.text();
      } else {
        alert("Format file tidak didukung. Harap upload .docx, .pdf, atau .txt");
        setIsReadingFile(false);
        return;
      }

      // Append text if there's already content, or replace it
      setInputText((prev) => prev ? prev + "\n\n" + text : text);
      
    } catch (error) {
      console.error("Error reading file:", error);
      alert("Gagal membaca file. Pastikan file tidak rusak atau terkunci password.");
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  // ---------------------------

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 font-sans text-slate-900 bg-[#F0F4F9]">
      
      {/* Header / Logo Section */}
      <div className="flex flex-row items-center justify-center gap-5 mb-10 animate-fade-in-down">
         <div className="text-blue-600 flex-shrink-0">
           <GraduationCap size={72} strokeWidth={1.5} />
         </div>
         <div className="flex flex-col items-start justify-center">
            <h1 className="text-4xl font-black tracking-wide text-[#1f1f1f] leading-tight uppercase">
               PAKAR MODUL AJAR
            </h1>
            <p className="text-sm text-slate-500 font-medium tracking-wide mt-1">
              Pengembangan Custom AI by <a href="https://instagram.com/muh.alimka" target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700 transition-colors font-bold underline decoration-blue-200 underline-offset-4">alimkadigital</a>
            </p>
         </div>
      </div>

      {/* Main Content Card - Google Style */}
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-slate-200 p-8 animate-fade-in-up">
        
        <div className="mb-6 flex justify-between items-end">
            <div>
                <h2 className="text-xl font-medium text-[#1f1f1f] mb-1">Mulai Buat Modul Ajar</h2>
                <p className="text-slate-500 text-sm">Paste teks atau upload file RPP lama/materi untuk dioptimalkan.</p>
            </div>
            {inputText && (
                <button onClick={() => setInputText('')} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                    <X size={14} /> Clear
                </button>
            )}
        </div>

        {/* Input Area with Drag & Drop */}
        <div className="mb-8">
            <div 
                className={`relative group transition-all duration-300 rounded-xl ${isDragOver ? 'ring-4 ring-blue-100 border-blue-400' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className={`w-full h-48 border rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 resize-none placeholder:text-slate-400 bg-white font-mono transition-all ${isDragOver ? 'border-blue-400 bg-blue-50/10' : 'border-slate-300'}`}
                    placeholder="Tempel teks di sini, atau drag & drop file .docx/.pdf/ .txt Anda..."
                />
                
                {/* Upload Button Overlay */}
                <div className="absolute bottom-4 right-4 flex gap-2">
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept=".docx,.pdf,.txt" 
                        className="hidden" 
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isReadingFile}
                        className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors border border-slate-200"
                    >
                        {isReadingFile ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {isReadingFile ? 'Membaca...' : 'Upload File'}
                    </button>
                </div>
                
                {/* Drag Overlay Indicator */}
                {isDragOver && (
                    <div className="absolute inset-0 bg-blue-50/50 backdrop-blur-[1px] rounded-xl flex items-center justify-center border-2 border-dashed border-blue-500 pointer-events-none">
                        <div className="flex flex-col items-center text-blue-600">
                            <Upload size={32} className="mb-2 animate-bounce" />
                            <span className="font-semibold">Lepaskan file di sini</span>
                        </div>
                    </div>
                )}
            </div>
             <p className="text-[10px] text-slate-400 mt-2 text-right">
                Mendukung: .docx, .pdf (teks), .txt
            </p>
        </div>

        {/* Action Buttons Row */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center border-t border-slate-100 pt-6">
            <div className="flex gap-3 w-full sm:w-auto">
                {/* Primary Action */}
                <button
                    onClick={() => onOptimize(inputText)}
                    disabled={!inputText || isOptimizing || isReadingFile}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-6 rounded-full font-medium text-sm transition-all ${
                    !inputText || isOptimizing || isReadingFile
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md'
                    }`}
                >
                    {isOptimizing ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                    {isOptimizing ? 'Memproses...' : 'Optimalkan'}
                </button>

                {/* Secondary Action */}
                <button
                    onClick={onCreateNew}
                    disabled={isOptimizing}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-blue-600 border border-slate-200 py-2.5 px-6 rounded-full font-medium text-sm transition-all"
                >
                    <Plus size={18} />
                    Buat Baru
                </button>
            </div>

            {/* Link to GPT */}
            <a 
                href="https://lynk.id/alimkadigital/4y8zrmznkk82" 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 py-2 px-4 rounded-lg hover:bg-emerald-50 transition-colors mt-4 sm:mt-0"
            >
                <span>Buka Custom GPT</span>
                <ExternalLink size={14} />
            </a>
        </div>
      </div>
      
      <div className="mt-8 text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} EduGen AI. Optimized for Deep Learning Curriculum.
      </div>

    </div>
  );
};

export default LandingPage;