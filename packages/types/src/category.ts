export interface CategoryDto {
  id: string;
  organizationId: string;
  parentId: string | null;
  name: string;
  /** Translated name in Spanish */
  nameEs: string;
  /** Translated name in English */
  nameEn: string;
  sortOrder: number;
  /** true = came from the default seed, false = user-created */
  isDefault: boolean;
  children?: CategoryDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryDto {
  parentId?: string | null;
  name: string;
  nameEs?: string;
  nameEn?: string;
  sortOrder?: number;
}

export interface UpdateCategoryDto {
  name?: string;
  nameEs?: string;
  nameEn?: string;
  parentId?: string | null;
  sortOrder?: number;
}
