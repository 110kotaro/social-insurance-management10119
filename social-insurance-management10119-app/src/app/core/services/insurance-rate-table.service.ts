import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, collection, query, where, getDocs, deleteDoc, Timestamp } from '@angular/fire/firestore';
import { InsuranceRateTable } from '../models/insurance-rate-table.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class InsuranceRateTableService {
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
      try {
        return value.toDate();
      } catch (error) {
        console.error('Failed to convert Timestamp to Date:', error);
        return null;
      }
    }
    // seconds と nanoseconds プロパティがある場合（Firestore Timestamp形式）
    if (value && typeof value.seconds === 'number') {
      try {
        // seconds をミリ秒に変換して Date オブジェクトを作成
        const milliseconds = value.seconds * 1000 + (value.nanoseconds || 0) / 1000000;
        return new Date(milliseconds);
      } catch (error) {
        console.error('Failed to convert Timestamp (seconds/nanoseconds) to Date:', error);
        return null;
      }
    }
    // その他の場合はnullを返す
    return null;
  }

  /**
   * 保険料率テーブルレコードを作成
   */
  async createRateTable(rateTable: Omit<InsuranceRateTable, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const rateRef = doc(collection(this.firestore, `${environment.firestorePrefix}insuranceRateTables`));
    const now = new Date();
    
    const rateData: any = {
      grade: rateTable.grade,
      standardRewardAmount: rateTable.standardRewardAmount,
      minAmount: rateTable.minAmount,
      maxAmount: rateTable.maxAmount,
      healthInsuranceWithoutCare: rateTable.healthInsuranceWithoutCare,
      healthInsuranceWithCare: rateTable.healthInsuranceWithCare,
      pensionInsurance: rateTable.pensionInsurance,
      effectiveFrom: rateTable.effectiveFrom instanceof Date 
        ? Timestamp.fromDate(rateTable.effectiveFrom) 
        : rateTable.effectiveFrom,
      organizationId: rateTable.organizationId,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now)
    };

    if (rateTable.pensionGrade !== undefined && rateTable.pensionGrade !== null) {
      rateData.pensionGrade = rateTable.pensionGrade;
    }

    // effectiveToがnullの場合もnullとして設定（undefinedの場合は設定しない）
    if (rateTable.effectiveTo !== undefined) {
      rateData.effectiveTo = rateTable.effectiveTo instanceof Date 
        ? Timestamp.fromDate(rateTable.effectiveTo) 
        : rateTable.effectiveTo;
    }

    const cleanedData = this.removeUndefinedValues(rateData);
    await setDoc(rateRef, cleanedData);

    return rateRef.id;
  }

  /**
   * 複数の保険料率テーブルレコードを一括作成
   */
  async createRateTables(rateTables: Omit<InsuranceRateTable, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<string[]> {
    const promises = rateTables.map(rateTable => this.createRateTable(rateTable));
    return Promise.all(promises);
  }

  /**
   * 保険料率テーブルレコードを更新
   */
  async updateRateTable(rateTableId: string, updates: Partial<InsuranceRateTable>): Promise<void> {
    const rateRef = doc(this.firestore, `${environment.firestorePrefix}insuranceRateTables`, rateTableId);
    
    const updateData: any = {
      updatedAt: Timestamp.fromDate(new Date())
    };

    if (updates.grade !== undefined) updateData.grade = updates.grade;
    if (updates.standardRewardAmount !== undefined) updateData.standardRewardAmount = updates.standardRewardAmount;
    if (updates.minAmount !== undefined) updateData.minAmount = updates.minAmount;
    if (updates.maxAmount !== undefined) updateData.maxAmount = updates.maxAmount;
    if (updates.healthInsuranceWithoutCare !== undefined) {
      updateData.healthInsuranceWithoutCare = this.removeUndefinedValues(updates.healthInsuranceWithoutCare);
    }
    if (updates.healthInsuranceWithCare !== undefined) {
      updateData.healthInsuranceWithCare = this.removeUndefinedValues(updates.healthInsuranceWithCare);
    }
    if (updates.pensionInsurance !== undefined) {
      updateData.pensionInsurance = this.removeUndefinedValues(updates.pensionInsurance);
    }
    if (updates.effectiveFrom !== undefined) {
      updateData.effectiveFrom = updates.effectiveFrom instanceof Date 
        ? Timestamp.fromDate(updates.effectiveFrom) 
        : updates.effectiveFrom;
    }
    // effectiveToがnullの場合もnullとして設定（undefinedの場合は設定しない）
    if (updates.effectiveTo !== undefined) {
      updateData.effectiveTo = updates.effectiveTo instanceof Date 
        ? Timestamp.fromDate(updates.effectiveTo) 
        : updates.effectiveTo;
    }
    if (updates.organizationId !== undefined) updateData.organizationId = updates.organizationId;

    const cleanedData = this.removeUndefinedValues(updateData);
    await setDoc(rateRef, cleanedData, { merge: true });
  }

  /**
   * 保険料率テーブルレコードを削除
   */
  async deleteRateTable(rateTableId: string): Promise<void> {
    const rateRef = doc(this.firestore, `${environment.firestorePrefix}insuranceRateTables`, rateTableId);
    await deleteDoc(rateRef);
  }

  /**
   * 組織の保険料率テーブルを取得
   */
  async getRateTablesByOrganization(organizationId: string): Promise<InsuranceRateTable[]> {
    const q = query(
      collection(this.firestore, `${environment.firestorePrefix}insuranceRateTables`),
      where('organizationId', '==', organizationId)
    );
    
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
      } as InsuranceRateTable;
    }).sort((a, b) => a.grade - b.grade);
  }

  /**
   * 全組織共通の保険料率テーブルを取得
   */
  async getCommonRateTables(): Promise<InsuranceRateTable[]> {
    const q = query(
      collection(this.firestore, `${environment.firestorePrefix}insuranceRateTables`),
      where('organizationId', '==', null)
    );
    
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
      } as InsuranceRateTable;
    }).sort((a, b) => a.grade - b.grade);
  }

  /**
   * 組織の保険料率テーブルを全削除（インポート前のクリーンアップ用）
   */
  async deleteAllByOrganization(organizationId: string): Promise<void> {
    const rateTables = await this.getRateTablesByOrganization(organizationId);
    const promises = rateTables
      .filter(rateTable => rateTable.id !== undefined)
      .map(rateTable => this.deleteRateTable(rateTable.id!));
    await Promise.all(promises);
  }
}

