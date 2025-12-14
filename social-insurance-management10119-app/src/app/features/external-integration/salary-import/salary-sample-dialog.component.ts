import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-salary-sample-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>description</mat-icon>
      サンプルデータ
    </h2>
    <mat-dialog-content>
      <div class="sample-content">
        <p class="description">
          以下の形式でCSV/Excelファイルを作成してください。
        </p>
        
        <!-- テーブル表示 -->
        <div class="table-container">
          <table mat-table [dataSource]="sampleData" class="sample-table">
            <!-- 社員番号 -->
            <ng-container matColumnDef="employeeNumber">
              <th mat-header-cell *matHeaderCellDef>社員番号 *</th>
              <td mat-cell *matCellDef="let row">{{ row.employeeNumber }}</td>
            </ng-container>

            <!-- 社員名 -->
            <ng-container matColumnDef="employeeName">
              <th mat-header-cell *matHeaderCellDef>社員名 *</th>
              <td mat-cell *matCellDef="let row">{{ row.employeeName }}</td>
            </ng-container>

            <!-- 年 -->
            <ng-container matColumnDef="year">
              <th mat-header-cell *matHeaderCellDef>年 *</th>
              <td mat-cell *matCellDef="let row">{{ row.year }}</td>
            </ng-container>

            <!-- 月 -->
            <ng-container matColumnDef="month">
              <th mat-header-cell *matHeaderCellDef>月 *</th>
              <td mat-cell *matCellDef="let row">{{ row.month }}</td>
            </ng-container>

            <!-- 基礎日数 -->
            <ng-container matColumnDef="baseDays">
              <th mat-header-cell *matHeaderCellDef>基礎日数 *</th>
              <td mat-cell *matCellDef="let row">{{ row.baseDays }}</td>
            </ng-container>

            <!-- 固定賃金 -->
            <ng-container matColumnDef="fixedSalary">
              <th mat-header-cell *matHeaderCellDef>固定賃金 *</th>
              <td mat-cell *matCellDef="let row">{{ row.fixedSalary | number }}</td>
            </ng-container>

            <!-- 総支給 -->
            <ng-container matColumnDef="totalPayment">
              <th mat-header-cell *matHeaderCellDef>総支給 *</th>
              <td mat-cell *matCellDef="let row">{{ row.totalPayment | number }}</td>
            </ng-container>

            <!-- 遡及支払額 -->
            <ng-container matColumnDef="retroactivePayment">
              <th mat-header-cell *matHeaderCellDef>遡及支払額</th>
              <td mat-cell *matCellDef="let row">{{ row.retroactivePayment | number }}</td>
            </ng-container>

            <!-- 賞与 -->
            <ng-container matColumnDef="bonus">
              <th mat-header-cell *matHeaderCellDef>賞与</th>
              <td mat-cell *matCellDef="let row">{{ row.bonus | number }}</td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>
        </div>

        <!-- CSV形式テキスト -->
        <div class="csv-text">
          <h3>CSV形式</h3>
          <pre class="csv-content">{{ csvText }}</pre>
          <div class="csv-buttons">
            <button mat-raised-button color="primary" (click)="copyToClipboard()">
              <mat-icon>content_copy</mat-icon>
              クリップボードにコピー
            </button>
            <button mat-raised-button color="accent" (click)="downloadCsv()">
              <mat-icon>download</mat-icon>
              CSVをダウンロード
            </button>
            <button mat-raised-button color="accent" (click)="downloadExcel()">
              <mat-icon>download</mat-icon>
              Excelをダウンロード
            </button>
          </div>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="close()">閉じる</button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }

    .sample-content {
      min-width: 800px;
      max-width: 1000px;
    }

    .description {
      margin-bottom: 16px;
      color: rgba(0, 0, 0, 0.6);
    }

    .table-container {
      overflow-x: auto;
      margin-bottom: 24px;
    }

    .sample-table {
      width: auto;
    }

    .sample-table th {
      font-weight: 500;
      background-color: #f5f5f5;
      padding: 12px 16px;
      white-space: nowrap;
    }

    .sample-table td {
      padding: 12px 16px;
      white-space: nowrap;
    }

    .csv-text {
      margin-top: 24px;
    }

    .csv-text h3 {
      margin-bottom: 8px;
      font-size: 16px;
      font-weight: 500;
    }

    .csv-content {
      background-color: #f5f5f5;
      padding: 16px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.5;
      margin-bottom: 16px;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .csv-buttons {
      display: flex;
      gap: 12px;
      margin-top: 8px;
    }

    .csv-buttons button {
      margin-top: 0;
    }

    mat-dialog-content {
      max-height: 80vh;
      overflow-y: auto;
    }
  `]
})
export class SalarySampleDialogComponent {
  displayedColumns: string[] = [
    'employeeNumber', 'employeeName', 'year', 'month', 'baseDays', 
    'fixedSalary', 'totalPayment', 'retroactivePayment', 'bonus'
  ];
  
  sampleData = [
    {
      employeeNumber: 'EMP001',
      employeeName: '山田 太郎',
      year: 2024,
      month: 4,
      baseDays: 20,
      fixedSalary: 300000,
      totalPayment: 350000,
      retroactivePayment: 0,
      bonus: 0
    },
    {
      employeeNumber: 'EMP002',
      employeeName: '佐藤 花子',
      year: 2024,
      month: 4,
      baseDays: 22,
      fixedSalary: 280000,
      totalPayment: 320000,
      retroactivePayment: 5000,
      bonus: 0
    },
    {
      employeeNumber: 'EMP003',
      employeeName: '鈴木 一郎',
      year: 2024,
      month: 4,
      baseDays: 18,
      fixedSalary: 350000,
      totalPayment: 400000,
      retroactivePayment: 0,
      bonus: 500000
    },
    {
      employeeNumber: 'EMP001',
      employeeName: '山田 太郎',
      year: 2024,
      month: 5,
      baseDays: 22,
      fixedSalary: 300000,
      totalPayment: 360000,
      retroactivePayment: 0,
      bonus: 0
    }
  ];

  csvText = `社員番号,社員名,年,月,基礎日数,固定賃金,総支給,遡及支払額,賞与
EMP001,山田 太郎,2024,4,20,300000,350000,0,0
EMP002,佐藤 花子,2024,4,22,280000,320000,5000,0
EMP003,鈴木 一郎,2024,4,18,350000,400000,0,500000
EMP001,山田 太郎,2024,5,22,300000,360000,0,0`;

  private dialogRef = inject(MatDialogRef<SalarySampleDialogComponent>);

  copyToClipboard(): void {
    navigator.clipboard.writeText(this.csvText).then(() => {
      // コピー成功のフィードバックは親コンポーネントで処理
    }).catch(err => {
      console.error('クリップボードへのコピーに失敗しました:', err);
    });
  }

  downloadCsv(): void {
    // BOMを追加してUTF-8エンコーディングを明示（Excelで日本語が正しく表示されるように）
    const BOM = '\uFEFF';
    const csvContent = BOM + this.csvText;
    
    // Blobを作成
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // ダウンロード用のURLを作成
    const url = URL.createObjectURL(blob);
    
    // 一時的なリンク要素を作成
    const link = document.createElement('a');
    link.href = url;
    link.download = '給与インポートサンプル.csv';
    
    // リンクをクリックしてダウンロード
    document.body.appendChild(link);
    link.click();
    
    // クリーンアップ
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  downloadExcel(): void {
    try {
      // CSVテキストをパースしてデータ配列に変換
      const lines = this.csvText.split('\n');
      const headers = lines[0].split(',');
      const data: any[] = [];

      // データ行を処理
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = this.parseCsvLine(lines[i]);
        if (values.length === headers.length) {
          const row: any = {};
          headers.forEach((header, index) => {
            row[header.trim()] = values[index]?.trim() || '';
          });
          data.push(row);
        }
      }

      // Excelワークブックを作成
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '給与データ');

      // ファイルをダウンロード
      XLSX.writeFile(workbook, '給与インポートサンプル.xlsx');
    } catch (error) {
      console.error('Excelファイルの生成に失敗しました:', error);
    }
  }

  /**
   * CSV行をパース（カンマ区切り、ダブルクォート対応）
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // エスケープされたダブルクォート
          current += '"';
          i++;
        } else {
          // クォートの開始/終了
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // フィールドの区切り
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    // 最後のフィールドを追加
    result.push(current);
    
    return result;
  }

  close(): void {
    this.dialogRef.close();
  }
}
