import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { AuthService } from '../../../core/auth/auth.service';
import { User } from '../../../core/models/user.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    HeaderComponent,
    SidebarComponent
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  
  currentUser: User | null = null;
  
  private subscriptions = new Subscription();

  ngOnInit(): void {
    // 現在のユーザー情報を取得
    this.currentUser = this.authService.getCurrentUser();
    
    // ユーザー情報の変更を監視
    const userSub = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });
    
    this.subscriptions.add(userSub);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}

