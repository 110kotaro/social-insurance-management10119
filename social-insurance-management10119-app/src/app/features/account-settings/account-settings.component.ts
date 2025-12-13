import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/models/user.model';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider, User as FirebaseUser } from '@angular/fire/auth';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatSlideToggleModule,
    MatDividerModule
  ],
  templateUrl: './account-settings.component.html',
  styleUrl: './account-settings.component.css'
})
export class AccountSettingsComponent implements OnInit {
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  passwordForm: FormGroup;
  notificationForm: FormGroup;
  currentUser: User | null = null;
  isChangingPassword = false;
  isSavingNotifications = false;

  constructor() {
    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });

    this.notificationForm = this.fb.group({
      emailNotificationEnabled: [true],
      inAppNotificationEnabled: [true]
    });
  }

  ngOnInit(): void {
    this.loadUserSettings();
  }

  /**
   * ユーザー設定を読み込む
   */
  async loadUserSettings(): Promise<void> {
    try {
      this.currentUser = this.authService.getCurrentUser();
      
      if (this.currentUser) {
        // 通知設定を読み込む（デフォルト値はtrue）
        this.notificationForm.patchValue({
          emailNotificationEnabled: this.currentUser.emailNotificationEnabled ?? true,
          inAppNotificationEnabled: this.currentUser.inAppNotificationEnabled ?? true
        });
      }
    } catch (error) {
      console.error('設定の読み込みに失敗しました:', error);
      this.snackBar.open('設定の読み込みに失敗しました', '閉じる', { duration: 3000 });
    }
  }

  /**
   * パスワード変更
   */
  async changePassword(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword } = this.passwordForm.value;

    if (newPassword.length < 8) {
      this.snackBar.open('パスワードは8文字以上である必要があります', '閉じる', { duration: 3000 });
      return;
    }

    this.isChangingPassword = true;

    try {
      // Firebase Authの現在のユーザーを取得
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser?.email) {
        throw new Error('ユーザー情報が見つかりません');
      }

      // Firebase Authのユーザーオブジェクトを取得するために、一時的にauthインスタンスにアクセス
      // 注意: これはAuthServiceの内部実装に依存するため、より良い方法があれば改善が必要
      const auth = (this.authService as any).auth;
      const firebaseUser = auth.currentUser;

      if (!firebaseUser || !firebaseUser.email) {
        throw new Error('Firebase認証情報が見つかりません');
      }

      // 現在のパスワードで再認証
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);

      // パスワードを更新
      await updatePassword(firebaseUser, newPassword);

      this.snackBar.open('パスワードを変更しました', '閉じる', { duration: 3000 });
      this.passwordForm.reset();
    } catch (error: any) {
      console.error('パスワード変更に失敗しました:', error);
      
      let errorMessage = 'パスワード変更に失敗しました';
      if (error.code === 'auth/wrong-password') {
        errorMessage = '現在のパスワードが正しくありません';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'パスワードが弱すぎます';
      }
      
      this.snackBar.open(errorMessage, '閉じる', { duration: 5000 });
    } finally {
      this.isChangingPassword = false;
    }
  }

  /**
   * 通知設定を保存
   */
  async saveNotificationSettings(): Promise<void> {
    if (!this.currentUser?.uid) {
      this.snackBar.open('ユーザー情報が見つかりません', '閉じる', { duration: 3000 });
      return;
    }

    this.isSavingNotifications = true;

    try {
      const settings = this.notificationForm.value;
      await this.authService.updateUserSettings(this.currentUser.uid, {
        emailNotificationEnabled: settings.emailNotificationEnabled,
        inAppNotificationEnabled: settings.inAppNotificationEnabled
      });

      // ローカルのユーザー情報を更新
      if (this.currentUser) {
        this.currentUser.emailNotificationEnabled = settings.emailNotificationEnabled;
        this.currentUser.inAppNotificationEnabled = settings.inAppNotificationEnabled;
      }

      this.snackBar.open('通知設定を保存しました', '閉じる', { duration: 3000 });
    } catch (error) {
      console.error('通知設定の保存に失敗しました:', error);
      this.snackBar.open('通知設定の保存に失敗しました', '閉じる', { duration: 3000 });
    } finally {
      this.isSavingNotifications = false;
    }
  }

  /**
   * パスワード一致バリデーター
   */
  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword');
    const confirmPassword = control.get('confirmPassword');

    if (!newPassword || !confirmPassword) {
      return null;
    }

    return newPassword.value === confirmPassword.value ? null : { passwordMismatch: true };
  }

  /**
   * パスワード不一致エラーを取得
   */
  getPasswordMismatchError(): boolean {
    return this.passwordForm.hasError('passwordMismatch') && 
           this.passwordForm.get('confirmPassword')?.touched === true;
  }
}
