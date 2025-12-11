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
  
  reminderForm: FormGroup;
  isLoading = false;

  constructor() {
    this.reminderForm = this.fb.group({
      adminDaysBeforeLegalDeadline: [7, [Validators.required, Validators.min(1)]],
      employeeDaysBeforeAdminDeadline: [3, [Validators.required, Validators.min(1)]],
      notifyOnOverdue: [true],
      notifyOnDeadlineDay: [true],
      notifyBeforeDeadline: [true]
    });
  }

  ngOnInit(): void {
    if (this.organization?.applicationFlowSettings?.notificationSettings?.reminderSettings) {
      const settings = this.organization.applicationFlowSettings.notificationSettings.reminderSettings;
      this.reminderForm.patchValue({
        adminDaysBeforeLegalDeadline: settings.adminDaysBeforeLegalDeadline ?? 7,
        employeeDaysBeforeAdminDeadline: settings.employeeDaysBeforeAdminDeadline ?? 3,
        notifyOnOverdue: settings.notifyOnOverdue ?? true,
        notifyOnDeadlineDay: settings.notifyOnDeadlineDay ?? true,
        notifyBeforeDeadline: settings.notifyBeforeDeadline ?? true
      });
    }
  }

  async saveReminderSettings(): Promise<void> {
    if (!this.organization?.id || this.reminderForm.invalid) {
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
      const updatedOrganization: Organization = {
        ...this.organization,
        applicationFlowSettings: {
          ...this.organization.applicationFlowSettings,
          notificationSettings: {
            ...this.organization.applicationFlowSettings?.notificationSettings,
            reminderSettings: {
              adminDaysBeforeLegalDeadline: this.reminderForm.value.adminDaysBeforeLegalDeadline,
              employeeDaysBeforeAdminDeadline: this.reminderForm.value.employeeDaysBeforeAdminDeadline,
              notifyOnOverdue: this.reminderForm.value.notifyOnOverdue,
              notifyOnDeadlineDay: this.reminderForm.value.notifyOnDeadlineDay,
              notifyBeforeDeadline: this.reminderForm.value.notifyBeforeDeadline
            }
          }
        }
      };

      if (updatedOrganization.id) {
        await this.organizationService.updateOrganization(updatedOrganization.id, updatedOrganization);
      }
      this.snackBar.open('リマインダー設定を保存しました', '閉じる', { duration: 3000 });
    } catch (error) {
      console.error('リマインダー設定の保存に失敗しました:', error);
      this.snackBar.open('リマインダー設定の保存に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }
}

