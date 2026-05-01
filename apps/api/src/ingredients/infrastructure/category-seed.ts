import { EntityManager } from 'typeorm';
import { Category } from '../domain/category.entity';

/**
 * Default category taxonomy seeded for every new Organization (PRD-M1
 * Appendix A). 35 nodes total (4 roots + 31 children), all isDefault=true,
 * all bilingual (es + en). The shape is a tree; the seed walks it
 * preserving parent-child references via in-memory id assignment before
 * persistence.
 */
export interface SeedNode {
  /** kebab-case canonical slug; used for `Category.name`. */
  readonly name: string;
  readonly nameEs: string;
  readonly nameEn: string;
  readonly children?: readonly SeedNode[];
}

export const DEFAULT_TAXONOMY: readonly SeedNode[] = [
  {
    name: 'fresh',
    nameEs: 'Fresco',
    nameEn: 'Fresh',
    children: [
      {
        name: 'vegetables',
        nameEs: 'Verduras',
        nameEn: 'Vegetables',
        children: [
          { name: 'leafy-greens', nameEs: 'Verduras de Hoja', nameEn: 'Leafy Greens' },
          { name: 'root-vegetables', nameEs: 'Tubérculos', nameEn: 'Root Vegetables' },
          { name: 'nightshades', nameEs: 'Solanáceas', nameEn: 'Nightshades' },
        ],
      },
      { name: 'fruits', nameEs: 'Frutas', nameEn: 'Fruits' },
      { name: 'herbs-aromatics', nameEs: 'Hierbas y Aromáticas', nameEn: 'Herbs & Aromatics' },
      {
        name: 'meat-poultry',
        nameEs: 'Carnes y Aves',
        nameEn: 'Meat & Poultry',
        children: [
          { name: 'beef', nameEs: 'Vacuno', nameEn: 'Beef' },
          { name: 'pork', nameEs: 'Cerdo', nameEn: 'Pork' },
          { name: 'poultry', nameEs: 'Aves', nameEn: 'Poultry' },
          { name: 'game', nameEs: 'Caza', nameEn: 'Game' },
        ],
      },
      {
        name: 'seafood',
        nameEs: 'Pescados y Mariscos',
        nameEn: 'Seafood',
        children: [
          { name: 'fish', nameEs: 'Pescado', nameEn: 'Fish' },
          { name: 'shellfish', nameEs: 'Marisco', nameEn: 'Shellfish' },
        ],
      },
      {
        name: 'dairy-eggs',
        nameEs: 'Lácteos y Huevos',
        nameEn: 'Dairy & Eggs',
        children: [
          { name: 'milk-cream', nameEs: 'Leche y Nata', nameEn: 'Milk & Cream' },
          { name: 'cheese', nameEs: 'Quesos', nameEn: 'Cheese' },
          { name: 'eggs', nameEs: 'Huevos', nameEn: 'Eggs' },
        ],
      },
    ],
  },
  {
    name: 'dry-pantry',
    nameEs: 'Secos y Despensa',
    nameEn: 'Dry & Pantry',
    children: [
      { name: 'flours-starches', nameEs: 'Harinas y Almidones', nameEn: 'Flours & Starches' },
      { name: 'grains-rice', nameEs: 'Cereales y Arroz', nameEn: 'Grains & Rice' },
      { name: 'legumes', nameEs: 'Legumbres', nameEn: 'Legumes' },
      { name: 'sugar-sweeteners', nameEs: 'Azúcares y Edulcorantes', nameEn: 'Sugar & Sweeteners' },
      { name: 'spices-seasonings', nameEs: 'Especias y Condimentos', nameEn: 'Spices & Seasonings' },
      { name: 'oils-vinegars', nameEs: 'Aceites y Vinagres', nameEn: 'Oils & Vinegars' },
      { name: 'canned-preserved', nameEs: 'Conservas y Encurtidos', nameEn: 'Canned & Preserved' },
    ],
  },
  {
    name: 'beverages',
    nameEs: 'Bebidas',
    nameEn: 'Beverages',
    children: [
      { name: 'wine-spirits', nameEs: 'Vinos y Licores', nameEn: 'Wine & Spirits' },
      { name: 'beer-cider', nameEs: 'Cerveza y Sidra', nameEn: 'Beer & Cider' },
      { name: 'soft-drinks', nameEs: 'Refrescos', nameEn: 'Soft Drinks' },
      { name: 'non-alcoholic', nameEs: 'Sin Alcohol', nameEn: 'Non-Alcoholic' },
    ],
  },
  {
    name: 'other',
    nameEs: 'Otros',
    nameEn: 'Other',
    children: [
      { name: 'packaging-materials', nameEs: 'Material de Embalaje', nameEn: 'Packaging Materials' },
      { name: 'cleaning-supplies', nameEs: 'Productos de Limpieza', nameEn: 'Cleaning Supplies' },
    ],
  },
];

/** Counts every node in a tree (recursive). */
export function countSeedNodes(nodes: readonly SeedNode[] = DEFAULT_TAXONOMY): number {
  return nodes.reduce(
    (acc, n) => acc + 1 + (n.children ? countSeedNodes(n.children) : 0),
    0,
  );
}

/**
 * Seed the canonical taxonomy for an Organization within the given
 * EntityManager (allows the caller to keep the seed in the same transaction
 * as the Organization insert, per task §6.2).
 *
 * Returns the number of Category rows created (always equals `countSeedNodes()`
 * for the default taxonomy).
 */
export async function seedDefaultCategories(
  em: EntityManager,
  organizationId: string,
  options: { actorUserId?: string } = {},
): Promise<number> {
  const repo = em.getRepository(Category);
  let total = 0;

  const sortBase = 100;

  async function walk(parentId: string | null, nodes: readonly SeedNode[]): Promise<void> {
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const cat = Category.createSeedDefault({
        organizationId,
        parentId,
        name: n.name,
        nameEs: n.nameEs,
        nameEn: n.nameEn,
        sortOrder: sortBase + i,
      });
      if (options.actorUserId) {
        cat.createdBy = options.actorUserId;
        cat.updatedBy = options.actorUserId;
      }
      await repo.save(cat);
      total += 1;
      if (n.children && n.children.length > 0) {
        await walk(cat.id, n.children);
      }
    }
  }

  await walk(null, DEFAULT_TAXONOMY);
  return total;
}
