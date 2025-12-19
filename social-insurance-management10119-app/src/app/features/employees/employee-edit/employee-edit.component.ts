import { Component, inject, OnInit, OnDestroy, ViewChild } from '@angular/core';
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
import { MatListModule } from '@angular/material/list';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { EmployeeService } from '../../../core/services/employee.service';
import { ConfirmDialogComponent } from '../../setup/setup-wizard/confirm-dialog.component';
import { DepartmentService } from '../../../core/services/department.service';
import { AuthService } from '../../../core/auth/auth.service';
import { InsuranceRateTableService } from '../../../core/services/insurance-rate-table.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { Employee, DependentInfo, InsuranceInfo, OtherCompanyInfo, Address, LeaveInfo, EmployeeChangeHistory, FileAttachment } from '../../../core/models/employee.model';
import { Department } from '../../../core/models/department.model';
import { InsuranceRateTable } from '../../../core/models/insurance-rate-table.model';
import { Organization } from '../../../core/models/organization.model';

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
    MatSnackBarModule,
    MatListModule,
    MatDialogModule
  ],
  templateUrl: './employee-edit.component.html',
  styleUrl: './employee-edit.component.css'
})
export class EmployeeEditComponent implements OnInit, OnDestroy {
  @ViewChild('stepper') stepper!: MatStepper;

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private employeeService = inject(EmployeeService);
  private departmentService = inject(DepartmentService);
  private authService = inject(AuthService);
  private insuranceRateTableService = inject(InsuranceRateTableService);
  private organizationService = inject(OrganizationService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

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
  organization: Organization | null = null;
  isLoading = false;
  isDataLoading = true;

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
  
  // ファイル添付（修正17）
  attachments: File[] = [];
  existingAttachments: FileAttachment[] = [];
  deletedAttachmentIndices: number[] = [];
  filePreviewUrls: Map<string, string> = new Map(); // ファイルプレビュー用URL（メモリリーク防止のため）

  // Storageルールで許可されているファイル形式（デフォルト）
  private readonly DEFAULT_ALLOWED_FORMATS = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'xlsx', 'xls', 'docx', 'doc'];
  private readonly DEFAULT_MAX_FILE_SIZE_MB = 50; // デフォルトの最大ファイルサイズ（MB）

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

      // 既存のファイル添付を読み込む（修正17）
      this.existingAttachments = this.employee.attachments || [];
      this.deletedAttachmentIndices = [];

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
    const retirementDate = this.employee.retirementDate instanceof Date 
      ? this.employee.retirementDate 
      : (this.employee.retirementDate?.toDate ? this.employee.retirementDate.toDate() : null);

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
      retirementDate: retirementDate,
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

    // 入社日変更時に保険適用開始日を自動設定（修正17）
    this.basicInfoForm.get('joinDate')?.valueChanges.subscribe(joinDate => {
      if (joinDate && !this.insuranceInfoForm.get('insuranceStartDate')?.value) {
        // 保険適用開始日が未設定の場合のみ自動設定
        this.insuranceInfoForm.patchValue({ insuranceStartDate: joinDate }, { emitEvent: false });
      }
    });

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

        // nameからlastName/firstNameに分割（既存データの後方互換性対応）
        const { lastName, firstName } = this.splitNameToLastNameFirstName(
          dep.lastName && dep.firstName ? `${dep.lastName} ${dep.firstName}` : dep.name
        );
        const { lastName: lastNameKana, firstName: firstNameKana } = this.splitNameToLastNameFirstName(
          dep.lastNameKana && dep.firstNameKana ? `${dep.lastNameKana} ${dep.firstNameKana}` : dep.nameKana
        );

        const dependentGroup = this.fb.group({
          lastName: [lastName, [Validators.required]],
          firstName: [firstName, [Validators.required]],
          lastNameKana: [lastNameKana, [Validators.required]],
          firstNameKana: [firstNameKana, [Validators.required]],
          birthDate: [birthDate, [Validators.required]],
          relationship: [dep.relationship, [Validators.required]],
          relationshipOther: [dep.relationshipOther || ''], // その他の場合の詳細入力
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
        building: this.employee.address.official.building || '',
        kana: this.employee.address.official.kana || '' // 住所カナ（修正17）
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
   * 扶養者を削除
   */
  removeDependent(index: number): void {
    this.dependentsFormArray.removeAt(index);
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
          ...(this.addressForm.value.building && { building: this.addressForm.value.building }),
          ...(this.addressForm.value.kana && { kana: this.addressForm.value.kana }) // 住所カナ（修正17）
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
        retirementDate: basicInfo.retirementDate,
        role: basicInfo.role || 'employee',
        dependentInfo,
        insuranceInfo,
        otherCompanyInfo,
        address,
        leaveInfo
      };

      // 変更履歴を記録（メール認証後の編集のみ）
      const changes: EmployeeChangeHistory['changes'] = [];
      const currentUser = this.authService.getCurrentUser();
      const changedBy = currentUser?.uid || '';
      const isEmailVerified = this.employee?.emailVerified === true; // メール認証済みかどうか

      if (this.employee && isEmailVerified) {
        // 基本情報の変更をチェック
        if (this.employee.firstName !== employeeData.firstName) {
          changes.push({ field: 'firstName', before: this.employee.firstName, after: employeeData.firstName });
        }
        if (this.employee.lastName !== employeeData.lastName) {
          changes.push({ field: 'lastName', before: this.employee.lastName, after: employeeData.lastName });
        }
        if (this.employee.firstNameKana !== employeeData.firstNameKana) {
          changes.push({ field: 'firstNameKana', before: this.employee.firstNameKana, after: employeeData.firstNameKana });
        }
        if (this.employee.lastNameKana !== employeeData.lastNameKana) {
          changes.push({ field: 'lastNameKana', before: this.employee.lastNameKana, after: employeeData.lastNameKana });
        }
        if (this.employee.email !== employeeData.email) {
          changes.push({ field: 'email', before: this.employee.email, after: employeeData.email });
        }
        if (this.employee.departmentId !== employeeData.departmentId) {
          changes.push({ field: 'departmentId', before: this.employee.departmentId, after: employeeData.departmentId });
        }
        if (this.employee.status !== employeeData.status) {
          changes.push({ field: 'status', before: this.employee.status, after: employeeData.status });
        }
        if (this.employee.role !== employeeData.role) {
          changes.push({ field: 'role', before: this.employee.role, after: employeeData.role });
        }

        // 日付の変更をチェック（TimestampとDateの比較）
        const previousJoinDate = this.employee.joinDate instanceof Date 
          ? this.employee.joinDate 
          : (this.employee.joinDate ? new Date((this.employee.joinDate as any).seconds * 1000) : null);
        const newJoinDate = employeeData.joinDate instanceof Date 
          ? employeeData.joinDate 
          : (employeeData.joinDate ? new Date((employeeData.joinDate as any).seconds * 1000) : null);
        if (previousJoinDate?.getTime() !== newJoinDate?.getTime()) {
          changes.push({ field: 'joinDate', before: previousJoinDate, after: newJoinDate });
        }

        const previousBirthDate = this.employee.birthDate instanceof Date 
          ? this.employee.birthDate 
          : (this.employee.birthDate ? new Date((this.employee.birthDate as any).seconds * 1000) : null);
        const newBirthDate = employeeData.birthDate instanceof Date 
          ? employeeData.birthDate 
          : (employeeData.birthDate ? new Date((employeeData.birthDate as any).seconds * 1000) : null);
        if (previousBirthDate?.getTime() !== newBirthDate?.getTime()) {
          changes.push({ field: 'birthDate', before: previousBirthDate, after: newBirthDate });
        }

        // 保険情報の変更をチェック（各フィールドを個別にチェック）
        const oldInsuranceInfo = this.employee.insuranceInfo || {};
        const newInsuranceInfo = insuranceInfo || {};
        
        // healthInsuranceNumber
        if (oldInsuranceInfo.healthInsuranceNumber !== newInsuranceInfo.healthInsuranceNumber) {
          changes.push({ 
            field: 'insuranceInfo.healthInsuranceNumber', 
            before: oldInsuranceInfo.healthInsuranceNumber || null, 
            after: newInsuranceInfo.healthInsuranceNumber || null 
          });
        }
        
        // pensionNumber
        if (oldInsuranceInfo.pensionNumber !== newInsuranceInfo.pensionNumber) {
          changes.push({ 
            field: 'insuranceInfo.pensionNumber', 
            before: oldInsuranceInfo.pensionNumber || null, 
            after: newInsuranceInfo.pensionNumber || null 
          });
        }
        
        // myNumber
        if (oldInsuranceInfo.myNumber !== newInsuranceInfo.myNumber) {
          changes.push({ 
            field: 'insuranceInfo.myNumber', 
            before: oldInsuranceInfo.myNumber || null, 
            after: newInsuranceInfo.myNumber || null 
          });
        }
        
        // averageReward
        if (oldInsuranceInfo.averageReward !== newInsuranceInfo.averageReward) {
          changes.push({ 
            field: 'insuranceInfo.averageReward', 
            before: oldInsuranceInfo.averageReward ?? null, 
            after: newInsuranceInfo.averageReward ?? null 
          });
        }
        
        // grade
        if (oldInsuranceInfo.grade !== newInsuranceInfo.grade) {
          changes.push({ 
            field: 'insuranceInfo.grade', 
            before: oldInsuranceInfo.grade ?? null, 
            after: newInsuranceInfo.grade ?? null 
          });
        }
        
        // pensionGrade
        if (oldInsuranceInfo.pensionGrade !== newInsuranceInfo.pensionGrade) {
          changes.push({ 
            field: 'insuranceInfo.pensionGrade', 
            before: oldInsuranceInfo.pensionGrade ?? null, 
            after: newInsuranceInfo.pensionGrade ?? null 
          });
        }
        
        // standardReward
        if (oldInsuranceInfo.standardReward !== newInsuranceInfo.standardReward) {
          changes.push({ 
            field: 'insuranceInfo.standardReward', 
            before: oldInsuranceInfo.standardReward ?? null, 
            after: newInsuranceInfo.standardReward ?? null 
          });
        }
        
        // insuranceStartDate（日付の比較）
        const previousInsuranceStartDate = oldInsuranceInfo.insuranceStartDate instanceof Date 
          ? oldInsuranceInfo.insuranceStartDate 
          : (oldInsuranceInfo.insuranceStartDate ? new Date((oldInsuranceInfo.insuranceStartDate as any).seconds * 1000) : null);
        const newInsuranceStartDate = newInsuranceInfo.insuranceStartDate instanceof Date 
          ? newInsuranceInfo.insuranceStartDate 
          : (newInsuranceInfo.insuranceStartDate ? new Date((newInsuranceInfo.insuranceStartDate as any).seconds * 1000) : null);
        if (previousInsuranceStartDate?.getTime() !== newInsuranceStartDate?.getTime()) {
          changes.push({ 
            field: 'insuranceInfo.insuranceStartDate', 
            before: previousInsuranceStartDate, 
            after: newInsuranceStartDate 
          });
        }
        
        // gradeAndStandardRewardEffectiveDate（日付の比較）
        const previousGradeEffectiveDate = oldInsuranceInfo.gradeAndStandardRewardEffectiveDate instanceof Date 
          ? oldInsuranceInfo.gradeAndStandardRewardEffectiveDate 
          : (oldInsuranceInfo.gradeAndStandardRewardEffectiveDate ? new Date((oldInsuranceInfo.gradeAndStandardRewardEffectiveDate as any).seconds * 1000) : null);
        const newGradeEffectiveDate = newInsuranceInfo.gradeAndStandardRewardEffectiveDate instanceof Date 
          ? newInsuranceInfo.gradeAndStandardRewardEffectiveDate 
          : (newInsuranceInfo.gradeAndStandardRewardEffectiveDate ? new Date((newInsuranceInfo.gradeAndStandardRewardEffectiveDate as any).seconds * 1000) : null);
        if (previousGradeEffectiveDate?.getTime() !== newGradeEffectiveDate?.getTime()) {
          changes.push({ 
            field: 'insuranceInfo.gradeAndStandardRewardEffectiveDate', 
            before: previousGradeEffectiveDate, 
            after: newGradeEffectiveDate 
          });
        }

        // 住所情報の変更をチェック
        if (JSON.stringify(this.employee.address?.official || {}) !== JSON.stringify(address?.official || {})) {
          changes.push({ field: 'address.official', before: this.employee.address?.official, after: address?.official });
        }

        // 扶養情報の変更をチェック
        if (JSON.stringify(this.employee.dependentInfo || []) !== JSON.stringify(dependentInfo || [])) {
          changes.push({ field: 'dependentInfo', before: this.employee.dependentInfo, after: dependentInfo });
        }

        // 他社勤務情報の変更をチェック
        if (JSON.stringify(this.employee.otherCompanyInfo || []) !== JSON.stringify(otherCompanyInfo || [])) {
          changes.push({ field: 'otherCompanyInfo', before: this.employee.otherCompanyInfo, after: otherCompanyInfo });
        }

        // 休職情報の変更をチェック
        if (JSON.stringify(this.employee.leaveInfo || []) !== JSON.stringify(leaveInfo || [])) {
          changes.push({ field: 'leaveInfo', before: this.employee.leaveInfo, after: leaveInfo });
        }
      }

      // ファイル添付を処理（修正17）
      const uploadedAttachments: FileAttachment[] = [];
      const addedFiles: FileAttachment[] = []; // 追加されたファイル
      const deletedFiles: FileAttachment[] = []; // 削除されたファイル
      
      // 既存ファイルから削除されていないものを追加
      if (this.existingAttachments.length > 0) {
        for (let i = 0; i < this.existingAttachments.length; i++) {
          if (!this.deletedAttachmentIndices.includes(i)) {
            uploadedAttachments.push(this.existingAttachments[i]);
          } else {
            // 削除されたファイルを記録（メール認証後の場合のみ）
            if (isEmailVerified) {
              deletedFiles.push(this.existingAttachments[i]);
            }
            // 削除されたファイルをStorageから削除
            if (this.existingAttachments[i].fileUrl) {
              await this.employeeService.deleteEmployeeFile(this.existingAttachments[i].fileUrl);
            }
          }
        }
      }
      
      // 新規ファイルをアップロード
      if (this.attachments.length > 0 && this.organizationId && this.employeeId) {
        const currentUser = this.authService.getCurrentUser();
        const uploadedBy = currentUser?.uid || '';
        
        for (const file of this.attachments) {
          try {
          const fileUrl = await this.employeeService.uploadEmployeeFile(file, this.organizationId, this.employeeId);
          const newAttachment: FileAttachment = {
            id: crypto.randomUUID(),
            fileName: file.name,
            fileUrl: fileUrl,
            fileSize: file.size,
            mimeType: file.type,
            uploadedAt: new Date(),
            uploadedBy: uploadedBy
          };
          uploadedAttachments.push(newAttachment);
          // 追加されたファイルを記録（メール認証後の場合のみ）
          if (isEmailVerified) {
            addedFiles.push(newAttachment);
          }
          } catch (error: any) {
            console.error(`ファイルアップロードエラー (${file.name}):`, error);
            let errorMessage = `ファイル「${file.name}」のアップロードに失敗しました`;
            if (error.code === 'storage/unauthorized' || error.message?.includes('Permission denied')) {
              errorMessage = `ファイル「${file.name}」は許可されていない形式です`;
            } else if (error.code === 'storage/quota-exceeded') {
              errorMessage = `ファイル「${file.name}」のサイズが大きすぎます`;
            }
            this.snackBar.open(errorMessage, '閉じる', { duration: 5000 });
          }
        }
      }

      // ファイル添付をemployeeDataに追加
      if (uploadedAttachments.length > 0) {
        employeeData.attachments = uploadedAttachments;
      } else if (this.existingAttachments.length > 0 && this.deletedAttachmentIndices.length === this.existingAttachments.length) {
        // すべてのファイルが削除された場合
        employeeData.attachments = [];
      }

      // 添付ファイルの増減を変更履歴に記録（メール認証後の場合のみ）
      if (isEmailVerified && this.employee) {
        // 追加されたファイルを記録
        for (const addedFile of addedFiles) {
          changes.push({ 
            field: 'attachments', 
            before: null, 
            after: { action: 'added', fileName: addedFile.fileName, fileUrl: addedFile.fileUrl } 
          });
        }
        // 削除されたファイルを記録
        for (const deletedFile of deletedFiles) {
          changes.push({ 
            field: 'attachments', 
            before: { action: 'deleted', fileName: deletedFile.fileName, fileUrl: deletedFile.fileUrl }, 
            after: null 
          });
        }
      }

      // メール認証後の編集で変更がある場合、確認ダイアログを表示
      if (isEmailVerified && changes.length > 0) {
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
          width: '400px',
          data: {
            title: '変更履歴の記録',
            message: 'この変更は変更履歴に記録されます。\n保存しますか？',
            confirmText: '保存する',
            cancelText: 'キャンセル'
          }
        });

        const confirmed = await dialogRef.afterClosed().toPromise();
        if (!confirmed) {
          this.isLoading = false;
          return; // キャンセルされた場合は保存しない
        }
      }

      // 変更があった場合のみ変更履歴を追加（メール認証後の場合のみ）
      if (isEmailVerified && changes.length > 0 && this.employee) {
        const changeHistory: EmployeeChangeHistory = {
          applicationId: 'manual_edit', // 手動編集の場合は特別なID
          applicationName: '手動編集',
          changedAt: new Date(),
          changedBy: changedBy,
          changes: changes
        };

        const updatedChangeHistory = [...(this.employee.changeHistory || []), changeHistory];
        employeeData.changeHistory = updatedChangeHistory;
      }

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
   * ファイル選択（修正17）
   */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const files = Array.from(input.files);
    const validFiles: File[] = [];
    const errors: string[] = [];

    // 組織のドキュメント設定を取得
    const allowedFormats = this.getAllowedFormats();
    const maxFileSizeMB = this.getMaxFileSizeMB();

    // 既存のファイル名のセットを作成（重複チェック用）
    // 新規ファイル（attachments）と既存ファイル（existingAttachments）の両方をチェック
    const existingFileNames = new Set([
      ...this.attachments.map(f => f.name),
      ...(this.existingAttachments || []).map(a => a.fileName)
    ]);

    for (const file of files) {
      // ファイル拡張子を取得
      const fileExtension = this.getFileExtension(file.name);
      
      // ファイル形式チェック
      if (!allowedFormats.includes(fileExtension.toLowerCase())) {
        errors.push(`${file.name}: 許可されていないファイル形式です（許可形式: ${allowedFormats.join(', ')}）`);
        continue;
      }

      // ファイルサイズチェック
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > maxFileSizeMB) {
        errors.push(`${file.name}: ファイルサイズが大きすぎます（最大: ${maxFileSizeMB}MB）`);
        continue;
      }

      // 重複チェック
      if (existingFileNames.has(file.name)) {
        // 確認ダイアログを表示
        const dialogRef = this.dialog.open(ConfirmDialogComponent, {
          width: '400px',
          data: {
            title: 'ファイル名の重複',
            message: `「${file.name}」という名前のファイルが既に存在します。\n上書きしますか？`,
            confirmText: '上書き',
            cancelText: 'キャンセル'
          }
        });

        const result = await dialogRef.afterClosed().toPromise();
        
        if (result === true) {
          // OK: 既存のファイルを削除して新しいファイルを追加（上書き）
          // 新規ファイル（attachments）から削除
          const index = this.attachments.findIndex(f => f.name === file.name);
          if (index >= 0) {
            this.attachments.splice(index, 1);
          }
          // 既存ファイル（existingAttachments）の場合は削除インデックスに追加
          const existingIndex = this.existingAttachments.findIndex(a => a.fileName === file.name);
          if (existingIndex >= 0 && !this.deletedAttachmentIndices.includes(existingIndex)) {
            this.deletedAttachmentIndices.push(existingIndex);
          }
          validFiles.push(file);
        } else {
          // キャンセル: 新しいファイルを追加しない（画面遷移なし）
          continue;
        }
      } else {
        // 重複なし: そのまま追加
        validFiles.push(file);
        existingFileNames.add(file.name); // セットに追加（同じ選択内での重複も防ぐ）
      }
    }

    // エラーメッセージを表示
    if (errors.length > 0) {
      this.snackBar.open(errors.join('\n'), '閉じる', { duration: 5000 });
    }

    // 既存のファイルに新しいファイルを追加（置き換えではなく追加）
    this.attachments = [...this.attachments, ...validFiles];

    // input要素のvalueをリセット（同じファイルを再度選択できるようにする）
    input.value = '';
  }

  /**
   * ファイル拡張子を取得
   */
  private getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot >= 0 ? fileName.substring(lastDot + 1) : '';
  }

  /**
   * 許可されているファイル形式を取得
   */
  private getAllowedFormats(): string[] {
    if (!this.organization) {
      return this.DEFAULT_ALLOWED_FORMATS;
    }

    // 組織のドキュメント設定を取得
    const documentSettings = this.organization.documentSettings;

    // 設定がある場合
    if (documentSettings?.allowedFormats && documentSettings.allowedFormats.length > 0) {
      return documentSettings.allowedFormats;
    }

    // 設定がない場合（空配列または未設定）は、Storageルールで許可されている形式をデフォルトとして使用
    return this.DEFAULT_ALLOWED_FORMATS;
  }

  /**
   * 最大ファイルサイズ（MB）を取得
   */
  private getMaxFileSizeMB(): number {
    if (!this.organization) {
      return this.DEFAULT_MAX_FILE_SIZE_MB;
    }

    // 組織のドキュメント設定を取得
    const documentSettings = this.organization.documentSettings;

    // 設定がある場合
    if (documentSettings?.maxFileSize && documentSettings.maxFileSize > 0) {
      return documentSettings.maxFileSize;
    }

    // 設定がない場合はデフォルト値を使用
    return this.DEFAULT_MAX_FILE_SIZE_MB;
  }

  ngOnDestroy(): void {
    // ファイルプレビュー用URLをクリーンアップ（メモリリーク防止）
    this.filePreviewUrls.forEach((url: string) => URL.revokeObjectURL(url));
    this.filePreviewUrls.clear();
  }

  /**
   * 組織情報を読み込む
   */
  private async loadOrganization(): Promise<void> {
    try {
      if (!this.organizationId) {
        return;
      }

      this.organization = await this.organizationService.getOrganization(this.organizationId);
    } catch (error) {
      console.error('組織情報の読み込みに失敗しました:', error);
      // エラーが発生しても続行可能
    }
  }

  /**
   * ファイルを削除（修正17）
   */
  removeFile(index: number): void {
    this.attachments.splice(index, 1);
  }

  /**
   * 既存ファイルを削除（修正17）
   */
  removeExistingFile(index: number): void {
    if (!this.deletedAttachmentIndices.includes(index)) {
      this.deletedAttachmentIndices.push(index);
    }
  }

  /**
   * 既存ファイルの削除をキャンセル
   */
  cancelDeleteExistingFile(index: number): void {
    const deleteIndex = this.deletedAttachmentIndices.indexOf(index);
    if (deleteIndex > -1) {
      this.deletedAttachmentIndices.splice(deleteIndex, 1);
    }
  }

  /**
   * 既存ファイルが削除予定かどうか
   */
  isExistingFileDeleted(index: number): boolean {
    return this.deletedAttachmentIndices.includes(index);
  }

  /**
   * ファイルのプレビューURLを取得（新規ファイル用）
   */
  getFilePreviewUrl(file: File): string {
    if (!this.filePreviewUrls.has(file.name)) {
      const url = URL.createObjectURL(file);
      this.filePreviewUrls.set(file.name, url);
    }
    return this.filePreviewUrls.get(file.name)!;
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

