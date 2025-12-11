import { Timestamp } from '@angular/fire/firestore';

/**
 * 再計算履歴
 */
export interface StandardRewardCalculationRecalculationHistory {
  recalculatedAt: Date | Timestamp; // 再計算日時
  recalculatedBy: string; // 再計算実行者のuserId
  reason?: string; // 再計算理由
  dataSnapshot: Partial<StandardRewardCalculation>; // 再計算前の計算データのスナップショット
}

/**
 * 算定／月変計算履歴モデル
 */
export interface StandardRewardCalculation {
  id?: string;
  organizationId: string;
  employeeId: string;
  employeeNumber: string; // 社員番号（表示用）
  employeeName: string; // 社員名（表示用）
  calculationType: 'standard' | 'monthly_change'; // 算定 or 月変
  targetYear: number; // 算定の場合は7月1日時点の年、月変の場合は変動月の年
  targetMonth: number; // 算定の場合は7、月変の場合は変動月
  // 算定の場合
  baseMonths?: { year: number; month: number }[]; // 4月、5月、6月
  // 月変の場合
  changeMonth?: { year: number; month: number }; // 固定賃金変動月
  calculationMonths?: { year: number; month: number }[]; // 変動月を含む3か月
  salaryData: { // 給与データ（計算に使用したデータ）
    year: number;
    month: number;
    baseDays: number;
    fixedSalary: number;
    totalPayment: number;
    retroactivePayment?: number;
  }[];
  averageReward: number; // 平均月額（基礎日数17日以上の月のみ集計、遡及支払額を考慮）
  grade: number; // 決定された等級
  pensionGrade: number; // 決定された厚生年金等級
  standardReward: number; // 決定された標準報酬月額
  previousGrade?: number; // 月変の場合の従前等級
  gradeChange?: number; // 等級変動（月変の場合）
  requiresApplication: boolean; // 申請が必要か（月変で2等級以上変動の場合）
  status: 'draft' | 'applied' | 'approved'; // 計算履歴のステータス
  applicationId?: string; // 申請ID（申請時に紐付け）
  // 再計算履歴（月次計算と同様）
  recalculationHistory?: StandardRewardCalculationRecalculationHistory[];
  calculatedAt: Date | Timestamp;
  calculatedBy: string;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

/**
 * 算定／月変計算一覧画面用の行データ
 */
export interface StandardRewardCalculationListRow {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  departmentName?: string; // 部署名
  calculation: StandardRewardCalculation | null; // nullの場合は未計算
}

