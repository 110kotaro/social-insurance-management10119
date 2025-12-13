export interface Organization {
  id?: string;
  name: string;
  corporateNumber?: string;
  officeSymbol?: string; // 事業所整理記号
  officeNumber?: string; // 事業所番号
  address: {
    postalCode?: string; // 郵便番号
    prefecture: string;
    city: string;
    street: string;
    building?: string;
  };
  phoneNumber?: string;
  email?: string;
  industry?: string;
  logoUrl?: string;
  payrollDate?: number; // 月次計算予定日（1-31の日付、月末処理あり、月次計算日の通知用）
  leaveInsuranceCollectionMethod?: 'postpaid' | 'direct_transfer'; // 休職中の保険料徴収方法（後払い/本人振込）
  insuranceSettings?: {
    healthInsurance?: {
      type: 'kyokai' | 'kumiai';
      officeNumber?: string;
      roundingMethod?: 'round' | 'ceil' | 'floor'; // 端数処理方式：四捨五入、切り上げ、切り捨て
      cardFormat?: 'none' | 'card' | 'paper' | 'ic'; // 保険証の形式：指定なし、カード型、紙型、IC型
    };
    pensionInsurance?: {
      officeNumber?: string;
      roundingMethod?: 'round' | 'ceil' | 'floor'; // 端数処理方式：四捨五入、切り上げ、切り捨て
      businessCategory?: string; // 厚生年金適用事業所区分
    };
    careInsurance?: {
      targetOffice: boolean;
    };
    employmentInsurance?: {
      officeNumber?: string;
      laborInsuranceNumber?: string;
    };
  };
  applicationFlowSettings?: {
    applicationTypes?: any[];
    approvalRule?: {
      method: string;
      description: string;
    };
    attachmentSettings?: any[];
    notificationSettings?: any;
  };
  documentSettings?: {
    allowedFormats?: string[];
    maxFileSize?: number;
    retentionYears?: number;
  };
  setupCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsuranceSettings {
  healthInsurance: {
    type: 'kyokai' | 'kumiai';
    officeNumber?: string;
    roundingMethod?: 'round' | 'ceil' | 'floor';
    cardFormat?: 'none' | 'card' | 'paper' | 'ic';
  };
  pensionInsurance: {
    officeNumber?: string;
    roundingMethod?: 'round' | 'ceil' | 'floor';
    businessCategory?: string;
  };
  careInsurance: {
    targetOffice: boolean;
  };
  employmentInsurance: {
    officeNumber?: string;
    laborInsuranceNumber?: string;
  };
}

