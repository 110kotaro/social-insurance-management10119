import { Timestamp } from '@angular/fire/firestore';

/**
 * 通知タイプ
 */
export type NotificationType = 'application' | 'approval' | 'rejection' | 'return' | 'reminder' | 'system' | 'external_received' | 'external_error';

/**
 * 通知優先度
 */
export type NotificationPriority = 'high' | 'medium' | 'low';

/**
 * 通知データモデル
 */
export interface Notification {
  id?: string;
  userId: string; // 通知を受信するユーザーID
  applicationId: string | null; // 関連する申請ID（nullの場合は申請に関連しない通知）
  employeeId?: string | null; // 関連する社員ID（申請がない場合でも社員を特定するため）
  type: NotificationType; // 通知タイプ
  title: string; // 通知タイトル
  message: string; // 通知メッセージ
  read: boolean; // 既読フラグ
  priority: NotificationPriority; // 優先度
  organizationId: string; // 組織ID
  createdAt: Date | Timestamp; // 作成日時
  readAt?: Date | Timestamp | null; // 既読日時
}

