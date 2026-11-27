import os from 'node:os'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

function lanOrigin(port = 5173) {
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (/wsl|vethernet|docker|loopback|vmware|virtualbox/i.test(name)) continue
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) return `http://${addr.address}:${port}`
    }
  }
  return ''
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  define: command === 'serve' ? { 'import.meta.env.VITE_LAN_ORIGIN': JSON.stringify(lanOrigin(5173)) } : {},
  server: { host: '0.0.0.0', port: 5173, proxy: { '/api': 'http://127.0.0.1:8001' } },
}))
