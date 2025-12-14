import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { InsuranceRateTable } from '../../../../core/models/insurance-rate-table.model';
import { InsuranceRateTableService } from '../../../../core/services/insurance-rate-table.service';
import { AuthService } from '../../../../core/auth/auth.service';

export interface InsuranceRateTableManagerDialogData {
  organizationId: string | null;
  isNew?: boolean; // 新規追加時はtrue
}

@Component({
  selector: 'app-insurance-rate-table-manager-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  templateUrl: './insurance-rate-table-manager-dialog.component.html',
  styleUrl: './insurance-rate-table-manager-dialog.component.css'
})
export class InsuranceRateTableManagerDialogComponent implements OnInit {
  private snackBar = inject(MatSnackBar);
  private insuranceRateTableService = inject(InsuranceRateTableService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);

  readonly organizationId: string | null;
  readonly isNew: boolean;

  rateTables: InsuranceRateTable[] = [];
  tableEffectiveFrom: Date = new Date();
  tableEffectiveTo: Date | null = null;
  
  // 月単位の日付入力用
  effectiveFromYear: number = new Date().getFullYear();
  effectiveFromMonth: number = new Date().getMonth() + 1;
  effectiveToYear: number | null = null;
  effectiveToMonth: number | null = null;

  headerRates = {
    healthWithoutCare: 0,
    healthWithCare: 0,
    pension: 0
  };

  editingHeaderRates = { ...this.headerRates };
  isEditingHeaderRates = false;

  csvFile: File | null = null;
  importErrors: string[] = [];
  importedCount = 0;

  editingRow: InsuranceRateTable | null = null;
  editingRowIndex: number | null = null;
  originalRowData: InsuranceRateTable | null = null;
  isAddingNew = false;

  successMessage = '';
  errorMessage = '';
  isLoading = false;

  constructor(
    private dialogRef: MatDialogRef<InsuranceRateTableManagerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: InsuranceRateTableManagerDialogData
  ) {
    this.organizationId = data.organizationId ?? this.authService.getCurrentUser()?.organizationId ?? null;
    this.isNew = data.isNew ?? false;
  }

  ngOnInit(): void {
    // 新規追加時は既存データを読み込まない（空のテーブルから開始）
    // 編集時はこのダイアログは使用しない（親ページの編集ボタンから別ダイアログを開く）
  }

  formatDateForInput(date: Date | null | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 月単位の日付をDateオブジェクトに変換（月の1日）
  private getDateFromYearMonth(year: number, month: number): Date {
    return new Date(year, month - 1, 1);
  }

  // Dateオブジェクトから年月を取得
  private getYearMonthFromDate(date: Date): { year: number; month: number } {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1
    };
  }

  // 年月を比較（-1: 前者が小さい、0: 等しい、1: 前者が大きい）
  private compareYearMonth(year1: number, month1: number, year2: number, month2: number): number {
    if (year1 < year2) return -1;
    if (year1 > year2) return 1;
    if (month1 < month2) return -1;
    if (month1 > month2) return 1;
    return 0;
  }

  onEffectiveFromYearChange(): void {
    this.updateEffectiveFromDate();
  }

  onEffectiveFromMonthChange(): void {
    this.updateEffectiveFromDate();
  }

  onEffectiveToYearChange(): void {
    this.updateEffectiveToDate();
  }

  onEffectiveToMonthChange(): void {
    this.updateEffectiveToDate();
  }

  private updateEffectiveFromDate(): void {
    this.tableEffectiveFrom = this.getDateFromYearMonth(this.effectiveFromYear, this.effectiveFromMonth);
  }

  private updateEffectiveToDate(): void {
    if (this.effectiveToYear && this.effectiveToMonth) {
      // 月の最終日を設定
      const lastDay = new Date(this.effectiveToYear, this.effectiveToMonth, 0).getDate();
      this.tableEffectiveTo = new Date(this.effectiveToYear, this.effectiveToMonth - 1, lastDay);
    } else {
      this.tableEffectiveTo = null;
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.csvFile = input.files[0];
      const name = this.csvFile.name.toLowerCase();
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        this.parseExcelFile(this.csvFile);
      } else {
        this.parseCsvFile(this.csvFile);
      }
    }
  }

  private async parseExcelFile(file: File): Promise<void> {
    this.importErrors = [];
    const importedTables: InsuranceRateTable[] = [];

    try {
      const XLSX = await import('xlsx');
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      if (rows.length < 12) {
        this.importErrors.push('Excelファイルの形式が正しくありません（データ行が不足しています）');
        return;
      }

      this.parseFileData(rows, importedTables, 8, 11, true);
      this.applyImportedTables(importedTables);
    } catch (error: any) {
      this.importErrors.push(`Excelファイルの読み込みに失敗しました: ${error?.message ?? error}`);
    }
  }

  private async parseCsvFile(file: File): Promise<void> {
    this.importErrors = [];
    const importedTables: InsuranceRateTable[] = [];

    try {
      const text = await file.text();
      const lines = text.split('\n');
      if (lines.length < 14) {
        this.importErrors.push('CSVファイルの形式が正しくありません（データ行が不足しています）');
        return;
      }

      const parseCsvLine = (line: string): string[] => {
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
      };

      const rows = lines.map(line => parseCsvLine(line.trim()));
      this.parseFileData(rows, importedTables);
      this.applyImportedTables(importedTables);
    } catch (error: any) {
      this.importErrors.push(`ファイルの読み込みに失敗しました: ${error?.message ?? error}`);
    }
  }

  private applyImportedTables(importedTables: InsuranceRateTable[]): void {
    if (importedTables.length === 0) {
      this.importErrors.push('有効なデータが見つかりませんでした');
      this.importedCount = 0;
      return;
    }

    // 厚生年金の等級・折半額・全額の空欄を自動補完
    this.fillPensionInsuranceBlanks(importedTables);

    this.rateTables = importedTables;
    this.importedCount = importedTables.length;
    this.successMessage = `データを読み込みました（${importedTables.length}件）`;
    setTimeout(() => (this.successMessage = ''), 5000);
  }

  private parseFileData(rows: any[][], importedTables: InsuranceRateTable[], rateRowIndex = 10, dataStartIndex = 13, isExcel = false): void {
    const rateRow = rows[rateRowIndex] || [];
    let healthWithoutCareRate = 0;
    let healthWithCareRate = 0;
    let pensionRate = 0;

    if (isExcel) {
      const parseRateFromCell = (cell: any): number => {
        if (cell === null || cell === undefined) {
          return 0;
        }
        if (typeof cell === 'number') {
          return cell < 1 ? cell * 100 : cell;
        }
        const cellStr = String(cell).trim();
        const rateMatch = cellStr.match(/(\d+\.?\d*)%/);
        if (rateMatch) {
          return parseFloat(rateMatch[1]);
        }
        const numValue = parseFloat(cellStr);
        if (!isNaN(numValue)) {
          return numValue < 1 ? numValue * 100 : numValue;
        }
        return 0;
      };

      healthWithoutCareRate = parseRateFromCell(rateRow[5]);
      healthWithCareRate = parseRateFromCell(rateRow[7]);
      pensionRate = parseRateFromCell(rateRow[9]);
    } else {
      for (const cell of rateRow) {
        const cellStr = String(cell || '').trim();
        const rateMatch = cellStr.match(/(\d+\.?\d*)%/);
        if (rateMatch) {
          const rate = parseFloat(rateMatch[1]);
          if (!healthWithoutCareRate && rate > 0 && rate < 15) {
            healthWithoutCareRate = rate;
          } else if (!healthWithCareRate && rate > 10 && rate < 15) {
            healthWithCareRate = rate;
          } else if (!pensionRate && rate > 15) {
            pensionRate = rate;
          }
        }
      }
    }

    if (healthWithoutCareRate > 0) {
      this.headerRates.healthWithoutCare = healthWithoutCareRate;
    }
    if (healthWithCareRate > 0) {
      this.headerRates.healthWithCare = healthWithCareRate;
    }
    if (pensionRate > 0) {
      this.headerRates.pension = pensionRate;
    }

    const dataRows = rows.slice(dataStartIndex);
    const currentUser = this.authService.getCurrentUser();
    const organizationId = currentUser?.organizationId || this.organizationId || null;
    const now = new Date();

    const parseNumber = (value: any): number => {
      if (value === null || value === undefined) return 0;
      const valueStr = String(value).trim();
      if (valueStr === '' || valueStr === '～' || valueStr === '""') return 0;
      const cleaned = valueStr.replace(/["\s,]/g, '');
      return parseFloat(cleaned) || 0;
    };

    for (const row of dataRows) {
      if (!row || row.length === 0) {
        continue;
      }

      const firstCell = String(row[0] || '').trim();
      if (firstCell.startsWith('◆') || firstCell.startsWith('○') || firstCell.startsWith('　') || firstCell === '') {
        continue;
      }

      if (row.length < 11) {
        continue;
      }

      const gradeStr = String(row[0] || '').trim();
      let grade = 0;
      let pensionGrade: number | null = null;
      const bracketMatch = gradeStr.match(/(\d+)（(\d+)）/);
      if (bracketMatch) {
        grade = parseInt(bracketMatch[1], 10);
        pensionGrade = parseInt(bracketMatch[2], 10);
      } else {
        const gradeMatch = gradeStr.match(/(\d+)/);
        if (gradeMatch) {
          grade = parseInt(gradeMatch[1], 10);
          pensionGrade = null;
        }
      }
      if (isNaN(grade) || grade < 1) {
        continue;
      }

      const standardRewardAmount = parseNumber(row[1]);
      if (standardRewardAmount <= 0) {
        continue;
      }

      const minAmount = parseNumber(row[2]);
      const maxAmountValue = row[4];
      const maxAmount = (maxAmountValue === null || maxAmountValue === undefined || String(maxAmountValue).trim() === '' || String(maxAmountValue).trim() === '""')
        ? null
        : parseNumber(maxAmountValue);
      if (maxAmount !== null && maxAmount <= 0) {
        continue;
      }
      if (maxAmount !== null && minAmount > maxAmount) {
        continue;
      }

      const healthWithoutCareTotal = parseNumber(row[5]);
      const healthWithoutCareHalf = parseNumber(row[6]);
      const healthWithCareTotal = parseNumber(row[7]);
      const healthWithCareHalf = parseNumber(row[8]);
      const pensionTotal = parseNumber(row[9]);
      const pensionHalf = parseNumber(row[10]);

      if (healthWithoutCareTotal > 0 || healthWithCareTotal > 0 || pensionTotal > 0) {
        importedTables.push({
          grade,
          pensionGrade: pensionGrade || null,
          standardRewardAmount,
          minAmount: minAmount || 0,
          maxAmount: maxAmount !== null ? maxAmount : 0,
          healthInsuranceWithoutCare: {
            rate: this.headerRates.healthWithoutCare,
            total: healthWithoutCareTotal,
            half: healthWithoutCareHalf
          },
          healthInsuranceWithCare: {
            rate: this.headerRates.healthWithCare,
            total: healthWithCareTotal,
            half: healthWithCareHalf
          },
          pensionInsurance: {
            rate: this.headerRates.pension,
            total: pensionTotal,
            half: pensionHalf
          },
          effectiveFrom: this.tableEffectiveFrom,
          effectiveTo: this.tableEffectiveTo,
          organizationId,
          createdAt: now,
          updatedAt: now
        } as InsuranceRateTable);
      }
    }

    // 厚生年金の等級・折半額・全額の空欄を自動補完
    this.fillPensionInsuranceBlanks(importedTables);
  }

  /**
   * 厚生年金の等級・折半額・全額の空欄を自動補完
   * 1級より上の空欄は1級の値を反映、最多級より下の空欄は最多級の値を反映
   */
  private fillPensionInsuranceBlanks(tables: InsuranceRateTable[]): void {
    if (tables.length === 0) {
      return;
    }

    // 健保等級（grade）でソート（元の順序を保持）
    const sortedTables = [...tables].sort((a, b) => {
      return a.grade - b.grade;
    });

    // 最初の有効な等級（pensionGrade !== null）のインデックスを取得
    let firstValidIndex = -1;
    for (let i = 0; i < sortedTables.length; i++) {
      const pensionGrade = sortedTables[i].pensionGrade ?? null;
      if (pensionGrade !== null) {
        firstValidIndex = i;
        break;
      }
    }

    // 最後の有効な等級（pensionGrade !== null）のインデックスを取得
    let lastValidIndex = -1;
    for (let i = sortedTables.length - 1; i >= 0; i--) {
      const pensionGrade = sortedTables[i].pensionGrade ?? null;
      if (pensionGrade !== null) {
        lastValidIndex = i;
        break;
      }
    }

    // 有効な等級が存在しない場合は処理を終了
    if (firstValidIndex === -1 || lastValidIndex === -1) {
      return;
    }

    // 1級の値を取得（pensionGrade === 1 または最小の等級）
    let grade1Table: InsuranceRateTable | null = null;
    for (const table of sortedTables) {
      const pensionGrade = table.pensionGrade ?? null;
      if (pensionGrade === 1) {
        grade1Table = table;
        break;
      }
    }
    if (!grade1Table && sortedTables.length > 0) {
      const firstPensionGrade = sortedTables[firstValidIndex].pensionGrade ?? null;
      if (firstPensionGrade !== null) {
        grade1Table = sortedTables[firstValidIndex];
      }
    }

    // 最多級の値を取得（最大のpensionGrade）
    let maxGradeTable: InsuranceRateTable | null = null;
    let maxGrade = 0;
    for (const table of sortedTables) {
      const pensionGrade = table.pensionGrade ?? null;
      if (pensionGrade !== null && pensionGrade > maxGrade) {
        maxGrade = pensionGrade;
        maxGradeTable = table;
      }
    }

    // 各tableがソート済み配列のどの位置にあるかをマッピング
    const tableToIndexMap = new Map<InsuranceRateTable, number>();
    for (let i = 0; i < sortedTables.length; i++) {
      tableToIndexMap.set(sortedTables[i], i);
    }

    // 空欄を補完
    for (const table of tables) {
      const pensionGrade = table.pensionGrade ?? null;
      const sortedIndex = tableToIndexMap.get(table) ?? -1;

      // 空欄の場合のみ補完処理を行う
      if (pensionGrade === null) {
        // 最初の有効な等級より前の位置にある場合 → 1級の値を補完
        if (sortedIndex >= 0 && sortedIndex < firstValidIndex) {
          if (grade1Table && grade1Table.pensionGrade !== null && grade1Table.pensionGrade !== undefined) {
            table.pensionGrade = grade1Table.pensionGrade;
            table.pensionInsurance.total = grade1Table.pensionInsurance.total;
            table.pensionInsurance.half = grade1Table.pensionInsurance.half;
          }
        }
        // 最後の有効な等級より後の位置にある場合 → 最多級の値を補完
        else if (sortedIndex >= 0 && sortedIndex > lastValidIndex) {
          if (maxGradeTable && maxGradeTable.pensionGrade !== null && maxGradeTable.pensionGrade !== undefined) {
            table.pensionGrade = maxGradeTable.pensionGrade;
            table.pensionInsurance.total = maxGradeTable.pensionInsurance.total;
            table.pensionInsurance.half = maxGradeTable.pensionInsurance.half;
          }
        }
        // 中間の位置にある場合 → 1級の値を補完（デフォルト）
        else if (sortedIndex >= 0 && sortedIndex >= firstValidIndex && sortedIndex <= lastValidIndex) {
          if (grade1Table && grade1Table.pensionGrade !== null && grade1Table.pensionGrade !== undefined) {
            table.pensionGrade = grade1Table.pensionGrade;
            table.pensionInsurance.total = grade1Table.pensionInsurance.total;
            table.pensionInsurance.half = grade1Table.pensionInsurance.half;
          }
        }
      }

      // 折半額・全額が0または空欄の場合も補完
      if (table.pensionInsurance.total === 0 || table.pensionInsurance.half === 0) {
        const currentGrade = table.pensionGrade ?? null;
        if (currentGrade === 1 && grade1Table) {
          if (table.pensionInsurance.total === 0) {
            table.pensionInsurance.total = grade1Table.pensionInsurance.total;
          }
          if (table.pensionInsurance.half === 0) {
            table.pensionInsurance.half = grade1Table.pensionInsurance.half;
          }
        } else if (maxGradeTable && currentGrade === maxGrade) {
          if (table.pensionInsurance.total === 0) {
            table.pensionInsurance.total = maxGradeTable.pensionInsurance.total;
          }
          if (table.pensionInsurance.half === 0) {
            table.pensionInsurance.half = maxGradeTable.pensionInsurance.half;
          }
        }
      }
    }
  }

  editHeaderRates(): void {
    if (this.editingRow) {
      this.cancelEdit();
    }
    this.editingHeaderRates = { ...this.headerRates };
    this.isEditingHeaderRates = true;
  }

  saveHeaderRates(): void {
    this.headerRates = { ...this.editingHeaderRates };
    this.isEditingHeaderRates = false;
    if (this.editingRow) {
      this.editingRow.healthInsuranceWithoutCare.rate = this.headerRates.healthWithoutCare;
      this.editingRow.healthInsuranceWithCare.rate = this.headerRates.healthWithCare;
      this.editingRow.pensionInsurance.rate = this.headerRates.pension;
    }
  }

  cancelHeaderRatesEdit(): void {
    this.isEditingHeaderRates = false;
  }

  addNewRow(): void {
    if (this.isEditingHeaderRates) {
      this.cancelHeaderRatesEdit();
    }
    const now = new Date();
    const organizationId = this.organizationId || this.authService.getCurrentUser()?.organizationId || null;
    const newRow: InsuranceRateTable = {
      grade: this.rateTables.length + 1,
      pensionGrade: null,
      standardRewardAmount: 0,
      minAmount: 0,
      maxAmount: 0,
      healthInsuranceWithoutCare: {
        rate: this.headerRates.healthWithoutCare,
        total: 0,
        half: 0
      },
      healthInsuranceWithCare: {
        rate: this.headerRates.healthWithCare,
        total: 0,
        half: 0
      },
      pensionInsurance: {
        rate: this.headerRates.pension,
        total: 0,
        half: 0
      },
      effectiveFrom: this.tableEffectiveFrom,
      effectiveTo: this.tableEffectiveTo,
      organizationId,
      createdAt: now,
      updatedAt: now
    };

    this.rateTables.push(newRow);
    this.editingRow = JSON.parse(JSON.stringify(newRow));
    this.editingRowIndex = this.rateTables.length - 1;
    this.originalRowData = null;
    this.isAddingNew = true;
    if (this.errorMessage === '少なくとも1件のデータを追加してください') {
      this.errorMessage = '';
    }
  }

  editRow(row: InsuranceRateTable): void {
    if (this.isEditingHeaderRates) {
      this.cancelHeaderRatesEdit();
    }

    let index = -1;
    if (row.id) {
      index = this.rateTables.findIndex(r => r.id === row.id);
    } else {
      index = this.rateTables.findIndex(r => r === row);
    }
    if (index === -1) {
      return;
    }

    this.originalRowData = JSON.parse(JSON.stringify(row));
    this.editingRow = JSON.parse(JSON.stringify(row));
    this.editingRowIndex = index;
    this.isAddingNew = false;
  }

  saveRow(): void {
    if (!this.editingRow) {
      return;
    }

    // editingRowIndexがnullの場合はエラー
    if (this.editingRowIndex === null || this.editingRowIndex < 0) {
      this.errorMessage = '編集対象の行が見つかりません';
      return;
    }

    // ヘッダーの料率を各行に反映（ヘッダー料率が編集されていない場合）
    if (!this.isEditingHeaderRates) {
      this.editingRow.healthInsuranceWithoutCare.rate = this.headerRates.healthWithoutCare;
      this.editingRow.healthInsuranceWithCare.rate = this.headerRates.healthWithCare;
      this.editingRow.pensionInsurance.rate = this.headerRates.pension;
    }
    // テーブル全体の適用日を各行に反映
    this.editingRow.effectiveFrom = this.tableEffectiveFrom;
    this.editingRow.effectiveTo = this.tableEffectiveTo;

    // rateTablesに反映（Firestoreへの保存は「保存」ボタンで一括実行）
    this.rateTables[this.editingRowIndex] = JSON.parse(JSON.stringify(this.editingRow));

    this.editingRow = null;
    this.editingRowIndex = null;
    this.originalRowData = null;
    this.isAddingNew = false;
  }

  cancelEdit(): void {
    if (this.isAddingNew && this.editingRowIndex !== null && this.editingRowIndex >= 0) {
      this.rateTables.splice(this.editingRowIndex, 1);
    } else if (this.editingRowIndex !== null && this.originalRowData) {
      this.rateTables[this.editingRowIndex] = JSON.parse(JSON.stringify(this.originalRowData));
    }
    this.editingRow = null;
    this.editingRowIndex = null;
    this.originalRowData = null;
    this.isAddingNew = false;
  }

  async deleteRow(row: InsuranceRateTable): Promise<void> {
    if (!confirm('この行を削除しますか？')) {
      return;
    }

    if (row.id && this.organizationId) {
      try {
        await this.insuranceRateTableService.deleteRateTable(row.id);
      } catch (error) {
        console.error('行の削除に失敗しました', error);
      }
    }

    const index = this.rateTables.findIndex(r => r === row || (r.id && r.id === row.id));
    if (index >= 0) {
      this.rateTables.splice(index, 1);
    }
  }

  async saveAll(): Promise<void> {
    if (!this.organizationId) {
      this.errorMessage = '組織情報が確認できません。';
      return;
    }

    // 編集中の行がある場合は保存（rateTablesへの反映のみ）
    if (this.editingRow) {
      this.saveRow();
      if (this.errorMessage) {
        return;
      }
    }

    // データが存在しない場合は警告
    if (this.rateTables.length === 0) {
      this.errorMessage = '少なくとも1件のデータを追加してください';
      return;
    }

    // 日付を更新（年月からDateオブジェクトに変換）
    this.updateEffectiveFromDate();
    this.updateEffectiveToDate();

    // 新規追加時のみ警告チェック
    if (this.isNew) {
      const shouldProceed = await this.checkAndHandleConflicts();
      if (!shouldProceed) {
        return; // ユーザーがキャンセルした場合
      }
    }

    // rateTables全体をFirestoreに一括保存（新規追加時のみ）
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      // 新規追加時：既存テーブルを削除せずに、新しいテーブルを追加するだけ
      const rateTablesToSave = this.rateTables.map(table => ({
        ...table,
        organizationId: this.organizationId,
        effectiveFrom: this.tableEffectiveFrom,
        effectiveTo: this.tableEffectiveTo
      }));

      await this.insuranceRateTableService.createRateTables(rateTablesToSave);
      this.snackBar.open('料率テーブルを保存しました', '閉じる', { duration: 3000 });
      this.dialogRef.close(true);
    } catch (error: any) {
      console.error('Failed to save rate tables', error);
      this.errorMessage = error.message || 'データの保存に失敗しました';
    } finally {
      this.isLoading = false;
    }
  }

  private async checkAndHandleConflicts(): Promise<boolean> {
    if (!this.organizationId) {
      return true;
    }

    try {
      // 既存テーブルを取得
      const existingTables = await this.insuranceRateTableService.getRateTablesByOrganization(this.organizationId);
      
      if (existingTables.length === 0) {
        return true; // 既存テーブルがない場合はそのまま進む
      }

      // 既存テーブルの適用期間を取得（最初のレコードから）
      const firstExisting = existingTables[0];
      const existingFrom = this.getYearMonthFromDate(new Date(firstExisting.effectiveFrom));
      const existingTo = firstExisting.effectiveTo 
        ? this.getYearMonthFromDate(new Date(firstExisting.effectiveTo))
        : null;

      const newFrom = { year: this.effectiveFromYear, month: this.effectiveFromMonth };
      const newTo = this.effectiveToYear && this.effectiveToMonth
        ? { year: this.effectiveToYear, month: this.effectiveToMonth }
        : null;

      // ケース1: 新規開始月 > 既存開始月 && 新規開始月 <= 既存終了月（または既存終了月が未設定）
      const compareNewToExisting = this.compareYearMonth(newFrom.year, newFrom.month, existingFrom.year, existingFrom.month);
      if (compareNewToExisting > 0) {
        // 新規開始月が既存開始月より未来
        if (!existingTo || this.compareYearMonth(newFrom.year, newFrom.month, existingTo.year, existingTo.month) <= 0) {
          // 既存終了月が未設定、または新規開始月 <= 既存終了月
          const confirmed = await this.showConfirmDialog(
            '適用期間の重複',
            `新規テーブルの適用開始月（${newFrom.year}年${newFrom.month}月）が既存テーブルの適用期間内です。\n既存テーブルの適用終了月を${newFrom.year}年${newFrom.month - 1}月に設定しますか？`,
            '設定する',
            'キャンセル'
          );
          
          if (confirmed) {
            // 既存テーブルの適用終了月を更新（新規開始月の前月の最終日）
            let prevYear = newFrom.year;
            let prevMonth = newFrom.month - 1;
            if (prevMonth < 1) {
              prevMonth = 12;
              prevYear--;
            }
            const lastDay = new Date(prevYear, prevMonth, 0).getDate();
            const newExistingTo = new Date(prevYear, prevMonth - 1, lastDay);
            await this.updateExistingTableEffectiveTo(existingTables, newExistingTo);
            return true;
          } else {
            return false; // キャンセル
          }
        }
      }

      // ケース2-1: 新規開始月 < 既存開始月 && 新規終了月 >= 既存開始月（新規終了月が設定されている場合）
      if (compareNewToExisting < 0 && newTo) {
        const compareNewToToExistingFrom = this.compareYearMonth(newTo.year, newTo.month, existingFrom.year, existingFrom.month);
        if (compareNewToToExistingFrom >= 0) {
          // 新規終了月 >= 既存開始月
          const choice = await this.showChoiceDialog(
            '適用期間の重複',
            `新規テーブルの適用期間が既存テーブルと重複しています。\n新規の適用終了月を修正するか、既存の適用開始月を${newTo.year}年${newTo.month + 1}月に変更しますか？`,
            '新規を修正',
            '既存を修正'
          );
          
          if (choice === 'existing') {
            // 既存テーブルの適用開始月を更新
            const confirmed = await this.showConfirmDialog(
              '確認',
              `既存テーブルの適用開始月を${newTo.year}年${newTo.month + 1}月に変更しますか？`,
              '変更する',
              'キャンセル'
            );
            
            if (confirmed) {
              // 既存テーブルの適用開始月を更新（新規終了月の翌月の1日）
              let nextYear = newTo.year;
              let nextMonth = newTo.month + 1;
              if (nextMonth > 12) {
                nextMonth = 1;
                nextYear++;
              }
              const newExistingFrom = new Date(nextYear, nextMonth - 1, 1);
              await this.updateExistingTableEffectiveFrom(existingTables, newExistingFrom);
              return true;
            } else {
              return false;
            }
          } else {
            return false; // 新規を修正する場合は保存をキャンセル
          }
        }
      }

      // ケース2-2: 新規開始月 < 既存開始月 && 新規終了月が未設定
      if (compareNewToExisting < 0 && !newTo) {
        const choice = await this.showChoiceDialog(
          '適用期間の重複',
          `新規テーブルの適用開始月（${newFrom.year}年${newFrom.month}月）が既存テーブルの適用開始月より過去で、新規の適用終了月が未設定（現在も有効）のため、既存テーブルと重複しています。\n新規の終了日を設定するか、以降の全てのテーブルを削除して新規に上書きしますか？`,
          '新規の終了日を設定',
          '以降の全てのテーブルを削除して上書き'
        );
        
        if (choice === 'overwrite') {
          // 以降の全てのテーブルを削除して新規に上書き
          const confirmed = await this.showConfirmDialog(
            '確認',
            `新規テーブルの適用開始月（${newFrom.year}年${newFrom.month}月）以降の全ての既存テーブルを削除して、新規テーブルで上書きしますか？`,
            '削除して上書き',
            'キャンセル'
          );
          
          if (confirmed) {
            // 新規開始月以降の既存テーブルを削除
            await this.deleteTablesFromMonth(existingTables, newFrom.year, newFrom.month);
            return true;
          } else {
            return false;
          }
        } else {
          return false; // 新規の終了日を設定する場合は保存をキャンセル
        }
      }

      // ケース3: 新規開始月 = 既存開始月
      if (compareNewToExisting === 0) {
        const choice = await this.showChoiceDialog(
          '適用開始月の重複',
          `新規テーブルの適用開始月が既存テーブルと同じです。\n既存テーブルを上書きしますか？それとも新規テーブルの適用開始月を修正しますか？`,
          '新規を修正',
          '既存を上書き'
        );
        
        if (choice === 'overwrite') {
          // 適用開始月が同じ既存テーブルのみを削除して上書き
          const tablesToDelete = existingTables.filter(table => {
            const tableFrom = this.getYearMonthFromDate(new Date(table.effectiveFrom));
            return this.compareYearMonth(tableFrom.year, tableFrom.month, newFrom.year, newFrom.month) === 0;
          });
          
          const promises = tablesToDelete
            .filter(table => table.id)
            .map(table => this.insuranceRateTableService.deleteRateTable(table.id!));
          await Promise.all(promises);
          return true;
        } else {
          return false; // 新規を修正する場合は保存をキャンセル
        }
      }

      return true; // 重複がない場合はそのまま進む
    } catch (error) {
      console.error('Failed to check conflicts', error);
      return true; // エラーが発生した場合はそのまま進む
    }
  }

  private async showConfirmDialog(title: string, message: string, confirmText: string, cancelText: string): Promise<boolean> {
    // 簡易的な確認ダイアログ（後でMatDialogコンポーネントに置き換え可能）
    return confirm(`${title}\n\n${message}\n\nOK: ${confirmText}, Cancel: ${cancelText}`);
  }

  private async showChoiceDialog(title: string, message: string, option1: string, option2: string): Promise<'existing' | 'overwrite' | 'cancel'> {
    // 簡易的な選択ダイアログ（後でMatDialogコンポーネントに置き換え可能）
    // option1が「新規を修正」または「新規の終了日を設定」、option2が「既存を修正」または「既存を上書き」または「以降の全てのテーブルを削除して上書き」
    const messageWithOptions = `${title}\n\n${message}\n\n1: ${option1}\n2: ${option2}`;
    const userInput = prompt(messageWithOptions + '\n\n1または2を入力してください:');
    
    if (userInput === '2') {
      if (option2.includes('既存を修正')) {
        return 'existing';
      } else if (option2.includes('既存を上書き') || option2.includes('削除して上書き')) {
        return 'overwrite';
      } else {
        return 'overwrite'; // デフォルト
      }
    } else if (userInput === '1') {
      return 'cancel';
    } else {
      return 'cancel'; // キャンセルまたは無効な入力
    }
  }

  private async updateExistingTableEffectiveTo(tables: InsuranceRateTable[], newEffectiveTo: Date): Promise<void> {
    const promises = tables
      .filter(table => table.id)
      .map(table => this.insuranceRateTableService.updateRateTable(table.id!, { effectiveTo: newEffectiveTo }));
    await Promise.all(promises);
  }

  private async updateExistingTableEffectiveFrom(tables: InsuranceRateTable[], newEffectiveFrom: Date): Promise<void> {
    const promises = tables
      .filter(table => table.id)
      .map(table => this.insuranceRateTableService.updateRateTable(table.id!, { effectiveFrom: newEffectiveFrom }));
    await Promise.all(promises);
  }

  private async deleteTablesFromMonth(tables: InsuranceRateTable[], year: number, month: number): Promise<void> {
    // 指定された年月以降の既存テーブルを削除
    const targetDate = new Date(year, month - 1, 1);
    const tablesToDelete = tables.filter(table => {
      const effectiveFrom = this.convertToDate(table.effectiveFrom);
      if (!effectiveFrom) {
        return false;
      }
      // 適用開始月が指定年月以降のテーブルを削除対象とする
      const tableFromYear = effectiveFrom.getFullYear();
      const tableFromMonth = effectiveFrom.getMonth() + 1;
      return this.compareYearMonth(tableFromYear, tableFromMonth, year, month) >= 0;
    });

    const promises = tablesToDelete
      .filter(table => table.id)
      .map(table => this.insuranceRateTableService.deleteRateTable(table.id!));
    await Promise.all(promises);
  }

  private convertToDate(value: any): Date | null {
    if (!value) {
      return null;
    }
    // 既にDateオブジェクトの場合はそのまま返す
    if (value instanceof Date) {
      return value;
    }
    // Timestampオブジェクトの場合はtoDate()を呼び出す
    if (value && typeof value.toDate === 'function') {
      try {
        return value.toDate();
      } catch (error) {
        console.error('Failed to convert Timestamp to Date:', error);
        return null;
      }
    }
    // seconds と nanoseconds プロパティがある場合（Firestore Timestamp形式）
    if (value && typeof value.seconds === 'number') {
      try {
        // seconds をミリ秒に変換して Date オブジェクトを作成
        const milliseconds = value.seconds * 1000 + (value.nanoseconds || 0) / 1000000;
        return new Date(milliseconds);
      } catch (error) {
        console.error('Failed to convert Timestamp (seconds/nanoseconds) to Date:', error);
        return null;
      }
    }
    // その他の場合はnullを返す
    return null;
  }


  close(): void {
    this.dialogRef.close(false);
  }
}

