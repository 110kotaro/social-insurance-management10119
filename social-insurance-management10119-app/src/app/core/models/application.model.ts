import { Timestamp } from '@angular/fire/firestore';

/**
 * 申請ステータス
 */
export type ApplicationStatus = 'draft' | 'created' | 'pending' | 'pending_received' | 'pending_not_received' | 'approved' | 'rejected' | 'returned' | 'withdrawn';

/**
 * 申請カテゴリ
 */
export type ApplicationCategory = 'internal' | 'external';

/**
 * 外部申請ステータス
 */
export type ExternalApplicationStatus = 'sent' | 'received' | 'error' | null;

/**
 * コメント
 */
export interface Comment {
  userId: string;
  comment: string;
  type: 'comment' | 'rejection_reason';
  createdAt: Date | Timestamp;
}

/**
 * 添付ファイル
 */
export interface Attachment {
  fileName: string;
  fileUrl: string;
  uploadedAt: Date | Timestamp;
}

/**
 * 申請履歴
 */
export interface ApplicationHistory {
  userId: string;
  action: 'submit' | 'approve' | 'reject' | 'return' | 'withdraw' | 'status_change';
  comment?: string;
  createdAt: Date | Timestamp;
}

/**
 * 差戻し履歴
 */
export interface ApplicationReturnHistory {
  returnedAt: Date | Timestamp; // 差戻し日時
  returnedBy: string; // 差戻し実行者のuserId
  reason?: string; // 差戻し理由
  dataSnapshot: Record<string, any>; // 差戻し前の申請データのスナップショット
  attachmentsSnapshot?: Attachment[]; // 差戻し前の添付ファイルのスナップショット
  submissionDate?: Date | Timestamp; // 差戻し前の届書提出日
}

/**
 * 申請データモデル
 */
export interface Application {
  id?: string;
  type: string; // 申請種別ID（ApplicationType.id）
  category: ApplicationCategory; // 'internal' | 'external'
  employeeId: string; // 申請者（社員ID）
  organizationId: string; // 組織ID
  status: ApplicationStatus; // 申請ステータス
  data: Record<string, any>; // 申請種別ごとのデータ（動的）
  attachments?: Attachment[]; // 添付ファイル
  comments?: Comment[]; // コメント・差戻し理由
  history?: ApplicationHistory[]; // 申請履歴
  returnHistory?: ApplicationReturnHistory[]; // 差戻し履歴
  externalApplicationStatus?: ExternalApplicationStatus; // 外部申請ステータス
  deadline?: Date | Timestamp | null; // 期限（内部申請: 承認期限、外部申請: 提出期限）
  relatedInternalApplicationIds?: string[]; // 外部申請が参照する内部申請IDの配列
  relatedExternalApplicationIds?: string[]; // 内部申請が参照する外部申請IDの配列
  submissionDate?: Date | Timestamp; // 届書提出日（外部申請: 送信ステータス変更日、内部申請: 送信日）
  createdAt: Date | Timestamp; // 作成日時
  updatedAt: Date | Timestamp; // 更新日時
  withdrawnAt?: Date | Timestamp | null; // 取り下げ日時
}

