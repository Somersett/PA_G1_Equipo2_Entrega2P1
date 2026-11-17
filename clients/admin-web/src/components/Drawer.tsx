import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DrawerProps {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Panel lateral modal. Mantiene el contexto de la página detrás, se cierra con Escape o clic fuera,
 * enfoca el primer campo al abrir y devuelve el foco al elemento que lo abrió.
 */
export function Drawer({ title, description, onClose, children }: DrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(
      'input:not([type="radio"]):not([disabled]), input[type="radio"]:checked, select, textarea, [data-autofocus]',
    );
    (first ?? panel.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && panel.current) {
        const focusable = panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        } else if (!event.shiftKey && document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <div className="drawer-header">
          <div>
            <h2 className="drawer-title" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="drawer-description" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar">
            <X aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}
