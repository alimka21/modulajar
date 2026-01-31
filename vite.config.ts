import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  // Prioritas pengambilan API Key:
  // 1. process.env.API_KEY (Vercel System Env)
  // 2. env.API_KEY (Local .env)
  // 3. env.VITE_API_KEY (Vite standard)
  const apiKey = process.env.API_KEY || env.API_KEY || env.VITE_API_KEY || '';

  return {
    plugins: [react()],
    define: {
      // Inject API Key ke dalam kode frontend
      // Jika apiKey kosong, aplikasi tetap build tapi AI akan gagal jika user tidak input key sendiri
      'process.env.API_KEY': JSON.stringify(apiKey),
      
      // Supabase Configuration
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY),
      'process.env.VITE_ADMIN_EMAIL': JSON.stringify(env.VITE_ADMIN_EMAIL || process.env.VITE_ADMIN_EMAIL),
      
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            ui: ['lucide-react'],
            utils: ['@google/genai', 'docx', 'file-saver', '@supabase/supabase-js']
          }
        }
      },
      chunkSizeWarningLimit: 1000
    }
  };
});