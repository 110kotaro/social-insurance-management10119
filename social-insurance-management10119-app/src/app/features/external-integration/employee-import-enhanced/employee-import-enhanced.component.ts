import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import * as XLSX from 'xlsx';
import { SampleDialogComponent } from '../../employees/employee-import/sample-dialog.component';
import { EmployeeService } from '../../../core/services/employee.service';
import { DepartmentService } from '../../../core/services/department.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Employee, InsuranceInfo, OtherCompanyInfo, Address } from '../../../core/models/employee.model';
import { Department } from '../../../core/models/department.model';

interface ImportedEmployee {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  firstNameKana: string;
  lastNameKana: string;
  name?: string; // 表示用（氏名）
  nameKana?: string; // 表示用（氏名カナ）
  email: string;
  departmentName: string;
  departmentId?: string;
  joinDate: Date | null;
  birthDate: Date | null;
  status: 'active' | 'leave' | 'retired' | 'pre_join';
  role?: 'admin' | 'employee';
  // 保険情報
  healthInsuranceNumber?: string;
  pensionNumber?: string;
  myNumber?: string;
  standardReward?: number;
  insuranceStartDate?: Date | null;
  // 住所情報
  postalCode?: string;
  prefecture?: string;
  city?: string;
  street?: string;
  building?: string;
  errors?: string[];
  // 競合情報
  // conflictType?: 'duplicate' | 'existing'; // duplicate: インポートファイル内の重複, existing: 既存データとの重複
  // existingEmployee?: Employee; // 既存の社員データ（競合がある場合）
  // conflictResolution?: 'overwrite' | 'skip' | 'merge' | 'individual'; // 競合解決方法
  // selected?: boolean; // 個別選択用
}

// interface FieldDiff {
//   field: string;
//   fieldLabel: string;
//   before: any;
//   after: any;
//   changeType: 'add' | 'update' | 'delete';
// }

@Component({
  selector: 'app-employee-import-enhanced',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSelectModule
  ],
  templateUrl: './employee-import-enhanced.component.html',
  styleUrl: './employee-import-enhanced.component.css'
})
export class EmployeeImportEnhancedComponent implements OnInit {
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
  displayedColumns: string[] = ['employeeNumber', 'lastName', 'firstName', 'lastNameKana', 'firstNameKana', 'email', 'department', 'joinDate', 'birthDate', 'status', 'role', 'healthInsuranceNumber', 'pensionNumber', 'myNumber', 'standardReward', 'insuranceStartDate', 'postalCode', 'prefecture', 'city', 'street', 'building', 'errors'];
  dataSource = new MatTableDataSource<ImportedEmployee>([]);
  importErrors: string[] = [];
  isLoading = false;
  isValidating = false;

  // ヘッダー行から列インデックスをマッピング
  private headerMap: Map<string, number> = new Map();

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
    this.headerMap.clear();

    try {
      if (file.name.endsWith('.csv')) {
        await this.parseCsvFile(file);
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        await this.parseExcelFile(file);
      } else {
        this.importErrors.push('CSVまたはExcelファイルを選択してください');
        return;
      }

      // バリデーションと競合検出
      await this.validateAndDetectConflicts();

      // データソースを更新
      this.dataSource.data = this.importedEmployees;
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

    // ヘッダー行を解析（1行目）
    const headerRow = this.parseCsvLine(lines[0]);
    this.parseHeaderRow(headerRow);

    // データ行を処理（2行目以降）
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

    // ヘッダー行を解析（1行目）
    const headerRow = data[0] || [];
    this.parseHeaderRow(headerRow.map((cell: any) => String(cell || '').trim()));

    // データ行を処理（2行目以降）
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      this.parseEmployeeRow(row, i + 1);
    }
  }

  /**
   * ヘッダー行を解析して列インデックスをマッピング
   */
  private parseHeaderRow(headerRow: string[]): void {
    this.headerMap.clear();
    
    headerRow.forEach((header, index) => {
      const normalizedHeader = header.trim();
      if (normalizedHeader) {
        this.headerMap.set(normalizedHeader, index);
      }
    });
  }

  /**
   * ヘッダーマップから列インデックスを取得（見つからない場合はデフォルトインデックスを返す）
   */
  private getColumnIndex(headerName: string, defaultIndex: number): number {
    return this.headerMap.get(headerName) ?? defaultIndex;
  }

  /**
   * 社員データ行をパース
   * ヘッダー行から列インデックスを取得してデータを読み込む
   */
  private parseEmployeeRow(row: any[], rowNumber: number): void {
    const errors: string[] = [];

    // 最低限の列数チェック（必須項目10列）
    if (row.length < 10) {
      errors.push(`列数が不足しています（最低10列必要：必須項目1-10）`);
      const lastName = String(row[1] || '').trim();
      const firstName = String(row[2] || '').trim();
      const lastNameKana = String(row[3] || '').trim();
      const firstNameKana = String(row[4] || '').trim();
      this.importedEmployees.push({
        employeeNumber: row[0] || '',
        firstName,
        lastName,
        firstNameKana,
        lastNameKana,
        email: row[5] || '',
        departmentName: row[6] || '',
        joinDate: null,
        birthDate: null,
        status: 'active',
        errors
      });
      return;
    }

    // 必須項目（1-10列）
    const employeeNumber = String(row[0] || '').trim();
    const lastName = String(row[1] || '').trim(); // 氏（姓）
    const firstName = String(row[2] || '').trim(); // 名
    const lastNameKana = String(row[3] || '').trim(); // 氏（カナ）
    const firstNameKana = String(row[4] || '').trim(); // 名（カナ）
    const email = String(row[5] || '').trim();
    const departmentName = String(row[6] || '').trim();
    // 日付は数値（Excelシリアル値）の可能性があるため、直接row[7]とrow[8]を使用
    const joinDateRaw = row[7];
    const birthDateRaw = row[8];
    const statusStr = String(row[9] || '').trim();

    // 必須項目チェック
    if (!employeeNumber) errors.push('社員番号が空です');
    if (!lastName) errors.push('氏が空です');
    if (!firstName) errors.push('名が空です');
    if (!lastNameKana) errors.push('氏（カナ）が空です');
    if (!firstNameKana) errors.push('名（カナ）が空です');
    if (!email) errors.push('メールアドレスが空です');
    if (!departmentName) errors.push('部署名が空です');
    if (joinDateRaw === undefined || joinDateRaw === null || joinDateRaw === '') errors.push('入社日が空です');
    if (birthDateRaw === undefined || birthDateRaw === null || birthDateRaw === '') errors.push('生年月日が空です');

    // 氏名カナのカタカナチェック
    const fullNameKana = lastNameKana + firstNameKana;
    if (fullNameKana && !this.isKatakana(fullNameKana)) {
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

    // 権限（11列目、必須項目）
    const roleRaw = this.normalizeValue(row[10]);
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

    // 任意項目（ヘッダーマップから列インデックスを取得）「-」や「ー」は空欄として扱う
    const healthInsuranceNumberIndex = this.getColumnIndex('被保険者整理番号', 11);
    const pensionNumberIndex = this.getColumnIndex('基礎年金番号', 12);
    const healthInsuranceNumber = this.normalizeValue(row[healthInsuranceNumberIndex]);
    const pensionNumber = this.normalizeValue(row[pensionNumberIndex]);
    const myNumber = this.normalizeValue(row[13]);
    const standardRewardRaw = this.normalizeValue(row[14]);
    const standardReward = standardRewardRaw ? parseFloat(String(standardRewardRaw)) : undefined;
    // 保険適用開始日は数値（Excelシリアル値）の可能性があるため、直接row[15]を使用（「-」や「ー」は除外）
    const insuranceStartDateRaw = (row[15] !== undefined && row[15] !== null && row[15] !== '' && String(row[15]).trim() !== '-' && String(row[15]).trim() !== 'ー') ? row[15] : undefined;
    // 住所情報（保険適用開始日の次から）
    const postalCode = this.normalizeValue(row[16]) || '';
    const prefecture = this.normalizeValue(row[17]) || '';
    const city = this.normalizeValue(row[18]) || '';
    const street = this.normalizeValue(row[19]) || '';
    const building = this.normalizeValue(row[20]);

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

    // 表示用の氏名と氏名カナを生成
    const name = `${lastName} ${firstName}`.trim();
    const nameKana = `${lastNameKana} ${firstNameKana}`.trim();

    this.importedEmployees.push({
      employeeNumber,
      firstName,
      lastName,
      firstNameKana,
      lastNameKana,
      name, // 表示用
      nameKana, // 表示用
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
      postalCode,
      prefecture,
      city,
      street,
      building,
      errors: errors.length > 0 ? errors : undefined
    });
  }

  /**
   * 日付文字列をパース（Excelシリアル値対応）
   */
  private parseDate(dateStr: string | number): Date | null {
    // Excelの日付シリアル値の場合
    if (typeof dateStr === 'number') {
      const excelEpoch = new Date(1899, 11, 30); // 1900年1月1日の前日
      excelEpoch.setDate(excelEpoch.getDate() + dateStr);
      return excelEpoch;
    }

    const str = String(dateStr).trim();
    
    // YYYY-MM-DD形式
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10) - 1;
      const day = parseInt(isoMatch[3], 10);
      return new Date(year, month, day);
    }

    // YYYY/MM/DD形式
    const slashMatch = str.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
    if (slashMatch) {
      const year = parseInt(slashMatch[1], 10);
      const month = parseInt(slashMatch[2], 10) - 1;
      const day = parseInt(slashMatch[3], 10);
      return new Date(year, month, day);
    }

    // その他の形式
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
   * 「-」や「ー」を空欄として扱う（パース用）
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
   * バリデーションと競合検出
   */
  private async validateAndDetectConflicts(): Promise<void> {
    this.isValidating = true;

    try {
      // インポートファイル内の重複チェック
      const employeeNumbers = new Map<string, ImportedEmployee[]>();
      const emails = new Map<string, ImportedEmployee[]>();

      this.importedEmployees.forEach((emp) => {
        if (emp.errors && emp.errors.length > 0) return; // 既にエラーがある場合はスキップ

        // 社員番号の重複チェック
        if (!employeeNumbers.has(emp.employeeNumber)) {
          employeeNumbers.set(emp.employeeNumber, []);
        }
        employeeNumbers.get(emp.employeeNumber)!.push(emp);

        // メールアドレスの重複チェック
        if (!emails.has(emp.email)) {
          emails.set(emp.email, []);
        }
        emails.get(emp.email)!.push(emp);
      });

      // 重複がある場合、マークする
      employeeNumbers.forEach((employees, employeeNumber) => {
        if (employees.length > 1) {
          employees.forEach(emp => {
            if (!emp.errors) emp.errors = [];
            emp.errors.push(`社員番号「${employeeNumber}」がインポートファイル内で重複しています`);
          });
        }
      });

      emails.forEach((employees, email) => {
        if (employees.length > 1) {
          employees.forEach(emp => {
            if (!emp.errors) emp.errors = [];
            emp.errors.push(`メールアドレス「${email}」がインポートファイル内で重複しています`);
          });
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
    } finally {
      this.isValidating = false;
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

        // 他社勤務情報（現在は使用しない）
        const otherCompanyInfo: OtherCompanyInfo[] | undefined = undefined;

        // 住所情報（officialのみ使用）
        const address: { official: Address } = {
          official: {
            postalCode: emp.postalCode || '',
            prefecture: emp.prefecture || '',
            city: emp.city || '',
            street: emp.street || '',
            ...(emp.building && { building: emp.building })
          }
        };

        return {
          employeeNumber: emp.employeeNumber,
          firstName: emp.firstName,
          lastName: emp.lastName,
          firstNameKana: emp.firstNameKana,
          lastNameKana: emp.lastNameKana,
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
      this.router.navigate(['/external-integration']);
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
    // インポートデータをクリア
    this.importedEmployees = [];
    this.dataSource.data = [];
    this.importErrors = [];
    this.headerMap.clear();
    
    // 外部連携ページに戻る
    this.router.navigate(['/external-integration']);
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

  /**
   * 権限の表示ラベルを取得
   */
  getRoleLabel(role?: string): string {
    if (!role) return '一般社員';
    const roleMap: { [key: string]: string } = {
      'admin': '管理者',
      'employee': '一般社員'
    };
    return roleMap[role] || role;
  }

  /**
   * 表示用の値をフォーマット
   */
  formatDisplayValue(value: any): string {
    if (value === undefined || value === null || value === '') return '-';
    if (typeof value === 'number') return value.toString();
    return String(value);
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
}
