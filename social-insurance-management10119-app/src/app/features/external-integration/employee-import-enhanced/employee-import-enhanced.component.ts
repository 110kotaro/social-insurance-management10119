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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import * as XLSX from 'xlsx';
import { SampleDialogComponent } from '../../employees/employee-import/sample-dialog.component';
import { EmployeeService } from '../../../core/services/employee.service';
import { DepartmentService } from '../../../core/services/department.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Employee, InsuranceInfo, OtherCompanyInfo, Address } from '../../../core/models/employee.model';
import { Department } from '../../../core/models/department.model';
import { ConflictResolutionDialogComponent } from './conflict-resolution-dialog.component';

interface ImportedEmployee {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  firstNameKana: string;
  lastNameKana: string;
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
  conflictType?: 'duplicate' | 'existing'; // duplicate: インポートファイル内の重複, existing: 既存データとの重複
  existingEmployee?: Employee; // 既存の社員データ（競合がある場合）
  conflictResolution?: 'overwrite' | 'skip' | 'merge' | 'individual'; // 競合解決方法
  selected?: boolean; // 個別選択用
}

interface FieldDiff {
  field: string;
  fieldLabel: string;
  before: any;
  after: any;
  changeType: 'add' | 'update' | 'delete';
}

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
    MatCheckboxModule,
    MatSelectModule,
    MatRadioModule
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
  displayedColumns: string[] = ['select', 'employeeNumber', 'name', 'nameKana', 'email', 'department', 'conflict', 'resolution', 'actions'];
  dataSource = new MatTableDataSource<ImportedEmployee>([]);
  importErrors: string[] = [];
  isLoading = false;
  isValidating = false;
  
  // 競合解決のデフォルト設定
  defaultConflictResolution: 'overwrite' | 'skip' | 'merge' | 'individual' = 'individual';
  
  // 全選択/全解除
  allSelected = false;
  someSelected = false;

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
    this.allSelected = false;
    this.someSelected = false;

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
      this.updateSelectionState();
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
   * 想定フォーマット: 社員番号, 氏名, 氏名カナ, メールアドレス, 部署名, 入社日, 生年月日, ステータス, 権限, [保険情報...], [住所情報...]
   * 必須項目: 1-9列（権限を含む）
   * 任意項目: 10-18列（保険情報、住所情報）
   */
  private parseEmployeeRow(row: any[], rowNumber: number): void {
    const errors: string[] = [];

    // 最低限の列数チェック（必須項目9列）
    if (row.length < 9) {
      errors.push(`列数が不足しています（最低9列必要：必須項目1-9）`);
      this.importedEmployees.push({
        employeeNumber: row[0] || '',
        ...this.splitNameFromCSV(row[1] || '', row[2] || ''),
        email: row[3] || '',
        departmentName: row[4] || '',
        joinDate: null,
        birthDate: null,
        status: 'active',
        errors,
        selected: true
      });
      return;
    }

    // 必須項目（1-8列）
    const employeeNumber = String(row[0] || '').trim();
    const name = String(row[1] || '').trim();
    const nameKana = String(row[2] || '').trim();
    const email = String(row[3] || '').trim();
    const departmentName = String(row[4] || '').trim();
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

    // 入社日をパース
    let joinDate: Date | null = null;
    if (joinDateRaw !== undefined && joinDateRaw !== null && joinDateRaw !== '') {
      joinDate = this.parseDate(joinDateRaw);
      if (!joinDate) {
        errors.push('入社日の形式が正しくありません（yyyy-MM-dd形式）');
      }
    }

    // 生年月日をパース
    let birthDate: Date | null = null;
    if (birthDateRaw !== undefined && birthDateRaw !== null && birthDateRaw !== '') {
      birthDate = this.parseDate(birthDateRaw);
      if (!birthDate) {
        errors.push('生年月日の形式が正しくありません（yyyy-MM-dd形式）');
      }
    }

    // ステータスをパース
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
    let role: 'admin' | 'employee' = 'employee';
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

    // 任意項目（10-21列）
    const healthInsuranceNumber = this.normalizeValue(row[9]);
    const pensionNumber = this.normalizeValue(row[10]);
    const myNumber = this.normalizeValue(row[11]);
    const standardRewardRaw = this.normalizeValue(row[12]);
    const standardReward = standardRewardRaw ? parseFloat(String(standardRewardRaw)) : undefined;
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

    // 保険適用開始日をパース
    let insuranceStartDate: Date | null = null;
    if (insuranceStartDateRaw !== undefined && insuranceStartDateRaw !== null && insuranceStartDateRaw !== '' && insuranceStartDateRaw !== '-' && insuranceStartDateRaw !== 'ー') {
      const parsed = this.parseDate(insuranceStartDateRaw);
      if (parsed) {
        insuranceStartDate = parsed;
      }
    }

    const nameParts = this.splitNameFromCSV(name, nameKana);
    this.importedEmployees.push({
      employeeNumber,
      ...nameParts,
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
      errors: errors.length > 0 ? errors : undefined,
      selected: errors.length === 0 // エラーがない場合のみ選択状態にする
    });
  }

  /**
   * 日付文字列をパース
   */
  private parseDate(dateStr: string | number): Date | null {
    if (typeof dateStr === 'number') {
      const excelEpoch = new Date(1899, 11, 30);
      const days = dateStr;
      const date = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
      return date;
    }

    const str = String(dateStr).trim();
    
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10) - 1;
      const day = parseInt(isoMatch[3], 10);
      return new Date(year, month, day);
    }

    const slashMatch = str.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
    if (slashMatch) {
      const year = parseInt(slashMatch[1], 10);
      const month = parseInt(slashMatch[2], 10) - 1;
      const day = parseInt(slashMatch[3], 10);
      return new Date(year, month, day);
    }

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
   * CSVから読み込んだ氏名を分割
   */
  private splitNameFromCSV(name: string, nameKana: string): { firstName: string; lastName: string; firstNameKana: string; lastNameKana: string } {
    if (name && name.includes(' ')) {
      const parts = name.split(' ', 2);
      const kanaParts = nameKana ? nameKana.split(' ', 2) : ['', ''];
      return {
        firstName: parts[1] || '',
        lastName: parts[0] || '',
        firstNameKana: kanaParts[1] || '',
        lastNameKana: kanaParts[0] || ''
      };
    }
    
    if (nameKana && nameKana.length > 0) {
      const kanaMid = Math.ceil(nameKana.length / 2);
      const lastNameKana = nameKana.substring(0, kanaMid);
      const firstNameKana = nameKana.substring(kanaMid);
      
      const nameMid = Math.ceil(name.length / 2);
      const lastName = name.substring(0, nameMid);
      const firstName = name.substring(nameMid);
      
      return { firstName, lastName, firstNameKana, lastNameKana };
    }
    
    return { firstName: name || '', lastName: '', firstNameKana: nameKana || '', lastNameKana: '' };
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
            emp.conflictType = 'duplicate';
            if (!emp.errors) emp.errors = [];
            emp.errors.push(`社員番号「${employeeNumber}」がインポートファイル内で重複しています`);
          });
        }
      });

      emails.forEach((employees, email) => {
        if (employees.length > 1) {
          employees.forEach(emp => {
            emp.conflictType = 'duplicate';
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
            emp.conflictType = 'existing';
            emp.existingEmployee = existingEmployee;
            emp.conflictResolution = this.defaultConflictResolution;
            emp.selected = false; // 競合がある場合はデフォルトで選択解除
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
   * 差分を計算
   */
  calculateDiff(imported: ImportedEmployee, existing: Employee): FieldDiff[] {
    const diffs: FieldDiff[] = [];

    // 基本情報の差分
    const basicFields: { key: keyof Employee; label: string }[] = [
      { key: 'firstName', label: '名' },
      { key: 'lastName', label: '姓' },
      { key: 'firstNameKana', label: '名（カナ）' },
      { key: 'lastNameKana', label: '姓（カナ）' },
      { key: 'email', label: 'メールアドレス' },
      { key: 'joinDate', label: '入社日' },
      { key: 'birthDate', label: '生年月日' },
      { key: 'status', label: 'ステータス' },
      { key: 'role', label: '権限' }
    ];

    basicFields.forEach(field => {
      const importedValue = (imported as any)[field.key];
      const existingValue = existing[field.key];

      if (this.isDifferent(importedValue, existingValue)) {
        diffs.push({
          field: field.key,
          fieldLabel: field.label,
          before: existingValue,
          after: importedValue,
          changeType: existingValue !== undefined && existingValue !== null ? 'update' : 'add'
        });
      }
    });

    // 住所情報の差分
    if (imported.postalCode || existing.address?.official?.postalCode) {
      const importedPostalCode = imported.postalCode || '';
      const existingPostalCode = existing.address?.official?.postalCode || '';
      if (importedPostalCode !== existingPostalCode) {
        diffs.push({
          field: 'address.official.postalCode',
          fieldLabel: '郵便番号',
          before: existingPostalCode,
          after: importedPostalCode,
          changeType: existingPostalCode ? 'update' : 'add'
        });
      }
    }

    // 保険情報の差分
    if (imported.healthInsuranceNumber || existing.insuranceInfo?.healthInsuranceNumber) {
      const importedValue = imported.healthInsuranceNumber || '';
      const existingValue = existing.insuranceInfo?.healthInsuranceNumber || '';
      if (importedValue !== existingValue) {
        diffs.push({
          field: 'insuranceInfo.healthInsuranceNumber',
          fieldLabel: '健康保険被保険者番号',
          before: existingValue,
          after: importedValue,
          changeType: existingValue ? 'update' : 'add'
        });
      }
    }

    return diffs;
  }

  /**
   * 値が異なるかチェック
   */
  private isDifferent(value1: any, value2: any): boolean {
    if (value1 === value2) return false;
    if (value1 === null || value1 === undefined) return value2 !== null && value2 !== undefined;
    if (value2 === null || value2 === undefined) return true;
    if (value1 instanceof Date && value2 instanceof Date) {
      return value1.getTime() !== value2.getTime();
    }
    return String(value1) !== String(value2);
  }

  /**
   * 競合解決ダイアログを開く
   */
  openConflictResolutionDialog(employee: ImportedEmployee): void {
    if (!employee.existingEmployee) return;

    const diffs = this.calculateDiff(employee, employee.existingEmployee);

    const dialogRef = this.dialog.open(ConflictResolutionDialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: {
        importedEmployee: employee,
        existingEmployee: employee.existingEmployee,
        diffs: diffs
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        employee.conflictResolution = result.resolution;
        employee.selected = result.selected;
        this.updateSelectionState();
      }
    });
  }

  /**
   * 全選択/全解除
   */
  toggleAllSelection(): void {
    this.allSelected = !this.allSelected;
    this.importedEmployees.forEach(emp => {
      // エラーがない場合のみ選択状態を変更
      if (!emp.errors || emp.errors.length === 0) {
        emp.selected = this.allSelected;
      }
    });
    this.updateSelectionState();
  }

  /**
   * 個別選択の切り替え
   */
  toggleSelection(employee: ImportedEmployee): void {
    employee.selected = !employee.selected;
    this.updateSelectionState();
  }

  /**
   * 選択状態を更新
   */
  private updateSelectionState(): void {
    const selectableEmployees = this.importedEmployees.filter(emp => !emp.errors || emp.errors.length === 0);
    const selectedCount = selectableEmployees.filter(emp => emp.selected).length;
    
    this.allSelected = selectedCount > 0 && selectedCount === selectableEmployees.length;
    this.someSelected = selectedCount > 0 && selectedCount < selectableEmployees.length;
  }

  /**
   * 競合解決方法を一括適用
   */
  applyDefaultResolution(): void {
    this.importedEmployees.forEach(emp => {
      if (emp.conflictType === 'existing' && !emp.conflictResolution) {
        emp.conflictResolution = this.defaultConflictResolution;
        if (this.defaultConflictResolution === 'skip') {
          emp.selected = false;
        } else {
          emp.selected = true;
        }
      }
    });
    this.updateSelectionState();
  }

  /**
   * インポート実行
   */
  async executeImport(): Promise<void> {
    if (!this.organizationId) {
      this.snackBar.open('組織情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    // 選択されたデータを取得
    const selectedEmployees = this.importedEmployees.filter(emp => emp.selected && (!emp.errors || emp.errors.length === 0));

    if (selectedEmployees.length === 0) {
      this.snackBar.open('インポートするデータが選択されていません', '閉じる', { duration: 3000 });
      return;
    }

    this.isLoading = true;

    try {
      const employeesToCreate: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>[] = [];
      const employeesToUpdate: { id: string; data: Partial<Employee> }[] = [];

      for (const emp of selectedEmployees) {
        if (emp.conflictType === 'existing' && emp.existingEmployee) {
          // 既存データの更新
          if (emp.conflictResolution === 'overwrite') {
            // 上書き
            const updateData = this.convertToEmployeeData(emp);
            employeesToUpdate.push({
              id: emp.existingEmployee.id!,
              data: updateData
            });
          } else if (emp.conflictResolution === 'merge') {
            // マージ（空欄のみ上書き）
            const updateData = this.convertToEmployeeData(emp, true);
            employeesToUpdate.push({
              id: emp.existingEmployee.id!,
              data: updateData
            });
          }
          // 'skip'の場合は何もしない
        } else {
          // 新規作成
          const employeeData = this.convertToEmployeeData(emp);
          employeesToCreate.push(employeeData as Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>);
        }
      }

      // 一括作成
      if (employeesToCreate.length > 0) {
        await this.employeeService.createEmployees(employeesToCreate);
      }

      // 一括更新
      for (const update of employeesToUpdate) {
        await this.employeeService.updateEmployee(update.id, update.data);
      }

      const totalProcessed = employeesToCreate.length + employeesToUpdate.length;
      this.snackBar.open(`${totalProcessed}件の社員データを処理しました（新規: ${employeesToCreate.length}件、更新: ${employeesToUpdate.length}件）`, '閉じる', { duration: 5000 });
      this.router.navigate(['/external-integration']);
    } catch (error) {
      console.error('社員の一括登録/更新に失敗しました:', error);
      this.snackBar.open('社員の一括登録/更新に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * ImportedEmployeeをEmployeeデータに変換
   */
  private convertToEmployeeData(emp: ImportedEmployee, mergeMode: boolean = false): Partial<Employee> {
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

    const address: { official: Address } = {
      official: {
        postalCode: emp.postalCode || '',
        prefecture: emp.prefecture || '',
        city: emp.city || '',
        street: emp.street || '',
        ...(emp.building && { building: emp.building })
      }
    };

    const baseData: any = {
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
      role: emp.role || 'employee',
      insuranceInfo,
      address,
      organizationId: this.organizationId!
    };

    if (mergeMode && emp.existingEmployee) {
      // マージモード: 空欄のみ上書き
      const existing = emp.existingEmployee;
      const merged: any = {};
      
      Object.keys(baseData).forEach(key => {
        const value = baseData[key];
        const existingValue = (existing as any)[key];
        
        if (value !== undefined && value !== null && value !== '') {
          if (existingValue === undefined || existingValue === null || existingValue === '') {
            merged[key] = value;
          } else {
            merged[key] = existingValue; // 既存の値を使用
          }
        } else if (existingValue !== undefined && existingValue !== null) {
          merged[key] = existingValue; // 既存の値を使用
        }
      });
      
      return merged;
    }

    return baseData;
  }

  /**
   * キャンセル
   */
  cancel(): void {
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
   * 競合タイプの表示ラベルを取得
   */
  getConflictTypeLabel(conflictType?: string): string {
    if (!conflictType) return '-';
    return conflictType === 'duplicate' ? 'ファイル内重複' : '既存データと競合';
  }

  /**
   * 競合解決方法の表示ラベルを取得
   */
  getResolutionLabel(resolution?: string): string {
    if (!resolution) return '-';
    const labels: { [key: string]: string } = {
      'overwrite': '上書き',
      'skip': 'スキップ',
      'merge': 'マージ',
      'individual': '個別選択'
    };
    return labels[resolution] || resolution;
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
   * 選択済み件数を取得
   */
  getSelectedCount(): number {
    return this.importedEmployees.filter(e => e.selected && (!e.errors || e.errors.length === 0)).length;
  }

  /**
   * 競合件数を取得
   */
  getConflictCount(): number {
    return this.importedEmployees.filter(e => e.conflictType === 'existing').length;
  }

  /**
   * 選択された社員が存在するかチェック
   */
  hasSelectedEmployees(): boolean {
    return this.importedEmployees.filter(e => e.selected && (!e.errors || e.errors.length === 0)).length > 0;
  }
}
