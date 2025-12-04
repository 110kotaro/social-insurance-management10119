import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { DepartmentService } from '../../../core/services/department.service';
import { InsuranceRateTableService } from '../../../core/services/insurance-rate-table.service';
import { Organization } from '../../../core/models/organization.model';
import { Subscription } from 'rxjs';

interface SetupTask {
  id: string;
  label: string;
  completed: boolean;
  route?: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatCheckboxModule
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  private organizationService = inject(OrganizationService);
  private departmentService = inject(DepartmentService);
  private insuranceRateTableService = inject(InsuranceRateTableService);
  
  currentUser = this.authService.getCurrentUser();
  organization: Organization | null = null;
  setupTasks: SetupTask[] = [];
  showSetupGuide = false;
  
  private subscriptions = new Subscription();

  ngOnInit(): void {
    // 組織情報を取得
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.organizationId) {
      this.loadOrganization(currentUser.organizationId);
    } else {
      // 組織が未作成の場合はセットアップガイドを表示しない
      this.showSetupGuide = false;
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  async loadOrganization(orgId: string): Promise<void> {
    try {
      console.log('[DEBUG] loadOrganization called with orgId:', orgId);
      this.organization = await this.organizationService.getOrganization(orgId);
      console.log('[DEBUG] organization loaded:', this.organization);
      
      if (this.organization) {
        // setupCompletedがtrueの場合はセットアップガイドを表示しない
        if (this.organization.setupCompleted) {
          this.showSetupGuide = false;
        } else {
          // まず各ステップの完了状態をチェック
          await this.initializeSetupTasks(orgId);
          // 未完了のステップがある場合はセットアップガイドを表示
          const hasIncompleteTasks = this.setupTasks.some(task => !task.completed);
          this.showSetupGuide = hasIncompleteTasks;
        }
      } else {
        console.log('[DEBUG] organization is null');
      }
    } catch (error) {
      console.error('Error loading organization:', error);
    }
  }

  async initializeSetupTasks(orgId: string): Promise<void> {
    console.log('[DEBUG] initializeSetupTasks called with orgId:', orgId);
    console.log('[DEBUG] this.organization in initializeSetupTasks:', this.organization);
    
    // 各ステップの完了状態をチェック
    const tasks: SetupTask[] = [
      { id: 'org-info', label: '組織情報の詳細入力', completed: false, route: '/setup' },
      { id: 'departments', label: '部署作成', completed: false, route: '/setup' },
      { id: 'insurance', label: '保険設定', completed: false, route: '/setup' },
      { id: 'rates', label: '料率インポート', completed: false, route: '/setup' },
      { id: 'flow', label: '申請フロー設定', completed: false, route: '/setup' },
      { id: 'documents', label: 'ドキュメント設定', completed: false, route: '/setup' },
      { id: 'confirm', label: '最終確認', completed: false, route: '/setup' }
    ];

    if (this.organization) {
      console.log('[DEBUG] Checking task completion status...');
      
      // ステップ1: 組織情報の詳細入力
      tasks[0].completed = !!(
        this.organization.name &&
        this.organization.address?.prefecture &&
        this.organization.address?.city &&
        this.organization.address?.street
      );
      console.log('[DEBUG] Step 1 (org-info) completed:', tasks[0].completed);

      // ステップ2: 部署作成
      try {
        const departments = await this.departmentService.getDepartmentsByOrganization(orgId);
        tasks[1].completed = departments.length > 0;
        console.log('[DEBUG] Step 2 (departments) completed:', tasks[1].completed, 'departments count:', departments.length);
      } catch (error) {
        console.error('Error checking departments:', error);
        tasks[1].completed = false;
      }

      // ステップ3: 保険設定
      tasks[2].completed = !!this.organization.insuranceSettings;
      console.log('[DEBUG] Step 3 (insurance) completed:', tasks[2].completed, 'insuranceSettings:', this.organization.insuranceSettings);

      // ステップ4: 料率インポート
      try {
        const rateTables = await this.insuranceRateTableService.getRateTablesByOrganization(orgId);
        tasks[3].completed = rateTables.length > 0;
        console.log('[DEBUG] Step 4 (rates) completed:', tasks[3].completed, 'rateTables count:', rateTables.length);
      } catch (error) {
        console.error('Error checking rate tables:', error);
        tasks[3].completed = false;
      }

      // ステップ5: 申請フロー設定
      tasks[4].completed = !!this.organization.applicationFlowSettings;
      console.log('[DEBUG] Step 5 (flow) completed:', tasks[4].completed, 'applicationFlowSettings:', this.organization.applicationFlowSettings);

      // ステップ6: ドキュメント設定
      tasks[5].completed = !!this.organization.documentSettings;
      console.log('[DEBUG] Step 6 (documents) completed:', tasks[5].completed, 'documentSettings:', this.organization.documentSettings);

      // ステップ7: 最終確認
      tasks[6].completed = this.organization.setupCompleted || false;
      console.log('[DEBUG] Step 7 (confirm) completed:', tasks[6].completed, 'setupCompleted:', this.organization.setupCompleted);
    } else {
      console.log('[DEBUG] this.organization is null in initializeSetupTasks');
    }

    console.log('[DEBUG] Final tasks array:', tasks);
    this.setupTasks = tasks;
    console.log('[DEBUG] this.setupTasks set to:', this.setupTasks);
  }

  navigateToSetup(): void {
    this.router.navigate(['/setup']);
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}

