import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, Timestamp, orderBy } from '@angular/fire/firestore';
import { OtherCompanySalaryData } from '../models/employee.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class OtherCompanySalaryDataService {
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
   * DateをTimestampに変換
   */
  private convertToTimestamp(date: Date | Timestamp): Timestamp {
    if (date instanceof Date) {
      return Timestamp.fromDate(date);
    }
    return date;
  }

  /**
   * TimestampをDateに変換
   */
  private convertToDate(timestamp: Date | Timestamp): Date {
    if (timestamp instanceof Date) {
      return timestamp;
    }
    if (timestamp && typeof (timestamp as any).toDate === 'function') {
      return (timestamp as any).toDate();
    }
    if (timestamp && typeof (timestamp as any).seconds === 'number') {
      return new Date((timestamp as any).seconds * 1000);
    }
    return new Date();
  }

  /**
   * 他社給与データを作成
   */
  async createOtherCompanySalaryData(data: Omit<OtherCompanySalaryData, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const dataRef = doc(collection(this.firestore, `${environment.firestorePrefix}otherCompanySalaryData`));
    const now = new Date();
    
    const salaryData: OtherCompanySalaryData = {
      ...data,
      createdAt: now,
      updatedAt: now
    };

    // undefinedの値を削除してFirestoreに保存
    const cleanedData = this.removeUndefinedValues(salaryData);
    await setDoc(dataRef, cleanedData);

    return dataRef.id;
  }

  /**
   * 他社給与データを更新
   */
  async updateOtherCompanySalaryData(id: string, updates: Partial<OtherCompanySalaryData>): Promise<void> {
    const dataRef = doc(this.firestore, `${environment.firestorePrefix}otherCompanySalaryData`, id);
    const now = new Date();
    
    const updateData: any = {
      ...updates,
      updatedAt: now
    };

    // undefinedの値を削除
    const cleanedData = this.removeUndefinedValues(updateData);
    await updateDoc(dataRef, cleanedData);
  }

  /**
   * 他社給与データを取得
   */
  async getOtherCompanySalaryData(id: string): Promise<OtherCompanySalaryData | null> {
    const dataRef = doc(this.firestore, `${environment.firestorePrefix}otherCompanySalaryData`, id);
    const docSnap = await getDoc(dataRef);
    
    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data() as OtherCompanySalaryData;
    return {
      ...data,
      id: docSnap.id
    };
  }

  /**
   * 社員の他社給与データを取得（年月でフィルタリング）
   */
  async getOtherCompanySalaryDataByEmployee(
    employeeId: string,
    year?: number,
    month?: number
  ): Promise<OtherCompanySalaryData[]> {
    let q = query(
      collection(this.firestore, `${environment.firestorePrefix}otherCompanySalaryData`),
      where('employeeId', '==', employeeId),
      orderBy('year', 'desc'),
      orderBy('month', 'desc')
    );

    if (year !== undefined && month !== undefined) {
      q = query(
        collection(this.firestore, `${environment.firestorePrefix}otherCompanySalaryData`),
        where('employeeId', '==', employeeId),
        where('year', '==', year),
        where('month', '==', month)
      );
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      ...doc.data() as OtherCompanySalaryData,
      id: doc.id
    }));
  }

  /**
   * 社員の該当月の他社給与データを取得（確定済みのみ）
   */
  async getConfirmedOtherCompanySalaryDataByEmployee(
    employeeId: string,
    year: number,
    month: number
  ): Promise<OtherCompanySalaryData[]> {
    const q = query(
      collection(this.firestore, `${environment.firestorePrefix}otherCompanySalaryData`),
      where('employeeId', '==', employeeId),
      where('year', '==', year),
      where('month', '==', month),
      where('isConfirmed', '==', true)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      ...doc.data() as OtherCompanySalaryData,
      id: doc.id
    }));
  }

  /**
   * 社員の該当月の他社給与データ（賞与）を取得（確定済みのみ）
   */
  async getConfirmedOtherCompanyBonusDataByEmployee(
    employeeId: string,
    year: number,
    month: number
  ): Promise<OtherCompanySalaryData[]> {
    const q = query(
      collection(this.firestore, `${environment.firestorePrefix}otherCompanySalaryData`),
      where('employeeId', '==', employeeId),
      where('year', '==', year),
      where('month', '==', month),
      where('isConfirmed', '==', true)
    );

    const querySnapshot = await getDocs(q);
    // bonusが設定されているもののみ返す
    return querySnapshot.docs
      .map(doc => ({
        ...doc.data() as OtherCompanySalaryData,
        id: doc.id
      }))
      .filter(data => data.bonus !== undefined && data.bonus !== null && data.bonus > 0);
  }

  /**
   * 他社給与データを削除
   */
  async deleteOtherCompanySalaryData(id: string): Promise<void> {
    const dataRef = doc(this.firestore, `${environment.firestorePrefix}otherCompanySalaryData`, id);
    await deleteDoc(dataRef);
  }
}

