import { Component, OnInit, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Auth, applyActionCode } from '@angular/fire/auth';
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
  private route = inject(ActivatedRoute);
  private auth = inject(Auth);
  
  private subscriptions = new Subscription();
  isEmailVerified: boolean = false;
  isChecking: boolean = true;
  email: string = '';
  canResend: boolean = true;
  resendCooldown: number = 0; // 秒
  private resendTimer: any;

  ngOnInit(): void {
    // URLパラメータからoobCodeとmodeを取得
    this.route.queryParams.pipe(take(1)).subscribe(async params => {
      const oobCode = params['oobCode'] || null;
      const mode = params['mode'] || null;

      if (oobCode && mode === 'verifyEmail') {
        console.log('[EmailVerification] メール認証リンクからアクセス - applyActionCodeを実行');
        try {
          // メール認証を完了
          await applyActionCode(this.auth, oobCode);
          console.log('[EmailVerification] applyActionCode成功 - メール認証完了');
          // 認証状態を再読み込み
          await this.authService.reloadCurrentUser();
          console.log('[EmailVerification] reloadCurrentUser完了 - 認証状態を確認');
          // 認証完了後、状態を確認
          await this.checkEmailVerification();
        } catch (error: any) {
          console.error('[EmailVerification] applyActionCode失敗:', error);
          // エラーが発生しても処理を続行（既に認証済みの可能性がある）
          await this.checkEmailVerification();
        }
      } else {
        // メール認証リンクではない場合、通常の処理を実行
        this.initializeComponent();
      }
    });
  }

  /**
   * コンポーネントの初期化処理（メール認証リンク以外の場合）
   */
  private initializeComponent(): void {
    // 現在のユーザー情報を取得
    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      this.email = currentUser.email;
      this.isEmailVerified = currentUser.emailVerified;
    }

    // 認証状態を監視（初回登録直後の誤判定を防ぐため、Firebase Authenticationの状態も確認）
    const authSub = this.authService.currentUser$.pipe(
      filter(user => user !== null),
      take(1)
    ).subscribe(async user => {
      if (user) {
        this.email = user.email;
        // Firestoreの状態とFirebase Authenticationの状態の両方を確認
        const firebaseUser = await this.authService.reloadCurrentUser();
        const actualEmailVerified = firebaseUser?.emailVerified ?? user.emailVerified;
        this.isEmailVerified = actualEmailVerified;
        this.isChecking = false;

        // メール認証が完了していたら、組織作成画面またはダッシュボードに遷移
        // Firebase Authenticationの状態を再確認してから遷移（初回登録直後の誤判定を防ぐ）
        if (actualEmailVerified) {
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
    console.log('[EmailVerification] checkEmailVerification() 開始');
    this.isChecking = true;
    
    try {
      // 現在の状態を確認
      const currentUserBefore = this.authService.getCurrentUser();
      console.log('[EmailVerification] 更新前の状態:', {
        currentUser: currentUserBefore ? {
          uid: currentUserBefore.uid,
          email: currentUserBefore.email,
          emailVerified: currentUserBefore.emailVerified,
          organizationId: currentUserBefore.organizationId,
          isActive: currentUserBefore.isActive
        } : null,
        isEmailVerified: this.isEmailVerified
      });
      
      // Firebase Authenticationの認証状態を直接確認し、最新状態を取得
      console.log('[EmailVerification] reloadCurrentUser() を呼び出し');
      const firebaseUser = await this.authService.reloadCurrentUser();
      console.log('[EmailVerification] reloadCurrentUser() 完了:', {
        firebaseUser: firebaseUser ? {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          emailVerified: firebaseUser.emailVerified
        } : null
      });
      
      if (firebaseUser) {
        console.log('[EmailVerification] firebaseUser.emailVerified:', firebaseUser.emailVerified);
        this.isEmailVerified = firebaseUser.emailVerified;
        this.email = firebaseUser.email || '';
        console.log('[EmailVerification] isEmailVerified を更新:', this.isEmailVerified);
        
        // Firestoreの状態も更新（onAuthStateChangedが処理する）
        // 少し待ってからcurrentUserSubjectが更新されるのを待つ
        console.log('[EmailVerification] 500ms待機中...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const currentUserAfter = this.authService.getCurrentUser();
        console.log('[EmailVerification] 更新後の状態:', {
          currentUser: currentUserAfter ? {
            uid: currentUserAfter.uid,
            email: currentUserAfter.email,
            emailVerified: currentUserAfter.emailVerified,
            organizationId: currentUserAfter.organizationId,
            isActive: currentUserAfter.isActive
          } : null,
          isEmailVerified: this.isEmailVerified
        });
        
        // 認証済みの場合は組織作成画面またはダッシュボードに遷移
        // Firebase Authenticationの状態を再確認（初回登録直後の誤判定を防ぐ）
        if (this.isEmailVerified && firebaseUser.emailVerified) {
          console.log('[EmailVerification] 認証済み - 遷移処理開始');
          const currentUser = this.authService.getCurrentUser();
          // 組織が既に作成済みの場合はダッシュボードに遷移
          // 未作成の場合は組織作成画面に遷移
          if (currentUser?.organizationId) {
            console.log('[EmailVerification] ダッシュボードに遷移');
            this.router.navigate(['/dashboard']);
          } else {
            console.log('[EmailVerification] 組織作成画面に遷移');
            this.router.navigate(['/organization/create']);
          }
        } else {
          console.log('[EmailVerification] まだ認証されていません', {
            isEmailVerified: this.isEmailVerified,
            firebaseEmailVerified: firebaseUser?.emailVerified
          });
        }
      } else {
        console.error('[EmailVerification] firebaseUser が null - usersコレクションにデータが存在しない可能性があります');
      }
    } catch (error) {
      console.error('[EmailVerification] メール認証状態の確認に失敗しました:', error);
    } finally {
      this.isChecking = false;
      console.log('[EmailVerification] checkEmailVerification() 終了, isChecking:', this.isChecking);
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

