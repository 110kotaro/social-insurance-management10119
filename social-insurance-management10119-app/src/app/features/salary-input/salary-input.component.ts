import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormArray, FormControl, FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import * as XLSX from 'xlsx';
import { EmployeeService } from '../../core/services/employee.service';
import { SalaryDataService } from '../../core/services/salary-data.service';
import { BonusDataService } from '../../core/services/bonus-data.service';
import { DepartmentService } from '../../core/services/department.service';
import { AuthService } from '../../core/auth/auth.service';
import { Employee, SalaryData } from '../../core/models/employee.model';
import { Department } from '../../core/models/department.model';
import { SalarySampleDialogComponent } from '../external-integration/salary-import/salary-sample-dialog.component';

interface ImportedSalaryData {
  employeeNumber: string;
  employeeName: string;
  employeeId?: string;
  year: number;
  month: number;
  baseDays: number;
  fixedSalary: number;
  totalPayment: number;
  retroactivePayment: number;
  bonus: number;
  bonusPaymentDate?: Date | null;
  errors?: string[];
  selected?: boolean;
}

interface SalaryInputRow {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  departmentName: string;
  baseDays: number | null;
  fixedSalary: number | null;
  totalPayment: number | null;
  retroactivePayment: number | null;
  bonus: number | null;
  bonusPaymentDate: Date | null; // 賞与支払日
  bonusIsConfirmed: boolean;
  isConfirmed: boolean;
  hasError: boolean;
  errorMessage?: string;
}

@Component({
  selector: 'app-salary-input',
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
    MatTableModule,
    MatSnackBarModule,
    MatSelectModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatTooltipModule
  ],
  templateUrl: './salary-input.component.html',
  styleUrl: './salary-input.component.css'
})
export class SalaryInputComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private salaryDataService = inject(SalaryDataService);
  private bonusDataService = inject(BonusDataService);
  private departmentService = inject(DepartmentService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);

  employees: Employee[] = [];
  departments: Department[] = [];
  organizationId: string | null = null;
  currentUser: any = null;
  hideExport: boolean = false; // 出力ボタンを非表示にするフラグ

  // 年月選択
  selectedYear: number = new Date().getFullYear();
  selectedMonth: number = new Date().getMonth() + 1;
  years: number[] = [];
  months: number[] = Array.from({ length: 12 }, (_, i) => i + 1);

  // フィルタ
  filterForm: FormGroup;
  selectedDepartmentId: string | null = null;
  employeeNameFilter: string = '';
  confirmedFilter: 'all' | 'confirmed' | 'unconfirmed' = 'all';

  // テーブル
  displayedColumns: string[] = ['employeeNumber', 'employeeName', 'departmentName', 'baseDays', 'fixedSalary', 'totalPayment', 'retroactivePayment', 'bonus', 'bonusPaymentDate', 'isConfirmed', 'actions'];
  dataSource = new MatTableDataSource<SalaryInputRow>([]);
  salaryRows: SalaryInputRow[] = [];

  isLoading = false;
  isSaving = false;
  isConfirming = false;
  isValidating = false;

  // インポート関連
  importedSalaryData: ImportedSalaryData[] = [];
  importPreviewDataSource = new MatTableDataSource<ImportedSalaryData>([]);
  importErrors: string[] = [];
  importDisplayedColumns: string[] = ['select', 'employeeNumber', 'employeeName', 'year', 'month', 'baseDays', 'fixedSalary', 'totalPayment', 'retroactivePayment', 'bonus', 'errors'];
  allSelected = false;
  someSelected = false;

  constructor() {
    this.filterForm = this.fb.group({
      departmentId: [''],
      employeeName: [''],
      confirmed: ['all']
    });
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    if (!this.currentUser?.organizationId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.organizationId = this.currentUser.organizationId;
    
    // クエリパラメータからhideExportを取得
    this.route.queryParams.subscribe(params => {
      this.hideExport = params['hideExport'] === 'true';
    });
    
    // 年のリストを生成（現在年から5年前まで）
    const currentYear = new Date().getFullYear();
    this.years = Array.from({ length: 6 }, (_, i) => currentYear - i);

    this.loadDepartments();
    this.loadEmployees();
  }

  async loadDepartments(): Promise<void> {
    if (!this.organizationId) return;
    try {
      this.departments = await this.departmentService.getDepartmentsByOrganization(this.organizationId);
    } catch (error) {
      console.error('部署の読み込みに失敗しました:', error);
      this.snackBar.open('部署の読み込みに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  async loadEmployees(): Promise<void> {
    if (!this.organizationId) return;
    this.isLoading = true;
    try {
      this.employees = await this.employeeService.getEmployeesByOrganization(this.organizationId);
      this.loadSalaryData();
    } catch (error) {
      console.error('社員の読み込みに失敗しました:', error);
      this.snackBar.open('社員の読み込みに失敗しました', '閉じる', { duration: 3000 });
      this.isLoading = false;
    }
  }

  async loadSalaryData(): Promise<void> {
    if (!this.organizationId) return;
    
    this.isLoading = true;
    try {
      const rows: SalaryInputRow[] = [];
      
      for (const employee of this.employees) {
        const salaryData = await this.salaryDataService.getSalaryData(employee.id!, this.selectedYear, this.selectedMonth);
        const bonusData = await this.bonusDataService.getBonusData(employee.id!, this.selectedYear, this.selectedMonth);
        const department = this.departments.find(d => d.id === employee.departmentId);
        
        // 賞与支払日をDateオブジェクトに変換
        let bonusPaymentDate: Date | null = null;
        if (bonusData?.bonusPaymentDate) {
          if (bonusData.bonusPaymentDate instanceof Date) {
            bonusPaymentDate = bonusData.bonusPaymentDate;
          } else if (bonusData.bonusPaymentDate && typeof (bonusData.bonusPaymentDate as any).toDate === 'function') {
            bonusPaymentDate = (bonusData.bonusPaymentDate as any).toDate();
          } else if (bonusData.bonusPaymentDate && typeof (bonusData.bonusPaymentDate as any).seconds === 'number') {
            bonusPaymentDate = new Date((bonusData.bonusPaymentDate as any).seconds * 1000);
          }
        }
        
        rows.push({
          employeeId: employee.id!,
          employeeNumber: employee.employeeNumber,
          employeeName: `${employee.lastName} ${employee.firstName}`,
          departmentName: department?.name || '',
          baseDays: salaryData?.baseDays || null,
          fixedSalary: salaryData?.fixedSalary || null,
          totalPayment: salaryData?.totalPayment || null,
          retroactivePayment: salaryData?.retroactivePayment || null,
          bonus: bonusData?.bonusAmount || null,
          bonusPaymentDate: bonusPaymentDate,
          bonusIsConfirmed: bonusData?.isConfirmed || false,
          isConfirmed: salaryData?.isConfirmed || false,
          hasError: false
        });
      }

      this.salaryRows = rows;
      this.applyFilters();
    } catch (error) {
      console.error('給与データの読み込みに失敗しました:', error);
      this.snackBar.open('給与データの読み込みに失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  onYearMonthChange(): void {
    this.isLoading = true;
    this.loadSalaryData();
  }

  applyFilters(): void {
    let filtered = [...this.salaryRows];

    // 部署でフィルタ
    if (this.selectedDepartmentId) {
      const department = this.departments.find(d => d.id === this.selectedDepartmentId);
      if (department) {
        filtered = filtered.filter(row => {
          const employee = this.employees.find(e => e.id === row.employeeId);
          return employee?.departmentId === this.selectedDepartmentId;
        });
      }
    }

    // 社員名でフィルタ
    if (this.employeeNameFilter) {
      filtered = filtered.filter(row => 
        row.employeeName.includes(this.employeeNameFilter) || 
        row.employeeNumber.includes(this.employeeNameFilter)
      );
    }

    // 確定状態でフィルタ
    if (this.confirmedFilter === 'confirmed') {
      filtered = filtered.filter(row => row.isConfirmed);
    } else if (this.confirmedFilter === 'unconfirmed') {
      filtered = filtered.filter(row => !row.isConfirmed);
    }

    this.dataSource.data = filtered;
  }

  onFilterChange(): void {
    this.selectedDepartmentId = this.filterForm.value.departmentId || null;
    this.employeeNameFilter = this.filterForm.value.employeeName || '';
    this.confirmedFilter = this.filterForm.value.confirmed || 'all';
    this.applyFilters();
  }

  onBonusPaymentDateChange(row: SalaryInputRow, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const index = this.salaryRows.findIndex(r => r.employeeId === row.employeeId);
    if (index >= 0) {
      // 日付文字列をDateオブジェクトに変換
      if (value) {
        this.salaryRows[index].bonusPaymentDate = new Date(value);
      } else {
        this.salaryRows[index].bonusPaymentDate = null;
      }
      this.applyFilters();
    }
  }

  updateSalaryData(row: SalaryInputRow, field: string, value: any): void {
    const index = this.salaryRows.findIndex(r => r.employeeId === row.employeeId);
    if (index >= 0) {
      // 日付文字列をDateオブジェクトに変換
      if (field === 'bonusPaymentDate' && typeof value === 'string' && value) {
        value = new Date(value);
      }
      (this.salaryRows[index] as any)[field] = value;
      this.applyFilters();
    }
  }

  formatDateForInput(date: Date | null): string {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async saveSalaryData(row: SalaryInputRow): Promise<void> {
    if (!row.employeeId) return;

    // バリデーション
    if (row.baseDays === null || row.baseDays < 0 || row.baseDays > 31) {
      this.snackBar.open('基礎日数は0～31の範囲で入力してください', '閉じる', { duration: 3000 });
      return;
    }
    if (row.fixedSalary === null || row.fixedSalary < 0) {
      this.snackBar.open('固定賃金を入力してください', '閉じる', { duration: 3000 });
      return;
    }
    if (row.totalPayment === null || row.totalPayment < 0) {
      this.snackBar.open('総支給を入力してください', '閉じる', { duration: 3000 });
      return;
    }

    this.isSaving = true;
    try {
      // 給与データを保存
      await this.salaryDataService.saveSalaryData(row.employeeId, {
        year: this.selectedYear,
        month: this.selectedMonth,
        baseDays: row.baseDays!,
        fixedSalary: row.fixedSalary!,
        totalPayment: row.totalPayment!,
        retroactivePayment: row.retroactivePayment || 0,
        isConfirmed: false
      });

      // 賞与データを保存（賞与が入力されている場合）
      if (row.bonus !== null && row.bonus >= 0) {
        await this.bonusDataService.saveBonusData(row.employeeId, {
          year: this.selectedYear,
          month: this.selectedMonth,
          bonusAmount: row.bonus,
          bonusPaymentDate: row.bonusPaymentDate || undefined,
          isConfirmed: false
        });
      }

      row.isConfirmed = false; // 保存後は未確定状態
      row.bonusIsConfirmed = false;
      this.snackBar.open('給与データを保存しました', '閉じる', { duration: 2000 });
      await this.loadSalaryData();
    } catch (error) {
      console.error('給与データの保存に失敗しました:', error);
      this.snackBar.open('給与データの保存に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isSaving = false;
    }
  }

  async confirmSalaryData(row: SalaryInputRow): Promise<void> {
    if (!row.employeeId || !this.currentUser?.uid) return;

    if (!row.isConfirmed && (row.baseDays === null || row.fixedSalary === null || row.totalPayment === null)) {
      this.snackBar.open('給与データを入力してから確定してください', '閉じる', { duration: 3000 });
      return;
    }

    this.isConfirming = true;
    try {
      // 給与データを確定
      await this.salaryDataService.confirmSalaryData(row.employeeId, this.selectedYear, this.selectedMonth, this.currentUser.uid);
      
      // 賞与データを確定（賞与が入力されている場合）
      if (row.bonus !== null && row.bonus >= 0) {
        await this.bonusDataService.confirmBonusData(row.employeeId, this.selectedYear, this.selectedMonth, this.currentUser.uid);
      }
      
      row.isConfirmed = true;
      row.bonusIsConfirmed = true;
      this.snackBar.open('給与データを確定しました', '閉じる', { duration: 2000 });
      await this.loadSalaryData();
    } catch (error) {
      console.error('給与データの確定に失敗しました:', error);
      this.snackBar.open('給与データの確定に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isConfirming = false;
    }
  }

  async importFromExcel(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = async (event: any) => {
      const file = event.target.files[0];
      if (!file) return;

      this.importErrors = [];
      this.importedSalaryData = [];
      this.allSelected = false;
      this.someSelected = false;

      try {
        if (file.name.endsWith('.csv')) {
          await this.parseCsvFile(file);
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          await this.parseExcelFile(file);
        } else {
          this.importErrors.push('CSVまたはExcelファイルを選択してください');
          return;
        }

        // バリデーション
        await this.validateImportedData();

        // データソースを更新
        this.importPreviewDataSource.data = this.importedSalaryData;
        this.updateSelectionState();
      } catch (error: any) {
        this.importErrors.push(`ファイルの読み込みに失敗しました: ${error.message}`);
      }

      // ファイル入力をリセット
      input.value = '';
    };
    input.click();
  }

  /**
   * CSVファイルをパース
   */
  private async parseCsvFile(file: File): Promise<void> {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      this.importErrors.push('CSVファイルにデータが含まれていません');
      return;
    }

    // ヘッダー行をスキップ（1行目）
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const row = this.parseCsvLine(line);
      
      // すべてのセルが空かチェック（空行をスキップ）
      const isEmptyRow = row.every(cell => {
        const value = String(cell || '').trim();
        return value === '' || value === '0' || value === '-';
      });
      if (isEmptyRow) continue;

      this.parseSalaryRow(row, i + 1);
    }
  }

  /**
   * CSV行をパース（引用符を考慮）
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  /**
   * Excelファイルをパース
   */
  private async parseExcelFile(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

    if (data.length < 2) {
      this.importErrors.push('Excelファイルにデータが含まれていません');
      return;
    }

    // ヘッダー行をスキップ（1行目）
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      // すべてのセルが空かチェック（空行をスキップ）
      const isEmptyRow = row.every(cell => {
        const value = String(cell || '').trim();
        return value === '' || value === '0' || value === '-';
      });
      if (isEmptyRow) continue;

      this.parseSalaryRow(row, i + 1);
    }
  }

  /**
   * 給与データ行をパース
   */
  private parseSalaryRow(row: any[], rowNumber: number): void {
    const errors: string[] = [];

    // 列数チェック（最低9列: 社員番号、社員名、年、月、基礎日数、固定賃金、総支給、遡及支払額、賞与）
    if (row.length < 9) {
      errors.push(`列数が不足しています（最低9列必要）`);
      this.importedSalaryData.push({
        employeeNumber: row[0] || '',
        employeeName: row[1] || '',
        year: 0,
        month: 0,
        baseDays: 0,
        fixedSalary: 0,
        totalPayment: 0,
        retroactivePayment: 0,
        bonus: 0,
        errors,
        selected: false
      });
      return;
    }

    // 配列のインデックスでアクセス
    const employeeNumberRaw = row[0];
    const employeeNameRaw = row[1];
    const yearRaw = row[2];
    const monthRaw = row[3];
    const baseDaysRaw = row[4];
    const fixedSalaryRaw = row[5];
    const totalPaymentRaw = row[6];
    const retroactivePaymentRaw = row[7];
    const bonusRaw = row[8];
    const bonusPaymentDateRaw = row[9];

    const employeeNumber = String(employeeNumberRaw || '').trim();
    const employeeName = String(employeeNameRaw || '').trim();

    // 必須項目チェック
    if (!employeeNumber) errors.push('社員番号が空です');
    if (!employeeName) errors.push('社員名が空です');
    if (yearRaw === undefined || yearRaw === null || yearRaw === '') errors.push('年が空です');
    if (monthRaw === undefined || monthRaw === null || monthRaw === '') errors.push('月が空です');
    if (baseDaysRaw === undefined || baseDaysRaw === null || baseDaysRaw === '') errors.push('基礎日数が空です');
    if (fixedSalaryRaw === undefined || fixedSalaryRaw === null || fixedSalaryRaw === '') errors.push('固定賃金が空です');
    if (totalPaymentRaw === undefined || totalPaymentRaw === null || totalPaymentRaw === '') errors.push('総支給が空です');

    // 数値変換
    const year = yearRaw ? parseInt(String(yearRaw), 10) : this.selectedYear;
    const month = monthRaw ? parseInt(String(monthRaw), 10) : this.selectedMonth;
    const baseDays = baseDaysRaw ? parseFloat(String(baseDaysRaw)) : 0;
    const fixedSalary = fixedSalaryRaw ? parseFloat(String(fixedSalaryRaw)) : 0;
    const totalPayment = totalPaymentRaw ? parseFloat(String(totalPaymentRaw)) : 0;
    const retroactivePayment = retroactivePaymentRaw ? parseFloat(String(retroactivePaymentRaw)) : 0;
    const bonus = bonusRaw ? parseFloat(String(bonusRaw)) : 0;

    // バリデーション
    if (year && (year < 2000 || year > 2100)) errors.push('年の値が不正です');
    if (month && (month < 1 || month > 12)) errors.push('月の値が不正です（1-12の範囲）');
    if (baseDays && (baseDays < 0 || baseDays > 31)) errors.push('基礎日数の値が不正です');
    if (fixedSalary && fixedSalary < 0) errors.push('固定賃金が負の値です');
    if (totalPayment && totalPayment < 0) errors.push('総支給が負の値です');
    if (retroactivePayment && retroactivePayment < 0) errors.push('遡及支払額が負の値です');
    if (bonus && bonus < 0) errors.push('賞与が負の値です');

    // 社員IDを検索
    const employee = this.employees.find(emp => emp.employeeNumber === employeeNumber);
    const employeeId = employee?.id;

    if (!employeeId && employeeNumber) {
      errors.push(`社員番号「${employeeNumber}」の社員が見つかりません`);
    }

    // 賞与支払日をDateオブジェクトに変換
    let bonusPaymentDate: Date | null = null;
    if (bonusPaymentDateRaw) {
      // Excelの日付シリアル値（数値）の場合
      if (typeof bonusPaymentDateRaw === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        excelEpoch.setDate(excelEpoch.getDate() + bonusPaymentDateRaw);
        bonusPaymentDate = excelEpoch;
      } else {
        const dateStr = String(bonusPaymentDateRaw).trim();
        if (dateStr) {
          // YYYY-MM-DD形式
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            bonusPaymentDate = new Date(dateStr);
          }
          // YYYY/MM/DD形式
          else if (/^\d{4}\/\d{2}\/\d{2}$/.test(dateStr)) {
            bonusPaymentDate = new Date(dateStr.replace(/\//g, '-'));
          }
          // その他の形式
          else {
            const parsedDate = new Date(dateStr);
            if (!isNaN(parsedDate.getTime())) {
              bonusPaymentDate = parsedDate;
            }
          }
          
          if (bonusPaymentDate && isNaN(bonusPaymentDate.getTime())) {
            bonusPaymentDate = null;
          }
        }
      }
    }

    this.importedSalaryData.push({
      employeeNumber,
      employeeName,
      employeeId,
      year,
      month,
      baseDays,
      fixedSalary,
      totalPayment,
      retroactivePayment,
      bonus,
      bonusPaymentDate,
      errors: errors.length > 0 ? errors : undefined,
      selected: errors.length === 0
    });
  }

  /**
   * バリデーション
   */
  private async validateImportedData(): Promise<void> {
    this.isValidating = true;

    try {
      // 重複チェック（社員番号、年月）
      const keySet = new Set<string>();

      this.importedSalaryData.forEach((data) => {
        if (data.errors && data.errors.length > 0) return;

        const key = `${data.employeeNumber}-${data.year}-${data.month}`;
        if (keySet.has(key)) {
          if (!data.errors) data.errors = [];
          data.errors.push('同じ社員の同じ年月のデータが重複しています');
        } else {
          keySet.add(key);
        }
      });

      // 確定済みデータのチェック
      for (const data of this.importedSalaryData) {
        if (data.errors && data.errors.length > 0) continue;
        if (!data.employeeId) continue;

        try {
          const existingSalaryData = await this.salaryDataService.getSalaryData(
            data.employeeId,
            data.year,
            data.month
          );

          if (existingSalaryData && existingSalaryData.isConfirmed) {
            if (!data.errors) data.errors = [];
            data.errors.push(`${data.year}年${data.month}月の給与データは既に確定済みです`);
          }
        } catch (error) {
          console.error('確定済みデータのチェックに失敗しました:', error);
        }
      }
    } finally {
      this.isValidating = false;
    }
  }

  /**
   * 全選択/全解除
   */
  toggleAllSelection(): void {
    this.allSelected = !this.allSelected;
    this.importedSalaryData.forEach(data => {
      if (!data.errors || data.errors.length === 0) {
        data.selected = this.allSelected;
      }
    });
    this.updateSelectionState();
  }

  /**
   * 個別選択の切り替え
   */
  toggleSelection(data: ImportedSalaryData): void {
    data.selected = !data.selected;
    this.updateSelectionState();
  }

  /**
   * 選択状態を更新
   */
  private updateSelectionState(): void {
    const selectableData = this.importedSalaryData.filter(d => !d.errors || d.errors.length === 0);
    const selectedCount = selectableData.filter(d => d.selected).length;
    
    this.allSelected = selectedCount > 0 && selectedCount === selectableData.length;
    this.someSelected = selectedCount > 0 && selectedCount < selectableData.length;
  }

  /**
   * 選択されているデータが存在するかチェック
   */
  hasSelectedData(): boolean {
    return this.getSelectedCount() > 0;
  }

  /**
   * 選択済み件数を取得
   */
  getSelectedCount(): number {
    return this.importedSalaryData.filter(d => d.selected && (!d.errors || d.errors.length === 0)).length;
  }

  /**
   * インポート実行
   */
  async executeImport(): Promise<void> {
    // 選択されたデータを取得
    const selectedData = this.importedSalaryData.filter(d => d.selected && (!d.errors || d.errors.length === 0));

    if (selectedData.length === 0) {
      this.snackBar.open('インポートするデータが選択されていません', '閉じる', { duration: 3000 });
      return;
    }

    this.isLoading = true;

    try {
      // 確定済みデータの最終チェック
      for (const data of selectedData) {
        if (!data.employeeId) continue;
        
        const existingSalaryData = await this.salaryDataService.getSalaryData(
          data.employeeId,
          data.year,
          data.month
        );

        if (existingSalaryData && existingSalaryData.isConfirmed) {
          this.snackBar.open(`${data.employeeNumber}の${data.year}年${data.month}月の給与データは既に確定済みです`, '閉じる', { duration: 5000 });
          return;
        }
      }

      // 一括保存
      for (const data of selectedData) {
        if (!data.employeeId) continue;

        // 給与データを保存
        await this.salaryDataService.saveSalaryData(data.employeeId, {
          year: data.year,
          month: data.month,
          baseDays: data.baseDays,
          fixedSalary: data.fixedSalary,
          totalPayment: data.totalPayment,
          retroactivePayment: data.retroactivePayment,
          isConfirmed: false
        });

        // 賞与データを保存（賞与が入力されている場合、または賞与支払日が設定されている場合）
        if (data.bonus > 0 || data.bonusPaymentDate) {
          await this.bonusDataService.saveBonusData(data.employeeId, {
            year: data.year,
            month: data.month,
            bonusAmount: data.bonus || 0,
            bonusPaymentDate: data.bonusPaymentDate || undefined,
            isConfirmed: false
          });
        }
      }

      this.snackBar.open(`${selectedData.length}件の給与データをインポートしました`, '閉じる', { duration: 3000 });
      
      // データをクリア
      this.importedSalaryData = [];
      this.importPreviewDataSource.data = [];
      this.importErrors = [];
      this.updateSelectionState();
      
      await this.loadSalaryData();
    } catch (error) {
      console.error('給与データのインポートに失敗しました:', error);
      this.snackBar.open('給与データのインポートに失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * インポートキャンセル
   */
  cancelImport(): void {
    this.importedSalaryData = [];
    this.importPreviewDataSource.data = [];
    this.importErrors = [];
    this.allSelected = false;
    this.someSelected = false;
  }

  exportToExcel(): void {
    const data = this.dataSource.data.map(row => ({
      社員番号: row.employeeNumber,
      社員名: row.employeeName,
      部署名: row.departmentName,
      年: this.selectedYear,
      月: this.selectedMonth,
      基礎日数: row.baseDays || '',
      固定賃金: row.fixedSalary || '',
      総支給: row.totalPayment || '',
      遡及支払額: row.retroactivePayment || '',
      賞与: row.bonus || '',
      賞与支払日: row.bonusPaymentDate ? this.formatDateForInput(row.bonusPaymentDate) : '',
      確定済み: row.isConfirmed ? 'はい' : 'いいえ'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '給与データ');
    XLSX.writeFile(workbook, `給与データ_${this.selectedYear}年${this.selectedMonth}月_${new Date().getTime()}.xlsx`);
  }

  /**
   * サンプルデータを表示
   */
  showSample(): void {
    this.dialog.open(SalarySampleDialogComponent, {
      width: '900px',
      maxWidth: '90vw',
      maxHeight: '90vh'
    });
  }
}

