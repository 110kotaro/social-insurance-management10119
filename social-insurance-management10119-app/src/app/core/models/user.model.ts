export interface User {
  uid: string;
  email: string;
  displayName?: string;
  emailVerified: boolean;
  role: 'owner' | 'admin' | 'employee';
  organizationId?: string;
  employeeId?: string;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'owner' | 'admin' | 'employee';
  organizationId: string;
  employeeId?: string;
}

