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
import { Employee, DependentInfo, InsuranceInfo, OtherCompanyInfo, Address } from '../../../core/models/employee.model';
import { Department } from '../../../core/models/department.model';

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

  // ステップ5: 住所情報
  addressForm: FormGroup;

  departments: Department[] = [];
  organizationId: string | null = null;
  isLoading = false;

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
      role: ['employee', [Validators.required]]
    });

    // ステップ2: 保険情報
    this.insuranceInfoForm = this.fb.group({
      healthInsuranceNumber: [''],
      pensionNumber: [''],
      myNumber: [''],
      standardReward: [null],
      insuranceStartDate: [null]
    });

    // ステップ3: 扶養情報
    this.dependentInfoForm = this.fb.group({
      dependents: this.fb.array([])
    });
    this.dependentsFormArray = this.dependentInfoForm.get('dependents') as FormArray;

    // ステップ4: 他社勤務情報
    this.otherCompanyForm = this.fb.group({
      isOtherCompany: [false],
      isPrimary: [true],
      companyName: ['']
    });

    // ステップ5: 住所情報
    this.addressForm = this.fb.group({
      postalCode: ['', [Validators.required]],
      prefecture: ['', [Validators.required]],
      city: ['', [Validators.required]],
      street: ['', [Validators.required]],
      building: [''] // 建物名・部屋番号は任意
    });
  }

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
      name: ['', [Validators.required]],
      nameKana: ['', [Validators.required]],
      birthDate: [null, [Validators.required]],
      relationship: ['', [Validators.required]],
      income: [null],
      livingTogether: [true]
    });
    this.dependentsFormArray.push(dependentGroup);
  }

  /**
   * 扶養者を削除
   */
  removeDependent(index: number): void {
    this.dependentsFormArray.removeAt(index);
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
   * ステップ5の送信（最終保存）
   */
  async onStep5Submit(): Promise<void> {
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
        ...(this.insuranceInfoForm.value.standardReward && { standardReward: this.insuranceInfoForm.value.standardReward }),
        ...(this.insuranceInfoForm.value.insuranceStartDate && { insuranceStartDate: this.insuranceInfoForm.value.insuranceStartDate })
      } : undefined;

      // 扶養情報（undefinedを除外）
      const dependentInfo: DependentInfo[] | undefined = 
        this.dependentsFormArray.length > 0 
          ? this.dependentsFormArray.value.map((dep: any) => ({
              name: dep.name,
              nameKana: dep.nameKana,
              birthDate: dep.birthDate,
              relationship: dep.relationship,
              ...(dep.income && { income: dep.income }),
              livingTogether: dep.livingTogether
            }))
          : undefined;

      // 他社勤務情報（undefinedを除外）
      const otherCompanyInfo: OtherCompanyInfo | undefined = 
        this.otherCompanyForm.value.isOtherCompany 
          ? {
              isOtherCompany: true,
              isPrimary: this.otherCompanyForm.value.isPrimary,
              ...(this.otherCompanyForm.value.companyName && { companyName: this.otherCompanyForm.value.companyName })
            }
          : undefined;

      // 住所情報（officialのみ使用）
      const address: { official: Address } = {
        official: {
          postalCode: this.addressForm.value.postalCode,
          prefecture: this.addressForm.value.prefecture,
          city: this.addressForm.value.city,
          street: this.addressForm.value.street,
          ...(this.addressForm.value.building && { building: this.addressForm.value.building })
        }
      };

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
        role: basicInfo.role || 'employee', // 権限（デフォルト: 'employee'）
        dependentInfo,
        insuranceInfo,
        otherCompanyInfo,
        address,
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
      formValue.standardReward ||
      formValue.insuranceStartDate
    );
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

