import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import * as XLSX from 'xlsx';
import { AuthService } from '../../../core/auth/auth.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { DepartmentService } from '../../../core/services/department.service';
import { SalaryDataService } from '../../../core/services/salary-data.service';
import { BonusDataService } from '../../../core/services/bonus-data.service';
import { CalculationService } from '../../../core/services/calculation.service';
import { Employee } from '../../../core/models/employee.model';
import { Department } from '../../../core/models/department.model';
import { MonthlyCalculation } from '../../../core/models/monthly-calculation.model';
import { BonusCalculation } from '../../../core/models/bonus-calculation.model';

interface ExportDataOption {
  value: string;
  label: string;
  selected: boolean;
}

@Component({
  selector: 'app-employee-export',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatTableModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatChipsModule
  ],
  templateUrl: './employee-export.component.html',
  styleUrl: './employee-export.component.css'
})
export class EmployeeExportComponent implements OnInit {
  private authService = inject(AuthService);
  private employeeService = inject(EmployeeService);
  private departmentService = inject(DepartmentService);
  private salaryDataService = inject(SalaryDataService);
  private bonusDataService = inject(BonusDataService);
  private calculationService = inject(CalculationService);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  organizationId: string | null = null;
  isLoading = false;

  // フォーム
  filterForm: FormGroup;
  
  // 年月選択（保険料・給与情報用）
  selectedYear: number = new Date().getFullYear();
  selectedMonth: number = new Date().getMonth() + 1;
  years: number[] = [];
  months: number[] = Array.from({ length: 12 }, (_, i) => i + 1);
  
  // データ
  allEmployees: Employee[] = [];
  filteredEmployees: Employee[] = [];
  departments: Department[] = [];
  
  // テーブル
  displayedColumns: string[] = ['select', 'employeeNumber', 'name', 'department', 'status'];
  dataSource = new MatTableDataSource<Employee>([]);
  
  // 選択状態
  allSelected = false;
  someSelected = false;
  selectedEmployeeIds = new Set<string>();

  // エクスポートオプション
  dataTypeOptions: ExportDataOption[] = [
    { value: 'basic', label: '基本情報', selected: true },
    { value: 'address', label: '住所情報', selected: true },
    { value: 'insurance', label: '保険情報', selected: true },
    { value: 'dependent', label: '扶養情報', selected: true },
    { value: 'otherCompany', label: '他社勤務情報', selected: true },
    { value: 'monthlyPremium', label: '保険料情報（月次）', selected: true },
    { value: 'bonusPremium', label: '保険料情報（賞与）', selected: true },
    { value: 'salary', label: '給与情報', selected: true }
  ];

  // 出力形式（'excel' | 'csv'）
  exportFormat: 'excel' | 'csv' = 'excel';

  constructor() {
    this.filterForm = this.fb.group({
      keyword: [''],
      departmentId: [''],
      status: ['']
    });
  }

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      this.snackBar.open('組織情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    this.organizationId = currentUser.organizationId;
    this.initializeYears();
    this.loadDepartments();
    this.loadEmployees();
    
    // フィルタ変更を監視
    this.filterForm.valueChanges.subscribe(() => {
      this.applyFilters();
    });
  }

  /**
   * 年リストを初期化
   */
  private initializeYears(): void {
    const currentYear = new Date().getFullYear();
    this.years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  }

  /**
   * 部署一覧を読み込む
   */
  private async loadDepartments(): Promise<void> {
    if (!this.organizationId) return;

    try {
      this.departments = await this.departmentService.getDepartmentsByOrganization(this.organizationId);
    } catch (error) {
      console.error('部署の読み込みに失敗しました:', error);
      this.snackBar.open('部署の読み込みに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 社員一覧を読み込む
   */
  private async loadEmployees(): Promise<void> {
    if (!this.organizationId) return;

    this.isLoading = true;
    try {
      this.allEmployees = await this.employeeService.getEmployeesByOrganization(this.organizationId);
      this.applyFilters();
    } catch (error) {
      console.error('社員の読み込みに失敗しました:', error);
      this.snackBar.open('社員の読み込みに失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * フィルタを適用
   */
  applyFilters(): void {
    const filters = this.filterForm.value;
    let filtered = [...this.allEmployees];

    // キーワード検索
    if (filters.keyword) {
      const keyword = filters.keyword.toLowerCase();
      filtered = filtered.filter(emp => {
        const name = `${emp.lastName} ${emp.firstName}`.toLowerCase();
        const nameKana = `${emp.lastNameKana} ${emp.firstNameKana}`.toLowerCase();
        const employeeNumber = emp.employeeNumber.toLowerCase();
        const email = emp.email.toLowerCase();
        return name.includes(keyword) || 
               nameKana.includes(keyword) || 
               employeeNumber.includes(keyword) || 
               email.includes(keyword);
      });
    }

    // 部署フィルタ
    if (filters.departmentId) {
      filtered = filtered.filter(emp => emp.departmentId === filters.departmentId);
    }

    // ステータスフィルタ
    if (filters.status) {
      filtered = filtered.filter(emp => emp.status === filters.status);
    }

    this.filteredEmployees = filtered;
    this.dataSource.data = filtered;
    this.updateSelectionState();
  }

  /**
   * 全選択/全解除
   */
  toggleAllSelection(): void {
    this.allSelected = !this.allSelected;
    this.filteredEmployees.forEach(emp => {
      if (this.allSelected) {
        this.selectedEmployeeIds.add(emp.id!);
      } else {
        this.selectedEmployeeIds.delete(emp.id!);
      }
    });
    this.updateSelectionState();
  }

  /**
   * 個別選択の切り替え
   */
  toggleSelection(employee: Employee): void {
    if (this.selectedEmployeeIds.has(employee.id!)) {
      this.selectedEmployeeIds.delete(employee.id!);
    } else {
      this.selectedEmployeeIds.add(employee.id!);
    }
    this.updateSelectionState();
  }

  /**
   * 選択状態を更新
   */
  private updateSelectionState(): void {
    const selectableCount = this.filteredEmployees.length;
    const selectedCount = this.filteredEmployees.filter(emp => this.selectedEmployeeIds.has(emp.id!)).length;
    
    this.allSelected = selectedCount > 0 && selectedCount === selectableCount;
    this.someSelected = selectedCount > 0 && selectedCount < selectableCount;
  }

  /**
   * 選択されているかチェック
   */
  isSelected(employee: Employee): boolean {
    return this.selectedEmployeeIds.has(employee.id!);
  }

  /**
   * エクスポート実行
   */
  async exportData(): Promise<void> {
    if (this.exportFormat === 'excel') {
      await this.exportToExcel();
    } else {
      await this.exportToCsv();
    }
  }

  /**
   * Excel形式でエクスポート
   */
  async exportToExcel(): Promise<void> {
    const selectedEmployees = this.allEmployees.filter(emp => this.selectedEmployeeIds.has(emp.id!));
    
    if (selectedEmployees.length === 0) {
      this.snackBar.open('エクスポートする社員が選択されていません', '閉じる', { duration: 3000 });
      return;
    }

    const selectedDataTypes = this.dataTypeOptions.filter(opt => opt.selected).map(opt => opt.value);
    
    if (selectedDataTypes.length === 0) {
      this.snackBar.open('エクスポートするデータ種別が選択されていません', '閉じる', { duration: 3000 });
      return;
    }

    try {
      const workbook = XLSX.utils.book_new();

      // 基本情報シート
      if (selectedDataTypes.includes('basic')) {
        const basicData = selectedEmployees.map(emp => ({
          '社員番号': emp.employeeNumber,
          '姓': emp.lastName,
          '名': emp.firstName,
          '姓（カナ）': emp.lastNameKana,
          '名（カナ）': emp.firstNameKana,
          'メールアドレス': emp.email,
          '部署名': this.getDepartmentName(emp.departmentId),
          '入社日': this.formatDate(emp.joinDate),
          '生年月日': this.formatDate(emp.birthDate),
          '退職日': this.formatDate(emp.retirementDate),
          'ステータス': this.getStatusLabel(emp.status),
          '権限': this.getRoleLabel(emp.role)
        }));
        const basicSheet = XLSX.utils.json_to_sheet(basicData);
        XLSX.utils.book_append_sheet(workbook, basicSheet, '基本情報');
      }

      // 住所情報シート
      if (selectedDataTypes.includes('address')) {
        const addressData = selectedEmployees.map(emp => ({
          '社員番号': emp.employeeNumber,
          '氏名': `${emp.lastName} ${emp.firstName}`,
          '郵便番号': emp.address?.official?.postalCode || '',
          '都道府県': emp.address?.official?.prefecture || '',
          '市区町村': emp.address?.official?.city || '',
          '町名・番地': emp.address?.official?.street || '',
          '建物名・部屋番号': emp.address?.official?.building || ''
        }));
        const addressSheet = XLSX.utils.json_to_sheet(addressData);
        XLSX.utils.book_append_sheet(workbook, addressSheet, '住所情報');
      }

      // 保険情報シート
      if (selectedDataTypes.includes('insurance')) {
        const insuranceData = selectedEmployees.map(emp => ({
          '社員番号': emp.employeeNumber,
          '氏名': `${emp.lastName} ${emp.firstName}`,
          '健康保険被保険者番号': emp.insuranceInfo?.healthInsuranceNumber || '',
          '厚生年金被保険者番号': emp.insuranceInfo?.pensionNumber || '',
          'マイナンバー': emp.insuranceInfo?.myNumber || '',
          '標準報酬月額': emp.insuranceInfo?.standardReward || '',
          '保険適用開始日': this.formatDate(emp.insuranceInfo?.insuranceStartDate)
        }));
        const insuranceSheet = XLSX.utils.json_to_sheet(insuranceData);
        XLSX.utils.book_append_sheet(workbook, insuranceSheet, '保険情報');
      }

      // 扶養情報シート
      if (selectedDataTypes.includes('dependent')) {
        const dependentData: any[] = [];
        selectedEmployees.forEach(emp => {
          if (emp.dependentInfo && emp.dependentInfo.length > 0) {
            emp.dependentInfo.forEach(dep => {
              dependentData.push({
                '社員番号': emp.employeeNumber,
                '社員名': `${emp.lastName} ${emp.firstName}`,
                '扶養者名': dep.name,
                '扶養者名（カナ）': dep.nameKana,
                '続柄': dep.relationship,
                '生年月日': this.formatDate(dep.birthDate),
                '年収': dep.income || '',
                '同一世帯': dep.livingTogether ? 'はい' : 'いいえ',
                '被扶養者になった年月日': this.formatDate(dep.becameDependentDate)
              });
            });
          } else {
            dependentData.push({
              '社員番号': emp.employeeNumber,
              '社員名': `${emp.lastName} ${emp.firstName}`,
              '扶養者名': '',
              '扶養者名（カナ）': '',
              '続柄': '',
              '生年月日': '',
              '年収': '',
              '同一世帯': '',
              '被扶養者になった年月日': ''
            });
          }
        });
        const dependentSheet = XLSX.utils.json_to_sheet(dependentData);
        XLSX.utils.book_append_sheet(workbook, dependentSheet, '扶養情報');
      }

      // 他社勤務情報シート
      if (selectedDataTypes.includes('otherCompany')) {
        const otherCompanyData: any[] = [];
        selectedEmployees.forEach(emp => {
          if (emp.otherCompanyInfo && emp.otherCompanyInfo.length > 0) {
            emp.otherCompanyInfo.forEach(company => {
              otherCompanyData.push({
                '社員番号': emp.employeeNumber,
                '社員名': `${emp.lastName} ${emp.firstName}`,
                '会社名': company.companyName,
                '主たる勤務先': company.isPrimary ? 'はい' : 'いいえ'
              });
            });
          } else {
            otherCompanyData.push({
              '社員番号': emp.employeeNumber,
              '社員名': `${emp.lastName} ${emp.firstName}`,
              '会社名': '',
              '主たる勤務先': ''
            });
          }
        });
        const otherCompanySheet = XLSX.utils.json_to_sheet(otherCompanyData);
        XLSX.utils.book_append_sheet(workbook, otherCompanySheet, '他社勤務情報');
      }

      // 保険料情報（月次）シート
      if (selectedDataTypes.includes('monthlyPremium')) {
        const monthlyPremiumData: any[] = [];
        for (const emp of selectedEmployees) {
          if (!emp.id) continue;
          const calculation = await this.calculationService.getCalculationsByEmployee(
            emp.id,
            this.selectedYear,
            this.selectedMonth
          );
          if (calculation) {
            monthlyPremiumData.push({
              '社員番号': emp.employeeNumber,
              '氏名': `${emp.lastName} ${emp.firstName}`,
              '年': this.selectedYear,
              '月': this.selectedMonth,
              '標準報酬月額': calculation.standardReward || '',
              '健康保険等級': calculation.grade || '',
              '健康保険料（全額）': calculation.healthInsurancePremium || '',
              '厚生年金料（全額）': calculation.pensionInsurancePremium || '',
              '介護保険料（全額）': calculation.careInsurancePremium || '',
              '合計保険料（全額）': calculation.totalPremium || '',
              '会社負担額（折半額）': calculation.companyShare || '',
              '従業員負担額（折半額）': calculation.employeeShare || '',
              'ステータス': this.getStatusLabel(calculation.status)
            });
          }
        }
        if (monthlyPremiumData.length > 0) {
          const monthlyPremiumSheet = XLSX.utils.json_to_sheet(monthlyPremiumData);
          XLSX.utils.book_append_sheet(workbook, monthlyPremiumSheet, `保険料情報（月次）_${this.selectedYear}年${this.selectedMonth}月`);
        }
      }

      // 保険料情報（賞与）シート
      if (selectedDataTypes.includes('bonusPremium')) {
        const bonusPremiumData: any[] = [];
        for (const emp of selectedEmployees) {
          if (!emp.id) continue;
          const calculation = await this.calculationService.getBonusCalculationsByEmployee(
            emp.id,
            this.selectedYear,
            this.selectedMonth
          );
          if (calculation) {
            bonusPremiumData.push({
              '社員番号': emp.employeeNumber,
              '氏名': `${emp.lastName} ${emp.firstName}`,
              '年': this.selectedYear,
              '月': this.selectedMonth,
              '賞与額': calculation.bonusAmount || '',
              '標準賞与額': calculation.standardBonusAmount || '',
              '健康保険料（全額）': calculation.healthInsurancePremium || '',
              '厚生年金料（全額）': calculation.pensionInsurancePremium || '',
              '介護保険料（全額）': calculation.careInsurancePremium || '',
              '合計保険料（全額）': calculation.totalPremium || '',
              '会社負担額（折半額）': calculation.companyShare || '',
              '従業員負担額（折半額）': calculation.employeeShare || '',
              'ステータス': this.getStatusLabel(calculation.status)
            });
          }
        }
        if (bonusPremiumData.length > 0) {
          const bonusPremiumSheet = XLSX.utils.json_to_sheet(bonusPremiumData);
          XLSX.utils.book_append_sheet(workbook, bonusPremiumSheet, `保険料情報（賞与）_${this.selectedYear}年${this.selectedMonth}月`);
        }
      }

      // 給与情報シート
      if (selectedDataTypes.includes('salary')) {
        const salaryData: any[] = [];
        for (const emp of selectedEmployees) {
          if (!emp.id) continue;
          const salary = await this.salaryDataService.getSalaryData(
            emp.id,
            this.selectedYear,
            this.selectedMonth
          );
          if (salary) {
            salaryData.push({
              '社員番号': emp.employeeNumber,
              '氏名': `${emp.lastName} ${emp.firstName}`,
              '年': this.selectedYear,
              '月': this.selectedMonth,
              '基礎日数': salary.baseDays || '',
              '固定賃金': salary.fixedSalary || '',
              '総支給額': salary.totalPayment || '',
              '遡及支払額': salary.retroactivePayment || '',
              '確定済み': salary.isConfirmed ? 'はい' : 'いいえ'
            });
          }
        }
        if (salaryData.length > 0) {
          const salarySheet = XLSX.utils.json_to_sheet(salaryData);
          XLSX.utils.book_append_sheet(workbook, salarySheet, `給与情報_${this.selectedYear}年${this.selectedMonth}月`);
        }
      }

      // ファイル名を生成
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const filename = `社員データ_${dateStr}.xlsx`;

      // ファイルをダウンロード
      XLSX.writeFile(workbook, filename);
      
      this.snackBar.open(`${selectedEmployees.length}件の社員データをエクスポートしました`, '閉じる', { duration: 3000 });
    } catch (error) {
      console.error('エクスポートに失敗しました:', error);
      this.snackBar.open('エクスポートに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 部署名を取得
   */
  getDepartmentName(departmentId: string): string {
    const department = this.departments.find(d => d.id === departmentId);
    return department?.name || '';
  }

  /**
   * 日付をフォーマット
   */
  private formatDate(date: Date | any): string {
    if (!date) return '';
    if (date instanceof Date) {
      return date.toLocaleDateString('ja-JP');
    }
    // Firestore Timestampの場合
    if (date && date.toDate) {
      return date.toDate().toLocaleDateString('ja-JP');
    }
    return '';
  }

  /**
   * ステータスの表示ラベルを取得
   */
  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'active': '在籍',
      'leave': '休職',
      'retired': '退職',
      'pre_join': '未入社',
      'draft': '下書き',
      'confirmed': '確定',
      'exported': '出力済み'
    };
    return labels[status] || status;
  }

  /**
   * 権限の表示ラベルを取得
   */
  private getRoleLabel(role?: string): string {
    if (!role) return '一般社員';
    const roleMap: { [key: string]: string } = {
      'admin': '管理者',
      'employee': '一般社員'
    };
    return roleMap[role] || role;
  }

  /**
   * 氏名を取得
   */
  getName(employee: Employee): string {
    return `${employee.lastName} ${employee.firstName}`;
  }

  /**
   * 保険料または給与情報が選択されているかチェック
   */
  hasPremiumOrSalarySelected(): boolean {
    return this.dataTypeOptions.some(opt => 
      opt.selected && (opt.value === 'monthlyPremium' || opt.value === 'bonusPremium' || opt.value === 'salary')
    );
  }

  /**
   * CSV形式でエクスポート
   */
  async exportToCsv(): Promise<void> {
    const selectedEmployees = this.allEmployees.filter(emp => this.selectedEmployeeIds.has(emp.id!));
    
    if (selectedEmployees.length === 0) {
      this.snackBar.open('エクスポートする社員が選択されていません', '閉じる', { duration: 3000 });
      return;
    }

    const selectedDataTypes = this.dataTypeOptions.filter(opt => opt.selected).map(opt => opt.value);
    
    if (selectedDataTypes.length === 0) {
      this.snackBar.open('エクスポートするデータ種別が選択されていません', '閉じる', { duration: 3000 });
      return;
    }

    try {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      let exportedCount = 0;

      // 基本情報CSV
      if (selectedDataTypes.includes('basic')) {
        const basicData = selectedEmployees.map(emp => ({
          '社員番号': emp.employeeNumber,
          '姓': emp.lastName,
          '名': emp.firstName,
          '姓（カナ）': emp.lastNameKana,
          '名（カナ）': emp.firstNameKana,
          'メールアドレス': emp.email,
          '部署名': this.getDepartmentName(emp.departmentId),
          '入社日': this.formatDate(emp.joinDate),
          '生年月日': this.formatDate(emp.birthDate),
          '退職日': this.formatDate(emp.retirementDate),
          'ステータス': this.getStatusLabel(emp.status),
          '権限': this.getRoleLabel(emp.role)
        }));
        this.downloadCsv(basicData, `基本情報_${dateStr}.csv`);
        exportedCount++;
      }

      // 住所情報CSV
      if (selectedDataTypes.includes('address')) {
        const addressData = selectedEmployees.map(emp => ({
          '社員番号': emp.employeeNumber,
          '氏名': `${emp.lastName} ${emp.firstName}`,
          '郵便番号': emp.address?.official?.postalCode || '',
          '都道府県': emp.address?.official?.prefecture || '',
          '市区町村': emp.address?.official?.city || '',
          '町名・番地': emp.address?.official?.street || '',
          '建物名・部屋番号': emp.address?.official?.building || ''
        }));
        this.downloadCsv(addressData, `住所情報_${dateStr}.csv`);
        exportedCount++;
      }

      // 保険情報CSV
      if (selectedDataTypes.includes('insurance')) {
        const insuranceData = selectedEmployees.map(emp => ({
          '社員番号': emp.employeeNumber,
          '氏名': `${emp.lastName} ${emp.firstName}`,
          '健康保険被保険者番号': emp.insuranceInfo?.healthInsuranceNumber || '',
          '厚生年金被保険者番号': emp.insuranceInfo?.pensionNumber || '',
          'マイナンバー': emp.insuranceInfo?.myNumber || '',
          '標準報酬月額': emp.insuranceInfo?.standardReward || '',
          '保険適用開始日': this.formatDate(emp.insuranceInfo?.insuranceStartDate)
        }));
        this.downloadCsv(insuranceData, `保険情報_${dateStr}.csv`);
        exportedCount++;
      }

      // 扶養情報CSV
      if (selectedDataTypes.includes('dependent')) {
        const dependentData: any[] = [];
        selectedEmployees.forEach(emp => {
          if (emp.dependentInfo && emp.dependentInfo.length > 0) {
            emp.dependentInfo.forEach(dep => {
              dependentData.push({
                '社員番号': emp.employeeNumber,
                '社員名': `${emp.lastName} ${emp.firstName}`,
                '扶養者名': dep.name,
                '扶養者名（カナ）': dep.nameKana,
                '続柄': dep.relationship,
                '生年月日': this.formatDate(dep.birthDate),
                '年収': dep.income || '',
                '同一世帯': dep.livingTogether ? 'はい' : 'いいえ',
                '被扶養者になった年月日': this.formatDate(dep.becameDependentDate)
              });
            });
          } else {
            dependentData.push({
              '社員番号': emp.employeeNumber,
              '社員名': `${emp.lastName} ${emp.firstName}`,
              '扶養者名': '',
              '扶養者名（カナ）': '',
              '続柄': '',
              '生年月日': '',
              '年収': '',
              '同一世帯': '',
              '被扶養者になった年月日': ''
            });
          }
        });
        this.downloadCsv(dependentData, `扶養情報_${dateStr}.csv`);
        exportedCount++;
      }

      // 他社勤務情報CSV
      if (selectedDataTypes.includes('otherCompany')) {
        const otherCompanyData: any[] = [];
        selectedEmployees.forEach(emp => {
          if (emp.otherCompanyInfo && emp.otherCompanyInfo.length > 0) {
            emp.otherCompanyInfo.forEach(company => {
              otherCompanyData.push({
                '社員番号': emp.employeeNumber,
                '社員名': `${emp.lastName} ${emp.firstName}`,
                '会社名': company.companyName,
                '主たる勤務先': company.isPrimary ? 'はい' : 'いいえ'
              });
            });
          } else {
            otherCompanyData.push({
              '社員番号': emp.employeeNumber,
              '社員名': `${emp.lastName} ${emp.firstName}`,
              '会社名': '',
              '主たる勤務先': ''
            });
          }
        });
        this.downloadCsv(otherCompanyData, `他社勤務情報_${dateStr}.csv`);
        exportedCount++;
      }

      // 保険料情報（月次）CSV
      if (selectedDataTypes.includes('monthlyPremium')) {
        const monthlyPremiumData: any[] = [];
        for (const emp of selectedEmployees) {
          if (!emp.id) continue;
          const calculation = await this.calculationService.getCalculationsByEmployee(
            emp.id,
            this.selectedYear,
            this.selectedMonth
          );
          if (calculation) {
            monthlyPremiumData.push({
              '社員番号': emp.employeeNumber,
              '氏名': `${emp.lastName} ${emp.firstName}`,
              '年': this.selectedYear,
              '月': this.selectedMonth,
              '標準報酬月額': calculation.standardReward || '',
              '健康保険等級': calculation.grade || '',
              '健康保険料（全額）': calculation.healthInsurancePremium || '',
              '厚生年金料（全額）': calculation.pensionInsurancePremium || '',
              '介護保険料（全額）': calculation.careInsurancePremium || '',
              '合計保険料（全額）': calculation.totalPremium || '',
              '会社負担額（折半額）': calculation.companyShare || '',
              '従業員負担額（折半額）': calculation.employeeShare || '',
              'ステータス': this.getStatusLabel(calculation.status)
            });
          }
        }
        if (monthlyPremiumData.length > 0) {
          this.downloadCsv(monthlyPremiumData, `保険料情報（月次）_${this.selectedYear}年${this.selectedMonth}月_${dateStr}.csv`);
          exportedCount++;
        }
      }

      // 保険料情報（賞与）CSV
      if (selectedDataTypes.includes('bonusPremium')) {
        const bonusPremiumData: any[] = [];
        for (const emp of selectedEmployees) {
          if (!emp.id) continue;
          const calculation = await this.calculationService.getBonusCalculationsByEmployee(
            emp.id,
            this.selectedYear,
            this.selectedMonth
          );
          if (calculation) {
            bonusPremiumData.push({
              '社員番号': emp.employeeNumber,
              '氏名': `${emp.lastName} ${emp.firstName}`,
              '年': this.selectedYear,
              '月': this.selectedMonth,
              '賞与額': calculation.bonusAmount || '',
              '標準賞与額': calculation.standardBonusAmount || '',
              '健康保険料（全額）': calculation.healthInsurancePremium || '',
              '厚生年金料（全額）': calculation.pensionInsurancePremium || '',
              '介護保険料（全額）': calculation.careInsurancePremium || '',
              '合計保険料（全額）': calculation.totalPremium || '',
              '会社負担額（折半額）': calculation.companyShare || '',
              '従業員負担額（折半額）': calculation.employeeShare || '',
              'ステータス': this.getStatusLabel(calculation.status)
            });
          }
        }
        if (bonusPremiumData.length > 0) {
          this.downloadCsv(bonusPremiumData, `保険料情報（賞与）_${this.selectedYear}年${this.selectedMonth}月_${dateStr}.csv`);
          exportedCount++;
        }
      }

      // 給与情報CSV
      if (selectedDataTypes.includes('salary')) {
        const salaryData: any[] = [];
        for (const emp of selectedEmployees) {
          if (!emp.id) continue;
          const salary = await this.salaryDataService.getSalaryData(
            emp.id,
            this.selectedYear,
            this.selectedMonth
          );
          if (salary) {
            salaryData.push({
              '社員番号': emp.employeeNumber,
              '氏名': `${emp.lastName} ${emp.firstName}`,
              '年': this.selectedYear,
              '月': this.selectedMonth,
              '基礎日数': salary.baseDays || '',
              '固定賃金': salary.fixedSalary || '',
              '総支給額': salary.totalPayment || '',
              '遡及支払額': salary.retroactivePayment || '',
              '確定済み': salary.isConfirmed ? 'はい' : 'いいえ'
            });
          }
        }
        if (salaryData.length > 0) {
          this.downloadCsv(salaryData, `給与情報_${this.selectedYear}年${this.selectedMonth}月_${dateStr}.csv`);
          exportedCount++;
        }
      }

      this.snackBar.open(`${exportedCount}件のCSVファイルをエクスポートしました`, '閉じる', { duration: 3000 });
    } catch (error) {
      console.error('エクスポートに失敗しました:', error);
      this.snackBar.open('エクスポートに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * CSV形式の文字列を生成してダウンロード
   */
  private downloadCsv(data: any[], filename: string): void {
    if (data.length === 0) return;

    // ヘッダー行を取得
    const headers = Object.keys(data[0]);
    
    // CSV形式の文字列を生成
    const csvRows: string[] = [];
    
    // ヘッダー行を追加
    csvRows.push(headers.map(h => this.escapeCsvValue(h)).join(','));

    // データ行を追加
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header];
        return this.escapeCsvValue(value !== null && value !== undefined ? String(value) : '');
      });
      csvRows.push(values.join(','));
    });

    // BOMを追加（Excelで文字化けを防ぐため）
    const csvContent = '\uFEFF' + csvRows.join('\n');

    // Blobを作成してダウンロード
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * CSV値のエスケープ処理
   */
  private escapeCsvValue(value: string): string {
    if (value === null || value === undefined) {
      return '';
    }
    const stringValue = String(value);
    // カンマ、ダブルクォート、改行が含まれる場合はダブルクォートで囲む
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  }
}
