import { Component, Inject, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { InsuranceRateTableService } from '../../../../core/services/insurance-rate-table.service';
import { InsuranceRateTable } from '../../../../core/models/insurance-rate-table.model';
import * as XLSX from 'xlsx';

export interface InsuranceRateTableImportDialogData {
  organizationId: string | null;
}

@Component({
  selector: 'app-insurance-rate-table-import-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressBarModule
  ],
  templateUrl: './insurance-rate-table-import-dialog.component.html',
  styleUrl: './insurance-rate-table-import-dialog.component.css'
})
export class InsuranceRateTableImportDialogComponent {
  private insuranceRateTableService = inject(InsuranceRateTableService);
  private snackBar = inject(MatSnackBar);

  selectedFile: File | null = null;
  isImporting = false;
  previewData: any[] = [];

  constructor(
    public dialogRef: MatDialogRef<InsuranceRateTableImportDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: InsuranceRateTableImportDialogData
  ) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      
      // ファイルタイプのチェック
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv' // .csv
      ];
      
      if (!validTypes.includes(file.type) && !file.name.endsWith('.csv') && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        this.snackBar.open('CSVまたはExcelファイルを選択してください', '閉じる', { duration: 3000 });
        return;
      }

      this.selectedFile = file;
      this.previewFile(file);
    }
  }

  async previewFile(file: File): Promise<void> {
    try {
      const data = await this.readFile(file);
      this.previewData = data.slice(0, 5); // 最初の5行をプレビュー
    } catch (error) {
      console.error('ファイルの読み込みに失敗しました:', error);
      this.snackBar.open('ファイルの読み込みに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  async readFile(file: File): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e: any) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  async import(): Promise<void> {
    if (!this.selectedFile || !this.data.organizationId) {
      return;
    }

    this.isImporting = true;
    try {
      const data = await this.readFile(this.selectedFile);
      const rateTables: Omit<InsuranceRateTable, 'id' | 'createdAt' | 'updatedAt'>[] = [];

      // CSV/ExcelデータをInsuranceRateTable形式に変換
      // 列のマッピングは実装時に調整が必要
      for (const row of data) {
        const rateTable: Omit<InsuranceRateTable, 'id' | 'createdAt' | 'updatedAt'> = {
          grade: (row as any)['等級'] || (row as any)['grade'],
          pensionGrade: (row as any)['厚生年金等級'] || (row as any)['pensionGrade'] || null,
          standardRewardAmount: (row as any)['標準報酬月額'] || (row as any)['standardRewardAmount'],
          minAmount: (row as any)['最小値'] || (row as any)['minAmount'] || 0,
          maxAmount: (row as any)['最大値'] || (row as any)['maxAmount'],
          effectiveFrom: this.parseDate((row as any)['適用開始日'] || (row as any)['effectiveFrom']),
          effectiveTo: this.parseDate((row as any)['適用終了日'] || (row as any)['effectiveTo']) || null,
          organizationId: this.data.organizationId,
          healthInsuranceWithoutCare: {
            rate: (row as any)['健保（介護なし）料率'] || (row as any)['healthInsuranceWithoutCareRate'],
            total: (row as any)['健保（介護なし）全額'] || (row as any)['healthInsuranceWithoutCareTotal'],
            half: (row as any)['健保（介護なし）折半'] || (row as any)['healthInsuranceWithoutCareHalf']
          },
          healthInsuranceWithCare: {
            rate: (row as any)['健保（介護あり）料率'] || (row as any)['healthInsuranceWithCareRate'],
            total: (row as any)['健保（介護あり）全額'] || (row as any)['healthInsuranceWithCareTotal'],
            half: (row as any)['健保（介護あり）折半'] || (row as any)['healthInsuranceWithCareHalf']
          },
          pensionInsurance: {
            rate: (row as any)['厚生年金料率'] || (row as any)['pensionInsuranceRate'],
            total: (row as any)['厚生年金全額'] || (row as any)['pensionInsuranceTotal'],
            half: (row as any)['厚生年金折半'] || (row as any)['pensionInsuranceHalf']
          }
        };

        rateTables.push(rateTable);
      }

      // 既存のテーブルを削除（オプション：確認ダイアログを表示）
      // await this.insuranceRateTableService.deleteAllByOrganization(this.data.organizationId);

      // 新しいテーブルを作成
      await this.insuranceRateTableService.createRateTables(rateTables);
      
      this.snackBar.open(`${rateTables.length}件の保険料率テーブルをインポートしました`, '閉じる', { duration: 3000 });
      this.dialogRef.close(true);
    } catch (error) {
      console.error('インポートに失敗しました:', error);
      this.snackBar.open('インポートに失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isImporting = false;
    }
  }

  private parseDate(value: any): Date {
    if (!value) {
      return new Date();
    }
    if (value instanceof Date) {
      return value;
    }
    // Excelの日付シリアル値の場合
    if (typeof value === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      return new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    }
    // 文字列の場合
    if (typeof value === 'string') {
      return new Date(value);
    }
    return new Date();
  }

  getKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}

