import { Component, Input, OnInit, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { Organization } from '../../../core/models/organization.model';
import { ApplicationType, AttachmentSetting, ApplicationFlowSettings } from '../../../core/models/application-flow.model';
import { ApplicationTypeEditDialogComponent } from './application-type-edit-dialog/application-type-edit-dialog.component';
import { AttachmentSettingEditDialogComponent } from './attachment-setting-edit-dialog/attachment-setting-edit-dialog.component';

@Component({
  selector: 'app-application-flow-settings',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatChipsModule,
    MatTooltipModule,
    MatSelectModule,
    FormsModule
  ],
  templateUrl: './application-flow-settings.component.html',
  styleUrl: './application-flow-settings.component.css'
})
export class ApplicationFlowSettingsComponent implements OnInit, OnChanges {
  @Input() organization: Organization | null = null;
  
  private authService = inject(AuthService);
  private organizationService = inject(OrganizationService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  applicationTypes: ApplicationType[] = [];
  attachmentSettings: AttachmentSetting[] = [];
  approvalRuleDescription = '管理者のいずれか一名の承認';
  
  internalApplicationTypes: ApplicationType[] = [];
  externalApplicationTypes: ApplicationType[] = [];
  
  internalDataSource = new MatTableDataSource<ApplicationType>([]);
  externalDataSource = new MatTableDataSource<ApplicationType>([]);
  attachmentDataSource = new MatTableDataSource<AttachmentSetting>([]);
  
  internalDisplayedColumns: string[] = ['name', 'enabled', 'actions'];
  externalDisplayedColumns: string[] = ['name', 'enabled', 'actions'];
  attachmentDisplayedColumns: string[] = ['applicationType', 'allowedFormats', 'maxFileSize', 'description', 'actions'];

  isLoading = false;
  selectedTabIndex = 0;

  ngOnInit(): void {
    this.loadApplicationFlowSettings();
  }

  ngOnChanges(): void {
    this.loadApplicationFlowSettings();
  }

  loadApplicationFlowSettings(): void {
    if (!this.organization?.applicationFlowSettings) {
      return;
    }

    const settings = this.organization.applicationFlowSettings;
    this.applicationTypes = settings.applicationTypes || [];
    this.attachmentSettings = settings.attachmentSettings || [];
    this.approvalRuleDescription = settings.approvalRule?.description || '管理者のいずれか一名の承認';

    // 内部申請種別：3種類のみ表示（DEPENDENT_CHANGE, NAME_CHANGE, ADDRESS_CHANGE）
    const allowedInternalCodes = ['DEPENDENT_CHANGE', 'NAME_CHANGE', 'ADDRESS_CHANGE'];
    this.internalApplicationTypes = this.applicationTypes.filter(type => 
      type.category === 'internal' && allowedInternalCodes.includes(type.code)
    );
    
    // 外部申請種別：8種類のみ表示
    const allowedExternalCodes = [
      'INSURANCE_ACQUISITION', 
      'INSURANCE_LOSS', 
      'DEPENDENT_CHANGE_EXTERNAL', 
      'REWARD_BASE', 
      'REWARD_CHANGE', 
      'ADDRESS_CHANGE_EXTERNAL', 
      'NAME_CHANGE_EXTERNAL', 
      'BONUS_PAYMENT'
    ];
    this.externalApplicationTypes = this.applicationTypes.filter(type => 
      type.category === 'external' && allowedExternalCodes.includes(type.code)
    );

    this.internalDataSource.data = this.internalApplicationTypes;
    this.externalDataSource.data = this.externalApplicationTypes;
    this.attachmentDataSource.data = this.attachmentSettings;
  }

  getApplicationTypeName(typeId: string): string {
    const type = this.applicationTypes.find(t => t.id === typeId);
    return type ? type.name : '';
  }

  openApplicationTypeEditDialog(type?: ApplicationType, category?: 'internal' | 'external'): void {
    const dialogRef = this.dialog.open(ApplicationTypeEditDialogComponent, {
      width: '600px',
      data: {
        applicationType: type || null,
        category: category || type?.category || 'internal',
        existingTypes: this.applicationTypes
      }
    });

    dialogRef.afterClosed().subscribe(async (result: ApplicationType | null) => {
      if (result) {
        if (type) {
          // 編集の場合
          const index = this.applicationTypes.findIndex(t => t.id === type.id);
          if (index >= 0) {
            this.applicationTypes[index] = result;
          }
        } else {
          // 新規追加の場合
          this.applicationTypes.push(result);
        }
        await this.saveApplicationFlowSettings();
        this.loadApplicationFlowSettings();
      }
    });
  }

  async deleteApplicationType(type: ApplicationType): Promise<void> {
    if (!type.isDeletable) {
      this.snackBar.open('この申請種別は削除できません', '閉じる', { duration: 3000 });
      return;
    }

    if (!confirm(`「${type.name}」を削除しますか？`)) {
      return;
    }

    try {
      // 関連する添付書類設定も削除
      this.attachmentSettings = this.attachmentSettings.filter(
        setting => setting.applicationTypeId !== type.id
      );

      // 申請種別を削除
      this.applicationTypes = this.applicationTypes.filter(t => t.id !== type.id);
      
      await this.saveApplicationFlowSettings();
      this.snackBar.open('申請種別を削除しました', '閉じる', { duration: 3000 });
      this.loadApplicationFlowSettings();
    } catch (error) {
      console.error('申請種別の削除に失敗しました:', error);
      this.snackBar.open('申請種別の削除に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  openAttachmentSettingEditDialog(setting?: AttachmentSetting): void {
    const dialogRef = this.dialog.open(AttachmentSettingEditDialogComponent, {
      width: '600px',
      data: {
        attachmentSetting: setting || null,
        applicationTypes: this.applicationTypes
      }
    });

    dialogRef.afterClosed().subscribe(async (result: AttachmentSetting | null) => {
      if (result) {
        if (setting) {
          // 編集の場合
          const index = this.attachmentSettings.findIndex(s => s.applicationTypeId === setting.applicationTypeId);
          if (index >= 0) {
            this.attachmentSettings[index] = result;
          }
        } else {
          // 新規追加の場合
          this.attachmentSettings.push(result);
        }
        await this.saveApplicationFlowSettings();
        this.loadApplicationFlowSettings();
      }
    });
  }

  async deleteAttachmentSetting(setting: AttachmentSetting): Promise<void> {
    if (!confirm('この添付書類設定を削除しますか？')) {
      return;
    }

    try {
      this.attachmentSettings = this.attachmentSettings.filter(s => s !== setting);
      await this.saveApplicationFlowSettings();
      this.snackBar.open('添付書類設定を削除しました', '閉じる', { duration: 3000 });
      this.loadApplicationFlowSettings();
    } catch (error) {
      console.error('添付書類設定の削除に失敗しました:', error);
      this.snackBar.open('添付書類設定の削除に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  async saveApplicationFlowSettings(): Promise<void> {
    if (!this.organization?.id) {
      return;
    }

    this.isLoading = true;
    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser?.organizationId) {
        this.snackBar.open('組織情報が取得できません', '閉じる', { duration: 3000 });
        return;
      }

      const updatedOrganization: Organization = {
        ...this.organization,
        applicationFlowSettings: {
          ...this.organization.applicationFlowSettings,
          applicationTypes: this.applicationTypes,
          approvalRule: {
            method: 'admin_any',
            description: this.approvalRuleDescription
          },
          attachmentSettings: this.attachmentSettings,
          notificationSettings: this.organization.applicationFlowSettings?.notificationSettings
        }
      };

      await this.organizationService.updateOrganization(this.organization.id, updatedOrganization);
      
      // 親コンポーネントの組織情報を更新
      if (this.organization) {
        Object.assign(this.organization, updatedOrganization);
      }

      this.snackBar.open('申請フロー設定を保存しました', '閉じる', { duration: 3000 });
    } catch (error) {
      console.error('申請フロー設定の保存に失敗しました:', error);
      this.snackBar.open('申請フロー設定の保存に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  formatFileSize(size?: number): string {
    if (!size) {
      return '制限なし';
    }
    return `${size}MB`;
  }

  formatAllowedFormats(formats?: string[]): string {
    if (!formats || formats.length === 0) {
      return 'すべての形式';
    }
    return formats.join(', ');
  }
}

