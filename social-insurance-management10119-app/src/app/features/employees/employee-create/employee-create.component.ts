import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { EmployeeService } from '../../../core/services/employee.service';
import { DepartmentService } from '../../../core/services/department.service';
import { AuthService } from '../../../core/auth/auth.service';
import { InsuranceRateTableService } from '../../../core/services/insurance-rate-table.service';
import { Employee, DependentInfo, InsuranceInfo, OtherCompanyInfo, Address, LeaveInfo } from '../../../core/models/employee.model';
import { Department } from '../../../core/models/department.model';
import { InsuranceRateTable } from '../../../core/models/insurance-rate-table.model';

@Component({
  selector: 'app-employee-create',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCheckboxModule,
    MatCardModule,
    MatSnackBarModule
  ],
  templateUrl: './employee-create.component.html',
  styleUrl: './employee-create.component.css'
})
export class EmployeeCreateComponent implements OnInit {
  @ViewChild('stepper') stepper!: MatStepper;

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private employeeService = inject(EmployeeService);
  private departmentService = inject(DepartmentService);
  private authService = inject(AuthService);
  private insuranceRateTableService = inject(InsuranceRateTableService);
  private snackBar = inject(MatSnackBar);

  // ステップ1: 基本情報
  basicInfoForm: FormGroup;

  // ステップ2: 保険情報
  insuranceInfoForm: FormGroup;

  // ステップ3: 扶養情報
  dependentInfoForm: FormGroup;
  dependentsFormArray: FormArray;

  // ステップ4: 他社勤務情報
  otherCompanyForm: FormGroup;
  otherCompanyFormArray: FormArray;

  // ステップ5: 住所情報
  addressForm: FormGroup;

  // ステップ6: 休職情報
  leaveInfoForm: FormGroup;
  leaveInfoFormArray: FormArray;

  departments: Department[] = [];
  organizationId: string | null = null;
  isLoading = false;

  // 続柄の選択肢（申請フォームと統一）
  relationshipOptions = [
    { value: 'husband', label: '夫' },
    { value: 'wife', label: '妻' },
    { value: 'husband_unregistered', label: '夫（未届）' },
    { value: 'wife_unregistered', label: '妻（未届）' },
    { value: 'child', label: '実子・養子' },
    { value: 'other_child', label: '実子・養子以外の子' },
    { value: 'parent', label: '父母・養父母' },
    { value: 'parent_in_law', label: '義父母' },
    { value: 'sibling', label: '弟妹' },
    { value: 'elder_sibling', label: '兄姉' },
    { value: 'grandparent', label: '祖父母' },
    { value: 'great_grandparent', label: '曽祖父母' },
    { value: 'grandchild', label: '孫' },
    { value: 'other', label: 'その他' }
  ];

  constructor() {
    // ステップ1: 基本情報
    this.basicInfoForm = this.fb.group({
      employeeNumber: ['', [Validators.required]],
      firstName: ['', [Validators.required]],
      lastName: ['', [Validators.required]],
      firstNameKana: ['', [Validators.required, this.katakanaValidator]],
      lastNameKana: ['', [Validators.required, this.katakanaValidator]],
      email: ['', [Validators.required, Validators.email]],
      departmentId: ['', [Validators.required]],
      joinDate: [new Date(), [Validators.required]],
      birthDate: [null, [this.birthDateRequiredValidator]],
      status: ['active', [Validators.required]],
      retirementDate: [null], // 退職（予定）日（任意項目）
      role: ['employee', [Validators.required]]
    });

    // ステップ2: 保険情報
    this.insuranceInfoForm = this.fb.group({
      healthInsuranceNumber: [''],
      pensionNumber: [''],
      myNumber: [''],
      averageReward: [null],
      grade: [null],
      pensionGrade: [null],
      standardReward: [null],
      insuranceStartDate: [null]
    });

    // ステップ3: 扶養情報
    this.dependentInfoForm = this.fb.group({
      dependents: this.fb.array([])
    });
    this.dependentsFormArray = this.dependentInfoForm.get('dependents') as FormArray;

    // ステップ4: 他社勤務情報
    this.otherCompanyFormArray = this.fb.array([]);
    this.otherCompanyForm = this.fb.group({
      companies: this.otherCompanyFormArray
    });

    // ステップ5: 住所情報
    this.addressForm = this.fb.group({
      postalCode: ['', [Validators.required]],
      prefecture: ['', [Validators.required]],
      city: ['', [Validators.required]],
      street: ['', [Validators.required]],
      building: [''], // 建物名・部屋番号は任意
      kana: [''] // 住所カナ（修正17）
    });

    // ステップ6: 休職情報
    this.leaveInfoForm = this.fb.group({
      leaveInfo: this.fb.array([])
    });
    this.leaveInfoFormArray = this.leaveInfoForm.get('leaveInfo') as FormArray;
  }

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.organizationId = currentUser.organizationId;

    // 入社日変更時に保険適用開始日を自動設定（修正17）
    this.basicInfoForm.get('joinDate')?.valueChanges.subscribe(joinDate => {
      if (joinDate && !this.insuranceInfoForm.get('insuranceStartDate')?.value) {
        // 保険適用開始日が未設定の場合のみ自動設定
        this.insuranceInfoForm.patchValue({ insuranceStartDate: joinDate }, { emitEvent: false });
      }
    });
    this.loadDepartments();
  }

  /**
   * 生年月日の必須バリデーター（nullを明示的にチェック）
   */
  birthDateRequiredValidator(control: AbstractControl): ValidationErrors | null {
    if (control.value === null || control.value === '') {
      return { required: true };
    }
    return null;
  }

  /**
   * カタカナのみを許可するバリデーター
   */
  katakanaValidator(control: AbstractControl): ValidationErrors | null {
    if (!control.value || control.value === '') {
      return null; // 空の場合は他のバリデーター（required）に任せる
    }
    const katakanaPattern = /^[ァ-ヶー\s]+$/;
    if (!katakanaPattern.test(control.value)) {
      return { katakana: true };
    }
    return null;
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
   * 扶養者を追加
   */
  addDependent(): void {
    const dependentGroup = this.fb.group({
      lastName: ['', [Validators.required]],
      firstName: ['', [Validators.required]],
      lastNameKana: ['', [Validators.required]],
      firstNameKana: ['', [Validators.required]],
      birthDate: [null, [Validators.required]],
      relationship: ['', [Validators.required]],
      relationshipOther: [''], // その他の場合の詳細入力
      income: [null],
      livingTogether: [true],
      becameDependentDate: [null] // 被扶養者になった年月日
    });
    this.dependentsFormArray.push(dependentGroup);
  }

  /**
   * 氏名を氏と名に分割するヘルパーメソッド
   */
  private splitNameToLastNameFirstName(name: string): { lastName: string, firstName: string } {
    if (!name) {
      return { lastName: '', firstName: '' };
    }
    // スペースで分割（最初のスペースで分割）
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return {
        lastName: parts[0],
        firstName: parts.slice(1).join(' ')
      };
    }
    // 分割できない場合は、最初の1文字を氏、残りを名とする
    if (name.length > 1) {
      return {
        lastName: name.substring(0, 1),
        firstName: name.substring(1)
      };
    }
    return { lastName: name, firstName: '' };
  }

  /**
   * 氏と名を結合して氏名にするヘルパーメソッド
   */
  private combineLastNameFirstNameToName(lastName: string, firstName: string): string {
    return `${lastName} ${firstName}`.trim();
  }

  /**
   * 扶養者を削除
   */
  removeDependent(index: number): void {
    this.dependentsFormArray.removeAt(index);
  }

  /**
   * 他社勤務情報を追加
   */
  addOtherCompany(): void {
    const companyGroup = this.fb.group({
      companyName: ['', [Validators.required]],
      isPrimary: [true]
    });
    this.otherCompanyFormArray.push(companyGroup);
  }

  /**
   * 他社勤務情報を削除
   */
  removeOtherCompany(index: number): void {
    this.otherCompanyFormArray.removeAt(index);
  }

  /**
   * 休職情報を追加
   */
  addLeaveInfo(): void {
    const leaveGroup = this.fb.group({
      type: ['maternity', [Validators.required]],
      startDate: [null, [Validators.required]],
      endDate: [null],
      isApproved: [false]
    });
    this.leaveInfoFormArray.push(leaveGroup);
  }

  /**
   * 休職情報を削除
   */
  removeLeaveInfo(index: number): void {
    this.leaveInfoFormArray.removeAt(index);
  }

  /**
   * ステップ1の送信
   */
  onStep1Submit(): void {
    if (this.basicInfoForm.valid) {
      this.stepper.next();
    }
  }

  /**
   * ステップ2の送信
   */
  onStep2Submit(): void {
    this.stepper.next();
  }

  /**
   * ステップ3の送信
   */
  onStep3Submit(): void {
    this.stepper.next();
  }

  /**
   * ステップ4の送信
   */
  onStep4Submit(): void {
    this.stepper.next();
  }

  /**
   * ステップ5の送信
   */
  onStep5Submit(): void {
    this.stepper.next();
  }

  /**
   * ステップ6の送信（最終保存）
   */
  async onStep6Submit(): Promise<void> {
    if (!this.organizationId) {
      this.snackBar.open('組織情報が取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    if (this.basicInfoForm.invalid) {
      this.snackBar.open('基本情報を正しく入力してください', '閉じる', { duration: 3000 });
      return;
    }

    if (this.addressForm.invalid) {
      this.snackBar.open('住所情報を正しく入力してください', '閉じる', { duration: 3000 });
      return;
    }

    this.isLoading = true;

    try {
      // 基本情報
      const basicInfo = this.basicInfoForm.value;

      // 既存社員チェック
      const existingEmployee = await this.employeeService.checkEmployeeExists(
        basicInfo.employeeNumber,
        basicInfo.email,
        this.organizationId
      );

      if (existingEmployee && existingEmployee.id) {
        // 既存社員が見つかった場合、重複エラーを表示して登録を中止
        this.snackBar.open(`既存の社員データと重複しています（社員番号: ${existingEmployee.employeeNumber} / メールアドレス: ${existingEmployee.email}）`, '閉じる', { duration: 5000 });
        this.isLoading = false;
        return;
      }
      
      // 保険情報（undefinedを除外）
      const insuranceInfo: InsuranceInfo | undefined = this.hasInsuranceInfo() ? {
        ...(this.insuranceInfoForm.value.healthInsuranceNumber && { healthInsuranceNumber: this.insuranceInfoForm.value.healthInsuranceNumber }),
        ...(this.insuranceInfoForm.value.pensionNumber && { pensionNumber: this.insuranceInfoForm.value.pensionNumber }),
        ...(this.insuranceInfoForm.value.myNumber && { myNumber: this.insuranceInfoForm.value.myNumber }),
        ...(this.insuranceInfoForm.value.averageReward !== null && this.insuranceInfoForm.value.averageReward !== undefined && { averageReward: this.insuranceInfoForm.value.averageReward }),
        ...(this.insuranceInfoForm.value.grade !== null && this.insuranceInfoForm.value.grade !== undefined && { grade: this.insuranceInfoForm.value.grade }),
        ...(this.insuranceInfoForm.value.pensionGrade !== null && this.insuranceInfoForm.value.pensionGrade !== undefined && { pensionGrade: this.insuranceInfoForm.value.pensionGrade }),
        ...(this.insuranceInfoForm.value.standardReward && { standardReward: this.insuranceInfoForm.value.standardReward }),
        ...(this.insuranceInfoForm.value.insuranceStartDate && { insuranceStartDate: this.insuranceInfoForm.value.insuranceStartDate })
      } : undefined;

      // 扶養情報（undefinedを除外）
      const dependentInfo: DependentInfo[] | undefined = 
        this.dependentsFormArray.length > 0 
          ? this.dependentsFormArray.value.map((dep: any) => {
              // lastName/firstNameをnameに結合（後方互換性のため）
              const name = this.combineLastNameFirstNameToName(dep.lastName || '', dep.firstName || '');
              const nameKana = this.combineLastNameFirstNameToName(dep.lastNameKana || '', dep.firstNameKana || '');
              return {
                name: name,
                nameKana: nameKana,
                lastName: dep.lastName,
                firstName: dep.firstName,
                lastNameKana: dep.lastNameKana,
                firstNameKana: dep.firstNameKana,
                birthDate: dep.birthDate,
                relationship: dep.relationship,
                ...(dep.relationshipOther && { relationshipOther: dep.relationshipOther }),
                ...(dep.income && { income: dep.income }),
                livingTogether: dep.livingTogether,
                ...(dep.becameDependentDate && { becameDependentDate: dep.becameDependentDate })
              };
            })
          : undefined;

      // 他社勤務情報（undefinedを除外）
      // 他社勤務情報（配列から作成）
      const otherCompanyInfo: OtherCompanyInfo[] | undefined = 
        this.otherCompanyFormArray.length > 0
          ? this.otherCompanyFormArray.controls.map((control: AbstractControl) => {
              const value = (control as FormGroup).value;
              return {
                companyId: crypto.randomUUID(), // UUIDを生成
                companyName: value.companyName || '',
                isPrimary: value.isPrimary ?? true
              };
            })
          : undefined;

      // 住所情報（officialのみ使用）（修正17）
      const address: { official: Address } = {
        official: {
          postalCode: this.addressForm.value.postalCode,
          prefecture: this.addressForm.value.prefecture,
          city: this.addressForm.value.city,
          street: this.addressForm.value.street,
          ...(this.addressForm.value.building && { building: this.addressForm.value.building }),
          ...(this.addressForm.value.kana && { kana: this.addressForm.value.kana })
        }
      };

      // 休職情報（undefinedを除外）
      const leaveInfo: LeaveInfo[] | undefined = 
        this.leaveInfoFormArray.length > 0 
          ? this.leaveInfoFormArray.value.map((leave: any) => ({
              type: leave.type,
              startDate: leave.startDate,
              ...(leave.endDate && { endDate: leave.endDate }),
              isApproved: leave.isApproved !== undefined ? leave.isApproved : false
            }))
          : undefined;

      // 社員データを作成
      const employeeData: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'> = {
        employeeNumber: basicInfo.employeeNumber,
        firstName: basicInfo.firstName,
        lastName: basicInfo.lastName,
        firstNameKana: basicInfo.firstNameKana,
        lastNameKana: basicInfo.lastNameKana,
        email: basicInfo.email,
        departmentId: basicInfo.departmentId,
        joinDate: basicInfo.joinDate,
        birthDate: basicInfo.birthDate,
        status: basicInfo.status,
        retirementDate: basicInfo.retirementDate,
        role: basicInfo.role || 'employee', // 権限（デフォルト: 'employee'）
        dependentInfo,
        insuranceInfo,
        otherCompanyInfo,
        address,
        leaveInfo,
        organizationId: this.organizationId
      };

      await this.employeeService.createEmployee(employeeData);

      this.snackBar.open('社員を登録しました', '閉じる', { duration: 3000 });
      this.router.navigate(['/employees']);
    } catch (error) {
      console.error('社員の登録に失敗しました:', error);
      this.snackBar.open('社員の登録に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 管理者かどうかをチェック
   */
  isAdmin(): boolean {
    const currentUser = this.authService.getCurrentUser();
    return currentUser?.role === 'owner' || currentUser?.role === 'admin';
  }

  /**
   * 保険情報が入力されているかチェック
   */
  private hasInsuranceInfo(): boolean {
    const formValue = this.insuranceInfoForm.value;
    return !!(
      formValue.healthInsuranceNumber ||
      formValue.pensionNumber ||
      formValue.myNumber ||
      formValue.averageReward ||
      formValue.grade ||
      formValue.pensionGrade ||
      formValue.standardReward ||
      formValue.insuranceStartDate
    );
  }

  /**
   * 平均報酬月額から等級と標準報酬月額を自動計算
   */
  async onAverageRewardBlur(): Promise<void> {
    const averageReward = this.insuranceInfoForm.get('averageReward')?.value;
    if (!averageReward || !this.organizationId) {
      return;
    }

    try {
      const rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(this.organizationId);
      const validRateTables = this.filterValidRateTables(rateTables);

      if (validRateTables.length === 0) {
        return;
      }

      const grade = this.getGradeFromAverageReward(averageReward, validRateTables);
      const pensionGrade = this.getPensionGradeFromAverageReward(averageReward, validRateTables);

      if (grade) {
        const rateTable = validRateTables.find(t => t.grade === grade);
        if (rateTable) {
          this.insuranceInfoForm.patchValue({
            grade: grade,
            pensionGrade: pensionGrade || null,
            standardReward: rateTable.standardRewardAmount
          }, { emitEvent: false });
        }
      }
    } catch (error) {
      console.error('等級の自動計算に失敗しました:', error);
    }
  }

  /**
   * 標準報酬月額から等級を自動計算
   */
  async onStandardRewardBlur(): Promise<void> {
    const standardReward = this.insuranceInfoForm.get('standardReward')?.value;
    if (!standardReward || !this.organizationId) {
      return;
    }

    try {
      const rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(this.organizationId);
      // 等級・標準報酬月額適用年月日を優先して使用
      const effectiveDate = this.insuranceInfoForm.get('gradeAndStandardRewardEffectiveDate')?.value || undefined;
      const validRateTables = this.filterValidRateTables(rateTables, effectiveDate);

      if (validRateTables.length === 0) {
        return;
      }

      // standardRewardAmountと一致する等級を検索
      const rateTable = validRateTables.find(t => t.standardRewardAmount === standardReward);
      if (rateTable) {
        const pensionGrade = this.getPensionGradeFromStandardReward(standardReward, validRateTables);
        this.insuranceInfoForm.patchValue({
          grade: rateTable.grade,
          pensionGrade: pensionGrade || null
        }, { emitEvent: false });
      }
    } catch (error) {
      console.error('等級の自動計算に失敗しました:', error);
    }
  }

  /**
   * 等級から標準報酬月額を自動計算
   */
  async onGradeBlur(): Promise<void> {
    const grade = this.insuranceInfoForm.get('grade')?.value;
    if (!grade || !this.organizationId) {
      return;
    }

    try {
      const rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(this.organizationId);
      // 等級・標準報酬月額適用年月日を優先して使用
      const effectiveDate = this.insuranceInfoForm.get('gradeAndStandardRewardEffectiveDate')?.value || undefined;
      const validRateTables = this.filterValidRateTables(rateTables, effectiveDate);

      if (validRateTables.length === 0) {
        return;
      }

      const rateTable = validRateTables.find(t => t.grade === grade);
      if (rateTable) {
        this.insuranceInfoForm.patchValue({
          standardReward: rateTable.standardRewardAmount,
          pensionGrade: rateTable.pensionGrade || null
        }, { emitEvent: false });
      }
    } catch (error) {
      console.error('標準報酬月額の自動計算に失敗しました:', error);
    }
  }

  /**
   * 有効な保険料率テーブルをフィルタリング
   * @param rateTables 等級表の配列
   * @param targetDate 有効日付（指定しない場合は現在日付）
   */
  private filterValidRateTables(rateTables: InsuranceRateTable[], targetDate?: Date): InsuranceRateTable[] {
    const checkDate = targetDate || new Date();
    return rateTables.filter(table => {
      const effectiveFrom = this.convertToDate(table.effectiveFrom);
      const effectiveTo = table.effectiveTo ? this.convertToDate(table.effectiveTo) : null;
      
      if (!effectiveFrom) {
        return false;
      }
      
      const fromDate = new Date(effectiveFrom.getFullYear(), effectiveFrom.getMonth(), 1);
      const toDate = effectiveTo ? new Date(effectiveTo.getFullYear(), effectiveTo.getMonth(), 1) : null;
      const checkDateMonth = new Date(checkDate.getFullYear(), checkDate.getMonth(), 1);
      
      return checkDateMonth >= fromDate && (!toDate || checkDateMonth <= toDate);
    });
  }

  /**
   * FirestoreのTimestampまたはDateをDateオブジェクトに変換
   */
  private convertToDate(value: any): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    if (value && typeof value.toDate === 'function') {
      return value.toDate();
    }
    if (value && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }
    return null;
  }

  /**
   * 平均月額から等級を判定
   */
  private getGradeFromAverageReward(averageReward: number, rateTables: InsuranceRateTable[]): number | null {
    for (const table of rateTables) {
      const minOk = averageReward >= table.minAmount;
      const maxOk = table.maxAmount === 0 || table.maxAmount === null || averageReward <= table.maxAmount;
      if (minOk && maxOk) {
        return table.grade;
      }
    }
    return null;
  }

  /**
   * 平均月額から厚生年金等級を判定
   */
  private getPensionGradeFromAverageReward(averageReward: number, rateTables: InsuranceRateTable[]): number | null {
    for (const table of rateTables) {
      if (table.pensionGrade !== null && table.pensionGrade !== undefined) {
        const minOk = averageReward >= table.minAmount;
        const maxOk = table.maxAmount === 0 || table.maxAmount === null || averageReward <= table.maxAmount;
        if (minOk && maxOk) {
          return table.pensionGrade;
        }
      }
    }
    return null;
  }

  /**
   * 標準報酬月額から厚生年金等級を判定
   */
  private getPensionGradeFromStandardReward(standardReward: number, rateTables: InsuranceRateTable[]): number | null {
    const rateTable = rateTables.find(t => t.standardRewardAmount === standardReward);
    if (rateTable && rateTable.pensionGrade !== null && rateTable.pensionGrade !== undefined) {
      return rateTable.pensionGrade;
    }
    return null;
  }

  /**
   * 住所情報が入力されているかチェック
   */
  private hasAddressInfo(): boolean {
    const formValue = this.addressForm.value;
    return !!(
      formValue.postalCode ||
      formValue.prefecture ||
      formValue.city ||
      formValue.street ||
      formValue.building
    );
  }

  /**
   * キャンセル
   */
  cancel(): void {
    this.router.navigate(['/employees']);
  }
}

