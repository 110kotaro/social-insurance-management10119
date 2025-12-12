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
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Organization } from '../../../core/models/organization.model';
import { OrganizationService } from '../../../core/services/organization.service';
import { AuthService } from '../../../core/auth/auth.service';
import { environment } from '../../../../environments/environment';

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
    MatProgressBarModule,
    MatTooltipModule
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
  private storage = inject(Storage);
  private snackBar = inject(MatSnackBar);
  
  organizationForm: FormGroup;
  logoFile: File | null = null;
  logoPreviewUrl: string | null = null;
  isUploadingLogo = false;
  isLoading = false;

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

  // 給与支払日の選択肢（1-31日）
  payrollDates = Array.from({ length: 31 }, (_, i) => i + 1);

  constructor() {
    this.organizationForm = this.fb.group({
      name: ['', [Validators.required]],
      corporateNumber: [''],
      officeNumber: [''],
      postalCode: ['', [Validators.pattern(/^\d{3}-?\d{4}$/)]],
      prefecture: ['', [Validators.required]],
      city: ['', [Validators.required]],
      street: ['', [Validators.required]],
      building: [''],
      phoneNumber: [''],
      email: ['', [Validators.email]],
      industry: [''],
      payrollDate: [null, [Validators.min(1), Validators.max(31)]]
    });
  }

  ngOnInit(): void {
    if (this.organization) {
      this.loadOrganizationData();
    }
  }

  ngOnChanges(): void {
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
      officeNumber: this.organization.officeNumber || '',
      postalCode: this.organization.address?.postalCode || '',
      prefecture: this.organization.address?.prefecture || '',
      city: this.organization.address?.city || '',
      street: this.organization.address?.street || '',
      building: this.organization.address?.building || '',
      phoneNumber: this.organization.phoneNumber || '',
      email: this.organization.email || '',
      industry: this.organization.industry || '',
      payrollDate: this.organization.payrollDate || null
    });

    // ロゴのプレビューURLを設定
    if (this.organization.logoUrl) {
      this.logoPreviewUrl = this.organization.logoUrl;
    }
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      
      // ファイルタイプのチェック（画像のみ）
      if (!file.type.startsWith('image/')) {
        this.snackBar.open('画像ファイルを選択してください', '閉じる', { duration: 3000 });
        return;
      }

      // ファイルサイズのチェック（5MB以下）
      if (file.size > 5 * 1024 * 1024) {
        this.snackBar.open('ファイルサイズは5MB以下にしてください', '閉じる', { duration: 3000 });
        return;
      }

      this.logoFile = file;

      // プレビュー画像を生成
      const reader = new FileReader();
      reader.onload = (e) => {
        this.logoPreviewUrl = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  async uploadLogo(): Promise<string | null> {
    if (!this.logoFile || !this.organization?.id) {
      return null;
    }

    this.isUploadingLogo = true;
    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser?.organizationId) {
        throw new Error('組織情報が取得できません');
      }

      // 古いロゴを削除（存在する場合）
      if (this.organization.logoUrl) {
        try {
          const oldLogoRef = ref(this.storage, this.organization.logoUrl);
          await deleteObject(oldLogoRef);
        } catch (error) {
          // 削除に失敗しても続行（ロゴが存在しない可能性がある）
          console.warn('古いロゴの削除に失敗しました:', error);
        }
      }

      // 新しいロゴをアップロード
      const fileExtension = this.logoFile.name.split('.').pop();
      const fileName = `logo_${Date.now()}.${fileExtension}`;
      const filePath = `${environment.storagePrefix}organizations/${currentUser.organizationId}/logo/${fileName}`;
      const fileRef = ref(this.storage, filePath);
      
      await uploadBytes(fileRef, this.logoFile);
      const downloadURL = await getDownloadURL(fileRef);

      return downloadURL;
    } catch (error) {
      console.error('ロゴのアップロードに失敗しました:', error);
      this.snackBar.open('ロゴのアップロードに失敗しました', '閉じる', { duration: 3000 });
      return null;
    } finally {
      this.isUploadingLogo = false;
    }
  }

  async saveOrganizationSettings(): Promise<void> {
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

      // ロゴをアップロード（選択されている場合）
      let logoUrl = this.organization.logoUrl;
      if (this.logoFile) {
        const uploadedLogoUrl = await this.uploadLogo();
        if (uploadedLogoUrl) {
          logoUrl = uploadedLogoUrl;
        }
      }

      // 組織情報を更新
      const formValue = this.organizationForm.value;
      const updates: Partial<Organization> = {
        name: formValue.name,
        corporateNumber: formValue.corporateNumber?.trim() || undefined,
        officeNumber: formValue.officeNumber?.trim() || undefined,
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
        logoUrl: logoUrl,
        payrollDate: formValue.payrollDate || undefined
      };

      await this.organizationService.updateOrganization(this.organization.id, updates);
      
      // 親コンポーネントの組織情報を更新
      if (this.organization) {
        Object.assign(this.organization, updates);
      }

      this.snackBar.open('組織設定を保存しました', '閉じる', { duration: 3000 });
      
      // 親コンポーネントに更新を通知
      this.organizationUpdated.emit();
      
      // ロゴファイルをリセット
      this.logoFile = null;
    } catch (error) {
      console.error('組織設定の保存に失敗しました:', error);
      this.snackBar.open('組織設定の保存に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  removeLogo(): void {
    this.logoFile = null;
    this.logoPreviewUrl = null;
  }
}

