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
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { EmployeeService } from '../../../core/services/employee.service';
import { DepartmentService } from '../../../core/services/department.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Employee, DependentInfo, InsuranceInfo, OtherCompanyInfo, Address, EmployeeChangeHistory, LeaveInfo, FileAttachment } from '../../../core/models/employee.model';
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
    MatSelectModule,
    MatFormFieldModule,
    MatTooltipModule,
    MatExpansionModule
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

  employee: Employee | null = null;
  department: Department | null = null;
  departments: Department[] = []; // 部署一覧（変更履歴表示用）
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
    const relationshipMap: Record<string, string> = {
      'husband': '夫',
      'wife': '妻',
      'husband_unregistered': '夫（未届）',
      'wife_unregistered': '妻（未届）',
      'child': '実子・養子',
      'other_child': '実子・養子以外の子',
      'parent': '父母・養父母',
      'parent_in_law': '義父母',
      'sibling': '弟妹',
      'elder_sibling': '兄姉',
      'grandparent': '祖父母',
      'great_grandparent': '曽祖父母',
      'grandchild': '孫',
      'other': 'その他'
    };
    return relationshipMap[relationship] || relationship;
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
   * 他社給与入力ページに遷移
   */
  goToOtherCompanySalaryInput(): void {
    if (this.employee?.id) {
      this.router.navigate(['/employees', this.employee.id, 'other-company-salary']);
    }
  }

  /**
   * 社員を招待（メール送信）
   */
  async inviteEmployee(): Promise<void> {
    if (!this.employee?.id || !this.employee?.organizationId) {
      this.snackBar.open('社員情報が不完全です', '閉じる', { duration: 3000 });
      return;
    }

    const confirmed = confirm(`${this.employee.lastName} ${this.employee.firstName} さんに招待メールを送信しますか？`);
    if (!confirmed) return;

    this.isInviting = true;

    try {
      await this.authService.inviteEmployee(
        this.employee.email,
        this.employee.id,
        this.employee.organizationId,
        `${this.employee.lastName} ${this.employee.firstName}`
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

  /**
   * 変更履歴を降順でソート（新しい順）
   */
  getSortedChangeHistory(): EmployeeChangeHistory[] {
    if (!this.employee?.changeHistory) {
      return [];
    }
    return [...this.employee.changeHistory].sort((a, b) => {
      const dateA = a.changedAt instanceof Date ? a.changedAt.getTime() : (a.changedAt?.toDate ? a.changedAt.toDate().getTime() : 0);
      const dateB = b.changedAt instanceof Date ? b.changedAt.getTime() : (b.changedAt?.toDate ? b.changedAt.toDate().getTime() : 0);
      return dateB - dateA; // 降順（新しい順）
    });
  }

  /**
   * フィールド名のラベルを取得
   */
  getFieldLabel(field: string): string {
    const labels: { [key: string]: string } = {
      'dependentInfo': '扶養情報',
      'address.official': '正式住所',
      'address.official.postalCode': '正式住所の郵便番号',
      'address.official.prefecture': '正式住所の都道府県',
      'address.official.city': '正式住所の市区町村',
      'address.official.street': '正式住所の町名・番地',
      'address.official.building': '正式住所の建物名',
      'address.official.kana': '正式住所の住所カナ',
      'firstName': '名',
      'lastName': '氏',
      'firstNameKana': '名カナ',
      'lastNameKana': '氏カナ',
      'email': 'メールアドレス',
      'departmentId': '部署',
      'status': 'ステータス',
      'role': '権限',
      'joinDate': '入社日',
      'birthDate': '生年月日',
      'insuranceInfo': '保険情報',
      'insuranceInfo.healthInsuranceNumber': '被保険者整理番号（健康保険）',
      'insuranceInfo.pensionNumber': '被保険者整理番号（厚生年金）',
      'insuranceInfo.myNumber': 'マイナンバー',
      'insuranceInfo.averageReward': '申請された平均月額',
      'insuranceInfo.grade': '健康保険の等級',
      'insuranceInfo.pensionGrade': '厚生年金の等級',
      'insuranceInfo.standardReward': '標準報酬月額',
      'insuranceInfo.insuranceStartDate': '保険適用開始日',
      'insuranceInfo.gradeAndStandardRewardEffectiveDate': '等級の適用開始日',
      'otherCompanyInfo': '他社勤務情報',
      'leaveInfo': '休職情報',
      'attachments': '添付ファイル'
    };
    return labels[field] || field;
  }

  /**
   * 変更値をフォーマット
   */
  formatChangeValue(value: any): string {
    if (value === null || value === undefined) {
      return '-';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return JSON.stringify(value, null, 2);
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  /**
   * 変更内容を分かりやすく表示する（変更箇所だけを表示）
   * 変更がない場合はnullを返す（表示しない）
   */
  formatChangeDisplay(change: { field: string; before: any; after: any }): string | null {
    const fieldLabel = this.getFieldLabel(change.field);
    
    // 添付ファイルの追加・削除
    if (change.field === 'attachments') {
      if (change.before === null && change.after && typeof change.after === 'object' && change.after.action === 'added') {
        return `添付ファイル「${change.after.fileName}」を追加`;
      }
      if (change.after === null && change.before && typeof change.before === 'object' && change.before.action === 'deleted') {
        return `添付ファイル「${change.before.fileName}」を削除`;
      }
    }

    // 日付フィールド
    if (change.field === 'joinDate' || change.field === 'birthDate' || 
        change.field === 'insuranceInfo.insuranceStartDate' || 
        change.field === 'insuranceInfo.gradeAndStandardRewardEffectiveDate') {
      const beforeDate = this.formatDateValue(change.before);
      const afterDate = this.formatDateValue(change.after);
      return `${fieldLabel}: ${beforeDate} → ${afterDate}`;
    }

    // ステータスフィールド
    if (change.field === 'status') {
      const statusLabels: { [key: string]: string } = {
        'active': '在籍',
        'leave': '休職',
        'retired': '退職',
        'pre_join': '未入社'
      };
      const beforeLabel = statusLabels[change.before] || change.before;
      const afterLabel = statusLabels[change.after] || change.after;
      return `${fieldLabel}: ${beforeLabel} → ${afterLabel}`;
    }

    // 権限フィールド
    if (change.field === 'role') {
      const roleLabels: { [key: string]: string } = {
        'admin': '管理者',
        'employee': '一般社員'
      };
      const beforeLabel = roleLabels[change.before] || change.before;
      const afterLabel = roleLabels[change.after] || change.after;
      return `${fieldLabel}: ${beforeLabel} → ${afterLabel}`;
    }

    // 部署ID（部署名に変換）
    if (change.field === 'departmentId') {
      const beforeDept = this.departments.find(d => d.id === change.before);
      const afterDept = this.departments.find(d => d.id === change.after);
      const beforeName = beforeDept ? beforeDept.name : (change.before || '-');
      const afterName = afterDept ? afterDept.name : (change.after || '-');
      return `${fieldLabel}: ${beforeName} → ${afterName}`;
    }

    // 保険情報の個別フィールド（文字列・数値）
    if (change.field.startsWith('insuranceInfo.') && 
        (change.field === 'insuranceInfo.healthInsuranceNumber' ||
         change.field === 'insuranceInfo.pensionNumber' ||
         change.field === 'insuranceInfo.myNumber' ||
         change.field === 'insuranceInfo.averageReward' ||
         change.field === 'insuranceInfo.grade' ||
         change.field === 'insuranceInfo.pensionGrade' ||
         change.field === 'insuranceInfo.standardReward')) {
      const beforeValue = change.before === null || change.before === undefined ? '-' : String(change.before);
      const afterValue = change.after === null || change.after === undefined ? '-' : String(change.after);
      return `${fieldLabel}: ${beforeValue} → ${afterValue}`;
    }

    // シンプルな文字列・数値フィールド
    if (typeof change.before === 'string' || typeof change.before === 'number' || 
        typeof change.after === 'string' || typeof change.after === 'number') {
      const beforeValue = change.before === null || change.before === undefined ? '-' : String(change.before);
      const afterValue = change.after === null || change.after === undefined ? '-' : String(change.after);
      return `${fieldLabel}: ${beforeValue} → ${afterValue}`;
    }

    // 休職情報の詳細表示
    if (change.field === 'leaveInfo') {
      const result = this.formatLeaveInfoChange(change.before, change.after);
      return result; // nullの場合はそのまま返す（表示しない）
    }

    // 住所情報の詳細表示（個別フィールド）
    if (change.field.startsWith('address.official.')) {
      const fieldName = change.field.replace('address.official.', '');
      const fieldLabels: { [key: string]: string } = {
        'postalCode': '郵便番号',
        'prefecture': '都道府県',
        'city': '市区町村',
        'street': '町名・番地',
        'building': '建物名',
        'kana': '住所カナ'
      };
      const fieldLabel = fieldLabels[fieldName] || fieldName;
      const beforeValue = change.before === null || change.before === undefined ? '-' : String(change.before);
      const afterValue = change.after === null || change.after === undefined ? '-' : String(change.after);
      // 変更がない場合はnullを返す
      if (beforeValue === afterValue) {
        return null;
      }
      return `正式住所の${fieldLabel}: ${beforeValue} → ${afterValue}`;
    }

    // 扶養情報の詳細表示
    if (change.field === 'dependentInfo') {
      const result = this.formatDependentInfoChange(change.before, change.after);
      return result; // nullの場合はそのまま返す（表示しない）
    }

    // 他社勤務情報の詳細表示
    if (change.field === 'otherCompanyInfo') {
      const result = this.formatOtherCompanyInfoChange(change.before, change.after);
      return result; // nullの場合はそのまま返す（表示しない）
    }

    // 保険情報全体（個別フィールドで記録されていない場合のフォールバック）
    if (change.field === 'insuranceInfo') {
      // 簡易的な差分表示
      const beforeStr = change.before ? JSON.stringify(change.before) : '-';
      const afterStr = change.after ? JSON.stringify(change.after) : '-';
      if (beforeStr === afterStr) {
        return null; // 変更なしの場合は表示しない
      }
      return `${fieldLabel}を更新`;
    }

    // その他
    return `${fieldLabel}: ${this.formatChangeValue(change.before)} → ${this.formatChangeValue(change.after)}`;
  }

  /**
   * 日付値をフォーマット
   */
  formatDateValue(value: any): string {
    if (!value) return '-';
    if (value instanceof Date) {
      return this.formatDate(value);
    }
    if (value?.toDate) {
      return this.formatDate(value.toDate());
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return this.formatDate(new Date(value));
    }
    return '-';
  }

  /**
   * 休職種別の表示ラベルを取得
   */
  getLeaveTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      'maternity': '産前産後休業',
      'childcare': '育児休業'
    };
    return labels[type] || type;
  }

  /**
   * 日付をDateオブジェクトに変換
   */
  convertToDate(date: Date | any): Date | null {
    if (!date) return null;
    if (date instanceof Date) return date;
    if (date?.toDate) return date.toDate();
    return new Date(date);
  }

  /**
   * 休職情報の変更を詳細に表示
   * 変更がない場合はnullを返す（表示しない）
   */
  formatLeaveInfoChange(before: any, after: any): string | null {
    const beforeArray = Array.isArray(before) ? before : (before ? [before] : []);
    const afterArray = Array.isArray(after) ? after : (after ? [after] : []);

    // 両方とも空の場合（変更なしの場合はnullを返して表示しない）
    if (beforeArray.length === 0 && afterArray.length === 0) {
      return null as any; // 変更なしの場合は表示しない
    }

    // 追加された場合
    if (beforeArray.length === 0 && afterArray.length > 0) {
      const messages = afterArray.map((leave: any, index: number) => {
        const typeLabel = this.getLeaveTypeLabel(leave.type || '');
        const startDate = this.formatDateValue(leave.startDate);
        const endDate = leave.endDate ? this.formatDateValue(leave.endDate) : null;
        const dateInfo = endDate ? `開始日: ${startDate}、終了日: ${endDate}` : `開始日: ${startDate}`;
        return `休職情報${index + 1}（${typeLabel}、${dateInfo}）を追加`;
      });
      return messages.join('、');
    }

    // 削除された場合
    if (beforeArray.length > 0 && afterArray.length === 0) {
      const messages = beforeArray.map((leave: any, index: number) => {
        const typeLabel = this.getLeaveTypeLabel(leave.type || '');
        const startDate = this.formatDateValue(leave.startDate);
        const endDate = leave.endDate ? this.formatDateValue(leave.endDate) : null;
        const dateInfo = endDate ? `開始日: ${startDate}、終了日: ${endDate}` : `開始日: ${startDate}`;
        return `休職情報${index + 1}（${typeLabel}、${dateInfo}）を削除`;
      });
      return messages.join('、');
    }

    // 変更があった場合
    const changes: string[] = [];
    const maxLength = Math.max(beforeArray.length, afterArray.length);

    for (let i = 0; i < maxLength; i++) {
      const beforeLeave = beforeArray[i];
      const afterLeave = afterArray[i];
      const leaveIndex = i + 1;

      // 追加された休職情報
      if (!beforeLeave && afterLeave) {
        const typeLabel = this.getLeaveTypeLabel(afterLeave.type || '');
        const startDate = this.formatDateValue(afterLeave.startDate);
        const endDate = afterLeave.endDate ? this.formatDateValue(afterLeave.endDate) : null;
        const dateInfo = endDate ? `開始日: ${startDate}、終了日: ${endDate}` : `開始日: ${startDate}`;
        changes.push(`休職情報${leaveIndex}（${typeLabel}、${dateInfo}）を追加`);
        continue;
      }

      // 削除された休職情報
      if (beforeLeave && !afterLeave) {
        const typeLabel = this.getLeaveTypeLabel(beforeLeave.type || '');
        const startDate = this.formatDateValue(beforeLeave.startDate);
        const endDate = beforeLeave.endDate ? this.formatDateValue(beforeLeave.endDate) : null;
        const dateInfo = endDate ? `開始日: ${startDate}、終了日: ${endDate}` : `開始日: ${startDate}`;
        changes.push(`休職情報${leaveIndex}（${typeLabel}、${dateInfo}）を削除`);
        continue;
      }

      // 変更があった休職情報
      if (beforeLeave && afterLeave) {
        const leaveChanges: string[] = [];

        // 休職種別の変更
        if (beforeLeave.type !== afterLeave.type) {
          const beforeTypeLabel = this.getLeaveTypeLabel(beforeLeave.type || '');
          const afterTypeLabel = this.getLeaveTypeLabel(afterLeave.type || '');
          leaveChanges.push(`休職種別: ${beforeTypeLabel} → ${afterTypeLabel}`);
        }

        // 開始日の変更
        const beforeStartDate = this.formatDateValue(beforeLeave.startDate);
        const afterStartDate = this.formatDateValue(afterLeave.startDate);
        if (beforeStartDate !== afterStartDate) {
          leaveChanges.push(`開始日: ${beforeStartDate} → ${afterStartDate}`);
        }

        // 終了日の変更
        const beforeEndDate = this.formatDateValue(beforeLeave.endDate);
        const afterEndDate = this.formatDateValue(afterLeave.endDate);
        if (beforeEndDate !== afterEndDate) {
          leaveChanges.push(`終了日: ${beforeEndDate || '未設定'} → ${afterEndDate || '未設定'}`);
        }

        // 承認状態の変更
        if (beforeLeave.isApproved !== afterLeave.isApproved) {
          const beforeApproved = beforeLeave.isApproved ? '承認済み' : '未承認';
          const afterApproved = afterLeave.isApproved ? '承認済み' : '未承認';
          leaveChanges.push(`承認状態: ${beforeApproved} → ${afterApproved}`);
        }

        if (leaveChanges.length > 0) {
          changes.push(`休職情報${leaveIndex}: ${leaveChanges.join('、')}`);
        }
      }
    }

    if (changes.length === 0) {
      return '休職情報: 変更なし';
    }

    return changes.join('、');
  }

  /**
   * 住所情報の変更を詳細表示
   * 変更がない場合はnullを返す（表示しない）
   */
  formatAddressChange(before: any, after: any): string | null {
    const beforeAddress = before || {};
    const afterAddress = after || {};
    const changes: string[] = [];

    const fieldLabels: { [key: string]: string } = {
      'postalCode': '郵便番号',
      'prefecture': '都道府県',
      'city': '市区町村',
      'street': '町名・番地',
      'building': '建物名',
      'kana': '住所カナ'
    };

    for (const [key, label] of Object.entries(fieldLabels)) {
      const beforeValue = beforeAddress[key] || null;
      const afterValue = afterAddress[key] || null;
      if (beforeValue !== afterValue) {
        const beforeStr = beforeValue === null ? '-' : String(beforeValue);
        const afterStr = afterValue === null ? '-' : String(afterValue);
        changes.push(`${label}: ${beforeStr} → ${afterStr}`);
      }
    }

    if (changes.length === 0) {
      return null as any; // 変更なしの場合は表示しない
    }

    return `正式住所: ${changes.join('、')}`;
  }

  /**
   * 扶養情報の変更を詳細表示
   * 変更がない場合はnullを返す（表示しない）
   */
  formatDependentInfoChange(before: any, after: any): string | null {
    // アクション形式の変更履歴（employee-edit.component.tsから）
    if (before && typeof before === 'object' && before.action) {
      if (before.action === 'added') {
        const dep = before.data;
        const name = dep.name || `${dep.lastName || ''} ${dep.firstName || ''}`.trim() || '（氏名不明）';
        const relationshipLabel = this.getRelationshipLabel(dep.relationship);
        const birthDate = this.formatDateValue(dep.birthDate);
        return `被扶養者を追加: ${name}（${relationshipLabel}、生年月日: ${birthDate}）`;
      } else if (before.action === 'deleted') {
        const dep = before.data;
        const name = dep.name || `${dep.lastName || ''} ${dep.firstName || ''}`.trim() || '（氏名不明）';
        const relationshipLabel = this.getRelationshipLabel(dep.relationship);
        const birthDate = this.formatDateValue(dep.birthDate);
        return `被扶養者を削除: ${name}（${relationshipLabel}、生年月日: ${birthDate}）`;
      } else if (before.action === 'changed') {
        const oldDep = before.data;
        const newDep = after.data;
        const name = newDep.name || `${newDep.lastName || ''} ${newDep.firstName || ''}`.trim() || '（氏名不明）';
        const changes: string[] = [];

        // 氏名の変更
        const oldName = oldDep.name || `${oldDep.lastName || ''} ${oldDep.firstName || ''}`.trim();
        const newName = newDep.name || `${newDep.lastName || ''} ${newDep.firstName || ''}`.trim();
        if (oldName !== newName) {
          changes.push(`氏名: ${oldName || '-'} → ${newName || '-'}`);
        }

        // 続柄の変更
        if (oldDep.relationship !== newDep.relationship) {
          const oldRel = this.getRelationshipLabel(oldDep.relationship);
          const newRel = this.getRelationshipLabel(newDep.relationship);
          changes.push(`続柄: ${oldRel} → ${newRel}`);
        }

        // 生年月日の変更
        const oldBirthDate = this.formatDateValue(oldDep.birthDate);
        const newBirthDate = this.formatDateValue(newDep.birthDate);
        if (oldBirthDate !== newBirthDate) {
          changes.push(`生年月日: ${oldBirthDate} → ${newBirthDate}`);
        }

        // 年収の変更
        if (oldDep.income !== newDep.income) {
          const oldIncome = oldDep.income === null || oldDep.income === undefined ? '-' : `${oldDep.income.toLocaleString()}円`;
          const newIncome = newDep.income === null || newDep.income === undefined ? '-' : `${newDep.income.toLocaleString()}円`;
          changes.push(`年収: ${oldIncome} → ${newIncome}`);
        }

        // 同一世帯の変更
        if (oldDep.livingTogether !== newDep.livingTogether) {
          const oldLiving = oldDep.livingTogether ? '同一世帯' : '別世帯';
          const newLiving = newDep.livingTogether ? '同一世帯' : '別世帯';
          changes.push(`同一世帯: ${oldLiving} → ${newLiving}`);
        }

        if (changes.length === 0) {
          return null as any; // 変更なしの場合は表示しない
        }

        return `被扶養者「${name}」: ${changes.join('、')}`;
      }
    }

    // 従来の形式（配列全体の比較）
    const beforeArray = Array.isArray(before) ? before : (before ? [before] : []);
    const afterArray = Array.isArray(after) ? after : (after ? [after] : []);

    if (beforeArray.length === 0 && afterArray.length === 0) {
      return '扶養情報: 変更なし';
    }

    if (beforeArray.length === 0 && afterArray.length > 0) {
      const messages = afterArray.map((dep: any, index: number) => {
        const name = dep.name || `${dep.lastName || ''} ${dep.firstName || ''}`.trim() || '（氏名不明）';
        const relationshipLabel = this.getRelationshipLabel(dep.relationship);
        const birthDate = this.formatDateValue(dep.birthDate);
        return `被扶養者${index + 1}（${name}、${relationshipLabel}、生年月日: ${birthDate}）を追加`;
      });
      return messages.join('、');
    }

    if (beforeArray.length > 0 && afterArray.length === 0) {
      const messages = beforeArray.map((dep: any, index: number) => {
        const name = dep.name || `${dep.lastName || ''} ${dep.firstName || ''}`.trim() || '（氏名不明）';
        const relationshipLabel = this.getRelationshipLabel(dep.relationship);
        const birthDate = this.formatDateValue(dep.birthDate);
        return `被扶養者${index + 1}（${name}、${relationshipLabel}、生年月日: ${birthDate}）を削除`;
      });
      return messages.join('、');
    }

    return '扶養情報を更新';
  }

  /**
   * 他社勤務情報の変更を詳細表示
   * 変更がない場合はnullを返す（表示しない）
   */
  formatOtherCompanyInfoChange(before: any, after: any): string | null {
    // アクション形式の変更履歴（employee-edit.component.tsから）
    if (before && typeof before === 'object' && before.action) {
      if (before.action === 'added') {
        const company = before.data;
        const primaryLabel = company.isPrimary ? '（主たる勤務先）' : '';
        return `他社勤務を追加: ${company.companyName}${primaryLabel}`;
      } else if (before.action === 'deleted') {
        const company = before.data;
        const primaryLabel = company.isPrimary ? '（主たる勤務先）' : '';
        return `他社勤務を削除: ${company.companyName}${primaryLabel}`;
      } else if (before.action === 'changed') {
        const oldCompany = before.data;
        const newCompany = after.data;
        const changes: string[] = [];

        // 会社名の変更
        if (oldCompany.companyName !== newCompany.companyName) {
          changes.push(`会社名: ${oldCompany.companyName} → ${newCompany.companyName}`);
        }

        // 主たる勤務先の変更
        if (oldCompany.isPrimary !== newCompany.isPrimary) {
          const oldPrimary = oldCompany.isPrimary ? '主たる勤務先' : '副たる勤務先';
          const newPrimary = newCompany.isPrimary ? '主たる勤務先' : '副たる勤務先';
          changes.push(`${oldPrimary} → ${newPrimary}`);
        }

        if (changes.length === 0) {
          return null as any; // 変更なしの場合は表示しない
        }

        return `他社勤務「${newCompany.companyName}」: ${changes.join('、')}`;
      }
    }

    // 従来の形式（配列全体の比較）
    const beforeArray = Array.isArray(before) ? before : (before ? [before] : []);
    const afterArray = Array.isArray(after) ? after : (after ? [after] : []);

    if (beforeArray.length === 0 && afterArray.length === 0) {
      return null as any; // 変更なしの場合は表示しない
    }

    if (beforeArray.length === 0 && afterArray.length > 0) {
      const messages = afterArray.map((company: any, index: number) => {
        const primaryLabel = company.isPrimary ? '（主たる勤務先）' : '';
        return `他社勤務${index + 1}（${company.companyName}${primaryLabel}）を追加`;
      });
      return messages.join('、');
    }

    if (beforeArray.length > 0 && afterArray.length === 0) {
      const messages = beforeArray.map((company: any, index: number) => {
        const primaryLabel = company.isPrimary ? '（主たる勤務先）' : '';
        return `他社勤務${index + 1}（${company.companyName}${primaryLabel}）を削除`;
      });
      return messages.join('、');
    }

    return '他社勤務情報を更新';
  }

}

