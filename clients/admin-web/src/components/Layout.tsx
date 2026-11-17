import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Activity, DoorOpen, IdCard, Layers, LayoutDashboard, LogOut, Receipt, Route, Users } from 'lucide-react';
import { useMemberships, useMembers } from '../api/hooks';
import { useAuth } from '../auth/auth';
import { ConnectionBanner } from './ConnectionBanner';
import { DrawerHost } from './DrawerHost';
import { ErrorBoundary } from './ErrorBoundary';
import { SystemStatusButton } from './SystemStatus';

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="var(--lime-ink)">
        <rect x="1.5" y="8.5" width="3" height="7" rx="1" />
        <rect x="5.5" y="5.5" width="3.2" height="13" rx="1" />
        <rect x="8.7" y="10.8" width="6.6" height="2.4" />
        <rect x="15.3" y="5.5" width="3.2" height="13" rx="1" />
        <rect x="19.5" y="8.5" width="3" height="7" rx="1" />
      </svg>
    </span>
  );
}

const TITLES: Record<string, string> = {
  '/': 'Inicio',
  '/recorrido': 'Recorrido guiado',
  '/miembros': 'Miembros',
  '/membresias': 'Membresías',
  '/pagos': 'Pagos',
  '/planes': 'Planes',
  '/acceso': 'Control de acceso',
  '/eventos': 'Eventos Kafka',
};

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const members = useMembers();
  const memberships = useMemberships();
  const pending = (memberships.data ?? []).filter((membership) => membership.status === 'PENDING').length;

  useEffect(() => {
    const base = `/${location.pathname.split('/')[1] ?? ''}`;
    const title = TITLES[base] ?? 'Panel';
    document.title = `${title} · FET Gym`;
  }, [location.pathname]);

  return (
    <DrawerHost>
      <div className="app">
        <aside className="sidebar">
          <NavLink to="/" className="brand" aria-label="FET Gym, ir al inicio">
            <BrandMark />
            <span className="brand-text">
              <span className="brand-name">FET Gym</span>
              <br />
              <span className="brand-sub">Panel administrativo</span>
            </span>
          </NavLink>
          <nav className="nav" aria-label="Secciones">
            <div className="nav-group">
              <span className="nav-group-label">Operación</span>
              <NavLink to="/" end className="nav-link">
                <LayoutDashboard aria-hidden="true" />
                <span>Inicio</span>
              </NavLink>
              <NavLink to="/recorrido" className="nav-link">
                <Route aria-hidden="true" />
                <span>Recorrido guiado</span>
                <span className="nav-pill">Demo</span>
              </NavLink>
              <NavLink to="/acceso" className="nav-link">
                <DoorOpen aria-hidden="true" />
                <span>Control de acceso</span>
              </NavLink>
            </div>
            <div className="nav-group">
              <span className="nav-group-label">Administración</span>
              <NavLink to="/miembros" className="nav-link">
                <Users aria-hidden="true" />
                <span>Miembros</span>
                {members.data ? <span className="nav-count">{members.data.length}</span> : null}
              </NavLink>
              <NavLink to="/membresias" className="nav-link">
                <IdCard aria-hidden="true" />
                <span>Membresías</span>
                {pending > 0 ? (
                  <span className="nav-count" title={`${pending} pendientes de pago`}>
                    {pending} por pagar
                  </span>
                ) : null}
              </NavLink>
              <NavLink to="/pagos" className="nav-link">
                <Receipt aria-hidden="true" />
                <span>Pagos</span>
              </NavLink>
              <NavLink to="/planes" className="nav-link">
                <Layers aria-hidden="true" />
                <span>Planes</span>
              </NavLink>
            </div>
            <div className="nav-group">
              <span className="nav-group-label">Arquitectura</span>
              <NavLink to="/eventos" className="nav-link">
                <Activity aria-hidden="true" />
                <span>Eventos Kafka</span>
              </NavLink>
            </div>
          </nav>
          <div className="sidebar-footer">
            <SystemStatusButton />
            <div className="user-row">
              <span className="avatar" aria-hidden="true">
                {(user ?? '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="who">
                <span className="user-name">{user}</span>
                <br />
                <span className="user-role">Administrador</span>
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm logout"
                onClick={() => logout()}
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
              >
                <LogOut aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>
        <main className="main" id="contenido">
          <ConnectionBanner />
          {/* Un fallo al dibujar una pantalla no tumba el panel; al cambiar de sección se vuelve a intentar. */}
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </DrawerHost>
  );
}
