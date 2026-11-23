import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// En desarrollo, /api se redirige a la API de C#, así la tablet o el celular
// (que abren http://IP-de-tu-PC:5173) no necesitan saber dónde está el backend.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5273, strictPort: true,
    proxy: { '/api': { target: 'http://localhost:5080', changeOrigin: true } },
  },
})
