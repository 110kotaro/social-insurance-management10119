import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, Timestamp, orderBy } from '@angular/fire/firestore';
import { MonthlyCalculation, CalculationSummary, CalculationRecalculationHistory, PremiumDifference, RetroactiveDeduction } from '../models/monthly-calculation.model';
import { BonusCalculation, BonusCalculationRecalculationHistory, BonusPremiumDifference, BonusRetroactiveDeduction } from '../models/bonus-calculation.model';
import { Employee } from '../models/employee.model';
import { InsuranceRateTable } from '../models/insurance-rate-table.model';
import { InsuranceRateTableService } from './insurance-rate-table.service';
import { EmployeeService } from './employee.service';
import { DepartmentService } from './department.service';
import { BonusDataService } from './bonus-data.service';
import { OtherCompanySalaryDataService } from './other-company-salary-data.service';
import { SalaryDataService } from './salary-data.service';
import { OrganizationService } from './organization.service';
import { PostpaidLeaveAmount } from '../models/monthly-calculation.model';
import { BonusPostpaidLeaveAmount } from '../models/bonus-calculation.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class CalculationService {
  private firestore = inject(Firestore);
  private insuranceRateTableService = inject(InsuranceRateTableService);
  private employeeService = inject(EmployeeService);
  private departmentService = inject(DepartmentService);
  private bonusDataService = inject(BonusDataService);
  private otherCompanySalaryDataService = inject(OtherCompanySalaryDataService);
  private salaryDataService = inject(SalaryDataService);
  private organizationService = inject(OrganizationService);

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
    
    if (typeof obj === 'object' && obj.constructor === Object) {
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
    // Firestoreのplain object形式（{seconds: number, nanoseconds: number}）の場合
    if (value && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }
    return null;
  }

  /**
   * 標準報酬月額から等級を判定
   */
  private getGradeFromStandardReward(standardReward: number, rateTables: InsuranceRateTable[]): number | null {
    for (const table of rateTables) {
      const minOk = standardReward >= table.minAmount;
      const maxOk = table.maxAmount === 0 || table.maxAmount === null || standardReward <= table.maxAmount;
      if (minOk && maxOk) {
        return table.grade;
      }
    }
    return null;
  }

  /**
   * 標準報酬月額から厚生年金等級を判定
   */
  private getPensionGradeFromStandardReward(standardReward: number, rateTables: InsuranceRateTable[]): number | null {
    for (const table of rateTables) {
      if (table.pensionGrade !== null && table.pensionGrade !== undefined) {
        const minOk = standardReward >= table.minAmount;
        const maxOk = table.maxAmount === 0 || table.maxAmount === null || standardReward <= table.maxAmount;
        if (minOk && maxOk) {
          return table.pensionGrade;
        }
      }
    }
    return null;
  }

  /**
   * 年齢を計算（生年月日から）
   */
  private calculateAge(birthDate: Date | Timestamp, targetDate: Date): number {
    const birth = birthDate instanceof Date ? birthDate : this.convertToDate(birthDate);
    if (!birth) {
      return 0;
    }
    const today = targetDate;
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * 健康保険料を計算（修正11: 折半額を返す）
   */
  async calculateHealthInsurance(
    employee: Employee,
    standardReward: number,
    rateTables: InsuranceRateTable[],
    targetDate: Date
  ): Promise<{ premium: number; half: number; grade: number }> {
    const grade = this.getGradeFromStandardReward(standardReward, rateTables);
    if (!grade) {
      throw new Error(`標準報酬月額 ${standardReward} 円に対応する等級が見つかりません`);
    }

    const rateTable = rateTables.find(t => t.grade === grade);
    if (!rateTable) {
      throw new Error(`等級 ${grade} の料率テーブルが見つかりません`);
    }

    // 年齢を計算（40-64歳の場合は介護保険料を含む料率を使用）
    const age = this.calculateAge(employee.birthDate, targetDate);
    const isCareInsuranceTarget = age >= 40 && age < 65;

    // 扶養者アリの場合は通常の料率を使用
    const hasDependents = employee.dependentInfo && employee.dependentInfo.length > 0;

    // 健康保険料を計算（介護保険料を含むかどうかで料率を選択）
    const insuranceData = isCareInsuranceTarget 
      ? rateTable.healthInsuranceWithCare 
      : rateTable.healthInsuranceWithoutCare;

    return {
      premium: insuranceData.total,
      half: insuranceData.half,
      grade: grade
    };
  }

  /**
   * 厚生年金料を計算（修正11: 折半額を返す）
   */
  async calculatePensionInsurance(
    standardReward: number,
    rateTables: InsuranceRateTable[]
  ): Promise<{ premium: number; half: number; grade: number | null }> {
    const grade = this.getPensionGradeFromStandardReward(standardReward, rateTables);
    if (!grade) {
      throw new Error(`標準報酬月額 ${standardReward} 円に対応する厚生年金等級が見つかりません`);
    }

    const rateTable = rateTables.find(t => t.pensionGrade === grade);
    if (!rateTable) {
      throw new Error(`厚生年金等級 ${grade} の料率テーブルが見つかりません`);
    }

    return {
      premium: rateTable.pensionInsurance.total,
      half: rateTable.pensionInsurance.half,
      grade: grade
    };
  }

  /**
   * 介護保険料を計算（40-64歳のみ）
   * 注意: 介護保険料は健康保険料に統合されているため、このメソッドは使用しない
   */
  /*
  async calculateCareInsurance(
    employee: Employee,
    standardReward: number,
    rateTables: InsuranceRateTable[],
    targetDate: Date
  ): Promise<number> {
    const age = this.calculateAge(employee.birthDate, targetDate);
    
    // 40-64歳のみ介護保険料を計算
    if (age < 40 || age >= 65) {
      return 0;
    }

    const grade = this.getGradeFromStandardReward(standardReward, rateTables);
    if (!grade) {
      return 0;
    }

    const rateTable = rateTables.find(t => t.grade === grade);
    if (!rateTable) {
      return 0;
    }

    // 健康保険料（介護保険料含む）と健康保険料（介護保険料含まない）の差額が介護保険料
    const healthWithCare = rateTable.healthInsuranceWithCare.total;
    const healthWithoutCare = rateTable.healthInsuranceWithoutCare.total;
    
    return healthWithCare - healthWithoutCare;
  }
  */

  /**
   * 社員の月次保険料を計算
   */
  async calculateEmployeePremium(
    employee: Employee,
    year: number,
    month: number,
    calculatedBy: string,
    historicalCalculation?: MonthlyCalculation
  ): Promise<MonthlyCalculation> {
    // 再現計算（当時条件）の場合
    if (historicalCalculation) {
      return this.calculateEmployeePremiumHistorical(employee, year, month, calculatedBy, historicalCalculation);
    }

    // 再計算（現在条件）または通常計算の場合
    if (!employee.insuranceInfo?.standardReward) {
      throw new Error(`社員 ${employee.employeeNumber} の標準報酬月額が設定されていません`);
    }

    // 修正12: 他社兼務者の場合、該当月の他社給与データ（月額報酬）が確定済みかチェック
    if (employee.otherCompanyInfo && employee.otherCompanyInfo.length > 0) {
      const otherCompanySalaryDataList = await this.otherCompanySalaryDataService.getConfirmedOtherCompanySalaryDataByEmployee(
        employee.id!,
        year,
        month
      );
      // 他社給与データが存在するが、確定済みのものがない場合はエラー
      const allOtherCompanySalaryData = await this.otherCompanySalaryDataService.getOtherCompanySalaryDataByEmployee(
        employee.id!,
        year,
        month
      );
      if (allOtherCompanySalaryData.length > 0 && otherCompanySalaryDataList.length === 0) {
        throw new Error(`社員 ${employee.employeeNumber} の${year}年${month}月の他社給与データが確定されていません`);
      }
    }

    // 休職者の処理
    let isOnLeave = false;
    let leaveTypeLabel = '';
    let leaveInsuranceCollectionMethod: 'postpaid' | 'direct_transfer' = 'postpaid';
    let isApprovedLeaveExempt = false; // 申請承認済みの休職で全額免除の場合のフラグ
    
    if (employee.leaveInfo && employee.leaveInfo.length > 0) {
      // 組織情報を取得して保険料徴収方法を確認
      const organization = await this.organizationService.getOrganization(employee.organizationId);
      leaveInsuranceCollectionMethod = organization?.leaveInsuranceCollectionMethod || 'postpaid';
      
      for (const leave of employee.leaveInfo) {
        const leaveStartDate = this.convertToDate(leave.startDate);
        const leaveEndDate = leave.endDate ? this.convertToDate(leave.endDate) : null;
        
        if (!leaveStartDate) {
          continue;
        }

        // 休職開始日を含む月の月初
        const leaveStartMonth = new Date(leaveStartDate.getFullYear(), leaveStartDate.getMonth(), 1);
        
        // 休職終了日の判定（退職日と同じロジック）
        // 休職終了日の翌日が含まれる月は除外（免除対象外）
        if (leaveEndDate) {
          const nextDay = new Date(leaveEndDate);
          nextDay.setDate(nextDay.getDate() + 1); // 休職終了日の翌日
          const nextDayYear = nextDay.getFullYear();
          const nextDayMonth = nextDay.getMonth() + 1;
          
          // 計算対象月が休職終了日の翌日が含まれる月以降なら除外（免除対象外）
          if (year > nextDayYear || (year === nextDayYear && month >= nextDayMonth)) {
            // 免除対象外（通常計算を続行）
            continue;
          }
        }

        // 計算対象月が休職期間内かチェック
        const calculationMonthStart = new Date(year, month - 1, 1);
        
        if (calculationMonthStart >= leaveStartMonth) {
          isOnLeave = true;
          leaveTypeLabel = leave.type === 'maternity' ? '産前産後休業' : leave.type === 'childcare' ? '育児休業' : leave.type;
          
          // 申請承認済みの場合の処理
          if (leave.isApproved) {
            // 新ルール: 条件1と条件2をチェック
            if (leaveEndDate) {
              // 条件1: 休職開始日が含まれる月 = 休職終了日の翌日が含まれる月 が同じかチェック
              const leaveStartYear = leaveStartDate.getFullYear();
              const leaveStartMonthNum = leaveStartDate.getMonth() + 1; // 1-12
              
              const leaveEndDateNextDay = new Date(leaveEndDate);
              leaveEndDateNextDay.setDate(leaveEndDateNextDay.getDate() + 1);
              const nextDayYear = leaveEndDateNextDay.getFullYear();
              const nextDayMonth = leaveEndDateNextDay.getMonth() + 1; // 1-12
              
              const isSameMonth = (leaveStartYear === nextDayYear && leaveStartMonthNum === nextDayMonth);
              
              // 条件1を満たす場合、条件2をチェック
              if (isSameMonth) {
                // 条件2: その月内で14日以上休職しているかチェック
                // 計算対象月が条件1で一致した月と一致する場合のみ新ルールを適用
                if (year === leaveStartYear && month === leaveStartMonthNum) {
                  // 休職開始日から休職終了日までの日数を計算
                  const leaveDays = Math.floor((leaveEndDate.getTime() - leaveStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                  
                  if (leaveDays >= 14) {
                    // 条件1と条件2を両方満たす場合: 免除（フラグを立てて通常計算を続行）
                    isApprovedLeaveExempt = true;
                    break; // 休職情報のループを抜ける
                  } else {
                    // 条件1を満たすが条件2を満たさない場合: 通常計算を続行
                    // isOnLeaveフラグをfalseに戻して通常計算に進む
                    isOnLeave = false;
                    continue;
                  }
                } else {
                  // 計算対象月が条件1で一致した月と異なる場合: 免除（フラグを立てて通常計算を続行）
                  isApprovedLeaveExempt = true;
                  break; // 休職情報のループを抜ける
                }
              } else {
                // 条件1を満たさない場合: 免除（フラグを立てて通常計算を続行）
                isApprovedLeaveExempt = true;
                break; // 休職情報のループを抜ける
              }
            } else {
              // 休職終了日が未設定の場合: 免除（フラグを立てて通常計算を続行）
              isApprovedLeaveExempt = true;
              break; // 休職情報のループを抜ける
            }
          }
          // 申請承認されていない場合は通常計算を続行（後で処理）
          break;
        }
      }
    }

    const standardReward = employee.insuranceInfo.standardReward;
    const targetDate = new Date(year, month - 1, 1);

    // 保険料率テーブルを取得（組織固有のテーブルのみ使用）
    const rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(employee.organizationId);
    // 全組織共通のテーブルは現在使用しない（将来的に必要になった場合はコメントアウトを解除）
    // const commonRateTables = await this.insuranceRateTableService.getCommonRateTables();
    // const allRateTables = [...rateTables, ...commonRateTables];
    const allRateTables = rateTables;

    // 適用期間でフィルタリング
    const validRateTables = allRateTables.filter(table => {
      const effectiveFrom = this.convertToDate(table.effectiveFrom);
      const effectiveTo = table.effectiveTo ? this.convertToDate(table.effectiveTo) : null;
      
      if (!effectiveFrom) {
        return false;
      }
      
      const fromDate = new Date(effectiveFrom.getFullYear(), effectiveFrom.getMonth(), 1);
      const toDate = effectiveTo ? new Date(effectiveTo.getFullYear(), effectiveTo.getMonth(), 1) : null;
      
      return targetDate >= fromDate && (!toDate || targetDate <= toDate);
    });

    if (validRateTables.length === 0) {
      throw new Error(`${year}年${month}月に適用される保険料率テーブルが見つかりません`);
    }

    // 健康保険料を計算（40-64歳の場合は介護保険料を含む）
    const healthInsurance = await this.calculateHealthInsurance(employee, standardReward, validRateTables, targetDate);
    
    // 年齢を計算
    const age = this.calculateAge(employee.birthDate, targetDate);
    
    // 年齢による特例：70歳以上75歳未満は厚生年金を計算しない
    // 75歳以上は既に計算対象から除外済み
    let pensionInsurance: { premium: number; half: number; grade: number | null };
    if (age >= 70 && age < 75) {
      // 70歳以上75歳未満：厚生年金を0円にする
      pensionInsurance = { premium: 0, half: 0, grade: null };
    } else {
      // 厚生年金料を計算
      pensionInsurance = await this.calculatePensionInsurance(standardReward, validRateTables);
    }
    
    // 介護保険料は健康保険料に統合されているため、個別計算はしない
    // const careInsurance = await this.calculateCareInsurance(employee, standardReward, validRateTables, targetDate);

    // 料率テーブルから料率を取得
    const rateTable = validRateTables.find(t => t.grade === healthInsurance.grade);
    if (!rateTable) {
      throw new Error(`等級 ${healthInsurance.grade} の料率テーブルが見つかりません`);
    }

    // 40-64歳の場合は介護保険料を含む料率を使用
    const isCareInsuranceTarget = age >= 40 && age < 65;
    
    // 健康保険料率を取得（介護保険料込かどうかで選択）
    const healthInsuranceRateData = isCareInsuranceTarget 
      ? rateTable.healthInsuranceWithCare 
      : rateTable.healthInsuranceWithoutCare;
    const healthInsuranceRate = healthInsuranceRateData.rate;
    
    // 厚生年金料率を取得
    const pensionInsuranceRate = rateTable.pensionInsurance.rate;

    // 部署名を取得
    let departmentName: string | undefined;
    if (employee.departmentId) {
      try {
        const departments = await this.departmentService.getDepartmentsByOrganization(employee.organizationId);
        const department = departments.find(d => d.id === employee.departmentId);
        departmentName = department?.name;
      } catch (error) {
        console.error('部署情報の取得に失敗しました:', error);
        // エラーが発生しても計算は続行
      }
    }

    // 扶養者情報を取得
    const dependents = employee.dependentInfo || [];
    const dependentCount = dependents.length;

    // 給与データから支給額を取得
    let monthlyPaymentAmount: number | undefined;
    try {
      const salaryData = await this.salaryDataService.getSalaryData(employee.id!, year, month);
      if (salaryData && salaryData.isConfirmed) {
        monthlyPaymentAmount = salaryData.totalPayment;
      }
    } catch (error) {
      console.warn(`社員 ${employee.employeeNumber} の${year}年${month}月の給与データの取得に失敗しました:`, error);
      // エラーが発生しても計算は続行（支給額は未設定のまま）
    }

    // 修正11.txtに準拠した計算順序：
    // 1. 等級表から折半額（half）を直接取得
    // 2. 折半額に端数処理を適用（50銭基準）
    // 3. 全額は折半額×2で計算（端数処理後の折半額から逆算）
    // 4. 扶養者の保険料は全額会社負担
    // 5. その後全てを合算

    // 申請承認されていない休職者で、保険料徴収方法が本人支払の場合の判定
    // （後で実装：組織情報のleaveInsuranceCollectionMethodが'direct_transfer'かつleave.isApproved === false）
    let isDirectTransferLeave = false;
    if (employee.leaveInfo && employee.leaveInfo.length > 0) {
      for (const leave of employee.leaveInfo) {
        if (!leave.isApproved) {
          // 組織情報の取得は後で実装（今はfalseのまま）
          // const organization = await this.organizationService.getOrganization(employee.organizationId);
          // isDirectTransferLeave = organization?.leaveInsuranceCollectionMethod === 'direct_transfer';
          break;
        }
      }
    }

    // 1. 等級表から折半額（half）を直接取得
    // 被保険者本人の折半額
    let healthHalf = healthInsurance.half;
    let pensionHalf = pensionInsurance.half;

    // 扶養者1人あたりの折半額（被保険者と同じ標準報酬月額と料率を使用）
    let dependentHealthHalf = 0;
    let dependentPensionHalf = 0;
    
    if (dependentCount > 0) {
      // 扶養者1人あたりの健康保険料（被保険者と同じ標準報酬月額と料率、被保険者の年齢に合わせて介護保険料含むかどうか）
      const dependentHealthInsurance = await this.calculateHealthInsurance(employee, standardReward, validRateTables, targetDate);
      dependentHealthHalf = dependentHealthInsurance.half;
      
      // 扶養者1人あたりの厚生年金料（被保険者と同じ標準報酬月額と料率）
      const dependentPensionInsurance = await this.calculatePensionInsurance(standardReward, validRateTables);
      dependentPensionHalf = dependentPensionInsurance.half;
    }

    // 2. 折半額に端数処理を適用（50銭基準）
    // 通常：50銭以下を切り捨て、50銭超を切り上げ（10000.50 → 10000、10000.51 → 10001）
    // 申請承認されていない休職者で、保険料徴収方法が本人支払の場合：50銭以上を切り上げ、50銭未満を切り捨て（10000.50 → 10001、10000.49 → 10000）
    const roundHalf = (half: number, isDirectTransferLeave: boolean): number => {
      const fractionalPart = half % 1;
      if (isDirectTransferLeave) {
        // 50銭以上を切り上げ、50銭未満を切り捨て
        return fractionalPart >= 0.5 ? Math.ceil(half) : Math.floor(half);
      } else {
        // 50銭以下を切り捨て、50銭超を切り上げ
        return fractionalPart <= 0.5 ? Math.floor(half) : Math.ceil(half);
      }
    };

    let healthEmployeeShare = roundHalf(healthHalf, isDirectTransferLeave);
    let pensionEmployeeShare = roundHalf(pensionHalf, isDirectTransferLeave);

    // 3. 全額は折半額×2で計算（端数処理後の折半額から逆算）
    let healthPremium = healthEmployeeShare * 2;
    let pensionPremium = pensionEmployeeShare * 2;

    // 扶養者全員分の保険料を計算（扶養者の折半額は端数処理しない、全額を会社負担）
    let totalDependentHealthPremium = dependentHealthHalf * 2 * dependentCount;
    let totalDependentPensionPremium = dependentPensionHalf * 2 * dependentCount;

    // 会社負担額 = 全額 - 社員負担額
    let healthCompanyShare = healthPremium - healthEmployeeShare;
    let pensionCompanyShare = pensionPremium - pensionEmployeeShare;

    // 扶養者の保険料は全額会社負担（折半しない）
    let dependentHealthCompanyShare = totalDependentHealthPremium;
    let dependentPensionCompanyShare = totalDependentPensionPremium;

    // 5. その後全てを合算
    // 被保険者本人の保険料合計
    let totalPremium = healthPremium + pensionPremium;
    
    // 社員負担額 = 被保険者本人の社員負担額のみ
    let employeeShare = healthEmployeeShare + pensionEmployeeShare;
    
    // 会社負担額 = 被保険者本人の会社負担額 + 扶養者全員分の保険料
    let companyShare = healthCompanyShare + pensionCompanyShare + dependentHealthCompanyShare + dependentPensionCompanyShare;

    // 修正12: 他社兼務の場合の計算ロジック
    let isOtherCompany = false;
    let ownCompanySalary: number | undefined;
    let otherCompanySalaryTotal: number | undefined;
    
    if (employee.otherCompanyInfo && employee.otherCompanyInfo.length > 0) {
      isOtherCompany = true;
      
      // 自社給与データを取得
      const ownSalaryData = await this.salaryDataService.getSalaryData(employee.id!, year, month);
      if (!ownSalaryData || !ownSalaryData.isConfirmed) {
        throw new Error(`社員 ${employee.employeeNumber} の${year}年${month}月の給与データが確定されていません`);
      }
      ownCompanySalary = ownSalaryData.totalPayment;
      
      // 他社給与データを取得（確定済みのみ）
      const otherCompanySalaryDataList = await this.otherCompanySalaryDataService.getConfirmedOtherCompanySalaryDataByEmployee(
        employee.id!,
        year,
        month
      );
      
      // 他社月額報酬合算を計算
      otherCompanySalaryTotal = otherCompanySalaryDataList.reduce((sum, data) => sum + data.monthlyReward, 0);
      
      // 保険料 = 標準報酬月額 × 料率 × 自社給与 / (自社給与 + 他社月額報酬合算)
      const salaryRatio = ownCompanySalary / (ownCompanySalary + otherCompanySalaryTotal);
      
      // 保険料に比率を適用
      healthPremium = Math.round(healthPremium * salaryRatio);
      pensionPremium = Math.round(pensionPremium * salaryRatio);
      totalDependentHealthPremium = Math.round(totalDependentHealthPremium * salaryRatio);
      totalDependentPensionPremium = Math.round(totalDependentPensionPremium * salaryRatio);
      
      // 折半額も再計算
      healthEmployeeShare = Math.round(healthEmployeeShare * salaryRatio);
      pensionEmployeeShare = Math.round(pensionEmployeeShare * salaryRatio);
      
      // 会社負担額も再計算
      healthCompanyShare = healthPremium - healthEmployeeShare;
      pensionCompanyShare = pensionPremium - pensionEmployeeShare;
      dependentHealthCompanyShare = totalDependentHealthPremium;
      dependentPensionCompanyShare = totalDependentPensionPremium;
      
      // 合計を再計算
      totalPremium = healthPremium + pensionPremium;
      employeeShare = healthEmployeeShare + pensionEmployeeShare;
      companyShare = healthCompanyShare + pensionCompanyShare + dependentHealthCompanyShare + dependentPensionCompanyShare;
    }

    // 申請承認済みの休職者は既に計算前にチェック済み（全額免除で返却済み）
    // ここに到達する場合は通常の計算を続行

    const now = new Date();
    const employeeName = `${employee.lastName} ${employee.firstName}`;

    // 休職期間中（申請承認されていない）の場合の処理
    let finalEmployeeShare = employeeShare;
    let finalCompanyShare = companyShare;
    let finalNotes: string | undefined = undefined;
    let finalIsOnLeave = false;
    let finalPostpaidLeaveAmount: number | undefined = undefined;
    let finalPostpaidLeaveCompanyAmount: number | undefined = undefined;

    if (isOnLeave) {
      finalIsOnLeave = true;
      
      // 申請承認済みの休職者は後払いや本人振込の処理をスキップ（全額免除のため）
      if (!isApprovedLeaveExempt) {
        if (leaveInsuranceCollectionMethod === 'postpaid') {
          // 後払いの場合：社員負担分を0にして、後払い分の情報を設定
          finalPostpaidLeaveAmount = employeeShare; // 後払い分（社員負担分）
          finalPostpaidLeaveCompanyAmount = totalPremium; // 建て替え分（折半前の全額）
          finalEmployeeShare = 0; // 社員負担分は0（後払い）
          finalNotes = `休職中特例で復職後徴収（後払い分：${finalPostpaidLeaveAmount.toLocaleString()}円、建て替え分：${finalPostpaidLeaveCompanyAmount.toLocaleString()}円）`;
        } else if (leaveInsuranceCollectionMethod === 'direct_transfer') {
          // 本人振込の場合：通常通り計算（端数処理は既に適用済み）
          finalNotes = `給与天引きではない（本人振込）`;
        }
      }
    }

    // 復職月の判定（休職終了日の翌日を含む月）
    let postpaidLeaveAmounts: PostpaidLeaveAmount[] | undefined = undefined;
    let postpaidLeaveTotal: number | undefined = undefined;
    let postpaidLeaveCompanyTotal: number | undefined = undefined;

    if (employee.leaveInfo && employee.leaveInfo.length > 0) {
      for (const leave of employee.leaveInfo) {
        if (leave.isApproved) {
          continue; // 申請承認済みの休職はスキップ
        }

        const leaveEndDate = leave.endDate ? this.convertToDate(leave.endDate) : null;
        if (!leaveEndDate) {
          continue; // 休職終了日が未設定の場合はスキップ
        }

        // 休職終了日の翌日を含む月を判定
        const nextDay = new Date(leaveEndDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayYear = nextDay.getFullYear();
        const nextDayMonth = nextDay.getMonth() + 1;

        // 計算対象月が休職終了日の翌日を含む月の場合、休職期間中の計算結果を取得して追記
        if (year === nextDayYear && month === nextDayMonth && leaveInsuranceCollectionMethod === 'postpaid') {
          const leaveStartDate = this.convertToDate(leave.startDate);
          if (!leaveStartDate) {
            continue;
          }

          const leaveStartMonth = new Date(leaveStartDate.getFullYear(), leaveStartDate.getMonth(), 1);
          const leaveEndMonth = new Date(leaveEndDate.getFullYear(), leaveEndDate.getMonth(), 1);
          
          // 休職期間中の各月の計算結果を取得
          postpaidLeaveAmounts = [];
          let totalEmployeeShare = 0;
          let totalCompanyShare = 0;

          for (let y = leaveStartMonth.getFullYear(), m = leaveStartMonth.getMonth() + 1; 
               y < leaveEndMonth.getFullYear() || (y === leaveEndMonth.getFullYear() && m <= leaveEndMonth.getMonth() + 1); 
               m === 12 ? (y++, m = 1) : m++) {
            // 休職終了日の翌日を含む月は除外（復職月なので）
            if (y === nextDayYear && m === nextDayMonth) {
              continue;
            }

            try {
              const leaveMonthCalculation = await this.getCalculationsByEmployee(employee.id!, y, m);
              if (leaveMonthCalculation && leaveMonthCalculation.postpaidLeaveAmount !== undefined) {
                const leaveTypeLabel = leave.type === 'maternity' ? '産前産後休業' : leave.type === 'childcare' ? '育児休業' : leave.type;
                postpaidLeaveAmounts.push({
                  year: y,
                  month: m,
                  employeeShare: leaveMonthCalculation.postpaidLeaveAmount,
                  companyShare: leaveMonthCalculation.postpaidLeaveCompanyAmount || 0,
                  totalPremium: leaveMonthCalculation.totalPremium,
                  leaveType: leaveTypeLabel
                });
                totalEmployeeShare += leaveMonthCalculation.postpaidLeaveAmount;
                totalCompanyShare += leaveMonthCalculation.postpaidLeaveCompanyAmount || 0;
              }
            } catch (error) {
              console.warn(`休職期間中（${y}年${m}月）の計算結果の取得に失敗しました:`, error);
            }
          }

          if (postpaidLeaveAmounts.length > 0) {
            postpaidLeaveTotal = totalEmployeeShare;
            postpaidLeaveCompanyTotal = totalCompanyShare;
            finalEmployeeShare = employeeShare + postpaidLeaveTotal; // 通常分 + 休職中未徴収分
            finalNotes = `休職中未徴収分を追記`;
          }
        }
      }
    }

    // 申請承認済みの休職で全額免除の場合、保険料を0にしてnotesを設定
    let finalHealthPremium = healthPremium;
    let finalPensionPremium = pensionPremium;
    let finalTotalPremium = dependentCount > 0 
      ? healthPremium + totalDependentHealthPremium + pensionPremium + totalDependentPensionPremium
      : totalPremium;
    let finalCompanyShareValue = finalCompanyShare;
    let finalEmployeeShareValue = finalEmployeeShare;
    let finalNotesValue = finalNotes;

    if (isApprovedLeaveExempt) {
      finalHealthPremium = 0;
      finalPensionPremium = 0;
      finalTotalPremium = 0;
      finalCompanyShareValue = 0;
      finalEmployeeShareValue = 0;
      finalNotesValue = `休職中（${leaveTypeLabel}、申請承認済み）により全額免除（休職による免除のため）`;
    }

    return {
      organizationId: employee.organizationId,
      year,
      month,
      employeeId: employee.id || '',
      employeeNumber: employee.employeeNumber,
      employeeName,
      departmentName,
      standardReward,
      grade: healthInsurance.grade,
      pensionGrade: pensionInsurance.grade,
      healthInsurancePremium: finalHealthPremium,
      pensionInsurancePremium: finalPensionPremium,
      dependentHealthInsurancePremium: isApprovedLeaveExempt ? 0 : (dependentCount > 0 ? totalDependentHealthPremium : undefined),
      dependentPensionInsurancePremium: isApprovedLeaveExempt ? 0 : (dependentCount > 0 ? totalDependentPensionPremium : undefined),
      careInsurancePremium: 0, // 介護保険料は健康保険料に統合されているため0
      totalPremium: finalTotalPremium,
      companyShare: finalCompanyShareValue,
      employeeShare: finalEmployeeShareValue,
      calculationDate: now,
      calculatedBy,
      status: 'draft',
      notes: finalNotesValue,
      // 過去計算再現用の追加情報
      monthlyPaymentAmount, // その月の支給額（給与データから取得）
      dependentInfo: dependents.length > 0 ? dependents.map(dep => ({
        ...dep,
        birthDate: dep.birthDate instanceof Date ? dep.birthDate : (dep.birthDate?.toDate ? dep.birthDate.toDate() : dep.birthDate)
      })) : undefined,
      healthInsuranceRate,
      healthInsuranceRateWithCare: isCareInsuranceTarget,
      pensionInsuranceRate,
      birthDate: employee.birthDate instanceof Date ? employee.birthDate : (employee.birthDate?.toDate ? employee.birthDate.toDate() : employee.birthDate),
      joinDate: employee.joinDate instanceof Date ? employee.joinDate : (employee.joinDate?.toDate ? employee.joinDate.toDate() : employee.joinDate),
      // 他社兼務関連
      isOtherCompany,
      ownCompanySalary,
      otherCompanySalaryTotal,
      // 休職関連
      isOnLeave: finalIsOnLeave,
      postpaidLeaveAmount: finalPostpaidLeaveAmount,
      postpaidLeaveCompanyAmount: finalPostpaidLeaveCompanyAmount,
      postpaidLeaveAmounts,
      postpaidLeaveTotal,
      postpaidLeaveCompanyTotal,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * 再現計算（当時条件）：過去の計算結果に保存されている情報を使用して計算
   */
  private async calculateEmployeePremiumHistorical(
    employee: Employee,
    year: number,
    month: number,
    calculatedBy: string,
    historicalCalculation: MonthlyCalculation
  ): Promise<MonthlyCalculation> {
    const now = new Date();
    const employeeName = `${employee.lastName} ${employee.firstName}`;

    // 部署名を取得
    let departmentName: string | undefined;
    if (employee.departmentId) {
      try {
        const departments = await this.departmentService.getDepartmentsByOrganization(employee.organizationId);
        const department = departments.find(d => d.id === employee.departmentId);
        departmentName = department?.name;
      } catch (error) {
        console.error('部署情報の取得に失敗しました:', error);
      }
    }

    // historicalCalculationから情報を取得
    const standardReward = historicalCalculation.standardReward;
    const grade = historicalCalculation.grade;
    const pensionGrade = historicalCalculation.pensionGrade ?? null;
    const healthInsuranceRate = historicalCalculation.healthInsuranceRate;
    const healthInsuranceRateWithCare = historicalCalculation.healthInsuranceRateWithCare ?? false;
    const pensionInsuranceRate = historicalCalculation.pensionInsuranceRate;
    const dependentInfo = historicalCalculation.dependentInfo || [];
    const dependentCount = dependentInfo.length;
    const isOtherCompany = historicalCalculation.isOtherCompany ?? false;
    const ownCompanySalary = historicalCalculation.ownCompanySalary;
    const otherCompanySalaryTotal = historicalCalculation.otherCompanySalaryTotal;
    const isOnLeave = historicalCalculation.isOnLeave ?? false;
    const notes = historicalCalculation.notes;

    // 申請承認済みの休職判定（notesから「申請承認済み」またはtotalPremium === 0かつ「全額免除」をチェック）
    const isApprovedLeaveExempt = historicalCalculation.totalPremium === 0 && 
      (notes?.includes('申請承認済み') || notes?.includes('全額免除') || false);

    // 当時の等級表を取得（計算日時点で有効だった等級表）
    const targetDate = new Date(year, month - 1, 1);
    const rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(employee.organizationId);
    const validRateTables = rateTables.filter(table => {
      const effectiveFrom = this.convertToDate(table.effectiveFrom);
      const effectiveTo = table.effectiveTo ? this.convertToDate(table.effectiveTo) : null;
      if (!effectiveFrom) return false;
      const fromDate = new Date(effectiveFrom.getFullYear(), effectiveFrom.getMonth(), 1);
      const toDate = effectiveTo ? new Date(effectiveTo.getFullYear(), effectiveTo.getMonth(), 1) : null;
      return targetDate >= fromDate && (!toDate || targetDate <= toDate);
    });

    if (validRateTables.length === 0) {
      throw new Error(`${year}年${month}月に適用される保険料率テーブルが見つかりません`);
    }

    // 等級表から折半額を取得
    const rateTable = validRateTables.find(t => t.grade === grade);
    if (!rateTable) {
      throw new Error(`等級 ${grade} の料率テーブルが見つかりません`);
    }

    // 健康保険料の折半額を取得
    const healthInsuranceRateData = healthInsuranceRateWithCare 
      ? rateTable.healthInsuranceWithCare 
      : rateTable.healthInsuranceWithoutCare;
    const healthHalf = healthInsuranceRateData.half;

    // 厚生年金料の折半額を取得
    const pensionHalf = pensionGrade ? rateTable.pensionInsurance.half : 0;

    // 扶養者1人あたりの折半額
    let dependentHealthHalf = 0;
    let dependentPensionHalf = 0;
    if (dependentCount > 0) {
      dependentHealthHalf = healthHalf;
      dependentPensionHalf = pensionHalf;
    }

    // 端数処理（50銭基準、通常の処理）
    const roundHalf = (half: number): number => {
      const fractionalPart = half % 1;
      return fractionalPart <= 0.5 ? Math.floor(half) : Math.ceil(half);
    };

    let healthEmployeeShare = roundHalf(healthHalf);
    let pensionEmployeeShare = roundHalf(pensionHalf);

    // 全額は折半額×2で計算
    let healthPremium = healthEmployeeShare * 2;
    let pensionPremium = pensionEmployeeShare * 2;

    // 扶養者全員分の保険料を計算
    let totalDependentHealthPremium = dependentHealthHalf * 2 * dependentCount;
    let totalDependentPensionPremium = dependentPensionHalf * 2 * dependentCount;

    // 会社負担額
    let healthCompanyShare = healthPremium - healthEmployeeShare;
    let pensionCompanyShare = pensionPremium - pensionEmployeeShare;
    let dependentHealthCompanyShare = totalDependentHealthPremium;
    let dependentPensionCompanyShare = totalDependentPensionPremium;

    // 合計
    let totalPremium = healthPremium + pensionPremium;
    let employeeShare = healthEmployeeShare + pensionEmployeeShare;
    let companyShare = healthCompanyShare + pensionCompanyShare + dependentHealthCompanyShare + dependentPensionCompanyShare;

    // 他社兼務の場合の計算
    if (isOtherCompany && ownCompanySalary !== undefined && otherCompanySalaryTotal !== undefined) {
      const salaryRatio = ownCompanySalary / (ownCompanySalary + otherCompanySalaryTotal);
      healthPremium = Math.round(healthPremium * salaryRatio);
      pensionPremium = Math.round(pensionPremium * salaryRatio);
      totalDependentHealthPremium = Math.round(totalDependentHealthPremium * salaryRatio);
      totalDependentPensionPremium = Math.round(totalDependentPensionPremium * salaryRatio);
      healthEmployeeShare = Math.round(healthEmployeeShare * salaryRatio);
      pensionEmployeeShare = Math.round(pensionEmployeeShare * salaryRatio);
      healthCompanyShare = healthPremium - healthEmployeeShare;
      pensionCompanyShare = pensionPremium - pensionEmployeeShare;
      dependentHealthCompanyShare = totalDependentHealthPremium;
      dependentPensionCompanyShare = totalDependentPensionPremium;
      totalPremium = healthPremium + pensionPremium;
      employeeShare = healthEmployeeShare + pensionEmployeeShare;
      companyShare = healthCompanyShare + pensionCompanyShare + dependentHealthCompanyShare + dependentPensionCompanyShare;
    }

    // 申請承認済みの休職で全額免除の場合
    let finalHealthPremium = healthPremium;
    let finalPensionPremium = pensionPremium;
    let finalTotalPremium = dependentCount > 0 
      ? healthPremium + totalDependentHealthPremium + pensionPremium + totalDependentPensionPremium
      : totalPremium;
    let finalCompanyShareValue = companyShare;
    let finalEmployeeShareValue = employeeShare;
    let finalNotesValue = notes;

    if (isApprovedLeaveExempt) {
      finalHealthPremium = 0;
      finalPensionPremium = 0;
      finalTotalPremium = 0;
      finalCompanyShareValue = 0;
      finalEmployeeShareValue = 0;
      finalNotesValue = notes || `休職中（申請承認済み）により全額免除（休職による免除のため）`;
    }

    return {
      organizationId: employee.organizationId,
      year,
      month,
      employeeId: employee.id || '',
      employeeNumber: employee.employeeNumber,
      employeeName,
      departmentName,
      standardReward,
      grade,
      pensionGrade,
      healthInsurancePremium: finalHealthPremium,
      pensionInsurancePremium: finalPensionPremium,
      dependentHealthInsurancePremium: isApprovedLeaveExempt ? 0 : (dependentCount > 0 ? totalDependentHealthPremium : undefined),
      dependentPensionInsurancePremium: isApprovedLeaveExempt ? 0 : (dependentCount > 0 ? totalDependentPensionPremium : undefined),
      careInsurancePremium: 0,
      totalPremium: finalTotalPremium,
      companyShare: finalCompanyShareValue,
      employeeShare: finalEmployeeShareValue,
      calculationDate: now,
      calculatedBy,
      status: 'draft',
      notes: finalNotesValue,
      monthlyPaymentAmount: historicalCalculation.monthlyPaymentAmount,
      dependentInfo: dependentInfo.length > 0 ? dependentInfo.map(dep => ({
        ...dep,
        birthDate: dep.birthDate instanceof Date ? dep.birthDate : (dep.birthDate?.toDate ? dep.birthDate.toDate() : dep.birthDate)
      })) : undefined,
      healthInsuranceRate,
      healthInsuranceRateWithCare,
      pensionInsuranceRate,
      birthDate: historicalCalculation.birthDate instanceof Date ? historicalCalculation.birthDate : (historicalCalculation.birthDate?.toDate ? historicalCalculation.birthDate.toDate() : historicalCalculation.birthDate),
      joinDate: historicalCalculation.joinDate instanceof Date ? historicalCalculation.joinDate : (historicalCalculation.joinDate?.toDate ? historicalCalculation.joinDate.toDate() : historicalCalculation.joinDate),
      isOtherCompany,
      ownCompanySalary,
      otherCompanySalaryTotal,
      isOnLeave,
      postpaidLeaveAmount: historicalCalculation.postpaidLeaveAmount,
      postpaidLeaveCompanyAmount: historicalCalculation.postpaidLeaveCompanyAmount,
      postpaidLeaveAmounts: historicalCalculation.postpaidLeaveAmounts,
      postpaidLeaveTotal: historicalCalculation.postpaidLeaveTotal,
      postpaidLeaveCompanyTotal: historicalCalculation.postpaidLeaveCompanyTotal,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * 月次計算結果を保存
   * 下書き（draft）の場合、同じ社員・年月の既存のdraftがあれば上書きする
   * confirmedまたはexportedの計算結果がある場合は、新しいdraftを作成しない（エラーを返す）
   */
  async saveCalculation(calculation: MonthlyCalculation): Promise<string> {
    const now = new Date();
    
    // 下書き（draft）の場合、同じ社員・年月の既存の計算結果を検索
    if (calculation.status === 'draft' && !calculation.id) {
      const existingCalculation = await this.getCalculationsByEmployee(calculation.employeeId, calculation.year, calculation.month);
      
      if (existingCalculation) {
        // confirmedまたはexportedの計算結果がある場合は、新しいdraftを作成しない
        if (existingCalculation.status === 'confirmed' || existingCalculation.status === 'exported') {
          throw new Error(`既に確定済み（または出力済み）の計算結果があります。再計算する場合は、計算詳細画面から再計算してください。`);
        }
        
        // 既存のdraftがある場合は上書き
        if (existingCalculation.status === 'draft' && existingCalculation.id) {
          return await this.updateCalculation(existingCalculation.id, calculation);
        }
      }
    }
    
    const calcRef = doc(collection(this.firestore, `${environment.firestorePrefix}calculations`));
    
    const calcData: any = {
      organizationId: calculation.organizationId,
      year: calculation.year,
      month: calculation.month,
      employeeId: calculation.employeeId,
      employeeNumber: calculation.employeeNumber,
      employeeName: calculation.employeeName,
      departmentName: calculation.departmentName,
      standardReward: calculation.standardReward,
      grade: calculation.grade,
      healthInsurancePremium: calculation.healthInsurancePremium,
      pensionInsurancePremium: calculation.pensionInsurancePremium,
      dependentHealthInsurancePremium: calculation.dependentHealthInsurancePremium,
      dependentPensionInsurancePremium: calculation.dependentPensionInsurancePremium,
      careInsurancePremium: calculation.careInsurancePremium,
      totalPremium: calculation.totalPremium,
      companyShare: calculation.companyShare,
      employeeShare: calculation.employeeShare,
      calculationDate: calculation.calculationDate instanceof Date 
        ? Timestamp.fromDate(calculation.calculationDate) 
        : calculation.calculationDate,
      calculatedBy: calculation.calculatedBy,
      status: calculation.status,
      createdAt: calculation.createdAt instanceof Date 
        ? Timestamp.fromDate(calculation.createdAt) 
        : calculation.createdAt,
      updatedAt: calculation.updatedAt instanceof Date 
        ? Timestamp.fromDate(calculation.updatedAt) 
        : calculation.updatedAt
    };

    if (calculation.pensionGrade !== undefined && calculation.pensionGrade !== null) {
      calcData.pensionGrade = calculation.pensionGrade;
    }

    if (calculation.notes) {
      calcData.notes = calculation.notes;
    }

    // 過去計算再現用の追加情報
    if (calculation.monthlyPaymentAmount !== undefined && calculation.monthlyPaymentAmount !== null) {
      calcData.monthlyPaymentAmount = calculation.monthlyPaymentAmount;
    }

    if (calculation.dependentInfo && calculation.dependentInfo.length > 0) {
      calcData.dependentInfo = calculation.dependentInfo.map(dep => {
        const depData: any = { ...dep };
        if (dep.birthDate instanceof Date) {
          depData.birthDate = Timestamp.fromDate(dep.birthDate);
        } else if (dep.birthDate instanceof Timestamp) {
          depData.birthDate = dep.birthDate;
        } else if (dep.birthDate && typeof (dep.birthDate as any).toDate === 'function') {
          depData.birthDate = dep.birthDate;
        } else {
          depData.birthDate = dep.birthDate;
        }
        return depData;
      });
    }

    if (calculation.healthInsuranceRate !== undefined && calculation.healthInsuranceRate !== null) {
      calcData.healthInsuranceRate = calculation.healthInsuranceRate;
    }

    if (calculation.healthInsuranceRateWithCare !== undefined) {
      calcData.healthInsuranceRateWithCare = calculation.healthInsuranceRateWithCare;
    }

    if (calculation.pensionInsuranceRate !== undefined && calculation.pensionInsuranceRate !== null) {
      calcData.pensionInsuranceRate = calculation.pensionInsuranceRate;
    }

    if (calculation.birthDate) {
      if (calculation.birthDate instanceof Date) {
        calcData.birthDate = Timestamp.fromDate(calculation.birthDate);
      } else if (calculation.birthDate instanceof Timestamp) {
        calcData.birthDate = calculation.birthDate;
      } else {
        calcData.birthDate = calculation.birthDate;
      }
    }

    if (calculation.joinDate) {
      if (calculation.joinDate instanceof Date) {
        calcData.joinDate = Timestamp.fromDate(calculation.joinDate);
      } else if (calculation.joinDate instanceof Timestamp) {
        calcData.joinDate = calculation.joinDate;
      } else {
        calcData.joinDate = calculation.joinDate;
      }
    }

    // ステータス管理用のフィールド
    if (calculation.confirmedAt) {
      calcData.confirmedAt = calculation.confirmedAt instanceof Date 
        ? Timestamp.fromDate(calculation.confirmedAt) 
        : calculation.confirmedAt;
    }
    if (calculation.confirmedBy) {
      calcData.confirmedBy = calculation.confirmedBy;
    }
    if (calculation.exportedAt) {
      calcData.exportedAt = calculation.exportedAt instanceof Date 
        ? Timestamp.fromDate(calculation.exportedAt) 
        : calculation.exportedAt;
    }
    if (calculation.exportedBy) {
      calcData.exportedBy = calculation.exportedBy;
    }
    if (calculation.recalculationHistory && calculation.recalculationHistory.length > 0) {
      calcData.recalculationHistory = calculation.recalculationHistory.map(hist => ({
        recalculatedAt: hist.recalculatedAt instanceof Date 
          ? Timestamp.fromDate(hist.recalculatedAt) 
          : hist.recalculatedAt,
        recalculatedBy: hist.recalculatedBy,
        reason: hist.reason,
        recalculationType: hist.recalculationType,
        dataSnapshot: hist.dataSnapshot
      }));
    }

    // 他社兼務関連
    if (calculation.isOtherCompany !== undefined) {
      calcData.isOtherCompany = calculation.isOtherCompany;
    }
    if (calculation.ownCompanySalary !== undefined) {
      calcData.ownCompanySalary = calculation.ownCompanySalary;
    }
    if (calculation.otherCompanySalaryTotal !== undefined) {
      calcData.otherCompanySalaryTotal = calculation.otherCompanySalaryTotal;
    }

    // 休職関連
    if (calculation.isOnLeave !== undefined) {
      calcData.isOnLeave = calculation.isOnLeave;
    }
    if (calculation.postpaidLeaveAmount !== undefined) {
      calcData.postpaidLeaveAmount = calculation.postpaidLeaveAmount;
    }
    if (calculation.postpaidLeaveCompanyAmount !== undefined) {
      calcData.postpaidLeaveCompanyAmount = calculation.postpaidLeaveCompanyAmount;
    }
    if (calculation.postpaidLeaveAmounts && calculation.postpaidLeaveAmounts.length > 0) {
      calcData.postpaidLeaveAmounts = calculation.postpaidLeaveAmounts;
    }
    if (calculation.postpaidLeaveTotal !== undefined) {
      calcData.postpaidLeaveTotal = calculation.postpaidLeaveTotal;
    }
    if (calculation.postpaidLeaveCompanyTotal !== undefined) {
      calcData.postpaidLeaveCompanyTotal = calculation.postpaidLeaveCompanyTotal;
    }

    // undefined値を削除してから保存
    const cleanedCalcData = this.removeUndefinedValues(calcData);

    if (calculation.id) {
      await setDoc(doc(this.firestore, `${environment.firestorePrefix}calculations`, calculation.id), cleanedCalcData, { merge: true });
      return calculation.id;
    } else {
      await setDoc(calcRef, cleanedCalcData);
      return calcRef.id;
    }
  }

  /**
   * 複数の月次計算結果を一括保存
   */
  async saveCalculations(calculations: MonthlyCalculation[]): Promise<string[]> {
    const promises = calculations.map(calc => this.saveCalculation(calc));
    return Promise.all(promises);
  }

  /**
   * 月次計算結果を取得
   */
  async getCalculation(calculationId: string): Promise<MonthlyCalculation | null> {
    const calcRef = doc(this.firestore, `${environment.firestorePrefix}calculations`, calculationId);
    const calcSnap = await getDoc(calcRef);
    
    if (!calcSnap.exists()) {
      return null;
    }

    return this.convertToCalculation({ id: calcSnap.id, ...calcSnap.data() });
  }

  /**
   * FirestoreデータをMonthlyCalculationに変換
   */
  private convertToCalculation(data: any): MonthlyCalculation {
    // dependentInfoのbirthDateを変換
    let dependentInfo = data['dependentInfo'];
    if (dependentInfo && Array.isArray(dependentInfo)) {
      dependentInfo = dependentInfo.map((dep: any) => ({
        ...dep,
        birthDate: this.convertToDate(dep.birthDate) || dep.birthDate
      }));
    }

    // recalculationHistoryを変換
    let recalculationHistory = data['recalculationHistory'];
    if (recalculationHistory && Array.isArray(recalculationHistory)) {
      recalculationHistory = recalculationHistory.map((hist: any) => ({
        recalculatedAt: this.convertToDate(hist.recalculatedAt) || hist.recalculatedAt,
        recalculatedBy: hist.recalculatedBy,
        reason: hist.reason,
        recalculationType: hist.recalculationType,
        dataSnapshot: hist.dataSnapshot || {}
      }));
    }

    return {
      id: data['id'],
      organizationId: data['organizationId'],
      year: data['year'],
      month: data['month'],
      employeeId: data['employeeId'],
      employeeNumber: data['employeeNumber'],
      employeeName: data['employeeName'],
      departmentName: data['departmentName'],
      standardReward: data['standardReward'],
      grade: data['grade'],
      pensionGrade: data['pensionGrade'] || null,
      healthInsurancePremium: data['healthInsurancePremium'],
      pensionInsurancePremium: data['pensionInsurancePremium'],
      dependentHealthInsurancePremium: data['dependentHealthInsurancePremium'],
      dependentPensionInsurancePremium: data['dependentPensionInsurancePremium'],
      careInsurancePremium: data['careInsurancePremium'],
      totalPremium: data['totalPremium'],
      companyShare: data['companyShare'],
      employeeShare: data['employeeShare'],
      calculationDate: this.convertToDate(data['calculationDate']) || new Date(),
      calculatedBy: data['calculatedBy'],
      status: data['status'] || 'draft',
      notes: data['notes'],
      // 過去計算再現用の追加情報
      monthlyPaymentAmount: data['monthlyPaymentAmount'],
      dependentInfo: dependentInfo,
      healthInsuranceRate: data['healthInsuranceRate'],
      healthInsuranceRateWithCare: data['healthInsuranceRateWithCare'],
      pensionInsuranceRate: data['pensionInsuranceRate'],
      birthDate: this.convertToDate(data['birthDate']) || data['birthDate'],
      joinDate: this.convertToDate(data['joinDate']) || data['joinDate'],
      // ステータス管理用のフィールド
      recalculationHistory: recalculationHistory,
      confirmedAt: this.convertToDate(data['confirmedAt']) || data['confirmedAt'],
      confirmedBy: data['confirmedBy'],
      exportedAt: this.convertToDate(data['exportedAt']) || data['exportedAt'],
      exportedBy: data['exportedBy'],
      createdAt: this.convertToDate(data['createdAt']) || new Date(),
      updatedAt: this.convertToDate(data['updatedAt']) || new Date(),
      // 差額情報
      premiumDifference: data['premiumDifference'],
      // 遡及控除情報
      retroactiveDeductions: data['retroactiveDeductions']?.map((deduction: any) => ({
        year: deduction.year,
        month: deduction.month,
        healthInsurancePremiumDiff: deduction.healthInsurancePremiumDiff,
        pensionInsurancePremiumDiff: deduction.pensionInsurancePremiumDiff,
        companyShareDiff: deduction.companyShareDiff,
        employeeShareDiff: deduction.employeeShareDiff,
        appliedAt: this.convertToDate(deduction.appliedAt) || deduction.appliedAt,
        appliedBy: deduction.appliedBy
      })) || undefined,
      // 他社兼務関連
      isOtherCompany: data['isOtherCompany'],
      ownCompanySalary: data['ownCompanySalary'],
      otherCompanySalaryTotal: data['otherCompanySalaryTotal'],
      // 休職関連
      isOnLeave: data['isOnLeave'],
      postpaidLeaveAmount: data['postpaidLeaveAmount'],
      postpaidLeaveCompanyAmount: data['postpaidLeaveCompanyAmount'],
      postpaidLeaveAmounts: data['postpaidLeaveAmounts'],
      postpaidLeaveTotal: data['postpaidLeaveTotal'],
      postpaidLeaveCompanyTotal: data['postpaidLeaveCompanyTotal']
    } as MonthlyCalculation;
  }

  /**
   * 組織の月次計算結果を取得（年月指定）
   */
  async getCalculationsByMonth(organizationId: string, year: number, month: number): Promise<MonthlyCalculation[]> {
    const q = query(
      collection(this.firestore, `${environment.firestorePrefix}calculations`),
      where('organizationId', '==', organizationId),
      where('year', '==', year),
      where('month', '==', month),
      orderBy('employeeNumber')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.convertToCalculation({ id: doc.id, ...doc.data() }));
  }

  /**
   * 社員の月次計算結果を取得（年月指定）
   * 最新の計算結果を返す（createdAtの降順）
   */
  async getCalculationsByEmployee(employeeId: string, year: number, month: number): Promise<MonthlyCalculation | null> {
    const q = query(
      collection(this.firestore, `${environment.firestorePrefix}calculations`),
      where('employeeId', '==', employeeId),
      where('year', '==', year),
      where('month', '==', month),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }
    
    return this.convertToCalculation({ id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data() });
  }

  /**
   * 月次計算結果を更新
   */
  async updateCalculation(calculationId: string, updates: Partial<MonthlyCalculation>): Promise<string> {
    const calcRef = doc(this.firestore, `${environment.firestorePrefix}calculations`, calculationId);
    
    const updateData: any = {
      updatedAt: Timestamp.fromDate(new Date())
    };

    // 基本フィールド
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.healthInsurancePremium !== undefined) updateData.healthInsurancePremium = updates.healthInsurancePremium;
    if (updates.pensionInsurancePremium !== undefined) updateData.pensionInsurancePremium = updates.pensionInsurancePremium;
    if (updates.dependentHealthInsurancePremium !== undefined) updateData.dependentHealthInsurancePremium = updates.dependentHealthInsurancePremium;
    if (updates.dependentPensionInsurancePremium !== undefined) updateData.dependentPensionInsurancePremium = updates.dependentPensionInsurancePremium;
    if (updates.careInsurancePremium !== undefined) updateData.careInsurancePremium = updates.careInsurancePremium;
    if (updates.totalPremium !== undefined) updateData.totalPremium = updates.totalPremium;
    if (updates.companyShare !== undefined) updateData.companyShare = updates.companyShare;
    if (updates.employeeShare !== undefined) updateData.employeeShare = updates.employeeShare;
    if (updates.standardReward !== undefined) updateData.standardReward = updates.standardReward;
    if (updates.grade !== undefined) updateData.grade = updates.grade;
    if (updates.pensionGrade !== undefined) updateData.pensionGrade = updates.pensionGrade;
    if (updates.employeeNumber !== undefined) updateData.employeeNumber = updates.employeeNumber;
    if (updates.employeeName !== undefined) updateData.employeeName = updates.employeeName;
    if (updates.calculationDate !== undefined) {
      updateData.calculationDate = updates.calculationDate instanceof Date 
        ? Timestamp.fromDate(updates.calculationDate) 
        : updates.calculationDate;
    }
    if (updates.calculatedBy !== undefined) updateData.calculatedBy = updates.calculatedBy;

    // 過去計算再現用の追加情報
    if (updates.monthlyPaymentAmount !== undefined) updateData.monthlyPaymentAmount = updates.monthlyPaymentAmount;
    if (updates.dependentInfo !== undefined) {
      updateData.dependentInfo = updates.dependentInfo.map(dep => ({
        ...dep,
        birthDate: dep.birthDate instanceof Date 
          ? Timestamp.fromDate(dep.birthDate) 
          : dep.birthDate
      }));
    }
    if (updates.healthInsuranceRate !== undefined) updateData.healthInsuranceRate = updates.healthInsuranceRate;
    if (updates.healthInsuranceRateWithCare !== undefined) updateData.healthInsuranceRateWithCare = updates.healthInsuranceRateWithCare;
    if (updates.pensionInsuranceRate !== undefined) updateData.pensionInsuranceRate = updates.pensionInsuranceRate;
    if (updates.birthDate !== undefined) {
      updateData.birthDate = updates.birthDate instanceof Date 
        ? Timestamp.fromDate(updates.birthDate) 
        : updates.birthDate;
    }
    if (updates.joinDate !== undefined) {
      updateData.joinDate = updates.joinDate instanceof Date 
        ? Timestamp.fromDate(updates.joinDate) 
        : updates.joinDate;
    }

    // ステータス管理用のフィールド
    if (updates.confirmedAt !== undefined) {
      updateData.confirmedAt = updates.confirmedAt instanceof Date 
        ? Timestamp.fromDate(updates.confirmedAt) 
        : updates.confirmedAt;
    }
    if (updates.confirmedBy !== undefined) updateData.confirmedBy = updates.confirmedBy;
    if (updates.exportedAt !== undefined) {
      updateData.exportedAt = updates.exportedAt instanceof Date 
        ? Timestamp.fromDate(updates.exportedAt) 
        : updates.exportedAt;
    }
    if (updates.exportedBy !== undefined) updateData.exportedBy = updates.exportedBy;
    if (updates.recalculationHistory !== undefined) {
      updateData.recalculationHistory = updates.recalculationHistory.map(hist => ({
        recalculatedAt: hist.recalculatedAt instanceof Date 
          ? Timestamp.fromDate(hist.recalculatedAt) 
          : hist.recalculatedAt,
        recalculatedBy: hist.recalculatedBy,
        reason: hist.reason,
        recalculationType: hist.recalculationType,
        dataSnapshot: hist.dataSnapshot
      }));
    }
    
    // 差額情報（undefinedの場合はnullを設定して削除）
    if (updates.premiumDifference !== undefined) {
      if (updates.premiumDifference === null) {
        updateData.premiumDifference = null;
      } else {
        updateData.premiumDifference = updates.premiumDifference;
      }
    }
    
    // 遡及控除情報（undefinedの場合はnullを設定して削除）
    if (updates.retroactiveDeductions !== undefined) {
      if (updates.retroactiveDeductions === null || updates.retroactiveDeductions.length === 0) {
        updateData.retroactiveDeductions = null;
      } else {
        updateData.retroactiveDeductions = updates.retroactiveDeductions.map(deduction => ({
          year: deduction.year,
          month: deduction.month,
          healthInsurancePremiumDiff: deduction.healthInsurancePremiumDiff,
          pensionInsurancePremiumDiff: deduction.pensionInsurancePremiumDiff,
          companyShareDiff: deduction.companyShareDiff,
          employeeShareDiff: deduction.employeeShareDiff,
          appliedAt: deduction.appliedAt instanceof Date 
            ? Timestamp.fromDate(deduction.appliedAt) 
            : deduction.appliedAt,
          appliedBy: deduction.appliedBy
        }));
      }
    }

    // undefined値を除外してから更新
    const cleanedUpdateData = this.removeUndefinedValues(updateData);
    await updateDoc(calcRef, cleanedUpdateData);
    return calculationId;
  }

  /**
   * 月次計算結果を削除（draftのみ削除可能）
   */
  async deleteCalculation(calculationId: string): Promise<void> {
    const calculation = await this.getCalculation(calculationId);
    if (!calculation) {
      throw new Error('計算結果が見つかりません');
    }
    
    // confirmedまたはexportedは削除不可
    if (calculation.status === 'confirmed' || calculation.status === 'exported') {
      throw new Error('確定済みまたは出力済みの計算結果は削除できません');
    }
    
    const calcRef = doc(this.firestore, `${environment.firestorePrefix}calculations`, calculationId);
    await deleteDoc(calcRef);
  }

  /**
   * 計算結果を確定する
   */
  async confirmCalculation(calculationId: string, confirmedBy: string): Promise<void> {
    const now = new Date();
    await this.updateCalculation(calculationId, {
      status: 'confirmed',
      confirmedAt: now,
      confirmedBy: confirmedBy
    });
  }

  /**
   * 計算結果を一括確定する
   */
  async confirmCalculations(calculationIds: string[], confirmedBy: string): Promise<void> {
    const promises = calculationIds.map(id => this.confirmCalculation(id, confirmedBy));
    await Promise.all(promises);
  }

  /**
   * 確定済みの計算結果を再計算する（履歴に保存）
   */
  /**
   * 再現計算（当時条件）：過去の計算結果に保存されている情報を使用して再計算
   */
  async recalculateConfirmedCalculationHistorical(
    calculationId: string,
    recalculatedBy: string,
    reason?: string
  ): Promise<string> {
    const existingCalculation = await this.getCalculation(calculationId);
    if (!existingCalculation) {
      throw new Error('計算結果が見つかりません');
    }
    
    if (existingCalculation.status !== 'confirmed' && existingCalculation.status !== 'exported') {
      throw new Error('確定済みまたは出力済みの計算結果のみ再計算できます');
    }

    // 社員情報を取得
    const employee = await this.employeeService.getEmployee(existingCalculation.employeeId);
    if (!employee) {
      throw new Error('社員情報が見つかりません');
    }

    // 再現計算（当時条件）を実行
    const newCalculation = await this.calculateEmployeePremium(
      employee,
      existingCalculation.year,
      existingCalculation.month,
      recalculatedBy,
      existingCalculation // historicalCalculationとして渡す
    );

    // 再計算前のデータを履歴に保存
    const recalculationHistory: CalculationRecalculationHistory = {
      recalculatedAt: new Date(),
      recalculatedBy: recalculatedBy,
      reason: reason,
      recalculationType: 'historical',
      dataSnapshot: {
        standardReward: existingCalculation.standardReward,
        grade: existingCalculation.grade,
        pensionGrade: existingCalculation.pensionGrade,
        healthInsurancePremium: existingCalculation.healthInsurancePremium,
        pensionInsurancePremium: existingCalculation.pensionInsurancePremium,
        totalPremium: existingCalculation.totalPremium,
        companyShare: existingCalculation.companyShare,
        employeeShare: existingCalculation.employeeShare,
        calculationDate: existingCalculation.calculationDate,
        calculatedBy: existingCalculation.calculatedBy,
        dependentInfo: existingCalculation.dependentInfo,
        healthInsuranceRate: existingCalculation.healthInsuranceRate,
        healthInsuranceRateWithCare: existingCalculation.healthInsuranceRateWithCare,
        pensionInsuranceRate: existingCalculation.pensionInsuranceRate
      }
    };

    // 既存の履歴に追加
    const existingHistory = existingCalculation.recalculationHistory || [];
    const updatedHistory = [...existingHistory, recalculationHistory];

    // 新しい計算結果で更新（ステータスは元のまま維持）
    const updates: Partial<MonthlyCalculation> = {
      ...newCalculation,
      status: existingCalculation.status, // 元のステータスを維持
      recalculationHistory: updatedHistory,
      confirmedAt: existingCalculation.confirmedAt,
      confirmedBy: existingCalculation.confirmedBy,
      exportedAt: existingCalculation.exportedAt,
      exportedBy: existingCalculation.exportedBy
    };

    return await this.updateCalculation(calculationId, updates);
  }

  /**
   * 再計算（現在条件）：現在のDBデータを使用して再計算
   */
  async recalculateConfirmedCalculation(
    calculationId: string,
    newCalculation: MonthlyCalculation,
    recalculatedBy: string,
    reason?: string
  ): Promise<string> {
    const existingCalculation = await this.getCalculation(calculationId);
    if (!existingCalculation) {
      throw new Error('計算結果が見つかりません');
    }
    
    if (existingCalculation.status !== 'confirmed' && existingCalculation.status !== 'exported') {
      throw new Error('確定済みまたは出力済みの計算結果のみ再計算できます');
    }

    // 再計算前のデータを履歴に保存
    const recalculationHistory: CalculationRecalculationHistory = {
      recalculatedAt: new Date(),
      recalculatedBy: recalculatedBy,
      reason: reason,
      recalculationType: 'current',
      dataSnapshot: {
        standardReward: existingCalculation.standardReward,
        grade: existingCalculation.grade,
        pensionGrade: existingCalculation.pensionGrade,
        healthInsurancePremium: existingCalculation.healthInsurancePremium,
        pensionInsurancePremium: existingCalculation.pensionInsurancePremium,
        totalPremium: existingCalculation.totalPremium,
        companyShare: existingCalculation.companyShare,
        employeeShare: existingCalculation.employeeShare,
        calculationDate: existingCalculation.calculationDate,
        calculatedBy: existingCalculation.calculatedBy,
        dependentInfo: existingCalculation.dependentInfo,
        healthInsuranceRate: existingCalculation.healthInsuranceRate,
        healthInsuranceRateWithCare: existingCalculation.healthInsuranceRateWithCare,
        pensionInsuranceRate: existingCalculation.pensionInsuranceRate
      }
    };

    // 既存の履歴に追加
    const existingHistory = existingCalculation.recalculationHistory || [];
    const updatedHistory = [...existingHistory, recalculationHistory];

    // 差額計算機能は削除（コメントアウト）
    // const healthInsurancePremiumDiff = newCalculation.healthInsurancePremium - existingCalculation.healthInsurancePremium;
    // const pensionInsurancePremiumDiff = newCalculation.pensionInsurancePremium - existingCalculation.pensionInsurancePremium;
    // const companyShareDiff = newCalculation.companyShare - existingCalculation.companyShare;
    // const employeeShareDiff = newCalculation.employeeShare - existingCalculation.employeeShare;
    // const hasDifference = healthInsurancePremiumDiff !== 0 || pensionInsurancePremiumDiff !== 0 || 
    //                      companyShareDiff !== 0 || employeeShareDiff !== 0;
    // const premiumDifference: PremiumDifference | undefined = hasDifference ? {
    //   previousHealthInsurancePremium: existingCalculation.healthInsurancePremium,
    //   previousPensionInsurancePremium: existingCalculation.pensionInsurancePremium,
    //   previousCompanyShare: existingCalculation.companyShare,
    //   previousEmployeeShare: existingCalculation.employeeShare,
    //   newHealthInsurancePremium: newCalculation.healthInsurancePremium,
    //   newPensionInsurancePremium: newCalculation.pensionInsurancePremium,
    //   newCompanyShare: newCalculation.companyShare,
    //   newEmployeeShare: newCalculation.employeeShare,
    //   healthInsurancePremiumDiff: healthInsurancePremiumDiff,
    //   pensionInsurancePremiumDiff: pensionInsurancePremiumDiff,
    //   companyShareDiff: companyShareDiff,
    //   employeeShareDiff: employeeShareDiff
    // } : undefined;

    // 新しい計算結果で更新（ステータスは元のまま維持）
    const updates: Partial<MonthlyCalculation> = {
      ...newCalculation,
      status: existingCalculation.status, // 元のステータスを維持
      recalculationHistory: updatedHistory,
      confirmedAt: existingCalculation.confirmedAt,
      confirmedBy: existingCalculation.confirmedBy,
      exportedAt: existingCalculation.exportedAt,
      exportedBy: existingCalculation.exportedBy
    };
    
    // 差額計算機能は削除（コメントアウト）
    // if (premiumDifference !== undefined) {
    //   updates.premiumDifference = premiumDifference;
    // }

    return await this.updateCalculation(calculationId, updates);
  }

  /**
   * CSV出力時にステータスをexportedに変更
   */
  async markAsExported(calculationId: string, exportedBy: string): Promise<void> {
    const now = new Date();
    await this.updateCalculation(calculationId, {
      status: 'exported',
      exportedAt: now,
      exportedBy: exportedBy
    });
  }

  /**
   * 複数の計算結果を一括でexportedに変更
   */
  async markCalculationsAsExported(calculationIds: string[], exportedBy: string): Promise<void> {
    const promises = calculationIds.map(id => this.markAsExported(id, exportedBy));
    await Promise.all(promises);
  }

  /**
   * 計算対象者を取得
   */
  async getCalculationTargetEmployees(organizationId: string, year: number, month: number): Promise<Employee[]> {
    const employees = await this.employeeService.getEmployeesByOrganization(organizationId);
    
    // 計算対象者の条件：
    // 1. 標準報酬月額が設定されている
    // 2. 該当月に在籍していた（joinDate <= 該当月の月末 かつ 退職日の翌日が含まれる月より前）
    // 3. 他社兼務の場合、主たる勤務先が我が社であること（isPrimary === true）
    // 4. 75歳未満であること（75歳以上は計算対象外）
    const targetDate = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);

    return employees.filter(employee => {
      // 標準報酬月額が設定されていない場合は除外
      if (!employee.insuranceInfo?.standardReward) {
        return false;
      }

      // 入社日が該当月の月末より後の場合は除外
      const joinDate = this.convertToDate(employee.joinDate);
      if (joinDate && joinDate > lastDayOfMonth) {
        return false;
      }

      // 退職日の翌日が含まれる月以降は除外
      const retirementDate = employee.retirementDate ? this.convertToDate(employee.retirementDate) : null;
      if (retirementDate) {
        const nextDay = new Date(retirementDate);
        nextDay.setDate(nextDay.getDate() + 1); // 退職日の翌日
        const nextDayYear = nextDay.getFullYear();
        const nextDayMonth = nextDay.getMonth() + 1;
        
        // 該当月が退職日の翌日が含まれる月以降なら除外
        if (year > nextDayYear || (year === nextDayYear && month >= nextDayMonth)) {
          return false;
        }
      }

      // 他社兼務の場合、該当月の他社給与データ（月額報酬）が確定済みかチェック
      if (employee.otherCompanyInfo && employee.otherCompanyInfo.length > 0) {
        // 非同期処理のため、ここではチェックしない（計算実行時にチェック）
        // 一覧表示には表示するが、計算可能かどうかは計算実行時に判定
      }

      // 75歳以上の場合は除外（全ての計算をしない）
      const age = this.calculateAge(employee.birthDate, targetDate);
      if (age >= 75) {
        return false;
      }

      return true;
    });
  }

  /**
   * 一括計算を実行
   */
  async executeBulkCalculation(
    organizationId: string,
    year: number,
    month: number,
    calculatedBy: string
  ): Promise<MonthlyCalculation[]> {
    const targetEmployees = await this.getCalculationTargetEmployees(organizationId, year, month);
    
    const calculations: MonthlyCalculation[] = [];
    const skippedEmployees: string[] = [];
    
    for (const employee of targetEmployees) {
      try {
        // 既存の計算結果をチェック
        const existingCalculation = await this.getCalculationsByEmployee(employee.id || '', year, month);
        
        // confirmedまたはexportedの計算結果がある場合はスキップ
        if (existingCalculation && (existingCalculation.status === 'confirmed' || existingCalculation.status === 'exported')) {
          skippedEmployees.push(employee.employeeNumber);
          continue;
        }
        
        const calculation = await this.calculateEmployeePremium(employee, year, month, calculatedBy);
        calculations.push(calculation);
      } catch (error: any) {
        // 既に確定済みのエラーの場合はスキップとして扱う
        if (error.message && error.message.includes('既に確定済み')) {
          skippedEmployees.push(employee.employeeNumber);
          continue;
        }
        console.error(`社員 ${employee.employeeNumber} の計算に失敗しました:`, error);
        // エラーが発生しても他の社員の計算は続行
      }
    }

    // 計算結果を保存
    if (calculations.length > 0) {
      await this.saveCalculations(calculations);
    }

    // スキップされた社員がいる場合は警告を表示（呼び出し側で処理）
    if (skippedEmployees.length > 0) {
      console.warn(`以下の社員は既に確定済みの計算結果があるためスキップされました: ${skippedEmployees.join(', ')}`);
    }

    return calculations;
  }

  /**
   * 賞与計算対象者を取得（表示用）
   * 注意: 賞与データの確定チェックは行わない（計算実行時にチェック）
   */
  async getBonusCalculationTargetEmployees(organizationId: string, year: number, month: number): Promise<Employee[]> {
    const employees = await this.employeeService.getEmployeesByOrganization(organizationId);
    
    // 計算対象者の条件（表示用）：
    // 1. 標準報酬月額が設定されている
    // 2. 該当月に在籍していた（joinDate <= 該当月の月末 かつ 退職日の翌日が含まれる月より前）
    // 3. 他社兼務の場合、主たる勤務先が我が社であること（isPrimary === true）
    // 4. 75歳未満であること（75歳以上は計算対象外）
    // 注意: 賞与データの確定チェックは計算実行時に行う
    const targetDate = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);

    const targetEmployees: Employee[] = [];
    
    for (const employee of employees) {
      // 標準報酬月額が設定されていない場合は除外
      if (!employee.insuranceInfo?.standardReward) {
        continue;
      }

      // 入社日が該当月の月末より後の場合は除外
      const joinDate = this.convertToDate(employee.joinDate);
      if (joinDate && joinDate > lastDayOfMonth) {
        continue;
      }

      // 退職日の翌日が含まれる月以降は除外
      const retirementDate = employee.retirementDate ? this.convertToDate(employee.retirementDate) : null;
      if (retirementDate) {
        const nextDay = new Date(retirementDate);
        nextDay.setDate(nextDay.getDate() + 1); // 退職日の翌日
        const nextDayYear = nextDay.getFullYear();
        const nextDayMonth = nextDay.getMonth() + 1;
        
        // 該当月が退職日の翌日が含まれる月以降なら除外
        if (year > nextDayYear || (year === nextDayYear && month >= nextDayMonth)) {
          continue;
        }
      }

      // 他社兼務の場合、該当月の他社給与データ（賞与）が確定済みかチェック
      // 非同期処理のため、ここではチェックしない（計算実行時にチェック）
      // 一覧表示には表示するが、計算可能かどうかは計算実行時に判定

      // 75歳以上の場合は除外（全ての計算をしない）
      const age = this.calculateAge(employee.birthDate, targetDate);
      if (age >= 75) {
        continue;
      }

      // 賞与データの確定チェックは行わない（計算実行時にチェック）
      targetEmployees.push(employee);
    }

    return targetEmployees;
  }

  /**
   * 社員の賞与保険料を計算
   */
  async calculateEmployeeBonusPremium(
    employee: Employee,
    year: number,
    month: number,
    calculatedBy: string,
    historicalCalculation?: BonusCalculation
  ): Promise<BonusCalculation> {
    // 再現計算（当時条件）の場合
    if (historicalCalculation) {
      return this.calculateEmployeeBonusPremiumHistorical(employee, year, month, calculatedBy, historicalCalculation);
    }

    // 再計算（現在条件）または通常計算の場合
    // 休職者の処理
    let isOnLeave = false;
    let leaveTypeLabel = '';
    let leaveInsuranceCollectionMethod: 'postpaid' | 'direct_transfer' = 'postpaid';
    let isApprovedLeaveExempt = false; // 申請承認済みの休職で全額免除の場合のフラグ
    
    if (employee.leaveInfo && employee.leaveInfo.length > 0) {
      // 組織情報を取得して保険料徴収方法を確認
      const organization = await this.organizationService.getOrganization(employee.organizationId);
      leaveInsuranceCollectionMethod = organization?.leaveInsuranceCollectionMethod || 'postpaid';
      
      for (const leave of employee.leaveInfo) {
        const leaveStartDate = this.convertToDate(leave.startDate);
        const leaveEndDate = leave.endDate ? this.convertToDate(leave.endDate) : null;
        
        if (!leaveStartDate) {
          continue;
        }

        // 休職開始日を含む月の月初
        const leaveStartMonth = new Date(leaveStartDate.getFullYear(), leaveStartDate.getMonth(), 1);
        
        // 休職終了日の判定（退職日と同じロジック）
        // 休職終了日の翌日が含まれる月は除外（免除対象外）
        if (leaveEndDate) {
          const nextDay = new Date(leaveEndDate);
          nextDay.setDate(nextDay.getDate() + 1); // 休職終了日の翌日
          const nextDayYear = nextDay.getFullYear();
          const nextDayMonth = nextDay.getMonth() + 1;
          
          // 計算対象月が休職終了日の翌日が含まれる月以降なら除外（免除対象外）
          if (year > nextDayYear || (year === nextDayYear && month >= nextDayMonth)) {
            // 免除対象外（通常計算を続行）
            continue;
          }
        }

        // 計算対象月が休職期間内かチェック
        const calculationMonthStart = new Date(year, month - 1, 1);
        
        if (calculationMonthStart >= leaveStartMonth) {
          isOnLeave = true;
          leaveTypeLabel = leave.type === 'maternity' ? '産前産後休業' : leave.type === 'childcare' ? '育児休業' : leave.type;
          
          // 申請承認済みの場合の処理
          if (leave.isApproved) {
            // 新ルール: 条件1と条件2をチェック
            if (leaveEndDate) {
              // 条件1: 休職開始日が含まれる月 = 休職終了日の翌日が含まれる月 が同じかチェック
              const leaveStartYear = leaveStartDate.getFullYear();
              const leaveStartMonthNum = leaveStartDate.getMonth() + 1; // 1-12
              
              const leaveEndDateNextDay = new Date(leaveEndDate);
              leaveEndDateNextDay.setDate(leaveEndDateNextDay.getDate() + 1);
              const nextDayYear = leaveEndDateNextDay.getFullYear();
              const nextDayMonth = leaveEndDateNextDay.getMonth() + 1; // 1-12
              
              const isSameMonth = (leaveStartYear === nextDayYear && leaveStartMonthNum === nextDayMonth);
              
              // 条件1を満たす場合、条件2をチェック
              if (isSameMonth) {
                // 条件2: その月内で14日以上休職しているかチェック
                // 計算対象月が条件1で一致した月と一致する場合のみ新ルールを適用
                if (year === leaveStartYear && month === leaveStartMonthNum) {
                  // 休職開始日から休職終了日までの日数を計算
                  const leaveDays = Math.floor((leaveEndDate.getTime() - leaveStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                  
                  if (leaveDays >= 14) {
                    // 条件1と条件2を両方満たす場合: 免除（フラグを立てて通常計算を続行）
                    isApprovedLeaveExempt = true;
                    break; // 休職情報のループを抜ける
                  } else {
                    // 条件1を満たすが条件2を満たさない場合: 通常計算を続行
                    // isOnLeaveフラグをfalseに戻して通常計算に進む
                    isOnLeave = false;
                    continue;
                  }
                } else {
                  // 計算対象月が条件1で一致した月と異なる場合: 免除（フラグを立てて通常計算を続行）
                  isApprovedLeaveExempt = true;
                  break; // 休職情報のループを抜ける
                }
              } else {
                // 条件1を満たさない場合: 免除（フラグを立てて通常計算を続行）
                isApprovedLeaveExempt = true;
                break; // 休職情報のループを抜ける
              }
            } else {
              // 休職終了日が未設定の場合: 免除（フラグを立てて通常計算を続行）
              isApprovedLeaveExempt = true;
              break; // 休職情報のループを抜ける
            }
          }
          // 申請承認されていない場合は通常計算を続行（後で処理）
          break;
        }
      }
    }

    // 賞与データを取得
    const bonusData = await this.bonusDataService.getBonusData(employee.id!, year, month);
    if (!bonusData || !bonusData.isConfirmed) {
      throw new Error(`社員 ${employee.employeeNumber} の${year}年${month}月の賞与データが確定されていません`);
    }

    // 判定期間（7月1日～翌6月30日）内の賞与計算回数をチェック
    // 判定期間の開始年月を決定
    let periodStartYear: number;
    let periodStartMonth: number = 7; // 7月

    if (month >= 7) {
      // 7月～12月の場合: その年の7月1日から
      periodStartYear = year;
    } else {
      // 1月～6月の場合: 前年の7月1日から
      periodStartYear = year - 1;
    }

    // 判定期間の終了年月を決定
    let periodEndYear: number;
    let periodEndMonth: number = 6; // 6月

    if (month >= 7) {
      // 7月～12月の場合: 翌年6月30日まで
      periodEndYear = year + 1;
    } else {
      // 1月～6月の場合: その年の6月30日まで
      periodEndYear = year;
    }

    // 判定期間内の確定済み賞与計算回数をカウント（注意書き用）
    let bonusCount = 0;
    for (let y = periodStartYear; y <= periodEndYear; y++) {
      const monthStart = (y === periodStartYear) ? periodStartMonth : 1;
      const monthEnd = (y === periodEndYear) ? periodEndMonth : 12;
      
      for (let m = monthStart; m <= monthEnd; m++) {
        // 現在計算しようとしている年月はスキップ（後でカウント）
        if (y === year && m === month) {
          continue;
        }
        
        const pastCalculation = await this.getBonusCalculationsByEmployee(employee.id!, y, m);
        if (pastCalculation && (pastCalculation.status === 'confirmed' || pastCalculation.status === 'exported')) {
          bonusCount++;
        }
      }
    }

    // 現在の計算を含めて4回以上の場合の注意書き用フラグ
    const isFourthOrMoreBonus = bonusCount >= 3; // 現在の計算を含めると4回目以上

    let standardBonusAmount = bonusData.standardBonusAmount;
    const targetDate = new Date(year, month - 1, 1);

    // 修正18: 4月～翌3月の標準賞与額累計が573万円を超える場合の処理
    // 計算対象月が4月以降ならその年の4月から、3月以前なら前年の4月から開始
    const fiscalYearStartYear = month >= 4 ? year : year - 1;
    const fiscalYearStartMonth = 4;
    
    // 計算対象月の前月までの期間で過去の賞与計算結果を取得
    let cumulativeStandardBonusAmount = 0;
    const endYear = month === 1 ? year - 1 : year;
    const endMonth = month === 1 ? 12 : month - 1;
    
    // 4月から計算対象月の前月まで
    for (let y = fiscalYearStartYear; y <= endYear; y++) {
      const monthStart = y === fiscalYearStartYear ? fiscalYearStartMonth : 1;
      const monthEnd = y === endYear ? endMonth : 12;
      
      for (let m = monthStart; m <= monthEnd; m++) {
        const pastCalculation = await this.getBonusCalculationsByEmployee(employee.id!, y, m);
        if (pastCalculation && pastCalculation.status !== 'draft') {
          cumulativeStandardBonusAmount += pastCalculation.standardBonusAmount;
        }
      }
    }
    
    // 573万円を超える場合は、使用する標準賞与額を調整
    const maxStandardBonusAmount = 5730000;
    if (cumulativeStandardBonusAmount + standardBonusAmount > maxStandardBonusAmount) {
      const adjustedStandardBonusAmount = Math.max(0, maxStandardBonusAmount - cumulativeStandardBonusAmount);
      standardBonusAmount = adjustedStandardBonusAmount;
    }

    // 修正12: 他社兼務者の場合、該当月の他社給与データ（賞与）が確定済みかチェック
    if (employee.otherCompanyInfo && employee.otherCompanyInfo.length > 0) {
      const otherCompanyBonusDataList = await this.otherCompanySalaryDataService.getConfirmedOtherCompanyBonusDataByEmployee(
        employee.id!,
        year,
        month
      );
      // 他社給与データが存在するが、確定済みのものがない場合はエラー
      const allOtherCompanySalaryData = await this.otherCompanySalaryDataService.getOtherCompanySalaryDataByEmployee(
        employee.id!,
        year,
        month
      );
      const hasBonusData = allOtherCompanySalaryData.some(data => data.bonus !== undefined && data.bonus !== null && data.bonus > 0);
      if (hasBonusData && otherCompanyBonusDataList.length === 0) {
        throw new Error(`社員 ${employee.employeeNumber} の${year}年${month}月の他社賞与データが確定されていません`);
      }
    }

    // 保険料率テーブルを取得（組織固有のテーブルのみ使用）
    const rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(employee.organizationId);
    const allRateTables = rateTables;

    // 適用期間でフィルタリング
    const validRateTables = allRateTables.filter(table => {
      const effectiveFrom = this.convertToDate(table.effectiveFrom);
      const effectiveTo = table.effectiveTo ? this.convertToDate(table.effectiveTo) : null;
      
      if (!effectiveFrom) {
        return false;
      }
      
      const fromDate = new Date(effectiveFrom.getFullYear(), effectiveFrom.getMonth(), 1);
      const toDate = effectiveTo ? new Date(effectiveTo.getFullYear(), effectiveTo.getMonth(), 1) : null;
      
      return targetDate >= fromDate && (!toDate || targetDate <= toDate);
    });

    if (validRateTables.length === 0) {
      throw new Error(`${year}年${month}月に適用される保険料率テーブルが見つかりません`);
    }

    // 標準賞与額から等級を決定（標準報酬月額と同じ等級表を使用）
    const grade = this.getGradeFromStandardReward(standardBonusAmount, validRateTables);
    if (!grade) {
      throw new Error(`標準賞与額 ${standardBonusAmount} 円に対応する等級が見つかりません`);
    }

    // 健康保険料を計算（40-64歳の場合は介護保険料を含む）
    const healthInsurance = await this.calculateHealthInsurance(employee, standardBonusAmount, validRateTables, targetDate);
    
    // 年齢を計算
    const age = this.calculateAge(employee.birthDate, targetDate);
    
    // 年齢による特例：70歳以上75歳未満は厚生年金を計算しない
    // 75歳以上は既に計算対象から除外済み
    let pensionInsurance: { premium: number; half: number; grade: number | null };
    if (age >= 70 && age < 75) {
      // 70歳以上75歳未満：厚生年金を0円にする
      pensionInsurance = { premium: 0, half: 0, grade: null };
    } else {
      // 修正18: 厚生年金料計算時に標準賞与額が150万円を超える場合は150万円を上限として計算
      const pensionStandardBonusAmount = Math.min(standardBonusAmount, 1500000);
      // 厚生年金料を計算
      pensionInsurance = await this.calculatePensionInsurance(pensionStandardBonusAmount, validRateTables);
    }
    
    // 料率テーブルから料率を取得
    const rateTable = validRateTables.find(t => t.grade === grade);
    if (!rateTable) {
      throw new Error(`等級 ${grade} の料率テーブルが見つかりません`);
    }

    // 40-64歳の場合は介護保険料を含む料率を使用
    const isCareInsuranceTarget = age >= 40 && age < 65;
    
    // 健康保険料率を取得（介護保険料込かどうかで選択）
    const healthInsuranceRateData = isCareInsuranceTarget 
      ? rateTable.healthInsuranceWithCare 
      : rateTable.healthInsuranceWithoutCare;
    const healthInsuranceRate = healthInsuranceRateData.rate;
    
    // 厚生年金料率を取得
    const pensionInsuranceRate = rateTable.pensionInsurance.rate;

    // 部署名を取得
    let departmentName: string | undefined;
    if (employee.departmentId) {
      try {
        const departments = await this.departmentService.getDepartmentsByOrganization(employee.organizationId);
        const department = departments.find(d => d.id === employee.departmentId);
        departmentName = department?.name;
      } catch (error) {
        console.error('部署情報の取得に失敗しました:', error);
      }
    }

    // 扶養者情報を取得
    const dependents = employee.dependentInfo || [];
    const dependentCount = dependents.length;

    // 修正11.txtに準拠した計算順序（賞与計算）：
    // 1. 等級表から折半額（half）を直接取得
    // 2. 折半額に端数処理を適用（50銭基準）
    // 3. 全額は折半額×2で計算（端数処理後の折半額から逆算）
    // 4. 扶養者の保険料は全額会社負担
    // 5. その後全てを合算

    // 申請承認されていない休職者で、保険料徴収方法が本人支払の場合の判定
    // （後で実装：組織情報のleaveInsuranceCollectionMethodが'direct_transfer'かつleave.isApproved === false）
    let isDirectTransferLeave = false;
    if (employee.leaveInfo && employee.leaveInfo.length > 0) {
      for (const leave of employee.leaveInfo) {
        if (!leave.isApproved) {
          // 組織情報の取得は後で実装（今はfalseのまま）
          // const organization = await this.organizationService.getOrganization(employee.organizationId);
          // isDirectTransferLeave = organization?.leaveInsuranceCollectionMethod === 'direct_transfer';
          break;
        }
      }
    }

    // 1. 等級表から折半額（half）を直接取得
    // 被保険者本人の折半額
    let healthHalf = healthInsurance.half;
    let pensionHalf = pensionInsurance.half;

    // 扶養者1人あたりの折半額（被保険者と同じ標準賞与額と料率を使用）
    let dependentHealthHalf = 0;
    let dependentPensionHalf = 0;
    
    if (dependentCount > 0) {
      // 扶養者1人あたりの健康保険料（被保険者と同じ標準賞与額と料率、被保険者の年齢に合わせて介護保険料含むかどうか）
      const dependentHealthInsurance = await this.calculateHealthInsurance(employee, standardBonusAmount, validRateTables, targetDate);
      dependentHealthHalf = dependentHealthInsurance.half;
      
      // 扶養者1人あたりの厚生年金料（被保険者と同じ標準賞与額と料率）
      const dependentPensionInsurance = await this.calculatePensionInsurance(standardBonusAmount, validRateTables);
      dependentPensionHalf = dependentPensionInsurance.half;
    }

    // 2. 折半額に端数処理を適用（50銭基準）
    // 通常：50銭以下を切り捨て、50銭超を切り上げ（10000.50 → 10000、10000.51 → 10001）
    // 申請承認されていない休職者で、保険料徴収方法が本人支払の場合：50銭以上を切り上げ、50銭未満を切り捨て（10000.50 → 10001、10000.49 → 10000）
    const roundHalf = (half: number, isDirectTransferLeave: boolean): number => {
      const fractionalPart = half % 1;
      if (isDirectTransferLeave) {
        // 50銭以上を切り上げ、50銭未満を切り捨て
        return fractionalPart >= 0.5 ? Math.ceil(half) : Math.floor(half);
      } else {
        // 50銭以下を切り捨て、50銭超を切り上げ
        return fractionalPart <= 0.5 ? Math.floor(half) : Math.ceil(half);
      }
    };

    let healthEmployeeShare = roundHalf(healthHalf, isDirectTransferLeave);
    let pensionEmployeeShare = roundHalf(pensionHalf, isDirectTransferLeave);

    // 3. 全額は折半額×2で計算（端数処理後の折半額から逆算）
    let healthPremium = healthEmployeeShare * 2;
    let pensionPremium = pensionEmployeeShare * 2;

    // 扶養者全員分の保険料を計算（扶養者の折半額は端数処理しない、全額を会社負担）
    let totalDependentHealthPremium = dependentHealthHalf * 2 * dependentCount;
    let totalDependentPensionPremium = dependentPensionHalf * 2 * dependentCount;

    // 会社負担額 = 全額 - 社員負担額
    let healthCompanyShare = healthPremium - healthEmployeeShare;
    let pensionCompanyShare = pensionPremium - pensionEmployeeShare;

    // 扶養者の保険料は全額会社負担（折半しない）
    let dependentHealthCompanyShare = totalDependentHealthPremium;
    let dependentPensionCompanyShare = totalDependentPensionPremium;

    // 5. その後全てを合算
    // 被保険者本人の保険料合計
    let totalPremium = healthPremium + pensionPremium;
    
    // 社員負担額 = 被保険者本人の社員負担額のみ
    let employeeShare = healthEmployeeShare + pensionEmployeeShare;
    
    // 会社負担額 = 被保険者本人の会社負担額 + 扶養者全員分の保険料
    let companyShare = healthCompanyShare + pensionCompanyShare + dependentHealthCompanyShare + dependentPensionCompanyShare;

    // 修正12: 他社兼務の場合の計算ロジック（賞与計算）
    let isOtherCompany = false;
    let ownCompanySalary: number | undefined;
    let otherCompanySalaryTotal: number | undefined;
    
    if (employee.otherCompanyInfo && employee.otherCompanyInfo.length > 0) {
      isOtherCompany = true;
      
      // 自社賞与データは既に取得済み（bonusData）
      ownCompanySalary = bonusData.bonusAmount;
      
      // 他社給与データを取得（確定済みのみ、賞与あり）
      const otherCompanySalaryDataList = await this.otherCompanySalaryDataService.getConfirmedOtherCompanyBonusDataByEmployee(
        employee.id!,
        year,
        month
      );
      
      // 他社賞与合算を計算
      otherCompanySalaryTotal = otherCompanySalaryDataList.reduce((sum, data) => sum + (data.bonus || 0), 0);
      
      // 保険料 = 標準賞与額 × 料率 × 自社賞与 / (自社賞与 + 他社賞与合算)
      const bonusRatio = ownCompanySalary / (ownCompanySalary + otherCompanySalaryTotal);
      
      // 保険料に比率を適用
      healthPremium = Math.round(healthPremium * bonusRatio);
      pensionPremium = Math.round(pensionPremium * bonusRatio);
      totalDependentHealthPremium = Math.round(totalDependentHealthPremium * bonusRatio);
      totalDependentPensionPremium = Math.round(totalDependentPensionPremium * bonusRatio);
      
      // 折半額も再計算
      healthEmployeeShare = Math.round(healthEmployeeShare * bonusRatio);
      pensionEmployeeShare = Math.round(pensionEmployeeShare * bonusRatio);
      
      // 会社負担額も再計算
      healthCompanyShare = healthPremium - healthEmployeeShare;
      pensionCompanyShare = pensionPremium - pensionEmployeeShare;
      dependentHealthCompanyShare = totalDependentHealthPremium;
      dependentPensionCompanyShare = totalDependentPensionPremium;
      
      // 合計を再計算
      totalPremium = healthPremium + pensionPremium;
      employeeShare = healthEmployeeShare + pensionEmployeeShare;
      companyShare = healthCompanyShare + pensionCompanyShare + dependentHealthCompanyShare + dependentPensionCompanyShare;
    }

    // 申請承認済みの休職者は既に計算前にチェック済み（全額免除で返却済み）
    // ここに到達する場合は通常の計算を続行

    const now = new Date();
    const employeeName = `${employee.lastName} ${employee.firstName}`;

    // 休職期間中（申請承認されていない）の場合の処理
    let finalEmployeeShare = employeeShare;
    let finalCompanyShare = companyShare;
    let finalNotes: string | undefined = undefined;
    let finalIsOnLeave = false;
    let finalPostpaidLeaveAmount: number | undefined = undefined;
    let finalPostpaidLeaveCompanyAmount: number | undefined = undefined;

    if (isOnLeave) {
      finalIsOnLeave = true;
      
      // 申請承認済みの休職者は後払いや本人振込の処理をスキップ（全額免除のため）
      if (!isApprovedLeaveExempt) {
        if (leaveInsuranceCollectionMethod === 'postpaid') {
          // 後払いの場合：社員負担分を0にして、後払い分の情報を設定
          finalPostpaidLeaveAmount = employeeShare; // 後払い分（社員負担分）
          finalPostpaidLeaveCompanyAmount = totalPremium; // 建て替え分（折半前の全額）
          finalEmployeeShare = 0; // 社員負担分は0（後払い）
          finalNotes = `休職中特例で復職後徴収（後払い分：${finalPostpaidLeaveAmount.toLocaleString()}円、建て替え分：${finalPostpaidLeaveCompanyAmount.toLocaleString()}円）`;
        } else if (leaveInsuranceCollectionMethod === 'direct_transfer') {
          // 本人振込の場合：通常通り計算（端数処理は既に適用済み）
          finalNotes = `給与天引きではない（本人振込）`;
        }
      }
    }

    // 復職月の判定（休職終了日の翌日を含む月）
    // 賞与は不定期のため、休職期間中に賞与支払いがある場合のみ追記
    let postpaidLeaveAmounts: BonusPostpaidLeaveAmount[] | undefined = undefined;
    let postpaidLeaveTotal: number | undefined = undefined;
    let postpaidLeaveCompanyTotal: number | undefined = undefined;

    if (employee.leaveInfo && employee.leaveInfo.length > 0) {
      for (const leave of employee.leaveInfo) {
        if (leave.isApproved) {
          continue; // 申請承認済みの休職はスキップ
        }

        const leaveEndDate = leave.endDate ? this.convertToDate(leave.endDate) : null;
        if (!leaveEndDate) {
          continue; // 休職終了日が未設定の場合はスキップ
        }

        // 休職終了日の翌日を含む月を判定
        const nextDay = new Date(leaveEndDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayYear = nextDay.getFullYear();
        const nextDayMonth = nextDay.getMonth() + 1;

        // 計算対象月が休職終了日の翌日を含む月の場合、休職期間中の賞与計算結果を取得して追記
        if (year === nextDayYear && month === nextDayMonth && leaveInsuranceCollectionMethod === 'postpaid') {
          const leaveStartDate = this.convertToDate(leave.startDate);
          if (!leaveStartDate) {
            continue;
          }

          const leaveStartMonth = new Date(leaveStartDate.getFullYear(), leaveStartDate.getMonth(), 1);
          const leaveEndMonth = new Date(leaveEndDate.getFullYear(), leaveEndDate.getMonth(), 1);
          
          // 休職期間中の各月の賞与計算結果を取得（賞与は不定期のため、存在する場合のみ）
          postpaidLeaveAmounts = [];
          let totalEmployeeShare = 0;
          let totalCompanyShare = 0;

          for (let y = leaveStartMonth.getFullYear(), m = leaveStartMonth.getMonth() + 1; 
               y < leaveEndMonth.getFullYear() || (y === leaveEndMonth.getFullYear() && m <= leaveEndMonth.getMonth() + 1); 
               m === 12 ? (y++, m = 1) : m++) {
            // 休職終了日の翌日を含む月は除外（復職月なので）
            if (y === nextDayYear && m === nextDayMonth) {
              continue;
            }

            try {
              const leaveMonthBonusCalculation = await this.getBonusCalculationsByEmployee(employee.id!, y, m);
              if (leaveMonthBonusCalculation && leaveMonthBonusCalculation.postpaidLeaveAmount !== undefined) {
                const leaveTypeLabel = leave.type === 'maternity' ? '産前産後休業' : leave.type === 'childcare' ? '育児休業' : leave.type;
                postpaidLeaveAmounts.push({
                  year: y,
                  month: m,
                  employeeShare: leaveMonthBonusCalculation.postpaidLeaveAmount,
                  companyShare: leaveMonthBonusCalculation.postpaidLeaveCompanyAmount || 0,
                  totalPremium: leaveMonthBonusCalculation.totalPremium,
                  leaveType: leaveTypeLabel
                });
                totalEmployeeShare += leaveMonthBonusCalculation.postpaidLeaveAmount;
                totalCompanyShare += leaveMonthBonusCalculation.postpaidLeaveCompanyAmount || 0;
              }
            } catch (error) {
              console.warn(`休職期間中（${y}年${m}月）の賞与計算結果の取得に失敗しました:`, error);
            }
          }

          if (postpaidLeaveAmounts.length > 0) {
            postpaidLeaveTotal = totalEmployeeShare;
            postpaidLeaveCompanyTotal = totalCompanyShare;
            finalEmployeeShare = employeeShare + postpaidLeaveTotal; // 通常分 + 休職中未徴収分
            finalNotes = `休職中未徴収分を追記`;
          }
        }
      }
    }

    // 4回以上の賞与の場合の注意書きを追加
    if (isFourthOrMoreBonus) {
      const bonusWarning = '来年度に賞与が4回以上給付することが確定している場合は、必要な手続きを行ってください。';
      if (finalNotes) {
        finalNotes = `${finalNotes}\n${bonusWarning}`;
      } else {
        finalNotes = bonusWarning;
      }
    }

    // 申請承認済みの休職で全額免除の場合、保険料を0にしてnotesを設定
    let finalHealthPremiumBonus = healthPremium;
    let finalPensionPremiumBonus = pensionPremium;
    let finalTotalPremiumBonus = dependentCount > 0 
      ? healthPremium + totalDependentHealthPremium + pensionPremium + totalDependentPensionPremium
      : totalPremium;
    let finalCompanyShareBonus = finalCompanyShare;
    let finalEmployeeShareBonus = finalEmployeeShare;
    let finalNotesBonus = finalNotes;

    if (isApprovedLeaveExempt) {
      finalHealthPremiumBonus = 0;
      finalPensionPremiumBonus = 0;
      finalTotalPremiumBonus = 0;
      finalCompanyShareBonus = 0;
      finalEmployeeShareBonus = 0;
      finalNotesBonus = `休職中（${leaveTypeLabel}、申請承認済み）により全額免除（休職による免除のため）`;
    }

    const finalDependentHealthPremium = isApprovedLeaveExempt ? 0 : (dependentCount > 0 ? totalDependentHealthPremium : undefined);
    const finalDependentPensionPremium = isApprovedLeaveExempt ? 0 : (dependentCount > 0 ? totalDependentPensionPremium : undefined);

    return {
      organizationId: employee.organizationId,
      year,
      month,
      employeeId: employee.id || '',
      employeeNumber: employee.employeeNumber,
      employeeName,
      departmentName,
      bonusAmount: bonusData.bonusAmount,
      standardBonusAmount,
      healthInsurancePremium: finalHealthPremiumBonus,
      pensionInsurancePremium: finalPensionPremiumBonus,
      dependentHealthInsurancePremium: finalDependentHealthPremium,
      dependentPensionInsurancePremium: finalDependentPensionPremium,
      careInsurancePremium: 0,
      totalPremium: finalTotalPremiumBonus,
      companyShare: finalCompanyShareBonus,
      employeeShare: finalEmployeeShareBonus,
      calculationDate: now,
      calculatedBy,
      status: 'draft',
      notes: finalNotesBonus,
      dependentInfo: dependents.length > 0 ? dependents.map(dep => ({
        ...dep,
        birthDate: dep.birthDate instanceof Date ? dep.birthDate : (dep.birthDate?.toDate ? dep.birthDate.toDate() : dep.birthDate)
      })) : undefined,
      // 他社兼務関連
      isOtherCompany,
      ownCompanySalary,
      otherCompanySalaryTotal,
      // 休職関連
      isOnLeave: finalIsOnLeave,
      postpaidLeaveAmount: finalPostpaidLeaveAmount,
      postpaidLeaveCompanyAmount: finalPostpaidLeaveCompanyAmount,
      postpaidLeaveAmounts,
      postpaidLeaveTotal,
      postpaidLeaveCompanyTotal,
      grade: healthInsurance.grade,
      pensionGrade: pensionInsurance.grade,
      healthInsuranceRate,
      healthInsuranceRateWithCare: isCareInsuranceTarget,
      pensionInsuranceRate,
      birthDate: employee.birthDate instanceof Date ? employee.birthDate : (employee.birthDate?.toDate ? employee.birthDate.toDate() : employee.birthDate),
      joinDate: employee.joinDate instanceof Date ? employee.joinDate : (employee.joinDate?.toDate ? employee.joinDate.toDate() : employee.joinDate),
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * 再現計算（当時条件）：過去の計算結果に保存されている情報を使用して計算（賞与計算）
   */
  private async calculateEmployeeBonusPremiumHistorical(
    employee: Employee,
    year: number,
    month: number,
    calculatedBy: string,
    historicalCalculation: BonusCalculation
  ): Promise<BonusCalculation> {
    const now = new Date();
    const employeeName = `${employee.lastName} ${employee.firstName}`;

    // 部署名を取得
    let departmentName: string | undefined;
    if (employee.departmentId) {
      try {
        const departments = await this.departmentService.getDepartmentsByOrganization(employee.organizationId);
        const department = departments.find(d => d.id === employee.departmentId);
        departmentName = department?.name;
      } catch (error) {
        console.error('部署情報の取得に失敗しました:', error);
      }
    }

    // historicalCalculationから情報を取得
    const bonusAmount = historicalCalculation.bonusAmount;
    const standardBonusAmount = historicalCalculation.standardBonusAmount;
    const grade = historicalCalculation.grade;
    const pensionGrade = historicalCalculation.pensionGrade ?? null;
    const healthInsuranceRate = historicalCalculation.healthInsuranceRate;
    const healthInsuranceRateWithCare = historicalCalculation.healthInsuranceRateWithCare ?? false;
    const pensionInsuranceRate = historicalCalculation.pensionInsuranceRate;
    const dependentInfo = historicalCalculation.dependentInfo || [];
    const dependentCount = dependentInfo.length;
    const isOtherCompany = historicalCalculation.isOtherCompany ?? false;
    const ownCompanySalary = historicalCalculation.ownCompanySalary;
    const otherCompanySalaryTotal = historicalCalculation.otherCompanySalaryTotal;
    const isOnLeave = historicalCalculation.isOnLeave ?? false;
    const notes = historicalCalculation.notes;

    // 申請承認済みの休職判定
    const isApprovedLeaveExempt = historicalCalculation.totalPremium === 0 && 
      (notes?.includes('申請承認済み') || notes?.includes('全額免除') || false);

    // 当時の等級表を取得
    const targetDate = new Date(year, month - 1, 1);
    const rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(employee.organizationId);
    const validRateTables = rateTables.filter(table => {
      const effectiveFrom = this.convertToDate(table.effectiveFrom);
      const effectiveTo = table.effectiveTo ? this.convertToDate(table.effectiveTo) : null;
      if (!effectiveFrom) return false;
      const fromDate = new Date(effectiveFrom.getFullYear(), effectiveFrom.getMonth(), 1);
      const toDate = effectiveTo ? new Date(effectiveTo.getFullYear(), effectiveTo.getMonth(), 1) : null;
      return targetDate >= fromDate && (!toDate || targetDate <= toDate);
    });

    if (validRateTables.length === 0) {
      throw new Error(`${year}年${month}月に適用される保険料率テーブルが見つかりません`);
    }

    // 標準賞与額から等級を決定
    const healthInsurance = await this.calculateHealthInsurance(employee, standardBonusAmount, validRateTables, targetDate);
    const pensionInsurance = await this.calculatePensionInsurance(standardBonusAmount, validRateTables);

    // 等級表から折半額を取得
    const rateTable = validRateTables.find(t => t.grade === (grade || healthInsurance.grade));
    if (!rateTable) {
      throw new Error(`等級 ${grade || healthInsurance.grade} の料率テーブルが見つかりません`);
    }

    const healthInsuranceRateData = healthInsuranceRateWithCare 
      ? rateTable.healthInsuranceWithCare 
      : rateTable.healthInsuranceWithoutCare;
    const healthHalf = healthInsuranceRateData.half;
    const pensionHalf = pensionGrade ? rateTable.pensionInsurance.half : 0;

    // 扶養者1人あたりの折半額
    let dependentHealthHalf = 0;
    let dependentPensionHalf = 0;
    if (dependentCount > 0) {
      dependentHealthHalf = healthHalf;
      dependentPensionHalf = pensionHalf;
    }

    // 端数処理
    const roundHalf = (half: number): number => {
      const fractionalPart = half % 1;
      return fractionalPart <= 0.5 ? Math.floor(half) : Math.ceil(half);
    };

    let healthEmployeeShare = roundHalf(healthHalf);
    let pensionEmployeeShare = roundHalf(pensionHalf);

    // 全額は折半額×2で計算
    let healthPremium = healthEmployeeShare * 2;
    let pensionPremium = pensionEmployeeShare * 2;

    // 扶養者全員分の保険料を計算
    let totalDependentHealthPremium = dependentHealthHalf * 2 * dependentCount;
    let totalDependentPensionPremium = dependentPensionHalf * 2 * dependentCount;

    // 会社負担額
    let healthCompanyShare = healthPremium - healthEmployeeShare;
    let pensionCompanyShare = pensionPremium - pensionEmployeeShare;
    let dependentHealthCompanyShare = totalDependentHealthPremium;
    let dependentPensionCompanyShare = totalDependentPensionPremium;

    // 合計
    let totalPremium = healthPremium + pensionPremium;
    let employeeShare = healthEmployeeShare + pensionEmployeeShare;
    let companyShare = healthCompanyShare + pensionCompanyShare + dependentHealthCompanyShare + dependentPensionCompanyShare;

    // 他社兼務の場合の計算
    if (isOtherCompany && ownCompanySalary !== undefined && otherCompanySalaryTotal !== undefined) {
      const salaryRatio = ownCompanySalary / (ownCompanySalary + otherCompanySalaryTotal);
      healthPremium = Math.round(healthPremium * salaryRatio);
      pensionPremium = Math.round(pensionPremium * salaryRatio);
      totalDependentHealthPremium = Math.round(totalDependentHealthPremium * salaryRatio);
      totalDependentPensionPremium = Math.round(totalDependentPensionPremium * salaryRatio);
      healthEmployeeShare = Math.round(healthEmployeeShare * salaryRatio);
      pensionEmployeeShare = Math.round(pensionEmployeeShare * salaryRatio);
      healthCompanyShare = healthPremium - healthEmployeeShare;
      pensionCompanyShare = pensionPremium - pensionEmployeeShare;
      dependentHealthCompanyShare = totalDependentHealthPremium;
      dependentPensionCompanyShare = totalDependentPensionPremium;
      totalPremium = healthPremium + pensionPremium;
      employeeShare = healthEmployeeShare + pensionEmployeeShare;
      companyShare = healthCompanyShare + pensionCompanyShare + dependentHealthCompanyShare + dependentPensionCompanyShare;
    }

    // 申請承認済みの休職で全額免除の場合
    let finalHealthPremiumBonus = healthPremium;
    let finalPensionPremiumBonus = pensionPremium;
    let finalTotalPremiumBonus = dependentCount > 0 
      ? healthPremium + totalDependentHealthPremium + pensionPremium + totalDependentPensionPremium
      : totalPremium;
    let finalCompanyShareBonus = companyShare;
    let finalEmployeeShareBonus = employeeShare;
    let finalNotesBonus = notes;

    if (isApprovedLeaveExempt) {
      finalHealthPremiumBonus = 0;
      finalPensionPremiumBonus = 0;
      finalTotalPremiumBonus = 0;
      finalCompanyShareBonus = 0;
      finalEmployeeShareBonus = 0;
      finalNotesBonus = notes || `休職中（申請承認済み）により全額免除（休職による免除のため）`;
    }

    const finalDependentHealthPremium = isApprovedLeaveExempt ? 0 : (dependentCount > 0 ? totalDependentHealthPremium : undefined);
    const finalDependentPensionPremium = isApprovedLeaveExempt ? 0 : (dependentCount > 0 ? totalDependentPensionPremium : undefined);

    return {
      organizationId: employee.organizationId,
      year,
      month,
      employeeId: employee.id || '',
      employeeNumber: employee.employeeNumber,
      employeeName,
      departmentName,
      bonusAmount,
      standardBonusAmount,
      healthInsurancePremium: finalHealthPremiumBonus,
      pensionInsurancePremium: finalPensionPremiumBonus,
      dependentHealthInsurancePremium: finalDependentHealthPremium,
      dependentPensionInsurancePremium: finalDependentPensionPremium,
      careInsurancePremium: 0,
      totalPremium: finalTotalPremiumBonus,
      companyShare: finalCompanyShareBonus,
      employeeShare: finalEmployeeShareBonus,
      calculationDate: now,
      calculatedBy,
      status: 'draft',
      notes: finalNotesBonus,
      dependentInfo: dependentInfo.length > 0 ? dependentInfo.map(dep => ({
        ...dep,
        birthDate: dep.birthDate instanceof Date ? dep.birthDate : (dep.birthDate?.toDate ? dep.birthDate.toDate() : dep.birthDate)
      })) : undefined,
      isOtherCompany,
      ownCompanySalary,
      otherCompanySalaryTotal,
      isOnLeave,
      postpaidLeaveAmount: historicalCalculation.postpaidLeaveAmount,
      postpaidLeaveCompanyAmount: historicalCalculation.postpaidLeaveCompanyAmount,
      postpaidLeaveAmounts: historicalCalculation.postpaidLeaveAmounts,
      postpaidLeaveTotal: historicalCalculation.postpaidLeaveTotal,
      postpaidLeaveCompanyTotal: historicalCalculation.postpaidLeaveCompanyTotal,
      grade: grade || healthInsurance.grade,
      pensionGrade,
      healthInsuranceRate,
      healthInsuranceRateWithCare,
      pensionInsuranceRate,
      birthDate: historicalCalculation.birthDate instanceof Date ? historicalCalculation.birthDate : (historicalCalculation.birthDate?.toDate ? historicalCalculation.birthDate.toDate() : historicalCalculation.birthDate),
      joinDate: historicalCalculation.joinDate instanceof Date ? historicalCalculation.joinDate : (historicalCalculation.joinDate?.toDate ? historicalCalculation.joinDate.toDate() : historicalCalculation.joinDate),
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * 賞与計算結果を保存
   */
  async saveBonusCalculation(calculation: BonusCalculation): Promise<string> {
    const now = new Date();
    
    // 下書き（draft）の場合、同じ社員・年月の既存の計算結果を検索
    if (calculation.status === 'draft' && !calculation.id) {
      const existingCalculation = await this.getBonusCalculationsByEmployee(calculation.employeeId, calculation.year, calculation.month);
      
      if (existingCalculation) {
        // confirmedまたはexportedの計算結果がある場合は、新しいdraftを作成しない
        if (existingCalculation.status === 'confirmed' || existingCalculation.status === 'exported') {
          throw new Error(`既に確定済み（または出力済み）の計算結果があります。再計算する場合は、計算詳細画面から再計算してください。`);
        }
        
        // 既存のdraftがある場合は上書き
        if (existingCalculation.status === 'draft' && existingCalculation.id) {
          return await this.updateBonusCalculation(existingCalculation.id, calculation);
        }
      }
    }
    
    const calcRef = doc(collection(this.firestore, `${environment.firestorePrefix}bonusCalculations`));
    
    const calcData: any = {
      organizationId: calculation.organizationId,
      year: calculation.year,
      month: calculation.month,
      employeeId: calculation.employeeId,
      employeeNumber: calculation.employeeNumber,
      employeeName: calculation.employeeName,
      departmentName: calculation.departmentName,
      bonusAmount: calculation.bonusAmount,
      standardBonusAmount: calculation.standardBonusAmount,
      healthInsurancePremium: calculation.healthInsurancePremium,
      pensionInsurancePremium: calculation.pensionInsurancePremium,
      careInsurancePremium: calculation.careInsurancePremium,
      totalPremium: calculation.totalPremium,
      companyShare: calculation.companyShare,
      employeeShare: calculation.employeeShare,
      calculationDate: calculation.calculationDate instanceof Date 
        ? Timestamp.fromDate(calculation.calculationDate) 
        : calculation.calculationDate,
      calculatedBy: calculation.calculatedBy,
      status: calculation.status,
      createdAt: now,
      updatedAt: now
    };

    if (calculation.notes) {
      calcData.notes = calculation.notes;
    }
    if (calculation.dependentInfo) {
      calcData.dependentInfo = calculation.dependentInfo;
    }
    if (calculation.healthInsuranceRate !== undefined) {
      calcData.healthInsuranceRate = calculation.healthInsuranceRate;
    }
    if (calculation.healthInsuranceRateWithCare !== undefined) {
      calcData.healthInsuranceRateWithCare = calculation.healthInsuranceRateWithCare;
    }
    if (calculation.pensionInsuranceRate !== undefined) {
      calcData.pensionInsuranceRate = calculation.pensionInsuranceRate;
    }
    if (calculation.birthDate) {
      calcData.birthDate = calculation.birthDate instanceof Date 
        ? Timestamp.fromDate(calculation.birthDate) 
        : calculation.birthDate;
    }
    if (calculation.joinDate) {
      calcData.joinDate = calculation.joinDate instanceof Date 
        ? Timestamp.fromDate(calculation.joinDate) 
        : calculation.joinDate;
    }

    // 他社兼務関連
    if (calculation.isOtherCompany !== undefined) {
      calcData.isOtherCompany = calculation.isOtherCompany;
    }
    if (calculation.ownCompanySalary !== undefined) {
      calcData.ownCompanySalary = calculation.ownCompanySalary;
    }
    if (calculation.otherCompanySalaryTotal !== undefined) {
      calcData.otherCompanySalaryTotal = calculation.otherCompanySalaryTotal;
    }

    // 休職関連
    if (calculation.isOnLeave !== undefined) {
      calcData.isOnLeave = calculation.isOnLeave;
    }
    if (calculation.postpaidLeaveAmount !== undefined) {
      calcData.postpaidLeaveAmount = calculation.postpaidLeaveAmount;
    }
    if (calculation.postpaidLeaveCompanyAmount !== undefined) {
      calcData.postpaidLeaveCompanyAmount = calculation.postpaidLeaveCompanyAmount;
    }
    if (calculation.postpaidLeaveAmounts && calculation.postpaidLeaveAmounts.length > 0) {
      calcData.postpaidLeaveAmounts = calculation.postpaidLeaveAmounts;
    }
    if (calculation.postpaidLeaveTotal !== undefined) {
      calcData.postpaidLeaveTotal = calculation.postpaidLeaveTotal;
    }
    if (calculation.postpaidLeaveCompanyTotal !== undefined) {
      calcData.postpaidLeaveCompanyTotal = calculation.postpaidLeaveCompanyTotal;
    }

    // undefined値を削除してから保存
    const cleanedCalcData = this.removeUndefinedValues(calcData);
    await setDoc(calcRef, cleanedCalcData);
    return calcRef.id;
  }

  /**
   * 賞与計算結果を取得
   */
  async getBonusCalculation(calculationId: string): Promise<BonusCalculation | null> {
    const calcRef = doc(this.firestore, `${environment.firestorePrefix}bonusCalculations`, calculationId);
    const calcSnap = await getDoc(calcRef);
    
    if (!calcSnap.exists()) {
      return null;
    }

    return this.convertToBonusCalculation(calcSnap.id, calcSnap.data());
  }

  /**
   * 社員の賞与計算結果を取得
   */
  async getBonusCalculationsByEmployee(employeeId: string, year: number, month: number): Promise<BonusCalculation | null> {
    const q = query(
      collection(this.firestore, `${environment.firestorePrefix}bonusCalculations`),
      where('employeeId', '==', employeeId),
      where('year', '==', year),
      where('month', '==', month),
      orderBy('calculationDate', 'desc')
    );

    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }

    return this.convertToBonusCalculation(querySnapshot.docs[0].id, querySnapshot.docs[0].data());
  }

  /**
   * 組織の賞与計算結果一覧を取得
   */
  async getBonusCalculationsByMonth(organizationId: string, year: number, month: number): Promise<BonusCalculation[]> {
    const q = query(
      collection(this.firestore, `${environment.firestorePrefix}bonusCalculations`),
      where('organizationId', '==', organizationId),
      where('year', '==', year),
      where('month', '==', month),
      orderBy('calculationDate', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.convertToBonusCalculation(doc.id, doc.data()));
  }

  /**
   * 賞与計算結果を更新
   */
  async updateBonusCalculation(calculationId: string, updates: Partial<BonusCalculation>): Promise<string> {
    const calcRef = doc(this.firestore, `${environment.firestorePrefix}bonusCalculations`, calculationId);
    
    const updateData: any = {
      updatedAt: Timestamp.fromDate(new Date())
    };

    Object.keys(updates).forEach(key => {
      if (key !== 'id' && updates[key as keyof BonusCalculation] !== undefined) {
        const value = updates[key as keyof BonusCalculation];
        if (value instanceof Date) {
          updateData[key] = Timestamp.fromDate(value);
        } else {
          updateData[key] = value;
        }
      }
    });

    // undefined値を削除してから更新
    const cleanedUpdateData = this.removeUndefinedValues(updateData);
    await updateDoc(calcRef, cleanedUpdateData);
    return calculationId;
  }

  /**
   * 賞与計算結果を確定する
   */
  async confirmBonusCalculation(calculationId: string, confirmedBy: string): Promise<void> {
    const now = new Date();
    await this.updateBonusCalculation(calculationId, {
      status: 'confirmed',
      confirmedAt: now,
      confirmedBy: confirmedBy
    });
  }

  /**
   * 賞与計算結果を削除（draftのみ削除可能）
   */
  async deleteBonusCalculation(calculationId: string): Promise<void> {
    const calculation = await this.getBonusCalculation(calculationId);
    if (!calculation) {
      throw new Error('計算結果が見つかりません');
    }
    
    if (calculation.status === 'confirmed' || calculation.status === 'exported') {
      throw new Error('確定済みまたは出力済みの計算結果は削除できません');
    }
    
    const calcRef = doc(this.firestore, `${environment.firestorePrefix}bonusCalculations`, calculationId);
    await deleteDoc(calcRef);
  }

  /**
   * 確定済みの賞与計算結果を再計算する（履歴に保存）
   */
  /**
   * 再現計算（当時条件）：過去の計算結果に保存されている情報を使用して再計算（賞与計算）
   */
  async recalculateBonusCalculationHistorical(
    calculationId: string,
    recalculatedBy: string,
    reason?: string
  ): Promise<string> {
    const existingCalculation = await this.getBonusCalculation(calculationId);
    if (!existingCalculation) {
      throw new Error('計算結果が見つかりません');
    }
    
    if (existingCalculation.status !== 'confirmed' && existingCalculation.status !== 'exported') {
      throw new Error('確定済みまたは出力済みの計算結果のみ再計算できます');
    }

    // 社員情報を取得
    const employee = await this.employeeService.getEmployee(existingCalculation.employeeId);
    if (!employee) {
      throw new Error('社員情報が見つかりません');
    }

    // 再現計算（当時条件）を実行
    const newCalculation = await this.calculateEmployeeBonusPremium(
      employee,
      existingCalculation.year,
      existingCalculation.month,
      recalculatedBy,
      existingCalculation // historicalCalculationとして渡す
    );

    // 再計算前のデータを履歴に保存
    const recalculationHistory: BonusCalculationRecalculationHistory = {
      recalculatedAt: new Date(),
      recalculatedBy: recalculatedBy,
      reason: reason,
      recalculationType: 'historical',
      dataSnapshot: {
        bonusAmount: existingCalculation.bonusAmount,
        standardBonusAmount: existingCalculation.standardBonusAmount,
        healthInsurancePremium: existingCalculation.healthInsurancePremium,
        pensionInsurancePremium: existingCalculation.pensionInsurancePremium,
        totalPremium: existingCalculation.totalPremium,
        companyShare: existingCalculation.companyShare,
        employeeShare: existingCalculation.employeeShare,
        calculationDate: existingCalculation.calculationDate,
        calculatedBy: existingCalculation.calculatedBy,
        dependentInfo: existingCalculation.dependentInfo,
        healthInsuranceRate: existingCalculation.healthInsuranceRate,
        healthInsuranceRateWithCare: existingCalculation.healthInsuranceRateWithCare,
        pensionInsuranceRate: existingCalculation.pensionInsuranceRate
      }
    };

    // 既存の履歴に追加
    const existingHistory = existingCalculation.recalculationHistory || [];
    const updatedHistory = [...existingHistory, recalculationHistory];

    // 新しい計算結果で更新（ステータスは元のまま維持）
    const updates: Partial<BonusCalculation> = {
      ...newCalculation,
      status: existingCalculation.status,
      recalculationHistory: updatedHistory,
      confirmedAt: existingCalculation.confirmedAt,
      confirmedBy: existingCalculation.confirmedBy,
      exportedAt: existingCalculation.exportedAt,
      exportedBy: existingCalculation.exportedBy
    };

    return await this.updateBonusCalculation(calculationId, updates);
  }

  /**
   * 再計算（現在条件）：現在のDBデータを使用して再計算（賞与計算）
   */
  async recalculateBonusCalculation(
    calculationId: string,
    newCalculation: BonusCalculation,
    recalculatedBy: string,
    reason?: string
  ): Promise<string> {
    const existingCalculation = await this.getBonusCalculation(calculationId);
    if (!existingCalculation) {
      throw new Error('計算結果が見つかりません');
    }
    
    if (existingCalculation.status !== 'confirmed' && existingCalculation.status !== 'exported') {
      throw new Error('確定済みまたは出力済みの計算結果のみ再計算できます');
    }

    // 再計算前のデータを履歴に保存
    const recalculationHistory: BonusCalculationRecalculationHistory = {
      recalculatedAt: new Date(),
      recalculatedBy: recalculatedBy,
      reason: reason,
      recalculationType: 'current',
      dataSnapshot: {
        bonusAmount: existingCalculation.bonusAmount,
        standardBonusAmount: existingCalculation.standardBonusAmount,
        healthInsurancePremium: existingCalculation.healthInsurancePremium,
        pensionInsurancePremium: existingCalculation.pensionInsurancePremium,
        totalPremium: existingCalculation.totalPremium,
        companyShare: existingCalculation.companyShare,
        employeeShare: existingCalculation.employeeShare,
        calculationDate: existingCalculation.calculationDate,
        calculatedBy: existingCalculation.calculatedBy,
        dependentInfo: existingCalculation.dependentInfo,
        healthInsuranceRate: existingCalculation.healthInsuranceRate,
        healthInsuranceRateWithCare: existingCalculation.healthInsuranceRateWithCare,
        pensionInsuranceRate: existingCalculation.pensionInsuranceRate
      }
    };

    // 既存の履歴に追加
    const existingHistory = existingCalculation.recalculationHistory || [];
    const updatedHistory = [...existingHistory, recalculationHistory];

    // 差額計算機能は削除（コメントアウト）
    // const healthInsurancePremiumDiff = newCalculation.healthInsurancePremium - existingCalculation.healthInsurancePremium;
    // const pensionInsurancePremiumDiff = newCalculation.pensionInsurancePremium - existingCalculation.pensionInsurancePremium;
    // const companyShareDiff = newCalculation.companyShare - existingCalculation.companyShare;
    // const employeeShareDiff = newCalculation.employeeShare - existingCalculation.employeeShare;
    // const hasDifference = healthInsurancePremiumDiff !== 0 || pensionInsurancePremiumDiff !== 0 || 
    //                      companyShareDiff !== 0 || employeeShareDiff !== 0;
    // const premiumDifference: BonusPremiumDifference | undefined = hasDifference ? {
    //   previousHealthInsurancePremium: existingCalculation.healthInsurancePremium,
    //   previousPensionInsurancePremium: existingCalculation.pensionInsurancePremium,
    //   previousCompanyShare: existingCalculation.companyShare,
    //   previousEmployeeShare: existingCalculation.employeeShare,
    //   newHealthInsurancePremium: newCalculation.healthInsurancePremium,
    //   newPensionInsurancePremium: newCalculation.pensionInsurancePremium,
    //   newCompanyShare: newCalculation.companyShare,
    //   newEmployeeShare: newCalculation.employeeShare,
    //   healthInsurancePremiumDiff: healthInsurancePremiumDiff,
    //   pensionInsurancePremiumDiff: pensionInsurancePremiumDiff,
    //   companyShareDiff: companyShareDiff,
    //   employeeShareDiff: employeeShareDiff
    // } : undefined;

    // 新しい計算結果で更新（ステータスは元のまま維持）
    const updates: Partial<BonusCalculation> = {
      ...newCalculation,
      status: existingCalculation.status,
      recalculationHistory: updatedHistory,
      confirmedAt: existingCalculation.confirmedAt,
      confirmedBy: existingCalculation.confirmedBy,
      exportedAt: existingCalculation.exportedAt,
      exportedBy: existingCalculation.exportedBy
    };
    
    // 差額計算機能は削除（コメントアウト）
    // if (premiumDifference !== undefined) {
    //   updates.premiumDifference = premiumDifference;
    // }

    return await this.updateBonusCalculation(calculationId, updates);
  }

  /**
   * 賞与計算結果をexportedに変更
   */
  async markBonusAsExported(calculationId: string, exportedBy: string): Promise<void> {
    const now = new Date();
    await this.updateBonusCalculation(calculationId, {
      status: 'exported',
      exportedAt: now,
      exportedBy: exportedBy
    });
  }

  /**
   * 複数の賞与計算結果を一括でexportedに変更
   */
  async markBonusCalculationsAsExported(calculationIds: string[], exportedBy: string): Promise<void> {
    const promises = calculationIds.map(id => this.markBonusAsExported(id, exportedBy));
    await Promise.all(promises);
  }

  /**
   * FirestoreデータをBonusCalculationに変換
   */
  private convertToBonusCalculation(id: string, data: any): BonusCalculation {
    // recalculationHistoryを変換
    let recalculationHistory = data['recalculationHistory'];
    if (recalculationHistory && Array.isArray(recalculationHistory)) {
      recalculationHistory = recalculationHistory.map((hist: any) => ({
        recalculatedAt: this.convertToDate(hist.recalculatedAt) || hist.recalculatedAt,
        recalculatedBy: hist.recalculatedBy,
        reason: hist.reason,
        recalculationType: hist.recalculationType,
        dataSnapshot: hist.dataSnapshot || {}
      }));
    }

    return {
      id: id,
      organizationId: data['organizationId'],
      year: data['year'],
      month: data['month'],
      employeeId: data['employeeId'],
      employeeNumber: data['employeeNumber'],
      employeeName: data['employeeName'],
      departmentName: data['departmentName'],
      bonusAmount: data['bonusAmount'],
      standardBonusAmount: data['standardBonusAmount'],
      healthInsurancePremium: data['healthInsurancePremium'],
      pensionInsurancePremium: data['pensionInsurancePremium'],
      dependentHealthInsurancePremium: data['dependentHealthInsurancePremium'],
      dependentPensionInsurancePremium: data['dependentPensionInsurancePremium'],
      careInsurancePremium: data['careInsurancePremium'] || 0,
      totalPremium: data['totalPremium'],
      companyShare: data['companyShare'],
      employeeShare: data['employeeShare'],
      calculationDate: this.convertToDate(data['calculationDate']) || new Date(),
      calculatedBy: data['calculatedBy'],
      status: data['status'],
      notes: data['notes'],
      dependentInfo: data['dependentInfo'],
      healthInsuranceRate: data['healthInsuranceRate'],
      healthInsuranceRateWithCare: data['healthInsuranceRateWithCare'],
      pensionInsuranceRate: data['pensionInsuranceRate'],
      grade: data['grade'],
      pensionGrade: data['pensionGrade'] || null,
      birthDate: data['birthDate'] ? this.convertToDate(data['birthDate']) : undefined,
      joinDate: data['joinDate'] ? this.convertToDate(data['joinDate']) : undefined,
      recalculationHistory: recalculationHistory,
      confirmedAt: data['confirmedAt'] ? this.convertToDate(data['confirmedAt']) : undefined,
      confirmedBy: data['confirmedBy'],
      exportedAt: data['exportedAt'] ? this.convertToDate(data['exportedAt']) : undefined,
      exportedBy: data['exportedBy'],
      premiumDifference: data['premiumDifference'],
      retroactiveDeductions: data['retroactiveDeductions'],
      // 休職関連
      isOnLeave: data['isOnLeave'],
      postpaidLeaveAmount: data['postpaidLeaveAmount'],
      postpaidLeaveCompanyAmount: data['postpaidLeaveCompanyAmount'],
      postpaidLeaveAmounts: data['postpaidLeaveAmounts'],
      postpaidLeaveTotal: data['postpaidLeaveTotal'],
      postpaidLeaveCompanyTotal: data['postpaidLeaveCompanyTotal'],
      createdAt: this.convertToDate(data['createdAt']) || new Date(),
      updatedAt: this.convertToDate(data['updatedAt']) || new Date()
    } as BonusCalculation;
  }
}

