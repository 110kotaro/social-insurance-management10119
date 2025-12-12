import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth/auth.service';
import { OrganizationService } from '../../core/services/organization.service';
import { Organization } from '../../core/models/organization.model';
import { NotificationSettingsComponent } from './notification-settings/notification-settings.component';
import { OrganizationSettingsComponent } from './organization-settings/organization-settings.component';
import { InsuranceSettingsComponent } from './insurance-settings/insurance-settings.component';
import { ApplicationFlowSettingsComponent } from './application-flow-settings/application-flow-settings.component';
import { PermissionSettingsComponent } from './permission-settings/permission-settings.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatCardModule,
    MatIconModule,
    NotificationSettingsComponent,
    OrganizationSettingsComponent,
    InsuranceSettingsComponent,
    ApplicationFlowSettingsComponent,
    PermissionSettingsComponent
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent implements OnInit {
  private authService = inject(AuthService);
  private organizationService = inject(OrganizationService);
  
  organization: Organization | null = null;
  selectedTabIndex = 0;

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.organizationId) {
      this.loadOrganization(currentUser.organizationId);
    }
  }

  async loadOrganization(orgId: string): Promise<void> {
    try {
      this.organization = await this.organizationService.getOrganization(orgId);
    } catch (error) {
      console.error('組織情報の読み込みに失敗しました:', error);
    }
  }

  onTabChange(index: number): void {
    this.selectedTabIndex = index;
  }

  async onOrganizationUpdated(): Promise<void> {
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.organizationId) {
      await this.loadOrganization(currentUser.organizationId);
    }
  }
}

