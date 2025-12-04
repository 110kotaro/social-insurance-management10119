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
import { EmployeeService } from '../../../core/services/employee.service';
import { DepartmentService } from '../../../core/services/department.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Employee } from '../../../core/models/employee.model';
import { Department } from '../../../core/models/department.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-employee-list',
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
  templateUrl: './employee-list.component.html',
  styleUrl: './employee-list.component.css'
})
export class EmployeeListComponent implements OnInit, OnDestroy {
  private employeeService = inject(EmployeeService);
  private departmentService = inject(DepartmentService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  searchForm: FormGroup;
  employees: Employee[] = [];
  filteredEmployees: Employee[] = [];
  departments: Department[] = [];
  displayedColumns: string[] = ['employeeNumber', 'name', 'nameKana', 'department', 'status', 'invitationEmailSent', 'joinDate', 'actions'];
  dataSource = new MatTableDataSource<Employee>([]);
  
  // ページネーション
  pageSize = 10;
  pageIndex = 0;
  pageSizeOptions = [10, 25, 50, 100];
  
  // フィルタ
  searchKeyword = '';
  selectedDepartmentId = '';
  selectedStatus = '';

  private subscriptions = new Subscription();

  constructor() {
    this.searchForm = this.fb.group({
      keyword: [''],
      departmentId: [''],
      status: ['']
    });
  }

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.loadDepartments(currentUser.organizationId);
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
   * 部署一覧を読み込む
   */
  private async loadDepartments(organizationId: string): Promise<void> {
    try {
      this.departments = await this.departmentService.getDepartmentsByOrganization(organizationId);
    } catch (error) {
      console.error('部署の読み込みに失敗しました:', error);
    }
  }

  /**
   * 社員一覧を読み込む
   */
  private async loadEmployees(organizationId: string): Promise<void> {
    try {
      this.employees = await this.employeeService.getEmployeesByOrganization(organizationId);
      this.applyFilters();
    } catch (error) {
      console.error('社員の読み込みに失敗しました:', error);
    }
  }

  /**
   * フィルタを適用
   */
  applyFilters(): void {
    const formValue = this.searchForm.value;
    this.searchKeyword = formValue.keyword?.toLowerCase() || '';
    this.selectedDepartmentId = formValue.departmentId || '';
    this.selectedStatus = formValue.status || '';

    this.filteredEmployees = this.employees.filter(employee => {
      // キーワード検索（社員番号、氏名、氏名カナ）
      if (this.searchKeyword) {
        const matchesKeyword = 
          employee.employeeNumber.toLowerCase().includes(this.searchKeyword) ||
          employee.name.toLowerCase().includes(this.searchKeyword) ||
          employee.nameKana.toLowerCase().includes(this.searchKeyword);
        if (!matchesKeyword) return false;
      }

      // 部署フィルタ
      if (this.selectedDepartmentId && employee.departmentId !== this.selectedDepartmentId) {
        return false;
      }

      // ステータスフィルタ
      if (this.selectedStatus && employee.status !== this.selectedStatus) {
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
    // ページネーション適用前のデータ
    const startIndex = this.pageIndex * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    const paginatedData = this.filteredEmployees.slice(startIndex, endIndex);
    
    this.dataSource.data = paginatedData;
  }

  /**
   * ページ変更
   */
  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.updateDataSource();
  }

  /**
   * ソート変更
   */
  onSortChange(sort: Sort): void {
    if (!sort.active || sort.direction === '') {
      this.updateDataSource();
      return;
    }

    this.filteredEmployees.sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      let valueA: any;
      let valueB: any;

      switch (sort.active) {
        case 'employeeNumber':
          valueA = a.employeeNumber;
          valueB = b.employeeNumber;
          break;
        case 'name':
          valueA = a.name;
          valueB = b.name;
          break;
        case 'nameKana':
          valueA = a.nameKana;
          valueB = b.nameKana;
          break;
        case 'email':
          valueA = a.email;
          valueB = b.email;
          break;
        case 'department':
          valueA = this.getDepartmentName(a.departmentId);
          valueB = this.getDepartmentName(b.departmentId);
          break;
        case 'status':
          valueA = a.status;
          valueB = b.status;
          break;
        case 'joinDate':
          valueA = a.joinDate instanceof Date ? a.joinDate.getTime() : (a.joinDate as any)?.toDate?.()?.getTime() || 0;
          valueB = b.joinDate instanceof Date ? b.joinDate.getTime() : (b.joinDate as any)?.toDate?.()?.getTime() || 0;
          break;
        default:
          return 0;
      }

      if (valueA < valueB) return isAsc ? -1 : 1;
      if (valueA > valueB) return isAsc ? 1 : -1;
      return 0;
    });

    this.updateDataSource();
  }

  /**
   * 部署名を取得
   */
  getDepartmentName(departmentId: string): string {
    const department = this.departments.find(d => d.id === departmentId);
    return department?.name || '未設定';
  }

  /**
   * ステータスの表示ラベルを取得
   */
  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'active': '在籍',
      'leave': '休職',
      'retired': '退職',
      'pre_join': '未入社'
    };
    return labels[status] || status;
  }

  /**
   * ステータスの色を取得
   */
  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'active': 'primary',
      'leave': 'warn',
      'retired': '',
      'pre_join': 'accent'
    };
    return colors[status] || '';
  }

  /**
   * 日付をフォーマット
   */
  formatDate(date: Date | any): string {
    if (!date) return '-';
    const d = date instanceof Date ? date : (date?.toDate ? date.toDate() : new Date(date));
    return d.toLocaleDateString('ja-JP');
  }

  /**
   * 社員詳細画面に遷移
   */
  viewEmployee(employeeId: string): void {
    this.router.navigate(['/employees', employeeId]);
  }

  /**
   * 社員登録画面に遷移
   */
  createEmployee(): void {
    this.router.navigate(['/employees/create']);
  }

  /**
   * 一括インポート画面に遷移
   */
  importEmployees(): void {
    this.router.navigate(['/employees/import']);
  }

  /**
   * 検索フォームをリセット
   */
  resetFilters(): void {
    this.searchForm.reset();
    this.pageIndex = 0;
    this.applyFilters();
  }

  /**
   * 総件数を取得
   */
  get totalCount(): number {
    return this.filteredEmployees.length;
  }

  /**
   * 社員を招待（メール送信）
   */
  async inviteEmployee(employee: Employee): Promise<void> {
    if (!employee.id || !employee.organizationId) {
      this.snackBar.open('社員情報が不完全です', '閉じる', { duration: 3000 });
      return;
    }

    const confirmed = confirm(`${employee.name} さんに招待メールを送信しますか？`);
    if (!confirmed) return;

    try {
      await this.authService.inviteEmployee(
        employee.email,
        employee.id,
        employee.organizationId,
        employee.name
      );
      
      // 認証メール送信済みフラグを更新
      await this.employeeService.updateEmployee(employee.id, {
        invitationEmailSent: true
      });
      
      // ローカルのemployeeオブジェクトも更新
      const index = this.employees.findIndex(e => e.id === employee.id);
      if (index !== -1) {
        this.employees[index].invitationEmailSent = true;
        this.applyFilters(); // フィルタを再適用
      }
      
      this.snackBar.open('招待メールを送信しました', '閉じる', { duration: 3000 });
    } catch (error: any) {
      console.error('招待メールの送信に失敗しました:', error);
      this.snackBar.open(error.message || '招待メールの送信に失敗しました', '閉じる', { duration: 5000 });
    }
  }
}

