import { Component, inject, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatListModule } from '@angular/material/list';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ApplicationService } from '../../../core/services/application.service';
import { ConfirmDialogComponent } from '../../setup/setup-wizard/confirm-dialog.component';
import { OrganizationService } from '../../../core/services/organization.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ModeService } from '../../../core/services/mode.service';
import { StandardRewardCalculationService } from '../../../core/services/standard-reward-calculation.service';
import { DeadlineCalculationService } from '../../../core/services/deadline-calculation.service';
import { NotificationService } from '../../../core/services/notification.service';
import { StandardRewardCalculation } from '../../../core/models/standard-reward-calculation.model';
import { Application, ApplicationStatus, ApplicationCategory } from '../../../core/models/application.model';
import { Organization } from '../../../core/models/organization.model';
import { ApplicationType } from '../../../core/models/application-flow.model';
import { Employee, DependentInfo } from '../../../core/models/employee.model';
import { Timestamp } from '@angular/fire/firestore';
import { FormattedSection, FormattedItem } from '../application-detail/application-detail.component';
import { EXPLANATION_PDFS, getApplicationTypeFolderName } from '../../../core/config/explanation-pdfs.config';

@Component({
  selector: 'app-application-create',
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
    MatCardModule,
    MatSnackBarModule,
    MatChipsModule,
    MatListModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatRadioModule,
    MatCheckboxModule,
    MatDividerModule,
    MatExpansionModule,
    MatDialogModule
  ],
  templateUrl: './application-create.component.html',
  styleUrl: './application-create.component.css'
})
export class ApplicationCreateComponent implements OnInit, OnDestroy {
  @ViewChild('stepper') stepper!: MatStepper;

  private fb = inject(FormBuilder);
  router = inject(Router);
  private route = inject(ActivatedRoute);
  private applicationService = inject(ApplicationService);
  private organizationService = inject(OrganizationService);
  private employeeService = inject(EmployeeService);
  private authService = inject(AuthService);
  private modeService = inject(ModeService);
  private standardRewardCalculationService = inject(StandardRewardCalculationService);
  private deadlineCalculationService = inject(DeadlineCalculationService);
  private notificationService = inject(NotificationService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  // ステップ1: 申請種別選択
  applicationTypeForm: FormGroup;

  // ステップ2: 申請内容入力
  applicationDataForm: FormGroup;

  // ステップ3: 添付ファイル
  attachments: File[] = [];
  filePreviewUrls: Map<string, string> = new Map(); // ファイルプレビュー用URL（メモリリーク防止のため）

  organization: Organization | null = null;
  applicationTypes: ApplicationType[] = [];
  selectedApplicationType: ApplicationType | null = null;
  organizationId: string | null = null;
  employeeId: string | null = null;
  isAdmin = false;
  isAdminMode = false;
  isLoading = false;
  employees: Employee[] = []; // 社員一覧
  selectedInternalApplicationId: string | null = null; // 選択された内部申請ID（単一選択）
  availableInternalApplications: Application[] = []; // 選択可能な内部申請一覧（承認済み）
  isFromInternalApplication = false; // 内部申請詳細から外部申請を作成する場合のフラグ
  selectedCalculationId: string | null = null; // 選択された計算履歴ID
  isFromCalculation = false; // 計算履歴から申請を作成する場合のフラグ

  // 申請種別ごとのフォームフラグ（外部申請）
  isInsuranceAcquisitionForm = false; // 被保険者資格取得届
  isInsuranceLossForm = false; // 被保険者資格喪失届
  isDependentChangeForm = false; // 被扶養者（異動）届（外部申請）
  isAddressChangeForm = false; // 被保険者住所変更届（外部申請）
  isNameChangeForm = false; // 被保険者氏名変更（訂正）届（外部申請）
  isRewardBaseForm = false; // 被保険者報酬月額算定基礎届
  isRewardChangeForm = false; // 被保険者報酬月額変更届
  isBonusPaymentForm = false; // 被保険者賞与支払届

  // 申請種別ごとのフォームフラグ（内部申請）
  isDependentChangeFormInternal = false; // 被扶養者（異動）届（内部申請）
  isAddressChangeFormInternal = false; // 住所変更届（内部申請）
  isNameChangeFormInternal = false; // 氏名変更届（内部申請）

  // フォームオブジェクト（外部申請）
  insuranceAcquisitionForm: FormGroup | null = null;
  insuranceLossForm: FormGroup | null = null;
  dependentChangeForm: FormGroup | null = null;
  addressChangeForm: FormGroup | null = null;
  nameChangeForm: FormGroup | null = null;
  rewardBaseForm: FormGroup | null = null;
  rewardChangeForm: FormGroup | null = null;
  bonusPaymentForm: FormGroup | null = null;

  // フォームオブジェクト（内部申請）
  dependentChangeFormInternal: FormGroup | null = null;
  addressChangeFormInternal: FormGroup | null = null;
  nameChangeFormInternal: FormGroup | null = null;

  // FormArray
  insuredPersonsFormArray: FormArray | null = null; // 被保険者資格取得届・喪失届用
  otherDependentsFormArray: FormArray | null = null; // 被扶養者（異動）届のその他の被扶養者用
  rewardBasePersonsFormArray: FormArray | null = null; // 報酬月額算定基礎届用
  rewardChangePersonsFormArray: FormArray | null = null; // 報酬月額変更届用
  bonusPaymentPersonsFormArray: FormArray | null = null; // 賞与支払届用

  // フォーマット済み申請データ（内容確認用）
  formattedApplicationData: FormattedSection[] = [];
  private formSubscription: Subscription | null = null;

  // 年号オプション
  eraOptions = [
    { value: 'reiwa', label: '令和' },
    { value: 'heisei', label: '平成' },
    { value: 'showa', label: '昭和' },
    { value: 'taisho', label: '大正' }
  ];

  // 種別オプション
  typeOptions = [
    { value: 'male', label: '男' },
    { value: 'female', label: '女' },
    { value: 'miner', label: '坑内員' },
    { value: 'male_fund', label: '男(基金)' },
    { value: 'female_fund', label: '女(基金)' },
    { value: 'miner_fund', label: '坑内員(基金)' }
  ];

  // 取得区分オプション
  acquisitionTypeOptions = [
    { value: 'health_pension', label: '健保・厚年' },
    { value: 'mutual_transfer', label: '共済出向' },
    { value: 'ship_continuation', label: '船保任継' }
  ];

  // 備考オプション
  remarksOptions = [
    { value: 'over70', label: '70歳以上被用者該当' },
    { value: 'multiple_workplace', label: '二以上事業所勤務者の取得' },
    { value: 'part_time', label: '短時間労働者の取得（特定適用事業所等）' },
    { value: 'rehire', label: '退職後の継続再雇用者の取得' },
    { value: 'other', label: 'その他' }
  ];

  // 被扶養者（異動）届用オプション
  relationshipOptions = [
    { value: 'husband', label: '夫' },
    { value: 'wife', label: '妻' },
    { value: 'husband_unregistered', label: '夫（未届）' },
    { value: 'wife_unregistered', label: '妻（未届）' }
  ];

  phoneTypeOptions = [
    { value: 'home', label: '自宅' },
    { value: 'mobile', label: '携帯' },
    { value: 'work', label: '勤務先' },
    { value: 'other', label: 'その他' }
  ];

  changeTypeOptions = [
    { value: 'applicable', label: '該当' },
    { value: 'not_applicable', label: '非該当' },
    { value: 'change', label: '変更' }
  ];

  dependentStartReasonOptions = [
    { value: 'spouse_employment', label: '配偶者の就職' },
    { value: 'marriage', label: '婚姻' },
    { value: 'retirement', label: '離職' },
    { value: 'income_decrease', label: '収入減少' },
    { value: 'other', label: 'その他' }
  ];

  occupationOptions = [
    { value: 'unemployed', label: '無職' },
    { value: 'part_time', label: 'パート' },
    { value: 'pension', label: '年金受給者' },
    { value: 'other', label: 'その他' }
  ];

  dependentEndReasonOptions = [
    { value: 'death', label: '死亡' },
    { value: 'divorce', label: '離婚' },
    { value: 'employment', label: '就職・収入増加' },
    { value: 'over75', label: '75歳到達' },
    { value: 'disability', label: '障害認定' },
    { value: 'other', label: 'その他' }
  ];

  overseasExceptionReasonOptions = [
    { value: 'study_abroad', label: '留学' },
    { value: 'accompanying_family', label: '同行家族' },
    { value: 'specific_activity', label: '特定活動' },
    { value: 'overseas_marriage', label: '海外婚姻' },
    { value: 'other', label: 'その他' }
  ];

  overseasExceptionEndReasonOptions = [
    { value: 'domestic_transfer', label: '国内転入' },
    { value: 'other', label: 'その他' }
  ];

  otherDependentRelationshipOptions = [
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

  otherDependentOccupationOptions = [
    { value: 'unemployed', label: '無職' },
    { value: 'part_time', label: 'パート' },
    { value: 'pension', label: '年金受給者' },
    { value: 'student_elementary', label: '小・中学生以下' },
    { value: 'student_high_school', label: '高・大学生' },
    { value: 'other', label: 'その他' }
  ];

  otherDependentStartReasonOptions = [
    { value: 'birth', label: '出生' },
    { value: 'retirement', label: '離職' },
    { value: 'income_decrease', label: '収入減少' },
    { value: 'living_together', label: '同居' },
    { value: 'other', label: 'その他' }
  ];

  addressChangeRemarksOptions = [
    { value: 'short_stay', label: '短期在留' },
    { value: 'overseas_resident', label: '海外居住' },
    { value: 'other_residence', label: '住民票住所以外の居所' },
    { value: 'other', label: 'その他' }
  ];

  // 報酬月額算定基礎届・変更届用オプション
  rewardBaseRemarksOptions = [
    { value: 'over70', label: '70歳以上被用者算定' },
    { value: 'multiple_workplace', label: '二以上勤務' },
    { value: 'scheduled_change', label: '月額変更予定' },
    { value: 'mid_join', label: '途中入社' },
    { value: 'leave', label: '病休・育休・休職等' },
    { value: 'part_time', label: '短時間労働者(特定適用事業所等)' },
    { value: 'part_time_worker', label: 'パート' },
    { value: 'annual_average', label: '年間平均' },
    { value: 'other', label: 'その他' }
  ];

  rewardChangeRemarksOptions = [
    { value: 'over70', label: '70歳以上被用者月額変更' },
    { value: 'multiple_workplace', label: '二以上勤務' },
    { value: 'part_time', label: '短時間労働者(特定適用事業所等)' },
    { value: 'salary_reason', label: '昇給・降給の理由' },
    { value: 'health_only', label: '健康保険のみ月額変更（70歳到達時の契約変更等）' },
    { value: 'other', label: 'その他' }
  ];

  salaryChangeTypeOptions = [
    { value: 'raise', label: '昇給' },
    { value: 'reduction', label: '降給' }
  ];

  bonusPaymentRemarksOptions = [
    { value: 'over70', label: '70歳以上被用者' },
    { value: 'multiple_workplace', label: '二以上勤務' },
    { value: 'same_month', label: '同一月内の賞与合算（初回支払日：〇日）' }
  ];

  salaryMonthLabels: Record<string, string> = {
    'april': '4月',
    'may': '5月',
    'june': '6月',
    'month1': '1か月目',
    'month2': '2か月目',
    'month3': '3か月目'
  };

  // 月の選択肢（1月～12月）
  monthOptions: { value: number; label: string }[] = [
    { value: 1, label: '1月' },
    { value: 2, label: '2月' },
    { value: 3, label: '3月' },
    { value: 4, label: '4月' },
    { value: 5, label: '5月' },
    { value: 6, label: '6月' },
    { value: 7, label: '7月' },
    { value: 8, label: '8月' },
    { value: 9, label: '9月' },
    { value: 10, label: '10月' },
    { value: 11, label: '11月' },
    { value: 12, label: '12月' }
  ];

  constructor() {
    this.applicationTypeForm = this.fb.group({
      category: ['', Validators.required],
      type: ['', Validators.required]
    });

    this.applicationDataForm = this.fb.group({
      description: ['']
    });
  }

  async ngOnInit(): Promise<void> {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.isAdmin = currentUser.role === 'admin' || currentUser.role === 'owner';
    this.isAdminMode = this.modeService.getIsAdminMode();
    this.organizationId = currentUser.organizationId;
    this.employeeId = currentUser.employeeId || null;

    // クエリパラメータから内部申請IDまたは計算履歴IDを読み取る
    const fromInternal = this.route.snapshot.queryParamMap.get('fromInternal');
    const fromCalculation = this.route.snapshot.queryParamMap.get('fromCalculation');
    
    if (fromInternal) {
      this.isFromInternalApplication = true;
      this.selectedInternalApplicationId = fromInternal;
      // 内部申請から外部申請を作成する場合は外部申請に固定
      this.applicationTypeForm.patchValue({ category: 'external' });
    } else if (fromCalculation) {
      this.isFromCalculation = true;
      this.selectedCalculationId = fromCalculation;
      // 計算履歴から申請を作成する場合は外部申請に固定
      this.applicationTypeForm.patchValue({ category: 'external' });
    } else {
      // 権限チェック: 管理者モード時は外部申請のみ、社員モード時は内部申請のみ
      if (this.isAdmin && this.isAdminMode) {
        this.applicationTypeForm.patchValue({ category: 'external' });
      } else {
        this.applicationTypeForm.patchValue({ category: 'internal' });
      }
    }

    // まず組織情報を読み込む（applicationTypesの読み込みに必要）
    await this.loadOrganization();
    
    // 全カテゴリの申請種別を読み込む（内部申請の表示名取得に必要）
    await this.loadAllApplicationTypes();
    
    // 承認済み内部申請一覧を読み込む
    await this.loadApprovedInternalApplications();
    
    // 内部申請詳細から外部申請を作成する場合、申請種別を自動選択
    if (this.isFromInternalApplication && this.selectedInternalApplicationId) {
      await this.autoSelectApplicationTypeFromInternal(this.selectedInternalApplicationId);
    }
    
    // 計算履歴から申請を作成する場合、申請種別を自動選択
    if (this.isFromCalculation && this.selectedCalculationId) {
      await this.autoSelectApplicationTypeFromCalculation(this.selectedCalculationId);
    }
    
    this.loadEmployees().then(() => {
      // 社員一覧の読み込み完了後、内部申請フォームが既に初期化されている場合は自動転記を実行
      this.autoFillCurrentUserInfoIfNeeded();
    });
  }

  /**
   * 内部申請フォームが既に初期化されている場合、ログインユーザーの情報を自動転記
   */
  private autoFillCurrentUserInfoIfNeeded(): void {
    if (this.isDependentChangeFormInternal && this.dependentChangeFormInternal) {
      this.autoFillCurrentUserInfoForDependentChangeInternal();
    }
    if (this.isAddressChangeFormInternal && this.addressChangeFormInternal) {
      this.autoFillCurrentUserInfoForAddressChangeInternal();
    }
    if (this.isNameChangeFormInternal && this.nameChangeFormInternal) {
      this.autoFillCurrentUserInfoForNameChangeInternal();
    }
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
      
      if (this.organization?.applicationFlowSettings?.applicationTypes) {
        // 権限とモードに応じてカテゴリを決定
        // 内部申請から外部申請を作成する場合は外部申請
        const targetCategory = this.isFromInternalApplication 
          ? 'external' 
          : (this.isAdmin && this.isAdminMode ? 'external' : 'internal');
        this.applicationTypes = this.organization.applicationFlowSettings.applicationTypes.filter(
          type => type.enabled && type.category === targetCategory
        );
      }
    } catch (error) {
      console.error('組織情報の読み込みに失敗しました:', error);
      this.snackBar.open('組織情報の読み込みに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 内部申請詳細から外部申請を作成する場合、申請種別を自動選択
   */
  private async autoSelectApplicationTypeFromInternal(internalApplicationId: string): Promise<void> {
    try {
      // 内部申請を読み込む
      const internalApp = await this.applicationService.getApplication(internalApplicationId);
      if (!internalApp || internalApp.category !== 'internal' || internalApp.status !== 'approved') {
        console.error('内部申請の読み込みに失敗しました、または承認済みではありません');
        return;
      }

      // 全カテゴリの申請種別を読み込む
      await this.loadAllApplicationTypes();

      // 内部申請のtypeからApplicationType.codeを取得
      const internalType = this.applicationTypes.find(t => t.id === internalApp.type);
      if (!internalType) {
        console.error('内部申請の申請種別が見つかりません');
        return;
      }

      // マッピングテーブルで外部申請のApplicationType.codeを取得
      const externalTypeCode = this.getExternalApplicationTypeCode(internalType.code);
      if (!externalTypeCode) {
        console.error(`内部申請種別 ${internalType.code} に対応する外部申請種別が見つかりません`);
        return;
      }

      // 外部申請のApplicationTypeを検索
      const externalType = this.applicationTypes.find(t => t.code === externalTypeCode && t.category === 'external');
      if (!externalType) {
        console.error(`外部申請種別 ${externalTypeCode} が見つかりません`);
        return;
      }

      // カテゴリを外部申請に設定
      this.applicationTypeForm.patchValue({ category: 'external' });
      
      // 申請種別を設定
      this.applicationTypeForm.patchValue({ type: externalType.id });
      
      // 申請種別とカテゴリのフォームコントロールを無効化（固定）
      this.applicationTypeForm.get('category')?.disable();
      this.applicationTypeForm.get('type')?.disable();
      
      // 申請種別選択処理を実行（フォーム初期化）
      await this.onTypeSelect(true); // trueを渡して自動選択であることを示す
    } catch (error) {
      console.error('申請種別の自動選択に失敗しました:', error);
    }
  }

  /**
   * 内部申請種別から外部申請種別へのマッピング
   */
  private getExternalApplicationTypeCode(internalTypeCode: string): string | null {
    const mapping: Record<string, string> = {
      'NAME_CHANGE': 'NAME_CHANGE_EXTERNAL',
      'ADDRESS_CHANGE': 'ADDRESS_CHANGE_EXTERNAL',
      'DEPENDENT_CHANGE': 'DEPENDENT_CHANGE_EXTERNAL'
    };
    return mapping[internalTypeCode] || null;
  }

  /**
   * 計算履歴から申請を作成する場合、申請種別を自動選択
   */
  private async autoSelectApplicationTypeFromCalculation(calculationId: string): Promise<void> {
    try {
      // 計算履歴を読み込む
      const calculation = await this.standardRewardCalculationService.getCalculation(calculationId);
      if (!calculation) {
        console.error('計算履歴の読み込みに失敗しました');
        return;
      }

      // 全カテゴリの申請種別を読み込む
      await this.loadAllApplicationTypes();

      // 計算履歴のタイプに応じて申請種別を決定
      let applicationTypeCode: string;
      if (calculation.calculationType === 'standard') {
        applicationTypeCode = 'REWARD_BASE'; // 算定基礎届
      } else if (calculation.calculationType === 'monthly_change') {
        applicationTypeCode = 'REWARD_CHANGE'; // 報酬月額変更届
      } else {
        console.error('不明な計算タイプ:', calculation.calculationType);
        return;
      }

      // 申請種別を検索
      const applicationType = this.applicationTypes.find(t => t.code === applicationTypeCode && t.category === 'external');
      if (!applicationType) {
        console.error(`申請種別 ${applicationTypeCode} が見つかりません`);
        return;
      }

      // カテゴリを外部申請に設定
      this.applicationTypeForm.patchValue({ category: 'external' });
      
      // 申請種別を設定
      this.applicationTypeForm.patchValue({ type: applicationType.id });
      
      // 申請種別とカテゴリのフォームコントロールを無効化（固定）
      this.applicationTypeForm.get('category')?.disable();
      this.applicationTypeForm.get('type')?.disable();
      
      // 申請種別選択処理を実行（フォーム初期化）
      await this.onTypeSelect(true); // trueを渡して自動選択であることを示す
      
      // 計算履歴のデータをフォームに自動入力（フォーム初期化後に実行される）
    } catch (error) {
      console.error('申請種別の自動選択に失敗しました:', error);
    }
  }

  /**
   * 全カテゴリの申請種別を読み込む（内部申請の検索用）
   */
  private async loadAllApplicationTypes(): Promise<void> {
    try {
      if (!this.organizationId) {
        return;
      }

      if (!this.organization) {
        this.organization = await this.organizationService.getOrganization(this.organizationId);
      }
      
      if (this.organization?.applicationFlowSettings?.applicationTypes) {
        // 全カテゴリの申請種別を読み込む（フィルタリングしない）
        const allTypes = this.organization.applicationFlowSettings.applicationTypes.filter(
          type => type.enabled
        );
        // 既存のapplicationTypesとマージ（重複を避ける）
        const existingIds = new Set(this.applicationTypes.map(t => t.id));
        const newTypes = allTypes.filter(t => !existingIds.has(t.id));
        this.applicationTypes = [...this.applicationTypes, ...newTypes];
      }
    } catch (error) {
      console.error('申請種別の読み込みに失敗しました:', error);
    }
  }

  /**
   * 社員一覧を読み込む
   */
  private async loadEmployees(): Promise<void> {
    try {
      if (!this.organizationId) {
        return;
      }
      this.employees = await this.employeeService.getEmployeesByOrganization(this.organizationId);
    } catch (error) {
      console.error('社員一覧の読み込みに失敗しました:', error);
    }
  }

  /**
   * 承認済み内部申請一覧を読み込む
   */
  private async loadApprovedInternalApplications(): Promise<void> {
    try {
      if (!this.organizationId) {
        return;
      }
      const applications = await this.applicationService.getApplicationsByOrganization(this.organizationId);
      // 承認済みの内部申請のみをフィルタ
      this.availableInternalApplications = applications.filter(
        app => app.category === 'internal' && app.status === 'approved'
      );
    } catch (error) {
      console.error('承認済み内部申請一覧の読み込みに失敗しました:', error);
    }
  }

  /**
   * カテゴリ変更時の処理
   */

  /**
   * 申請種別選択時の処理
   * @param isAutoSelect 自動選択の場合true（内部申請詳細から外部申請を作成する場合）
   */
  async onTypeSelect(isAutoSelect: boolean = false): Promise<void> {
    // 内部申請詳細から外部申請を作成する場合、手動変更は不可
    if (this.isFromInternalApplication && !isAutoSelect) {
      return;
    }
    
    const typeId = this.applicationTypeForm.value.type;
    
    // applicationTypesがまだ読み込まれていない場合は読み込む
    if (this.applicationTypes.length === 0 && this.organizationId) {
      await this.loadOrganization();
    }
    
    this.selectedApplicationType = this.applicationTypes.find(type => type.id === typeId) || null;
    
    // 全てのフォームフラグをリセット
    this.resetAllFormFlags();
    
    // 申請種別に応じてフォームを初期化
    if (!this.selectedApplicationType) {
      return;
    }

    switch (this.selectedApplicationType.code) {
      case 'INSURANCE_ACQUISITION':
        this.isInsuranceAcquisitionForm = true;
        this.initializeInsuranceAcquisitionForm();
        break;
      case 'INSURANCE_LOSS':
        this.isInsuranceLossForm = true;
        this.initializeInsuranceLossForm();
        break;
      case 'DEPENDENT_CHANGE_EXTERNAL':
        this.isDependentChangeForm = true;
        this.initializeDependentChangeForm();
        break;
      case 'ADDRESS_CHANGE_EXTERNAL':
        this.isAddressChangeForm = true;
        this.initializeAddressChangeForm();
        break;
      case 'NAME_CHANGE_EXTERNAL':
        this.isNameChangeForm = true;
        this.initializeNameChangeForm();
        break;
      case 'DEPENDENT_CHANGE':  // 内部申請
        this.isDependentChangeFormInternal = true;
        this.initializeDependentChangeFormInternal();
        break;
      case 'ADDRESS_CHANGE':  // 内部申請
        this.isAddressChangeFormInternal = true;
        this.initializeAddressChangeFormInternal();
        break;
      case 'NAME_CHANGE':  // 内部申請
        this.isNameChangeFormInternal = true;
        this.initializeNameChangeFormInternal();
        break;
      case 'REWARD_BASE':
        this.isRewardBaseForm = true;
        this.initializeRewardBaseForm();
        break;
      case 'REWARD_CHANGE':
        this.isRewardChangeForm = true;
        this.initializeRewardChangeForm();
        break;
      case 'BONUS_PAYMENT':
        this.isBonusPaymentForm = true;
        this.initializeBonusPaymentForm();
        break;
    }

    // フォーム変更を購読
    this.subscribeToFormChanges();

    // 選択された内部申請の情報を自動入力（フォーム初期化後に実行）
    if (this.selectedInternalApplicationId && this.selectedApplicationType.category === 'external') {
      await this.autoFillFromInternalApplications();
    }
    
    // 計算履歴の情報を自動入力（フォーム初期化後に実行）
    if (this.isFromCalculation && this.selectedCalculationId && this.selectedApplicationType.category === 'external') {
      await this.autoFillFromCalculation();
    }
  }

  /**
   * 全てのフォームフラグをリセット
   */
  private resetAllFormFlags(): void {
    // 外部申請のフォームフラグをリセット
    this.isInsuranceAcquisitionForm = false;
    this.isInsuranceLossForm = false;
    this.isDependentChangeForm = false;
    this.isAddressChangeForm = false;
    this.isNameChangeForm = false;
    this.isRewardBaseForm = false;
    this.isRewardChangeForm = false;
    this.isBonusPaymentForm = false;
    
    // 内部申請のフォームフラグをリセット
    this.isDependentChangeFormInternal = false;
    this.isAddressChangeFormInternal = false;
    this.isNameChangeFormInternal = false;
    
    // 外部申請のフォームオブジェクトをリセット
    this.insuranceAcquisitionForm = null;
    this.insuranceLossForm = null;
    this.dependentChangeForm = null;
    this.addressChangeForm = null;
    this.nameChangeForm = null;
    this.rewardBaseForm = null;
    this.rewardChangeForm = null;
    this.bonusPaymentForm = null;
    
    // 内部申請のフォームオブジェクトをリセット
    this.dependentChangeFormInternal = null;
    this.addressChangeFormInternal = null;
    this.nameChangeFormInternal = null;
    
    // FormArrayをリセット
    this.insuredPersonsFormArray = null;
    this.otherDependentsFormArray = null;
    this.rewardBasePersonsFormArray = null;
    this.rewardChangePersonsFormArray = null;
    this.bonusPaymentPersonsFormArray = null;
  }

  /**
   * 郵便番号を含む住所を組み立てる
   */
  private buildAddressWithPostalCode(): string {
    if (!this.organization?.address) {
      return '';
    }
    const address = `${this.organization.address.prefecture}${this.organization.address.city}${this.organization.address.street}${this.organization.address.building || ''}`;
    const postalCode = this.organization.address.postalCode;
    return postalCode ? `〒${postalCode} ${address}` : address;
  }

  /**
   * 被保険者資格取得届フォームを初期化
   */
  private initializeInsuranceAcquisitionForm(): void {
    const today = new Date();
    
    // 提出者情報を組織情報から取得
    const submitterOfficeSymbol = this.organization?.insuranceSettings?.healthInsurance?.officeSymbol || '';
    const submitterOfficeNumber = this.organization?.insuranceSettings?.pensionInsurance?.officeNumber || '';
    const submitterAddress = this.buildAddressWithPostalCode();
    const submitterName = this.organization?.name || '';
    const submitterPhone = this.organization?.phoneNumber || '';
    const ownerName = this.organization?.ownerName || ''; // 事業主氏名（修正17）

    this.insuranceAcquisitionForm = this.fb.group({
      submitterInfo: this.fb.group({
        officeSymbol: [submitterOfficeSymbol, [Validators.required]], // 事業所整理記号（必須）
        officeNumber: [submitterOfficeNumber, [Validators.required]], // 事業所番号（必須）
        officeAddress: [submitterAddress, [Validators.required]],
        officeName: [submitterName, [Validators.required]],
        ownerName: [ownerName], // 事業主氏名（修正17）
        phoneNumber: [submitterPhone] // 電話番号（任意）
      }),
      insuredPersons: this.fb.array([])
    });

    this.insuredPersonsFormArray = this.insuranceAcquisitionForm.get('insuredPersons') as FormArray;
    
    // 初期状態で1人の被保険者を追加
    this.addInsuredPerson();
  }

  /**
   * 被保険者を追加
   */
  addInsuredPerson(): void {
    if (!this.insuredPersonsFormArray) {
      return;
    }

    const remunerationGroup = this.fb.group({
      currency: [null], // 通貨
      inKind: [null], // 現物
      total: [{ value: null, disabled: false }] // 合計（自動計算、手動入力も可能）
    });

    const insuredPersonGroup = this.fb.group({
      insuranceNumber: [''], // 被保険者整理番号
      lastName: ['', [Validators.required]], // 氏
      firstName: ['', [Validators.required]], // 名
      lastNameKana: ['', [Validators.required]], // 氏（カナ）
      firstNameKana: ['', [Validators.required]], // 名（カナ）
      birthDate: this.fb.group({
        era: ['reiwa', [Validators.required]], // 年号
        year: ['', [Validators.required]], // 年
        month: ['', [Validators.required]], // 月
        day: ['', [Validators.required]] // 日
      }),
      type: ['', [Validators.required]], // 種別
      acquisitionType: ['', [Validators.required]], // 取得区分
      identificationType: ['personal_number', [Validators.required]], // 個人番号 or 基礎年金番号
      personalNumber: [''], // 個人番号
      basicPensionNumber: [''], // 基礎年金番号
      acquisitionDate: this.fb.group({
        era: ['reiwa', [Validators.required]], // 年号
        year: ['', [Validators.required]], // 年
        month: ['', [Validators.required]], // 月
        day: ['', [Validators.required]] // 日
      }),
      hasDependents: ['no', [Validators.required]], // 被扶養者
      remuneration: remunerationGroup,
      remarks: [''], // 備考（任意、デフォルトは空）
      remarksOther: [''], // 備考（その他）の記入欄
      address: this.fb.group({
        postalCode: [''],
        prefecture: [''],
        city: [''],
        street: [''],
        building: [''],
        addressKana: [''] // 住所（カナ）
      }),
      certificateRequired: [false] // 資格確認書発行要否
    });

    // 報酬月額の合計を自動計算
    const currencyControl = remunerationGroup.get('currency');
    const inKindControl = remunerationGroup.get('inKind');
    const totalControl = remunerationGroup.get('total');

    if (currencyControl && inKindControl && totalControl) {
      // 通貨または現物の値が変更されたときに合計を計算
      currencyControl.valueChanges.subscribe(() => {
        this.calculateRemunerationTotal(remunerationGroup);
      });
      
      inKindControl.valueChanges.subscribe(() => {
        this.calculateRemunerationTotal(remunerationGroup);
      });
    }

    this.insuredPersonsFormArray.push(insuredPersonGroup);
  }

  /**
   * 報酬月額の合計を計算
   */
  private calculateRemunerationTotal(remunerationGroup: FormGroup): void {
    const currency = remunerationGroup.get('currency')?.value;
    const inKind = remunerationGroup.get('inKind')?.value;
    const totalControl = remunerationGroup.get('total');

    if (totalControl) {
      const currencyValue = currency ? Number(currency) : 0;
      const inKindValue = inKind ? Number(inKind) : 0;
      const calculatedTotal = currencyValue + inKindValue;
      
      // 合計を更新（emitEvent: falseで無限ループを防ぐ）
      totalControl.setValue(calculatedTotal || null, { emitEvent: false });
    }
  }

  /**
   * 被保険者を削除
   */
  removeInsuredPerson(index: number): void {
    if (this.insuredPersonsFormArray && this.insuredPersonsFormArray.length > 1) {
      this.insuredPersonsFormArray.removeAt(index);
    }
  }

  /**
   * 被保険者情報のフォームグループを取得
   */
  getInsuredPersonFormGroup(index: number): FormGroup {
    return this.insuredPersonsFormArray?.at(index) as FormGroup;
  }

  /**
   * 住所入力が必要かどうかを判定（基礎年金番号の場合は必要）
   */
  isAddressRequired(index: number): boolean {
    const personGroup = this.getInsuredPersonFormGroup(index);
    const identificationType = personGroup?.get('identificationType')?.value;
    return identificationType === 'basic_pension_number';
  }

  /**
   * 社員を選択して被保険者情報に自動入力（資格取得届用）
   */
  onEmployeeSelect(index: number, employeeId: string): void {
    const employee = this.employees.find(e => e.id === employeeId);
    if (!employee) {
      return;
    }

    const personGroup = this.getInsuredPersonFormGroup(index);
    if (!personGroup) {
      return;
    }

    // 氏名を直接設定
    personGroup.patchValue({
      lastName: employee.lastName,
      firstName: employee.firstName,
      lastNameKana: employee.lastNameKana,
      firstNameKana: employee.firstNameKana
    });

    // 生年月日を設定
    if (employee.birthDate) {
      const birthDate = employee.birthDate instanceof Date 
        ? employee.birthDate 
        : (employee.birthDate instanceof Timestamp ? employee.birthDate.toDate() : new Date(employee.birthDate));
      const birthDateInfo = this.convertToEraDate(birthDate);
      personGroup.get('birthDate')?.patchValue(birthDateInfo);
    }

    // 被保険者整理番号
    if (employee.insuranceInfo?.healthInsuranceNumber) {
      personGroup.patchValue({
        insuranceNumber: employee.insuranceInfo.healthInsuranceNumber
      });
    }

    // 個人番号または基礎年金番号
    if (employee.insuranceInfo?.myNumber) {
      personGroup.patchValue({
        identificationType: 'personal_number',
        personalNumber: employee.insuranceInfo.myNumber
      });
    }
    // 基礎年金番号はマイナンバーがあっても設定する（申請フォームで選択可能なため）
    if (employee.insuranceInfo?.pensionNumber) {
      personGroup.patchValue({
        basicPensionNumber: employee.insuranceInfo.pensionNumber
      });
      // マイナンバーがない場合は基礎年金番号を選択状態にする
      if (!employee.insuranceInfo?.myNumber) {
        personGroup.patchValue({
          identificationType: 'basic_pension_number'
        });
      }
    }

    // 住所（officialのみ使用）
    const address = employee.address?.official; // || employee.address?.internal; // internalはコメントアウト
    if (address) {
      personGroup.get('address')?.patchValue({
        postalCode: address.postalCode || '',
        prefecture: address.prefecture || '',
        city: address.city || '',
        street: address.street || '',
        building: address.building || '',
        addressKana: address.kana || '' // 住所カナを自動転記（修正17）
      });
    }

    // 取得日を社員情報の入社日から転記
    if (employee.joinDate) {
      const joinDate = employee.joinDate instanceof Date 
        ? employee.joinDate 
        : (employee.joinDate instanceof Timestamp ? employee.joinDate.toDate() : new Date(employee.joinDate));
      const joinDateInfo = this.convertToEraDate(joinDate);
      personGroup.get('acquisitionDate')?.patchValue(joinDateInfo);
    }
  }

  /**
   * 氏名を分割（スペースで分割、なければカナから推測）
   */
  private splitName(name: string, nameKana: string): { lastName: string, firstName: string, lastNameKana: string, firstNameKana: string } {
    // スペースで分割を試みる
    const nameParts = name.split(/\s+/);
    const nameKanaParts = nameKana.split(/\s+/);

    if (nameParts.length >= 2 && nameKanaParts.length >= 2) {
      // スペースで分割できた場合
      return {
        lastName: nameParts[0],
        firstName: nameParts.slice(1).join(' '),
        lastNameKana: nameKanaParts[0],
        firstNameKana: nameKanaParts.slice(1).join(' ')
      };
    } else {
      // スペースで分割できない場合、カナから推測（2文字目以降を名とする）
      // ただし、これは完全ではないため、全体的に名として扱う
      return {
        lastName: name,
        firstName: '',
        lastNameKana: nameKana,
        firstNameKana: ''
      };
    }
  }

  /**
   * Dateを年号・年月日に変換
   */
  private convertToEraDate(date: Date): { era: string, year: number, month: number, day: number } {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    let era = 'reiwa';
    let eraYear = year - 2018; // 令和（2019年から）

    if (year < 1926) {
      era = 'taisho';
      eraYear = year - 1911; // 大正
    } else if (year < 1989) {
      era = 'showa';
      eraYear = year - 1925; // 昭和
    } else if (year < 2019) {
      era = 'heisei';
      eraYear = year - 1988; // 平成
    }

    return {
      era,
      year: eraYear,
      month,
      day
    };
  }

  /**
   * 社員の表示名を取得
   */
  getEmployeeDisplayName(employee: Employee): string {
    return `${employee.lastName} ${employee.firstName} (${employee.employeeNumber})`;
  }

  /**
   * 被保険者資格喪失届フォームを初期化
   */
  private initializeInsuranceLossForm(): void {
    const today = new Date();
    
    // 提出者情報を組織情報から取得
    const submitterOfficeSymbol = this.organization?.insuranceSettings?.healthInsurance?.officeSymbol || '';
    const submitterOfficeNumber = this.organization?.insuranceSettings?.pensionInsurance?.officeNumber || '';
    const submitterAddress = this.buildAddressWithPostalCode();
    const submitterName = this.organization?.name || '';
    const submitterPhone = this.organization?.phoneNumber || '';

    this.insuranceLossForm = this.fb.group({
      submitterInfo: this.fb.group({
        officeSymbol: [submitterOfficeSymbol],
        officeNumber: [submitterOfficeNumber, [Validators.required]], // 事業所番号（必須）
        officeAddress: [submitterAddress, [Validators.required]],
        officeName: [submitterName, [Validators.required]],
        ownerName: [this.organization?.ownerName || ''], // 事業主氏名（修正17）
        phoneNumber: [submitterPhone]
      }),
      insuredPersons: this.fb.array([])
    });

    this.insuredPersonsFormArray = this.insuranceLossForm.get('insuredPersons') as FormArray;
    this.addInsuredPersonForLoss();
  }

  /**
   * 被保険者資格喪失届用の被保険者を追加
   */
  addInsuredPersonForLoss(): void {
    if (!this.insuredPersonsFormArray) {
      return;
    }

    const insuredPersonGroup = this.fb.group({
      employeeId: [null], // 社員ID（喪失原因変更時に使用）
      insuranceNumber: [''],
      lastName: ['', [Validators.required]],
      firstName: ['', [Validators.required]],
      lastNameKana: ['', [Validators.required]],
      firstNameKana: ['', [Validators.required]],
      birthDate: this.fb.group({
        era: ['reiwa', [Validators.required]],
        year: ['', [Validators.required]],
        month: ['', [Validators.required]],
        day: ['', [Validators.required]]
      }),
      identificationType: ['personal_number', [Validators.required]],
      personalNumber: [''],
      basicPensionNumber: [''],
      lossDate: this.fb.group({
        era: ['reiwa', [Validators.required]],
        year: ['', [Validators.required]],
        month: ['', [Validators.required]],
        day: ['', [Validators.required]]
      }),
      lossReason: ['', [Validators.required]], // 喪失原因
      retirementDate: this.fb.group({ // 退職等した日（退職等選択時）
        era: ['reiwa'],
        year: [''],
        month: [''],
        day: ['']
      }),
      deathDate: this.fb.group({ // 死亡した日（死亡選択時）
        era: ['reiwa'],
        year: [''],
        month: [''],
        day: ['']
      }),
      remarks: [''], // 備考
      remarksOther: [''], // 備考（その他）の記入欄
      certificateCollection: this.fb.group({ // 資格確認書回収
        attached: [null], // 添付〇枚
        unrecoverable: [null] // 返不能〇枚
      }),
      over70NotApplicable: [false], // 70歳不該当チェック
      over70NotApplicableDate: this.fb.group({ // 不該当年月日（チェック時）
        era: ['reiwa'],
        year: [''],
        month: [''],
        day: ['']
      })
    });

    this.insuredPersonsFormArray.push(insuredPersonGroup);
    
    // 喪失原因変更時の監視を設定
    this.setupLossReasonChangeListener(this.insuredPersonsFormArray.length - 1);
  }

  /**
   * 喪失原因変更時の監視を設定
   */
  private setupLossReasonChangeListener(index: number): void {
    const personGroup = this.getInsuredPersonFormGroupForLoss(index);
    if (!personGroup) {
      return;
    }

    const lossReasonControl = personGroup.get('lossReason');
    if (!lossReasonControl) {
      return;
    }

    lossReasonControl.valueChanges.subscribe((lossReason: string) => {
      if (lossReason === 'retirement') {
        // 退職等が選択された場合、社員情報から退職予定日を自動入力
        const employeeId = personGroup.get('employeeId')?.value;
        if (employeeId) {
          const employee = this.employees.find(e => e.id === employeeId);
          if (employee?.retirementDate) {
            const retirementDate = employee.retirementDate instanceof Date 
              ? employee.retirementDate 
              : (employee.retirementDate instanceof Timestamp ? employee.retirementDate.toDate() : new Date(employee.retirementDate));
            
            // 退職等した日が空欄の場合のみ自動入力
            const retirementDateGroup = personGroup.get('retirementDate') as FormGroup;
            if (retirementDateGroup && this.isEraDateEmpty(retirementDateGroup)) {
              const retirementDateInfo = this.convertToEraDate(retirementDate);
              retirementDateGroup.patchValue(retirementDateInfo);
            }
            
            // 喪失年月日が空欄の場合のみ自動入力（退職予定日+1日）
            const lossDateGroup = personGroup.get('lossDate') as FormGroup;
            if (lossDateGroup && this.isEraDateEmpty(lossDateGroup)) {
              const lossDate = new Date(retirementDate);
              lossDate.setDate(lossDate.getDate() + 1);
              const lossDateInfo = this.convertToEraDate(lossDate);
              lossDateGroup.patchValue(lossDateInfo);
            }
          }
        }
      }
    });
  }

  /**
   * 年号形式の日付が空欄かどうかを判定
   */
  private isEraDateEmpty(dateGroup: FormGroup): boolean {
    const era = dateGroup.get('era')?.value;
    const year = dateGroup.get('year')?.value;
    const month = dateGroup.get('month')?.value;
    const day = dateGroup.get('day')?.value;
    return !era || !year || !month || !day;
  }

  /**
   * 喪失原因のオプション
   */
  lossReasonOptions = [
    { value: 'retirement', label: '退職等' },
    { value: 'death', label: '死亡' },
    { value: 'over75', label: '75歳到達（健康保険のみ喪失）' },
    { value: 'disability', label: '障害認定（健康保険のみ喪失）' },
    { value: 'social_security', label: '社会保障協定' }
  ];

  /**
   * 喪失原因の備考オプション
   */
  lossRemarksOptions = [
    { value: 'multiple_workplace', label: '二以上事業所勤務者の喪失' },
    { value: 'rehire', label: '退職後の継続再雇用者の喪失' },
    { value: 'other', label: 'その他' }
  ];

  /**
   * 社員を選択して被保険者情報に自動入力（資格喪失届用）
   */
  onEmployeeSelectForLoss(index: number, employeeId: string): void {
    const employee = this.employees.find(e => e.id === employeeId);
    if (!employee) {
      return;
    }

    const personGroup = this.getInsuredPersonFormGroupForLoss(index);
    if (!personGroup) {
      return;
    }

    // 氏名を直接設定
    personGroup.patchValue({
      lastName: employee.lastName,
      firstName: employee.firstName,
      lastNameKana: employee.lastNameKana,
      firstNameKana: employee.firstNameKana
    });

    // 生年月日を設定
    if (employee.birthDate) {
      const birthDate = employee.birthDate instanceof Date 
        ? employee.birthDate 
        : (employee.birthDate instanceof Timestamp ? employee.birthDate.toDate() : new Date(employee.birthDate));
      const birthDateInfo = this.convertToEraDate(birthDate);
      personGroup.get('birthDate')?.patchValue(birthDateInfo);
    }

    // 被保険者整理番号
    if (employee.insuranceInfo?.healthInsuranceNumber) {
      personGroup.patchValue({
        insuranceNumber: employee.insuranceInfo.healthInsuranceNumber
      });
    }

    // 個人番号または基礎年金番号
    if (employee.insuranceInfo?.myNumber) {
      personGroup.patchValue({
        identificationType: 'personal_number',
        personalNumber: employee.insuranceInfo.myNumber
      });
    } else if (employee.insuranceInfo?.pensionNumber) {
      personGroup.patchValue({
        identificationType: 'basic_pension_number',
        basicPensionNumber: employee.insuranceInfo.pensionNumber
      });
    }

    // 社員IDを保存（喪失原因変更時に使用）
    personGroup.patchValue({
      employeeId: employeeId
    });
  }

  /**
   * 被保険者資格喪失届の被保険者情報のフォームグループを取得
   */
  getInsuredPersonFormGroupForLoss(index: number): FormGroup {
    return this.insuredPersonsFormArray?.at(index) as FormGroup;
  }

  /**
   * 被保険者資格喪失届の被保険者を削除
   */
  removeInsuredPersonForLoss(index: number): void {
    if (this.insuredPersonsFormArray && this.insuredPersonsFormArray.length > 1) {
      this.insuredPersonsFormArray.removeAt(index);
    }
  }

  /**
   * 喪失原因に応じて日付入力が必要かどうかを判定
   */
  isRetirementDateRequired(index: number): boolean {
    const personGroup = this.getInsuredPersonFormGroupForLoss(index);
    return personGroup?.get('lossReason')?.value === 'retirement';
  }

  /**
   * 死亡日が必要かどうかを判定
   */
  isDeathDateRequired(index: number): boolean {
    const personGroup = this.getInsuredPersonFormGroupForLoss(index);
    return personGroup?.get('lossReason')?.value === 'death';
  }

  /**
   * 70歳不該当年月日が必要かどうかを判定
   */
  isOver70NotApplicableDateRequired(index: number): boolean {
    const personGroup = this.getInsuredPersonFormGroupForLoss(index);
    return personGroup?.get('over70NotApplicable')?.value === true;
  }

  /**
   * 社員を選択して被保険者情報に自動入力（被扶養者異動届用）
   */
  onEmployeeSelectForDependentChange(employeeId: string): void {
    const employee = this.employees.find(e => e.id === employeeId);
    if (!employee) {
      return;
    }

    // 現在アクティブなフォームからinsuredPersonを取得
    let currentForm: FormGroup | null = null;
    if (this.isDependentChangeFormInternal && this.dependentChangeFormInternal) {
      currentForm = this.dependentChangeFormInternal;
    } else if (this.isDependentChangeForm && this.dependentChangeForm) {
      currentForm = this.dependentChangeForm;
    }

    if (!currentForm) {
      return;
    }

    const insuredPersonGroup = currentForm.get('insuredPerson') as FormGroup;
    if (!insuredPersonGroup) {
      return;
    }

    // 氏名を直接設定
    insuredPersonGroup.patchValue({
      lastName: employee.lastName,
      firstName: employee.firstName,
      lastNameKana: employee.lastNameKana,
      firstNameKana: employee.firstNameKana
    });

    // 生年月日を設定
    if (employee.birthDate) {
      const birthDate = employee.birthDate instanceof Date 
        ? employee.birthDate 
        : (employee.birthDate instanceof Timestamp ? employee.birthDate.toDate() : new Date(employee.birthDate));
      const birthDateInfo = this.convertToEraDate(birthDate);
      insuredPersonGroup.get('birthDate')?.patchValue(birthDateInfo);
    }

    // 被保険者整理番号
    if (employee.insuranceInfo?.healthInsuranceNumber) {
      insuredPersonGroup.patchValue({
        insuranceNumber: employee.insuranceInfo.healthInsuranceNumber
      });
    }

    // 個人番号または基礎年金番号
    if (employee.insuranceInfo?.myNumber) {
      insuredPersonGroup.patchValue({
        identificationType: 'personal_number',
        personalNumber: employee.insuranceInfo.myNumber
      });
    }
    // 基礎年金番号はマイナンバーがあっても設定する（申請フォームで選択可能なため）
    if (employee.insuranceInfo?.pensionNumber) {
      insuredPersonGroup.patchValue({
        basicPensionNumber: employee.insuranceInfo.pensionNumber
      });
      // マイナンバーがない場合は基礎年金番号を選択状態にする
      if (!employee.insuranceInfo?.myNumber) {
        insuredPersonGroup.patchValue({
          identificationType: 'basic_pension_number'
        });
      }
    }

    // 取得年月日（入社日から設定）
    if (employee.joinDate) {
      const joinDate = employee.joinDate instanceof Date 
        ? employee.joinDate 
        : (employee.joinDate instanceof Timestamp ? employee.joinDate.toDate() : new Date(employee.joinDate));
      const joinDateInfo = this.convertToEraDate(joinDate);
      insuredPersonGroup.get('acquisitionDate')?.patchValue(joinDateInfo);
    }

    // 被扶養者情報を自動転記
    if (employee.dependentInfo && employee.dependentInfo.length > 0) {
      this.addDependentsFromEmployee(employee.dependentInfo);
    }

    // 住所（基礎年金番号の場合のみ、officialを優先、なければinternal）
    if (employee.address && insuredPersonGroup.get('identificationType')?.value === 'basic_pension_number') {
      const address = employee.address.official; // || employee.address.internal; // internalはコメントアウト
      if (address) {
        insuredPersonGroup.get('address')?.patchValue({
          postalCode: address.postalCode || '',
          prefecture: address.prefecture || '',
          city: address.city || '',
          street: address.street || '',
          building: address.building || '',
          addressKana: address.kana || '' // 住所カナを自動転記（修正17）
        });
      }
    }
  }

  /**
   * 申請データからemployeeIdを除外（表示用のため保存しない）
   */
  private removeEmployeeIdFromData(data: any): any {
    if (!data) {
      return data;
    }
    
    const cleaned = { ...data };
    
    // insuredPersons配列からemployeeIdを除外
    if (cleaned.insuredPersons && Array.isArray(cleaned.insuredPersons)) {
      cleaned.insuredPersons = cleaned.insuredPersons.map((person: any) => {
        const { employeeId, ...rest } = person;
        return rest;
      });
    }
    
    // insuredPersonオブジェクトからemployeeIdを除外
    if (cleaned.insuredPerson && typeof cleaned.insuredPerson === 'object') {
      const { employeeId, ...rest } = cleaned.insuredPerson;
      cleaned.insuredPerson = rest;
    }
    
    return cleaned;
  }

  /**
   * 被扶養者（異動）届フォームを初期化
   */
  private initializeDependentChangeForm(): void {
    const today = new Date();
    
    const submitterOfficeSymbol = this.organization?.insuranceSettings?.healthInsurance?.officeSymbol || '';
    const submitterOfficeNumber = this.organization?.insuranceSettings?.pensionInsurance?.officeNumber || '';
    const submitterAddress = this.buildAddressWithPostalCode();
    const submitterName = this.organization?.name || '';
    const submitterPhone = this.organization?.phoneNumber || '';

    this.dependentChangeForm = this.fb.group({
      businessOwnerInfo: this.fb.group({
        officeSymbol: [submitterOfficeSymbol],
        officeNumber: [submitterOfficeNumber], // 事業所番号
        officeAddress: [submitterAddress, [Validators.required]],
        officeName: [submitterName, [Validators.required]],
        ownerName: [this.organization?.ownerName || ''], // 事業主氏名（修正17）
        phoneNumber: [submitterPhone]
      }),
      businessOwnerReceiptDate: this.fb.group({
        era: ['reiwa'],
        year: [''],
        month: [''],
        day: ['']
      }),
      submissionDate: this.fb.group({
        era: ['reiwa'],
        year: [''],
        month: [''],
        day: ['']
      }),
      insuredPerson: this.fb.group({
        insuranceNumber: [''],
        lastName: ['', [Validators.required]],
        firstName: ['', [Validators.required]],
        lastNameKana: ['', [Validators.required]],
        firstNameKana: ['', [Validators.required]],
        birthDate: this.fb.group({
          era: ['reiwa', [Validators.required]],
          year: ['', [Validators.required]],
          month: ['', [Validators.required]],
          day: ['', [Validators.required]]
        }),
        gender: ['', [Validators.required]],
        identificationType: ['personal_number', [Validators.required]],
        personalNumber: [''],
        basicPensionNumber: [''],
        acquisitionDate: this.fb.group({
          era: ['reiwa', [Validators.required]],
          year: ['', [Validators.required]],
          month: ['', [Validators.required]],
          day: ['', [Validators.required]]
        }),
        income: [null],
        address: this.fb.group({
          postalCode: [''],
          prefecture: [''],
          city: [''],
          street: [''],
          building: ['']
        })
      }),
      spouseDependent: this.fb.group({
        noChange: [false], // 異動がない場合のフラグ
        name: [''],
        nameKana: [''],
        birthDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        relationship: [''], // 続柄（夫、妻、夫（未届）、妻（未届））
        identificationType: ['personal_number'],
        personalNumber: [''],
        basicPensionNumber: [''],
        isForeigner: [false],
        foreignName: [''],
        foreignNameKana: [''],
        address: this.fb.group({
          address: [''],
          livingTogether: [''] // 同居、別居
        }),
        phoneNumber: this.fb.group({
          phone: [''],
          type: [''] // 自宅、携帯、勤務先、その他
        }),
        changeType: [''], // 異動種別（該当、非該当、変更）
        // 異動種別「該当」の場合
        dependentStartDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        dependentStartReason: [''],
        dependentStartReasonOther: [''],
        occupation: [''],
        occupationOther: [''],
        income: [null],
        // 異動種別「非該当」の場合
        dependentEndDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        dependentEndReason: [''],
        dependentEndReasonOther: [''],
        deathDate: this.fb.group({ // 死亡の場合の日付
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        remarks: [''],
        // 異動種別「変更」の場合の変更後情報
        changeAfter: this.fb.group({
          dependentStartDate: this.fb.group({
            era: ['reiwa'],
            year: [''],
            month: [''],
            day: ['']
          }),
          dependentStartReason: [''],
          dependentStartReasonOther: [''],
          occupation: [''],
          occupationOther: [''],
          income: [null],
          dependentEndDate: this.fb.group({
            era: ['reiwa'],
            year: [''],
            month: [''],
            day: ['']
          }),
          dependentEndReason: [''],
          dependentEndReasonOther: [''],
          deathDate: this.fb.group({
            era: ['reiwa'],
            year: [''],
            month: [''],
            day: ['']
          })
        }),
        // 海外特例要件
        overseasException: [''],
        overseasExceptionStartDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        overseasExceptionStartReason: [''],
        overseasExceptionStartReasonOther: [''],
        overseasExceptionEndDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        overseasExceptionEndReason: [''],
        overseasExceptionEndReasonOther: [''],
        domesticTransferDate: this.fb.group({ // 国内転入の場合の日付
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        certificateRequired: [false],
        spouseIncome: [null] // 配偶者の収入（異動がない場合）
      }),
      otherDependents: this.fb.array([]),
      declaration: this.fb.group({
        content: [''], // 記入欄
        signature: [''] // 署名欄
      })
    });

    this.otherDependentsFormArray = this.dependentChangeForm.get('otherDependents') as FormArray;
  }

  /**
   * 被扶養者（異動）届フォームを初期化（内部申請用：事業所情報と届書提出日なし）
   */
  private initializeDependentChangeFormInternal(): void {
    this.dependentChangeFormInternal = this.fb.group({
      insuredPerson: this.fb.group({
        insuranceNumber: [''],
        lastName: ['', [Validators.required]],
        firstName: ['', [Validators.required]],
        lastNameKana: ['', [Validators.required]],
        firstNameKana: ['', [Validators.required]],
        birthDate: this.fb.group({
          era: ['reiwa', [Validators.required]],
          year: ['', [Validators.required]],
          month: ['', [Validators.required]],
          day: ['', [Validators.required]]
        }),
        gender: ['', [Validators.required]],
        identificationType: ['personal_number', [Validators.required]],
        personalNumber: [''],
        basicPensionNumber: [''],
        acquisitionDate: this.fb.group({
          era: ['reiwa', [Validators.required]],
          year: ['', [Validators.required]],
          month: ['', [Validators.required]],
          day: ['', [Validators.required]]
        }),
        income: [null],
        address: this.fb.group({
          postalCode: [''],
          prefecture: [''],
          city: [''],
          street: [''],
          building: ['']
        })
      }),
      spouseDependent: this.fb.group({
        noChange: [false],
        name: [''],
        nameKana: [''],
        birthDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        relationship: [''],
        identificationType: ['personal_number'],
        personalNumber: [''],
        basicPensionNumber: [''],
        isForeigner: [false],
        foreignName: [''],
        foreignNameKana: [''],
        address: this.fb.group({
          address: [''],
          livingTogether: ['']
        }),
        phoneNumber: this.fb.group({
          phone: [''],
          type: ['']
        }),
        changeType: [''],
        dependentStartDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        dependentStartReason: [''],
        dependentStartReasonOther: [''],
        occupation: [''],
        occupationOther: [''],
        income: [null],
        dependentEndDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        dependentEndReason: [''],
        dependentEndReasonOther: [''],
        deathDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        remarks: [''],
        changeAfter: this.fb.group({
          dependentStartDate: this.fb.group({
            era: ['reiwa'],
            year: [''],
            month: [''],
            day: ['']
          }),
          dependentStartReason: [''],
          dependentStartReasonOther: [''],
          occupation: [''],
          occupationOther: [''],
          income: [null],
          dependentEndDate: this.fb.group({
            era: ['reiwa'],
            year: [''],
            month: [''],
            day: ['']
          }),
          dependentEndReason: [''],
          dependentEndReasonOther: [''],
          deathDate: this.fb.group({
            era: ['reiwa'],
            year: [''],
            month: [''],
            day: ['']
          })
        }),
        overseasException: [''],
        overseasExceptionStartDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        overseasExceptionStartReason: [''],
        overseasExceptionStartReasonOther: [''],
        overseasExceptionEndDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        overseasExceptionEndReason: [''],
        overseasExceptionEndReasonOther: [''],
        domesticTransferDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        certificateRequired: [false],
        spouseIncome: [null]
      }),
      otherDependents: this.fb.array([]),
      declaration: this.fb.group({
        content: [''],
        signature: ['']
      })
    });

    this.otherDependentsFormArray = this.dependentChangeFormInternal.get('otherDependents') as FormArray;

    // 内部申請の場合、ログインユーザーの情報を自動転記（employeesが読み込まれている場合のみ）
    if (this.employees.length > 0) {
      this.autoFillCurrentUserInfoForDependentChangeInternal();
    }
  }

  /**
   * 被扶養者（異動）届の内部申請用フォームにログインユーザーの情報を自動転記
   */
  private autoFillCurrentUserInfoForDependentChangeInternal(): void {
    if (!this.employeeId || !this.dependentChangeFormInternal) {
      return;
    }

    const employee = this.employees.find(e => e.id === this.employeeId);
    if (!employee) {
      return;
    }

    // 既存のonEmployeeSelectForDependentChangeメソッドを使用して転記
    this.onEmployeeSelectForDependentChange(this.employeeId);
  }

  /**
   * 被保険者住所変更届フォームを初期化
   */
  private initializeAddressChangeForm(): void {
    const today = new Date();
    
    const submitterOfficeNumber = this.organization?.insuranceSettings?.pensionInsurance?.officeNumber || '';
    const submitterAddress = this.buildAddressWithPostalCode();
    const submitterName = this.organization?.name || '';
    const submitterPhone = this.organization?.phoneNumber || '';

    this.addressChangeForm = this.fb.group({
      businessInfo: this.fb.group({
        officeSymbol: [this.organization?.insuranceSettings?.healthInsurance?.officeSymbol || '', [Validators.required]],
        officeNumber: [submitterOfficeNumber], // 事業所番号
        officeAddress: [submitterAddress, [Validators.required]],
        officeName: [submitterName, [Validators.required]],
        ownerName: [this.organization?.ownerName || ''], // 事業主氏名（修正17）
        phoneNumber: [submitterPhone]
      }),
      insuredPerson: this.fb.group({
        employeeId: [''], // 社員ID（編集時に使用、保存時は除外）
        insuranceNumber: [''],
        identificationType: ['personal_number', [Validators.required]],
        personalNumber: [''],
        basicPensionNumber: [''],
        lastName: ['', [Validators.required]],
        firstName: ['', [Validators.required]],
        lastNameKana: ['', [Validators.required]],
        firstNameKana: ['', [Validators.required]],
        birthDate: this.fb.group({
          era: ['reiwa', [Validators.required]],
          year: ['', [Validators.required]],
          month: ['', [Validators.required]],
          day: ['', [Validators.required]]
        }),
        newPostalCode: [''],
        newPrefecture: [''],
        newCity: [''],
        newStreet: [''],
        newBuilding: [''],
        newAddressKana: [''],
        oldAddress: [''],
        changeDate: this.fb.group({
          era: ['reiwa', [Validators.required]],
          year: ['', [Validators.required]],
          month: ['', [Validators.required]],
          day: ['', [Validators.required]]
        }),
        remarks: [''],
        livingWithSpouse: [false],
        spouseIdentificationType: ['personal_number'],
        spousePersonalNumber: [''],
        spouseBasicPensionNumber: [''],
        spouseBirthDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        spouseLastName: [''],
        spouseFirstName: [''],
        spouseLastNameKana: [''],
        spouseFirstNameKana: [''],
        spouseNewPostalCode: [''],
        spouseNewPrefecture: [''],
        spouseNewCity: [''],
        spouseNewStreet: [''],
        spouseNewBuilding: [''],
        spouseNewAddressKana: [''],
        spouseOldAddress: [''],
        spouseChangeDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        spouseRemarks: ['']
      })
    });
  }

  /**
   * 被保険者住所変更届フォームを初期化（内部申請用：事業所情報と届書提出日なし）
   */
  private initializeAddressChangeFormInternal(): void {
    this.addressChangeFormInternal = this.fb.group({
      insuredPerson: this.fb.group({
        insuranceNumber: [''],
        identificationType: ['personal_number', [Validators.required]],
        personalNumber: [''],
        basicPensionNumber: [''],
        lastName: ['', [Validators.required]],
        firstName: ['', [Validators.required]],
        lastNameKana: ['', [Validators.required]],
        firstNameKana: ['', [Validators.required]],
        birthDate: this.fb.group({
          era: ['reiwa', [Validators.required]],
          year: ['', [Validators.required]],
          month: ['', [Validators.required]],
          day: ['', [Validators.required]]
        }),
        newPostalCode: [''],
        newPrefecture: [''],
        newCity: [''],
        newStreet: [''],
        newBuilding: [''],
        newAddressKana: [''],
        oldAddress: [''],
        changeDate: this.fb.group({
          era: ['reiwa', [Validators.required]],
          year: ['', [Validators.required]],
          month: ['', [Validators.required]],
          day: ['', [Validators.required]]
        }),
        remarks: [''],
        livingWithSpouse: [false],
        spouseIdentificationType: ['personal_number'],
        spousePersonalNumber: [''],
        spouseBasicPensionNumber: [''],
        spouseBirthDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        spouseLastName: [''],
        spouseFirstName: [''],
        spouseLastNameKana: [''],
        spouseFirstNameKana: [''],
        spouseNewPostalCode: [''],
        spouseNewPrefecture: [''],
        spouseNewCity: [''],
        spouseNewStreet: [''],
        spouseNewBuilding: [''],
        spouseNewAddressKana: [''],
        spouseOldAddress: [''],
        spouseChangeDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        spouseRemarks: ['']
      })
    });

    // 内部申請の場合、ログインユーザーの情報を変更前部分に自動転記（employeesが読み込まれている場合のみ）
    if (this.employees.length > 0) {
      this.autoFillCurrentUserInfoForAddressChangeInternal();
    }
  }

  /**
   * 住所変更届の内部申請用フォームにログインユーザーの情報を自動転記（変更前部分のみ）
   */
  private autoFillCurrentUserInfoForAddressChangeInternal(): void {
    if (!this.employeeId || !this.addressChangeFormInternal) {
      return;
    }

    const employee = this.employees.find(e => e.id === this.employeeId);
    if (!employee) {
      return;
    }

    const insuredPersonGroup = this.addressChangeFormInternal.get('insuredPerson') as FormGroup;
    if (!insuredPersonGroup) {
      return;
    }

    // 氏名を直接設定
    insuredPersonGroup.patchValue({
      lastName: employee.lastName,
      firstName: employee.firstName,
      lastNameKana: employee.lastNameKana,
      firstNameKana: employee.firstNameKana
    });

    // 生年月日を設定
    if (employee.birthDate) {
      const birthDate = employee.birthDate instanceof Date 
        ? employee.birthDate 
        : (employee.birthDate instanceof Timestamp ? employee.birthDate.toDate() : new Date(employee.birthDate));
      const birthDateInfo = this.convertToEraDate(birthDate);
      insuredPersonGroup.get('birthDate')?.patchValue(birthDateInfo);
    }

    // 被保険者整理番号
    if (employee.insuranceInfo?.healthInsuranceNumber) {
      insuredPersonGroup.patchValue({
        insuranceNumber: employee.insuranceInfo.healthInsuranceNumber
      });
    }

    // 個人番号または基礎年金番号
    if (employee.insuranceInfo?.myNumber) {
      insuredPersonGroup.patchValue({
        identificationType: 'personal_number',
        personalNumber: employee.insuranceInfo.myNumber
      });
    } else if (employee.insuranceInfo?.pensionNumber) {
      insuredPersonGroup.patchValue({
        identificationType: 'basic_pension_number',
        basicPensionNumber: employee.insuranceInfo.pensionNumber
      });
    }

    // 変更前住所を設定（officialを優先、なければinternal、郵便番号は除く）
    if (employee.address) {
      const address = employee.address.official; // || employee.address.internal; // internalはコメントアウト
      if (address) {
        const oldAddressParts = [
          address.prefecture || '',
          address.city || '',
          address.street || '',
          address.building || ''
        ].filter(part => part).join(' ');
        
        insuredPersonGroup.patchValue({
          oldAddress: oldAddressParts
        });
      }
    }

    // 変更後部分は空欄のまま（ユーザーが手入力）
  }

  /**
   * 被保険者氏名変更（訂正）届フォームを初期化
   */
  private initializeNameChangeForm(): void {
    const today = new Date();
    
    const submitterOfficeSymbol = this.organization?.insuranceSettings?.healthInsurance?.officeSymbol || '';
    const submitterOfficeNumber = this.organization?.insuranceSettings?.pensionInsurance?.officeNumber || '';
    const submitterAddress = this.buildAddressWithPostalCode();
    const submitterName = this.organization?.name || '';
    const submitterPhone = this.organization?.phoneNumber || '';

    this.nameChangeForm = this.fb.group({
      businessInfo: this.fb.group({
        officeSymbol: [submitterOfficeSymbol],
        officeNumber: [submitterOfficeNumber], // 事業所番号
        officeAddress: [submitterAddress, [Validators.required]],
        officeName: [submitterName, [Validators.required]],
        ownerName: [this.organization?.ownerName || ''], // 事業主氏名（修正17）
        phoneNumber: [submitterPhone]
      }),
      insuredPerson: this.fb.group({
        employeeId: [''], // 社員ID（編集時に使用、保存時は除外）
        insuranceNumber: [''],
        identificationType: ['personal_number', [Validators.required]],
        personalNumber: [''],
        basicPensionNumber: [''],
        birthDate: this.fb.group({
          era: ['reiwa', [Validators.required]],
          year: ['', [Validators.required]],
          month: ['', [Validators.required]],
          day: ['', [Validators.required]]
        }),
        newLastName: ['', [Validators.required]],
        newFirstName: ['', [Validators.required]],
        newLastNameKana: ['', [Validators.required]],
        newFirstNameKana: ['', [Validators.required]],
        oldLastName: ['', [Validators.required]],
        oldFirstName: ['', [Validators.required]],
        remarks: ['']
      })
    });
  }

  /**
   * 被保険者氏名変更（訂正）届フォームを初期化（内部申請用：事業所情報と届書提出日なし）
   */
  private initializeNameChangeFormInternal(): void {
    this.nameChangeFormInternal = this.fb.group({
      insuredPerson: this.fb.group({
        insuranceNumber: [''],
        identificationType: ['personal_number', [Validators.required]],
        personalNumber: [''],
        basicPensionNumber: [''],
        birthDate: this.fb.group({
          era: ['reiwa', [Validators.required]],
          year: ['', [Validators.required]],
          month: ['', [Validators.required]],
          day: ['', [Validators.required]]
        }),
        newLastName: ['', [Validators.required]],
        newFirstName: ['', [Validators.required]],
        newLastNameKana: ['', [Validators.required]],
        newFirstNameKana: ['', [Validators.required]],
        oldLastName: ['', [Validators.required]],
        oldFirstName: ['', [Validators.required]],
        remarks: ['']
      })
    });

    // 内部申請の場合、ログインユーザーの情報を変更前部分に自動転記（employeesが読み込まれている場合のみ）
    if (this.employees.length > 0) {
      this.autoFillCurrentUserInfoForNameChangeInternal();
    }
  }

  /**
   * 社員を選択して被保険者情報に自動入力（住所変更届用）
   */
  onEmployeeSelectForAddressChange(employeeId: string): void {
    const employee = this.employees.find(e => e.id === employeeId);
    if (!employee || !this.addressChangeForm) {
      return;
    }

    const insuredPersonGroup = this.addressChangeForm.get('insuredPerson') as FormGroup;
    if (!insuredPersonGroup) {
      return;
    }

    // 社員IDを保存
    insuredPersonGroup.patchValue({
      employeeId: employeeId
    });

    // 氏名を直接設定
    insuredPersonGroup.patchValue({
      lastName: employee.lastName,
      firstName: employee.firstName,
      lastNameKana: employee.lastNameKana,
      firstNameKana: employee.firstNameKana
    });

    // 生年月日を設定
    if (employee.birthDate) {
      const birthDate = employee.birthDate instanceof Date 
        ? employee.birthDate 
        : (employee.birthDate instanceof Timestamp ? employee.birthDate.toDate() : new Date(employee.birthDate));
      const birthDateInfo = this.convertToEraDate(birthDate);
      insuredPersonGroup.get('birthDate')?.patchValue(birthDateInfo);
    }

    // 被保険者整理番号
    if (employee.insuranceInfo?.healthInsuranceNumber) {
      insuredPersonGroup.patchValue({
        insuranceNumber: employee.insuranceInfo.healthInsuranceNumber
      });
    }

    // 個人番号または基礎年金番号
    if (employee.insuranceInfo?.myNumber) {
      insuredPersonGroup.patchValue({
        identificationType: 'personal_number',
        personalNumber: employee.insuranceInfo.myNumber
      });
    }
    // 基礎年金番号はマイナンバーがあっても設定する（申請フォームで選択可能なため）
    if (employee.insuranceInfo?.pensionNumber) {
      insuredPersonGroup.patchValue({
        basicPensionNumber: employee.insuranceInfo.pensionNumber
      });
      // マイナンバーがない場合は基礎年金番号を選択状態にする
      if (!employee.insuranceInfo?.myNumber) {
        insuredPersonGroup.patchValue({
          identificationType: 'basic_pension_number'
        });
      }
    }

    // 変更前住所を設定（officialを優先、郵便番号を含める）
    if (employee.address) {
      const address = employee.address.official;
      if (address) {
        const oldAddressParts = [
          address.postalCode ? `〒${address.postalCode}` : '',
          address.prefecture || '',
          address.city || '',
          address.street || '',
          address.building || ''
        ].filter(part => part).join(' ');
        
        insuredPersonGroup.patchValue({
          oldAddress: oldAddressParts
        });
      }
    }
  }

  /**
   * 社員を選択して被保険者情報に自動入力（氏名変更届用）
   */
  onEmployeeSelectForNameChange(employeeId: string): void {
    const employee = this.employees.find(e => e.id === employeeId);
    if (!employee || !this.nameChangeForm) {
      return;
    }

    const insuredPersonGroup = this.nameChangeForm.get('insuredPerson') as FormGroup;
    if (!insuredPersonGroup) {
      return;
    }

    // 社員IDを保存
    insuredPersonGroup.patchValue({
      employeeId: employeeId
    });

    // 生年月日を設定
    if (employee.birthDate) {
      const birthDate = employee.birthDate instanceof Date 
        ? employee.birthDate 
        : (employee.birthDate instanceof Timestamp ? employee.birthDate.toDate() : new Date(employee.birthDate));
      const birthDateInfo = this.convertToEraDate(birthDate);
      insuredPersonGroup.get('birthDate')?.patchValue(birthDateInfo);
    }

    // 被保険者整理番号
    if (employee.insuranceInfo?.healthInsuranceNumber) {
      insuredPersonGroup.patchValue({
        insuranceNumber: employee.insuranceInfo.healthInsuranceNumber
      });
    }

    // 個人番号または基礎年金番号
    if (employee.insuranceInfo?.myNumber) {
      insuredPersonGroup.patchValue({
        identificationType: 'personal_number',
        personalNumber: employee.insuranceInfo.myNumber
      });
    }
    // 基礎年金番号はマイナンバーがあっても設定する（申請フォームで選択可能なため）
    if (employee.insuranceInfo?.pensionNumber) {
      insuredPersonGroup.patchValue({
        basicPensionNumber: employee.insuranceInfo.pensionNumber
      });
      // マイナンバーがない場合は基礎年金番号を選択状態にする
      if (!employee.insuranceInfo?.myNumber) {
        insuredPersonGroup.patchValue({
          identificationType: 'basic_pension_number'
        });
      }
    }

    // 変更前氏名を設定
    insuredPersonGroup.patchValue({
      oldLastName: employee.lastName,
      oldFirstName: employee.firstName
    });
  }

  /**
   * 氏名変更届の内部申請用フォームにログインユーザーの情報を自動転記（変更前部分のみ）
   */
  private autoFillCurrentUserInfoForNameChangeInternal(): void {
    if (!this.employeeId || !this.nameChangeFormInternal) {
      return;
    }

    const employee = this.employees.find(e => e.id === this.employeeId);
    if (!employee) {
      return;
    }

    const insuredPersonGroup = this.nameChangeFormInternal.get('insuredPerson') as FormGroup;
    if (!insuredPersonGroup) {
      return;
    }

    // 生年月日を設定
    if (employee.birthDate) {
      const birthDate = employee.birthDate instanceof Date 
        ? employee.birthDate 
        : (employee.birthDate instanceof Timestamp ? employee.birthDate.toDate() : new Date(employee.birthDate));
      const birthDateInfo = this.convertToEraDate(birthDate);
      insuredPersonGroup.get('birthDate')?.patchValue(birthDateInfo);
    }

    // 被保険者整理番号
    if (employee.insuranceInfo?.healthInsuranceNumber) {
      insuredPersonGroup.patchValue({
        insuranceNumber: employee.insuranceInfo.healthInsuranceNumber
      });
    }

    // 個人番号または基礎年金番号
    if (employee.insuranceInfo?.myNumber) {
      insuredPersonGroup.patchValue({
        identificationType: 'personal_number',
        personalNumber: employee.insuranceInfo.myNumber
      });
    } else if (employee.insuranceInfo?.pensionNumber) {
      insuredPersonGroup.patchValue({
        identificationType: 'basic_pension_number',
        basicPensionNumber: employee.insuranceInfo.pensionNumber
      });
    }

    // 変更前氏名を設定
    insuredPersonGroup.patchValue({
      oldLastName: employee.lastName,
      oldFirstName: employee.firstName
    });

    // 変更後部分は空欄のまま（ユーザーが手入力）
  }

  /**
   * その他の被扶養者を追加
   */
  addOtherDependent(): void {
    // 現在アクティブなフォームからotherDependentsFormArrayを取得
    if (this.isDependentChangeFormInternal && this.dependentChangeFormInternal) {
      this.otherDependentsFormArray = this.dependentChangeFormInternal.get('otherDependents') as FormArray;
    } else if (this.isDependentChangeForm && this.dependentChangeForm) {
      this.otherDependentsFormArray = this.dependentChangeForm.get('otherDependents') as FormArray;
    }

    if (!this.otherDependentsFormArray) {
      return;
    }

    const dependentGroup = this.fb.group({
      lastName: ['', [Validators.required]],
      firstName: ['', [Validators.required]],
      lastNameKana: ['', [Validators.required]],
      firstNameKana: ['', [Validators.required]],
      birthDate: this.fb.group({
        era: ['reiwa', [Validators.required]],
        year: ['', [Validators.required]],
        month: ['', [Validators.required]],
        day: ['', [Validators.required]]
      }),
      gender: ['', [Validators.required]],
      relationship: ['', [Validators.required]],
      relationshipOther: [''],
      personalNumber: [''],
      address: this.fb.group({
        address: [''],
        livingTogether: ['']
      }),
      overseasException: [''],
      overseasExceptionStartDate: this.fb.group({
        era: ['reiwa'],
        year: [''],
        month: [''],
        day: ['']
      }),
      overseasExceptionStartReason: [''],
      overseasExceptionStartReasonOther: [''],
      overseasExceptionEndDate: this.fb.group({
        era: ['reiwa'],
        year: [''],
        month: [''],
        day: ['']
      }),
      overseasExceptionEndReason: [''],
      overseasExceptionEndReasonOther: [''],
      domesticTransferDate: this.fb.group({ // 国内転入の場合の日付
        era: ['reiwa'],
        year: [''],
        month: [''],
        day: ['']
      }),
      changeType: ['', [Validators.required]],
      // 異動種別「該当」の場合
      dependentStartDate: this.fb.group({
        era: ['reiwa'],
        year: [''],
        month: [''],
        day: ['']
      }),
      occupation: [''],
      occupationOther: [''],
      studentYear: [''], // 高・大学生の場合の学年
      income: [null],
      dependentStartReason: [''],
      dependentStartReasonOther: [''],
      // 異動種別「非該当」の場合
      dependentEndDate: this.fb.group({
        era: ['reiwa'],
        year: [''],
        month: [''],
        day: ['']
      }),
      dependentEndReason: [''],
      dependentEndReasonOther: [''],
      deathDate: this.fb.group({ // 死亡の場合の日付
        era: ['reiwa'],
        year: [''],
        month: [''],
        day: ['']
      }),
      remarks: [''],
      // 異動種別「変更」の場合の変更後情報
      changeAfter: this.fb.group({
        dependentStartDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        occupation: [''],
        occupationOther: [''],
        studentYear: [''],
        income: [null],
        dependentStartReason: [''],
        dependentStartReasonOther: [''],
        dependentEndDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        }),
        dependentEndReason: [''],
        dependentEndReasonOther: [''],
        deathDate: this.fb.group({
          era: ['reiwa'],
          year: [''],
          month: [''],
          day: ['']
        })
      }),
      certificateRequired: [false]
    });

    this.otherDependentsFormArray.push(dependentGroup);
  }

  /**
   * その他の被扶養者を削除
   */
  removeOtherDependent(index: number): void {
    // 現在アクティブなフォームからotherDependentsFormArrayを取得
    if (this.isDependentChangeFormInternal && this.dependentChangeFormInternal) {
      this.otherDependentsFormArray = this.dependentChangeFormInternal.get('otherDependents') as FormArray;
    } else if (this.isDependentChangeForm && this.dependentChangeForm) {
      this.otherDependentsFormArray = this.dependentChangeForm.get('otherDependents') as FormArray;
    }

    if (this.otherDependentsFormArray) {
      this.otherDependentsFormArray.removeAt(index);
    }
  }

  /**
   * その他の被扶養者のフォームグループを取得
   */
  getOtherDependentFormGroup(index: number): FormGroup {
    // 現在アクティブなフォームからotherDependentsFormArrayを取得
    if (this.isDependentChangeFormInternal && this.dependentChangeFormInternal) {
      this.otherDependentsFormArray = this.dependentChangeFormInternal.get('otherDependents') as FormArray;
    } else if (this.isDependentChangeForm && this.dependentChangeForm) {
      this.otherDependentsFormArray = this.dependentChangeForm.get('otherDependents') as FormArray;
    }

    return this.otherDependentsFormArray?.at(index) as FormGroup;
  }

  /**
   * 被保険者報酬月額算定基礎届フォームを初期化
   */
  private initializeRewardBaseForm(): void {
    const today = new Date();
    
    const submitterOfficeSymbol = this.organization?.insuranceSettings?.healthInsurance?.officeSymbol || '';
    const submitterOfficeNumber = this.organization?.insuranceSettings?.pensionInsurance?.officeNumber || '';
    const submitterAddress = this.buildAddressWithPostalCode();
    const submitterName = this.organization?.name || '';
    const submitterPhone = this.organization?.phoneNumber || '';

    this.rewardBaseForm = this.fb.group({
      businessInfo: this.fb.group({
        officeSymbol: [submitterOfficeSymbol],
        officeNumber: [submitterOfficeNumber], // 事業所番号
        officeAddress: [submitterAddress, [Validators.required]],
        officeName: [submitterName, [Validators.required]],
        ownerName: [this.organization?.ownerName || ''], // 事業主氏名（修正17）
        phoneNumber: [submitterPhone]
      }),
      insuredPersons: this.fb.array([])
    });

    this.rewardBasePersonsFormArray = this.rewardBaseForm.get('insuredPersons') as FormArray;
    this.addRewardBasePerson();
  }

  /**
   * 被保険者報酬月額変更届フォームを初期化
   */
  private initializeRewardChangeForm(): void {
    const today = new Date();
    
    const submitterOfficeSymbol = this.organization?.insuranceSettings?.healthInsurance?.officeSymbol || '';
    const submitterAddress = this.organization?.address 
      ? `${this.organization.address.prefecture}${this.organization.address.city}${this.organization.address.street}${this.organization.address.building || ''}`
      : '';
    const submitterName = this.organization?.name || '';
    const submitterPhone = this.organization?.phoneNumber || '';

    this.rewardChangeForm = this.fb.group({
      businessInfo: this.fb.group({
        officeSymbol: [submitterOfficeSymbol],
        officeAddress: [submitterAddress, [Validators.required]],
        officeName: [submitterName, [Validators.required]],
        ownerName: [''],
        phoneNumber: [submitterPhone]
      }),
      insuredPersons: this.fb.array([])
    });

    this.rewardChangePersonsFormArray = this.rewardChangeForm.get('insuredPersons') as FormArray;
    this.addRewardChangePerson();
  }

  /**
   * 被保険者賞与支払届フォームを初期化
   */
  private initializeBonusPaymentForm(): void {
    const today = new Date();
    
    const submitterOfficeSymbol = this.organization?.insuranceSettings?.healthInsurance?.officeSymbol || '';
    const submitterOfficeNumber = this.organization?.insuranceSettings?.pensionInsurance?.officeNumber || '';
    const submitterAddress = this.buildAddressWithPostalCode();
    const submitterName = this.organization?.name || '';
    const submitterPhone = this.organization?.phoneNumber || '';

    this.bonusPaymentForm = this.fb.group({
      businessInfo: this.fb.group({
        officeSymbol: [submitterOfficeSymbol],
        officeNumber: [submitterOfficeNumber], // 事業所番号
        officeAddress: [submitterAddress, [Validators.required]],
        officeName: [submitterName, [Validators.required]],
        ownerName: [this.organization?.ownerName || ''], // 事業主氏名（修正17）
        phoneNumber: [submitterPhone]
      }),
      commonBonusPaymentDate: this.fb.group({
        era: ['reiwa', [Validators.required]],
        year: ['', [Validators.required]],
        month: ['', [Validators.required]],
        day: ['', [Validators.required]]
      }),
      insuredPersons: this.fb.array([])
    });

    this.bonusPaymentPersonsFormArray = this.bonusPaymentForm.get('insuredPersons') as FormArray;
    this.addBonusPaymentPerson();
  }

  /**
   * 被保険者報酬月額算定基礎届の被保険者を追加
   */
  addRewardBasePerson(): void {
    if (!this.rewardBasePersonsFormArray) {
      return;
    }

    const personGroup = this.fb.group({
      employeeId: [null], // 社員ID（社員選択時に使用）
      insuranceNumber: [''],
      name: ['', [Validators.required]],
      birthDate: this.fb.group({
        era: ['reiwa', [Validators.required]],
        year: ['', [Validators.required]],
        month: ['', [Validators.required]],
        day: ['', [Validators.required]]
      }),
      applicableDate: this.fb.group({
        era: ['reiwa', [Validators.required]],
        year: ['', [Validators.required]],
        month: ['', [Validators.required]]
      }),
      previousStandardReward: this.fb.group({
        healthInsurance: [null],
        pensionInsurance: [null]
      }),
      previousChangeDate: this.fb.group({
        era: ['reiwa'],
        year: [''],
        month: ['']
      }),
      salaryChange: this.fb.group({
        month: [''],
        type: [''] // 昇給、降給
      }),
      retroactivePayment: this.fb.array([
        this.fb.group({ month: ['april'], amount: [null] }),
        this.fb.group({ month: ['may'], amount: [null] }),
        this.fb.group({ month: ['june'], amount: [null] })
      ]),
      salaryMonths: this.fb.array([
        this.createSalaryMonthGroup('april'),
        this.createSalaryMonthGroup('may'),
        this.createSalaryMonthGroup('june')
      ]),
      total: [null], // 総計
      average: [null], // 平均額
      adjustedAverage: [null], // 修正平均額
      remarks: [''],
      remarksOther: [''],
      identificationType: ['personal_number'], // 個人番号 or 基礎年金番号（備考で70歳以上被用者算定を選択した時）
      personalNumber: [''], // 個人番号（備考で70歳以上被用者算定を選択した時）
      basicPensionNumber: [''] // 基礎年金番号（備考で70歳以上被用者算定を選択した時）
    });

    // 給与支給月ごとの合計を自動計算
    this.setupSalaryMonthCalculations(personGroup);

    this.rewardBasePersonsFormArray.push(personGroup);
  }

  /**
   * 被保険者報酬月額変更届の被保険者を追加
   */
  addRewardChangePerson(): void {
    if (!this.rewardChangePersonsFormArray) {
      return;
    }

    const personGroup = this.fb.group({
      insuranceNumber: [''],
      name: ['', [Validators.required]],
      birthDate: this.fb.group({
        era: ['reiwa', [Validators.required]],
        year: ['', [Validators.required]],
        month: ['', [Validators.required]],
        day: ['', [Validators.required]]
      }),
      changeDate: this.fb.group({
        era: ['reiwa', [Validators.required]],
        year: ['', [Validators.required]],
        month: ['', [Validators.required]]
      }),
      previousStandardReward: this.fb.group({
        healthInsurance: [null],
        pensionInsurance: [null]
      }),
      previousChangeDate: this.fb.group({
        era: ['reiwa'],
        year: [''],
        month: ['']
      }),
      salaryChange: this.fb.group({
        month: [''],
        type: [''] // 昇給、降給
      }),
      firstMonth: [null], // 初月（1-12）
      retroactivePayment: this.fb.array([
        this.fb.group({ month: [null], amount: [null] }),
        this.fb.group({ month: [null], amount: [null] }),
        this.fb.group({ month: [null], amount: [null] })
      ]),
      salaryMonths: this.fb.array([
        this.createSalaryMonthGroup(null),
        this.createSalaryMonthGroup(null),
        this.createSalaryMonthGroup(null)
      ]),
      total: [null], // 総計
      average: [null], // 平均額
      adjustedAverage: [null], // 修正平均額
      remarks: [''],
      remarksOther: [''],
      personalNumber: [''] // 備考で70歳以上被用者算定を選択した時
    });

    // 初月の変更を監視して、自動的に次の2か月を設定
    const firstMonthControl = personGroup.get('firstMonth');
    if (firstMonthControl) {
      firstMonthControl.valueChanges.subscribe((firstMonth: number | null) => {
        if (firstMonth !== null && firstMonth >= 1 && firstMonth <= 12) {
          const salaryMonthsArray = personGroup.get('salaryMonths') as FormArray;
          const retroactivePaymentArray = personGroup.get('retroactivePayment') as FormArray;
          
          // 給与支給月を自動設定
          for (let i = 0; i < 3; i++) {
            const monthValue = ((firstMonth - 1 + i) % 12) + 1;
            const monthGroup = salaryMonthsArray.at(i) as FormGroup;
            monthGroup.patchValue({ month: monthValue }, { emitEvent: false });
            
            // 遡及支払額の月も自動設定
            const retroGroup = retroactivePaymentArray.at(i) as FormGroup;
            retroGroup.patchValue({ month: monthValue }, { emitEvent: false });
          }
        }
      });
    }

    // 給与支給月ごとの合計を自動計算
    this.setupSalaryMonthCalculations(personGroup);

    this.rewardChangePersonsFormArray.push(personGroup);
  }

  /**
   * 被保険者賞与支払届の被保険者を追加
   */
  addBonusPaymentPerson(): void {
    if (!this.bonusPaymentPersonsFormArray) {
      return;
    }

    const personGroup = this.fb.group({
      employeeId: [null], // 社員ID（社員選択時に使用）
      insuranceNumber: [''],
      name: ['', [Validators.required]],
      birthDate: this.fb.group({
        era: ['reiwa', [Validators.required]],
        year: ['', [Validators.required]],
        month: ['', [Validators.required]],
        day: ['', [Validators.required]]
      }),
      bonusPaymentDate: this.fb.group({
        era: ['reiwa'],
        year: [''],
        month: [''],
        day: ['']
      }),
      paymentAmount: this.fb.group({
        currency: [null],
        inKind: [null]
      }),
      bonusAmount: [null], // 賞与額（千円未満切り捨て）
      remarks: ['']
    });

    // 賞与支払額の合計を自動計算
    const currencyControl = personGroup.get('paymentAmount.currency');
    const inKindControl = personGroup.get('paymentAmount.inKind');
    const bonusAmountControl = personGroup.get('bonusAmount');

    if (currencyControl && inKindControl && bonusAmountControl) {
      currencyControl.valueChanges.subscribe(() => {
        this.calculateBonusAmount(personGroup);
      });
      inKindControl.valueChanges.subscribe(() => {
        this.calculateBonusAmount(personGroup);
      });
    }

    this.bonusPaymentPersonsFormArray.push(personGroup);
  }

  /**
   * 社員を選択して被保険者情報に自動入力（賞与支払届用）
   */
  onEmployeeSelectForBonusPayment(index: number, employeeId: string): void {
    const employee = this.employees.find(e => e.id === employeeId);
    if (!employee) {
      return;
    }

    const personGroup = this.getBonusPaymentPersonFormGroup(index);
    if (!personGroup) {
      return;
    }

    // 被保険者整理番号
    if (employee.insuranceInfo?.healthInsuranceNumber) {
      personGroup.patchValue({
        insuranceNumber: employee.insuranceInfo.healthInsuranceNumber
      });
    }

    // 氏名を設定（賞与支払届はnameフィールドに結合）
    const fullName = `${employee.lastName} ${employee.firstName}`.trim();
    personGroup.patchValue({
      name: fullName
    });

    // 生年月日を設定
    if (employee.birthDate) {
      const birthDate = employee.birthDate instanceof Date 
        ? employee.birthDate 
        : (employee.birthDate instanceof Timestamp ? employee.birthDate.toDate() : new Date(employee.birthDate));
      const birthDateInfo = this.convertToEraDate(birthDate);
      personGroup.get('birthDate')?.patchValue(birthDateInfo);
    }

    // 社員IDを保存
    personGroup.patchValue({
      employeeId: employeeId
    });
  }

  /**
   * 社員を選択して被保険者情報に自動入力（算定基礎届用）
   */
  async onEmployeeSelectForRewardBase(index: number, employeeId: string): Promise<void> {
    const employee = this.employees.find(e => e.id === employeeId);
    if (!employee) {
      return;
    }

    const personGroup = this.getRewardBasePersonFormGroup(index);
    if (!personGroup) {
      return;
    }

    // 被保険者整理番号
    if (employee.insuranceInfo?.healthInsuranceNumber) {
      personGroup.patchValue({
        insuranceNumber: employee.insuranceInfo.healthInsuranceNumber
      });
    }

    // 氏名を設定
    const fullName = `${employee.lastName} ${employee.firstName}`.trim();
    personGroup.patchValue({
      name: fullName
    });

    // 生年月日を設定
    if (employee.birthDate) {
      const birthDate = employee.birthDate instanceof Date 
        ? employee.birthDate 
        : (employee.birthDate instanceof Timestamp ? employee.birthDate.toDate() : new Date(employee.birthDate));
      const birthDateInfo = this.convertToEraDate(birthDate);
      personGroup.get('birthDate')?.patchValue(birthDateInfo);
    }

    // 従前の標準報酬月額（健康保険・厚生年金ともに現在の標準報酬月額を転記）
    const currentStandardReward = employee.insuranceInfo?.standardReward;
    if (currentStandardReward) {
      personGroup.get('previousStandardReward')?.patchValue({
        healthInsurance: currentStandardReward,
        pensionInsurance: currentStandardReward
      });
    }

    // 従前改定月（現在の等級等適用年月を転記）
    if (employee.insuranceInfo?.gradeAndStandardRewardEffectiveDate) {
      const effectiveDate = employee.insuranceInfo.gradeAndStandardRewardEffectiveDate instanceof Date 
        ? employee.insuranceInfo.gradeAndStandardRewardEffectiveDate 
        : (employee.insuranceInfo.gradeAndStandardRewardEffectiveDate instanceof Timestamp 
          ? employee.insuranceInfo.gradeAndStandardRewardEffectiveDate.toDate() 
          : new Date(employee.insuranceInfo.gradeAndStandardRewardEffectiveDate));
      const effectiveDateInfo = this.convertToEraDate(effectiveDate);
      personGroup.get('previousChangeDate')?.patchValue({
        era: effectiveDateInfo.era,
        year: effectiveDateInfo.year,
        month: effectiveDateInfo.month
      });
    }

    // 適用年月を現在から次の9月に自動設定
    const now = new Date();
    let targetYear = now.getFullYear();
    if (now.getMonth() + 1 >= 9) {
      // 9月以降なら来年の9月
      targetYear++;
    }
    const targetDate = new Date(targetYear, 8, 1); // 9月1日
    const era = this.convertToEraDate(targetDate);
    personGroup.get('applicableDate')?.patchValue({
      era: era.era,
      year: era.year,
      month: 9
    });

    // 算定計算履歴から遡及支払額、基礎日数、通貨を引用
    try {
      const calculations = await this.standardRewardCalculationService.getCalculationsByEmployee(employeeId, 'standard');
      if (calculations && calculations.length > 0) {
        // 最新の算定計算履歴を取得（calculatedAtが最新）
        const latestCalculation = calculations[0];
        
        if (latestCalculation.salaryData && latestCalculation.salaryData.length > 0) {
          const salaryMonthsArray = personGroup.get('salaryMonths') as FormArray;
          const retroactivePaymentArray = personGroup.get('retroactivePayment') as FormArray;

          // 給与データを設定（4月、5月、6月の順）
          latestCalculation.salaryData.forEach((salary, index) => {
            if (index < salaryMonthsArray.length) {
              const monthGroup = salaryMonthsArray.at(index) as FormGroup;
              // 基礎日数と通貨（総支給）を設定
              monthGroup.patchValue({
                baseDays: salary.baseDays,
                currency: salary.totalPayment,
                inKind: 0,
                total: salary.totalPayment
              });
            }

            // 遡及支払額を設定
            if (salary.retroactivePayment && salary.retroactivePayment > 0 && index < retroactivePaymentArray.length) {
              const retroGroup = retroactivePaymentArray.at(index) as FormGroup;
              const monthName = this.getMonthName(salary.month);
              retroGroup.patchValue({
                month: monthName,
                amount: salary.retroactivePayment
              });
            }
          });
        }
      }
    } catch (error) {
      console.error('算定計算履歴の取得に失敗しました:', error);
      // エラーが発生しても社員情報の自動転記は続行
    }

    // 社員IDを保存
    personGroup.patchValue({
      employeeId: employeeId
    });
  }

  /**
   * 給与支給月のフォームグループを作成
   */
  private createSalaryMonthGroup(monthValue: number | string | null): FormGroup {
    return this.fb.group({
      month: [monthValue], // 月番号（1-12）、文字列キー、またはnull
      baseDays: [null], // 基礎日数
      currency: [null], // 通貨
      inKind: [null], // 現物
      total: [{ value: null, disabled: false }] // 合計（自動計算）
    });
  }

  /**
   * 給与支給月ごとの合計計算を設定
   */
  private setupSalaryMonthCalculations(personGroup: FormGroup): void {
    const salaryMonthsArray = personGroup.get('salaryMonths') as FormArray;
    
    salaryMonthsArray.controls.forEach((control) => {
      const monthGroup = control as FormGroup;
      const currencyControl = monthGroup.get('currency');
      const inKindControl = monthGroup.get('inKind');
      const totalControl = monthGroup.get('total');

      if (currencyControl && inKindControl && totalControl) {
        currencyControl.valueChanges.subscribe(() => {
          this.calculateSalaryMonthTotal(monthGroup);
          this.calculateRewardTotals(personGroup);
        });
        inKindControl.valueChanges.subscribe(() => {
          this.calculateSalaryMonthTotal(monthGroup);
          this.calculateRewardTotals(personGroup);
        });
      }
    });

    // 遡及支払額の変更も監視
    const retroactivePaymentArray = personGroup.get('retroactivePayment') as FormArray;
    retroactivePaymentArray.controls.forEach((control) => {
      const retroGroup = control as FormGroup;
      const amountControl = retroGroup.get('amount');
      if (amountControl) {
        amountControl.valueChanges.subscribe(() => {
          this.calculateRewardTotals(personGroup);
        });
      }
    });
  }

  /**
   * 給与支給月の合計を計算
   */
  private calculateSalaryMonthTotal(monthGroup: FormGroup): void {
    const currency = monthGroup.get('currency')?.value;
    const inKind = monthGroup.get('inKind')?.value;
    const totalControl = monthGroup.get('total');

    if (totalControl) {
      const currencyValue = currency ? Number(currency) : 0;
      const inKindValue = inKind ? Number(inKind) : 0;
      const calculatedTotal = currencyValue + inKindValue;
      totalControl.setValue(calculatedTotal || null, { emitEvent: false });
    }
  }

  /**
   * 報酬月額の総計・平均額・修正平均額を計算
   */
  private calculateRewardTotals(personGroup: FormGroup): void {
    const salaryMonthsArray = personGroup.get('salaryMonths') as FormArray;
    const retroactivePaymentArray = personGroup.get('retroactivePayment') as FormArray;

    // 基礎日数が17日以上の月のみを集計
    const validMonths: number[] = [];
    salaryMonthsArray.controls.forEach((control) => {
      const monthGroup = control as FormGroup;
      const baseDays = monthGroup.get('baseDays')?.value;
      const total = monthGroup.get('total')?.value;
      if (baseDays && baseDays >= 17 && total) {
        validMonths.push(Number(total));
      }
    });

    // 総計
    const total = validMonths.reduce((sum, val) => sum + val, 0);
    personGroup.patchValue({ total: total || null }, { emitEvent: false });

    // 平均額（円未満切り捨て）
    const average = validMonths.length > 0 ? Math.floor(total / validMonths.length) : null;
    personGroup.patchValue({ average: average || null }, { emitEvent: false });

    // 修正平均額（遡及支払額を考慮、円未満切り捨て）
    let adjustedTotal = total;
    retroactivePaymentArray.controls.forEach((control) => {
      const retroGroup = control as FormGroup;
      const amount = retroGroup.get('amount')?.value;
      if (amount) {
        adjustedTotal -= Number(amount);
      }
    });
    const adjustedAverage = validMonths.length > 0 ? Math.floor(adjustedTotal / validMonths.length) : null;
    personGroup.patchValue({ adjustedAverage: adjustedAverage || null }, { emitEvent: false });
  }

  /**
   * 賞与額を計算（千円未満切り捨て）
   */
  private calculateBonusAmount(personGroup: FormGroup): void {
    const currency = personGroup.get('paymentAmount.currency')?.value;
    const inKind = personGroup.get('paymentAmount.inKind')?.value;
    const bonusAmountControl = personGroup.get('bonusAmount');

    if (bonusAmountControl) {
      const currencyValue = currency ? Number(currency) : 0;
      const inKindValue = inKind ? Number(inKind) : 0;
      const total = currencyValue + inKindValue;
      // 千円未満切り捨て
      const bonusAmount = Math.floor(total / 1000) * 1000;
      bonusAmountControl.setValue(bonusAmount || null, { emitEvent: false });
    }
  }

  /**
   * ステップ2のフォームコントロールを取得
   */
  getStep2FormControl(): FormGroup {
    if (this.isInsuranceAcquisitionForm && this.insuranceAcquisitionForm) {
      return this.insuranceAcquisitionForm;
    } else if (this.isInsuranceLossForm && this.insuranceLossForm) {
      return this.insuranceLossForm;
    } else if (this.isDependentChangeForm && this.dependentChangeForm) {
      return this.dependentChangeForm;
    } else if (this.isAddressChangeForm && this.addressChangeForm) {
      return this.addressChangeForm;
    } else if (this.isNameChangeForm && this.nameChangeForm) {
      return this.nameChangeForm;
    } else if (this.isRewardBaseForm && this.rewardBaseForm) {
      return this.rewardBaseForm;
    } else if (this.isRewardChangeForm && this.rewardChangeForm) {
      return this.rewardChangeForm;
    } else if (this.isBonusPaymentForm && this.bonusPaymentForm) {
      return this.bonusPaymentForm;
    } else if (this.isDependentChangeFormInternal && this.dependentChangeFormInternal) {
      return this.dependentChangeFormInternal;
    } else if (this.isAddressChangeFormInternal && this.addressChangeFormInternal) {
      return this.addressChangeFormInternal;
    } else if (this.isNameChangeFormInternal && this.nameChangeFormInternal) {
      return this.nameChangeFormInternal;
    }
    return this.applicationDataForm;
  }

  /**
   * 報酬月額算定基礎届の被保険者フォームグループを取得
   */
  getRewardBasePersonFormGroup(index: number): FormGroup {
    return this.rewardBasePersonsFormArray?.at(index) as FormGroup;
  }

  /**
   * 報酬月額算定基礎届の被保険者の遡及支払額FormArrayを取得
   */
  getRewardBaseRetroactivePaymentArray(index: number): FormArray {
    const personGroup = this.getRewardBasePersonFormGroup(index);
    return personGroup.get('retroactivePayment') as FormArray;
  }

  /**
   * 報酬月額算定基礎届の被保険者の給与支給月FormArrayを取得
   */
  getRewardBaseSalaryMonthsArray(index: number): FormArray {
    const personGroup = this.getRewardBasePersonFormGroup(index);
    return personGroup.get('salaryMonths') as FormArray;
  }

  /**
   * 報酬月額算定基礎届の被保険者を削除
   */
  removeRewardBasePerson(index: number): void {
    if (this.rewardBasePersonsFormArray && this.rewardBasePersonsFormArray.length > 1) {
      this.rewardBasePersonsFormArray.removeAt(index);
    }
  }

  /**
   * 報酬月額変更届の被保険者フォームグループを取得
   */
  getRewardChangePersonFormGroup(index: number): FormGroup {
    return this.rewardChangePersonsFormArray?.at(index) as FormGroup;
  }

  /**
   * 報酬月額変更届の被保険者の遡及支払額FormArrayを取得
   */
  getRewardChangeRetroactivePaymentArray(index: number): FormArray {
    const personGroup = this.getRewardChangePersonFormGroup(index);
    return personGroup.get('retroactivePayment') as FormArray;
  }

  /**
   * 報酬月額変更届の被保険者の給与支給月FormArrayを取得
   */
  getRewardChangeSalaryMonthsArray(index: number): FormArray {
    const personGroup = this.getRewardChangePersonFormGroup(index);
    return personGroup.get('salaryMonths') as FormArray;
  }

  /**
   * 報酬月額変更届の被保険者を削除
   */
  removeRewardChangePerson(index: number): void {
    if (this.rewardChangePersonsFormArray && this.rewardChangePersonsFormArray.length > 1) {
      this.rewardChangePersonsFormArray.removeAt(index);
    }
  }

  /**
   * 賞与支払届の被保険者フォームグループを取得
   */
  getBonusPaymentPersonFormGroup(index: number): FormGroup {
    return this.bonusPaymentPersonsFormArray?.at(index) as FormGroup;
  }

  /**
   * 賞与支払届の被保険者を削除
   */
  removeBonusPaymentPerson(index: number): void {
    if (this.bonusPaymentPersonsFormArray && this.bonusPaymentPersonsFormArray.length > 1) {
      this.bonusPaymentPersonsFormArray.removeAt(index);
    }
  }

  /**
   * 被扶養者異動届：被保険者情報のフォームグループを取得
   */
  getDependentChangeInsuredPersonFormGroup(): FormGroup {
    // 現在アクティブなフォームからinsuredPersonを取得
    if (this.isDependentChangeFormInternal && this.dependentChangeFormInternal) {
      return this.dependentChangeFormInternal.get('insuredPerson') as FormGroup;
    } else if (this.isDependentChangeForm && this.dependentChangeForm) {
      return this.dependentChangeForm.get('insuredPerson') as FormGroup;
    }
    return null as any;
  }

  /**
   * 被扶養者異動届：配偶者被扶養者のフォームグループを取得
   */
  getDependentChangeSpouseFormGroup(): FormGroup {
    // 現在アクティブなフォームからspouseDependentを取得
    if (this.isDependentChangeFormInternal && this.dependentChangeFormInternal) {
      return this.dependentChangeFormInternal.get('spouseDependent') as FormGroup;
    } else if (this.isDependentChangeForm && this.dependentChangeForm) {
      return this.dependentChangeForm.get('spouseDependent') as FormGroup;
    }
    return null as any;
  }

  /**
   * 被扶養者異動届：配偶者の異動がない場合かどうか
   */
  isSpouseNoChange(): boolean {
    return this.getDependentChangeSpouseFormGroup()?.get('noChange')?.value === true;
  }

  /**
   * 被扶養者異動届：配偶者の異動種別が「該当」かどうか
   */
  isSpouseChangeTypeApplicable(): boolean {
    return this.getDependentChangeSpouseFormGroup()?.get('changeType')?.value === 'applicable';
  }

  /**
   * 被扶養者異動届：配偶者の異動種別が「非該当」かどうか
   */
  isSpouseChangeTypeNotApplicable(): boolean {
    return this.getDependentChangeSpouseFormGroup()?.get('changeType')?.value === 'not_applicable';
  }

  /**
   * 被扶養者異動届：配偶者の異動種別が「変更」かどうか
   */
  isSpouseChangeTypeChange(): boolean {
    return this.getDependentChangeSpouseFormGroup()?.get('changeType')?.value === 'change';
  }

  /**
   * 被扶養者異動届：配偶者の異動終了理由が「死亡」かどうか
   */
  isSpouseEndReasonDeath(): boolean {
    return this.getDependentChangeSpouseFormGroup()?.get('dependentEndReason')?.value === 'death';
  }

  /**
   * 被扶養者異動届：配偶者の海外特例要件が「該当」かどうか
   */
  isSpouseOverseasExceptionApplicable(): boolean {
    return this.getDependentChangeSpouseFormGroup()?.get('overseasException')?.value === 'applicable';
  }

  /**
   * 被扶養者異動届：配偶者の海外特例要件が「非該当」かどうか
   */
  isSpouseOverseasExceptionNotApplicable(): boolean {
    return this.getDependentChangeSpouseFormGroup()?.get('overseasException')?.value === 'not_applicable';
  }

  /**
   * 被扶養者異動届：配偶者の海外特例要件終了理由が「国内転入」かどうか
   */
  isSpouseOverseasExceptionEndReasonDomesticTransfer(): boolean {
    return this.getDependentChangeSpouseFormGroup()?.get('overseasExceptionEndReason')?.value === 'domestic_transfer';
  }

  /**
   * 被扶養者異動届：その他被扶養者の異動種別が「該当」かどうか
   */
  isOtherDependentChangeTypeApplicable(index: number): boolean {
    return this.getOtherDependentFormGroup(index)?.get('changeType')?.value === 'applicable';
  }

  /**
   * 被扶養者異動届：その他被扶養者の異動種別が「非該当」かどうか
   */
  isOtherDependentChangeTypeNotApplicable(index: number): boolean {
    return this.getOtherDependentFormGroup(index)?.get('changeType')?.value === 'not_applicable';
  }

  /**
   * 被扶養者異動届：その他被扶養者の異動種別が「変更」かどうか
   */
  isOtherDependentChangeTypeChange(index: number): boolean {
    return this.getOtherDependentFormGroup(index)?.get('changeType')?.value === 'change';
  }

  /**
   * 被扶養者異動届：その他被扶養者の異動終了理由が「死亡」かどうか
   */
  isOtherDependentEndReasonDeath(index: number): boolean {
    return this.getOtherDependentFormGroup(index)?.get('dependentEndReason')?.value === 'death';
  }

  /**
   * 被扶養者異動届：その他被扶養者の職業が「高・大学生」かどうか
   */
  isOtherDependentOccupationStudent(index: number): boolean {
    const occupation = this.getOtherDependentFormGroup(index)?.get('occupation')?.value;
    return occupation === 'student_high_school' || occupation === 'student_university';
  }

  /**
   * 被扶養者異動届：その他被扶養者の海外特例要件が「該当」かどうか
   */
  isOtherDependentOverseasExceptionApplicable(index: number): boolean {
    return this.getOtherDependentFormGroup(index)?.get('overseasException')?.value === 'applicable';
  }

  /**
   * 被扶養者異動届：その他被扶養者の海外特例要件が「非該当」かどうか
   */
  isOtherDependentOverseasExceptionNotApplicable(index: number): boolean {
    return this.getOtherDependentFormGroup(index)?.get('overseasException')?.value === 'not_applicable';
  }

  /**
   * 被扶養者異動届：その他被扶養者の海外特例要件終了理由が「国内転入」かどうか
   */
  isOtherDependentOverseasExceptionEndReasonDomesticTransfer(index: number): boolean {
    return this.getOtherDependentFormGroup(index)?.get('overseasExceptionEndReason')?.value === 'domestic_transfer';
  }

  /**
   * 生年月日を元号形式の文字列に変換（例：7-060528）
   */
  formatBirthDateForReward(birthDateControl: any): string {
    if (!birthDateControl) {
      return '';
    }
    
    const birthDateGroup = birthDateControl as FormGroup;
    const era = birthDateGroup.get('era')?.value;
    const year = birthDateGroup.get('year')?.value;
    const month = birthDateGroup.get('month')?.value;
    const day = birthDateGroup.get('day')?.value;

    if (!era || !year || !month || !day) {
      return '';
    }

    const eraCode: Record<string, string> = {
      'showa': '5',
      'heisei': '7',
      'reiwa': '3'
    };

    const eraNum = eraCode[era] || '';
    const yearStr = String(year).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');

    return `${eraNum}-${yearStr}${monthStr}${dayStr}`;
  }

  /**
   * 給与支給月のラベルを取得
   */
  getSalaryMonthLabel(monthValue: string | number | null): string {
    if (monthValue === null || monthValue === undefined) {
      return '';
    }
    
    // 数値の場合（1-12）は「○月」形式で返す
    const monthNum = typeof monthValue === 'string' ? parseInt(monthValue, 10) : monthValue;
    if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
      return `${monthNum}月`;
    }
    
    // 文字列キーの場合（既存のラベル）
    return this.salaryMonthLabels[monthValue.toString()] || monthValue.toString();
  }

  /**
   * 70歳以上被用者算定の備考が選択されているかどうかを判定
   */
  isOver70RemarkSelected(index: number, formType: 'base' | 'change'): boolean {
    let personGroup: FormGroup | null = null;
    if (formType === 'base') {
      personGroup = this.getRewardBasePersonFormGroup(index);
    } else {
      personGroup = this.getRewardChangePersonFormGroup(index);
    }
    return personGroup?.get('remarks')?.value === 'over70';
  }

  // Storageルールで許可されているファイル形式（デフォルト）
  private readonly DEFAULT_ALLOWED_FORMATS = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'xlsx', 'xls', 'docx', 'doc'];
  private readonly DEFAULT_MAX_FILE_SIZE_MB = 50; // デフォルトの最大ファイルサイズ（MB）

  /**
   * ファイル選択
   */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const files = Array.from(input.files);
    const validFiles: File[] = [];
    const errors: string[] = [];

    // 申請種別ごとの添付ファイル設定を取得
    const allowedFormats = this.getAllowedFormats();
    const maxFileSizeMB = this.getMaxFileSizeMB();

    // 既存のファイル名のセットを作成（重複チェック用）
    const existingFileNames = new Set(this.attachments.map(f => f.name));

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
          const index = this.attachments.findIndex(f => f.name === file.name);
          if (index >= 0) {
            this.attachments.splice(index, 1);
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
    if (!this.selectedApplicationType || !this.organization) {
      return this.DEFAULT_ALLOWED_FORMATS;
    }

    // 申請種別ごとの添付ファイル設定を取得
    const attachmentSetting = this.organization.applicationFlowSettings?.attachmentSettings?.find(
      setting => setting.applicationTypeId === this.selectedApplicationType?.id
    );

    // 設定がある場合
    if (attachmentSetting?.allowedFormats && attachmentSetting.allowedFormats.length > 0) {
      return attachmentSetting.allowedFormats;
    }

    // 設定がない場合（空配列または未設定）は、Storageルールで許可されている形式をデフォルトとして使用
    return this.DEFAULT_ALLOWED_FORMATS;
  }

  /**
   * 最大ファイルサイズ（MB）を取得
   */
  private getMaxFileSizeMB(): number {
    if (!this.selectedApplicationType || !this.organization) {
      return this.DEFAULT_MAX_FILE_SIZE_MB;
    }

    // 申請種別ごとの添付ファイル設定を取得
    const attachmentSetting = this.organization.applicationFlowSettings?.attachmentSettings?.find(
      setting => setting.applicationTypeId === this.selectedApplicationType?.id
    );

    // 設定がある場合
    if (attachmentSetting?.maxFileSize && attachmentSetting.maxFileSize > 0) {
      return attachmentSetting.maxFileSize;
    }

    // 設定がない場合はデフォルト値を使用
    return this.DEFAULT_MAX_FILE_SIZE_MB;
  }

  /**
   * ファイルを削除
   */
  removeFile(index: number): void {
    this.attachments.splice(index, 1);
  }

  /**
   * 申請を作成
   */
  async createApplication(status: ApplicationStatus = 'created'): Promise<void> {
    if (!this.selectedApplicationType || !this.organizationId) {
      return;
    }

    if (this.applicationTypeForm.invalid) {
      this.snackBar.open('申請種別を選択してください', '閉じる', { duration: 3000 });
      return;
    }

    // 内部申請の場合はemployeeIdが必須
    if (this.selectedApplicationType.category === 'internal' && !this.employeeId) {
      this.snackBar.open('社員情報が取得できません', '閉じる', { duration: 3000 });
      return;
    }

    // 申請種別ごとのフォームをバリデーション
    let formToValidate: FormGroup | null = null;
    if (this.isInsuranceAcquisitionForm && this.insuranceAcquisitionForm) {
      formToValidate = this.insuranceAcquisitionForm;
    } else if (this.isInsuranceLossForm && this.insuranceLossForm) {
      formToValidate = this.insuranceLossForm;
    } else if (this.isDependentChangeForm && this.dependentChangeForm) {
      formToValidate = this.dependentChangeForm;
    } else if (this.isAddressChangeForm && this.addressChangeForm) {
      formToValidate = this.addressChangeForm;
    } else if (this.isNameChangeForm && this.nameChangeForm) {
      formToValidate = this.nameChangeForm;
    } else if (this.isRewardBaseForm && this.rewardBaseForm) {
      formToValidate = this.rewardBaseForm;
    } else if (this.isRewardChangeForm && this.rewardChangeForm) {
      formToValidate = this.rewardChangeForm;
    } else if (this.isBonusPaymentForm && this.bonusPaymentForm) {
      formToValidate = this.bonusPaymentForm;
    } else if (this.isDependentChangeFormInternal && this.dependentChangeFormInternal) {
      formToValidate = this.dependentChangeFormInternal;
    } else if (this.isAddressChangeFormInternal && this.addressChangeFormInternal) {
      formToValidate = this.addressChangeFormInternal;
    } else if (this.isNameChangeFormInternal && this.nameChangeFormInternal) {
      formToValidate = this.nameChangeFormInternal;
    }

    if (formToValidate) {
      if (formToValidate.invalid) {
        this.snackBar.open('申請内容を正しく入力してください', '閉じる', { duration: 3000 });
        return;
      }
    } else {
      // 通常のフォームのバリデーション
      if (this.applicationDataForm.invalid) {
        this.snackBar.open('申請内容を入力してください', '閉じる', { duration: 3000 });
        return;
      }
    }

    // status === 'created'の場合、確認ダイアログを表示
    if (status === 'created') {
      const confirmed = confirm('この申請を作成しますか？作成後は編集できなくなります。');
      if (!confirmed) {
        return;
      }
    }

    // 権限チェック: 管理者モード時は外部申請のみ、社員モード時は内部申請のみ
    if (this.isAdmin && this.isAdminMode && this.selectedApplicationType.category !== 'external') {
      this.snackBar.open('管理者モードでは外部申請のみ作成できます', '閉じる', { duration: 3000 });
      return;
    }
    if (!this.isAdminMode && this.selectedApplicationType.category !== 'internal') {
      this.snackBar.open('社員モードでは内部申請のみ作成できます', '閉じる', { duration: 3000 });
      return;
    }

    this.isLoading = true;

    try {
      // 添付ファイルをアップロード
      const uploadedAttachments = [];
      if (this.attachments.length > 0 && this.organizationId) {
        const tempApplicationId = 'temp_' + Date.now();
        for (const file of this.attachments) {
          try {
          const fileUrl = await this.applicationService.uploadFile(file, this.organizationId, tempApplicationId);
          uploadedAttachments.push({
            fileName: file.name,
            fileUrl,
            uploadedAt: new Date()
          });
          } catch (error: any) {
            // Storageのセキュリティルール違反時のエラーをキャッチ
            console.error(`ファイルアップロードエラー (${file.name}):`, error);
            let errorMessage = `ファイル「${file.name}」のアップロードに失敗しました`;
            if (error.code === 'storage/unauthorized' || error.message?.includes('Permission denied')) {
              errorMessage = `ファイル「${file.name}」は許可されていない形式です`;
            } else if (error.code === 'storage/quota-exceeded') {
              errorMessage = `ファイル「${file.name}」のサイズが大きすぎます`;
            }
            this.snackBar.open(errorMessage, '閉じる', { duration: 5000 });
            // エラーが発生したファイルはスキップして続行
          }
        }
      }

      // 申請データを準備
      let applicationData: Record<string, any> = {};
      
      if (this.isInsuranceAcquisitionForm && this.insuranceAcquisitionForm) {
        applicationData = this.insuranceAcquisitionForm.value;
      } else if (this.isInsuranceLossForm && this.insuranceLossForm) {
        applicationData = this.insuranceLossForm.value;
      } else if (this.isDependentChangeForm && this.dependentChangeForm) {
        applicationData = this.dependentChangeForm.value;
      } else if (this.isAddressChangeForm && this.addressChangeForm) {
        applicationData = this.addressChangeForm.value;
      } else if (this.isNameChangeForm && this.nameChangeForm) {
        applicationData = this.nameChangeForm.value;
      } else if (this.isRewardBaseForm && this.rewardBaseForm) {
        applicationData = this.rewardBaseForm.value;
        // 算定基礎届の場合、insuredPersonsをrewardBasePersonsに変換
        if (applicationData['insuredPersons']) {
          applicationData['rewardBasePersons'] = applicationData['insuredPersons'];
          delete applicationData['insuredPersons'];
        }
      } else if (this.isRewardChangeForm && this.rewardChangeForm) {
        applicationData = this.rewardChangeForm.value;
      } else if (this.isBonusPaymentForm && this.bonusPaymentForm) {
        applicationData = this.bonusPaymentForm.value;
        // commonBonusPaymentDate（年号形式）をDate形式に変換
        if (applicationData['commonBonusPaymentDate'] && typeof applicationData['commonBonusPaymentDate'] === 'object' && applicationData['commonBonusPaymentDate'].era) {
          const commonBonusPaymentDate = applicationData['commonBonusPaymentDate'];
          if (commonBonusPaymentDate.year && commonBonusPaymentDate.month && commonBonusPaymentDate.day) {
            // 年号を西暦に変換
            let year = parseInt(commonBonusPaymentDate.year);
            if (commonBonusPaymentDate.era === 'reiwa') {
              year = year + 2018; // 令和年 + 2018 = 西暦
            } else if (commonBonusPaymentDate.era === 'heisei') {
              year = year + 1988; // 平成年 + 1988 = 西暦
            } else if (commonBonusPaymentDate.era === 'showa') {
              year = year + 1925; // 昭和平年 + 1925 = 西暦
            }
            applicationData['commonBonusPaymentDate'] = new Date(year, parseInt(commonBonusPaymentDate.month) - 1, parseInt(commonBonusPaymentDate.day));
          }
        }

        // 各被保険者のbonusPaymentDate（年号形式）をDate形式に変換
        if (applicationData['insuredPersons'] && Array.isArray(applicationData['insuredPersons'])) {
          for (const person of applicationData['insuredPersons']) {
            if (person.bonusPaymentDate && typeof person.bonusPaymentDate === 'object' && person.bonusPaymentDate.era) {
              const bonusPaymentDate = person.bonusPaymentDate;
              if (bonusPaymentDate.year && bonusPaymentDate.month && bonusPaymentDate.day) {
                // 年号を西暦に変換
                let year = parseInt(bonusPaymentDate.year);
                if (bonusPaymentDate.era === 'reiwa') {
                  year = year + 2018;
                } else if (bonusPaymentDate.era === 'heisei') {
                  year = year + 1988;
                } else if (bonusPaymentDate.era === 'showa') {
                  year = year + 1925;
                }
                person.bonusPaymentDate = new Date(year, parseInt(bonusPaymentDate.month) - 1, parseInt(bonusPaymentDate.day));
              }
            }
          }
        }
      } else if (this.isDependentChangeFormInternal && this.dependentChangeFormInternal) {
        applicationData = this.dependentChangeFormInternal.value;
      } else if (this.isAddressChangeFormInternal && this.addressChangeFormInternal) {
        applicationData = this.addressChangeFormInternal.value;
      } else if (this.isNameChangeFormInternal && this.nameChangeFormInternal) {
        applicationData = this.nameChangeFormInternal.value;
      } else {
        // 通常の申請データ
        applicationData = {
          description: this.applicationDataForm.value.description || ''
        };
      }

      // employeeIdを除外（表示用のため保存しない）
      applicationData = this.removeEmployeeIdFromData(applicationData);

      // 計算履歴IDを申請データに含める
      if (this.selectedCalculationId) {
        applicationData['calculationId'] = this.selectedCalculationId;
      }

      // 期限を計算（各被保険者ごとに期限を計算してdata内に保存）
      if (this.selectedApplicationType.category === 'external') {
        // 外部申請：法定期限を計算してdata内に保存
        // employeeIdがnullの場合はundefinedを渡す（オーナー権限などで社員として登録されていない場合）
        await this.deadlineCalculationService.calculateLegalDeadline(
          {
            type: this.selectedApplicationType.id,
            category: 'external',
            employeeId: this.employeeId || undefined,
            organizationId: this.organizationId!,
            status: status,
            data: applicationData,
            createdAt: new Date(),
            updatedAt: new Date()
          },
          this.selectedApplicationType
        );
        // 各被保険者ごとに期限を保存するため、Application.deadlineは設定しない
        }
        // 内部申請：期限設定なし

      // 申請を作成
      const application: Omit<Application, 'id' | 'createdAt' | 'updatedAt'> = {
        type: this.selectedApplicationType.id,
        category: this.selectedApplicationType.category,
        employeeId: this.employeeId || undefined, // 外部申請の場合、オーナーが作成する場合はundefined（nullの場合はundefinedに変換）
        organizationId: this.organizationId,
        status: status,
        data: applicationData,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : undefined,
        deadline: undefined, // 各被保険者ごとに期限を保存するため、申請全体の期限は設定しない
        relatedInternalApplicationIds: this.selectedInternalApplicationId ? [this.selectedInternalApplicationId] : undefined
      };

      const applicationId = await this.applicationService.createApplication(application);
      
      // 計算履歴のステータスを「申請済み」に更新し、申請IDを紐付け
      if (this.selectedCalculationId) {
        try {
          await this.standardRewardCalculationService.updateCalculation(this.selectedCalculationId, {
            status: 'applied',
            applicationId: applicationId
          });
        } catch (error) {
          console.error('計算履歴の更新に失敗しました:', error);
          // エラーが発生しても申請作成は続行
        }
      }
      
      this.snackBar.open('申請を作成しました', '閉じる', { duration: 3000 });
      this.router.navigate(['/applications', applicationId]);
    } catch (error) {
      console.error('申請の作成に失敗しました:', error);
      this.snackBar.open('申請の作成に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }


  /**
   * 現在のフォームデータを取得してフォーマット（プロパティを返す）
   */
  getFormattedApplicationData(): FormattedSection[] {
    return this.formattedApplicationData;
  }

  /**
   * フォーム変更を購読してformattedApplicationDataを更新
   */
  private subscribeToFormChanges(): void {
    // 既存の購読を解除
    if (this.formSubscription) {
      this.formSubscription.unsubscribe();
      this.formSubscription = null;
    }

    // アクティブなフォームを特定
    let activeForm: FormGroup | null = null;
    
    if (this.isInsuranceAcquisitionForm && this.insuranceAcquisitionForm) {
      activeForm = this.insuranceAcquisitionForm;
    } else if (this.isInsuranceLossForm && this.insuranceLossForm) {
      activeForm = this.insuranceLossForm;
    } else if (this.isDependentChangeForm && this.dependentChangeForm) {
      activeForm = this.dependentChangeForm;
    } else if (this.isAddressChangeForm && this.addressChangeForm) {
      activeForm = this.addressChangeForm;
    } else if (this.isNameChangeForm && this.nameChangeForm) {
      activeForm = this.nameChangeForm;
    } else if (this.isRewardBaseForm && this.rewardBaseForm) {
      activeForm = this.rewardBaseForm;
    } else if (this.isRewardChangeForm && this.rewardChangeForm) {
      activeForm = this.rewardChangeForm;
    } else if (this.isBonusPaymentForm && this.bonusPaymentForm) {
      activeForm = this.bonusPaymentForm;
    } else if (this.isDependentChangeFormInternal && this.dependentChangeFormInternal) {
      activeForm = this.dependentChangeFormInternal;
    } else if (this.isAddressChangeFormInternal && this.addressChangeFormInternal) {
      activeForm = this.addressChangeFormInternal;
    } else if (this.isNameChangeFormInternal && this.nameChangeFormInternal) {
      activeForm = this.nameChangeFormInternal;
    } else {
      activeForm = this.applicationDataForm;
    }

    if (activeForm && this.selectedApplicationType?.code) {
      // 初回更新
      this.updateFormattedApplicationData(activeForm);

      // フォーム変更を購読
      this.formSubscription = activeForm.valueChanges.subscribe(() => {
        this.updateFormattedApplicationData(activeForm!);
      });
    } else {
      this.formattedApplicationData = [];
    }
  }

  /**
   * formattedApplicationDataを更新
   */
  private updateFormattedApplicationData(form: FormGroup): void {
    if (!this.selectedApplicationType?.code) {
      this.formattedApplicationData = [];
      return;
    }

    const formData = { ...form.value };
    
    // 算定基礎届の場合、insuredPersonsをrewardBasePersonsに変換（プレビュー表示用）
    if (this.selectedApplicationType.code === 'REWARD_BASE' && formData['insuredPersons']) {
      formData['rewardBasePersons'] = formData['insuredPersons'];
      delete formData['insuredPersons'];
    }
    
    this.formattedApplicationData = this.formatApplicationDataForPreview(formData, this.selectedApplicationType.code);
  }

  /**
   * コンポーネント破棄時の処理
   */
  /**
   * ファイルのプレビューURLを取得
   */
  getFilePreviewUrl(file: File): string {
    if (!this.filePreviewUrls.has(file.name)) {
      const url = URL.createObjectURL(file);
      this.filePreviewUrls.set(file.name, url);
    }
    return this.filePreviewUrls.get(file.name)!;
  }

  ngOnDestroy(): void {
    // ファイルプレビュー用URLをクリーンアップ（メモリリーク防止）
    this.filePreviewUrls.forEach(url => URL.revokeObjectURL(url));
    this.filePreviewUrls.clear();
    if (this.formSubscription) {
      this.formSubscription.unsubscribe();
      this.formSubscription = null;
    }
  }

  /**
   * 内部申請選択時の処理
   */
  onInternalApplicationSelect(selectedId: string | null): void {
    // 内部申請詳細から外部申請を作成する場合は変更不可
    if (this.isFromInternalApplication) {
      return;
    }
    this.selectedInternalApplicationId = selectedId;
    // 申請種別が選択されている場合、自動入力を実行
    if (selectedId && this.selectedApplicationType) {
      this.autoFillFromInternalApplications();
    }
  }

  /**
   * 申請の表示名を取得
   */
  getApplicationDisplayName(app: Application): string {
    // applicationTypesから申請種別名を取得（idまたはcodeで検索）
    let typeName = app.type;
    
    // applicationTypesが読み込まれている場合、通常の検索
    const typeById = this.applicationTypes.find(t => t.id === app.type);
    if (typeById) {
      typeName = typeById.name;
    } else {
      // idで見つからない場合、codeで検索
      const typeByCode = this.applicationTypes.find(t => t.code === app.type);
      if (typeByCode) {
        typeName = typeByCode.name;
      }
    }
    
    const employee = this.employees.find(e => e.id === app.employeeId);
    const employeeName = employee ? `${employee.lastName} ${employee.firstName}` : '不明';
    const date = app.createdAt instanceof Date 
      ? app.createdAt.toLocaleDateString('ja-JP')
      : (app.createdAt instanceof Timestamp 
        ? app.createdAt.toDate().toLocaleDateString('ja-JP')
        : '');
    return `${typeName} - ${employeeName} (${date})`;
  }

  /**
   * 選択された内部申請の情報を自動入力
   */
  private async autoFillFromInternalApplications(): Promise<void> {
    if (!this.selectedInternalApplicationId || !this.selectedApplicationType) {
      return;
    }

    console.log('内部申請からの自動入力開始:', this.selectedInternalApplicationId);

    // 全カテゴリの申請種別を読み込む（内部申請の検索用）
    await this.loadAllApplicationTypes();

    // 選択された内部申請のデータを読み込む
    let internalApplication: Application | null = null;
    try {
      const app = await this.applicationService.getApplication(this.selectedInternalApplicationId);
      if (app && app.category === 'internal' && app.status === 'approved') {
        internalApplication = app;
        console.log('内部申請を読み込み:', this.selectedInternalApplicationId, app.data);
      }
    } catch (error) {
      console.error(`内部申請 ${this.selectedInternalApplicationId} の読み込みに失敗しました:`, error);
    }

    if (!internalApplication) {
      console.log('読み込めた内部申請がありません');
      return;
    }

    console.log('applicationTypes:', this.applicationTypes.map(t => ({ id: t.id, code: t.code, name: t.name })));
    console.log('internalApplication:', { id: internalApplication.id, type: internalApplication.type, category: internalApplication.category, status: internalApplication.status });

    // 申請種別に応じて自動入力
    switch (this.selectedApplicationType.code) {
      case 'DEPENDENT_CHANGE_EXTERNAL':
        console.log('被扶養者（異動）届（外部申請）に自動入力');
        this.autoFillDependentChangeFromInternal([internalApplication]);
        break;
      case 'ADDRESS_CHANGE_EXTERNAL':
        console.log('被保険者住所変更届に自動入力');
        this.autoFillAddressChangeFromInternal([internalApplication]);
        break;
      case 'NAME_CHANGE_EXTERNAL':
        console.log('被保険者氏名変更（訂正）届に自動入力');
        this.autoFillNameChangeFromInternal([internalApplication]);
        break;
      // その他の申請種別も必要に応じて追加
    }
  }

  /**
   * 被扶養者（異動）届（外部申請）に内部申請の情報を自動入力
   */
  private autoFillDependentChangeFromInternal(internalApplications: Application[]): void {
    if (!this.dependentChangeForm || !this.otherDependentsFormArray) {
      console.log('フォームが初期化されていません:', {
        dependentChangeForm: !!this.dependentChangeForm,
        otherDependentsFormArray: !!this.otherDependentsFormArray
      });
      return;
    }

    console.log('被扶養者（異動）届（外部申請）に自動入力開始');

    // 被扶養者（異動）届（内部申請）から情報を取得
    const dependentChangeApps = internalApplications.filter(app => {
      const type = this.applicationTypes.find(t => t.id === app.type);
      return type?.code === 'DEPENDENT_CHANGE';
    });

    console.log('該当する内部申請数:', dependentChangeApps.length);

    // 関連する内部申請が承認済みの場合、承認日を事業主等受付年月日に自動転記
    if (dependentChangeApps.length > 0 && this.selectedInternalApplicationId) {
      const relatedApp = dependentChangeApps.find(app => app.id === this.selectedInternalApplicationId);
      if (relatedApp && relatedApp.status === 'approved' && relatedApp.history) {
        // 承認履歴から承認日を取得
        const approvalHistory = relatedApp.history.find(h => h.action === 'approve');
        if (approvalHistory && approvalHistory.createdAt) {
          const approvalDate = approvalHistory.createdAt instanceof Date 
            ? approvalHistory.createdAt 
            : (approvalHistory.createdAt instanceof Timestamp 
              ? approvalHistory.createdAt.toDate() 
              : new Date(approvalHistory.createdAt));
          const eraDate = this.convertToEraDate(approvalDate);
          this.dependentChangeForm.patchValue({
            businessOwnerReceiptDate: eraDate
          });
        }
      }
    }

    for (const app of dependentChangeApps) {
      const data = app.data;
      console.log('内部申請のデータ:', data);
      
      // otherDependentsを確認
      if (data && data['otherDependents'] && Array.isArray(data['otherDependents'])) {
        console.log('otherDependentsを発見:', data['otherDependents'].length, '件');
        // 被扶養者情報を追加
        for (const dependent of data['otherDependents']) {
          console.log('被扶養者情報を追加:', dependent);
          this.addOtherDependentFromInternal(dependent);
        }
      } else if (data && data['dependents'] && Array.isArray(data['dependents'])) {
        console.log('dependentsを発見:', data['dependents'].length, '件');
        // 被扶養者情報を追加
        for (const dependent of data['dependents']) {
          console.log('被扶養者情報を追加:', dependent);
          this.addOtherDependentFromInternal(dependent);
        }
      } else {
        console.log('被扶養者情報が見つかりませんでした。データ構造:', Object.keys(data || {}));
      }
    }
  }

  /**
   * 内部申請の被扶養者情報から外部申請の被扶養者情報を追加
   */
  private addOtherDependentFromInternal(dependent: any): void {
    if (!this.otherDependentsFormArray) {
      console.log('otherDependentsFormArrayがnullです');
      return;
    }

    console.log('被扶養者情報を追加中:', dependent);

    // 内部申請のデータ構造に合わせて値を取得
    const lastName = dependent.changeAfter?.lastName || dependent.lastName || '';
    const firstName = dependent.changeAfter?.firstName || dependent.firstName || '';
    const lastNameKana = dependent.changeAfter?.lastNameKana || dependent.lastNameKana || '';
    const firstNameKana = dependent.changeAfter?.firstNameKana || dependent.firstNameKana || '';
    const birthDate = dependent.changeAfter?.birthDate || dependent.birthDate || {};
    const relationship = dependent.relationship || '';
    const changeDate = dependent.changeDate || dependent.dependentStartDate || '';
    const startReason = dependent.startReason || dependent.dependentStartReason || '';
    const startReasonOther = dependent.startReasonOther || dependent.dependentStartReasonOther || '';
    const endReason = dependent.endReason || dependent.dependentEndReason || '';
    const endReasonOther = dependent.endReasonOther || dependent.dependentEndReasonOther || '';

    const dependentGroup = this.fb.group({
      lastName: [lastName],
      firstName: [firstName],
      lastNameKana: [lastNameKana],
      firstNameKana: [firstNameKana],
      birthDate: this.fb.group({
        era: [birthDate.era || 'reiwa'],
        year: [birthDate.year || ''],
        month: [birthDate.month || ''],
        day: [birthDate.day || '']
      }),
      relationship: [relationship],
      changeDate: [changeDate],
      startReason: [startReason],
      startReasonOther: [startReasonOther],
      endReason: [endReason],
      endReasonOther: [endReasonOther]
    });

    this.otherDependentsFormArray.push(dependentGroup);
    console.log('被扶養者情報を追加しました');
  }

  /**
   * 社員情報の被扶養者情報から被扶養者申請の被扶養者情報を追加
   */
  private addDependentsFromEmployee(dependentInfo: DependentInfo[]): void {
    // 現在アクティブなフォームからotherDependentsFormArrayを取得
    if (this.isDependentChangeFormInternal && this.dependentChangeFormInternal) {
      this.otherDependentsFormArray = this.dependentChangeFormInternal.get('otherDependents') as FormArray;
    } else if (this.isDependentChangeForm && this.dependentChangeForm) {
      this.otherDependentsFormArray = this.dependentChangeForm.get('otherDependents') as FormArray;
    }

    if (!this.otherDependentsFormArray) {
      return;
    }

    // 既存の被扶養者をクリア（オプション：既存データを保持したい場合は削除）
    // this.otherDependentsFormArray.clear();

    for (const dep of dependentInfo) {
      // DependentInfoからlastName/firstNameを取得（既に分割されている場合はそれを使用、そうでなければnameから分割）
      const lastName = dep.lastName || this.splitNameToLastNameFirstName(dep.name).lastName;
      const firstName = dep.firstName || this.splitNameToLastNameFirstName(dep.name).firstName;
      const lastNameKana = dep.lastNameKana || this.splitNameToLastNameFirstName(dep.nameKana).lastName;
      const firstNameKana = dep.firstNameKana || this.splitNameToLastNameFirstName(dep.nameKana).firstName;

      // 生年月日を変換
      const birthDate = dep.birthDate instanceof Date 
        ? dep.birthDate 
        : (dep.birthDate instanceof Timestamp ? dep.birthDate.toDate() : new Date(dep.birthDate));
      const birthDateInfo = this.convertToEraDate(birthDate);

      const dependentGroup = this.fb.group({
        lastName: [lastName, [Validators.required]],
        firstName: [firstName, [Validators.required]],
        lastNameKana: [lastNameKana, [Validators.required]],
        firstNameKana: [firstNameKana, [Validators.required]],
        birthDate: this.fb.group({
          era: [birthDateInfo.era || 'reiwa'],
          year: [birthDateInfo.year || ''],
          month: [birthDateInfo.month || ''],
          day: [birthDateInfo.day || '']
        }),
        relationship: [dep.relationship || '', [Validators.required]],
        changeType: ['applicable', [Validators.required]], // デフォルトは「適用」
        changeDate: [''],
        startReason: [''],
        startReasonOther: [''],
        endReason: [''],
        endReasonOther: [''],
        income: [dep.income || null],
        address: this.fb.group({
          livingTogether: [dep.livingTogether ? 'living_together' : 'separate']
        }),
        personalNumber: [''],
        basicPensionNumber: [dep.dependentId || '']
      });

      this.otherDependentsFormArray.push(dependentGroup);
    }
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
   * 被保険者住所変更届（外部申請）に内部申請の情報を自動入力
   */
  private autoFillAddressChangeFromInternal(internalApplications: Application[]): void {
    if (!this.addressChangeForm) {
      console.log('addressChangeFormが初期化されていません');
      return;
    }

    console.log('被保険者住所変更届に自動入力開始');

    // 住所変更届（内部申請）から情報を取得
    const addressChangeApps = internalApplications.filter(app => {
      const type = this.applicationTypes.find(t => t.id === app.type);
      return type?.code === 'ADDRESS_CHANGE';
    });

    console.log('該当する内部申請数:', addressChangeApps.length);

    if (addressChangeApps.length > 0) {
      const app = addressChangeApps[0]; // 最初の申請を使用
      const data = app.data;
      console.log('内部申請のデータ:', data);
      
      if (data) {
        const oldAddress = data['oldAddress'] || '';
        const newAddress = data['newAddress'] || '';
        const remarks = data['remarks'] || '';
        
        console.log('住所情報を設定:', { oldAddress, newAddress, remarks });
        
        this.addressChangeForm.patchValue({
          oldAddress: oldAddress,
          newAddress: newAddress,
          remarks: remarks
        });
        
        console.log('住所情報を設定しました');
      }
    }
  }

  /**
   * 被保険者氏名変更（訂正）届（外部申請）に内部申請の情報を自動入力
   */
  private autoFillNameChangeFromInternal(internalApplications: Application[]): void {
    if (!this.nameChangeForm) {
      console.log('nameChangeFormが初期化されていません');
      return;
    }

    console.log('被保険者氏名変更（訂正）届に自動入力開始');

    // 氏名変更届（内部申請）から情報を取得
    console.log('applicationTypes:', this.applicationTypes.map(t => ({ id: t.id, code: t.code })));
    console.log('internalApplications:', internalApplications.map(app => ({ id: app.id, type: app.type })));
    
    const nameChangeApps = internalApplications.filter(app => {
      const type = this.applicationTypes.find(t => t.id === app.type);
      console.log(`申請 ${app.id}: type=${app.type}, foundType=${type?.code}`);
      return type?.code === 'NAME_CHANGE';
    });

    console.log('該当する内部申請数:', nameChangeApps.length);

    if (nameChangeApps.length > 0) {
      const app = nameChangeApps[0]; // 最初の申請を使用
      const data = app.data;
      console.log('内部申請のデータ（全体）:', JSON.stringify(data, null, 2));
      
      if (data) {
        // 内部申請のデータ構造を確認：insuredPersonの中にデータがあるか、ルートに直接あるか
        const insuredPersonData = data['insuredPerson'] || data;
        console.log('insuredPersonデータ:', JSON.stringify(insuredPersonData, null, 2));
        
        // 外部申請フォームの構造に合わせてデータをマッピング
        // 外部申請フォームには oldLastNameKana, oldFirstNameKana は存在しない
        const patchData: any = {
          oldLastName: insuredPersonData['oldLastName'] || '',
          oldFirstName: insuredPersonData['oldFirstName'] || '',
          newLastName: insuredPersonData['newLastName'] || '',
          newFirstName: insuredPersonData['newFirstName'] || '',
          newLastNameKana: insuredPersonData['newLastNameKana'] || '',
          newFirstNameKana: insuredPersonData['newFirstNameKana'] || '',
          remarks: insuredPersonData['remarks'] || insuredPersonData['reason'] || ''
        };
        
        // その他のフィールドも設定（存在する場合）
        if (insuredPersonData['insuranceNumber']) {
          patchData['insuranceNumber'] = insuredPersonData['insuranceNumber'];
        }
        if (insuredPersonData['identificationType']) {
          patchData['identificationType'] = insuredPersonData['identificationType'];
        }
        if (insuredPersonData['personalNumber']) {
          patchData['personalNumber'] = insuredPersonData['personalNumber'];
        }
        if (insuredPersonData['basicPensionNumber']) {
          patchData['basicPensionNumber'] = insuredPersonData['basicPensionNumber'];
        }
        if (insuredPersonData['birthDate']) {
          patchData['birthDate'] = insuredPersonData['birthDate'];
        }
        
        console.log('氏名情報を設定（insuredPerson用）:', patchData);
        
        // insuredPersonの中にデータを設定
        const insuredPersonGroup = this.nameChangeForm.get('insuredPerson');
        if (insuredPersonGroup) {
          insuredPersonGroup.patchValue(patchData);
          console.log('氏名情報を設定しました（insuredPerson）');
        } else {
          console.error('insuredPerson FormGroupが見つかりません');
        }
      }
    }
  }

  /**
   * 申請詳細画面と同じフォーマッター（簡易版）
   */
  private formatApplicationDataForPreview(data: Record<string, any>, code: string): FormattedSection[] {
    switch (code) {
      case 'INSURANCE_ACQUISITION':
        return this.formatInsuranceAcquisitionDataForPreview(data);
      case 'INSURANCE_LOSS':
        return this.formatInsuranceLossDataForPreview(data);
      case 'DEPENDENT_CHANGE':
      case 'DEPENDENT_CHANGE_EXTERNAL':
        return this.formatDependentChangeDataForPreview(data);
      case 'ADDRESS_CHANGE':
      case 'ADDRESS_CHANGE_EXTERNAL':
        return this.formatAddressChangeDataForPreview(data);
      case 'NAME_CHANGE':
      case 'NAME_CHANGE_EXTERNAL':
        return this.formatNameChangeDataForPreview(data);
      case 'REWARD_BASE':
        return this.formatRewardBaseDataForPreview(data);
      case 'REWARD_CHANGE':
        return this.formatRewardChangeDataForPreview(data);
      case 'BONUS_PAYMENT':
        return this.formatBonusPaymentDataForPreview(data);
      default:
        return this.formatGenericDataForPreview(data);
    }
  }

  // 各申請種別のフォーマッター（申請詳細画面と同じロジックをコピー）
  
  private formatInsuranceAcquisitionDataForPreview(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    // 提出者情報
    if (data['submitterInfo']) {
      const submitterItems: FormattedItem[] = [];
      const si = data['submitterInfo'];
      
      submitterItems.push({ label: '事業所記号', value: si.officeSymbol || '', isEmpty: !si.officeSymbol });
      submitterItems.push({ label: '事業所番号', value: si.officeNumber || '', isEmpty: !si.officeNumber });
      
      // 住所に郵便番号を追加（組織情報から取得）
      const postalCode = si.postalCode || (this.organization?.address as any)?.postalCode || '';
      const address = si.officeAddress || si.address || '';
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      submitterItems.push({ label: '所在地', value: addressWithPostalCode, isEmpty: !address });
      
      submitterItems.push({ label: '事業所名', value: si.officeName || si.name || '', isEmpty: !si.officeName && !si.name });
      submitterItems.push({ label: '事業主氏名', value: si.ownerName || '', isEmpty: !si.ownerName }); // 事業主氏名（修正17）
      submitterItems.push({ label: '電話番号', value: si.phoneNumber || '', isEmpty: !si.phoneNumber });

      sections.push({
        title: '提出者情報',
        items: submitterItems
      });
    }

    // 被保険者情報（複数）
    if (data['insuredPersons'] && Array.isArray(data['insuredPersons'])) {
      data['insuredPersons'].forEach((person: any, index: number) => {
        const personItems: FormattedItem[] = [];
        
        personItems.push({ label: '被保険者整理番号', value: person.insuranceNumber || '', isEmpty: !person.insuranceNumber });
        personItems.push({ label: '氏名', value: `${person.lastName || ''} ${person.firstName || ''}`.trim() || '', isEmpty: !person.lastName && !person.firstName });
        personItems.push({ label: '氏名（カナ）', value: `${person.lastNameKana || ''} ${person.firstNameKana || ''}`.trim() || '', isEmpty: !person.lastNameKana && !person.firstNameKana });
        personItems.push({ label: '生年月日', value: this.formatEraDate(person.birthDate), isEmpty: !person.birthDate });
        personItems.push({ label: '種別', value: this.formatType(person.type), isEmpty: !person.type });
        personItems.push({ label: '取得種別', value: this.formatAcquisitionType(person.acquisitionType), isEmpty: !person.acquisitionType });
        
        if (person.identificationType === 'personal_number') {
          personItems.push({ label: '個人番号', value: person.personalNumber || '', isEmpty: !person.personalNumber });
        } else if (person.identificationType === 'basic_pension_number') {
          personItems.push({ label: '基礎年金番号', value: person.basicPensionNumber || '', isEmpty: !person.basicPensionNumber });
        }
        
        // 取得年月日（FormGroupの場合は年号付き日付として処理）
        if (person.acquisitionDate && typeof person.acquisitionDate === 'object' && !(person.acquisitionDate instanceof Date) && !(person.acquisitionDate instanceof Timestamp)) {
          personItems.push({ label: '取得年月日', value: this.formatEraDate(person.acquisitionDate), isEmpty: !person.acquisitionDate.era || !person.acquisitionDate.year || !person.acquisitionDate.month || !person.acquisitionDate.day });
        } else {
          personItems.push({ label: '取得年月日', value: this.formatDateValue(person.acquisitionDate), isEmpty: !person.acquisitionDate });
        }
        const hasDependentsLabel = person.hasDependents === 'yes' ? 'あり' : person.hasDependents === 'no' ? 'なし' : '';
        personItems.push({ label: '被扶養者', value: hasDependentsLabel, isEmpty: !person.hasDependents });
        
        if (person.remuneration) {
          const rem = person.remuneration;
          personItems.push({ label: '報酬月額（通貨）', value: rem.currency ? `${rem.currency.toLocaleString()}円` : '', isEmpty: !rem.currency });
          personItems.push({ label: '報酬月額（現物）', value: rem.inKind ? `${rem.inKind.toLocaleString()}円` : '', isEmpty: !rem.inKind });
          personItems.push({ label: '報酬月額（合計）', value: rem.total ? `${rem.total.toLocaleString()}円` : '', isEmpty: !rem.total });
        }
        
        personItems.push({ label: '備考', value: this.formatRemarks(person.remarks), isEmpty: !person.remarks });
        
        if (person.address) {
          const addr = person.address;
          const addressStr = [addr.postalCode, addr.prefecture, addr.city, addr.street, addr.building]
            .filter(Boolean).join('');
          personItems.push({ label: '住所', value: addressStr || '', isEmpty: !addressStr });
          if (addr.addressKana) {
            personItems.push({ label: '住所（カナ）', value: addr.addressKana });
          }
        }
        
        personItems.push({ label: '資格確認書発行要否', value: person.certificateRequired ? '要' : '不要' });

        sections.push({
          title: `被保険者情報 ${index + 1}`,
          items: personItems
        });
      });
    }

    return sections;
  }

  private formatInsuranceLossDataForPreview(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    if (data['submitterInfo']) {
      const submitterItems: FormattedItem[] = [];
      const si = data['submitterInfo'];
      submitterItems.push({ label: '事業所記号', value: si.officeSymbol || '', isEmpty: !si.officeSymbol });
      submitterItems.push({ label: '事業所番号', value: si.officeNumber || '', isEmpty: !si.officeNumber });
      
      // 住所に郵便番号を追加（組織情報から取得）
      const postalCode = si.postalCode || (this.organization?.address as any)?.postalCode || '';
      const address = si.officeAddress || si.address || '';
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      submitterItems.push({ label: '所在地', value: addressWithPostalCode, isEmpty: !address });
      
      submitterItems.push({ label: '事業所名', value: si.officeName || si.name || '', isEmpty: !si.officeName && !si.name });
      submitterItems.push({ label: '事業主氏名', value: si.ownerName || '', isEmpty: !si.ownerName }); // 事業主氏名（修正17）
      submitterItems.push({ label: '電話番号', value: si.phoneNumber || '', isEmpty: !si.phoneNumber });

      sections.push({
        title: '提出者情報',
        items: submitterItems
      });
    }

    if (data['insuredPersons'] && Array.isArray(data['insuredPersons'])) {
      data['insuredPersons'].forEach((person: any, index: number) => {
        const personItems: FormattedItem[] = [];
        
        personItems.push({ label: '被保険者整理番号', value: person.insuranceNumber || '', isEmpty: !person.insuranceNumber });
        personItems.push({ label: '氏名', value: `${person.lastName || ''} ${person.firstName || ''}`.trim() || '', isEmpty: !person.lastName && !person.firstName });
        personItems.push({ label: '氏名（カナ）', value: `${person.lastNameKana || ''} ${person.firstNameKana || ''}`.trim() || '', isEmpty: !person.lastNameKana && !person.firstNameKana });
        personItems.push({ label: '生年月日', value: this.formatEraDate(person.birthDate), isEmpty: !person.birthDate });
        
        // 個人番号または基礎年金番号（入力欄の順序に合わせて生年月日の後）
        if (person.identificationType === 'personal_number') {
          personItems.push({ label: '個人番号', value: person.personalNumber || '', isEmpty: !person.personalNumber });
        } else if (person.identificationType === 'basic_pension_number') {
          personItems.push({ label: '基礎年金番号', value: person.basicPensionNumber || '', isEmpty: !person.basicPensionNumber });
        }
        
        // 喪失年月日（FormGroupの場合は年号付き日付として処理）
        if (person.lossDate && typeof person.lossDate === 'object' && !(person.lossDate instanceof Date) && !(person.lossDate instanceof Timestamp)) {
          personItems.push({ label: '喪失年月日', value: this.formatEraDate(person.lossDate), isEmpty: !person.lossDate.era || !person.lossDate.year || !person.lossDate.month || !person.lossDate.day });
        } else {
        personItems.push({ label: '喪失年月日', value: this.formatDateValue(person.lossDate), isEmpty: !person.lossDate });
        }
        
        personItems.push({ label: '喪失理由', value: this.formatLossReason(person.lossReason), isEmpty: !person.lossReason });
        
        if (person.lossReason === 'retirement') {
          // 退職年月日（FormGroupの場合は年号付き日付として処理）
          if (person.retirementDate && typeof person.retirementDate === 'object' && !(person.retirementDate instanceof Date) && !(person.retirementDate instanceof Timestamp)) {
            personItems.push({ label: '退職年月日', value: this.formatEraDate(person.retirementDate), isEmpty: !person.retirementDate.era || !person.retirementDate.year || !person.retirementDate.month || !person.retirementDate.day });
          } else {
          personItems.push({ label: '退職年月日', value: this.formatDateValue(person.retirementDate), isEmpty: !person.retirementDate });
          }
        } else if (person.lossReason === 'death') {
          // 死亡年月日（FormGroupの場合は年号付き日付として処理）
          if (person.deathDate && typeof person.deathDate === 'object' && !(person.deathDate instanceof Date) && !(person.deathDate instanceof Timestamp)) {
            personItems.push({ label: '死亡年月日', value: this.formatEraDate(person.deathDate), isEmpty: !person.deathDate.era || !person.deathDate.year || !person.deathDate.month || !person.deathDate.day });
          } else {
          personItems.push({ label: '死亡年月日', value: this.formatDateValue(person.deathDate), isEmpty: !person.deathDate });
          }
        }
        
        personItems.push({ label: '備考', value: this.formatRemarks(person.remarks), isEmpty: !person.remarks });
        
        // 資格確認書回収（添付と返不能の枚数を表示）
        const attachedCount = person.certificateCollection?.attached ?? 0;
        const unrecoverableCount = person.certificateCollection?.unrecoverable ?? 0;
        personItems.push({ label: '資格確認書回収', value: `添付：${attachedCount}枚、返不能：${unrecoverableCount}枚`, isEmpty: attachedCount === 0 && unrecoverableCount === 0 });
        
        personItems.push({ label: '70歳以上被用者不該当', value: person.over70NotApplicable ? 'チェックあり' : 'チェックなし' });
        
        if (person.over70NotApplicable && person.over70NotApplicableDate) {
          // 70歳以上被用者該当日（FormGroupの場合は年号付き日付として処理）
          if (typeof person.over70NotApplicableDate === 'object' && !(person.over70NotApplicableDate instanceof Date) && !(person.over70NotApplicableDate instanceof Timestamp)) {
            personItems.push({ label: '70歳以上被用者該当日', value: this.formatEraDate(person.over70NotApplicableDate) });
          } else {
          personItems.push({ label: '70歳以上被用者該当日', value: this.formatDateValue(person.over70NotApplicableDate) });
          }
        }

        sections.push({
          title: `被保険者情報 ${index + 1}`,
          items: personItems
        });
      });
    }

    return sections;
  }

  private formatDependentChangeDataForPreview(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    if (data['businessOwnerInfo']) {
      const boItems: FormattedItem[] = [];
      const bo = data['businessOwnerInfo'];
      boItems.push({ label: '事業主の氏名', value: bo.name || '', isEmpty: !bo.name });
      boItems.push({ label: '事業主の氏名（カナ）', value: bo.nameKana || '', isEmpty: !bo.nameKana });
      boItems.push({ label: '事業主の生年月日', value: this.formatEraDate(bo.birthDate), isEmpty: !bo.birthDate });
      boItems.push({ label: '事業主の住所', value: bo.address || '', isEmpty: !bo.address });
      boItems.push({ label: '事業主の電話番号', value: bo.phoneNumber || '', isEmpty: !bo.phoneNumber });

      sections.push({
        title: '事業主情報',
        items: boItems
      });
    }

    if (data['insuredPerson']) {
      const ipItems: FormattedItem[] = [];
      const ip = data['insuredPerson'];
      ipItems.push({ label: '被保険者整理番号', value: ip.insuranceNumber || '', isEmpty: !ip.insuranceNumber });
      ipItems.push({ label: '氏名', value: `${ip.lastName || ''} ${ip.firstName || ''}`.trim() || '', isEmpty: !ip.lastName && !ip.firstName });
      ipItems.push({ label: '氏名（カナ）', value: `${ip.lastNameKana || ''} ${ip.firstNameKana || ''}`.trim() || '', isEmpty: !ip.lastNameKana && !ip.firstNameKana });
      ipItems.push({ label: '生年月日', value: this.formatEraDate(ip.birthDate), isEmpty: !ip.birthDate });
      
      // 個人番号または基礎年金番号（入力欄の順序に合わせて生年月日の後）
      if (ip.identificationType === 'personal_number') {
        ipItems.push({ label: '個人番号', value: ip.personalNumber || '', isEmpty: !ip.personalNumber });
      } else if (ip.identificationType === 'basic_pension_number') {
        ipItems.push({ label: '基礎年金番号', value: ip.basicPensionNumber || '', isEmpty: !ip.basicPensionNumber });
      }

      sections.push({
        title: '被保険者情報',
        items: ipItems
      });
    }

    if (data['spouseDependent']) {
      const sd = data['spouseDependent'];
      const sdItems: FormattedItem[] = [];
      
      if (sd.noChange) {
        sdItems.push({ label: '変更なし', value: '変更なし' });
      } else {
        sdItems.push({ label: '異動種別', value: this.formatChangeType(sd.changeType), isEmpty: !sd.changeType });
        
        if (sd.changeType === 'change') {
          sdItems.push({ label: '氏名', value: `${sd.changeAfter?.lastName || ''} ${sd.changeAfter?.firstName || ''}`.trim() || '', isEmpty: !sd.changeAfter?.lastName && !sd.changeAfter?.firstName });
          sdItems.push({ label: '氏名（カナ）', value: `${sd.changeAfter?.lastNameKana || ''} ${sd.changeAfter?.firstNameKana || ''}`.trim() || '', isEmpty: !sd.changeAfter?.lastNameKana && !sd.changeAfter?.firstNameKana });
          sdItems.push({ label: '生年月日', value: this.formatEraDate(sd.changeAfter?.birthDate), isEmpty: !sd.changeAfter?.birthDate });
        }
        
        sdItems.push({ label: '続柄', value: sd.relationship || '', isEmpty: !sd.relationship });
        sdItems.push({ label: '電話番号種別', value: this.formatPhoneType(sd.phoneType), isEmpty: !sd.phoneType });
        sdItems.push({ label: '電話番号', value: sd.phoneNumber || '', isEmpty: !sd.phoneNumber });
        sdItems.push({ label: '住所', value: sd.address || '', isEmpty: !sd.address });
        
        // 異動年月日（FormGroupの場合は年号付き日付として処理）
        if (sd.changeDate && typeof sd.changeDate === 'object' && !(sd.changeDate instanceof Date) && !(sd.changeDate instanceof Timestamp)) {
          sdItems.push({ label: '異動年月日', value: this.formatEraDate(sd.changeDate), isEmpty: !sd.changeDate.era || !sd.changeDate.year || !sd.changeDate.month || !sd.changeDate.day });
        } else {
        sdItems.push({ label: '異動年月日', value: this.formatDateValue(sd.changeDate), isEmpty: !sd.changeDate });
        }
        
        sdItems.push({ label: '被扶養者となった理由', value: this.formatDependentStartReason(sd.becameDependentReason), isEmpty: !sd.becameDependentReason });
        if (sd.becameDependentReason === 'other') {
          sdItems.push({ label: '被扶養者となった理由（その他）', value: sd.becameDependentReasonOther || '', isEmpty: !sd.becameDependentReasonOther });
        }
        sdItems.push({ label: '職業', value: this.formatOccupation(sd.occupation), isEmpty: !sd.occupation });
        if (sd.occupation === 'other') {
          sdItems.push({ label: '職業（その他）', value: sd.occupationOther || '', isEmpty: !sd.occupationOther });
        }
        if (sd.occupation === 'student_high_school') {
          sdItems.push({ label: '学年', value: sd.studentYear || '', isEmpty: !sd.studentYear });
        }
        sdItems.push({ label: '被扶養者でなくなった理由', value: this.formatDependentEndReason(sd.dependentEndReason), isEmpty: !sd.dependentEndReason });
        if (sd.dependentEndReason === 'death') {
          // 死亡年月日（FormGroupの場合は年号付き日付として処理）
          if (sd.deathDate && typeof sd.deathDate === 'object' && !(sd.deathDate instanceof Date) && !(sd.deathDate instanceof Timestamp)) {
            sdItems.push({ label: '死亡年月日', value: this.formatEraDate(sd.deathDate), isEmpty: !sd.deathDate.era || !sd.deathDate.year || !sd.deathDate.month || !sd.deathDate.day });
          } else {
          sdItems.push({ label: '死亡年月日', value: this.formatDateValue(sd.deathDate), isEmpty: !sd.deathDate });
          }
        }
        if (sd.overseasException) {
          sdItems.push({ label: '海外特例該当', value: '該当する' });
          sdItems.push({ label: '海外特例該当理由', value: this.formatOverseasExceptionReason(sd.overseasExceptionReason), isEmpty: !sd.overseasExceptionReason });
          if (sd.overseasExceptionReason === 'other') {
            sdItems.push({ label: '海外特例該当理由（その他）', value: sd.overseasExceptionReasonOther || '', isEmpty: !sd.overseasExceptionReasonOther });
          }
          sdItems.push({ label: '海外特例該当終了理由', value: this.formatOverseasExceptionEndReason(sd.overseasExceptionEndReason), isEmpty: !sd.overseasExceptionEndReason });
          if (sd.overseasExceptionEndReason === 'domestic_transfer') {
            // 国内転出年月日（FormGroupの場合は年号付き日付として処理）
            if (sd.domesticTransferDate && typeof sd.domesticTransferDate === 'object' && !(sd.domesticTransferDate instanceof Date) && !(sd.domesticTransferDate instanceof Timestamp)) {
              sdItems.push({ label: '国内転出年月日', value: this.formatEraDate(sd.domesticTransferDate), isEmpty: !sd.domesticTransferDate.era || !sd.domesticTransferDate.year || !sd.domesticTransferDate.month || !sd.domesticTransferDate.day });
            } else {
            sdItems.push({ label: '国内転出年月日', value: this.formatDateValue(sd.domesticTransferDate), isEmpty: !sd.domesticTransferDate });
            }
          }
        }
      }

      sections.push({
        title: '配偶者被扶養者情報',
        items: sdItems
      });
    }

    if (data['otherDependents'] && Array.isArray(data['otherDependents'])) {
      data['otherDependents'].forEach((dep: any, index: number) => {
        const depItems: FormattedItem[] = [];
        
        depItems.push({ label: '異動種別', value: this.formatChangeType(dep.changeType), isEmpty: !dep.changeType });
        
        if (dep.changeType === 'change') {
          depItems.push({ label: '氏名', value: `${dep.changeAfter?.lastName || ''} ${dep.changeAfter?.firstName || ''}`.trim() || '', isEmpty: !dep.changeAfter?.lastName && !dep.changeAfter?.firstName });
          depItems.push({ label: '氏名（カナ）', value: `${dep.changeAfter?.lastNameKana || ''} ${dep.changeAfter?.firstNameKana || ''}`.trim() || '', isEmpty: !dep.changeAfter?.lastNameKana && !dep.changeAfter?.firstNameKana });
          depItems.push({ label: '生年月日', value: this.formatEraDate(dep.changeAfter?.birthDate), isEmpty: !dep.changeAfter?.birthDate });
        } else {
          depItems.push({ label: '氏名', value: `${dep.lastName || ''} ${dep.firstName || ''}`.trim() || '', isEmpty: !dep.lastName && !dep.firstName });
          depItems.push({ label: '氏名（カナ）', value: `${dep.lastNameKana || ''} ${dep.firstNameKana || ''}`.trim() || '', isEmpty: !dep.lastNameKana && !dep.firstNameKana });
          depItems.push({ label: '生年月日', value: this.formatEraDate(dep.birthDate), isEmpty: !dep.birthDate });
        }
        
        depItems.push({ label: '続柄', value: this.formatOtherDependentRelationship(dep.relationship), isEmpty: !dep.relationship });
        if (dep.relationship === 'other') {
          depItems.push({ label: '続柄（その他）', value: dep.relationshipOther || '', isEmpty: !dep.relationshipOther });
        }
        
        // 異動年月日（FormGroupの場合は年号付き日付として処理）
        if (dep.changeDate && typeof dep.changeDate === 'object' && !(dep.changeDate instanceof Date) && !(dep.changeDate instanceof Timestamp)) {
          depItems.push({ label: '異動年月日', value: this.formatEraDate(dep.changeDate), isEmpty: !dep.changeDate.era || !dep.changeDate.year || !dep.changeDate.month || !dep.changeDate.day });
        } else {
        depItems.push({ label: '異動年月日', value: this.formatDateValue(dep.changeDate), isEmpty: !dep.changeDate });
        }
        
        depItems.push({ label: '被扶養者となった理由', value: this.formatOtherDependentStartReason(dep.startReason), isEmpty: !dep.startReason });
        if (dep.startReason === 'other') {
          depItems.push({ label: '被扶養者となった理由（その他）', value: dep.startReasonOther || '', isEmpty: !dep.startReasonOther });
        }
        depItems.push({ label: '職業', value: this.formatOtherDependentOccupation(dep.occupation), isEmpty: !dep.occupation });
        if (dep.occupation === 'other') {
          depItems.push({ label: '職業（その他）', value: dep.occupationOther || '', isEmpty: !dep.occupationOther });
        }
        if (dep.occupation === 'student_high_school') {
          depItems.push({ label: '学年', value: dep.studentYear || '', isEmpty: !dep.studentYear });
        }
        depItems.push({ label: '被扶養者でなくなった理由', value: this.formatOtherDependentEndReason(dep.endReason), isEmpty: !dep.endReason });
        if (dep.endReason === 'death') {
          // 死亡年月日（FormGroupの場合は年号付き日付として処理）
          if (dep.deathDate && typeof dep.deathDate === 'object' && !(dep.deathDate instanceof Date) && !(dep.deathDate instanceof Timestamp)) {
            depItems.push({ label: '死亡年月日', value: this.formatEraDate(dep.deathDate), isEmpty: !dep.deathDate.era || !dep.deathDate.year || !dep.deathDate.month || !dep.deathDate.day });
          } else {
          depItems.push({ label: '死亡年月日', value: this.formatDateValue(dep.deathDate), isEmpty: !dep.deathDate });
          }
        }
        if (dep.endReason === 'other') {
          depItems.push({ label: '被扶養者でなくなった理由（その他）', value: dep.endReasonOther || '', isEmpty: !dep.endReasonOther });
        }
        if (dep.overseasException) {
          depItems.push({ label: '海外特例該当', value: '該当する' });
          depItems.push({ label: '海外特例該当理由', value: this.formatOverseasExceptionReason(dep.overseasExceptionReason), isEmpty: !dep.overseasExceptionReason });
          if (dep.overseasExceptionReason === 'other') {
            depItems.push({ label: '海外特例該当理由（その他）', value: dep.overseasExceptionReasonOther || '', isEmpty: !dep.overseasExceptionReasonOther });
          }
          depItems.push({ label: '海外特例該当終了理由', value: this.formatOverseasExceptionEndReason(dep.overseasExceptionEndReason), isEmpty: !dep.overseasExceptionEndReason });
          if (dep.overseasExceptionEndReason === 'domestic_transfer') {
            // 国内転出年月日（FormGroupの場合は年号付き日付として処理）
            if (dep.domesticTransferDate && typeof dep.domesticTransferDate === 'object' && !(dep.domesticTransferDate instanceof Date) && !(dep.domesticTransferDate instanceof Timestamp)) {
              depItems.push({ label: '国内転出年月日', value: this.formatEraDate(dep.domesticTransferDate), isEmpty: !dep.domesticTransferDate.era || !dep.domesticTransferDate.year || !dep.domesticTransferDate.month || !dep.domesticTransferDate.day });
            } else {
            depItems.push({ label: '国内転出年月日', value: this.formatDateValue(dep.domesticTransferDate), isEmpty: !dep.domesticTransferDate });
            }
          }
          if (dep.overseasExceptionEndReason === 'other') {
            depItems.push({ label: '海外特例該当終了理由（その他）', value: dep.overseasExceptionEndReasonOther || '', isEmpty: !dep.overseasExceptionEndReasonOther });
          }
        }

        sections.push({
          title: `その他被扶養者情報 ${index + 1}`,
          items: depItems
        });
      });
    }

    if (data['declaration']) {
      sections.push({
        title: '申告',
        items: [{ label: '申告内容', value: data['declaration'].declarationText || '', isEmpty: !data['declaration'].declarationText }]
      });
    }

    return sections;
  }

  private formatAddressChangeDataForPreview(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    if (data['businessInfo']) {
      const biItems: FormattedItem[] = [];
      const bi = data['businessInfo'];
      biItems.push({ label: '事業所記号', value: bi.officeSymbol || '', isEmpty: !bi.officeSymbol });
      
      // 住所に郵便番号を追加（組織情報から取得）
      const postalCode = bi.postalCode || (this.organization?.address as any)?.postalCode || '';
      const address = bi.address || bi.officeAddress || '';
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      biItems.push({ label: '所在地', value: addressWithPostalCode, isEmpty: !address });
      
      biItems.push({ label: '事業所名', value: bi.name || bi.officeName || '', isEmpty: !bi.name && !bi.officeName });
      biItems.push({ label: '事業主氏名', value: bi.ownerName || '', isEmpty: !bi.ownerName }); // 事業主氏名（修正17）
      biItems.push({ label: '電話番号', value: bi.phoneNumber || '', isEmpty: !bi.phoneNumber });

      sections.push({
        title: '事業所情報',
        items: biItems
      });
    }

    if (data['insuredPerson']) {
      const ipItems: FormattedItem[] = [];
      const ip = data['insuredPerson'];
      ipItems.push({ label: '被保険者整理番号', value: ip.insuranceNumber || '', isEmpty: !ip.insuranceNumber });
      ipItems.push({ label: '氏名', value: `${ip.lastName || ''} ${ip.firstName || ''}`.trim() || '', isEmpty: !ip.lastName && !ip.firstName });
      ipItems.push({ label: '氏名（カナ）', value: `${ip.lastNameKana || ''} ${ip.firstNameKana || ''}`.trim() || '', isEmpty: !ip.lastNameKana && !ip.firstNameKana });
      ipItems.push({ label: '生年月日', value: this.formatEraDate(ip.birthDate), isEmpty: !ip.birthDate });
      
      // 個人番号または基礎年金番号（入力欄の順序に合わせて生年月日の後）
      if (ip.identificationType === 'personal_number') {
        ipItems.push({ label: '個人番号', value: ip.personalNumber || '', isEmpty: !ip.personalNumber });
      } else if (ip.identificationType === 'basic_pension_number') {
        ipItems.push({ label: '基礎年金番号', value: ip.basicPensionNumber || '', isEmpty: !ip.basicPensionNumber });
      }
      
      ipItems.push({ label: '変更前住所', value: ip.oldAddress || '', isEmpty: !ip.oldAddress });
      ipItems.push({ label: '変更後住所', value: ip.newAddress || '', isEmpty: !ip.newAddress });

      sections.push({
        title: '被保険者情報',
        items: ipItems
      });
    }

    if (data['spouseInfo']) {
      const siItems: FormattedItem[] = [];
      const si = data['spouseInfo'];
      siItems.push({ label: '配偶者氏名', value: `${si.lastName || ''} ${si.firstName || ''}`.trim() || '', isEmpty: !si.lastName && !si.firstName });
      siItems.push({ label: '配偶者氏名（カナ）', value: `${si.lastNameKana || ''} ${si.firstNameKana || ''}`.trim() || '', isEmpty: !si.lastNameKana && !si.firstNameKana });
      siItems.push({ label: '配偶者生年月日', value: this.formatEraDate(si.birthDate), isEmpty: !si.birthDate });
      
      // 配偶者の個人番号または基礎年金番号（入力欄の順序に合わせて生年月日の後）
      if (si.spouseIdentificationType === 'personal_number' || si.identificationType === 'personal_number') {
        const personalNumber = si.spousePersonalNumber || si.personalNumber || '';
        siItems.push({ label: '配偶者個人番号', value: personalNumber, isEmpty: !personalNumber });
      } else if (si.spouseIdentificationType === 'basic_pension_number' || si.identificationType === 'basic_pension_number') {
        const basicPensionNumber = si.spouseBasicPensionNumber || si.basicPensionNumber || '';
        siItems.push({ label: '配偶者基礎年金番号', value: basicPensionNumber, isEmpty: !basicPensionNumber });
      }

      sections.push({
        title: '配偶者情報',
        items: siItems
      });
    }

    if (data['remarks']) {
      sections.push({
        title: '備考',
        items: [{ label: '備考', value: this.formatRemarks(data['remarks']), isEmpty: !data['remarks'] }]
      });
    }

    return sections;
  }

  private formatNameChangeDataForPreview(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    if (data['businessInfo']) {
      const biItems: FormattedItem[] = [];
      const bi = data['businessInfo'];
      biItems.push({ label: '事業所記号', value: bi.officeSymbol || '', isEmpty: !bi.officeSymbol });
      
      // 住所に郵便番号を追加（組織情報から取得）
      const postalCode = bi.postalCode || (this.organization?.address as any)?.postalCode || '';
      const address = bi.address || bi.officeAddress || '';
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      biItems.push({ label: '所在地', value: addressWithPostalCode, isEmpty: !address });
      
      biItems.push({ label: '事業所名', value: bi.name || bi.officeName || '', isEmpty: !bi.name && !bi.officeName });
      biItems.push({ label: '事業主氏名', value: bi.ownerName || '', isEmpty: !bi.ownerName }); // 事業主氏名（修正17）
      biItems.push({ label: '電話番号', value: bi.phoneNumber || '', isEmpty: !bi.phoneNumber });

      sections.push({
        title: '事業所情報',
        items: biItems
      });
    }

    if (data['insuredPerson']) {
      const ipItems: FormattedItem[] = [];
      const ip = data['insuredPerson'];
      ipItems.push({ label: '被保険者整理番号', value: ip.insuranceNumber || '', isEmpty: !ip.insuranceNumber });
      ipItems.push({ label: '変更前氏名', value: `${ip.oldLastName || ''} ${ip.oldFirstName || ''}`.trim() || '', isEmpty: !ip.oldLastName && !ip.oldFirstName });
      ipItems.push({ label: '変更前氏名（カナ）', value: `${ip.oldLastNameKana || ''} ${ip.oldFirstNameKana || ''}`.trim() || '', isEmpty: !ip.oldLastNameKana && !ip.oldFirstNameKana });
      ipItems.push({ label: '変更後氏名', value: `${ip.newLastName || ''} ${ip.newFirstName || ''}`.trim() || '', isEmpty: !ip.newLastName && !ip.newFirstName });
      ipItems.push({ label: '変更後氏名（カナ）', value: `${ip.newLastNameKana || ''} ${ip.newFirstNameKana || ''}`.trim() || '', isEmpty: !ip.newLastNameKana && !ip.newFirstNameKana });
      ipItems.push({ label: '生年月日', value: this.formatEraDate(ip.birthDate), isEmpty: !ip.birthDate });
      
      // 個人番号または基礎年金番号（入力欄の順序に合わせて生年月日の後）
      if (ip.identificationType === 'personal_number') {
        ipItems.push({ label: '個人番号', value: ip.personalNumber || '', isEmpty: !ip.personalNumber });
      } else if (ip.identificationType === 'basic_pension_number') {
        ipItems.push({ label: '基礎年金番号', value: ip.basicPensionNumber || '', isEmpty: !ip.basicPensionNumber });
      }

      sections.push({
        title: '被保険者情報',
        items: ipItems
      });
    }

    if (data['remarks']) {
      sections.push({
        title: '備考',
        items: [{ label: '備考', value: this.formatRemarks(data['remarks']), isEmpty: !data['remarks'] }]
      });
    }

    return sections;
  }

  private formatRewardBaseDataForPreview(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    if (data['businessInfo']) {
      const biItems: FormattedItem[] = [];
      const bi = data['businessInfo'];
      biItems.push({ label: '事業所記号', value: bi.officeSymbol || '', isEmpty: !bi.officeSymbol });
      
      // 住所に郵便番号を追加（重複を避ける）
      const postalCode = bi.postalCode || (this.organization?.address as any)?.postalCode || '';
      let address = bi.address || bi.officeAddress || '';
      // 住所に既に郵便番号が含まれている場合は除去
      if (address.match(/^〒\d{3}-?\d{4}/)) {
        address = address.replace(/^〒\d{3}-?\d{4}\s*/, '');
      }
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      biItems.push({ label: '所在地', value: addressWithPostalCode, isEmpty: !address });
      
      biItems.push({ label: '事業所名', value: bi.name || bi.officeName || '', isEmpty: !bi.name && !bi.officeName });
      biItems.push({ label: '事業主氏名', value: bi.ownerName || '', isEmpty: !bi.ownerName }); // 事業主氏名（修正17）
      biItems.push({ label: '電話番号', value: bi.phoneNumber || '', isEmpty: !bi.phoneNumber });

      sections.push({
        title: '事業所情報',
        items: biItems
      });
    }

    if (data['rewardBasePersons'] && Array.isArray(data['rewardBasePersons'])) {
      data['rewardBasePersons'].forEach((person: any, index: number) => {
        const personItems: FormattedItem[] = [];
        
        personItems.push({ label: '被保険者整理番号', value: person.insuranceNumber || '', isEmpty: !person.insuranceNumber });
        personItems.push({ label: '氏名', value: person.name || '', isEmpty: !person.name });
        personItems.push({ label: '生年月日', value: this.formatEraDateForReward(person.birthDate), isEmpty: !person.birthDate });
        
        // 適用年月（年月のみ表示）
        let applicableDateValue = '';
        if (person.applicableDate && typeof person.applicableDate === 'object' && !(person.applicableDate instanceof Date) && !(person.applicableDate instanceof Timestamp)) {
          applicableDateValue = this.formatEraDateYearMonth(person.applicableDate);
        } else if (person.applicableDate) {
          applicableDateValue = this.formatDateValue(person.applicableDate);
        }
        personItems.push({ label: '適用年月', value: applicableDateValue, isEmpty: !applicableDateValue });
        
        // 従前の標準報酬（健康保険と厚生年金を別々に表示）
        if (person.previousStandardReward && typeof person.previousStandardReward === 'object') {
          const healthInsurance = person.previousStandardReward.healthInsurance;
          const pensionInsurance = person.previousStandardReward.pensionInsurance;
          const healthInsuranceValue = healthInsurance ? `健康保険：${healthInsurance.toLocaleString()}円` : '';
          const pensionInsuranceValue = pensionInsurance ? `厚生年金：${pensionInsurance.toLocaleString()}円` : '';
          const rewardValue = [healthInsuranceValue, pensionInsuranceValue].filter(Boolean).join('、') || '';
          personItems.push({ label: '従前の標準報酬', value: rewardValue, isEmpty: !rewardValue });
        } else {
          personItems.push({ label: '従前の標準報酬', value: '', isEmpty: true });
        }
        
        // 従前の改定年月
        let previousChangeDateValue = '';
        if (person.previousChangeDate && typeof person.previousChangeDate === 'object' && !(person.previousChangeDate instanceof Date) && !(person.previousChangeDate instanceof Timestamp)) {
          previousChangeDateValue = this.formatEraDateYearMonth(person.previousChangeDate);
        }
        personItems.push({ label: '従前の改定年月', value: previousChangeDateValue, isEmpty: !previousChangeDateValue });
        
        // 昇給/降給（月も表示）
        let salaryChangeValue = '';
        if (person.salaryChange && person.salaryChange.type) {
          const changeType = person.salaryChange.type === 'raise' ? '昇給' : person.salaryChange.type === 'reduction' ? '降給' : '';
          const changeMonth = this.convertEnglishMonthToNumber(person.salaryChange.month);
          if (changeType && changeMonth) {
            salaryChangeValue = `${changeType}（${changeMonth}月）`;
          } else if (changeType) {
            salaryChangeValue = changeType;
          }
        }
        personItems.push({ label: '昇給/降給', value: salaryChangeValue, isEmpty: !salaryChangeValue });
        
        if (person.retroactivePayment && Array.isArray(person.retroactivePayment)) {
          person.retroactivePayment.forEach((rp: any) => {
            const monthNum = this.convertEnglishMonthToNumber(rp.month);
            personItems.push({ 
              label: `遡及支払額（${monthNum}月）`, 
              value: rp.amount ? `${rp.amount.toLocaleString()}円` : '', 
              isEmpty: !rp.amount 
            });
          });
        }
        
        if (person.salaryMonths && Array.isArray(person.salaryMonths)) {
          person.salaryMonths.forEach((sm: any) => {
            const monthNum = this.convertEnglishMonthToNumber(sm.month);
            personItems.push({ 
              label: `報酬月額（${monthNum}月）`, 
              value: sm.total ? `${sm.total.toLocaleString()}円` : '', 
              isEmpty: !sm.total 
            });
          });
        }
        
        personItems.push({ label: '合計', value: person.total ? `${person.total.toLocaleString()}円` : '', isEmpty: !person.total });
        personItems.push({ label: '平均', value: person.average ? `${person.average.toLocaleString()}円` : '', isEmpty: !person.average });
        personItems.push({ label: '調整平均', value: person.adjustedAverage ? `${person.adjustedAverage.toLocaleString()}円` : '', isEmpty: !person.adjustedAverage });
        
        // 期限を表示
        if (person.deadline) {
          const deadline = person.deadline instanceof Date 
            ? person.deadline 
            : (person.deadline as any).toDate 
              ? (person.deadline as any).toDate() 
              : new Date(person.deadline);
          personItems.push({ label: '期限', value: this.formatDateValue(deadline), isEmpty: false });
        }
        
        // 備考（その他の場合は備考内容も表示）
        let remarksValue = this.formatRemarks(person.remarks);
        if (person.remarks === 'other' && person.remarksOther) {
          remarksValue = `その他: ${person.remarksOther}`;
        }
        personItems.push({ label: '備考', value: remarksValue, isEmpty: !person.remarks });
        
        // 個人番号または基礎年金番号
        if (person.identificationType === 'personal_number') {
          personItems.push({ label: '個人番号', value: person.personalNumber || '', isEmpty: !person.personalNumber });
        } else if (person.identificationType === 'basic_pension_number') {
          personItems.push({ label: '基礎年金番号', value: person.basicPensionNumber || '', isEmpty: !person.basicPensionNumber });
        } else if (person.personalNumber) {
          // identificationTypeが設定されていない場合のフォールバック
          personItems.push({ label: '個人番号', value: person.personalNumber || '', isEmpty: !person.personalNumber });
        }

        sections.push({
          title: `被保険者情報 ${index + 1}`,
          items: personItems
        });
      });
    }

    return sections;
  }

  private formatRewardChangeDataForPreview(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    if (data['businessInfo']) {
      const biItems: FormattedItem[] = [];
      const bi = data['businessInfo'];
      biItems.push({ label: '事業所記号', value: bi.officeSymbol || '', isEmpty: !bi.officeSymbol });
      
      // 住所に郵便番号を追加（組織情報から取得）
      const postalCode = bi.postalCode || (this.organization?.address as any)?.postalCode || '';
      const address = bi.address || bi.officeAddress || '';
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      biItems.push({ label: '所在地', value: addressWithPostalCode, isEmpty: !address });
      
      biItems.push({ label: '事業所名', value: bi.name || bi.officeName || '', isEmpty: !bi.name && !bi.officeName });
      biItems.push({ label: '事業主氏名', value: bi.ownerName || '', isEmpty: !bi.ownerName }); // 事業主氏名（修正17）
      biItems.push({ label: '電話番号', value: bi.phoneNumber || '', isEmpty: !bi.phoneNumber });

      sections.push({
        title: '事業所情報',
        items: biItems
      });
    }

    if (data['rewardChangePersons'] && Array.isArray(data['rewardChangePersons'])) {
      data['rewardChangePersons'].forEach((person: any, index: number) => {
        const personItems: FormattedItem[] = [];
        
        personItems.push({ label: '被保険者整理番号', value: person.insuranceNumber || '', isEmpty: !person.insuranceNumber });
        personItems.push({ label: '氏名', value: `${person.lastName || ''} ${person.firstName || ''}`.trim() || '', isEmpty: !person.lastName && !person.firstName });
        personItems.push({ label: '生年月日', value: this.formatEraDateForReward(person.birthDate), isEmpty: !person.birthDate });
        personItems.push({ label: '初月', value: person.firstMonth ? `${person.firstMonth}月` : '', isEmpty: !person.firstMonth });
        
        if (person.retroactivePayment && Array.isArray(person.retroactivePayment)) {
          person.retroactivePayment.forEach((rp: any) => {
            personItems.push({ 
              label: `遡及支払額（${rp.month}月）`, 
              value: rp.amount ? `${rp.amount.toLocaleString()}円` : '', 
              isEmpty: !rp.amount 
            });
          });
        }
        
        if (person.salaryMonths && Array.isArray(person.salaryMonths)) {
          person.salaryMonths.forEach((sm: any) => {
            personItems.push({ 
              label: `報酬月額（${sm.month}月）`, 
              value: sm.total ? `${sm.total.toLocaleString()}円` : '', 
              isEmpty: !sm.total 
            });
          });
        }
        
        personItems.push({ label: '備考', value: this.formatRemarks(person.remarks), isEmpty: !person.remarks });
        personItems.push({ label: '個人番号', value: person.personalNumber || '', isEmpty: !person.personalNumber });

        sections.push({
          title: `被保険者情報 ${index + 1}`,
          items: personItems
        });
      });
    }

    return sections;
  }

  private formatBonusPaymentDataForPreview(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    if (data['businessInfo']) {
      const biItems: FormattedItem[] = [];
      const bi = data['businessInfo'];
      biItems.push({ label: '事業所記号', value: bi.officeSymbol || '', isEmpty: !bi.officeSymbol });
      
      // 住所に郵便番号を追加（組織情報から取得）
      const postalCode = bi.postalCode || (this.organization?.address as any)?.postalCode || '';
      const address = bi.address || bi.officeAddress || '';
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      biItems.push({ label: '所在地', value: addressWithPostalCode, isEmpty: !address });
      
      biItems.push({ label: '事業所名', value: bi.name || bi.officeName || '', isEmpty: !bi.name && !bi.officeName });
      biItems.push({ label: '事業主氏名', value: bi.ownerName || '', isEmpty: !bi.ownerName }); // 事業主氏名（修正17）
      biItems.push({ label: '電話番号', value: bi.phoneNumber || '', isEmpty: !bi.phoneNumber });

      sections.push({
        title: '事業所情報',
        items: biItems
      });
    }

    if (data['commonBonusPaymentDate']) {
      // 共通賞与支払年月日（年号形式のオブジェクトの場合はformatEraDateを使用）
      let commonBonusPaymentDateValue = '';
      const commonBonusPaymentDate = data['commonBonusPaymentDate'];
      if (typeof commonBonusPaymentDate === 'object' && !(commonBonusPaymentDate instanceof Date) && !(commonBonusPaymentDate instanceof Timestamp)) {
        // 年号形式のオブジェクトの場合
        if (commonBonusPaymentDate.era && commonBonusPaymentDate.year && commonBonusPaymentDate.month && commonBonusPaymentDate.day) {
          commonBonusPaymentDateValue = this.formatEraDate(commonBonusPaymentDate);
        }
      } else {
        // Date形式の場合
        commonBonusPaymentDateValue = this.formatDateValue(commonBonusPaymentDate);
      }
      sections.push({
        title: '共通賞与支払年月日',
        items: [{ label: '賞与支払年月日', value: commonBonusPaymentDateValue }]
      });
    }

    if (data['insuredPersons'] && Array.isArray(data['insuredPersons'])) {
      data['insuredPersons'].forEach((person: any, index: number) => {
        const personItems: FormattedItem[] = [];
        
        personItems.push({ label: '被保険者整理番号', value: person.insuranceNumber || '', isEmpty: !person.insuranceNumber });
        personItems.push({ label: '氏名', value: person.name || '', isEmpty: !person.name });
        personItems.push({ label: '生年月日', value: this.formatEraDateForReward(person.birthDate), isEmpty: !person.birthDate });
        // 賞与支払年月日（年号形式のオブジェクトの場合はformatEraDateを使用）
        if (person.bonusPaymentDate) {
          let bonusPaymentDateValue = '';
          if (typeof person.bonusPaymentDate === 'object' && !(person.bonusPaymentDate instanceof Date) && !(person.bonusPaymentDate instanceof Timestamp)) {
            // 年号形式のオブジェクトの場合
            if (person.bonusPaymentDate.era && person.bonusPaymentDate.year && person.bonusPaymentDate.month && person.bonusPaymentDate.day) {
              bonusPaymentDateValue = this.formatEraDate(person.bonusPaymentDate);
            }
          } else {
            // Date形式の場合
            bonusPaymentDateValue = this.formatDateValue(person.bonusPaymentDate);
          }
          personItems.push({ label: '賞与支払年月日', value: bonusPaymentDateValue, isEmpty: !bonusPaymentDateValue });
        }
        
        // 期限を表示
        if (person.deadline) {
          const deadline = person.deadline instanceof Date 
            ? person.deadline 
            : (person.deadline as any).toDate 
              ? (person.deadline as any).toDate() 
              : new Date(person.deadline);
          personItems.push({ label: '期限', value: this.formatDateValue(deadline), isEmpty: false });
        }
        
        // 賞与額の表示（paymentAmountを優先）
        if (person.paymentAmount && (person.paymentAmount.currency || person.paymentAmount.inKind)) {
          const currency = person.paymentAmount.currency || 0;
          const inKind = person.paymentAmount.inKind || 0;
          const total = currency + inKind;
          
          personItems.push({ label: '賞与額（通貨）', value: currency ? `${currency.toLocaleString()}円` : '', isEmpty: !currency });
          personItems.push({ label: '賞与額（現物）', value: inKind ? `${inKind.toLocaleString()}円` : '', isEmpty: !inKind });
          personItems.push({ label: '賞与額（合計）', value: total ? `${total.toLocaleString()}円` : '', isEmpty: total === 0 });
        } else if (person.bonusAmount) {
          // bonusAmountが数値の場合
          if (typeof person.bonusAmount === 'number') {
            personItems.push({ label: '賞与額（合計）', value: `${person.bonusAmount.toLocaleString()}円`, isEmpty: false });
          } 
          // bonusAmountがオブジェクトの場合（既存データ）
          else if (typeof person.bonusAmount === 'object') {
            personItems.push({ label: '賞与額（通貨）', value: person.bonusAmount.currency ? `${person.bonusAmount.currency.toLocaleString()}円` : '', isEmpty: !person.bonusAmount.currency });
            personItems.push({ label: '賞与額（現物）', value: person.bonusAmount.inKind ? `${person.bonusAmount.inKind.toLocaleString()}円` : '', isEmpty: !person.bonusAmount.inKind });
            personItems.push({ label: '賞与額（合計）', value: person.bonusAmount.total ? `${person.bonusAmount.total.toLocaleString()}円` : '', isEmpty: !person.bonusAmount.total });
          }
        }
        
        personItems.push({ label: '備考', value: this.formatRemarks(person.remarks), isEmpty: !person.remarks });

        sections.push({
          title: `被保険者情報 ${index + 1}`,
          items: personItems
        });
      });
    }

    return sections;
  }

  private formatGenericDataForPreview(data: Record<string, any>): FormattedSection[] {
    const items: FormattedItem[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
          items.push({ label: key, value: JSON.stringify(value) });
        } else {
          items.push({ label: key, value: String(value) });
        }
      }
    }
    return [{
      title: '申請データ',
      items: items
    }];
  }

  // ヘルパーメソッド（申請詳細画面と同じ実装）
  
  private formatDateValue(date: any): string {
    if (!date) return '';
    if (date instanceof Date) {
      return date.toLocaleDateString('ja-JP');
    }
    if (date instanceof Timestamp) {
      return date.toDate().toLocaleDateString('ja-JP');
    }
    if (typeof date === 'string') {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('ja-JP');
      }
    }
    return String(date);
  }

  private formatEraDate(birthDate: any): string {
    if (!birthDate || typeof birthDate !== 'object') return '';
    
    const eraLabels: Record<string, string> = {
      'meiji': '明治',
      'taisho': '大正',
      'showa': '昭和',
      'heisei': '平成',
      'reiwa': '令和'
    };
    
    const era = eraLabels[birthDate.era] || birthDate.era || '';
    const year = birthDate.year || '';
    const month = birthDate.month || '';
    const day = birthDate.day || '';
    
    if (!era || !year || !month || !day) return '';
    
    return `${era}${year}年${month}月${day}日`;
  }

  private formatEraDateForReward(birthDate: any): string {
    if (!birthDate || typeof birthDate !== 'object') return '';
    
    const eraLabels: Record<string, string> = {
      'meiji': 'M',
      'taisho': 'T',
      'showa': 'S',
      'heisei': 'H',
      'reiwa': 'R'
    };
    
    const era = eraLabels[birthDate.era] || '';
    const year = birthDate.year ? String(birthDate.year).padStart(2, '0') : '';
    const month = birthDate.month ? String(birthDate.month).padStart(2, '0') : '';
    const day = birthDate.day ? String(birthDate.day).padStart(2, '0') : '';
    
    if (!era || !year || !month || !day) return '';
    
    return `${era}-${year}${month}${day}`;
  }

  /**
   * 年号形式の年月のみをフォーマット（適用年月用）
   */
  private formatEraDateYearMonth(dateObj: any): string {
    if (!dateObj || typeof dateObj !== 'object') return '';
    
    const eraLabels: Record<string, string> = {
      'meiji': '明治',
      'taisho': '大正',
      'showa': '昭和',
      'heisei': '平成',
      'reiwa': '令和'
    };
    
    const era = eraLabels[dateObj.era] || dateObj.era || '';
    const year = dateObj.year || '';
    const month = dateObj.month || '';
    
    if (!era || !year || !month) return '';
    
    return `${era}${year}年${month}月`;
  }

  /**
   * 英語月名を数値に変換
   */
  private convertEnglishMonthToNumber(monthStr: string): string {
    if (!monthStr) return '';
    
    const monthMap: Record<string, string> = {
      'april': '4',
      'may': '5',
      'june': '6',
      'july': '7',
      'august': '8',
      'september': '9',
      'october': '10',
      'november': '11',
      'december': '12',
      'january': '1',
      'february': '2',
      'march': '3'
    };
    
    return monthMap[monthStr.toLowerCase()] || monthStr;
  }

  private formatType(type: string): string {
    const types: Record<string, string> = {
      'male': '男',
      'female': '女',
      'miner': '坑内員',
      'male_fund': '男(基金)',
      'female_fund': '女(基金)',
      'miner_fund': '坑内員(基金)'
    };
    return types[type] || type || '';
  }

  private formatAcquisitionType(type: string): string {
    const types: Record<string, string> = {
      'health_pension': '健保・厚年',
      'transfer': '共済出向',
      'ship': '船保任継'
    };
    return types[type] || type || '';
  }

  private formatLossReason(reason: string): string {
    const reasons: Record<string, string> = {
      'retirement': '退職',
      'death': '死亡',
      'disqualification': '資格喪失',
      'other': 'その他'
    };
    return reasons[reason] || reason || '';
  }

  private formatRemarks(remarks: any): string {
    if (!remarks) return '';
    if (typeof remarks === 'string') {
      // 算定基礎届用のラベルマップ
      const rewardBaseLabels: Record<string, string> = {
        'over70': '70歳以上被用者算定',
        'multiple_workplace': '二以上勤務',
        'scheduled_change': '月額変更予定',
        'mid_join': '途中入社',
        'leave': '病休・育休・休職等',
        'part_time': '短時間労働者(特定適用事業所等)',
        'part_time_worker': 'パート',
        'annual_average': '年間平均',
        'other': 'その他'
      };
      // 資格取得届用のラベルマップ
      const acquisitionLabels: Record<string, string> = {
        'over70_employee': '70歳以上被用者該当',
        'multiple_workplace': '二以上事業所勤務者の取得',
        'part_time_worker': '短時間労働者の取得（特定適用事業所等）',
        'rehired_after_retirement': '退職後の継続再雇用者の取得',
        'other': 'その他'
      };
      // 算定基礎届用を優先、なければ資格取得届用、どちらでもなければそのまま
      return rewardBaseLabels[remarks] || acquisitionLabels[remarks] || remarks;
    }
    if (typeof remarks === 'object' && remarks.value) {
      if (remarks.value === 'other') {
        return `その他: ${remarks.otherText || remarks.remarksOther || ''}`;
      }
      const rewardBaseLabels: Record<string, string> = {
        'over70': '70歳以上被用者算定',
        'multiple_workplace': '二以上勤務',
        'scheduled_change': '月額変更予定',
        'mid_join': '途中入社',
        'leave': '病休・育休・休職等',
        'part_time': '短時間労働者(特定適用事業所等)',
        'part_time_worker': 'パート',
        'annual_average': '年間平均',
        'other': 'その他'
      };
      const acquisitionLabels: Record<string, string> = {
        'over70_employee': '70歳以上被用者該当',
        'multiple_workplace': '二以上事業所勤務者の取得',
        'part_time_worker': '短時間労働者の取得（特定適用事業所等）',
        'rehired_after_retirement': '退職後の継続再雇用者の取得',
        'other': 'その他'
      };
      const label = rewardBaseLabels[remarks.value] || acquisitionLabels[remarks.value] || remarks.value;
      if (remarks.value === 'other' && (remarks.remarksOther || remarks.otherText)) {
        return `${label}: ${remarks.remarksOther || remarks.otherText}`;
      }
      return label;
    }
    return String(remarks);
  }

  private formatChangeType(type: string): string {
    const types: Record<string, string> = {
      'add': '新規',
      'remove': '削除',
      'change': '変更'
    };
    return types[type] || type || '';
  }

  private formatPhoneType(type: string): string {
    const types: Record<string, string> = {
      'home': '自宅',
      'mobile': '携帯',
      'work': '勤務先',
      'other': 'その他'
    };
    return types[type] || type || '';
  }

  private formatDependentStartReason(reason: string): string {
    const reasons: Record<string, string> = {
      'marriage': '婚姻',
      'birth': '出生',
      'adoption': '養子縁組',
      'other': 'その他'
    };
    return reasons[reason] || reason || '';
  }

  private formatOccupation(occupation: string): string {
    const occupations: Record<string, string> = {
      'student_high_school': '高校生',
      'student_university': '大学生',
      'unemployed': '無職',
      'part_time': 'パート・アルバイト',
      'other': 'その他'
    };
    return occupations[occupation] || occupation || '';
  }

  private formatDependentEndReason(reason: string): string {
    const reasons: Record<string, string> = {
      'divorce': '離婚',
      'death': '死亡',
      'employment': '就職',
      'other': 'その他'
    };
    return reasons[reason] || reason || '';
  }

  private formatOverseasExceptionReason(reason: string): string {
    const reasons: Record<string, string> = {
      'overseas_transfer': '海外転出',
      'other': 'その他'
    };
    return reasons[reason] || reason || '';
  }

  private formatOverseasExceptionEndReason(reason: string): string {
    const reasons: Record<string, string> = {
      'domestic_transfer': '国内転入',
      'other': 'その他'
    };
    return reasons[reason] || reason || '';
  }

  private formatOtherDependentRelationship(relationship: string): string {
    const relationships: Record<string, string> = {
      'child': '子',
      'parent': '父母',
      'grandparent': '祖父母',
      'sibling': '兄弟姉妹',
      'other': 'その他'
    };
    return relationships[relationship] || relationship || '';
  }

  private formatOtherDependentOccupation(occupation: string): string {
    return this.formatOccupation(occupation);
  }

  private formatOtherDependentStartReason(reason: string): string {
    return this.formatDependentStartReason(reason);
  }

  private formatOtherDependentEndReason(reason: string): string {
    return this.formatDependentEndReason(reason);
  }

  /**
   * 申請種別ごとの説明PDFファイル一覧を取得
   */
  getExplanationPdfs(): string[] {
    if (!this.selectedApplicationType?.code) {
      return [];
    }
    return EXPLANATION_PDFS[this.selectedApplicationType.code] || [];
  }

  /**
   * 説明PDFのパスを取得
   */
  getExplanationPdfPath(fileName: string): string {
    if (!this.selectedApplicationType?.code) {
      return '';
    }
    const folderName = getApplicationTypeFolderName(this.selectedApplicationType.code);
    return `/assets/templates/${folderName}/${fileName}`;
  }

  /**
   * 計算履歴のデータをフォームに自動入力
   */
  private async autoFillFromCalculation(): Promise<void> {
    if (!this.selectedCalculationId || !this.selectedApplicationType) {
      return;
    }

    try {
      // 計算履歴を読み込む
      const calculation = await this.standardRewardCalculationService.getCalculation(this.selectedCalculationId);
      if (!calculation) {
        console.error('計算履歴の読み込みに失敗しました');
        return;
      }

      // 社員情報を取得
      const employee = await this.employeeService.getEmployee(calculation.employeeId);
      if (!employee) {
        console.error('社員情報の読み込みに失敗しました');
        return;
      }

      if (calculation.calculationType === 'standard' && this.isRewardBaseForm && this.rewardBaseForm) {
        // 算定基礎届のフォームに自動入力
        await this.autoFillRewardBaseFormFromCalculation(calculation, employee);
      } else if (calculation.calculationType === 'monthly_change' && this.isRewardChangeForm && this.rewardChangeForm) {
        // 報酬月額変更届のフォームに自動入力
        await this.autoFillRewardChangeFormFromCalculation(calculation, employee);
      }
    } catch (error) {
      console.error('計算履歴からの自動入力に失敗しました:', error);
    }
  }

  /**
   * 算定基礎届フォームに計算履歴のデータを自動入力
   */
  private async autoFillRewardBaseFormFromCalculation(calculation: StandardRewardCalculation, employee: Employee): Promise<void> {
    if (!this.rewardBaseForm || !this.rewardBasePersonsFormArray) return;

    // 被保険者を追加（既に1人追加されている場合はクリア）
    this.rewardBasePersonsFormArray.clear();
    this.addRewardBasePerson();

    const personGroup = this.rewardBasePersonsFormArray.at(0) as FormGroup;
    if (!personGroup) return;

    // 被保険者情報を設定
    personGroup.patchValue({
      insuranceNumber: employee.insuranceInfo?.healthInsuranceNumber || '',
      name: `${employee.lastName} ${employee.firstName}`,
      personalNumber: employee.insuranceInfo?.myNumber || ''
    });

    // 生年月日を設定
    if (employee.birthDate) {
      const birthDate = employee.birthDate instanceof Date ? employee.birthDate : new Date((employee.birthDate as any).seconds * 1000);
      const era = this.getEraFromDate(birthDate);
      personGroup.get('birthDate')?.patchValue({
        era: era.era,
        year: era.year,
        month: birthDate.getMonth() + 1,
        day: birthDate.getDate()
      });
    }

    // 適用年月を設定（7月）
    const targetDate = new Date(calculation.targetYear, 6, 1); // 7月1日
    const era = this.getEraFromDate(targetDate);
    personGroup.get('applicableDate')?.patchValue({
      era: era.era,
      year: era.year,
      month: 7
    });

    // 給与データを設定
    if (calculation.salaryData && calculation.salaryData.length > 0) {
      const salaryMonthsArray = personGroup.get('salaryMonths') as FormArray;
      const retroactivePaymentArray = personGroup.get('retroactivePayment') as FormArray;

      calculation.salaryData.forEach((salary, index) => {
        if (index < salaryMonthsArray.length) {
          const monthGroup = salaryMonthsArray.at(index) as FormGroup;
          monthGroup.patchValue({
            month: this.getMonthName(salary.month),
            baseDays: salary.baseDays,
            currency: salary.totalPayment - (salary.retroactivePayment || 0),
            inKind: 0,
            total: salary.totalPayment
          });
        }

        // 遡及支払額を設定
        if (salary.retroactivePayment && salary.retroactivePayment > 0 && index < retroactivePaymentArray.length) {
          const retroGroup = retroactivePaymentArray.at(index) as FormGroup;
          retroGroup.patchValue({
            month: this.getMonthName(salary.month),
            amount: salary.retroactivePayment
          });
        }
      });
    }

    // 平均額と修正平均額を設定
    personGroup.patchValue({
      average: calculation.averageReward,
      adjustedAverage: calculation.averageReward
    });
  }

  /**
   * 月名を取得（報酬月額用）
   */
  private getMonthNameForReward(month: number): string {
    const monthMap: Record<number, string> = {
      4: 'april',
      5: 'may',
      6: 'june'
    };
    return monthMap[month] || '';
  }

  /**
   * 報酬月額変更届フォームに計算履歴のデータを自動入力
   */
  private async autoFillRewardChangeFormFromCalculation(calculation: StandardRewardCalculation, employee: Employee): Promise<void> {
    if (!this.rewardChangeForm || !this.rewardChangePersonsFormArray) return;

    // 被保険者を追加（既に1人追加されている場合はクリア）
    this.rewardChangePersonsFormArray.clear();
    this.addRewardChangePerson();

    const personGroup = this.rewardChangePersonsFormArray.at(0) as FormGroup;
    if (!personGroup) return;

    // 被保険者情報を設定
    personGroup.patchValue({
      insuranceNumber: employee.insuranceInfo?.healthInsuranceNumber || '',
      name: `${employee.lastName} ${employee.firstName}`,
      personalNumber: employee.insuranceInfo?.myNumber || ''
    });

    // 生年月日を設定
    if (employee.birthDate) {
      const birthDate = employee.birthDate instanceof Date ? employee.birthDate : new Date((employee.birthDate as any).seconds * 1000);
      const era = this.getEraFromDate(birthDate);
      personGroup.get('birthDate')?.patchValue({
        era: era.era,
        year: era.year,
        month: birthDate.getMonth() + 1,
        day: birthDate.getDate()
      });
    }

    // 変更年月を設定
    if (calculation.changeMonth) {
      const changeDate = new Date(calculation.changeMonth.year, calculation.changeMonth.month - 1, 1);
      const era = this.getEraFromDate(changeDate);
      personGroup.get('changeDate')?.patchValue({
        era: era.era,
        year: era.year,
        month: calculation.changeMonth.month
      });
      
      // 初月を設定
      personGroup.patchValue({
        firstMonth: calculation.changeMonth.month
      });
    }

    // 従前の標準報酬月額を設定
    if (employee.insuranceInfo?.standardReward) {
      personGroup.get('previousStandardReward')?.patchValue({
        healthInsurance: employee.insuranceInfo.standardReward,
        pensionInsurance: employee.insuranceInfo.standardReward
      });
    }

    // 給与データを設定
    if (calculation.salaryData && calculation.salaryData.length > 0) {
      const salaryMonthsArray = personGroup.get('salaryMonths') as FormArray;
      const retroactivePaymentArray = personGroup.get('retroactivePayment') as FormArray;

      calculation.salaryData.forEach((salary, index) => {
        if (index < salaryMonthsArray.length) {
          const monthGroup = salaryMonthsArray.at(index) as FormGroup;
          monthGroup.patchValue({
            month: salary.month,
            baseDays: salary.baseDays,
            currency: salary.totalPayment - (salary.retroactivePayment || 0),
            inKind: 0,
            total: salary.totalPayment
          });
        }

        // 遡及支払額を設定
        if (salary.retroactivePayment && salary.retroactivePayment > 0 && index < retroactivePaymentArray.length) {
          const retroGroup = retroactivePaymentArray.at(index) as FormGroup;
          retroGroup.patchValue({
            month: salary.month,
            amount: salary.retroactivePayment
          });
        }
      });
    }

    // 平均額と修正平均額を設定
    personGroup.patchValue({
      average: calculation.averageReward,
      adjustedAverage: calculation.averageReward
    });
  }

  /**
   * 日付から元号を取得
   */
  private getEraFromDate(date: Date): { era: string; year: number } {
    const year = date.getFullYear();
    if (year >= 2019) {
      return { era: 'reiwa', year: year - 2018 };
    } else if (year >= 1989) {
      return { era: 'heisei', year: year - 1988 };
    } else if (year >= 1926) {
      return { era: 'showa', year: year - 1925 };
    } else {
      return { era: 'taisho', year: year - 1911 };
    }
  }

  /**
   * 月番号から月名を取得
   */
  private getMonthName(month: number): string {
    const monthNames: Record<number, string> = {
      1: 'january', 2: 'february', 3: 'march', 4: 'april',
      5: 'may', 6: 'june', 7: 'july', 8: 'august',
      9: 'september', 10: 'october', 11: 'november', 12: 'december'
    };
    return monthNames[month] || 'april';
  }
}

