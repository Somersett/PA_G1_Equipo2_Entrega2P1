import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast, Toaster } from 'sonner';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/layout.css';
import './styles/pages.css';
import { AuthProvider } from './auth/auth';
import { ErrorBoundary } from './components/ErrorBoundary';
import { describeError } from './lib/errors';
import { App } from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2_000,
      refetchOnWindowFocus: true,
      // Solo se reintenta lo que puede arreglarse solo (red, gateway o servicio caído), nunca un 401 ni un
      // dato inválido. Espera creciente entre intentos: 1 s, 2 s.
      retry: (count, error) => count < 2 && describeError(error).retryable,
      retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 4_000),
    },
  },
});

// Red de seguridad: un error que ninguna pantalla atrapó se informa con un aviso breve, una sola vez por
// mensaje, en vez de pasar inadvertido en la consola.
let lastUnexpected = { text: '', at: 0 };
function reportUnexpected(reason: unknown) {
  const text = reason instanceof Error ? reason.message : String(reason ?? '');
  if (!text || text.includes('ResizeObserver')) return;
  if (text === lastUnexpected.text && Date.now() - lastUnexpected.at < 5_000) return;
  lastUnexpected = { text, at: Date.now() };
  const info = describeError(reason);
  toast.error(info.title, { description: info.hint ?? info.message, duration: 8_000 });
}
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Panel] Promesa rechazada sin manejar', event.reason);
  reportUnexpected(event.reason);
});
window.addEventListener('error', (event) => {
  if (!(event instanceof ErrorEvent) || !event.error) return;
  console.error('[Panel] Error sin manejar', event.error);
  reportUnexpected(event.error);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary scope="app">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <App />
            <Toaster position="bottom-right" closeButton offset={20} gap={10} toastOptions={{ duration: 6_000 }} />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
