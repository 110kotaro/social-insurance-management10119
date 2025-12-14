import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { DepartmentService } from '../../../core/services/department.service';
import { InsuranceRateTableService } from '../../../core/services/insurance-rate-table.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ApplicationService } from '../../../core/services/application.service';
import { CalculationService } from '../../../core/services/calculation.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { StandardRewardCalculationService } from '../../../core/services/standard-reward-calculation.service';
import { Organization } from '../../../core/models/organization.model';
import { Application, ApplicationStatus } from '../../../core/models/application.model';
import { MonthlyCalculation } from '../../../core/models/monthly-calculation.model';
import { BonusCalculation } from '../../../core/models/bonus-calculation.model';
import { Employee } from '../../../core/models/employee.model';
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
    MatCheckboxModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDividerModule
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
  private notificationService = inject(NotificationService);
  private applicationService = inject(ApplicationService);
  private calculationService = inject(CalculationService);
  private employeeService = inject(EmployeeService);
  private standardRewardCalculationService = inject(StandardRewardCalculationService);
  private snackBar = inject(MatSnackBar);
  
  currentUser = this.authService.getCurrentUser();
  organization: Organization | null = null;
  setupTasks: SetupTask[] = [];
  showSetupGuide = false;
  
  // ダッシュボードデータ
  isLoading = false;
  
  // 必須①：要対応サマリー
  pendingInternalApplicationsCount = 0;
  overdueOrNearDeadlineApplicationsCount = 0;
  unconfirmedCalculationsCount = 0;
  
  // 必須②：期限・リマインダー系
  recentDeadlineAlerts: Application[] = [];
  insuranceAcquisitionDeadlines: Application[] = [];
  hasMonthlyChangeTargets = false;
  
  // 必須③：最近の動き
  recentActivities: any[] = [];
  
  // 任意：今月の概況
  currentMonthInsuredCount = 0;
  currentMonthPremiumTotal = 0;
  
  private subscriptions = new Subscription();

  ngOnInit(): void {
    // 組織情報を取得
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.organizationId) {
      this.loadOrganization(currentUser.organizationId);
      // リマインダーをチェック（バックグラウンドで実行、エラーは無視）
      this.checkReminders(currentUser.organizationId).catch(error => {
        console.error('リマインダーのチェックに失敗しました:', error);
      });
      // ダッシュボードデータを読み込む
      this.loadDashboardData(currentUser.organizationId);
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

  /**
   * リマインダーをチェックして送信
   */
  private async checkReminders(organizationId: string, skipDuplicateCheck: boolean = false): Promise<void> {
    try {
      // 算定計算のリマインダーをチェック
      await this.notificationService.checkAndSendStandardRewardReminders(organizationId, skipDuplicateCheck);
      
      // 月変計算のリマインダーをチェック
      await this.notificationService.checkAndSendMonthlyChangeReminders(organizationId, skipDuplicateCheck);
      
      // 期限リマインダーをチェック
      await this.notificationService.checkAndSendDeadlineReminders(organizationId, skipDuplicateCheck);
      
      // 月次計算のリマインダーをチェック
      await this.notificationService.checkAndSendMonthlyCalculationReminders(organizationId, skipDuplicateCheck);
    } catch (error) {
      console.error('リマインダーのチェックに失敗しました:', error);
    }
  }

  /**
   * リマインダーを手動でチェック（開発・テスト用）
   */
  async checkRemindersManually(): Promise<void> {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      this.snackBar.open('組織情報が取得できません', '閉じる', { duration: 3000 });
      return;
    }

    try {
      this.snackBar.open('リマインダーをチェック中...', '閉じる', { duration: 2000 });
      // 手動送信時は重複チェックをスキップ
      await this.checkReminders(currentUser.organizationId, true);
      this.snackBar.open('リマインダーのチェックが完了しました', '閉じる', { duration: 3000 });
      // ダッシュボードデータを再読み込み
      this.loadDashboardData(currentUser.organizationId);
    } catch (error) {
      console.error('リマインダーのチェックに失敗しました:', error);
      this.snackBar.open('リマインダーのチェックに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * ダッシュボードデータを読み込む
   */
  private async loadDashboardData(organizationId: string): Promise<void> {
    this.isLoading = true;
    try {
      await Promise.all([
        this.loadPendingApplications(organizationId),
        this.loadOverdueApplications(organizationId),
        this.loadUnconfirmedCalculations(organizationId),
        this.loadDeadlineAlerts(organizationId),
        this.loadRecentActivities(organizationId),
        this.loadMonthlySummary(organizationId)
      ]);
    } catch (error) {
      console.error('ダッシュボードデータの読み込みに失敗しました:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 未承認の内部申請を読み込む
   */
  private async loadPendingApplications(organizationId: string): Promise<void> {
    try {
      const applications = await this.applicationService.getApplicationsByOrganization(organizationId, {
        category: 'internal'
      });
      
      // pending, pending_received, pending_not_received の申請をカウント
      this.pendingInternalApplicationsCount = applications.filter(app => 
        app.status === 'pending' || 
        app.status === 'pending_received' || 
        app.status === 'pending_not_received'
      ).length;
    } catch (error) {
      console.error('未承認申請の読み込みに失敗しました:', error);
    }
  }

  /**
   * 期限超過・期限間近の申請を読み込む
   */
  private async loadOverdueApplications(organizationId: string): Promise<void> {
    try {
      const applications = await this.applicationService.getApplicationsByOrganization(organizationId);
      const now = new Date();
      const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      
      let count = 0;
      const deadlineAlerts: Application[] = [];
      
      for (const app of applications) {
        if (!app.deadline) continue;
        
        const deadline = app.deadline instanceof Date 
          ? app.deadline 
          : (app.deadline as any).toDate ? (app.deadline as any).toDate() : null;
        
        if (!deadline) continue;
        
        // 期限超過または3日以内
        if (deadline <= threeDaysLater && 
            (app.status === 'pending' || app.status === 'pending_received' || app.status === 'pending_not_received')) {
          count++;
          if (deadlineAlerts.length < 5) {
            deadlineAlerts.push(app);
          }
        }
      }
      
      this.overdueOrNearDeadlineApplicationsCount = count;
      this.recentDeadlineAlerts = deadlineAlerts;
    } catch (error) {
      console.error('期限超過申請の読み込みに失敗しました:', error);
    }
  }

  /**
   * 計算未確定の保険料を読み込む
   */
  private async loadUnconfirmedCalculations(organizationId: string): Promise<void> {
    try {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      
      // 月次計算
      const monthlyCalculations = await this.calculationService.getCalculationsByMonth(
        organizationId,
        currentYear,
        currentMonth
      );
      
      // 賞与計算
      const bonusCalculations = await this.calculationService.getBonusCalculationsByMonth(
        organizationId,
        currentYear,
        currentMonth
      );
      
      // status が 'draft' の計算結果をカウント
      const unconfirmedMonthly = monthlyCalculations.filter(calc => calc.status === 'draft').length;
      const unconfirmedBonus = bonusCalculations.filter(calc => calc.status === 'draft').length;
      
      this.unconfirmedCalculationsCount = unconfirmedMonthly + unconfirmedBonus;
    } catch (error) {
      console.error('未確定計算の読み込みに失敗しました:', error);
    }
  }

  /**
   * 期限アラートを読み込む
   */
  private async loadDeadlineAlerts(organizationId: string): Promise<void> {
    try {
      const applications = await this.applicationService.getApplicationsByOrganization(organizationId);
      const now = new Date();
      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      // 被保険者資格取得届の期限を取得
      const insuranceAcquisitionApps: Application[] = [];
      
      for (const app of applications) {
        if (!app.deadline) continue;
        if (app.type !== 'INSURANCE_ACQUISITION') continue;
        
        const deadline = app.deadline instanceof Date 
          ? app.deadline 
          : (app.deadline as any).toDate ? (app.deadline as any).toDate() : null;
        
        if (!deadline) continue;
        
        // 7日以内の期限
        if (deadline <= sevenDaysLater && deadline >= now &&
            (app.status === 'pending' || app.status === 'pending_received' || app.status === 'pending_not_received')) {
          insuranceAcquisitionApps.push(app);
        }
      }
      
      this.insuranceAcquisitionDeadlines = insuranceAcquisitionApps.slice(0, 5);
      
      // 月額変更届対象者の有無をチェック
      const rewardChangeApps = applications.filter(app => 
        app.type === 'REWARD_CHANGE' &&
        (app.status === 'pending' || app.status === 'pending_received' || app.status === 'pending_not_received')
      );
      this.hasMonthlyChangeTargets = rewardChangeApps.length > 0;
    } catch (error) {
      console.error('期限アラートの読み込みに失敗しました:', error);
    }
  }

  /**
   * 最近の動きを読み込む
   */
  private async loadRecentActivities(organizationId: string): Promise<void> {
    try {
      const activities: any[] = [];
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      // 社員情報更新（changeHistoryから）
      const employees = await this.employeeService.getEmployeesByOrganization(organizationId);
      for (const emp of employees) {
        if (emp.changeHistory && emp.changeHistory.length > 0) {
          const recentChanges = emp.changeHistory.filter(change => {
            const changeDate = change.changedAt instanceof Date 
              ? change.changedAt 
              : (change.changedAt as any).toDate ? (change.changedAt as any).toDate() : null;
            return changeDate && changeDate >= sevenDaysAgo;
          });
          
          for (const change of recentChanges.slice(0, 3)) {
            activities.push({
              type: 'employee_update',
              message: `${emp.lastName} ${emp.firstName}さんの情報が更新されました`,
              date: change.changedAt,
              employeeId: emp.id
            });
          }
        }
      }
      
      // 標準報酬月額変更
      const standardRewardCalculations = await this.standardRewardCalculationService.getCalculationsByOrganization(organizationId);
      for (const calc of standardRewardCalculations.slice(0, 10)) {
        const calcDate = calc.calculatedAt instanceof Date 
          ? calc.calculatedAt 
          : (calc.calculatedAt as any).toDate ? (calc.calculatedAt as any).toDate() : null;
        
        if (calcDate && calcDate >= sevenDaysAgo) {
          activities.push({
            type: 'standard_reward_change',
            message: `${calc.calculationType === 'standard' ? '算定' : '月変'}計算が実行されました（${calc.targetYear}年対象）`,
            date: calcDate,
            calculationId: calc.id
          });
        }
      }
      
      // 保険料計算の確定
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      
      const monthlyCalculations = await this.calculationService.getCalculationsByMonth(
        organizationId,
        currentYear,
        currentMonth
      );
      
      const confirmedCalculations = monthlyCalculations.filter(calc => 
        (calc.status === 'confirmed' || calc.status === 'exported') &&
        calc.confirmedAt
      );
      
      for (const calc of confirmedCalculations.slice(0, 10)) {
        const confirmedDate = calc.confirmedAt instanceof Date 
          ? calc.confirmedAt 
          : (calc.confirmedAt as any).toDate ? (calc.confirmedAt as any).toDate() : null;
        
        if (confirmedDate && confirmedDate >= sevenDaysAgo) {
          activities.push({
            type: 'calculation_confirmed',
            message: `${calc.employeeName}さんの${currentYear}年${currentMonth}月の保険料計算が確定されました`,
            date: confirmedDate,
            calculationId: calc.id
          });
        }
      }
      
      // 日付でソート（新しい順）
      activities.sort((a, b) => {
        const dateA = a.date instanceof Date ? a.date : (a.date as any).toDate ? (a.date as any).toDate() : new Date(0);
        const dateB = b.date instanceof Date ? b.date : (b.date as any).toDate ? (b.date as any).toDate() : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      this.recentActivities = activities.slice(0, 10);
    } catch (error) {
      console.error('最近の動きの読み込みに失敗しました:', error);
    }
  }

  /**
   * 今月の概況を読み込む
   */
  private async loadMonthlySummary(organizationId: string): Promise<void> {
    try {
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      
      // 今月の被保険者数（在籍中の社員で標準報酬月額が設定されている社員）
      const employees = await this.employeeService.getEmployeesByOrganization(organizationId);
      const insuredEmployees = employees.filter(emp => 
        emp.status === 'active' && 
        emp.insuranceInfo?.standardReward
      );
      this.currentMonthInsuredCount = insuredEmployees.length;
      
      // 今月の保険料合計（確定済みの計算結果から）
      const calculations = await this.calculationService.getCalculationsByMonth(
        organizationId,
        currentYear,
        currentMonth
      );
      
      const confirmedCalculations = calculations.filter((calc: MonthlyCalculation) => 
        calc.status === 'confirmed' || calc.status === 'exported'
      );
      
      this.currentMonthPremiumTotal = confirmedCalculations.reduce((sum: number, calc: MonthlyCalculation) => 
        sum + (calc.totalPremium || 0), 0
      );
    } catch (error) {
      console.error('今月の概況の読み込みに失敗しました:', error);
    }
  }

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date | any): string {
    if (!date) return '';
    const d = date instanceof Date ? date : (date?.toDate ? date.toDate() : null);
    if (!d) return '';
    return d.toLocaleDateString('ja-JP');
  }

  /**
   * 申請一覧に遷移（フィルタ付き）
   */
  navigateToApplications(filter?: { status?: ApplicationStatus; category?: 'internal' | 'external' }): void {
    const queryParams: any = {};
    if (filter?.status) queryParams.status = filter.status;
    if (filter?.category) queryParams.category = filter.category;
    this.router.navigate(['/applications'], { queryParams });
  }

  /**
   * 計算一覧に遷移
   */
  navigateToCalculations(): void {
    this.router.navigate(['/calculations']);
  }

  /**
   * 申請詳細に遷移
   */
  navigateToApplicationDetail(applicationId: string): void {
    this.router.navigate(['/applications', applicationId]);
  }

  /**
   * 申請種別のラベルを取得
   */
  getApplicationTypeLabel(typeId: string): string {
    if (!this.organization?.applicationFlowSettings?.applicationTypes) {
      return typeId;
    }
    
    const applicationType = this.organization.applicationFlowSettings.applicationTypes.find(
      t => t.id === typeId || t.code === typeId
    );
    
    return applicationType?.name || typeId;
  }

  /**
   * アクティビティタイプのアイコンを取得
   */
  getActivityIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'employee_update': 'person',
      'standard_reward_change': 'assessment',
      'calculation_confirmed': 'check_circle'
    };
    return icons[type] || 'info';
  }
}

