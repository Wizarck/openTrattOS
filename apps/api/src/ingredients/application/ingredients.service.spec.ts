import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { ExternalCatalogService } from '../../external-catalog/application/external-catalog.service';
import { ExternalFoodCatalog } from '../../external-catalog/domain/external-food-catalog.entity';
import { Ingredient } from '../domain/ingredient.entity';
import { IngredientRepository } from '../infrastructure/ingredient.repository';
import {
  IngredientNotFoundError,
  IngredientOverrideReasonError,
  IngredientOverrideUnknownFieldError,
  IngredientsService,
  MIN_OVERRIDE_REASON_LENGTH,
} from './ingredients.service';

const orgId = '11111111-1111-4111-8111-111111111111';
const ingredientId = '33333333-3333-4333-8333-333333333331';
const actorId = '44444444-4444-4444-8444-444444444444';

function makeIngredient(opts: Partial<Ingredient> = {}): Ingredient {
  const i = new Ingredient();
  i.id = opts.id ?? ingredientId;
  i.organizationId = opts.organizationId ?? orgId;
  i.categoryId = '55555555-5555-4555-8555-555555555555';
  i.name = opts.name ?? 'Tomate';
  i.internalCode = 'TOM-001';
  i.baseUnitType = opts.baseUnitType ?? 'WEIGHT';
  i.densityFactor = null;
  i.notes = null;
  i.nutrition = (opts.nutrition ?? null) as Record<string, unknown> | null;
  i.allergens = opts.allergens ?? [];
  i.dietFlags = opts.dietFlags ?? [];
  i.brandName = opts.brandName ?? null;
  i.externalSourceRef = opts.externalSourceRef ?? null;
  i.overrides = opts.overrides ?? {};
  i.isActive = true;
  return i;
}

function makeOFFRow(): ExternalFoodCatalog {
  const r = new ExternalFoodCatalog();
  r.id = 'a';
  r.barcode = '8005110001234';
  r.name = 'Mutti Polpa';
  r.brand = 'Mutti';
  r.nutrition = { 'energy-kcal': 24, proteins: 1.1, fat: 0.2, carbohydrates: 4.5 };
  r.allergens = [];
  r.dietFlags = ['vegan'];
  r.region = 'eu';
  r.lastModifiedAt = null;
  r.licenseAttribution = 'Database licence: Open Database License (ODbL)';
  r.syncedAt = new Date();
  return r;
}

describe('IngredientsService', () => {
  let dataSource: jest.Mocked<DataSource>;
  let repo: jest.Mocked<IngredientRepository>;
  let externalCatalog: jest.Mocked<ExternalCatalogService>;
  let events: jest.Mocked<EventEmitter2>;
  let service: IngredientsService;

  beforeEach(() => {
    dataSource = {
      manager: {} as never,
      transaction: jest.fn().mockImplementation(async (cb: unknown) => {
        const callback = cb as (em: unknown) => Promise<unknown>;
        const ingRepoMock = {
          findOneBy: jest.fn().mockResolvedValue(makeIngredient()),
          save: jest.fn().mockImplementation(async (i: Ingredient) => i),
        };
        const em = {
          getRepository: () => ingRepoMock,
        };
        return callback(em);
      }),
    } as unknown as jest.Mocked<DataSource>;

    repo = {
      findOneBy: jest.fn(),
    } as unknown as jest.Mocked<IngredientRepository>;

    externalCatalog = {
      searchByBarcode: jest.fn(),
    } as unknown as jest.Mocked<ExternalCatalogService>;

    events = {
      emit: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<EventEmitter2>;

    service = new IngredientsService(dataSource, repo, externalCatalog, events);
  });

  describe('searchByBarcode', () => {
    it('delegates to ExternalCatalogService.searchByBarcode with default region eu', async () => {
      externalCatalog.searchByBarcode.mockResolvedValue(makeOFFRow());
      const result = await service.searchByBarcode('8005110001234');
      expect(externalCatalog.searchByBarcode).toHaveBeenCalledWith('8005110001234', { region: 'eu' });
      expect(result?.barcode).toBe('8005110001234');
    });

    it('returns null on outage (delegates #4 graceful-degrade)', async () => {
      externalCatalog.searchByBarcode.mockResolvedValue(null);
      const result = await service.searchByBarcode('999');
      expect(result).toBeNull();
    });
  });

  describe('prefillFromOff', () => {
    it('maps OFF row to prefill shape', () => {
      const result = service.prefillFromOff(makeOFFRow());
      expect(result).toEqual({
        brandName: 'Mutti',
        externalSourceRef: '8005110001234',
        nutrition: { 'energy-kcal': 24, proteins: 1.1, fat: 0.2, carbohydrates: 4.5 },
        allergens: [],
        dietFlags: ['vegan'],
      });
    });

    it('preserves null brand when OFF row has no brand', () => {
      const row = makeOFFRow();
      row.brand = null;
      const result = service.prefillFromOff(row);
      expect(result.brandName).toBeNull();
    });
  });

  describe('applyOverride', () => {
    it('rejects reason shorter than 10 chars', async () => {
      await expect(
        service.applyOverride({
          organizationId: orgId,
          actorUserId: actorId,
          ingredientId,
          field: 'allergens',
          value: ['gluten'],
          reason: 'short',
        }),
      ).rejects.toBeInstanceOf(IngredientOverrideReasonError);
    });

    it('rejects unknown field', async () => {
      await expect(
        service.applyOverride({
          organizationId: orgId,
          actorUserId: actorId,
          ingredientId,
          field: 'foo' as never,
          value: 'bar',
          reason: 'sufficient reason text here',
        }),
      ).rejects.toBeInstanceOf(IngredientOverrideUnknownFieldError);
    });

    it('throws IngredientNotFoundError when ingredient missing', async () => {
      (dataSource.transaction as unknown as jest.Mock).mockImplementation(async (cb: (em: unknown) => Promise<unknown>) => {
        const em = {
          getRepository: () => ({
            findOneBy: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
          }),
        };
        return cb(em);
      });
      await expect(
        service.applyOverride({
          organizationId: orgId,
          actorUserId: actorId,
          ingredientId,
          field: 'allergens',
          value: ['gluten'],
          reason: 'this is a long enough reason',
        }),
      ).rejects.toBeInstanceOf(IngredientNotFoundError);
    });

    it('merges into overrides jsonb and emits INGREDIENT_OVERRIDE_CHANGED', async () => {
      const reason = 'Confirmed gluten-free by supplier';
      await service.applyOverride({
        organizationId: orgId,
        actorUserId: actorId,
        ingredientId,
        field: 'allergens',
        value: [],
        reason,
      });
      expect(events.emit).toHaveBeenCalledWith(
        'cost.ingredient-override-changed',
        expect.objectContaining({
          organizationId: orgId,
          aggregateType: 'ingredient',
          aggregateId: ingredientId,
          actorUserId: actorId,
          actorKind: 'user',
          payloadAfter: { field: 'allergens' },
          reason,
        }),
      );
    });

    it('preserves existing overrides on different fields when applying a new one', async () => {
      let saved: Ingredient | undefined;
      (dataSource.transaction as unknown as jest.Mock).mockImplementation(async (cb: (em: unknown) => Promise<unknown>) => {
        const ing = makeIngredient({
          overrides: {
            dietFlags: {
              value: ['vegan'],
              reason: 'pre-existing',
              appliedBy: actorId,
              appliedAt: '2026-01-01T00:00:00Z',
            },
          },
        });
        const em = {
          getRepository: () => ({
            findOneBy: jest.fn().mockResolvedValue(ing),
            save: jest.fn().mockImplementation(async (i: Ingredient) => {
              saved = i;
              return i;
            }),
          }),
        };
        return cb(em);
      });
      await service.applyOverride({
        organizationId: orgId,
        actorUserId: actorId,
        ingredientId,
        field: 'allergens',
        value: ['milk'],
        reason: 'Reformulated 2026-05-05',
      });
      expect(saved!.overrides!.dietFlags).toBeDefined();
      expect(saved!.overrides!.allergens).toBeDefined();
      expect((saved!.overrides!.allergens as { value: string[] }).value).toEqual(['milk']);
    });
  });

  describe('MIN_OVERRIDE_REASON_LENGTH', () => {
    it('matches #13 client-side convention (≥10 chars)', () => {
      expect(MIN_OVERRIDE_REASON_LENGTH).toBe(10);
    });
  });
});
