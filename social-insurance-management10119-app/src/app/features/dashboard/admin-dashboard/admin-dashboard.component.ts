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
import { ModeService } from '../../../core/services/mode.service';
import { Organization } from '../../../core/models/organization.model';
import { Application, ApplicationStatus } from '../../../core/models/application.model';
import { MonthlyCalculation } from '../../../core/models/monthly-calculation.model';
import { BonusCalculation } from '../../../core/models/bonus-calculation.model';
import { Employee } from '../../../core/models/employee.model';
import { Subscription } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';

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
  private modeService = inject(ModeService);
  private snackBar = inject(MatSnackBar);
  
  currentUser = this.authService.getCurrentUser();
  organization: Organization | null = null;
  setupTasks: SetupTask[] = [];
  showSetupGuide = false;
  
  // モード判定
  isAdminMode = true;
  
  // ダッシュボードデータ
  isLoading = false;
  
  // 【修正21】社員用ダッシュボードデータ
  myApplicationsByType: Array<{
    typeId: string;
    typeName: string;
    statuses: Array<{ status: ApplicationStatus; statusLabel: string; count: number; applications: Application[] }>;
  }> = [];
  internalApplicationTypes: Array<{ id: string; name: string; code: string }> = [];
  
  // 必須①：要対応サマリー
  pendingInternalApplicationsCount = 0;
  overdueOrNearDeadlineApplicationsCount = 0;
  unconfirmedCalculationsCount = 0;
  unsubmittedApplicationsByType: Array<{ typeId: string; typeName: string; count: number }> = [];
  overdueApplicationsByType: Array<{ typeId: string; typeName: string; overdueCount: number; nearDeadlineCount: number }> = [];
  
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

  async ngOnInit(): Promise<void> {
    // モードを取得
    this.isAdminMode = this.modeService.getIsAdminMode();
    
    // モード変更を監視
    const modeSub = this.modeService.isAdminMode$.subscribe(async (isAdminMode) => {
      this.isAdminMode = isAdminMode;
      // モード変更時にデータを再読み込み
      const currentUser = this.authService.getCurrentUser();
      if (currentUser?.organizationId) {
        // 組織情報を再読み込みしてからダッシュボードデータを読み込む
        await this.loadOrganization(currentUser.organizationId);
        this.loadDashboardData(currentUser.organizationId);
      }
    });
    this.subscriptions.add(modeSub);
    
    // 組織情報を取得
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.organizationId) {
      // 【修正21】組織情報の読み込み完了を待ってからダッシュボードデータを読み込む
      await this.loadOrganization(currentUser.organizationId);
      // 【修正20】通知機能を削除するためコメントアウト
      // リマインダーをチェック（バックグラウンドで実行、エラーは無視）
      // this.checkReminders(currentUser.organizationId).catch(error => {
      //   console.error('リマインダーのチェックに失敗しました:', error);
      // });
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
        this.organization.address?.postalCode &&
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
   * 【修正20】通知機能を削除するためコメントアウト
   */
  private async checkReminders(organizationId: string, skipDuplicateCheck: boolean = false): Promise<void> {
    // 【修正20】通知機能を削除するためコメントアウト
    return;
    /*
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
    */
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
    console.log('[DEBUG] loadDashboardData called', { 
      organizationId, 
      isAdminMode: this.isAdminMode,
      hasOrganization: !!this.organization,
      organizationIdMatch: this.organization?.id === organizationId
    });
    this.isLoading = true;
    try {
      if (this.isAdminMode) {
        // 管理者モード
        console.log('[DEBUG] loadDashboardData - 管理者モードで実行');
      await Promise.all([
        this.loadPendingApplications(organizationId),
        this.loadOverdueApplications(organizationId),
        this.loadUnconfirmedCalculations(organizationId),
        this.loadDeadlineAlerts(organizationId),
        this.loadRecentActivities(organizationId),
        this.loadMonthlySummary(organizationId),
        this.loadUnsubmittedApplications(organizationId) // 【修正20】未提出申請を読み込む
      ]);
      } else {
        // 社員モード
        console.log('[DEBUG] loadDashboardData - 社員モードで実行');
        await Promise.all([
          this.loadMyApplications(organizationId),
          this.loadInternalApplicationTypes(organizationId)
        ]);
      }
    } catch (error) {
      console.error('ダッシュボードデータの読み込みに失敗しました:', error);
    } finally {
      this.isLoading = false;
      console.log('[DEBUG] loadDashboardData completed');
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
   * 申請から全期限を取得（各被保険者ごとまたは申請全体）
   */
  private getApplicationDeadlines(app: Application): Date[] {
    const deadlines: Date[] = [];
    const data = app.data || {};
    
    // 資格取得届・資格喪失届・賞与支払届：各被保険者ごとの期限
    if (data['insuredPersons'] && Array.isArray(data['insuredPersons'])) {
      for (const person of data['insuredPersons']) {
        if (!person.deadline) continue;
        
        const deadline = person.deadline instanceof Date 
          ? person.deadline 
          : (person.deadline instanceof Timestamp 
            ? person.deadline.toDate() 
            : (person.deadline as any).toDate 
              ? (person.deadline as any).toDate() 
              : new Date(person.deadline));
        
        if (deadline && !isNaN(deadline.getTime())) {
          deadlines.push(deadline);
        }
      }
    }
    // 報酬月額算定基礎届・報酬月額変更届：rewardBasePersons/rewardChangePersons配列から取得
    else if ((data['rewardBasePersons'] || data['rewardChangePersons']) && Array.isArray(data['rewardBasePersons'] || data['rewardChangePersons'])) {
      const persons = data['rewardBasePersons'] || data['rewardChangePersons'];
      for (const person of persons) {
        if (!person.deadline) continue;
        
        const deadline = person.deadline instanceof Date 
          ? person.deadline 
          : (person.deadline instanceof Timestamp 
            ? person.deadline.toDate() 
            : (person.deadline as any).toDate 
              ? (person.deadline as any).toDate() 
              : new Date(person.deadline));
        
        if (deadline && !isNaN(deadline.getTime())) {
          deadlines.push(deadline);
        }
      }
    }
    // その他：申請全体の期限を使用
    else if (app.deadline) {
      const deadline = app.deadline instanceof Date 
        ? app.deadline 
        : (app.deadline instanceof Timestamp 
          ? app.deadline.toDate() 
          : (app.deadline as any).toDate 
            ? (app.deadline as any).toDate() 
            : new Date(app.deadline));
      
      if (deadline && !isNaN(deadline.getTime())) {
        deadlines.push(deadline);
      }
    }
    
    return deadlines;
  }

  /**
   * 期限超過・期限間近の申請を読み込む
   * 【修正20】申請種別ごとに期限超過件数と期限5日以内件数を集計
   * 各被保険者ごとの期限を考慮
   */
  private async loadOverdueApplications(organizationId: string): Promise<void> {
    try {
      const applications = await this.applicationService.getApplicationsByOrganization(organizationId);
      const now = new Date();
      const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      
      // 申請種別ごとの集計用Map
      const overdueByType = new Map<string, { overdueCount: number; nearDeadlineCount: number }>();
      const deadlineAlerts: Application[] = [];
      
      for (const app of applications) {
        // 申請から全期限を取得（各被保険者ごとまたは申請全体）
        const deadlines = this.getApplicationDeadlines(app);
        
        if (deadlines.length === 0) continue;
        
        // 申請ありのものだけをチェック（draft, created, pending）
        if (app.status === 'draft' || app.status === 'created' || app.status === 'pending') {
          const typeId = app.type;
          
          if (!overdueByType.has(typeId)) {
            overdueByType.set(typeId, { overdueCount: 0, nearDeadlineCount: 0 });
          }
          
          const counts = overdueByType.get(typeId)!;
          let hasOverdue = false;
          let hasNearDeadline = false;
          
          // 各被保険者の期限をチェック
          for (const deadline of deadlines) {
          if (deadline < now) {
            // 期限超過
            counts.overdueCount++;
              hasOverdue = true;
          } else if (deadline <= fiveDaysLater) {
            // 期限5日以内
            counts.nearDeadlineCount++;
              hasNearDeadline = true;
            }
          }
          
          // 期限アラートに追加（最も早い期限を使用）
          if ((hasOverdue || hasNearDeadline) && deadlineAlerts.length < 5) {
            const earliestDeadline = deadlines.sort((a, b) => a.getTime() - b.getTime())[0];
            // 期限情報を一時的にapplication.deadlineに設定して表示用に使用
            const alertApp = { ...app, deadline: earliestDeadline };
            deadlineAlerts.push(alertApp);
          }
        }
      }
      
      // 申請種別ごとの配列に変換
      this.overdueApplicationsByType = Array.from(overdueByType.entries())
        .filter(([_, counts]) => counts.overdueCount > 0 || counts.nearDeadlineCount > 0)
        .map(([typeId, counts]) => {
          // 申請種別名を取得
          let typeName = typeId;
          if (this.organization?.applicationFlowSettings?.applicationTypes) {
            const applicationType = this.organization.applicationFlowSettings.applicationTypes.find(
              t => t.id === typeId || t.code === typeId
            );
            typeName = applicationType?.name || typeId;
          }
          
          return {
            typeId,
            typeName,
            overdueCount: counts.overdueCount,
            nearDeadlineCount: counts.nearDeadlineCount
          };
        });
      
      // 既存の互換性のため（必要に応じて削除可能）
      const totalOverdueCount = Array.from(overdueByType.values())
        .reduce((sum, counts) => sum + counts.overdueCount, 0);
      const totalNearDeadlineCount = Array.from(overdueByType.values())
        .reduce((sum, counts) => sum + counts.nearDeadlineCount, 0);
      this.overdueOrNearDeadlineApplicationsCount = totalOverdueCount + totalNearDeadlineCount;
      
      this.recentDeadlineAlerts = deadlineAlerts;
    } catch (error) {
      console.error('期限超過申請の読み込みに失敗しました:', error);
    }
  }

  /**
   * 【修正20】未提出申請（申請種別ごと）を読み込む
   */
  private async loadUnsubmittedApplications(organizationId: string): Promise<void> {
    try {
      const applications = await this.applicationService.getApplicationsByOrganization(organizationId);
      const organization = await this.organizationService.getOrganization(organizationId);
      
      if (!organization?.applicationFlowSettings?.applicationTypes) {
        return;
      }
      
      const applicationTypes = organization.applicationFlowSettings.applicationTypes;
      
      // 未提出申請（draft, created, returned）を申請種別ごとに集計
      const unsubmittedByType = new Map<string, { typeId: string; typeName: string; count: number }>();
      
      for (const app of applications) {
        // 管理者モードの場合、内部申請のdraft/created状態は除外（申請一覧と同じロジック）
        // 送信前の申請は管理者には見せない
        if (app.category === 'internal' && (app.status === 'draft' || app.status === 'created')) {
          continue;
        }
        
        // 未提出の状態のみをチェック（returnedは含める）
        if (app.status === 'draft' || app.status === 'created' || app.status === 'returned') {
          const applicationType = applicationTypes.find(type => type.id === app.type);
          if (applicationType) {
            const existing = unsubmittedByType.get(app.type);
            if (existing) {
              existing.count++;
            } else {
              unsubmittedByType.set(app.type, {
                typeId: app.type,
                typeName: applicationType.name,
                count: 1
              });
            }
          }
        }
      }
      
      this.unsubmittedApplicationsByType = Array.from(unsubmittedByType.values());
    } catch (error) {
      console.error('未提出申請の読み込みに失敗しました:', error);
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
   * 各被保険者ごとの期限を考慮
   */
  private async loadDeadlineAlerts(organizationId: string): Promise<void> {
    try {
      const applications = await this.applicationService.getApplicationsByOrganization(organizationId);
      const now = new Date();
      const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      // 被保険者資格取得届の期限を取得
      const insuranceAcquisitionApps: Application[] = [];
      
      for (const app of applications) {
        if (app.type !== 'INSURANCE_ACQUISITION') continue;
        
        // 申請から全期限を取得（各被保険者ごとまたは申請全体）
        const deadlines = this.getApplicationDeadlines(app);
        
        if (deadlines.length === 0) continue;
        
        // 最も早い期限を取得
        const earliestDeadline = deadlines.sort((a, b) => a.getTime() - b.getTime())[0];
        
        // 7日以内の期限
        if (earliestDeadline <= sevenDaysLater && earliestDeadline >= now &&
            (app.status === 'pending' || app.status === 'pending_received' || app.status === 'pending_not_received')) {
          // 期限情報を一時的にapplication.deadlineに設定して表示用に使用
          const alertApp = { ...app, deadline: earliestDeadline };
          insuranceAcquisitionApps.push(alertApp);
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
      
      // 申請ステータス変更
      const applications = await this.applicationService.getApplicationsByOrganization(organizationId);
      const employeesMap = new Map<string, Employee>();
      
      // 申請に含まれるすべての社員IDを収集
      const employeeIds = [...new Set(applications.map(app => app.employeeId).filter((id): id is string => id !== undefined))];
      
      // 社員情報を一括取得してマップに格納
      for (const employeeId of employeeIds) {
        try {
          const employee = await this.employeeService.getEmployee(employeeId);
          if (employee) {
            employeesMap.set(employeeId, employee);
          }
        } catch (error) {
          console.error(`社員情報の取得に失敗しました (ID: ${employeeId}):`, error);
        }
      }
      
      for (const app of applications) {
        if (app.history && app.history.length > 0) {
          const employee = app.employeeId ? employeesMap.get(app.employeeId) : undefined;
          const employeeName = employee ? `${employee.lastName} ${employee.firstName}` : '不明';
          const applicationTypeName = this.getApplicationTypeLabel(app.type);
          
          // ステータス変更に関連する履歴を抽出
          const statusChangeHistories = app.history.filter(hist => {
            const histDate = hist.createdAt instanceof Date 
              ? hist.createdAt 
              : (hist.createdAt as any).toDate ? (hist.createdAt as any).toDate() : null;
            
            if (!histDate || histDate < sevenDaysAgo) {
              return false;
            }
            
            // ステータス変更に関連するactionをチェック
            return hist.action === 'submit' || 
                   hist.action === 'approve' || 
                   hist.action === 'reject' || 
                   hist.action === 'return' || 
                   hist.action === 'withdraw' ||
                   hist.action === 'status_change';
          });
          
          for (const hist of statusChangeHistories.slice(0, 3)) {
            const histDate = hist.createdAt instanceof Date 
              ? hist.createdAt 
              : (hist.createdAt as any).toDate ? (hist.createdAt as any).toDate() : null;
            
            if (!histDate) continue;
            
            // actionからステータスラベルを取得
            let statusLabel = '';
            switch (hist.action) {
              case 'submit':
                statusLabel = '送信';
                break;
              case 'approve':
                statusLabel = '承認';
                break;
              case 'reject':
                statusLabel = '却下';
                break;
              case 'return':
                statusLabel = '差戻し';
                break;
              case 'withdraw':
                statusLabel = '取り下げ';
                break;
              case 'status_change':
                // コメントからステータスを推測するか、現在のステータスを使用
                statusLabel = this.getStatusLabel(app.status);
                break;
              default:
                statusLabel = this.getStatusLabel(app.status);
            }
            
            activities.push({
              type: 'application_status_change',
              message: `${applicationTypeName}（${employeeName}）が${statusLabel}されました`,
              date: histDate,
              applicationId: app.id
            });
          }
        }
      }
      
      // 日付でソート（新しい順）
      activities.sort((a, b) => {
        const dateA = a.date instanceof Date ? a.date : (a.date as any).toDate ? (a.date as any).toDate() : new Date(0);
        const dateB = b.date instanceof Date ? b.date : (b.date as any).toDate ? (b.date as any).toDate() : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      this.recentActivities = activities.slice(0, 5);
    } catch (error) {
      console.error('最近の動きの読み込みに失敗しました:', error);
    }
  }

  /**
   * 今月の概況を読み込む（月次と賞与の両方を含む）
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
      
      // 今月の保険料合計（月次と賞与の確定済み計算結果から）
      // 月次計算結果を取得
      const monthlyCalculations = await this.calculationService.getCalculationsByMonth(
        organizationId,
        currentYear,
        currentMonth
      );
      
      // 賞与計算結果を取得
      const bonusCalculations = await this.calculationService.getBonusCalculationsByMonth(
        organizationId,
        currentYear,
        currentMonth
      );
      
      // 確定済みまたは出力済みの計算結果のみを集計
      const confirmedMonthlyCalculations = monthlyCalculations.filter((calc: MonthlyCalculation) => 
        calc.status === 'confirmed' || calc.status === 'exported'
      );
      
      const confirmedBonusCalculations = bonusCalculations.filter((calc: BonusCalculation) => 
        calc.status === 'confirmed' || calc.status === 'exported'
      );
      
      // 月次と賞与を合算
      const monthlyTotal = confirmedMonthlyCalculations.reduce((sum: number, calc: MonthlyCalculation) => 
        sum + (calc.totalPremium || 0), 0
      );
      
      const bonusTotal = confirmedBonusCalculations.reduce((sum: number, calc: BonusCalculation) => 
        sum + (calc.totalPremium || 0), 0
      );
      
      this.currentMonthPremiumTotal = monthlyTotal + bonusTotal;
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
   * 【修正20】申請種別ごとの申請一覧に遷移
   */
  navigateToApplicationsByType(typeId: string, statuses: string[]): void {
    const queryParams: any = {};
    queryParams.type = typeId;
    this.router.navigate(['/applications'], { queryParams });
  }

  /**
   * 【修正20】期限超過・期限5日以内の申請一覧に遷移
   */
  navigateToApplicationsWithDeadlineFilter(isOverdue: boolean): void {
    const queryParams: any = {
      status: 'draft,created,pending',
      hasDeadline: 'true'
    };
    if (isOverdue) {
      queryParams.overdue = 'true';
    } else {
      queryParams.nearDeadline = 'true';
    }
    this.router.navigate(['/applications'], { queryParams });
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
   * ステータスラベルを取得
   */
  getStatusLabel(status: ApplicationStatus): string {
    const labels: Record<ApplicationStatus, string> = {
      draft: '下書き',
      created: '作成済み',
      pending: '承認待ち',
      pending_received: '処理待ち（受理済み）',
      pending_not_received: '処理待ち（未受理）',
      approved: '承認済み',
      rejected: '却下',
      returned: '差戻し',
      withdrawn: '取り下げ'
    };
    return labels[status] || status;
  }

  /**
   * アクティビティタイプのアイコンを取得
   */
  getActivityIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'employee_update': 'person',
      'standard_reward_change': 'assessment',
      'calculation_confirmed': 'check_circle',
      'application_status_change': 'description'
    };
    return icons[type] || 'info';
  }

  /**
   * 【修正21】自分の申請状況を読み込む（社員モード用）
   */
  private async loadMyApplications(organizationId: string): Promise<void> {
    console.log('[DEBUG] loadMyApplications called', { organizationId });
    try {
      const currentUser = this.authService.getCurrentUser();
      console.log('[DEBUG] loadMyApplications - currentUser', { 
        hasEmployeeId: !!currentUser?.employeeId,
        employeeId: currentUser?.employeeId 
      });
      if (!currentUser?.employeeId) {
        console.log('[DEBUG] loadMyApplications - employeeIdがないため終了');
        this.myApplicationsByType = [];
        return;
      }

      // 自分の内部申請を取得
      const applications = await this.applicationService.getApplicationsByOrganization(organizationId, {
        employeeId: currentUser.employeeId,
        category: 'internal'
      });

      // 申請種別ごとにグループ化
      const applicationsByType = new Map<string, Application[]>();
      for (const app of applications) {
        const typeId = app.type;
        if (!applicationsByType.has(typeId)) {
          applicationsByType.set(typeId, []);
        }
        applicationsByType.get(typeId)!.push(app);
      }

      // 申請種別ごとにステータス別に集計
      const result: Array<{
        typeId: string;
        typeName: string;
        statuses: Array<{ status: ApplicationStatus; statusLabel: string; count: number; applications: Application[] }>;
      }> = [];

      for (const [typeId, apps] of applicationsByType.entries()) {
        // 申請種別名を取得
        const typeName = this.getApplicationTypeLabel(typeId);

        // ステータス別に集計
        const statusMap = new Map<ApplicationStatus, Application[]>();
        for (const app of apps) {
          if (!statusMap.has(app.status)) {
            statusMap.set(app.status, []);
          }
          statusMap.get(app.status)!.push(app);
        }

        // ステータス配列を作成（日付順でソート、直近5件まで）
        const statuses: Array<{ status: ApplicationStatus; statusLabel: string; count: number; applications: Application[] }> = [];
        for (const [status, statusApps] of statusMap.entries()) {
          // 日付でソート（新しい順）
          const sortedApps = statusApps.sort((a, b) => {
            const dateA = a.createdAt instanceof Date ? a.createdAt : (a.createdAt as any).toDate ? (a.createdAt as any).toDate() : new Date(0);
            const dateB = b.createdAt instanceof Date ? b.createdAt : (b.createdAt as any).toDate ? (b.createdAt as any).toDate() : new Date(0);
            return dateB.getTime() - dateA.getTime();
          });

          statuses.push({
            status,
            statusLabel: this.getStatusLabel(status),
            count: statusApps.length,
            applications: sortedApps.slice(0, 5) // 直近5件まで
          });
        }

        // ステータスでソート（draft, created, pending, approved, rejected, returned, withdrawnの順）
        const statusOrder: ApplicationStatus[] = ['draft', 'created', 'pending', 'pending_received', 'pending_not_received', 'approved', 'rejected', 'returned', 'withdrawn'];
        statuses.sort((a, b) => {
          const indexA = statusOrder.indexOf(a.status);
          const indexB = statusOrder.indexOf(b.status);
          return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });

        result.push({
          typeId,
          typeName,
          statuses
        });
      }

      // 申請種別でソート（設定順序に従う）
      if (this.organization?.applicationFlowSettings?.applicationTypes) {
        const typeOrder = this.organization.applicationFlowSettings.applicationTypes.map(t => t.id);
        result.sort((a, b) => {
          const indexA = typeOrder.indexOf(a.typeId);
          const indexB = typeOrder.indexOf(b.typeId);
          return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });
      }

      // 直近5件までに制限（申請種別×ステータスの組み合わせで最大5件）
      const limitedResult: typeof result = [];
      let totalCount = 0;
      for (const typeData of result) {
        if (totalCount >= 5) break;
        
        const limitedStatuses: typeof typeData.statuses = [];
        for (const statusData of typeData.statuses) {
          if (totalCount >= 5) break;
          limitedStatuses.push(statusData);
          totalCount++;
        }
        
        if (limitedStatuses.length > 0) {
          limitedResult.push({
            ...typeData,
            statuses: limitedStatuses
          });
        }
      }

      this.myApplicationsByType = limitedResult;
      console.log('[DEBUG] loadMyApplications completed', { 
        resultCount: limitedResult.length,
        myApplicationsByType: this.myApplicationsByType 
      });
    } catch (error) {
      console.error('自分の申請状況の読み込みに失敗しました:', error);
      this.myApplicationsByType = [];
    }
  }

  /**
   * 【修正21】内部申請種別を読み込む（社員モード用）
   */
  private async loadInternalApplicationTypes(organizationId: string): Promise<void> {
    console.log('[DEBUG] loadInternalApplicationTypes called', { 
      organizationId,
      hasOrganization: !!this.organization,
      organizationIdMatch: this.organization?.id === organizationId,
      hasApplicationFlowSettings: !!this.organization?.applicationFlowSettings,
      applicationTypesCount: this.organization?.applicationFlowSettings?.applicationTypes?.length || 0
    });
    
    try {
      if (!this.organization?.applicationFlowSettings?.applicationTypes) {
        console.log('[DEBUG] loadInternalApplicationTypes - organizationまたはapplicationFlowSettingsが存在しない', {
          organization: this.organization,
          applicationFlowSettings: this.organization?.applicationFlowSettings,
          applicationTypes: this.organization?.applicationFlowSettings?.applicationTypes
        });
        this.internalApplicationTypes = [];
        return;
      }

      const allTypes = this.organization.applicationFlowSettings.applicationTypes;
      console.log('[DEBUG] loadInternalApplicationTypes - 全申請種別', {
        allTypesCount: allTypes.length,
        allTypes: allTypes.map(t => ({ id: t.id, name: t.name, category: t.category, code: t.code }))
      });

      // 内部申請種別のみをフィルタし、作成可能な3種類のみに絞る
      const allowedCodes = ['DEPENDENT_CHANGE', 'ADDRESS_CHANGE', 'NAME_CHANGE'];
      const internalTypes = allTypes.filter(type => 
        type.category === 'internal' && allowedCodes.includes(type.code || '')
      );
      console.log('[DEBUG] loadInternalApplicationTypes - 内部申請種別フィルタ後（作成可能な3種類のみ）', {
        internalTypesCount: internalTypes.length,
        internalTypes: internalTypes.map(t => ({ id: t.id, name: t.name, category: t.category, code: t.code }))
      });

      this.internalApplicationTypes = internalTypes.map(type => ({
        id: type.id,
        name: type.name,
        code: type.code || ''
      }));

      console.log('[DEBUG] loadInternalApplicationTypes completed', {
        resultCount: this.internalApplicationTypes.length,
        internalApplicationTypes: this.internalApplicationTypes
      });
    } catch (error) {
      console.error('内部申請種別の読み込みに失敗しました:', error);
      this.internalApplicationTypes = [];
    }
  }

  /**
   * 【修正21】申請作成画面に遷移（申請種別を指定）
   */
  navigateToCreateApplication(typeId?: string): void {
    if (typeId) {
      this.router.navigate(['/applications/create'], { queryParams: { type: typeId } });
    } else {
      this.router.navigate(['/applications/create']);
    }
  }

  /**
   * 【修正21】申請一覧に遷移（申請種別とステータスでフィルタ）
   */
  navigateToMyApplications(typeId: string, status?: ApplicationStatus): void {
    const queryParams: any = {
      type: typeId,
      category: 'internal'
    };
    if (status) {
      queryParams.status = status;
    }
    this.router.navigate(['/applications'], { queryParams });
  }

  /**
   * 【修正21】ステータスのチップ色を取得
   */
  getStatusChipColor(status: ApplicationStatus): 'primary' | 'accent' | 'warn' | undefined {
    switch (status) {
      case 'draft':
      case 'created':
        return 'accent';
      case 'pending':
      case 'pending_received':
      case 'pending_not_received':
        return 'primary';
      case 'approved':
        return 'primary';
      case 'rejected':
      case 'withdrawn':
        return 'warn';
      case 'returned':
        return 'accent';
      default:
        return undefined;
    }
  }
}

