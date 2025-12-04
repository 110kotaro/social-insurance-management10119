import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, collection, query, where, getDocs, Timestamp } from '@angular/fire/firestore';
import { StandardReward } from '../models/standard-reward.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class StandardRewardService {
  private firestore = inject(Firestore);

  /**
   * オブジェクトからundefined値を再帰的に削除するヘルパー関数
   */
  private removeUndefinedValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeUndefinedValues(item));
    }
    
    if (typeof obj === 'object') {
      const cleaned: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          if (value !== undefined) {
            cleaned[key] = this.removeUndefinedValues(value);
          }
        }
      }
      return cleaned;
    }
    
    return obj;
  }

  /**
   * FirestoreのTimestampまたはDateをDateオブジェクトに変換するヘルパー関数
   * Emulatorと本番環境の両方に対応
   */
  private convertToDate(value: any): Date | null {
    if (!value) {
      return null;
    }
    // 既にDateオブジェクトの場合はそのまま返す
    if (value instanceof Date) {
      return value;
    }
    // Timestampオブジェクトの場合はtoDate()を呼び出す
    if (value && typeof value.toDate === 'function') {
      return value.toDate();
    }
    // その他の場合はnullを返す
    return null;
  }

  /**
   * 標準報酬等級を作成
   */
  async createStandardReward(reward: Omit<StandardReward, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const rewardRef = doc(collection(this.firestore, `${environment.firestorePrefix}standardRewards`));
    const now = new Date();
    
    const rewardData: any = {
      grade: reward.grade,
      minAmount: reward.minAmount,
      maxAmount: reward.maxAmount,
      effectiveFrom: reward.effectiveFrom,
      createdAt: now,
      updatedAt: now
    };

    if (reward.effectiveTo !== undefined && reward.effectiveTo !== null) {
      rewardData.effectiveTo = reward.effectiveTo;
    }

    const cleanedData = this.removeUndefinedValues(rewardData);
    await setDoc(rewardRef, cleanedData);

    return rewardRef.id;
  }

  /**
   * 複数の標準報酬等級を一括作成
   */
  async createStandardRewards(rewards: Omit<StandardReward, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<string[]> {
    const promises = rewards.map(reward => this.createStandardReward(reward));
    return Promise.all(promises);
  }

  /**
   * 標準報酬等級を取得
   */
  async getStandardRewards(): Promise<StandardReward[]> {
    const q = query(collection(this.firestore, `${environment.firestorePrefix}standardRewards`));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        effectiveFrom: this.convertToDate(data['effectiveFrom']) || new Date(),
        effectiveTo: this.convertToDate(data['effectiveTo']) || null,
        createdAt: this.convertToDate(data['createdAt']) || new Date(),
        updatedAt: this.convertToDate(data['updatedAt']) || new Date()
      } as StandardReward;
    });
  }
}

