import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { encodeBasic, setToken, setUnauthorizedHandler } from '../api/client';
import { graphql } from '../api/graphql';

// Sesión del panel: HTTP Basic (RNF-07) con la credencial de clientes del GraphQL Gateway, su única puerta de
// entrada. Se guarda solo en sessionStorage, así que se borra al cerrar la pestaña.

const STORAGE_KEY = 'fetgym.session';

interface Session {
  username: string;
  token: string;
}

interface AuthValue {
  user: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: (reason?: string) => void;
  notice: string | null;
}

const AuthContext = createContext<AuthValue | null>(null);

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    // Una sesión guardada dañada o de otra versión se descarta en vez de romper el panel.
    return typeof parsed?.username === 'string' && typeof parsed?.token === 'string'
      ? { username: parsed.username, token: parsed.token }
      : null;
  } catch {
    return null;
  }
}

/**
 * Valida la credencial contra el gateway sin tocar ningún servicio: { __typename } se resuelve en él, así
 * que se puede ingresar aunque los servicios estén caídos (el panel lo informa después). El error se
 * propaga tal cual para que la pantalla de ingreso explique la causa real (clave, red o gateway).
 */
async function verify(token: string) {
  await graphql('{ __typename }', undefined, { token, silent401: true });
}

function persist(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Navegación privada o almacenamiento bloqueado: la sesión dura mientras la página siga abierta.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(() => {
    const stored = readSession();
    setToken(stored?.token ?? null);
    return stored;
  });
  const [notice, setNotice] = useState<string | null>(null);

  const logout = useCallback(
    (reason?: string) => {
      persist(null);
      setToken(null);
      setSession(null);
      setNotice(reason ?? null);
      queryClient.clear();
    },
    [queryClient],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => logout('Tu sesión ya no es válida. Ingresa de nuevo.'));
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const login = useCallback(async (username: string, password: string) => {
    const token = encodeBasic(username.trim(), password);
    await verify(token);
    const next = { username: username.trim(), token };
    persist(next);
    setToken(token);
    setNotice(null);
    setSession(next);
  }, []);

  const value = useMemo(
    () => ({ user: session?.username ?? null, login, logout, notice }),
    [session, login, logout, notice],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
