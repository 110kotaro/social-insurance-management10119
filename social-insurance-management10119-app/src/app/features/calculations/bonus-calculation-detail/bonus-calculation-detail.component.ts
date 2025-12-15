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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { CalculationService } from '../../../core/services/calculation.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { DepartmentService } from '../../../core/services/department.service';
import { AuthService } from '../../../core/auth/auth.service';
import { RetroactiveDeductionDialogComponent, RetroactiveDeductionMonth } from '../../../shared/components/retroactive-deduction-dialog/retroactive-deduction-dialog.component';
import { BonusCalculation, BonusRetroactiveDeduction } from '../../../core/models/bonus-calculation.model';
import { Employee } from '../../../core/models/employee.model';
import { Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-bonus-calculation-detail',
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
    MatTooltipModule,
    MatDialogModule,
    MatExpansionModule
  ],
  templateUrl: './bonus-calculation-detail.component.html',
  styleUrl: './bonus-calculation-detail.component.css'
})
export class BonusCalculationDetailComponent implements OnInit {
  private calculationService = inject(CalculationService);
  private employeeService = inject(EmployeeService);
  private departmentService = inject(DepartmentService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  calculation: BonusCalculation | null = null;
  employee: Employee | null = null;
  departmentName: string | null = null;
  isLoading = true;
  isNewCalculation = false;
  calculationYear: number | null = null;
  calculationMonth: number | null = null;

  ngOnInit(): void {
    const calculationId = this.route.snapshot.paramMap.get('id');
    const queryParams = this.route.snapshot.queryParams;
    
    if (calculationId && calculationId !== 'new') {
      this.loadCalculation(calculationId);
    } else if (queryParams['employeeId'] && queryParams['year'] && queryParams['month']) {
      this.loadEmployeeForCalculation(queryParams['employeeId'], parseInt(queryParams['year']), parseInt(queryParams['month']));
    } else {
      this.router.navigate(['/calculations']);
    }
  }

  async loadCalculation(calculationId: string): Promise<void> {
    try {
      this.isLoading = true;
      this.isNewCalculation = false;
      this.calculation = await this.calculationService.getBonusCalculation(calculationId);
      
      if (!this.calculation) {
        this.snackBar.open('計算結果が見つかりませんでした', '閉じる', { duration: 3000 });
        this.router.navigate(['/calculations']);
        return;
      }

      if (this.calculation.employeeId) {
        this.employee = await this.employeeService.getEmployee(this.calculation.employeeId);
        
        if (this.calculation.departmentName) {
          this.departmentName = this.calculation.departmentName;
        } else if (this.employee?.departmentId) {
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
      console.error('計算結果の取得に失敗しました:', error);
      this.snackBar.open('計算結果の取得に失敗しました', '閉じる', { duration: 3000 });
      this.isLoading = false;
    }
  }

  async loadEmployeeForCalculation(employeeId: string, year: number, month: number): Promise<void> {
    try {
      this.isLoading = true;
      this.isNewCalculation = true;
      this.calculation = null;
      this.calculationYear = year;
      this.calculationMonth = month;
      
      this.employee = await this.employeeService.getEmployee(employeeId);
      
      if (!this.employee) {
        this.snackBar.open('社員情報が見つかりませんでした', '閉じる', { duration: 3000 });
        this.router.navigate(['/calculations']);
        return;
      }

      if (this.employee.departmentId) {
        try {
          const departments = await this.departmentService.getDepartmentsByOrganization(this.employee.organizationId);
          const department = departments.find(d => d.id === this.employee!.departmentId);
          this.departmentName = department?.name || null;
        } catch (error) {
          console.error('部署情報の取得に失敗しました:', error);
          this.departmentName = null;
        }
      }

      this.isLoading = false;
    } catch (error) {
      console.error('社員情報の取得に失敗しました:', error);
      this.snackBar.open('社員情報の取得に失敗しました', '閉じる', { duration: 3000 });
      this.isLoading = false;
    }
  }

  formatDate(date: Date | any): string {
    if (!date) {
      return '';
    }
    const d = date instanceof Date ? date : date.toDate ? date.toDate() : new Date(date);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  formatCurrency(amount: number | null | undefined): string {
    if (amount === null || amount === undefined) {
      return '-';
    }
    return `¥${amount.toLocaleString()}`;
  }

  /**
   * 修正18: 遡及控除額を含めた合計保険料を計算
   */
  getTotalPremiumWithRetroactiveDeduction(): number {
    if (!this.calculation) {
      return 0;
    }
    let total = this.calculation.totalPremium || 0;
    
    // この計算結果に適用されている遡及控除額を加算
    if (this.calculation.retroactiveDeductions && this.calculation.retroactiveDeductions.length > 0) {
      const applicableDeductions = this.calculation.retroactiveDeductions.filter(
        d => d.year === this.calculation!.year && d.month === this.calculation!.month
      );
      applicableDeductions.forEach(deduction => {
        total += (deduction.healthInsurancePremiumDiff || 0) + (deduction.pensionInsurancePremiumDiff || 0);
      });
    }
    
    return total;
  }

  /**
   * 修正18: 遡及控除額を含めた会社負担額を計算
   */
  getCompanyShareWithRetroactiveDeduction(): number {
    if (!this.calculation) {
      return 0;
    }
    let total = this.calculation.companyShare || 0;
    
    // この計算結果に適用されている遡及控除額を加算
    if (this.calculation.retroactiveDeductions && this.calculation.retroactiveDeductions.length > 0) {
      const applicableDeductions = this.calculation.retroactiveDeductions.filter(
        d => d.year === this.calculation!.year && d.month === this.calculation!.month
      );
      applicableDeductions.forEach(deduction => {
        total += (deduction.companyShareDiff || 0);
      });
    }
    
    return total;
  }

  /**
   * 修正18: 遡及控除額を含めた従業員負担額を計算
   */
  getEmployeeShareWithRetroactiveDeduction(): number {
    if (!this.calculation) {
      return 0;
    }
    let total = this.calculation.employeeShare || 0;
    
    // この計算結果に適用されている遡及控除額を加算
    if (this.calculation.retroactiveDeductions && this.calculation.retroactiveDeductions.length > 0) {
      const applicableDeductions = this.calculation.retroactiveDeductions.filter(
        d => d.year === this.calculation!.year && d.month === this.calculation!.month
      );
      applicableDeductions.forEach(deduction => {
        total += (deduction.employeeShareDiff || 0);
      });
    }
    
    return total;
  }

  /**
   * 修正18: この計算結果に遡及控除が適用されているかチェック
   */
  hasRetroactiveDeduction(): boolean {
    if (!this.calculation || !this.calculation.retroactiveDeductions || this.calculation.retroactiveDeductions.length === 0) {
      return false;
    }
    return this.calculation.retroactiveDeductions.some(
      d => d.year === this.calculation!.year && d.month === this.calculation!.month
    );
  }

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      draft: '下書き',
      confirmed: '確定',
      exported: '出力済み'
    };
    return labels[status] || status;
  }

  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      draft: 'accent',
      confirmed: 'primary',
      exported: 'warn'
    };
    return colors[status] || '';
  }

  goBack(): void {
    this.router.navigate(['/calculations']);
  }

  async deleteCalculation(): Promise<void> {
    if (!this.calculation?.id) {
      return;
    }

    if (this.calculation.status !== 'draft') {
      this.snackBar.open('下書きの計算結果のみ削除できます', '閉じる', { duration: 3000 });
      return;
    }

    const confirmed = confirm('この計算結果を削除しますか？');
    if (!confirmed) {
      return;
    }

    try {
      await this.calculationService.deleteBonusCalculation(this.calculation.id);
      this.snackBar.open('計算結果を削除しました', '閉じる', { duration: 3000 });
      this.router.navigate(['/calculations']);
    } catch (error: any) {
      console.error('削除処理に失敗しました:', error);
      this.snackBar.open(error.message || '削除処理に失敗しました', '閉じる', { duration: 3000 });
    }
  }

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
      const calculationId = this.calculation.id;
      await this.calculationService.confirmBonusCalculation(calculationId, currentUser.uid);
      this.snackBar.open('計算結果を確定しました', '閉じる', { duration: 3000 });
      await this.loadCalculation(calculationId);
    } catch (error) {
      console.error('確定処理に失敗しました:', error);
      this.snackBar.open('確定処理に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  async recalculateCalculation(): Promise<void> {
    if (!this.calculation?.id || !this.employee) {
      return;
    }

    if (this.calculation.status !== 'confirmed' && this.calculation.status !== 'exported') {
      this.snackBar.open('確定済みまたは出力済みの計算結果のみ再計算できます', '閉じる', { duration: 3000 });
      return;
    }

    const reason = prompt('再計算理由を入力してください（任意）:');
    if (reason === null) {
      return;
    }

    const calculation = this.calculation;
    const employee = this.employee;
    const calculationId = calculation.id!;
    const year = calculation.year;
    const month = calculation.month;
    
    const currentUser = this.authService.getCurrentUser();

    if (!currentUser?.uid) {
      this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    try {
      this.snackBar.open('再計算を実行中です...', '閉じる', { duration: 2000 });
      
      const newCalculation = await this.calculationService.calculateEmployeeBonusPremium(
        employee,
        year,
        month,
        currentUser.uid
      );

      await this.calculationService.recalculateBonusCalculation(
        calculationId,
        newCalculation,
        currentUser.uid,
        reason || undefined
      );

      const updatedCalculation = await this.calculationService.getBonusCalculation(calculationId);
      
      if (updatedCalculation?.premiumDifference) {
        const diff = updatedCalculation.premiumDifference;
        const hasDifference = diff.healthInsurancePremiumDiff !== 0 || 
                             diff.pensionInsurancePremiumDiff !== 0 || 
                             diff.companyShareDiff !== 0 || 
                             diff.employeeShareDiff !== 0;
        
        if (hasDifference) {
          const deductionDialogRef = this.dialog.open(RetroactiveDeductionDialogComponent, {
            width: '500px',
            data: {
              premiumDifference: {
                healthInsurancePremiumDiff: diff.healthInsurancePremiumDiff,
                pensionInsurancePremiumDiff: diff.pensionInsurancePremiumDiff,
                companyShareDiff: diff.companyShareDiff,
                employeeShareDiff: diff.employeeShareDiff
              },
              currentYear: year,
              currentMonth: month
            }
          });

          deductionDialogRef.afterClosed().subscribe(async (selectedMonths: RetroactiveDeductionMonth[] | undefined) => {
            if (selectedMonths && selectedMonths.length > 0) {
              const retroactiveDeductions: BonusRetroactiveDeduction[] = selectedMonths.map(month => ({
                year: month.year,
                month: month.month,
                healthInsurancePremiumDiff: diff.healthInsurancePremiumDiff,
                pensionInsurancePremiumDiff: diff.pensionInsurancePremiumDiff,
                companyShareDiff: diff.companyShareDiff,
                employeeShareDiff: diff.employeeShareDiff,
                appliedAt: new Date(),
                appliedBy: currentUser.uid
              }));

              await this.calculationService.updateBonusCalculation(calculationId, {
                retroactiveDeductions: retroactiveDeductions
              });

              this.snackBar.open('再計算と遡及控除の適用が完了しました', '閉じる', { duration: 3000 });
            } else {
              this.snackBar.open('再計算が完了しました', '閉じる', { duration: 3000 });
            }
            await this.loadCalculation(calculationId);
          });
        } else {
          this.snackBar.open('再計算が完了しました', '閉じる', { duration: 3000 });
          await this.loadCalculation(calculationId);
        }
      } else {
        this.snackBar.open('再計算が完了しました', '閉じる', { duration: 3000 });
        await this.loadCalculation(calculationId);
      }
    } catch (error: any) {
      console.error('再計算の実行に失敗しました:', error);
      this.snackBar.open(error.message || '再計算の実行に失敗しました', '閉じる', { duration: 5000 });
    }
  }

  getSortedRecalculationHistory(): any[] {
    if (!this.calculation?.recalculationHistory) {
      return [];
    }
    return [...this.calculation.recalculationHistory].sort((a, b) => {
      const dateA = a.recalculatedAt instanceof Date ? a.recalculatedAt.getTime() : (a.recalculatedAt?.toDate ? a.recalculatedAt.toDate().getTime() : 0);
      const dateB = b.recalculatedAt instanceof Date ? b.recalculatedAt.getTime() : (b.recalculatedAt?.toDate ? b.recalculatedAt.toDate().getTime() : 0);
      return dateA - dateB;
    });
  }

  isAdmin(): boolean {
    const currentUser = this.authService.getCurrentUser();
    return currentUser?.role === 'owner' || currentUser?.role === 'admin';
  }

  async executeCalculation(): Promise<void> {
    if (!this.employee || !this.calculationYear || !this.calculationMonth) {
      return;
    }

    if (!this.employee.insuranceInfo?.standardReward) {
      this.snackBar.open('標準報酬月額が設定されていません。保険情報を編集してください。', '閉じる', { duration: 5000 });
      return;
    }

    const existingCalculation = await this.calculationService.getBonusCalculationsByEmployee(
      this.employee.id || '',
      this.calculationYear,
      this.calculationMonth
    );

    if (existingCalculation && (existingCalculation.status === 'confirmed' || existingCalculation.status === 'exported')) {
      this.snackBar.open(
        '既に確定済み（または出力済み）の計算結果があります。再計算する場合は、計算詳細画面から再計算してください。',
        '閉じる',
        { duration: 5000 }
      );
      if (existingCalculation.id) {
        this.router.navigate(['/bonus-calculations', existingCalculation.id]);
      }
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.uid) {
      this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    try {
      this.snackBar.open('計算を実行中です...', '閉じる', { duration: 2000 });
      
      const calculation = await this.calculationService.calculateEmployeeBonusPremium(
        this.employee,
        this.calculationYear,
        this.calculationMonth,
        currentUser.uid
      );

      const calculationId = await this.calculationService.saveBonusCalculation(calculation);

      this.snackBar.open('計算が完了しました', '閉じる', { duration: 3000 });
      
      await this.loadCalculation(calculationId);
    } catch (error: any) {
      console.error('計算の実行に失敗しました:', error);
      this.snackBar.open(error.message || '計算の実行に失敗しました', '閉じる', { duration: 5000 });
    }
  }
}

