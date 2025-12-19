import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTabsModule } from '@angular/material/tabs';
import { AuthService } from '../../../core/auth/auth.service';
import { CalculationService } from '../../../core/services/calculation.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { DepartmentService } from '../../../core/services/department.service';
import { SalaryDataService } from '../../../core/services/salary-data.service';
import { MonthlyCalculation, CalculationListRow } from '../../../core/models/monthly-calculation.model';
import { BonusCalculation, BonusCalculationListRow } from '../../../core/models/bonus-calculation.model';
import { Employee } from '../../../core/models/employee.model';
import { BonusDataService } from '../../../core/services/bonus-data.service';

@Component({
  selector: 'app-calculation-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatCardModule,
    MatPaginatorModule,
    MatChipsModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatCheckboxModule,
    MatTabsModule
  ],
  templateUrl: './calculation-list.component.html',
  styleUrl: './calculation-list.component.css'
})
export class CalculationListComponent implements OnInit {
  private calculationService = inject(CalculationService);
  private employeeService = inject(EmployeeService);
  private departmentService = inject(DepartmentService);
  private salaryDataService = inject(SalaryDataService);
  private bonusDataService = inject(BonusDataService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  // タブ
  selectedTabIndex: number = 0;

  // 月次タブ
  searchForm: FormGroup;
  calculationRows: CalculationListRow[] = [];
  filteredRows: CalculationListRow[] = [];
  displayedColumns: string[] = ['select', 'year', 'month', 'employeeNumber', 'employeeName', 'departmentName', 'companyShare', 'employeeShare', 'status', 'actions'];
  dataSource = new MatTableDataSource<CalculationListRow>([]);
  selectedCalculations: Set<string> = new Set(); // draftの計算結果ID
  selectedEmployees: Set<string> = new Set(); // 未計算の社員ID

  // 賞与タブ
  bonusSearchForm: FormGroup;
  bonusCalculationRows: BonusCalculationListRow[] = [];
  bonusFilteredRows: BonusCalculationListRow[] = [];
  bonusDisplayedColumns: string[] = ['select', 'year', 'month', 'employeeNumber', 'employeeName', 'departmentName', 'companyShare', 'employeeShare', 'status', 'actions'];
  bonusDataSource = new MatTableDataSource<BonusCalculationListRow>([]);
  selectedBonusCalculations: Set<string> = new Set(); // draftの計算結果ID
  selectedBonusEmployees: Set<string> = new Set(); // 未計算の社員ID
  bonusPageIndex = 0;
  
  // ページネーション
  pageSize = 10;
  pageIndex = 0;
  pageSizeOptions = [10, 25, 50, 100];
  
  // フィルタ
  selectedYear: number | null = null;
  selectedMonth: number | null = null;
  selectedStatus: 'draft' | 'confirmed' | 'exported' | '' = '';

  organizationId: string | null = null;
  currentYear = new Date().getFullYear();
  currentMonth = new Date().getMonth() + 1;
  years: number[] = [];
  months: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  constructor() {
    // 過去5年から未来1年まで
    for (let i = this.currentYear - 5; i <= this.currentYear + 1; i++) {
      this.years.push(i);
    }

    this.searchForm = this.fb.group({
      year: [this.currentYear],
      month: [this.currentMonth],
      status: ['']
    });

    this.bonusSearchForm = this.fb.group({
      year: [this.currentYear],
      month: [this.currentMonth],
      status: ['']
    });
  }

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.organizationId = currentUser.organizationId;
    this.loadCalculations();
  }

  async loadCalculations(): Promise<void> {
    if (!this.organizationId) {
      return;
    }

    const year = this.searchForm.value.year || this.currentYear;
    const month = this.searchForm.value.month || this.currentMonth;

    try {
      // 社員一覧を取得
      const employees = await this.calculationService.getCalculationTargetEmployees(this.organizationId, year, month);
      
      // 計算結果を取得
      const calculations = await this.calculationService.getCalculationsByMonth(this.organizationId, year, month);
      
      // 計算結果を社員IDをキーにマッピング
      const calculationMap = new Map<string, MonthlyCalculation>();
      calculations.forEach(calc => {
        if (calc.employeeId && calc.id) {
          calculationMap.set(calc.employeeId, calc);
        }
      });
      
      // 部署情報を取得
      const departments = await this.departmentService.getDepartmentsByOrganization(this.organizationId);
      const departmentMap = new Map<string, string>();
      departments.forEach(dept => {
        if (dept.id) {
          departmentMap.set(dept.id, dept.name);
        }
      });
      
      // CalculationListRowを作成
      this.calculationRows = employees.map(employee => {
        const calculation = calculationMap.get(employee.id || '') || null;
        const departmentName = employee.departmentId ? departmentMap.get(employee.departmentId) : undefined;
        const isOnLeave = employee.status === 'leave';
        return {
          employeeId: employee.id || '',
          employeeNumber: employee.employeeNumber,
          employeeName: `${employee.lastName} ${employee.firstName}`,
          departmentName: departmentName,
          calculation: calculation,
          employeeStatus: employee.status,
          isOnLeave: isOnLeave
        };
      });
      
      this.applyFilters();
    } catch (error) {
      console.error('計算履歴の取得に失敗しました:', error);
      this.snackBar.open('計算履歴の取得に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  applyFilters(): void {
    let filtered = [...this.calculationRows];

    const status = this.searchForm.value.status;
    if (status) {
      if (status === 'not_calculated') {
        // 未計算の場合は calculation === null をフィルタ
        filtered = filtered.filter(row => row.calculation === null);
      } else {
        // その他のステータスの場合は calculation の status でフィルタ
        filtered = filtered.filter(row => row.calculation?.status === status);
      }
    }

    this.filteredRows = filtered;
    this.updateDataSource();
  }

  updateDataSource(): void {
    const startIndex = this.pageIndex * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.dataSource.data = this.filteredRows.slice(startIndex, endIndex);
  }

  onSearch(): void {
    this.pageIndex = 0;
    this.loadCalculations();
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.updateDataSource();
  }

  onFilterChange(): void {
    this.pageIndex = 0;
    this.applyFilters();
  }

  viewDetail(row: CalculationListRow): void {
    if (row.calculation?.id) {
      // 計算結果がある場合は詳細画面へ
      this.router.navigate(['/calculations', row.calculation.id]);
    } else {
      // 計算結果がない場合も詳細画面へ（employeeIdとyear/monthを渡す）
      const year = this.searchForm.value.year || this.currentYear;
      const month = this.searchForm.value.month || this.currentMonth;
      // 計算結果がない場合は、employeeIdとyear/monthをクエリパラメータで渡す
      this.router.navigate(['/calculations', 'new'], {
        queryParams: {
          employeeId: row.employeeId,
          year: year,
          month: month
        }
      });
    }
  }

  async executeCalculation(): Promise<void> {
    if (!this.organizationId || this.selectedEmployees.size === 0) {
      return;
    }

    const year = this.searchForm.value.year || this.currentYear;
    const month = this.searchForm.value.month || this.currentMonth;
    const currentUser = this.authService.getCurrentUser();

    if (!currentUser?.uid) {
      this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    const confirmed = confirm(`${this.selectedEmployees.size}件の計算を実行しますか？`);
    if (!confirmed) {
      return;
    }

    try {
      this.snackBar.open('計算を実行中です...', '閉じる', { duration: 2000 });
      
      const employeeIds = Array.from(this.selectedEmployees);
      const calculations: MonthlyCalculation[] = [];
      const skippedEmployees: string[] = [];
      
      // 選択された社員のみに対して計算を実行
      for (const employeeId of employeeIds) {
        try {
          // 社員情報を取得
          const employee = await this.employeeService.getEmployee(employeeId);
          if (!employee) {
            skippedEmployees.push(employeeId);
            continue;
          }

          // 既存の計算結果をチェック
          const existingCalculation = await this.calculationService.getCalculationsByEmployee(
            employeeId,
            year,
            month
          );

          // confirmedまたはexportedの計算結果がある場合はスキップ
          if (existingCalculation && (existingCalculation.status === 'confirmed' || existingCalculation.status === 'exported')) {
            skippedEmployees.push(employee.employeeNumber);
            continue;
          }

          // 給与情報が確定済みかチェック
          const salaryData = await this.salaryDataService.getSalaryData(employeeId, year, month);
          if (!salaryData || !salaryData.isConfirmed) {
            skippedEmployees.push(employee.employeeNumber);
            continue;
          }

          // 計算を実行
          const calculation = await this.calculationService.calculateEmployeePremium(
            employee,
            year,
            month,
            currentUser.uid
          );

          // 計算結果を保存
          await this.calculationService.saveCalculation(calculation);
          calculations.push(calculation);
        } catch (error: any) {
          // 既に確定済みのエラーの場合はスキップとして扱う
          if (error.message && error.message.includes('既に確定済み')) {
            const employee = await this.employeeService.getEmployee(employeeId);
            if (employee) {
              skippedEmployees.push(employee.employeeNumber);
            }
            continue;
          }
          console.error(`社員 ${employeeId} の計算に失敗しました:`, error);
          // エラーが発生しても他の社員の計算は続行
        }
      }
      
      // 選択状態をクリア
      this.selectedEmployees.clear();
      
      let message = `${calculations.length}件の計算が完了しました`;
      if (skippedEmployees.length > 0) {
        message += `（${skippedEmployees.length}件は一括計算の条件を満たしていないためスキップしました）`;
      }
      
      this.snackBar.open(message, '閉じる', { duration: 5000 });
      await this.loadCalculations();
      this.pageIndex = 0; // ページをリセット
    } catch (error) {
      console.error('計算の実行に失敗しました:', error);
      this.snackBar.open('計算の実行に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  formatDate(date: Date | any): string {
    if (!date) {
      return '';
    }
    const d = date instanceof Date ? date : date.toDate ? date.toDate() : new Date(date);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  formatCurrency(amount: number): string {
    return `¥${amount.toLocaleString()}`;
  }

  getStatus(row: CalculationListRow): string | null {
    return row.calculation?.status || null;
  }

  getStatusLabel(status: string | null): string {
    if (status === null) {
      return '未計算';
    }
    const labels: { [key: string]: string } = {
      not_calculated: '未計算',
      draft: '下書き',
      confirmed: '確定',
      exported: '出力済み'
    };
    return labels[status] || status;
  }

  getStatusColor(status: string | null): string {
    if (status === null) {
      return '';
    }
    const colors: { [key: string]: string } = {
      not_calculated: '',
      draft: 'accent',
      confirmed: 'primary',
      exported: 'warn'
    };
    return colors[status] || '';
  }

  /**
   * CSV出力
   */
  async exportToCsv(): Promise<void> {
    // draftステータスと未計算を除外
    const exportableRows = this.filteredRows.filter(row => 
      row.calculation !== null && row.calculation.status !== 'draft'
    );
    
    if (exportableRows.length === 0) {
      this.snackBar.open('出力する計算結果がありません', '閉じる', { duration: 3000 });
      return;
    }

    const year = this.searchForm.value.year || this.currentYear;
    const month = this.searchForm.value.month || this.currentMonth;

    // CSVヘッダー
    const headers = [
      '年',
      '月',
      '社員番号',
      '社員名',
      '標準報酬月額',
      '健康保険等級',
      '厚生年金等級',
      '健康保険料（全額）',
      '厚生年金料（全額）',
      '合計保険料（全額）',
      '想定会社負担額',
      '従業員負担額',
      'ステータス',
      '計算日'
    ];

    // CSVデータ行（draftと未計算を除外）
    const rows = exportableRows.map(row => {
      const calc = row.calculation!;
      let calcDate: Date;
      if (calc.calculationDate instanceof Date) {
        calcDate = calc.calculationDate;
      } else if (calc.calculationDate && typeof (calc.calculationDate as any).toDate === 'function') {
        calcDate = (calc.calculationDate as any).toDate();
      } else if (calc.calculationDate && typeof (calc.calculationDate as any).seconds === 'number') {
        calcDate = new Date((calc.calculationDate as any).seconds * 1000);
      } else {
        calcDate = new Date();
      }
      
      return [
        calc.year.toString(),
        calc.month.toString(),
        calc.employeeNumber,
        calc.employeeName,
        calc.standardReward.toString(),
        calc.grade.toString(),
        calc.pensionGrade?.toString() || '',
        calc.healthInsurancePremium.toString(),
        calc.pensionInsurancePremium.toString(),
        calc.totalPremium.toString(),
        calc.companyShare.toString(),
        calc.employeeShare.toString(),
        this.getStatusLabel(calc.status),
        `${calcDate.getFullYear()}年${calcDate.getMonth() + 1}月${calcDate.getDate()}日`
      ];
    });

    // CSV文字列を生成
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // カンマや改行を含む場合はダブルクォートで囲む
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    // BOM付きUTF-8でBlobを作成
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // ファイル名を生成（計算結果_YYYY年MM月_YYYYMMDDHHmmss.csv）
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
    link.download = `計算結果_${year}年${month}月_${dateStr}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    // CSV出力時にステータスをexportedに変更（draftと未計算は除外済み）
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.uid) {
      const calculationIds = exportableRows
        .map(row => row.calculation!)
        .filter(calc => calc.id && (calc.status === 'confirmed' || calc.status === 'exported'))
        .map(calc => calc.id!);
      
      if (calculationIds.length > 0) {
        try {
          await this.calculationService.markCalculationsAsExported(calculationIds, currentUser.uid);
          await this.loadCalculations();
        } catch (error) {
          console.error('ステータス更新に失敗しました:', error);
        }
      }
    }

    this.snackBar.open(`CSVファイルをダウンロードしました（${exportableRows.length}件）`, '閉じる', { duration: 3000 });
  }

  /**
   * 選択状態を管理
   */
  isSelected(row: CalculationListRow): boolean {
    // 休職中の社員は一括計算の対象外
    if (row.isOnLeave) {
      return false;
    }
    if (row.calculation?.id && row.calculation.status === 'draft') {
      // draftの計算結果の場合
      return this.selectedCalculations.has(row.calculation.id);
    } else if (!row.calculation) {
      // 未計算の社員の場合
      return this.selectedEmployees.has(row.employeeId);
    }
    return false;
  }

  toggleSelection(row: CalculationListRow): void {
    // 休職中の社員は一括計算の対象外
    if (row.isOnLeave) {
      return;
    }
    if (row.calculation?.id && row.calculation.status === 'draft') {
      // draftの計算結果の場合
      const calculationId = row.calculation.id;
      if (this.selectedCalculations.has(calculationId)) {
        this.selectedCalculations.delete(calculationId);
      } else {
        this.selectedCalculations.add(calculationId);
      }
    } else if (!row.calculation) {
      // 未計算の社員の場合
      if (this.selectedEmployees.has(row.employeeId)) {
        this.selectedEmployees.delete(row.employeeId);
      } else {
        this.selectedEmployees.add(row.employeeId);
      }
    }
    // その他のステータスは選択不可
  }

  isAllSelected(): boolean {
    // 選択可能な行（未計算またはdraft、かつ休職中でない）
    const selectableRows = this.filteredRows.filter(row => 
      !row.isOnLeave && ((!row.calculation) || (row.calculation.status === 'draft' && row.calculation.id))
    );
    return selectableRows.length > 0 && selectableRows.every(row => this.isSelected(row));
  }

  isSomeSelected(): boolean {
    // 選択可能な行（未計算またはdraft、かつ休職中でない）
    const selectableRows = this.filteredRows.filter(row => 
      !row.isOnLeave && ((!row.calculation) || (row.calculation.status === 'draft' && row.calculation.id))
    );
    const selectedCount = selectableRows.filter(row => this.isSelected(row)).length;
    return selectedCount > 0 && selectedCount < selectableRows.length;
  }

  toggleAll(): void {
    // 選択可能な行（未計算またはdraft、かつ休職中でない）
    const selectableRows = this.filteredRows.filter(row => 
      !row.isOnLeave && ((!row.calculation) || (row.calculation.status === 'draft' && row.calculation.id))
    );
    
    if (this.isAllSelected()) {
      // すべて選択解除
      selectableRows.forEach(row => {
        if (row.calculation?.id && row.calculation.status === 'draft') {
          this.selectedCalculations.delete(row.calculation.id);
        } else if (!row.calculation) {
          this.selectedEmployees.delete(row.employeeId);
        }
      });
    } else {
      // すべて選択
      selectableRows.forEach(row => {
        if (row.calculation?.id && row.calculation.status === 'draft') {
          this.selectedCalculations.add(row.calculation.id);
        } else if (!row.calculation) {
          this.selectedEmployees.add(row.employeeId);
        }
      });
    }
  }

  /**
   * CSV出力可能かどうか（draftと未計算は出力不可）
   */
  canExport(): boolean {
    return this.filteredRows.some(row => 
      row.calculation !== null && 
      (row.calculation.status === 'confirmed' || row.calculation.status === 'exported')
    );
  }

  /**
   * 選択した計算結果を一括確定
   */
  async confirmSelected(): Promise<void> {
    if (this.selectedCalculations.size === 0) {
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.uid) {
      this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    const confirmed = confirm(`${this.selectedCalculations.size}件の計算結果を確定しますか？`);
    if (!confirmed) {
      return;
    }

    try {
      const calculationIds = Array.from(this.selectedCalculations);
      await this.calculationService.confirmCalculations(calculationIds, currentUser.uid);
      this.selectedCalculations.clear();
      this.snackBar.open(`${calculationIds.length}件の計算結果を確定しました`, '閉じる', { duration: 3000 });
      await this.loadCalculations();
    } catch (error) {
      console.error('確定処理に失敗しました:', error);
      this.snackBar.open('確定処理に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 給与情報入力ページに遷移
   */
  navigateToSalaryInput(): void {
    this.router.navigate(['/salary-input'], { queryParams: { hideExport: 'true' } });
  }

  /**
   * タブ切り替え
   */
  onTabChange(index: number): void {
    this.selectedTabIndex = index;
    if (index === 0) {
      // 月次タブ
      this.loadCalculations();
    } else if (index === 1) {
      // 賞与タブ
      this.loadBonusCalculations();
    }
  }

  /**
   * 賞与タブ用のメソッド
   */
  async loadBonusCalculations(): Promise<void> {
    if (!this.organizationId) {
      return;
    }

    const year = this.bonusSearchForm.value.year || this.currentYear;
    const month = this.bonusSearchForm.value.month || this.currentMonth;

    try {
      // 賞与計算対象者を取得（表示用、賞与データの確定チェックは計算実行時に行う）
      const employees = await this.calculationService.getBonusCalculationTargetEmployees(this.organizationId, year, month);
      
      // 計算結果を取得
      const calculations = await this.calculationService.getBonusCalculationsByMonth(this.organizationId, year, month);
      
      // 計算結果を社員IDをキーにマッピング
      const calculationMap = new Map<string, BonusCalculation>();
      calculations.forEach(calc => {
        if (calc.employeeId && calc.id) {
          calculationMap.set(calc.employeeId, calc);
        }
      });
      
      // 部署情報を取得
      const departments = await this.departmentService.getDepartmentsByOrganization(this.organizationId);
      const departmentMap = new Map<string, string>();
      departments.forEach(dept => {
        if (dept.id) {
          departmentMap.set(dept.id, dept.name);
        }
      });
      
      // BonusCalculationListRowを作成
      this.bonusCalculationRows = employees.map(employee => {
        const calculation = calculationMap.get(employee.id || '') || null;
        const departmentName = employee.departmentId ? departmentMap.get(employee.departmentId) : undefined;
        const isOnLeave = employee.status === 'leave';
        return {
          employeeId: employee.id || '',
          employeeNumber: employee.employeeNumber,
          employeeName: `${employee.lastName} ${employee.firstName}`,
          departmentName: departmentName,
          calculation: calculation,
          employeeStatus: employee.status,
          isOnLeave: isOnLeave
        };
      });
      
      this.applyBonusFilters();
    } catch (error) {
      console.error('賞与計算履歴の取得に失敗しました:', error);
      this.snackBar.open('賞与計算履歴の取得に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  applyBonusFilters(): void {
    let filtered = [...this.bonusCalculationRows];

    const status = this.bonusSearchForm.value.status;
    if (status) {
      if (status === 'not_calculated') {
        filtered = filtered.filter(row => row.calculation === null);
      } else {
        filtered = filtered.filter(row => row.calculation?.status === status);
      }
    }

    this.bonusFilteredRows = filtered;
    this.updateBonusDataSource();
  }

  updateBonusDataSource(): void {
    const startIndex = this.bonusPageIndex * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.bonusDataSource.data = this.bonusFilteredRows.slice(startIndex, endIndex);
  }

  onBonusSearch(): void {
    this.bonusPageIndex = 0;
    this.loadBonusCalculations();
  }

  onBonusFilterChange(): void {
    this.bonusPageIndex = 0;
    this.applyBonusFilters();
  }

  onBonusPageChange(event: PageEvent): void {
    this.bonusPageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.updateBonusDataSource();
  }

  async executeBonusCalculation(): Promise<void> {
    if (!this.organizationId || this.selectedBonusEmployees.size === 0) {
      return;
    }

    const year = this.bonusSearchForm.value.year || this.currentYear;
    const month = this.bonusSearchForm.value.month || this.currentMonth;
    const currentUser = this.authService.getCurrentUser();

    if (!currentUser?.uid) {
      this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    const confirmed = confirm(`${this.selectedBonusEmployees.size}件の賞与計算を実行しますか？`);
    if (!confirmed) {
      return;
    }

    try {
      this.snackBar.open('賞与計算を実行中です...', '閉じる', { duration: 2000 });
      
      const employeeIds = Array.from(this.selectedBonusEmployees);
      const calculations: BonusCalculation[] = [];
      const skippedEmployees: string[] = [];
      
      for (const employeeId of employeeIds) {
        try {
          const employee = await this.employeeService.getEmployee(employeeId);
          if (!employee) {
            skippedEmployees.push(employeeId);
            continue;
          }

          // 既存の計算結果をチェック
          const existingCalculation = await this.calculationService.getBonusCalculationsByEmployee(employeeId, year, month);

          if (existingCalculation && (existingCalculation.status === 'confirmed' || existingCalculation.status === 'exported')) {
            skippedEmployees.push(employee.employeeNumber);
            continue;
          }

          // 賞与データが確定済みかチェック
          const bonusData = await this.bonusDataService.getBonusData(employeeId, year, month);
          if (!bonusData || !bonusData.isConfirmed) {
            skippedEmployees.push(`${employee.employeeNumber}（賞与未確定）`);
            continue;
          }

          // 計算を実行
          const calculation = await this.calculationService.calculateEmployeeBonusPremium(
            employee,
            year,
            month,
            currentUser.uid
          );

          // 計算結果を保存
          await this.calculationService.saveBonusCalculation(calculation);
          calculations.push(calculation);
        } catch (error: any) {
          if (error.message && error.message.includes('既に確定済み')) {
            const employee = await this.employeeService.getEmployee(employeeId);
            if (employee) {
              skippedEmployees.push(employee.employeeNumber);
            }
            continue;
          }
          console.error(`社員 ${employeeId} の賞与計算に失敗しました:`, error);
        }
      }
      
      this.selectedBonusEmployees.clear();
      
      let message = `${calculations.length}件の賞与計算が完了しました`;
      if (skippedEmployees.length > 0) {
        message += `（${skippedEmployees.length}件はスキップ）`;
      }
      
      this.snackBar.open(message, '閉じる', { duration: 5000 });
      await this.loadBonusCalculations();
      this.bonusPageIndex = 0;
    } catch (error) {
      console.error('賞与計算の実行に失敗しました:', error);
      this.snackBar.open('賞与計算の実行に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  async confirmSelectedBonusCalculations(): Promise<void> {
    if (this.selectedBonusCalculations.size === 0) {
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.uid) {
      this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    const confirmed = confirm(`${this.selectedBonusCalculations.size}件の賞与計算結果を確定しますか？`);
    if (!confirmed) {
      return;
    }

    try {
      const calculationIds = Array.from(this.selectedBonusCalculations);
      // TODO: CalculationServiceにconfirmBonusCalculationsメソッドを追加
      for (const id of calculationIds) {
        await this.calculationService.updateBonusCalculation(id, {
          status: 'confirmed',
          confirmedAt: new Date(),
          confirmedBy: currentUser.uid
        });
      }
      this.selectedBonusCalculations.clear();
      this.snackBar.open(`${calculationIds.length}件の賞与計算結果を確定しました`, '閉じる', { duration: 3000 });
      await this.loadBonusCalculations();
    } catch (error) {
      console.error('確定処理に失敗しました:', error);
      this.snackBar.open('確定処理に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  async exportBonusToCsv(): Promise<void> {
    // draftステータスと未計算を除外
    const exportableRows = this.bonusFilteredRows.filter(row => 
      row.calculation !== null && row.calculation.status !== 'draft'
    );
    
    if (exportableRows.length === 0) {
      this.snackBar.open('出力する計算結果がありません', '閉じる', { duration: 3000 });
      return;
    }

    const year = this.bonusSearchForm.value.year || this.currentYear;
    const month = this.bonusSearchForm.value.month || this.currentMonth;

    // CSVヘッダー
    const headers = [
      '年',
      '月',
      '社員番号',
      '社員名',
      '賞与額',
      '標準賞与額',
      '健康保険料（全額）',
      '厚生年金料（全額）',
      '合計保険料（全額）',
      '想定会社負担額',
      '従業員負担額',
      'ステータス',
      '計算日'
    ];

    // CSVデータ行（draftと未計算を除外）
    const rows = exportableRows.map(row => {
      const calc = row.calculation!;
      let calcDate: Date;
      if (calc.calculationDate instanceof Date) {
        calcDate = calc.calculationDate;
      } else if (calc.calculationDate && typeof (calc.calculationDate as any).toDate === 'function') {
        calcDate = (calc.calculationDate as any).toDate();
      } else if (calc.calculationDate && typeof (calc.calculationDate as any).seconds === 'number') {
        calcDate = new Date((calc.calculationDate as any).seconds * 1000);
      } else {
        calcDate = new Date();
      }
      
      return [
        calc.year.toString(),
        calc.month.toString(),
        calc.employeeNumber,
        calc.employeeName,
        calc.bonusAmount.toString(),
        calc.standardBonusAmount.toString(),
        calc.healthInsurancePremium.toString(),
        calc.pensionInsurancePremium.toString(),
        calc.totalPremium.toString(),
        calc.companyShare.toString(),
        calc.employeeShare.toString(),
        this.getStatusLabel(calc.status),
        `${calcDate.getFullYear()}年${calcDate.getMonth() + 1}月${calcDate.getDate()}日`
      ];
    });

    // CSV文字列を生成
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // カンマや改行を含む場合はダブルクォートで囲む
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    // BOM付きUTF-8でBlobを作成
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // ファイル名を生成（賞与計算結果_YYYY年MM月_YYYYMMDDHHmmss.csv）
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
    link.download = `賞与計算結果_${year}年${month}月_${dateStr}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    // CSV出力時にステータスをexportedに変更（draftと未計算は除外済み）
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.uid) {
      const calculationIds = exportableRows
        .map(row => row.calculation!)
        .filter(calc => calc.id && (calc.status === 'confirmed' || calc.status === 'exported'))
        .map(calc => calc.id!);
      
      if (calculationIds.length > 0) {
        try {
          await this.calculationService.markBonusCalculationsAsExported(calculationIds, currentUser.uid);
          await this.loadBonusCalculations();
        } catch (error) {
          console.error('ステータス更新に失敗しました:', error);
        }
      }
    }

    this.snackBar.open(`CSVファイルをダウンロードしました（${exportableRows.length}件）`, '閉じる', { duration: 3000 });
  }

  canBonusExport(): boolean {
    return this.bonusFilteredRows.some(row => 
      row.calculation !== null && 
      (row.calculation.status === 'confirmed' || row.calculation.status === 'exported')
    );
  }

  // 合計計算メソッド（月次タブ用）
  getTotalPremium(): number {
    // 想定合計保険料は端数切捨てで表示
    const total = this.filteredRows
      .filter(row => row.calculation !== null)
      .reduce((sum, row) => sum + (row.calculation!.totalPremium || 0), 0);
    return Math.floor(total);
  }

  getTotalEmployeeShare(): number {
    return this.filteredRows
      .filter(row => row.calculation !== null)
      .reduce((sum, row) => sum + (row.calculation!.employeeShare || 0), 0);
  }

  getTotalCompanyShare(): number {
    // 会社負担額総額 = 合計保険料（全額） - 社員負担額合計（折半額）
    return this.getTotalPremium() - this.getTotalEmployeeShare();
  }

  // 合計計算メソッド（賞与タブ用）
  getTotalBonusPremium(): number {
    // 想定合計保険料は端数切捨てで表示
    const total = this.bonusFilteredRows
      .filter(row => row.calculation !== null)
      .reduce((sum, row) => sum + (row.calculation!.totalPremium || 0), 0);
    return Math.floor(total);
  }

  getTotalBonusEmployeeShare(): number {
    return this.bonusFilteredRows
      .filter(row => row.calculation !== null)
      .reduce((sum, row) => sum + (row.calculation!.employeeShare || 0), 0);
  }

  getTotalBonusCompanyShare(): number {
    // 会社負担額総額 = 合計保険料（全額） - 社員負担額合計（折半額）
    return this.getTotalBonusPremium() - this.getTotalBonusEmployeeShare();
  }

  toggleBonusSelection(row: BonusCalculationListRow): void {
    // 休職中の社員は一括計算の対象外
    if (row.isOnLeave) {
      return;
    }
    if (row.calculation?.id && row.calculation.status === 'draft') {
      const calculationId = row.calculation.id;
      if (this.selectedBonusCalculations.has(calculationId)) {
        this.selectedBonusCalculations.delete(calculationId);
      } else {
        this.selectedBonusCalculations.add(calculationId);
      }
    } else if (!row.calculation) {
      if (this.selectedBonusEmployees.has(row.employeeId)) {
        this.selectedBonusEmployees.delete(row.employeeId);
      } else {
        this.selectedBonusEmployees.add(row.employeeId);
      }
    }
  }

  isBonusSelected(row: BonusCalculationListRow): boolean {
    // 休職中の社員は一括計算の対象外
    if (row.isOnLeave) {
      return false;
    }
    if (row.calculation?.id && row.calculation.status === 'draft') {
      return this.selectedBonusCalculations.has(row.calculation.id);
    } else if (!row.calculation) {
      return this.selectedBonusEmployees.has(row.employeeId);
    }
    return false;
  }

  isAllBonusSelected(): boolean {
    const selectableRows = this.bonusFilteredRows.filter(row => 
      !row.isOnLeave && ((!row.calculation) || (row.calculation.status === 'draft' && row.calculation.id))
    );
    return selectableRows.length > 0 && selectableRows.every(row => this.isBonusSelected(row));
  }

  isSomeBonusSelected(): boolean {
    const selectableRows = this.bonusFilteredRows.filter(row => 
      !row.isOnLeave && ((!row.calculation) || (row.calculation.status === 'draft' && row.calculation.id))
    );
    const selectedCount = selectableRows.filter(row => this.isBonusSelected(row)).length;
    return selectedCount > 0 && selectedCount < selectableRows.length;
  }

  toggleAllBonus(): void {
    const selectableRows = this.bonusFilteredRows.filter(row => 
      !row.isOnLeave && ((!row.calculation) || (row.calculation.status === 'draft' && row.calculation.id))
    );
    
    if (this.isAllBonusSelected()) {
      selectableRows.forEach(row => {
        if (row.calculation?.id && row.calculation.status === 'draft') {
          this.selectedBonusCalculations.delete(row.calculation.id);
        } else if (!row.calculation) {
          this.selectedBonusEmployees.delete(row.employeeId);
        }
      });
    } else {
      selectableRows.forEach(row => {
        if (row.calculation?.id && row.calculation.status === 'draft') {
          this.selectedBonusCalculations.add(row.calculation.id);
        } else if (!row.calculation) {
          this.selectedBonusEmployees.add(row.employeeId);
        }
      });
    }
  }

  getBonusStatus(row: BonusCalculationListRow): string {
    if (!row.calculation) {
      return 'not_calculated';
    }
    return row.calculation.status;
  }

  viewBonusDetail(row: BonusCalculationListRow): void {
    if (row.calculation?.id) {
      this.router.navigate(['/bonus-calculations', row.calculation.id]);
      this.router.navigate(['/bonus-calculations', row.calculation.id]);
    } else {
      const year = this.bonusSearchForm.value.year || this.currentYear;
      const month = this.bonusSearchForm.value.month || this.currentMonth;
      this.router.navigate(['/bonus-calculations', 'new'], {
        queryParams: {
          employeeId: row.employeeId,
          year: year,
          month: month
        }
      });
    }
  }

}

