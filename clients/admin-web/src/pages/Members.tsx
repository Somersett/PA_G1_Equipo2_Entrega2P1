import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, Search, UserPlus, Users } from 'lucide-react';
import { useLookups } from '../api/hooks';
import { useDrawers } from '../components/DrawerHost';
import { Avatar, EmptyState, ErrorNotice, ErrorState, MembershipBadge, NoMembershipBadge, PageHeader, SkeletonRows } from '../components/ui';
import { formatRelative, normalize, plural } from '../lib/format';

type Filter = 'all' | 'ACTIVE' | 'PENDING' | 'none';

export function Members() {
  const { open } = useDrawers();
  const navigate = useNavigate();
  const { members, currentMembership, planById } = useLookups();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const list = members.data ?? [];
  const counts = useMemo(() => {
    let active = 0;
    let pending = 0;
    let none = 0;
    for (const member of list) {
      const status = currentMembership.get(member.id)?.status;
      if (status === 'ACTIVE') active += 1;
      else if (status === 'PENDING') pending += 1;
      else none += 1;
    }
    return { all: list.length, ACTIVE: active, PENDING: pending, none };
  }, [list, currentMembership]);

  const rows = useMemo(() => {
    const term = normalize(query.trim().replace(/^#/, ''));
    return list.filter((member) => {
      const status = currentMembership.get(member.id)?.status;
      if (filter === 'ACTIVE' && status !== 'ACTIVE') return false;
      if (filter === 'PENDING' && status !== 'PENDING') return false;
      if (filter === 'none' && (status === 'ACTIVE' || status === 'PENDING')) return false;
      if (!term) return true;
      return (
        normalize(member.name).includes(term) ||
        member.document.includes(term) ||
        String(member.id) === term ||
        normalize(member.email ?? '').includes(term)
      );
    });
  }, [list, query, filter, currentMembership]);

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'ACTIVE', label: 'Con membresía activa' },
    { id: 'PENDING', label: 'Pendientes de pago' },
    { id: 'none', label: 'Sin membresía vigente' },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Miembros"
        description="Personas registradas en el gimnasio. Abre cualquiera para ver su ficha consolidada."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => open({ kind: 'member' })}>
            <UserPlus aria-hidden="true" />
            Registrar miembro
          </button>
        }
      />

      {members.error && members.data ? (
        <ErrorNotice error={members.error} onRetry={() => members.refetch()} retrying={members.isFetching} stale />
      ) : null}

      <section className="card">
        {members.error && !members.data ? (
          <ErrorState
            error={members.error}
            title="No se pudo cargar la lista de miembros"
            onRetry={() => members.refetch()}
            retrying={members.isFetching}
          />
        ) : null}
        {list.length > 0 ? (
          <div className="toolbar">
            <div className="input-group">
              <Search aria-hidden="true" />
              <input
                className="input"
                type="search"
                placeholder="Buscar por nombre, documento, correo o número"
                aria-label="Buscar miembros"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="segmented" role="group" aria-label="Filtrar por estado">
              {filters.map((item) => (
                <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                  {item.label}
                  <span className="count">{counts[item.id]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {members.error && !members.data ? null : !members.isLoading && list.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Todavía no hay miembros"
            text="Registra al primero para asignarle un plan y dejarlo entrar al gimnasio."
            actions={
              <button type="button" className="btn btn-primary" onClick={() => open({ kind: 'member' })}>
                <UserPlus aria-hidden="true" />
                Registrar miembro
              </button>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Miembro</th>
                  <th scope="col">Documento</th>
                  <th scope="col">Teléfono</th>
                  <th scope="col">Membresía</th>
                  <th scope="col">Registrado</th>
                  <th scope="col" aria-hidden="true" />
                </tr>
              </thead>
              {members.isLoading ? (
                <SkeletonRows columns={5} />
              ) : (
                <tbody>
                  {rows.map((member) => {
                    const membership = currentMembership.get(member.id);
                    const plan = membership ? planById.get(membership.planId) : undefined;
                    const go = () => navigate(`/miembros/${member.id}`);
                    return (
                      <tr
                        key={member.id}
                        className="is-clickable"
                        onClick={go}
                        tabIndex={0}
                        onKeyDown={(event) => event.key === 'Enter' && go()}
                        aria-label={`Abrir la ficha de ${member.name}`}
                      >
                        <td>
                          <div className="person">
                            <Avatar name={member.name} id={member.id} />
                            <div className="cell-stack">
                              <span className="cell-primary">{member.name}</span>
                              <span className="cell-secondary">{member.email ?? `Miembro #${member.id}`}</span>
                            </div>
                          </div>
                        </td>
                        <td className="mono">{member.document}</td>
                        <td>{member.phone}</td>
                        <td>
                          <div className="cell-stack" style={{ justifyItems: 'start', gap: 4 }}>
                            {membership ? <MembershipBadge status={membership.status} /> : <NoMembershipBadge />}
                            {plan ? <span className="cell-secondary">Plan {plan.name}</span> : null}
                          </div>
                        </td>
                        <td className="cell-secondary" title={new Date(member.createdAt).toLocaleString('es-CO')}>
                          {formatRelative(member.createdAt)}
                        </td>
                        <td className="align-right row-go" aria-hidden="true">
                          <ChevronRight />
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 32 }}>
                        Ningún miembro coincide con la búsqueda.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              )}
            </table>
          </div>
        )}
        {list.length > 0 ? (
          <div className="card-footer muted">
            Mostrando {plural(rows.length, 'miembro')} de {list.length}
          </div>
        ) : null}
      </section>
    </div>
  );
}
