
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Argumen ke-3 '' artinya load SEMUA env vars, bukan cuma yang VITE_
  const env = loadEnv(mode, process.cwd(), '');
  
  // Prioritas pengambilan API Key:
  // 1. API_KEY (dari Vercel Environment Variables biasanya tanpa VITE_)
  // 2. VITE_API_KEY (jika user set pakai prefix VITE_)
  // 3. process.env.API_KEY (fallback Node process)
  const apiKey = env.API_KEY || env.VITE_API_KEY || process.env.API_KEY || process.env.VITE_API_KEY;

  return {
    plugins: [react()],
    define: {
      // Inject API Key ke dalam kode frontend secara aman
      'process.env.API_KEY': JSON.stringify(apiKey),
      
      // Supabase Configuration
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY),
      'process.env.VITE_ADMIN_EMAIL': JSON.stringify(env.VITE_ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL),
      
      'process.env.NODE_ENV': JSON.stringify(mode),
      
      // Polyfill process.env agar tidak error jika diakses sembarangan
      'process.env': {} 
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});
