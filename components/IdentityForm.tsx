import React from 'react';
import { SchoolIdentity } from '../types';
import { Save, ArrowRight } from 'lucide-react';
import { INDONESIAN_MONTHS } from '../constants';

interface IdentityFormProps {
  data: SchoolIdentity;
  onChange: (data: SchoolIdentity) => void;
  onNext: () => void;
}

const IdentityForm: React.FC<IdentityFormProps> = ({ data, onChange, onNext }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    onChange({ ...data, [name]: value });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const [year, month, day] = val.split('-');
    const monthName = INDONESIAN_MONTHS[parseInt(month) - 1];
    const formattedDate = `${parseInt(day)} ${monthName} ${year}`;
    onChange({ ...data, date: formattedDate });
  };

  const getIsoDateFromDisplay = (displayDate: string) => {
    if (!displayDate) return "";
    const parts = displayDate.split(' ');
    if (parts.length < 3) return "";
    const day = parts[0].padStart(2, '0');
    const monthIndex = INDONESIAN_MONTHS.indexOf(parts[1]);
    if (monthIndex === -1) return "";
    const year = parts[2];
    return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${day}`;
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-800">Identitas Sekolah & Penyusun</h2>
        <span className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-full border border-blue-100">
          Disimpan Otomatis
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-700 border-b pb-2">Data Sekolah</h3>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Nama Sekolah</label>
            <input
              type="text"
              name="schoolName"
              value={data.schoolName}
              onChange={handleChange}
              placeholder="Contoh: SMA Negeri 1 Jakarta"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Tempat (Kota/Kab)</label>
            <input
              type="text"
              name="location"
              value={data.location}
              onChange={handleChange}
              placeholder="Contoh: Jakarta Selatan"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Tanggal Penyusunan</label>
            <input
              type="date"
              name="date"
              value={getIsoDateFromDisplay(data.date)}
              onChange={handleDateChange}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white text-slate-700"
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold text-slate-700 border-b pb-2">Data Personal</h3>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Nama Penyusun (Guru)</label>
            <input
              type="text"
              name="authorName"
              value={data.authorName}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">NIP Penyusun</label>
            <input
              type="text"
              name="authorNip"
              value={data.authorNip}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Nama Kepala Sekolah</label>
            <input
              type="text"
              name="principalName"
              value={data.principalName}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">NIP Kepala Sekolah</label>
            <input
              type="text"
              name="principalNip"
              value={data.principalNip}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-white"
            />
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={onNext}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-all shadow-md hover:shadow-lg"
        >
          <span>Simpan & Lanjut</span>
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default IdentityForm;