import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, Timestamp, orderBy } from '@angular/fire/firestore';
import { StandardRewardCalculation, StandardRewardCalculationRecalculationHistory } from '../models/standard-reward-calculation.model';
import { Employee, SalaryData } from '../models/employee.model';
import { InsuranceRateTable } from '../models/insurance-rate-table.model';
import { InsuranceRateTableService } from './insurance-rate-table.service';
import { EmployeeService } from './employee.service';
import { SalaryDataService } from './salary-data.service';
import { DepartmentService } from './department.service';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class StandardRewardCalculationService {
  private firestore = inject(Firestore);
  private insuranceRateTableService = inject(InsuranceRateTableService);
  private employeeService = inject(EmployeeService);
  private salaryDataService = inject(SalaryDataService);
  private departmentService = inject(DepartmentService);

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
   * 平均月額から等級を判定
   */
  private determineGradeFromAverageReward(averageReward: number, rateTables: InsuranceRateTable[]): { grade: number; pensionGrade: number; standardReward: number } | null {
    // 平均月額が標準報酬月額の範囲内にある等級を探す
    for (const table of rateTables) {
      const minOk = averageReward >= table.minAmount;
      const maxOk = table.maxAmount === 0 || table.maxAmount === null || averageReward <= table.maxAmount;
      if (minOk && maxOk) {
        return {
          grade: table.grade,
          pensionGrade: table.pensionGrade || table.grade,
          standardReward: table.standardRewardAmount
        };
      }
    }
    return null;
  }

  /**
   * 算定計算を実行
   */
  async calculateStandardReward(
    employeeId: string,
    targetYear: number,
    calculatedBy: string,
    historicalCalculation?: StandardRewardCalculation
  ): Promise<StandardRewardCalculation> {
    // 再現計算（当時条件）の場合
    if (historicalCalculation) {
      return this.calculateStandardRewardHistorical(employeeId, targetYear, calculatedBy, historicalCalculation);
    }

    // 再計算（現在条件）または通常計算の場合
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee) {
      throw new Error('社員が見つかりません');
    }

    // 6月給与が確定済みか確認
    const juneSalary = await this.salaryDataService.getSalaryData(employeeId, targetYear, 6);
    if (!juneSalary || !juneSalary.isConfirmed) {
      throw new Error(`${targetYear}年6月の給与データが確定されていません`);
    }

    // 4月、5月、6月の給与データを取得
    const aprilSalary = await this.salaryDataService.getSalaryData(employeeId, targetYear, 4);
    const maySalary = await this.salaryDataService.getSalaryData(employeeId, targetYear, 5);

    if (!aprilSalary || !maySalary || !juneSalary) {
      throw new Error('4月、5月、6月の給与データがすべて揃っていません');
    }

    // 基礎日数17日以上の月のみを集計
    const validMonths: SalaryData[] = [];
    [aprilSalary, maySalary, juneSalary].forEach(salary => {
      if (salary.baseDays >= 17) {
        validMonths.push(salary);
      }
    });

    if (validMonths.length === 0) {
      throw new Error('基礎日数17日以上の月がありません');
    }

    // 平均月額を計算（遡及支払額を考慮）
    const total = validMonths.reduce((sum, salary) => sum + salary.totalPayment, 0);
    const retroactiveTotal = validMonths.reduce((sum, salary) => sum + (salary.retroactivePayment || 0), 0);
    const adjustedTotal = total - retroactiveTotal;
    const averageReward = Math.floor(adjustedTotal / validMonths.length); // 円未満切り捨て

    // 9月時点で適用される等級表を取得
    const rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(employee.organizationId);
    const targetDate = new Date(targetYear, 8, 1); // 9月1日
    const validRateTables = rateTables.filter(table => {
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
      throw new Error(`${targetYear}年9月に適用される等級表が見つかりません`);
    }

    // 等級を決定
    const gradeResult = this.determineGradeFromAverageReward(averageReward, validRateTables);
    if (!gradeResult) {
      throw new Error(`平均月額 ${averageReward.toLocaleString()}円に対応する等級が見つかりません`);
    }

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

    const now = new Date();
    const calculation: StandardRewardCalculation = {
      organizationId: employee.organizationId,
      employeeId: employeeId,
      employeeNumber: employee.employeeNumber,
      employeeName: `${employee.lastName} ${employee.firstName}`,
      calculationType: 'standard',
      targetYear: targetYear,
      targetMonth: 7,
      baseMonths: [
        { year: targetYear, month: 4 },
        { year: targetYear, month: 5 },
        { year: targetYear, month: 6 }
      ],
      salaryData: validMonths.map(salary => ({
        year: salary.year,
        month: salary.month,
        baseDays: salary.baseDays,
        fixedSalary: salary.fixedSalary,
        totalPayment: salary.totalPayment,
        retroactivePayment: salary.retroactivePayment
      })),
      averageReward: averageReward,
      grade: gradeResult.grade,
      pensionGrade: gradeResult.pensionGrade,
      standardReward: gradeResult.standardReward,
      requiresApplication: false,
      status: 'draft',
      calculatedAt: now,
      calculatedBy: calculatedBy,
      createdAt: now,
      updatedAt: now
    };

    return calculation;
  }

  /**
   * 再現計算（当時条件）：過去の計算結果に保存されている情報を使用して計算（算定計算）
   */
  private async calculateStandardRewardHistorical(
    employeeId: string,
    targetYear: number,
    calculatedBy: string,
    historicalCalculation: StandardRewardCalculation
  ): Promise<StandardRewardCalculation> {
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee) {
      throw new Error('社員が見つかりません');
    }

    // historicalCalculationに保存されているsalaryDataを使用
    const salaryData = historicalCalculation.salaryData;
    if (!salaryData || salaryData.length === 0) {
      throw new Error('給与データが見つかりません');
    }

    // 基礎日数17日以上の月のみを集計
    const validMonths = salaryData.filter(salary => salary.baseDays >= 17);
    if (validMonths.length === 0) {
      throw new Error('基礎日数17日以上の月がありません');
    }

    // 平均月額を計算（遡及支払額を考慮）
    const total = validMonths.reduce((sum, salary) => sum + salary.totalPayment, 0);
    const retroactiveTotal = validMonths.reduce((sum, salary) => sum + (salary.retroactivePayment || 0), 0);
    const adjustedTotal = total - retroactiveTotal;
    const averageReward = Math.floor(adjustedTotal / validMonths.length); // 円未満切り捨て

    // 9月時点で適用される等級表を取得（当時の等級表）
    const rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(employee.organizationId);
    const targetDate = new Date(targetYear, 8, 1); // 9月1日
    const validRateTables = rateTables.filter(table => {
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
      throw new Error(`${targetYear}年9月に適用される等級表が見つかりません`);
    }

    // 等級を決定
    const gradeResult = this.determineGradeFromAverageReward(averageReward, validRateTables);
    if (!gradeResult) {
      throw new Error(`平均月額 ${averageReward.toLocaleString()}円に対応する等級が見つかりません`);
    }

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

    const now = new Date();
    const calculation: StandardRewardCalculation = {
      organizationId: employee.organizationId,
      employeeId: employeeId,
      employeeNumber: employee.employeeNumber,
      employeeName: `${employee.lastName} ${employee.firstName}`,
      calculationType: 'standard',
      targetYear: targetYear,
      targetMonth: 7,
      baseMonths: historicalCalculation.baseMonths || [
        { year: targetYear, month: 4 },
        { year: targetYear, month: 5 },
        { year: targetYear, month: 6 }
      ],
      salaryData: salaryData,
      averageReward: averageReward,
      grade: gradeResult.grade,
      pensionGrade: gradeResult.pensionGrade,
      standardReward: gradeResult.standardReward,
      requiresApplication: false,
      status: 'draft',
      calculatedAt: now,
      calculatedBy: calculatedBy,
      createdAt: now,
      updatedAt: now
    };

    return calculation;
  }

  /**
   * 固定賃金の変動を検出
   */
  async detectFixedSalaryChanges(employeeId: string, year: number, month: number): Promise<{ year: number; month: number }[]> {
    const changeMonths: { year: number; month: number }[] = [];
    
    // 指定月から遡って変動を検出
    let currentYear = year;
    let currentMonth = month;
    let previousFixedSalary: number | null = null;

    // 最大12か月分をチェック
    for (let i = 0; i < 12; i++) {
      const salary = await this.salaryDataService.getSalaryData(employeeId, currentYear, currentMonth);
      
      if (salary && salary.isConfirmed) {
        if (previousFixedSalary !== null && salary.fixedSalary !== previousFixedSalary) {
          // 1円でも変動があれば検出
          changeMonths.push({ year: currentYear, month: currentMonth });
        }
        previousFixedSalary = salary.fixedSalary;
      }

      // 前月に遡る
      currentMonth--;
      if (currentMonth < 1) {
        currentMonth = 12;
        currentYear--;
      }
    }

    return changeMonths.reverse(); // 古い順に並べる
  }

  /**
   * 月変計算を実行
   */
  async calculateMonthlyChange(
    employeeId: string,
    changeYear: number,
    changeMonth: number,
    calculatedBy: string,
    historicalCalculation?: StandardRewardCalculation
  ): Promise<StandardRewardCalculation> {
    // 再現計算（当時条件）の場合
    if (historicalCalculation) {
      return this.calculateMonthlyChangeHistorical(employeeId, changeYear, changeMonth, calculatedBy, historicalCalculation);
    }

    // 再計算（現在条件）または通常計算の場合
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee) {
      throw new Error('社員が見つかりません');
    }

    // 変動月を含む3か月目の給与が確定済みか確認
    let calculationYear = changeYear;
    let calculationMonth = changeMonth + 2;
    if (calculationMonth > 12) {
      calculationMonth -= 12;
      calculationYear++;
    }

    const thirdMonthSalary = await this.salaryDataService.getSalaryData(employeeId, calculationYear, calculationMonth);
    if (!thirdMonthSalary || !thirdMonthSalary.isConfirmed) {
      throw new Error(`${calculationYear}年${calculationMonth}月の給与データが確定されていません`);
    }

    // 変動月を含む3か月の給与データを取得
    const salaries: SalaryData[] = [];
    let currentYear = changeYear;
    let currentMonth = changeMonth;
    
    for (let i = 0; i < 3; i++) {
      const salary = await this.salaryDataService.getSalaryData(employeeId, currentYear, currentMonth);
      if (!salary) {
        throw new Error(`${currentYear}年${currentMonth}月の給与データが見つかりません`);
      }
      salaries.push(salary);
      
      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }

    // 基礎日数17日以上の月が3か月連続であることを確認
    const validMonths = salaries.filter(salary => salary.baseDays >= 17);
    if (validMonths.length < 3) {
      throw new Error('固定賃金変動月を含む3か月間で基礎日数17日以上を満たす月が不足しています');
    }

    // 平均月額を計算（遡及支払額を考慮）
    const total = validMonths.reduce((sum, salary) => sum + salary.totalPayment, 0);
    const retroactiveTotal = validMonths.reduce((sum, salary) => sum + (salary.retroactivePayment || 0), 0);
    const adjustedTotal = total - retroactiveTotal;
    const averageReward = Math.floor(adjustedTotal / validMonths.length); // 円未満切り捨て

    // 変動月から4か月目時点で適用される等級表を取得
    const rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(employee.organizationId);
    let targetDateYear = changeYear;
    let targetDateMonth = changeMonth + 3;
    if (targetDateMonth > 12) {
      targetDateMonth -= 12;
      targetDateYear++;
    }
    const targetDate = new Date(targetDateYear, targetDateMonth - 1, 1);
    
    const validRateTables = rateTables.filter(table => {
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
      throw new Error(`${targetDateYear}年${targetDateMonth}月に適用される等級表が見つかりません`);
    }

    // 等級を決定
    const gradeResult = this.determineGradeFromAverageReward(averageReward, validRateTables);
    if (!gradeResult) {
      throw new Error(`平均月額 ${averageReward.toLocaleString()}円に対応する等級が見つかりません`);
    }

    // 従前の等級を取得
    const previousGrade = employee.insuranceInfo?.grade || null;
    const previousPensionGrade = employee.insuranceInfo?.pensionGrade || null;
    const gradeChange = previousGrade !== null ? Math.abs(gradeResult.grade - previousGrade) : 0;
    
    // 申請対象判定（修正16）
    let requiresApplication = false;
    
    // 基礎日数不足チェック：3か月すべてで17日以上を満たすか（既にチェック済みだが、エラーではなく申請対象外として扱う）
    const allMonthsHaveEnoughBaseDays = validMonths.length === 3;
    
    if (allMonthsHaveEnoughBaseDays && gradeChange >= 2) {
      // 等級変動が2等級以上の場合、さらに組み合わせチェック
      requiresApplication = true;
      
      // 従前等級から従前の平均額を推定（等級表から標準報酬月額の規定値を使用）
      if (previousGrade !== null) {
        const previousRateTable = validRateTables.find(table => table.grade === previousGrade);
        if (previousRateTable) {
          // 従前等級の標準報酬月額の規定値を使用
          const previousStandardReward = previousRateTable.standardRewardAmount;
          
          // 2等級上昇かつ平均額減少、または2等級下降かつ平均額上昇の場合は申請対象外
          const isGradeUp = gradeResult.grade > previousGrade;
          const isAverageDecrease = averageReward < previousStandardReward;
          const isGradeDown = gradeResult.grade < previousGrade;
          const isAverageIncrease = averageReward > previousStandardReward;
          
          if ((isGradeUp && isAverageDecrease) || (isGradeDown && isAverageIncrease)) {
            requiresApplication = false;
          }
        }
      }
    }

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

    const now = new Date();
    const calculation: StandardRewardCalculation = {
      organizationId: employee.organizationId,
      employeeId: employeeId,
      employeeNumber: employee.employeeNumber,
      employeeName: `${employee.lastName} ${employee.firstName}`,
      calculationType: 'monthly_change',
      targetYear: changeYear,
      targetMonth: changeMonth,
      changeMonth: { year: changeYear, month: changeMonth },
      calculationMonths: salaries.map(salary => ({ year: salary.year, month: salary.month })),
      salaryData: validMonths.map(salary => ({
        year: salary.year,
        month: salary.month,
        baseDays: salary.baseDays,
        fixedSalary: salary.fixedSalary,
        totalPayment: salary.totalPayment,
        retroactivePayment: salary.retroactivePayment
      })),
      averageReward: averageReward,
      grade: gradeResult.grade,
      pensionGrade: gradeResult.pensionGrade,
      standardReward: gradeResult.standardReward,
      previousGrade: previousGrade || undefined,
      previousPensionGrade: previousPensionGrade || undefined,
      gradeChange: gradeChange,
      requiresApplication: requiresApplication,
      status: 'draft',
      calculatedAt: now,
      calculatedBy: calculatedBy,
      createdAt: now,
      updatedAt: now
    };

    return calculation;
  }

  /**
   * 再現計算（当時条件）：過去の計算結果に保存されている情報を使用して計算（月変計算）
   */
  private async calculateMonthlyChangeHistorical(
    employeeId: string,
    changeYear: number,
    changeMonth: number,
    calculatedBy: string,
    historicalCalculation: StandardRewardCalculation
  ): Promise<StandardRewardCalculation> {
    const employee = await this.employeeService.getEmployee(employeeId);
    if (!employee) {
      throw new Error('社員が見つかりません');
    }

    // historicalCalculationに保存されているsalaryDataを使用
    const salaryData = historicalCalculation.salaryData;
    if (!salaryData || salaryData.length === 0) {
      throw new Error('給与データが見つかりません');
    }

    // 基礎日数17日以上の月が3か月連続であることを確認
    const validMonths = salaryData.filter(salary => salary.baseDays >= 17);
    if (validMonths.length < 3) {
      throw new Error('固定賃金変動月を含む3か月間で基礎日数17日以上を満たす月が不足しています');
    }

    // 平均月額を計算（遡及支払額を考慮）
    const total = validMonths.reduce((sum, salary) => sum + salary.totalPayment, 0);
    const retroactiveTotal = validMonths.reduce((sum, salary) => sum + (salary.retroactivePayment || 0), 0);
    const adjustedTotal = total - retroactiveTotal;
    const averageReward = Math.floor(adjustedTotal / validMonths.length); // 円未満切り捨て

    // 変動月から4か月目時点で適用される等級表を取得（当時の等級表）
    const rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(employee.organizationId);
    let targetDateYear = changeYear;
    let targetDateMonth = changeMonth + 3;
    if (targetDateMonth > 12) {
      targetDateMonth -= 12;
      targetDateYear++;
    }
    const targetDate = new Date(targetDateYear, targetDateMonth - 1, 1);
    
    const validRateTables = rateTables.filter(table => {
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
      throw new Error(`${targetDateYear}年${targetDateMonth}月に適用される等級表が見つかりません`);
    }

    // 等級を決定
    const gradeResult = this.determineGradeFromAverageReward(averageReward, validRateTables);
    if (!gradeResult) {
      throw new Error(`平均月額 ${averageReward.toLocaleString()}円に対応する等級が見つかりません`);
    }

    // 従前の等級を取得（historicalCalculationから）
    const previousGrade = historicalCalculation.previousGrade ?? null;
    const previousPensionGrade = historicalCalculation.previousPensionGrade ?? null;
    const gradeChange = previousGrade !== null ? Math.abs(gradeResult.grade - previousGrade) : 0;
    
    // 申請対象判定（修正16）
    let requiresApplication = false;
    
    // 基礎日数不足チェック：3か月すべてで17日以上を満たすか
    const allMonthsHaveEnoughBaseDays = validMonths.length === 3;
    
    if (allMonthsHaveEnoughBaseDays && gradeChange >= 2) {
      // 等級変動が2等級以上の場合、さらに組み合わせチェック
      requiresApplication = true;
      
      // 従前等級から従前の平均額を推定（等級表から標準報酬月額の規定値を使用）
      if (previousGrade !== null) {
        const previousRateTable = validRateTables.find(table => table.grade === previousGrade);
        if (previousRateTable) {
          // 従前等級の標準報酬月額の規定値を使用
          const previousStandardReward = previousRateTable.standardRewardAmount;
          
          // 2等級上昇かつ平均額減少、または2等級下降かつ平均額上昇の場合は申請対象外
          const isGradeUp = gradeResult.grade > previousGrade;
          const isAverageDecrease = averageReward < previousStandardReward;
          const isGradeDown = gradeResult.grade < previousGrade;
          const isAverageIncrease = averageReward > previousStandardReward;
          
          if ((isGradeUp && isAverageDecrease) || (isGradeDown && isAverageIncrease)) {
            requiresApplication = false;
          }
        }
      }
    }

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

    const now = new Date();
    const calculation: StandardRewardCalculation = {
      organizationId: employee.organizationId,
      employeeId: employeeId,
      employeeNumber: employee.employeeNumber,
      employeeName: `${employee.lastName} ${employee.firstName}`,
      calculationType: 'monthly_change',
      targetYear: changeYear,
      targetMonth: changeMonth,
      changeMonth: historicalCalculation.changeMonth || { year: changeYear, month: changeMonth },
      calculationMonths: historicalCalculation.calculationMonths || salaryData.map(salary => ({ year: salary.year, month: salary.month })),
      salaryData: salaryData,
      averageReward: averageReward,
      grade: gradeResult.grade,
      pensionGrade: gradeResult.pensionGrade,
      standardReward: gradeResult.standardReward,
      previousGrade: previousGrade ?? undefined,
      previousPensionGrade: previousPensionGrade ?? undefined,
      gradeChange: gradeChange,
      requiresApplication: requiresApplication,
      status: 'draft',
      calculatedAt: now,
      calculatedBy: calculatedBy,
      createdAt: now,
      updatedAt: now
    };

    return calculation;
  }

  /**
   * 計算履歴を保存
   */
  async saveCalculation(calculation: StandardRewardCalculation): Promise<string> {
    const calculationRef = doc(collection(this.firestore, `${environment.firestorePrefix}standardRewardCalculations`));
    const now = new Date();

    const calculationData: any = {
      organizationId: calculation.organizationId,
      employeeId: calculation.employeeId,
      employeeNumber: calculation.employeeNumber,
      employeeName: calculation.employeeName,
      calculationType: calculation.calculationType,
      targetYear: calculation.targetYear,
      targetMonth: calculation.targetMonth,
      salaryData: calculation.salaryData,
      averageReward: calculation.averageReward,
      grade: calculation.grade,
      pensionGrade: calculation.pensionGrade,
      standardReward: calculation.standardReward,
      requiresApplication: calculation.requiresApplication,
      status: calculation.status,
      calculatedAt: calculation.calculatedAt,
      calculatedBy: calculation.calculatedBy,
      createdAt: now,
      updatedAt: now
    };

    if (calculation.baseMonths) {
      calculationData.baseMonths = calculation.baseMonths;
    }
    if (calculation.changeMonth) {
      calculationData.changeMonth = calculation.changeMonth;
    }
    if (calculation.calculationMonths) {
      calculationData.calculationMonths = calculation.calculationMonths;
    }
    if (calculation.previousGrade !== undefined) {
      calculationData.previousGrade = calculation.previousGrade;
    }
    if (calculation.previousPensionGrade !== undefined) {
      calculationData.previousPensionGrade = calculation.previousPensionGrade;
    }
    if (calculation.gradeChange !== undefined) {
      calculationData.gradeChange = calculation.gradeChange;
    }
    if (calculation.applicationId) {
      calculationData.applicationId = calculation.applicationId;
    }
    if (calculation.recalculationHistory) {
      calculationData.recalculationHistory = calculation.recalculationHistory;
    }

    await setDoc(calculationRef, calculationData);
    return calculationRef.id;
  }

  /**
   * 計算履歴を取得
   */
  async getCalculation(calculationId: string): Promise<StandardRewardCalculation | null> {
    const calculationRef = doc(this.firestore, `${environment.firestorePrefix}standardRewardCalculations`, calculationId);
    const calculationSnap = await getDoc(calculationRef);
    
    if (!calculationSnap.exists()) {
      return null;
    }

    return this.convertToCalculation(calculationSnap.id, calculationSnap.data());
  }

  /**
   * 社員の計算履歴一覧を取得
   */
  async getCalculationsByEmployee(employeeId: string, calculationType?: 'standard' | 'monthly_change'): Promise<StandardRewardCalculation[]> {
    let q = query(
      collection(this.firestore, `${environment.firestorePrefix}standardRewardCalculations`),
      where('employeeId', '==', employeeId),
      orderBy('calculatedAt', 'desc')
    );

    if (calculationType) {
      q = query(q, where('calculationType', '==', calculationType));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.convertToCalculation(doc.id, doc.data()));
  }

  /**
   * 組織の計算履歴一覧を取得
   */
  async getCalculationsByOrganization(organizationId: string, calculationType?: 'standard' | 'monthly_change', targetYear?: number): Promise<StandardRewardCalculation[]> {
    let q = query(
      collection(this.firestore, `${environment.firestorePrefix}standardRewardCalculations`),
      where('organizationId', '==', organizationId),
      orderBy('calculatedAt', 'desc')
    );

    if (calculationType) {
      q = query(q, where('calculationType', '==', calculationType));
    }
    if (targetYear) {
      q = query(q, where('targetYear', '==', targetYear));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.convertToCalculation(doc.id, doc.data()));
  }

  /**
   * 計算履歴を再計算（履歴に保存）
   */
  /**
   * 再現計算（当時条件）：過去の計算結果に保存されている情報を使用して再計算
   */
  async recalculateCalculationHistorical(calculationId: string, calculatedBy: string, reason?: string): Promise<StandardRewardCalculation> {
    const existingCalculation = await this.getCalculation(calculationId);
    if (!existingCalculation) {
      throw new Error('計算履歴が見つかりません');
    }

    // 再計算前のデータをスナップショットとして保存
    const snapshot: StandardRewardCalculationRecalculationHistory = {
      recalculatedAt: new Date(),
      recalculatedBy: calculatedBy,
      reason: reason,
      recalculationType: 'historical',
      dataSnapshot: { ...existingCalculation }
    };

    existingCalculation.recalculationHistory = existingCalculation.recalculationHistory || [];
    existingCalculation.recalculationHistory.push(snapshot);

    // 再現計算（当時条件）を実行
    let newCalculation: StandardRewardCalculation;
    if (existingCalculation.calculationType === 'standard') {
      newCalculation = await this.calculateStandardReward(existingCalculation.employeeId, existingCalculation.targetYear, calculatedBy, existingCalculation);
    } else {
      if (!existingCalculation.changeMonth) {
        throw new Error('変動月情報が見つかりません');
      }
      newCalculation = await this.calculateMonthlyChange(
        existingCalculation.employeeId,
        existingCalculation.changeMonth.year,
        existingCalculation.changeMonth.month,
        calculatedBy,
        existingCalculation
      );
    }

    // 再計算履歴を引き継ぐ
    newCalculation.recalculationHistory = existingCalculation.recalculationHistory;
    newCalculation.id = calculationId;

    // 更新
    await this.updateCalculation(calculationId, newCalculation);

    return newCalculation;
  }

  /**
   * 再計算（現在条件）：現在のDBデータを使用して再計算
   */
  async recalculateCalculation(calculationId: string, calculatedBy: string, reason?: string): Promise<StandardRewardCalculation> {
    const existingCalculation = await this.getCalculation(calculationId);
    if (!existingCalculation) {
      throw new Error('計算履歴が見つかりません');
    }

    // 再計算前のデータをスナップショットとして保存
    const snapshot: StandardRewardCalculationRecalculationHistory = {
      recalculatedAt: new Date(),
      recalculatedBy: calculatedBy,
      reason: reason,
      recalculationType: 'current',
      dataSnapshot: { ...existingCalculation }
    };

    existingCalculation.recalculationHistory = existingCalculation.recalculationHistory || [];
    existingCalculation.recalculationHistory.push(snapshot);

    // 再計算（現在条件）を実行（historicalCalculationを渡さない）
    let newCalculation: StandardRewardCalculation;
    if (existingCalculation.calculationType === 'standard') {
      newCalculation = await this.calculateStandardReward(existingCalculation.employeeId, existingCalculation.targetYear, calculatedBy);
    } else {
      if (!existingCalculation.changeMonth) {
        throw new Error('変動月情報が見つかりません');
      }
      newCalculation = await this.calculateMonthlyChange(
        existingCalculation.employeeId,
        existingCalculation.changeMonth.year,
        existingCalculation.changeMonth.month,
        calculatedBy
      );
    }

    // 再計算履歴を引き継ぐ
    newCalculation.recalculationHistory = existingCalculation.recalculationHistory;
    newCalculation.id = calculationId;

    // 更新
    await this.updateCalculation(calculationId, newCalculation);

    return newCalculation;
  }

  /**
   * 計算履歴を更新
   */
  async updateCalculation(calculationId: string, calculation: Partial<StandardRewardCalculation>): Promise<void> {
    const calculationRef = doc(this.firestore, `${environment.firestorePrefix}standardRewardCalculations`, calculationId);
    const updateData: any = {
      updatedAt: new Date()
    };

    Object.keys(calculation).forEach(key => {
      if (key !== 'id' && calculation[key as keyof StandardRewardCalculation] !== undefined) {
        updateData[key] = calculation[key as keyof StandardRewardCalculation];
      }
    });

    await updateDoc(calculationRef, updateData);
  }

  /**
   * 計算履歴を一括確定（draft → confirmed）
   */
  async confirmCalculations(calculationIds: string[], confirmedBy: string): Promise<void> {
    const now = new Date();
    
    for (const calculationId of calculationIds) {
      const calculationRef = doc(this.firestore, `${environment.firestorePrefix}standardRewardCalculations`, calculationId);
      await updateDoc(calculationRef, {
        status: 'confirmed',
        updatedAt: now
      });
    }
  }

  /**
   * 計算結果を確定する（draft → confirmed）
   */
  async confirmCalculation(calculationId: string, confirmedBy: string): Promise<void> {
    const calculation = await this.getCalculation(calculationId);
    if (!calculation) {
      throw new Error('計算結果が見つかりません');
    }
    
    if (calculation.status !== 'draft') {
      throw new Error('下書きの計算結果のみ確定できます');
    }
    
    const now = new Date();
    const calculationRef = doc(this.firestore, `${environment.firestorePrefix}standardRewardCalculations`, calculationId);
    await updateDoc(calculationRef, {
      status: 'confirmed',
      updatedAt: now
    });
  }

  /**
   * 計算結果のステータスを変更する（confirmed ↔ applied ↔ approved）
   */
  async changeStatus(calculationId: string, newStatus: 'applied' | 'approved', changedBy: string): Promise<void> {
    const calculation = await this.getCalculation(calculationId);
    if (!calculation) {
      throw new Error('計算結果が見つかりません');
    }
    
    if (calculation.status === 'draft') {
      throw new Error('下書きの計算結果はステータス変更できません。まず確定してください。');
    }
    
    if (calculation.status === newStatus) {
      throw new Error('ステータスが変更されていません');
    }
    
    const now = new Date();
    const calculationRef = doc(this.firestore, `${environment.firestorePrefix}standardRewardCalculations`, calculationId);
    await updateDoc(calculationRef, {
      status: newStatus,
      updatedAt: now
    });
  }

  /**
   * 計算結果のステータスを一括変更する（confirmed ↔ applied ↔ approved）
   */
  async changeStatuses(calculationIds: string[], newStatus: 'applied' | 'approved', changedBy: string): Promise<void> {
    if (calculationIds.length === 0) {
      return;
    }

    const now = new Date();
    
    for (const calculationId of calculationIds) {
      const calculation = await this.getCalculation(calculationId);
      if (!calculation) {
        console.warn(`計算結果が見つかりません: ${calculationId}`);
        continue;
      }
      
      if (calculation.status === 'draft') {
        console.warn(`下書きの計算結果はステータス変更できません: ${calculationId}`);
        continue;
      }
      
      if (calculation.status === newStatus) {
        continue; // 既に同じステータスの場合はスキップ
      }
      
      const calculationRef = doc(this.firestore, `${environment.firestorePrefix}standardRewardCalculations`, calculationId);
      await updateDoc(calculationRef, {
        status: newStatus,
        updatedAt: now
      });
    }
  }

  /**
   * 計算結果を削除（draftのみ削除可能）
   */
  async deleteCalculation(calculationId: string): Promise<void> {
    const calculation = await this.getCalculation(calculationId);
    if (!calculation) {
      throw new Error('計算結果が見つかりません');
    }
    
    // confirmed、applied、またはapprovedは削除不可
    if (calculation.status === 'confirmed' || calculation.status === 'applied' || calculation.status === 'approved') {
      throw new Error('確定済み、申請済み、または承認済みの計算結果は削除できません');
    }
    
    const calcRef = doc(this.firestore, `${environment.firestorePrefix}standardRewardCalculations`, calculationId);
    await deleteDoc(calcRef);
  }

  /**
   * FirestoreデータをStandardRewardCalculationに変換
   */
  private convertToCalculation(id: string, data: any): StandardRewardCalculation {
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
      employeeId: data['employeeId'],
      employeeNumber: data['employeeNumber'],
      employeeName: data['employeeName'],
      calculationType: data['calculationType'],
      targetYear: data['targetYear'],
      targetMonth: data['targetMonth'],
      baseMonths: data['baseMonths'],
      changeMonth: data['changeMonth'],
      calculationMonths: data['calculationMonths'],
      salaryData: data['salaryData'] || [],
      averageReward: data['averageReward'],
      grade: data['grade'],
      pensionGrade: data['pensionGrade'],
      standardReward: data['standardReward'],
      previousGrade: data['previousGrade'],
      previousPensionGrade: data['previousPensionGrade'],
      gradeChange: data['gradeChange'],
      requiresApplication: data['requiresApplication'],
      status: data['status'],
      applicationId: data['applicationId'],
      recalculationHistory: recalculationHistory,
      calculatedAt: this.convertToDate(data['calculatedAt']) || new Date(),
      calculatedBy: data['calculatedBy'],
      createdAt: this.convertToDate(data['createdAt']) || new Date(),
      updatedAt: this.convertToDate(data['updatedAt']) || new Date()
    } as StandardRewardCalculation;
  }
}

