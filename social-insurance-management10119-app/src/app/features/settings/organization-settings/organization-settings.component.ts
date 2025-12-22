import { Component, Input, Output, EventEmitter, OnInit, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Organization } from '../../../core/models/organization.model';
import { OrganizationService } from '../../../core/services/organization.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-organization-settings',
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
    MatSnackBarModule,
    MatTooltipModule,
    MatCheckboxModule
  ],
  templateUrl: './organization-settings.component.html',
  styleUrl: './organization-settings.component.css'
})
export class OrganizationSettingsComponent implements OnInit, OnChanges {
  @Input() organization: Organization | null = null;
  @Output() organizationUpdated = new EventEmitter<void>();
  
  private fb = inject(FormBuilder);
  private organizationService = inject(OrganizationService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  
  organizationForm: FormGroup;
  isLoading = false;
  isOwner = false;

  // 都道府県リスト
  prefectures = [
    '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
    '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
    '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
    '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
    '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
  ];

  constructor() {
    this.organizationForm = this.fb.group({
      name: ['', [Validators.required]],
      corporateNumber: [''],
      // officeSymbol: [''], // 削除：事業所整理記号は保険情報の健康保険に移動
      // officeNumber: [''], // 削除：事業所番号は保険情報の健康保険・厚生年金に移動
      postalCode: ['', [Validators.required, Validators.pattern(/^\d{3}-?\d{4}$/)]],
      prefecture: ['', [Validators.required]],
      city: ['', [Validators.required]],
      street: ['', [Validators.required]],
      building: [''],
      phoneNumber: [''],
      ownerName: [''], // 事業主氏名（修正17）
      email: ['', [Validators.email]],
      industry: [''],
      leaveInsuranceCollectionMethod: ['postpaid'] // デフォルト: 後払い
    });
  }

  ngOnInit(): void {
    // 権限チェック
    const currentUser = this.authService.getCurrentUser();
    this.isOwner = currentUser?.role === 'owner';
    
    // 管理者の場合はフォームを無効化
    if (!this.isOwner) {
      this.organizationForm.disable();
    }
    
    if (this.organization) {
      this.loadOrganizationData();
    }
  }

  ngOnChanges(): void {
    // 権限チェック
    const currentUser = this.authService.getCurrentUser();
    this.isOwner = currentUser?.role === 'owner';
    
    // 管理者の場合はフォームを無効化
    if (!this.isOwner) {
      this.organizationForm.disable();
    } else {
      this.organizationForm.enable();
    }
    
    if (this.organization) {
      this.loadOrganizationData();
    }
  }

  loadOrganizationData(): void {
    if (!this.organization) {
      return;
    }

    this.organizationForm.patchValue({
      name: this.organization.name || '',
      corporateNumber: this.organization.corporateNumber || '',
      // officeSymbol: this.organization.officeSymbol || '', // 削除：事業所整理記号は保険情報の健康保険に移動
      // officeNumber: this.organization.officeNumber || '', // 削除：事業所番号は保険情報の健康保険・厚生年金に移動
      postalCode: this.organization.address?.postalCode || '',
      prefecture: this.organization.address?.prefecture || '',
      city: this.organization.address?.city || '',
      street: this.organization.address?.street || '',
      building: this.organization.address?.building || '',
      phoneNumber: this.organization.phoneNumber || '',
      ownerName: this.organization.ownerName || '', // 事業主氏名（修正17）
      email: this.organization.email || '',
      industry: this.organization.industry || '',
      payrollDate: this.organization.payrollDate || null,
      monthlyCalculationTargetMonthNext: this.organization.monthlyCalculationTargetMonth === 'next',
      leaveInsuranceCollectionMethod: this.organization.leaveInsuranceCollectionMethod || 'postpaid'
    });
  }

  async saveOrganizationSettings(): Promise<void> {
    // 権限チェック（二重チェック）
    if (!this.isOwner) {
      this.snackBar.open('組織情報の編集はオーナー権限のみ可能です', '閉じる', { duration: 3000 });
      return;
    }
    
    if (!this.organization?.id || this.organizationForm.invalid) {
      return;
    }

    this.isLoading = true;
    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser?.organizationId) {
        this.snackBar.open('組織情報が取得できません', '閉じる', { duration: 3000 });
        return;
      }

      // 組織情報を更新
      const formValue = this.organizationForm.value;
      const updates: Partial<Organization> = {
        name: formValue.name,
        corporateNumber: formValue.corporateNumber?.trim() || undefined,
        // officeSymbol: formValue.officeSymbol?.trim() || undefined, // 削除：事業所整理記号は保険情報の健康保険に移動
        // officeNumber: formValue.officeNumber?.trim() || undefined, // 削除：事業所番号は保険情報の健康保険・厚生年金に移動
        address: {
          postalCode: formValue.postalCode?.trim() || undefined,
          prefecture: formValue.prefecture,
          city: formValue.city,
          street: formValue.street,
          building: formValue.building?.trim() || undefined
        },
        phoneNumber: formValue.phoneNumber?.trim() || undefined,
        ownerName: formValue.ownerName?.trim() || undefined, // 事業主氏名（修正17）
        email: formValue.email?.trim() || undefined,
        industry: formValue.industry?.trim() || undefined,
        leaveInsuranceCollectionMethod: formValue.leaveInsuranceCollectionMethod || 'postpaid'
      };

      await this.organizationService.updateOrganization(this.organization.id, updates);
      
      // 親コンポーネントの組織情報を更新
      if (this.organization) {
        Object.assign(this.organization, updates);
      }

      // フォームを再読み込み（チェックボックスの状態を反映）
      this.loadOrganizationData();

      this.snackBar.open('組織設定を保存しました', '閉じる', { duration: 3000 });
      
      // 親コンポーネントに更新を通知
      this.organizationUpdated.emit();
    } catch (error) {
      console.error('組織設定の保存に失敗しました:', error);
      this.snackBar.open('組織設定の保存に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }
}

