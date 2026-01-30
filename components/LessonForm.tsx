
import React from 'react';
import { LessonIdentity } from '../types';
import { INITIAL_LESSON_IDENTITY } from '../constants'; // Import constants
import { ArrowLeft, Sparkles, Loader2 } from 'lucide-react';
import { GRADUATE_PROFILE_DIMENSIONS } from '../constants';

interface LessonFormProps {
  data: LessonIdentity;
  onChange: (data: LessonIdentity) => void;
  onBack: () => void;
  onGenerate: () => void;
  isLoading: boolean;
}

const LessonForm: React.FC<LessonFormProps> = ({ data, onChange, onBack, onGenerate, isLoading }) => {

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    onChange({ ...data, [name]: value });
  };

  const handleCheckboxChange = (dimension: string) => {
    const current = data.graduateProfileDimensions || [];
    const exists = current.includes(dimension);
    let updated;
    if (exists) {
      updated = current.filter(item => item !== dimension);
    } else {
      updated = [...current, dimension];
    }
    onChange({ ...data, graduateProfileDimensions: updated });
  };

  // Strictly check lesson data
  const isLessonComplete = !!(data.subject && data.grade && data.topic && data.objectives);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">Detail Pembelajaran (Format Deep Learning)</h2>
        <p className="text-slate-500 text-sm">Isi detail pembelajaran sesuai kerangka kerja Pembelajaran Mendalam.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Kolom Kiri: Identitas Dasar */}
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 mb-4">
             <h3 className="font-semibold text-blue-800 text-sm mb-2">1. Identitas Pembelajaran</h3>
             <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Mata Pelajaran *</label>
                    <input type="text" name="subject" value={data.subject} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500 bg-white" placeholder="Matematika" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Kelas / Fase *</label>
                    <input type="text" name="grade" value={data.grade} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500 bg-white" placeholder="X / E" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Semester</label>
                      <select name="semester" value={data.semester} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500 bg-white">
                        <option value="Ganjil">Ganjil</option>
                        <option value="Genap">Genap</option>
                      </select>
                   </div>
                   <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Alokasi Waktu</label>
                      <input type="text" name="timeAllocation" value={data.timeAllocation} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500 bg-white" />
                   </div>
                </div>

                {/* Input Jumlah Pertemuan */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Jumlah Pertemuan</label>
                  <select 
                    name="meetingCount" 
                    value={data.meetingCount} 
                    onChange={handleChange} 
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500 bg-white"
                  >
                    <option value="1 Pertemuan">1 Pertemuan</option>
                    <option value="2 Pertemuan">2 Pertemuan</option>
                    <option value="3 Pertemuan">3 Pertemuan</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Topik / Materi Pembelajaran *</label>
                  <input type="text" name="topic" value={data.topic} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded text-sm outline-none focus:border-blue-500 bg-white" />
                </div>
             </div>
          </div>

          <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
             <h3 className="font-semibold text-indigo-800 text-sm mb-2">2. Desain Pembelajaran</h3>
             <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tujuan Pembelajaran *</label>
                  <textarea name="objectives" rows={2} value={data.objectives} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded text-sm outline-none focus:border-indigo-500 bg-white" placeholder="Contoh: Murid mampu menganalisis struktur teks..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Praktik Pedagogis (Model/Metode)</label>
                  <input type="text" name="pedagogicalPractice" value={data.pedagogicalPractice} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded text-sm outline-none focus:border-indigo-500 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Lingkungan Pembelajaran</label>
                  <input type="text" name="learningEnvironment" value={data.learningEnvironment} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded text-sm outline-none focus:border-indigo-500 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Pemanfaatan Digital (Opsional)</label>
                  <input type="text" name="digitalUtilization" value={data.digitalUtilization} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded text-sm outline-none focus:border-indigo-500 bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Kemitraan Pembelajaran (Opsional)</label>
                  <input type="text" name="learningPartnership" value={data.learningPartnership} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded text-sm outline-none focus:border-indigo-500 bg-white" />
                </div>
             </div>
          </div>
        </div>

        {/* Kolom Kanan: Detail Deep Learning */}
        <div className="space-y-4">
           <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
              <h3 className="font-semibold text-emerald-800 text-sm mb-2">3. Asesmen & Profil Lulusan</h3>
              <div className="space-y-3">
                 <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Asesmen Awal (Diagnostik)</label>
                    <textarea name="initialAssessment" rows={2} value={data.initialAssessment} onChange={handleChange} className="w-full px-3 py-2 border border-slate-300 rounded text-sm outline-none focus:border-emerald-500 bg-white" />
                 </div>
                 
                 <div>
                    <label className="block text-xs font-medium text-slate-600 mb-2">Dimensi Profil Lulusan (Pilih Relevan)</label>
                    <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto border p-2 rounded bg-white">
                      {GRADUATE_PROFILE_DIMENSIONS.map((dim) => (
                        <label key={dim} className="flex items-start gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input 
                            type="checkbox" 
                            checked={(data.graduateProfileDimensions || []).includes(dim)}
                            onChange={() => handleCheckboxChange(dim)}
                            className="mt-1 w-3 h-3 text-emerald-600 rounded focus:ring-emerald-500"
                          />
                          <span className="text-xs text-slate-700">{dim}</span>
                        </label>
                      ))}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <div className="mt-8 flex justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-800 font-medium px-4 py-2 transition"
          disabled={isLoading}
        >
          <ArrowLeft size={18} />
          <span>Kembali</span>
        </button>

        <button
          onClick={onGenerate}
          disabled={isLoading || !isLessonComplete}
          className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-white shadow-lg transition-all ${
            isLoading || !isLessonComplete
              ? 'bg-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl transform hover:-translate-y-0.5'
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="animate-spin" size={20} />
              <span>Menyusun RPM...</span>
            </>
          ) : (
            <>
              <Sparkles size={20} />
              <span>Generate Rencana Pembelajaran</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default LessonForm;
