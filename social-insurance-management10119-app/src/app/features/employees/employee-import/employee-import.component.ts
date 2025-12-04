import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import * as XLSX from 'xlsx';
import { SampleDialogComponent } from './sample-dialog.component';
import { EmployeeService } from '../../../core/services/employee.service';
import { DepartmentService } from '../../../core/services/department.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Employee, InsuranceInfo, OtherCompanyInfo, Address } from '../../../core/models/employee.model';
import { Department } from '../../../core/models/department.model';

interface ImportedEmployee {
  employeeNumber: string;
  name: string;
  nameKana: string;
  email: string;
  departmentName: string;
  departmentId?: string;
  joinDate: Date | null;
  birthDate: Date | null;
  status: 'active' | 'leave' | 'retired' | 'pre_join';
  role?: 'admin' | 'employee'; // 権限（デフォルト: 'employee'）
  // 保険情報
  healthInsuranceNumber?: string;
  pensionNumber?: string;
  myNumber?: string;
  standardReward?: number;
  insuranceStartDate?: Date | null;
  // 他社勤務情報
  isOtherCompany?: boolean;
  isPrimary?: boolean;
  companyName?: string;
  // 住所情報
  postalCode?: string;
  prefecture?: string;
  city?: string;
  street?: string;
  building?: string;
  errors?: string[];
}

@Component({
  selector: 'app-employee-import',
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
    MatProgressSpinnerModule,
    MatDialogModule
  ],
  templateUrl: './employee-import.component.html',
  styleUrl: './employee-import.component.css'
})
export class EmployeeImportComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private departmentService = inject(DepartmentService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);

  departments: Department[] = [];
  organizationId: string | null = null;
  importedEmployees: ImportedEmployee[] = [];
  displayedColumns: string[] = ['employeeNumber', 'name', 'nameKana', 'email', 'department', 'joinDate', 'status', 'errors'];
  dataSource = new MatTableDataSource<ImportedEmployee>([]);
  importErrors: string[] = [];
  isLoading = false;
  isValidating = false;

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.organizationId = currentUser.organizationId;
    this.loadDepartments();
  }

  /**
   * 部署一覧を読み込む
   */
  private async loadDepartments(): Promise<void> {
    if (!this.organizationId) return;

    try {
      this.departments = await this.departmentService.getDepartmentsByOrganization(this.organizationId);
    } catch (error) {
      console.error('部署の読み込みに失敗しました:', error);
      this.snackBar.open('部署の読み込みに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * ファイル選択
   */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.importErrors = [];
    this.importedEmployees = [];

    try {
      if (file.name.endsWith('.csv')) {
        await this.parseCsvFile(file);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        await this.parseExcelFile(file);
      } else {
        this.importErrors.push('CSVまたはExcelファイルを選択してください');
        return;
      }

      // バリデーション
      await this.validateImportedData();

      // データソースを更新
      this.dataSource.data = this.importedEmployees;
      
      // 表示列を動的に更新（有効セルがある列のみ）
      this.updateDisplayedColumns();
    } catch (error: any) {
      this.importErrors.push(`ファイルの読み込みに失敗しました: ${error.message}`);
    }

    // ファイル入力をリセット
    input.value = '';
  }

  /**
   * CSVファイルをパース
   */
  private async parseCsvFile(file: File): Promise<void> {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      this.importErrors.push('CSVファイルにデータが含まれていません');
      return;
    }

    // ヘッダー行をスキップ（1行目）
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const row = this.parseCsvLine(line);
      this.parseEmployeeRow(row, i + 1);
    }
  }

  /**
   * CSV行をパース（引用符を考慮）
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  /**
   * Excelファイルをパース
   */
  private async parseExcelFile(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];

    if (data.length < 2) {
      this.importErrors.push('Excelファイルにデータが含まれていません');
      return;
    }

    // ヘッダー行をスキップ（1行目）
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      this.parseEmployeeRow(row, i + 1);
    }
  }

  /**
   * 社員データ行をパース
   * 想定フォーマット: 社員番号, 氏名, 氏名カナ, メールアドレス, 部署名, 入社日, 生年月日, ステータス, [保険情報...], [他社勤務情報...], [住所情報...]
   * 必須項目: 1-8列（生年月日を含む）
   * 任意項目: 9-21列
   */
  private parseEmployeeRow(row: any[], rowNumber: number): void {
    const errors: string[] = [];

    // 最低限の列数チェック（必須項目8列）
    if (row.length < 8) {
      errors.push(`列数が不足しています（最低8列必要：必須項目1-8）`);
      this.importedEmployees.push({
        employeeNumber: row[0] || '',
        name: row[1] || '',
        nameKana: row[2] || '',
        email: row[3] || '',
        departmentName: row[4] || '',
        joinDate: null,
        birthDate: null,
        status: 'active',
        errors
      });
      return;
    }

    // 必須項目（1-8列）
    const employeeNumber = String(row[0] || '').trim();
    const name = String(row[1] || '').trim();
    const nameKana = String(row[2] || '').trim();
    const email = String(row[3] || '').trim();
    const departmentName = String(row[4] || '').trim();
    // 日付は数値（Excelシリアル値）の可能性があるため、直接row[5]とrow[6]を使用
    const joinDateRaw = row[5];
    const birthDateRaw = row[6];
    const statusStr = String(row[7] || '').trim();

    // 必須項目チェック
    if (!employeeNumber) errors.push('社員番号が空です');
    if (!name) errors.push('氏名が空です');
    if (!nameKana) errors.push('氏名カナが空です');
    if (!email) errors.push('メールアドレスが空です');
    if (!departmentName) errors.push('部署名が空です');
    if (joinDateRaw === undefined || joinDateRaw === null || joinDateRaw === '') errors.push('入社日が空です');
    if (birthDateRaw === undefined || birthDateRaw === null || birthDateRaw === '') errors.push('生年月日が空です');

    // 氏名カナのカタカナチェック
    if (nameKana && !this.isKatakana(nameKana)) {
      errors.push('氏名カナはカタカナで入力してください');
    }

    // メールアドレス形式チェック
    if (email && !this.isValidEmail(email)) {
      errors.push('メールアドレスの形式が正しくありません');
    }

    // 入社日をパース（Excelシリアル値対応）
    let joinDate: Date | null = null;
    if (joinDateRaw !== undefined && joinDateRaw !== null && joinDateRaw !== '') {
      joinDate = this.parseDate(joinDateRaw);
      if (!joinDate) {
        errors.push('入社日の形式が正しくありません（yyyy-MM-dd形式）');
      }
    }

    // 生年月日をパース（Excelシリアル値対応）
    let birthDate: Date | null = null;
    if (birthDateRaw !== undefined && birthDateRaw !== null && birthDateRaw !== '') {
      birthDate = this.parseDate(birthDateRaw);
      if (!birthDate) {
        errors.push('生年月日の形式が正しくありません（yyyy-MM-dd形式）');
      }
    }

    // ステータスをパース（日本語対応）
    const statusLower = statusStr.toLowerCase();
    let status: 'active' | 'leave' | 'retired' | 'pre_join' = 'active';
    if (statusLower === 'leave' || statusLower === '休職') {
      status = 'leave';
    } else if (statusLower === 'retired' || statusLower === '退職') {
      status = 'retired';
    } else if (statusLower === 'pre_join' || statusLower === '未入社') {
      status = 'pre_join';
    } else if (statusLower === 'active' || statusLower === '在籍' || !statusStr) {
      status = 'active';
    } else {
      errors.push(`不明なステータス: ${statusStr}`);
    }

    // 部署IDを検索
    const department = this.departments.find(d => d.name === departmentName);
    const departmentId = department?.id;

    if (!departmentId && departmentName) {
      errors.push(`部署「${departmentName}」が見つかりません`);
    }

    // 権限（9列目、必須項目）
    const roleRaw = this.normalizeValue(row[8]);
    let role: 'admin' | 'employee' = 'employee'; // デフォルト値
    if (!roleRaw) {
      errors.push('権限が空です');
    } else {
      const roleStr = String(roleRaw).trim().toLowerCase();
      if (roleStr === 'admin' || roleStr === '管理者') {
        role = 'admin';
      } else if (roleStr === 'employee' || roleStr === '一般社員' || roleStr === '社員') {
        role = 'employee';
      } else {
        errors.push(`不明な権限: ${roleRaw}`);
      }
    }

    // 任意項目（10-21列）「-」や「ー」は空欄として扱う
    const healthInsuranceNumber = this.normalizeValue(row[9]);
    const pensionNumber = this.normalizeValue(row[10]);
    const myNumber = this.normalizeValue(row[11]);
    const standardRewardRaw = this.normalizeValue(row[12]);
    const standardReward = standardRewardRaw ? parseFloat(String(standardRewardRaw)) : undefined;
    // 保険適用開始日は数値（Excelシリアル値）の可能性があるため、直接row[13]を使用（「-」や「ー」は除外）
    const insuranceStartDateRaw = (row[13] !== undefined && row[13] !== null && row[13] !== '' && String(row[13]).trim() !== '-' && String(row[13]).trim() !== 'ー') ? row[13] : undefined;
    const isOtherCompanyStr = this.normalizeValue(row[14]);
    const isPrimaryStr = this.normalizeValue(row[15]);
    const companyName = this.normalizeValue(row[16]);
    const postalCode = this.normalizeValue(row[17]) || '';
    const prefecture = this.normalizeValue(row[18]) || '';
    const city = this.normalizeValue(row[19]) || '';
    const street = this.normalizeValue(row[20]) || '';
    const building = this.normalizeValue(row[21]);

    // 住所情報の必須チェック
    if (!postalCode) errors.push('郵便番号が空です');
    if (!prefecture) errors.push('都道府県が空です');
    if (!city) errors.push('市区町村が空です');
    if (!street) errors.push('町名・番地が空です');

    // 保険適用開始日をパース（Excelシリアル値対応）
    let insuranceStartDate: Date | null = null;
    if (insuranceStartDateRaw !== undefined && insuranceStartDateRaw !== null && insuranceStartDateRaw !== '' && insuranceStartDateRaw !== '-' && insuranceStartDateRaw !== 'ー') {
      const parsed = this.parseDate(insuranceStartDateRaw);
      if (parsed) {
        insuranceStartDate = parsed;
      }
    }

    // 他社勤務有無をパース（true: 'true', 'はい', '1', 'あり', '〇' / false: 'false', 'いいえ', '0', 'なし', '×'）
    let isOtherCompany: boolean | undefined = undefined;
    if (isOtherCompanyStr) {
      const lowerStr = isOtherCompanyStr.toLowerCase();
      const normalizedStr = isOtherCompanyStr.trim();
      if (lowerStr === 'true' || normalizedStr === 'はい' || lowerStr === '1' || normalizedStr === 'あり' || normalizedStr === '〇' || normalizedStr === '○') {
        isOtherCompany = true;
      } else if (lowerStr === 'false' || normalizedStr === 'いいえ' || lowerStr === '0' || normalizedStr === 'なし' || normalizedStr === '×') {
        isOtherCompany = false;
      }
    }

    // 主たる勤務先をパース（true: 'true', 'はい', '1', 'あり', '〇' / false: 'false', 'いいえ', '0', 'なし', '×'）
    let isPrimary: boolean | undefined = undefined;
    if (isPrimaryStr) {
      const lowerStr = isPrimaryStr.toLowerCase();
      const normalizedStr = isPrimaryStr.trim();
      if (lowerStr === 'true' || normalizedStr === 'はい' || lowerStr === '1' || normalizedStr === 'あり' || normalizedStr === '〇' || normalizedStr === '○') {
        isPrimary = true;
      } else if (lowerStr === 'false' || normalizedStr === 'いいえ' || lowerStr === '0' || normalizedStr === 'なし' || normalizedStr === '×') {
        isPrimary = false;
      }
    }

    this.importedEmployees.push({
      employeeNumber,
      name,
      nameKana,
      email,
      departmentName,
      departmentId,
      joinDate,
      birthDate,
      status,
      role,
      healthInsuranceNumber,
      pensionNumber,
      myNumber,
      standardReward,
      insuranceStartDate,
      isOtherCompany,
      isPrimary,
      companyName,
      postalCode,
      prefecture,
      city,
      street,
      building,
      errors: errors.length > 0 ? errors : undefined
    });
  }

  /**
   * 日付文字列をパース
   */
  private parseDate(dateStr: string | number): Date | null {
    // Excelの日付シリアル値の場合
    if (typeof dateStr === 'number') {
      // Excelの日付シリアル値（1900年1月1日からの日数）
      // Excelは1900年1月1日を1としてカウント開始（ただし1900年は閏年として扱われない）
      // 実際の計算: 1900年1月1日 = 1, 1900年1月2日 = 2, ...
      // JavaScriptのDateは1900年1月1日を基準にするため、1899年12月30日を基準にする
      const excelEpoch = new Date(1899, 11, 30); // 1899年12月30日
      const days = dateStr;
      const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
      return date;
    }

    // 文字列の場合
    const str = String(dateStr).trim();
    
    // yyyy-MM-dd形式
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10) - 1;
      const day = parseInt(isoMatch[3], 10);
      return new Date(year, month, day);
    }

    // yyyy/MM/dd形式
    const slashMatch = str.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
    if (slashMatch) {
      const year = parseInt(slashMatch[1], 10);
      const month = parseInt(slashMatch[2], 10) - 1;
      const day = parseInt(slashMatch[3], 10);
      return new Date(year, month, day);
    }

    // Dateオブジェクトとしてパースを試みる
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return date;
    }

    return null;
  }

  /**
   * メールアドレスの形式チェック
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * カタカナかどうかを検証
   */
  private isKatakana(text: string): boolean {
    const katakanaPattern = /^[ァ-ヶー\s]+$/;
    return katakanaPattern.test(text);
  }

  /**
   * 「-」や「ー」を空欄として扱う（表示用）
   */
  formatDisplayValue(value: any): string {
    if (value === undefined || value === null || value === '' || value === '-' || value === 'ー') {
      return '';
    }
    return String(value);
  }

  /**
   * 「-」や「ー」を空欄として扱う（パース用）
   * @param value 値
   * @param allowEmpty 空欄を許可する場合true（日付など）
   */
  private normalizeValue(value: any, allowEmpty: boolean = false): string | undefined {
    if (value === undefined || value === null || value === '') {
      return allowEmpty ? value : undefined;
    }
    const str = String(value).trim();
    if (str === '-' || str === 'ー') {
      return allowEmpty ? '' : undefined;
    }
    return str;
  }

  /**
   * 表示列を動的に更新（有効セルがある列のみ）
   */
  private updateDisplayedColumns(): void {
    const allColumns = [
      'employeeNumber',
      'name',
      'nameKana',
      'email',
      'department',
      'joinDate',
      'birthDate',
      'status',
      'role',
      'healthInsuranceNumber',
      'pensionNumber',
      'myNumber',
      'standardReward',
      'insuranceStartDate',
      'isOtherCompany',
      'isPrimary',
      'companyName',
      'postalCode',
      'prefecture',
      'city',
      'street',
      'building',
      'errors'
    ];

    // データに存在する列のみを表示（「-」や「ー」は空欄として扱う）
    const availableColumns = allColumns.filter(col => {
      if (col === 'errors') return true; // エラー列は常に表示
      return this.importedEmployees.some(emp => {
        const value = (emp as any)[col];
        // 「-」や「ー」は空欄として扱う
        if (value === '-' || value === 'ー') return false;
        return value !== undefined && value !== null && value !== '';
      });
    });

    this.displayedColumns = availableColumns;
  }

  /**
   * インポートデータのバリデーション
   */
  private async validateImportedData(): Promise<void> {
    // 重複チェック（社員番号、メールアドレス）
    const employeeNumbers = new Set<string>();
    const emails = new Set<string>();

    this.importedEmployees.forEach((emp, index) => {
      if (!emp.errors) {
        if (employeeNumbers.has(emp.employeeNumber)) {
          if (!emp.errors) emp.errors = [];
          emp.errors.push('社員番号が重複しています');
        } else {
          employeeNumbers.add(emp.employeeNumber);
        }

        if (emails.has(emp.email)) {
          if (!emp.errors) emp.errors = [];
          emp.errors.push('メールアドレスが重複しています');
        } else {
          emails.add(emp.email);
        }
      }
    });

    // 既存社員との重複チェック
    if (!this.organizationId) return;

    for (const emp of this.importedEmployees) {
      if (emp.errors && emp.errors.length > 0) continue; // 既にエラーがある場合はスキップ

      try {
        const existingEmployee = await this.employeeService.checkEmployeeExists(
          emp.employeeNumber,
          emp.email,
          this.organizationId
        );

        if (existingEmployee) {
          if (!emp.errors) emp.errors = [];
          emp.errors.push(`既存の社員データと重複しています（社員番号: ${existingEmployee.employeeNumber} / メールアドレス: ${existingEmployee.email}）`);
        }
      } catch (error) {
        console.error('既存社員のチェックに失敗しました:', error);
      }
    }
  }

  /**
   * インポート実行
   */
  async executeImport(): Promise<void> {
    if (!this.organizationId) {
      this.snackBar.open('組織情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    // エラーがあるデータを除外
    let validEmployees = this.importedEmployees.filter(emp => !emp.errors || emp.errors.length === 0);

    if (validEmployees.length === 0) {
      this.snackBar.open('インポート可能なデータがありません', '閉じる', { duration: 3000 });
      return;
    }

    this.isLoading = true;

    try {
      const employeesToCreate: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>[] = validEmployees.map(emp => {
        // 保険情報（undefinedを除外）
        const insuranceInfo: InsuranceInfo | undefined = 
          (emp.healthInsuranceNumber || emp.pensionNumber || emp.myNumber || emp.standardReward || emp.insuranceStartDate)
            ? {
                ...(emp.healthInsuranceNumber && { healthInsuranceNumber: emp.healthInsuranceNumber }),
                ...(emp.pensionNumber && { pensionNumber: emp.pensionNumber }),
                ...(emp.myNumber && { myNumber: emp.myNumber }),
                ...(emp.standardReward !== undefined && { standardReward: emp.standardReward }),
                ...(emp.insuranceStartDate && { insuranceStartDate: emp.insuranceStartDate })
              }
            : undefined;

        // 他社勤務情報（undefinedを除外）
        const otherCompanyInfo: OtherCompanyInfo | undefined = 
          emp.isOtherCompany !== undefined && emp.isOtherCompany
            ? {
                isOtherCompany: true,
                isPrimary: emp.isPrimary !== undefined ? emp.isPrimary : true,
                ...(emp.companyName && { companyName: emp.companyName })
              }
            : undefined;

        // 住所情報（必須項目なので常に設定、undefinedを除外）
        const address: { internal: Address } = {
          internal: {
            postalCode: emp.postalCode || '',
            prefecture: emp.prefecture || '',
            city: emp.city || '',
            street: emp.street || '',
            ...(emp.building && { building: emp.building })
          }
        };

        return {
          employeeNumber: emp.employeeNumber,
          name: emp.name,
          nameKana: emp.nameKana,
          email: emp.email,
          departmentId: emp.departmentId!,
          joinDate: emp.joinDate || new Date(),
          birthDate: emp.birthDate || new Date(),
          status: emp.status,
          role: emp.role || 'employee', // 権限（デフォルト: 'employee'）
          insuranceInfo,
          otherCompanyInfo,
          address,
          organizationId: this.organizationId!
        };
      });

      await this.employeeService.createEmployees(employeesToCreate);

      this.snackBar.open(`${employeesToCreate.length}件の社員を登録しました`, '閉じる', { duration: 3000 });
      this.router.navigate(['/employees']);
    } catch (error) {
      console.error('社員の一括登録に失敗しました:', error);
      this.snackBar.open('社員の一括登録に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * キャンセル
   */
  cancel(): void {
    this.router.navigate(['/employees']);
  }

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date | null): string {
    if (!date) return '-';
    return date.toLocaleDateString('ja-JP');
  }

  /**
   * ステータスの表示ラベルを取得
   */
  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'active': '在籍',
      'leave': '休職',
      'retired': '退職',
      'pre_join': '未入社'
    };
    return labels[status] || status;
  }

  getRoleLabel(role?: string): string {
    if (!role) return '一般社員';
    const roleMap: { [key: string]: string } = {
      'admin': '管理者',
      'employee': '一般社員'
    };
    return roleMap[role] || role;
  }

  /**
   * すべてのインポートデータにエラーがあるかチェック
   */
  hasOnlyErrors(): boolean {
    if (this.importedEmployees.length === 0) {
      return true;
    }
    return this.importedEmployees.every(emp => {
      return emp.errors && emp.errors.length > 0;
    });
  }

  /**
   * サンプルデータを表示
   */
  showSample(): void {
    this.dialog.open(SampleDialogComponent, {
      width: '900px',
      maxWidth: '90vw',
      maxHeight: '90vh'
    });
  }
}

