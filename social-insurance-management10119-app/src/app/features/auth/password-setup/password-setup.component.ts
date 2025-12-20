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
import { take } from 'rxjs/operators';
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
    console.log('[PasswordSetup] ngOnInit開始');
    // URLパラメータからoobCodeとmodeを取得
    this.route.queryParams.pipe(take(1)).subscribe(params => {
      console.log('[PasswordSetup] queryParams取得:', { oobCode: params['oobCode'] ? '存在' : 'null', mode: params['mode'] });
      this.oobCode = params['oobCode'] || null;
      this.mode = params['mode'] || null;

      if (this.oobCode && this.mode === 'resetPassword') {
        console.log('[PasswordSetup] リセットコード検証を開始');
        this.verifyResetCode();
      } else if (this.oobCode && this.mode === 'verifyEmail') {
        // メール認証のリンクの場合、email-verificationページにリダイレクト
        console.log('[PasswordSetup] メール認証リンク - email-verificationにリダイレクト');
        this.router.navigate(['/email-verification'], { 
          queryParams: { 
            mode: 'verifyEmail', 
            oobCode: this.oobCode 
          } 
        });
      } else {
        console.log('[PasswordSetup] 無効なリンク - oobCodeまたはmodeが不正:', { oobCode: this.oobCode, mode: this.mode });
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
    if (!this.oobCode) {
      console.log('[PasswordSetup] verifyResetCode: oobCodeがnull');
      return;
    }

    try {
      console.log('[PasswordSetup] verifyResetCode開始: oobCode存在');
      // パスワードリセットコードを検証してメールアドレスを取得
      const email = await verifyPasswordResetCode(this.auth, this.oobCode);
      console.log('[PasswordSetup] verifyResetCode成功: email取得', { email });
      this.email = email;
      this.isValidatingCode = false;
    } catch (error: any) {
      console.error('[PasswordSetup] パスワードリセットコードの検証に失敗しました:', error);
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
    console.log('[PasswordSetup] onSubmit開始:', { formValid: !this.passwordForm.invalid, oobCode: this.oobCode ? '存在' : 'null', email: this.email });
    
    if (this.passwordForm.invalid || !this.oobCode) {
      console.log('[PasswordSetup] onSubmit中止: フォーム無効またはoobCodeなし');
      return;
    }

    this.isLoading = true;

    try {
      const { password } = this.passwordForm.value;
      
      console.log('[PasswordSetup] confirmPasswordReset開始');
      // パスワードをリセット
      await confirmPasswordReset(this.auth, this.oobCode, password);
      console.log('[PasswordSetup] confirmPasswordReset成功');

      // パスワード設定後、自動的にログイン
      try {
        console.log('[PasswordSetup] signInWithEmailAndPassword開始:', { email: this.email });
        await signInWithEmailAndPassword(this.auth, this.email, password);
        console.log('[PasswordSetup] signInWithEmailAndPassword成功');
        
        // ログイン前に、usersコレクションにデータを作成（存在しない場合）
        const firebaseUser = this.auth.currentUser;
        console.log('[PasswordSetup] firebaseUser取得:', { uid: firebaseUser?.uid, email: firebaseUser?.email });
        
        if (firebaseUser) {
          // メールアドレスからemployeesコレクションを検索してemployeeIdとorganizationIdを取得
          console.log('[PasswordSetup] getEmployeeByEmail開始:', { email: this.email });
          const employee = await this.employeeService.getEmployeeByEmail(this.email);
          console.log('[PasswordSetup] getEmployeeByEmail結果:', { 
            employee: employee ? '存在' : 'null', 
            employeeId: employee?.id, 
            organizationId: employee?.organizationId,
            role: employee?.role
          });
          
          if (employee && employee.organizationId) {
            console.log('[PasswordSetup] employeeとorganizationIdが存在 - usersコレクション処理開始');
            // usersコレクションにデータが存在するか確認
            const userDocRef = doc(this.firestore, `${environment.firestorePrefix}users`, firebaseUser.uid);
            console.log('[PasswordSetup] usersコレクション確認開始:', { uid: firebaseUser.uid, prefix: environment.firestorePrefix });
            const userDoc = await getDoc(userDocRef);
            console.log('[PasswordSetup] usersコレクション確認結果:', { exists: userDoc.exists(), data: userDoc.exists() ? userDoc.data() : null });
            
            if (!userDoc.exists()) {
              console.log('[PasswordSetup] createUserDocumentForEmployee開始');
              const userDataToCreate = {
                email: this.email,
                displayName: `${employee.lastName} ${employee.firstName}`,
                role: employee.role || 'employee',
                emailVerified: false,
                isActive: true,
                organizationId: employee.organizationId,
                employeeId: employee.id,
                createdAt: new Date()
              };
              console.log('[PasswordSetup] createUserDocumentForEmployeeに渡すデータ:', userDataToCreate);
              // usersコレクションにデータを作成（employeesコレクションのroleを使用、デフォルト: 'employee'）
              try {
                await this.authService.createUserDocumentForEmployee(firebaseUser.uid, userDataToCreate);
                console.log('[PasswordSetup] createUserDocumentForEmployee成功');
                
                // 書き込み後、再度確認
                const verifyDoc = await getDoc(userDocRef);
                console.log('[PasswordSetup] createUserDocumentForEmployee後の確認:', { exists: verifyDoc.exists(), data: verifyDoc.exists() ? verifyDoc.data() : null });
              } catch (createError: any) {
                console.error('[PasswordSetup] createUserDocumentForEmployee失敗:', createError);
                console.error('[PasswordSetup] createUserDocumentForEmployeeエラー詳細:', {
                  code: createError.code,
                  message: createError.message,
                  stack: createError.stack
                });
                throw createError;
              }
            } else {
              console.log('[PasswordSetup] usersコレクション既存データを更新');
              const updateData = {
                employeeId: employee.id,
                organizationId: employee.organizationId,
                role: employee.role || 'employee',
                isActive: true
              };
              console.log('[PasswordSetup] 更新データ:', updateData);
              // 既存のデータを更新（employeeId、organizationId、roleを設定）
              try {
                await setDoc(userDocRef, updateData, { merge: true });
                console.log('[PasswordSetup] usersコレクション更新成功');
                
                // 更新後、再度確認
                const verifyDoc = await getDoc(userDocRef);
                console.log('[PasswordSetup] usersコレクション更新後の確認:', { exists: verifyDoc.exists(), data: verifyDoc.exists() ? verifyDoc.data() : null });
              } catch (updateError: any) {
                console.error('[PasswordSetup] usersコレクション更新失敗:', updateError);
                console.error('[PasswordSetup] usersコレクション更新エラー詳細:', {
                  code: updateError.code,
                  message: updateError.message,
                  stack: updateError.stack
                });
                throw updateError;
              }
            }
          } else {
            console.error('[PasswordSetup] employeeまたはorganizationIdが存在しません:', { 
              employee: employee ? '存在' : 'null', 
              employeeId: employee?.id,
              organizationId: employee?.organizationId,
              employeeFull: employee
            });
            // この場合でもusersコレクションにデータを作成する必要がある
            console.log('[PasswordSetup] organizationIdがない場合でもusersコレクションにデータを作成を試みます');
            const userDocRef = doc(this.firestore, `${environment.firestorePrefix}users`, firebaseUser.uid);
            const userDoc = await getDoc(userDocRef);
            if (!userDoc.exists()) {
              console.log('[PasswordSetup] organizationIdなしでcreateUserDocumentForEmployeeを呼び出し');
              try {
                await this.authService.createUserDocumentForEmployee(firebaseUser.uid, {
                  email: this.email,
                  displayName: employee ? `${employee.lastName} ${employee.firstName}` : '',
                  role: employee?.role || 'employee',
                  emailVerified: false,
                  isActive: true,
                  organizationId: employee?.organizationId,
                  employeeId: employee?.id,
                  createdAt: new Date()
                });
                console.log('[PasswordSetup] organizationIdなしでcreateUserDocumentForEmployee成功');
              } catch (createError: any) {
                console.error('[PasswordSetup] organizationIdなしでcreateUserDocumentForEmployee失敗:', createError);
              }
            }
          }
        } else {
          console.error('[PasswordSetup] firebaseUserがnull');
        }
        
        // AuthServiceのloginメソッドを使用して、Firestoreのチェックや最終ログイン時刻の更新を行う
        console.log('[PasswordSetup] authService.login開始');
        try {
          await this.authService.login(this.email, password);
          console.log('[PasswordSetup] authService.login成功');
        } catch (loginError: any) {
          console.error('[PasswordSetup] authService.login失敗:', loginError);
          throw loginError;
        }

        // ログイン成功後、現在のユーザーからemployeeIdを取得してemailVerifiedを更新
        const currentUser = this.authService.getCurrentUser();
        console.log('[PasswordSetup] currentUser取得:', { employeeId: currentUser?.employeeId });
        if (currentUser?.employeeId) {
          try {
            await this.employeeService.updateEmployee(currentUser.employeeId, {
              emailVerified: true
            });
            console.log('[PasswordSetup] emailVerified更新成功');
          } catch (updateError) {
            console.error('[PasswordSetup] 社員の認証状態の更新に失敗しました:', updateError);
            // エラーが発生しても処理は続行（パスワード設定は完了している）
          }
        }

        console.log('[PasswordSetup] パスワード設定完了 - ダッシュボードに遷移');
        this.snackBar.open('パスワードを設定しました。ログインしました。', '閉じる', { duration: 3000 });

        // ダッシュボードに遷移
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 2000);

      } catch (loginError: any) {
        // ログインに失敗した場合でも、パスワードは設定されているのでログイン画面に遷移
        console.error('[PasswordSetup] 自動ログインに失敗しました:', loginError);
        this.snackBar.open('パスワードを設定しました。ログイン画面からログインしてください。', '閉じる', { duration: 5000 });
        setTimeout(() => {
          this.router.navigate(['/login'], { queryParams: { email: this.email } });
        }, 2000);
      }

    } catch (error: any) {
      console.error('[PasswordSetup] パスワード設定に失敗しました:', error);
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
      console.log('[PasswordSetup] onSubmit完了');
    }
  }

  get password() {
    return this.passwordForm.get('password');
  }

  get confirmPassword() {
    return this.passwordForm.get('confirmPassword');
  }
}

