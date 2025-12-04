import { Timestamp } from '@angular/fire/firestore';

export interface DependentInfo {
  name: string;
  nameKana: string;
  birthDate: Date | Timestamp;
  relationship: string; // 続柄（配偶者、子など）
  income?: number; // 年収
  livingTogether: boolean; // 同一世帯
}

export interface InsuranceInfo {
  healthInsuranceNumber?: string; // 健康保険被保険者番号
  pensionNumber?: string; // 厚生年金被保険者番号
  myNumber?: string; // マイナンバー
  standardReward?: number; // 標準報酬月額
  insuranceStartDate?: Date | Timestamp; // 保険適用開始日
}

export interface OtherCompanyInfo {
  isOtherCompany: boolean; // 他社勤務有無
  isPrimary: boolean; // 主たる勤務先かどうか
  companyName?: string; // 他社名
}

export interface Address {
  postalCode?: string; // 郵便番号
  prefecture?: string; // 都道府県
  city?: string; // 市区町村
  street?: string; // 町名・番地
  building?: string; // 建物名・部屋番号
}

export interface Employee {
  id?: string;
  employeeNumber: string; // 社員番号
  name: string; // 氏名
  nameKana: string; // 氏名カナ
  email: string; // メールアドレス
  departmentId: string; // 部署ID
  joinDate: Date | Timestamp; // 入社日
  birthDate: Date | Timestamp; // 生年月日
  status: 'active' | 'leave' | 'retired' | 'pre_join'; // ステータス：在籍、休職、退職、未入社
  dependentInfo?: DependentInfo[]; // 扶養情報
  insuranceInfo?: InsuranceInfo; // 保険情報
  otherCompanyInfo?: OtherCompanyInfo; // 他社勤務情報
  address?: {
    internal?: Address; // 社内表示用（自由編集可）
    official?: Address; // 正式住所（申請制）
  };
  organizationId: string; // 組織ID
  role?: 'admin' | 'employee'; // 権限（デフォルト: 'employee'）
  invitationEmailSent?: boolean; // 認証メール送信済みかどうか
  emailVerified?: boolean; // 認証済みかどうか
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

