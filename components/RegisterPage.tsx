
import React, { useState } from 'react';
import { ArrowLeft, MessageCircle, Loader2 } from 'lucide-react';
import { AppSettings, User } from '../types';
import { saveUser } from '../services/storageService';
import { swal } from '../services/notificationService';

interface RegisterPageProps {
  onBack: () => void;
  settings: AppSettings;
}

const RegisterPage: React.FC<RegisterPageProps> = ({ onBack, settings }) => {
  const [formData, setFormData] = useState({
      name: '',
      username: '',
      email: '',
      phoneNumber: '',
      password: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      
      // VALIDATION
      if (formData.password.length < 6) {
          swal.fire({
              title: 'Password Terlalu Pendek',
              text: 'Kata sandi harus minimal 6 karakter.',
              icon: 'warning',
              confirmButtonColor: '#f59e0b'
          });
          return;
      }
      if (!formData.phoneNumber) {
          swal.fire({
              title: 'Nomor HP Wajib',
              text: 'Mohon isi nomor WhatsApp/HP aktif.',
              icon: 'warning',
          });
          return;
      }

      setIsSubmitting(true);
      
      try {
          const userPayload: User = {
              id: '', // Supabase will assign ID
              name: formData.name,
              username: formData.username || formData.email.split('@')[0],
              email: formData.email,
              phoneNumber: formData.phoneNumber, 
              password: formData.password, 
              role: 'user',
              status: 'pending',
              joinedDate: new Date().toISOString(),
              lastLogin: ''
          };
          
          await saveUser(userPayload);

          // --- PERBAIKAN LOGIKA WHATSAPP ---
          
          // 1. Ambil nomor dari settings atau fallback ke nomor default yang diminta
          let adminNumber = settings.whatsappNumber || '6282335454864';
          
          // 2. Sanitasi Nomor Admin
          // Hapus semua karakter non-digit
          adminNumber = adminNumber.replace(/\D/g, '');
          // Ubah 08xxx jadi 628xxx jika perlu
          if (adminNumber.startsWith('0')) {
              adminNumber = '62' + adminNumber.slice(1);
          }

          // 3. Format Pesan Baru (Cukup Username & Email)
          const finalUsername = formData.username || formData.email.split('@')[0];
          const message = `Halo Admin Pakar Modul Ajar, mohon konfirmasi akun saya.\n\nUsername: ${finalUsername}\nEmail: ${formData.email}\n\nTerima kasih.`;
          
          const encodedMessage = encodeURIComponent(message);
          
          // Gunakan API WhatsApp universal
          const waUrl = `https://wa.me/${adminNumber}?text=${encodedMessage}`;
          
          // 4. UX: Tampilkan Sukses, lalu REDIRECT (bukan window.open)
          // window.open sering diblokir browser di mobile/async callback.
          // location.href lebih aman.
          swal.fire({
              title: 'Pendaftaran Berhasil!',
              text: 'Mengalihkan ke WhatsApp Admin...',
              icon: 'success',
              timer: 2000,
              showConfirmButton: false,
              willClose: () => {
                  window.location.href = waUrl;
              }
          });

      } catch (error: any) {
          swal.fire({
              title: 'Gagal Mendaftar',
              text: error.message || "Terjadi kesalahan sistem.",
              icon: 'error'
          });
          setIsSubmitting(false);
      }
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
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Username (ID Pengguna)</label>
                    <input 
                        type="text"
                        name="username" 
                        value={formData.username}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        placeholder="Contoh: budi123"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Nomor WhatsApp / HP</label>
                    <input 
                        type="tel"
                        name="phoneNumber" 
                        value={formData.phoneNumber}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        placeholder="08123456789"
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
                    disabled={isSubmitting}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-all shadow-md hover:shadow-lg mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <MessageCircle size={20} />}
                    {isSubmitting ? 'Memproses...' : 'DAFTAR & HUBUNGI ADMIN'}
                </button>
            </form>
         </div>
      </div>
    </div>
  );
};

export default RegisterPage;
