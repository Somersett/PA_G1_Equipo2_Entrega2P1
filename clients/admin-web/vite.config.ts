import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo (npm run dev) Vite reenvía /api/graphql igual que nginx en Docker. Es la única ruta de API:
// el panel solo habla con el GraphQL Gateway.
const gateway = process.env.GATEWAY_URL ?? 'http://localhost:8080';

// Para el navegador todo es del mismo origen; sin Origin el backend no trata la petición como CORS.
// Sin WWW-Authenticate el navegador no muestra su diálogo nativo de HTTP Basic.
const sameOrigin: ProxyOptions['configure'] = (proxy) => {
  proxy.on('proxyReq', (request) => request.removeHeader('origin'));
  proxy.on('proxyRes', (response) => {
    delete response.headers['www-authenticate'];
  });
};

const proxy: Record<string, ProxyOptions> = {
  '/api/graphql': {
    target: gateway,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/graphql/, '/graphql'),
    configure: sameOrigin,
  },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  build: { target: 'es2022', sourcemap: false },
});
