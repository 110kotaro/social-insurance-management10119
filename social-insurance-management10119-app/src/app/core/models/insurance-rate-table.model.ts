/**
 * 保険料率・標準報酬等級統合テーブルモデル
 */
export interface InsuranceRateTable {
  id?: string;
  grade: number; // 健保・介護保険の等級
  pensionGrade?: number | null; // 厚生年金の等級（nullの場合は未設定）
  standardRewardAmount: number; // 標準報酬月額の規定値（例：58,000円、68,000円など）
  minAmount: number; // 標準報酬月額最小値（0の場合は最下限）
  maxAmount: number; // 標準報酬月額最大値（nullの場合は最上限）
  healthInsuranceWithoutCare: {
    rate: number; // 料率（例：9.91%）
    total: number; // 全額
    half: number; // 折半額
  };
  healthInsuranceWithCare: {
    rate: number; // 料率（例：11.50%）
    total: number; // 全額
    half: number; // 折半額
  };
  pensionInsurance: {
    rate: number; // 料率（例：18.300%）
    total: number; // 全額
    half: number; // 折半額
  };
  effectiveFrom: Date; // 適用開始日
  effectiveTo?: Date | null; // 適用終了日（nullの場合は現在有効）
  organizationId: string | null; // 組織ID（nullの場合は全組織共通）
  createdAt: Date;
  updatedAt: Date;
}

