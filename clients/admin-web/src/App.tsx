import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from './auth/auth';
import { Layout } from './components/Layout';
import { Access } from './pages/Access';
import { Dashboard } from './pages/Dashboard';
import { Events } from './pages/Events';
import { Login } from './pages/Login';
import { MemberDetail } from './pages/MemberDetail';
import { Members } from './pages/Members';
import { Memberships } from './pages/Memberships';
import { NotFound } from './pages/NotFound';
import { Payments } from './pages/Payments';
import { Plans } from './pages/Plans';
import { Tour } from './pages/Tour';

export function App() {
  const { user } = useAuth();
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="recorrido" element={<Tour />} />
        <Route path="miembros" element={<Members />} />
        <Route path="miembros/:memberId" element={<MemberDetail />} />
        <Route path="membresias" element={<Memberships />} />
        <Route path="pagos" element={<Payments />} />
        <Route path="planes" element={<Plans />} />
        <Route path="acceso" element={<Access />} />
        <Route path="eventos" element={<Events />} />
        <Route path="ingresar" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
