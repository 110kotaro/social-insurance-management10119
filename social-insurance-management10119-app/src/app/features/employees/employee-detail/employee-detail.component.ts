import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EmployeeService } from '../../../core/services/employee.service';
import { DepartmentService } from '../../../core/services/department.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Employee, DependentInfo, InsuranceInfo, OtherCompanyInfo, Address } from '../../../core/models/employee.model';
import { Department } from '../../../core/models/department.model';

@Component({
  selector: 'app-employee-detail',
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
    MatDialogModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTooltipModule
  ],
  templateUrl: './employee-detail.component.html',
  styleUrl: './employee-detail.component.css'
})
export class EmployeeDetailComponent implements OnInit {
  private employeeService = inject(EmployeeService);
  private departmentService = inject(DepartmentService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  employee: Employee | null = null;
  department: Department | null = null;
  isLoading = true;
  isInviting = false;

  ngOnInit(): void {
    const employeeId = this.route.snapshot.paramMap.get('id');
    if (!employeeId) {
      this.router.navigate(['/employees']);
      return;
    }

    this.loadEmployee(employeeId);
  }

  /**
   * 社員情報を読み込む
   */
  private async loadEmployee(employeeId: string): Promise<void> {
    try {
      this.employee = await this.employeeService.getEmployee(employeeId);
      
      if (!this.employee) {
        this.snackBar.open('社員が見つかりませんでした', '閉じる', { duration: 3000 });
        this.router.navigate(['/employees']);
        return;
      }

      // 部署情報を読み込む
      if (this.employee.departmentId) {
        const departments = await this.departmentService.getDepartmentsByOrganization(this.employee.organizationId);
        this.department = departments.find(d => d.id === this.employee!.departmentId) || null;
      }

      this.isLoading = false;
    } catch (error) {
      console.error('社員情報の読み込みに失敗しました:', error);
      this.snackBar.open('社員情報の読み込みに失敗しました', '閉じる', { duration: 3000 });
      this.router.navigate(['/employees']);
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
   * 続柄の表示ラベルを取得
   */
  getRelationshipLabel(relationship: string): string {
    return relationship;
  }

  /**
   * 権限の表示ラベルを取得
   */
  getRoleLabel(role?: string): string {
    if (!role) return '一般社員';
    const roleMap: { [key: string]: string } = {
      'admin': '管理者',
      'employee': '一般社員'
    };
    return roleMap[role] || role;
  }

  /**
   * 権限の色を取得
   */
  getRoleColor(role?: string): string {
    if (!role || role === 'employee') return '';
    return 'accent';
  }

  /**
   * 管理者かどうかをチェック
   */
  isAdmin(): boolean {
    const currentUser = this.authService.getCurrentUser();
    return currentUser?.role === 'owner' || currentUser?.role === 'admin';
  }

  /**
   * 権限を編集
   */
  async editRole(): Promise<void> {
    if (!this.employee?.id) return;

    const currentRole = this.employee.role || 'employee';
    const defaultNewRoleLabel = currentRole === 'admin' ? '一般社員' : '管理者';
    const newRoleInput = prompt(`権限を変更しますか？\n現在: ${this.getRoleLabel(currentRole)}\n新しい権限（管理者 または 一般社員）:`, defaultNewRoleLabel);

    if (!newRoleInput) {
      return;
    }

    // 入力値をパース（日本語と英語の両方に対応）
    let newRole: 'admin' | 'employee' | null = null;
    const normalizedInput = newRoleInput.trim().toLowerCase();
    if (normalizedInput === 'admin' || normalizedInput === '管理者') {
      newRole = 'admin';
    } else if (normalizedInput === 'employee' || normalizedInput === '一般社員' || normalizedInput === '社員') {
      newRole = 'employee';
    }

    if (!newRole) {
      this.snackBar.open('無効な権限値です（管理者 または 一般社員を入力してください）', '閉じる', { duration: 3000 });
      return;
    }

    if (newRole === currentRole) {
      return;
    }

    const confirmed = confirm(`権限を「${this.getRoleLabel(newRole)}」に変更しますか？`);
    if (!confirmed) {
      return;
    }

    try {
      // employeesコレクションを更新
      await this.employeeService.updateEmployee(this.employee.id, { role: newRole });

      // usersコレクションも更新
      await this.authService.updateUserRole(this.employee.id, newRole);

      // ローカルのemployeeオブジェクトを更新
      this.employee.role = newRole;

      this.snackBar.open('権限を更新しました', '閉じる', { duration: 3000 });
    } catch (error) {
      console.error('権限の更新に失敗しました:', error);
      this.snackBar.open('権限の更新に失敗しました', '閉じる', { duration: 5000 });
    }
  }

  /**
   * 編集画面に遷移
   */
  editEmployee(): void {
    if (this.employee?.id) {
      this.router.navigate(['/employees', this.employee.id, 'edit']);
    }
  }

  /**
   * 削除確認
   */
  async deleteEmployee(): Promise<void> {
    if (!this.employee?.id) return;

    // 認証済みの場合は削除不可
    if (this.employee.emailVerified === true) {
      this.snackBar.open('認証済みの社員は削除できません', '閉じる', { duration: 5000 });
      return;
    }

    const confirmed = confirm('この社員を削除しますか？この操作は取り消せません。');
    if (!confirmed) return;

    try {
      await this.employeeService.deleteEmployee(this.employee.id);
      this.snackBar.open('社員を削除しました', '閉じる', { duration: 3000 });
      this.router.navigate(['/employees']);
    } catch (error) {
      console.error('社員の削除に失敗しました:', error);
      this.snackBar.open('社員の削除に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 戻る
   */
  goBack(): void {
    this.router.navigate(['/employees']);
  }

  /**
   * 社員を招待（メール送信）
   */
  async inviteEmployee(): Promise<void> {
    if (!this.employee?.id || !this.employee?.organizationId) {
      this.snackBar.open('社員情報が不完全です', '閉じる', { duration: 3000 });
      return;
    }

    const confirmed = confirm(`${this.employee.name} さんに招待メールを送信しますか？`);
    if (!confirmed) return;

    this.isInviting = true;

    try {
      await this.authService.inviteEmployee(
        this.employee.email,
        this.employee.id,
        this.employee.organizationId,
        this.employee.name
      );
      
      // 認証メール送信済みフラグを更新
      await this.employeeService.updateEmployee(this.employee.id, {
        invitationEmailSent: true
      });
      
      // ローカルのemployeeオブジェクトも更新
      this.employee.invitationEmailSent = true;
      
      this.snackBar.open('招待メールを送信しました', '閉じる', { duration: 3000 });
    } catch (error: any) {
      console.error('招待メールの送信に失敗しました:', error);
      this.snackBar.open(error.message || '招待メールの送信に失敗しました', '閉じる', { duration: 5000 });
    } finally {
      this.isInviting = false;
    }
  }
}

