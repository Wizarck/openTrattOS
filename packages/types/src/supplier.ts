export interface SupplierDto {
  id: string;
  organizationId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  country: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierDto {
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  country: string;
}

export interface UpdateSupplierDto {
  name?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string;
  isActive?: boolean;
}
