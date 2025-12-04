import { inject } from '@angular/core';
import { Router, CanActivateFn, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { map, take } from 'rxjs/operators';

/**
 * 特定のロールのみアクセス可能にするガード
 */
export const roleGuard = (allowedRoles: ('owner' | 'admin' | 'employee')[]): CanActivateFn => {
  return (route: ActivatedRouteSnapshot) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return authService.currentUser$.pipe(
      take(1),
      map(user => {
        if (!user || !user.isActive) {
          router.navigate(['/login']);
          return false;
        }

        // ownerはすべてのロールにアクセス可能
        if (user.role === 'owner') {
          return true;
        }

        // adminはadminとemployeeにアクセス可能
        if (user.role === 'admin' && (allowedRoles.includes('admin') || allowedRoles.includes('employee'))) {
          return true;
        }

        // employeeはemployeeのみアクセス可能
        if (user.role === 'employee' && allowedRoles.includes('employee')) {
          return true;
        }

        // 権限がない場合はダッシュボードにリダイレクト
        router.navigate(['/dashboard']);
        return false;
      })
    );
  };
};

