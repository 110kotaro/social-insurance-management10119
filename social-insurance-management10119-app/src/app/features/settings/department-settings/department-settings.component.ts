import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Department } from '../../../core/models/department.model';
import { DepartmentService } from '../../../core/services/department.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-department-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatListModule,
    MatSnackBarModule
  ],
  templateUrl: './department-settings.component.html',
  styleUrl: './department-settings.component.css'
})
export class DepartmentSettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private departmentService = inject(DepartmentService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);

  departmentsForm: FormGroup;
  departments: Department[] = [];
  isLoading = false;
  isSaving = false;

  constructor() {
    this.departmentsForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(1)]],
      code: [''],
      parentDepartmentId: [null],
      email: ['', Validators.email]
    });
  }

  ngOnInit(): void {
    this.loadDepartments();
  }

  async loadDepartments(): Promise<void> {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      return;
    }

    this.isLoading = true;
    try {
      this.departments = await this.departmentService.getDepartmentsByOrganization(currentUser.organizationId);
    } catch (error) {
      console.error('部署の読み込みに失敗しました:', error);
      this.snackBar.open('部署の読み込みに失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 部署を追加
   */
  async addDepartment(): Promise<void> {
    if (this.departmentsForm.invalid) {
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser?.organizationId) {
      this.snackBar.open('組織情報が見つかりません', '閉じる', { duration: 3000 });
      return;
    }

    const formValue = this.departmentsForm.value;
    const department: Omit<Department, 'id' | 'createdAt' | 'updatedAt'> = {
      organizationId: currentUser.organizationId,
      name: formValue.name,
      code: formValue.code?.trim() || undefined,
      parentDepartmentId: formValue.parentDepartmentId || null,
      email: formValue.email?.trim() || undefined
    };

    this.isSaving = true;
    try {
      await this.departmentService.createDepartment(department);
      this.snackBar.open('部署を追加しました', '閉じる', { duration: 3000 });
      
      // フォームをリセット
      this.departmentsForm.patchValue({
        name: '',
        code: '',
        parentDepartmentId: null,
        email: ''
      });
      
      // 部署一覧を再読み込み
      await this.loadDepartments();
    } catch (error) {
      console.error('部署の追加に失敗しました:', error);
      this.snackBar.open('部署の追加に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * 部署を削除
   */
  async removeDepartment(departmentId: string): Promise<void> {
    if (!confirm('この部署を削除してもよろしいですか？')) {
      return;
    }

    try {
      await this.departmentService.deleteDepartment(departmentId);
      this.snackBar.open('部署を削除しました', '閉じる', { duration: 3000 });
      
      // 部署一覧を再読み込み
      await this.loadDepartments();
    } catch (error) {
      console.error('部署の削除に失敗しました:', error);
      this.snackBar.open('部署の削除に失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * 親部署名を取得
   */
  getParentDepartmentName(parentDepartmentId: string | null): string {
    if (!parentDepartmentId) {
      return '-';
    }
    const parent = this.departments.find(d => d.id === parentDepartmentId);
    return parent ? parent.name : '-';
  }
}
