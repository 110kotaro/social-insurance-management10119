import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { NotificationService } from '../../../core/services/notification.service';
import { ApplicationService } from '../../../core/services/application.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Notification, NotificationType } from '../../../core/models/notification.model';
import { Application, ApplicationStatus } from '../../../core/models/application.model';
import { Employee } from '../../../core/models/employee.model';
import { Organization } from '../../../core/models/organization.model';

@Component({
  selector: 'app-notification-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatChipsModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDividerModule,
    MatExpansionModule
  ],
  templateUrl: './notification-detail.component.html',
  styleUrl: './notification-detail.component.css'
})
export class NotificationDetailComponent implements OnInit {
  private notificationService = inject(NotificationService);
  private applicationService = inject(ApplicationService);
  private employeeService = inject(EmployeeService);
  private organizationService = inject(OrganizationService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  groupId: string | null = null;
  notifications: Notification[] = [];
  application: Application | null = null;
  employee: Employee | null = null;
  organization: Organization | null = null;
  isLoading = true;

  userId: string | null = null;
  organizationId: string | null = null;


  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.userId = currentUser.uid;
    this.organizationId = currentUser.organizationId;

    this.route.paramMap.subscribe(params => {
      this.groupId = params.get('groupId');
      if (this.groupId) {
        this.loadNotificationGroup();
      }
    });
  }

  /**
   * 通知グループを読み込む
   */
  private async loadNotificationGroup(): Promise<void> {
    if (!this.groupId || !this.userId || !this.organizationId) {
      return;
    }

    try {
      this.isLoading = true;

      // グループIDからapplicationIdとtimestampを抽出
      const [applicationId, timestampStr] = this.parseGroupId(this.groupId);
      const timestamp = parseInt(timestampStr, 10) * 1000; // 秒からミリ秒に変換

      // 該当する通知を取得
      const allNotifications = await this.notificationService.getUserNotifications(
        this.userId,
        this.organizationId
      );

      // 同一トリガーで発生した通知をフィルタリング
      this.notifications = allNotifications.filter(notification => {
        const notificationDate = notification.createdAt instanceof Date 
          ? notification.createdAt 
          : (notification.createdAt as any).toDate();
        const notificationTimestamp = Math.floor(notificationDate.getTime() / 1000);
        
        const notificationAppId = notification.applicationId || 'no-application';
        return notificationAppId === applicationId && notificationTimestamp === parseInt(timestampStr, 10);
      });

      // 通知を日時でソート（新しい順）
      this.notifications.sort((a, b) => {
        const dateA = a.createdAt instanceof Date 
          ? a.createdAt 
          : (a.createdAt as any).toDate();
        const dateB = b.createdAt instanceof Date 
          ? b.createdAt 
          : (b.createdAt as any).toDate();
        return dateB.getTime() - dateA.getTime();
      });

      // 申請情報を読み込む
      if (applicationId !== 'no-application') {
        try {
          this.application = await this.applicationService.getApplication(applicationId);
          if (this.application) {
            // 社員情報を読み込む
            try {
              this.employee = await this.employeeService.getEmployee(this.application.employeeId);
            } catch (error) {
              console.error('社員情報の読み込みに失敗しました:', error);
            }
          }
        } catch (error) {
          console.error('申請情報の読み込みに失敗しました:', error);
        }
      } else {
        // 申請がない場合でも、通知のemployeeIdから社員情報を読み込む
        if (this.notifications.length > 0 && this.notifications[0].employeeId) {
          try {
            this.employee = await this.employeeService.getEmployee(this.notifications[0].employeeId);
          } catch (error) {
            console.error('社員情報の読み込みに失敗しました:', error);
          }
        }
      }

      // 組織情報を読み込む
      try {
        this.organization = await this.organizationService.getOrganization(this.organizationId);
      } catch (error) {
        console.error('組織情報の読み込みに失敗しました:', error);
      }

      this.isLoading = false;
    } catch (error) {
      console.error('通知グループの読み込みに失敗しました:', error);
      this.snackBar.open('通知の読み込みに失敗しました', '閉じる', { duration: 3000 });
      this.isLoading = false;
    }
  }

  /**
   * グループIDを解析（applicationId_timestamp形式）
   */
  private parseGroupId(groupId: string): [string, string] {
    const lastUnderscoreIndex = groupId.lastIndexOf('_');
    if (lastUnderscoreIndex === -1) {
      return ['no-application', '0'];
    }
    const applicationId = groupId.substring(0, lastUnderscoreIndex);
    const timestamp = groupId.substring(lastUnderscoreIndex + 1);
    return [applicationId, timestamp];
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
  getApplicationTypeName(): string {
    if (!this.application || !this.organization) {
      return '申請なし';
    }
    
    // 組織の申請フロー設定から申請種別名を取得
    if (this.organization.applicationFlowSettings?.applicationTypes) {
      const applicationType = this.organization.applicationFlowSettings.applicationTypes.find(
        type => type.id === this.application!.type
      );
      return applicationType?.name || this.application.type;
    }
    
    return this.application.type;
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
   * 日付をフォーマット
   */
  formatDate(date: Date | any): string {
    if (!date) {
      return '';
    }
    const d = date instanceof Date ? date : date.toDate();
    return d.toLocaleString('ja-JP', { 
      year: 'numeric', 
      month: 'numeric', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * 通知を既読にする
   */
  async markAsRead(notificationId: string): Promise<void> {
    try {
      await this.notificationService.markAsRead(notificationId);
      // 通知を再読み込み
      await this.loadNotificationGroup();
      this.snackBar.open('通知を既読にしました', '閉じる', { duration: 2000 });
    } catch (error) {
      console.error('通知の既読処理に失敗しました:', error);
      this.snackBar.open('通知の既読処理に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * グループ内のすべての通知を既読にする
   */
  async markAllAsRead(): Promise<void> {
    if (!this.userId || !this.groupId) {
      return;
    }

    try {
      const unreadNotifications = this.notifications.filter(n => !n.read);
      if (unreadNotifications.length === 0) {
        this.snackBar.open('既読にする通知がありません', '閉じる', { duration: 2000 });
        return;
      }

      const notificationIds = unreadNotifications.map(n => n.id!).filter((id): id is string => id !== undefined);
      await this.notificationService.markMultipleAsRead(notificationIds);
      
      // 通知を再読み込み
      await this.loadNotificationGroup();
      this.snackBar.open('すべての通知を既読にしました', '閉じる', { duration: 2000 });
    } catch (error) {
      console.error('通知の既読処理に失敗しました:', error);
      this.snackBar.open('通知の既読処理に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 申請詳細に遷移
   */
  navigateToApplication(): void {
    if (this.application?.id) {
      this.router.navigate(['/applications', this.application.id]);
    }
  }

  /**
   * 通知一覧に戻る
   */
  navigateToList(): void {
    this.router.navigate(['/notifications']);
  }

  /**
   * 未読通知数を取得
   */
  get unreadCount(): number {
    return this.notifications.filter(n => !n.read).length;
  }

  /**
   * 通知メッセージをフォーマット（社員名と申請名を含む）
   */
  getFormattedMessage(notification: Notification): string {
    // リマインダー通知の場合のみ、社員名と申請名を含める
    if (notification.type !== 'reminder') {
      return notification.message;
    }

    // 社員名を取得
    let employeeName = '不明';
    if (this.employee) {
      employeeName = `${this.employee.lastName} ${this.employee.firstName}`;
    } else if (notification.employeeId) {
      // employeeが読み込まれていない場合、通知のemployeeIdから取得を試みる
      // ただし、これは非同期なので、ここでは'不明'のまま
    }

    // 申請種別名を取得
    let applicationTypeName = this.getApplicationTypeName();
    
    // 申請がない場合、通知メッセージから申請種別名を抽出
    if (applicationTypeName === '申請なし' && this.organization) {
      const applicationTypes = this.organization.applicationFlowSettings?.applicationTypes || [];
      for (const type of applicationTypes) {
        if (notification.message.includes(type.name)) {
          applicationTypeName = type.name;
          break;
        }
      }
    }

    // メッセージから申請種別名を抽出（既に含まれている場合）
    // 例: "被保険者資格取得届の申請の期限まであと5日です（期限：2024年1月15日）。"
    // → "○○さんの被保険者資格取得届の申請の期限まであと5日です（期限：2024年1月15日）。"
    let message = notification.message;
    
    // 申請種別名がメッセージに含まれている場合、その前に社員名を追加
    if (applicationTypeName && applicationTypeName !== '申請なし') {
      // 申請種別名で始まる部分を探す
      const typeNameIndex = message.indexOf(applicationTypeName);
      if (typeNameIndex !== -1) {
        // 申請種別名の前に社員名を挿入
        message = message.substring(0, typeNameIndex) + 
                  `${employeeName}さんの${applicationTypeName}` + 
                  message.substring(typeNameIndex + applicationTypeName.length);
      } else {
        // 申請種別名が見つからない場合、メッセージの先頭に追加
        message = `${employeeName}さんの${applicationTypeName}${message}`;
      }
    } else {
      // 申請種別名が取得できない場合、メッセージの先頭に社員名を追加
      message = `${employeeName}さんの${message}`;
    }

    return message;
  }

}

