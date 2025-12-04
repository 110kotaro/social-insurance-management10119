import { Component, OnInit, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Subscription } from 'rxjs';
import { filter, take } from 'rxjs/operators';

@Component({
  selector: 'app-email-verification',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './email-verification.component.html',
  styleUrl: './email-verification.component.css'
})
export class EmailVerificationComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  
  private subscriptions = new Subscription();
  isEmailVerified: boolean = false;
  isChecking: boolean = true;
  email: string = '';
  canResend: boolean = true;
  resendCooldown: number = 0; // 秒
  private resendTimer: any;

  ngOnInit(): void {
    // 現在のユーザー情報を取得
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.email = currentUser.email;
      this.isEmailVerified = currentUser.emailVerified;
    }

    // 認証状態を監視
    const authSub = this.authService.currentUser$.pipe(
      filter(user => user !== null),
      take(1)
    ).subscribe(user => {
      if (user) {
        this.email = user.email;
        this.isEmailVerified = user.emailVerified;
        this.isChecking = false;

        // メール認証が完了していたら、組織作成画面またはダッシュボードに遷移
        if (user.emailVerified) {
          setTimeout(() => {
            // 組織が既に作成済みの場合はダッシュボードに遷移
            // 未作成の場合は組織作成画面に遷移
            if (user.organizationId) {
              this.router.navigate(['/dashboard']);
            } else {
              this.router.navigate(['/organization/create']);
            }
          }, 2000); // 2秒後に遷移
        }
      }
    });

    this.subscriptions.add(authSub);

    // 初回チェック
    this.checkEmailVerification();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
    }
  }

  async checkEmailVerification(): Promise<void> {
    this.isChecking = true;
    
    // Firebase Authenticationの認証状態を再確認
    const user = this.authService.getCurrentUser();
    if (user) {
      this.isEmailVerified = user.emailVerified;
    }
    
    this.isChecking = false;

    // 認証済みの場合は組織作成画面またはダッシュボードに遷移
    if (this.isEmailVerified) {
      setTimeout(() => {
        const currentUser = this.authService.getCurrentUser();
        // 組織が既に作成済みの場合はダッシュボードに遷移
        // 未作成の場合は組織作成画面に遷移
        if (currentUser?.organizationId) {
          this.router.navigate(['/dashboard']);
        } else {
          this.router.navigate(['/organization/create']);
        }
      }, 2000);
    }
  }

  async resendVerificationEmail(): Promise<void> {
    if (!this.canResend) {
      return;
    }

    try {
      await this.authService.resendEmailVerification();
      this.canResend = false;
      this.resendCooldown = 60; // 60秒のクールダウン

      // クールダウンタイマー
      this.resendTimer = setInterval(() => {
        this.resendCooldown--;
        if (this.resendCooldown <= 0) {
          this.canResend = true;
          clearInterval(this.resendTimer);
        }
      }, 1000);
    } catch (error: any) {
      console.error('Error resending verification email:', error);
      alert(error.message || 'メールの再送信に失敗しました');
    }
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}

