import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, collection, query, where, getDocs, Timestamp } from '@angular/fire/firestore';
import { InsuranceRate } from '../models/insurance-rate.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class InsuranceRateService {
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
   * 保険料率を作成
   */
  async createInsuranceRate(rate: Omit<InsuranceRate, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const rateRef = doc(collection(this.firestore, `${environment.firestorePrefix}insuranceRates`));
    const now = new Date();
    
    const rateData: any = {
      type: rate.type,
      rate: rate.rate,
      effectiveFrom: rate.effectiveFrom,
      organizationId: rate.organizationId,
      createdAt: now,
      updatedAt: now
    };

    if (rate.effectiveTo !== undefined && rate.effectiveTo !== null) {
      rateData.effectiveTo = rate.effectiveTo;
    }

    const cleanedData = this.removeUndefinedValues(rateData);
    await setDoc(rateRef, cleanedData);

    return rateRef.id;
  }

  /**
   * 複数の保険料率を一括作成
   */
  async createInsuranceRates(rates: Omit<InsuranceRate, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<string[]> {
    const promises = rates.map(rate => this.createInsuranceRate(rate));
    return Promise.all(promises);
  }

  /**
   * 組織の保険料率を取得
   */
  async getInsuranceRatesByOrganization(organizationId: string): Promise<InsuranceRate[]> {
    const q = query(
      collection(this.firestore, `${environment.firestorePrefix}insuranceRates`),
      where('organizationId', '==', organizationId)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        effectiveFrom: data['effectiveFrom']?.toDate() || new Date(),
        effectiveTo: data['effectiveTo']?.toDate() || null,
        createdAt: data['createdAt']?.toDate() || new Date(),
        updatedAt: data['updatedAt']?.toDate() || new Date()
      } as InsuranceRate;
    });
  }

  /**
   * 全組織共通の保険料率を取得
   */
  async getCommonInsuranceRates(): Promise<InsuranceRate[]> {
    const q = query(
      collection(this.firestore, `${environment.firestorePrefix}insuranceRates`),
      where('organizationId', '==', null)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        effectiveFrom: data['effectiveFrom']?.toDate() || new Date(),
        effectiveTo: data['effectiveTo']?.toDate() || null,
        createdAt: data['createdAt']?.toDate() || new Date(),
        updatedAt: data['updatedAt']?.toDate() || new Date()
      } as InsuranceRate;
    });
  }
}

