import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatCardModule } from '@angular/material/card';
import { ApplicationType, ApplicationFlowSettings, AttachmentSetting, DEFAULT_INTERNAL_APPLICATION_TYPES, DEFAULT_EXTERNAL_APPLICATION_TYPES } from '../../../core/models/application-flow.model';
import { OrganizationService } from '../../../core/services/organization.service';
import { DepartmentService } from '../../../core/services/department.service';
import { InsuranceRateTableService } from '../../../core/services/insurance-rate-table.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Organization } from '../../../core/models/organization.model';
import { Department } from '../../../core/models/department.model';
import { InsuranceRateTable } from '../../../core/models/insurance-rate-table.model';
import { ConfirmDialogComponent } from './confirm-dialog.component';

@Component({
  selector: 'app-setup-wizard',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatStepperModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    MatListModule,
    MatCheckboxModule,
    MatTableModule,
    MatDialogModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTabsModule,
    MatChipsModule,
    MatAutocompleteModule,
    MatCardModule
  ],
  templateUrl: './setup-wizard.component.html',
  styleUrl: './setup-wizard.component.css'
})
export class SetupWizardComponent implements OnInit {
  @ViewChild('stepper') stepper!: MatStepper;
  
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private organizationService = inject(OrganizationService);
  private departmentService = inject(DepartmentService);
  private insuranceRateTableService = inject(InsuranceRateTableService);
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);

  // ステップ1: 組織情報
  organizationForm: FormGroup;
  
  // ステップ2: 部署作成
  departmentsForm: FormGroup;
  departments: Department[] = [];
  savedOrganizationId: string | null = null;
  
  // ステップ3: 保険設定
  insuranceForm: FormGroup;
  
  // ステップ5: 申請フロー設定
  applicationFlowForm: FormGroup;
  
  // ステップ6: ドキュメント設定
  documentForm: FormGroup;
  documentSettings = {
    allowedFormats: [] as string[],
    maxFileSize: 10, // MB単位、デフォルト10MB
    retentionYears: 6 // 年単位、デフォルト6年
  };
  applicationTypes: ApplicationType[] = [];
  editingApplicationType: ApplicationType | null = null;
  editingApplicationTypeIndex: number | null = null;
  selectedAttachmentApplicationTypeId: string | null = null;
  attachmentSettings: AttachmentSetting[] = [];
  editingAttachmentSetting: AttachmentSetting | null = null;
  editingAttachmentSettingIndex: number | null = null;
  
  // 通知設定
  notificationSettings = {
    internalDeadlineDays: 3,
    externalDeadlineDays: 7,
    reminderInterval: 1,
    notifyApplicant: true,
    notifyAdmin: true,
    notifyOnSubmit: true,
    notifyOnApprove: true,
    notifyOnReturn: true,
    notifyOnReject: true
  };
  
  // ファイル形式の選択肢
  fileFormatOptions = [
    { value: 'pdf', label: 'PDF' },
    { value: 'jpg', label: 'JPG' },
    { value: 'png', label: 'PNG' },
    { value: 'gif', label: 'GIF' },
    { value: 'xls', label: 'Excel (XLS)' },
    { value: 'xlsx', label: 'Excel (XLSX)' },
    { value: 'doc', label: 'Word (DOC)' },
    { value: 'docx', label: 'Word (DOCX)' }
  ];
  
  // ステップ4: 料率・標準報酬等級テーブル
  rateTableForm: FormGroup;
  rateTables: InsuranceRateTable[] = [];
  // テーブル全体の適用期間
  tableEffectiveFrom: Date = new Date();
  tableEffectiveTo: Date | null = null;
  
  // 月単位の日付入力用
  effectiveFromYear: number = new Date().getFullYear();
  effectiveFromMonth: number = new Date().getMonth() + 1;
  effectiveToYear: number | null = null;
  effectiveToMonth: number | null = null;
  // ヘッダー行の料率（共通値）
  headerRates = {
    healthWithoutCare: 0, // 健康保険料（介護非該当）の料率
    healthWithCare: 0,     // 健康保険料（介護該当）の料率
    pension: 0             // 厚生年金保険料の料率
  };
  // ヘッダー料率の編集状態
  editingHeaderRates = {
    healthWithoutCare: 0,
    healthWithCare: 0,
    pension: 0
  };
  isEditingHeaderRates: boolean = false;
  csvFile: File | null = null;
  importErrors: string[] = [];
  importedCount: number = 0; // CSVインポート時の件数（変更されない）
  editingRow: InsuranceRateTable | null = null;
  editingRowIndex: number | null = null; // 編集中の行のインデックス
  originalRowData: InsuranceRateTable | null = null; // 編集前の元のデータ（キャンセル用）
  isAddingNew: boolean = false;

  isLoading = false;
  errorMessage = '';
  successMessage = '';

  constructor() {
    // ステップ1: 組織情報フォーム
    this.organizationForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      corporateNumber: ['', Validators.required], // 必須項目に変更
      // officeSymbol: [''], // 事業所整理記号（削除：保険情報の健康保険に移動）
      // officeNumber: [''], // 事業所番号（削除：保険情報の健康保険・厚生年金に移動）
      postalCode: ['', [Validators.required, Validators.pattern(/^\d{3}-?\d{4}$/)]],
      prefecture: ['', Validators.required],
      city: ['', Validators.required],
      street: ['', Validators.required],
      building: [''],
      phoneNumber: [''],
      email: ['', Validators.email],
      industry: [''],
      leaveInsuranceCollectionMethod: ['postpaid'] // デフォルト: 後払い
    });

    // ステップ2: 部署作成フォーム
    this.departmentsForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(1)]],
      code: [''],
      parentDepartmentId: [null], // 親部署（任意）
      email: ['', Validators.email]
    });

    // ステップ3: 保険設定フォーム
    this.insuranceForm = this.fb.group({
      // 健康保険
      healthInsuranceType: ['kyokai'], // 協会けんぽ or 組合健保（固定）
      healthInsuranceOfficeSymbol: [''], // 事業所整理記号（追加）
      healthInsuranceOfficeNumber: ['', Validators.required], // 必須項目に変更
      // healthInsuranceRoundingMethod: [''], // 端数処理方式（削除：計算ロジックで実装済み）
      healthInsuranceCardFormat: ['none'], // 保険証の形式（任意のまま）
      // 厚生年金
      pensionInsuranceOfficeNumber: ['', Validators.required], // 必須項目に変更
      // pensionInsuranceRoundingMethod: [''], // 端数処理方式（削除：計算ロジックで実装済み）
      pensionInsuranceBusinessCategory: ['', Validators.required], // 厚生年金適用事業所区分（必須項目に変更）
      // 介護保険
      careInsuranceTargetOffice: [null, Validators.required], // デフォルトをnullに変更、必須項目に変更
      // 雇用保険（コメントアウト：不要）
      // employmentInsuranceOfficeNumber: ['', Validators.required],
      // employmentInsuranceLaborNumber: ['', Validators.required]
    });

    // ステップ4: 料率・標準報酬等級テーブルフォーム
    this.rateTableForm = this.fb.group({
      // スキップ機能はアクションボタンに変更
    });
    
    // ステップ5: 申請フロー設定フォーム
    this.applicationFlowForm = this.fb.group({
      // スキップ機能はアクションボタンに変更
    });
    
    // ステップ6: ドキュメント設定フォーム
    this.documentForm = this.fb.group({
      // スキップ機能はアクションボタンに変更
    });
    
    // デフォルトの申請種別を初期化
    this.initializeApplicationTypes();
  }

  async ngOnInit(): Promise<void> {
    // 既にセットアップが完了している場合はダッシュボードにリダイレクト
    // TODO: セットアップ状態をチェック
    
    // 組織情報を読み込んでフォームに反映
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.organizationId) {
      await this.loadOrganizationData(currentUser.organizationId);
      // 完了項目をチェックして、最初の未完了ステップに移動
      await this.navigateToFirstIncompleteStep();
    } else {
      // 組織が未作成の場合は、新規登録時の会社名とメールアドレスをデフォルト値として設定
      if (currentUser) {
        if (currentUser.displayName) {
          this.organizationForm.patchValue({
            name: currentUser.displayName
          });
        }
        if (currentUser.email) {
          this.organizationForm.patchValue({
            email: currentUser.email
          });
        }
      }
    }
  }

  /**
   * 完了項目をチェックして、最初の未完了ステップに移動
   */
  async navigateToFirstIncompleteStep(): Promise<void> {
    if (!this.savedOrganizationId) {
      return;
    }

    try {
      // ステップ1: 組織情報の必須項目をチェック
      const orgFormValue = this.organizationForm.value;
      const step1Complete = orgFormValue.name && 
                           orgFormValue.corporateNumber && 
                           orgFormValue.officeNumber &&
                           orgFormValue.prefecture &&
                           orgFormValue.city &&
                           orgFormValue.street;
      
      if (!step1Complete) {
        // ステップ1が未完了の場合は、ステップ1から開始
        return;
      }

      // ステップ2: 部署が存在するかチェック
      const departments = await this.departmentService.getDepartmentsByOrganization(this.savedOrganizationId);
      if (departments.length === 0) {
        // ステップ2が未完了の場合は、ステップ2に移動
        setTimeout(() => {
          this.stepper.selectedIndex = 1;
        }, 100);
        return;
      }
      this.departments = departments;

      // ステップ3: 保険設定の必須項目をチェック
      const insuranceFormValue = this.insuranceForm.value;
      const step3Complete = insuranceFormValue.healthInsuranceOfficeSymbol &&
                           // insuranceFormValue.healthInsuranceRoundingMethod && // 削除：端数処理方式は不要
                           insuranceFormValue.pensionInsuranceOfficeNumber &&
                           // insuranceFormValue.pensionInsuranceRoundingMethod && // 削除：端数処理方式は不要
                           insuranceFormValue.pensionInsuranceBusinessCategory &&
                           insuranceFormValue.careInsuranceTargetOffice !== null;
                           // insuranceFormValue.employmentInsuranceOfficeNumber && // 削除：雇用保険情報は不要
                           // insuranceFormValue.employmentInsuranceLaborNumber; // 削除：雇用保険情報は不要
      
      if (!step3Complete) {
        // ステップ3が未完了の場合は、ステップ3に移動
        setTimeout(() => {
          this.stepper.selectedIndex = 2;
        }, 100);
        return;
      }

      // ステップ4: 料率テーブルが存在するかチェック
      const rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(this.savedOrganizationId);
      if (rateTables.length === 0) {
        // ステップ4が未完了の場合は、ステップ4に移動
        setTimeout(() => {
          this.stepper.selectedIndex = 3;
        }, 100);
        return;
      }
      this.rateTables = rateTables;

      // ステップ5以降は、組織情報から設定を読み込んでチェック
      const organization = await this.organizationService.getOrganization(this.savedOrganizationId);
      if (organization) {
        // ステップ5: 申請フロー設定が存在するかチェック
        if (!organization.applicationFlowSettings) {
          setTimeout(() => {
            this.stepper.selectedIndex = 4;
          }, 100);
          return;
        }

        // ステップ6: ドキュメント設定が存在するかチェック
        if (!organization.documentSettings) {
          setTimeout(() => {
            this.stepper.selectedIndex = 5;
          }, 100);
          return;
        }
      }

      // すべて完了している場合は、ステップ7（最終確認）に移動
      setTimeout(() => {
        this.stepper.selectedIndex = 6;
      }, 100);
    } catch (error) {
      console.error('Error checking incomplete steps:', error);
    }
  }

  /**
   * 組織情報を読み込んでフォームに反映
   */
  async loadOrganizationData(orgId: string): Promise<void> {
    try {
      const organization = await this.organizationService.getOrganization(orgId);
      const currentUser = this.authService.getCurrentUser();
      
      if (organization) {
        this.organizationForm.patchValue({
          name: organization.name,
          corporateNumber: organization.corporateNumber || '',
          postalCode: organization.address.postalCode || '',
          prefecture: organization.address.prefecture,
          city: organization.address.city,
          street: organization.address.street,
          building: organization.address.building || '',
          phoneNumber: organization.phoneNumber || '',
          email: organization.email || currentUser?.email || '', // 組織のメールアドレスがない場合はユーザーのメールアドレスを使用
          industry: organization.industry || ''
        });
        this.savedOrganizationId = orgId;

        // 保険設定を読み込んでフォームに反映
        if (organization.insuranceSettings) {
          const ins = organization.insuranceSettings;
          this.insuranceForm.patchValue({
            healthInsuranceType: ins.healthInsurance?.type || 'kyokai',
            healthInsuranceOfficeSymbol: ins.healthInsurance?.officeSymbol || '',
            // healthInsuranceRoundingMethod: ins.healthInsurance?.roundingMethod || '', // 削除：端数処理方式は不要
            healthInsuranceCardFormat: ins.healthInsurance?.cardFormat || 'none',
            pensionInsuranceOfficeNumber: ins.pensionInsurance?.officeNumber || '',
            // pensionInsuranceRoundingMethod: ins.pensionInsurance?.roundingMethod || '', // 削除：端数処理方式は不要
            pensionInsuranceBusinessCategory: ins.pensionInsurance?.businessCategory || '',
            careInsuranceTargetOffice: ins.careInsurance?.targetOffice !== undefined ? ins.careInsurance.targetOffice : null
            // employmentInsuranceOfficeNumber: ins.employmentInsurance?.officeNumber || '', // 削除：雇用保険情報は不要
            // employmentInsuranceLaborNumber: ins.employmentInsurance?.laborInsuranceNumber || '' // 削除：雇用保険情報は不要
          });
        }
      }
    } catch (error) {
      console.error('Error loading organization data:', error);
    }
  }

  async onStep1Submit(): Promise<void> {

    if (this.organizationForm.invalid) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('ユーザーがログインしていません');
      }

      const formValue = this.organizationForm.value;
      
      // 空文字列をundefinedに変換（Firestoreではundefinedのフィールドを保存しない）
      const organization: Omit<Organization, 'id' | 'createdAt' | 'updatedAt'> = {
        name: formValue.name,
        corporateNumber: formValue.corporateNumber?.trim() || undefined,
        // officeSymbol: formValue.officeSymbol?.trim() || undefined, // 事業所整理記号（削除：保険情報の健康保険に移動）
        // officeNumber: formValue.officeNumber?.trim() || undefined, // 事業所番号（削除：保険情報の健康保険・厚生年金に移動）
        address: {
          postalCode: formValue.postalCode?.trim() || undefined,
          prefecture: formValue.prefecture,
          city: formValue.city,
          street: formValue.street,
          building: formValue.building?.trim() || undefined
        },
        phoneNumber: formValue.phoneNumber?.trim() || undefined,
        email: formValue.email?.trim() || undefined,
        industry: formValue.industry?.trim() || undefined,
        leaveInsuranceCollectionMethod: formValue.leaveInsuranceCollectionMethod || 'postpaid', // 休職中の保険料徴収方法
        setupCompleted: false
      };

      // 組織が既に存在する場合は更新、存在しない場合は作成
      let orgId: string;
      if (this.savedOrganizationId) {
        // 更新処理
        await this.organizationService.updateOrganization(this.savedOrganizationId, organization);
        orgId = this.savedOrganizationId;
      } else {
        // 作成処理
        orgId = await this.organizationService.createOrganization(organization);
        // ユーザーのorganizationIdを更新
        await this.authService.updateUserOrganizationId(currentUser.uid, orgId);
        this.savedOrganizationId = orgId;
        // ステップ4のデータも読み込む
        this.loadRateTables();
      }

      // ステップ2へ進む
      this.stepper.next();

    } catch (error: any) {
      this.errorMessage = error.message || '組織情報の保存に失敗しました';
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * ステップ2: 部署を追加
   */
  addDepartment(): void {
    if (this.departmentsForm.invalid) {
      return;
    }

    const formValue = this.departmentsForm.value;
    const department: Omit<Department, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'> = {
      name: formValue.name,
      code: formValue.code?.trim() || undefined,
      parentDepartmentId: formValue.parentDepartmentId || null, // 親部署
      email: formValue.email?.trim() || undefined
    };

    this.departments.push(department as Department);
    
    // フォームをリセット（親部署の選択はリセットしない）
    this.departmentsForm.patchValue({
      name: '',
      code: '',
      email: ''
    });
  }

  /**
   * 部署を削除
   */
  removeDepartment(index: number): void {
    this.departments.splice(index, 1);
  }

  /**
   * ステップ2の完了処理
   */
  async onStep2Submit(): Promise<void> {
    if (this.departments.length === 0) {
      this.errorMessage = '少なくとも1つの部署を追加してください';
      return;
    }

    if (!this.savedOrganizationId) {
      this.errorMessage = '組織情報が保存されていません';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      // 部署を順番に作成して、親部署IDを設定
      const createdDepartmentIds: string[] = [];
      for (let i = 0; i < this.departments.length; i++) {
        const dept = this.departments[i];
        
        // 親部署IDがインデックス（数値）の場合、既に作成された部署のIDを使用
        let parentDepartmentId: string | null = null;
        if (typeof dept.parentDepartmentId === 'number') {
          const parentIndex = dept.parentDepartmentId as number;
          if (parentIndex >= 0 && parentIndex < createdDepartmentIds.length) {
            parentDepartmentId = createdDepartmentIds[parentIndex];
          } else {
            parentDepartmentId = null;
          }
        } else if (dept.parentDepartmentId) {
          parentDepartmentId = dept.parentDepartmentId;
        }
        
        const departmentToSave: Omit<Department, 'id' | 'createdAt' | 'updatedAt'> = {
          ...dept,
          parentDepartmentId: parentDepartmentId,
          organizationId: this.savedOrganizationId!
        };
        
        const deptId = await this.departmentService.createDepartment(departmentToSave);
        createdDepartmentIds.push(deptId);
      }

      // ステップ3へ進む
      this.stepper.next();

    } catch (error: any) {
      this.errorMessage = error.message || '部署の保存に失敗しました';
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * ステップ3の完了処理
   */
  async onStep3Submit(): Promise<void> {
    if (!this.savedOrganizationId) {
      this.errorMessage = '組織情報が保存されていません';
      return;
    }

    if (this.insuranceForm.invalid) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const formValue = this.insuranceForm.value;
      
      // 保険設定を構築
      const insuranceSettings: any = {
        healthInsurance: {
          type: formValue.healthInsuranceType || 'kyokai',
          officeSymbol: formValue.healthInsuranceOfficeSymbol?.trim() || undefined, // 事業所整理記号（必須）
          // roundingMethod: formValue.healthInsuranceRoundingMethod?.trim() || undefined, // 削除：端数処理方式は不要
          cardFormat: formValue.healthInsuranceCardFormat || 'none'
        },
        pensionInsurance: {
          officeNumber: formValue.pensionInsuranceOfficeNumber?.trim() || undefined,
          // roundingMethod: formValue.pensionInsuranceRoundingMethod?.trim() || undefined, // 削除：端数処理方式は不要
          businessCategory: formValue.pensionInsuranceBusinessCategory?.trim() || undefined
        },
        careInsurance: {
          targetOffice: formValue.careInsuranceTargetOffice || false
        }
        // employmentInsurance: { // 削除：雇用保険情報は不要
        //   officeNumber: formValue.employmentInsuranceOfficeNumber?.trim() || undefined,
        //   laborInsuranceNumber: formValue.employmentInsuranceLaborNumber?.trim() || undefined
        // }
      };

      // 組織情報を更新
      await this.organizationService.updateOrganization(this.savedOrganizationId, {
        insuranceSettings: insuranceSettings
      });

      // ステップ4へ進む
      this.stepper.next();

    } catch (error: any) {
      this.errorMessage = error.message || '保険設定の保存に失敗しました';
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * ステップ4: 既存データを読み込む
   */
  async loadRateTables(): Promise<void> {
    if (!this.savedOrganizationId) {
      return;
    }

    try {
      this.rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(this.savedOrganizationId);
      this.rateTables.sort((a, b) => a.grade - b.grade);
      
      // 最初の行から料率を取得してヘッダーに反映
      if (this.rateTables.length > 0) {
        const firstRow = this.rateTables[0];
        this.headerRates.healthWithoutCare = firstRow.healthInsuranceWithoutCare.rate;
        this.headerRates.healthWithCare = firstRow.healthInsuranceWithCare.rate;
        this.headerRates.pension = firstRow.pensionInsurance.rate;
      }
    } catch (error: any) {
      console.error('Error loading rate tables:', error);
    }
  }

  /**
   * ステップ4: CSVファイル選択
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.csvFile = input.files[0];
      const fileName = this.csvFile.name.toLowerCase();
      
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        this.parseExcelFile(this.csvFile);
      } else {
        this.parseCsvFile(this.csvFile);
      }
    }
  }

  /**
   * Excelファイルをパース（統合形式）
   */
  private async parseExcelFile(file: File): Promise<void> {
    this.importErrors = [];
    const importedTables: InsuranceRateTable[] = [];

    try {
      // xlsxライブラリを動的にインポート
      const XLSX = await import('xlsx');
      
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // 最初のシートを取得
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // シートを2次元配列に変換（ヘッダーなし）
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      
      if (jsonData.length < 12) {
        this.importErrors.push('Excelファイルの形式が正しくありません（データ行が不足しています）');
        return;
      }

      // デバッグ: 9行目（インデックス8）の全セルを確認
      console.log('[DEBUG] Excel 9行目（インデックス8）の全セル:', jsonData[8]);
      console.log('[DEBUG] F列（インデックス5）:', jsonData[8]?.[5], '型:', typeof jsonData[8]?.[5]);
      console.log('[DEBUG] H列（インデックス7）:', jsonData[8]?.[7], '型:', typeof jsonData[8]?.[7]);
      console.log('[DEBUG] J列（インデックス9）:', jsonData[8]?.[9], '型:', typeof jsonData[8]?.[9]);

      // Excelファイルの場合: 料率は9行目（インデックス8）、データ行は12行目から（インデックス11以降）
      this.parseFileData(jsonData, importedTables, 8, 11, true);
      
      if (importedTables.length > 0) {
        this.rateTables = importedTables;
        this.importedCount = importedTables.length;
        // データが追加されたらエラーメッセージをクリア
        if (this.errorMessage === '少なくとも1件のデータを追加してください') {
          this.errorMessage = '';
        }
      } else {
        this.importErrors.push('有効なデータが見つかりませんでした');
      }
    } catch (error: any) {
      this.importErrors.push(`Excelファイルの読み込みに失敗しました: ${error.message}`);
    }
  }

  /**
   * ファイルデータ（CSV/Excel）をパース（共通処理）
   * @param rows ファイルデータの2次元配列
   * @param importedTables インポート結果を格納する配列
   * @param rateRowIndex 料率行のインデックス（デフォルト: 10 = 11行目）
   * @param dataStartIndex データ行開始のインデックス（デフォルト: 13 = 14行目）
   * @param isExcel Excelファイルかどうか（デフォルト: false）
   */
  private parseFileData(rows: any[][], importedTables: InsuranceRateTable[], rateRowIndex: number = 10, dataStartIndex: number = 13, isExcel: boolean = false): void {
    // エラーメッセージ用の行番号オフセット（データ行の開始行番号）
    const errorRowOffset = dataStartIndex + 1;
    // 料率行を抽出
    const rateRow = rows[rateRowIndex] || [];
    
    // 料率を抽出（例：「9.91%」→ 9.91）
    let healthWithoutCareRate = 0;
    let healthWithCareRate = 0;
    let pensionRate = 0;
    
    if (isExcel) {
      // Excelファイルの場合: 特定の列から直接取得
      // F列（インデックス5）: 健康保険料（介護非該当）の料率
      // H列（インデックス7）: 健康保険料（介護該当）の料率
      // J列（インデックス9）: 厚生年金保険料の料率
      const parseRateFromCell = (cell: any, columnName: string): number => {
        if (cell === null || cell === undefined) {
          console.log(`[DEBUG] ${columnName}: セルがnullまたはundefined`);
          return 0;
        }
        const cellStr = String(cell).trim();
        console.log(`[DEBUG] ${columnName}: セル値="${cellStr}", 型=${typeof cell}`);
        
        // 数値の場合（例: 0.0991）は100倍してパーセンテージに変換（Excelのパーセンテージ形式）
        if (typeof cell === 'number') {
          const rate = cell * 100;
          console.log(`[DEBUG] ${columnName}: 数値として取得=${cell}, 100倍して=${rate}`);
          return rate;
        }
        
        // 文字列の場合、%を含むかチェック
        const rateMatch = cellStr.match(/(\d+\.?\d*)%/);
        if (rateMatch) {
          const rate = parseFloat(rateMatch[1]);
          console.log(`[DEBUG] ${columnName}: %を含む文字列から取得=${rate}`);
          return rate;
        }
        
        // %が含まれていない場合、数値として解釈を試みる
        const numValue = parseFloat(cellStr);
        if (!isNaN(numValue) && numValue > 0) {
          // 1未満の場合はパーセンテージ形式の小数とみなして100倍
          const rate = numValue < 1 ? numValue * 100 : numValue;
          console.log(`[DEBUG] ${columnName}: 数値として解釈=${numValue}, 変換後=${rate}`);
          return rate;
        }
        
        console.log(`[DEBUG] ${columnName}: 料率を取得できませんでした`);
        return 0;
      };
      
      healthWithoutCareRate = parseRateFromCell(rateRow[5], 'F列（健康保険料・介護非該当）'); // F列
      healthWithCareRate = parseRateFromCell(rateRow[7], 'H列（健康保険料・介護該当）'); // H列
      pensionRate = parseRateFromCell(rateRow[9], 'J列（厚生年金保険料）'); // J列
      
      console.log('[DEBUG] 取得した料率:', {
        healthWithoutCareRate,
        healthWithCareRate,
        pensionRate
      });
    } else {
      // CSVファイルの場合: 既存のロジック（すべてのセルをループして値の範囲で判定）
      for (const cell of rateRow) {
        const cellStr = String(cell || '').trim();
        const rateMatch = cellStr.match(/(\d+\.?\d*)%/);
        if (rateMatch) {
          const rate = parseFloat(rateMatch[1]);
          if (!healthWithoutCareRate && rate > 0 && rate < 15) {
            healthWithoutCareRate = rate;
          } else if (!healthWithCareRate && rate > 10 && rate < 15) {
            healthWithCareRate = rate;
          } else if (!pensionRate && rate > 15) {
            pensionRate = rate;
          }
        }
      }
    }

    // 料率をヘッダーに反映
    if (healthWithoutCareRate > 0) {
      this.headerRates.healthWithoutCare = healthWithoutCareRate;
    }
    if (healthWithCareRate > 0) {
      this.headerRates.healthWithCare = healthWithCareRate;
    }
    if (pensionRate > 0) {
      this.headerRates.pension = pensionRate;
    }

    // データ行を抽出
    const dataRows = rows.slice(dataStartIndex);
    const currentUser = this.authService.getCurrentUser();
    const organizationId = currentUser?.organizationId || null;
    const now = new Date();

    // 数値からスペース、カンマ、引用符を削除するヘルパー関数
    const parseNumber = (value: any): number => {
      if (value === null || value === undefined) return 0;
      const valueStr = String(value).trim();
      if (valueStr === '' || valueStr === '～' || valueStr === '""') return 0;
      // 引用符、スペース、カンマを削除
      const cleaned = valueStr.replace(/["\s,]/g, '');
      return parseFloat(cleaned) || 0;
    };

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (!row || row.length === 0) {
        continue;
      }

      // 最初のセルをチェック（説明行をスキップ）
      const firstCell = String(row[0] || '').trim();
      if (firstCell.startsWith('◆') || firstCell.startsWith('○') || firstCell.startsWith('　') || firstCell === '') {
        continue;
      }

      // 列数チェック（最低11列必要）
      if (row.length < 11) {
        continue;
      }

      try {
        // 等級を抽出（例：「1」→ grade=1, pensionGrade=null または 「4（1）」→ grade=4, pensionGrade=1）
        const gradeStr = String(row[0] || '').trim();
        let grade = 0;
        let pensionGrade: number | null = null;
        
        // 「4（1）」形式をパース
        const bracketMatch = gradeStr.match(/(\d+)（(\d+)）/);
        if (bracketMatch) {
          // カッコ付き形式
          grade = parseInt(bracketMatch[1], 10);
          pensionGrade = parseInt(bracketMatch[2], 10);
        } else {
          // 通常形式（カッコなし）
          const gradeMatch = gradeStr.match(/(\d+)/);
          if (gradeMatch) {
            grade = parseInt(gradeMatch[1], 10);
            pensionGrade = null;
          }
        }
        
        if (isNaN(grade) || grade < 1) {
          continue;
        }

        // 標準報酬月額の規定値（列1）
        const standardRewardAmount = parseNumber(row[1]);
        if (standardRewardAmount <= 0) {
          continue;
        }

        // 報酬月額最小値（列2）
        // 空欄の場合は0を使用（表の最下限）
        const minAmount = parseNumber(row[2]);

        // 報酬月額最大値（列4、列3は"～"なのでスキップ）
        // 空欄の場合はnullを使用（表の最上限、無限大）
        const maxAmountValue = row[4];
        const maxAmount = (maxAmountValue === null || maxAmountValue === undefined || String(maxAmountValue).trim() === '' || String(maxAmountValue).trim() === '""')
          ? null
          : parseNumber(maxAmountValue);

        // 最大値がnullの場合はスキップしない（最上限として有効）
        if (maxAmount !== null && maxAmount <= 0) {
          continue;
        }
        if (maxAmount !== null && minAmount > maxAmount) {
          continue;
        }

        // 健康保険料（介護非該当）: 全額（列5）、折半額（列6）
        const healthWithoutCareTotal = parseNumber(row[5]);
        const healthWithoutCareHalf = parseNumber(row[6]);

        // 健康保険料（介護該当）: 全額（列7）、折半額（列8）
        const healthWithCareTotal = parseNumber(row[7]);
        const healthWithCareHalf = parseNumber(row[8]);

        // 厚生年金保険料: 全額（列9）、折半額（列10）
        const pensionTotal = parseNumber(row[9]);
        const pensionHalf = parseNumber(row[10]);

        // データが有効な場合のみ追加
        if (healthWithoutCareTotal > 0 || healthWithCareTotal > 0 || pensionTotal > 0) {
          importedTables.push({
            grade,
            pensionGrade: pensionGrade || null,
            standardRewardAmount,
            minAmount: minAmount || 0,
            maxAmount: maxAmount !== null ? maxAmount : 0, // nullの場合は0として保存（表示時は空欄）
            healthInsuranceWithoutCare: {
              rate: this.headerRates.healthWithoutCare,
              total: healthWithoutCareTotal,
              half: healthWithoutCareHalf
            },
            healthInsuranceWithCare: {
              rate: this.headerRates.healthWithCare,
              total: healthWithCareTotal,
              half: healthWithCareHalf
            },
            pensionInsurance: {
              rate: this.headerRates.pension,
              total: pensionTotal,
              half: pensionHalf
            },
            effectiveFrom: this.tableEffectiveFrom,
            effectiveTo: this.tableEffectiveTo,
            organizationId,
            createdAt: now,
            updatedAt: now
          } as InsuranceRateTable);
        }
      } catch (error: any) {
        this.importErrors.push(`行 ${i + errorRowOffset}: ${error.message}`);
      }
    }

    // 厚生年金の等級・折半額・全額の空欄を自動補完
    this.fillPensionInsuranceBlanks(importedTables);
  }

  /**
   * 厚生年金の等級・折半額・全額の空欄を自動補完
   * 1級より上の空欄は1級の値を反映、最多級より下の空欄は最多級の値を反映
   */
  private fillPensionInsuranceBlanks(tables: InsuranceRateTable[]): void {
    if (tables.length === 0) {
      return;
    }

    // 健保等級（grade）でソート（元の順序を保持）
    const sortedTables = [...tables].sort((a, b) => {
      return a.grade - b.grade;
    });

    // 最初の有効な等級（pensionGrade !== null）のインデックスを取得
    let firstValidIndex = -1;
    for (let i = 0; i < sortedTables.length; i++) {
      const pensionGrade = sortedTables[i].pensionGrade ?? null;
      if (pensionGrade !== null) {
        firstValidIndex = i;
        break;
      }
    }

    // 最後の有効な等級（pensionGrade !== null）のインデックスを取得
    let lastValidIndex = -1;
    for (let i = sortedTables.length - 1; i >= 0; i--) {
      const pensionGrade = sortedTables[i].pensionGrade ?? null;
      if (pensionGrade !== null) {
        lastValidIndex = i;
        break;
      }
    }

    // 有効な等級が存在しない場合は処理を終了
    if (firstValidIndex === -1 || lastValidIndex === -1) {
      return;
    }

    // 1級の値を取得（pensionGrade === 1 または最小の等級）
    let grade1Table: InsuranceRateTable | null = null;
    for (const table of sortedTables) {
      const pensionGrade = table.pensionGrade ?? null;
      if (pensionGrade === 1) {
        grade1Table = table;
        break;
      }
    }
    if (!grade1Table && sortedTables.length > 0) {
      const firstPensionGrade = sortedTables[firstValidIndex].pensionGrade ?? null;
      if (firstPensionGrade !== null) {
        grade1Table = sortedTables[firstValidIndex];
      }
    }

    // 最多級の値を取得（最大のpensionGrade）
    let maxGradeTable: InsuranceRateTable | null = null;
    let maxGrade = 0;
    for (const table of sortedTables) {
      const pensionGrade = table.pensionGrade ?? null;
      if (pensionGrade !== null && pensionGrade > maxGrade) {
        maxGrade = pensionGrade;
        maxGradeTable = table;
      }
    }

    // 各tableがソート済み配列のどの位置にあるかをマッピング
    const tableToIndexMap = new Map<InsuranceRateTable, number>();
    for (let i = 0; i < sortedTables.length; i++) {
      tableToIndexMap.set(sortedTables[i], i);
    }

    // 空欄を補完
    for (const table of tables) {
      const pensionGrade = table.pensionGrade ?? null;
      const sortedIndex = tableToIndexMap.get(table) ?? -1;

      // 空欄の場合のみ補完処理を行う
      if (pensionGrade === null) {
        // 最初の有効な等級より前の位置にある場合 → 1級の値を補完
        if (sortedIndex >= 0 && sortedIndex < firstValidIndex) {
          if (grade1Table && grade1Table.pensionGrade !== null && grade1Table.pensionGrade !== undefined) {
            table.pensionGrade = grade1Table.pensionGrade;
            table.pensionInsurance.total = grade1Table.pensionInsurance.total;
            table.pensionInsurance.half = grade1Table.pensionInsurance.half;
          }
        }
        // 最後の有効な等級より後の位置にある場合 → 最多級の値を補完
        else if (sortedIndex >= 0 && sortedIndex > lastValidIndex) {
          if (maxGradeTable && maxGradeTable.pensionGrade !== null && maxGradeTable.pensionGrade !== undefined) {
            table.pensionGrade = maxGradeTable.pensionGrade;
            table.pensionInsurance.total = maxGradeTable.pensionInsurance.total;
            table.pensionInsurance.half = maxGradeTable.pensionInsurance.half;
          }
        }
        // 中間の位置にある場合 → 1級の値を補完（デフォルト）
        else if (sortedIndex >= 0 && sortedIndex >= firstValidIndex && sortedIndex <= lastValidIndex) {
          if (grade1Table && grade1Table.pensionGrade !== null && grade1Table.pensionGrade !== undefined) {
            table.pensionGrade = grade1Table.pensionGrade;
            table.pensionInsurance.total = grade1Table.pensionInsurance.total;
            table.pensionInsurance.half = grade1Table.pensionInsurance.half;
          }
        }
      }

      // 折半額・全額が0または空欄の場合も補完
      if (table.pensionInsurance.total === 0 || table.pensionInsurance.half === 0) {
        const currentGrade = table.pensionGrade ?? null;
        if (currentGrade === 1 && grade1Table) {
          if (table.pensionInsurance.total === 0) {
            table.pensionInsurance.total = grade1Table.pensionInsurance.total;
          }
          if (table.pensionInsurance.half === 0) {
            table.pensionInsurance.half = grade1Table.pensionInsurance.half;
          }
        } else if (maxGradeTable && currentGrade === maxGrade) {
          if (table.pensionInsurance.total === 0) {
            table.pensionInsurance.total = maxGradeTable.pensionInsurance.total;
          }
          if (table.pensionInsurance.half === 0) {
            table.pensionInsurance.half = maxGradeTable.pensionInsurance.half;
          }
        }
      }
    }
  }

  /**
   * CSVファイルをパース（統合形式）
   */
  private async parseCsvFile(file: File): Promise<void> {
    this.importErrors = [];
    const importedTables: InsuranceRateTable[] = [];

    try {
      const text = await file.text();
      const lines = text.split('\n');
      
      if (lines.length < 14) {
        this.importErrors.push('CSVファイルの形式が正しくありません（データ行が不足しています）');
        return;
      }

      // CSV行をパース（引用符を考慮）
      const parseCsvLine = (line: string): string[] => {
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
      };

      // CSVを2次元配列に変換
      const csvRows: any[][] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          csvRows.push(parseCsvLine(line));
        } else {
          csvRows.push([]);
        }
      }

      // 共通のパース処理を使用
      this.parseFileData(csvRows, importedTables);

      // パース成功した場合はテーブルを更新
      if (importedTables.length > 0) {
        const wasEmpty = this.rateTables.length === 0;
        this.rateTables = importedTables;
        // インポート時の件数を保存（編集で削除されても変更されない）
        this.importedCount = importedTables.length;
        // データが追加されたらエラーメッセージをクリア
        if (wasEmpty && this.errorMessage === '少なくとも1件のデータを追加してください') {
          this.errorMessage = '';
        }
        // エラーがない場合のみ成功メッセージ
        if (this.importErrors.length === 0) {
          // 成功時の処理は特に不要（テーブルが更新される）
        }
      } else {
        this.importErrors.push('有効なデータが見つかりませんでした');
        this.importedCount = 0;
      }
    } catch (error: any) {
      this.importErrors.push(`ファイルの読み込みに失敗しました: ${error.message}`);
    }
  }

  /**
   * 日付をinput[type="date"]用の文字列に変換（yyyy-MM-dd）
   */
  formatDateForInput(date: Date | null | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 月単位の日付をDateオブジェクトに変換（月の1日）
   */
  private getDateFromYearMonth(year: number, month: number): Date {
    return new Date(year, month - 1, 1);
  }

  /**
   * Dateオブジェクトから年月を取得
   */
  private getYearMonthFromDate(date: Date): { year: number; month: number } {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1
    };
  }

  onEffectiveFromYearChange(): void {
    this.updateEffectiveFromDate();
  }

  onEffectiveFromMonthChange(): void {
    this.updateEffectiveFromDate();
  }

  onEffectiveToYearChange(): void {
    this.updateEffectiveToDate();
  }

  onEffectiveToMonthChange(): void {
    this.updateEffectiveToDate();
  }

  private updateEffectiveFromDate(): void {
    this.tableEffectiveFrom = this.getDateFromYearMonth(this.effectiveFromYear, this.effectiveFromMonth);
  }

  private updateEffectiveToDate(): void {
    if (this.effectiveToYear && this.effectiveToMonth) {
      // 月の最終日を設定
      const lastDay = new Date(this.effectiveToYear, this.effectiveToMonth, 0).getDate();
      this.tableEffectiveTo = new Date(this.effectiveToYear, this.effectiveToMonth - 1, lastDay);
    } else {
      this.tableEffectiveTo = null;
    }
  }

  /**
   * 新規行を追加
   */
  addNewRow(): void {
    // ヘッダー料率の編集をキャンセル
    if (this.isEditingHeaderRates) {
      this.cancelHeaderRatesEdit();
    }
    const now = new Date();
    const currentUser = this.authService.getCurrentUser();
    const newRow: InsuranceRateTable = {
      grade: this.rateTables.length + 1,
      standardRewardAmount: 0,
      minAmount: 0,
      maxAmount: 0,
      healthInsuranceWithoutCare: { 
        rate: this.headerRates.healthWithoutCare, 
        total: 0, 
        half: 0 
      },
      healthInsuranceWithCare: { 
        rate: this.headerRates.healthWithCare, 
        total: 0, 
        half: 0 
      },
      pensionInsurance: { 
        rate: this.headerRates.pension, 
        total: 0, 
        half: 0 
      },
      effectiveFrom: this.tableEffectiveFrom,
      effectiveTo: this.tableEffectiveTo,
      organizationId: currentUser?.organizationId || null,
      createdAt: now,
      updatedAt: now
    };
    const wasEmpty = this.rateTables.length === 0;
    this.rateTables.push(newRow);
    this.editingRow = JSON.parse(JSON.stringify(newRow)); // 深いコピー
    this.editingRowIndex = this.rateTables.length - 1;
    this.originalRowData = null; // 新規追加なので元のデータはない
    this.isAddingNew = true;
    // データが追加されたらエラーメッセージをクリア
    if (wasEmpty && this.errorMessage === '少なくとも1件のデータを追加してください') {
      this.errorMessage = '';
    }
  }

  /**
   * ヘッダー料率の編集を開始
   */
  editHeaderRates(): void {
    // データ行の編集をキャンセル
    if (this.editingRow) {
      this.cancelEdit();
    }
    this.editingHeaderRates = {
      healthWithoutCare: this.headerRates.healthWithoutCare,
      healthWithCare: this.headerRates.healthWithCare,
      pension: this.headerRates.pension
    };
    this.isEditingHeaderRates = true;
  }

  /**
   * ヘッダー料率の編集を保存
   */
  saveHeaderRates(): void {
    this.headerRates = { ...this.editingHeaderRates };
    this.isEditingHeaderRates = false;
    
    // 編集中の行がある場合は、その行の料率も更新
    if (this.editingRow) {
      this.editingRow.healthInsuranceWithoutCare.rate = this.headerRates.healthWithoutCare;
      this.editingRow.healthInsuranceWithCare.rate = this.headerRates.healthWithCare;
      this.editingRow.pensionInsurance.rate = this.headerRates.pension;
    }
  }

  /**
   * ヘッダー料率の編集をキャンセル
   */
  cancelHeaderRatesEdit(): void {
    this.isEditingHeaderRates = false;
  }

  /**
   * 行を編集
   */
  editRow(row: InsuranceRateTable): void {
    // ヘッダー料率の編集をキャンセル
    if (this.isEditingHeaderRates) {
      this.cancelHeaderRatesEdit();
    }
    // 編集中の行のインデックスを取得
    // idがある場合はidで比較、ない場合は参照で比較
    let index = -1;
    if (row.id) {
      index = this.rateTables.findIndex(r => r.id === row.id);
    } else {
      index = this.rateTables.findIndex(r => r === row);
    }
    if (index === -1) {
      console.error('編集対象の行が見つかりません');
      return;
    }
    // 元のデータを深いコピーで保存（キャンセル時に復元用）
    this.originalRowData = JSON.parse(JSON.stringify(row));
    // 編集用のデータを作成（深いコピー）
    this.editingRow = JSON.parse(JSON.stringify(row));
    this.editingRowIndex = index;
    this.isAddingNew = false;
  }

  /**
   * 編集を保存
   */
  saveRow(): void {
    if (!this.editingRow) {
      return;
    }

    // editingRowIndexがnullの場合はエラー
    if (this.editingRowIndex === null || this.editingRowIndex < 0) {
      this.errorMessage = '編集対象の行が見つかりません';
      return;
    }

    // ヘッダーの料率を各行に反映（ヘッダー料率が編集されていない場合）
    if (!this.isEditingHeaderRates) {
      this.editingRow.healthInsuranceWithoutCare.rate = this.headerRates.healthWithoutCare;
      this.editingRow.healthInsuranceWithCare.rate = this.headerRates.healthWithCare;
      this.editingRow.pensionInsurance.rate = this.headerRates.pension;
    }
    // テーブル全体の適用日を各行に反映
    this.editingRow.effectiveFrom = this.tableEffectiveFrom;
    this.editingRow.effectiveTo = this.tableEffectiveTo;

    // rateTablesに反映（Firestoreへの保存は「次へ」ボタンで一括実行）
    const wasEmpty = this.rateTables.length === 0;
    this.rateTables[this.editingRowIndex] = JSON.parse(JSON.stringify(this.editingRow));

    this.editingRow = null;
    this.editingRowIndex = null;
    this.originalRowData = null;
    this.isAddingNew = false;
    // データが追加されたらエラーメッセージをクリア
    if (this.errorMessage === '少なくとも1件のデータを追加してください') {
      this.errorMessage = '';
    }
  }

  /**
   * 編集をキャンセル
   */
  cancelEdit(): void {
    if (this.isAddingNew && this.editingRowIndex !== null && this.editingRowIndex >= 0) {
      // 新規追加の場合は削除（editingRowIndexを使用）
      this.rateTables.splice(this.editingRowIndex, 1);
    } else if (this.editingRowIndex !== null && this.originalRowData) {
      // 編集の場合は元のデータを復元
      this.rateTables[this.editingRowIndex] = JSON.parse(JSON.stringify(this.originalRowData));
    }
    this.editingRow = null;
    this.editingRowIndex = null;
    this.originalRowData = null;
    this.isAddingNew = false;
  }

  /**
   * 行を削除
   */
  async deleteRow(row: InsuranceRateTable): Promise<void> {
    if (!confirm('この行を削除しますか？')) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      // idがある場合はFirestoreからも削除
      if (row.id) {
        await this.insuranceRateTableService.deleteRateTable(row.id);
      }
      
      // rateTablesから削除（idがある場合はidで、ない場合は参照で検索）
      let index = -1;
      if (row.id) {
        index = this.rateTables.findIndex(r => r.id === row.id);
      } else {
        index = this.rateTables.findIndex(r => r === row);
      }
      
      if (index >= 0) {
        this.rateTables.splice(index, 1);
      }
    } catch (error: any) {
      this.errorMessage = error.message || '削除に失敗しました';
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * CSVインポートを実行
   */
  async importCsv(): Promise<void> {
    if (!this.csvFile || !this.savedOrganizationId) {
      this.errorMessage = 'CSVファイルを選択してください';
      return;
    }

    if (this.importErrors.length > 0) {
      this.errorMessage = `インポートエラー: ${this.importErrors.join(', ')}`;
      return;
    }

    if (this.rateTables.length === 0) {
      this.errorMessage = 'インポートするデータがありません';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      // 既存データを全削除
      await this.insuranceRateTableService.deleteAllByOrganization(this.savedOrganizationId);
      
      // 新しいデータを一括作成
      const currentUser = this.authService.getCurrentUser();
      const rateTablesToSave = this.rateTables.map(table => ({
        ...table,
        organizationId: currentUser?.organizationId || null,
        effectiveFrom: this.tableEffectiveFrom,
        effectiveTo: this.tableEffectiveTo
      }));
      
      await this.insuranceRateTableService.createRateTables(rateTablesToSave);
      
      // データを再読み込み
      await this.loadRateTables();
      
      // 成功メッセージを設定
      this.successMessage = `インポートが完了しました。${this.rateTables.length}件のデータを保存しました。`;
      this.csvFile = null;
      
      // 5秒後に成功メッセージを自動的に消す
      setTimeout(() => {
        this.successMessage = '';
      }, 5000);
    } catch (error: any) {
      this.errorMessage = error.message || 'CSVインポートに失敗しました';
      this.successMessage = '';
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * ステップ4の完了処理
   */
  async onStep4Submit(): Promise<void> {
    if (!this.savedOrganizationId) {
      this.errorMessage = '組織情報が保存されていません';
      return;
    }

    // 編集中の行がある場合は保存（rateTablesへの反映のみ）
    if (this.editingRow) {
      this.saveRow();
      if (this.errorMessage) {
        return;
      }
    }

    // データが存在しない場合は警告
    if (this.rateTables.length === 0) {
      this.errorMessage = '少なくとも1件のデータを追加してください';
      return;
    }

    // rateTables全体をFirestoreに一括保存
    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      // 既存データを全削除
      await this.insuranceRateTableService.deleteAllByOrganization(this.savedOrganizationId);
      
      // 新しいデータを一括作成
      const currentUser = this.authService.getCurrentUser();
      const rateTablesToSave = this.rateTables.map(table => ({
        ...table,
        organizationId: currentUser?.organizationId || null,
        effectiveFrom: this.tableEffectiveFrom,
        effectiveTo: this.tableEffectiveTo
      }));
      
      await this.insuranceRateTableService.createRateTables(rateTablesToSave);
      
      // データを再読み込み
      await this.loadRateTables();
      
      // CSVファイルをクリア
      this.csvFile = null;
      
      // 次のステップへ進む
      this.stepper.next();
    } catch (error: any) {
      this.errorMessage = error.message || 'データの保存に失敗しました';
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 申請種別を初期化
   */
  private initializeApplicationTypes(): void {
    this.applicationTypes = [];
    
    // 内部申請種別を追加（IDを付与）
    DEFAULT_INTERNAL_APPLICATION_TYPES.forEach((type, index) => {
      this.applicationTypes.push({
        ...type,
        id: `internal_${index + 1}`
      });
    });
    
    // 外部申請種別を追加（IDを付与）
    DEFAULT_EXTERNAL_APPLICATION_TYPES.forEach((type, index) => {
      this.applicationTypes.push({
        ...type,
        id: `external_${index + 1}`
      });
    });
  }

  /**
   * 内部申請種別を追加
   */
  addInternalApplicationType(): void {
    const newType: ApplicationType = {
      id: `custom_${Date.now()}`,
      name: '',
      code: '',
      category: 'internal',
      enabled: true,
      isCustom: true,
      isDeletable: true,
      description: ''
    };
    this.applicationTypes.push(newType);
    this.editApplicationType(this.applicationTypes.length - 1);
  }

  /**
   * 申請種別を編集
   */
  editApplicationType(index: number): void {
    this.editingApplicationType = JSON.parse(JSON.stringify(this.applicationTypes[index]));
    this.editingApplicationTypeIndex = index;
  }

  /**
   * 申請種別の編集を保存
   */
  saveApplicationType(): void {
    if (this.editingApplicationType && this.editingApplicationTypeIndex !== null) {
      if (!this.editingApplicationType.name.trim()) {
        this.errorMessage = '申請種別名を入力してください';
        return;
      }
      if (!this.editingApplicationType.code.trim()) {
        this.errorMessage = '申請種別コードを入力してください';
        return;
      }
      
      this.applicationTypes[this.editingApplicationTypeIndex] = JSON.parse(JSON.stringify(this.editingApplicationType));
      this.cancelApplicationTypeEdit();
    }
  }

  /**
   * 申請種別の編集をキャンセル
   */
  cancelApplicationTypeEdit(): void {
    this.editingApplicationType = null;
    this.editingApplicationTypeIndex = null;
    this.errorMessage = '';
  }

  /**
   * 申請種別を削除
   */
  deleteApplicationType(index: number): void {
    const type = this.applicationTypes[index];
    if (type.isDeletable && confirm(`「${type.name}」を削除しますか？`)) {
      // 関連する添付書類設定も削除
      this.attachmentSettings = this.attachmentSettings.filter(
        setting => setting.applicationTypeId !== type.id
      );
      this.applicationTypes.splice(index, 1);
    }
  }

  /**
   * 内部申請種別を取得
   */
  getInternalApplicationTypes(): ApplicationType[] {
    return this.applicationTypes.filter(type => type.category === 'internal');
  }

  /**
   * 外部申請種別を取得
   */
  getExternalApplicationTypes(): ApplicationType[] {
    return this.applicationTypes.filter(type => type.category === 'external');
  }

  /**
   * 添付書類設定を選択
   */
  selectAttachmentApplicationType(typeId: string): void {
    this.selectedAttachmentApplicationTypeId = typeId;
    // 既存の設定があれば編集、なければ新規作成
    const existingIndex = this.attachmentSettings.findIndex(s => s.applicationTypeId === typeId);
    if (existingIndex >= 0) {
      this.editAttachmentSetting(existingIndex);
    } else {
      this.addAttachmentSetting(typeId);
    }
  }

  /**
   * 添付書類設定を追加
   */
  addAttachmentSetting(applicationTypeId: string): void {
    const newSetting: AttachmentSetting = {
      applicationTypeId,
      allowedFormats: [],
      maxFileSize: undefined,
      description: ''
    };
    this.attachmentSettings.push(newSetting);
    this.editAttachmentSetting(this.attachmentSettings.length - 1);
  }

  /**
   * 添付書類設定を編集
   */
  editAttachmentSetting(index: number): void {
    if (index < 0 || index >= this.attachmentSettings.length) {
      return;
    }
    this.editingAttachmentSetting = JSON.parse(JSON.stringify(this.attachmentSettings[index]));
    this.editingAttachmentSettingIndex = index;
    if (this.editingAttachmentSetting) {
      this.selectedAttachmentApplicationTypeId = this.editingAttachmentSetting.applicationTypeId;
    }
  }

  /**
   * 添付書類設定の編集を保存
   */
  saveAttachmentSetting(): void {
    if (this.editingAttachmentSetting && this.editingAttachmentSettingIndex !== null) {
      this.attachmentSettings[this.editingAttachmentSettingIndex] = JSON.parse(JSON.stringify(this.editingAttachmentSetting));
      this.cancelAttachmentSettingEdit();
    }
  }

  /**
   * 添付書類設定の編集をキャンセル
   */
  cancelAttachmentSettingEdit(): void {
    this.editingAttachmentSetting = null;
    this.editingAttachmentSettingIndex = null;
  }

  /**
   * 添付書類設定を削除
   */
  deleteAttachmentSetting(index: number): void {
    if (index < 0 || index >= this.attachmentSettings.length) {
      return;
    }
    if (confirm('この添付書類設定を削除しますか？')) {
      this.attachmentSettings.splice(index, 1);
      this.cancelAttachmentSettingEdit();
    }
  }

  /**
   * 申請種別名を取得（添付書類設定用）
   */
  getApplicationTypeName(typeId: string): string {
    const type = this.applicationTypes.find(t => t.id === typeId);
    return type ? type.name : '';
  }

  /**
   * ファイル形式のトグル
   */
  toggleFileFormat(format: string): void {
    if (!this.editingAttachmentSetting) {
      return;
    }
    if (!this.editingAttachmentSetting.allowedFormats) {
      this.editingAttachmentSetting.allowedFormats = [];
    }
    const index = this.editingAttachmentSetting.allowedFormats.indexOf(format);
    if (index >= 0) {
      this.editingAttachmentSetting.allowedFormats.splice(index, 1);
    } else {
      this.editingAttachmentSetting.allowedFormats.push(format);
    }
  }

  /**
   * ステップ5の完了処理
   */
  async onStep5Submit(): Promise<void> {
    if (!this.savedOrganizationId) {
      this.errorMessage = '組織情報が保存されていません';
      return;
    }

    // 編集中の申請種別がある場合は保存
    if (this.editingApplicationType) {
      this.saveApplicationType();
      if (this.errorMessage) {
        return;
      }
    }

    // 編集中の添付書類設定がある場合は保存
    if (this.editingAttachmentSetting) {
      this.saveAttachmentSetting();
    }

    // 申請フロー設定を保存（後で実装）
    // TODO: OrganizationSettingsに保存する処理を実装

    // 次のステップへ進む
    this.stepper.next();
  }

  /**
   * ファイル形式のトグル（ドキュメント設定用）
   */
  toggleDocumentFileFormat(format: string): void {
    const index = this.documentSettings.allowedFormats.indexOf(format);
    if (index >= 0) {
      this.documentSettings.allowedFormats.splice(index, 1);
    } else {
      this.documentSettings.allowedFormats.push(format);
    }
  }

  /**
   * ステップ6の完了処理
   */

  async onStep6Submit(): Promise<void> {
    if (!this.savedOrganizationId) {
      this.errorMessage = '組織情報が保存されていません';
      return;
    }

    // ドキュメント設定を保存（後で実装）
    // TODO: OrganizationSettingsに保存する処理を実装

    // 次のステップへ進む
    this.stepper.next();
  }

  /**
   * ステップ7: 最終確認の設定内容サマリーを取得
   */
  getStepSummary(): any {
    const orgFormValue = this.organizationForm.value;
    const insuranceFormValue = this.insuranceForm.value;
    
    return {
      step1: {
        name: orgFormValue.name,
        corporateNumber: orgFormValue.corporateNumber || '未入力',
        officeNumber: orgFormValue.officeNumber || '未入力',
        address: `${orgFormValue.prefecture}${orgFormValue.city}${orgFormValue.street}${orgFormValue.building || ''}`,
        phoneNumber: orgFormValue.phoneNumber || '未入力',
        email: orgFormValue.email || '未入力',
        industry: orgFormValue.industry || '未入力'
      },
      step2: {
        departmentCount: this.departments.length,
        departments: this.departments.map(d => d.name)
      },
      step3: {
        healthInsuranceType: insuranceFormValue.healthInsuranceType === 'kyokai' ? '協会けんぽ' : '組合健保',
        healthInsuranceOfficeSymbol: insuranceFormValue.healthInsuranceOfficeSymbol || '未入力',
        healthInsuranceRoundingMethod: this.getRoundingMethodLabel(insuranceFormValue.healthInsuranceRoundingMethod),
        healthInsuranceCardFormat: this.getCardFormatLabel(insuranceFormValue.healthInsuranceCardFormat),
        pensionInsuranceOfficeNumber: insuranceFormValue.pensionInsuranceOfficeNumber || '未入力',
        pensionInsuranceRoundingMethod: this.getRoundingMethodLabel(insuranceFormValue.pensionInsuranceRoundingMethod),
        pensionInsuranceBusinessCategory: this.getBusinessCategoryLabel(insuranceFormValue.pensionInsuranceBusinessCategory),
        careInsuranceTargetOffice: insuranceFormValue.careInsuranceTargetOffice === null ? '未選択' : (insuranceFormValue.careInsuranceTargetOffice ? '該当' : '非該当'),
        employmentInsuranceOfficeNumber: insuranceFormValue.employmentInsuranceOfficeNumber || '未入力',
        employmentInsuranceLaborNumber: insuranceFormValue.employmentInsuranceLaborNumber || '未入力'
      },
      step4: {
        rateTableCount: this.rateTables.length,
        importedCount: this.importedCount,
        effectiveFrom: this.tableEffectiveFrom ? this.formatDate(this.tableEffectiveFrom) : '未設定',
        effectiveTo: this.tableEffectiveTo ? this.formatDate(this.tableEffectiveTo) : '未設定（現在有効）'
      },
      step5: {
        applicationTypeCount: this.applicationTypes.length,
        internalApplicationTypes: this.applicationTypes.filter(a => a.category === 'internal').length,
        externalApplicationTypes: this.applicationTypes.filter(a => a.category === 'external').length,
        attachmentSettingCount: this.attachmentSettings.length
      },
      step6: {
        allowedFormats: this.documentSettings.allowedFormats.length > 0 
          ? this.documentSettings.allowedFormats.map(f => this.getFileFormatLabel(f)).join(', ')
          : 'すべてのファイル形式',
        maxFileSize: this.documentSettings.maxFileSize || '制限なし',
        retentionYears: this.documentSettings.retentionYears || 6
      }
    };
  }

  /**
   * 端数処理方式のラベルを取得
   */
  private getRoundingMethodLabel(value: string): string {
    if (!value) return '未設定';
    const labels: { [key: string]: string } = {
      'round': '四捨五入',
      'ceil': '切り上げ',
      'floor': '切り捨て'
    };
    return labels[value] || '未設定';
  }

  /**
   * 保険証の形式のラベルを取得
   */
  private getCardFormatLabel(value: string): string {
    if (!value || value === 'none') return '指定なし';
    const labels: { [key: string]: string } = {
      'card': 'カード型',
      'paper': '紙型',
      'ic': 'IC型'
    };
    return labels[value] || '指定なし';
  }

  /**
   * 厚生年金適用事業所区分のラベルを取得
   */
  private getBusinessCategoryLabel(value: string): string {
    if (!value) return '未入力';
    const labels: { [key: string]: string } = {
      'general': '一般の事業所',
      'specific': '特定適用事業所',
      'seaman': '船員保険の適用事業所'
    };
    return labels[value] || '未入力';
  }

  /**
   * ファイル形式のラベルを取得
   */
  private getFileFormatLabel(value: string): string {
    const option = this.fileFormatOptions.find(opt => opt.value === value);
    return option ? option.label : value;
  }

  /**
   * 日付をフォーマット
   */
  private formatDate(date: Date): string {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  /**
   * ステップ7: 最終確認の完了処理
   */
  async onStep7Submit(): Promise<void> {
    if (!this.savedOrganizationId) {
      this.errorMessage = '組織情報が保存されていません';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    try {
      // すべての設定を保存
      const updateData: any = {};
      
      // 1. 申請フロー設定を保存
      updateData.applicationFlowSettings = {
        applicationTypes: this.applicationTypes,
        approvalRule: {
          method: 'admin_any',
          description: '管理者のいずれか一名の承認'
        },
        attachmentSettings: this.attachmentSettings,
        notificationSettings: this.notificationSettings
      };

      // 2. ドキュメント設定を保存
      updateData.documentSettings = {
        allowedFormats: this.documentSettings.allowedFormats,
        maxFileSize: this.documentSettings.maxFileSize,
        retentionYears: this.documentSettings.retentionYears
      };

      // 3. セットアップ完了フラグを設定
      updateData.setupCompleted = true;

      // すべての設定を一度に保存
      await this.organizationService.updateOrganization(this.savedOrganizationId, updateData);

      this.successMessage = 'セットアップが完了しました。ダッシュボードに移動します...';
      
      // ダッシュボードにリダイレクト
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 1500);

    } catch (error: any) {
      this.errorMessage = error.message || 'セットアップの完了処理に失敗しました';
      this.isLoading = false;
    }
  }

  /**
   * ステップに戻る
   */
  goToStep(stepIndex: number): void {
    this.stepper.selectedIndex = stepIndex;
  }
}

