import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'email-verification',
    loadComponent: () => import('./features/auth/email-verification/email-verification.component').then(m => m.EmailVerificationComponent)
  },
  {
    path: 'organization/create',
    loadComponent: () => import('./features/organization/organization-create/organization-create.component').then(m => m.OrganizationCreateComponent),
    canActivate: [authGuard]
  },
  {
    path: 'setup',
    loadComponent: () => import('./features/setup/setup-wizard/setup-wizard.component').then(m => m.SetupWizardComponent),
    canActivate: [authGuard]
  },
  {
    path: '',
    loadComponent: () => import('./shared/components/layout/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/admin-dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent)
      }
      // TODO: 他の認証が必要なルートをここに追加
    ]
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
