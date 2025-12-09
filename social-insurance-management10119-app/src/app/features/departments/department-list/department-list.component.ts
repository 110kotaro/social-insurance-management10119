import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DepartmentService } from '../../../core/services/department.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Department } from '../../../core/models/department.model';
import { Employee } from '../../../core/models/employee.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-department-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatSortModule,
    MatSnackBarModule,
    MatDialogModule
  ],
  templateUrl: './department-list.component.html',
  styleUrl: './department-list.component.css'
})
export class DepartmentListComponent implements OnInit, OnDestroy {
  private departmentService = inject(DepartmentService);
  private employeeService = inject(EmployeeService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  searchForm: FormGroup;
  departments: Department[] = [];
  filteredDepartments: Department[] = [];
  employees: Employee[] = [];
  displayedColumns: string[] = ['name', 'code', 'manager', 'employeeCount', 'createdAt', 'actions'];
  dataSource = new MatTableDataSource<Department>([]);
  
  // フィルタ
  searchKeyword = '';

  private subscriptions = new Subscription();

  constructor() {
    this.searchForm = this.fb.group({
      keyword: ['']
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
      this.applyFilters();
    } catch (error) {
      console.error('部署一覧の読み込みに失敗しました:', error);
      this.snackBar.open('部署一覧の読み込みに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 社員一覧を読み込む（部署別統計用）
   */
  private async loadEmployees(organizationId: string): Promise<void> {
    try {
      this.employees = await this.employeeService.getEmployeesByOrganization(organizationId);
    } catch (error) {
      console.error('社員一覧の読み込みに失敗しました:', error);
    }
  }

  /**
   * フィルタを適用
   */
  applyFilters(): void {
    const keyword = this.searchForm.get('keyword')?.value?.toLowerCase() || '';
    this.searchKeyword = keyword;

    this.filteredDepartments = this.departments.filter(dept => {
      const matchesKeyword = !keyword || 
        dept.name.toLowerCase().includes(keyword) ||
        (dept.code && dept.code.toLowerCase().includes(keyword));

      return matchesKeyword;
    });

    this.dataSource.data = this.filteredDepartments;
  }

  /**
   * フィルタをリセット
   */
  resetFilters(): void {
    this.searchForm.reset();
    this.applyFilters();
  }

  /**
   * 部署を作成
   */
  createDepartment(): void {
    this.router.navigate(['/departments/create']);
  }

  /**
   * 部署を編集
   */
  editDepartment(department: Department): void {
    if (department.id) {
      this.router.navigate(['/departments', department.id, 'edit']);
    }
  }

  /**
   * 部署を削除
   */
  async deleteDepartment(department: Department): Promise<void> {
    if (!department.id) return;

    // 削除前に確認
    const confirmed = confirm(`「${department.name}」を削除しますか？この操作は取り消せません。`);
    if (!confirmed) return;

    // 部署に所属する社員がいるかチェック
    const employeesInDepartment = this.employees.filter(emp => emp.departmentId === department.id);
    if (employeesInDepartment.length > 0) {
      this.snackBar.open(`この部署には${employeesInDepartment.length}名の社員が所属しています。先に社員の部署を変更してください。`, '閉じる', { duration: 5000 });
      return;
    }

    try {
      await this.departmentService.deleteDepartment(department.id);
      this.snackBar.open('部署を削除しました', '閉じる', { duration: 3000 });
      const currentUser = this.authService.getCurrentUser();
      if (currentUser?.organizationId) {
        this.loadDepartments(currentUser.organizationId);
      }
    } catch (error) {
      console.error('部署の削除に失敗しました:', error);
      this.snackBar.open('部署の削除に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 部署の責任者名を取得
   */
  getManagerName(managerId: string | null | undefined): string {
    if (!managerId) return '-';
    const manager = this.employees.find(emp => emp.id === managerId);
    return manager ? `${manager.lastName} ${manager.firstName}` : '-';
  }

  /**
   * 部署の社員数を取得
   */
  getEmployeeCount(departmentId: string | undefined): number {
    if (!departmentId) return 0;
    return this.employees.filter(emp => emp.departmentId === departmentId).length;
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
   * テーブルをソート
   */
  sortData(sort: Sort): void {
    const data = this.filteredDepartments.slice();
    if (!sort.active || sort.direction === '') {
      this.dataSource.data = data;
      return;
    }

    this.dataSource.data = data.sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      switch (sort.active) {
        case 'name':
          return this.compare(a.name, b.name, isAsc);
        case 'code':
          return this.compare(a.code || '', b.code || '', isAsc);
        case 'createdAt':
          return this.compare(a.createdAt, b.createdAt, isAsc);
        default:
          return 0;
      }
    });
  }

  private compare(a: any, b: any, isAsc: boolean): number {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }
}

