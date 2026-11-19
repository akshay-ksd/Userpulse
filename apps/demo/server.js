import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const app = express();
const PORT = 3003;
const API_TARGET = 'http://localhost:3001';

app.use(express.static(join(__dirname, 'public')));

// Serve SDK dist files as ES modules
app.use('/sdk.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(join(root, 'packages/sdk/dist/index.js'));
});
app.use('/client.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(join(root, 'packages/sdk/dist/client.js'));
});
app.use('/types.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(join(root, 'packages/sdk/dist/types.js'));
});
app.use('/version.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(join(root, 'packages/sdk/dist/version.js'));
});

// Proxy all /api/* requests to the real API (strips /api prefix)
app.use('/api', createProxyMiddleware({
  target: API_TARGET,
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
  cookieDomainRewrite: { '*': '' },
}));

app.listen(PORT, () => {
  console.log(`Demo app running at http://localhost:${PORT}`);
  console.log(`API proxy: /api/* -> ${API_TARGET}`);
});
