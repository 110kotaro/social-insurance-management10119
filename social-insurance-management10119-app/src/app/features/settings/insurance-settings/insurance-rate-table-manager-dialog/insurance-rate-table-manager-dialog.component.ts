import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { InsuranceRateTable } from '../../../../core/models/insurance-rate-table.model';
import { InsuranceRateTableService } from '../../../../core/services/insurance-rate-table.service';
import { AuthService } from '../../../../core/auth/auth.service';

export interface InsuranceRateTableManagerDialogData {
  organizationId: string | null;
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
    MatFormFieldModule
  ],
  templateUrl: './insurance-rate-table-manager-dialog.component.html',
  styleUrl: './insurance-rate-table-manager-dialog.component.css'
})
export class InsuranceRateTableManagerDialogComponent implements OnInit {
  private snackBar = inject(MatSnackBar);
  private insuranceRateTableService = inject(InsuranceRateTableService);
  private authService = inject(AuthService);

  readonly organizationId: string | null;

  rateTables: InsuranceRateTable[] = [];
  tableEffectiveFrom: Date = new Date();
  tableEffectiveTo: Date | null = null;

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
  }

  ngOnInit(): void {
    this.loadRateTables();
  }

  async loadRateTables(): Promise<void> {
    if (!this.organizationId) {
      this.rateTables = [];
      return;
    }

    this.isLoading = true;
    try {
      this.rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(this.organizationId);
      this.rateTables.sort((a, b) => a.grade - b.grade);

      if (this.rateTables.length > 0) {
        const first = this.rateTables[0];
        this.headerRates.healthWithoutCare = first.healthInsuranceWithoutCare?.rate ?? this.headerRates.healthWithoutCare;
        this.headerRates.healthWithCare = first.healthInsuranceWithCare?.rate ?? this.headerRates.healthWithCare;
        this.headerRates.pension = first.pensionInsurance?.rate ?? this.headerRates.pension;
        if (first.effectiveFrom) {
          this.tableEffectiveFrom = new Date(first.effectiveFrom);
        }
        this.tableEffectiveTo = first.effectiveTo ? new Date(first.effectiveTo) : null;
      }
    } catch (error) {
      console.error('Failed to load rate tables', error);
      this.snackBar.open('料率テーブルの読み込みに失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  formatDateForInput(date: Date | null | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  onTableEffectiveFromChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.tableEffectiveFrom = input.value ? new Date(input.value) : new Date();
  }

  onTableEffectiveToChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.tableEffectiveTo = input.value ? new Date(input.value) : null;
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
    if (!this.editingRow || this.editingRowIndex === null || this.editingRowIndex < 0) {
      return;
    }

    if (!this.isEditingHeaderRates) {
      this.editingRow.healthInsuranceWithoutCare.rate = this.headerRates.healthWithoutCare;
      this.editingRow.healthInsuranceWithCare.rate = this.headerRates.healthWithCare;
      this.editingRow.pensionInsurance.rate = this.headerRates.pension;
    }
    this.editingRow.effectiveFrom = this.tableEffectiveFrom;
    this.editingRow.effectiveTo = this.tableEffectiveTo;

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

    if (this.editingRow) {
      this.saveRow();
      if (this.editingRow) {
        return;
      }
    }

    if (this.rateTables.length === 0) {
      this.errorMessage = '少なくとも1件のデータを追加してください';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      await this.insuranceRateTableService.deleteAllByOrganization(this.organizationId);
      const rateTablesToSave = this.rateTables.map(table => ({
        ...table,
        organizationId: this.organizationId,
        effectiveFrom: this.tableEffectiveFrom,
        effectiveTo: this.tableEffectiveTo,
        createdAt: table.createdAt || new Date(),
        updatedAt: new Date()
      }));

      await this.insuranceRateTableService.createRateTables(rateTablesToSave);
      this.snackBar.open('料率テーブルを保存しました', '閉じる', { duration: 3000 });
      this.dialogRef.close(true);
    } catch (error) {
      console.error('Failed to save rate tables', error);
      this.errorMessage = 'データの保存に失敗しました';
    } finally {
      this.isLoading = false;
    }
  }

  close(): void {
    this.dialogRef.close(false);
  }
}

