import { useState, type FormEvent } from 'react';
import { Mail, UserPlus, X } from 'lucide-react';
import { useCurrentOrgId } from '../../lib/currentUser';
import { useUsersQuery } from '../../hooks/useUsers';
import {
  useCreateInvitationMutation,
  usePendingInvitationsQuery,
  useRevokeInvitationMutation,
} from '../../hooks/useInvitations';
import { USER_ROLES, type UserResponse, type UserRole } from '../../api/users';
import type { InvitationResponse } from '../../api/invitations';

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Propietario',
  MANAGER: 'Encargado',
  STAFF: 'Personal',
};

/**
 * Equipo · Sprint 4 W2-2b — backs `/users/*` + `/users/invitations/*`.
 *
 * Two surfaces:
 *   1. Pending-invitation flow (invite by email, list pending, revoke).
 *      The W2-2a backend creates an `user_invitations` row + dispatches
 *      an email; the user is materialised only when the invitee accepts.
 *   2. Existing-users list (untouched from Sprint 3 Block B).
 *
 * The provisional-password card (PR #217) is gone — the invitation flow
 * supersedes it. The "log in via standard flow after accept" handoff
 * remains a known followup until R8 ships real session issuance.
 */
export function OwnerUsersSection() {
  const orgId = useCurrentOrgId();
  if (!orgId) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Inicia sesión para gestionar el equipo.
      </p>
    );
  }
  return <Content orgId={orgId} />;
}

function Content({ orgId }: { orgId: string }) {
  const usersQuery = useUsersQuery(orgId);
  const invitationsQuery = usePendingInvitationsQuery(orgId);
  const [formOpen, setFormOpen] = useState(false);

  return (
    <section className="space-y-6" aria-label="Equipo">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">Equipo</h2>
          <p className="mt-1 text-sm text-mute">
            Quién puede ver y modificar datos de tu cocina. Cada acción queda firmada en el
            registro de auditoría por su autor.
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            <UserPlus aria-hidden="true" size={14} />
            Invitar usuario
          </button>
        )}
      </header>

      {formOpen && (
        <InviteForm
          orgId={orgId}
          onCancel={() => setFormOpen(false)}
          onDone={() => setFormOpen(false)}
        />
      )}

      <PendingInvitationsPanel
        orgId={orgId}
        loading={invitationsQuery.isLoading}
        error={invitationsQuery.error?.message ?? null}
        rows={invitationsQuery.data ?? []}
      />

      <div>
        <h3 className="mb-3 text-base font-semibold text-ink">Usuarios actuales</h3>
        {usersQuery.isLoading && <p className="text-sm text-mute">Cargando equipo…</p>}
        {usersQuery.error && (
          <p role="alert" className="text-sm text-(--color-danger-fg)">
            No se pudo cargar la lista: {usersQuery.error.message}
          </p>
        )}
        {usersQuery.data && <UsersTable rows={usersQuery.data} />}
      </div>
    </section>
  );
}

function UsersTable({ rows }: { rows: UserResponse[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
        Aún no hay usuarios. Usa «Invitar usuario» para añadir al primero.
      </p>
    );
  }
  return (
    <article className="rounded-lg border border-border-subtle">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-mute">
              <th className="px-4 py-3 font-medium">
                <Mail aria-hidden="true" size={12} className="mr-1 inline" />
                Email
              </th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3 font-mono text-ink">{row.email}</td>
                <td className="px-4 py-3 text-ink">{row.name}</td>
                <td className="px-4 py-3 text-mute">{ROLE_LABELS[row.role]}</td>
                <td className="px-4 py-3">
                  <span
                    className={[
                      'inline-flex items-center rounded-full border border-border-subtle px-2 py-0.5 text-[10px] uppercase tracking-wide',
                      row.isActive
                        ? 'bg-(--color-success-bg) text-(--color-success-fg)'
                        : 'bg-(--color-bg) text-mute',
                    ].join(' ')}
                  >
                    {row.isActive ? 'activo' : 'inactivo'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function InviteForm({
  orgId,
  onCancel,
  onDone,
}: {
  orgId: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const mutation = useCreateInvitationMutation(orgId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('STAFF');

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  const canSubmit = validEmail && !mutation.isPending;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    const trimmedEmail = email.trim().toLowerCase();
    mutation.mutate(
      { email: trimmedEmail, role },
      {
        onSuccess: () => {
          setEmail('');
          setRole('STAFF');
          onDone();
        },
      },
    );
  };

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Invitar usuario"
      className="space-y-3 rounded-lg border border-border-subtle bg-(--color-bg) p-5"
    >
      <h3 className="text-base font-semibold text-ink">Nueva invitación</h3>
      <p className="text-xs text-mute">
        Enviaremos un email con un enlace de aceptación. La persona elegirá su contraseña al
        entrar. El enlace caduca a los 7 días.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="invite-email" className="mb-1 block text-sm font-medium text-mute">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={320}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          />
        </div>
        <div>
          <label htmlFor="invite-role" className="mb-1 block text-sm font-medium text-mute">
            Rol
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {mutation.error && (
        <p role="alert" className="text-sm text-(--color-danger-fg)">
          No se pudo enviar la invitación: {mutation.error.message}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={mutation.isPending}
          className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-transparent px-3 py-1.5 text-sm font-medium text-mute transition hover:bg-(--color-bg) focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
        >
          {mutation.isPending ? 'Enviando…' : 'Enviar invitación'}
        </button>
      </div>
    </form>
  );
}

function PendingInvitationsPanel({
  orgId,
  loading,
  error,
  rows,
}: {
  orgId: string;
  loading: boolean;
  error: string | null;
  rows: InvitationResponse[];
}) {
  return (
    <div>
      <h3 className="mb-3 text-base font-semibold text-ink">Invitaciones pendientes</h3>
      {loading && <p className="text-sm text-mute">Cargando invitaciones…</p>}
      {error && (
        <p role="alert" className="text-sm text-(--color-danger-fg)">
          No se pudieron cargar las invitaciones: {error}
        </p>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className="rounded-md border border-dashed border-border-strong p-6 text-sm text-mute">
          No hay invitaciones pendientes.
        </p>
      )}
      {!loading && !error && rows.length > 0 && (
        <PendingInvitationsTable orgId={orgId} rows={rows} />
      )}
    </div>
  );
}

function PendingInvitationsTable({
  orgId,
  rows,
}: {
  orgId: string;
  rows: InvitationResponse[];
}) {
  const revoke = useRevokeInvitationMutation(orgId);
  return (
    <article className="rounded-lg border border-border-subtle">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left text-xs uppercase tracking-wide text-mute">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Enviada</th>
              <th className="px-4 py-3 font-medium">Expira</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isRevoking = revoke.isPending && revoke.variables === row.id;
              return (
                <tr key={row.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-3 font-mono text-ink">{row.email}</td>
                  <td className="px-4 py-3 text-mute">{ROLE_LABELS[row.role]}</td>
                  <td className="px-4 py-3 text-mute">{formatRelativePast(row.createdAt)}</td>
                  <td className="px-4 py-3 text-mute">{formatRelativeFuture(row.expiresAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => revoke.mutate(row.id)}
                      disabled={isRevoking}
                      className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-transparent px-2.5 py-1 text-xs font-medium text-mute transition hover:bg-(--color-danger-bg) hover:text-(--color-danger-fg) focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
                      aria-label={`Revocar invitación de ${row.email}`}
                    >
                      <X aria-hidden="true" size={12} />
                      {isRevoking ? 'Revocando…' : 'Revocar'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {revoke.error && (
        <p role="alert" className="border-t border-border-subtle px-4 py-2 text-xs text-(--color-danger-fg)">
          No se pudo revocar: {revoke.error.message}
        </p>
      )}
    </article>
  );
}

// ============================================================================
// Relative-time helpers — small + dependency-free; enough for the
// "enviada hace 3 días" / "expira en 5 días" copy. Falls back to a
// localised date when the offset crosses 14 days.
// ============================================================================

function formatRelativePast(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  return formatRelative(diffMs, 'past');
}

function formatRelativeFuture(iso: string, now: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  return formatRelative(diffMs, 'future');
}

function formatRelative(diffMs: number, dir: 'past' | 'future'): string {
  if (!Number.isFinite(diffMs)) return '—';
  if (dir === 'future' && diffMs <= 0) return 'caducada';
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < hour) {
    const n = Math.max(1, Math.round(abs / minute));
    return dir === 'past' ? `hace ${n} min` : `en ${n} min`;
  }
  if (abs < day) {
    const n = Math.max(1, Math.round(abs / hour));
    return dir === 'past' ? `hace ${n} h` : `en ${n} h`;
  }
  const n = Math.max(1, Math.round(abs / day));
  if (n <= 14) {
    return dir === 'past' ? `hace ${n} días` : `en ${n} días`;
  }
  // Long horizons: fall back to a date so the operator gets an exact
  // reference instead of "hace 27 días".
  return new Date(dir === 'past' ? Date.now() - abs : Date.now() + abs).toLocaleDateString(
    'es-ES',
    { day: '2-digit', month: 'short', year: 'numeric' },
  );
}
