import { Component, inject, OnInit } from '@angular/core';
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
export class ApplicationDetailComponent implements OnInit {
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

  ngOnInit(): void {
    const applicationId = this.route.snapshot.paramMap.get('id');
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
  }

  /**
   * 申請情報を読み込む
   */
  private async loadApplication(applicationId: string): Promise<void> {
    try {
      this.application = await this.applicationService.getApplication(applicationId);
      
      if (!this.application) {
        this.snackBar.open('申請が見つかりませんでした', '閉じる', { duration: 3000 });
        this.router.navigate(['/applications']);
        return;
      }

      // 社員情報を読み込む
      this.employee = await this.employeeService.getEmployee(this.application.employeeId);
      
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
   * 日付をフォーマット
   */
  formatDate(date: Date | Timestamp | undefined | null): string {
    if (!date) return '-';
    const d = date instanceof Date ? date : (date instanceof Timestamp ? date.toDate() : new Date(date));
    return d.toLocaleDateString('ja-JP');
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
    if (!this.applicationType?.code) {
      return this.formatGenericData(data);
    }

    const code = this.applicationType.code;
    
    // 申請種別ごとのフォーマッターを呼び出す
    switch (code) {
      case 'INSURANCE_ACQUISITION':
        return this.formatInsuranceAcquisitionData(data);
      case 'INSURANCE_LOSS':
        return this.formatInsuranceLossData(data);
      case 'DEPENDENT_CHANGE':
      case 'DEPENDENT_CHANGE_EXTERNAL':
        return this.formatDependentChangeData(data);
      case 'ADDRESS_CHANGE':
      case 'ADDRESS_CHANGE_EXTERNAL':
        return this.formatAddressChangeData(data);
      case 'NAME_CHANGE':
      case 'NAME_CHANGE_EXTERNAL':
        return this.formatNameChangeData(data);
      case 'REWARD_BASE':
        return this.formatRewardBaseData(data);
      case 'REWARD_CHANGE':
        return this.formatRewardChangeData(data);
      case 'BONUS_PAYMENT':
        return this.formatBonusPaymentData(data);
      default:
        return this.formatGenericData(data);
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
      submitterItems.push({ label: '住所', value: addressWithPostalCode, isEmpty: !address });
      
      submitterItems.push({ label: '事業所名', value: si.officeName || si.name || '', isEmpty: !si.officeName && !si.name });
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
        personItems.push({ label: '被扶養者数', value: person.dependents?.toString() || '', isEmpty: person.dependents === null || person.dependents === undefined });
        
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
      submitterItems.push({ label: '住所', value: addressWithPostalCode, isEmpty: !address });
      
      submitterItems.push({ label: '事業所名', value: si.officeName || si.name || '', isEmpty: !si.officeName && !si.name });
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
        
        personItems.push({ label: '種別', value: this.formatType(person.type), isEmpty: !person.type });
        personItems.push({ label: '喪失年月日', value: this.formatDateValue(person.lossDate), isEmpty: !person.lossDate });
        personItems.push({ label: '喪失理由', value: this.formatLossReason(person.lossReason), isEmpty: !person.lossReason });
        
        if (person.lossReason === 'retirement') {
          personItems.push({ label: '退職年月日', value: this.formatDateValue(person.retirementDate), isEmpty: !person.retirementDate });
        } else if (person.lossReason === 'death') {
          personItems.push({ label: '死亡年月日', value: this.formatDateValue(person.deathDate), isEmpty: !person.deathDate });
        }
        
        personItems.push({ label: '備考', value: this.formatRemarks(person.remarks), isEmpty: !person.remarks });
        personItems.push({ label: '資格確認書回収', value: person.certificateCollection ? '回収済み' : '未回収' });
        personItems.push({ label: '70歳以上被用者該当', value: person.over70NotApplicable ? '該当しない' : '該当する' });
        
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
        sdItems.push({ label: '異動年月日', value: this.formatDateValue(sd.changeDate), isEmpty: !sd.changeDate });
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
          sdItems.push({ label: '死亡年月日', value: this.formatDateValue(sd.deathDate), isEmpty: !sd.deathDate });
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
        depItems.push({ label: '異動年月日', value: this.formatDateValue(dep.changeDate), isEmpty: !dep.changeDate });
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
          depItems.push({ label: '死亡年月日', value: this.formatDateValue(dep.deathDate), isEmpty: !dep.deathDate });
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
            depItems.push({ label: '国内転出年月日', value: this.formatDateValue(dep.domesticTransferDate), isEmpty: !dep.domesticTransferDate });
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
      
      // 住所に郵便番号を追加（フォームデータにpostalCodeがある場合）
      const postalCode = bi.postalCode || '';
      const address = bi.address || bi.officeAddress || '';
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      biItems.push({ label: '住所', value: addressWithPostalCode, isEmpty: !address });
      
      biItems.push({ label: '事業所名', value: bi.name || bi.officeName || '', isEmpty: !bi.name && !bi.officeName });
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
      
      // 住所に郵便番号を追加（フォームデータにpostalCodeがある場合）
      const postalCode = bi.postalCode || '';
      const address = bi.address || bi.officeAddress || '';
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      biItems.push({ label: '住所', value: addressWithPostalCode, isEmpty: !address });
      
      biItems.push({ label: '事業所名', value: bi.name || bi.officeName || '', isEmpty: !bi.name && !bi.officeName });
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
      biItems.push({ label: '事業所番号', value: bi.officeNumber || '', isEmpty: !bi.officeNumber });
      
      // 住所に郵便番号を追加（フォームデータにpostalCodeがある場合）
      const postalCode = bi.postalCode || '';
      const address = bi.address || bi.officeAddress || '';
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      biItems.push({ label: '住所', value: addressWithPostalCode, isEmpty: !address });
      
      biItems.push({ label: '事業所名', value: bi.name || bi.officeName || '', isEmpty: !bi.name && !bi.officeName });
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
        personItems.push({ label: '氏名', value: `${person.lastName || ''} ${person.firstName || ''}`.trim() || '', isEmpty: !person.lastName && !person.firstName });
        personItems.push({ label: '生年月日', value: this.formatEraDateForReward(person.birthDate), isEmpty: !person.birthDate });
        personItems.push({ label: '適用年月日', value: this.formatDateValue(person.applicableDate), isEmpty: !person.applicableDate });
        personItems.push({ label: '従前の標準報酬', value: person.previousStandardReward ? `${person.previousStandardReward.toLocaleString()}円` : '', isEmpty: !person.previousStandardReward });
        personItems.push({ label: '従前の改定月', value: person.previousRevisionMonth || '', isEmpty: !person.previousRevisionMonth });
        personItems.push({ label: '増減', value: person.salaryIncreaseDecrease || '', isEmpty: !person.salaryIncreaseDecrease });
        
        if (person.retroactivePayment && Array.isArray(person.retroactivePayment)) {
          person.retroactivePayment.forEach((rp: any, rpIndex: number) => {
            personItems.push({ 
              label: `遡及支払額（${rp.month}月）`, 
              value: rp.amount ? `${rp.amount.toLocaleString()}円` : '', 
              isEmpty: !rp.amount 
            });
          });
        }
        
        if (person.salaryMonths && Array.isArray(person.salaryMonths)) {
          person.salaryMonths.forEach((sm: any, smIndex: number) => {
            personItems.push({ 
              label: `報酬月額（${sm.month}月）`, 
              value: sm.total ? `${sm.total.toLocaleString()}円` : '', 
              isEmpty: !sm.total 
            });
          });
        }
        
        personItems.push({ label: '合計', value: person.total ? `${person.total.toLocaleString()}円` : '', isEmpty: !person.total });
        personItems.push({ label: '平均', value: person.average ? `${person.average.toLocaleString()}円` : '', isEmpty: !person.average });
        personItems.push({ label: '調整平均', value: person.adjustedAverage ? `${person.adjustedAverage.toLocaleString()}円` : '', isEmpty: !person.adjustedAverage });
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

  /**
   * 報酬月額変更届のデータをフォーマット
   */
  private formatRewardChangeData(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    if (data['businessInfo']) {
      const biItems: FormattedItem[] = [];
      const bi = data['businessInfo'];
      biItems.push({ label: '事業所記号', value: bi.officeSymbol || '', isEmpty: !bi.officeSymbol });
      biItems.push({ label: '事業所番号', value: bi.officeNumber || '', isEmpty: !bi.officeNumber });
      
      // 住所に郵便番号を追加（フォームデータにpostalCodeがある場合）
      const postalCode = bi.postalCode || '';
      const address = bi.address || bi.officeAddress || '';
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      biItems.push({ label: '住所', value: addressWithPostalCode, isEmpty: !address });
      
      biItems.push({ label: '事業所名', value: bi.name || bi.officeName || '', isEmpty: !bi.name && !bi.officeName });
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

  /**
   * 賞与支払届のデータをフォーマット
   */
  private formatBonusPaymentData(data: Record<string, any>): FormattedSection[] {
    const sections: FormattedSection[] = [];

    if (data['businessInfo']) {
      const biItems: FormattedItem[] = [];
      const bi = data['businessInfo'];
      biItems.push({ label: '事業所記号', value: bi.officeSymbol || '', isEmpty: !bi.officeSymbol });
      biItems.push({ label: '事業所番号', value: bi.officeNumber || '', isEmpty: !bi.officeNumber });
      
      // 住所に郵便番号を追加（フォームデータにpostalCodeがある場合）
      const postalCode = bi.postalCode || '';
      const address = bi.address || bi.officeAddress || '';
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      biItems.push({ label: '住所', value: addressWithPostalCode, isEmpty: !address });
      
      biItems.push({ label: '事業所名', value: bi.name || bi.officeName || '', isEmpty: !bi.name && !bi.officeName });
      biItems.push({ label: '電話番号', value: bi.phoneNumber || '', isEmpty: !bi.phoneNumber });

      sections.push({
        title: '事業所情報',
        items: biItems
      });
    }

    if (data['commonBonusPaymentDate']) {
      sections.push({
        title: '共通賞与支払年月日',
        items: [{ label: '賞与支払年月日', value: this.formatDateValue(data['commonBonusPaymentDate']) }]
      });
    }

    if (data['bonusPaymentPersons'] && Array.isArray(data['bonusPaymentPersons'])) {
      data['bonusPaymentPersons'].forEach((person: any, index: number) => {
        const personItems: FormattedItem[] = [];
        
        personItems.push({ label: '被保険者整理番号', value: person.insuranceNumber || '', isEmpty: !person.insuranceNumber });
        personItems.push({ label: '氏名', value: `${person.lastName || ''} ${person.firstName || ''}`.trim() || '', isEmpty: !person.lastName && !person.firstName });
        personItems.push({ label: '生年月日', value: this.formatEraDateForReward(person.birthDate), isEmpty: !person.birthDate });
        personItems.push({ label: '賞与支払年月日', value: this.formatDateValue(person.bonusPaymentDate), isEmpty: !person.bonusPaymentDate });
        
        if (person.bonusAmount) {
          personItems.push({ label: '賞与額（通貨）', value: person.bonusAmount.currency ? `${person.bonusAmount.currency.toLocaleString()}円` : '', isEmpty: !person.bonusAmount.currency });
          personItems.push({ label: '賞与額（現物）', value: person.bonusAmount.inKind ? `${person.bonusAmount.inKind.toLocaleString()}円` : '', isEmpty: !person.bonusAmount.inKind });
          personItems.push({ label: '賞与額（合計）', value: person.bonusAmount.total ? `${person.bonusAmount.total.toLocaleString()}円` : '', isEmpty: !person.bonusAmount.total });
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
    if (typeof remarks === 'string') return remarks;
    if (typeof remarks === 'object' && remarks.value) {
      if (remarks.value === 'other') {
        return `その他: ${remarks.otherText || ''}`;
      }
      const labels: Record<string, string> = {
        'over70_employee': '70歳以上被用者該当',
        'multiple_workplace': '二以上事業所勤務者の取得',
        'part_time_worker': '短時間労働者の取得（特定適用事業所等）',
        'rehired_after_retirement': '退職後の継続再雇用者の取得',
        'other': 'その他'
      };
      return labels[remarks.value] || remarks.value;
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
      'change': '変更'
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
      'marriage': '婚姻',
      'birth': '出生',
      'adoption': '養子縁組',
      'other': 'その他'
    };
    return reasons[reason] || reason || '';
  }

  /**
   * 職業をフォーマット
   */
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
   * その他被扶養者の続柄をフォーマット
   */
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
        
        await this.notificationService.createExternalApplicationStatusNotification({
          applicationId: this.application.id,
          employeeId: this.application.employeeId,
          organizationId: this.application.organizationId,
          externalStatus: selectedStatus,
          applicationTypeName: applicationTypeName,
          employeeName: employeeName,
          notificationSettings: this.organization.applicationFlowSettings?.notificationSettings
        });
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
        
        // 外部申請が承認された場合、社員データに反映
        if (selectedStatus === 'approved' && this.application.category === 'external' && this.application.employeeId) {
          try {
            await this.reflectApplicationDataToEmployee(this.application);
          } catch (error) {
            console.error('社員データへの反映に失敗しました:', error);
            this.snackBar.open('申請ステータスは変更されましたが、社員データへの反映に失敗しました。手動で更新してください。', '閉じる', { duration: 5000 });
          }
        }
      }
      
      this.snackBar.open('申請ステータスを変更しました', '閉じる', { duration: 3000 });
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
    
    return rows.join('\n');
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

    for (const appId of appIds) {
      try {
        const app = await this.applicationService.getApplication(appId);
        if (app) {
          this.relatedApplications.set(appId, app);
          // 社員情報も読み込む
          try {
            const emp = await this.employeeService.getEmployee(app.employeeId);
            if (emp) {
              this.relatedApplicationEmployees.set(appId, emp);
            }
          } catch (error) {
            console.error(`関連申請 ${appId} の社員情報の読み込みに失敗しました:`, error);
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
    this.router.navigate(['/applications', appId]);
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
          
          const newDependent: DependentInfo = {
            name: `${otherDep['lastName'] || ''} ${otherDep['firstName'] || ''}`.trim(),
            nameKana: `${otherDep['lastNameKana'] || ''} ${otherDep['firstNameKana'] || ''}`.trim(),
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

