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
      boItems.push({ label: '事業所整理記号', value: bo.officeSymbol || '', isEmpty: !bo.officeSymbol });
      boItems.push({ label: '事業所番号', value: bo.officeNumber || '', isEmpty: !bo.officeNumber });
      
      // 住所に郵便番号を追加（他の申請と合わせる）
      const postalCode = bo.postalCode || '';
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
      const sdItems: FormattedItem[] = [];
      
      if (sd.noChange) {
        sdItems.push({ label: '変更なし', value: '変更なし' });
        // 異動がない場合の配偶者の収入を表示
        if (sd.spouseIncome !== null && sd.spouseIncome !== undefined) {
          sdItems.push({ label: '配偶者の収入（年収）', value: `${sd.spouseIncome.toLocaleString()}円`, isEmpty: false });
        }
      } else {
        sdItems.push({ label: '異動種別', value: this.formatChangeType(sd.changeType), isEmpty: !sd.changeType });
        
        // 提出日を追加（businessOwnerReceiptDateまたはsubmissionDateから取得）
        if (data['businessOwnerReceiptDate']) {
          sdItems.push({ label: '提出日', value: this.formatEraDate(data['businessOwnerReceiptDate']), isEmpty: !data['businessOwnerReceiptDate'] });
        } else if (data['submissionDate']) {
          sdItems.push({ label: '提出日', value: this.formatEraDate(data['submissionDate']), isEmpty: !data['submissionDate'] });
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
      data['otherDependents'].forEach((dep: any, index: number) => {
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
      'part_time': 'パート',
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
