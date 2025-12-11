import { Injectable, inject, Injector } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, Timestamp, orderBy, limit, onSnapshot, Unsubscribe } from '@angular/fire/firestore';
import { Notification, NotificationType, NotificationPriority } from '../models/notification.model';
import { Employee } from '../models/employee.model';
import { ApplicationFlowSettings } from '../models/application-flow.model';
import { environment } from '../../../environments/environment';
import { Observable, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { SalaryDataService } from './salary-data.service';
import { StandardRewardCalculationService } from './standard-reward-calculation.service';
import { StandardRewardCalculation } from '../models/standard-reward-calculation.model';
import { ApplicationService } from './application.service';
import { Application } from '../models/application.model';
import { EmployeeService } from './employee.service';
import { DeadlineCalculationService } from './deadline-calculation.service';
import { OrganizationService } from './organization.service';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private firestore = inject(Firestore);
  private notificationsCollection = collection(this.firestore, `${environment.firestorePrefix}notifications`);
  private salaryDataService = inject(SalaryDataService);
  private standardRewardCalculationService = inject(StandardRewardCalculationService);
  private applicationService = inject(ApplicationService);
  private deadlineCalculationService = inject(DeadlineCalculationService);
  private organizationService = inject(OrganizationService);
  private injector = inject(Injector);

  /**
   * FirestoreのTimestampまたはDateをDateオブジェクトに変換するヘルパー関数
   */
  private convertTimestampToDate(timestamp: Date | Timestamp | undefined): Date | undefined {
    if (!timestamp) {
      return undefined;
    }
    if (timestamp instanceof Date) {
      return timestamp;
    }
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate();
    }
    return undefined;
  }

  /**
   * FirestoreドキュメントをNotificationオブジェクトに変換
   */
  private convertToNotification(docSnapshot: any): Notification {
    const data = docSnapshot.data();
    return {
      id: docSnapshot.id,
      userId: data['userId'],
      applicationId: data['applicationId'] || null,
      employeeId: data['employeeId'] || null, // 社員IDを追加
      type: data['type'],
      title: data['title'],
      message: data['message'],
      read: data['read'] || false,
      priority: data['priority'] || 'medium',
      organizationId: data['organizationId'],
      createdAt: this.convertTimestampToDate(data['createdAt']) || new Date(),
      readAt: data['readAt'] ? this.convertTimestampToDate(data['readAt']) : undefined
    };
  }

  /**
   * 通知を作成
   */
  async createNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<string> {
    const notificationRef = doc(this.notificationsCollection);
    const now = new Date();
    
    const notificationData: any = {
      userId: notification.userId,
      applicationId: notification.applicationId || null,
      employeeId: notification.employeeId || null, // 社員IDを追加
      type: notification.type,
      title: notification.title,
      message: notification.message,
      read: notification.read || false,
      priority: notification.priority || 'medium',
      organizationId: notification.organizationId,
      createdAt: Timestamp.fromDate(now)
    };

    if (notification.readAt) {
      notificationData.readAt = notification.readAt instanceof Date 
        ? Timestamp.fromDate(notification.readAt) 
        : notification.readAt;
    }

    await setDoc(notificationRef, notificationData);
    return notificationRef.id;
  }

  /**
   * 複数の通知を一括作成
   */
  async createNotifications(notifications: Omit<Notification, 'id' | 'createdAt'>[]): Promise<string[]> {
    const notificationIds: string[] = [];
    const now = Timestamp.fromDate(new Date());

    for (const notification of notifications) {
      const notificationRef = doc(this.notificationsCollection);
      const notificationData: any = {
        userId: notification.userId,
        applicationId: notification.applicationId || null,
        employeeId: notification.employeeId || null, // 社員IDを追加
        type: notification.type,
        title: notification.title,
        message: notification.message,
        read: notification.read || false,
        priority: notification.priority || 'medium',
        organizationId: notification.organizationId,
        createdAt: now
      };

      if (notification.readAt) {
        notificationData.readAt = notification.readAt instanceof Date 
          ? Timestamp.fromDate(notification.readAt) 
          : notification.readAt;
      }

      await setDoc(notificationRef, notificationData);
      notificationIds.push(notificationRef.id);
    }

    return notificationIds;
  }

  /**
   * 通知を取得（ID指定）
   */
  async getNotification(notificationId: string): Promise<Notification | null> {
    const notificationRef = doc(this.notificationsCollection, notificationId);
    const notificationSnap = await getDoc(notificationRef);
    
    if (!notificationSnap.exists()) {
      return null;
    }
    
    return this.convertToNotification(notificationSnap);
  }

  /**
   * ユーザーの通知一覧を取得
   */
  async getUserNotifications(userId: string, organizationId?: string, options?: {
    read?: boolean;
    type?: NotificationType;
    applicationId?: string;
    limitCount?: number;
  }): Promise<Notification[]> {
    let q = query(
      this.notificationsCollection,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    if (organizationId) {
      q = query(q, where('organizationId', '==', organizationId));
    }

    if (options?.read !== undefined) {
      q = query(q, where('read', '==', options.read));
    }

    if (options?.type) {
      q = query(q, where('type', '==', options.type));
    }

    if (options?.applicationId) {
      q = query(q, where('applicationId', '==', options.applicationId));
    }

    if (options?.limitCount) {
      q = query(q, limit(options.limitCount));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.convertToNotification(doc));
  }

  /**
   * ユーザーの未読通知数を取得
   */
  async getUnreadCount(userId: string, organizationId?: string): Promise<number> {
    let q = query(
      this.notificationsCollection,
      where('userId', '==', userId),
      where('read', '==', false)
    );

    if (organizationId) {
      q = query(q, where('organizationId', '==', organizationId));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  }

  /**
   * ユーザーの未読通知数をリアルタイムで監視
   */
  getUnreadCount$(userId: string, organizationId?: string): Observable<number> {
    return new Observable(observer => {
      let q = query(
        this.notificationsCollection,
        where('userId', '==', userId),
        where('read', '==', false)
      );

      if (organizationId) {
        q = query(q, where('organizationId', '==', organizationId));
      }

      const unsubscribe = onSnapshot(q, (snapshot) => {
        observer.next(snapshot.size);
      }, (error) => {
        observer.error(error);
      });

      return () => unsubscribe();
    });
  }

  /**
   * ユーザーの通知一覧をリアルタイムで監視
   */
  getUserNotifications$(userId: string, organizationId?: string, options?: {
    read?: boolean;
    type?: NotificationType;
    applicationId?: string;
    limitCount?: number;
  }): Observable<Notification[]> {
    return new Observable(observer => {
      let q = query(
        this.notificationsCollection,
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      if (organizationId) {
        q = query(q, where('organizationId', '==', organizationId));
      }

      if (options?.read !== undefined) {
        q = query(q, where('read', '==', options.read));
      }

      if (options?.type) {
        q = query(q, where('type', '==', options.type));
      }

      if (options?.applicationId) {
        q = query(q, where('applicationId', '==', options.applicationId));
      }

      if (options?.limitCount) {
        q = query(q, limit(options.limitCount));
      }

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const notifications = snapshot.docs.map(doc => this.convertToNotification(doc));
        observer.next(notifications);
      }, (error) => {
        observer.error(error);
      });

      return () => unsubscribe();
    });
  }

  /**
   * 通知を既読にする
   */
  async markAsRead(notificationId: string): Promise<void> {
    const notificationRef = doc(this.notificationsCollection, notificationId);
    await updateDoc(notificationRef, {
      read: true,
      readAt: Timestamp.fromDate(new Date())
    });
  }

  /**
   * 複数の通知を一括既読にする
   */
  async markMultipleAsRead(notificationIds: string[]): Promise<void> {
    const now = Timestamp.fromDate(new Date());
    const updatePromises = notificationIds.map(id => {
      const notificationRef = doc(this.notificationsCollection, id);
      return updateDoc(notificationRef, {
        read: true,
        readAt: now
      });
    });
    await Promise.all(updatePromises);
  }

  /**
   * ユーザーのすべての通知を既読にする
   */
  async markAllAsRead(userId: string, organizationId?: string): Promise<void> {
    const notifications = await this.getUserNotifications(userId, organizationId, { read: false });
    if (notifications.length === 0) {
      return;
    }
    const notificationIds = notifications.map(n => n.id!).filter((id): id is string => id !== undefined);
    await this.markMultipleAsRead(notificationIds);
  }

  /**
   * 申請に関連するすべての通知を既読にする
   */
  async markApplicationNotificationsAsRead(userId: string, applicationId: string): Promise<void> {
    const notifications = await this.getUserNotifications(userId, undefined, { 
      applicationId,
      read: false 
    });
    if (notifications.length === 0) {
      return;
    }
    const notificationIds = notifications.map(n => n.id!).filter((id): id is string => id !== undefined);
    await this.markMultipleAsRead(notificationIds);
  }

  /**
   * 通知を削除
   */
  async deleteNotification(notificationId: string): Promise<void> {
    const notificationRef = doc(this.notificationsCollection, notificationId);
    await deleteDoc(notificationRef);
  }

  /**
   * 申請に関連するすべての通知を削除
   */
  async deleteApplicationNotifications(applicationId: string): Promise<void> {
    const q = query(
      this.notificationsCollection,
      where('applicationId', '==', applicationId)
    );
    const querySnapshot = await getDocs(q);
    const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
  }

  /**
   * EmployeeのIDからUserのuidを取得
   */
  private async getUserUidByEmployeeId(employeeId: string): Promise<string | null> {
    try {
      const usersRef = collection(this.firestore, `${environment.firestorePrefix}users`);
      const q = query(usersRef, where('employeeId', '==', employeeId));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        // 最初のユーザーのuidを返す（通常は1人のはず）
        return querySnapshot.docs[0].id;
      }
      return null;
    } catch (error) {
      console.error('Error getting user uid by employeeId:', error);
      return null;
    }
  }

  /**
   * 組織の管理者のUserのuidリストを取得
   */
  private async getAdminUserUids(organizationId: string): Promise<string[]> {
    try {
      const usersRef = collection(this.firestore, `${environment.firestorePrefix}users`);
      const q = query(
        usersRef,
        where('organizationId', '==', organizationId),
        where('isActive', '==', true)
      );
      const querySnapshot = await getDocs(q);

      const adminUids: string[] = [];
      querySnapshot.docs.forEach(doc => {
        const data = doc.data();
        const role = data['role'];
        // ownerまたはadminのユーザーのuidを取得
        if (role === 'owner' || role === 'admin') {
          adminUids.push(doc.id);
        }
      });

      return adminUids;
    } catch (error) {
      console.error('Error getting admin user uids:', error);
      return [];
    }
  }

  /**
   * 申請ステータス変更時に通知を作成するヘルパーメソッド
   */
  async createApplicationStatusNotification(params: {
    applicationId: string;
    employeeId: string;
    organizationId: string;
    status: string;
    applicationTypeName: string;
    employeeName: string;
    approverId?: string;
    comment?: string;
    notificationSettings?: ApplicationFlowSettings['notificationSettings'];
    isResubmission?: boolean; // 再申請かどうか
  }): Promise<void> {
    const notifications: Omit<Notification, 'id' | 'createdAt'>[] = [];

    // 通知設定を取得（デフォルト値を使用）
    const settings = params.notificationSettings || {
      notifyApplicant: true,
      notifyAdmin: true,
      notifyOnSubmit: true,
      notifyOnApprove: true,
      notifyOnReturn: true,
      notifyOnReject: true,
      internalDeadlineDays: 3,
      externalDeadlineDays: 7,
      reminderInterval: 1
    };

    // 申請者のUserのuidを取得
    const applicantUid = await this.getUserUidByEmployeeId(params.employeeId);
    if (!applicantUid) {
      console.warn(`User not found for employeeId: ${params.employeeId}`);
    }

    // 申請提出時（pending）
    if (params.status === 'pending') {
      // 申請者への通知
      if (settings.notifyApplicant && settings.notifyOnSubmit && applicantUid) {
        notifications.push({
          userId: applicantUid,
          applicationId: params.applicationId,
          type: 'application',
          title: params.isResubmission ? '申請を再送信しました' : '申請を提出しました',
          message: `${params.applicationTypeName}の申請を${params.isResubmission ? '再送信' : '提出'}しました。承認をお待ちください。`,
          read: false,
          priority: 'medium',
          organizationId: params.organizationId
        });
      }

      // 管理者への通知
      if (settings.notifyAdmin && settings.notifyOnSubmit) {
        const adminUids = await this.getAdminUserUids(params.organizationId);
        for (const adminUid of adminUids) {
          // 申請者本人には通知しない
          if (adminUid !== applicantUid) {
            notifications.push({
              userId: adminUid,
              applicationId: params.applicationId,
              type: 'application',
              title: params.isResubmission ? '申請が再送信されました' : '新規申請が来ました',
              message: `${params.employeeName}さんから${params.applicationTypeName}の申請が${params.isResubmission ? '再送信' : '提出'}されました。`,
              read: false,
              priority: 'high',
              organizationId: params.organizationId
            });
          }
        }
      }
    }
    // 承認時（approved）
    else if (params.status === 'approved') {
      // 申請者への通知
      if (settings.notifyApplicant && settings.notifyOnApprove && applicantUid) {
        notifications.push({
          userId: applicantUid,
          applicationId: params.applicationId,
          type: 'approval',
          title: '申請が承認されました',
          message: `${params.applicationTypeName}の申請が承認されました。`,
          read: false,
          priority: 'high',
          organizationId: params.organizationId
        });
      }
    }
    // 却下時（rejected）
    else if (params.status === 'rejected') {
      // 申請者への通知
      if (settings.notifyApplicant && settings.notifyOnReject && applicantUid) {
        notifications.push({
          userId: applicantUid,
          applicationId: params.applicationId,
          type: 'rejection',
          title: '申請が却下されました',
          message: `${params.applicationTypeName}の申請が却下されました。${params.comment ? `理由: ${params.comment}` : ''}`,
          read: false,
          priority: 'high',
          organizationId: params.organizationId
        });
      }
    }
    // 差戻し時（returned）
    else if (params.status === 'returned') {
      // 申請者への通知のみ
      if (settings.notifyApplicant && settings.notifyOnReturn && applicantUid) {
        notifications.push({
          userId: applicantUid,
          applicationId: params.applicationId,
          type: 'return',
          title: '申請が差し戻されました',
          message: `${params.applicationTypeName}の申請が差し戻されました。${params.comment ? `理由: ${params.comment}` : ''}`,
          read: false,
          priority: 'high',
          organizationId: params.organizationId
        });
      }
    }

    if (notifications.length > 0) {
      await this.createNotifications(notifications);
    }
  }

  /**
   * 外部申請ステータス変更時に通知を作成するヘルパーメソッド
   */
  async createExternalApplicationStatusNotification(params: {
    applicationId: string;
    employeeId: string;
    organizationId: string;
    externalStatus: 'sent' | 'received' | 'error';
    applicationTypeName: string;
    employeeName: string;
    notificationSettings?: ApplicationFlowSettings['notificationSettings'];
  }): Promise<void> {
    const notifications: Omit<Notification, 'id' | 'createdAt'>[] = [];

    // 通知設定を取得（デフォルト値を使用）
    const settings = params.notificationSettings || {
      notifyApplicant: true,
      notifyAdmin: true,
      notifyOnSubmit: true,
      notifyOnApprove: true,
      notifyOnReturn: true,
      notifyOnReject: true,
      internalDeadlineDays: 3,
      externalDeadlineDays: 7,
      reminderInterval: 1
    };

    // 管理者への通知のみ（外部申請は管理者が管理）
    if (!settings.notifyAdmin) {
      return;
    }

    const adminUids = await this.getAdminUserUids(params.organizationId);

    if (params.externalStatus === 'received') {
      // 受理確認通知：管理者へ
      for (const adminUid of adminUids) {
        notifications.push({
          userId: adminUid,
          applicationId: params.applicationId,
          type: 'application',
          title: '外部申請が受理されました',
          message: `${params.employeeName}さんの${params.applicationTypeName}が外部機関で受理されました。`,
          read: false,
          priority: 'high',
          organizationId: params.organizationId
        });
      }
    } else if (params.externalStatus === 'error') {
      // エラー通知：管理者へ
      for (const adminUid of adminUids) {
        notifications.push({
          userId: adminUid,
          applicationId: params.applicationId,
          type: 'system',
          title: '外部申請でエラーが発生しました',
          message: `${params.employeeName}さんの${params.applicationTypeName}で送信エラーまたは受理不可が発生しました。対応が必要です。`,
          read: false,
          priority: 'high',
          organizationId: params.organizationId
        });
      }
    }

    if (notifications.length > 0) {
      await this.createNotifications(notifications);
    }
  }

  /**
   * 算定計算のリマインダー通知を作成
   */
  async createStandardRewardCalculationReminder(params: {
    organizationId: string;
    targetYear: number;
  }): Promise<void> {
    const notifications: Omit<Notification, 'id' | 'createdAt'>[] = [];
    const adminUids = await this.getAdminUserUids(params.organizationId);

    for (const adminUid of adminUids) {
      notifications.push({
        userId: adminUid,
        applicationId: null,
        type: 'reminder',
        title: '算定計算の実行時期です',
        message: `${params.targetYear}年7月1日になりました。算定計算を実行してください。7月10日までに計算して算定届を提出してください。`,
        read: false,
        priority: 'high',
        organizationId: params.organizationId
      });
    }

    if (notifications.length > 0) {
      await this.createNotifications(notifications);
    }
  }

  /**
   * 月変計算のリマインダー通知を作成
   */
  async createMonthlyChangeCalculationReminder(params: {
    organizationId: string;
    changeYear: number;
    changeMonth: number;
    uncalculatedEmployees: Employee[];
  }): Promise<void> {
    const notifications: Omit<Notification, 'id' | 'createdAt'>[] = [];
    const adminUids = await this.getAdminUserUids(params.organizationId);

    // 未計算の社員名を取得
    const employeeNames = params.uncalculatedEmployees
      .map(emp => `${emp.lastName} ${emp.firstName}`)
      .slice(0, 5); // 最大5名まで表示
    
    const employeeList = employeeNames.length > 0 
      ? employeeNames.join('、')
      : '';
    
    const moreCount = params.uncalculatedEmployees.length > 5 
      ? `他${params.uncalculatedEmployees.length - 5}名`
      : '';
    
    const employeeInfo = employeeList + (moreCount ? `、${moreCount}` : '');
    
    const message = `${params.changeYear}年${params.changeMonth}月の固定賃金変動で月変計算未計算の社員がいます（${employeeInfo}）。月変計算を実行してください。`;

    for (const adminUid of adminUids) {
      notifications.push({
        userId: adminUid,
        applicationId: null,
        type: 'reminder',
        title: '月変計算の実行時期です',
        message: message,
        read: false,
        priority: 'high',
        organizationId: params.organizationId
      });
    }

    if (notifications.length > 0) {
      await this.createNotifications(notifications);
    }
  }

  /**
   * 算定計算のリマインダーをチェックして送信（7月1日になったら通知）
   * 未計算の社員がいる場合のみ通知を送信
   */
  async checkAndSendStandardRewardReminders(organizationId: string, skipDuplicateCheck: boolean = false): Promise<void> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    // 7月1日になったら通知
    if (currentMonth === 7 && currentDay === 1) {
      const adminUids = await this.getAdminUserUids(organizationId);
      if (adminUids.length === 0) {
        return;
      }

      // 重複チェック（手動送信時はスキップ）
      if (!skipDuplicateCheck) {
        // 既に通知が送信されているかチェック（同じ日付の通知が既にある場合は送信しない）
        // 今日の日付で既に通知が送信されているかチェック
        const todayStart = new Date(currentYear, 6, 1, 0, 0, 0);
        const todayEnd = new Date(currentYear, 6, 1, 23, 59, 59);

        const existingNotifications = await this.getUserNotifications(adminUids[0], organizationId, {
          type: 'reminder',
          limitCount: 100
        });

        const hasTodayNotification = existingNotifications.some(notification => {
          const notificationDate = notification.createdAt instanceof Date 
            ? notification.createdAt 
            : (notification.createdAt as any).toDate();
          return notificationDate >= todayStart && notificationDate <= todayEnd &&
                 notification.title === '算定計算の実行時期です' &&
                 notification.message.includes(`${currentYear}年7月1日`);
        });

        if (hasTodayNotification) {
          return;
        }
      }

      // 該当年の算定計算を取得
      const calculations = await this.standardRewardCalculationService.getCalculationsByOrganization(
        organizationId,
        'standard',
        currentYear
      );

      // 対象社員を取得
      // 循環依存を避けるため、メソッド内で遅延注入
      const employeeService = this.injector.get(EmployeeService);
      const employees = await employeeService.getEmployeesByOrganization(organizationId);
      
      // 算定計算の対象者条件をチェック
      const cutoffDate = new Date(currentYear, 5, 31); // 5月31日
      const targetEmployees: Employee[] = [];

      for (const employee of employees) {
        if (!employee.id) continue;

        const joinDate = employee.joinDate instanceof Date 
          ? employee.joinDate 
          : new Date((employee.joinDate as any).seconds * 1000);
        
        // 入社日が6月1日以降の場合は対象外
        if (joinDate > cutoffDate) continue;

        // 退職日の翌日が含まれる月以降は除外
        if (employee.retirementDate) {
          const retirementDate = employee.retirementDate instanceof Date 
            ? employee.retirementDate 
            : new Date((employee.retirementDate as any).seconds * 1000);
          const nextDay = new Date(retirementDate);
          nextDay.setDate(nextDay.getDate() + 1); // 退職日の翌日
          const nextDayYear = nextDay.getFullYear();
          const nextDayMonth = nextDay.getMonth() + 1;
          
          // 7月が退職日の翌日が含まれる月以降なら除外
          if (currentYear > nextDayYear || (currentYear === nextDayYear && 7 >= nextDayMonth)) {
            continue;
          }
        }

        // 6月給与が確定済みか確認
        const juneSalary = await this.salaryDataService.getSalaryData(employee.id, currentYear, 6);
        if (!juneSalary || !juneSalary.isConfirmed) continue;

        targetEmployees.push(employee);
      }

      // 算定計算が存在しない社員をチェック
      const calculatedEmployeeIds = new Set(calculations.map(c => c.employeeId));
      const uncalculatedEmployees = targetEmployees.filter(emp => !calculatedEmployeeIds.has(emp.id!));

      // 未計算の社員がいる場合のみ通知を送信
      if (uncalculatedEmployees.length > 0) {
        await this.createStandardRewardCalculationReminder({
          organizationId,
          targetYear: currentYear
        });
      }
    }
  }

  /**
   * 月変計算のリマインダーをチェックして送信
   * 変動月から4か月目に入ったら通知
   * 未計算の社員がいる場合のみ通知を送信
   */
  async checkAndSendMonthlyChangeReminders(organizationId: string, skipDuplicateCheck: boolean = false): Promise<void> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // 該当組織の月変計算を取得
    const calculations = await this.standardRewardCalculationService.getCalculationsByOrganization(
      organizationId,
      'monthly_change'
    );

    // 全社員を取得
    // 循環依存を避けるため、メソッド内で遅延注入
    const employeeService = this.injector.get(EmployeeService);
    const employees = await employeeService.getEmployeesByOrganization(organizationId);

    // 変動月ごとに未計算の社員を集計
    const uncalculatedByChangeMonth = new Map<string, { year: number; month: number; employees: Employee[] }>();

    for (const employee of employees) {
      if (!employee.id) continue;

      // 変動月を検出（過去12か月分をチェック）
      const checkYear = currentYear;
      const checkMonth = currentMonth;
      
      try {
        const changeMonths = await this.standardRewardCalculationService.detectFixedSalaryChanges(
          employee.id,
          checkYear,
          checkMonth
        );

        for (const changeMonthInfo of changeMonths) {
          const changeYear = changeMonthInfo.year;
          const changeMonth = changeMonthInfo.month;

          // 変動月から4か月目を計算
          let fourthMonthYear = changeYear;
          let fourthMonth = changeMonth + 3;
          if (fourthMonth > 12) {
            fourthMonth -= 12;
            fourthMonthYear++;
          }

          // 現在が変動月から4か月目かチェック（4か月目に入ったら通知）
          if (currentYear !== fourthMonthYear || currentMonth !== fourthMonth) {
            continue;
          }

          // 変動月の月変計算が存在するかチェック
          const hasCalculation = calculations.some(c => 
            c.employeeId === employee.id &&
            c.changeMonth?.year === changeYear &&
            c.changeMonth?.month === changeMonth
          );

          // 未計算の社員のみ集計
          if (!hasCalculation) {
            const key = `${changeYear}-${changeMonth}`;
            if (!uncalculatedByChangeMonth.has(key)) {
              uncalculatedByChangeMonth.set(key, {
                year: changeYear,
                month: changeMonth,
                employees: []
              });
            }
            uncalculatedByChangeMonth.get(key)!.employees.push(employee);
          }
        }
      } catch (error) {
        console.error(`社員 ${employee.id} の変動月検出に失敗しました:`, error);
        continue;
      }
    }

    const adminUids = await this.getAdminUserUids(organizationId);
    if (adminUids.length === 0) {
      return;
    }

    // 重複チェック用の既存通知を取得（手動送信時はスキップ）
    let existingNotifications: Notification[] = [];
    if (!skipDuplicateCheck) {
      existingNotifications = await this.getUserNotifications(adminUids[0], organizationId, {
        type: 'reminder',
        limitCount: 100
      });
    }

    // 変動月ごとに通知を送信
    for (const [key, data] of uncalculatedByChangeMonth) {
      // 重複チェック（手動送信時はスキップ）
      if (!skipDuplicateCheck) {
        // 既に通知が送信されているかチェック
        const hasNotification = existingNotifications.some(notification => {
          const notificationDate = notification.createdAt instanceof Date 
            ? notification.createdAt 
            : (notification.createdAt as any).toDate();
          const notificationYear = notificationDate.getFullYear();
          const notificationMonth = notificationDate.getMonth() + 1;
          
          return notificationYear === currentYear &&
                 notificationMonth === currentMonth &&
                 notification.title === '月変計算の実行時期です' &&
                 notification.message.includes(`${data.year}年${data.month}月`);
        });

        if (hasNotification) {
          continue;
        }
      }

      // 未計算の社員がいる場合のみ通知を送信
      if (data.employees.length > 0) {
        await this.createMonthlyChangeCalculationReminder({
          organizationId,
          changeYear: data.year,
          changeMonth: data.month,
          uncalculatedEmployees: data.employees
        });
      }
    }
  }

  /**
   * 期限リマインダーをチェックして送信
   * 事前通知、当日通知、期限超過通知を送信
   */
  async checkAndSendDeadlineReminders(organizationId: string, skipDuplicateCheck: boolean = false): Promise<void> {
    const now = new Date();
    const currentHour = now.getHours();

    // 組織情報を取得
    const organization = await this.organizationService.getOrganization(organizationId);
    if (!organization?.applicationFlowSettings?.notificationSettings) {
      return;
    }

    const reminderSettings = organization.applicationFlowSettings.notificationSettings.reminderSettings;
    if (!reminderSettings) {
      return;
    }

    // 組織の申請一覧を取得（pending, pending_received, pending_not_received のみ）
    const allApplications = await this.applicationService.getApplicationsByOrganization(organizationId);

    // pending, pending_received, pending_not_received の申請のみをフィルタ
    const targetApplications = allApplications.filter(app => 
      app.status === 'pending' || 
      app.status === 'pending_received' || 
      app.status === 'pending_not_received'
    );

    // 申請種別を取得
    const applicationTypes = organization.applicationFlowSettings.applicationTypes || [];

    const adminUids = await this.getAdminUserUids(organizationId);
    if (adminUids.length === 0) {
      return;
    }

    // 重複チェック用の既存通知を取得（手動送信時はスキップ）
    let existingNotifications: Notification[] = [];
    if (!skipDuplicateCheck) {
      existingNotifications = await this.getUserNotifications(adminUids[0], organizationId, {
        type: 'reminder',
        limitCount: 1000
      });
    }

    // 各申請について期限リマインダーをチェック
    for (const application of targetApplications) {
      const applicationType = applicationTypes.find(type => type.id === application.type);
      if (!applicationType) {
        continue;
      }

      // 外部申請が既に送信されている場合は通知しない
      if (application.externalApplicationStatus === 'sent') {
        continue;
      }

      // 該当社員の外部申請が既に送信されているかチェック（申請種別ごと）
      const employeeExternalApplications = await this.applicationService.getApplicationsByOrganization(organizationId, {
        employeeId: application.employeeId,
        category: 'external'
      });

      const hasSentExternalApplication = employeeExternalApplications.some(app => 
        app.type === applicationType.id &&
        app.externalApplicationStatus === 'sent'
      );

      if (hasSentExternalApplication) {
        continue; // 該当社員の外部申請が既に送信されている場合は通知しない
      }

      // 法定期限を計算
      const legalDeadline = await this.deadlineCalculationService.calculateLegalDeadline(
        application,
        applicationType
      );

      // 管理者設定期限を取得
      const adminDeadline = application.deadline 
        ? (application.deadline instanceof Date 
            ? application.deadline 
            : new Date((application.deadline as any).seconds * 1000))
        : null;

      // 内部申請が絡む外部申請で法定期限超過時の処理
      let effectiveDeadline: Date | null = null;
      if (legalDeadline && now > legalDeadline && application.relatedInternalApplicationIds && application.relatedInternalApplicationIds.length > 0) {
        // 社員の申請日＋1営業日を期限とする
        effectiveDeadline = this.deadlineCalculationService.calculateOverdueDeadline(application);
      } else {
        effectiveDeadline = legalDeadline || adminDeadline;
      }

      if (!effectiveDeadline) {
        continue;
      }

      // 期限までの日数を計算
      const daysUntilDeadline = Math.floor((effectiveDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // 事前通知（X日前、Y日前）
      if (reminderSettings.notifyBeforeDeadline) {
        // 管理者向け：法定期限のX日前
        if (legalDeadline && daysUntilDeadline === reminderSettings.adminDaysBeforeLegalDeadline) {
          await this.sendDeadlineReminder({
            application,
            applicationType,
            deadline: legalDeadline,
            daysUntilDeadline,
            targetUserIds: adminUids,
            isAdmin: true,
            existingNotifications,
            skipDuplicateCheck
          });
        }

        // 社員向け：管理者設定期限のY日前
        if (adminDeadline && applicationType.category === 'internal') {
          const daysUntilAdminDeadline = Math.floor((adminDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysUntilAdminDeadline === reminderSettings.employeeDaysBeforeAdminDeadline) {
            const employeeUid = await this.getUserUidByEmployeeId(application.employeeId);
            if (employeeUid) {
              await this.sendDeadlineReminder({
                application,
                applicationType,
                deadline: adminDeadline,
                daysUntilDeadline: daysUntilAdminDeadline,
                targetUserIds: [employeeUid],
                isAdmin: false,
                existingNotifications,
                skipDuplicateCheck
              });
            }
          }
        }
      }

      // 当日通知（10時くらい）
      if (reminderSettings.notifyOnDeadlineDay && currentHour >= 10) {
        const isDeadlineDay = daysUntilDeadline === 0;
        if (isDeadlineDay) {
          // 管理者向け
          await this.sendDeadlineReminder({
            application,
            applicationType,
            deadline: effectiveDeadline,
            daysUntilDeadline: 0,
            targetUserIds: adminUids,
            isAdmin: true,
            existingNotifications,
            skipDuplicateCheck
          });

          // 社員向け（内部申請の場合）
          if (applicationType.category === 'internal' && adminDeadline) {
            const employeeUid = await this.getUserUidByEmployeeId(application.employeeId);
            if (employeeUid) {
              await this.sendDeadlineReminder({
                application,
                applicationType,
                deadline: adminDeadline,
                daysUntilDeadline: 0,
                targetUserIds: [employeeUid],
                isAdmin: false,
                existingNotifications,
                skipDuplicateCheck
              });
            }
          }
        }
      }

      // 期限超過通知（毎日）
      if (reminderSettings.notifyOnOverdue && daysUntilDeadline < 0) {
        // 重複チェック（手動送信時はスキップ）
        if (!skipDuplicateCheck) {
          // 今日既に通知が送信されているかチェック
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
          const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
          
          const hasTodayNotification = existingNotifications.some(notification => {
            const notificationDate = notification.createdAt instanceof Date 
              ? notification.createdAt 
              : (notification.createdAt as any).toDate();
            return notificationDate >= todayStart && 
                   notificationDate <= todayEnd &&
                   notification.applicationId === application.id &&
                   notification.title.includes('期限超過');
          });

          if (hasTodayNotification) {
            continue; // 今日既に通知が送信されている場合はスキップ
          }
        }

        // 管理者向け
        await this.sendDeadlineReminder({
          application,
          applicationType,
          deadline: effectiveDeadline,
          daysUntilDeadline,
          targetUserIds: adminUids,
          isAdmin: true,
          existingNotifications,
          isOverdue: true,
          skipDuplicateCheck
        });

        // 社員向け（内部申請の場合）
        if (applicationType.category === 'internal' && adminDeadline) {
          const employeeUid = await this.getUserUidByEmployeeId(application.employeeId);
          if (employeeUid) {
            await this.sendDeadlineReminder({
              application,
              applicationType,
              deadline: adminDeadline,
              daysUntilDeadline: Math.floor((adminDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
              targetUserIds: [employeeUid],
              isAdmin: false,
              existingNotifications,
              isOverdue: true,
              skipDuplicateCheck
            });
          }
        }
      }
    }

    // 申請がない場合の期限超過通知をチェック（applicationIdがnullの通知から）
    await this.checkOverdueNotificationsWithoutApplication(organizationId, reminderSettings, adminUids, skipDuplicateCheck);
  }

  /**
   * 申請がない場合の期限超過通知をチェックして送信
   * 社員一覧から直接取得して、各社員について各外部申請種別の期限をチェック
   */
  private async checkOverdueNotificationsWithoutApplication(
    organizationId: string,
    reminderSettings: any,
    adminUids: string[],
    skipDuplicateCheck: boolean = false
  ): Promise<void> {
    if (!reminderSettings.notifyOnOverdue) {
      return;
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    // 組織の申請種別を取得
    const organization = await this.organizationService.getOrganization(organizationId);
    if (!organization?.applicationFlowSettings?.applicationTypes) {
      return;
    }

    const applicationTypes = organization.applicationFlowSettings.applicationTypes || [];
    // 外部申請種別のみをフィルタ
    const externalApplicationTypes = applicationTypes.filter(type => type.category === 'external');

    if (externalApplicationTypes.length === 0) {
      return;
    }

    // 重複チェック用の既存通知を取得（手動送信時はスキップ）
    let existingNotifications: Notification[] = [];
    if (!skipDuplicateCheck) {
      existingNotifications = await this.getUserNotifications(adminUids[0], organizationId, {
        type: 'reminder',
        limitCount: 1000
      });
    }

    // 社員一覧を取得
    const employeeService = this.injector.get(EmployeeService);
    const employees = await employeeService.getEmployeesByOrganization(organizationId);

    // 各社員について、各外部申請種別の期限超過をチェック
    for (const employee of employees) {
      if (!employee.id) continue;

      for (const applicationType of externalApplicationTypes) {
        // 該当社員の外部申請が既に送信されているかチェック
        const applicationService = this.injector.get(ApplicationService);
        const externalApplications = await applicationService.getApplicationsByOrganization(organizationId, {
          employeeId: employee.id,
          category: 'external'
        });

        const hasSentApplication = externalApplications.some(app => 
          app.type === applicationType.id &&
          app.externalApplicationStatus === 'sent'
        );

        if (hasSentApplication) {
          continue; // 既に送信されている場合はスキップ
        }

        // 仮想的な申請データを作成して期限を計算
        const virtualApplication: Application = {
          id: undefined,
          type: applicationType.id,
          category: 'external',
          employeeId: employee.id,
          organizationId: organizationId,
          status: 'pending',
          data: {},
          createdAt: new Date(), // 現在日時を使用
          updatedAt: new Date()
        };

        const deadline = await this.deadlineCalculationService.calculateLegalDeadline(
          virtualApplication,
          applicationType
        );

        if (!deadline) continue;

        // 期限までの日数を計算
        const daysUntilDeadline = Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        // 期限超過の場合
        if (daysUntilDeadline < 0) {
          // 重複チェック（手動送信時はスキップ）
          if (!skipDuplicateCheck) {
            // 今日既に通知が送信されているかチェック
            const hasTodayNotification = existingNotifications.some(n => {
              const notificationDate = n.createdAt instanceof Date 
                ? n.createdAt 
                : (n.createdAt as any).toDate();
              return notificationDate >= todayStart && 
                     notificationDate <= todayEnd &&
                     n.employeeId === employee.id &&
                     n.applicationId === null &&
                     n.title.includes('期限超過') &&
                     n.message.includes(applicationType.name);
            });

            if (hasTodayNotification) {
              continue; // 今日既に通知が送信されている場合はスキップ
            }
          }

          // 期限超過通知を送信
          const deadlineStr = deadline.toLocaleDateString('ja-JP', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });

          const notifications: Omit<Notification, 'id' | 'createdAt'>[] = [];
          for (const adminUid of adminUids) {
            notifications.push({
              userId: adminUid,
              applicationId: null,
              employeeId: employee.id, // 社員IDを必ず含める
              type: 'reminder',
              title: '申請期限超過のお知らせ',
              message: `${applicationType.name}の申請が期限（${deadlineStr}）を超過しています。`,
              read: false,
              priority: 'high',
              organizationId
            });
          }

          if (notifications.length > 0) {
            await this.createNotifications(notifications);
          }
        }
      }
    }
  }

  /**
   * 期限リマインダー通知を送信
   */
  private async sendDeadlineReminder(params: {
    application: Application;
    applicationType: any;
    deadline: Date;
    daysUntilDeadline: number;
    targetUserIds: string[];
    isAdmin: boolean;
    existingNotifications: Notification[];
    isOverdue?: boolean;
    skipDuplicateCheck?: boolean;
  }): Promise<void> {
    const { application, applicationType, deadline, daysUntilDeadline, targetUserIds, isAdmin, existingNotifications, isOverdue, skipDuplicateCheck = false } = params;

    const deadlineStr = deadline.toLocaleDateString('ja-JP', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    let title: string;
    let message: string;

    if (isOverdue) {
      title = '申請期限超過のお知らせ';
      message = `${applicationType.name}の申請が期限（${deadlineStr}）を超過しています。`;
    } else if (daysUntilDeadline === 0) {
      title = '申請期限当日のお知らせ';
      message = `${applicationType.name}の申請の期限は本日（${deadlineStr}）です。`;
    } else {
      title = '申請期限のお知らせ';
      message = `${applicationType.name}の申請の期限まであと${daysUntilDeadline}日です（期限：${deadlineStr}）。`;
    }

    // 各種申請の期限日が土日祝の場合、翌営業日が期限となる可能性があることを記載
    if (!isOverdue && daysUntilDeadline > 0) {
      message += ' ※期限日が土日祝の場合は、翌営業日が期限となる可能性があります。';
    }

    const notifications: Omit<Notification, 'id' | 'createdAt'>[] = [];

    // 各ユーザーごとに重複チェックを行う
    for (const userId of targetUserIds) {
      // 重複チェック（手動送信時はスキップ）
      if (!skipDuplicateCheck) {
        // 該当ユーザーの既存通知を取得
        const userNotifications = await this.getUserNotifications(userId, application.organizationId, {
          type: 'reminder',
          limitCount: 1000
        });

        // 既に通知が送信されているかチェック（該当ユーザーの通知のみをチェック）
        const hasNotification = userNotifications.some(notification => {
          return notification.applicationId === application.id &&
                 notification.title.includes(isOverdue ? '期限超過' : '期限') &&
                 notification.message.includes(applicationType.name);
        });

        // 期限超過通知以外は重複チェック
        if (hasNotification && !isOverdue) {
          continue; // このユーザーには送信しない
        }
      }

      // 重複がない場合のみ通知を追加
      notifications.push({
        userId,
        applicationId: application.id || null,
        employeeId: application.employeeId, // 社員IDを追加
        type: 'reminder',
        title,
        message,
        read: false,
        priority: isOverdue ? 'high' : daysUntilDeadline <= 1 ? 'high' : 'medium',
        organizationId: application.organizationId
      });
    }

    if (notifications.length > 0) {
      await this.createNotifications(notifications);
    }
  }

  /**
   * 期限設定時に即時通知を送信（事前通知のリマインダー日を過ぎている場合）
   * @param organizationId 組織ID
   * @param employeeId 社員ID
   * @param applicationTypeCode 申請種別コード
   * @param deadline 期限
   * @param isAdminDeadline 管理者設定期限かどうか（falseの場合は法定期限）
   */
  async sendImmediateDeadlineReminderIfNeeded(
    organizationId: string,
    employeeId: string,
    applicationTypeCode: string,
    deadline: Date,
    isAdminDeadline: boolean = false
  ): Promise<void> {
    const now = new Date();
    
    // 組織情報を取得
    const organization = await this.organizationService.getOrganization(organizationId);
    if (!organization?.applicationFlowSettings?.notificationSettings?.reminderSettings) {
      return;
    }

    const reminderSettings = organization.applicationFlowSettings.notificationSettings.reminderSettings;

    // 申請種別を取得
    const applicationTypes = organization.applicationFlowSettings.applicationTypes || [];
    const applicationType = applicationTypes.find(type => type.code === applicationTypeCode);
    if (!applicationType) {
      return;
    }

    // 期限までの日数を計算
    const daysUntilDeadline = Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // 該当社員の外部申請が既に送信されているかチェック
    const externalApplications = await this.applicationService.getApplicationsByOrganization(organizationId, {
      employeeId,
      category: 'external'
    });

    const hasSentApplication = externalApplications.some(app => 
      app.type === applicationType.id &&
      app.externalApplicationStatus === 'sent'
    );

    if (hasSentApplication) {
      return; // 既に送信されている場合は通知しない
    }

    const deadlineStr = deadline.toLocaleDateString('ja-JP', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // 期限超過の場合
    if (daysUntilDeadline < 0) {
      if (reminderSettings.notifyOnOverdue && !isAdminDeadline) {
        // 管理者向け：期限超過通知を送信
        const adminUids = await this.getAdminUserUids(organizationId);
        if (adminUids.length > 0) {
          const notifications: Omit<Notification, 'id' | 'createdAt'>[] = [];
          for (const adminUid of adminUids) {
            notifications.push({
              userId: adminUid,
              applicationId: null,
              employeeId: employeeId,
              type: 'reminder',
              title: '申請期限超過のお知らせ',
              message: `${applicationType.name}の申請が期限（${deadlineStr}）を超過しています。`,
              read: false,
              priority: 'high',
              organizationId
            });
          }

          if (notifications.length > 0) {
            await this.createNotifications(notifications);
          }
        }
      }
      return; // 期限超過の場合はここで終了
    }

    // 当日の場合
    if (daysUntilDeadline === 0) {
      if (reminderSettings.notifyOnDeadlineDay) {
        if (!isAdminDeadline) {
          // 管理者向け：当日通知を送信
          const adminUids = await this.getAdminUserUids(organizationId);
          if (adminUids.length > 0) {
            const notifications: Omit<Notification, 'id' | 'createdAt'>[] = [];
            for (const adminUid of adminUids) {
              notifications.push({
                userId: adminUid,
                applicationId: null,
                employeeId: employeeId,
                type: 'reminder',
                title: '申請期限当日のお知らせ',
                message: `${applicationType.name}の申請の期限は本日（${deadlineStr}）です。`,
                read: false,
                priority: 'high',
                organizationId
              });
            }

            if (notifications.length > 0) {
              await this.createNotifications(notifications);
            }
          }
        } else if (applicationType.category === 'internal') {
          // 社員向け：管理者設定期限の当日通知（内部申請の場合のみ）
          const employeeUid = await this.getUserUidByEmployeeId(employeeId);
          if (employeeUid) {
            await this.createNotifications([{
              userId: employeeUid,
              applicationId: null,
              employeeId: employeeId,
              type: 'reminder',
              title: '申請期限当日のお知らせ',
              message: `${applicationType.name}の申請の期限は本日（${deadlineStr}）です。`,
              read: false,
              priority: 'high',
              organizationId
            }]);
          }
        }
      }
      return; // 当日の場合はここで終了
    }

    // 事前通知（期限前日以前のみ）
    if (daysUntilDeadline >= 1 && reminderSettings.notifyBeforeDeadline) {
      // 管理者向け：法定期限のX日前を過ぎている場合（期限前日以前のみ）
      if (!isAdminDeadline && daysUntilDeadline < reminderSettings.adminDaysBeforeLegalDeadline) {
        const adminUids = await this.getAdminUserUids(organizationId);
        if (adminUids.length > 0) {
          const notifications: Omit<Notification, 'id' | 'createdAt'>[] = [];
          for (const adminUid of adminUids) {
            notifications.push({
              userId: adminUid,
              applicationId: null,
              employeeId: employeeId,
              type: 'reminder',
              title: '申請期限のお知らせ',
              message: `${applicationType.name}の申請の期限まであと${daysUntilDeadline}日です（期限：${deadlineStr}）。`,
              read: false,
              priority: daysUntilDeadline <= 1 ? 'high' : 'medium',
              organizationId
            });
          }

          if (notifications.length > 0) {
            await this.createNotifications(notifications);
          }
        }
      }

      // 社員向け：管理者設定期限のY日前を過ぎている場合（内部申請の場合のみ、期限前日以前のみ）
      if (isAdminDeadline && applicationType.category === 'internal' && daysUntilDeadline < reminderSettings.employeeDaysBeforeAdminDeadline) {
        const employeeUid = await this.getUserUidByEmployeeId(employeeId);
        if (employeeUid) {
          await this.createNotifications([{
            userId: employeeUid,
            applicationId: null,
            employeeId: employeeId,
            type: 'reminder',
            title: '申請期限のお知らせ',
            message: `${applicationType.name}の申請の期限まであと${daysUntilDeadline}日です（期限：${deadlineStr}）。`,
            read: false,
            priority: daysUntilDeadline <= 1 ? 'high' : 'medium',
            organizationId
          }]);
        }
      }
    }
  }
}

