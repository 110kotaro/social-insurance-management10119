import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
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
  selector: 'app-employee-edit',
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
  templateUrl: './employee-edit.component.html',
  styleUrl: './employee-edit.component.css'
})
export class EmployeeEditComponent implements OnInit {
  @ViewChild('stepper') stepper!: MatStepper;

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
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
  employeeId: string | null = null;
  employee: Employee | null = null;
  isLoading = false;
  isDataLoading = true;

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
      averageReward: [null],
      grade: [null],
      pensionGrade: [null],
      standardReward: [null],
      insuranceStartDate: [null],
      gradeAndStandardRewardEffectiveDate: [null] // 等級・標準報酬月額適用年月日
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
      building: [''] // 建物名・部屋番号は任意
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
    this.employeeId = this.route.snapshot.paramMap.get('id');

    if (!this.employeeId) {
      this.snackBar.open('社員IDが取得できませんでした', '閉じる', { duration: 3000 });
      this.router.navigate(['/employees']);
      return;
    }

    this.loadDepartments();
    this.loadEmployee();
    this.setupAutoCalculation();
  }

  /**
   * 自動計算の設定
   */
  private setupAutoCalculation(): void {
    // blurイベントはHTMLで設定
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
      const validRateTables = this.filterValidRateTables(rateTables);

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
      const validRateTables = this.filterValidRateTables(rateTables);

      if (validRateTables.length === 0) {
        return;
      }

      const rateTable = validRateTables.find(t => t.grade === grade);
      if (rateTable) {
        this.insuranceInfoForm.patchValue({
          standardReward: rateTable.standardRewardAmount
        }, { emitEvent: false });
      }
    } catch (error) {
      console.error('標準報酬月額の自動計算に失敗しました:', error);
    }
  }

  /**
   * 有効な保険料率テーブルをフィルタリング
   */
  private filterValidRateTables(rateTables: InsuranceRateTable[]): InsuranceRateTable[] {
    const now = new Date();
    return rateTables.filter(table => {
      const effectiveFrom = this.convertToDate(table.effectiveFrom);
      const effectiveTo = table.effectiveTo ? this.convertToDate(table.effectiveTo) : null;
      
      if (!effectiveFrom) {
        return false;
      }
      
      const fromDate = new Date(effectiveFrom.getFullYear(), effectiveFrom.getMonth(), 1);
      const toDate = effectiveTo ? new Date(effectiveTo.getFullYear(), effectiveTo.getMonth(), 1) : null;
      
      return now >= fromDate && (!toDate || now <= toDate);
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
   * 社員データを読み込む
   */
  private async loadEmployee(): Promise<void> {
    if (!this.employeeId) return;

    try {
      this.employee = await this.employeeService.getEmployee(this.employeeId);
      
      if (!this.employee) {
        this.snackBar.open('社員データが見つかりませんでした', '閉じる', { duration: 3000 });
        this.router.navigate(['/employees']);
        return;
      }

      // フォームに既存データを設定
      this.populateForms();
      this.isDataLoading = false;
    } catch (error) {
      console.error('社員データの読み込みに失敗しました:', error);
      this.snackBar.open('社員データの読み込みに失敗しました', '閉じる', { duration: 3000 });
      this.router.navigate(['/employees']);
    }
  }

  /**
   * フォームに既存データを設定
   */
  private populateForms(): void {
    if (!this.employee) return;

    // 基本情報
    const joinDate = this.employee.joinDate instanceof Date 
      ? this.employee.joinDate 
      : (this.employee.joinDate?.toDate ? this.employee.joinDate.toDate() : new Date());
    const birthDate = this.employee.birthDate instanceof Date 
      ? this.employee.birthDate 
      : (this.employee.birthDate?.toDate ? this.employee.birthDate.toDate() : null);

    this.basicInfoForm.patchValue({
      employeeNumber: this.employee.employeeNumber,
      firstName: this.employee.firstName,
      lastName: this.employee.lastName,
      firstNameKana: this.employee.firstNameKana,
      lastNameKana: this.employee.lastNameKana,
      email: this.employee.email,
      departmentId: this.employee.departmentId,
      joinDate: joinDate,
      birthDate: birthDate,
      status: this.employee.status,
      role: this.employee.role || 'employee'
    });

    // 保険情報
    if (this.employee.insuranceInfo) {
      const insuranceStartDate = this.employee.insuranceInfo.insuranceStartDate instanceof Date
        ? this.employee.insuranceInfo.insuranceStartDate
        : (this.employee.insuranceInfo.insuranceStartDate?.toDate 
          ? this.employee.insuranceInfo.insuranceStartDate.toDate() 
          : null);
      
      const gradeAndStandardRewardEffectiveDate = this.employee.insuranceInfo.gradeAndStandardRewardEffectiveDate instanceof Date
        ? this.employee.insuranceInfo.gradeAndStandardRewardEffectiveDate
        : (this.employee.insuranceInfo.gradeAndStandardRewardEffectiveDate?.toDate 
          ? this.employee.insuranceInfo.gradeAndStandardRewardEffectiveDate.toDate() 
          : null);

      this.insuranceInfoForm.patchValue({
        healthInsuranceNumber: this.employee.insuranceInfo.healthInsuranceNumber || '',
        pensionNumber: this.employee.insuranceInfo.pensionNumber || '',
        myNumber: this.employee.insuranceInfo.myNumber || '',
        averageReward: this.employee.insuranceInfo.averageReward || null,
        grade: this.employee.insuranceInfo.grade || null,
        pensionGrade: this.employee.insuranceInfo.pensionGrade || null,
        standardReward: this.employee.insuranceInfo.standardReward || null,
        insuranceStartDate: insuranceStartDate,
        gradeAndStandardRewardEffectiveDate: gradeAndStandardRewardEffectiveDate
      });
    }

    // 扶養情報
    if (this.employee.dependentInfo && this.employee.dependentInfo.length > 0) {
      this.dependentsFormArray.clear();
      this.employee.dependentInfo.forEach(dep => {
        const birthDate = dep.birthDate instanceof Date
          ? dep.birthDate
          : (dep.birthDate?.toDate ? dep.birthDate.toDate() : null);
        
        const becameDependentDate = dep.becameDependentDate instanceof Date
          ? dep.becameDependentDate
          : (dep.becameDependentDate?.toDate ? dep.becameDependentDate.toDate() : null);

        const dependentGroup = this.fb.group({
          name: [dep.name, [Validators.required]],
          nameKana: [dep.nameKana, [Validators.required]],
          birthDate: [birthDate, [Validators.required]],
          relationship: [dep.relationship, [Validators.required]],
          income: [dep.income || null],
          livingTogether: [dep.livingTogether !== undefined ? dep.livingTogether : true],
          becameDependentDate: [becameDependentDate]
        });
        this.dependentsFormArray.push(dependentGroup);
      });
    }

    // 他社勤務情報（配列の最初の要素を使用）
    if (this.employee.otherCompanyInfo && this.employee.otherCompanyInfo.length > 0) {
      const firstCompany = this.employee.otherCompanyInfo[0];
      this.otherCompanyForm.patchValue({
        isOtherCompany: true,
        isPrimary: firstCompany.isPrimary !== undefined ? firstCompany.isPrimary : true,
        companyName: firstCompany.companyName || ''
      });
    }

    // 住所情報（officialのみ使用）
    // if (this.employee.address?.internal) {
    //   this.addressForm.patchValue({
    //     postalCode: this.employee.address.internal.postalCode || '',
    //     prefecture: this.employee.address.internal.prefecture || '',
    //     city: this.employee.address.internal.city || '',
    //     street: this.employee.address.internal.street || '',
    //     building: this.employee.address.internal.building || ''
    //   });
    // }
    if (this.employee.address?.official) {
      this.addressForm.patchValue({
        postalCode: this.employee.address.official.postalCode || '',
        prefecture: this.employee.address.official.prefecture || '',
        city: this.employee.address.official.city || '',
        street: this.employee.address.official.street || '',
        building: this.employee.address.official.building || ''
      });
    }

    // 休職情報
    if (this.employee.leaveInfo && this.employee.leaveInfo.length > 0) {
      this.leaveInfoFormArray.clear();
      this.employee.leaveInfo.forEach(leave => {
        const startDate = leave.startDate instanceof Date
          ? leave.startDate
          : (leave.startDate?.toDate ? leave.startDate.toDate() : null);
        
        const endDate = leave.endDate instanceof Date
          ? leave.endDate
          : (leave.endDate?.toDate ? leave.endDate.toDate() : null);

        const leaveGroup = this.fb.group({
          type: [leave.type || 'maternity', [Validators.required]],
          startDate: [startDate, [Validators.required]],
          endDate: [endDate],
          isApproved: [leave.isApproved !== undefined ? leave.isApproved : false]
        });
        this.leaveInfoFormArray.push(leaveGroup);
      });
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
      livingTogether: [true],
      becameDependentDate: [null] // 被扶養者になった年月日
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
   * 他社勤務情報を追加
   */
  addOtherCompany(): void {
    const companyGroup = this.fb.group({
      companyName: ['', [Validators.required]],
      isPrimary: [true],
      companyId: [crypto.randomUUID()] // 新規IDを生成
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
   * ステップ6の送信（最終更新）
   */
  async onStep6Submit(): Promise<void> {
    if (!this.organizationId || !this.employeeId) {
      this.snackBar.open('組織情報または社員IDが取得できませんでした', '閉じる', { duration: 3000 });
      return;
    }

    if (this.basicInfoForm.invalid) {
      this.snackBar.open('基本情報を正しく入力してください', '閉じる', { duration: 3000 });
      return;
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

      // 既存社員チェック（自分自身を除外）
      const existingEmployee = await this.employeeService.checkEmployeeExists(
        basicInfo.employeeNumber,
        basicInfo.email,
        this.organizationId
      );

      if (existingEmployee && existingEmployee.id && existingEmployee.id !== this.employeeId) {
        // 自分以外の既存社員が見つかった場合、重複エラーを表示して更新を中止
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
        ...(this.insuranceInfoForm.value.insuranceStartDate && { insuranceStartDate: this.insuranceInfoForm.value.insuranceStartDate }),
        ...(this.insuranceInfoForm.value.gradeAndStandardRewardEffectiveDate && { gradeAndStandardRewardEffectiveDate: this.insuranceInfoForm.value.gradeAndStandardRewardEffectiveDate })
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
              livingTogether: dep.livingTogether,
              ...(dep.becameDependentDate && { becameDependentDate: dep.becameDependentDate })
            }))
          : undefined;

      // 他社勤務情報（配列から作成）
      const otherCompanyInfo: OtherCompanyInfo[] | undefined = 
        this.otherCompanyFormArray.length > 0
          ? this.otherCompanyFormArray.controls.map((control: AbstractControl) => {
              const value = (control as FormGroup).value;
              return {
                companyId: value.companyId || crypto.randomUUID(), // 既存のIDがあれば使用、なければ新規生成
                companyName: value.companyName || '',
                isPrimary: value.isPrimary ?? true
              };
            })
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

      // 社員データを更新
      const employeeData: Partial<Employee> = {
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
        role: basicInfo.role || 'employee',
        dependentInfo,
        insuranceInfo,
        otherCompanyInfo,
        address,
        leaveInfo
      };

      await this.employeeService.updateEmployee(this.employeeId, employeeData);

      this.snackBar.open('社員情報を更新しました', '閉じる', { duration: 3000 });
      this.router.navigate(['/employees', this.employeeId]);
    } catch (error) {
      console.error('社員情報の更新に失敗しました:', error);
      this.snackBar.open('社員情報の更新に失敗しました', '閉じる', { duration: 3000 });
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
   * キャンセル
   */
  cancel(): void {
    if (this.employeeId) {
      this.router.navigate(['/employees', this.employeeId]);
    } else {
      this.router.navigate(['/employees']);
    }
  }
}

