import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  // Prioritas pengambilan API Key
  const apiKey = env.API_KEY || env.VITE_API_KEY || process.env.API_KEY || process.env.VITE_API_KEY;

  return {
    plugins: [react()],
    define: {
      // Inject API Key ke dalam kode frontend secara spesifik
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
      // Optimasi Chunking untuk Vercel
      rollupOptions: {
        output: {
          manualChunks: {
            // Memisahkan library besar ke file terpisah
            // CATATAN: Jangan masukkan library CDN (seperti chart.js/sweetalert2) di sini
            vendor: ['react', 'react-dom'],
            ui: ['lucide-react'],
            utils: ['@google/genai', 'docx', 'file-saver', '@supabase/supabase-js']
          }
        }
      },
      // Meningkatkan batas peringatan chunk size
      chunkSizeWarningLimit: 1000
    }
  };
});