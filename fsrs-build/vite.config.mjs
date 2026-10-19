import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  base:'./',
  build:{
    target:'esnext',
    outDir:resolve(process.cwd(),'../fsrs-trainer/build'),
    emptyOutDir:true,
    rollupOptions:{
      input:resolve(process.cwd(),'optimizer.js'),
      output:{entryFileNames:'optimizer.js',chunkFileNames:'chunks/[name]-[hash].js',assetFileNames:'assets/[name]-[hash][extname]'}
    }
  },
  worker:{format:'es'},
  optimizeDeps:{exclude:['fsrs-browser']}
});
