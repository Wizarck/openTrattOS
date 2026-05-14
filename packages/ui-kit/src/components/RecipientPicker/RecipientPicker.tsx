import { useState } from 'react';
import { cn } from '../../lib/cn';
import type { RecipientPickerProps } from './RecipientPicker.types';

/**
 * j9 region #5 — recipient picker (slice #15 m3-appcc-i18n-ui).
 *
 * Two states driven by `expanded`:
 *  - Collapsed: single strip "Enviar también por email →" with a small
 *    ghost button to expand.
 *  - Expanded: pre-configured contacts as checkboxes + an ad-hoc add
 *    input + a "Quitar" link per ad-hoc address.
 *
 * Email is opt-in per ADR-J9-RECIPIENT-PICKER-COLLAPSED-BY-DEFAULT.
 * The parent owns `expanded` + `selectedAddresses`. The ad-hoc add
 * input is internal state — once submitted, it becomes part of
 * `selectedAddresses` via `onChangeSelected`.
 */
export function RecipientPicker({
  expanded,
  onToggleExpanded,
  contacts,
  selectedAddresses,
  onChangeSelected,
  className,
}: RecipientPickerProps) {
  const [adhocInput, setAdhocInput] = useState('');

  const toggleAddress = (email: string) => {
    const set = new Set(selectedAddresses);
    if (set.has(email)) {
      set.delete(email);
    } else {
      set.add(email);
    }
    onChangeSelected(Array.from(set));
  };

  const addAdhoc = () => {
    const trimmed = adhocInput.trim();
    if (trimmed === '' || selectedAddresses.includes(trimmed)) return;
    onChangeSelected([...selectedAddresses, trimmed]);
    setAdhocInput('');
  };

  if (!expanded) {
    return (
      <div
        className={cn(
          'mt-4 flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm',
          className,
        )}
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
        }}
        data-component="recipient-picker"
        data-state="collapsed"
      >
        <div>
          <strong style={{ color: 'var(--color-ink)' }}>
            Enviar también por email
          </strong>
          <div
            className="mt-0.5 text-xs"
            style={{ color: 'var(--color-mute)' }}
          >
            {contacts.length} destinatario{contacts.length === 1 ? '' : 's'}{' '}
            pre-configurado{contacts.length === 1 ? '' : 's'} disponible
            {contacts.length === 1 ? '' : 's'}.
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggleExpanded(true)}
          className="rounded-md border bg-transparent px-3 py-1.5 text-sm"
          style={{
            color: 'var(--color-accent-press)',
            borderColor: 'var(--color-border-strong)',
          }}
        >
          Configurar →
        </button>
      </div>
    );
  }

  const adhocAddresses = selectedAddresses.filter(
    (a) => !contacts.some((c) => c.email === a),
  );

  return (
    <div
      className={cn(
        'mt-4 rounded-md border p-4 text-sm',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
      data-component="recipient-picker"
      data-state="expanded"
    >
      <div className="flex items-center justify-between gap-3">
        <strong style={{ color: 'var(--color-ink)' }}>
          Destinatarios para el envío
        </strong>
        <button
          type="button"
          onClick={() => onToggleExpanded(false)}
          className="bg-transparent text-sm"
          style={{ color: 'var(--color-mute)' }}
        >
          Ocultar
        </button>
      </div>

      <ul className="mt-3 list-none space-y-2 p-0">
        {contacts.map((c) => {
          const checked = selectedAddresses.includes(c.email);
          const id = `recipient-${c.id}`;
          return (
            <li key={c.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                id={id}
                checked={checked}
                onChange={() => toggleAddress(c.email)}
                style={{
                  width: '16px',
                  height: '16px',
                  accentColor: 'var(--color-accent)',
                }}
              />
              <label htmlFor={id} className="flex-1">
                <span style={{ color: 'var(--color-ink)' }}>{c.label}</span>
                <span
                  className="ml-2 text-xs"
                  style={{ color: 'var(--color-mute)' }}
                >
                  {c.email}
                </span>
              </label>
            </li>
          );
        })}
        {adhocAddresses.map((email) => (
          <li key={email} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={true}
              onChange={() => toggleAddress(email)}
              aria-label={`Quitar ${email}`}
              style={{
                width: '16px',
                height: '16px',
                accentColor: 'var(--color-accent)',
              }}
            />
            <span style={{ color: 'var(--color-ink)' }}>{email}</span>
            <span
              className="text-xs"
              style={{ color: 'var(--color-mute)' }}
            >
              (ad-hoc)
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-2 border-t pt-3"
        style={{ borderTopColor: 'var(--color-border)' }}
      >
        <input
          type="email"
          placeholder="nuevo@destinatario.com"
          value={adhocInput}
          onChange={(e) => setAdhocInput(e.target.value)}
          aria-label="Añadir destinatario ad-hoc"
          className="flex-1 rounded-md border px-2 py-1 text-sm"
          style={{
            backgroundColor: 'var(--color-bg)',
            borderColor: 'var(--color-border)',
            color: 'var(--color-ink)',
          }}
        />
        <button
          type="button"
          onClick={addAdhoc}
          disabled={adhocInput.trim() === ''}
          className="rounded-md border bg-transparent px-3 py-1.5 text-sm"
          style={{
            color:
              adhocInput.trim() === ''
                ? 'var(--color-mute)'
                : 'var(--color-accent-press)',
            borderColor: 'var(--color-border-strong)',
          }}
        >
          Añadir
        </button>
      </div>
    </div>
  );
}
