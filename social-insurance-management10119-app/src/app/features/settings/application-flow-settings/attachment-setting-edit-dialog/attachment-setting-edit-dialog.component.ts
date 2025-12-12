import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AttachmentSetting, ApplicationType } from '../../../../core/models/application-flow.model';

export interface AttachmentSettingEditDialogData {
  attachmentSetting: AttachmentSetting | null;
  applicationTypes: ApplicationType[];
}

@Component({
  selector: 'app-attachment-setting-edit-dialog',
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
    MatChipsModule,
    MatSnackBarModule
  ],
  templateUrl: './attachment-setting-edit-dialog.component.html',
  styleUrl: './attachment-setting-edit-dialog.component.css'
})
export class AttachmentSettingEditDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  attachmentSettingForm: FormGroup;
  isEditMode = false;

  // ファイル形式の選択肢
  fileFormats = [
    { value: 'pdf', label: 'PDF' },
    { value: 'jpg', label: 'JPG' },
    { value: 'jpeg', label: 'JPEG' },
    { value: 'png', label: 'PNG' },
    { value: 'xlsx', label: 'Excel (.xlsx)' },
    { value: 'xls', label: 'Excel (.xls)' },
    { value: 'docx', label: 'Word (.docx)' },
    { value: 'doc', label: 'Word (.doc)' }
  ];

  constructor(
    public dialogRef: MatDialogRef<AttachmentSettingEditDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AttachmentSettingEditDialogData
  ) {
    this.attachmentSettingForm = this.fb.group({
      applicationTypeId: ['', [Validators.required]],
      allowedFormats: [[]],
      maxFileSize: [null],
      description: ['']
    });
  }

  ngOnInit(): void {
    if (this.data.attachmentSetting) {
      this.isEditMode = true;
      const setting = this.data.attachmentSetting;
      this.attachmentSettingForm.patchValue({
        applicationTypeId: setting.applicationTypeId,
        allowedFormats: setting.allowedFormats || [],
        maxFileSize: setting.maxFileSize || null,
        description: setting.description || ''
      });
    }
  }

  toggleFileFormat(format: string): void {
    const currentFormats = this.attachmentSettingForm.value.allowedFormats || [];
    const index = currentFormats.indexOf(format);
    
    if (index >= 0) {
      currentFormats.splice(index, 1);
    } else {
      currentFormats.push(format);
    }
    
    this.attachmentSettingForm.patchValue({ allowedFormats: currentFormats });
  }

  isFormatSelected(format: string): boolean {
    const currentFormats = this.attachmentSettingForm.value.allowedFormats || [];
    return currentFormats.includes(format);
  }

  save(): void {
    if (this.attachmentSettingForm.invalid) {
      return;
    }

    const formValue = this.attachmentSettingForm.value;
    const attachmentSetting: AttachmentSetting = {
      applicationTypeId: formValue.applicationTypeId,
      allowedFormats: formValue.allowedFormats && formValue.allowedFormats.length > 0 
        ? formValue.allowedFormats 
        : undefined,
      maxFileSize: formValue.maxFileSize || undefined,
      description: formValue.description || undefined
    };

    this.dialogRef.close(attachmentSetting);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}

