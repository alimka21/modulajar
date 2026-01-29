
import React, { useState } from 'react';
import { GraduationCap, ExternalLink, ArrowRight, Mail, Lock, X, Send } from 'lucide-react';
import { AppSettings } from '../types';

interface LoginPageProps {
  onLogin: (email: string, pass: string) => void;
  onGoToRegister: () => void;
  settings: AppSettings;
  error?: string | null;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onGoToRegister, settings, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Forgot Password State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotData, setForgotData] = useState({ name: '', email: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(email, password);
  };

  const handleForgotPassword = (e: React.FormEvent) => {
      e.preventDefault();
      const targetNumber = '62839829282';
      const message = `Halo Admin Pakar Modul Ajar, saya lupa kata sandi akun saya.\n\nNama: ${forgotData.name}\nEmail: ${forgotData.email}\n\nMohon bantuannya untuk reset kata sandi. Terima kasih.`;
      const url = `https://wa.me/${targetNumber}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
      setShowForgotModal(false);
      setForgotData({ name: '', email: '' });
  };

  return (
    <div className="min-h-screen bg-[#F0F4F9] flex flex-col items-center justify-center p-4 font-sans text-slate-900 relative">
      
      <div className="flex flex-col items-center mb-8 animate-fade-in-down">
         <div className="text-blue-600 mb-4 bg-white p-4 rounded-full shadow-sm">
           <GraduationCap size={48} strokeWidth={1.5} />
         </div>
         <h1 className="text-3xl font-black tracking-wide text-[#1f1f1f] leading-tight uppercase text-center">
            PAKAR MODUL AJAR
         </h1>
         <p className="text-sm text-slate-500 font-medium tracking-wide mt-1 text-center">
           Pembelajaran Mendalam
         </p>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden animate-fade-in-up">
         <div className="p-8">
            <h2 className="text-xl font-bold text-slate-800 mb-6">Masuk Akun</h2>
            
            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg flex items-center gap-2">
                    <div className="w-1 h-8 bg-red-500 rounded-full"></div>
                    <span>{error}</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Email / Username</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Mail className="text-slate-400" size={18} />
                        </div>
                        <input 
                            type="text" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                            placeholder="Masukkan email Anda"
                            required
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Kata Sandi</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock className="text-slate-400" size={18} />
                        </div>
                        <input 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                            placeholder="Masukkan kata sandi"
                            required
                        />
                    </div>
                </div>

                <div className="flex justify-end">
                    <button 
                        type="button"
                        onClick={() => setShowForgotModal(true)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                    >
                        Lupa Kata Sandi?
                    </button>
                </div>

                <button 
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all shadow-md hover:shadow-lg mt-2"
                >
                    MASUK SEKARANG
                </button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-100 text-center">
                <p className="text-sm text-slate-600 mb-4">Belum punya akun?</p>
                <button 
                    onClick={onGoToRegister}
                    className="flex items-center justify-center gap-2 text-blue-600 font-bold hover:underline mx-auto"
                >
                    Daftar Akun Baru <ArrowRight size={16} />
                </button>
            </div>
         </div>
         
         <div className="bg-slate-50 p-4 border-t border-slate-200 text-center">
             <a 
                href={settings.promoLink || "https://instagram.com/muh.alimka"} 
                target="_blank" 
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors"
             >
                <ExternalLink size={14} />
                <span>Dapatkan Pakar Modul Ajar</span>
             </a>
         </div>
      </div>
      
      {/* FORGOT PASSWORD MODAL */}
      {showForgotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm border border-slate-200 overflow-hidden animate-fade-in-up">
                  <div className="flex justify-between items-center p-4 border-b border-slate-100">
                      <h3 className="font-bold text-slate-800 text-lg">Reset Kata Sandi</h3>
                      <button onClick={() => setShowForgotModal(false)} className="text-slate-400 hover:text-slate-600">
                          <X size={20} />
                      </button>
                  </div>
                  <div className="p-6">
                      <p className="text-sm text-slate-600 mb-4">
                          Masukkan nama dan email terdaftar. Kami akan mengarahkan Anda ke WhatsApp Admin untuk verifikasi manual.
                      </p>
                      <form onSubmit={handleForgotPassword} className="space-y-3">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Nama Lengkap</label>
                              <input 
                                  type="text" 
                                  required
                                  value={forgotData.name}
                                  onChange={e => setForgotData({...forgotData, name: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500"
                                  placeholder="Nama sesuai akun"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Email Terdaftar</label>
                              <input 
                                  type="email" 
                                  required
                                  value={forgotData.email}
                                  onChange={e => setForgotData({...forgotData, email: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-500"
                                  placeholder="email@anda.com"
                              />
                          </div>
                          <button 
                              type="submit"
                              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-lg shadow-sm transition flex items-center justify-center gap-2 mt-2"
                          >
                              <Send size={16} />
                              Kirim ke WhatsApp
                          </button>
                      </form>
                  </div>
              </div>
          </div>
      )}

      <div className="mt-8 text-center">
        <p className="text-xs text-slate-400">
            &copy; 2026 Pengembangan AI by <a href="https://instagram.com/muh.alimka" target="_blank" rel="noreferrer" className="hover:text-blue-600 transition-colors font-medium">alimkadigital</a> - Hak Cipta Dilindungi
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
