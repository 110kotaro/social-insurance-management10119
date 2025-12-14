import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-sample-dialog',
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

            <!-- 氏名 -->
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>氏名 *</th>
              <td mat-cell *matCellDef="let row">{{ row.name }}</td>
            </ng-container>

            <!-- 氏名カナ -->
            <ng-container matColumnDef="nameKana">
              <th mat-header-cell *matHeaderCellDef>氏名カナ *</th>
              <td mat-cell *matCellDef="let row">{{ row.nameKana }}</td>
            </ng-container>

            <!-- メールアドレス -->
            <ng-container matColumnDef="email">
              <th mat-header-cell *matHeaderCellDef>メールアドレス *</th>
              <td mat-cell *matCellDef="let row">{{ row.email }}</td>
            </ng-container>

            <!-- 部署名 -->
            <ng-container matColumnDef="departmentName">
              <th mat-header-cell *matHeaderCellDef>部署名 *</th>
              <td mat-cell *matCellDef="let row">{{ row.departmentName }}</td>
            </ng-container>

            <!-- 入社日 -->
            <ng-container matColumnDef="joinDate">
              <th mat-header-cell *matHeaderCellDef>入社日 *</th>
              <td mat-cell *matCellDef="let row">{{ row.joinDate }}</td>
            </ng-container>

            <!-- 生年月日 -->
            <ng-container matColumnDef="birthDate">
              <th mat-header-cell *matHeaderCellDef>生年月日 *</th>
              <td mat-cell *matCellDef="let row">{{ row.birthDate }}</td>
            </ng-container>

            <!-- ステータス -->
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>ステータス *</th>
              <td mat-cell *matCellDef="let row">{{ row.status }}</td>
            </ng-container>

            <!-- 権限 -->
            <ng-container matColumnDef="role">
              <th mat-header-cell *matHeaderCellDef>権限 *</th>
              <td mat-cell *matCellDef="let row">{{ row.role || '一般社員' }}</td>
            </ng-container>

            <!-- 健康保険被保険者番号 -->
            <ng-container matColumnDef="healthInsuranceNumber">
              <th mat-header-cell *matHeaderCellDef>健康保険被保険者番号</th>
              <td mat-cell *matCellDef="let row">{{ row.healthInsuranceNumber || '-' }}</td>
            </ng-container>

            <!-- 厚生年金被保険者番号 -->
            <ng-container matColumnDef="pensionNumber">
              <th mat-header-cell *matHeaderCellDef>厚生年金被保険者番号</th>
              <td mat-cell *matCellDef="let row">{{ row.pensionNumber || '-' }}</td>
            </ng-container>

            <!-- マイナンバー -->
            <ng-container matColumnDef="myNumber">
              <th mat-header-cell *matHeaderCellDef>マイナンバー</th>
              <td mat-cell *matCellDef="let row">{{ row.myNumber || '-' }}</td>
            </ng-container>

            <!-- 標準報酬月額 -->
            <ng-container matColumnDef="standardReward">
              <th mat-header-cell *matHeaderCellDef>標準報酬月額</th>
              <td mat-cell *matCellDef="let row">{{ row.standardReward || '-' }}</td>
            </ng-container>

            <!-- 保険適用開始日 -->
            <ng-container matColumnDef="insuranceStartDate">
              <th mat-header-cell *matHeaderCellDef>保険適用開始日</th>
              <td mat-cell *matCellDef="let row">{{ row.insuranceStartDate || '-' }}</td>
            </ng-container>

            <!-- 郵便番号 -->
            <ng-container matColumnDef="postalCode">
              <th mat-header-cell *matHeaderCellDef>郵便番号 *</th>
              <td mat-cell *matCellDef="let row">{{ row.postalCode || '-' }}</td>
            </ng-container>

            <!-- 都道府県 -->
            <ng-container matColumnDef="prefecture">
              <th mat-header-cell *matHeaderCellDef>都道府県 *</th>
              <td mat-cell *matCellDef="let row">{{ row.prefecture || '-' }}</td>
            </ng-container>

            <!-- 市区町村 -->
            <ng-container matColumnDef="city">
              <th mat-header-cell *matHeaderCellDef>市区町村 *</th>
              <td mat-cell *matCellDef="let row">{{ row.city || '-' }}</td>
            </ng-container>

            <!-- 町名・番地 -->
            <ng-container matColumnDef="street">
              <th mat-header-cell *matHeaderCellDef>町名・番地 *</th>
              <td mat-cell *matCellDef="let row">{{ row.street || '-' }}</td>
            </ng-container>

            <!-- 建物名・部屋番号 -->
            <ng-container matColumnDef="building">
              <th mat-header-cell *matHeaderCellDef>建物名・部屋番号</th>
              <td mat-cell *matCellDef="let row">{{ row.building || '-' }}</td>
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
export class SampleDialogComponent {
  displayedColumns: string[] = [
    'employeeNumber', 'name', 'nameKana', 'email', 'departmentName', 'joinDate', 'birthDate', 'status', 'role',
    'healthInsuranceNumber', 'pensionNumber', 'myNumber', 'standardReward', 'insuranceStartDate',
    'postalCode', 'prefecture', 'city', 'street', 'building'
  ];
  
  sampleData = [
    {
      employeeNumber: 'EMP001',
      name: '山田 太郎',
      nameKana: 'ヤマダ タロウ',
      email: 'yamada.taro@example.com',
      departmentName: '営業部',
      joinDate: '2024-04-01',
      birthDate: '1990-05-15',
      status: '在籍',
      role: '一般社員',
      healthInsuranceNumber: '12345678',
      pensionNumber: '87654321',
      myNumber: '1234567890123',
      standardReward: '300000',
      insuranceStartDate: '2024-04-01',
      postalCode: '100-0001',
      prefecture: '東京都',
      city: '千代田区',
      street: '千代田1-1-1',
      building: 'サンプルビル101'
    },
    {
      employeeNumber: 'EMP002',
      name: '佐藤 花子',
      nameKana: 'サトウ ハナコ',
      email: 'sato.hanako@example.com',
      departmentName: '総務部',
      joinDate: '2023-10-01',
      birthDate: '1992-08-20',
      status: '在籍',
      role: '管理者',
      healthInsuranceNumber: '23456789',
      pensionNumber: '98765432',
      myNumber: '2345678901234',
      standardReward: '280000',
      insuranceStartDate: '2023-10-01',
      postalCode: '150-0001',
      prefecture: '東京都',
      city: '渋谷区',
      street: '渋谷2-2-2',
      building: 'サンプルマンション202'
    },
    {
      employeeNumber: 'EMP003',
      name: '鈴木 一郎',
      nameKana: 'スズキ イチロウ',
      email: 'suzuki.ichiro@example.com',
      departmentName: '開発部',
      joinDate: '2022-07-01',
      birthDate: '1988-12-10',
      status: '休職',
      role: '一般社員',
      healthInsuranceNumber: '34567890',
      pensionNumber: '10987654',
      myNumber: '3456789012345',
      standardReward: '350000',
      insuranceStartDate: '2022-07-01',
      postalCode: '200-0002',
      prefecture: '東京都',
      city: '港区',
      street: '港3-3-3',
      building: 'サンプルタワー303'
    },
    {
      employeeNumber: 'EMP004',
      name: '田中 美咲',
      nameKana: 'タナカ ミサキ',
      email: 'tanaka.misaki@example.com',
      departmentName: '人事部',
      joinDate: '2025-04-01',
      birthDate: '1995-03-25',
      status: '未入社',
      role: '一般社員',
      healthInsuranceNumber: '45678901',
      pensionNumber: '21098765',
      myNumber: '4567890123456',
      standardReward: '250000',
      insuranceStartDate: '2025-04-01',
      postalCode: '250-0003',
      prefecture: '神奈川県',
      city: '横浜市',
      street: '中区4-4-4',
      building: 'サンプルハイツ404'
    }
  ];

  csvText = `社員番号,氏名,氏名カナ,メールアドレス,部署名,入社日,生年月日,ステータス,権限,健康保険被保険者番号,厚生年金被保険者番号,マイナンバー,標準報酬月額,保険適用開始日,郵便番号,都道府県,市区町村,町名・番地,建物名・部屋番号
EMP001,山田 太郎,ヤマダ タロウ,yamada.taro@example.com,営業部,2024-04-01,1990-05-15,在籍,一般社員,12345678,87654321,1234567890123,300000,2024-04-01,100-0001,東京都,千代田区,千代田1-1-1,サンプルビル101
EMP002,佐藤 花子,サトウ ハナコ,sato.hanako@example.com,総務部,2023-10-01,1992-08-20,在籍,管理者,23456789,98765432,2345678901234,280000,2023-10-01,150-0001,東京都,渋谷区,渋谷2-2-2,サンプルマンション202
EMP003,鈴木 一郎,スズキ イチロウ,suzuki.ichiro@example.com,開発部,2022-07-01,1988-12-10,休職,一般社員,34567890,10987654,3456789012345,350000,2022-07-01,200-0002,東京都,港区,港3-3-3,サンプルタワー303
EMP004,田中 美咲,タナカ ミサキ,tanaka.misaki@example.com,人事部,2025-04-01,1995-03-25,未入社,一般社員,45678901,21098765,4567890123456,250000,2025-04-01,250-0003,神奈川県,横浜市,中区4-4-4,サンプルハイツ404`;

  private dialogRef = inject(MatDialogRef<SampleDialogComponent>);

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
    link.download = '社員インポートサンプル.csv';
    
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
      XLSX.utils.book_append_sheet(workbook, worksheet, '社員データ');

      // ファイルをダウンロード
      XLSX.writeFile(workbook, '社員インポートサンプル.xlsx');
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

