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
    // 既にユーザーが存在する場合は即座に許可（キャンセル操作後の問題を解決）
    return of(true);
  }

  // nullの場合は、currentUser$を待つ（リロード時の問題は置いておくため、短いタイムアウト）
  return authService.currentUser$.pipe(
    filter(user => user !== null), // nullを除外
    take(1),
    timeout(1000), // 1秒でタイムアウト（リロード時の問題は置いておく）
    map(user => {
      if (user && user.isActive) {
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

