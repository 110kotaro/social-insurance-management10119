import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, updateDoc, Timestamp } from '@angular/fire/firestore';
import { Employee, SalaryData, SalaryDataChangeHistory } from '../models/employee.model';
import { EmployeeService } from './employee.service';

@Injectable({
  providedIn: 'root'
})
export class SalaryDataService {
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
   * 給与データを取得
   */
  async getSalaryData(employeeId: string, year: number, month: number): Promise<SalaryData | null> {
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee || !employee.salaryData) {
      return null;
    }
    return employee.salaryData.find(sd => sd.year === year && sd.month === month) || null;
  }

  /**
   * 社員の給与データ一覧を取得
   */
  async getSalaryDataList(employeeId: string): Promise<SalaryData[]> {
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee || !employee.salaryData) {
      return [];
    }
    return employee.salaryData.map(sd => ({
      ...sd,
      createdAt: this.convertToDate(sd.createdAt) || new Date(),
      updatedAt: this.convertToDate(sd.updatedAt) || new Date(),
      confirmedAt: sd.confirmedAt ? (this.convertToDate(sd.confirmedAt) || undefined) : undefined
    })) as SalaryData[];
  }

  /**
   * 給与データを保存（下書き）
   */
  async saveSalaryData(employeeId: string, salaryData: Omit<SalaryData, 'createdAt' | 'updatedAt' | 'changeHistory'>): Promise<void> {
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee) {
      throw new Error('社員が見つかりません');
    }

    const now = new Date();
    const salaryDataList = employee.salaryData || [];
    const existingIndex = salaryDataList.findIndex(sd => sd.year === salaryData.year && sd.month === salaryData.month);

    const newSalaryData: SalaryData = {
      ...salaryData,
      isConfirmed: false,
      createdAt: existingIndex >= 0 ? salaryDataList[existingIndex].createdAt : now,
      updatedAt: now,
      changeHistory: existingIndex >= 0 ? salaryDataList[existingIndex].changeHistory : undefined
    };

    if (existingIndex >= 0) {
      salaryDataList[existingIndex] = newSalaryData;
    } else {
      salaryDataList.push(newSalaryData);
    }

    await this.employeeService.updateEmployee(employeeId, { salaryData: salaryDataList });
  }

  /**
   * 給与データを確定
   */
  async confirmSalaryData(employeeId: string, year: number, month: number, confirmedBy: string): Promise<void> {
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee || !employee.salaryData) {
      throw new Error('給与データが見つかりません');
    }

    const salaryDataList = employee.salaryData;
    const index = salaryDataList.findIndex(sd => sd.year === year && sd.month === month);
    if (index < 0) {
      throw new Error('給与データが見つかりません');
    }

    const now = new Date();
    const existingData = salaryDataList[index];
    
    // 既に確定済みの場合は変更履歴を追加
    if (existingData.isConfirmed && existingData.confirmedAt) {
      const changeHistory: SalaryDataChangeHistory = {
        changedAt: now,
        changedBy: confirmedBy,
        before: {
          baseDays: existingData.baseDays,
          fixedSalary: existingData.fixedSalary,
          totalPayment: existingData.totalPayment,
          retroactivePayment: existingData.retroactivePayment
        },
        after: {
          baseDays: existingData.baseDays,
          fixedSalary: existingData.fixedSalary,
          totalPayment: existingData.totalPayment,
          retroactivePayment: existingData.retroactivePayment
        }
      };
      existingData.changeHistory = existingData.changeHistory || [];
      existingData.changeHistory.push(changeHistory);
    }

    salaryDataList[index] = {
      ...existingData,
      isConfirmed: true,
      confirmedAt: now,
      confirmedBy: confirmedBy,
      updatedAt: now
    };

    await this.employeeService.updateEmployee(employeeId, { salaryData: salaryDataList });
  }

  /**
   * 給与データを更新（確定後の修正）
   */
  async updateSalaryData(
    employeeId: string,
    year: number,
    month: number,
    updates: Partial<Pick<SalaryData, 'baseDays' | 'fixedSalary' | 'totalPayment' | 'retroactivePayment'>>,
    updatedBy: string
  ): Promise<void> {
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee || !employee.salaryData) {
      throw new Error('給与データが見つかりません');
    }

    const salaryDataList = employee.salaryData;
    const index = salaryDataList.findIndex(sd => sd.year === year && sd.month === month);
    if (index < 0) {
      throw new Error('給与データが見つかりません');
    }

    const existingData = salaryDataList[index];
    const now = new Date();

    // 変更履歴を追加
    const changeHistory: SalaryDataChangeHistory = {
      changedAt: now,
      changedBy: updatedBy,
      before: {
        baseDays: existingData.baseDays,
        fixedSalary: existingData.fixedSalary,
        totalPayment: existingData.totalPayment,
        retroactivePayment: existingData.retroactivePayment
      },
      after: {
        baseDays: updates.baseDays ?? existingData.baseDays,
        fixedSalary: updates.fixedSalary ?? existingData.fixedSalary,
        totalPayment: updates.totalPayment ?? existingData.totalPayment,
        retroactivePayment: updates.retroactivePayment ?? existingData.retroactivePayment
      }
    };

    existingData.changeHistory = existingData.changeHistory || [];
    existingData.changeHistory.push(changeHistory);

    salaryDataList[index] = {
      ...existingData,
      ...updates,
      updatedAt: now
    };

    await this.employeeService.updateEmployee(employeeId, { salaryData: salaryDataList });
  }

  /**
   * 給与データを一括インポート
   */
  async importSalaryData(employeeId: string, salaryDataList: Omit<SalaryData, 'createdAt' | 'updatedAt' | 'changeHistory' | 'isConfirmed' | 'confirmedAt' | 'confirmedBy'>[]): Promise<void> {
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee) {
      throw new Error('社員が見つかりません');
    }

    const now = new Date();
    const existingSalaryData = employee.salaryData || [];
    const salaryDataMap = new Map<string, SalaryData>();
    
    // 既存データをマップに追加
    existingSalaryData.forEach(sd => {
      const key = `${sd.year}-${sd.month}`;
      salaryDataMap.set(key, sd);
    });

    // インポートデータを追加または更新
    salaryDataList.forEach(sd => {
      const key = `${sd.year}-${sd.month}`;
      const existing = salaryDataMap.get(key);
      salaryDataMap.set(key, {
        ...sd,
        isConfirmed: existing?.isConfirmed || false,
        confirmedAt: existing?.confirmedAt,
        confirmedBy: existing?.confirmedBy,
        changeHistory: existing?.changeHistory,
        createdAt: existing?.createdAt || now,
        updatedAt: now
      });
    });

    await this.employeeService.updateEmployee(employeeId, { salaryData: Array.from(salaryDataMap.values()) });
  }
}

