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
   * 各被扶養者の異動日から最も早い日を事実発生日として使用
   * 異動種別が「変更」の場合は社員提出日を使用
   */
  private calculateDependentChangeDeadline(application: Application): Date | null {
    const data = application.data || {};
    let earliestDate: Date | null = null;

    // 社員提出日を取得（businessOwnerReceiptDateを優先、なければsubmissionDate）
    const submissionDateEra = data['businessOwnerReceiptDate'] || data['submissionDate'];
    let submissionDate: Date | null = null;
    if (submissionDateEra) {
      submissionDate = this.convertEraDateToDate(submissionDateEra);
    }

    // 日付を比較して最も早い日を設定するヘルパー関数
    const updateEarliestDate = (date: Date | null): void => {
      if (!date) {
        return;
      }
      if (earliestDate === null) {
        earliestDate = date;
      } else {
        const currentEarliest: Date = earliestDate;
        if (date < currentEarliest) {
          earliestDate = date;
        }
      }
    };

    // 配偶者の異動日を確認
    const spouseDependent = data['spouseDependent'];
    if (spouseDependent) {
      const spouseChangeType = spouseDependent.changeType;
      
      // 異動種別「変更」の場合：社員提出日を使用
      if (spouseChangeType === 'change' && submissionDate) {
        updateEarliestDate(submissionDate);
      }
      
      // 異動種別「該当」の場合：被扶養者になった日
      if (spouseChangeType === 'applicable' && spouseDependent.dependentStartDate) {
        const startDate = this.convertEraDateToDate(spouseDependent.dependentStartDate);
        updateEarliestDate(startDate);
      }
      
      // 異動種別「非該当」の場合：被扶養者でなくなった日
      if (spouseChangeType === 'not_applicable' && spouseDependent.dependentEndDate) {
        const endDate = this.convertEraDateToDate(spouseDependent.dependentEndDate);
        updateEarliestDate(endDate);
      }
    }

    // その他被扶養者の異動日を確認
    const otherDependents = data['otherDependents'];
    if (otherDependents && Array.isArray(otherDependents)) {
      for (const dependent of otherDependents) {
        const changeType = dependent.changeType;
        
        // 異動種別「変更」の場合：社員提出日を使用
        if (changeType === 'change' && submissionDate) {
          updateEarliestDate(submissionDate);
        }
        
        // 異動種別「該当」の場合：被扶養者になった日
        if (changeType === 'applicable' && dependent.dependentStartDate) {
          const startDate = this.convertEraDateToDate(dependent.dependentStartDate);
          updateEarliestDate(startDate);
        }
        
        // 異動種別「非該当」の場合：被扶養者でなくなった日
        if (changeType === 'not_applicable' && dependent.dependentEndDate) {
          const endDate = this.convertEraDateToDate(dependent.dependentEndDate);
          updateEarliestDate(endDate);
        }
      }
    }

    if (!earliestDate) {
      return null;
    }

    // 事実発生日 + 5日を期限として計算
    const deadline = new Date(earliestDate);
    deadline.setDate(deadline.getDate() + 5);
    
    return this.adjustForBusinessDay(deadline);
  }

  /**
   * 算定基礎届の法定期限を計算（各被保険者ごとに期限を計算してdata内に保存）
   * 7月10日が法定期限（適用年月の年の7月10日）
   * @returns null（各被保険者ごとに期限を保存するため、申請全体の期限は不要）
   */
  private calculateRewardBaseDeadline(application: Application): Date | null {
    const rewardBasePersons = application.data?.['rewardBasePersons'];
    if (!rewardBasePersons || !Array.isArray(rewardBasePersons)) {
      return null;
    }

    // 各被保険者の期限を計算してdata内に保存
    for (const person of rewardBasePersons) {
      const applicableDate = person.applicableDate;
      if (!applicableDate) {
        continue;
      }

      // 適用年月から対象年を取得
      let targetYear: number | null = null;
      
      if (applicableDate instanceof Date) {
        targetYear = applicableDate.getFullYear();
      } else if (applicableDate && typeof applicableDate === 'object' && applicableDate.era) {
        // 年号形式 {era, year, month}
        let year = parseInt(applicableDate.year);
        if (applicableDate.era === 'reiwa') {
          year = year + 2018; // 令和年 + 2018 = 西暦
        } else if (applicableDate.era === 'heisei') {
          year = year + 1988; // 平成年 + 1988 = 西暦
        } else if (applicableDate.era === 'showa') {
          year = year + 1925; // 昭和平年 + 1925 = 西暦
        } else if (applicableDate.era === 'taisho') {
          year = year + 1911; // 大正年 + 1911 = 西暦
        }
        targetYear = year;
      }

      if (!targetYear) {
        continue;
      }

      // 期限を計算（対象年の7月10日）
      const deadline = new Date(targetYear, 6, 10); // 7月10日（0-indexedなので6）
      const adjustedDeadline = this.adjustForBusinessDay(deadline);

      // data内に期限を保存
      person.deadline = adjustedDeadline;
    }

    return null; // 各被保険者ごとに期限を保存するため、申請全体の期限は不要
  }

  /**
   * 報酬月額変更届の法定期限を計算
   * 速やかに届け出る（設定画面で期限設定可能、デフォルトは改定年月から1か月目の月末）
   * 改定年月 = 変動月 + 3か月、期限 = 変動月 + 4か月目の月末 = 改定年月 + 1か月目の月末
   */
  private calculateRewardChangeDeadline(application: Application): Date | null {
    // 申請データから改定年月を取得（各被保険者のchangeDateから）
    const rewardChangePersons = application.data?.['rewardChangePersons'] || application.data?.['insuredPersons'];
    if (!rewardChangePersons || !Array.isArray(rewardChangePersons) || rewardChangePersons.length === 0) {
      return null;
    }

    // 最初の被保険者の改定年月を使用
    const firstPerson = rewardChangePersons[0];
    const changeDate = firstPerson.changeDate;
    if (!changeDate) {
      return null;
    }

    // 改定年月（年号形式）を西暦に変換
    let changeYear: number | null = null;
    let changeMonth: number | null = null;

    if (changeDate instanceof Date) {
      changeYear = changeDate.getFullYear();
      changeMonth = changeDate.getMonth() + 1;
    } else if (changeDate && typeof changeDate === 'object' && changeDate.era) {
      // 年号形式 {era, year, month}
      let year = parseInt(changeDate.year);
      if (changeDate.era === 'reiwa') {
        year = year + 2018; // 令和年 + 2018 = 西暦
      } else if (changeDate.era === 'heisei') {
        year = year + 1988; // 平成年 + 1988 = 西暦
      } else if (changeDate.era === 'showa') {
        year = year + 1925; // 昭和平年 + 1925 = 西暦
      } else if (changeDate.era === 'taisho') {
        year = year + 1911; // 大正年 + 1911 = 西暦
      }
      changeYear = year;
      changeMonth = parseInt(changeDate.month);
    }

    if (!changeYear || !changeMonth) {
      return null;
    }

    // 改定年月から1か月後の月末を計算
    let targetYear = changeYear;
    let targetMonth = changeMonth + 1;
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
    } else {
      // 未知の年号の場合は null を返す
      return null;
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

