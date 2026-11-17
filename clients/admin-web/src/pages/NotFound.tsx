import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { EmptyState } from '../components/ui';

export function NotFound() {
  return (
    <div className="page">
      <section className="card">
        <EmptyState
          icon={Compass}
          title="Esta página no existe"
          text="Puede que el enlace esté mal escrito. Vuelve al inicio para seguir."
          actions={
            <Link to="/" className="btn btn-primary">
              Ir al inicio
            </Link>
          }
        />
      </section>
    </div>
  );
}
