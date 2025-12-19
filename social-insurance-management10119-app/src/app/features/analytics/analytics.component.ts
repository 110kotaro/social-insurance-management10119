import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/auth/auth.service';
import { CalculationService } from '../../core/services/calculation.service';
import { StandardRewardCalculationService } from '../../core/services/standard-reward-calculation.service';
import { DepartmentService } from '../../core/services/department.service';
import { EmployeeService } from '../../core/services/employee.service';
import { MonthlyCalculation } from '../../core/models/monthly-calculation.model';
import { BonusCalculation } from '../../core/models/bonus-calculation.model';
import { StandardRewardCalculation } from '../../core/models/standard-reward-calculation.model';
import { Department } from '../../core/models/department.model';
import { Employee } from '../../core/models/employee.model';

interface EmployeeSummary {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  departmentName: string;
  employeeShare: number;
  companyShare: number;
  totalPremium: number;
}

interface DepartmentSummary {
  departmentId: string;
  departmentName: string;
  employeeCount: number;
  employeeShare: number;
  companyShare: number;
  totalPremium: number;
}

interface MonthlyTrend {
  year: number;
  month: number;
  employeeShare: number;
  companyShare: number;
  totalPremium: number;
}

/* 算定・月変の影響確認用インターフェース（後で追加する可能性があるためコメントアウト）
interface StandardRewardImpact {
  calculationId: string;
  employeeId: string;
  employeeName: string;
  targetYear: number;
  previousStandardReward: number;
  newStandardReward: number;
  standardRewardDiff: number;
  previousCompanyShare: number;
  newCompanyShare: number;
  companyShareDiff: number;
}
*/

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTabsModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.css'
})
export class AnalyticsComponent implements OnInit {
  private authService = inject(AuthService);
  private calculationService = inject(CalculationService);
  private standardRewardCalculationService = inject(StandardRewardCalculationService);
  private departmentService = inject(DepartmentService);
  private employeeService = inject(EmployeeService);
  private snackBar = inject(MatSnackBar);

  organizationId: string | null = null;
  isLoading = false;

  // 選択年月
  selectedYear: number = new Date().getFullYear();
  selectedMonth: number = new Date().getMonth() + 1;
  years: number[] = [];
  months: number[] = Array.from({ length: 12 }, (_, i) => i + 1);

  // 保険料集計データ
  employeeSummaries: EmployeeSummary[] = [];
  departmentSummaries: DepartmentSummary[] = [];
  companyTotal: { employeeShare: number; companyShare: number; totalPremium: number } = {
    employeeShare: 0,
    companyShare: 0,
    totalPremium: 0
  };

  // 月次推移データ
  monthlyTrends: MonthlyTrend[] = [];
  selectedTrendYear: number = new Date().getFullYear();
  trendYears: number[] = [];

  /* 算定・月変の影響確認データ（後で追加する可能性があるためコメントアウト）
  standardRewardImpacts: StandardRewardImpact[] = [];
  monthlyChangeImpacts: StandardRewardImpact[] = [];
  selectedImpactYear: number = new Date().getFullYear();
  impactYears: number[] = [];
  */

  // テーブル用
  employeeDataSource = new MatTableDataSource<EmployeeSummary>([]);
  departmentDataSource = new MatTableDataSource<DepartmentSummary>([]);
  trendDataSource = new MatTableDataSource<MonthlyTrend>([]);
  /* 算定・月変の影響確認用テーブル（後で追加する可能性があるためコメントアウト）
  standardRewardImpactDataSource = new MatTableDataSource<StandardRewardImpact>([]);
  monthlyChangeImpactDataSource = new MatTableDataSource<StandardRewardImpact>([]);
  */

  employeeDisplayedColumns: string[] = ['employeeNumber', 'employeeName', 'departmentName', 'employeeShare', 'companyShare', 'totalPremium'];
  departmentDisplayedColumns: string[] = ['departmentName', 'employeeCount', 'employeeShare', 'companyShare', 'totalPremium'];
  trendDisplayedColumns: string[] = ['period', 'employeeShare', 'companyShare', 'totalPremium'];
  /* 算定・月変の影響確認用カラム（後で追加する可能性があるためコメントアウト）
  impactDisplayedColumns: string[] = ['employeeName', 'previousStandardReward', 'newStandardReward', 'standardRewardDiff', 'previousCompanyShare', 'newCompanyShare', 'companyShareDiff'];
  */

  selectedTabIndex = 0;

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.organizationId) {
      this.organizationId = currentUser.organizationId;
      this.initializeYears();
      this.loadData();
    }
  }

  initializeYears(): void {
    const currentYear = new Date().getFullYear();
    // 過去3年から未来1年まで
    this.years = Array.from({ length: 5 }, (_, i) => currentYear - 3 + i);
    this.trendYears = [...this.years];
    /* 算定・月変の影響確認用（後で追加する可能性があるためコメントアウト）
    this.impactYears = [...this.years];
    */
  }

  async loadData(): Promise<void> {
    if (!this.organizationId) {
      return;
    }

    this.isLoading = true;
    try {
      await Promise.all([
        this.loadPremiumSummary(),
        this.loadMonthlyTrends()
        /* 算定・月変の影響確認（後で追加する可能性があるためコメントアウト）
        , this.loadStandardRewardImpacts()
        */
      ]);
    } catch (error) {
      console.error('データの読み込みに失敗しました:', error);
      this.snackBar.open('データの読み込みに失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 保険料集計を読み込み（月次と賞与の両方を含む）
   */
  async loadPremiumSummary(): Promise<void> {
    if (!this.organizationId) {
      return;
    }

    // 月次計算結果を取得
    const monthlyCalculations = await this.calculationService.getCalculationsByMonth(
      this.organizationId,
      this.selectedYear,
      this.selectedMonth
    );

    // 賞与計算結果を取得
    const bonusCalculations = await this.calculationService.getBonusCalculationsByMonth(
      this.organizationId,
      this.selectedYear,
      this.selectedMonth
    );

    // 確定済みまたは出力済みの計算結果のみを集計
    const confirmedMonthlyCalculations = monthlyCalculations.filter(calc => 
      calc.status === 'confirmed' || calc.status === 'exported'
    );

    const confirmedBonusCalculations = bonusCalculations.filter(calc => 
      calc.status === 'confirmed' || calc.status === 'exported'
    );

    // 社員別集計（月次と賞与を統合）
    const employeeMap = new Map<string, EmployeeSummary>();
    
    // 月次計算結果を処理
    for (const calc of confirmedMonthlyCalculations) {
      if (!calc.employeeId) continue;

      const existing = employeeMap.get(calc.employeeId);
      if (existing) {
        existing.employeeShare += calc.employeeShare || 0;
        existing.companyShare += calc.companyShare || 0;
        existing.totalPremium += calc.totalPremium || 0;
      } else {
        employeeMap.set(calc.employeeId, {
          employeeId: calc.employeeId,
          employeeNumber: calc.employeeNumber || '',
          employeeName: calc.employeeName || '',
          departmentName: calc.departmentName || '',
          employeeShare: calc.employeeShare || 0,
          companyShare: calc.companyShare || 0,
          totalPremium: calc.totalPremium || 0
        });
      }
    }

    // 賞与計算結果を処理（同じ社員IDで合算）
    for (const calc of confirmedBonusCalculations) {
      if (!calc.employeeId) continue;

      const existing = employeeMap.get(calc.employeeId);
      if (existing) {
        existing.employeeShare += calc.employeeShare || 0;
        existing.companyShare += calc.companyShare || 0;
        existing.totalPremium += calc.totalPremium || 0;
        // 部署名が月次にない場合は賞与から取得
        if (!existing.departmentName && calc.departmentName) {
          existing.departmentName = calc.departmentName;
        }
      } else {
        employeeMap.set(calc.employeeId, {
          employeeId: calc.employeeId,
          employeeNumber: calc.employeeNumber || '',
          employeeName: calc.employeeName || '',
          departmentName: calc.departmentName || '',
          employeeShare: calc.employeeShare || 0,
          companyShare: calc.companyShare || 0,
          totalPremium: calc.totalPremium || 0
        });
      }
    }

    this.employeeSummaries = Array.from(employeeMap.values()).sort((a, b) => 
      a.employeeNumber.localeCompare(b.employeeNumber)
    );
    this.employeeDataSource.data = this.employeeSummaries;

    // 部署別集計
    const departmentMap = new Map<string, DepartmentSummary>();
    for (const summary of this.employeeSummaries) {
      const deptName = summary.departmentName || '未設定';
      const existing = departmentMap.get(deptName);
      if (existing) {
        existing.employeeCount++;
        existing.employeeShare += summary.employeeShare;
        existing.companyShare += summary.companyShare;
        existing.totalPremium += summary.totalPremium;
      } else {
        departmentMap.set(deptName, {
          departmentId: '',
          departmentName: deptName,
          employeeCount: 1,
          employeeShare: summary.employeeShare,
          companyShare: summary.companyShare,
          totalPremium: summary.totalPremium
        });
      }
    }

    this.departmentSummaries = Array.from(departmentMap.values()).sort((a, b) => 
      a.departmentName.localeCompare(b.departmentName)
    );
    this.departmentDataSource.data = this.departmentSummaries;

    // 会社全体集計
    this.companyTotal = {
      employeeShare: this.employeeSummaries.reduce((sum, s) => sum + s.employeeShare, 0),
      companyShare: this.employeeSummaries.reduce((sum, s) => sum + s.companyShare, 0),
      totalPremium: this.employeeSummaries.reduce((sum, s) => sum + s.totalPremium, 0)
    };
  }

  /**
   * 月次推移を読み込み（月次と賞与の両方を含む）
   */
  async loadMonthlyTrends(): Promise<void> {
    if (!this.organizationId) {
      return;
    }

    const trends: MonthlyTrend[] = [];
    
    // 選択年の1月から12月まで
    for (let month = 1; month <= 12; month++) {
      // 月次計算結果を取得
      const monthlyCalculations = await this.calculationService.getCalculationsByMonth(
        this.organizationId,
        this.selectedTrendYear,
        month
      );

      // 賞与計算結果を取得
      const bonusCalculations = await this.calculationService.getBonusCalculationsByMonth(
        this.organizationId,
        this.selectedTrendYear,
        month
      );

      // 確定済みまたは出力済みの計算結果のみを集計
      const confirmedMonthlyCalculations = monthlyCalculations.filter(calc => 
        calc.status === 'confirmed' || calc.status === 'exported'
      );

      const confirmedBonusCalculations = bonusCalculations.filter(calc => 
        calc.status === 'confirmed' || calc.status === 'exported'
      );

      // 月次と賞与を合算
      const employeeShare = confirmedMonthlyCalculations.reduce((sum, calc) => sum + (calc.employeeShare || 0), 0) +
                           confirmedBonusCalculations.reduce((sum, calc) => sum + (calc.employeeShare || 0), 0);
      const companyShare = confirmedMonthlyCalculations.reduce((sum, calc) => sum + (calc.companyShare || 0), 0) +
                           confirmedBonusCalculations.reduce((sum, calc) => sum + (calc.companyShare || 0), 0);
      const totalPremium = confirmedMonthlyCalculations.reduce((sum, calc) => sum + (calc.totalPremium || 0), 0) +
                           confirmedBonusCalculations.reduce((sum, calc) => sum + (calc.totalPremium || 0), 0);

      trends.push({
        year: this.selectedTrendYear,
        month,
        employeeShare,
        companyShare,
        totalPremium
      });
    }

    this.monthlyTrends = trends;
    this.trendDataSource.data = trends;
  }

  /* 算定・月変の影響確認を読み込み（後で追加する可能性があるためコメントアウト）
  async loadStandardRewardImpacts(): Promise<void> {
    if (!this.organizationId) {
      return;
    }

    // 算定計算の影響確認
    const standardCalculations = await this.standardRewardCalculationService.getCalculationsByOrganization(
      this.organizationId,
      'standard',
      this.selectedImpactYear
    );

    const standardImpacts: StandardRewardImpact[] = [];
    for (const calc of standardCalculations) {
      if (!calc.employeeId) continue;

      const employee = await this.employeeService.getEmployee(calc.employeeId);
      if (!employee) continue;

      // 算定前の標準報酬を取得（前年の9月時点の計算結果から）
      const previousYear = calc.targetYear - 1;
      const previousCalculation = await this.calculationService.getCalculationsByEmployee(
        calc.employeeId,
        previousYear,
        9
      );

      const previousStandardReward = previousCalculation?.standardReward || 0;
      const newStandardReward = calc.standardReward || 0;
      const standardRewardDiff = newStandardReward - previousStandardReward;

      if (standardRewardDiff !== 0) {
        // 保険料の増減を計算（前年の9月と算定後の7月の計算結果を比較）
        const previousCompanyShare = previousCalculation?.companyShare || 0;
        
        // 算定後の7月の計算結果を取得
        const newCalculation = await this.calculationService.getCalculationsByEmployee(
          calc.employeeId,
          calc.targetYear,
          7
        );
        const newCompanyShare = newCalculation?.companyShare || 0;
        const companyShareDiff = newCompanyShare - previousCompanyShare;

        standardImpacts.push({
          calculationId: calc.id || '',
          employeeId: calc.employeeId,
          employeeName: `${employee.lastName} ${employee.firstName}`,
          targetYear: calc.targetYear,
          previousStandardReward,
          newStandardReward,
          standardRewardDiff,
          previousCompanyShare,
          newCompanyShare,
          companyShareDiff
        });
      }
    }

    this.standardRewardImpacts = standardImpacts;
    this.standardRewardImpactDataSource.data = standardImpacts;

    // 月変計算の影響確認
    const monthlyChangeCalculations = await this.standardRewardCalculationService.getCalculationsByOrganization(
      this.organizationId,
      'monthly_change',
      this.selectedImpactYear
    );

    const monthlyChangeImpacts: StandardRewardImpact[] = [];
    for (const calc of monthlyChangeCalculations) {
      if (!calc.employeeId || !calc.changeMonth) continue;

      const employee = await this.employeeService.getEmployee(calc.employeeId);
      if (!employee) continue;

      // 月変前の標準報酬を取得（変動月の前月の計算結果から）
      let previousYear = calc.changeMonth.year;
      let previousMonth = calc.changeMonth.month - 1;
      if (previousMonth < 1) {
        previousMonth = 12;
        previousYear--;
      }

      const previousCalculation = await this.calculationService.getCalculationsByEmployee(
        calc.employeeId,
        previousYear,
        previousMonth
      );

      const previousStandardReward = previousCalculation?.standardReward || 0;
      const newStandardReward = calc.standardReward || 0;
      const standardRewardDiff = newStandardReward - previousStandardReward;

      if (standardRewardDiff !== 0) {
        // 保険料の増減を計算（変動月の前月と変動月から4か月目の計算結果を比較）
        const previousCompanyShare = previousCalculation?.companyShare || 0;
        
        // 変動月から4か月目の計算結果を取得
        let newYear = calc.changeMonth.year;
        let newMonth = calc.changeMonth.month + 3;
        if (newMonth > 12) {
          newMonth -= 12;
          newYear++;
        }

        const newCalculation = await this.calculationService.getCalculationsByEmployee(
          calc.employeeId,
          newYear,
          newMonth
        );
        const newCompanyShare = newCalculation?.companyShare || 0;
        const companyShareDiff = newCompanyShare - previousCompanyShare;

        monthlyChangeImpacts.push({
          calculationId: calc.id || '',
          employeeId: calc.employeeId,
          employeeName: `${employee.lastName} ${employee.firstName}`,
          targetYear: calc.targetYear,
          previousStandardReward,
          newStandardReward,
          standardRewardDiff,
          previousCompanyShare,
          newCompanyShare,
          companyShareDiff
        });
      }
    }

    this.monthlyChangeImpacts = monthlyChangeImpacts;
    this.monthlyChangeImpactDataSource.data = monthlyChangeImpacts;
  }
  */

  onYearMonthChange(): void {
    this.loadPremiumSummary();
  }

  onTrendYearChange(): void {
    this.loadMonthlyTrends();
  }

  /* 算定・月変の影響確認用メソッド（後で追加する可能性があるためコメントアウト）
  onImpactYearChange(): void {
    this.loadStandardRewardImpacts();
  }
  */

  /**
   * CSV出力（月次保険料一覧）
   */
  exportEmployeeCsv(): void {
    const headers = ['社員番号', '社員名', '部署名', '被保険者負担額', '事業主負担額', '合計保険料'];
    const rows = this.employeeSummaries.map(s => [
      s.employeeNumber,
      s.employeeName,
      s.departmentName,
      s.employeeShare.toLocaleString(),
      s.companyShare.toLocaleString(),
      s.totalPremium.toLocaleString()
    ]);

    const csvContent = this.convertToCsv([headers, ...rows]);
    this.downloadCsv(csvContent, `月次保険料一覧_${this.selectedYear}年${this.selectedMonth}月`);
  }

  /**
   * CSV出力（部署別集計）
   */
  exportDepartmentCsv(): void {
    const headers = ['部署名', '社員数', '被保険者負担額合計', '事業主負担額合計', '合計保険料'];
    const rows = this.departmentSummaries.map(s => [
      s.departmentName,
      s.employeeCount.toString(),
      s.employeeShare.toLocaleString(),
      s.companyShare.toLocaleString(),
      s.totalPremium.toLocaleString()
    ]);

    // 会社合計行を追加
    rows.push([
      '会社合計',
      this.employeeSummaries.length.toString(),
      this.companyTotal.employeeShare.toLocaleString(),
      this.companyTotal.companyShare.toLocaleString(),
      this.companyTotal.totalPremium.toLocaleString()
    ]);

    const csvContent = this.convertToCsv([headers, ...rows]);
    this.downloadCsv(csvContent, `部署別集計_${this.selectedYear}年${this.selectedMonth}月`);
  }

  /**
   * CSV出力（月次推移）
   */
  exportTrendCsv(): void {
    const headers = ['年月', '被保険者負担額合計', '事業主負担額合計', '合計保険料'];
    const rows = this.monthlyTrends.map(t => [
      `${t.year}年${t.month}月`,
      t.employeeShare.toLocaleString(),
      t.companyShare.toLocaleString(),
      t.totalPremium.toLocaleString()
    ]);

    const csvContent = this.convertToCsv([headers, ...rows]);
    this.downloadCsv(csvContent, `月次推移_${this.selectedTrendYear}年`);
  }

  /* CSV出力（算定・月変の影響）（後で追加する可能性があるためコメントアウト）
  exportImpactCsv(): void {
    const headers = ['社員名', '前標準報酬月額', '新標準報酬月額', '標準報酬月額差額', '前事業主負担額', '新事業主負担額', '事業主負担額差額'];
    const standardRows = this.standardRewardImpacts.map(i => [
      i.employeeName,
      i.previousStandardReward.toLocaleString(),
      i.newStandardReward.toLocaleString(),
      i.standardRewardDiff.toLocaleString(),
      i.previousCompanyShare.toLocaleString(),
      i.newCompanyShare.toLocaleString(),
      i.companyShareDiff.toLocaleString()
    ]);

    const monthlyChangeRows = this.monthlyChangeImpacts.map(i => [
      i.employeeName,
      i.previousStandardReward.toLocaleString(),
      i.newStandardReward.toLocaleString(),
      i.standardRewardDiff.toLocaleString(),
      i.previousCompanyShare.toLocaleString(),
      i.newCompanyShare.toLocaleString(),
      i.companyShareDiff.toLocaleString()
    ]);

    const csvContent = this.convertToCsv([
      ['算定計算の影響'],
      headers,
      ...standardRows,
      [],
      ['月変計算の影響'],
      headers,
      ...monthlyChangeRows
    ]);
    this.downloadCsv(csvContent, `算定・月変の影響_${this.selectedImpactYear}年`);
  }
  */

  private convertToCsv(rows: (string | number)[][]): string {
    return rows.map(row => 
      row.map(cell => {
        const cellStr = String(cell);
        // カンマやダブルクォートを含む場合はダブルクォートで囲む
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',')
    ).join('\n');
  }

  private downloadCsv(csvContent: string, filename: string): void {
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
    link.download = `${filename}_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    this.snackBar.open('CSVファイルをダウンロードしました', '閉じる', { duration: 3000 });
  }

  formatCurrency(amount: number): string {
    return `¥${amount.toLocaleString()}`;
  }

  /* 算定・月変の影響確認用サマリーメソッド（後で追加する可能性があるためコメントアウト）
  getStandardRewardImpactSummary(): { changedCount: number; totalCompanyShareDiff: number } {
    const allImpacts = [...this.standardRewardImpacts, ...this.monthlyChangeImpacts];
    return {
      changedCount: allImpacts.length,
      totalCompanyShareDiff: allImpacts.reduce((sum, i) => sum + i.companyShareDiff, 0)
    };
  }
  */
}
