/**
 * 保険料率モデル
 */
export interface InsuranceRate {
  id?: string;
  type: 'health' | 'pension' | 'care'; // 保険種別
  rate: number; // 料率（パーセンテージ）
  effectiveFrom: Date; // 適用開始日
  effectiveTo?: Date | null; // 適用終了日（nullの場合は現在有効）
  organizationId: string | null; // 組織ID（nullの場合は全組織共通）
  createdAt: Date;
  updatedAt: Date;
}

