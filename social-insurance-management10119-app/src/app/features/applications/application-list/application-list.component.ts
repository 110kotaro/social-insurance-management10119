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
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApplicationService } from '../../../core/services/application.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ModeService } from '../../../core/services/mode.service';
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
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  searchForm: FormGroup;
  applications: Application[] = [];
  filteredApplications: Application[] = [];
  employees: Employee[] = [];
  organization: Organization | null = null;
  displayedColumns: string[] = ['type', 'employee', 'category', 'status', 'createdAt', 'deadline', 'actions'];
  dataSource = new MatTableDataSource<Application>([]);
  
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

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    // 管理者かどうかを判定（roleベース）
    this.isAdmin = currentUser.role === 'admin' || currentUser.role === 'owner';
    this.organizationId = currentUser.organizationId;
    this.employeeId = currentUser.employeeId || null;

    // モードの変更を監視
    const modeSub = this.modeService.isAdminMode$.subscribe(isAdminMode => {
      this.isAdminMode = isAdminMode;
      // モード変更時に申請一覧を再読み込み
      if (this.organizationId) {
        this.loadApplications(this.organizationId);
      }
    });
    this.subscriptions.add(modeSub);

    this.loadOrganization(currentUser.organizationId);
    this.loadEmployees(currentUser.organizationId);
    this.loadApplications(currentUser.organizationId);

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
   * 社員名を取得
   */
  getEmployeeName(employeeId: string): string {
    const employee = this.employees.find(e => e.id === employeeId);
    return employee ? `${employee.lastName} ${employee.firstName}` : '不明';
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
  formatDate(date: Date | undefined): string {
    if (!date) {
      return '-';
    }
    return new Date(date).toLocaleDateString('ja-JP');
  }
}

