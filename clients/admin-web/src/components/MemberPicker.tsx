import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import type { Member } from '../api/types';
import { normalize } from '../lib/format';
import { Avatar } from './ui';

interface MemberPickerProps {
  members: Member[];
  onSelect: (member: Member) => void;
  /** Contenido a la derecha de cada opción (p. ej. estado de su membresía). */
  aside?: (member: Member) => ReactNode;
  placeholder?: string;
  label: string;
  autoFocus?: boolean;
  size?: 'lg';
  /** Permite enviar un id escrito a mano aunque no esté en la lista. */
  onSubmitId?: (id: number) => void;
}

const MAX_OPTIONS = 8;

/** Combobox accesible: busca por nombre, documento o número de miembro. */
export function MemberPicker({ members, onSelect, aside, placeholder, label, autoFocus, size, onSubmitId }: MemberPickerProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const options = useMemo(() => {
    const term = normalize(query.trim().replace(/^#/, ''));
    const filtered = term
      ? members.filter(
          (member) =>
            normalize(member.name).includes(term) || member.document.includes(term) || String(member.id) === term,
        )
      : members;
    return filtered.slice(0, MAX_OPTIONS);
  }, [members, query]);

  const choose = (member: Member) => {
    onSelect(member);
    setQuery('');
    setOpen(false);
    setActive(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[active];
      if (option && (open || query)) {
        choose(option);
      } else if (onSubmitId && /^#?\d+$/.test(query.trim())) {
        onSubmitId(Number(query.trim().replace('#', '')));
        setQuery('');
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const expanded = open && options.length > 0;

  return (
    <div className={`picker${size ? ` picker-${size}` : ''}`}>
      <label className="sr-only" htmlFor={`${listId}-input`}>
        {label}
      </label>
      <div className="input-group">
        <Search aria-hidden="true" />
        <input
          ref={inputRef}
          id={`${listId}-input`}
          className="input"
          type="text"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded ? `${listId}-opt-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder ?? 'Busca por nombre, documento o número'}
          value={query}
          autoFocus={autoFocus}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
      </div>
      {expanded ? (
        <ul className="picker-list" id={listId} role="listbox" aria-label={label}>
          {options.map((member, index) => (
            <li
              key={member.id}
              id={`${listId}-opt-${index}`}
              role="option"
              aria-selected={index === active}
              className="picker-option"
              onMouseDown={(event) => {
                event.preventDefault();
                choose(member);
              }}
              onMouseEnter={() => setActive(index)}
            >
              <Avatar name={member.name} id={member.id} />
              <span className="picker-option-text">
                <span className="cell-primary">{member.name}</span>
                <span className="cell-secondary">
                  #{member.id} · Doc. {member.document}
                </span>
              </span>
              {aside ? <span className="picker-aside">{aside(member)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {open && query && options.length === 0 ? (
        <div className="picker-list picker-empty" role="status">
          No hay miembros que coincidan con “{query}”.
          {onSubmitId && /^#?\d+$/.test(query.trim()) ? ' Presiona Enter para intentarlo con ese número.' : null}
        </div>
      ) : null}
    </div>
  );
}
