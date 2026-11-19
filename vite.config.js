import { existsSync } from 'node:fs';
import { defineConfig } from 'vite';
import { route } from './server/routes.js';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (process.env.CONTOUR_CREDENTIALS_FILE) process.loadEnvFile(process.env.CONTOUR_CREDENTIALS_FILE);

function localApi(server) {
  server.middlewares.use('/api', (req, res) => {
    const action = req.url.split('?')[0].replace(/^\//, '');
    return route(action, req, res, true);
  });
}

export default defineConfig({
  server: {
    watch: { ignored: ['**/cases/**', '**/examples/**'], usePolling: process.platform === 'win32', interval: 1000 },
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/cases/**'] },
  },
  plugins: [{ name: 'contour-local-api', configureServer: localApi, configurePreviewServer: localApi }],
});
