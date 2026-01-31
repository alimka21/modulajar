
import React, { useState } from 'react';
import { ArrowLeft, MessageCircle, Loader2, Eye, EyeOff } from 'lucide-react';
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
      password: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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

      setIsSubmitting(true);
      
      try {
          // Password will be hashed/handled by Supabase Auth
          const userPayload: User = {
              id: '', // Supabase will assign ID
              name: formData.name,
              username: formData.username || formData.email.split('@')[0],
              email: formData.email,
              password: formData.password, // Raw password required for SignUp
              role: 'user',
              status: 'pending',
              joinedDate: new Date().toISOString(),
              lastLogin: ''
          };
          
          // 1. Save to Supabase
          await saveUser(userPayload);

          // 2. Prepare WhatsApp URL (Format: wa.me)
          const targetNumber = settings.whatsappNumber ? settings.whatsappNumber.replace(/[^0-9]/g, '') : '62839829282'; // Default fallback number
          const message = `Halo Admin Pakar Modul Ajar, saya sudah mendaftar.\n\nNama: ${formData.name}\nEmail: ${formData.email}\nUsername: ${formData.username}\n\nMohon verifikasi akun saya agar bisa login. Terima kasih.`;
          const waUrl = `https://wa.me/${targetNumber}?text=${encodeURIComponent(message)}`;
          
          // 3. Show Success & Redirect
          // REMOVED TIMER: User must click "OK/Kirim WA" to proceed, fixing the redirect timing issue.
          swal.fire({
              title: 'Pendaftaran Berhasil!',
              text: 'Klik tombol di bawah untuk verifikasi ke Admin via WhatsApp.',
              icon: 'success',
              confirmButtonText: 'Kirim ke WA & Login',
              confirmButtonColor: '#25D366',
              showCancelButton: false,
              allowOutsideClick: false,
          }).then((result: any) => {
              if (result.isConfirmed) {
                  // Action saat alert dikonfirmasi user
                  window.open(waUrl, '_blank');
                  onBack(); // Redirect ke Halaman Login
              }
          });

      } catch (error: any) {
          swal.fire({
              title: 'Gagal Mendaftar',
              text: error.message || "Terjadi kesalahan sistem.",
              icon: 'error'
          });
      } finally {
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
                Isi data diri Anda. Sistem akan otomatis mengarahkan ke WhatsApp Admin untuk aktivasi setelah daftar.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Nama Lengkap</label>
                    <input 
                        type="text"
                        name="name" 
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        placeholder="Contoh: Muhammad Alimka"
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
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        placeholder="Contoh: alimka123"
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
                        className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                        placeholder="Contoh: emailanda@gmail.com"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Kata Sandi</label>
                    <div className="relative">
                        <input 
                            type={showPassword ? "text" : "password"}
                            name="password" 
                            value={formData.password}
                            onChange={handleChange}
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition pr-10"
                            placeholder="Buat kata sandi aman"
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                        >
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>
                </div>

                <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition-all shadow-md hover:shadow-lg mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <MessageCircle size={20} />}
                    {isSubmitting ? 'Mendaftarkan...' : 'DAFTAR & HUBUNGI ADMIN'}
                </button>
            </form>
         </div>
      </div>
    </div>
  );
};

export default RegisterPage;
