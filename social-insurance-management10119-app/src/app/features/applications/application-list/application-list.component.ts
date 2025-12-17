import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { Timestamp } from '@angular/fire/firestore';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApplicationService } from '../../../core/services/application.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ModeService } from '../../../core/services/mode.service';
import { DeadlineCalculationService } from '../../../core/services/deadline-calculation.service';
import { Application, ApplicationStatus, ApplicationCategory } from '../../../core/models/application.model';
import { Employee } from '../../../core/models/employee.model';
import { Organization } from '../../../core/models/organization.model';
import { ApplicationType } from '../../../core/models/application-flow.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-application-list',
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
    MatSortModule,
    MatTooltipModule,
    MatSnackBarModule
  ],
  templateUrl: './application-list.component.html',
  styleUrl: './application-list.component.css'
})
export class ApplicationListComponent implements OnInit, OnDestroy {
  private applicationService = inject(ApplicationService);
  private employeeService = inject(EmployeeService);
  private organizationService = inject(OrganizationService);
  private authService = inject(AuthService);
  private modeService = inject(ModeService);
  private deadlineCalculationService = inject(DeadlineCalculationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  searchForm: FormGroup;
  applications: Application[] = [];
  filteredApplications: Application[] = [];
  employees: Employee[] = [];
  organization: Organization | null = null;
  applicationDeadlineStatuses: Map<string, string> = new Map(); // 申請ID -> 期限ステータスのマップ
  displayedColumns: string[] = ['type', 'applicant', 'targetEmployees', 'category', 'status', 'createdAt', 'deadlineStatus', 'actions'];
  dataSource = new MatTableDataSource<Application>([]);
  applicationDeadlines: Map<string, Date | null> = new Map(); // 申請ID -> 期限のマップ
  
  // ページネーション
  pageSize = 10;
  pageIndex = 0;
  pageSizeOptions = [10, 25, 50, 100];
  
  // フィルタ
  selectedCategory: ApplicationCategory | '' = '';
  selectedStatus: ApplicationStatus | '' = '';
  selectedEmployeeId = '';
  selectedType = '';

  isAdmin = false;
  isAdminMode = false;
  organizationId: string | null = null;
  employeeId: string | null = null;

  private subscriptions = new Subscription();

  constructor() {
    this.searchForm = this.fb.group({
      category: [''],
      status: [''],
      employeeId: [''],
      type: ['']
    });
  }

  async ngOnInit(): Promise<void> {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    // 管理者かどうかを判定（roleベース）
    this.isAdmin = currentUser.role === 'admin' || currentUser.role === 'owner';
    this.organizationId = currentUser.organizationId;
    this.employeeId = currentUser.employeeId || null;

    // クエリパラメータからフィルタを読み込む
    this.route.queryParams.subscribe(params => {
      if (params['status']) {
        this.selectedStatus = params['status'] as ApplicationStatus;
        this.searchForm.patchValue({ status: this.selectedStatus });
      }
      if (params['category']) {
        this.selectedCategory = params['category'] as ApplicationCategory;
        this.searchForm.patchValue({ category: this.selectedCategory });
      }
      if (params['type']) {
        this.selectedType = params['type'] as string;
        this.searchForm.patchValue({ type: this.selectedType });
      }
    });

    // モードの変更を監視
    const modeSub = this.modeService.isAdminMode$.subscribe(isAdminMode => {
      this.isAdminMode = isAdminMode;
      // モード変更時に申請一覧を再読み込み
      if (this.organizationId) {
        this.loadApplications(this.organizationId);
      }
    });
    this.subscriptions.add(modeSub);

    // 組織情報と社員情報を先に読み込んでから申請一覧を読み込む（修正16）
    await this.loadOrganization(currentUser.organizationId);
    await this.loadEmployees(currentUser.organizationId);
    await this.loadApplications(currentUser.organizationId);

    // 検索フォームの変更を監視
    this.searchForm.valueChanges.subscribe(() => {
      this.applyFilters();
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
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
   * 社員一覧を読み込む
   */
  private async loadEmployees(organizationId: string): Promise<void> {
    try {
      this.employees = await this.employeeService.getEmployeesByOrganization(organizationId);
    } catch (error) {
      console.error('社員の読み込みに失敗しました:', error);
    }
  }

  /**
   * 申請一覧を読み込む
   */
  private async loadApplications(organizationId: string): Promise<void> {
    try {
      const options: any = {};
      
      // 社員モードの場合は自分の内部申請のみ
      // 管理者モードの場合は全申請を表示（ただし内部申請のdraft/createdは除外）
      if (!this.isAdminMode && this.employeeId) {
        options.employeeId = this.employeeId;
        // 社員モードの場合は内部申請のみ
        options.category = 'internal';
      }

      let allApplications = await this.applicationService.getApplicationsByOrganization(organizationId, options);
      
      // 管理者モードの場合、内部申請のdraft/created状態は除外（送信前の申請は管理者には見せない）
      if (this.isAdminMode) {
        this.applications = allApplications.filter(app => {
          // 内部申請のdraft/created状態は除外
          if (app.category === 'internal' && (app.status === 'draft' || app.status === 'created')) {
            return false;
          }
          return true;
        });
      } else {
        this.applications = allApplications;
      }
      
      // 期限を計算してマップに保存（修正16）
      await this.calculateDeadlines();
      
      this.applyFilters();
    } catch (error) {
      console.error('申請の読み込みに失敗しました:', error);
      this.snackBar.open('申請の読み込みに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * フィルタを適用
   */
  applyFilters(): void {
    const formValue = this.searchForm.value;
    this.selectedCategory = formValue.category || '';
    this.selectedStatus = formValue.status || '';
    this.selectedEmployeeId = formValue.employeeId || '';
    this.selectedType = formValue.type || '';

    this.filteredApplications = this.applications.filter(application => {
      // カテゴリフィルタ
      if (this.selectedCategory && application.category !== this.selectedCategory) {
        return false;
      }

      // ステータスフィルタ
      if (this.selectedStatus && application.status !== this.selectedStatus) {
        return false;
      }

      // 申請種別フィルタ
      if (this.selectedType && application.type !== this.selectedType) {
        return false;
      }

      // 社員フィルタ
      if (this.selectedEmployeeId && application.employeeId !== this.selectedEmployeeId) {
        return false;
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
    this.dataSource.data = this.filteredApplications.slice(startIndex, endIndex);
  }

  /**
   * ページ変更
   */
  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.updateDataSource();
  }

  /**
   * ソート変更
   */
  onSortChange(sort: Sort): void {
    // ソート機能は後で実装
    this.updateDataSource();
  }

  /**
   * フィルタをリセット
   */
  resetFilters(): void {
    this.searchForm.reset({
      category: '',
      status: '',
      employeeId: '',
      type: ''
    });
    this.pageIndex = 0;
    this.applyFilters();
  }

  /**
   * 申請を作成
   */
  createApplication(): void {
    this.router.navigate(['/applications/create']);
  }

  /**
   * 申請詳細を表示
   */
  viewApplication(application: Application): void {
    if (application.id) {
      this.router.navigate(['/applications', application.id]);
    }
  }

  /**
   * 申請を削除
   */
  async deleteApplication(application: Application): Promise<void> {
    if (!application.id) {
      return;
    }

    if (!confirm('この申請を削除しますか？')) {
      return;
    }

    try {
      await this.applicationService.deleteApplication(application.id);
      this.snackBar.open('申請を削除しました', '閉じる', { duration: 3000 });
      this.loadApplications(this.organizationId!);
    } catch (error) {
      console.error('申請の削除に失敗しました:', error);
      this.snackBar.open('申請の削除に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 申請者名を取得
   */
  getApplicantName(application: Application): string {
    if (application.employeeId) {
      const employee = this.employees.find(e => e.id === application.employeeId);
      return employee ? `${employee.lastName} ${employee.firstName}` : '不明';
    } else {
      // employeeIdがundefinedの場合は会社名（オーナーアカウント）を表示
      return this.organization?.name || '不明';
    }
  }

  /**
   * 社員名を取得（旧メソッド、後方互換性のため残す）
   */
  getEmployeeName(employeeId: string): string {
    const employee = this.employees.find(e => e.id === employeeId);
    return employee ? `${employee.lastName} ${employee.firstName}` : '不明';
  }

  /**
   * 対象社員の表示名を取得
   */
  getTargetEmployeesDisplay(application: Application): string {
    const targetEmployees: string[] = [];

    // 申請種別に応じて対象社員を抽出
    const data = application.data || {};
    
    // 資格取得届・資格喪失届・賞与支払届：insuredPersons配列から取得
    if (data['insuredPersons'] && Array.isArray(data['insuredPersons'])) {
      for (const person of data['insuredPersons']) {
        if (person.employeeId) {
          const employee = this.employees.find(e => e.id === person.employeeId);
          if (employee) {
            targetEmployees.push(`${employee.lastName} ${employee.firstName}`);
          }
        } else if (person.lastName || person.firstName) {
          // 手入力の場合：氏名を使用（資格取得届・資格喪失届）
          const name = `${person.lastName || ''} ${person.firstName || ''}`.trim();
          if (name) {
            targetEmployees.push(name);
          }
        } else if (person.name) {
          // 手入力の場合：氏名を使用（賞与支払届）
          targetEmployees.push(person.name);
        }
      }
    }
    // 報酬月額算定基礎届：rewardBasePersons配列から取得
    else if (data['rewardBasePersons'] && Array.isArray(data['rewardBasePersons'])) {
      for (const person of data['rewardBasePersons']) {
        if (person.employeeId) {
          const employee = this.employees.find(e => e.id === person.employeeId);
          if (employee) {
            targetEmployees.push(`${employee.lastName} ${employee.firstName}`);
          }
        } else if (person.name) {
          targetEmployees.push(person.name);
        }
      }
    }
    // 報酬月額変更届：rewardChangePersons配列から取得
    else if (data['rewardChangePersons'] && Array.isArray(data['rewardChangePersons'])) {
      for (const person of data['rewardChangePersons']) {
        if (person.employeeId) {
          const employee = this.employees.find(e => e.id === person.employeeId);
          if (employee) {
            targetEmployees.push(`${employee.lastName} ${employee.firstName}`);
          }
        } else if (person.name) {
          targetEmployees.push(person.name);
        }
      }
    }
    // その他：application.employeeIdを使用
    else if (application.employeeId) {
      const employee = this.employees.find(e => e.id === application.employeeId);
      if (employee) {
        targetEmployees.push(`${employee.lastName} ${employee.firstName}`);
      }
    }

    // 表示形式を決定
    if (targetEmployees.length === 0) {
      return '-';
    } else if (targetEmployees.length === 1) {
      return targetEmployees[0];
    } else if (targetEmployees.length === 2) {
      return `${targetEmployees[0]}、${targetEmployees[1]}`;
    } else {
      return `${targetEmployees[0]}　他${targetEmployees.length - 1}名`;
    }
  }

  /**
   * 期限ステータスを取得
   */
  getDeadlineStatus(application: Application): string {
    const now = new Date();
    const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    
    let overdueCount = 0;
    let withinFiveDaysCount = 0;

    // 申請種別に応じて各被保険者の期限を取得
    const data = application.data || {};
    
    // 資格取得届・資格喪失届・賞与支払届：insuredPersons配列から取得
    if (data['insuredPersons'] && Array.isArray(data['insuredPersons'])) {
      for (const person of data['insuredPersons']) {
        if (!person.deadline) {
          continue;
        }

        const deadline = person.deadline instanceof Date 
          ? person.deadline 
          : (person.deadline as any).toDate 
            ? (person.deadline as any).toDate() 
            : new Date(person.deadline);

        if (deadline < now) {
          overdueCount++;
        } else if (deadline <= fiveDaysLater) {
          withinFiveDaysCount++;
        }
      }
    }
    // 報酬月額算定基礎届・報酬月額変更届：rewardBasePersons/rewardChangePersons配列から取得
    else if ((data['rewardBasePersons'] || data['rewardChangePersons']) && Array.isArray(data['rewardBasePersons'] || data['rewardChangePersons'])) {
      const persons = data['rewardBasePersons'] || data['rewardChangePersons'];
      for (const person of persons) {
        if (!person.deadline) {
          continue;
        }

        const deadline = person.deadline instanceof Date 
          ? person.deadline 
          : (person.deadline as any).toDate 
            ? (person.deadline as any).toDate() 
            : new Date(person.deadline);

        if (deadline < now) {
          overdueCount++;
        } else if (deadline <= fiveDaysLater) {
          withinFiveDaysCount++;
        }
      }
    }
    // その他：申請全体の期限を使用（既存の動作を維持）
    else if (application.deadline) {
      let deadline: Date | null = null;
      if (application.deadline instanceof Date) {
        deadline = application.deadline;
      } else if (application.deadline instanceof Timestamp) {
        deadline = application.deadline.toDate();
      } else if (application.deadline && typeof (application.deadline as any).toDate === 'function') {
        deadline = (application.deadline as any).toDate();
      } else if (application.deadline && typeof (application.deadline as any).seconds === 'number') {
        deadline = new Date((application.deadline as any).seconds * 1000);
      } else if (typeof application.deadline === 'string' || typeof application.deadline === 'number') {
        deadline = new Date(application.deadline);
      }

      if (deadline) {
        if (deadline < now) {
          overdueCount = 1;
        } else if (deadline <= fiveDaysLater) {
          withinFiveDaysCount = 1;
        }
      }
    }

    // 期限ステータスを構築
    const statusParts: string[] = [];
    if (overdueCount > 0) {
      statusParts.push(`期限超過：${overdueCount}名`);
    }
    if (withinFiveDaysCount > 0) {
      statusParts.push(`5日以内：${withinFiveDaysCount}名`);
    }

    return statusParts.length > 0 ? statusParts.join('、') : '-';
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
   * ステータスカラーを取得
   */
  getStatusColor(status: ApplicationStatus): string {
    const colors: Record<ApplicationStatus, string> = {
      draft: '',
      created: 'primary',
      pending: 'accent',
      pending_received: 'accent',
      pending_not_received: 'accent',
      approved: 'primary',
      rejected: 'warn',
      returned: '',
      withdrawn: ''
    };
    return colors[status] || '';
  }

  /**
   * カテゴリラベルを取得
   */
  getCategoryLabel(category: ApplicationCategory): string {
    return category === 'internal' ? '内部申請' : '外部申請';
  }

  /**
   * 申請種別名を取得
   */
  getApplicationTypeName(typeId: string): string {
    if (!this.organization?.applicationFlowSettings?.applicationTypes) {
      return typeId;
    }
    
    const applicationType = this.organization.applicationFlowSettings.applicationTypes.find(
      type => type.id === typeId
    );
    
    return applicationType?.name || typeId;
  }

  /**
   * 総件数を取得
   */
  get totalCount(): number {
    return this.filteredApplications.length;
  }

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date | null | undefined): string {
    if (!date) {
      return '-';
    }
    return new Date(date).toLocaleDateString('ja-JP');
  }

  /**
   * 申請の期限を計算してマップに保存（修正16）
   */
  private async calculateDeadlines(): Promise<void> {
    console.log('[ApplicationList] calculateDeadlines 開始', {
      applicationsCount: this.applications.length
    });

    this.applicationDeadlines.clear();
    this.applicationDeadlineStatuses.clear();
    
    if (!this.organization?.applicationFlowSettings?.applicationTypes) {
      console.log('[ApplicationList] applicationTypes がないため終了');
      return;
    }

    for (const application of this.applications) {
      if (!application.id) continue;

      console.log('[ApplicationList] 申請処理開始', {
        applicationId: application.id,
        applicationType: application.type,
        category: application.category
      });

      const applicationType = this.organization.applicationFlowSettings.applicationTypes.find(
        type => type.id === application.type
      );

      if (!applicationType) {
        console.log('[ApplicationList] 申請種別が見つからない', {
          applicationId: application.id,
          applicationTypeId: application.type
        });
        // 申請種別が見つからない場合はapplication.deadlineを使用
        const deadline = application.deadline 
          ? (application.deadline instanceof Date ? application.deadline : (application.deadline as any).toDate())
          : null;
        console.log('[ApplicationList] application.deadline を使用', {
          applicationId: application.id,
          deadline: deadline ? deadline.toISOString() : null
        });
        this.applicationDeadlines.set(application.id, deadline);
        // 期限ステータスを計算
        const deadlineStatus = this.getDeadlineStatus(application);
        this.applicationDeadlineStatuses.set(application.id, deadlineStatus);
        continue;
      }

      if (application.category === 'external') {
        console.log('[ApplicationList] 外部申請の法定期限を計算', {
          applicationId: application.id,
          applicationTypeCode: applicationType.code
        });
        // 外部申請：法定期限を計算してdata内に保存（各被保険者ごとに期限を保存）
        await this.deadlineCalculationService.calculateLegalDeadline(application, applicationType);
        // 期限ステータスを計算
        const deadlineStatus = this.getDeadlineStatus(application);
        this.applicationDeadlineStatuses.set(application.id, deadlineStatus);
        console.log('[ApplicationList] 期限ステータスを設定', {
          applicationId: application.id,
          deadlineStatus: deadlineStatus
        });
      } else {
        // 内部申請：application.deadline（管理者設定期限）を表示
        const deadline = application.deadline 
          ? (application.deadline instanceof Date ? application.deadline : (application.deadline as any).toDate())
          : null;
        console.log('[ApplicationList] 内部申請の期限を設定', {
          applicationId: application.id,
          deadline: deadline ? deadline.toISOString() : null
        });
        this.applicationDeadlines.set(application.id, deadline);
        // 期限ステータスを計算
        const deadlineStatus = this.getDeadlineStatus(application);
        this.applicationDeadlineStatuses.set(application.id, deadlineStatus);
      }
    }

    console.log('[ApplicationList] calculateDeadlines 完了', {
      applicationDeadlinesSize: this.applicationDeadlines.size,
      applicationDeadlineStatusesSize: this.applicationDeadlineStatuses.size
    });
  }

  /**
   * 申請の期限を取得（修正16）
   */
  getApplicationDeadline(application: Application): Date | null {
    if (!application.id) {
      console.log('[ApplicationList] getApplicationDeadline: application.id がない');
      return null;
    }
    const deadline = this.applicationDeadlines.get(application.id) || null;
    console.log('[ApplicationList] getApplicationDeadline', {
      applicationId: application.id,
      deadline: deadline ? deadline.toISOString() : null,
      deadlineType: deadline ? 'Date' : 'null',
      isPast: deadline ? deadline < new Date() : null
    });
    return deadline;
  }
}

