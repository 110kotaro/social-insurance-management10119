import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../../core/auth/auth.service';
import { InsuranceRateTableService } from '../../../core/services/insurance-rate-table.service';
import { InsuranceRateTable } from '../../../core/models/insurance-rate-table.model';
import { InsuranceRateTableEditDialogComponent } from './insurance-rate-table-edit-dialog/insurance-rate-table-edit-dialog.component';
import { InsuranceRateTableManagerDialogComponent } from './insurance-rate-table-manager-dialog/insurance-rate-table-manager-dialog.component';

@Component({
  selector: 'app-insurance-settings',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSelectModule,
    MatTooltipModule
  ],
  templateUrl: './insurance-settings.component.html',
  styleUrl: './insurance-settings.component.css'
})
export class InsuranceSettingsComponent implements OnInit {
  private authService = inject(AuthService);
  private insuranceRateTableService = inject(InsuranceRateTableService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  organizationId: string | null = null;
  rateTables: InsuranceRateTable[] = [];
  filteredRateTables: InsuranceRateTable[] = [];
  dataSource = new MatTableDataSource<InsuranceRateTable>([]);

  selectedEffectiveYear: number | null = null;
  selectedEffectiveMonth: number | null = null;
  effectiveYears: number[] = [];
  readonly months: number[] = Array.from({ length: 12 }, (_, index) => index + 1);

  displayedColumns: string[] = [
    'grade',
    'pensionGrade',
    'standardRewardAmount',
    'minAmount',
    'maxAmount',
    'healthInsuranceWithoutCare',
    'healthInsuranceWithCare',
    'pensionInsurance',
    'effectiveFrom',
    'effectiveTo',
    'actions'
  ];

  isLoading = false;

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.organizationId) {
      this.organizationId = currentUser.organizationId;
      this.loadRateTables();
    }
  }

  async loadRateTables(): Promise<void> {
    if (!this.organizationId) {
      return;
    }

    this.isLoading = true;
    try {
      const orgRateTables = await this.insuranceRateTableService.getRateTablesByOrganization(this.organizationId);
      const commonRateTables = await this.insuranceRateTableService.getCommonRateTables();

      // 組織固有のテーブルをすべて追加
      const allTables: InsuranceRateTable[] = [...orgRateTables];

      // 共通テーブルを追加（組織固有のテーブルに存在しないgradeのみ）
      // ただし、同じgradeでも適用期間が異なる場合は両方保持する必要があるため、
      // 組織固有のテーブルに存在するgradeの共通テーブルは追加しない
      const orgGrades = new Set(orgRateTables.map(table => table.grade));
      commonRateTables.forEach(table => {
        if (!orgGrades.has(table.grade)) {
          allTables.push(table);
        }
      });

      // gradeと適用開始日の両方でソート
      this.rateTables = allTables.sort((a, b) => {
        if (a.grade !== b.grade) {
          return a.grade - b.grade;
        }
        // 同じgradeの場合は適用開始日でソート（新しい順）
        const aFrom = this.convertToDate(a.effectiveFrom);
        const bFrom = this.convertToDate(b.effectiveFrom);
        if (aFrom && bFrom) {
          return bFrom.getTime() - aFrom.getTime();
        }
        return 0;
      });

      const years = new Set<number>();
      const currentYear = new Date().getFullYear();
      const futureYears = 2; // 将来2年まで表示
      
      this.rateTables.forEach(table => {
        const effectiveFrom = this.convertToDate(table.effectiveFrom);
        const effectiveTo = this.convertToDate(table.effectiveTo);
        
        if (effectiveFrom) {
          const startYear = effectiveFrom.getFullYear();
          let endYear: number;
          
          if (effectiveTo) {
            // 終了日が設定されている場合
            endYear = effectiveTo.getFullYear();
          } else {
            // 終了日未設定の場合、現在年+将来の年まで
            endYear = currentYear + futureYears;
          }
          
          // 開始年から終了年まですべての年を追加
          for (let year = startYear; year <= endYear; year++) {
            years.add(year);
          }
        }
      });
      this.effectiveYears = Array.from(years).sort((a, b) => b - a);

      this.applyFilter();
    } catch (error) {
      console.error('保険料率テーブルの読み込みに失敗しました:', error);
      this.snackBar.open('保険料率テーブルの読み込みに失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  applyFilter(): void {
    if (this.selectedEffectiveYear === null || this.selectedEffectiveMonth === null) {
      this.filteredRateTables = [];
      this.dataSource.data = this.filteredRateTables;
      return;
    }

    const { startOfMonth, endOfMonth } = this.getMonthRange(this.selectedEffectiveYear, this.selectedEffectiveMonth);

    this.filteredRateTables = this.rateTables.filter(table => {
      const effectiveFrom = this.convertToDate(table.effectiveFrom);
      if (!effectiveFrom) {
        return false;
      }

      const effectiveTo = this.convertToDate(table.effectiveTo);
      const effectiveFromTime = effectiveFrom.getTime();
      const effectiveToTime = effectiveTo ? effectiveTo.getTime() : Number.POSITIVE_INFINITY;
      return effectiveFromTime <= endOfMonth.getTime() && effectiveToTime >= startOfMonth.getTime();
    });

    this.dataSource.data = this.filteredRateTables;
  }

  onYearFilterChange(year: number | null): void {
    this.selectedEffectiveYear = year;
    this.selectedEffectiveMonth = null;
    this.applyFilter();
  }

  onMonthFilterChange(month: number | null): void {
    this.selectedEffectiveMonth = month;
    this.applyFilter();
  }

  isFilterActive(): boolean {
    return this.selectedEffectiveYear !== null && this.selectedEffectiveMonth !== null;
  }

  private getMonthRange(year: number, month: number): { startOfMonth: Date; endOfMonth: Date } {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);
    return { startOfMonth, endOfMonth };
  }

  /**
   * FirestoreのTimestampまたはDateをDateオブジェクトに変換するヘルパー関数
   */
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

  openEditDialog(rateTable?: InsuranceRateTable): void {
    const dialogRef = this.dialog.open(InsuranceRateTableEditDialogComponent, {
      width: '800px',
      data: {
        rateTable: rateTable || null,
        organizationId: this.organizationId
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadRateTables();
      }
    });
  }

  openRateTableManager(): void {
    const dialogRef = this.dialog.open(InsuranceRateTableManagerDialogComponent, {
      width: '95vw',
      maxWidth: '1200px',
      height: '90vh',
      maxHeight: '95vh',
      data: {
        organizationId: this.organizationId,
        isNew: true
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadRateTables();
      }
    });
  }


  async deleteRateTable(rateTable: InsuranceRateTable): Promise<void> {
    if (!rateTable.id) {
      return;
    }

    const effectiveFrom = this.convertToDate(rateTable.effectiveFrom);
    const effectiveTo = this.convertToDate(rateTable.effectiveTo);
    const effectiveFromStr = effectiveFrom 
      ? `${effectiveFrom.getFullYear()}年${effectiveFrom.getMonth() + 1}月`
      : '不明';
    const effectiveToStr = effectiveTo 
      ? `${effectiveTo.getFullYear()}年${effectiveTo.getMonth() + 1}月`
      : '現在も有効';

    const confirmMessage = `等級${rateTable.grade}の保険料率テーブル（適用期間：${effectiveFromStr}～${effectiveToStr}）を削除しますか？\n\nこの操作は取り消せません。`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      await this.insuranceRateTableService.deleteRateTable(rateTable.id);
      this.snackBar.open('保険料率テーブルを削除しました', '閉じる', { duration: 3000 });
      this.loadRateTables();
    } catch (error) {
      console.error('保険料率テーブルの削除に失敗しました:', error);
      this.snackBar.open('保険料率テーブルの削除に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  formatDate(date: Date | null): string {
    if (!date) {
      return '-';
    }
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  formatCurrency(amount: number | null | undefined): string {
    if (amount === null || amount === undefined || Number.isNaN(amount)) {
      return '-';
    }
    return `¥${amount.toLocaleString()}`;
  }

  formatPercentage(rate: number | null | undefined): string {
    if (rate === null || rate === undefined || Number.isNaN(rate)) {
      return '-';
    }
    return `${rate.toFixed(2)}%`;
  }
}
