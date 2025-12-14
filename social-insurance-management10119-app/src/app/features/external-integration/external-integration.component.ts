import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { EmployeeImportEnhancedComponent } from './employee-import-enhanced/employee-import-enhanced.component';
import { EmployeeExportComponent } from './employee-export/employee-export.component';
import { SalaryImportComponent } from './salary-import/salary-import.component';

@Component({
  selector: 'app-external-integration',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    EmployeeImportEnhancedComponent,
    EmployeeExportComponent,
    SalaryImportComponent
  ],
  templateUrl: './external-integration.component.html',
  styleUrl: './external-integration.component.css'
})
export class ExternalIntegrationComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  selectedTabIndex = 0;
  isLoading = false;
  organizationId: string | null = null;

  ngOnInit(): void {
    // 管理者権限チェック
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.role !== 'owner' && currentUser?.role !== 'admin') {
      this.snackBar.open('このページにアクセスする権限がありません', '閉じる', { duration: 3000 });
      this.router.navigate(['/dashboard']);
      return;
    }

    if (currentUser?.organizationId) {
      this.organizationId = currentUser.organizationId;
    }
  }
}
