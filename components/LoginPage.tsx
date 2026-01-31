
import React, { useState, useEffect } from 'react';
import { GraduationCap, ExternalLink, ArrowRight, Mail, Lock, X, Send, Loader2, Eye, EyeOff, Facebook, Instagram } from 'lucide-react';
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
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Forgot Password State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotData, setForgotData] = useState({ name: '', email: '' });

  // Reset loading if error comes back
  useEffect(() => {
      if (error) setIsLoggingIn(false);
  }, [error]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    onLogin(email, password);
    // Timeout safety untuk mereset button jika tidak ada respon lama (network hang)
    setTimeout(() => setIsLoggingIn(false), 8000);
  };

  const handleForgotPassword = (e: React.FormEvent) => {
      e.preventDefault();
      const targetNumber = settings.whatsappNumber || '62839829282';
      const message = `Halo Admin Pakar Modul Ajar, saya lupa kata sandi akun saya.\n\nNama: ${forgotData.name}\nEmail: ${forgotData.email}\n\nMohon bantuannya untuk reset kata sandi. Terima kasih.`;
      const url = `https://wa.me/${targetNumber}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
      setShowForgotModal(false);
      setForgotData({ name: '', email: '' });
  };

  return (
    <div className="min-h-screen w-full flex bg-white font-sans overflow-hidden">
      
      {/* LEFT SIDE - BRANDING / HERO (Visible on Desktop) */}
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-blue-600 to-indigo-800 relative items-center justify-center p-12 text-white overflow-hidden">
         {/* Decorative Background Elements */}
         <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-white/10 rounded-full blur-3xl animate-pulse"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
         <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>

         <div className="relative z-10 flex flex-col items-center text-center max-w-md">
            <div className="bg-white/20 backdrop-blur-md p-6 rounded-3xl mb-8 shadow-xl border border-white/20 transform hover:scale-105 transition-transform duration-500">
                <GraduationCap size={70} strokeWidth={1.5} className="text-white drop-shadow-md" />
            </div>
            {/* FONT SIZE ADJUSTED HERE: Reduced from text-4xl/5xl to text-3xl/4xl */}
            <h1 className="text-3xl xl:text-4xl font-black tracking-tight leading-tight mb-4 drop-shadow-sm uppercase">
                PAKAR MODUL AJAR <br/> <span className="text-blue-200">AI GENERATOR</span>
            </h1>
            <p className="text-blue-100 text-lg font-medium leading-relaxed mb-8">
                Platform cerdas penyusun Modul Ajar Berbasis Pembelajaran Mendalam. Hemat waktu dan hasil presisi
            </p>
            
            {/* DEVELOPER INFO - SINGLE LINE - LEFT SIDE */}
            <div className="flex items-center gap-4 bg-white/10 px-5 py-2.5 rounded-full border border-white/10 backdrop-blur-sm hover:bg-white/20 transition-all cursor-default shadow-lg">
                 <span className="text-xs font-medium text-blue-100">Dev by <strong className="text-white">Muhammad Alimka</strong></span>
                 <div className="w-px h-3 bg-blue-200/30"></div>
                 <div className="flex items-center gap-3 text-blue-200">
                     <a href="https://www.tiktok.com/@muh.alimka" target="_blank" rel="noreferrer" className="hover:text-white hover:scale-110 transition-all" title="TikTok">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>
                     </a>
                     <a href="https://web.facebook.com/muhammad.alimka/" target="_blank" rel="noreferrer" className="hover:text-white hover:scale-110 transition-all" title="Facebook">
                         <Facebook size={14} fill="currentColor" strokeWidth={0} />
                     </a>
                     <a href="https://www.instagram.com/muh.alimka/" target="_blank" rel="noreferrer" className="hover:text-white hover:scale-110 transition-all" title="Instagram">
                         <Instagram size={14} />
                     </a>
                 </div>
            </div>

         </div>
      </div>

      {/* RIGHT SIDE - LOGIN FORM */}
      <div className="w-full lg:w-[55%] flex flex-col items-center justify-center p-6 lg:p-12 relative bg-slate-50/30">
        
         <div className="w-full max-w-[420px] mx-auto animate-fade-in-up">
            {/* Mobile Logo (Visible only on small screens) */}
            <div className="lg:hidden flex flex-col items-center mb-8">
                <div className="text-blue-600 bg-blue-50 p-4 rounded-2xl mb-3">
                    <GraduationCap size={40} />
                </div>
                {/* FONT SIZE ADJUSTED HERE FOR MOBILE: Reduced from text-2xl to text-xl */}
                <h2 className="text-xl font-black text-slate-800 uppercase text-center leading-tight">
                    PAKAR MODUL AJAR
                    <br />
                    <span className="text-blue-600 text-sm">AI GENERATOR</span>
                </h2>
            </div>

            <div className="bg-white p-8 lg:p-10 rounded-2xl shadow-xl border border-slate-100">
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-slate-800">Selamat Datang</h2>
                    <p className="text-slate-500 text-sm mt-1">Masuk untuk mulai menyusun modul ajar.</p>
                </div>

                {error && (
                    <div className="mb-6 p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-lg flex items-start gap-2 animate-fade-in">
                        <X size={16} className="mt-0.5 flex-none" />
                        <span className="font-semibold leading-relaxed">{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide ml-1">Email / Username</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <Mail className="text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                            </div>
                            <input 
                                type="text" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                placeholder="Masukkan email anda"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex justify-between items-center ml-1">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Kata Sandi</label>
                            <button 
                                type="button"
                                onClick={() => setShowForgotModal(true)}
                                className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline transition-colors"
                            >
                                Lupa sandi?
                            </button>
                        </div>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                <Lock className="text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                            </div>
                            <input 
                                type={showPassword ? "text" : "password"} 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                placeholder="••••••••"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    <button 
                        type="submit"
                        disabled={isLoggingIn}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 mt-2 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                    >
                        {isLoggingIn ? <Loader2 className="animate-spin" size={18} /> : null}
                        {isLoggingIn ? 'Memproses...' : 'Masuk Sekarang'}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                    <p className="text-sm text-slate-500 mb-4">Belum memiliki akun?</p>
                    <button 
                        onClick={onGoToRegister}
                        className="w-full py-3 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 group text-sm"
                    >
                        Daftar Akun Baru <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>

            <div className="mt-8 text-center">
                <a 
                    href={settings.promoLink || "https://instagram.com/muh.alimka"} 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-wider"
                >
                    <ExternalLink size={12} />
                    <span>Info Lengkap Pakar Modul Ajar</span>
                </a>
                <p className="text-[10px] text-slate-300 mt-2">&copy; 2026 Alimka Digital</p>
            </div>
         </div>
      </div>
      
      {/* FORGOT PASSWORD MODAL */}
      {showForgotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up ring-1 ring-white/20">
                  <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
                      <h3 className="font-bold text-slate-800 text-sm">Reset Kata Sandi</h3>
                      <button onClick={() => setShowForgotModal(false)} className="text-slate-400 hover:text-red-500 transition-colors bg-white p-1 rounded-full shadow-sm">
                          <X size={18} />
                      </button>
                  </div>
                  <div className="p-6">
                      <div className="flex gap-3 mb-5 bg-blue-50 p-3 rounded-lg border border-blue-100">
                          <div className="text-blue-600 mt-0.5"><Lock size={18} /></div>
                          <p className="text-xs text-slate-600 leading-relaxed">
                              Masukkan data akun Anda. Kami akan mengarahkan Anda ke WhatsApp Admin untuk verifikasi manual.
                          </p>
                      </div>
                      <form onSubmit={handleForgotPassword} className="space-y-4">
                          <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Nama Lengkap</label>
                              <input 
                                  type="text" 
                                  required
                                  value={forgotData.name}
                                  onChange={e => setForgotData({...forgotData, name: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Email Terdaftar</label>
                              <input 
                                  type="email" 
                                  required
                                  value={forgotData.email}
                                  onChange={e => setForgotData({...forgotData, email: e.target.value})}
                                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"
                              />
                          </div>
                          <button 
                              type="submit"
                              className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-2.5 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 mt-2 text-sm"
                          >
                              <Send size={16} />
                              Kirim via WhatsApp
                          </button>
                      </form>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default LoginPage;
