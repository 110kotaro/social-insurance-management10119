import { Timestamp } from '@angular/fire/firestore';
import { DependentInfo } from './employee.model';

/**
 * 再計算履歴
 */
export interface CalculationRecalculationHistory {
  recalculatedAt: Date | Timestamp; // 再計算日時
  recalculatedBy: string; // 再計算実行者のuserId
  reason?: string; // 再計算理由
  dataSnapshot: Partial<MonthlyCalculation>; // 再計算前の計算データのスナップショット
}

/**
 * 保険料差額情報
 */
export interface PremiumDifference {
  // 前回の保険料
  previousHealthInsurancePremium: number; // 健保・介護（全額）
  previousPensionInsurancePremium: number; // 厚生年金（全額）
  previousCompanyShare: number; // 会社負担額（折半額）
  previousEmployeeShare: number; // 従業員負担額（折半額）
  
  // 新しい保険料
  newHealthInsurancePremium: number; // 健保・介護（全額）
  newPensionInsurancePremium: number; // 厚生年金（全額）
  newCompanyShare: number; // 会社負担額（折半額）
  newEmployeeShare: number; // 従業員負担額（折半額）
  
  // 差額（4つ）
  healthInsurancePremiumDiff: number; // 健保・介護の差額（全額）
  pensionInsurancePremiumDiff: number; // 厚生年金の差額（全額）
  companyShareDiff: number; // 会社負担額の差額（折半額）
  employeeShareDiff: number; // 従業員負担額の差額（折半額）
}

/**
 * 遡及控除情報
 */
export interface RetroactiveDeduction {
  year: number; // 適用年
  month: number; // 適用月
  healthInsurancePremiumDiff: number; // 健保・介護の差額（全額）
  pensionInsurancePremiumDiff: number; // 厚生年金の差額（全額）
  companyShareDiff: number; // 会社負担額の差額（折半額）
  employeeShareDiff: number; // 従業員負担額の差額（折半額）
  appliedAt: Date | Timestamp; // 適用日時
  appliedBy: string; // 適用実行者のuserId
}

/**
 * 休職中後払い分の情報（復職月に追記する分）
 */
export interface PostpaidLeaveAmount {
  year: number; // 休職期間中の年
  month: number; // 休職期間中の月
  employeeShare: number; // その月の社員負担分（後払い分）
  companyShare: number; // その月の会社負担分（建て替え分）
  totalPremium: number; // その月の保険料全額（建て替え分の計算用）
  leaveType: string; // 休職種別
}

/**
 * 月次計算結果モデル
 */
export interface MonthlyCalculation {
  id?: string;
  organizationId: string;
  year: number; // 計算対象年
  month: number; // 計算対象月（1-12）
  employeeId: string; // 社員ID
  employeeNumber: string; // 社員番号
  employeeName: string; // 社員名（表示用）
  departmentName?: string; // 部署名（表示用）
  standardReward: number; // 標準報酬月額
  grade: number; // 健康保険等級
  pensionGrade?: number | null; // 厚生年金等級
  healthInsurancePremium: number; // 健康保険料（全額）
  pensionInsurancePremium: number; // 厚生年金料（全額）
  careInsurancePremium: number; // 介護保険料（全額、40-64歳のみ）
  totalPremium: number; // 合計保険料（全額）
  companyShare: number; // 会社負担額（折半額）
  employeeShare: number; // 従業員負担額（折半額）
  calculationDate: Date | Timestamp; // 計算日
  calculatedBy: string; // 計算者ID
  status: 'draft' | 'confirmed' | 'exported'; // 計算ステータス
  notes?: string; // 備考
  // 過去計算再現用の追加情報
  monthlyPaymentAmount?: number; // その月の支給額（給与データから取得、後で実装）
  dependentInfo?: DependentInfo[]; // 被扶養者情報
  // 他社兼務関連
  isOtherCompany?: boolean; // 他社兼務かどうか
  ownCompanySalary?: number; // 自社給与
  otherCompanySalaryTotal?: number; // 他社月額報酬合算
  healthInsuranceRate?: number; // 健康保険料率
  healthInsuranceRateWithCare?: boolean; // 健康保険料率が介護保険料込かどうか
  pensionInsuranceRate?: number; // 厚生年金料率
  birthDate?: Date | Timestamp; // 生年月日
  joinDate?: Date | Timestamp; // 入社日
  // ステータス管理用
  recalculationHistory?: CalculationRecalculationHistory[]; // 再計算履歴
  confirmedAt?: Date | Timestamp; // 確定日時
  confirmedBy?: string; // 確定実行者のuserId
  exportedAt?: Date | Timestamp; // CSV出力日時
  exportedBy?: string; // CSV出力実行者のuserId
  // 再計算時の差額情報
  premiumDifference?: PremiumDifference; // 保険料差額情報
  retroactiveDeductions?: RetroactiveDeduction[]; // 遡及控除情報（複数月対応）
  // 休職中後払い分の情報（復職月に追記する分）
  postpaidLeaveAmounts?: PostpaidLeaveAmount[]; // 休職期間中の各月の未徴収分
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
export interface CalculationSummary {
  organizationId: string;
  year: number;
  month: number;
  totalEmployees: number; // 計算対象者数
  totalPremium: number; // 合計保険料（全額）
  totalCompanyShare: number; // 合計会社負担額
  totalEmployeeShare: number; // 合計従業員負担額
  calculationDate: Date | Timestamp;
  calculatedBy: string;
  status: 'draft' | 'confirmed' | 'exported';
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

/**
 * 計算一覧画面用の行データ
 */
export interface CalculationListRow {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  departmentName?: string; // 部署名
  calculation: MonthlyCalculation | null; // nullの場合は未計算
  employeeStatus?: 'active' | 'leave' | 'retired' | 'pre_join'; // 社員ステータス
  isOnLeave?: boolean; // 休職中かどうか
}

