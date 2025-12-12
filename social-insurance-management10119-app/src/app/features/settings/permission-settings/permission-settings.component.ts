import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort } from '@angular/material/sort';
import { AuthService } from '../../../core/auth/auth.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { Employee } from '../../../core/models/employee.model';
import { PermissionChangeDialogComponent } from './permission-change-dialog/permission-change-dialog.component';

export interface PermissionRow {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  email: string;
  currentRole: 'admin' | 'employee';
  isOwner: boolean;
}

@Component({
  selector: 'app-permission-settings',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatTooltipModule,
    MatChipsModule,
    MatPaginatorModule,
    MatSortModule
  ],
  templateUrl: './permission-settings.component.html',
  styleUrl: './permission-settings.component.css'
})
export class PermissionSettingsComponent implements OnInit {
  private authService = inject(AuthService);
  private employeeService = inject(EmployeeService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  employees: Employee[] = [];
  permissionRows: PermissionRow[] = [];
  dataSource = new MatTableDataSource<PermissionRow>([]);
  
  displayedColumns: string[] = ['employeeNumber', 'employeeName', 'email', 'currentRole', 'actions'];
  
  isLoading = false;
  currentUser: any = null;

  // ページネーション
  pageSize = 10;
  pageIndex = 0;
  pageSizeOptions = [5, 10, 25, 50];

  ngOnInit(): void {
    this.loadCurrentUser();
    this.loadEmployees();
  }

  async loadCurrentUser(): Promise<void> {
    this.currentUser = this.authService.getCurrentUser();
  }

  async loadEmployees(): Promise<void> {
    this.isLoading = true;
    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser?.organizationId) {
        this.snackBar.open('組織情報が取得できません', '閉じる', { duration: 3000 });
        return;
      }

      this.employees = await this.employeeService.getEmployeesByOrganization(currentUser.organizationId);
      
      // PermissionRowに変換
      this.permissionRows = this.employees.map(employee => {
        const role = employee.role || 'employee';
        const isOwner = currentUser.role === 'owner' && currentUser.employeeId === employee.id;
        
        return {
          employeeId: employee.id || '',
          employeeNumber: employee.employeeNumber,
          employeeName: `${employee.lastName} ${employee.firstName}`,
          email: employee.email,
          currentRole: role,
          isOwner: isOwner
        };
      });

      // オーナーを除外してソート（オーナーは権限変更不可）
      this.permissionRows = this.permissionRows.sort((a, b) => {
        if (a.isOwner && !b.isOwner) return 1;
        if (!a.isOwner && b.isOwner) return -1;
        return a.employeeNumber.localeCompare(b.employeeNumber);
      });

      this.dataSource.data = this.permissionRows;
    } catch (error) {
      console.error('社員の読み込みに失敗しました:', error);
      this.snackBar.open('社員の読み込みに失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  getRoleLabel(role: 'admin' | 'employee'): string {
    return role === 'admin' ? '管理者' : '一般社員';
  }

  getRoleColor(role: 'admin' | 'employee'): string {
    return role === 'admin' ? 'primary' : '';
  }

  canEditRole(row: PermissionRow): boolean {
    // オーナーは権限変更不可
    if (row.isOwner) {
      return false;
    }
    
    // 現在のユーザーがオーナーまたは管理者の場合のみ編集可能
    const currentUser = this.authService.getCurrentUser();
    return currentUser?.role === 'owner' || currentUser?.role === 'admin';
  }

  openPermissionChangeDialog(row: PermissionRow): void {
    if (!this.canEditRole(row)) {
      return;
    }

    const dialogRef = this.dialog.open(PermissionChangeDialogComponent, {
      width: '500px',
      data: {
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        currentRole: row.currentRole
      }
    });

    dialogRef.afterClosed().subscribe(async (result: 'admin' | 'employee' | null) => {
      if (result && result !== row.currentRole) {
        await this.updateRole(row.employeeId, result);
      }
    });
  }

  async updateRole(employeeId: string, newRole: 'admin' | 'employee'): Promise<void> {
    this.isLoading = true;
    try {
      // employeesコレクションを更新
      await this.employeeService.updateEmployee(employeeId, { role: newRole });

      // usersコレクションも更新
      await this.authService.updateUserRole(employeeId, newRole);

      // ローカルのデータを更新
      const row = this.permissionRows.find(r => r.employeeId === employeeId);
      if (row) {
        row.currentRole = newRole;
        this.dataSource.data = [...this.permissionRows];
      }

      this.snackBar.open('権限を更新しました', '閉じる', { duration: 3000 });
    } catch (error) {
      console.error('権限の更新に失敗しました:', error);
      this.snackBar.open('権限の更新に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
  }

  sortData(sort: Sort): void {
    const data = this.permissionRows.slice();
    if (!sort.active || sort.direction === '') {
      this.dataSource.data = data;
      return;
    }

    this.dataSource.data = data.sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      switch (sort.active) {
        case 'employeeNumber':
          return this.compare(a.employeeNumber, b.employeeNumber, isAsc);
        case 'employeeName':
          return this.compare(a.employeeName, b.employeeName, isAsc);
        case 'email':
          return this.compare(a.email, b.email, isAsc);
        case 'currentRole':
          return this.compare(a.currentRole, b.currentRole, isAsc);
        default:
          return 0;
      }
    });
  }

  private compare(a: string | number, b: string | number, isAsc: boolean): number {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }
}

