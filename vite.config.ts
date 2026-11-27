import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  plugins: [
    {
      name: 'serve-dynamic-glb-models',
      configureServer(server) {
        server.middlewares.use('/models', (req, res, next) => {
          const cleanUrl = (req.url || '').split('?')[0];
          if (cleanUrl === '/manifest.json') {
            const charsDir = path.resolve(process.cwd(), 'public', 'models', 'characters');
            const chars = fs.existsSync(charsDir)
              ? fs.readdirSync(charsDir).filter((f) => f.endsWith('.glb'))
              : [];
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ characters: chars }));
            return;
          }
          if (cleanUrl.includes('..')) {
            next();
            return;
          }
          const filePath = path.resolve(process.cwd(), 'public', 'models', '.' + cleanUrl);
          if (cleanUrl.endsWith('.glb') && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const stat = fs.statSync(filePath);
            res.setHeader('Content-Type', 'model/gltf-binary');
            res.setHeader('Content-Length', String(stat.size));
            res.setHeader('Cache-Control', 'no-cache');
            if (req.method === 'HEAD') {
              res.statusCode = 200;
              res.end();
              return;
            }
            fs.createReadStream(filePath).pipe(res);
            return;
          }
          next();
        });
      }
    }
  ],
  server: {
    port: 3000,
    open: false,
    watch: {
      // Ignore large binary .glb assets during user copy/drop operations to prevent Windows EBUSY lock crashes
      ignored: ['**/public/models/**']
    }
  }
});
