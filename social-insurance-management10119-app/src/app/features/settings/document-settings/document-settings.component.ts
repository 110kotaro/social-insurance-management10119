import { Component, Input, OnInit, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Organization } from '../../../core/models/organization.model';
import { OrganizationService } from '../../../core/services/organization.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-document-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatSnackBarModule
  ],
  templateUrl: './document-settings.component.html',
  styleUrl: './document-settings.component.css'
})
export class DocumentSettingsComponent implements OnInit, OnChanges {
  @Input() organization: Organization | null = null;
  
  private organizationService = inject(OrganizationService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  documentSettings = {
    allowedFormats: [] as string[],
    maxFileSize: 10, // MB単位、デフォルト10MB
    retentionYears: 6 // 年単位、デフォルト6年
  };

  // ファイル形式の選択肢
  fileFormatOptions = [
    { value: 'pdf', label: 'PDF' },
    { value: 'jpg', label: 'JPG' },
    { value: 'png', label: 'PNG' },
    { value: 'gif', label: 'GIF' },
    { value: 'xls', label: 'Excel (XLS)' },
    { value: 'xlsx', label: 'Excel (XLSX)' },
    { value: 'doc', label: 'Word (DOC)' },
    { value: 'docx', label: 'Word (DOCX)' }
  ];

  isLoading = false;

  ngOnInit(): void {
    this.loadDocumentSettings();
  }

  ngOnChanges(): void {
    this.loadDocumentSettings();
  }

  loadDocumentSettings(): void {
    if (!this.organization?.documentSettings) {
      // デフォルト値を設定
      this.documentSettings = {
        allowedFormats: [],
        maxFileSize: 10,
        retentionYears: 6
      };
      return;
    }

    const settings = this.organization.documentSettings;
    this.documentSettings = {
      allowedFormats: settings.allowedFormats || [],
      maxFileSize: settings.maxFileSize || 10,
      retentionYears: settings.retentionYears || 6
    };
  }

  /**
   * ファイル形式のトグル
   */
  toggleFileFormat(format: string): void {
    const index = this.documentSettings.allowedFormats.indexOf(format);
    if (index >= 0) {
      this.documentSettings.allowedFormats.splice(index, 1);
    } else {
      this.documentSettings.allowedFormats.push(format);
    }
  }

  /**
   * 設定を保存
   */
  async saveDocumentSettings(): Promise<void> {
    if (!this.organization?.id) {
      this.snackBar.open('組織情報が見つかりません', '閉じる', { duration: 3000 });
      return;
    }

    this.isLoading = true;
    try {
      const updateData: Partial<Organization> = {
        documentSettings: {
          allowedFormats: this.documentSettings.allowedFormats,
          maxFileSize: this.documentSettings.maxFileSize,
          retentionYears: this.documentSettings.retentionYears
        }
      };

      await this.organizationService.updateOrganization(this.organization.id, updateData);
      this.snackBar.open('ドキュメント設定を保存しました', '閉じる', { duration: 3000 });
    } catch (error) {
      console.error('ドキュメント設定の保存に失敗しました:', error);
      this.snackBar.open('ドキュメント設定の保存に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }
}
