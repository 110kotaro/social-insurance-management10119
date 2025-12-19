import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import * as XLSX from 'xlsx';
import { EmployeeService } from '../../../core/services/employee.service';
import { SalaryDataService } from '../../../core/services/salary-data.service';
import { BonusDataService } from '../../../core/services/bonus-data.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Employee } from '../../../core/models/employee.model';
import { SalarySampleDialogComponent } from './salary-sample-dialog.component';

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
  errors?: string[];
  selected?: boolean;
}

@Component({
  selector: 'app-salary-import',
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
    MatTableModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    MatDialogModule
  ],
  templateUrl: './salary-import.component.html',
  styleUrl: './salary-import.component.css'
})
export class SalaryImportComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private salaryDataService = inject(SalaryDataService);
  private bonusDataService = inject(BonusDataService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);

  organizationId: string | null = null;
  isLoading = false;
  isValidating = false;

  // 年月選択
  selectedYear: number = new Date().getFullYear();
  selectedMonth: number = new Date().getMonth() + 1;
  years: number[] = [];
  months: number[] = Array.from({ length: 12 }, (_, i) => i + 1);

  // データ
  allEmployees: Employee[] = [];
  importedSalaryData: ImportedSalaryData[] = [];
  displayedColumns: string[] = ['select', 'employeeNumber', 'employeeName', 'year', 'month', 'baseDays', 'fixedSalary', 'totalPayment', 'retroactivePayment', 'bonus', 'errors'];
  dataSource = new MatTableDataSource<ImportedSalaryData>([]);
  importErrors: string[] = [];

  // 選択状態
  allSelected = false;
  someSelected = false;

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      this.snackBar.open('組織情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    this.organizationId = currentUser.organizationId;
    this.loadEmployees();
    this.initializeYears();
  }

  /**
   * 年リストを初期化
   */
  private initializeYears(): void {
    const currentYear = new Date().getFullYear();
    this.years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  }

  /**
   * 社員一覧を読み込む
   */
  private async loadEmployees(): Promise<void> {
    if (!this.organizationId) return;

    try {
      this.allEmployees = await this.employeeService.getEmployeesByOrganization(this.organizationId);
    } catch (error) {
      console.error('社員の読み込みに失敗しました:', error);
      this.snackBar.open('社員の読み込みに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * ファイル選択
   */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
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
      this.dataSource.data = this.importedSalaryData;
      this.updateSelectionState();
    } catch (error: any) {
      this.importErrors.push(`ファイルの読み込みに失敗しました: ${error.message}`);
    }

    // ファイル入力をリセット
    input.value = '';
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
   * 想定フォーマット: 社員番号, 社員名, 年, 月, 基礎日数, 固定賃金, 総支給, 遡及支払額, 賞与
   */
  private parseSalaryRow(row: any[], rowNumber: number): void {
    const errors: string[] = [];

    // 最低限の列数チェック（必須項目9列）
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

    const employeeNumber = String(row[0] || '').trim();
    const employeeName = String(row[1] || '').trim();
    const yearRaw = row[2];
    const monthRaw = row[3];
    const baseDaysRaw = row[4];
    const fixedSalaryRaw = row[5];
    const totalPaymentRaw = row[6];
    const retroactivePaymentRaw = row[7];
    const bonusRaw = row[8];

    // 必須項目チェック
    if (!employeeNumber) errors.push('社員番号が空です');
    if (!employeeName) errors.push('社員名が空です');
    if (yearRaw === undefined || yearRaw === null || yearRaw === '') errors.push('年が空です');
    if (monthRaw === undefined || monthRaw === null || monthRaw === '') errors.push('月が空です');
    if (baseDaysRaw === undefined || baseDaysRaw === null || baseDaysRaw === '') errors.push('基礎日数が空です');
    if (fixedSalaryRaw === undefined || fixedSalaryRaw === null || fixedSalaryRaw === '') errors.push('固定賃金が空です');
    if (totalPaymentRaw === undefined || totalPaymentRaw === null || totalPaymentRaw === '') errors.push('総支給が空です');

    // 数値変換
    const year = yearRaw ? parseInt(String(yearRaw), 10) : 0;
    const month = monthRaw ? parseInt(String(monthRaw), 10) : 0;
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
    const employee = this.allEmployees.find(emp => emp.employeeNumber === employeeNumber);
    const employeeId = employee?.id;

    if (!employeeId && employeeNumber) {
      errors.push(`社員番号「${employeeNumber}」の社員が見つかりません`);
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
   * インポート実行
   */
  async executeImport(): Promise<void> {
    if (!this.organizationId) {
      this.snackBar.open('組織情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

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

      // 社員IDごとにグループ化
      const groupedByEmployee = new Map<string, ImportedSalaryData[]>();
      selectedData.forEach(data => {
        if (!data.employeeId) return;
        if (!groupedByEmployee.has(data.employeeId)) {
          groupedByEmployee.set(data.employeeId, []);
        }
        groupedByEmployee.get(data.employeeId)!.push(data);
      });

      // 各社員の給与データをインポート
      for (const [employeeId, dataList] of groupedByEmployee) {
        const salaryDataList = dataList.map(data => ({
          year: data.year,
          month: data.month,
          baseDays: data.baseDays,
          fixedSalary: data.fixedSalary,
          totalPayment: data.totalPayment,
          retroactivePayment: data.retroactivePayment
        }));

        await this.salaryDataService.importSalaryData(employeeId, salaryDataList);

        // 賞与データを保存（賞与が入力されている場合）
        for (const data of dataList) {
          if (data.bonus > 0) {
            await this.bonusDataService.saveBonusData(employeeId, {
              year: data.year,
              month: data.month,
              bonusAmount: data.bonus,
              isConfirmed: false
            });
          }
        }
      }

      this.snackBar.open(`${selectedData.length}件の給与データをインポートしました`, '閉じる', { duration: 3000 });
      
      // データをクリア
      this.importedSalaryData = [];
      this.dataSource.data = [];
      this.updateSelectionState();
    } catch (error) {
      console.error('給与データのインポートに失敗しました:', error);
      this.snackBar.open('給与データのインポートに失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 年月が変更されたとき
   */
  onYearMonthChange(): void {
    // 必要に応じて処理を追加
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
   * サンプルデータを表示
   */
  showSample(): void {
    this.dialog.open(SalarySampleDialogComponent, {
      width: '900px',
      maxWidth: '90vw',
      maxHeight: '90vh'
    });
  }

  /**
   * キャンセル（プレビューをクリア）
   */
  cancel(): void {
    // インポートデータをクリア
    this.importedSalaryData = [];
    this.dataSource.data = [];
    this.importErrors = [];
    this.allSelected = false;
    this.someSelected = false;
  }
}
