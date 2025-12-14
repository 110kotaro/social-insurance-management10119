export interface Organization {
  id?: string;
  name: string;
  corporateNumber?: string;
  // officeSymbol?: string; // 事業所整理記号（削除：保険情報の健康保険に移動）
  // officeNumber?: string; // 事業所番号（削除：保険情報の健康保険・厚生年金に移動）
  address: {
    postalCode?: string; // 郵便番号
    prefecture: string;
    city: string;
    street: string;
    building?: string;
  };
  phoneNumber?: string;
  ownerName?: string; // 事業主氏名（修正17）
  email?: string;
  industry?: string;
  logoUrl?: string;
  payrollDate?: number; // 月次計算予定日（1-31の日付、月末処理あり、月次計算日の通知用）
  leaveInsuranceCollectionMethod?: 'postpaid' | 'direct_transfer'; // 休職中の保険料徴収方法（後払い/本人振込）
  insuranceSettings?: {
    healthInsurance?: {
      type: 'kyokai' | 'kumiai';
      officeSymbol?: string; // 事業所整理記号（必須）
      // roundingMethod?: 'round' | 'ceil' | 'floor'; // 端数処理方式：削除（計算ロジックで実装済み）
      cardFormat?: 'none' | 'card' | 'paper' | 'ic'; // 保険証の形式：指定なし、カード型、紙型、IC型
    };
    pensionInsurance?: {
      officeNumber?: string; // 事業所番号（厚生年金用）
      // roundingMethod?: 'round' | 'ceil' | 'floor'; // 端数処理方式：削除（計算ロジックで実装済み）
      businessCategory?: string; // 厚生年金適用事業所区分
    };
    careInsurance?: {
      targetOffice: boolean;
    };
    // employmentInsurance?: { // 雇用保険情報：コメントアウト（不要）
    //   officeNumber?: string;
    //   laborInsuranceNumber?: string;
    // };
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
    officeSymbol?: string; // 事業所整理記号（必須）
    // roundingMethod?: 'round' | 'ceil' | 'floor'; // 端数処理方式：削除
    cardFormat?: 'none' | 'card' | 'paper' | 'ic';
  };
  pensionInsurance: {
    officeNumber?: string; // 事業所番号（厚生年金用）
    // roundingMethod?: 'round' | 'ceil' | 'floor'; // 端数処理方式：削除
    businessCategory?: string;
  };
  careInsurance: {
    targetOffice: boolean;
  };
  // employmentInsurance: { // 雇用保険情報：コメントアウト（不要）
  //   officeNumber?: string;
  //   laborInsuranceNumber?: string;
  // };
}

