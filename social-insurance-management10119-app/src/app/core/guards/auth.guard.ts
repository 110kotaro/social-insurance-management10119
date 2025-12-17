import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { map, take, filter, timeout, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

/**
 * 認証済みユーザーのみアクセス可能にするガード
 */
export const authGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot
) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // まず現在のユーザーを同期的に取得
  const currentUser = authService.getCurrentUser();
  if (currentUser && currentUser.isActive) {
    // メール認証が必要なルート（組織作成画面など）では、メール認証済みかチェック
    if (state.url.includes('/organization/create') || state.url.includes('/setup')) {
      if (!currentUser.emailVerified) {
        router.navigate(['/email-verification']);
        return of(false);
      }
    }
    // メール認証未完了かつ組織未作成の場合は、メール認証画面にリダイレクト
    // 社員はorganizationIdが既に設定されているため、このチェックをスキップされる
    if (!currentUser.emailVerified && !currentUser.organizationId) {
      // email-verification画面へのアクセスは許可（無限ループを防ぐ）
      if (!state.url.includes('/email-verification')) {
        router.navigate(['/email-verification']);
        return of(false);
      }
    }
    // ダッシュボードへのアクセス時もメール認証チェック（初回アカウント作成時の問題を防ぐ）
    if (state.url.includes('/dashboard')) {
      if (!currentUser.emailVerified && !currentUser.organizationId) {
        router.navigate(['/email-verification']);
        return of(false);
      }
    }
    // 既にユーザーが存在する場合は即座に許可（キャンセル操作後の問題を解決）
    return of(true);
  }

  // nullの場合は、currentUser$を待つ（入力内容が多い場合の認証状態復帰を待つため、タイムアウトを延長）
  return authService.currentUser$.pipe(
    filter(user => user !== null), // nullを除外
    take(1),
    timeout(3000), // 3秒でタイムアウト（入力内容が多い場合でも認証状態の復帰を待てるように延長）
    map(user => {
      if (user && user.isActive) {
        // メール認証が必要なルート（組織作成画面など）では、メール認証済みかチェック
        if (state.url.includes('/organization/create') || state.url.includes('/setup')) {
          if (!user.emailVerified) {
            router.navigate(['/email-verification']);
            return false;
          }
        }
        // メール認証未完了かつ組織未作成の場合は、メール認証画面にリダイレクト
        // 社員はorganizationIdが既に設定されているため、このチェックをスキップされる
        if (!user.emailVerified && !user.organizationId) {
          // email-verification画面へのアクセスは許可（無限ループを防ぐ）
          if (!state.url.includes('/email-verification')) {
            router.navigate(['/email-verification']);
            return false;
          }
        }
        // ダッシュボードへのアクセス時もメール認証チェック（初回アカウント作成時の問題を防ぐ）
        if (state.url.includes('/dashboard')) {
          if (!user.emailVerified && !user.organizationId) {
            router.navigate(['/email-verification']);
            return false;
          }
        }
        return true;
      } else {
        router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
        return false;
      }
    }),
    catchError(() => {
      // タイムアウトまたはエラーの場合、ログイン画面にリダイレクト
      router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
      return of(false);
    })
  );
};

