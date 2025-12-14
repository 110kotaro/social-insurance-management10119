import { Component, Input, OnInit, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Organization } from '../../../core/models/organization.model';
import { OrganizationService } from '../../../core/services/organization.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-insurance-info-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatSnackBarModule
  ],
  templateUrl: './insurance-info-settings.component.html',
  styleUrl: './insurance-info-settings.component.css'
})
export class InsuranceInfoSettingsComponent implements OnInit, OnChanges {
  @Input() organization: Organization | null = null;
  
  private fb = inject(FormBuilder);
  private organizationService = inject(OrganizationService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  insuranceForm: FormGroup;
  isLoading = false;

  constructor() {
    this.insuranceForm = this.fb.group({
      // 健康保険
      healthInsuranceType: ['kyokai'], // 協会けんぽ固定
      healthInsuranceOfficeSymbol: ['', Validators.required], // 事業所整理記号（必須）
      // healthInsuranceRoundingMethod: [''], // 端数処理方式（削除：計算ロジックで実装済み）
      healthInsuranceCardFormat: ['none'],
      // 厚生年金
      pensionInsuranceOfficeNumber: ['', Validators.required],
      // pensionInsuranceRoundingMethod: [''], // 端数処理方式（削除：計算ロジックで実装済み）
      pensionInsuranceBusinessCategory: ['', Validators.required],
      // 介護保険
      careInsuranceTargetOffice: [null, Validators.required]
      // 雇用保険（コメントアウト：不要）
      // employmentInsuranceOfficeNumber: ['', Validators.required],
      // employmentInsuranceLaborNumber: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.loadInsuranceSettings();
  }

  ngOnChanges(): void {
    this.loadInsuranceSettings();
  }

  loadInsuranceSettings(): void {
    if (!this.organization?.insuranceSettings) {
      return;
    }

    const ins = this.organization.insuranceSettings;
    this.insuranceForm.patchValue({
      healthInsuranceType: ins.healthInsurance?.type || 'kyokai',
      healthInsuranceOfficeSymbol: ins.healthInsurance?.officeSymbol || '',
      healthInsuranceCardFormat: ins.healthInsurance?.cardFormat || 'none',
      pensionInsuranceOfficeNumber: ins.pensionInsurance?.officeNumber || '',
      pensionInsuranceBusinessCategory: ins.pensionInsurance?.businessCategory || '',
      careInsuranceTargetOffice: ins.careInsurance?.targetOffice !== undefined ? ins.careInsurance.targetOffice : null
      // employmentInsurance: コメントアウト（削除）
      // employmentInsuranceOfficeNumber: ins.employmentInsurance?.officeNumber || '',
      // employmentInsuranceLaborNumber: ins.employmentInsurance?.laborInsuranceNumber || ''
    });
  }

  /**
   * 設定を保存
   */
  async saveInsuranceSettings(): Promise<void> {
    if (!this.organization?.id) {
      this.snackBar.open('組織情報が見つかりません', '閉じる', { duration: 3000 });
      return;
    }

    if (this.insuranceForm.invalid) {
      this.snackBar.open('必須項目を入力してください', '閉じる', { duration: 3000 });
      return;
    }

    this.isLoading = true;
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
          targetOffice: formValue.careInsuranceTargetOffice !== null ? formValue.careInsuranceTargetOffice : false
        }
        // employmentInsurance: { // 削除：雇用保険情報は不要
        //   officeNumber: formValue.employmentInsuranceOfficeNumber?.trim() || undefined,
        //   laborInsuranceNumber: formValue.employmentInsuranceLaborNumber?.trim() || undefined
        // }
      };

      await this.organizationService.updateOrganization(this.organization.id, {
        insuranceSettings: insuranceSettings
      });

      this.snackBar.open('保険情報設定を保存しました', '閉じる', { duration: 3000 });
    } catch (error) {
      console.error('保険情報設定の保存に失敗しました:', error);
      this.snackBar.open('保険情報設定の保存に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }
}
