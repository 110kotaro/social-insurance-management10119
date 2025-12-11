import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, updateDoc, Timestamp } from '@angular/fire/firestore';
import { Employee, BonusData, BonusDataChangeHistory } from '../models/employee.model';
import { EmployeeService } from './employee.service';

@Injectable({
  providedIn: 'root'
})
export class BonusDataService {
  private firestore = inject(Firestore);
  private employeeService = inject(EmployeeService);

  /**
   * FirestoreのTimestampまたはDateをDateオブジェクトに変換するヘルパー関数
   */
  private convertToDate(value: any): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    if (value && typeof value.toDate === 'function') {
      return value.toDate();
    }
    if (value && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }
    return null;
  }

  /**
   * 標準賞与額を計算（1000円未満を切り捨て）
   */
  calculateStandardBonusAmount(bonusAmount: number): number {
    return Math.floor(bonusAmount / 1000) * 1000;
  }

  /**
   * 賞与データを取得
   */
  async getBonusData(employeeId: string, year: number, month: number): Promise<BonusData | null> {
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee || !employee.bonusData) {
      return null;
    }
    return employee.bonusData.find(bd => bd.year === year && bd.month === month) || null;
  }

  /**
   * 社員の賞与データ一覧を取得
   */
  async getBonusDataList(employeeId: string): Promise<BonusData[]> {
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee || !employee.bonusData) {
      return [];
    }
    return employee.bonusData.map(bd => ({
      ...bd,
      createdAt: this.convertToDate(bd.createdAt) || new Date(),
      updatedAt: this.convertToDate(bd.updatedAt) || new Date(),
      confirmedAt: bd.confirmedAt ? (this.convertToDate(bd.confirmedAt) || undefined) : undefined
    })) as BonusData[];
  }

  /**
   * 賞与データを保存（下書き）
   */
  async saveBonusData(employeeId: string, bonusData: Omit<BonusData, 'createdAt' | 'updatedAt' | 'changeHistory' | 'standardBonusAmount'>): Promise<void> {
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee) {
      throw new Error('社員が見つかりません');
    }

    const now = new Date();
    const bonusDataList = employee.bonusData || [];
    const existingIndex = bonusDataList.findIndex(bd => bd.year === bonusData.year && bd.month === bonusData.month);

    // 標準賞与額を計算
    const standardBonusAmount = this.calculateStandardBonusAmount(bonusData.bonusAmount);

    const newBonusData: BonusData = {
      ...bonusData,
      standardBonusAmount: standardBonusAmount,
      isConfirmed: false,
      createdAt: existingIndex >= 0 ? bonusDataList[existingIndex].createdAt : now,
      updatedAt: now,
      changeHistory: existingIndex >= 0 ? bonusDataList[existingIndex].changeHistory : undefined
    };

    if (existingIndex >= 0) {
      bonusDataList[existingIndex] = newBonusData;
    } else {
      bonusDataList.push(newBonusData);
    }

    await this.employeeService.updateEmployee(employeeId, { bonusData: bonusDataList });
  }

  /**
   * 賞与データを確定
   */
  async confirmBonusData(employeeId: string, year: number, month: number, confirmedBy: string): Promise<void> {
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee || !employee.bonusData) {
      throw new Error('賞与データが見つかりません');
    }

    const bonusDataList = employee.bonusData;
    const index = bonusDataList.findIndex(bd => bd.year === year && bd.month === month);
    if (index < 0) {
      throw new Error('賞与データが見つかりません');
    }

    const now = new Date();
    const existingData = bonusDataList[index];
    
    // 既に確定済みの場合は変更履歴を追加
    if (existingData.isConfirmed && existingData.confirmedAt) {
      const changeHistory: BonusDataChangeHistory = {
        changedAt: now,
        changedBy: confirmedBy,
        before: {
          bonusAmount: existingData.bonusAmount,
          standardBonusAmount: existingData.standardBonusAmount
        },
        after: {
          bonusAmount: existingData.bonusAmount,
          standardBonusAmount: existingData.standardBonusAmount
        }
      };
      existingData.changeHistory = existingData.changeHistory || [];
      existingData.changeHistory.push(changeHistory);
    }

    bonusDataList[index] = {
      ...existingData,
      isConfirmed: true,
      confirmedAt: now,
      confirmedBy: confirmedBy,
      updatedAt: now
    };

    await this.employeeService.updateEmployee(employeeId, { bonusData: bonusDataList });
  }

  /**
   * 賞与データを更新（確定後の修正）
   */
  async updateBonusData(
    employeeId: string,
    year: number,
    month: number,
    updates: Partial<Pick<BonusData, 'bonusAmount'>>,
    updatedBy: string
  ): Promise<void> {
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee || !employee.bonusData) {
      throw new Error('賞与データが見つかりません');
    }

    const bonusDataList = employee.bonusData;
    const index = bonusDataList.findIndex(bd => bd.year === year && bd.month === month);
    if (index < 0) {
      throw new Error('賞与データが見つかりません');
    }

    const existingData = bonusDataList[index];
    const now = new Date();

    // 標準賞与額を再計算
    const newBonusAmount = updates.bonusAmount ?? existingData.bonusAmount;
    const newStandardBonusAmount = this.calculateStandardBonusAmount(newBonusAmount);

    // 変更履歴を追加
    const changeHistory: BonusDataChangeHistory = {
      changedAt: now,
      changedBy: updatedBy,
      before: {
        bonusAmount: existingData.bonusAmount,
        standardBonusAmount: existingData.standardBonusAmount
      },
      after: {
        bonusAmount: newBonusAmount,
        standardBonusAmount: newStandardBonusAmount
      }
    };

    existingData.changeHistory = existingData.changeHistory || [];
    existingData.changeHistory.push(changeHistory);

    bonusDataList[index] = {
      ...existingData,
      bonusAmount: newBonusAmount,
      standardBonusAmount: newStandardBonusAmount,
      updatedAt: now
    };

    await this.employeeService.updateEmployee(employeeId, { bonusData: bonusDataList });
  }

  /**
   * 賞与データを一括インポート
   */
  async importBonusData(employeeId: string, bonusDataList: Omit<BonusData, 'createdAt' | 'updatedAt' | 'changeHistory' | 'isConfirmed' | 'confirmedAt' | 'confirmedBy' | 'standardBonusAmount'>[]): Promise<void> {
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee) {
      throw new Error('社員が見つかりません');
    }

    const now = new Date();
    const existingBonusData = employee.bonusData || [];
    const bonusDataMap = new Map<string, BonusData>();
    
    // 既存データをマップに追加
    existingBonusData.forEach(bd => {
      const key = `${bd.year}-${bd.month}`;
      bonusDataMap.set(key, bd);
    });

    // インポートデータを追加または更新
    bonusDataList.forEach(bd => {
      const key = `${bd.year}-${bd.month}`;
      const existing = bonusDataMap.get(key);
      const standardBonusAmount = this.calculateStandardBonusAmount(bd.bonusAmount);
      bonusDataMap.set(key, {
        ...bd,
        standardBonusAmount: standardBonusAmount,
        isConfirmed: existing?.isConfirmed || false,
        confirmedAt: existing?.confirmedAt,
        confirmedBy: existing?.confirmedBy,
        changeHistory: existing?.changeHistory,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      });
    });

    await this.employeeService.updateEmployee(employeeId, { bonusData: Array.from(bonusDataMap.values()) });
  }
}

