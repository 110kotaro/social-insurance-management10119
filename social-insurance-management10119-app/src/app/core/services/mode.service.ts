import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * モード管理サービス
 * 管理者モードと社員モードの切替を管理
 */
@Injectable({
  providedIn: 'root'
})
export class ModeService {
  private readonly STORAGE_KEY = 'adminMode';
  private readonly DEFAULT_MODE = true; // デフォルトは管理者モード

  private isAdminModeSubject = new BehaviorSubject<boolean>(this.DEFAULT_MODE);
  public isAdminMode$: Observable<boolean> = this.isAdminModeSubject.asObservable();

  constructor() {
    this.initMode();
  }

  /**
   * モードを初期化（localStorageから読み込み）
   */
  private initMode(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored !== null) {
        const isAdminMode = stored === 'true';
        this.isAdminModeSubject.next(isAdminMode);
      } else {
        // 初回はデフォルト値を設定
        this.setAdminMode(this.DEFAULT_MODE);
      }
    } catch (error) {
      console.error('モードの初期化に失敗しました:', error);
      // エラー時はデフォルト値を使用
      this.isAdminModeSubject.next(this.DEFAULT_MODE);
    }
  }

  /**
   * 現在のモードを取得（同期的）
   */
  getIsAdminMode(): boolean {
    return this.isAdminModeSubject.value;
  }

  /**
   * モードを設定
   * @param isAdminMode true: 管理者モード, false: 社員モード
   */
  setAdminMode(isAdminMode: boolean): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, String(isAdminMode));
      this.isAdminModeSubject.next(isAdminMode);
    } catch (error) {
      console.error('モードの設定に失敗しました:', error);
    }
  }
}

