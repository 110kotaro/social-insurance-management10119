import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
    // canActivateはredirectToと併用できないため削除
    // /dashboardへの直接アクセス時はauth.guard.tsでメール認証チェックが実行される
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
    path: 'password-setup',
    loadComponent: () => import('./features/auth/password-setup/password-setup.component').then(m => m.PasswordSetupComponent)
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
      },
      {
        path: 'employees',
        loadComponent: () => import('./features/employees/employee-list/employee-list.component').then(m => m.EmployeeListComponent)
      },
      {
        path: 'employees/create',
        loadComponent: () => import('./features/employees/employee-create/employee-create.component').then(m => m.EmployeeCreateComponent)
      },
      {
        path: 'employees/import',
        loadComponent: () => import('./features/employees/employee-import/employee-import.component').then(m => m.EmployeeImportComponent)
      },
      {
        path: 'employees/:id',
        loadComponent: () => import('./features/employees/employee-detail/employee-detail.component').then(m => m.EmployeeDetailComponent)
      },
      {
        path: 'employees/:id/edit',
        loadComponent: () => import('./features/employees/employee-edit/employee-edit.component').then(m => m.EmployeeEditComponent)
      },
      {
        path: 'employees/:id/other-company-salary',
        loadComponent: () => import('./features/employees/other-company-salary-input/other-company-salary-input.component').then(m => m.OtherCompanySalaryInputComponent)
      },
      {
        path: 'departments',
        loadComponent: () => import('./features/departments/department-list/department-list.component').then(m => m.DepartmentListComponent)
      },
      {
        path: 'departments/create',
        loadComponent: () => import('./features/departments/department-form/department-form.component').then(m => m.DepartmentFormComponent)
      },
      {
        path: 'departments/:id/edit',
        loadComponent: () => import('./features/departments/department-form/department-form.component').then(m => m.DepartmentFormComponent)
      },
      {
        path: 'applications',
        loadComponent: () => import('./features/applications/application-list/application-list.component').then(m => m.ApplicationListComponent)
      },
      {
        path: 'applications/create',
        loadComponent: () => import('./features/applications/application-create/application-create.component').then(m => m.ApplicationCreateComponent)
      },
      {
        path: 'applications/:id',
        loadComponent: () => import('./features/applications/application-detail/application-detail.component').then(m => m.ApplicationDetailComponent)
      },
      {
        path: 'applications/:id/edit',
        loadComponent: () => import('./features/applications/application-edit/application-edit.component').then(m => m.ApplicationEditComponent),
        canActivate: [authGuard]
      },
      {
        path: 'calculations',
        loadComponent: () => import('./features/calculations/calculation-list/calculation-list.component').then(m => m.CalculationListComponent)
      },
      {
        path: 'calculations/:id',
        loadComponent: () => import('./features/calculations/calculation-detail/calculation-detail.component').then(m => m.CalculationDetailComponent)
      },
      {
        path: 'bonus-calculations/:id',
        loadComponent: () => import('./features/calculations/bonus-calculation-detail/bonus-calculation-detail.component').then(m => m.BonusCalculationDetailComponent)
      },
      {
        path: 'standard-reward-calculations',
        loadComponent: () => import('./features/standard-reward-calculations/standard-reward-calculation-list/standard-reward-calculation-list.component').then(m => m.StandardRewardCalculationListComponent)
      },
      {
        path: 'standard-reward-calculations/:id',
        loadComponent: () => import('./features/standard-reward-calculations/standard-reward-calculation-detail/standard-reward-calculation-detail.component').then(m => m.StandardRewardCalculationDetailComponent)
      },
      {
        path: 'salary-input',
        loadComponent: () => import('./features/salary-input/salary-input.component').then(m => m.SalaryInputComponent)
      },
      {
        path: 'notifications',
        loadComponent: () => import('./features/notifications/notification-list/notification-list.component').then(m => m.NotificationListComponent)
      },
      {
        path: 'notifications/group/:groupId',
        loadComponent: () => import('./features/notifications/notification-detail/notification-detail.component').then(m => m.NotificationDetailComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent)
      },
      {
        path: 'analytics',
        loadComponent: () => import('./features/analytics/analytics.component').then(m => m.AnalyticsComponent)
      },
      {
        path: 'external-integration',
        loadComponent: () => import('./features/external-integration/external-integration.component').then(m => m.ExternalIntegrationComponent)
      },
      {
        path: 'my-info',
        loadComponent: () => import('./features/my-info/my-info.component').then(m => m.MyInfoComponent)
      },
      {
        path: 'account-settings',
        loadComponent: () => import('./features/account-settings/account-settings.component').then(m => m.AccountSettingsComponent)
      }
      // TODO: 他の認証が必要なルートをここに追加
    ]
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
