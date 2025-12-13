import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { EmployeeService } from '../../core/services/employee.service';
import { DepartmentService } from '../../core/services/department.service';
import { AuthService } from '../../core/auth/auth.service';
import { Employee } from '../../core/models/employee.model';
import { Department } from '../../core/models/department.model';

@Component({
  selector: 'app-my-info',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatListModule,
    MatChipsModule,
    MatSnackBarModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './my-info.component.html',
  styleUrl: './my-info.component.css'
})
export class MyInfoComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private departmentService = inject(DepartmentService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  employee: Employee | null = null;
  department: Department | null = null;
  isLoading = true;

  selectedTabIndex = 0;

  ngOnInit(): void {
    this.loadMyInfo();
  }

  /**
   * 自分の情報を読み込む
   */
  async loadMyInfo(): Promise<void> {
    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser?.employeeId) {
        this.snackBar.open('社員情報が見つかりませんでした', '閉じる', { duration: 3000 });
        this.router.navigate(['/dashboard']);
        return;
      }

      this.employee = await this.employeeService.getEmployee(currentUser.employeeId);
      
      if (!this.employee) {
        this.snackBar.open('社員情報が見つかりませんでした', '閉じる', { duration: 3000 });
        this.router.navigate(['/dashboard']);
        return;
      }

      // 部署情報を読み込む
      if (this.employee.departmentId) {
        const departments = await this.departmentService.getDepartmentsByOrganization(this.employee.organizationId);
        this.department = departments.find(d => d.id === this.employee!.departmentId) || null;
      }

      this.isLoading = false;
    } catch (error) {
      console.error('情報の読み込みに失敗しました:', error);
      this.snackBar.open('情報の読み込みに失敗しました', '閉じる', { duration: 3000 });
      this.isLoading = false;
    }
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
  getStatusColor(status: string): 'primary' | 'accent' | 'warn' {
    const colors: { [key: string]: 'primary' | 'accent' | 'warn' } = {
      'active': 'primary',
      'leave': 'accent',
      'retired': 'warn',
      'pre_join': 'accent'
    };
    return colors[status] || 'primary';
  }

  /**
   * 権限の表示ラベルを取得
   */
  getRoleLabel(role?: string): string {
    if (role === 'admin') {
      return '管理者';
    }
    return '一般社員';
  }

  /**
   * 権限の色を取得
   */
  getRoleColor(role?: string): 'primary' | 'accent' {
    return role === 'admin' ? 'primary' : 'accent';
  }


  /**
   * 日付をフォーマット
   */
  formatDate(date: Date | any): string {
    if (!date) {
      return '-';
    }
    
    let dateObj: Date;
    if (date instanceof Date) {
      dateObj = date;
    } else if (date && typeof date.toDate === 'function') {
      dateObj = date.toDate();
    } else if (date && typeof date.seconds === 'number') {
      dateObj = new Date(date.seconds * 1000);
    } else {
      return '-';
    }
    
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}年${month}月${day}日`;
  }

  /**
   * 通貨をフォーマット
   */
  formatCurrency(amount: number): string {
    return `¥${amount.toLocaleString()}`;
  }

}
