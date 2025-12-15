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
   * 資格取得届の法定期限を計算
   * 資格取得年月日から5日以内（入社日から5日目）
   */
  private async calculateInsuranceAcquisitionDeadline(application: Application): Promise<Date | null> {
    console.log('[DeadlineCalculationService] calculateInsuranceAcquisitionDeadline 開始', {
      applicationId: application.id,
      employeeId: application.employeeId
    });

    const employee = await this.employeeService.getEmployee(application.employeeId);
    console.log('[DeadlineCalculationService] 社員情報取得', {
      employeeId: application.employeeId,
      employee: employee ? '存在' : 'null',
      joinDate: employee?.joinDate
    });

    if (!employee?.joinDate) {
      console.log('[DeadlineCalculationService] joinDate がないため null を返す');
      return null;
    }

    const joinDate = employee.joinDate instanceof Date 
      ? employee.joinDate 
      : new Date((employee.joinDate as any).seconds * 1000);
    
    console.log('[DeadlineCalculationService] joinDate 変換後', {
      joinDate: joinDate.toISOString(),
      joinDateType: employee.joinDate instanceof Date ? 'Date' : 'Timestamp'
    });

    const deadline = new Date(joinDate);
    deadline.setDate(deadline.getDate() + 5);
    
    console.log('[DeadlineCalculationService] 期限計算（+5日後）', {
      deadline: deadline.toISOString(),
      isPast: deadline < new Date()
    });

    const adjustedDeadline = this.adjustForBusinessDay(deadline);
    console.log('[DeadlineCalculationService] 営業日調整後', {
      adjustedDeadline: adjustedDeadline.toISOString(),
      isPast: adjustedDeadline < new Date()
    });

    return adjustedDeadline;
  }

  /**
   * 資格喪失届の法定期限を計算
   * 資格喪失年月日から5日以内（退社日の翌日から5日目）
   */
  private async calculateInsuranceLossDeadline(application: Application): Promise<Date | null> {
    const employee = await this.employeeService.getEmployee(application.employeeId);
    if (!employee?.retirementDate) {
      return null;
    }

    const retirementDate = employee.retirementDate instanceof Date 
      ? employee.retirementDate 
      : new Date((employee.retirementDate as any).seconds * 1000);
    
    // 退社日の翌日から5日目
    const deadline = new Date(retirementDate);
    deadline.setDate(deadline.getDate() + 6); // 翌日 + 5日 = 6日後
    
    return this.adjustForBusinessDay(deadline);
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
   * 賞与支払届の法定期限を計算
   * 賞与支払い日より5日以内
   */
  private async calculateBonusPaymentDeadline(application: Application): Promise<Date | null> {
    let paymentDate: Date | null = null;

    // 1. 申請データから賞与支払日を取得（commonBonusPaymentDate: Date形式）
    const commonBonusPaymentDate = application.data?.['commonBonusPaymentDate'];
    if (commonBonusPaymentDate) {
      if (commonBonusPaymentDate instanceof Date) {
        paymentDate = commonBonusPaymentDate;
      } else if (commonBonusPaymentDate && typeof (commonBonusPaymentDate as any).toDate === 'function') {
        paymentDate = (commonBonusPaymentDate as any).toDate();
      } else if (commonBonusPaymentDate && typeof (commonBonusPaymentDate as any).seconds === 'number') {
        paymentDate = new Date((commonBonusPaymentDate as any).seconds * 1000);
      } else {
        paymentDate = new Date(commonBonusPaymentDate);
      }
    }

    // 2. 申請データから賞与支払日を取得（commonPaymentDate: フォームデータ形式 {era, year, month, day}）
    if (!paymentDate && application.data?.['commonPaymentDate']) {
      const commonPaymentDate = application.data['commonPaymentDate'];
      if (commonPaymentDate.year && commonPaymentDate.month && commonPaymentDate.day) {
        // 年号を西暦に変換
        let year = parseInt(commonPaymentDate.year);
        if (commonPaymentDate.era === 'reiwa') {
          year = year + 2018; // 令和年 + 2018 = 西暦
        } else if (commonPaymentDate.era === 'heisei') {
          year = year + 1988; // 平成年 + 1988 = 西暦
        } else if (commonPaymentDate.era === 'showa') {
          year = year + 1925; // 昭和平年 + 1925 = 西暦
        }
        paymentDate = new Date(year, parseInt(commonPaymentDate.month) - 1, parseInt(commonPaymentDate.day));
      }
    }

    // 3. 申請データから賞与支払日を取得（bonusPaymentDate: Date形式、旧形式との互換性）
    if (!paymentDate && application.data?.['bonusPaymentDate']) {
      const bonusPaymentDate = application.data['bonusPaymentDate'];
      if (bonusPaymentDate instanceof Date) {
        paymentDate = bonusPaymentDate;
      } else if (bonusPaymentDate && typeof (bonusPaymentDate as any).toDate === 'function') {
        paymentDate = (bonusPaymentDate as any).toDate();
      } else if (bonusPaymentDate && typeof (bonusPaymentDate as any).seconds === 'number') {
        paymentDate = new Date((bonusPaymentDate as any).seconds * 1000);
      } else {
        paymentDate = new Date(bonusPaymentDate);
      }
    }

    // 4. 申請データから支払日が取得できない場合、該当社員のBonusDataから支払日を取得
    if (!paymentDate && application.employeeId) {
      // 申請データから年月を取得（bonusPaymentPersonsから取得、または申請作成時の年月を推測）
      // 賞与支払届は通常、支払月の申請なので、申請作成日の年月を使用
      const applicationDate = application.createdAt instanceof Date 
        ? application.createdAt 
        : (application.createdAt as any).toDate 
          ? (application.createdAt as any).toDate() 
          : new Date();
      
      const year = applicationDate.getFullYear();
      const month = applicationDate.getMonth() + 1;

      const bonusData = await this.bonusDataService.getBonusData(application.employeeId, year, month);
      if (bonusData?.bonusPaymentDate) {
        if (bonusData.bonusPaymentDate instanceof Date) {
          paymentDate = bonusData.bonusPaymentDate;
        } else if (bonusData.bonusPaymentDate && typeof (bonusData.bonusPaymentDate as any).toDate === 'function') {
          paymentDate = (bonusData.bonusPaymentDate as any).toDate();
        } else if (bonusData.bonusPaymentDate && typeof (bonusData.bonusPaymentDate as any).seconds === 'number') {
          paymentDate = new Date((bonusData.bonusPaymentDate as any).seconds * 1000);
        }
      }
    }

    if (!paymentDate) {
      return null;
    }
    
    const deadline = new Date(paymentDate);
    deadline.setDate(deadline.getDate() + 5);
    
    return this.adjustForBusinessDay(deadline);
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

