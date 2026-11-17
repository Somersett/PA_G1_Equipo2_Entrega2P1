import type { ReactNode } from 'react';

export type FormVariant = 'drawer' | 'inline';

/** Acciones del formulario: en el pie del panel lateral o al final del bloque en línea. */
export function FormFooter({ variant, onCancel, children }: { variant: FormVariant; onCancel?: () => void; children: ReactNode }) {
  return (
    <div className={variant === 'drawer' ? 'drawer-footer' : 'form-actions'}>
      {onCancel ? (
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      ) : null}
      {children}
    </div>
  );
}
