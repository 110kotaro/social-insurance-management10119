import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { StandardRewardCalculationService } from '../../../core/services/standard-reward-calculation.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { DepartmentService } from '../../../core/services/department.service';
import { AuthService } from '../../../core/auth/auth.service';
import { StandardRewardCalculation } from '../../../core/models/standard-reward-calculation.model';
import { Employee } from '../../../core/models/employee.model';

@Component({
  selector: 'app-standard-reward-calculation-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatChipsModule,
    MatSnackBarModule,
    MatDividerModule,
    MatExpansionModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './standard-reward-calculation-detail.component.html',
  styleUrl: './standard-reward-calculation-detail.component.css'
})
export class StandardRewardCalculationDetailComponent implements OnInit {
  private calculationService = inject(StandardRewardCalculationService);
  private employeeService = inject(EmployeeService);
  private departmentService = inject(DepartmentService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  calculation: StandardRewardCalculation | null = null;
  employee: Employee | null = null;
  departmentName: string | null = null;
  isLoading = true;

  ngOnInit(): void {
    const calculationId = this.route.snapshot.paramMap.get('id');
    if (calculationId) {
      this.loadCalculation(calculationId);
    } else {
      this.router.navigate(['/standard-reward-calculations']);
    }
  }

  async loadCalculation(calculationId: string): Promise<void> {
    try {
      this.isLoading = true;
      this.calculation = await this.calculationService.getCalculation(calculationId);
      
      if (!this.calculation) {
        this.snackBar.open('計算履歴が見つかりませんでした', '閉じる', { duration: 3000 });
        this.router.navigate(['/standard-reward-calculations']);
        return;
      }

      // 社員情報を取得
      if (this.calculation.employeeId) {
        this.employee = await this.employeeService.getEmployee(this.calculation.employeeId);
        
        // 部署名を取得
        if (this.employee?.departmentId) {
          try {
            const departments = await this.departmentService.getDepartmentsByOrganization(this.employee.organizationId);
            const department = departments.find(d => d.id === this.employee!.departmentId);
            this.departmentName = department?.name || null;
          } catch (error) {
            console.error('部署情報の取得に失敗しました:', error);
            this.departmentName = null;
          }
        }
      }

      this.isLoading = false;
    } catch (error) {
      console.error('計算履歴の取得に失敗しました:', error);
      this.snackBar.open('計算履歴の取得に失敗しました', '閉じる', { duration: 3000 });
      this.isLoading = false;
    }
  }

  formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined) return '-';
    return `¥${value.toLocaleString('ja-JP')}`;
  }

  formatDate(value: Date | any): string {
    if (!value) return '-';
    const date = value instanceof Date ? value : (value.toDate ? value.toDate() : new Date(value.seconds * 1000));
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'draft': '下書き',
      'applied': '申請済み',
      'approved': '承認済み'
    };
    return labels[status] || status;
  }

  getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      'draft': 'primary',
      'applied': 'accent',
      'approved': 'primary'
    };
    return colors[status] || 'primary';
  }

  navigateBack(): void {
    this.router.navigate(['/standard-reward-calculations']);
  }

  createApplication(): void {
    if (!this.calculation?.id) return;
    
    this.router.navigate(['/applications/create'], {
      queryParams: {
        fromCalculation: this.calculation.id
      }
    });
  }

  async recalculate(): Promise<void> {
    if (!this.calculation?.id || !this.authService.getCurrentUser()?.uid) return;
    
    if (!confirm('計算を再実行しますか？再計算前のデータは履歴に保存されます。')) {
      return;
    }

    try {
      await this.calculationService.recalculateCalculation(
        this.calculation.id,
        this.authService.getCurrentUser()!.uid,
        '再計算'
      );
      this.snackBar.open('再計算を実行しました', '閉じる', { duration: 2000 });
      await this.loadCalculation(this.calculation.id);
    } catch (error: any) {
      console.error('再計算の実行に失敗しました:', error);
      this.snackBar.open(error.message || '再計算の実行に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 再計算履歴を古い順でソート
   */
  getSortedRecalculationHistory(): any[] {
    if (!this.calculation?.recalculationHistory) {
      return [];
    }
    return [...this.calculation.recalculationHistory].sort((a, b) => {
      const dateA = a.recalculatedAt instanceof Date ? a.recalculatedAt.getTime() : (a.recalculatedAt?.toDate ? a.recalculatedAt.toDate().getTime() : 0);
      const dateB = b.recalculatedAt instanceof Date ? b.recalculatedAt.getTime() : (b.recalculatedAt?.toDate ? b.recalculatedAt.toDate().getTime() : 0);
      return dateA - dateB; // 昇順（古い順）
    });
  }
}

