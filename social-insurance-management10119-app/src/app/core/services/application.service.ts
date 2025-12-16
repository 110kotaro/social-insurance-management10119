import { Injectable, inject, Injector } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, Timestamp, orderBy, limit } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL, deleteObject } from '@angular/fire/storage';
import { Application, ApplicationStatus, ExternalApplicationStatus, Comment, Attachment, ApplicationHistory, ApplicationReturnHistory } from '../models/application.model';
import { environment } from '../../../environments/environment';
import { DeadlineCalculationService } from './deadline-calculation.service';
import { NotificationService } from './notification.service';
import { OrganizationService } from './organization.service';

@Injectable({
  providedIn: 'root'
})
export class ApplicationService {
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private deadlineCalculationService = inject(DeadlineCalculationService);
  private organizationService = inject(OrganizationService);
  private injector = inject(Injector);

  /**
   * オブジェクトからundefined値を再帰的に削除するヘルパー関数
   */
  private removeUndefinedValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeUndefinedValues(item));
    }
    
    if (typeof obj === 'object' && obj.constructor === Object) {
      const cleaned: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          if (value !== undefined) {
            cleaned[key] = this.removeUndefinedValues(value);
          }
        }
      }
      return cleaned;
    }
    
    return obj;
  }

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
   * ApplicationドキュメントをApplicationオブジェクトに変換
   */
  private convertToApplication(docSnapshot: any): Application {
    const data = docSnapshot.data();
    return {
      id: docSnapshot.id,
      type: data['type'],
      category: data['category'],
      employeeId: data['employeeId'],
      organizationId: data['organizationId'],
      status: data['status'],
      data: data['data'] || {},
      attachments: data['attachments']?.map((att: any) => ({
        fileName: att.fileName,
        fileUrl: att.fileUrl,
        uploadedAt: this.convertTimestampToDate(att.uploadedAt) || new Date()
      })) || [],
      comments: data['comments']?.map((comment: any) => ({
        userId: comment.userId,
        comment: comment.comment,
        type: comment.type,
        createdAt: this.convertTimestampToDate(comment.createdAt) || new Date()
      })) || [],
      history: data['history']?.map((hist: any) => ({
        userId: hist.userId,
        action: hist.action,
        comment: hist.comment,
        createdAt: this.convertTimestampToDate(hist.createdAt) || new Date()
      })) || [],
      returnHistory: data['returnHistory']?.map((hist: any) => ({
        returnedAt: this.convertTimestampToDate(hist.returnedAt) || new Date(),
        returnedBy: hist.returnedBy,
        reason: hist.reason,
        dataSnapshot: hist.dataSnapshot || {},
        attachmentsSnapshot: hist.attachmentsSnapshot?.map((att: any) => ({
          fileName: att.fileName,
          fileUrl: att.fileUrl,
          uploadedAt: this.convertTimestampToDate(att.uploadedAt) || new Date()
        })) || [],
        submissionDate: hist.submissionDate ? this.convertTimestampToDate(hist.submissionDate) : undefined
      })) || [],
      externalApplicationStatus: data['externalApplicationStatus'] || null,
      deadline: this.convertTimestampToDate(data['deadline']) || null,
      relatedInternalApplicationIds: data['relatedInternalApplicationIds'] || undefined,
      relatedExternalApplicationIds: data['relatedExternalApplicationIds'] || undefined,
      submissionDate: data['submissionDate'] ? this.convertTimestampToDate(data['submissionDate']) : undefined,
      createdAt: this.convertTimestampToDate(data['createdAt']) || new Date(),
      updatedAt: this.convertTimestampToDate(data['updatedAt']) || new Date(),
      withdrawnAt: this.convertTimestampToDate(data['withdrawnAt']) || null
    };
  }

  /**
   * 申請を作成
   */
  async createApplication(application: Omit<Application, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const appRef = doc(collection(this.firestore, `${environment.firestorePrefix}applications`));
    const now = new Date();
    
    const appData: any = {
      type: application.type,
      category: application.category,
      employeeId: application.employeeId,
      organizationId: application.organizationId,
      status: application.status,
      data: application.data || {},
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now)
    };

    // オプショナルフィールドの追加
    if (application.attachments && application.attachments.length > 0) {
      appData.attachments = application.attachments.map(att => ({
        fileName: att.fileName,
        fileUrl: att.fileUrl,
        uploadedAt: att.uploadedAt instanceof Date ? Timestamp.fromDate(att.uploadedAt) : att.uploadedAt
      }));
    }

    if (application.comments && application.comments.length > 0) {
      appData.comments = application.comments.map(comment => ({
        userId: comment.userId,
        comment: comment.comment,
        type: comment.type,
        createdAt: comment.createdAt instanceof Date ? Timestamp.fromDate(comment.createdAt) : comment.createdAt
      }));
    }

    if (application.history && application.history.length > 0) {
      appData.history = application.history.map(hist => ({
        userId: hist.userId,
        action: hist.action,
        comment: hist.comment,
        createdAt: hist.createdAt instanceof Date ? Timestamp.fromDate(hist.createdAt) : hist.createdAt
      }));
    }

    if (application.externalApplicationStatus !== undefined) {
      appData.externalApplicationStatus = application.externalApplicationStatus;
    }

    if (application.deadline) {
      appData.deadline = application.deadline instanceof Date ? Timestamp.fromDate(application.deadline) : application.deadline;
    }

    if (application.withdrawnAt) {
      appData.withdrawnAt = application.withdrawnAt instanceof Date ? Timestamp.fromDate(application.withdrawnAt) : application.withdrawnAt;
    }

    if (application.submissionDate) {
      appData.submissionDate = application.submissionDate instanceof Date ? Timestamp.fromDate(application.submissionDate) : application.submissionDate;
    }

    if (application.relatedInternalApplicationIds && application.relatedInternalApplicationIds.length > 0) {
      appData.relatedInternalApplicationIds = application.relatedInternalApplicationIds;
    }

    if (application.relatedExternalApplicationIds && application.relatedExternalApplicationIds.length > 0) {
      appData.relatedExternalApplicationIds = application.relatedExternalApplicationIds;
    }

    const cleanedData = this.removeUndefinedValues(appData);
    await setDoc(appRef, cleanedData);

    // 【修正20】通知機能を削除するためコメントアウト
    // 内部申請が送信された場合、関連する外部申請の期限設定と即時通知を送信
    // if (application.category === 'internal' && application.status === 'pending') {
    //   await this.setDeadlineAndSendReminderForInternalApplication(appRef.id, application);
    // }

    return appRef.id;
  }

  /**
   * 内部申請送信時に、関連する外部申請の期限設定と即時通知を送信
   */
  private async setDeadlineAndSendReminderForInternalApplication(
    applicationId: string,
    application: Omit<Application, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<void> {
    // 組織情報を取得
    const organization = await this.organizationService.getOrganization(application.organizationId);
    if (!organization?.applicationFlowSettings?.applicationTypes) {
      return;
    }

    // 内部申請の種別を取得
    const internalApplicationType = organization.applicationFlowSettings.applicationTypes.find(
      type => type.id === application.type && type.category === 'internal'
    );
    if (!internalApplicationType) {
      return;
    }

    // 内部申請の種別コードから外部申請の種別コードを取得
    const externalApplicationTypeCode = this.getExternalApplicationTypeCode(internalApplicationType.code);
    if (!externalApplicationTypeCode) {
      return; // 外部申請にマッピングされない内部申請はスキップ
    }

    // 外部申請の種別を取得
    const externalApplicationType = organization.applicationFlowSettings.applicationTypes.find(
      type => type.code === externalApplicationTypeCode && type.category === 'external'
    );
    if (!externalApplicationType) {
      return;
    }

    // 該当社員の外部申請が既に送信されているかチェック
    const externalApplications = await this.getApplicationsByOrganization(application.organizationId, {
      employeeId: application.employeeId,
      category: 'external'
    });

    const hasSentApplication = externalApplications.some(app => 
      app.type === externalApplicationType.id &&
      app.externalApplicationStatus === 'sent'
    );

    if (hasSentApplication) {
      return; // 既に送信されている場合は通知しない
    }

    // 修正: 住所変更届・氏名変更届は期限計算を行わない（通知はcheckAndSendAddressAndNameChangeNotificationsで送信）
    if (externalApplicationTypeCode === 'ADDRESS_CHANGE_EXTERNAL' || 
        externalApplicationTypeCode === 'NAME_CHANGE_EXTERNAL') {
      return; // 通知はcheckAndSendAddressAndNameChangeNotificationsで送信されるため、ここでは何もしない
    }

    // 被扶養者異動届は期限計算を行う（内部申請のデータから期限を計算）
    // 仮想的な外部申請データを作成して期限を計算
    const virtualExternalApplication: Application = {
      id: undefined,
      type: externalApplicationType.id,
      category: 'external',
      employeeId: application.employeeId,
      organizationId: application.organizationId,
      status: 'pending',
      data: application.data, // 内部申請のデータをそのまま使用
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const deadline = await this.deadlineCalculationService.calculateLegalDeadline(
      virtualExternalApplication,
      externalApplicationType
    );

    // 【修正20】通知機能を削除するためコメントアウト
    /*
    if (deadline) {
      // 即時通知を送信（事前通知のリマインダー日を過ぎている場合）
      // 循環依存を避けるため、メソッド内で遅延注入
      const notificationService = this.injector.get(NotificationService);
      await notificationService.sendImmediateDeadlineReminderIfNeeded(
        application.organizationId,
        application.employeeId,
        externalApplicationTypeCode,
        deadline,
        false // 法定期限
      );
    }
    */
  }

  /**
   * 内部申請種別コードから外部申請種別コードを取得
   */
  private getExternalApplicationTypeCode(internalTypeCode: string): string | null {
    const mapping: Record<string, string> = {
      'DEPENDENT_CHANGE': 'DEPENDENT_CHANGE_EXTERNAL',
      'ADDRESS_CHANGE': 'ADDRESS_CHANGE_EXTERNAL',
      'NAME_CHANGE': 'NAME_CHANGE_EXTERNAL'
    };
    return mapping[internalTypeCode] || null;
  }

  /**
   * 申請を取得
   */
  async getApplication(applicationId: string): Promise<Application | null> {
    const appRef = doc(this.firestore, `${environment.firestorePrefix}applications`, applicationId);
    const appSnapshot = await getDoc(appRef);

    if (!appSnapshot.exists()) {
      return null;
    }

    return this.convertToApplication(appSnapshot);
  }

  /**
   * 申請を更新
   */
  async updateApplication(applicationId: string, updates: Partial<Application>): Promise<void> {
    const appRef = doc(this.firestore, `${environment.firestorePrefix}applications`, applicationId);
    const updateData: any = {
      updatedAt: Timestamp.fromDate(new Date())
    };

    if (updates.status !== undefined) {
      updateData.status = updates.status;
    }

    if (updates.data !== undefined) {
      updateData.data = updates.data;
    }

    if (updates.attachments !== undefined) {
      updateData.attachments = updates.attachments.map(att => ({
        fileName: att.fileName,
        fileUrl: att.fileUrl,
        uploadedAt: att.uploadedAt instanceof Date ? Timestamp.fromDate(att.uploadedAt) : att.uploadedAt
      }));
    }

    if (updates.comments !== undefined) {
      updateData.comments = updates.comments.map(comment => ({
        userId: comment.userId,
        comment: comment.comment,
        type: comment.type,
        createdAt: comment.createdAt instanceof Date ? Timestamp.fromDate(comment.createdAt) : comment.createdAt
      }));
    }

    if (updates.history !== undefined) {
      updateData.history = updates.history.map(hist => ({
        userId: hist.userId,
        action: hist.action,
        comment: hist.comment,
        createdAt: hist.createdAt instanceof Date ? Timestamp.fromDate(hist.createdAt) : hist.createdAt
      }));
    }

    if (updates.externalApplicationStatus !== undefined) {
      updateData.externalApplicationStatus = updates.externalApplicationStatus;
    }

    if (updates.deadline !== undefined) {
      updateData.deadline = updates.deadline ? (updates.deadline instanceof Date ? Timestamp.fromDate(updates.deadline) : updates.deadline) : null;
    }

    if (updates.withdrawnAt !== undefined) {
      updateData.withdrawnAt = updates.withdrawnAt ? (updates.withdrawnAt instanceof Date ? Timestamp.fromDate(updates.withdrawnAt) : updates.withdrawnAt) : null;
    }

    if (updates.returnHistory !== undefined) {
      updateData.returnHistory = updates.returnHistory.map(hist => ({
        returnedAt: hist.returnedAt instanceof Date ? Timestamp.fromDate(hist.returnedAt) : hist.returnedAt,
        returnedBy: hist.returnedBy,
        reason: hist.reason,
        dataSnapshot: hist.dataSnapshot,
        attachmentsSnapshot: hist.attachmentsSnapshot?.map(att => ({
          fileName: att.fileName,
          fileUrl: att.fileUrl,
          uploadedAt: att.uploadedAt instanceof Date ? Timestamp.fromDate(att.uploadedAt) : att.uploadedAt
        })),
        submissionDate: hist.submissionDate ? (hist.submissionDate instanceof Date ? Timestamp.fromDate(hist.submissionDate) : hist.submissionDate) : undefined
      }));
    }

    if (updates.relatedInternalApplicationIds !== undefined) {
      updateData.relatedInternalApplicationIds = updates.relatedInternalApplicationIds;
    }

    if (updates.relatedExternalApplicationIds !== undefined) {
      updateData.relatedExternalApplicationIds = updates.relatedExternalApplicationIds;
    }

    if (updates.submissionDate !== undefined) {
      updateData.submissionDate = updates.submissionDate ? (updates.submissionDate instanceof Date ? Timestamp.fromDate(updates.submissionDate) : updates.submissionDate) : null;
    }

    const cleanedData = this.removeUndefinedValues(updateData);
    await updateDoc(appRef, cleanedData);
  }

  /**
   * 申請を削除
   */
  async deleteApplication(applicationId: string): Promise<void> {
    const appRef = doc(this.firestore, `${environment.firestorePrefix}applications`, applicationId);
    await deleteDoc(appRef);
  }

  /**
   * 組織の申請一覧を取得
   */
  async getApplicationsByOrganization(organizationId: string, options?: {
    status?: ApplicationStatus;
    category?: 'internal' | 'external';
    employeeId?: string;
    limitCount?: number;
  }): Promise<Application[]> {
    let q = query(
      collection(this.firestore, `${environment.firestorePrefix}applications`),
      where('organizationId', '==', organizationId),
      orderBy('createdAt', 'desc')
    );

    if (options?.status) {
      q = query(q, where('status', '==', options.status));
    }

    if (options?.category) {
      q = query(q, where('category', '==', options.category));
    }

    if (options?.employeeId) {
      q = query(q, where('employeeId', '==', options.employeeId));
    }

    if (options?.limitCount) {
      q = query(q, limit(options.limitCount));
    }

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => this.convertToApplication(doc));
  }

  /**
   * ファイルをアップロード
   */
  async uploadFile(file: File, organizationId: string, applicationId: string): Promise<string> {
    const filePath = `social-insurance/organizations/${organizationId}/documents/${applicationId}/${file.name}`;
    const fileRef = ref(this.storage, filePath);
    
    await uploadBytes(fileRef, file);
    const downloadURL = await getDownloadURL(fileRef);
    
    return downloadURL;
  }

  /**
   * ファイルを削除
   */
  async deleteFile(fileUrl: string): Promise<void> {
    try {
      const fileRef = ref(this.storage, fileUrl);
      await deleteObject(fileRef);
    } catch (error) {
      console.error('ファイル削除エラー:', error);
      // ファイルが存在しない場合はエラーを無視
    }
  }

  /**
   * コメントを追加
   */
  async addComment(applicationId: string, comment: Comment): Promise<void> {
    const application = await this.getApplication(applicationId);
    if (!application) {
      throw new Error('申請が見つかりません');
    }

    const comments = application.comments || [];
    comments.push({
      ...comment,
      createdAt: comment.createdAt instanceof Date ? comment.createdAt : new Date()
    });

    await this.updateApplication(applicationId, { comments });
  }

  /**
   * 申請履歴を追加
   */
  async addHistory(applicationId: string, history: ApplicationHistory): Promise<void> {
    const application = await this.getApplication(applicationId);
    if (!application) {
      throw new Error('申請が見つかりません');
    }

    const histories = application.history || [];
    histories.push({
      ...history,
      createdAt: history.createdAt instanceof Date ? history.createdAt : new Date()
    });

    await this.updateApplication(applicationId, { history: histories });
  }

  /**
   * ステータスを更新
   */
  async updateStatus(
    applicationId: string,
    status: ApplicationStatus,
    userId: string,
    comment?: string
  ): Promise<void> {
    const history: ApplicationHistory = {
      userId,
      action: (status === 'pending' || status === 'pending_received' || status === 'pending_not_received') ? 'submit' : 
              status === 'approved' ? 'approve' : 
              status === 'rejected' ? 'reject' : 
              status === 'returned' ? 'return' : 
              status === 'withdrawn' ? 'withdraw' : 
              status === 'created' ? 'submit' : 'submit',
      comment,
      createdAt: new Date()
    };

    await this.addHistory(applicationId, history);
    await this.updateApplication(applicationId, { status });
  }

  /**
   * 外部申請ステータスを更新
   */
  async updateExternalApplicationStatus(
    applicationId: string,
    status: ExternalApplicationStatus,
    userId: string,
    comment?: string
  ): Promise<void> {
    const history: ApplicationHistory = {
      userId,
      action: 'status_change',
      comment: comment || `送信ステータスを${this.getExternalApplicationStatusLabel(status)}に変更`,
      createdAt: new Date()
    };

    await this.addHistory(applicationId, history);
    await this.updateApplication(applicationId, { externalApplicationStatus: status });
  }

  /**
   * 外部申請ステータスのラベルを取得
   */
  private getExternalApplicationStatusLabel(status: ExternalApplicationStatus): string {
    const labels: Record<NonNullable<ExternalApplicationStatus>, string> = {
      sent: '送信済み（未受理）',
      received: '受理済み',
      error: 'エラー'
    };
    return status ? labels[status] : '未設定';
  }
}

