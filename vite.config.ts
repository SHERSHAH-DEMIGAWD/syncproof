import { defineConfig } from 'vite';
export default defineConfig({ root: 'client', build: { outDir: '../dist-client', emptyOutDir: true }, server: { host: '127.0.0.1', port: 5174, strictPort: true, proxy: { "/api": { target: "http://127.0.0.1:3000", rewrite: path => path.replace(/^\/api/, "") } } } });
