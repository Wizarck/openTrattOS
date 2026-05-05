import {
  MarginReport,
  MarginStatus,
  MenuItemView,
  MenuItemsService,
} from '../../menus/application/menu-items.service';
import { MenuItem, MenuItemChannel } from '../../menus/domain/menu-item.entity';
import { DashboardService } from './dashboard.service';

const orgId = '11111111-1111-4111-8111-111111111111';

function makeMenuItemView(
  id: string,
  recipeId: string,
  active = true,
): MenuItemView {
  const m = MenuItem.create({
    organizationId: orgId,
    recipeId,
    locationId: '33333333-3333-4333-8333-333333333333',
    channel: 'DINE_IN' as MenuItemChannel,
    sellingPrice: 10,
    targetMargin: 0.6,
  });
  m.id = id;
  m.isActive = active;
  return { menuItem: m, displayLabel: `Recipe ${recipeId.slice(0, 4)}`, recipeDiscontinued: !active };
}

function makeMargin(
  menuItemId: string,
  recipeId: string,
  marginPercent: number | null,
  status: MarginStatus,
): MarginReport {
  return {
    menuItemId,
    organizationId: orgId,
    recipeId,
    locationId: '33333333-3333-4333-8333-333333333333',
    channel: 'DINE_IN' as MenuItemChannel,
    cost: marginPercent === null ? null : 4,
    sellingPrice: 10,
    targetMargin: 0.6,
    marginAbsolute: marginPercent === null ? null : 6,
    marginPercent,
    marginVsTargetPp: marginPercent === null ? null : marginPercent - 0.6,
    status,
    statusLabel: status,
    warnings: marginPercent === null ? ['cost_unresolved: …'] : [],
    recipeDiscontinued: false,
    currency: 'EUR',
  };
}

describe('DashboardService', () => {
  let menuItems: jest.Mocked<MenuItemsService>;
  let service: DashboardService;

  beforeEach(() => {
    menuItems = {
      findAll: jest.fn(),
      getMargin: jest.fn(),
    } as unknown as jest.Mocked<MenuItemsService>;
    service = new DashboardService(menuItems);
  });

  describe('getTopBottomMenuItems', () => {
    const r1 = '22222222-2222-4222-8222-222222222221';
    const r2 = '22222222-2222-4222-8222-222222222222';
    const r3 = '22222222-2222-4222-8222-222222222223';
    const r4 = '22222222-2222-4222-8222-222222222224';
    const r5 = '22222222-2222-4222-8222-222222222225';
    const r6 = '22222222-2222-4222-8222-222222222226';
    const m1 = '44444444-4444-4444-8444-444444444441';
    const m2 = '44444444-4444-4444-8444-444444444442';
    const m3 = '44444444-4444-4444-8444-444444444443';
    const m4 = '44444444-4444-4444-8444-444444444444';
    const m5 = '44444444-4444-4444-8444-444444444445';
    const m6 = '44444444-4444-4444-8444-444444444446';

    function seedSix(): void {
      menuItems.findAll.mockResolvedValue([
        makeMenuItemView(m1, r1),
        makeMenuItemView(m2, r2),
        makeMenuItemView(m3, r3),
        makeMenuItemView(m4, r4),
        makeMenuItemView(m5, r5),
        makeMenuItemView(m6, r6),
      ]);
      menuItems.getMargin.mockImplementation(async (_org, id) => {
        const map: Record<string, number> = {
          [m1]: 0.7,
          [m2]: 0.5,
          [m3]: 0.65,
          [m4]: 0.4,
          [m5]: 0.55,
          [m6]: 0.62,
        };
        const mp = map[id];
        return makeMargin(id, `recipe-of-${id}`, mp, mp >= 0.6 ? 'on_target' : 'below_target');
      });
    }

    it('returns top-5 sorted by marginPercent descending', async () => {
      seedSix();
      const result = await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
      expect(result.items.map((i) => i.menuItemId)).toEqual([m1, m3, m6, m5, m2]); // 0.70, 0.65, 0.62, 0.55, 0.50
      expect(result.incomplete).toBe(false);
      expect(result.direction).toBe('top');
    });

    it('returns bottom-5 sorted by marginPercent ascending', async () => {
      seedSix();
      const result = await service.getTopBottomMenuItems(orgId, 'bottom', 7, 5);
      expect(result.items.map((i) => i.menuItemId)).toEqual([m4, m2, m5, m6, m3]); // 0.40, 0.50, 0.55, 0.62, 0.65
    });

    it('marks incomplete=true when org has fewer MenuItems than n', async () => {
      menuItems.findAll.mockResolvedValue([
        makeMenuItemView(m1, r1),
        makeMenuItemView(m2, r2),
      ]);
      menuItems.getMargin.mockImplementation(async (_org, id) =>
        makeMargin(id, `recipe-${id}`, 0.7, 'on_target'),
      );
      const result = await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
      expect(result.items).toHaveLength(2);
      expect(result.incomplete).toBe(true);
    });

    it('pushes unknown-margin items to the end regardless of direction', async () => {
      menuItems.findAll.mockResolvedValue([
        makeMenuItemView(m1, r1),
        makeMenuItemView(m2, r2),
        makeMenuItemView(m3, r3),
      ]);
      menuItems.getMargin.mockImplementation(async (_org, id) => {
        const map: Record<string, { mp: number | null; s: MarginStatus }> = {
          [m1]: { mp: 0.5, s: 'below_target' },
          [m2]: { mp: null, s: 'unknown' },
          [m3]: { mp: 0.7, s: 'on_target' },
        };
        return makeMargin(id, `recipe-${id}`, map[id].mp, map[id].s);
      });
      const top = await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
      expect(top.items.map((i) => i.menuItemId)).toEqual([m3, m1, m2]);
      service.flushCache();
      const bottom = await service.getTopBottomMenuItems(orgId, 'bottom', 7, 5);
      expect(bottom.items.map((i) => i.menuItemId)).toEqual([m1, m3, m2]);
    });

    it('returns empty result for org with 0 MenuItems', async () => {
      menuItems.findAll.mockResolvedValue([]);
      const result = await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
      expect(result.items).toHaveLength(0);
      expect(result.incomplete).toBe(true);
    });

    it('passes isActive=true filter to MenuItemsService.findAll', async () => {
      menuItems.findAll.mockResolvedValue([]);
      await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
      expect(menuItems.findAll).toHaveBeenCalledWith(orgId, { isActive: true });
    });
  });

  describe('caching', () => {
    const m1 = '44444444-4444-4444-8444-444444444441';
    const r1 = '22222222-2222-4222-8222-222222222221';

    function seedOne(): void {
      menuItems.findAll.mockResolvedValue([makeMenuItemView(m1, r1)]);
      menuItems.getMargin.mockResolvedValue(makeMargin(m1, r1, 0.7, 'on_target'));
    }

    it('returns the same result twice within 60s without recomputing', async () => {
      seedOne();
      await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
      await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
      expect(menuItems.findAll).toHaveBeenCalledTimes(1);
    });

    it('recomputes after 60s expiry', async () => {
      jest.useFakeTimers();
      try {
        seedOne();
        await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
        jest.advanceTimersByTime(60_000 + 1);
        await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
        expect(menuItems.findAll).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('caches separately by direction', async () => {
      seedOne();
      await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
      await service.getTopBottomMenuItems(orgId, 'bottom', 7, 5);
      expect(menuItems.findAll).toHaveBeenCalledTimes(2);
    });

    it('SUPPLIER_PRICE_UPDATED event invalidates ALL entries for the org', async () => {
      seedOne();
      await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
      await service.getTopBottomMenuItems(orgId, 'bottom', 7, 5);
      expect(menuItems.findAll).toHaveBeenCalledTimes(2);
      service.handleSupplierPriceUpdated({
        supplierItemId: 'si-1',
        ingredientId: 'i-1',
        organizationId: orgId,
      });
      await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
      expect(menuItems.findAll).toHaveBeenCalledTimes(3);
    });

    it('SUPPLIER_PRICE_UPDATED for OTHER org does not invalidate', async () => {
      seedOne();
      await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
      service.handleSupplierPriceUpdated({
        supplierItemId: 'si-1',
        ingredientId: 'i-1',
        organizationId: '99999999-9999-4999-8999-999999999999',
      });
      await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
      expect(menuItems.findAll).toHaveBeenCalledTimes(1);
    });

    it('flushCache() clears all entries', async () => {
      seedOne();
      await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
      service.flushCache();
      await service.getTopBottomMenuItems(orgId, 'top', 7, 5);
      expect(menuItems.findAll).toHaveBeenCalledTimes(2);
    });
  });
});
