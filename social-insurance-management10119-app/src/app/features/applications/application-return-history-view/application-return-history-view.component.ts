import { Component, inject, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { ApplicationReturnHistory } from '../../../core/models/application.model';
import { FormattedSection, FormattedItem } from '../application-detail/application-detail.component';
import { ApplicationType } from '../../../core/models/application-flow.model';
import { Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-application-return-history-view',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatListModule,
    MatChipsModule,
    MatDividerModule
  ],
  templateUrl: './application-return-history-view.component.html',
  styleUrl: './application-return-history-view.component.css'
})
export class ApplicationReturnHistoryViewComponent {
  private dialogRef = inject(MatDialogRef<ApplicationReturnHistoryViewComponent>);

  returnHistory: ApplicationReturnHistory;
  applicationType: ApplicationType | null = null;
  formattedData: FormattedSection[] = [];

  constructor(@Inject(MAT_DIALOG_DATA) public data: { returnHistory: ApplicationReturnHistory; applicationType?: ApplicationType | null }) {
    this.returnHistory = data.returnHistory;
    this.applicationType = data.applicationType || null;
    this.formattedData = this.formatApplicationData(this.returnHistory.dataSnapshot);
  }

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date | Timestamp | undefined | null): string {
    if (!date) {
      return '';
    }
    const dateObj = date instanceof Timestamp ? date.toDate() : date;
    return dateObj.toLocaleDateString('ja-JP');
  }

  /**
   * 日時をフォーマット
   */
  formatDateTime(date: Date | Timestamp | undefined | null): string {
    if (!date) {
      return '';
    }
    const dateObj = date instanceof Timestamp ? date.toDate() : date;
    return dateObj.toLocaleString('ja-JP');
  }

  /**
   * 申請データをフォーマット（application-detail.component.tsからコピー）
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

    // 届書提出日
    if (data['submissionDate']) {
      sections.push({
        title: '届書提出日',
        items: [{
          label: '提出日',
          value: this.formatDateValue(data['submissionDate'])
        }]
      });
    }

    // 提出者情報
    if (data['submitterInfo']) {
      const submitterItems: FormattedItem[] = [];
      const si = data['submitterInfo'];
      
      submitterItems.push({ label: '事業所記号', value: si.officeSymbol || '', isEmpty: !si.officeSymbol });
      
      // 住所に郵便番号を追加（フォームデータにpostalCodeがある場合）
      const postalCode = si.postalCode || '';
      const address = si.officeAddress || si.address || '';
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      submitterItems.push({ label: '所在地', value: addressWithPostalCode, isEmpty: !address });
      
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

    if (data['submissionDate']) {
      sections.push({
        title: '届書提出日',
        items: [{ label: '提出日', value: this.formatDateValue(data['submissionDate']) }]
      });
    }

    if (data['submitterInfo']) {
      const submitterItems: FormattedItem[] = [];
      const si = data['submitterInfo'];
      submitterItems.push({ label: '事業所記号', value: si.officeSymbol || '', isEmpty: !si.officeSymbol });
      
      // 住所に郵便番号を追加（フォームデータにpostalCodeがある場合）
      const postalCode = si.postalCode || '';
      const address = si.officeAddress || si.address || '';
      const addressWithPostalCode = postalCode ? `〒${postalCode} ${address}` : address;
      submitterItems.push({ label: '所在地', value: addressWithPostalCode, isEmpty: !address });
      
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

    if (data['submissionDate']) {
      sections.push({
        title: '届書提出日',
        items: [{ label: '提出日', value: this.formatDateValue(data['submissionDate']) }]
      });
    }

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

    if (data['submissionDate']) {
      sections.push({
        title: '届書提出日',
        items: [{ label: '提出日', value: this.formatDateValue(data['submissionDate']) }]
      });
    }

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

    if (data['submissionDate']) {
      sections.push({
        title: '届書提出日',
        items: [{ label: '提出日', value: this.formatDateValue(data['submissionDate']) }]
      });
    }

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
      ipItems.push({ label: '生年月日', value: this.formatEraDate(ip.birthDate), isEmpty: !ip.birthDate });

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

    if (data['submissionDate']) {
      sections.push({
        title: '届書提出日',
        items: [{ label: '提出日', value: this.formatDateValue(data['submissionDate']) }]
      });
    }

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

    if (data['submissionDate']) {
      sections.push({
        title: '届書提出日',
        items: [{ label: '提出日', value: this.formatDateValue(data['submissionDate']) }]
      });
    }

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

    if (data['submissionDate']) {
      sections.push({
        title: '届書提出日',
        items: [{ label: '提出日', value: this.formatDateValue(data['submissionDate']) }]
      });
    }

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

    if (data['insuredPersons'] && Array.isArray(data['insuredPersons'])) {
      data['insuredPersons'].forEach((person: any, index: number) => {
        const personItems: FormattedItem[] = [];
        
        personItems.push({ label: '被保険者整理番号', value: person.insuranceNumber || '', isEmpty: !person.insuranceNumber });
        personItems.push({ label: '氏名', value: `${person.lastName || ''} ${person.firstName || ''}`.trim() || '', isEmpty: !person.lastName && !person.firstName });
        personItems.push({ label: '生年月日', value: this.formatEraDateForReward(person.birthDate), isEmpty: !person.birthDate });
        personItems.push({ label: '賞与支払年月日', value: this.formatDateValue(person.bonusPaymentDate), isEmpty: !person.bonusPaymentDate });
        
        // 期限を表示
        if (person.deadline) {
          const deadline = person.deadline instanceof Date 
            ? person.deadline 
            : (person.deadline as any).toDate 
              ? (person.deadline as any).toDate() 
              : new Date(person.deadline);
          personItems.push({ label: '期限', value: this.formatDateValue(deadline), isEmpty: false });
        }
        
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
   * オブジェクトのキーを取得（テンプレート用）
   */
  objectKeys(obj: any): string[] {
    return Object.keys(obj || {});
  }

  /**
   * ダイアログを閉じる
   */
  close(): void {
    this.dialogRef.close();
  }
}
