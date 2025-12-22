import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DepartmentService } from '../../../core/services/department.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Department } from '../../../core/models/department.model';
import { Employee } from '../../../core/models/employee.model';

@Component({
  selector: 'app-department-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    MatCardModule,
    MatSnackBarModule
  ],
  templateUrl: './department-form.component.html',
  styleUrl: './department-form.component.css'
})
export class DepartmentFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private departmentService = inject(DepartmentService);
  private employeeService = inject(EmployeeService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  departmentForm: FormGroup;
  departments: Department[] = [];
  employees: Employee[] = [];
  organizationId: string | null = null;
  departmentId: string | null = null;
  isEditMode = false;
  isLoading = false;

  constructor() {
    this.departmentForm = this.fb.group({
      name: ['', [Validators.required]],
      code: [''],
      managerId: [null],
      email: ['', [Validators.email]]
    });
  }

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      this.router.navigate(['/dashboard']);
      return;
    }

    this.organizationId = currentUser.organizationId;
    this.loadDepartments();
    this.loadEmployees();

    // 編集モードかどうかを確認
    this.route.params.subscribe(params => {
      if (params['id']) {
        this.departmentId = params['id'];
        this.isEditMode = true;
        this.loadDepartment(this.departmentId);
      }
    });
  }

  /**
   * 部署一覧を読み込む
   */
  private async loadDepartments(): Promise<void> {
    if (!this.organizationId) return;
    try {
      this.departments = await this.departmentService.getDepartmentsByOrganization(this.organizationId);
    } catch (error) {
      console.error('部署一覧の読み込みに失敗しました:', error);
    }
  }

  /**
   * 社員一覧を読み込む（責任者選択用）
   */
  private async loadEmployees(): Promise<void> {
    if (!this.organizationId) return;
    try {
      this.employees = await this.employeeService.getEmployeesByOrganization(this.organizationId);
    } catch (error) {
      console.error('社員一覧の読み込みに失敗しました:', error);
    }
  }

  /**
   * 部署を読み込む（編集モード）
   */
  private async loadDepartment(departmentId: string | null): Promise<void> {
    if (!departmentId) return;
    
    try {
      const department = await this.departmentService.getDepartment(departmentId);
      if (!department) {
        this.snackBar.open('部署が見つかりませんでした', '閉じる', { duration: 3000 });
        this.router.navigate(['/departments']);
        return;
      }

      // フォームに値を設定
      this.departmentForm.patchValue({
        name: department.name,
        code: department.code || '',
        managerId: department.managerId || null,
        email: department.email || ''
      });
    } catch (error) {
      console.error('部署の読み込みに失敗しました:', error);
      this.snackBar.open('部署の読み込みに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * フォームを送信
   */
  async onSubmit(): Promise<void> {
    if (this.departmentForm.invalid || !this.organizationId) {
      return;
    }

    this.isLoading = true;

    try {
      const formValue = this.departmentForm.value;

      if (this.isEditMode && this.departmentId) {
        // 更新
        await this.departmentService.updateDepartment(this.departmentId, {
          name: formValue.name,
          code: formValue.code || undefined,
          parentDepartmentId: null,
          managerId: formValue.managerId || null,
          email: formValue.email || undefined
        });
        this.snackBar.open('部署を更新しました', '閉じる', { duration: 3000 });
      } else {
        // 作成
        await this.departmentService.createDepartment({
          name: formValue.name,
          code: formValue.code || undefined,
          parentDepartmentId: null,
          managerId: formValue.managerId || null,
          email: formValue.email || undefined,
          organizationId: this.organizationId
        });
        this.snackBar.open('部署を作成しました', '閉じる', { duration: 3000 });
      }

      this.router.navigate(['/departments']);
    } catch (error) {
      console.error('部署の保存に失敗しました:', error);
      this.snackBar.open('部署の保存に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * キャンセル
   */
  cancel(): void {
    this.router.navigate(['/departments']);
  }
}

