import { Injectable, inject } from '@angular/core';
import { Application } from '../models/application.model';
import { ApplicationType } from '../models/application-flow.model';
import { Employee } from '../models/employee.model';
import { EmployeeService } from './employee.service';
import { SalaryDataService } from './salary-data.service';
import { BonusDataService } from './bonus-data.service';

/**
 * 法定期限計算サービス
 * 申請種別ごとの法定期限を計算する
 */
@Injectable({
  providedIn: 'root'
})
export class DeadlineCalculationService {
  private employeeService = inject(EmployeeService);
  private salaryDataService = inject(SalaryDataService);
  private bonusDataService = inject(BonusDataService);

  /**
   * 申請の法定期限を計算
   * @param application 申請データ
   * @param applicationType 申請種別
   * @returns 法定期限（Date | null）。法定期限がない場合はnull
   */
  async calculateLegalDeadline(
    application: Application,
    applicationType: ApplicationType
  ): Promise<Date | null> {
    console.log('[DeadlineCalculationService] calculateLegalDeadline 開始', {
      applicationId: application.id,
      applicationTypeCode: applicationType.code,
      category: applicationType.category
    });

    if (applicationType.category === 'internal') {
      // 内部申請は法定期限なし（管理者設定期限のみ）
      console.log('[DeadlineCalculationService] 内部申請のため null を返す');
      return null;
    }

    // 外部申請の法定期限を計算
    const code = applicationType.code;
    
    switch (code) {
      case 'INSURANCE_ACQUISITION':
        // 資格取得届：資格取得年月日から5日以内（入社日から5日目）
        const result = await this.calculateInsuranceAcquisitionDeadline(application);
        console.log('[DeadlineCalculationService] calculateLegalDeadline 結果 (INSURANCE_ACQUISITION)', {
          applicationId: application.id,
          result: result,
          resultType: result ? 'Date' : 'null',
          resultValue: result ? result.toISOString() : null
        });
        return result;
      
      case 'INSURANCE_LOSS':
        // 資格喪失届：資格喪失年月日から5日以内（退社日の翌日から5日目）
        return await this.calculateInsuranceLossDeadline(application);
      
      case 'DEPENDENT_CHANGE_EXTERNAL':
        // 被扶養者（異動）届：事実発生から5日以内
        return this.calculateDependentChangeDeadline(application);
      
      case 'REWARD_BASE':
        // 算定基礎届：7月10日が法定期限
        return this.calculateRewardBaseDeadline(application);
      
      case 'REWARD_CHANGE':
        // 報酬月額変更届：速やかに届け出る（設定画面で期限設定可能、デフォルトは変動月から4か月目の月末）
        return this.calculateRewardChangeDeadline(application);
      
      case 'BONUS_PAYMENT':
        // 賞与支払届：賞与支払い日より5日以内
        return await this.calculateBonusPaymentDeadline(application);
      
      case 'ADDRESS_CHANGE_EXTERNAL':
      case 'NAME_CHANGE_EXTERNAL':
        // 住所変更届・氏名変更届：速やかに届け出る（設定画面で期限設定可能、デフォルトは申請日から14日目）
        return this.calculatePromptDeadline(application, 14);
      
      default:
        // その他の申請種別は法定期限なし
        return null;
    }
  }

  /**
   * 資格取得届の法定期限を計算（各被保険者ごとに期限を計算してdata内に保存）
   * 資格取得年月日から5日以内
   * @returns null（各被保険者ごとに期限を保存するため、申請全体の期限は不要）
   */
  private async calculateInsuranceAcquisitionDeadline(application: Application): Promise<Date | null> {
    const insuredPersons = application.data?.['insuredPersons'];
    if (!insuredPersons || !Array.isArray(insuredPersons)) {
      return null;
    }

    // 各被保険者の期限を計算してdata内に保存
    for (const person of insuredPersons) {
      const acquisitionDate = person.acquisitionDate;
      if (!acquisitionDate) {
        continue;
      }

      // 年号形式の日付をDateに変換
      let acquisitionDateObj: Date | null = null;
      if (acquisitionDate instanceof Date) {
        acquisitionDateObj = acquisitionDate;
      } else if (acquisitionDate && typeof acquisitionDate === 'object' && acquisitionDate.era) {
        // 年号形式 {era, year, month, day}
        acquisitionDateObj = this.convertEraDateToDate(acquisitionDate);
      }

      if (!acquisitionDateObj) {
        continue;
      }

      // 期限を計算（資格取得日 + 5日）
      const deadline = new Date(acquisitionDateObj);
      deadline.setDate(deadline.getDate() + 5);
      const adjustedDeadline = this.adjustForBusinessDay(deadline);

      // data内に期限を保存
      person.deadline = adjustedDeadline;
    }

    return null; // 各被保険者ごとに期限を保存するため、申請全体の期限は不要
  }

  /**
   * 資格喪失届の法定期限を計算（各被保険者ごとに期限を計算してdata内に保存）
   * 資格喪失年月日から5日以内（lossDate + 5日）
   * @returns null（各被保険者ごとに期限を保存するため、申請全体の期限は不要）
   */
  private async calculateInsuranceLossDeadline(application: Application): Promise<Date | null> {
    const insuredPersons = application.data?.['insuredPersons'];
    if (!insuredPersons || !Array.isArray(insuredPersons)) {
      return null;
    }

    // 各被保険者の期限を計算してdata内に保存
    for (const person of insuredPersons) {
      const lossDate = person.lossDate;
      if (!lossDate) {
        continue;
      }

      // 年号形式の日付をDateに変換
      let lossDateObj: Date | null = null;
      if (lossDate instanceof Date) {
        lossDateObj = lossDate;
      } else if (lossDate && typeof lossDate === 'object' && lossDate.era) {
        // 年号形式 {era, year, month, day}
        lossDateObj = this.convertEraDateToDate(lossDate);
      }

      if (!lossDateObj) {
        continue;
      }

      // 期限を計算（資格喪失日 + 5日）
      const deadline = new Date(lossDateObj);
      deadline.setDate(deadline.getDate() + 5);
      const adjustedDeadline = this.adjustForBusinessDay(deadline);

      // data内に期限を保存
      person.deadline = adjustedDeadline;
    }

    return null; // 各被保険者ごとに期限を保存するため、申請全体の期限は不要
  }

  /**
   * 被扶養者（異動）届の法定期限を計算
   * 事実発生から5日以内
   */
  private calculateDependentChangeDeadline(application: Application): Date | null {
    // 申請データから事実発生日を取得
    const factDate = application.data?.['factDate'];
    if (!factDate) {
      return null;
    }

    const factDateObj = factDate instanceof Date 
      ? factDate 
      : new Date(factDate);
    
    const deadline = new Date(factDateObj);
    deadline.setDate(deadline.getDate() + 5);
    
    return this.adjustForBusinessDay(deadline);
  }

  /**
   * 算定基礎届の法定期限を計算
   * 7月10日が法定期限
   */
  private calculateRewardBaseDeadline(application: Application): Date | null {
    // 申請データから対象年を取得（なければ現在年）
    const targetYear = application.data?.['targetYear'] || new Date().getFullYear();
    
    const deadline = new Date(targetYear, 6, 10); // 7月10日（0-indexedなので6）
    
    return this.adjustForBusinessDay(deadline);
  }

  /**
   * 報酬月額変更届の法定期限を計算
   * 速やかに届け出る（設定画面で期限設定可能、デフォルトは変動月から4か月目の月末）
   */
  private calculateRewardChangeDeadline(application: Application): Date | null {
    // 申請データから変動月を取得
    const changeMonth = application.data?.['changeMonth'];
    const changeYear = application.data?.['changeYear'];
    
    if (!changeMonth || !changeYear) {
      return null;
    }

    // 変動月から4か月目の月末
    let targetYear = changeYear;
    let targetMonth = changeMonth + 3;
    if (targetMonth > 12) {
      targetMonth -= 12;
      targetYear++;
    }

    const deadline = new Date(targetYear, targetMonth, 0); // 月末日
    
    return this.adjustForBusinessDay(deadline);
  }

  /**
   * 賞与支払届の法定期限を計算（各被保険者ごとに期限を計算してdata内に保存）
   * 賞与支払い日より5日以内
   * @returns null（各被保険者ごとに期限を保存するため、申請全体の期限は不要）
   */
  private async calculateBonusPaymentDeadline(application: Application): Promise<Date | null> {
    const insuredPersons = application.data?.['insuredPersons'];
    if (!insuredPersons || !Array.isArray(insuredPersons)) {
      return null;
    }

    // 申請全体の共通支払日を取得（フォールバック用）
    let commonPaymentDate: Date | null = null;
    const commonBonusPaymentDate = application.data?.['commonBonusPaymentDate'];
    if (commonBonusPaymentDate) {
      if (commonBonusPaymentDate instanceof Date) {
        commonPaymentDate = commonBonusPaymentDate;
      } else if (commonBonusPaymentDate && typeof (commonBonusPaymentDate as any).toDate === 'function') {
        commonPaymentDate = (commonBonusPaymentDate as any).toDate();
      } else if (commonBonusPaymentDate && typeof (commonBonusPaymentDate as any).seconds === 'number') {
        commonPaymentDate = new Date((commonBonusPaymentDate as any).seconds * 1000);
      } else if (commonBonusPaymentDate && typeof commonBonusPaymentDate === 'object' && commonBonusPaymentDate.era) {
        // 年号形式 {era, year, month, day}
        commonPaymentDate = this.convertEraDateToDate(commonBonusPaymentDate);
      } else {
        commonPaymentDate = new Date(commonBonusPaymentDate);
      }
    }

    // 各被保険者の期限を計算してdata内に保存
    for (const person of insuredPersons) {
      let paymentDate: Date | null = null;

      // 1. 各被保険者のbonusPaymentDateを取得（優先）
      const bonusPaymentDate = person.bonusPaymentDate;
      if (bonusPaymentDate) {
        if (bonusPaymentDate instanceof Date) {
          paymentDate = bonusPaymentDate;
        } else if (bonusPaymentDate && typeof (bonusPaymentDate as any).toDate === 'function') {
          paymentDate = (bonusPaymentDate as any).toDate();
        } else if (bonusPaymentDate && typeof (bonusPaymentDate as any).seconds === 'number') {
          paymentDate = new Date((bonusPaymentDate as any).seconds * 1000);
        } else if (bonusPaymentDate && typeof bonusPaymentDate === 'object' && bonusPaymentDate.era) {
          // 年号形式 {era, year, month, day}
          paymentDate = this.convertEraDateToDate(bonusPaymentDate);
        } else {
          paymentDate = new Date(bonusPaymentDate);
        }
      }

      // 2. 各被保険者の支払日がない場合、申請全体のcommonBonusPaymentDateを使用
      if (!paymentDate && commonPaymentDate) {
        paymentDate = commonPaymentDate;
      }

      if (!paymentDate) {
        continue;
      }

      // 期限を計算（支払日 + 5日）
      const deadline = new Date(paymentDate);
      deadline.setDate(deadline.getDate() + 5);
      const adjustedDeadline = this.adjustForBusinessDay(deadline);

      // data内に期限を保存
      person.deadline = adjustedDeadline;
    }

    return null; // 各被保険者ごとに期限を保存するため、申請全体の期限は不要
  }

  /**
   * 速やかに届け出る申請の期限を計算
   * 申請日から指定日数後
   */
  private calculatePromptDeadline(application: Application, days: number): Date | null {
    const createdAt = application.createdAt instanceof Date 
      ? application.createdAt 
      : new Date((application.createdAt as any).seconds * 1000);
    
    const deadline = new Date(createdAt);
    deadline.setDate(deadline.getDate() + days);
    
    return this.adjustForBusinessDay(deadline);
  }

  /**
   * 年号形式の日付をDateオブジェクトに変換
   * @param eraDate 年号形式の日付 {era: string, year: number, month: number, day: number}
   * @returns Dateオブジェクト、変換できない場合はnull
   */
  private convertEraDateToDate(eraDate: any): Date | null {
    if (!eraDate || !eraDate.era || !eraDate.year || !eraDate.month || !eraDate.day) {
      return null;
    }
    
    let year = parseInt(eraDate.year);
    if (eraDate.era === 'reiwa') {
      year = year + 2018; // 令和年 + 2018 = 西暦
    } else if (eraDate.era === 'heisei') {
      year = year + 1988; // 平成年 + 1988 = 西暦
    } else if (eraDate.era === 'showa') {
      year = year + 1925; // 昭和平年 + 1925 = 西暦
    } else if (eraDate.era === 'taisho') {
      year = year + 1911; // 大正年 + 1911 = 西暦
    }
    
    return new Date(year, parseInt(eraDate.month) - 1, parseInt(eraDate.day));
  }

  /**
   * 期限日が土日祝の場合、翌営業日に調整
   * 簡易実装（祝日は考慮しない）
   */
  private adjustForBusinessDay(date: Date): Date {
    const dayOfWeek = date.getDay();
    
    // 土曜日（6）の場合、月曜日（+2日）に調整
    if (dayOfWeek === 6) {
      date.setDate(date.getDate() + 2);
    }
    // 日曜日（0）の場合、月曜日（+1日）に調整
    else if (dayOfWeek === 0) {
      date.setDate(date.getDate() + 1);
    }
    
    return date;
  }

  /**
   * 内部申請が絡む外部申請で法定期限超過時の期限を計算
   * 社員の申請日＋1営業日を期限とする
   */
  calculateOverdueDeadline(application: Application): Date | null {
    const createdAt = application.createdAt instanceof Date 
      ? application.createdAt 
      : new Date((application.createdAt as any).seconds * 1000);
    
    const deadline = new Date(createdAt);
    deadline.setDate(deadline.getDate() + 1);
    
    return this.adjustForBusinessDay(deadline);
  }
}

