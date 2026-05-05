import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DietFlagsPanel,
  IngredientPicker,
  RecipePicker,
  SourceOverridePicker,
  type IngredientListItem,
  type RecipeListItem,
} from '@opentrattos/ui-kit';
import { useRecipes } from '../hooks/useRecipes';
import { useIngredients } from '../hooks/useIngredients';
import { useSupplierItems } from '../hooks/useSupplierItems';
import { useDietFlags, useDietFlagsOverride } from '../hooks/useDietFlags';

/**
 * J1 stub — exercises the 4 J1 components against the real backend.
 * NOT the canonical M2 J1 screen (that lands with #5 m2-ingredients-extension
 * or a future polish slice). This is pure integration verification.
 *
 * Pass `?organizationId=<id>&recipeId=<id>` in the URL.
 */
export function RecipeBuilderJ1Screen() {
  const [params] = useSearchParams();
  const orgId = params.get('organizationId') ?? undefined;
  const recipeId = params.get('recipeId') ?? undefined;

  const [recipeQuery, setRecipeQuery] = useState('');
  const [ingredientQuery, setIngredientQuery] = useState('');
  const [pickedIngredient, setPickedIngredient] = useState<IngredientListItem | null>(null);
  const [pickedSubRecipe, setPickedSubRecipe] = useState<RecipeListItem | null>(null);

  const recipesQuery = useRecipes(orgId, recipeQuery);
  const ingredientsQuery = useIngredients(orgId, ingredientQuery);
  const supplierItemsQuery = useSupplierItems(pickedIngredient?.id);
  const dietFlagsQuery = useDietFlags(orgId, recipeId);
  const overrideMutation = useDietFlagsOverride(orgId, recipeId);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div className="rounded-md border border-border bg-warn-bg px-4 py-2 text-sm text-ink" role="note">
        <strong>Proof of concept</strong> — m2-ui-backfill-wave1 J1 stub. The
        canonical Recipe Builder ships with <code>#5 m2-ingredients-extension</code>.
      </div>

      <header>
        <h1 className="text-2xl font-semibold text-ink">Recipe Builder (J1)</h1>
        <p className="text-sm text-mute">
          Pick a sub-recipe + ingredient + supplier source + diet flags. End-to-end check
          against <code>apps/api/</code>.
        </p>
        {!orgId && (
          <p className="mt-2 text-sm text-mute">
            Pass <code>?organizationId=&lt;uuid&gt;</code> in the URL to enable.
          </p>
        )}
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-mute">Sub-recipe</h2>
        <RecipePicker
          recipes={recipesQuery.data ?? []}
          loading={recipesQuery.isLoading}
          onSearch={setRecipeQuery}
          onSelect={setPickedSubRecipe}
          activeOnly
        />
        {pickedSubRecipe && (
          <p className="text-xs text-mute">Picked: {pickedSubRecipe.displayLabel}</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-mute">Ingredient</h2>
        <IngredientPicker
          ingredients={ingredientsQuery.data ?? []}
          loading={ingredientsQuery.isLoading}
          onSearch={setIngredientQuery}
          onSelect={setPickedIngredient}
        />
        {pickedIngredient && (
          <p className="text-xs text-mute">Picked: {pickedIngredient.displayLabel}</p>
        )}
      </section>

      {pickedIngredient && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-mute">
            Supplier source for {pickedIngredient.displayLabel}
          </h2>
          <SourceOverridePicker
            options={supplierItemsQuery.data ?? []}
            currentOverrideId={null}
            onApply={(p) => console.info('Apply override', p)}
            onClear={() => console.info('Clear override')}
            locale="es-ES"
          />
        </section>
      )}

      {recipeId && dietFlagsQuery.data && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-mute">
            Diet flags
          </h2>
          <DietFlagsPanel
            state={dietFlagsQuery.data}
            canOverride={true}
            onApplyOverride={async (payload) => {
              await overrideMutation.mutateAsync(payload);
            }}
          />
        </section>
      )}
    </div>
  );
}
