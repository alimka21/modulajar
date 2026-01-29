
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // API Key for Google Gemini
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Supabase Configuration
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
      'process.env.VITE_ADMIN_EMAIL': JSON.stringify(env.VITE_ADMIN_EMAIL),
      
      'process.env.NODE_ENV': JSON.stringify(mode),
      
      // Fallback for other process.env usage to prevent crashes
      'process.env': {} 
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  };
});
