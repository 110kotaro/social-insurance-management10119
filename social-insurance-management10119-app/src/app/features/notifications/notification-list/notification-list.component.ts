import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NotificationService } from '../../../core/services/notification.service';
import { ApplicationService } from '../../../core/services/application.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Notification, NotificationType } from '../../../core/models/notification.model';
import { Application } from '../../../core/models/application.model';
import { Employee } from '../../../core/models/employee.model';
import { Organization } from '../../../core/models/organization.model';
import { Subscription } from 'rxjs';

/**
 * 申請単位でグループ化された通知（同一トリガーで発生した通知をまとめる）
 */
interface NotificationGroup {
  groupId: string; // applicationId_timestamp形式
  applicationId: string | null;
  application?: Application;
  notifications: Notification[];
  unreadCount: number;
  latestNotification: Notification;
  employeeName?: string; // 社員名
  highestPriorityNotification?: Notification; // 優先度の高い通知（一件）
}

@Component({
  selector: 'app-notification-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatChipsModule,
    MatCardModule,
    MatPaginatorModule,
    MatExpansionModule,
    MatBadgeModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatCheckboxModule
  ],
  templateUrl: './notification-list.component.html',
  styleUrl: './notification-list.component.css'
})
export class NotificationListComponent implements OnInit, OnDestroy {
  private notificationService = inject(NotificationService);
  private applicationService = inject(ApplicationService);
  private employeeService = inject(EmployeeService);
  private organizationService = inject(OrganizationService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  searchForm: FormGroup;
  notifications: Notification[] = [];
  notificationGroups: NotificationGroup[] = [];
  filteredGroups: NotificationGroup[] = [];
  applications: Map<string, Application> = new Map();
  employees: Map<string, Employee> = new Map();
  organization: Organization | null = null;
  
  displayedColumns: string[] = ['read', 'application', 'employee', 'notificationCount', 'priority', 'latestDate', 'actions'];
  dataSource = new MatTableDataSource<NotificationGroup>([]);
  
  // ページネーション
  pageSize = 10;
  pageIndex = 0;
  pageSizeOptions = [10, 25, 50, 100];
  
  // フィルタ
  selectedReadStatus: 'all' | 'read' | 'unread' = 'all';
  selectedType: NotificationType | '' = '';
  searchKeyword = '';

  userId: string | null = null;
  organizationId: string | null = null;

  private subscriptions = new Subscription();

  constructor() {
    this.searchForm = this.fb.group({
      readStatus: ['all'],
      type: [''],
      keyword: ['']
    });
  }

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.userId = currentUser.uid;
    this.organizationId = currentUser.organizationId;

    this.loadOrganization(currentUser.organizationId);
    this.loadNotifications();
    this.loadEmployees(currentUser.organizationId);

    // 検索フォームの変更を監視
    this.searchForm.valueChanges.subscribe(() => {
      this.applyFilters();
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /**
   * 通知を読み込む
   */
  private async loadNotifications(): Promise<void> {
    if (!this.userId || !this.organizationId) {
      return;
    }

    try {
      this.notifications = await this.notificationService.getUserNotifications(
        this.userId,
        this.organizationId
      );

      // 申請情報を読み込む
      const applicationIds = new Set<string>();
      this.notifications.forEach(notification => {
        if (notification.applicationId) {
          applicationIds.add(notification.applicationId);
        }
      });

      for (const applicationId of applicationIds) {
        try {
          const application = await this.applicationService.getApplication(applicationId);
          if (application) {
            this.applications.set(applicationId, application);
          }
        } catch (error) {
          console.error(`申請情報の読み込みに失敗しました (${applicationId}):`, error);
        }
      }

      this.groupNotifications();
      this.applyFilters();
    } catch (error) {
      console.error('通知の読み込みに失敗しました:', error);
      this.snackBar.open('通知の読み込みに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 組織情報を読み込む
   */
  private async loadOrganization(organizationId: string): Promise<void> {
    try {
      this.organization = await this.organizationService.getOrganization(organizationId);
    } catch (error) {
      console.error('組織情報の読み込みに失敗しました:', error);
    }
  }

  /**
   * 社員情報を読み込む
   */
  private async loadEmployees(organizationId: string): Promise<void> {
    try {
      const employees = await this.employeeService.getEmployeesByOrganization(organizationId);
      employees.forEach(employee => {
        if (employee.id) {
          this.employees.set(employee.id, employee);
        }
      });
    } catch (error) {
      console.error('社員情報の読み込みに失敗しました:', error);
    }
  }

  /**
   * 通知を申請単位でグループ化（同一トリガーで発生した通知をまとめる）
   * グループキー: applicationId + createdAt（秒単位で丸めた値）
   */
  private groupNotifications(): void {
    const groupsMap = new Map<string, NotificationGroup>();

    this.notifications.forEach(notification => {
      // createdAtを秒単位で丸める（同一トリガーで発生した通知をまとめるため）
      const notificationDate = notification.createdAt instanceof Date 
        ? notification.createdAt 
        : (notification.createdAt as any).toDate();
      const timestampSeconds = Math.floor(notificationDate.getTime() / 1000);
      
      // グループキー: applicationId_timestamp（申請がない場合はno-application_timestamp）
      const applicationId = notification.applicationId || 'no-application';
      const groupKey = `${applicationId}_${timestampSeconds}`;
      
      if (!groupsMap.has(groupKey)) {
        const application = notification.applicationId ? this.applications.get(notification.applicationId) : undefined;
        // 申請がある場合は申請から、ない場合は通知のemployeeIdから社員を取得
        const employeeId = application ? application.employeeId : (notification.employeeId || undefined);
        const employee = employeeId ? this.employees.get(employeeId) : undefined;
        const employeeName = employee ? `${employee.lastName} ${employee.firstName}` : undefined;

        groupsMap.set(groupKey, {
          groupId: groupKey,
          applicationId: notification.applicationId,
          application: application,
          notifications: [],
          unreadCount: 0,
          latestNotification: notification,
          employeeName: employeeName,
          highestPriorityNotification: notification
        });
      }

      const group = groupsMap.get(groupKey)!;
      group.notifications.push(notification);
      
      if (!notification.read) {
        group.unreadCount++;
      }

      // 最新の通知を更新
      const latestDate = group.latestNotification.createdAt instanceof Date 
        ? group.latestNotification.createdAt 
        : (group.latestNotification.createdAt as any).toDate();
      
      if (notificationDate > latestDate) {
        group.latestNotification = notification;
      }

      // 優先度の高い通知を更新（high > medium > low）
      const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
      const currentPriority = priorityOrder[group.highestPriorityNotification!.priority] || 0;
      const notificationPriority = priorityOrder[notification.priority] || 0;
      
      if (notificationPriority > currentPriority) {
        group.highestPriorityNotification = notification;
      } else if (notificationPriority === currentPriority) {
        // 同じ優先度の場合は新しい方を優先
        const highestDate = group.highestPriorityNotification!.createdAt instanceof Date 
          ? group.highestPriorityNotification!.createdAt 
          : (group.highestPriorityNotification!.createdAt as any).toDate();
        if (notificationDate > highestDate) {
          group.highestPriorityNotification = notification;
        }
      }
    });

    // マップを配列に変換し、最新の通知日時でソート
    this.notificationGroups = Array.from(groupsMap.values()).sort((a, b) => {
      const dateA = a.latestNotification.createdAt instanceof Date 
        ? a.latestNotification.createdAt 
        : (a.latestNotification.createdAt as any).toDate();
      const dateB = b.latestNotification.createdAt instanceof Date 
        ? b.latestNotification.createdAt 
        : (b.latestNotification.createdAt as any).toDate();
      return dateB.getTime() - dateA.getTime();
    });
  }

  /**
   * フィルタを適用
   */
  applyFilters(): void {
    const formValue = this.searchForm.value;
    this.selectedReadStatus = formValue.readStatus || 'all';
    this.selectedType = formValue.type || '';
    this.searchKeyword = formValue.keyword || '';

    this.filteredGroups = this.notificationGroups.filter(group => {
      // 既読/未読フィルタ
      if (this.selectedReadStatus === 'read' && group.unreadCount > 0) {
        return false;
      }
      if (this.selectedReadStatus === 'unread' && group.unreadCount === 0) {
        return false;
      }

      // タイプフィルタ
      if (this.selectedType && !group.notifications.some(n => n.type === this.selectedType)) {
        return false;
      }

      // キーワード検索
      if (this.searchKeyword) {
        const keyword = this.searchKeyword.toLowerCase();
        const matchesTitle = group.notifications.some(n => 
          n.title.toLowerCase().includes(keyword) || 
          n.message.toLowerCase().includes(keyword)
        );
        const matchesApplication = group.application && (
          group.application.type.toLowerCase().includes(keyword)
        );
        return matchesTitle || matchesApplication || false;
      }

      return true;
    });

    this.updateDataSource();
  }

  /**
   * データソースを更新
   */
  private updateDataSource(): void {
    const startIndex = this.pageIndex * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.dataSource.data = this.filteredGroups.slice(startIndex, endIndex);
  }

  /**
   * ページネーション変更
   */
  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.updateDataSource();
  }

  /**
   * フィルタをリセット
   */
  resetFilters(): void {
    this.searchForm.patchValue({
      readStatus: 'all',
      type: '',
      keyword: ''
    });
  }

  /**
   * 通知タイプのラベルを取得
   */
  getTypeLabel(type: NotificationType): string {
    const labels: Record<NotificationType, string> = {
      'application': '申請',
      'approval': '承認',
      'rejection': '却下',
      'return': '差戻し',
      'reminder': 'リマインダー',
      'system': 'システム',
      'external_received': '外部受理',
      'external_error': '外部エラー'
    };
    return labels[type] || type;
  }

  /**
   * 通知タイプのアイコンを取得
   */
  getTypeIcon(type: NotificationType): string {
    const icons: Record<NotificationType, string> = {
      'application': 'description',
      'approval': 'check_circle',
      'rejection': 'cancel',
      'return': 'undo',
      'reminder': 'schedule',
      'system': 'info',
      'external_received': 'check_circle',
      'external_error': 'error'
    };
    return icons[type] || 'notifications';
  }

  /**
   * 優先度の色を取得
   */
  getPriorityColor(priority: string): string {
    switch (priority) {
      case 'high':
        return 'warn';
      case 'medium':
        return 'primary';
      case 'low':
        return '';
      default:
        return '';
    }
  }

  /**
   * 申請種別名を取得
   */
  getApplicationTypeName(applicationId: string | null, group?: NotificationGroup): string {
    if (applicationId) {
      const application = this.applications.get(applicationId);
      if (!application) {
        return '不明';
      }
      
      // 組織の申請フロー設定から申請種別名を取得
      if (this.organization?.applicationFlowSettings?.applicationTypes) {
        const applicationType = this.organization.applicationFlowSettings.applicationTypes.find(
          type => type.id === application.type
        );
        return applicationType?.name || application.type;
      }
      
      return application.type;
    }
    
    // 申請がない場合、通知メッセージから申請種別名を抽出
    if (group && group.notifications.length > 0 && this.organization?.applicationFlowSettings?.applicationTypes) {
      const firstNotification = group.notifications[0];
      const applicationTypes = this.organization.applicationFlowSettings.applicationTypes;
      
      // 通知メッセージに含まれる申請種別名を検索
      for (const type of applicationTypes) {
        if (firstNotification.message.includes(type.name)) {
          return type.name;
        }
      }
    }
    
    return '申請なし';
  }

  /**
   * 申請詳細に遷移
   */
  navigateToApplication(applicationId: string | null): void {
    if (applicationId) {
      this.router.navigate(['/applications', applicationId]);
    }
  }

  /**
   * 通知詳細画面に遷移（通知件数クリック時）
   */
  navigateToNotificationDetail(group: NotificationGroup): void {
    this.router.navigate(['/notifications/group', group.groupId]);
  }

  /**
   * 通知を既読にする
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      await this.notificationService.markAsRead(notificationId);
      await this.loadNotifications();
      this.snackBar.open('通知を既読にしました', '閉じる', { duration: 2000 });
    } catch (error) {
      console.error('通知の既読処理に失敗しました:', error);
      this.snackBar.open('通知の既読処理に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 申請に関連するすべての通知を既読にする
   */
  async markApplicationAsRead(applicationId: string | null): Promise<void> {
    if (!applicationId || !this.userId) {
      return;
    }

    try {
      await this.notificationService.markApplicationNotificationsAsRead(this.userId, applicationId);
      await this.loadNotifications();
      this.snackBar.open('申請に関連する通知を既読にしました', '閉じる', { duration: 2000 });
    } catch (error) {
      console.error('通知の既読処理に失敗しました:', error);
      this.snackBar.open('通知の既読処理に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 通知グループのすべての通知を既読にする
   */
  async markGroupAsRead(group: NotificationGroup): Promise<void> {
    if (!this.userId || group.notifications.length === 0) {
      return;
    }

    try {
      const unreadNotifications = group.notifications.filter(n => !n.read);
      if (unreadNotifications.length === 0) {
        this.snackBar.open('既読にする通知がありません', '閉じる', { duration: 2000 });
        return;
      }

      const notificationIds = unreadNotifications.map(n => n.id!).filter((id): id is string => id !== undefined);
      await this.notificationService.markMultipleAsRead(notificationIds);
      await this.loadNotifications();
      this.snackBar.open('この通知グループの通知をすべて既読にしました', '閉じる', { duration: 2000 });
    } catch (error) {
      console.error('通知の既読処理に失敗しました:', error);
      this.snackBar.open('通知の既読処理に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * すべての通知を既読にする
   */
  async markAllAsRead(): Promise<void> {
    if (!this.userId || !this.organizationId) {
      return;
    }

    try {
      await this.notificationService.markAllAsRead(this.userId, this.organizationId);
      await this.loadNotifications();
      this.snackBar.open('すべての通知を既読にしました', '閉じる', { duration: 2000 });
    } catch (error) {
      console.error('通知の既読処理に失敗しました:', error);
      this.snackBar.open('通知の既読処理に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 未読通知グループ数を取得
   */
  get unreadGroupCount(): number {
    return this.notificationGroups.filter(g => g.unreadCount > 0).length;
  }

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date | any): string {
    if (!date) {
      return '';
    }
    const d = date instanceof Date ? date : date.toDate();
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return '昨日';
    } else if (days < 7) {
      return `${days}日前`;
    } else {
      return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
    }
  }
}

