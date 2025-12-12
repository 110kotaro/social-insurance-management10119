import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
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
  selector: 'app-notification-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatSnackBarModule
  ],
  templateUrl: './notification-settings.component.html',
  styleUrl: './notification-settings.component.css'
})
export class NotificationSettingsComponent implements OnInit {
  @Input() organization: Organization | null = null;
  
  private fb = inject(FormBuilder);
  private organizationService = inject(OrganizationService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  
  notificationForm: FormGroup;
  isLoading = false;

  constructor() {
    this.notificationForm = this.fb.group({
      // 通知対象設定
      notifyApplicant: [true],
      notifyAdmin: [true],
      // 通知タイミング設定
      notifyOnSubmit: [true],
      notifyOnApprove: [true],
      notifyOnReturn: [true],
      notifyOnReject: [true],
      // 期限リマインダー設定
      adminDaysBeforeLegalDeadline: [7, [Validators.required, Validators.min(1)]],
      employeeDaysBeforeAdminDeadline: [3, [Validators.required, Validators.min(1)]],
      notifyOnOverdue: [true],
      notifyOnDeadlineDay: [true],
      notifyBeforeDeadline: [true]
    });
  }

  ngOnInit(): void {
    const notificationSettings = this.organization?.applicationFlowSettings?.notificationSettings;
    
    if (notificationSettings) {
      const reminderSettings = notificationSettings.reminderSettings;
      
      this.notificationForm.patchValue({
        // 通知対象設定
        notifyApplicant: notificationSettings.notifyApplicant ?? true,
        notifyAdmin: notificationSettings.notifyAdmin ?? true,
        // 通知タイミング設定
        notifyOnSubmit: notificationSettings.notifyOnSubmit ?? true,
        notifyOnApprove: notificationSettings.notifyOnApprove ?? true,
        notifyOnReturn: notificationSettings.notifyOnReturn ?? true,
        notifyOnReject: notificationSettings.notifyOnReject ?? true,
        // 期限リマインダー設定
        adminDaysBeforeLegalDeadline: reminderSettings?.adminDaysBeforeLegalDeadline ?? 7,
        employeeDaysBeforeAdminDeadline: reminderSettings?.employeeDaysBeforeAdminDeadline ?? 3,
        notifyOnOverdue: reminderSettings?.notifyOnOverdue ?? true,
        notifyOnDeadlineDay: reminderSettings?.notifyOnDeadlineDay ?? true,
        notifyBeforeDeadline: reminderSettings?.notifyBeforeDeadline ?? true
      });
    }
  }

  async saveNotificationSettings(): Promise<void> {
    if (!this.organization?.id || this.notificationForm.invalid) {
      return;
    }

    this.isLoading = true;
    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser?.organizationId) {
        this.snackBar.open('組織情報が取得できません', '閉じる', { duration: 3000 });
        return;
      }

      const formValue = this.notificationForm.value;

      // 組織情報を更新
      const updatedOrganization: Organization = {
        ...this.organization,
        applicationFlowSettings: {
          ...this.organization.applicationFlowSettings,
          notificationSettings: {
            ...this.organization.applicationFlowSettings?.notificationSettings,
            notifyApplicant: formValue.notifyApplicant,
            notifyAdmin: formValue.notifyAdmin,
            notifyOnSubmit: formValue.notifyOnSubmit,
            notifyOnApprove: formValue.notifyOnApprove,
            notifyOnReturn: formValue.notifyOnReturn,
            notifyOnReject: formValue.notifyOnReject,
            reminderSettings: {
              adminDaysBeforeLegalDeadline: formValue.adminDaysBeforeLegalDeadline,
              employeeDaysBeforeAdminDeadline: formValue.employeeDaysBeforeAdminDeadline,
              notifyOnOverdue: formValue.notifyOnOverdue,
              notifyOnDeadlineDay: formValue.notifyOnDeadlineDay,
              notifyBeforeDeadline: formValue.notifyBeforeDeadline
            }
          }
        }
      };

      if (updatedOrganization.id) {
        await this.organizationService.updateOrganization(updatedOrganization.id, updatedOrganization);
      }
      this.snackBar.open('通知設定を保存しました', '閉じる', { duration: 3000 });
    } catch (error) {
      console.error('通知設定の保存に失敗しました:', error);
      this.snackBar.open('通知設定の保存に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }
}

