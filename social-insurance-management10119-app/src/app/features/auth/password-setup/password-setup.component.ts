import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Auth, confirmPasswordReset, verifyPasswordResetCode, signInWithEmailAndPassword } from '@angular/fire/auth';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { AuthService } from '../../../core/auth/auth.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-password-setup',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule
  ],
  templateUrl: './password-setup.component.html',
  styleUrl: './password-setup.component.css'
})
export class PasswordSetupComponent implements OnInit {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private employeeService = inject(EmployeeService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  passwordForm: FormGroup;
  oobCode: string | null = null;
  mode: string | null = null;
  isLoading = false;
  isValidatingCode = true;
  email: string = '';

  constructor() {
    this.passwordForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    }, {
      validators: this.passwordMatchValidator
    });
  }

  ngOnInit(): void {
    // URLパラメータからoobCodeとmodeを取得
    this.route.queryParams.subscribe(params => {
      this.oobCode = params['oobCode'] || null;
      this.mode = params['mode'] || null;

      if (this.oobCode && this.mode === 'resetPassword') {
        this.verifyResetCode();
      } else {
        this.isValidatingCode = false;
        this.snackBar.open('無効なリンクです', '閉じる', { duration: 3000 });
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 2000);
      }
    });
  }

  /**
   * パスワードリセットコードを検証
   */
  private async verifyResetCode(): Promise<void> {
    if (!this.oobCode) return;

    try {
      // パスワードリセットコードを検証してメールアドレスを取得
      const email = await verifyPasswordResetCode(this.auth, this.oobCode);
      this.email = email;
      this.isValidatingCode = false;
    } catch (error: any) {
      console.error('パスワードリセットコードの検証に失敗しました:', error);
      this.isValidatingCode = false;
      this.snackBar.open('無効または期限切れのリンクです', '閉じる', { duration: 5000 });
      setTimeout(() => {
        this.router.navigate(['/login']);
      }, 2000);
    }
  }

  /**
   * パスワード一致バリデーター
   */
  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');
    
    if (!password || !confirmPassword) {
      return null;
    }
    
    return password.value === confirmPassword.value ? null : { passwordMismatch: true };
  }

  /**
   * パスワード設定を送信
   */
  async onSubmit(): Promise<void> {
    if (this.passwordForm.invalid || !this.oobCode) {
      return;
    }

    this.isLoading = true;

    try {
      const { password } = this.passwordForm.value;
      
      // パスワードをリセット
      await confirmPasswordReset(this.auth, this.oobCode, password);

      // パスワード設定後、自動的にログイン
      try {
        await signInWithEmailAndPassword(this.auth, this.email, password);
        
        // ログイン前に、usersコレクションにデータを作成（存在しない場合）
        const firebaseUser = this.auth.currentUser;
        if (firebaseUser) {
          // メールアドレスからemployeesコレクションを検索してemployeeIdとorganizationIdを取得
          const employee = await this.employeeService.getEmployeeByEmail(this.email);
          
          if (employee && employee.organizationId) {
            // usersコレクションにデータが存在するか確認
            const userDocRef = doc(this.firestore, `${environment.firestorePrefix}users`, firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);
            
            if (!userDoc.exists()) {
              // usersコレクションにデータを作成（employeesコレクションのroleを使用、デフォルト: 'employee'）
              await this.authService.createUserDocumentForEmployee(firebaseUser.uid, {
                email: this.email,
                displayName: `${employee.lastName} ${employee.firstName}`,
                role: employee.role || 'employee',
                emailVerified: false,
                isActive: true,
                organizationId: employee.organizationId,
                employeeId: employee.id,
                createdAt: new Date()
              });
            } else {
              // 既存のデータを更新（employeeId、organizationId、roleを設定）
              await setDoc(userDocRef, {
                employeeId: employee.id,
                organizationId: employee.organizationId,
                role: employee.role || 'employee',
                isActive: true
              }, { merge: true });
            }
          }
        }
        
        // AuthServiceのloginメソッドを使用して、Firestoreのチェックや最終ログイン時刻の更新を行う
        await this.authService.login(this.email, password);

        // ログイン成功後、現在のユーザーからemployeeIdを取得してemailVerifiedを更新
        const currentUser = this.authService.getCurrentUser();
        if (currentUser?.employeeId) {
          try {
            await this.employeeService.updateEmployee(currentUser.employeeId, {
              emailVerified: true
            });
          } catch (updateError) {
            console.error('社員の認証状態の更新に失敗しました:', updateError);
            // エラーが発生しても処理は続行（パスワード設定は完了している）
          }
        }

        this.snackBar.open('パスワードを設定しました。ログインしました。', '閉じる', { duration: 3000 });

        // ダッシュボードに遷移
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 2000);

      } catch (loginError: any) {
        // ログインに失敗した場合でも、パスワードは設定されているのでログイン画面に遷移
        console.error('自動ログインに失敗しました:', loginError);
        this.snackBar.open('パスワードを設定しました。ログイン画面からログインしてください。', '閉じる', { duration: 5000 });
        setTimeout(() => {
          this.router.navigate(['/login'], { queryParams: { email: this.email } });
        }, 2000);
      }

    } catch (error: any) {
      console.error('パスワード設定に失敗しました:', error);
      let errorMessage = 'パスワード設定に失敗しました';
      
      if (error.code === 'auth/expired-action-code') {
        errorMessage = 'リンクの有効期限が切れています。再度招待メールを送信してください。';
      } else if (error.code === 'auth/invalid-action-code') {
        errorMessage = '無効なリンクです。再度招待メールを送信してください。';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'パスワードが弱すぎます（6文字以上）';
      }
      
      this.snackBar.open(errorMessage, '閉じる', { duration: 5000 });
    } finally {
      this.isLoading = false;
    }
  }

  get password() {
    return this.passwordForm.get('password');
  }

  get confirmPassword() {
    return this.passwordForm.get('confirmPassword');
  }
}

