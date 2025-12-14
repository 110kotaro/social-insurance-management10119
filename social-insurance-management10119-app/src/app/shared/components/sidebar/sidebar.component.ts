import { Component, inject, OnInit, OnDestroy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../../core/auth/auth.service';
import { ModeService } from '../../../core/services/mode.service';
import { User } from '../../../core/models/user.model';
import { Subscription } from 'rxjs';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
  roles?: ('owner' | 'admin' | 'employee')[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule
  ],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private modeService = inject(ModeService);
  private router = inject(Router);
  
  currentUser: User | null = null;
  isAdminMode = false;
  
  // 管理者モードのメニュー
  adminMenuItems: MenuItem[] = [
    { label: 'ダッシュボード', icon: 'dashboard', route: '/dashboard', roles: ['owner', 'admin'] },
    { label: '社員管理', icon: 'people', route: '/employees', roles: ['owner', 'admin'] },
    { label: '部署管理', icon: 'business', route: '/departments', roles: ['owner', 'admin'] },
    { label: '申請管理', icon: 'description', route: '/applications', roles: ['owner', 'admin'] },
    { label: '算定／月変計算', icon: 'assessment', route: '/standard-reward-calculations', roles: ['owner', 'admin'] },
    { label: '保険料計算', icon: 'calculate', route: '/calculations', roles: ['owner', 'admin'] },
    { label: '分析', icon: 'analytics', route: '/analytics', roles: ['owner', 'admin'] },
    { label: '外部連携', icon: 'import_export', route: '/external-integration', roles: ['owner', 'admin'] },
    { label: '設定', icon: 'settings', route: '/settings', roles: ['owner', 'admin'] }
  ];
  
  // 社員モードのメニュー
  employeeMenuItems: MenuItem[] = [
    { label: 'ダッシュボード', icon: 'dashboard', route: '/dashboard', roles: ['owner', 'admin', 'employee'] },
    { label: '自分の申請', icon: 'description', route: '/applications', roles: ['owner', 'admin', 'employee'] },
    { label: '自分の情報', icon: 'person', route: '/my-info', roles: ['owner', 'admin', 'employee'] }
  ];
  
  private subscriptions = new Subscription();

  ngOnInit(): void {
    // 現在のユーザー情報を取得
    this.currentUser = this.authService.getCurrentUser();
    
    // 社員アカウントの場合は強制的に社員モードに設定
    if (this.currentUser?.role === 'employee') {
      this.modeService.setAdminMode(false);
    }
    
    // ユーザー情報の変更を監視
    const userSub = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      // ユーザーが変更された場合も、社員アカウントの場合は強制的に社員モードに設定
      if (user?.role === 'employee') {
        this.modeService.setAdminMode(false);
      }
    });
    
    // モードの変更を監視
    const modeSub = this.modeService.isAdminMode$.subscribe(isAdminMode => {
      this.isAdminMode = isAdminMode;
    });
    
    this.subscriptions.add(userSub);
    this.subscriptions.add(modeSub);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  getMenuItems(): MenuItem[] {
    return this.isAdminMode ? this.adminMenuItems : this.employeeMenuItems;
  }

  canAccessMenuItem(item: MenuItem): boolean {
    if (!this.currentUser) {
      return false;
    }
    
    // ロールチェック
    if (item.roles && !item.roles.includes(this.currentUser.role)) {
      return false;
    }
    
    return true;
  }

  toggleAdminMode(): void {
    const currentMode = this.modeService.getIsAdminMode();
    this.modeService.setAdminMode(!currentMode);
  }
}

