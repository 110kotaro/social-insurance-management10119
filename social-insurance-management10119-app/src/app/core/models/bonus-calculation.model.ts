import { Timestamp } from '@angular/fire/firestore';
import { DependentInfo } from './employee.model';

/**
 * 再計算履歴
 */
export interface BonusCalculationRecalculationHistory {
  recalculatedAt: Date | Timestamp;
  recalculatedBy: string;
  reason?: string;
  dataSnapshot: Partial<BonusCalculation>;
}

/**
 * 保険料差額情報
 */
export interface BonusPremiumDifference {
  previousHealthInsurancePremium: number;
  previousPensionInsurancePremium: number;
  previousCompanyShare: number;
  previousEmployeeShare: number;
  newHealthInsurancePremium: number;
  newPensionInsurancePremium: number;
  newCompanyShare: number;
  newEmployeeShare: number;
  healthInsurancePremiumDiff: number;
  pensionInsurancePremiumDiff: number;
  companyShareDiff: number;
  employeeShareDiff: number;
}

/**
 * 遡及控除情報
 */
export interface BonusRetroactiveDeduction {
  year: number;
  month: number;
  healthInsurancePremiumDiff: number;
  pensionInsurancePremiumDiff: number;
  companyShareDiff: number;
  employeeShareDiff: number;
  appliedAt: Date | Timestamp;
  appliedBy: string;
}

/**
 * 休職中後払い分の情報（復職月に追記する分・賞与計算用）
 */
export interface BonusPostpaidLeaveAmount {
  year: number; // 休職期間中の年
  month: number; // 休職期間中の月
  employeeShare: number; // その月の社員負担分（後払い分）
  companyShare: number; // その月の会社負担分（建て替え分）
  totalPremium: number; // その月の保険料全額（建て替え分の計算用）
  leaveType: string; // 休職種別
}

/**
 * 賞与計算結果モデル
 */
export interface BonusCalculation {
  id?: string;
  organizationId: string;
  year: number;
  month: number;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  departmentName?: string;
  bonusAmount: number; // 賞与額
  standardBonusAmount: number; // 標準賞与額（1000円未満切り捨て後）
  healthInsurancePremium: number; // 健康保険料（全額）
  pensionInsurancePremium: number; // 厚生年金料（全額）
  careInsurancePremium: number; // 介護保険料（全額、40-64歳のみ）
  totalPremium: number; // 合計保険料（全額）
  companyShare: number; // 会社負担額（折半額）
  employeeShare: number; // 従業員負担額（折半額）
  calculationDate: Date | Timestamp;
  calculatedBy: string;
  status: 'draft' | 'confirmed' | 'exported';
  notes?: string;
  dependentInfo?: DependentInfo[];
  // 他社兼務関連
  isOtherCompany?: boolean; // 他社兼務かどうか
  ownCompanySalary?: number; // 自社給与（賞与）
  otherCompanySalaryTotal?: number; // 他社月額報酬合算（賞与）
  healthInsuranceRate?: number;
  healthInsuranceRateWithCare?: boolean;
  pensionInsuranceRate?: number;
  birthDate?: Date | Timestamp;
  joinDate?: Date | Timestamp;
  recalculationHistory?: BonusCalculationRecalculationHistory[];
  confirmedAt?: Date | Timestamp;
  confirmedBy?: string;
  exportedAt?: Date | Timestamp;
  exportedBy?: string;
  premiumDifference?: BonusPremiumDifference;
  retroactiveDeductions?: BonusRetroactiveDeduction[];
  // 休職中後払い分の情報（復職月に追記する分）
  postpaidLeaveAmounts?: BonusPostpaidLeaveAmount[]; // 休職期間中の各月の未徴収分
  postpaidLeaveTotal?: number; // 休職中未徴収分の合計（社員負担分）
  postpaidLeaveCompanyTotal?: number; // 休職中建て替え分の合計（会社負担分）
  // 休職期間中の計算結果用（その月が休職期間中の場合）
  isOnLeave?: boolean; // 休職中かどうか
  postpaidLeaveAmount?: number; // 後払い分の金額（社員負担分）
  postpaidLeaveCompanyAmount?: number; // 建て替え分の金額（会社負担分、折半前の全額）
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

/**
 * 計算結果サマリー（組織全体）
 */
export interface BonusCalculationSummary {
  totalEmployees: number;
  totalPremium: number;
  totalCompanyShare: number;
  totalEmployeeShare: number;
}

/**
 * 賞与計算一覧画面用の行データ
 */
export interface BonusCalculationListRow {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  departmentName?: string;
  calculation: BonusCalculation | null;
  employeeStatus?: 'active' | 'leave' | 'retired' | 'pre_join'; // 社員ステータス
  isOnLeave?: boolean; // 休職中かどうか
}

