import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { EmployeeService } from '../../../core/services/employee.service';
import { OtherCompanySalaryDataService } from '../../../core/services/other-company-salary-data.service';
import { OtherCompanySalaryData, OtherCompanyInfo } from '../../../core/models/employee.model';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-other-company-salary-input',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatSnackBarModule,
    MatSelectModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatChipsModule
  ],
  templateUrl: './other-company-salary-input.component.html',
  styleUrl: './other-company-salary-input.component.css'
})
export class OtherCompanySalaryInputComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private employeeService = inject(EmployeeService);
  private otherCompanySalaryDataService = inject(OtherCompanySalaryDataService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  employeeId: string | null = null;
  employee: any = null;
  otherCompanyInfo: OtherCompanyInfo[] = [];
  salaryDataFormArray: FormArray = this.fb.array([]);
  otherCompanyForm: FormGroup = this.fb.group({
    companies: this.salaryDataFormArray
  });
  displayedColumns: string[] = ['year', 'month', 'companyName', 'monthlyReward', 'bonus', 'retroactivePayment', 'isConfirmed'];
  
  // 表示用の年月リスト（過去1年分）
  months: { year: number; month: number; label: string }[] = [];

  // テーブル表示用のデータソース
  get tableDataSource(): FormGroup[] {
    return this.salaryDataFormArray.controls as FormGroup[];
  }

  ngOnInit(): void {
    this.employeeId = this.route.snapshot.paramMap.get('id');
    if (!this.employeeId) {
      this.snackBar.open('社員IDが指定されていません', '閉じる', { duration: 3000 });
      this.router.navigate(['/employees']);
      return;
    }

    this.loadEmployee();
    this.initializeMonths();
  }

  private initializeMonths(): void {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    this.months = [];
    for (let i = 0; i < 12; i++) {
      const date = new Date(currentYear, currentMonth - 1 - i, 1);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      this.months.push({
        year,
        month,
        label: `${year}年${month}月`
      });
    }
  }

  private async loadEmployee(): Promise<void> {
    if (!this.employeeId) return;

    try {
      this.employee = await this.employeeService.getEmployee(this.employeeId);
      if (!this.employee) {
        this.snackBar.open('社員情報が見つかりません', '閉じる', { duration: 3000 });
        this.router.navigate(['/employees']);
        return;
      }

      this.otherCompanyInfo = this.employee.otherCompanyInfo || [];
      if (this.otherCompanyInfo.length === 0) {
        this.snackBar.open('他社勤務情報が登録されていません', '閉じる', { duration: 3000 });
        this.router.navigate(['/employees', this.employeeId]);
        return;
      }

      await this.loadSalaryData();
    } catch (error) {
      console.error('社員情報の読み込みに失敗しました:', error);
      this.snackBar.open('社員情報の読み込みに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  private async loadSalaryData(): Promise<void> {
    if (!this.employeeId) return;

    // 各月・各社の給与データを読み込む
    const salaryDataMap: Map<string, OtherCompanySalaryData> = new Map();

    for (const monthInfo of this.months) {
      for (const company of this.otherCompanyInfo) {
        const dataList = await this.otherCompanySalaryDataService.getOtherCompanySalaryDataByEmployee(
          this.employeeId!,
          monthInfo.year,
          monthInfo.month
        );
        
        const companyData = dataList.find(d => d.companyId === company.companyId);
        if (companyData) {
          const key = `${monthInfo.year}-${monthInfo.month}-${company.companyId}`;
          salaryDataMap.set(key, companyData);
        }
      }
    }

    // フォーム配列を初期化
    this.salaryDataFormArray = this.fb.array([]);

    for (const monthInfo of this.months) {
      for (const company of this.otherCompanyInfo) {
        const key = `${monthInfo.year}-${monthInfo.month}-${company.companyId}`;
        const existingData = salaryDataMap.get(key);

        const formGroup = this.fb.group({
          year: [monthInfo.year],
          month: [monthInfo.month],
          companyId: [company.companyId],
          companyName: [company.companyName],
          monthlyReward: [existingData?.monthlyReward || 0, [Validators.min(0)]],
          bonus: [existingData?.bonus || 0, [Validators.min(0)]],
          retroactivePayment: [existingData?.retroactivePayment || 0, [Validators.min(0)]],
          isConfirmed: [existingData?.isConfirmed || false],
          id: [existingData?.id]
        });

        this.salaryDataFormArray.push(formGroup);
      }
    }
  }

  getSalaryDataFormGroups(): FormGroup[] {
    return this.salaryDataFormArray.controls as FormGroup[];
  }

  getSalaryDataForMonth(monthInfo: { year: number; month: number }, company: OtherCompanyInfo): FormGroup | null {
    const formGroup = this.salaryDataFormArray.controls.find((control: any) => {
      const group = control as FormGroup;
      return group.get('year')?.value === monthInfo.year &&
             group.get('month')?.value === monthInfo.month &&
             group.get('companyId')?.value === company.companyId;
    }) as FormGroup | undefined;

    return formGroup || null;
  }

  async saveDraft(): Promise<void> {
    if (!this.employeeId) return;

    try {
      const user = await this.authService.getCurrentUser();
      if (!user || !user.uid) {
        this.snackBar.open('認証情報が取得できません', '閉じる', { duration: 3000 });
        return;
      }

      for (const control of this.salaryDataFormArray.controls) {
        const formGroup = control as FormGroup;
        const value = formGroup.value;

        if (value.id) {
          // 既存データを更新（確定済みのものは更新しない）
          if (!value.isConfirmed) {
            await this.otherCompanySalaryDataService.updateOtherCompanySalaryData(value.id, {
              monthlyReward: value.monthlyReward || 0,
              bonus: value.bonus || 0,
              retroactivePayment: value.retroactivePayment || 0,
              isConfirmed: false
            });
          }
        } else {
          // 新規データを作成
          if (value.monthlyReward > 0 || value.bonus > 0 || value.retroactivePayment > 0) {
            await this.otherCompanySalaryDataService.createOtherCompanySalaryData({
              employeeId: this.employeeId,
              companyId: value.companyId,
              companyName: value.companyName,
              year: value.year,
              month: value.month,
              monthlyReward: value.monthlyReward || 0,
              bonus: value.bonus || 0,
              retroactivePayment: value.retroactivePayment || 0,
              isConfirmed: false
            });
          }
        }
      }

      this.snackBar.open('下書きを保存しました', '閉じる', { duration: 3000 });
      await this.loadSalaryData(); // 再読み込み
    } catch (error) {
      console.error('下書きの保存に失敗しました:', error);
      this.snackBar.open('下書きの保存に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  async confirm(): Promise<void> {
    if (!this.employeeId) return;

    try {
      const user = await this.authService.getCurrentUser();
      if (!user || !user.uid) {
        this.snackBar.open('認証情報が取得できません', '閉じる', { duration: 3000 });
        return;
      }

      const now = new Date();

      for (const control of this.salaryDataFormArray.controls) {
        const formGroup = control as FormGroup;
        const value = formGroup.value;

        if (value.id) {
          // 既存データを確定
          await this.otherCompanySalaryDataService.updateOtherCompanySalaryData(value.id, {
            monthlyReward: value.monthlyReward || 0,
            bonus: value.bonus || 0,
            retroactivePayment: value.retroactivePayment || 0,
            isConfirmed: true,
            confirmedAt: now,
            confirmedBy: user.uid
          });
        } else {
          // 新規データを作成して確定
          if (value.monthlyReward > 0 || value.bonus > 0 || value.retroactivePayment > 0) {
            await this.otherCompanySalaryDataService.createOtherCompanySalaryData({
              employeeId: this.employeeId,
              companyId: value.companyId,
              companyName: value.companyName,
              year: value.year,
              month: value.month,
              monthlyReward: value.monthlyReward || 0,
              bonus: value.bonus || 0,
              retroactivePayment: value.retroactivePayment || 0,
              isConfirmed: true,
              confirmedAt: now,
              confirmedBy: user.uid
            });
          }
        }
      }

      this.snackBar.open('確定しました', '閉じる', { duration: 3000 });
      await this.loadSalaryData(); // 再読み込み
    } catch (error) {
      console.error('確定に失敗しました:', error);
      this.snackBar.open('確定に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  goBack(): void {
    if (this.employeeId) {
      this.router.navigate(['/employees', this.employeeId]);
    } else {
      this.router.navigate(['/employees']);
    }
  }

  formatCurrency(value: number): string {
    return value.toLocaleString('ja-JP', { style: 'currency', currency: 'JPY' });
  }
}

