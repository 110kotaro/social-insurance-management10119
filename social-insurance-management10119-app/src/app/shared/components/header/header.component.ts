import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../../core/auth/auth.service';
import { ModeService } from '../../../core/services/mode.service';
import { User } from '../../../core/models/user.model';
import { environment } from '../../../../environments/environment';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatBadgeModule,
    MatMenuModule,
    MatDividerModule
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private modeService = inject(ModeService);
  private router = inject(Router);
  
  currentUser: User | null = null;
  appName = environment.appName;
  unreadNotificationCount = 0; // TODO: 通知サービスから取得
  isAdminMode = false;
  
  private subscriptions = new Subscription();

  ngOnInit(): void {
    // 現在のユーザー情報を取得
    this.currentUser = this.authService.getCurrentUser();
    
    // ユーザー情報の変更を監視
    const userSub = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
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

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  navigateToMyInfo(): void {
    // TODO: 自分の情報画面への遷移
    console.log('自分の情報へ遷移');
  }

  navigateToAccountSettings(): void {
    // TODO: アカウント設定画面への遷移
    console.log('アカウント設定へ遷移');
  }

  toggleAdminMode(): void {
    const currentMode = this.modeService.getIsAdminMode();
    this.modeService.setAdminMode(!currentMode);
  }

  navigateToNotifications(): void {
    // TODO: 通知一覧画面への遷移
    console.log('通知一覧へ遷移');
  }
}

