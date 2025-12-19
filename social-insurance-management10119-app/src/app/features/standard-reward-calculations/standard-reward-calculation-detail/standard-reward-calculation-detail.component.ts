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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { StandardRewardCalculationService } from '../../../core/services/standard-reward-calculation.service';
import { StatusChangeDialogComponent, StatusChangeDialogData } from './status-change-dialog.component';
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
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule
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
  private dialog = inject(MatDialog);

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
      'confirmed': '確定済み',
      'applied': '申請済み',
      'approved': '承認済み'
    };
    return labels[status] || status;
  }

  getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      'draft': 'primary',
      'confirmed': 'primary',
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

  /**
   * 計算結果を確定する
   */
  async confirmCalculation(): Promise<void> {
    if (!this.calculation?.id) {
      return;
    }

    if (this.calculation.status !== 'draft') {
      this.snackBar.open('下書きの計算結果のみ確定できます', '閉じる', { duration: 3000 });
      return;
    }

    const confirmed = confirm('この計算結果を確定しますか？');
    if (!confirmed) {
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.uid) {
      this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    try {
      await this.calculationService.confirmCalculation(this.calculation.id, currentUser.uid);
      this.snackBar.open('計算結果を確定しました', '閉じる', { duration: 3000 });
      await this.loadCalculation(this.calculation.id);
    } catch (error: any) {
      console.error('確定処理に失敗しました:', error);
      this.snackBar.open(error.message || '確定処理に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 計算結果を削除する
   */
  async deleteCalculation(): Promise<void> {
    if (!this.calculation?.id) {
      return;
    }

    if (this.calculation.status !== 'draft') {
      this.snackBar.open('下書きの計算結果のみ削除できます', '閉じる', { duration: 3000 });
      return;
    }

    const confirmed = confirm('この計算結果を削除しますか？この操作は取り消せません。');
    if (!confirmed) {
      return;
    }

    try {
      await this.calculationService.deleteCalculation(this.calculation.id);
      this.snackBar.open('計算結果を削除しました', '閉じる', { duration: 3000 });
      this.router.navigate(['/standard-reward-calculations']);
    } catch (error: any) {
      console.error('削除処理に失敗しました:', error);
      this.snackBar.open(error.message || '削除処理に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * ステータスを変更する
   */
  async changeStatus(): Promise<void> {
    if (!this.calculation?.id || !this.calculation.employeeName) {
      return;
    }

    if (this.calculation.status === 'draft') {
      this.snackBar.open('下書きの計算結果はステータス変更できません。まず確定してください。', '閉じる', { duration: 3000 });
      return;
    }

    const dialogRef = this.dialog.open(StatusChangeDialogComponent, {
      width: '500px',
      data: {
        currentStatus: this.calculation.status as 'confirmed' | 'applied' | 'approved',
        employeeName: this.calculation.employeeName
      } as StatusChangeDialogData
    });

    dialogRef.afterClosed().subscribe(async (result: 'applied' | 'approved' | null) => {
      if (result && result !== this.calculation?.status) {
        const currentUser = this.authService.getCurrentUser();
        if (!currentUser?.uid) {
          this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
          return;
        }

        try {
          await this.calculationService.changeStatus(this.calculation!.id!, result, currentUser.uid);
          this.snackBar.open('ステータスを変更しました', '閉じる', { duration: 3000 });
          await this.loadCalculation(this.calculation!.id!);
        } catch (error: any) {
          console.error('ステータス変更に失敗しました:', error);
          this.snackBar.open(error.message || 'ステータス変更に失敗しました', '閉じる', { duration: 3000 });
        }
      }
    });
  }

  async recalculateHistorical(): Promise<void> {
    if (!this.calculation?.id || !this.authService.getCurrentUser()?.uid) return;
    
    if (this.calculation.status !== 'confirmed' && this.calculation.status !== 'applied' && this.calculation.status !== 'approved') {
      this.snackBar.open('確定済み、申請済み、または承認済みの計算結果のみ再現計算できます', '閉じる', { duration: 3000 });
      return;
    }
    
    const reason = prompt('再現計算理由を入力してください（任意）:');
    if (reason === null) {
      return; // キャンセルされた場合
    }

    try {
      await this.calculationService.recalculateCalculationHistorical(
        this.calculation.id,
        this.authService.getCurrentUser()!.uid,
        reason || undefined
      );
      this.snackBar.open('再現計算を実行しました', '閉じる', { duration: 2000 });
      await this.loadCalculation(this.calculation.id);
    } catch (error: any) {
      console.error('再現計算の実行に失敗しました:', error);
      this.snackBar.open(error.message || '再現計算の実行に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  async recalculate(): Promise<void> {
    if (!this.calculation?.id || !this.authService.getCurrentUser()?.uid) return;
    
    if (this.calculation.status !== 'confirmed' && this.calculation.status !== 'applied' && this.calculation.status !== 'approved') {
      this.snackBar.open('確定済み、申請済み、または承認済みの計算結果のみ再計算できます', '閉じる', { duration: 3000 });
      return;
    }
    
    const reason = prompt('再計算理由を入力してください（任意）:');
    if (reason === null) {
      return; // キャンセルされた場合
    }

    try {
      await this.calculationService.recalculateCalculation(
        this.calculation.id,
        this.authService.getCurrentUser()!.uid,
        reason || undefined
      );
      this.snackBar.open('再計算を実行しました', '閉じる', { duration: 2000 });
      
      // Firestoreの更新が反映されるまで少し待機してから再読み込み
      await new Promise(resolve => setTimeout(resolve, 500));
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

  /**
   * 再計算タイプのラベルを取得
   */
  getRecalculationTypeLabel(recalculationType?: 'historical' | 'current'): string {
    if (recalculationType === 'historical') {
      return '再現計算（当時条件）';
    } else if (recalculationType === 'current') {
      return '再計算（現在条件）';
    }
    return '再計算'; // 既存データ用のフォールバック
  }
}

