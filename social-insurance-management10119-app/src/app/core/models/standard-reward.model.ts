/**
 * 標準報酬等級モデル
 */
export interface StandardReward {
  id?: string;
  grade: number; // 等級
  minAmount: number; // 最低額
  maxAmount: number; // 最高額
  effectiveFrom: Date; // 適用開始日
  effectiveTo?: Date | null; // 適用終了日（nullの場合は現在有効）
  createdAt: Date;
  updatedAt: Date;
}

