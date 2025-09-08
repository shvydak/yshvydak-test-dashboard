import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import * as dotenv from 'dotenv'

// Load .env file explicitly for vite.config.ts
dotenv.config({ path: path.resolve(__dirname, '../..', '.env') })

// Load environment variables for configuration

// https://vitejs.dev/config/
export default defineConfig({
     plugins: [react()],
     envDir: '../..', // Load .env from project root
     resolve: {
          alias: {
               '@': path.resolve(__dirname, './src'),
               '@yshvydak/core': path.resolve(__dirname, '../core/src'),
          },
     },
     server: {
          // Derive web port: if VITE_PORT is set, use it; otherwise use PORT + 1000 offset; fallback to 4001
          port: parseInt(process.env.VITE_PORT || (process.env.PORT ? (parseInt(process.env.PORT) -1 ).toString() : '4001')),
          host: true,
     },
     build: {
          outDir: 'dist',
          sourcemap: true,
     },
})
