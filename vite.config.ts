import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // Bitta JS fayl: oddiy hosting va oflayn kesh uchun qulay.
  build: { rollupOptions: { output: { inlineDynamicImports: true } } },
})
