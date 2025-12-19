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
import { MonthlyCalculation, RetroactiveDeduction } from '../../../core/models/monthly-calculation.model';
import { Employee } from '../../../core/models/employee.model';
import { Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-calculation-detail',
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
  templateUrl: './calculation-detail.component.html',
  styleUrl: './calculation-detail.component.css'
})
export class CalculationDetailComponent implements OnInit {
  private calculationService = inject(CalculationService);
  private employeeService = inject(EmployeeService);
  private departmentService = inject(DepartmentService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  calculation: MonthlyCalculation | null = null;
  employee: Employee | null = null;
  departmentName: string | null = null; // 部署名
  isLoading = true;
  isNewCalculation = false; // 新規計算かどうか
  calculationYear: number | null = null;
  calculationMonth: number | null = null;

  ngOnInit(): void {
    const calculationId = this.route.snapshot.paramMap.get('id');
    const queryParams = this.route.snapshot.queryParams;
    
    if (calculationId && calculationId !== 'new') {
      // 既存の計算結果を読み込む
      this.loadCalculation(calculationId);
    } else if (queryParams['employeeId'] && queryParams['year'] && queryParams['month']) {
      // 計算結果がない場合（新規計算）
      this.loadEmployeeForCalculation(queryParams['employeeId'], parseInt(queryParams['year']), parseInt(queryParams['month']));
    } else {
      this.router.navigate(['/calculations']);
    }
  }

  async loadCalculation(calculationId: string): Promise<void> {
    try {
      this.isLoading = true;
      this.isNewCalculation = false;
      this.calculation = await this.calculationService.getCalculation(calculationId);
      
      if (!this.calculation) {
        this.snackBar.open('計算結果が見つかりませんでした', '閉じる', { duration: 3000 });
        this.router.navigate(['/calculations']);
        return;
      }

      // 社員情報を取得
      if (this.calculation.employeeId) {
        this.employee = await this.employeeService.getEmployee(this.calculation.employeeId);
        
        // 部署名を取得（計算結果に含まれている場合はそれを使用、なければ社員情報から取得）
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

  /**
   * 計算結果がない場合の社員情報を読み込む（新規計算用）
   */
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

      // 部署名を取得
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
    
    // 被扶養者がいる場合は、被保険者分と被扶養者分の合計を計算
    let total = 0;
    if (this.calculation.dependentInfo && this.calculation.dependentInfo.length > 0) {
      // 被保険者健康保険料 + 被扶養者健康保険料 + 被保険者厚生年金料 + 被扶養者厚生年金料
      total = (this.calculation.healthInsurancePremium || 0) +
              (this.calculation.dependentHealthInsurancePremium || 0) +
              (this.calculation.pensionInsurancePremium || 0) +
              (this.calculation.dependentPensionInsurancePremium || 0);
    } else {
      // 被扶養者がいない場合は従来通り
      total = this.calculation.totalPremium || 0;
    }
    
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

  /**
   * 計算結果を削除（draftのみ）
   */
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
      await this.calculationService.deleteCalculation(this.calculation.id);
      this.snackBar.open('計算結果を削除しました', '閉じる', { duration: 3000 });
      this.router.navigate(['/calculations']);
    } catch (error: any) {
      console.error('削除処理に失敗しました:', error);
      this.snackBar.open(error.message || '削除処理に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 計算結果を確定する
   */
  async confirmCalculation(): Promise<void> {
    console.log('[confirmCalculation] メソッドが呼ばれました');
    console.log('[confirmCalculation] calculation:', this.calculation);
    
    if (!this.calculation?.id) {
      console.log('[confirmCalculation] calculation.idが存在しません');
      return;
    }

    console.log('[confirmCalculation] calculation.id:', this.calculation.id);
    console.log('[confirmCalculation] calculation.status:', this.calculation.status);

    if (this.calculation.status !== 'draft') {
      console.log('[confirmCalculation] ステータスがdraftではありません:', this.calculation.status);
      this.snackBar.open('下書きの計算結果のみ確定できます', '閉じる', { duration: 3000 });
      return;
    }

    console.log('[confirmCalculation] confirmダイアログを表示します');
    const confirmed = confirm('この計算結果を確定しますか？');
    console.log('[confirmCalculation] confirm結果:', confirmed);
    
    if (!confirmed) {
      console.log('[confirmCalculation] ユーザーがキャンセルしました');
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    console.log('[confirmCalculation] currentUser:', currentUser);
    
    if (!currentUser?.uid) {
      console.log('[confirmCalculation] currentUser.uidが存在しません');
      this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    console.log('[confirmCalculation] 確定処理を開始します');
    try {
      const calculationId = this.calculation.id;
      console.log('[confirmCalculation] calculationService.confirmCalculationを呼び出します:', calculationId, currentUser.uid);
      await this.calculationService.confirmCalculation(calculationId, currentUser.uid);
      console.log('[confirmCalculation] 確定処理が完了しました');
      this.snackBar.open('計算結果を確定しました', '閉じる', { duration: 3000 });
      await this.loadCalculation(calculationId);
    } catch (error) {
      console.error('[confirmCalculation] 確定処理に失敗しました:', error);
      this.snackBar.open('確定処理に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 再現計算（当時条件）：過去の計算結果に保存されている情報を使用して再計算
   */
  async recalculateCalculationHistorical(): Promise<void> {
    if (!this.calculation?.id || !this.employee) {
      return;
    }

    if (this.calculation.status !== 'confirmed' && this.calculation.status !== 'exported') {
      this.snackBar.open('確定済みまたは出力済みの計算結果のみ再計算できます', '閉じる', { duration: 3000 });
      return;
    }

    const reason = prompt('再現計算理由を入力してください（任意）:');
    if (reason === null) {
      return; // キャンセルされた場合
    }

    const calculationId = this.calculation.id!;
    const currentUser = this.authService.getCurrentUser();

    if (!currentUser?.uid) {
      this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    try {
      this.snackBar.open('再現計算を実行中です...', '閉じる', { duration: 2000 });
      
      // 再現計算（当時条件）を実行
      await this.calculationService.recalculateConfirmedCalculationHistorical(
        calculationId,
        currentUser.uid,
        reason || undefined
      );

      this.snackBar.open('再現計算が完了しました', '閉じる', { duration: 3000 });
      await this.loadCalculation(calculationId);
    } catch (error: any) {
      console.error('再現計算の実行に失敗しました:', error);
      this.snackBar.open(error.message || '再現計算の実行に失敗しました', '閉じる', { duration: 5000 });
    }
  }

  /**
   * 再計算（現在条件）：現在のDBデータを使用して再計算
   */
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
      return; // キャンセルされた場合
    }

    // 計算結果と社員情報を変数に保存
    const calculation = this.calculation;
    const employee = this.employee;
    const calculationId = calculation.id!;
    
    // 詳細画面の年月を自動使用
    const year = calculation.year;
    const month = calculation.month;
    
    const currentUser = this.authService.getCurrentUser();

    if (!currentUser?.uid) {
      this.snackBar.open('ユーザー情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    try {
      this.snackBar.open('再計算を実行中です...', '閉じる', { duration: 2000 });
      
      // 再計算（現在条件）を実行
      const newCalculation = await this.calculationService.calculateEmployeePremium(
        employee,
        year,
        month,
        currentUser.uid
      );

      // 確定済みの計算結果を再計算（履歴に保存）
      await this.calculationService.recalculateConfirmedCalculation(
        calculationId,
        newCalculation,
        currentUser.uid,
        reason || undefined
      );

      // 遡及控除機能は削除（コメントアウト）
      // const updatedCalculation = await this.calculationService.getCalculation(calculationId);
      // if (updatedCalculation?.premiumDifference) {
      //   const diff = updatedCalculation.premiumDifference;
      //   const hasDifference = diff.healthInsurancePremiumDiff !== 0 || 
      //                        diff.pensionInsurancePremiumDiff !== 0 || 
      //                        diff.companyShareDiff !== 0 || 
      //                        diff.employeeShareDiff !== 0;
      //   if (hasDifference) {
      //     const deductionDialogRef = this.dialog.open(RetroactiveDeductionDialogComponent, {
      //       width: '500px',
      //       data: {
      //         premiumDifference: diff,
      //         currentYear: year,
      //         currentMonth: month
      //       }
      //     });
      //     deductionDialogRef.afterClosed().subscribe(async (selectedMonths: RetroactiveDeductionMonth[] | undefined) => {
      //       if (selectedMonths && selectedMonths.length > 0) {
      //         const retroactiveDeductions: RetroactiveDeduction[] = selectedMonths.map(month => ({
      //           year: month.year,
      //           month: month.month,
      //           healthInsurancePremiumDiff: diff.healthInsurancePremiumDiff,
      //           pensionInsurancePremiumDiff: diff.pensionInsurancePremiumDiff,
      //           companyShareDiff: diff.companyShareDiff,
      //           employeeShareDiff: diff.employeeShareDiff,
      //           appliedAt: new Date(),
      //           appliedBy: currentUser.uid
      //         }));
      //         await this.calculationService.updateCalculation(calculationId, {
      //           retroactiveDeductions: retroactiveDeductions
      //         });
      //         this.snackBar.open('再計算と遡及控除の適用が完了しました', '閉じる', { duration: 3000 });
      //       } else {
      //         this.snackBar.open('再計算が完了しました', '閉じる', { duration: 3000 });
      //       }
      //       await this.loadCalculation(calculationId);
      //     });
      //   } else {
      //     this.snackBar.open('再計算が完了しました', '閉じる', { duration: 3000 });
      //     await this.loadCalculation(calculationId);
      //   }
      // } else {
      //   this.snackBar.open('再計算が完了しました', '閉じる', { duration: 3000 });
      //   await this.loadCalculation(calculationId);
      // }

      this.snackBar.open('再計算が完了しました', '閉じる', { duration: 3000 });
      await this.loadCalculation(calculationId);
    } catch (error: any) {
      console.error('再計算の実行に失敗しました:', error);
      this.snackBar.open(error.message || '再計算の実行に失敗しました', '閉じる', { duration: 5000 });
    }
  }

  /**
   * 再計算履歴を降順でソート（古い順）
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

  /**
   * 管理者かどうかをチェック
   */
  isAdmin(): boolean {
    const currentUser = this.authService.getCurrentUser();
    return currentUser?.role === 'owner' || currentUser?.role === 'admin';
  }

  /**
   * 計算を実行（新規計算用）
   */
  async executeCalculation(): Promise<void> {
    if (!this.employee || !this.calculationYear || !this.calculationMonth) {
      return;
    }

    // 標準報酬月額が設定されているか確認
    if (!this.employee.insuranceInfo?.standardReward) {
      this.snackBar.open('標準報酬月額が設定されていません。保険情報を編集してください。', '閉じる', { duration: 5000 });
      return;
    }

    // 既存の計算結果をチェック
    const existingCalculation = await this.calculationService.getCalculationsByEmployee(
      this.employee.id || '',
      this.calculationYear,
      this.calculationMonth
    );

    // confirmedまたはexportedの計算結果がある場合はエラー
    if (existingCalculation && (existingCalculation.status === 'confirmed' || existingCalculation.status === 'exported')) {
      this.snackBar.open(
        '既に確定済み（または出力済み）の計算結果があります。再計算する場合は、計算詳細画面から再計算してください。',
        '閉じる',
        { duration: 5000 }
      );
      // 既存の計算詳細画面に遷移
      if (existingCalculation.id) {
        this.router.navigate(['/calculations', existingCalculation.id]);
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
      
      // 個別計算を実行
      const calculation = await this.calculationService.calculateEmployeePremium(
        this.employee,
        this.calculationYear,
        this.calculationMonth,
        currentUser.uid
      );

      // 計算結果を保存
      const calculationId = await this.calculationService.saveCalculation(calculation);

      this.snackBar.open('計算が完了しました', '閉じる', { duration: 3000 });
      
      // URLを計算IDに更新してから再読み込み（リロード時に正しく表示されるように）
      this.router.navigate(['/calculations', calculationId], { replaceUrl: true }).then(() => {
        this.loadCalculation(calculationId);
      });
    } catch (error: any) {
      console.error('計算の実行に失敗しました:', error);
      // エラーメッセージを日本語に変換
      let errorMessage = '計算の実行に失敗しました';
      if (error.message) {
        // Firestoreのエラーメッセージを日本語に変換
        if (error.message.includes('Unsupported field value: undefined')) {
          errorMessage = '計算データに無効な値が含まれています。部署情報などの必須情報が設定されているか確認してください。';
        } else if (error.message.includes('Function setDoc() called with invalid data')) {
          errorMessage = '計算データの保存に失敗しました。データに無効な値が含まれています。';
        } else if (error.message.includes('給与データが確定されていません')) {
          errorMessage = error.message; // 既に日本語
        } else if (error.message.includes('他社給与データが確定されていません')) {
          errorMessage = error.message; // 既に日本語
        } else if (error.message.includes('標準報酬月額が設定されていません')) {
          errorMessage = error.message; // 既に日本語
        } else if (error.message.includes('既に確定済み')) {
          errorMessage = error.message; // 既に日本語
        } else {
          // その他のエラーは元のメッセージを表示
          errorMessage = error.message;
        }
      }
      this.snackBar.open(errorMessage, '閉じる', { duration: 5000 });
    }
  }
}

