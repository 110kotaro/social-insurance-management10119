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
  emailNotificationEnabled?: boolean; // メール通知設定
  inAppNotificationEnabled?: boolean; // アプリ内通知設定
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'owner' | 'admin' | 'employee';
  organizationId: string;
  employeeId?: string;
}

