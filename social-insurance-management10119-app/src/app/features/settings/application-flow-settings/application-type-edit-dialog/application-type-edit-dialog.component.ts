import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApplicationType } from '../../../../core/models/application-flow.model';
import { OrganizationService } from '../../../../core/services/organization.service';
import { AuthService } from '../../../../core/auth/auth.service';

export interface ApplicationTypeEditDialogData {
  applicationType: ApplicationType | null;
  category: 'internal' | 'external';
  existingTypes: ApplicationType[];
}

@Component({
  selector: 'app-application-type-edit-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatSelectModule,
    MatSnackBarModule
  ],
  templateUrl: './application-type-edit-dialog.component.html',
  styleUrl: './application-type-edit-dialog.component.css'
})
export class ApplicationTypeEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private organizationService = inject(OrganizationService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  applicationTypeForm: FormGroup;
  isEditMode = false;

  constructor(
    public dialogRef: MatDialogRef<ApplicationTypeEditDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ApplicationTypeEditDialogData
  ) {
    this.applicationTypeForm = this.fb.group({
      name: ['', [Validators.required]],
      code: ['', [Validators.required]],
      description: ['']
    });
  }

  ngOnInit(): void {
    if (this.data.applicationType) {
      this.isEditMode = true;
      const type = this.data.applicationType;
      this.applicationTypeForm.patchValue({
        name: type.name,
        code: type.code,
        enabled: type.enabled,
        description: type.description || ''
      });
      
      // 編集時はコードを変更不可にする（固定申請種別の場合）
      if (!this.data.applicationType.isCustom) {
        this.applicationTypeForm.get('code')?.disable();
      }
    }
  }

  async save(): Promise<void> {
    if (this.applicationTypeForm.invalid) {
      return;
    }

    // getRawValue()を使用してdisabledフィールドの値も取得
    const formValue = this.applicationTypeForm.getRawValue();
    
    // コードの重複チェック
    const codeExists = this.data.existingTypes.some(
      type => type.code === formValue.code && 
              (!this.isEditMode || type.id !== this.data.applicationType?.id)
    );
    
    if (codeExists) {
      this.snackBar.open('このコードは既に使用されています', '閉じる', { duration: 3000 });
      return;
    }

    const applicationType: ApplicationType = {
      id: this.data.applicationType?.id || this.generateId(),
      name: formValue.name,
      code: formValue.code,
      category: this.data.category,
      enabled: true, // UIから削除したため、常にtrueを設定
      isCustom: this.data.applicationType?.isCustom ?? (this.data.category === 'internal'),
      isDeletable: this.data.applicationType?.isDeletable ?? (this.data.category === 'internal'),
      description: formValue.description || undefined
    };

    this.dialogRef.close(applicationType);
  }

  private generateId(): string {
    return `${this.data.category}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}

