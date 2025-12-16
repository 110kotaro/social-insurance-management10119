import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { OrganizationService } from '../../../core/services/organization.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Organization } from '../../../core/models/organization.model';

@Component({
  selector: 'app-organization-create',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: './organization-create.component.html',
  styleUrl: './organization-create.component.css'
})
export class OrganizationCreateComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private organizationService = inject(OrganizationService);
  private authService = inject(AuthService);

  organizationForm: FormGroup;
  isLoading = false;
  errorMessage = '';

  constructor() {
    // 組織作成フォーム（最小情報のみ）
    this.organizationForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      corporateNumber: [''],
      postalCode: ['', Validators.pattern(/^\d{3}-?\d{4}$/)],
      prefecture: [''],
      city: [''],
      street: [''],
      building: ['']
    });
  }

  ngOnInit(): void {
    // 新規登録時の会社名をデフォルト値として設定
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.displayName) {
      this.organizationForm.patchValue({
        name: currentUser.displayName
      });
    }

    // 既に組織が作成済みの場合はダッシュボードにリダイレクト
    if (currentUser?.organizationId) {
      this.router.navigate(['/dashboard']);
    }
  }

  async onSubmit(): Promise<void> {
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
        address: {
          postalCode: formValue.postalCode?.trim() || undefined,
          prefecture: formValue.prefecture?.trim() || '',
          city: formValue.city?.trim() || '',
          street: formValue.street?.trim() || '',
          building: formValue.building?.trim() || undefined
        },
        setupCompleted: false
      };

      const orgId = await this.organizationService.createOrganization(organization);

      // ユーザーのorganizationIdを更新
      await this.authService.updateUserOrganizationId(currentUser.uid, orgId);

      // ダッシュボードに遷移
      this.router.navigate(['/dashboard']);

    } catch (error: any) {
      this.errorMessage = error.message || '組織情報の保存に失敗しました';
    } finally {
      this.isLoading = false;
    }
  }
}

