
import React, { useState } from 'react';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { AppSettings, User } from '../types';
import { saveUser, hashPassword } from '../services/storageService';

// Declare SweetAlert global
declare var Swal: any;

interface RegisterPageProps {
  onBack: () => void;
  settings: AppSettings;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ onBack, settings }) => {
  const [formData, setFormData] = useState({
      name: '',
      email: '',
      password: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      // Hash password before saving
      const hashedPassword = await hashPassword(formData.password);

      // 1. Simpan ke LocalStorage sebagai 'Pending'
      const newUser: User = {
          id: Date.now().toString(),
          name: formData.name,
          email: formData.email,
          password: hashedPassword, // Saved Hashed
          role: 'user',
          status: 'pending',
          joinedDate: new Date().toISOString()
      };
      
      saveUser(newUser);

      // 2. Prepare WhatsApp URL
      const message = `Halo Admin Pakar Modul Ajar, saya ingin mendaftar akun.\n\nNama: ${formData.name}\nEmail: ${formData.email}\n\nMohon konfirmasi pendaftaran saya. Terima kasih.`;
      const encodedMessage = encodeURIComponent(message);
      const waUrl = `https://wa.me/${settings.whatsappNumber}?text=${encodedMessage}`;
      
      // 3. Show SweetAlert and Redirect
      Swal.fire({
          title: 'Pendaftaran Berhasil!',
          text: 'Data Anda telah tersimpan. Klik tombol di bawah untuk konfirmasi ke Admin via WhatsApp agar akun segera diaktifkan.',
          icon: 'success',
          confirmButtonText: 'Hubungi Admin Sekarang',
          confirmButtonColor: '#25D366', // WhatsApp color
          showCancelButton: true,
          cancelButtonText: 'Tutup',
          cancelButtonColor: '#64748b'
      }).then((result: any) => {
          if (result.isConfirmed) {
              window.open(waUrl, '_blank');
          }
          onBack();
      });
  };

  return (
    <div className="min-h-screen bg-[#F0F4F9] flex flex-col items-center justify-center p-4 font-sans text-slate-900">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden animate-fade-in-up">
         <div className="p-4 border-b border-slate-100 flex items-center">
             <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition">
                 <ArrowLeft size={20} />
             </button>
             <h2 className="text-lg font-bold text-slate-800 ml-2">Pendaftaran Akun</h2>
         </div>
         
         <div className="p-8">
            <p className="text-sm text-slate-600 mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
                Isi data diri Anda di bawah ini. Setelah mendaftar, Anda akan diarahkan ke WhatsApp Admin untuk aktivasi akun.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Nama Lengkap</label>
                    <input 
                        type="text"
                        name="name" 
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        placeholder="Contoh: Budi Santoso"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Email Aktif</label>
                    <input 
                        type="email"
                        name="email" 
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        placeholder="email@sekolah.sch.id"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Kata Sandi</label>
                    <input 
                        type="password"
                        name="password" 
                        value={formData.password}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        placeholder="Buat kata sandi aman"
                        required
                    />
                </div>

                <button 
                    type="submit"
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-all shadow-md hover:shadow-lg mt-4 flex items-center justify-center gap-2"
                >
                    <MessageCircle size={20} />
                    DAFTAR & HUBUNGI ADMIN
                </button>
            </form>
         </div>
      </div>
    </div>
  );
};

export default RegisterPage;
