import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ApplicationService } from '../../../core/services/application.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ModeService } from '../../../core/services/mode.service';
import { InsuranceRateTableService } from '../../../core/services/insurance-rate-table.service';
import { NotificationService } from '../../../core/services/notification.service';
import { InsuranceRateTable } from '../../../core/models/insurance-rate-table.model';
import { Application, ApplicationStatus, ApplicationCategory, ExternalApplicationStatus, Comment, Attachment, ApplicationHistory, ApplicationReturnHistory } from '../../../core/models/application.model';
import { Employee, EmployeeChangeHistory, DependentInfo } from '../../../core/models/employee.model';
import { Organization } from '../../../core/models/organization.model';
import { ApplicationType } from '../../../core/models/application-flow.model';
import { Timestamp } from '@angular/fire/firestore';
import { ApplicationReturnHistoryViewComponent } from '../application-return-history-view/application-return-history-view.component';

/**
 * フォーマット済みセクション
 */
export interface FormattedSection {
  title: string;
  items: FormattedItem[];
}

/**
 * フォーマット済み項目
 */
export interface FormattedItem {
  label: string;
  value: string | FormattedSection[];
  isEmpty?: boolean;
}

@Component({
  selector: 'app-application-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatListModule,
    MatChipsModule,
    MatSnackBarModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatDividerModule,
    MatExpansionModule,
    ReactiveFormsModule
  ],
  templateUrl: './application-detail.component.html',
  styleUrl: './application-detail.component.css'
})
export class ApplicationDetailComponent implements OnInit, OnDestroy {
  private applicationService = inject(ApplicationService);
  private employeeService = inject(EmployeeService);
  private organizationService = inject(OrganizationService);
  private authService = inject(AuthService);
  private modeService = inject(ModeService);
  private insuranceRateTableService = inject(InsuranceRateTableService);
  private notificationService = inject(NotificationService);
  private route = inject(ActivatedRoute);
  router = inject(Router); // テンプレートで使用するためpublic
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private fb = inject(FormBuilder);

  application: Application | null = null;
  employee: Employee | null = null;
  organization: Organization | null = null;
  applicationType: ApplicationType | null = null;
  isLoading = true;
  isAdmin = false;
  currentUserId: string | null = null;
  relatedApplications: Map<string, Application> = new Map(); // 関連申請のキャッシュ
  relatedApplicationEmployees: Map<string, Employee> = new Map(); // 関連申請の社員情報キャッシュ
  private routeParamSubscription: any = null; // ルートパラメータの購読を保持

  ngOnInit(): void {
    // パラメータ変更を監視（同じコンポーネントへの遷移でも再読み込みされるように）
    this.routeParamSubscription = this.route.paramMap.subscribe(params => {
      const applicationId = params.get('id');
      
      if (!applicationId) {
        this.router.navigate(['/applications']);
        return;
      }

      const currentUser = this.authService.getCurrentUser();
      // 管理者かどうかを判定（roleベース）
      const isAdminRole = currentUser?.role === 'admin' || currentUser?.role === 'owner';
      // モードとロールの両方を考慮
      this.isAdmin = isAdminRole && this.modeService.getIsAdminMode();
      this.currentUserId = currentUser?.uid || null;

      this.loadApplication(applicationId);
    });
  }

  ngOnDestroy(): void {
    // 購読を解除してメモリリークを防ぐ
    if (this.routeParamSubscription) {
      this.routeParamSubscription.unsubscribe();
    }
  }

  /**
   * 申請情報を読み込む
   */
  private async loadApplication(applicationId: string): Promise<void> {
    // ローディング状態をリセット
    this.isLoading = true;
    // 関連申請のキャッシュをクリア（新しい申請を読み込むため）
    this.relatedApplications.clear();
    this.relatedApplicationEmployees.clear();
    
    try {
      this.application = await this.applicationService.getApplication(applicationId);
      
      if (!this.application) {
        this.snackBar.open('申請が見つかりませんでした', '閉じる', { duration: 3000 });
        this.router.navigate(['/applications']);
        return;
      }

      // 社員情報を読み込む（employeeIdがある場合のみ）
      if (this.application.employeeId) {
        this.employee = await this.employeeService.getEmployee(this.application.employeeId);
      }
      
      // 組織情報を読み込む
      this.organization = await this.organizationService.getOrganization(this.application.organizationId);
      
      // 申請種別を取得
      if (this.organization?.applicationFlowSettings?.applicationTypes) {
        this.applicationType = this.organization.applicationFlowSettings.applicationTypes.find(
          type => type.id === this.application!.type
        ) || null;
      }

      // 関連する申請を読み込む
      await this.loadRelatedApplications();

      this.isLoading = false;
    } catch (error) {
      console.error('申請情報の読み込みに失敗しました:', error);
      this.snackBar.open('申請情報の読み込みに失敗しました', '閉じる', { duration: 3000 });
      this.router.navigate(['/applications']);
    }
  }

  /**
   * ステータスラベルを取得
   */
  getStatusLabel(status: ApplicationStatus): string {
    const labels: Record<ApplicationStatus, string> = {
      draft: '下書き',
      created: '作成済み',
      pending: '承認待ち',
      pending_received: '処理待ち（受理済み）',
      pending_not_received: '処理待ち（未受理）',
      approved: '承認済み',
      rejected: '却下',
      returned: '差戻し',
      withdrawn: '取り下げ'
    };
    return labels[status] || status;
  }

  /**
   * ステータスカラーを取得
   */
  getStatusColor(status: ApplicationStatus): string {
    const colors: Record<ApplicationStatus, string> = {
      draft: '',
      created: 'primary',
      pending: 'accent',
      pending_received: 'accent',
      pending_not_received: 'accent',
      approved: 'primary',
      rejected: 'warn',
      returned: '',
      withdrawn: ''
    };
    return colors[status] || '';
  }

  /**
   * カテゴリラベルを取得
   */
  getCategoryLabel(category: ApplicationCategory): string {
    return category === 'internal' ? '内部申請' : '外部申請';
  }

  /**
   * 申請種別名を取得
   */
  getApplicationTypeName(): string {
    return this.applicationType?.name || this.application?.type || '不明';
  }

  /**
   * 申請者名を取得（申請一覧と同じロジック）
   */
  getApplicantName(): string {
    if (this.application?.employeeId) {
      return this.employee ? `${this.employee.lastName} ${this.employee.firstName}` : '不明';
    } else {
      // employeeIdがundefinedの場合は会社名（オーナーアカウント）を表示
      return this.organization?.name || '不明';
    }
  }

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date | Timestamp | undefined | null): string {
    if (!date) return '-';
    const d = date instanceof Date ? date : (date instanceof Timestamp ? date.toDate() : new Date(date));
    return d.toLocaleDateString('ja-JP');
  }

  /**
   * 申請の期限を取得（各被保険者ごとまたは申請全体）
   */
  getApplicationDeadlines(): Array<{ label: string; deadline: Date; isOverdue: boolean; isWithinFiveDays: boolean }> {
    const deadlines: Array<{ label: string; deadline: Date; isOverdue: boolean; isWithinFiveDays: boolean }> = [];
    const now = new Date();
    const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

    if (!this.application?.data) {
      // 申請全体の期限
      if (this.application?.deadline) {
        const deadline = this.application.deadline instanceof Date 
          ? this.application.deadline 
          : (this.application.deadline instanceof Timestamp 
            ? this.application.deadline.toDate() 
            : new Date(this.application.deadline));
        deadlines.push({
          label: '申請期限',
          deadline,
          isOverdue: deadline < now,
          isWithinFiveDays: deadline <= fiveDaysLater && deadline >= now
        });
      }
      return deadlines;
    }

    const data = this.application.data;
    
    // 資格取得届・資格喪失届・賞与支払届：各被保険者ごとの期限
    if (data['insuredPersons'] && Array.isArray(data['insuredPersons'])) {
      data['insuredPersons'].forEach((person: any, index: number) => {
        if (!person.deadline) return;
        
        const deadline = person.deadline instanceof Date 
          ? person.deadline 
          : (person.deadline instanceof Timestamp 
            ? person.deadline.toDate() 
            : (person.deadline as any).toDate 
              ? (person.deadline as any).toDate() 
              : new Date(person.deadline));
        
        const personName = person.lastName && person.firstName 
          ? `${person.lastName} ${person.firstName}` 
          : person.name || `被保険者 ${index + 1}`;
        
        deadlines.push({
          label: `${personName}の期限`,
          deadline,
          isOverdue: deadline < now,
          isWithinFiveDays: deadline <= fiveDaysLater && deadline >= now
        });
      });
    }
    // 算定基礎届・報酬月額変更届：各被保険者ごとの期限
    else if ((data['rewardBasePersons'] || data['rewardChangePersons']) && Array.isArray(data['rewardBasePersons'] || data['rewardChangePersons'])) {
      const persons = data['rewardBasePersons'] || data['rewardChangePersons'];
      persons.forEach((person: any, index: number) => {
        if (!person.deadline) return;
        
        const deadline = person.deadline instanceof Date 
          ? person.deadline 
          : (person.deadline instanceof Timestamp 
            ? person.deadline.toDate() 
            : (person.deadline as any).toDate 
              ? (person.deadline as any).toDate() 
              : new Date(person.deadline));
        
        const personName = person.name || `被保険者 ${index + 1}`;
        
        deadlines.push({
          label: `${personName}の期限`,
          deadline,
          isOverdue: deadline < now,
          isWithinFiveDays: deadline <= fiveDaysLater && deadline >= now
        });
      });
    }
    // 被扶養者異動届など：申請全体の期限
    else if (this.application.deadline) {
      const deadline = this.application.deadline instanceof Date 
        ? this.application.deadline 
        : (this.application.deadline instanceof Timestamp 
          ? this.application.deadline.toDate() 
          : new Date(this.application.deadline));
      deadlines.push({
        label: '申請期限',
        deadline,
        isOverdue: deadline < now,
        isWithinFiveDays: deadline <= fiveDaysLater && deadline >= now
      });
    }

    return deadlines;
  }

  /**
   * 期限ステータスの色を取得
   */
  getDeadlineStatusColor(deadline: Date): string {
    const now = new Date();
    const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    
    if (deadline < now) {
      return 'warn'; // 期限超過：赤
    } else if (deadline <= fiveDaysLater) {
      return 'accent'; // 5日以内：オレンジ
    }
    return 'primary'; // 通常：青
  }

  /**
   * 期限ステータスのアイコンを取得
   */
  getDeadlineStatusIcon(deadline: Date): string {
    const now = new Date();
    const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    
    if (deadline < now) {
      return 'error'; // 期限超過
    } else if (deadline <= fiveDaysLater) {
      return 'warning'; // 5日以内
    }
    return 'schedule'; // 通常
  }

  /**
   * 期限アイテムの期限ステータス色を取得
   */
  getDeadlineStatusColorForItem(value: string | FormattedSection[]): string {
    if (!value || typeof value !== 'string' || value === '-') return '';
    try {
      const deadline = new Date(value);
      return this.getDeadlineStatusColor(deadline);
    } catch {
      return '';
    }
  }

  /**
   * 期限アイテムの期限ステータスアイコンを取得
   */
  getDeadlineStatusIconForItem(value: string | FormattedSection[]): string {
    if (!value || typeof value !== 'string' || value === '-') return 'schedule';
    try {
      const deadline = new Date(value);
      return this.getDeadlineStatusIcon(deadline);
    } catch {
      return 'schedule';
    }
  }

  /**
   * 期限が超過しているか判定
   */
  isDeadlineOverdue(value: string | FormattedSection[]): boolean {
    if (!value || typeof value !== 'string' || value === '-') return false;
    try {
      const deadline = new Date(value);
      return deadline < new Date();
    } catch {
      return false;
    }
  }

  /**
   * 期限が5日以内か判定
   */
  isDeadlineWithinFiveDays(value: string | FormattedSection[]): boolean {
    if (!value || typeof value !== 'string' || value === '-') return false;
    try {
      const deadline = new Date(value);
      const now = new Date();
      const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      return deadline <= fiveDaysLater && deadline >= now;
    } catch {
      return false;
    }
  }

  /**
   * 日時をフォーマット
   */
  formatDateTime(date: Date | Timestamp | undefined | null): string {
    if (!date) return '-';
    const d = date instanceof Date ? date : (date instanceof Timestamp ? date.toDate() : new Date(date));
    return d.toLocaleString('ja-JP');
  }

  /**
   * アクションラベルを取得
   */
  getActionLabel(action: ApplicationHistory['action']): string {
    const labels: Record<ApplicationHistory['action'], string> = {
      submit: '提出',
      approve: '承認',
      reject: '却下',
      return: '差戻し',
      withdraw: '取り下げ',
      status_change: 'ステータス変更'
    };
    return labels[action] || action;
  }

  /**
   * 申請内容を表示用にフォーマット（申請種別ごと）
   */
  formatApplicationData(data: Record<string, any>): FormattedSection[] {
    console.log('[DEBUG] formatApplicationData 呼び出し', {
      hasApplicationType: !!this.applicationType,
      applicationTypeCode: this.applicationType?.code,
      dataKeys: Object.keys(data || {})
    });
    
    if (!this.applicationType?.code) {
      console.log('[DEBUG] applicationType.codeが存在しないため、formatGenericDataを呼び出し');
      return this.formatGenericData(data);
    }

    const code = this.applicationType.code;
    console.log('[DEBUG] 申請種別コード:', code);
    
    // データの変換（後方互換性のため）
    const formattedData = { ...data };
    
    // 算定基礎届の場合、insuredPersonsをrewardBasePersonsに変換
    if (code === 'REWARD_BASE' && formattedData['insuredPersons'] && !formattedData['rewardBasePersons']) {
      formattedData['rewardBasePersons'] = formattedData['insuredPersons'];
    }
    
    // 報酬月額変更届の場合、insuredPersonsをrewardChangePersonsに変換
    if (code === 'REWARD_CHANGE' && formattedData['insuredPersons'] && !formattedData['rewardChangePersons']) {
      formattedData['rewardChangePersons'] = formattedData['insuredPersons'];
    }
    
    // 申請種別ごとのフォーマッターを呼び出す
    switch (code) {
      case 'INSURANCE_ACQUISITION':
        return this.formatInsuranceAcquisitionData(formattedData);
      case 'INSURANCE_LOSS':
        return this.formatInsuranceLossData(formattedData);
      case 'DEPENDENT_CHANGE':
      case 'DEPENDENT_CHANGE_EXTERNAL':
        console.log('[DEBUG] formatDependentChangeDataを呼び出します');
        return this.formatDependentChangeData(formattedData);
      case 'ADDRESS_CHANGE':
      case 'ADDRESS_CHANGE_EXTERNAL':
        return this.formatAddressChangeData(formattedData);
      case 'NAME_CHANGE':
      case 'NAME_CHANGE_EXTERNAL':
        return this.formatNameChangeData(formattedData);
      case 'REWARD_BASE':
        return this.formatRewardBaseData(formattedData);
      case 'REWARD_CHANGE':
        return this.formatRewardChangeData(formattedData);
      case 'BONUS_PAYMENT':
        return this.formatBonusPaymentData(formattedData);
      default:
        return this.formatGenericData(formattedData);
    }
  }

  /**
   * 被保険者資格取得届のデータをフォーマット
   */
  private formatInsuranceAcquisitionData(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    // 提出者情報
    if (data['submitterInfo']) {
      const submitterItems: FormattedItem[] = [];
      const si = data['submitterInfo'];
      
      submitterItems.push({ label: '事業所記号', value: si.officeSymbol || '', isEmpty: !si.officeSymbol });
      submitterItems.push({ label: '事業所番号', value: si.officeNumber || '', isEmpty: !si.officeNumber });
      
      // 住所に郵便番号を追加（フォームデータにpostalCodeがある場合）
      const postalCode = si.postalCode || '';
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
        
        // 期限を表示
        if (person.deadline) {
          const deadline = person.deadline instanceof Date 
            ? person.deadline 
            : (person.deadline as any).toDate 
              ? (person.deadline as any).toDate() 
              : new Date(person.deadline);
          personItems.push({ label: '期限', value: this.formatDateValue(deadline), isEmpty: false });
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

  /**
   * 被保険者資格喪失届のデータをフォーマット
   */
  private formatInsuranceLossData(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    if (data['submitterInfo']) {
      const submitterItems: FormattedItem[] = [];
      const si = data['submitterInfo'];
      submitterItems.push({ label: '事業所記号', value: si.officeSymbol || '', isEmpty: !si.officeSymbol });
      submitterItems.push({ label: '事業所番号', value: si.officeNumber || '', isEmpty: !si.officeNumber });
      
      // 住所に郵便番号を追加（フォームデータにpostalCodeがある場合）
      const postalCode = si.postalCode || '';
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
        
        // 個人番号または基礎年金番号
        if (person.identificationType === 'personal_number') {
          personItems.push({ label: '個人番号', value: person.personalNumber || '', isEmpty: !person.personalNumber });
        } else if (person.identificationType === 'basic_pension_number') {
          personItems.push({ label: '基礎年金番号', value: person.basicPensionNumber || '', isEmpty: !person.basicPensionNumber });
        }
        
        personItems.push({ label: '喪失年月日', value: this.formatDateValue(person.lossDate), isEmpty: !person.lossDate });
        personItems.push({ label: '喪失理由', value: this.formatLossReason(person.lossReason), isEmpty: !person.lossReason });
        
        if (person.lossReason === 'retirement') {
          personItems.push({ label: '退職年月日', value: this.formatDateValue(person.retirementDate), isEmpty: !person.retirementDate });
        } else if (person.lossReason === 'death') {
          personItems.push({ label: '死亡年月日', value: this.formatDateValue(person.deathDate), isEmpty: !person.deathDate });
        }
        
        personItems.push({ label: '備考', value: this.formatRemarks(person.remarks), isEmpty: !person.remarks });
        
        // 資格確認書回収（添付と返不能の枚数を表示）
        const attachedCount = person.certificateCollection?.attached ?? 0;
        const unrecoverableCount = person.certificateCollection?.unrecoverable ?? 0;
        personItems.push({ label: '資格確認書回収', value: `添付：${attachedCount}枚、返不能：${unrecoverableCount}枚`, isEmpty: attachedCount === 0 && unrecoverableCount === 0 });
        
        personItems.push({ label: '70歳以上被用者不該当', value: person.over70NotApplicable ? 'チェックあり' : 'チェックなし' });
        
        if (person.over70NotApplicable && person.over70NotApplicableDate) {
          personItems.push({ label: '70歳以上被用者該当日', value: this.formatDateValue(person.over70NotApplicableDate) });
        }

        sections.push({
          title: `被保険者情報 ${index + 1}`,
          items: personItems
        });
      });
    }

    return sections;
  }

  /**
   * 被扶養者（異動）届のデータをフォーマット
   */
  private formatDependentChangeData(data: Record<string, any>): FormattedSection[] {
    console.log('[DEBUG] formatDependentChangeData 呼び出し - データ構造:', JSON.stringify(data, null, 2));
    const sections: FormattedSection[] = [];

    if (data['businessOwnerInfo']) {
      const boItems: FormattedItem[] = [];
      const bo = data['businessOwnerInfo'];
      boItems.push({ label: '事業所整理記号', value: bo.officeSymbol || '', isEmpty: !bo.officeSymbol });
      boItems.push({ label: '事業所番号', value: bo.officeNumber || '', isEmpty: !bo.officeNumber });
      
      // 住所に郵便番号を追加（他の申請と合わせる）
      const postalCode = bo.postalCode || (this.organization?.address as any)?.postalCode || '';
      let address = bo.address || bo.officeAddress || '';
      // 住所に既に郵便番号が含まれている場合は除去
      if (address.match(/^〒\d{3}-?\d{4}/)) {
        address = address.replace(/^〒\d{3}-?\d{4}\s*/, '');
      }
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      boItems.push({ label: '所在地', value: addressWithPostalCode, isEmpty: !address });
      
      boItems.push({ label: '事業所名', value: bo.name || bo.officeName || '', isEmpty: !bo.name && !bo.officeName });
      boItems.push({ label: '事業主氏名', value: bo.ownerName || '', isEmpty: !bo.ownerName });
      boItems.push({ label: '電話番号', value: bo.phoneNumber || '', isEmpty: !bo.phoneNumber });

      sections.push({
        title: '事業所情報',
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
      
      // 性別を追加
      if (ip.gender) {
        const genderMap: Record<string, string> = {
          'male': '男',
          'female': '女'
        };
        ipItems.push({ label: '性別', value: genderMap[ip.gender] || ip.gender, isEmpty: !ip.gender });
      }
      
      // 個人番号または基礎年金番号
      if (ip.identificationType === 'personal_number') {
        ipItems.push({ label: '個人番号', value: ip.personalNumber || '', isEmpty: !ip.personalNumber });
      } else if (ip.identificationType === 'basic_pension_number') {
        ipItems.push({ label: '基礎年金番号', value: ip.basicPensionNumber || '', isEmpty: !ip.basicPensionNumber });
        
        // 基礎年金番号を選択した場合は住所を表示
        if (ip.address && typeof ip.address === 'object') {
          const addressParts = [
            ip.address.postalCode ? `〒${ip.address.postalCode}` : '',
            ip.address.prefecture || '',
            ip.address.city || '',
            ip.address.street || '',
            ip.address.building || ''
          ].filter(part => part);
          const addressValue = addressParts.length > 0 ? addressParts.join(' ') : '';
          if (addressValue) {
            ipItems.push({ label: '住所', value: addressValue, isEmpty: false });
            if (ip.address.addressKana) {
              ipItems.push({ label: '住所（カナ）', value: ip.address.addressKana, isEmpty: false });
            }
          }
        } else if (ip.address) {
          ipItems.push({ label: '住所', value: ip.address, isEmpty: !ip.address });
        }
      }
      
      // 取得年月日を追加
      if (ip.acquisitionDate) {
        ipItems.push({ label: '取得年月日', value: this.formatEraDate(ip.acquisitionDate), isEmpty: !ip.acquisitionDate });
      }
      
      // 収入を追加
      if (ip.income !== null && ip.income !== undefined) {
        ipItems.push({ label: '収入', value: `${ip.income.toLocaleString()}円`, isEmpty: false });
      }

      sections.push({
        title: '被保険者情報',
        items: ipItems
      });
    }

    if (data['spouseDependent']) {
      const sd = data['spouseDependent'];
      console.log('[DEBUG] 配偶者被扶養者情報のデータ構造:', JSON.stringify(sd, null, 2));
      const sdItems: FormattedItem[] = [];
      
      if (sd.noChange) {
        sdItems.push({ label: '変更なし', value: '変更なし' });
        // 異動がない場合の配偶者の収入を表示
        if (sd.spouseIncome !== null && sd.spouseIncome !== undefined) {
          sdItems.push({ label: '配偶者の収入（年収）', value: `${sd.spouseIncome.toLocaleString()}円`, isEmpty: false });
        }
        // 提出日を追加（businessOwnerReceiptDateまたはsubmissionDateから取得）
        if (data['businessOwnerReceiptDate']) {
          sdItems.push({ label: '社員提出日', value: this.formatEraDate(data['businessOwnerReceiptDate']), isEmpty: !data['businessOwnerReceiptDate'] });
        } else if (data['submissionDate']) {
          sdItems.push({ label: '社員提出日', value: this.formatEraDate(data['submissionDate']), isEmpty: !data['submissionDate'] });
        }
      } else {
        sdItems.push({ label: '異動種別', value: this.formatChangeType(sd.changeType), isEmpty: !sd.changeType });
        
        // 提出日を追加（businessOwnerReceiptDateまたはsubmissionDateから取得）
        if (data['businessOwnerReceiptDate']) {
          sdItems.push({ label: '社員提出日', value: this.formatEraDate(data['businessOwnerReceiptDate']), isEmpty: !data['businessOwnerReceiptDate'] });
        } else if (data['submissionDate']) {
          sdItems.push({ label: '社員提出日', value: this.formatEraDate(data['submissionDate']), isEmpty: !data['submissionDate'] });
        }
        
        if (sd.changeType === 'change') {
          // 異動種別が「変更」の場合：変更前・変更後の両方を表示
          // 変更前の情報は通常のフィールド（sd.name、sd.nameKanaなど）から取得
          
          // 氏名：変更前・変更後
          sdItems.push({ label: '氏名（変更前）', value: sd.name || '', isEmpty: !sd.name });
          sdItems.push({ label: '氏名（変更後）', value: `${sd.changeAfter?.lastName || ''} ${sd.changeAfter?.firstName || ''}`.trim() || '', isEmpty: !sd.changeAfter?.lastName && !sd.changeAfter?.firstName });
          
          // 氏名（カナ）：変更前・変更後
          sdItems.push({ label: '氏名（カナ）（変更前）', value: sd.nameKana || '', isEmpty: !sd.nameKana });
          sdItems.push({ label: '氏名（カナ）（変更後）', value: `${sd.changeAfter?.lastNameKana || ''} ${sd.changeAfter?.firstNameKana || ''}`.trim() || '', isEmpty: !sd.changeAfter?.lastNameKana && !sd.changeAfter?.firstNameKana });
          
          // 生年月日：変更前・変更後
          sdItems.push({ label: '生年月日（変更前）', value: this.formatEraDate(sd.birthDate), isEmpty: !sd.birthDate });
          // 変更後の生年月日：eraが設定されていても、year、month、dayのいずれかが空の場合は未入力とみなす
          const changeAfterBirthDate = sd.changeAfter?.birthDate;
          const isChangeAfterBirthDateEmpty = !changeAfterBirthDate || 
            (typeof changeAfterBirthDate === 'object' && 
             (!changeAfterBirthDate.year || 
              !changeAfterBirthDate.month || 
              !changeAfterBirthDate.day));
          sdItems.push({ label: '生年月日（変更後）', value: this.formatEraDate(changeAfterBirthDate), isEmpty: isChangeAfterBirthDateEmpty });
          
          // 続柄：変更前・変更後
          sdItems.push({ label: '続柄（変更前）', value: this.formatSpouseRelationship(sd.relationship), isEmpty: !sd.relationship });
          sdItems.push({ label: '続柄（変更後）', value: this.formatSpouseRelationship(sd.changeAfter?.relationship), isEmpty: !sd.changeAfter?.relationship });
          
          // 個人番号または基礎年金番号：変更前のみ（編集不可）
          if (sd.identificationType === 'personal_number') {
            sdItems.push({ label: '個人番号（変更前）', value: sd.personalNumber || '', isEmpty: !sd.personalNumber });
          } else if (sd.identificationType === 'basic_pension_number') {
            sdItems.push({ label: '基礎年金番号（変更前）', value: sd.basicPensionNumber || '', isEmpty: !sd.basicPensionNumber });
          }
          
          // 外国人通称名：変更前のみ（該当する場合のみ）
          if (sd.isForeigner) {
            sdItems.push({ label: '外国人通称名（変更前）', value: sd.foreignName || '', isEmpty: !sd.foreignName });
            sdItems.push({ label: '外国人通称名（カナ）（変更前）', value: sd.foreignNameKana || '', isEmpty: !sd.foreignNameKana });
          }
          
          // 住所：変更前・変更後
          if (sd.address && typeof sd.address === 'object') {
            const beforeAddressParts = [
              sd.address.postalCode ? `〒${sd.address.postalCode}` : '',
              sd.address.prefecture || '',
              sd.address.city || '',
              sd.address.street || '',
              sd.address.building || ''
            ].filter(part => part);
            const beforeAddressValue = beforeAddressParts.length > 0 ? beforeAddressParts.join(' ') : '';
            sdItems.push({ label: '住所（変更前）', value: beforeAddressValue, isEmpty: !beforeAddressValue });
            if (sd.address.addressKana) {
              sdItems.push({ label: '住所（カナ）（変更前）', value: sd.address.addressKana, isEmpty: !sd.address.addressKana });
            }
            if (sd.address.livingTogether) {
              sdItems.push({ label: '同居／別居（変更前）', value: sd.address.livingTogether === 'living_together' ? '同居' : '別居', isEmpty: false });
            }
          } else if (sd.address) {
            sdItems.push({ label: '住所（変更前）', value: sd.address || '', isEmpty: !sd.address });
          }
          
          if (sd.changeAfter?.address && typeof sd.changeAfter.address === 'object') {
            const afterAddressParts = [
              sd.changeAfter.address.postalCode ? `〒${sd.changeAfter.address.postalCode}` : '',
              sd.changeAfter.address.prefecture || '',
              sd.changeAfter.address.city || '',
              sd.changeAfter.address.street || '',
              sd.changeAfter.address.building || ''
            ].filter(part => part);
            const afterAddressValue = afterAddressParts.length > 0 ? afterAddressParts.join(' ') : '';
            sdItems.push({ label: '住所（変更後）', value: afterAddressValue, isEmpty: !afterAddressValue });
            if (sd.changeAfter.address.addressKana) {
              sdItems.push({ label: '住所（カナ）（変更後）', value: sd.changeAfter.address.addressKana, isEmpty: !sd.changeAfter.address.addressKana });
            }
            // 変更後の同居／別居を常に表示（値がない場合は未入力）
            const afterLivingTogether = sd.changeAfter.address.livingTogether;
            const afterLivingTogetherValue = afterLivingTogether === 'living_together' ? '同居' : afterLivingTogether === 'separate' ? '別居' : '';
            sdItems.push({ label: '同居／別居（変更後）', value: afterLivingTogetherValue, isEmpty: !afterLivingTogether });
          } else {
            // 住所がオブジェクト形式でない場合でも、同居／別居の項目を表示
            sdItems.push({ label: '同居／別居（変更後）', value: '', isEmpty: true });
          }
          
          // 電話番号：変更前・変更後
          if (sd.phoneNumber && typeof sd.phoneNumber === 'object') {
            const beforePhoneType = sd.phoneNumber.type ? this.formatPhoneType(sd.phoneNumber.type) : '';
            const beforePhone = sd.phoneNumber.phone || '';
            if (beforePhoneType || beforePhone) {
              sdItems.push({ label: '電話番号種別（変更前）', value: beforePhoneType, isEmpty: !beforePhoneType });
              sdItems.push({ label: '電話番号（変更前）', value: beforePhone, isEmpty: !beforePhone });
            }
          } else if (sd.phoneNumber) {
            sdItems.push({ label: '電話番号（変更前）', value: sd.phoneNumber || '', isEmpty: !sd.phoneNumber });
          } else if (sd.phoneType) {
            sdItems.push({ label: '電話番号種別（変更前）', value: this.formatPhoneType(sd.phoneType), isEmpty: !sd.phoneType });
          }
          
          if (sd.changeAfter?.phoneNumber && typeof sd.changeAfter.phoneNumber === 'object') {
            const afterPhoneType = sd.changeAfter.phoneNumber.type ? this.formatPhoneType(sd.changeAfter.phoneNumber.type) : '';
            const afterPhone = sd.changeAfter.phoneNumber.phone || '';
            if (afterPhoneType || afterPhone) {
              sdItems.push({ label: '電話番号種別（変更後）', value: afterPhoneType, isEmpty: !afterPhoneType });
              sdItems.push({ label: '電話番号（変更後）', value: afterPhone, isEmpty: !afterPhone });
            }
          }
          
          // 職業：変更前・変更後
          sdItems.push({ label: '職業（変更前）', value: this.formatOccupation(sd.occupation), isEmpty: !sd.occupation });
          if (sd.occupation === 'other') {
            sdItems.push({ label: '職業（その他）（変更前）', value: sd.occupationOther || '', isEmpty: !sd.occupationOther });
          }
          if (sd.occupation === 'student_high_school') {
            sdItems.push({ label: '学年（変更前）', value: sd.studentYear || '', isEmpty: !sd.studentYear });
          }
          
          sdItems.push({ label: '職業（変更後）', value: this.formatOccupation(sd.changeAfter?.occupation), isEmpty: !sd.changeAfter?.occupation });
          if (sd.changeAfter?.occupation === 'other') {
            sdItems.push({ label: '職業（その他）（変更後）', value: sd.changeAfter.occupationOther || '', isEmpty: !sd.changeAfter.occupationOther });
          }
          if (sd.changeAfter?.occupation === 'student_high_school') {
            sdItems.push({ label: '学年（変更後）', value: sd.changeAfter.studentYear || '', isEmpty: !sd.changeAfter.studentYear });
          }
          
          // 収入（年収）：変更前・変更後
          if (sd.income !== null && sd.income !== undefined) {
            sdItems.push({ label: '収入（年収）（変更前）', value: `${sd.income.toLocaleString()}円`, isEmpty: false });
          }
          if (sd.changeAfter?.income !== null && sd.changeAfter?.income !== undefined) {
            sdItems.push({ label: '収入（年収）（変更後）', value: `${sd.changeAfter.income.toLocaleString()}円`, isEmpty: false });
          }
          
          // 備考：変更前・変更後
          sdItems.push({ label: '備考（変更前）', value: sd.remarks || '', isEmpty: !sd.remarks });
          sdItems.push({ label: '備考（変更後）', value: sd.changeAfter?.remarks || '', isEmpty: !sd.changeAfter?.remarks });
          
          // 海外特例要件：変更前・変更後
          if (sd.overseasException) {
            const beforeOverseasValue = sd.overseasException === 'applicable' ? '該当' : sd.overseasException === 'not_applicable' ? '非該当' : '';
            sdItems.push({ label: '海外特例要件（変更前）', value: beforeOverseasValue, isEmpty: !beforeOverseasValue });
            if (sd.overseasException === 'applicable') {
              sdItems.push({ label: '海外特例該当理由（変更前）', value: this.formatOverseasExceptionReason(sd.overseasExceptionStartReason), isEmpty: !sd.overseasExceptionStartReason });
              if (sd.overseasExceptionStartReason === 'other') {
                sdItems.push({ label: '海外特例該当理由（その他）（変更前）', value: sd.overseasExceptionStartReasonOther || '', isEmpty: !sd.overseasExceptionStartReasonOther });
              }
              if (sd.overseasExceptionStartDate) {
                sdItems.push({ label: '海外特例要件に該当した日（変更前）', value: this.formatEraDate(sd.overseasExceptionStartDate), isEmpty: !sd.overseasExceptionStartDate });
              }
            }
            if (sd.overseasException === 'not_applicable') {
              sdItems.push({ label: '海外特例該当終了理由（変更前）', value: this.formatOverseasExceptionEndReason(sd.overseasExceptionEndReason), isEmpty: !sd.overseasExceptionEndReason });
              if (sd.overseasExceptionEndReason === 'domestic_transfer') {
                sdItems.push({ label: '国内転出年月日（変更前）', value: this.formatDateValue(sd.domesticTransferDate), isEmpty: !sd.domesticTransferDate });
              }
              if (sd.overseasExceptionEndReason === 'other') {
                sdItems.push({ label: '海外特例該当終了理由（その他）（変更前）', value: sd.overseasExceptionEndReasonOther || '', isEmpty: !sd.overseasExceptionEndReasonOther });
              }
              if (sd.overseasExceptionEndDate) {
                sdItems.push({ label: '海外特例要件に非該当となった日（変更前）', value: this.formatEraDate(sd.overseasExceptionEndDate), isEmpty: !sd.overseasExceptionEndDate });
              }
            }
          }
          
          if (sd.changeAfter?.overseasException) {
            const afterOverseasValue = sd.changeAfter.overseasException === 'applicable' ? '該当' : sd.changeAfter.overseasException === 'not_applicable' ? '非該当' : '';
            sdItems.push({ label: '海外特例要件（変更後）', value: afterOverseasValue, isEmpty: !afterOverseasValue });
            if (sd.changeAfter.overseasException === 'applicable') {
              sdItems.push({ label: '海外特例該当理由（変更後）', value: this.formatOverseasExceptionReason(sd.changeAfter.overseasExceptionStartReason), isEmpty: !sd.changeAfter.overseasExceptionStartReason });
              if (sd.changeAfter.overseasExceptionStartReason === 'other') {
                sdItems.push({ label: '海外特例該当理由（その他）（変更後）', value: sd.changeAfter.overseasExceptionStartReasonOther || '', isEmpty: !sd.changeAfter.overseasExceptionStartReasonOther });
              }
              if (sd.changeAfter.overseasExceptionStartDate) {
                sdItems.push({ label: '海外特例要件に該当した日（変更後）', value: this.formatEraDate(sd.changeAfter.overseasExceptionStartDate), isEmpty: !sd.changeAfter.overseasExceptionStartDate });
              }
            }
            if (sd.changeAfter.overseasException === 'not_applicable') {
              sdItems.push({ label: '海外特例該当終了理由（変更後）', value: this.formatOverseasExceptionEndReason(sd.changeAfter.overseasExceptionEndReason), isEmpty: !sd.changeAfter.overseasExceptionEndReason });
              if (sd.changeAfter.overseasExceptionEndReason === 'domestic_transfer') {
                sdItems.push({ label: '国内転出年月日（変更後）', value: this.formatDateValue(sd.changeAfter.domesticTransferDate), isEmpty: !sd.changeAfter.domesticTransferDate });
              }
              if (sd.changeAfter.overseasExceptionEndReason === 'other') {
                sdItems.push({ label: '海外特例該当終了理由（その他）（変更後）', value: sd.changeAfter.overseasExceptionEndReasonOther || '', isEmpty: !sd.changeAfter.overseasExceptionEndReasonOther });
              }
              if (sd.changeAfter.overseasExceptionEndDate) {
                sdItems.push({ label: '海外特例要件に非該当となった日（変更後）', value: this.formatEraDate(sd.changeAfter.overseasExceptionEndDate), isEmpty: !sd.changeAfter.overseasExceptionEndDate });
              }
            }
          }
        } else {
          // 異動種別が変更以外の場合、通常の氏名・氏名（カナ）・生年月日を表示
          sdItems.push({ label: '氏名', value: sd.name || '', isEmpty: !sd.name });
          sdItems.push({ label: '氏名（カナ）', value: sd.nameKana || '', isEmpty: !sd.nameKana });
          sdItems.push({ label: '生年月日', value: this.formatEraDate(sd.birthDate), isEmpty: !sd.birthDate });
          
          // 続柄を日本語化
          sdItems.push({ label: '続柄', value: this.formatSpouseRelationship(sd.relationship), isEmpty: !sd.relationship });
          
          // 個人番号または基礎年金番号を追加
          if (sd.identificationType === 'personal_number') {
            sdItems.push({ label: '個人番号', value: sd.personalNumber || '', isEmpty: !sd.personalNumber });
          } else if (sd.identificationType === 'basic_pension_number') {
            sdItems.push({ label: '基礎年金番号', value: sd.basicPensionNumber || '', isEmpty: !sd.basicPensionNumber });
          }
          
          // 電話番号と住所の[object Object]表示を修正
          if (sd.phoneNumber && typeof sd.phoneNumber === 'object') {
            const phoneType = sd.phoneNumber.type ? this.formatPhoneType(sd.phoneNumber.type) : '';
            const phone = sd.phoneNumber.phone || '';
            if (phoneType || phone) {
              sdItems.push({ label: '電話番号種別', value: phoneType, isEmpty: !phoneType });
              sdItems.push({ label: '電話番号', value: phone, isEmpty: !phone });
            }
          } else {
            // 旧形式のサポート（後方互換性）
            sdItems.push({ label: '電話番号種別', value: this.formatPhoneType(sd.phoneType), isEmpty: !sd.phoneType });
            sdItems.push({ label: '電話番号', value: sd.phoneNumber || '', isEmpty: !sd.phoneNumber });
          }
          
          // 住所の[object Object]表示を修正
          if (sd.address && typeof sd.address === 'object') {
            const addressParts = [
              sd.address.postalCode ? `〒${sd.address.postalCode}` : '',
              sd.address.prefecture || '',
              sd.address.city || '',
              sd.address.street || '',
              sd.address.building || ''
            ].filter(part => part);
            const addressValue = addressParts.length > 0 ? addressParts.join(' ') : '';
            sdItems.push({ label: '住所', value: addressValue, isEmpty: !addressValue });
            if (sd.address.addressKana) {
              sdItems.push({ label: '住所（カナ）', value: sd.address.addressKana, isEmpty: !sd.address.addressKana });
            }
          } else {
            // 旧形式のサポート（後方互換性）
            sdItems.push({ label: '住所', value: sd.address || '', isEmpty: !sd.address });
          }
          
          // 異動年月日を削除（入力欄にない項目）
          // sdItems.push({ label: '異動年月日', value: this.formatDateValue(sd.changeDate), isEmpty: !sd.changeDate });
          
          // 異動種別が該当の場合のみ、被扶養者となった理由と年月日を表示
          if (sd.changeType === 'applicable') {
            // 被扶養者となった理由の表示を修正（dependentStartReasonを使用、後方互換性のためbecameDependentReasonもサポート）
            const startReason = sd.dependentStartReason || sd.becameDependentReason;
            sdItems.push({ label: '被扶養者となった理由', value: this.formatDependentStartReason(startReason), isEmpty: !startReason });
            if (startReason === 'other') {
              sdItems.push({ label: '被扶養者となった理由（その他）', value: sd.dependentStartReasonOther || sd.becameDependentReasonOther || '', isEmpty: !sd.dependentStartReasonOther && !sd.becameDependentReasonOther });
            }
            
            // 被扶養者になった年月日を追加
            if (sd.dependentStartDate) {
              sdItems.push({ label: '被扶養者になった年月日', value: this.formatEraDate(sd.dependentStartDate), isEmpty: !sd.dependentStartDate });
            }
          }
          
          sdItems.push({ label: '職業', value: this.formatOccupation(sd.occupation), isEmpty: !sd.occupation });
          if (sd.occupation === 'other') {
            sdItems.push({ label: '職業（その他）', value: sd.occupationOther || '', isEmpty: !sd.occupationOther });
          }
          if (sd.occupation === 'student_high_school') {
            sdItems.push({ label: '学年', value: sd.studentYear || '', isEmpty: !sd.studentYear });
          }
          
          // 収入を追加
          if (sd.income !== null && sd.income !== undefined) {
            sdItems.push({ label: '収入', value: `${sd.income.toLocaleString()}円`, isEmpty: false });
          }
          
          // 資格確認書発行要否を追加
          if (sd.certificateRequired !== null && sd.certificateRequired !== undefined) {
            sdItems.push({ label: '資格確認書発行要否', value: sd.certificateRequired ? '要' : '不要', isEmpty: false });
          }
          
          // 異動種別が非該当の場合、被扶養者でなくなった理由と年月日を表示
          if (sd.changeType === 'not_applicable') {
            sdItems.push({ label: '被扶養者でなくなった理由', value: this.formatDependentEndReason(sd.dependentEndReason), isEmpty: !sd.dependentEndReason });
            if (sd.dependentEndReason === 'death') {
              sdItems.push({ label: '死亡年月日', value: this.formatDateValue(sd.deathDate), isEmpty: !sd.deathDate });
            }
            // 被扶養者でなくなった年月日を追加
            if (sd.dependentEndDate) {
              sdItems.push({ label: '被扶養者でなくなった年月日', value: this.formatEraDate(sd.dependentEndDate), isEmpty: !sd.dependentEndDate });
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
      console.log('[DEBUG] その他被扶養者情報のデータ構造:', JSON.stringify(data['otherDependents'], null, 2));
      data['otherDependents'].forEach((dep: any, index: number) => {
        console.log(`[DEBUG] その他被扶養者[${index}]のデータ構造:`, JSON.stringify(dep, null, 2));
        const depItems: FormattedItem[] = [];
        
        depItems.push({ label: '異動種別', value: this.formatChangeType(dep.changeType), isEmpty: !dep.changeType });
        
        // 異動無しの場合は氏名のみを表示
        if (dep.changeType === 'no_change') {
          depItems.push({ label: '氏名', value: `${dep.lastName || ''} ${dep.firstName || ''}`.trim() || '', isEmpty: !dep.lastName && !dep.firstName });
        } else {
          // 異動無し以外の場合、既存の表示ロジックを維持
          if (dep.changeType === 'change') {
            // 異動種別が「変更」の場合：変更前・変更後の両方を表示
            // 変更前の情報は通常のフィールド（dep.lastName、dep.firstNameなど）から取得
            
            // 氏：変更前・変更後
            depItems.push({ label: '氏（変更前）', value: dep.lastName || '', isEmpty: !dep.lastName });
            depItems.push({ label: '氏（変更後）', value: dep.changeAfter?.lastName || '', isEmpty: !dep.changeAfter?.lastName });
            
            // 名：変更前・変更後
            depItems.push({ label: '名（変更前）', value: dep.firstName || '', isEmpty: !dep.firstName });
            depItems.push({ label: '名（変更後）', value: dep.changeAfter?.firstName || '', isEmpty: !dep.changeAfter?.firstName });
            
            // 氏（カナ）：変更前・変更後
            depItems.push({ label: '氏（カナ）（変更前）', value: dep.lastNameKana || '', isEmpty: !dep.lastNameKana });
            depItems.push({ label: '氏（カナ）（変更後）', value: dep.changeAfter?.lastNameKana || '', isEmpty: !dep.changeAfter?.lastNameKana });
            
            // 名（カナ）：変更前・変更後
            depItems.push({ label: '名（カナ）（変更前）', value: dep.firstNameKana || '', isEmpty: !dep.firstNameKana });
            depItems.push({ label: '名（カナ）（変更後）', value: dep.changeAfter?.firstNameKana || '', isEmpty: !dep.changeAfter?.firstNameKana });
            
            // 生年月日：変更前・変更後
            depItems.push({ label: '生年月日（変更前）', value: this.formatEraDate(dep.birthDate), isEmpty: !dep.birthDate });
            // 変更後の生年月日：eraが設定されていても、year、month、dayのいずれかが空の場合は未入力とみなす
            const depChangeAfterBirthDate = dep.changeAfter?.birthDate;
            const isDepChangeAfterBirthDateEmpty = !depChangeAfterBirthDate || 
              (typeof depChangeAfterBirthDate === 'object' && 
               (!depChangeAfterBirthDate.year || 
                !depChangeAfterBirthDate.month || 
                !depChangeAfterBirthDate.day));
            depItems.push({ label: '生年月日（変更後）', value: this.formatEraDate(depChangeAfterBirthDate), isEmpty: isDepChangeAfterBirthDateEmpty });
            
            // 性別：変更前・変更後
            if (dep.gender) {
              const beforeGenderMap: Record<string, string> = {
                'male': '男',
                'female': '女'
              };
              depItems.push({ label: '性別（変更前）', value: beforeGenderMap[dep.gender] || dep.gender, isEmpty: !dep.gender });
            }
            if (dep.changeAfter?.gender) {
              const afterGenderMap: Record<string, string> = {
                'male': '男',
                'female': '女'
              };
              depItems.push({ label: '性別（変更後）', value: afterGenderMap[dep.changeAfter.gender] || dep.changeAfter.gender, isEmpty: !dep.changeAfter.gender });
            }
            
            // 続柄：変更前・変更後
            depItems.push({ label: '続柄（変更前）', value: this.formatOtherDependentRelationship(dep.relationship), isEmpty: !dep.relationship });
            if (dep.relationship === 'other') {
              depItems.push({ label: '続柄（その他）（変更前）', value: dep.relationshipOther || '', isEmpty: !dep.relationshipOther });
            }
            
            depItems.push({ label: '続柄（変更後）', value: this.formatOtherDependentRelationship(dep.changeAfter?.relationship), isEmpty: !dep.changeAfter?.relationship });
            if (dep.changeAfter?.relationship === 'other') {
              depItems.push({ label: '続柄（その他）（変更後）', value: dep.changeAfter.relationshipOther || '', isEmpty: !dep.changeAfter.relationshipOther });
            }
            
            // 個人番号：変更前のみ（編集不可）
            if (dep.personalNumber) {
              depItems.push({ label: '個人番号（変更前）', value: dep.personalNumber, isEmpty: !dep.personalNumber });
            }
            
            // 住所：変更前・変更後
            if (dep.address && typeof dep.address === 'object') {
              const beforeAddressParts = [
                dep.address.postalCode ? `〒${dep.address.postalCode}` : '',
                dep.address.prefecture || '',
                dep.address.city || '',
                dep.address.street || '',
                dep.address.building || ''
              ].filter(part => part);
              const beforeAddressValue = beforeAddressParts.length > 0 ? beforeAddressParts.join(' ') : '';
              depItems.push({ label: '住所（変更前）', value: beforeAddressValue, isEmpty: !beforeAddressValue });
              if (dep.address.addressKana) {
                depItems.push({ label: '住所（カナ）（変更前）', value: dep.address.addressKana, isEmpty: !dep.address.addressKana });
              }
              if (dep.address.livingTogether) {
                depItems.push({ label: '同居／別居（変更前）', value: dep.address.livingTogether === 'living_together' ? '同居' : '別居', isEmpty: false });
              }
            } else if (dep.address) {
              depItems.push({ label: '住所（変更前）', value: dep.address || '', isEmpty: !dep.address });
            }
            
            if (dep.changeAfter?.address && typeof dep.changeAfter.address === 'object') {
              const afterAddressParts = [
                dep.changeAfter.address.postalCode ? `〒${dep.changeAfter.address.postalCode}` : '',
                dep.changeAfter.address.prefecture || '',
                dep.changeAfter.address.city || '',
                dep.changeAfter.address.street || '',
                dep.changeAfter.address.building || ''
              ].filter(part => part);
              const afterAddressValue = afterAddressParts.length > 0 ? afterAddressParts.join(' ') : '';
              depItems.push({ label: '住所（変更後）', value: afterAddressValue, isEmpty: !afterAddressValue });
              if (dep.changeAfter.address.addressKana) {
                depItems.push({ label: '住所（カナ）（変更後）', value: dep.changeAfter.address.addressKana, isEmpty: !dep.changeAfter.address.addressKana });
              }
              // 変更後の同居／別居を常に表示（値がない場合は未入力）
              const depAfterLivingTogether = dep.changeAfter.address.livingTogether;
              const depAfterLivingTogetherValue = depAfterLivingTogether === 'living_together' ? '同居' : depAfterLivingTogether === 'separate' ? '別居' : '';
              depItems.push({ label: '同居／別居（変更後）', value: depAfterLivingTogetherValue, isEmpty: !depAfterLivingTogether });
            } else {
              // 住所がオブジェクト形式でない場合でも、同居／別居の項目を表示
              depItems.push({ label: '同居／別居（変更後）', value: '', isEmpty: true });
            }
            
            // 海外特例要件：変更前・変更後
            if (dep.overseasException) {
              const beforeOverseasValue = dep.overseasException === 'applicable' ? '該当' : dep.overseasException === 'not_applicable' ? '非該当' : '';
              depItems.push({ label: '海外特例要件（変更前）', value: beforeOverseasValue, isEmpty: !beforeOverseasValue });
              if (dep.overseasException === 'applicable') {
                depItems.push({ label: '海外特例該当理由（変更前）', value: this.formatOverseasExceptionReason(dep.overseasExceptionStartReason), isEmpty: !dep.overseasExceptionStartReason });
                if (dep.overseasExceptionStartReason === 'other') {
                  depItems.push({ label: '海外特例該当理由（その他）（変更前）', value: dep.overseasExceptionStartReasonOther || '', isEmpty: !dep.overseasExceptionStartReasonOther });
                }
                if (dep.overseasExceptionStartDate) {
                  depItems.push({ label: '海外特例要件に該当した日（変更前）', value: this.formatEraDate(dep.overseasExceptionStartDate), isEmpty: !dep.overseasExceptionStartDate });
                }
              }
              if (dep.overseasException === 'not_applicable') {
                depItems.push({ label: '海外特例該当終了理由（変更前）', value: this.formatOverseasExceptionEndReason(dep.overseasExceptionEndReason), isEmpty: !dep.overseasExceptionEndReason });
                if (dep.overseasExceptionEndReason === 'domestic_transfer') {
                  depItems.push({ label: '国内転出年月日（変更前）', value: this.formatDateValue(dep.domesticTransferDate), isEmpty: !dep.domesticTransferDate });
                }
                if (dep.overseasExceptionEndReason === 'other') {
                  depItems.push({ label: '海外特例該当終了理由（その他）（変更前）', value: dep.overseasExceptionEndReasonOther || '', isEmpty: !dep.overseasExceptionEndReasonOther });
                }
                if (dep.overseasExceptionEndDate) {
                  depItems.push({ label: '海外特例要件に非該当となった日（変更前）', value: this.formatEraDate(dep.overseasExceptionEndDate), isEmpty: !dep.overseasExceptionEndDate });
                }
              }
            }
            
            if (dep.changeAfter?.overseasException) {
              const afterOverseasValue = dep.changeAfter.overseasException === 'applicable' ? '該当' : dep.changeAfter.overseasException === 'not_applicable' ? '非該当' : '';
              depItems.push({ label: '海外特例要件（変更後）', value: afterOverseasValue, isEmpty: !afterOverseasValue });
              if (dep.changeAfter.overseasException === 'applicable') {
                depItems.push({ label: '海外特例該当理由（変更後）', value: this.formatOverseasExceptionReason(dep.changeAfter.overseasExceptionStartReason), isEmpty: !dep.changeAfter.overseasExceptionStartReason });
                if (dep.changeAfter.overseasExceptionStartReason === 'other') {
                  depItems.push({ label: '海外特例該当理由（その他）（変更後）', value: dep.changeAfter.overseasExceptionStartReasonOther || '', isEmpty: !dep.changeAfter.overseasExceptionStartReasonOther });
                }
                if (dep.changeAfter.overseasExceptionStartDate) {
                  depItems.push({ label: '海外特例要件に該当した日（変更後）', value: this.formatEraDate(dep.changeAfter.overseasExceptionStartDate), isEmpty: !dep.changeAfter.overseasExceptionStartDate });
                }
              }
              if (dep.changeAfter.overseasException === 'not_applicable') {
                depItems.push({ label: '海外特例該当終了理由（変更後）', value: this.formatOverseasExceptionEndReason(dep.changeAfter.overseasExceptionEndReason), isEmpty: !dep.changeAfter.overseasExceptionEndReason });
                if (dep.changeAfter.overseasExceptionEndReason === 'domestic_transfer') {
                  depItems.push({ label: '国内転出年月日（変更後）', value: this.formatDateValue(dep.changeAfter.domesticTransferDate), isEmpty: !dep.changeAfter.domesticTransferDate });
                }
                if (dep.changeAfter.overseasExceptionEndReason === 'other') {
                  depItems.push({ label: '海外特例該当終了理由（その他）（変更後）', value: dep.changeAfter.overseasExceptionEndReasonOther || '', isEmpty: !dep.changeAfter.overseasExceptionEndReasonOther });
                }
                if (dep.changeAfter.overseasExceptionEndDate) {
                  depItems.push({ label: '海外特例要件に非該当となった日（変更後）', value: this.formatEraDate(dep.changeAfter.overseasExceptionEndDate), isEmpty: !dep.changeAfter.overseasExceptionEndDate });
                }
              }
            }
            
            // 職業：変更前・変更後
            depItems.push({ label: '職業（変更前）', value: this.formatOtherDependentOccupation(dep.occupation), isEmpty: !dep.occupation });
            if (dep.occupation === 'other') {
              depItems.push({ label: '職業（その他）（変更前）', value: dep.occupationOther || '', isEmpty: !dep.occupationOther });
            }
            if (dep.occupation === 'student_high_school') {
              depItems.push({ label: '学年（変更前）', value: dep.studentYear || '', isEmpty: !dep.studentYear });
            }
            
            depItems.push({ label: '職業（変更後）', value: this.formatOtherDependentOccupation(dep.changeAfter?.occupation), isEmpty: !dep.changeAfter?.occupation });
            if (dep.changeAfter?.occupation === 'other') {
              depItems.push({ label: '職業（その他）（変更後）', value: dep.changeAfter.occupationOther || '', isEmpty: !dep.changeAfter.occupationOther });
            }
            if (dep.changeAfter?.occupation === 'student_high_school') {
              depItems.push({ label: '学年（変更後）', value: dep.changeAfter.studentYear || '', isEmpty: !dep.changeAfter.studentYear });
            }
            
            // 収入（年収）：変更前・変更後
            if (dep.income !== null && dep.income !== undefined) {
              depItems.push({ label: '収入（年収）（変更前）', value: `${dep.income.toLocaleString()}円`, isEmpty: false });
            }
            if (dep.changeAfter?.income !== null && dep.changeAfter?.income !== undefined) {
              depItems.push({ label: '収入（年収）（変更後）', value: `${dep.changeAfter.income.toLocaleString()}円`, isEmpty: false });
            }
            
            // 備考：変更前・変更後
            depItems.push({ label: '備考（変更前）', value: dep.remarks || '', isEmpty: !dep.remarks });
            depItems.push({ label: '備考（変更後）', value: dep.changeAfter?.remarks || '', isEmpty: !dep.changeAfter?.remarks });
          } else {
            depItems.push({ label: '氏名', value: `${dep.lastName || ''} ${dep.firstName || ''}`.trim() || '', isEmpty: !dep.lastName && !dep.firstName });
            depItems.push({ label: '氏名（カナ）', value: `${dep.lastNameKana || ''} ${dep.firstNameKana || ''}`.trim() || '', isEmpty: !dep.lastNameKana && !dep.firstNameKana });
            depItems.push({ label: '生年月日', value: this.formatEraDate(dep.birthDate), isEmpty: !dep.birthDate });
            
            // 性別を追加
            if (dep.gender) {
              const genderMap: Record<string, string> = {
                'male': '男',
                'female': '女'
              };
              depItems.push({ label: '性別', value: genderMap[dep.gender] || dep.gender, isEmpty: !dep.gender });
            }
            
            depItems.push({ label: '続柄', value: this.formatOtherDependentRelationship(dep.relationship), isEmpty: !dep.relationship });
            if (dep.relationship === 'other') {
              depItems.push({ label: '続柄（その他）', value: dep.relationshipOther || '', isEmpty: !dep.relationshipOther });
            }
            
            // 個人番号を追加
            if (dep.personalNumber) {
              depItems.push({ label: '個人番号', value: dep.personalNumber, isEmpty: !dep.personalNumber });
            }
            
            // 住所の[object Object]表示を修正
            if (dep.address && typeof dep.address === 'object') {
              const addressParts = [
                dep.address.postalCode ? `〒${dep.address.postalCode}` : '',
                dep.address.prefecture || '',
                dep.address.city || '',
                dep.address.street || '',
                dep.address.building || ''
              ].filter(part => part);
              const addressValue = addressParts.length > 0 ? addressParts.join(' ') : '';
              depItems.push({ label: '住所', value: addressValue, isEmpty: !addressValue });
              if (dep.address.addressKana) {
                depItems.push({ label: '住所（カナ）', value: dep.address.addressKana, isEmpty: !dep.address.addressKana });
              }
            } else {
              // 旧形式のサポート（後方互換性）
              depItems.push({ label: '住所', value: dep.address || '', isEmpty: !dep.address });
            }
            
            // 異動年月日を削除（入力欄にない項目）
            // depItems.push({ label: '異動年月日', value: this.formatDateValue(dep.changeDate), isEmpty: !dep.changeDate });
            
            // 異動種別が該当の場合のみ、被扶養者となった理由と年月日を表示
            if (dep.changeType === 'applicable') {
              // 被扶養者となった理由の表示を修正（dependentStartReasonを使用、後方互換性のためstartReasonもサポート）
              const startReason = dep.dependentStartReason || dep.startReason;
              depItems.push({ label: '被扶養者となった理由', value: this.formatOtherDependentStartReason(startReason), isEmpty: !startReason });
              if (startReason === 'other') {
                depItems.push({ label: '被扶養者となった理由（その他）', value: dep.dependentStartReasonOther || dep.startReasonOther || '', isEmpty: !dep.dependentStartReasonOther && !dep.startReasonOther });
              }
              
              // 被扶養者になった年月日を追加
              if (dep.dependentStartDate) {
                depItems.push({ label: '被扶養者になった年月日', value: this.formatEraDate(dep.dependentStartDate), isEmpty: !dep.dependentStartDate });
              }
            }
            
            depItems.push({ label: '職業', value: this.formatOtherDependentOccupation(dep.occupation), isEmpty: !dep.occupation });
            if (dep.occupation === 'other') {
              depItems.push({ label: '職業（その他）', value: dep.occupationOther || '', isEmpty: !dep.occupationOther });
            }
            if (dep.occupation === 'student_high_school') {
              depItems.push({ label: '学年', value: dep.studentYear || '', isEmpty: !dep.studentYear });
            }
            
            // 収入を追加
            if (dep.income !== null && dep.income !== undefined) {
              depItems.push({ label: '収入', value: `${dep.income.toLocaleString()}円`, isEmpty: false });
            }
            
            // 異動種別が非該当の場合、被扶養者でなくなった理由と年月日を表示
            if (dep.changeType === 'not_applicable') {
              // 後方互換性のためendReasonもサポート
              const endReason = dep.dependentEndReason || dep.endReason;
              depItems.push({ label: '被扶養者でなくなった理由', value: this.formatOtherDependentEndReason(endReason), isEmpty: !endReason });
              if (endReason === 'death') {
                depItems.push({ label: '死亡年月日', value: this.formatDateValue(dep.deathDate), isEmpty: !dep.deathDate });
              }
              if (endReason === 'other') {
                depItems.push({ label: '被扶養者でなくなった理由（その他）', value: dep.dependentEndReasonOther || dep.endReasonOther || '', isEmpty: !dep.dependentEndReasonOther && !dep.endReasonOther });
              }
              // 被扶養者でなくなった年月日を追加
              if (dep.dependentEndDate) {
                depItems.push({ label: '被扶養者でなくなった年月日', value: this.formatEraDate(dep.dependentEndDate), isEmpty: !dep.dependentEndDate });
              }
            }
            if (dep.overseasException) {
              depItems.push({ label: '海外特例該当', value: '該当する' });
              depItems.push({ label: '海外特例該当理由', value: this.formatOverseasExceptionReason(dep.overseasExceptionReason), isEmpty: !dep.overseasExceptionReason });
              if (dep.overseasExceptionReason === 'other') {
                depItems.push({ label: '海外特例該当理由（その他）', value: dep.overseasExceptionReasonOther || '', isEmpty: !dep.overseasExceptionReasonOther });
              }
              depItems.push({ label: '海外特例該当終了理由', value: this.formatOverseasExceptionEndReason(dep.overseasExceptionEndReason), isEmpty: !dep.overseasExceptionEndReason });
              if (dep.overseasExceptionEndReason === 'domestic_transfer') {
                depItems.push({ label: '国内転出年月日', value: this.formatDateValue(dep.domesticTransferDate), isEmpty: !dep.domesticTransferDate });
              }
              if (dep.overseasExceptionEndReason === 'other') {
                depItems.push({ label: '海外特例該当終了理由（その他）', value: dep.overseasExceptionEndReasonOther || '', isEmpty: !dep.overseasExceptionEndReasonOther });
              }
            }
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
        title: '申立書',
        items: [{ label: '申立書内容', value: data['declaration'].content || data['declaration'].declarationText || '', isEmpty: !data['declaration'].content && !data['declaration'].declarationText }]
      });
    }

    // 期限を追加（申請全体の期限がある場合）
    if (this.application?.deadline) {
      const deadline = this.application.deadline instanceof Date 
        ? this.application.deadline 
        : (this.application.deadline instanceof Timestamp 
          ? this.application.deadline.toDate() 
          : new Date(this.application.deadline));
      sections.push({
        title: '期限情報',
        items: [{ label: '申請期限', value: this.formatDateValue(deadline), isEmpty: false }]
      });
    }

    return sections;
  }

  /**
   * 住所変更届のデータをフォーマット
   */
  private formatAddressChangeData(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    if (data['businessInfo']) {
      const biItems: FormattedItem[] = [];
      const bi = data['businessInfo'];
      biItems.push({ label: '事業所記号', value: bi.officeSymbol || '', isEmpty: !bi.officeSymbol });
      biItems.push({ label: '事業所番号', value: bi.officeNumber || '', isEmpty: !bi.officeNumber });
      
      // 住所に郵便番号を追加（重複を避ける）
      const postalCode = bi.postalCode || '';
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

    if (data['insuredPerson']) {
      const ipItems: FormattedItem[] = [];
      const ip = data['insuredPerson'];
      ipItems.push({ label: '被保険者整理番号', value: ip.insuranceNumber || '', isEmpty: !ip.insuranceNumber });
      ipItems.push({ label: '氏名', value: `${ip.lastName || ''} ${ip.firstName || ''}`.trim() || '', isEmpty: !ip.lastName && !ip.firstName });
      ipItems.push({ label: '氏名（カナ）', value: `${ip.lastNameKana || ''} ${ip.firstNameKana || ''}`.trim() || '', isEmpty: !ip.lastNameKana && !ip.firstNameKana });
      ipItems.push({ label: '生年月日', value: this.formatEraDate(ip.birthDate), isEmpty: !ip.birthDate });
      
      // 個人番号または基礎年金番号
      if (ip.identificationType === 'personal_number') {
        ipItems.push({ label: '個人番号', value: ip.personalNumber || '', isEmpty: !ip.personalNumber });
      } else if (ip.identificationType === 'basic_pension_number') {
        ipItems.push({ label: '基礎年金番号', value: ip.basicPensionNumber || '', isEmpty: !ip.basicPensionNumber });
      }
      
      ipItems.push({ label: '変更前住所', value: ip.oldAddress || '', isEmpty: !ip.oldAddress });
      
      // 変更後住所を個別フィールドから組み立て
      const newAddressParts = [
        ip.newPostalCode ? `〒${ip.newPostalCode}` : '',
        ip.newPrefecture || '',
        ip.newCity || '',
        ip.newStreet || '',
        ip.newBuilding || ''
      ].filter(part => part);
      const newAddress = newAddressParts.length > 0 ? newAddressParts.join(' ') : (ip.newAddress || '');
      ipItems.push({ label: '変更後住所', value: newAddress, isEmpty: !newAddress });

      // 配偶者との同居/別居
      if (ip.livingWithSpouse !== undefined && ip.livingWithSpouse !== null) {
        ipItems.push({ label: '配偶者との同居/別居', value: ip.livingWithSpouse ? '同居' : '別居', isEmpty: false });
      }

      sections.push({
        title: '被保険者情報',
        items: ipItems
      });
    }

    // 配偶者情報をinsuredPersonから取得
    if (data['insuredPerson']) {
      const ip = data['insuredPerson'];
      const hasSpouseInfo = ip.spouseLastName || ip.spouseFirstName || ip.spouseLastNameKana || ip.spouseFirstNameKana || ip.spouseBirthDate;
      
      if (hasSpouseInfo) {
        const siItems: FormattedItem[] = [];
        siItems.push({ label: '配偶者氏名', value: `${ip.spouseLastName || ''} ${ip.spouseFirstName || ''}`.trim() || '', isEmpty: !ip.spouseLastName && !ip.spouseFirstName });
        siItems.push({ label: '配偶者氏名（カナ）', value: `${ip.spouseLastNameKana || ''} ${ip.spouseFirstNameKana || ''}`.trim() || '', isEmpty: !ip.spouseLastNameKana && !ip.spouseFirstNameKana });
        siItems.push({ label: '配偶者生年月日', value: this.formatEraDate(ip.spouseBirthDate), isEmpty: !ip.spouseBirthDate });
        
        // 配偶者の個人番号または基礎年金番号
        if (ip.spouseIdentificationType === 'personal_number') {
          siItems.push({ label: '配偶者個人番号', value: ip.spousePersonalNumber || '', isEmpty: !ip.spousePersonalNumber });
        } else if (ip.spouseIdentificationType === 'basic_pension_number') {
          siItems.push({ label: '配偶者基礎年金番号', value: ip.spouseBasicPensionNumber || '', isEmpty: !ip.spouseBasicPensionNumber });
        }

        // 配偶者の変更前住所
        if (ip.spouseOldAddress) {
          siItems.push({ label: '配偶者の変更前住所', value: ip.spouseOldAddress, isEmpty: !ip.spouseOldAddress });
        }

        // 配偶者の変更後住所を個別フィールドから組み立て
        const spouseNewAddressParts = [
          ip.spouseNewPostalCode ? `〒${ip.spouseNewPostalCode}` : '',
          ip.spouseNewPrefecture || '',
          ip.spouseNewCity || '',
          ip.spouseNewStreet || '',
          ip.spouseNewBuilding || ''
        ].filter(part => part);
        const spouseNewAddress = spouseNewAddressParts.length > 0 ? spouseNewAddressParts.join(' ') : '';
        if (spouseNewAddress) {
          siItems.push({ label: '配偶者の変更後住所', value: spouseNewAddress, isEmpty: !spouseNewAddress });
        }

        // 配偶者の住所変更年月日（別居時のみ表示）
        if (ip.livingWithSpouse === false && ip.spouseChangeDate) {
          siItems.push({ label: '配偶者の住所変更年月日', value: this.formatEraDate(ip.spouseChangeDate), isEmpty: !ip.spouseChangeDate });
        }

        // 配偶者の備考
        if (ip.spouseRemarks) {
          siItems.push({ label: '配偶者の備考', value: this.formatRemarks(ip.spouseRemarks), isEmpty: !ip.spouseRemarks });
        }

        sections.push({
          title: '配偶者情報',
          items: siItems
        });
      }
    }

    // 旧形式のspouseInfoもサポート（後方互換性のため）
    if (data['spouseInfo']) {
      const siItems: FormattedItem[] = [];
      const si = data['spouseInfo'];
      siItems.push({ label: '配偶者氏名', value: `${si.lastName || ''} ${si.firstName || ''}`.trim() || '', isEmpty: !si.lastName && !si.firstName });
      siItems.push({ label: '配偶者氏名（カナ）', value: `${si.lastNameKana || ''} ${si.firstNameKana || ''}`.trim() || '', isEmpty: !si.lastNameKana && !si.firstNameKana });
      siItems.push({ label: '配偶者生年月日', value: this.formatEraDate(si.birthDate), isEmpty: !si.birthDate });
      
      // 配偶者の個人番号または基礎年金番号
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

  /**
   * 氏名変更届のデータをフォーマット
   */
  private formatNameChangeData(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    if (data['businessInfo']) {
      const biItems: FormattedItem[] = [];
      const bi = data['businessInfo'];
      biItems.push({ label: '事業所記号', value: bi.officeSymbol || '', isEmpty: !bi.officeSymbol });
      biItems.push({ label: '事業所番号', value: bi.officeNumber || '', isEmpty: !bi.officeNumber });
      
      // 住所に郵便番号を追加（重複を避ける）
      const postalCode = bi.postalCode || '';
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

    if (data['insuredPerson']) {
      const ipItems: FormattedItem[] = [];
      const ip = data['insuredPerson'];
      ipItems.push({ label: '被保険者整理番号', value: ip.insuranceNumber || '', isEmpty: !ip.insuranceNumber });
      ipItems.push({ label: '変更前氏名', value: `${ip.oldLastName || ''} ${ip.oldFirstName || ''}`.trim() || '', isEmpty: !ip.oldLastName && !ip.oldFirstName });
      ipItems.push({ label: '変更後氏名', value: `${ip.newLastName || ''} ${ip.newFirstName || ''}`.trim() || '', isEmpty: !ip.newLastName && !ip.newFirstName });
      ipItems.push({ label: '変更後氏名（カナ）', value: `${ip.newLastNameKana || ''} ${ip.newFirstNameKana || ''}`.trim() || '', isEmpty: !ip.newLastNameKana && !ip.newFirstNameKana });
      ipItems.push({ label: '生年月日', value: this.formatEraDate(ip.birthDate), isEmpty: !ip.birthDate });
      
      // 個人番号または基礎年金番号
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

  /**
   * 報酬月額算定基礎届のデータをフォーマット
   */
  private formatRewardBaseData(data: Record<string, any>): FormattedSection[] {
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
          person.retroactivePayment.forEach((rp: any, rpIndex: number) => {
            const monthNum = this.convertEnglishMonthToNumber(rp.month);
            personItems.push({ 
              label: `遡及支払額（${monthNum}月）`, 
              value: rp.amount ? `${rp.amount.toLocaleString()}円` : '', 
              isEmpty: !rp.amount 
            });
          });
        }
        
        if (person.salaryMonths && Array.isArray(person.salaryMonths)) {
          person.salaryMonths.forEach((sm: any, smIndex: number) => {
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

  /**
   * 報酬月額変更届のデータをフォーマット
   */
  private formatRewardChangeData(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    if (data['businessInfo']) {
      const biItems: FormattedItem[] = [];
      const bi = data['businessInfo'];
      biItems.push({ label: '事業所記号', value: bi.officeSymbol || '', isEmpty: !bi.officeSymbol });
      
      // 住所に郵便番号を追加（フォームデータにpostalCodeがある場合）
      const postalCode = bi.postalCode || '';
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
        personItems.push({ label: '氏名', value: person.name || '', isEmpty: !person.name });
        personItems.push({ label: '生年月日', value: this.formatEraDateForReward(person.birthDate), isEmpty: !person.birthDate });
        
        // 改定年月（年月のみ表示）
        let changeDateValue = '';
        if (person.changeDate && typeof person.changeDate === 'object' && !(person.changeDate instanceof Date) && !(person.changeDate instanceof Timestamp)) {
          changeDateValue = this.formatEraDateYearMonth(person.changeDate);
        } else if (person.changeDate) {
          changeDateValue = this.formatDateValue(person.changeDate);
        }
        personItems.push({ label: '改定年月', value: changeDateValue, isEmpty: !changeDateValue });
        
        // 従前の標準報酬（健康保険と厚生年金を別々に表示）
        if (person.previousStandardReward && typeof person.previousStandardReward === 'object') {
          const healthInsurance = person.previousStandardReward.healthInsurance;
          const pensionInsurance = person.previousStandardReward.pensionInsurance;
          const healthInsuranceValue = healthInsurance ? `健康保険：${healthInsurance.toLocaleString()}円` : '';
          const pensionInsuranceValue = pensionInsurance ? `厚生年金：${pensionInsurance.toLocaleString()}円` : '';
          const rewardValue = [healthInsuranceValue, pensionInsuranceValue].filter(Boolean).join('、') || '';
          personItems.push({ label: '従前の標準報酬月額', value: rewardValue, isEmpty: !rewardValue });
        } else {
          personItems.push({ label: '従前の標準報酬月額', value: '', isEmpty: true });
        }
        
        // 従前の改定年月
        let previousChangeDateValue = '';
        if (person.previousChangeDate && typeof person.previousChangeDate === 'object' && !(person.previousChangeDate instanceof Date) && !(person.previousChangeDate instanceof Timestamp)) {
          previousChangeDateValue = this.formatEraDateYearMonth(person.previousChangeDate);
        }
        personItems.push({ label: '従前改定月', value: previousChangeDateValue, isEmpty: !previousChangeDateValue });
        
        // 昇給/降給（月も表示）
        let salaryChangeValue = '';
        if (person.salaryChange && person.salaryChange.type) {
          const changeType = person.salaryChange.type === 'raise' ? '昇給' : person.salaryChange.type === 'reduction' ? '降給' : '';
          let changeMonth = '';
          if (person.salaryChange.month) {
            if (person.salaryChange.month === 'month1') {
              changeMonth = '1か月目';
            } else if (person.salaryChange.month === 'month2') {
              changeMonth = '2か月目';
            } else if (person.salaryChange.month === 'month3') {
              changeMonth = '3か月目';
            }
          }
          if (changeType && changeMonth) {
            salaryChangeValue = `${changeType}（${changeMonth}）`;
          } else if (changeType) {
            salaryChangeValue = changeType;
          }
        }
        personItems.push({ label: '昇(降)給', value: salaryChangeValue, isEmpty: !salaryChangeValue });
        
        personItems.push({ label: '初月', value: person.firstMonth ? `${person.firstMonth}月` : '', isEmpty: !person.firstMonth });
        
        if (person.retroactivePayment && Array.isArray(person.retroactivePayment)) {
          person.retroactivePayment.forEach((rp: any) => {
            const monthLabel = typeof rp.month === 'number' ? `${rp.month}月` : (rp.month || '');
            personItems.push({ 
              label: `遡及支払額（${monthLabel}）`, 
              value: rp.amount ? `${rp.amount.toLocaleString()}円` : '', 
              isEmpty: !rp.amount 
            });
          });
        }
        
        if (person.salaryMonths && Array.isArray(person.salaryMonths)) {
          person.salaryMonths.forEach((sm: any) => {
            const monthLabel = typeof sm.month === 'number' ? `${sm.month}月` : (sm.month || '');
            // 給与支給月の詳細情報を表示
            if (sm.baseDays || sm.currency || sm.inKind || sm.total) {
              const details: string[] = [];
              if (sm.baseDays) details.push(`基礎日数：${sm.baseDays}日`);
              if (sm.currency) details.push(`通貨：${sm.currency.toLocaleString()}円`);
              if (sm.inKind) details.push(`現物：${sm.inKind.toLocaleString()}円`);
              if (sm.total) details.push(`合計：${sm.total.toLocaleString()}円`);
              personItems.push({ 
                label: `給与支給月（${monthLabel}）`, 
                value: details.join('、') || '', 
                isEmpty: !sm.total 
              });
            } else {
              personItems.push({ 
                label: `報酬月額（${monthLabel}）`, 
                value: sm.total ? `${sm.total.toLocaleString()}円` : '', 
                isEmpty: !sm.total 
              });
            }
          });
        }
        
        // 計算結果
        personItems.push({ label: '総計', value: person.total ? `${person.total.toLocaleString()}円` : '', isEmpty: !person.total });
        personItems.push({ label: '平均額', value: person.average ? `${person.average.toLocaleString()}円` : '', isEmpty: !person.average });
        personItems.push({ label: '修正平均額', value: person.adjustedAverage ? `${person.adjustedAverage.toLocaleString()}円` : '', isEmpty: !person.adjustedAverage });
        
        // 備考（その他の場合は備考内容も表示）
        let remarksValue = this.formatRemarks(person.remarks);
        if ((person.remarks === 'other' || person.remarks === 'salary_reason') && person.remarksOther) {
          remarksValue = `${remarksValue}: ${person.remarksOther}`;
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

  /**
   * 賞与支払届のデータをフォーマット
   */
  private formatBonusPaymentData(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    if (data['businessInfo']) {
      const biItems: FormattedItem[] = [];
      const bi = data['businessInfo'];
      biItems.push({ label: '事業所記号', value: bi.officeSymbol || '', isEmpty: !bi.officeSymbol });
      
      // 住所に郵便番号を追加（フォームデータにpostalCodeがある場合）
      const postalCode = bi.postalCode || '';
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

  /**
   * 汎用データフォーマット（申請種別が不明な場合）
   */
  private formatGenericData(data: Record<string, any>): FormattedSection[] {
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

  /**
   * 日付値をフォーマット
   */
  private formatDateValue(date: any): string {
    if (!date) return '';
    if (date instanceof Date) {
      return date.toLocaleDateString('ja-JP');
    }
    if (date instanceof Timestamp) {
      return date.toDate().toLocaleDateString('ja-JP');
    }
    // FirestoreのTimestamp形式（{seconds: number, nanoseconds: number}）を検出
    if (typeof date === 'object' && date.seconds !== undefined && date.nanoseconds !== undefined) {
      try {
        const timestamp = new Timestamp(date.seconds, date.nanoseconds);
        return timestamp.toDate().toLocaleDateString('ja-JP');
      } catch (e) {
        // Timestamp変換に失敗した場合は次の処理へ
      }
    }
    if (typeof date === 'string') {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('ja-JP');
      }
    }
    // 年号付き日付オブジェクトの場合はformatEraDateを使用
    if (typeof date === 'object' && date.era && date.year && date.month && date.day) {
      return this.formatEraDate(date);
    }
    return String(date);
  }

  /**
   * 年号付き日付をフォーマット
   */
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

  /**
   * 報酬月額用の年号付き日付フォーマット（元号-YYMMDD形式）
   */
  private formatEraDateForReward(birthDate: any): string {
    if (!birthDate || typeof birthDate !== 'object') return '';
    
    const eraNumbers: Record<string, string> = {
      'meiji': '1',
      'taisho': '3',
      'showa': '5',
      'heisei': '7',
      'reiwa': '9'
    };
    
    const era = eraNumbers[birthDate.era] || '';
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

  /**
   * 種別をフォーマット
   */
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

  /**
   * 取得種別をフォーマット
   */
  private formatAcquisitionType(type: string): string {
    const types: Record<string, string> = {
      'health_pension': '健保・厚年',
      'transfer': '共済出向',
      'ship': '船保任継'
    };
    return types[type] || type || '';
  }

  /**
   * 喪失理由をフォーマット
   */
  private formatLossReason(reason: string): string {
    const reasons: Record<string, string> = {
      'retirement': '退職',
      'death': '死亡',
      'disqualification': '資格喪失',
      'other': 'その他'
    };
    return reasons[reason] || reason || '';
  }

  /**
   * 備考をフォーマット
   */
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

  /**
   * 異動種別をフォーマット
   */
  private formatChangeType(type: string): string {
    const types: Record<string, string> = {
      'add': '新規',
      'remove': '削除',
      'change': '変更',
      'applicable': '該当',
      'not_applicable': '非該当',
      'no_change': '異動無し'
    };
    return types[type] || type || '';
  }

  /**
   * 電話番号種別をフォーマット
   */
  private formatPhoneType(type: string): string {
    const types: Record<string, string> = {
      'home': '自宅',
      'mobile': '携帯',
      'work': '勤務先',
      'other': 'その他'
    };
    return types[type] || type || '';
  }

  /**
   * 被扶養者となった理由をフォーマット
   */
  private formatDependentStartReason(reason: string): string {
    const reasons: Record<string, string> = {
      'spouse_employment': '配偶者の就職',
      'marriage': '婚姻',
      'retirement': '離職',
      'income_decrease': '収入減少',
      'birth': '出生',
      'adoption': '養子縁組',
      'living_together': '同居',
      'other': 'その他'
    };
    return reasons[reason] || reason || '';
  }

  /**
   * 職業をフォーマット
   */
  private formatOccupation(occupation: string): string {
    const occupations: Record<string, string> = {
      'student_high_school': '高・大学生',
      'student_university': '高・大学生',
      'unemployed': '無職',
      'part_time': 'パート', // 入力フォームと一致させる
      'pension': '年金受給者',
      'student_elementary': '小・中学生以下',
      'other': 'その他'
    };
    return occupations[occupation] || occupation || '';
  }

  /**
   * 被扶養者でなくなった理由をフォーマット
   */
  private formatDependentEndReason(reason: string): string {
    const reasons: Record<string, string> = {
      'divorce': '離婚',
      'death': '死亡',
      'employment': '就職',
      'other': 'その他'
    };
    return reasons[reason] || reason || '';
  }

  /**
   * 海外特例該当理由をフォーマット
   */
  private formatOverseasExceptionReason(reason: string): string {
    const reasons: Record<string, string> = {
      'overseas_transfer': '海外転出',
      'other': 'その他'
    };
    return reasons[reason] || reason || '';
  }

  /**
   * 海外特例該当終了理由をフォーマット
   */
  private formatOverseasExceptionEndReason(reason: string): string {
    const reasons: Record<string, string> = {
      'domestic_transfer': '国内転入',
      'other': 'その他'
    };
    return reasons[reason] || reason || '';
  }

  /**
   * 配偶者の続柄をフォーマット
   */
  private formatSpouseRelationship(relationship: string): string {
    const relationships: Record<string, string> = {
      'husband': '夫',
      'wife': '妻',
      'husband_unregistered': '夫（未届）',
      'wife_unregistered': '妻（未届）'
    };
    return relationships[relationship] || relationship || '';
  }

  /**
   * その他被扶養者の続柄をフォーマット
   */
  private formatOtherDependentRelationship(relationship: string): string {
    const relationships: Record<string, string> = {
      'child': '実子・養子',
      'other_child': '実子・養子以外の子',
      'parent': '父母・養父母',
      'parent_in_law': '義父母',
      'sibling': '弟妹',
      'elder_sibling': '兄姉',
      'grandparent': '祖父母',
      'great_grandparent': '曽祖父母',
      'grandchild': '孫',
      'other': 'その他'
    };
    return relationships[relationship] || relationship || '';
  }

  /**
   * その他被扶養者の職業をフォーマット
   */
  private formatOtherDependentOccupation(occupation: string): string {
    return this.formatOccupation(occupation);
  }

  /**
   * その他被扶養者となった理由をフォーマット
   */
  private formatOtherDependentStartReason(reason: string): string {
    return this.formatDependentStartReason(reason);
  }

  /**
   * その他被扶養者でなくなった理由をフォーマット
   */
  private formatOtherDependentEndReason(reason: string): string {
    return this.formatDependentEndReason(reason);
  }

  /**
   * Object.keysをテンプレートで使用するためのヘルパー
   */
  objectKeys(obj: any): string[] {
    return Object.keys(obj || {});
  }

  /**
   * 申請を削除
   */
  async deleteApplication(): Promise<void> {
    if (!this.application?.id) {
      return;
    }

    if (!confirm('この申請を削除しますか？')) {
      return;
    }

    try {
      await this.applicationService.deleteApplication(this.application.id);
      this.snackBar.open('申請を削除しました', '閉じる', { duration: 3000 });
      this.router.navigate(['/applications']);
    } catch (error) {
      console.error('申請の削除に失敗しました:', error);
      this.snackBar.open('申請の削除に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 申請を取り下げ
   */
  async withdrawApplication(): Promise<void> {
    if (!this.application?.id || !this.currentUserId) {
      return;
    }

    if (!confirm('この申請を取り下げますか？')) {
      return;
    }

    try {
      await this.applicationService.updateStatus(
        this.application.id,
        'withdrawn',
        this.currentUserId,
        '申請者により取り下げられました'
      );
      this.snackBar.open('申請を取り下げました', '閉じる', { duration: 3000 });
      await this.loadApplication(this.application.id);
    } catch (error) {
      console.error('申請の取り下げに失敗しました:', error);
      this.snackBar.open('申請の取り下げに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 削除可能かどうか
   */
  canDelete(): boolean {
    return this.application?.status === 'draft' && 
           (this.isAdmin || this.application.employeeId === this.currentUserId);
  }

  /**
   * 編集可能かどうか
   */
  canEdit(): boolean {
    const currentUser = this.authService.getCurrentUser();
    const isApplicant = this.application?.employeeId === currentUser?.employeeId;
    
    // draft状態、created状態、またはreturned状態で、申請者本人または管理者が編集可能
    // 外部申請のreturned状態も編集可能（内部申請と同様）
    return (this.application?.status === 'draft' || 
            this.application?.status === 'created' || 
            this.application?.status === 'returned') && 
           (this.isAdmin || isApplicant);
  }

  /**
   * 編集画面に遷移
   */
  editApplication(): void {
    if (!this.application?.id) {
      return;
    }
    this.router.navigate(['/applications', this.application.id, 'edit']);
  }

  /**
   * 申請を送信（内部申請のみ、draft状態の時のみ）
   */
  async submitApplication(): Promise<void> {
    if (!this.application?.id || !this.currentUserId) {
      return;
    }

    // draft状態、created状態、またはreturned状態（変更あり）の申請を送信可能
    if (this.application.status === 'draft' || this.application.status === 'created') {
      // draft状態またはcreated状態の場合
      if (this.application.category === 'internal') {
        // 内部申請の場合
        const confirmed = confirm('この申請を送信しますか？送信後は編集できなくなります。');
        if (!confirmed) {
          return;
        }

        try {
          // 送信時に届書提出日を設定
          await this.applicationService.updateApplication(this.application.id, {
            status: 'pending',
            submissionDate: new Date()
          });
          
          // 履歴を記録
          await this.applicationService.addHistory(this.application.id, {
            userId: this.currentUserId,
            action: 'submit',
            createdAt: new Date()
          });
          
          // 通知を作成
          await this.createNotificationForStatusChange('pending');
          
          this.snackBar.open('申請を送信しました', '閉じる', { duration: 3000 });
          await this.loadApplication(this.application.id);
        } catch (error) {
          console.error('申請の送信に失敗しました:', error);
          this.snackBar.open('申請の送信に失敗しました', '閉じる', { duration: 5000 });
        }
      } else {
        this.snackBar.open('内部申請のみ送信できます', '閉じる', { duration: 3000 });
        return;
      }
    } else if (this.application.status === 'returned') {
      // returned状態の場合、変更がある場合のみ再送信可能
      // 内部申請と外部申請の両方に対応
      if (this.application.category === 'internal') {
        // 内部申請の場合
        if (!this.isAdmin && this.application.employeeId !== this.currentUserId) {
          this.snackBar.open('送信権限がありません', '閉じる', { duration: 3000 });
          return;
        }

        if (!this.hasChanges()) {
          this.snackBar.open('変更がないため、再送信できません', '閉じる', { duration: 3000 });
          return;
        }

        const confirmed = confirm('変更を反映して再送信しますか？送信後は編集できなくなります。');
        if (!confirmed) {
          return;
        }

        try {
          // 再送信時に届書提出日を更新
          await this.applicationService.updateApplication(this.application.id, {
            status: 'pending',
            submissionDate: new Date()
          });
          
          // 履歴を記録
          await this.applicationService.addHistory(this.application.id, {
            userId: this.currentUserId,
            action: 'submit',
            createdAt: new Date()
          });
          
          // 通知を作成（再申請）
          await this.createNotificationForStatusChange('pending', undefined, true);
          
          this.snackBar.open('申請を再送信しました', '閉じる', { duration: 3000 });
          await this.loadApplication(this.application.id);
        } catch (error) {
          console.error('申請の再送信に失敗しました:', error);
          this.snackBar.open('申請の再送信に失敗しました', '閉じる', { duration: 5000 });
        }
      } else {
        this.snackBar.open('内部申請のみ送信できます', '閉じる', { duration: 3000 });
        return;
      }
    } else {
      this.snackBar.open('下書き状態、作成済み状態、または差戻し状態の申請のみ送信できます', '閉じる', { duration: 3000 });
      return;
    }
  }

  /**
   * 取り下げ可能かどうか
   */
  canWithdraw(): boolean {
    return this.application?.status === 'pending' && 
           this.application.employeeId === this.currentUserId;
  }

  /**
   * 外部申請かどうか
   */
  isExternalApplication(): boolean {
    return this.application?.category === 'external';
  }

  /**
   * 外部申請ステータス変更可能かどうか
   */
  canChangeExternalStatus(): boolean {
    return this.isAdmin && 
           this.application?.category === 'external';
  }

  /**
   * 外部申請の申請ステータス変更可能かどうか（受理済み時のみ）
   */
  canChangeApplicationStatus(): boolean {
    return this.isAdmin && 
           this.application?.category === 'external' &&
           this.application?.externalApplicationStatus === 'received';
  }

  /**
   * 外部申請ステータス変更処理
   */
  async changeExternalApplicationStatus(): Promise<void> {
    if (!this.application?.id || !this.currentUserId) {
      return;
    }

    // ステータス選択ダイアログ
    const statusOptions: Array<{ value: ExternalApplicationStatus; label: string }> = [
      // { value: null, label: '未設定' }, // コメントアウト
      { value: 'sent', label: '送信済み（未受理）' },
      { value: 'received', label: '受理済み' },
      { value: 'error', label: 'エラー' }
    ];

    const currentStatus = this.application.externalApplicationStatus || null;
    const currentStatusLabel = statusOptions.find(opt => opt.value === currentStatus)?.label || '未設定';

    const statusText = statusOptions.map((opt, index) => `${index}: ${opt.label}`).join('\n');
    const selectedIndex = prompt(
      `送信ステータスを変更します。\n\n現在のステータス: ${currentStatusLabel}\n\n変更先を選択してください:\n${statusText}\n\n番号を入力してください:`
    );

    if (selectedIndex === null) {
      return;
    }

    const index = parseInt(selectedIndex, 10);
    if (isNaN(index) || index < 0 || index >= statusOptions.length) {
      this.snackBar.open('無効な選択です', '閉じる', { duration: 3000 });
      return;
    }

    const selectedStatus = statusOptions[index].value;
    
    // 現在のステータスと同じ場合は何もしない
    if (selectedStatus === currentStatus) {
      this.snackBar.open('ステータスが変更されていません', '閉じる', { duration: 3000 });
      return;
    }

    // 送信ステータスに応じて申請ステータスも連動
    let appStatus: ApplicationStatus | undefined;
    if (selectedStatus === 'sent') {
      appStatus = 'pending_not_received'; // 送信済み（未受理）→ 処理待ち（未受理）
    } else if (selectedStatus === 'received') {
      appStatus = 'pending_received'; // 受理済み → 処理待ち（受理済み）
    }
    // errorの場合は申請ステータスは変更しない

    const confirmed = confirm(`送信ステータスを「${statusOptions[index].label}」に変更しますか？${appStatus ? `\n申請ステータスも「${this.getStatusLabel(appStatus)}」に変更されます。` : ''}`);
    if (!confirmed) {
      return;
    }

    try {
      // 送信ステータスと申請ステータスを同時に更新
      const updates: Partial<Application> = {
        externalApplicationStatus: selectedStatus
      };
      if (appStatus) {
        updates.status = appStatus;
      }
      
      // 送信ステータスが「送信済み（未受理）」または「受理済み」に変更された場合、届書提出日を設定
      if (selectedStatus === 'sent' || selectedStatus === 'received') {
        updates.submissionDate = new Date();
      }

      await this.applicationService.updateApplication(this.application.id, updates);
      
      // 履歴を記録
      await this.applicationService.addHistory(this.application.id, {
        userId: this.currentUserId,
        action: 'status_change',
        comment: `送信ステータスを${statusOptions[index].label}に変更${appStatus ? `、申請ステータスを${this.getStatusLabel(appStatus)}に変更` : ''}`,
        createdAt: new Date()
      });
      
      // 外部申請ステータス変更時に通知を作成（受理確認・エラー時のみ）
      if ((selectedStatus === 'received' || selectedStatus === 'error') && this.employee && this.organization) {
        const applicationTypeName = this.applicationType?.name || this.application.type;
        const employeeName = `${this.employee.lastName} ${this.employee.firstName}`;
        
        // 【修正20】通知機能を削除するためコメントアウト
        /*
        await this.notificationService.createExternalApplicationStatusNotification({
          applicationId: this.application.id,
          employeeId: this.application.employeeId,
          organizationId: this.application.organizationId,
          externalStatus: selectedStatus,
          applicationTypeName: applicationTypeName,
          employeeName: employeeName,
          notificationSettings: this.organization.applicationFlowSettings?.notificationSettings
        });
        */
      }
      
      this.snackBar.open('送信ステータスを変更しました', '閉じる', { duration: 3000 });
      
      // エラーが選択された場合、アラートを表示
      if (selectedStatus === 'error') {
        alert('エラー状態に設定しました。\nこの申請は送信に問題があったことを示します。\n必要に応じて対応を行ってください。');
      }
      
      await this.loadApplication(this.application.id);
    } catch (error) {
      console.error('送信ステータスの変更に失敗しました:', error);
      this.snackBar.open('送信ステータスの変更に失敗しました', '閉じる', { duration: 5000 });
    }
  }

  /**
   * 外部申請の申請ステータス変更処理（受理済み時のみ）
   */
  async changeApplicationStatus(): Promise<void> {
    if (!this.application?.id || !this.currentUserId) {
      return;
    }

    // ステータス選択ダイアログ
    const statusOptions: Array<{ value: ApplicationStatus; label: string }> = [
      { value: 'pending_received', label: '処理待ち（受理済み）' },
      { value: 'approved', label: '承認' },
      { value: 'returned', label: '差戻し' },
      { value: 'rejected', label: '却下' }
    ];

    const currentStatus = this.application.status;
    const currentStatusLabel = this.getStatusLabel(currentStatus);

    const statusText = statusOptions.map((opt, index) => `${index}: ${opt.label}`).join('\n');
    const selectedIndex = prompt(
      `申請ステータスを変更します。\n\n現在のステータス: ${currentStatusLabel}\n\n変更先を選択してください:\n${statusText}\n\n番号を入力してください:`
    );

    if (selectedIndex === null) {
      return;
    }

    const index = parseInt(selectedIndex, 10);
    if (isNaN(index) || index < 0 || index >= statusOptions.length) {
      this.snackBar.open('無効な選択です', '閉じる', { duration: 3000 });
      return;
    }

    const selectedStatus = statusOptions[index].value;
    
    // 現在のステータスと同じ場合は何もしない
    if (selectedStatus === currentStatus) {
      this.snackBar.open('ステータスが変更されていません', '閉じる', { duration: 3000 });
      return;
    }

    // 差戻しまたは却下の場合は理由を入力
    let reason: string | undefined;
    if (selectedStatus === 'returned' || selectedStatus === 'rejected') {
      const reasonInput = prompt(`${selectedStatus === 'returned' ? '差戻し' : '却下'}理由を入力してください:`);
      if (!reasonInput) {
        return;
      }
      reason = reasonInput;
    }

    const confirmed = confirm(`申請ステータスを「${statusOptions[index].label}」に変更しますか？`);
    if (!confirmed) {
      return;
    }

    try {
      if (selectedStatus === 'returned') {
        // 差戻しの場合、スナップショットを保存
        const returnHistory: ApplicationReturnHistory = {
          returnedAt: new Date(),
          returnedBy: this.currentUserId,
          reason: reason,
          dataSnapshot: JSON.parse(JSON.stringify(this.application.data)), // ディープコピー
          attachmentsSnapshot: this.application.attachments ? JSON.parse(JSON.stringify(this.application.attachments)) : undefined,
          submissionDate: this.application.submissionDate // 差戻し前の届書提出日を保存
        };

        // 既存のreturnHistoryに追加
        const existingReturnHistory = this.application.returnHistory || [];
        const updatedReturnHistory = [...existingReturnHistory, returnHistory];

        await this.applicationService.updateApplication(this.application.id, {
          status: selectedStatus,
          returnHistory: updatedReturnHistory
        });

        // 差戻し理由をコメントとしても追加
        await this.applicationService.addComment(this.application.id, {
          userId: this.currentUserId,
          comment: reason!,
          type: 'rejection_reason',
          createdAt: new Date()
        });
        
        // 通知を作成
        await this.createNotificationForStatusChange('returned', reason);
      } else if (selectedStatus === 'rejected') {
        // 却下の場合、スナップショットは保存しない（内部申請と同様）
        await this.applicationService.updateStatus(
          this.application.id,
          selectedStatus,
          this.currentUserId,
          reason
        );
        
        // 却下理由をコメントとしても追加
        await this.applicationService.addComment(this.application.id, {
          userId: this.currentUserId,
          comment: reason!,
          type: 'rejection_reason',
          createdAt: new Date()
        });
        
        // 通知を作成
        await this.createNotificationForStatusChange('rejected', reason);
      } else {
        // その他のステータス（pending, approved）
        await this.applicationService.updateStatus(
          this.application.id,
          selectedStatus,
          this.currentUserId
        );
      }
      
      this.snackBar.open('申請ステータスを変更しました', '閉じる', { duration: 3000 });
      
      // 外部申請が承認された場合、社員情報更新のメッセージを追加表示
      if (selectedStatus === 'approved' && this.application.category === 'external') {
        this.snackBar.open('社員情報を更新してください', '閉じる', { duration: 5000 });
      }
      
      await this.loadApplication(this.application.id);
    } catch (error) {
      console.error('申請ステータスの変更に失敗しました:', error);
      this.snackBar.open('申請ステータスの変更に失敗しました', '閉じる', { duration: 5000 });
    }
  }

  /**
   * 外部申請ステータスのラベルを取得
   */
  getExternalApplicationStatusLabel(status: ExternalApplicationStatus | null | undefined): string {
    if (!status) {
      return '未設定';
    }
    const labels: Record<NonNullable<ExternalApplicationStatus>, string> = {
      sent: '送信済み（未受理）',
      received: '受理済み',
      error: 'エラー'
    };
    return labels[status] || status;
  }

  /**
   * CSV出力
   */
  exportToCsv(): void {
    if (!this.application) {
      return;
    }

    const formattedData = this.formatApplicationData(this.application.data);
    const csvContent = this.convertToCsv(formattedData);
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM付きUTF-8
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // ファイル名を生成（申請種別名_申請ID_日時.csv）
    const applicationTypeName = this.getApplicationTypeName().replace(/\s+/g, '_');
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `${applicationTypeName}_${this.application.id}_${dateStr}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    this.snackBar.open('CSVファイルをダウンロードしました', '閉じる', { duration: 3000 });
  }

  /**
   * フォーマット済みデータをCSV形式に変換
   */
  private convertToCsv(formattedData: FormattedSection[]): string {
    const rows: string[] = [];
    
    // CSVヘッダー
    rows.push('項目,値');
    
    // 各セクションを処理
    formattedData.forEach((section) => {
      // セクションタイトルを追加
      rows.push(`"${section.title}",`);
      
      // セクション内の項目を追加
      section.items.forEach((item) => {
        const label = this.escapeCsvValue(item.label);
        const value = item.isEmpty ? '(未入力)' : this.escapeCsvValue(String(item.value));
        rows.push(`${label},${value}`);
      });
      
      // セクション間の空行
      rows.push(',');
    });
    
    // 出力年月日を追加
    const now = new Date();
    const outputDate = this.formatEraDateForCsv(now);
    rows.push(`"出力年月日",${this.escapeCsvValue(outputDate)}`);
    
    return rows.join('\n');
  }

  /**
   * 日付を年号形式の文字列に変換（CSV出力用）
   */
  private formatEraDateForCsv(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    let era = '令和';
    let eraYear = year - 2018;

    if (year < 1926) {
      era = '大正';
      eraYear = year - 1911;
    } else if (year < 1989) {
      era = '昭和';
      eraYear = year - 1925;
    } else if (year < 2019) {
      era = '平成';
      eraYear = year - 1988;
    }

    return `${era}${eraYear}年${month}月${day}日`;
  }

  /**
   * CSV値のエスケープ
   */
  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * 送信可能かどうか
   */
  /**
   * 差戻し後に変更があったかどうかを判定
   */
  hasChanges(): boolean {
    if (!this.application || this.application.status !== 'returned') {
      return false;
    }

    // 外部申請のreturned状態も変更検出対象（内部申請と同様）

    // 最新の差戻し履歴を取得
    if (!this.application.returnHistory || this.application.returnHistory.length === 0) {
      return false;
    }

    const latestReturnHistory = this.application.returnHistory[this.application.returnHistory.length - 1];
    
    // データの比較（JSON.stringifyで比較、順序は考慮しない）
    const currentDataStr = JSON.stringify(this.application.data || {});
    const snapshotDataStr = JSON.stringify(latestReturnHistory.dataSnapshot || {});
    
    const dataChanged = currentDataStr !== snapshotDataStr;
    
    // 添付ファイルの比較
    const currentAttachments = this.application.attachments || [];
    const snapshotAttachments = latestReturnHistory.attachmentsSnapshot || [];
    
    // 添付ファイルの数が異なる場合は変更あり
    if (currentAttachments.length !== snapshotAttachments.length) {
      return true;
    }
    
    // 添付ファイルの内容を比較（fileNameとfileUrlで比較）
    const currentAttachmentsMap = new Map(
      currentAttachments.map(att => [att.fileName, att.fileUrl])
    );
    const snapshotAttachmentsMap = new Map(
      snapshotAttachments.map(att => [att.fileName, att.fileUrl])
    );
    
    // ファイル名のセットが異なる場合は変更あり
    if (currentAttachmentsMap.size !== snapshotAttachmentsMap.size) {
      return true;
    }
    
    // 各ファイルのURLが異なる場合は変更あり
    for (const [fileName, fileUrl] of currentAttachmentsMap.entries()) {
      if (snapshotAttachmentsMap.get(fileName) !== fileUrl) {
        return true;
      }
    }
    
    return dataChanged;
  }

  canSubmit(): boolean {
    const currentUser = this.authService.getCurrentUser();
    
    // created状態の内部申請のみ送信可能（draft状態は送信不可）
    if (this.application?.status === 'created' && 
        this.application.category === 'internal' &&
        !this.isAdmin &&
        this.application.employeeId === currentUser?.employeeId) {
      return true;
    }
    
    // returned状態で変更がある場合は再送信可能
    // 内部申請の場合
    if (this.application?.status === 'returned' &&
        this.application.category === 'internal' &&
        !this.isAdmin &&
        this.application.employeeId === currentUser?.employeeId &&
        this.hasChanges()) {
      return true;
    }
    
    // 外部申請の場合（管理者のみ）
    if (this.application?.status === 'returned' &&
        this.application.category === 'external' &&
        this.isAdmin &&
        this.hasChanges()) {
      return true;
    }
    
    return false;
  }

  /**
   * 承認可能かどうか
   */
  canApprove(): boolean {
    return this.isAdmin && 
           this.application?.status === 'pending' && 
           this.application.category === 'internal';
  }

  /**
   * 承認処理
   */
  async approveApplication(): Promise<void> {
    if (!this.application?.id || !this.currentUserId) {
      return;
    }

    const confirmed = confirm('この申請を承認しますか？');
    if (!confirmed) {
      return;
    }

    try {
      await this.applicationService.updateStatus(
        this.application.id,
        'approved',
        this.currentUserId
      );
      
      // 通知を作成
      await this.createNotificationForStatusChange('approved');
      
      this.snackBar.open('申請を承認しました', '閉じる', { duration: 3000 });
      await this.loadApplication(this.application.id);
    } catch (error) {
      console.error('承認処理エラー:', error);
      this.snackBar.open('承認処理に失敗しました', '閉じる', { duration: 5000 });
    }
  }

  /**
   * 差戻し処理
   */
  async returnApplication(): Promise<void> {
    if (!this.application?.id || !this.currentUserId) {
      return;
    }

    const reason = prompt('差戻し理由を入力してください:');
    if (!reason) {
      return;
    }

    try {
      // 差戻し前のデータスナップショットを保存
      const returnHistory: ApplicationReturnHistory = {
        returnedAt: new Date(),
        returnedBy: this.currentUserId,
        reason: reason,
        dataSnapshot: JSON.parse(JSON.stringify(this.application.data)), // ディープコピー
        attachmentsSnapshot: this.application.attachments ? JSON.parse(JSON.stringify(this.application.attachments)) : undefined,
        submissionDate: this.application.submissionDate // 差戻し前の届書提出日を保存
      };

      // 既存のreturnHistoryに追加
      const existingReturnHistory = this.application.returnHistory || [];
      const updatedReturnHistory = [...existingReturnHistory, returnHistory];

      // returnHistoryを更新
      await this.applicationService.updateApplication(this.application.id, {
        returnHistory: updatedReturnHistory
      });

      // ステータスをreturnedに変更
      await this.applicationService.updateStatus(
        this.application.id,
        'returned',
        this.currentUserId,
        reason
      );
      
      // 差戻し理由をコメントとしても追加
      await this.applicationService.addComment(this.application.id, {
        userId: this.currentUserId,
        comment: reason,
        type: 'rejection_reason',
        createdAt: new Date()
      });

      // 通知を作成
      await this.createNotificationForStatusChange('returned', reason);

      this.snackBar.open('申請を差戻ししました', '閉じる', { duration: 3000 });
      await this.loadApplication(this.application.id);
    } catch (error) {
      console.error('差戻し処理エラー:', error);
      this.snackBar.open('差戻し処理に失敗しました', '閉じる', { duration: 5000 });
    }
  }

  /**
   * 却下処理
   */
  async rejectApplication(): Promise<void> {
    if (!this.application?.id || !this.currentUserId) {
      return;
    }

    const reason = prompt('却下理由を入力してください:');
    if (!reason) {
      return;
    }

    try {
      await this.applicationService.updateStatus(
        this.application.id,
        'rejected',
        this.currentUserId,
        reason
      );
      
      // 却下理由をコメントとしても追加
      await this.applicationService.addComment(this.application.id, {
        userId: this.currentUserId,
        comment: reason,
        type: 'rejection_reason',
        createdAt: new Date()
      });

      // 通知を作成
      await this.createNotificationForStatusChange('rejected', reason);

      this.snackBar.open('申請を却下しました', '閉じる', { duration: 3000 });
      await this.loadApplication(this.application.id);
    } catch (error) {
      console.error('却下処理エラー:', error);
      this.snackBar.open('却下処理に失敗しました', '閉じる', { duration: 5000 });
    }
  }

  /**
   * コメント追加
   */
  async addComment(commentText: string): Promise<void> {
    if (!this.application?.id || !this.currentUserId || !commentText.trim()) {
      return;
    }

    try {
      await this.applicationService.addComment(this.application.id, {
        userId: this.currentUserId,
        comment: commentText.trim(),
        type: 'comment',
        createdAt: new Date()
      });
      this.snackBar.open('コメントを追加しました', '閉じる', { duration: 3000 });
      await this.loadApplication(this.application.id);
    } catch (error) {
      console.error('コメント追加エラー:', error);
      this.snackBar.open('コメントの追加に失敗しました', '閉じる', { duration: 5000 });
    }
  }

  /**
   * コメント入力ダイアログを開く
   */
  openCommentDialog(): void {
    const comment = prompt('コメントを入力してください:');
    if (comment) {
      this.addComment(comment);
    }
  }

  /**
   * 履歴を時系列で並べ替え（新しい順）
   */
  getSortedHistory(): ApplicationHistory[] {
    if (!this.application?.history) {
      return [];
    }
    return [...this.application.history].sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 
                    a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 
                    b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
      return dateB - dateA; // 新しい順
    });
  }

  /**
   * コメントを時系列で並べ替え（新しい順）
   */
  getSortedComments(): Comment[] {
    if (!this.application?.comments) {
      return [];
    }
    return [...this.application.comments].sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 
                    a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : 0;
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 
                    b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : 0;
      return dateB - dateA; // 新しい順
    });
  }

  /**
   * 差戻し履歴を時系列で並べ替え（古い順）
   */
  getSortedReturnHistory(): ApplicationReturnHistory[] {
    if (!this.application?.returnHistory) {
      return [];
    }
    return [...this.application.returnHistory].sort((a, b) => {
      const dateA = a.returnedAt instanceof Date ? a.returnedAt.getTime() : 
                    (a.returnedAt as Timestamp).toMillis();
      const dateB = b.returnedAt instanceof Date ? b.returnedAt.getTime() : 
                    (b.returnedAt as Timestamp).toMillis();
      return dateA - dateB; // 古い順
    });
  }

  /**
   * 差戻し履歴のデータを表示
   */
  viewReturnHistoryData(returnHistory: ApplicationReturnHistory): void {
    // ダイアログで履歴データを表示
    this.dialog.open(ApplicationReturnHistoryViewComponent, {
      width: '90%',
      maxWidth: '1200px',
      data: {
        returnHistory: returnHistory,
        applicationType: this.applicationType
      }
    });
  }

  /**
   * 内部申請から外部申請を作成可能かどうか
   */
  canCreateExternalFromInternal(): boolean {
    return this.isAdmin && 
           this.application?.category === 'internal' && 
           this.application?.status === 'approved';
  }

  /**
   * 内部申請から外部申請を作成
   */
  createExternalApplicationFromInternal(): void {
    if (!this.application?.id) {
      return;
    }
    // 外部申請作成画面に遷移し、内部申請IDをクエリパラメータで渡す
    this.router.navigate(['/applications/create'], {
      queryParams: { fromInternal: this.application.id }
    });
  }

  /**
   * 関連する申請を読み込む
   */
  private async loadRelatedApplications(): Promise<void> {
    if (!this.application) {
      return;
    }

    const appIds: string[] = [];
    if (this.application.category === 'external' && this.application.relatedInternalApplicationIds) {
      appIds.push(...this.application.relatedInternalApplicationIds);
    } else if (this.application.category === 'internal' && this.application.relatedExternalApplicationIds) {
      appIds.push(...this.application.relatedExternalApplicationIds);
    }

    if (appIds.length === 0) {
      return;
    }

    for (const appId of appIds) {
      try {
        const app = await this.applicationService.getApplication(appId);
        if (app) {
          this.relatedApplications.set(appId, app);
          // 社員情報も読み込む（employeeIdがある場合のみ）
          if (app.employeeId) {
            try {
              const emp = await this.employeeService.getEmployee(app.employeeId);
              if (emp) {
                this.relatedApplicationEmployees.set(appId, emp);
              }
            } catch (error) {
              console.error(`関連申請 ${appId} の社員情報の読み込みに失敗しました:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`関連申請 ${appId} の読み込みに失敗しました:`, error);
      }
    }
  }

  /**
   * 関連申請の表示名を取得
   */
  getRelatedApplicationDisplayName(appId: string, category: ApplicationCategory): string {
    const app = this.relatedApplications.get(appId);
    if (!app) {
      return appId;
    }

    const type = this.organization?.applicationFlowSettings?.applicationTypes?.find(t => t.id === app.type);
    const typeName = type?.name || app.type;
    const employee = this.relatedApplicationEmployees.get(appId);
    const employeeName = employee ? `${employee.lastName} ${employee.firstName}` : '読み込み中...';
    const date = app.createdAt instanceof Date 
      ? app.createdAt.toLocaleDateString('ja-JP')
      : (app.createdAt instanceof Timestamp 
        ? app.createdAt.toDate().toLocaleDateString('ja-JP')
        : '');
    return `${typeName} - ${employeeName} (${date})`;
  }

  /**
   * 関連申請の詳細を表示
   */
  viewRelatedApplication(appId: string): void {
    if (!appId) {
      this.snackBar.open('申請IDが指定されていません', '閉じる', { duration: 3000 });
      return;
    }
    
    this.router.navigate(['/applications', appId]).catch(error => {
      console.error('申請詳細への遷移に失敗しました:', error);
      this.snackBar.open('申請詳細の表示に失敗しました', '閉じる', { duration: 3000 });
    });
  }

  /**
   * 外部申請承認時に社員データに反映
   */
  private async reflectApplicationDataToEmployee(application: Application): Promise<void> {
    if (!application.id || !application.employeeId || !application.type || !this.currentUserId || !this.organization?.id) {
      throw new Error('申請情報が不足しています');
    }

    // 申請種別を取得
    const applicationType = this.organization?.applicationFlowSettings?.applicationTypes?.find(t => t.id === application.type);
    if (!applicationType) {
      throw new Error('申請種別が見つかりません');
    }

    const organizationId = this.organization.id;
    const data = application.data;
    if (!data) {
      throw new Error('申請データが不足しています');
    }

    // 申請種別に応じて被保険者情報から識別情報を取得し、該当する社員を検索
    switch (applicationType.code) {
      case 'DEPENDENT_CHANGE_EXTERNAL':
      case 'ADDRESS_CHANGE_EXTERNAL':
      case 'NAME_CHANGE_EXTERNAL': {
        // 単一の被保険者情報から識別情報を取得
        const insuredPerson = data['insuredPerson'];
        if (!insuredPerson) {
          throw new Error('被保険者情報が見つかりません');
        }

        const insuranceNumber = insuredPerson['insuranceNumber'];
        const personalNumber = insuredPerson['personalNumber'];
        const basicPensionNumber = insuredPerson['basicPensionNumber'];

        // 識別情報で社員を検索
        const employee = await this.employeeService.getEmployeeByIdentification(
          organizationId,
          insuranceNumber,
          personalNumber,
          basicPensionNumber
        );

        if (!employee || !employee.id) {
          throw new Error('被保険者に該当する社員が見つかりません');
        }

        // 変更前のデータを保存（変更履歴用）
        const changes: { field: string; before: any; after: any }[] = [];
        const beforeData: any = {};

        // 申請種別に応じてデータを反映
        if (applicationType.code === 'DEPENDENT_CHANGE_EXTERNAL') {
          await this.reflectDependentChange(application, employee, changes, beforeData);
        } else if (applicationType.code === 'ADDRESS_CHANGE_EXTERNAL') {
          await this.reflectAddressChange(application, employee, changes, beforeData);
        } else if (applicationType.code === 'NAME_CHANGE_EXTERNAL') {
          await this.reflectNameChange(application, employee, changes, beforeData);
        }

        // 変更があった場合のみ更新
        if (changes.length > 0) {
          // 変更履歴を追加
          const changeHistory: EmployeeChangeHistory = {
            applicationId: application.id!,
            applicationName: applicationType.name,
            changedAt: new Date(),
            changedBy: this.currentUserId,
            changes: changes
          };

          const updatedChangeHistory = [...(employee.changeHistory || []), changeHistory];

          // 社員データを更新
          await this.employeeService.updateEmployee(employee.id, {
            ...employee,
            changeHistory: updatedChangeHistory
          });
        }
        break;
      }
      case 'REWARD_BASE':
      case 'REWARD_CHANGE': {
        // 複数の被保険者がいる可能性がある
        const insuredPersons = data['insuredPersons'];
        if (!insuredPersons || !Array.isArray(insuredPersons) || insuredPersons.length === 0) {
          throw new Error('被保険者情報が見つかりません');
        }

        // 各被保険者について処理
        for (const insuredPerson of insuredPersons) {
          const insuranceNumber = insuredPerson['insuranceNumber'];
          const personalNumber = insuredPerson['personalNumber'];
          const basicPensionNumber = insuredPerson['basicPensionNumber'];

          // 識別情報で社員を検索
          const employee = await this.employeeService.getEmployeeByIdentification(
            organizationId,
            insuranceNumber,
            personalNumber,
            basicPensionNumber
          );

          if (!employee || !employee.id) {
            console.warn(`被保険者整理番号: ${insuranceNumber} に該当する社員が見つかりません`);
            continue;
          }

          // 変更前のデータを保存（変更履歴用）
          const changes: { field: string; before: any; after: any }[] = [];
          const beforeData: any = {};

          // 報酬月額の反映
          await this.reflectRewardChange(application, employee, applicationType.code, changes, beforeData, insuredPerson);

          // 変更があった場合のみ更新
          if (changes.length > 0) {
            // 変更履歴を追加
            const changeHistory: EmployeeChangeHistory = {
              applicationId: application.id!,
              applicationName: applicationType.name,
              changedAt: new Date(),
              changedBy: this.currentUserId,
              changes: changes
            };

            const updatedChangeHistory = [...(employee.changeHistory || []), changeHistory];

            // 社員データを更新
            await this.employeeService.updateEmployee(employee.id, {
              ...employee,
              changeHistory: updatedChangeHistory
            });
          }
        }
        break;
      }
      default:
        // その他の申請種別は反映しない
        return;
    }
  }

  /**
   * 被扶養者（異動）届のデータを反映
   */
  private async reflectDependentChange(application: Application, employee: Employee, changes: { field: string; before: any; after: any }[], beforeData: any): Promise<void> {
    const data = application.data;
    if (!data) {
      return;
    }

    const dependentInfo = employee.dependentInfo || [];
    const updatedDependentInfo: DependentInfo[] = [...dependentInfo];

    // 配偶者の処理
    const spouseDependent = data['spouseDependent'];
    if (spouseDependent) {
      const changeType = spouseDependent['changeType'];
      const personalNumber = spouseDependent['personalNumber'];
      const basicPensionNumber = spouseDependent['basicPensionNumber'];
      const identificationNumber = personalNumber || basicPensionNumber;

      if (changeType === 'applicable') {
        // 追加
        const dependentStartDate = spouseDependent['dependentStartDate'];
        const becameDependentDate = dependentStartDate ? this.convertEraDateToDate(dependentStartDate) : undefined;
        
        const newSpouse: DependentInfo = {
          name: `${spouseDependent['lastName'] || ''} ${spouseDependent['firstName'] || ''}`.trim(),
          nameKana: `${spouseDependent['lastNameKana'] || ''} ${spouseDependent['firstNameKana'] || ''}`.trim(),
          birthDate: this.convertEraDateToDate(spouseDependent['birthDate']),
          relationship: spouseDependent['relationship'] || 'spouse',
          income: spouseDependent['income'] || undefined,
          livingTogether: spouseDependent['address']?.livingTogether === 'living_together',
          becameDependentDate: becameDependentDate
        };
        updatedDependentInfo.push(newSpouse);
        changes.push({
          field: 'dependentInfo',
          before: JSON.parse(JSON.stringify(dependentInfo)),
          after: JSON.parse(JSON.stringify([...updatedDependentInfo]))
        });
      } else if (changeType === 'not_applicable') {
        // 削除
        const index = updatedDependentInfo.findIndex(dep => 
          (dep.relationship === 'husband' || dep.relationship === 'wife') &&
          (identificationNumber ? (dep.dependentId === identificationNumber) : false)
        );
        if (index >= 0) {
          updatedDependentInfo.splice(index, 1);
          changes.push({
            field: 'dependentInfo',
            before: JSON.parse(JSON.stringify(dependentInfo)),
            after: JSON.parse(JSON.stringify([...updatedDependentInfo]))
          });
        }
      } else if (changeType === 'change') {
        // 変更
        const index = updatedDependentInfo.findIndex(dep => 
          (dep.relationship === 'husband' || dep.relationship === 'wife') &&
          (identificationNumber ? (dep.dependentId === identificationNumber) : false)
        );
        if (index >= 0) {
          const changeAfter = spouseDependent['changeAfter'];
          updatedDependentInfo[index] = {
            ...updatedDependentInfo[index],
            income: changeAfter?.income || updatedDependentInfo[index].income,
            livingTogether: spouseDependent['address']?.livingTogether === 'living_together'
          };
          changes.push({
            field: 'dependentInfo',
            before: JSON.parse(JSON.stringify(dependentInfo)),
            after: JSON.parse(JSON.stringify([...updatedDependentInfo]))
          });
        }
      }
    }

    // その他被扶養者の処理
    const otherDependents = data['otherDependents'];
    if (otherDependents && Array.isArray(otherDependents)) {
      for (const otherDep of otherDependents) {
        const changeType = otherDep['changeType'];
        const personalNumber = otherDep['personalNumber'];
        const basicPensionNumber = otherDep['basicPensionNumber'];
        const identificationNumber = personalNumber || basicPensionNumber;
        const dependentId = identificationNumber || this.generateUUID();

        if (changeType === 'applicable') {
          // 追加
          const dependentStartDate = otherDep['dependentStartDate'] || otherDep['changeDate'];
          const becameDependentDate = dependentStartDate ? this.convertEraDateToDate(dependentStartDate) : undefined;
          
          // lastName/firstNameを優先的に使用、存在しない場合はnameから分割
          const lastName = otherDep['lastName'] || '';
          const firstName = otherDep['firstName'] || '';
          const lastNameKana = otherDep['lastNameKana'] || '';
          const firstNameKana = otherDep['firstNameKana'] || '';
          const name = lastName && firstName 
            ? `${lastName} ${firstName}`.trim() 
            : (otherDep['name'] || '');
          const nameKana = lastNameKana && firstNameKana 
            ? `${lastNameKana} ${firstNameKana}`.trim() 
            : (otherDep['nameKana'] || '');

          const newDependent: DependentInfo = {
            name: name,
            nameKana: nameKana,
            lastName: lastName || undefined,
            firstName: firstName || undefined,
            lastNameKana: lastNameKana || undefined,
            firstNameKana: firstNameKana || undefined,
            birthDate: this.convertEraDateToDate(otherDep['birthDate']),
            relationship: otherDep['relationship'] || '',
            income: otherDep['income'] || undefined,
            livingTogether: otherDep['address']?.livingTogether === 'living_together',
            dependentId: dependentId,
            becameDependentDate: becameDependentDate
          };
          updatedDependentInfo.push(newDependent);
        } else if (changeType === 'not_applicable') {
          // 削除
          const index = updatedDependentInfo.findIndex(dep => dep.dependentId === dependentId);
          if (index >= 0) {
            updatedDependentInfo.splice(index, 1);
          }
        } else if (changeType === 'change') {
          // 変更
          const index = updatedDependentInfo.findIndex(dep => dep.dependentId === dependentId);
          if (index >= 0) {
            const changeAfter = otherDep['changeAfter'];
            updatedDependentInfo[index] = {
              ...updatedDependentInfo[index],
              income: changeAfter?.income || updatedDependentInfo[index].income,
              livingTogether: otherDep['address']?.livingTogether === 'living_together'
            };
          }
        }
      }

      if (otherDependents.length > 0) {
        changes.push({
          field: 'dependentInfo',
          before: JSON.parse(JSON.stringify(dependentInfo)),
          after: JSON.parse(JSON.stringify([...updatedDependentInfo]))
        });
      }
    }

    employee.dependentInfo = updatedDependentInfo;
  }

  /**
   * 被保険者住所変更届のデータを反映
   */
  private async reflectAddressChange(application: Application, employee: Employee, changes: { field: string; before: any; after: any }[], beforeData: any): Promise<void> {
    const data = application.data;
    if (!data) {
      return;
    }

    const insuredPerson = data['insuredPerson'];
    if (!insuredPerson) {
      return;
    }

    const newAddress = {
      postalCode: insuredPerson['newPostalCode'] || '',
      prefecture: insuredPerson['newPrefecture'] || '',
      city: insuredPerson['newCity'] || '',
      street: insuredPerson['newStreet'] || '',
      building: insuredPerson['newBuilding'] || ''
    };

    const beforeAddress = employee.address?.official || null;
    employee.address = {
      official: newAddress
    };

    changes.push({
      field: 'address.official',
      before: beforeAddress,
      after: newAddress
    });
  }

  /**
   * 被保険者氏名変更（訂正）届のデータを反映
   */
  private async reflectNameChange(application: Application, employee: Employee, changes: { field: string; before: any; after: any }[], beforeData: any): Promise<void> {
    const data = application.data;
    if (!data) {
      return;
    }

    const insuredPerson = data['insuredPerson'];
    if (!insuredPerson) {
      return;
    }

    const newFirstName = insuredPerson['newFirstName'] || '';
    const newLastName = insuredPerson['newLastName'] || '';
    const newFirstNameKana = insuredPerson['newFirstNameKana'] || '';
    const newLastNameKana = insuredPerson['newLastNameKana'] || '';

    if (employee.firstName !== newFirstName) {
      changes.push({
        field: 'firstName',
        before: employee.firstName,
        after: newFirstName
      });
      employee.firstName = newFirstName;
    }

    if (employee.lastName !== newLastName) {
      changes.push({
        field: 'lastName',
        before: employee.lastName,
        after: newLastName
      });
      employee.lastName = newLastName;
    }

    if (employee.firstNameKana !== newFirstNameKana) {
      changes.push({
        field: 'firstNameKana',
        before: employee.firstNameKana,
        after: newFirstNameKana
      });
      employee.firstNameKana = newFirstNameKana;
    }

    if (employee.lastNameKana !== newLastNameKana) {
      changes.push({
        field: 'lastNameKana',
        before: employee.lastNameKana,
        after: newLastNameKana
      });
      employee.lastNameKana = newLastNameKana;
    }
  }

  /**
   * 報酬月額算定基礎届・変更届のデータを反映
   */
  private async reflectRewardChange(
    application: Application,
    employee: Employee,
    applicationTypeCode: string,
    changes: { field: string; before: any; after: any }[],
    beforeData: any,
    insuredPerson?: any
  ): Promise<void> {
    // 申請データから平均月額を取得
    let averageReward: number | null = null;
    
    if (insuredPerson) {
      // insuredPersonが渡されている場合は、その被保険者の情報を使用
      averageReward = insuredPerson['adjustedAverage'] || insuredPerson['average'] || null;
    } else {
      // 後方互換性のため、従来の方法も残す
      const data = application.data;
      if (!data) {
        return;
      }

      const insuredPersons = data['insuredPersons'];
      if (!insuredPersons || !Array.isArray(insuredPersons)) {
        return;
      }

      // 申請のemployeeIdに該当する被保険者を探す
      const employeeInsuranceNumber = employee.insuranceInfo?.healthInsuranceNumber;
      if (!employeeInsuranceNumber) {
        return;
      }

      for (const person of insuredPersons) {
        if (person['insuranceNumber'] === employeeInsuranceNumber) {
          averageReward = person['adjustedAverage'] || person['average'] || null;
          break;
        }
      }
    }

    if (!averageReward || !employee.insuranceInfo) {
      return;
    }

    // 申請された平均月額を保存
    const beforeAverageReward = employee.insuranceInfo.averageReward;
    employee.insuranceInfo.averageReward = averageReward;
    if (beforeAverageReward !== averageReward) {
      changes.push({
        field: 'insuranceInfo.averageReward',
        before: beforeAverageReward,
        after: averageReward
      });
    }

    // 保険料率テーブルを取得（申請の承認日時点で有効なテーブルを使用）
    const approvalDate = application.history?.find(h => h.action === 'approve')?.createdAt || new Date();
    const targetDate = approvalDate instanceof Date ? approvalDate : (approvalDate.toDate ? approvalDate.toDate() : new Date());
    
    // 保険料率テーブルを取得（組織固有のテーブルのみ使用）
    const rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(employee.organizationId);
    // 全組織共通のテーブルは現在使用しない（将来的に必要になった場合はコメントアウトを解除）
    // const commonRateTables = await this.insuranceRateTableService.getCommonRateTables();
    // const allRateTables = [...rateTables, ...commonRateTables];
    const allRateTables = rateTables;

    // 適用期間でフィルタリング
    const validRateTables = allRateTables.filter(table => {
      const effectiveFrom = this.convertTimestampToDate(table.effectiveFrom);
      const effectiveTo = table.effectiveTo ? this.convertTimestampToDate(table.effectiveTo) : null;
      
      if (!effectiveFrom) {
        return false;
      }
      
      const fromDate = new Date(effectiveFrom.getFullYear(), effectiveFrom.getMonth(), 1);
      const toDate = effectiveTo ? new Date(effectiveTo.getFullYear(), effectiveTo.getMonth(), 1) : null;
      
      return targetDate >= fromDate && (!toDate || targetDate <= toDate);
    });

    if (validRateTables.length === 0) {
      console.warn(`申請承認日時点で適用される保険料率テーブルが見つかりません`);
      return;
    }

    // 平均月額から等級を判定
    const grade = this.getGradeFromAverageReward(averageReward, validRateTables);
    const pensionGrade = this.getPensionGradeFromAverageReward(averageReward, validRateTables);

    if (!grade) {
      console.warn(`平均月額 ${averageReward} 円に対応する等級が見つかりません`);
      return;
    }

    // 等級に対応する標準報酬月額の規定値を取得
    const rateTable = validRateTables.find(t => t.grade === grade);
    if (!rateTable) {
      console.warn(`等級 ${grade} の料率テーブルが見つかりません`);
      return;
    }

    const standardRewardAmount = rateTable.standardRewardAmount;

    // 修正12: 他社兼務者の場合は標準報酬月額の反映をスキップ（手入力のみ）
    const beforeStandardReward = employee.insuranceInfo.standardReward;
    const beforeGrade = employee.insuranceInfo.grade;
    const beforePensionGrade = employee.insuranceInfo.pensionGrade;

    // 他社兼務者の場合は標準報酬月額・等級の反映をスキップ
    if (employee.otherCompanyInfo && employee.otherCompanyInfo.length > 0) {
      // 標準報酬月額・等級は手入力のみのため、申請承認時の反映をスキップ
      // averageRewardのみ反映
      if (averageReward !== undefined) {
        employee.insuranceInfo.averageReward = averageReward;
      }
      return; // 標準報酬月額・等級の反映をスキップして終了
    }

    employee.insuranceInfo.standardReward = standardRewardAmount;
    employee.insuranceInfo.grade = grade;
    if (pensionGrade) {
      employee.insuranceInfo.pensionGrade = pensionGrade;
    }

    // 変更履歴に追加
    if (beforeStandardReward !== standardRewardAmount) {
      changes.push({
        field: 'insuranceInfo.standardReward',
        before: beforeStandardReward,
        after: standardRewardAmount
      });
    }
    if (beforeGrade !== grade) {
      changes.push({
        field: 'insuranceInfo.grade',
        before: beforeGrade,
        after: grade
      });
    }
    if (beforePensionGrade !== pensionGrade) {
      changes.push({
        field: 'insuranceInfo.pensionGrade',
        before: beforePensionGrade,
        after: pensionGrade
      });
    }

    // 適用年月日を反映
    let effectiveDate: Date | null = null;
    const data = application.data;
    
    if (insuredPerson) {
      // insuredPersonが渡されている場合
      if (applicationTypeCode === 'REWARD_BASE' && insuredPerson['applicableDate']) {
        // 算定基礎届の適用年月日
        effectiveDate = this.convertEraDateToDate(insuredPerson['applicableDate']);
      } else if (applicationTypeCode === 'REWARD_CHANGE' && insuredPerson['changeDate']) {
        // 報酬月額変更届の改定年月日
        effectiveDate = this.convertEraDateToDate(insuredPerson['changeDate']);
      }
    } else if (data) {
      // 従来の方法
      const insuredPersons = data['insuredPersons'];
      if (insuredPersons && Array.isArray(insuredPersons)) {
        const employeeInsuranceNumber = employee.insuranceInfo?.healthInsuranceNumber;
        if (employeeInsuranceNumber) {
          for (const person of insuredPersons) {
            if (person['insuranceNumber'] === employeeInsuranceNumber) {
              if (applicationTypeCode === 'REWARD_BASE' && person['applicableDate']) {
                effectiveDate = this.convertEraDateToDate(person['applicableDate']);
              } else if (applicationTypeCode === 'REWARD_CHANGE' && person['changeDate']) {
                effectiveDate = this.convertEraDateToDate(person['changeDate']);
              }
              break;
            }
          }
        }
      }
    }

    if (effectiveDate) {
      const beforeEffectiveDate = employee.insuranceInfo.gradeAndStandardRewardEffectiveDate;
      employee.insuranceInfo.gradeAndStandardRewardEffectiveDate = effectiveDate;
      if (beforeEffectiveDate !== effectiveDate) {
        changes.push({
          field: 'insuranceInfo.gradeAndStandardRewardEffectiveDate',
          before: beforeEffectiveDate,
          after: effectiveDate
        });
      }
    }
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
   * FirestoreのTimestampまたはDateをDateオブジェクトに変換
   */
  private convertTimestampToDate(value: any): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    if (value && typeof value.toDate === 'function') {
      return value.toDate();
    }
    // Firestoreのplain object形式（{seconds: number, nanoseconds: number}）の場合
    if (value && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }
    return null;
  }

  /**
   * 年号付き日付をDateオブジェクトに変換
   */
  private convertEraDateToDate(eraDate: any): Date {
    if (!eraDate || !eraDate.era || !eraDate.year || !eraDate.month || !eraDate.day) {
      return new Date();
    }

    const eraYearMap: { [key: string]: number } = {
      'reiwa': 2018,
      'heisei': 1988,
      'showa': 1925,
      'taisho': 1911
    };

    const baseYear = eraYearMap[eraDate.era] || 2018;
    const year = baseYear + eraDate.year - 1;
    const month = eraDate.month - 1; // JavaScriptのDateは0ベース
    const day = eraDate.day;

    return new Date(year, month, day);
  }

  /**
   * 申請ステータス変更時に通知を作成
   */
  private async createNotificationForStatusChange(status: ApplicationStatus, comment?: string, isResubmission: boolean = false): Promise<void> {
    if (!this.application || !this.employee || !this.organization) {
      return;
    }

    const applicationTypeName = this.applicationType?.name || this.application.type;
    const employeeName = `${this.employee.lastName} ${this.employee.firstName}`;

    // 【修正20】通知機能を削除するためコメントアウト
    /*
    await this.notificationService.createApplicationStatusNotification({
      applicationId: this.application.id!,
      employeeId: this.application.employeeId,
      organizationId: this.application.organizationId,
      status: status,
      applicationTypeName: applicationTypeName,
      employeeName: employeeName,
      approverId: this.currentUserId || undefined,
      comment: comment,
      notificationSettings: this.organization.applicationFlowSettings?.notificationSettings,
      isResubmission: isResubmission
    });
    */
  }

  /**
   * UUIDを生成（簡易版）
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

