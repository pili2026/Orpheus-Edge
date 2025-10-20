import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    vueDevTools(),
  ],
  
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  
  base: '/static/',
  
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: false,
    
    proxy: {
      '/api': {
        target: 'http://192.168.213.197:8000',
        changeOrigin: true,
        ws: true,
      }
    }
  },
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
})