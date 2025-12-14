import { Timestamp } from '@angular/fire/firestore';

export interface DependentInfo {
  name: string;
  nameKana: string;
  birthDate: Date | Timestamp;
  relationship: string; // 続柄（配偶者、子など）
  income?: number; // 年収
  livingTogether: boolean; // 同一世帯
  dependentId?: string; // その他被扶養者の識別子（個人番号または基礎年金番号、またはUUID）
  becameDependentDate?: Date | Timestamp; // 被扶養者になった年月日
}

export interface EmployeeChangeHistory {
  applicationId: string;
  applicationName: string; // 申請種別名（日本語）
  changedAt: Date | Timestamp;
  changedBy: string; // 承認した人のID
  changes: {
    field: string; // 'dependentInfo', 'address.official', 'firstName', 'lastName', 'firstNameKana', 'lastNameKana', 'insuranceInfo.standardReward'など
    before: any;
    after: any;
  }[];
}

/**
 * 給与データの変更履歴
 */
export interface SalaryDataChangeHistory {
  changedAt: Date | Timestamp;
  changedBy: string;
  before: Partial<SalaryData>;
  after: Partial<SalaryData>;
}

/**
 * 給与データ
 */
export interface SalaryData {
  year: number;
  month: number;
  baseDays: number; // 基礎日数
  fixedSalary: number; // 固定賃金
  totalPayment: number; // 総支給
  retroactivePayment?: number; // 遡及支払額
  isConfirmed: boolean; // 確定済みかどうか
  confirmedAt?: Date | Timestamp;
  confirmedBy?: string;
  changeHistory?: SalaryDataChangeHistory[]; // 変更履歴（確定後の修正用）
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

/**
 * 賞与データの変更履歴
 */
export interface BonusDataChangeHistory {
  changedAt: Date | Timestamp;
  changedBy: string;
  before: Partial<BonusData>;
  after: Partial<BonusData>;
}

/**
 * 賞与データ
 */
export interface BonusData {
  year: number;
  month: number;
  bonusAmount: number; // 賞与額
  standardBonusAmount: number; // 標準賞与額（1000円未満切り捨て後）
  isConfirmed: boolean; // 確定済みかどうか
  confirmedAt?: Date | Timestamp;
  confirmedBy?: string;
  changeHistory?: BonusDataChangeHistory[]; // 変更履歴（確定後の修正用）
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface InsuranceInfo {
  healthInsuranceNumber?: string; // 健康保険被保険者番号
  pensionNumber?: string; // 厚生年金被保険者番号
  myNumber?: string; // マイナンバー
  standardReward?: number; // 標準報酬月額（等級により決められた額・規定値）
  averageReward?: number; // 申請された平均月額（adjustedAverageまたはaverage）
  grade?: number; // 健康保険の等級
  pensionGrade?: number; // 厚生年金の等級
  insuranceStartDate?: Date | Timestamp; // 保険適用開始日
  gradeAndStandardRewardEffectiveDate?: Date | Timestamp; // 等級・標準報酬月額適用年月日
}

export interface OtherCompanyInfo {
  companyId: string; // 他社識別ID（UUID）
  companyName: string; // 会社名
  isPrimary: boolean; // 主たる勤務先かどうか
}

/**
 * 他社給与データ
 */
export interface OtherCompanySalaryData {
  id?: string;
  employeeId: string;
  companyId: string; // 他社識別ID
  companyName: string; // 会社名（表示用）
  year: number;
  month: number;
  monthlyReward: number; // 月額報酬
  bonus?: number; // 賞与
  retroactivePayment?: number; // 遡及支払額
  isConfirmed: boolean; // 確定済みかどうか
  confirmedAt?: Date | Timestamp;
  confirmedBy?: string;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

/**
 * 休職情報
 */
export interface LeaveInfo {
  type: 'maternity' | 'childcare' | string; // 産前産後休業、育児休業等（後で追加するかも）
  startDate: Date | Timestamp; // 休職開始（予定）日
  endDate?: Date | Timestamp; // 休職終了（予定）日
  isApproved: boolean; // 申請承認済みかどうか（チェックボックスでフラグ管理）
}

export interface Address {
  postalCode?: string; // 郵便番号
  prefecture?: string; // 都道府県
  city?: string; // 市区町村
  street?: string; // 町名・番地
  building?: string; // 建物名・部屋番号
  kana?: string; // 住所カナ（修正17）
}

/**
 * ファイル添付情報（修正17）
 */
export interface FileAttachment {
  id?: string; // ファイルID（UUID）
  fileName: string; // ファイル名
  fileUrl: string; // Cloud StorageのURL
  fileSize?: number; // ファイルサイズ（バイト）
  mimeType?: string; // MIMEタイプ
  uploadedAt: Date | Timestamp; // アップロード日時
  uploadedBy: string; // アップロードしたユーザーID
  description?: string; // 説明（任意）
}

export interface Employee {
  id?: string;
  employeeNumber: string; // 社員番号
  firstName: string; // 名
  lastName: string; // 氏
  firstNameKana: string; // 名カナ
  lastNameKana: string; // 氏カナ
  // 後方互換性のため、name と nameKana も保持（コメントアウト）
  // name: string; // 氏名（firstName + lastName）
  // nameKana: string; // 氏名カナ（firstNameKana + lastNameKana）
  email: string; // メールアドレス
  departmentId: string; // 部署ID
  joinDate: Date | Timestamp; // 入社日
  birthDate: Date | Timestamp; // 生年月日
  retirementDate?: Date | Timestamp; // 退職（予定）日
  status: 'active' | 'leave' | 'retired' | 'pre_join'; // ステータス：在籍、休職、退職、未入社
  dependentInfo?: DependentInfo[]; // 扶養情報
  insuranceInfo?: InsuranceInfo; // 保険情報
  otherCompanyInfo?: OtherCompanyInfo[]; // 他社勤務情報（複数社対応）
  leaveInfo?: LeaveInfo[]; // 休職情報の配列
  address?: {
    // internal?: Address; // 社内表示用（自由編集可）- コメントアウト（address.officialのみ使用）
    official?: Address; // 正式住所（申請制）
  };
  changeHistory?: EmployeeChangeHistory[]; // 変更履歴
  salaryData?: SalaryData[]; // 給与データの配列
  bonusData?: BonusData[]; // 賞与データの配列
  attachments?: FileAttachment[]; // ファイル添付（修正17）
  organizationId: string; // 組織ID
  role?: 'admin' | 'employee'; // 権限（デフォルト: 'employee'）
  invitationEmailSent?: boolean; // 認証メール送信済みかどうか
  emailVerified?: boolean; // 認証済みかどうか
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

