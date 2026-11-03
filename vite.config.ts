import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset paths work both at a domain root and under /<repository>/.
  base: './',
  plugins: [react()],
})
