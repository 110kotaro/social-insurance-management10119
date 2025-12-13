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
      healthInsuranceOfficeNumber: ['', Validators.required],
      healthInsuranceRoundingMethod: ['', Validators.required],
      healthInsuranceCardFormat: ['none'],
      // 厚生年金
      pensionInsuranceOfficeNumber: ['', Validators.required],
      pensionInsuranceRoundingMethod: ['', Validators.required],
      pensionInsuranceBusinessCategory: ['', Validators.required],
      // 介護保険
      careInsuranceTargetOffice: [null, Validators.required],
      // 雇用保険
      employmentInsuranceOfficeNumber: ['', Validators.required],
      employmentInsuranceLaborNumber: ['', Validators.required]
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
      healthInsuranceOfficeNumber: ins.healthInsurance?.officeNumber || '',
      healthInsuranceRoundingMethod: ins.healthInsurance?.roundingMethod || '',
      healthInsuranceCardFormat: ins.healthInsurance?.cardFormat || 'none',
      pensionInsuranceOfficeNumber: ins.pensionInsurance?.officeNumber || '',
      pensionInsuranceRoundingMethod: ins.pensionInsurance?.roundingMethod || '',
      pensionInsuranceBusinessCategory: ins.pensionInsurance?.businessCategory || '',
      careInsuranceTargetOffice: ins.careInsurance?.targetOffice !== undefined ? ins.careInsurance.targetOffice : null,
      employmentInsuranceOfficeNumber: ins.employmentInsurance?.officeNumber || '',
      employmentInsuranceLaborNumber: ins.employmentInsurance?.laborInsuranceNumber || ''
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
          officeNumber: formValue.healthInsuranceOfficeNumber?.trim() || undefined,
          roundingMethod: formValue.healthInsuranceRoundingMethod?.trim() || undefined,
          cardFormat: formValue.healthInsuranceCardFormat || 'none'
        },
        pensionInsurance: {
          officeNumber: formValue.pensionInsuranceOfficeNumber?.trim() || undefined,
          roundingMethod: formValue.pensionInsuranceRoundingMethod?.trim() || undefined,
          businessCategory: formValue.pensionInsuranceBusinessCategory?.trim() || undefined
        },
        careInsurance: {
          targetOffice: formValue.careInsuranceTargetOffice !== null ? formValue.careInsuranceTargetOffice : false
        },
        employmentInsurance: {
          officeNumber: formValue.employmentInsuranceOfficeNumber?.trim() || undefined,
          laborInsuranceNumber: formValue.employmentInsuranceLaborNumber?.trim() || undefined
        }
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
