export interface Department {
  id?: string;
  name: string;
  code?: string;
  parentDepartmentId?: string | null;
  managerId?: string | null;
  email?: string;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}

