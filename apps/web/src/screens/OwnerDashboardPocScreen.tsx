import { useSearchParams } from 'react-router-dom';
import { AllergenBadge, MarginPanel } from '@opentrattos/ui-kit';
import { useAllergens, useMargin, useMenuItems, type MenuItemDto } from '../api/queries';

/**
 * J3 proof-of-concept Owner dashboard. NOT the canonical M2 owner dashboard
 * (slice #9 m2-owner-dashboard ships that with top/bottom-5 ranking + drill-
 * down). This screen exists to verify the API → React → component loop end-
 * to-end during m2-ui-foundation. Removed or refactored when #9 lands.
 */
export function OwnerDashboardPocScreen() {
  const [searchParams] = useSearchParams();
  const orgId =
    searchParams.get('organizationId') ??
    (import.meta.env.VITE_DEMO_ORG_ID as string | undefined) ??
    undefined;

  const { data: menuItems, isLoading, error } = useMenuItems(orgId);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div
        className="mb-4 rounded-md border border-border bg-warn-bg px-4 py-2 text-sm text-ink"
        role="note"
      >
        <strong>Proof of concept</strong> — m2-ui-foundation. The canonical
        Owner dashboard ships in slice <code>m2-owner-dashboard</code> (#9).
      </div>

      <h2 className="mb-1 text-2xl font-semibold text-ink">Owner dashboard</h2>
      <p className="mb-6 text-sm text-mute">Live margins + allergen rollups per active MenuItem.</p>

      {!orgId && (
        <p className="text-sm text-mute">
          Pass <code>?organizationId=&lt;uuid&gt;</code> in the URL or set <code>VITE_DEMO_ORG_ID</code>.
        </p>
      )}
      {isLoading && <p className="text-sm text-mute">Cargando…</p>}
      {error && (
        <p className="text-sm text-destructive">Error cargando MenuItems: {(error as Error).message}</p>
      )}
      {menuItems && menuItems.length === 0 && (
        <p className="text-sm text-mute">No hay MenuItems activos para esta organización.</p>
      )}

      <ul className="grid grid-cols-1 gap-3">
        {menuItems?.map((item) => (
          <MenuItemRow key={item.id} item={item} organizationId={orgId!} />
        ))}
      </ul>
    </div>
  );
}

function MenuItemRow({ item, organizationId }: { item: MenuItemDto; organizationId: string }) {
  const { data: margin } = useMargin(organizationId, item.id);
  const { data: allergens } = useAllergens(organizationId, item.recipeId);

  return (
    <li className="rounded-md border border-border bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-ink">{item.displayLabel}</h3>
        <span className="text-xs uppercase tracking-wide text-mute">{item.channel}</span>
      </div>
      {margin ? (
        <MarginPanel report={margin} />
      ) : (
        <MarginPanel report={null} loading />
      )}
      {allergens && allergens.aggregated.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Allergens">
          {allergens.aggregated.map((a) => (
            <li key={a}>
              <AllergenBadge allergen={a} emphasised />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
