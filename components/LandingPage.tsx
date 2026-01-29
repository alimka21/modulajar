
import React from 'react';
import { GraduationCap, Plus, ExternalLink } from 'lucide-react';

interface LandingPageProps {
  onOptimize: (text: string) => void; // Kept for prop compatibility, but unused
  onCreateNew: () => void;
  isOptimizing: boolean;
}

const LandingPage: React.FC<LandingPageProps> = ({ onCreateNew }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 font-sans text-slate-900 bg-[#F0F4F9]">
      
      {/* Header / Logo Section */}
      <div className="flex flex-col items-center justify-center gap-6 mb-12 animate-fade-in-down text-center">
         <div className="text-blue-600 bg-white p-6 rounded-3xl shadow-sm">
           <GraduationCap size={80} strokeWidth={1.5} />
         </div>
         <div className="flex flex-col items-center justify-center">
            <h1 className="text-4xl md:text-5xl font-black tracking-wide text-[#1f1f1f] leading-tight uppercase">
               PAKAR MODUL AJAR
            </h1>
            <p className="text-lg text-slate-500 font-medium tracking-wide mt-3 max-w-xl">
              Generator Perangkat Pembelajaran Otomatis Berbasis AI untuk Kurikulum Merdeka & Deep Learning
            </p>
         </div>
      </div>

      {/* Main Action Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8 animate-fade-in-up flex flex-col items-center gap-6">
        
        <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-[#1f1f1f]">Siap Menyusun Modul Ajar?</h2>
            <p className="text-slate-500 text-sm">
                Mulai dengan mengisi identitas dan detail pembelajaran Anda secara manual. AI akan menyusunnya menjadi dokumen lengkap.
            </p>
        </div>

        <button
            onClick={onCreateNew}
            className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white py-4 px-8 rounded-xl font-bold text-lg shadow-blue-200 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
        >
            <div className="bg-white/20 p-1.5 rounded-lg">
                <Plus size={24} />
            </div>
            <span>Mulai Buat Modul</span>
        </button>

        {/* Link to GPT */}
        <a 
            href="https://lynk.id/alimkadigital/4y8zrmznkk82" 
            target="_blank" 
            rel="noreferrer"
            className="flex items-center gap-2 text-sm font-medium text-emerald-600 hover:text-emerald-700 py-2 px-4 rounded-lg hover:bg-emerald-50 transition-colors"
        >
            <span>Buka Custom GPT (Alternatif)</span>
            <ExternalLink size={14} />
        </a>
      </div>
      
      <div className="mt-12 text-center text-xs text-slate-400">
        &copy; 2026 Pengembangan AI by <a href="https://instagram.com/muh.alimka" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors font-medium">alimkadigital</a> - Hak Cipta Dilindungi
      </div>

    </div>
  );
};

export default LandingPage;
