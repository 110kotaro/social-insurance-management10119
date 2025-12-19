import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
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

interface OtherCompanySalaryInputRow {
  year: number;
  month: number;
  companyId: string;
  companyName: string;
  monthlyReward: number | null;
  bonus: number | null;
  retroactivePayment: number | null;
  isConfirmed: boolean;
  id?: string; // 既存データのID
}

@Component({
  selector: 'app-other-company-salary-input',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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
  private employeeService = inject(EmployeeService);
  private otherCompanySalaryDataService = inject(OtherCompanySalaryDataService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  employeeId: string | null = null;
  employee: any = null;
  otherCompanyInfo: OtherCompanyInfo[] = [];
  displayedColumns: string[] = ['year', 'month', 'companyName', 'monthlyReward', 'bonus', 'retroactivePayment', 'isConfirmed'];
  
  // 表示用の年月リスト（過去1年分）
  months: { year: number; month: number; label: string }[] = [];

  // テーブル
  dataSource = new MatTableDataSource<OtherCompanySalaryInputRow>([]);
  salaryRows: OtherCompanySalaryInputRow[] = [];

  ngOnInit(): void {
    this.employeeId = this.route.snapshot.paramMap.get('id');
    if (!this.employeeId) {
      this.snackBar.open('社員IDが指定されていません', '閉じる', { duration: 3000 });
      this.router.navigate(['/employees']);
      return;
    }

    this.initializeMonths();
    this.loadEmployee();
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
    if (!this.employeeId) {
      console.warn('[他社給与入力] loadSalaryData: employeeIdがありません');
      return;
    }

    console.log('[他社給与入力] loadSalaryData開始', {
      employeeId: this.employeeId,
      monthsCount: this.months.length,
      companiesCount: this.otherCompanyInfo.length
    });

    try {
      // 各月・各社の給与データを読み込む
      const salaryDataMap: Map<string, OtherCompanySalaryData> = new Map();

      for (const monthInfo of this.months) {
        for (const company of this.otherCompanyInfo) {
          const dataList = await this.otherCompanySalaryDataService.getOtherCompanySalaryDataByEmployee(
            this.employeeId!,
            monthInfo.year,
            monthInfo.month
          );
          
          console.log(`[他社給与入力] データ取得: ${monthInfo.year}年${monthInfo.month}月, 会社: ${company.companyName}`, {
            dataCount: dataList.length,
            data: dataList
          });
          
          const companyData = dataList.find(d => d.companyId === company.companyId);
          if (companyData) {
            const key = `${monthInfo.year}-${monthInfo.month}-${company.companyId}`;
            salaryDataMap.set(key, companyData);
            console.log(`[他社給与入力] 既存データ見つかりました: ${key}`, {
              id: companyData.id,
              monthlyReward: companyData.monthlyReward,
              bonus: companyData.bonus,
              retroactivePayment: companyData.retroactivePayment,
              isConfirmed: companyData.isConfirmed
            });
          }
        }
      }

      console.log('[他社給与入力] 既存データマップ', {
        mapSize: salaryDataMap.size,
        keys: Array.from(salaryDataMap.keys())
      });

      // データ行を構築
      const rows: OtherCompanySalaryInputRow[] = [];

      for (const monthInfo of this.months) {
        for (const company of this.otherCompanyInfo) {
          const key = `${monthInfo.year}-${monthInfo.month}-${company.companyId}`;
          const existingData = salaryDataMap.get(key);

          const row: OtherCompanySalaryInputRow = {
            year: monthInfo.year,
            month: monthInfo.month,
            companyId: company.companyId,
            companyName: company.companyName,
            monthlyReward: existingData?.monthlyReward || null,
            bonus: existingData?.bonus || null,
            retroactivePayment: existingData?.retroactivePayment || null,
            isConfirmed: existingData?.isConfirmed || false,
            id: existingData?.id
          };

          rows.push(row);
          
          if (existingData) {
            console.log(`[他社給与入力] 行追加: ${key}`, {
              monthlyReward: row.monthlyReward,
              bonus: row.bonus,
              retroactivePayment: row.retroactivePayment,
              isConfirmed: row.isConfirmed,
              id: row.id
            });
          }
        }
      }

      this.salaryRows = rows;
      this.dataSource.data = rows;

      console.log('[他社給与入力] loadSalaryData完了', {
        rowsCount: this.salaryRows.length,
        dataSourceLength: this.dataSource.data.length
      });
    } catch (error) {
      console.error('[他社給与入力] loadSalaryDataエラー:', error);
      throw error;
    }
  }


  async saveDraft(): Promise<void> {
    if (!this.employeeId) {
      console.warn('[他社給与入力] saveDraft: employeeIdがありません');
      return;
    }

    console.log('[他社給与入力] saveDraft開始', {
      rowsCount: this.salaryRows.length
    });

    try {
      const user = await this.authService.getCurrentUser();
      if (!user || !user.uid) {
        this.snackBar.open('認証情報が取得できません', '閉じる', { duration: 3000 });
        return;
      }

      let savedCount = 0;
      let skippedCount = 0;

      for (const row of this.salaryRows) {
        console.log('[他社給与入力] saveDraft処理中', {
          id: row.id,
          year: row.year,
          month: row.month,
          companyName: row.companyName,
          monthlyReward: row.monthlyReward,
          bonus: row.bonus,
          retroactivePayment: row.retroactivePayment,
          isConfirmed: row.isConfirmed
        });

        if (row.id) {
          // 既存データを更新（確定済みのものは更新しない）
          if (!row.isConfirmed) {
            await this.otherCompanySalaryDataService.updateOtherCompanySalaryData(row.id, {
              monthlyReward: row.monthlyReward || 0,
              bonus: row.bonus || 0,
              retroactivePayment: row.retroactivePayment || 0,
              isConfirmed: false
            });
            savedCount++;
            console.log('[他社給与入力] 既存データ更新完了', { id: row.id });
          } else {
            skippedCount++;
            console.log('[他社給与入力] 確定済みのためスキップ', { id: row.id });
          }
        } else {
          // 新規データを作成
          if ((row.monthlyReward && row.monthlyReward > 0) || (row.bonus && row.bonus > 0) || (row.retroactivePayment && row.retroactivePayment > 0)) {
            const newId = await this.otherCompanySalaryDataService.createOtherCompanySalaryData({
              employeeId: this.employeeId,
              companyId: row.companyId,
              companyName: row.companyName,
              year: row.year,
              month: row.month,
              monthlyReward: row.monthlyReward || 0,
              bonus: row.bonus || 0,
              retroactivePayment: row.retroactivePayment || 0,
              isConfirmed: false
            });
            savedCount++;
            console.log('[他社給与入力] 新規データ作成完了', { id: newId });
          } else {
            skippedCount++;
            console.log('[他社給与入力] 値が0のためスキップ', { year: row.year, month: row.month });
          }
        }
      }

      console.log('[他社給与入力] saveDraft完了', {
        savedCount,
        skippedCount
      });

      this.snackBar.open('下書きを保存しました', '閉じる', { duration: 3000 });
      await this.loadSalaryData(); // 再読み込み
    } catch (error) {
      console.error('[他社給与入力] 下書きの保存に失敗しました:', error);
      this.snackBar.open('下書きの保存に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  async confirm(): Promise<void> {
    if (!this.employeeId) {
      console.warn('[他社給与入力] confirm: employeeIdがありません');
      return;
    }

    console.log('[他社給与入力] confirm開始', {
      rowsCount: this.salaryRows.length
    });

    try {
      const user = await this.authService.getCurrentUser();
      if (!user || !user.uid) {
        this.snackBar.open('認証情報が取得できません', '閉じる', { duration: 3000 });
        return;
      }

      const now = new Date();
      let confirmedCount = 0;
      let skippedCount = 0;

      for (const row of this.salaryRows) {
        console.log('[他社給与入力] confirm処理中', {
          id: row.id,
          year: row.year,
          month: row.month,
          companyName: row.companyName,
          monthlyReward: row.monthlyReward,
          bonus: row.bonus,
          retroactivePayment: row.retroactivePayment,
          isConfirmed: row.isConfirmed
        });

        if (row.id) {
          // 既存データを確定
          await this.otherCompanySalaryDataService.updateOtherCompanySalaryData(row.id, {
            monthlyReward: row.monthlyReward || 0,
            bonus: row.bonus || 0,
            retroactivePayment: row.retroactivePayment || 0,
            isConfirmed: true,
            confirmedAt: now,
            confirmedBy: user.uid
          });
          confirmedCount++;
          console.log('[他社給与入力] 既存データ確定完了', { id: row.id });
        } else {
          // 新規データを作成して確定
          if ((row.monthlyReward && row.monthlyReward > 0) || (row.bonus && row.bonus > 0) || (row.retroactivePayment && row.retroactivePayment > 0)) {
            const newId = await this.otherCompanySalaryDataService.createOtherCompanySalaryData({
              employeeId: this.employeeId,
              companyId: row.companyId,
              companyName: row.companyName,
              year: row.year,
              month: row.month,
              monthlyReward: row.monthlyReward || 0,
              bonus: row.bonus || 0,
              retroactivePayment: row.retroactivePayment || 0,
              isConfirmed: true,
              confirmedAt: now,
              confirmedBy: user.uid
            });
            confirmedCount++;
            console.log('[他社給与入力] 新規データ作成・確定完了', { id: newId });
          } else {
            skippedCount++;
            console.log('[他社給与入力] 値が0のためスキップ', { year: row.year, month: row.month });
          }
        }
      }

      console.log('[他社給与入力] confirm完了', {
        confirmedCount,
        skippedCount
      });

      this.snackBar.open('確定しました', '閉じる', { duration: 3000 });
      await this.loadSalaryData(); // 再読み込み
    } catch (error) {
      console.error('[他社給与入力] 確定に失敗しました:', error);
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

