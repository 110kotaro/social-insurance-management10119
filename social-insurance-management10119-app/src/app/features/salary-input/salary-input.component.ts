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

      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // CSV/Excelの列: 社員番号、社員名、年、月、基礎日数、固定賃金、総支給、遡及支払額、賞与、賞与支払日
        const importedData: any[] = [];
        for (const row of jsonData as any[]) {
          const employeeNumber = String(row['社員番号'] || row['employeeNumber'] || '').trim();
          if (!employeeNumber) continue;

          const employee = this.employees.find(e => e.employeeNumber === employeeNumber);
          if (!employee) continue;

          // 賞与支払日をDateオブジェクトに変換
          let bonusPaymentDate: Date | null = null;
          const bonusPaymentDateStr = row['賞与支払日'] || row['bonusPaymentDate'];
          if (bonusPaymentDateStr) {
            // Excelの日付シリアル値（数値）の場合
            if (typeof bonusPaymentDateStr === 'number') {
              // Excelの日付シリアル値（1900年1月1日を1とする）をDateに変換
              const excelEpoch = new Date(1899, 11, 30); // 1900年1月1日の前日
              excelEpoch.setDate(excelEpoch.getDate() + bonusPaymentDateStr);
              bonusPaymentDate = excelEpoch;
            } else {
              // 文字列の場合、様々な形式を試す
              const dateStr = String(bonusPaymentDateStr).trim();
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
                
                // 日付が無効な場合はnullに設定
                if (bonusPaymentDate && isNaN(bonusPaymentDate.getTime())) {
                  bonusPaymentDate = null;
                }
              }
            }
          }

          importedData.push({
            employeeId: employee.id!,
            year: parseInt(row['年'] || row['year'] || this.selectedYear),
            month: parseInt(row['月'] || row['month'] || this.selectedMonth),
            baseDays: parseFloat(row['基礎日数'] || row['baseDays'] || 0),
            fixedSalary: parseFloat(row['固定賃金'] || row['fixedSalary'] || 0),
            totalPayment: parseFloat(row['総支給'] || row['totalPayment'] || 0),
            retroactivePayment: parseFloat(row['遡及支払額'] || row['retroactivePayment'] || 0),
            bonus: parseFloat(row['賞与'] || row['bonus'] || 0),
            bonusPaymentDate: bonusPaymentDate
          });
        }

        // 一括保存
        for (const data of importedData) {
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

        this.snackBar.open(`${importedData.length}件の給与データをインポートしました`, '閉じる', { duration: 3000 });
        await this.loadSalaryData();
      } catch (error) {
        console.error('Excel/CSVのインポートに失敗しました:', error);
        this.snackBar.open('Excel/CSVのインポートに失敗しました', '閉じる', { duration: 3000 });
      }
    };
    input.click();
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
}

