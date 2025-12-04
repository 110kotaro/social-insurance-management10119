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
      }
      // TODO: 他の認証が必要なルートをここに追加
    ]
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
