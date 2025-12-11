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
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AuthService } from '../../../core/auth/auth.service';
import { StandardRewardCalculationService } from '../../../core/services/standard-reward-calculation.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { DepartmentService } from '../../../core/services/department.service';
import { SalaryDataService } from '../../../core/services/salary-data.service';
import { StandardRewardCalculation, StandardRewardCalculationListRow } from '../../../core/models/standard-reward-calculation.model';
import { Employee } from '../../../core/models/employee.model';

@Component({
  selector: 'app-standard-reward-calculation-list',
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
    MatTabsModule,
    MatChipsModule,
    MatSnackBarModule,
    MatDialogModule,
    MatCheckboxModule
  ],
  templateUrl: './standard-reward-calculation-list.component.html',
  styleUrl: './standard-reward-calculation-list.component.css'
})
export class StandardRewardCalculationListComponent implements OnInit {
  private calculationService = inject(StandardRewardCalculationService);
  private employeeService = inject(EmployeeService);
  private departmentService = inject(DepartmentService);
  private salaryDataService = inject(SalaryDataService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);

  organizationId: string | null = null;
  currentUser: any = null;

  // タブ
  selectedTabIndex: number = 0;

  // 算定タブ用フォーム
  standardSearchForm: FormGroup;
  // 月変タブ用フォーム
  monthlyChangeSearchForm: FormGroup;
  
  currentYear: number = new Date().getFullYear();
  years: number[] = [];
  months: number[] = Array.from({ length: 12 }, (_, i) => i + 1);

  // 算定タブ
  standardRows: StandardRewardCalculationListRow[] = [];
  standardDataSource = new MatTableDataSource<StandardRewardCalculationListRow>([]);
  standardDisplayedColumns: string[] = ['select', 'employeeNumber', 'employeeName', 'departmentName', 'targetYear', 'standardReward', 'status', 'actions'];
  selectedStandardCalculations: Set<string> = new Set(); // draftの計算結果ID
  selectedStandardEmployees: Set<string> = new Set(); // 未計算の社員ID

  // 月変タブ
  monthlyChangeRows: StandardRewardCalculationListRow[] = [];
  monthlyChangeDataSource = new MatTableDataSource<StandardRewardCalculationListRow>([]);
  monthlyChangeDisplayedColumns: string[] = ['select', 'employeeNumber', 'employeeName', 'departmentName', 'changeMonth', 'gradeChange', 'requiresApplication', 'status', 'actions'];
  selectedMonthlyChangeCalculations: Set<string> = new Set(); // draftの計算結果ID
  selectedMonthlyChangeEmployees: Set<string> = new Set(); // 未計算の社員ID

  isLoading = false;

  constructor() {
    this.standardSearchForm = this.fb.group({
      year: [this.currentYear]
    });
    
    this.monthlyChangeSearchForm = this.fb.group({
      year: [this.currentYear],
      month: [new Date().getMonth() + 1]
    });
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    if (!this.currentUser?.organizationId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.organizationId = this.currentUser.organizationId;
    
    // 年のリストを生成（現在年から5年前まで）
    const currentYear = new Date().getFullYear();
    this.years = Array.from({ length: 6 }, (_, i) => currentYear - i);

    // フォーム変更を購読
    this.standardSearchForm.valueChanges.subscribe(() => {
      if (this.selectedTabIndex === 0) {
        this.loadStandardCalculations();
      }
    });
    
    this.monthlyChangeSearchForm.valueChanges.subscribe(() => {
      if (this.selectedTabIndex === 1) {
        this.loadMonthlyChangeCalculations();
      }
    });

    this.loadCalculations();
  }

  async loadCalculations(): Promise<void> {
    await Promise.all([
      this.loadStandardCalculations(),
      this.loadMonthlyChangeCalculations()
    ]);
  }

  async loadStandardCalculations(): Promise<void> {
    if (!this.organizationId) return;
    
    this.isLoading = true;
    const targetYear = this.standardSearchForm.value.year || this.currentYear;

    try {
      // 算定の計算履歴を取得
      const standardCalculations = await this.calculationService.getCalculationsByOrganization(
        this.organizationId,
        'standard',
        targetYear
      );

      // 対象社員を取得
      const employees = await this.employeeService.getEmployeesByOrganization(this.organizationId);
      const departments = await this.departmentService.getDepartmentsByOrganization(this.organizationId);

      // 算定タブの行データを作成
      this.standardRows = await this.createStandardRows(employees, departments, standardCalculations, targetYear);
      this.standardDataSource.data = this.standardRows;
    } catch (error) {
      console.error('算定計算履歴の読み込みに失敗しました:', error);
      this.snackBar.open('算定計算履歴の読み込みに失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  async loadMonthlyChangeCalculations(): Promise<void> {
    if (!this.organizationId) return;
    
    this.isLoading = true;
    const filterYear = this.monthlyChangeSearchForm.value.year;
    const filterMonth = this.monthlyChangeSearchForm.value.month;

    try {
      // 月変の計算履歴を取得
      const monthlyChangeCalculations = await this.calculationService.getCalculationsByOrganization(
        this.organizationId,
        'monthly_change'
      );

      // 対象社員を取得
      const employees = await this.employeeService.getEmployeesByOrganization(this.organizationId);
      const departments = await this.departmentService.getDepartmentsByOrganization(this.organizationId);

      // 月変タブの行データを作成
      this.monthlyChangeRows = await this.createMonthlyChangeRows(employees, departments, monthlyChangeCalculations, filterYear, filterMonth);
      this.monthlyChangeDataSource.data = this.monthlyChangeRows;
    } catch (error) {
      console.error('月変計算履歴の読み込みに失敗しました:', error);
      this.snackBar.open('月変計算履歴の読み込みに失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  private async createStandardRows(
    employees: Employee[],
    departments: any[],
    calculations: StandardRewardCalculation[],
    targetYear: number
  ): Promise<StandardRewardCalculationListRow[]> {
    const rows: StandardRewardCalculationListRow[] = [];
    
    // 5月31日以前に入社した社員かつ6月給与が確定済みの社員を対象
    // （6月1日以降に入社した社員は対象外）
    const cutoffDate = new Date(targetYear, 5, 31); // 5月31日
    
    for (const employee of employees) {
      const joinDate = employee.joinDate instanceof Date ? employee.joinDate : new Date((employee.joinDate as any).seconds * 1000);
      // 入社日が6月1日以降の場合は対象外
      if (joinDate > cutoffDate) continue;

      // 退職日の翌日が含まれる月以降は除外
      if (employee.retirementDate) {
        const retirementDate = employee.retirementDate instanceof Date ? employee.retirementDate : new Date((employee.retirementDate as any).seconds * 1000);
        const nextDay = new Date(retirementDate);
        nextDay.setDate(nextDay.getDate() + 1); // 退職日の翌日
        const nextDayYear = nextDay.getFullYear();
        const nextDayMonth = nextDay.getMonth() + 1;
        
        // 7月が退職日の翌日が含まれる月以降なら除外
        if (targetYear > nextDayYear || (targetYear === nextDayYear && 7 >= nextDayMonth)) {
          continue;
        }
      }

      // 6月給与が確定済みか確認
      const juneSalary = await this.salaryDataService.getSalaryData(employee.id!, targetYear, 6);
      if (!juneSalary || !juneSalary.isConfirmed) continue;

      const department = departments.find(d => d.id === employee.departmentId);
      const calculation = calculations.find(c => c.employeeId === employee.id);

      rows.push({
        employeeId: employee.id!,
        employeeNumber: employee.employeeNumber,
        employeeName: `${employee.lastName} ${employee.firstName}`,
        departmentName: department?.name,
        calculation: calculation || null
      });
    }

    return rows;
  }

  private async createMonthlyChangeRows(
    employees: Employee[],
    departments: any[],
    calculations: StandardRewardCalculation[],
    filterYear?: number,
    filterMonth?: number
  ): Promise<StandardRewardCalculationListRow[]> {
    const rows: StandardRewardCalculationListRow[] = [];
    
    // フィルタが指定されていない場合はスキップ
    if (!filterYear || !filterMonth) {
      return rows;
    }

    // A月フィルタの場合：(A-2)月が変動月かチェック（(A-3)月と(A-2)月を比較）
    // 変動月を含む3か月期間：(A-2)月からA月まで
    let changeMonthYear = filterYear;
    let changeMonth = filterMonth - 2;
    if (changeMonth < 1) {
      changeMonth += 12;
      changeMonthYear--;
    }

    // 前月（(A-3)月）を計算
    let previousMonthYear = changeMonthYear;
    let previousMonth = changeMonth - 1;
    if (previousMonth < 1) {
      previousMonth += 12;
      previousMonthYear--;
    }
    
    for (const employee of employees) {
      // 退職日の翌日が含まれる月以降は除外
      if (employee.retirementDate) {
        const retirementDate = employee.retirementDate instanceof Date ? employee.retirementDate : new Date((employee.retirementDate as any).seconds * 1000);
        const nextDay = new Date(retirementDate);
        nextDay.setDate(nextDay.getDate() + 1); // 退職日の翌日
        const nextDayYear = nextDay.getFullYear();
        const nextDayMonth = nextDay.getMonth() + 1;
        
        // フィルタで指定された月（A月）が退職日の翌日が含まれる月以降なら除外
        if (filterYear > nextDayYear || (filterYear === nextDayYear && filterMonth >= nextDayMonth)) {
          continue;
        }
      }

      // フィルタで指定された月（A月）の給与が確定済みか確認
      const filterMonthSalary = await this.salaryDataService.getSalaryData(employee.id!, filterYear, filterMonth);
      if (!filterMonthSalary || !filterMonthSalary.isConfirmed) continue;

      // (A-3)月と(A-2)月の固定賃金を比較して変動があるかチェック
      const previousMonthSalary = await this.salaryDataService.getSalaryData(employee.id!, previousMonthYear, previousMonth);
      const changeMonthSalary = await this.salaryDataService.getSalaryData(employee.id!, changeMonthYear, changeMonth);
      
      if (!previousMonthSalary || !previousMonthSalary.isConfirmed || 
          !changeMonthSalary || !changeMonthSalary.isConfirmed) {
        continue;
      }

      // 固定賃金に変動がない場合はスキップ
      if (previousMonthSalary.fixedSalary === changeMonthSalary.fixedSalary) {
        continue;
      }

      // 変動月を含む3か月間（(A-2)月からA月まで）で基礎日数17日以上を満たすか確認
      let allMonthsValid = true;
      let checkYear = changeMonthYear;
      let checkMonth = changeMonth;
      
      for (let i = 0; i < 3; i++) {
        const salary = await this.salaryDataService.getSalaryData(employee.id!, checkYear, checkMonth);
        if (!salary || !salary.isConfirmed || salary.baseDays < 17) {
          allMonthsValid = false;
          break;
        }
        checkMonth++;
        if (checkMonth > 12) {
          checkMonth = 1;
          checkYear++;
        }
      }

      if (!allMonthsValid) continue;

      const department = departments.find(d => d.id === employee.departmentId);
      // 変動月に一致する計算履歴を取得
      const calculation = calculations.find(c => {
        if (c.employeeId !== employee.id) return false;
        return c.changeMonth?.year === changeMonthYear && c.changeMonth?.month === changeMonth;
      });

      rows.push({
        employeeId: employee.id!,
        employeeNumber: employee.employeeNumber,
        employeeName: `${employee.lastName} ${employee.firstName}`,
        departmentName: department?.name,
        calculation: calculation || null
      });
    }

    return rows;
  }

  onTabChange(index: number): void {
    this.selectedTabIndex = index;
    // タブ切り替え時に該当タブのデータを読み込み
    if (index === 0) {
      this.loadStandardCalculations();
    } else if (index === 1) {
      this.loadMonthlyChangeCalculations();
    }
  }

  async executeStandardCalculation(employeeId: string): Promise<void> {
    if (!this.currentUser?.uid) return;
    
    const targetYear = this.standardSearchForm.value.year || this.currentYear;
    
    try {
      const calculation = await this.calculationService.calculateStandardReward(employeeId, targetYear, this.currentUser.uid);
      const calculationId = await this.calculationService.saveCalculation(calculation);
      this.snackBar.open('算定計算を実行しました', '閉じる', { duration: 2000 });
      await this.loadStandardCalculations();
    } catch (error: any) {
      console.error('算定計算の実行に失敗しました:', error);
      this.snackBar.open(error.message || '算定計算の実行に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  async executeMonthlyChangeCalculation(employeeId: string): Promise<void> {
    if (!this.currentUser?.uid) return;
    
    const filterYear = this.monthlyChangeSearchForm.value.year;
    const filterMonth = this.monthlyChangeSearchForm.value.month;

    if (!filterYear || !filterMonth) {
      this.snackBar.open('年と月を選択してください', '閉じる', { duration: 3000 });
      return;
    }
    
    try {
      // A月フィルタの場合：(A-2)月が変動月
      let changeMonthYear = filterYear;
      let changeMonth = filterMonth - 2;
      if (changeMonth < 1) {
        changeMonth += 12;
        changeMonthYear--;
      }

      const calculation = await this.calculationService.calculateMonthlyChange(
        employeeId,
        changeMonthYear,
        changeMonth,
        this.currentUser.uid
      );
      const calculationId = await this.calculationService.saveCalculation(calculation);
      this.snackBar.open('月変計算を実行しました', '閉じる', { duration: 2000 });
      await this.loadMonthlyChangeCalculations();
    } catch (error: any) {
      console.error('月変計算の実行に失敗しました:', error);
      this.snackBar.open(error.message || '月変計算の実行に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  viewDetail(row: StandardRewardCalculationListRow): void {
    if (row.calculation?.id) {
      // 計算履歴詳細画面への遷移
      this.router.navigate(['/standard-reward-calculations', row.calculation.id]);
    }
  }

  createApplication(row: StandardRewardCalculationListRow): void {
    if (!row.calculation || !row.calculation.id) return;
    
    // 申請作成画面への遷移（計算履歴IDをクエリパラメータで渡す）
    this.router.navigate(['/applications/create'], {
      queryParams: {
        fromCalculation: row.calculation.id
      }
    });
  }

  navigateToSalaryInput(): void {
    this.router.navigate(['/salary-input']);
  }

  // 算定タブの選択状態管理
  isStandardSelected(row: StandardRewardCalculationListRow): boolean {
    if (row.calculation?.id && row.calculation.status === 'draft') {
      return this.selectedStandardCalculations.has(row.calculation.id);
    } else if (!row.calculation) {
      return this.selectedStandardEmployees.has(row.employeeId);
    }
    return false;
  }

  toggleStandardSelection(row: StandardRewardCalculationListRow): void {
    if (row.calculation?.id && row.calculation.status === 'draft') {
      const calculationId = row.calculation.id;
      if (this.selectedStandardCalculations.has(calculationId)) {
        this.selectedStandardCalculations.delete(calculationId);
      } else {
        this.selectedStandardCalculations.add(calculationId);
      }
    } else if (!row.calculation) {
      if (this.selectedStandardEmployees.has(row.employeeId)) {
        this.selectedStandardEmployees.delete(row.employeeId);
      } else {
        this.selectedStandardEmployees.add(row.employeeId);
      }
    }
  }

  isAllStandardSelected(): boolean {
    const selectableRows = this.standardRows.filter(row => 
      (!row.calculation) || (row.calculation.status === 'draft' && row.calculation.id)
    );
    return selectableRows.length > 0 && selectableRows.every(row => this.isStandardSelected(row));
  }

  isSomeStandardSelected(): boolean {
    const selectableRows = this.standardRows.filter(row => 
      (!row.calculation) || (row.calculation.status === 'draft' && row.calculation.id)
    );
    const selectedCount = selectableRows.filter(row => this.isStandardSelected(row)).length;
    return selectedCount > 0 && selectedCount < selectableRows.length;
  }

  toggleAllStandard(): void {
    const selectableRows = this.standardRows.filter(row => 
      (!row.calculation) || (row.calculation.status === 'draft' && row.calculation.id)
    );
    
    if (this.isAllStandardSelected()) {
      selectableRows.forEach(row => {
        if (row.calculation?.id && row.calculation.status === 'draft') {
          this.selectedStandardCalculations.delete(row.calculation.id);
        } else if (!row.calculation) {
          this.selectedStandardEmployees.delete(row.employeeId);
        }
      });
    } else {
      selectableRows.forEach(row => {
        if (row.calculation?.id && row.calculation.status === 'draft') {
          this.selectedStandardCalculations.add(row.calculation.id);
        } else if (!row.calculation) {
          this.selectedStandardEmployees.add(row.employeeId);
        }
      });
    }
  }

  // 月変タブの選択状態管理
  isMonthlyChangeSelected(row: StandardRewardCalculationListRow): boolean {
    if (row.calculation?.id && row.calculation.status === 'draft') {
      return this.selectedMonthlyChangeCalculations.has(row.calculation.id);
    } else if (!row.calculation) {
      return this.selectedMonthlyChangeEmployees.has(row.employeeId);
    }
    return false;
  }

  toggleMonthlyChangeSelection(row: StandardRewardCalculationListRow): void {
    if (row.calculation?.id && row.calculation.status === 'draft') {
      const calculationId = row.calculation.id;
      if (this.selectedMonthlyChangeCalculations.has(calculationId)) {
        this.selectedMonthlyChangeCalculations.delete(calculationId);
      } else {
        this.selectedMonthlyChangeCalculations.add(calculationId);
      }
    } else if (!row.calculation) {
      if (this.selectedMonthlyChangeEmployees.has(row.employeeId)) {
        this.selectedMonthlyChangeEmployees.delete(row.employeeId);
      } else {
        this.selectedMonthlyChangeEmployees.add(row.employeeId);
      }
    }
  }

  isAllMonthlyChangeSelected(): boolean {
    const selectableRows = this.monthlyChangeRows.filter(row => 
      (!row.calculation) || (row.calculation.status === 'draft' && row.calculation.id)
    );
    return selectableRows.length > 0 && selectableRows.every(row => this.isMonthlyChangeSelected(row));
  }

  isSomeMonthlyChangeSelected(): boolean {
    const selectableRows = this.monthlyChangeRows.filter(row => 
      (!row.calculation) || (row.calculation.status === 'draft' && row.calculation.id)
    );
    const selectedCount = selectableRows.filter(row => this.isMonthlyChangeSelected(row)).length;
    return selectedCount > 0 && selectedCount < selectableRows.length;
  }

  toggleAllMonthlyChange(): void {
    const selectableRows = this.monthlyChangeRows.filter(row => 
      (!row.calculation) || (row.calculation.status === 'draft' && row.calculation.id)
    );
    
    if (this.isAllMonthlyChangeSelected()) {
      selectableRows.forEach(row => {
        if (row.calculation?.id && row.calculation.status === 'draft') {
          this.selectedMonthlyChangeCalculations.delete(row.calculation.id);
        } else if (!row.calculation) {
          this.selectedMonthlyChangeEmployees.delete(row.employeeId);
        }
      });
    } else {
      selectableRows.forEach(row => {
        if (row.calculation?.id && row.calculation.status === 'draft') {
          this.selectedMonthlyChangeCalculations.add(row.calculation.id);
        } else if (!row.calculation) {
          this.selectedMonthlyChangeEmployees.add(row.employeeId);
        }
      });
    }
  }

  // 算定タブの一括計算実行
  async executeBulkStandardCalculation(): Promise<void> {
    if (!this.organizationId || this.selectedStandardEmployees.size === 0) {
      return;
    }

    const targetYear = this.standardSearchForm.value.year || this.currentYear;
    const currentUser = this.authService.getCurrentUser();

    if (!currentUser?.uid) {
      this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    const confirmed = confirm(`${this.selectedStandardEmployees.size}件の算定計算を実行しますか？`);
    if (!confirmed) {
      return;
    }

    try {
      this.snackBar.open('算定計算を実行中です...', '閉じる', { duration: 2000 });
      
      const employeeIds = Array.from(this.selectedStandardEmployees);
      const calculations: StandardRewardCalculation[] = [];
      const skippedEmployees: string[] = [];
      
      for (const employeeId of employeeIds) {
        try {
          const calculation = await this.calculationService.calculateStandardReward(employeeId, targetYear, currentUser.uid);
          const calculationId = await this.calculationService.saveCalculation(calculation);
          calculations.push(calculation);
        } catch (error: any) {
          console.error(`社員 ${employeeId} の算定計算に失敗しました:`, error);
          const employee = await this.employeeService.getEmployee(employeeId);
          if (employee) {
            skippedEmployees.push(employee.employeeNumber);
          }
        }
      }
      
      this.selectedStandardEmployees.clear();
      
      let message = `${calculations.length}件の算定計算が完了しました`;
      if (skippedEmployees.length > 0) {
        message += `（${skippedEmployees.length}件はスキップ）`;
      }
      
      this.snackBar.open(message, '閉じる', { duration: 5000 });
      await this.loadStandardCalculations();
    } catch (error) {
      console.error('算定計算の実行に失敗しました:', error);
      this.snackBar.open('算定計算の実行に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  // 算定タブの一括確定
  async confirmSelectedStandardCalculations(): Promise<void> {
    if (this.selectedStandardCalculations.size === 0) {
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.uid) {
      this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    const confirmed = confirm(`${this.selectedStandardCalculations.size}件の算定計算結果を確定しますか？`);
    if (!confirmed) {
      return;
    }

    try {
      const calculationIds = Array.from(this.selectedStandardCalculations);
      await this.calculationService.confirmCalculations(calculationIds, currentUser.uid);
      this.selectedStandardCalculations.clear();
      this.snackBar.open(`${calculationIds.length}件の算定計算結果を確定しました`, '閉じる', { duration: 3000 });
      await this.loadStandardCalculations();
    } catch (error) {
      console.error('算定計算結果の確定に失敗しました:', error);
      this.snackBar.open('算定計算結果の確定に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  // 月変タブの一括計算実行
  async executeBulkMonthlyChangeCalculation(): Promise<void> {
    if (!this.organizationId || this.selectedMonthlyChangeEmployees.size === 0) {
      return;
    }

    const filterYear = this.monthlyChangeSearchForm.value.year;
    const filterMonth = this.monthlyChangeSearchForm.value.month;

    if (!filterYear || !filterMonth) {
      this.snackBar.open('年と月を選択してください', '閉じる', { duration: 3000 });
      return;
    }

    const currentUser = this.authService.getCurrentUser();

    if (!currentUser?.uid) {
      this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    const confirmed = confirm(`${this.selectedMonthlyChangeEmployees.size}件の月変計算を実行しますか？`);
    if (!confirmed) {
      return;
    }

    try {
      this.snackBar.open('月変計算を実行中です...', '閉じる', { duration: 2000 });
      
      // A月フィルタの場合：(A-2)月が変動月
      let changeMonthYear = filterYear;
      let changeMonth = filterMonth - 2;
      if (changeMonth < 1) {
        changeMonth += 12;
        changeMonthYear--;
      }

      const employeeIds = Array.from(this.selectedMonthlyChangeEmployees);
      const calculations: StandardRewardCalculation[] = [];
      const skippedEmployees: string[] = [];
      
      for (const employeeId of employeeIds) {
        try {
          const calculation = await this.calculationService.calculateMonthlyChange(
            employeeId,
            changeMonthYear,
            changeMonth,
            currentUser.uid
          );
          const calculationId = await this.calculationService.saveCalculation(calculation);
          calculations.push(calculation);
        } catch (error: any) {
          console.error(`社員 ${employeeId} の月変計算に失敗しました:`, error);
          const employee = await this.employeeService.getEmployee(employeeId);
          if (employee) {
            skippedEmployees.push(employee.employeeNumber);
          }
        }
      }
      
      this.selectedMonthlyChangeEmployees.clear();
      
      let message = `${calculations.length}件の月変計算が完了しました`;
      if (skippedEmployees.length > 0) {
        message += `（${skippedEmployees.length}件はスキップ）`;
      }
      
      this.snackBar.open(message, '閉じる', { duration: 5000 });
      await this.loadMonthlyChangeCalculations();
    } catch (error) {
      console.error('月変計算の実行に失敗しました:', error);
      this.snackBar.open('月変計算の実行に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  // 月変タブの一括確定
  async confirmSelectedMonthlyChangeCalculations(): Promise<void> {
    if (this.selectedMonthlyChangeCalculations.size === 0) {
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.uid) {
      this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    const confirmed = confirm(`${this.selectedMonthlyChangeCalculations.size}件の月変計算結果を確定しますか？`);
    if (!confirmed) {
      return;
    }

    try {
      const calculationIds = Array.from(this.selectedMonthlyChangeCalculations);
      await this.calculationService.confirmCalculations(calculationIds, currentUser.uid);
      this.selectedMonthlyChangeCalculations.clear();
      this.snackBar.open(`${calculationIds.length}件の月変計算結果を確定しました`, '閉じる', { duration: 3000 });
      await this.loadMonthlyChangeCalculations();
    } catch (error) {
      console.error('月変計算結果の確定に失敗しました:', error);
      this.snackBar.open('月変計算結果の確定に失敗しました', '閉じる', { duration: 3000 });
    }
  }
}

