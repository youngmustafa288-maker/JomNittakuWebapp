import {defineConfig} from 'vite';
export default defineConfig(({mode})=>({build:mode==='studio'?{rollupOptions:{input:'preview.html'}}:{}}));
