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
import { InsuranceRateTableImportDialogComponent } from './insurance-rate-table-import-dialog/insurance-rate-table-import-dialog.component';

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
  effectiveYears: number[] = [];
  
  displayedColumns: string[] = ['grade', 'pensionGrade', 'standardRewardAmount', 'minAmount', 'maxAmount', 
                                'healthInsuranceWithoutCare', 'healthInsuranceWithCare', 'pensionInsurance', 
                                'effectiveFrom', 'effectiveTo', 'actions'];

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
      // 組織固有のテーブルと全組織共通のテーブルを取得
      const orgRateTables = await this.insuranceRateTableService.getRateTablesByOrganization(this.organizationId);
      const commonRateTables = await this.insuranceRateTableService.getCommonRateTables();
      
      // 組織固有のテーブルを優先（重複する場合は組織固有のものを使用）
      const orgGradeMap = new Map<number, InsuranceRateTable>();
      orgRateTables.forEach(table => {
        orgGradeMap.set(table.grade, table);
      });
      
      commonRateTables.forEach(table => {
        if (!orgGradeMap.has(table.grade)) {
          orgGradeMap.set(table.grade, table);
        }
      });

      this.rateTables = Array.from(orgGradeMap.values()).sort((a, b) => a.grade - b.grade);
      
      // 適用開始年のリストを生成
      const years = new Set<number>();
      this.rateTables.forEach(table => {
        if (table.effectiveFrom) {
          years.add(table.effectiveFrom.getFullYear());
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
    if (this.selectedEffectiveYear === null) {
      this.filteredRateTables = this.rateTables;
    } else {
      this.filteredRateTables = this.rateTables.filter(table => {
        if (!table.effectiveFrom) {
          return false;
        }
        const effectiveYear = table.effectiveFrom.getFullYear();
        return effectiveYear === this.selectedEffectiveYear;
      });
    }
    this.dataSource.data = this.filteredRateTables;
  }

  onYearFilterChange(year: number | null): void {
    this.selectedEffectiveYear = year;
    this.applyFilter();
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

  openImportDialog(): void {
    const dialogRef = this.dialog.open(InsuranceRateTableImportDialogComponent, {
      width: '600px',
      data: {
        organizationId: this.organizationId
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

    if (!confirm(`等級${rateTable.grade}の保険料率テーブルを削除しますか？`)) {
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

  formatCurrency(amount: number): string {
    return `¥${amount.toLocaleString()}`;
  }

  formatPercentage(rate: number): string {
    return `${rate.toFixed(2)}%`;
  }
}

