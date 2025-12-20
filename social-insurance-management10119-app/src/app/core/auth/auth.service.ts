import { Injectable, inject } from '@angular/core';
import { Auth, User as FirebaseUser, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged, updateProfile, ActionCodeSettings } from '@angular/fire/auth';
import { Firestore, doc, setDoc, getDoc, collection, query, where, getDocs, onSnapshot, Unsubscribe, updateDoc } from '@angular/fire/firestore';
import { Observable, BehaviorSubject, from, of } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { User, UserProfile } from '../models/user.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private userDocumentUnsubscribe: Unsubscribe | null = null;

  constructor() {
    // 認証状態の監視
    onAuthStateChanged(this.auth, async (firebaseUser) => {
      // 現在ログインしているユーザーかどうかを確認
      // （新規アカウント作成時など、他のユーザーの状態変更は無視）
      const currentLoggedInUser = this.currentUserSubject.value;
      
      if (firebaseUser) {
        // 現在ログインしているユーザーの場合のみ処理を続行
        if (currentLoggedInUser && currentLoggedInUser.uid === firebaseUser.uid) {
          // Firestoreで新アプリのユーザーかどうか確認
          const user = await this.getUserProfile(firebaseUser.uid);
          
          // 新アプリのユーザーでない場合、または無効化されている場合
          if (!user || !user.isActive) {
            // ログアウトしてnullを設定
            await signOut(this.auth);
            this.currentUserSubject.next(null);
            // 監視を解除
            this.unwatchUserDocument();
            return;
          }

          // メール認証状態が変更された場合、Firestoreも更新
          if (firebaseUser.emailVerified !== user.emailVerified) {
            await this.updateEmailVerificationStatus(firebaseUser.uid, firebaseUser.emailVerified);
            // ユーザープロフィールを再取得
            const updatedUser = await this.getUserProfile(firebaseUser.uid);
            this.currentUserSubject.next(updatedUser);
          } else {
            this.currentUserSubject.next(user);
          }
          
          // 監視を開始（既にログインしている場合でも、Firestoreの変更を検知できるようにする）
          this.logToStorage('onAuthStateChanged - watchUserDocument を呼び出します', { uid: firebaseUser.uid });
          console.log('[AuthService] watchUserDocument を呼び出します。', { uid: firebaseUser.uid });
          this.watchUserDocument(firebaseUser.uid);
        } else if (!currentLoggedInUser) {
          // 初回ログイン時またはcurrentUserSubjectがnullの場合
          // Firestoreでユーザー情報を取得して設定
          const user = await this.getUserProfile(firebaseUser.uid);
          if (user && user.isActive) {
            // メール認証状態をFirebase Authenticationの状態と同期
            if (firebaseUser.emailVerified !== user.emailVerified) {
              await this.updateEmailVerificationStatus(firebaseUser.uid, firebaseUser.emailVerified);
              const updatedUser = await this.getUserProfile(firebaseUser.uid);
              this.currentUserSubject.next(updatedUser);
            } else {
            this.currentUserSubject.next(user);
            }
            
            // 現在ログインしているユーザーのドキュメントを監視
            this.logToStorage('onAuthStateChanged - watchUserDocument を呼び出します（初回ログイン）', { uid: firebaseUser.uid });
            console.log('[AuthService] watchUserDocument を呼び出します（初回ログイン）。', { uid: firebaseUser.uid });
            this.watchUserDocument(firebaseUser.uid);
          }
        }
        // それ以外（新規作成されたユーザーなど）は無視
      } else {
        // ログアウトの場合（firebaseUserがnull）
        // 現在ログインしているユーザーがログアウトした場合のみ処理
        if (currentLoggedInUser) {
          this.currentUserSubject.next(null);
          // 監視を解除
          this.unwatchUserDocument();
        }
      }
    });
  }

  /**
   * メール/パスワードで新規登録（初回アカウント用）
   */
  async register(email: string, password: string, displayName: string): Promise<void> {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;

      // プロフィール更新
      await updateProfile(user, { displayName });

      // メール認証送信（認証後にアプリにリダイレクト）
      const actionCodeSettings: ActionCodeSettings = {
        url: `${window.location.origin}/email-verification`,
        handleCodeInApp: false
      };
      await sendEmailVerification(user, actionCodeSettings);

      // Firestoreにユーザー情報を保存（初回登録時はrole: 'owner'）
      await this.createUserDocument(user.uid, {
        email,
        displayName,
        role: 'owner',
        emailVerified: false,
        isActive: true,
        createdAt: new Date()
      });

    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * メール/パスワードでログイン
   */
  async login(email: string, password: string): Promise<void> {
    try {
      // 1. Firebase Authenticationで認証
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;

      // 2. Firestoreで新アプリのユーザーかどうか確認
      const userDocRef = doc(this.firestore, `${environment.firestorePrefix}users`, user.uid);
      const userDoc = await getDoc(userDocRef);

      // 3. 新アプリのユーザーでない場合（既存アプリのユーザー）、ログアウトしてエラー
      if (!userDoc.exists()) {
        await signOut(this.auth);
        throw new Error('このアカウントは登録されていません。新規登録を行うか、管理者に問い合わせてください。');
      }

      const userData = userDoc.data();

      // 4. アカウントが無効化されている場合
      if (userData['isActive'] === false) {
        await signOut(this.auth);
        throw new Error('このアカウントは無効化されています');
      }

      // 5. 認証成功 → 最終ログイン時刻を更新
      await this.updateLastLogin(user.uid);

      // 6. ユーザープロフィールを取得して更新
      const userProfile = await this.getUserProfile(user.uid);
      this.currentUserSubject.next(userProfile);

    } catch (error: any) {
      // Firebase Authenticationのエラーはそのまま投げる
      if (error.code && error.code.startsWith('auth/')) {
        throw this.handleAuthError(error);
      }
      // その他のエラー（Firestoreチェックのエラーなど）
      throw error;
    }
  }

  /**
   * ログアウト
   */
  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      this.currentUserSubject.next(null);
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * パスワードリセットメール送信
   */
  async sendPasswordReset(email: string): Promise<void> {
    try {
      const actionCodeSettings: ActionCodeSettings = {
        url: `${window.location.origin}/login`,
        handleCodeInApp: false
      };
      await sendPasswordResetEmail(this.auth, email, actionCodeSettings);
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * 社員を招待（アカウント作成 + パスワード設定リンク送信）
   */
  async inviteEmployee(email: string, employeeId: string, organizationId: string, displayName?: string): Promise<string> {
    // アカウント作成前に現在のユーザーIDを保存
    const currentLoggedInUserId = this.currentUserSubject.value?.uid;
    
    try {
      // 一時パスワードを生成（32文字のランダムな英数字記号）
      const temporaryPassword = this.generateTemporaryPassword();

      // Firebase Authenticationでアカウントを作成
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, temporaryPassword);
      const user = userCredential.user;

      // プロフィール更新（displayNameがあれば設定）
      if (displayName) {
        await updateProfile(user, { displayName });
      }

      // パスワードリセットメールを送信（これが招待メールの役割）
      const actionCodeSettings: ActionCodeSettings = {
        url: `${window.location.origin}/password-setup`,
        handleCodeInApp: false
      };
      await sendPasswordResetEmail(this.auth, email, actionCodeSettings);

      // アカウント作成後、現在のユーザーを再設定（onAuthStateChangedの誤動作を防ぐ）
      if (currentLoggedInUserId) {
        const currentUser = await this.getUserProfile(currentLoggedInUserId);
        if (currentUser) {
          this.currentUserSubject.next(currentUser);
        }
      }

      return user.uid;
    } catch (error: any) {
      // 既にアカウントが存在する場合、パスワードリセットメールのみ送信
      if (error.code === 'auth/email-already-in-use') {
        // 既存のユーザーにパスワードリセットメールを送信
        const actionCodeSettings: ActionCodeSettings = {
          url: `${window.location.origin}/password-setup`,
          handleCodeInApp: false
        };
        await sendPasswordResetEmail(this.auth, email, actionCodeSettings);
        
        // Firestoreのユーザー情報を更新（存在する場合のみ）
        const userQuery = query(
          collection(this.firestore, `${environment.firestorePrefix}users`),
          where('email', '==', email)
        );
        const querySnapshot = await getDocs(userQuery);
        
        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          await setDoc(userDoc.ref, {
            employeeId,
            organizationId,
            isActive: true
          }, { merge: true });
          // 既存のユーザーUIDを返す（成功として扱う）
          return userDoc.id;
        }
        
        // usersコレクションにデータが存在しない場合でも、成功として扱う
        // （パスワード設定完了時にusersコレクションにデータを作成する）
        // Firebase AuthenticationのUIDを取得する必要があるが、emailから直接取得できないため、
        // 一時的に空文字列を返す（実際のUIDはパスワード設定完了時に取得可能）
        return '';
      }
      
      throw this.handleAuthError(error);
    }
  }

  /**
   * 一時パスワードを生成（32文字のランダムな英数字記号）
   */
  private generateTemporaryPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 32; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * メール認証再送信
   */
  async resendEmailVerification(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('ユーザーがログインしていません');
    }
    try {
      // メール認証再送信（認証後にアプリにリダイレクト）
      const actionCodeSettings: ActionCodeSettings = {
        url: `${window.location.origin}/email-verification`,
        handleCodeInApp: false
      };
      await sendEmailVerification(user, actionCodeSettings);
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * 現在のユーザーを取得
   */
  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Firebase Authenticationの現在のユーザーを再読み込みして最新状態を取得
   * メール認証画面でのみ使用（社員メール送信時のサイドバー問題を防ぐため、条件付きでcurrentUserSubjectを更新）
   */
  async reloadCurrentUser(): Promise<FirebaseUser | null> {
    console.log('[AuthService] reloadCurrentUser() 開始');
    let firebaseUser = this.auth.currentUser;
    console.log('[AuthService] 初期 firebaseUser:', firebaseUser ? {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      emailVerified: firebaseUser.emailVerified
    } : null);
    
    // firebaseUserがnullの場合、onAuthStateChangedが発火するまで待つ（最大5秒）
    if (!firebaseUser) {
      console.log('[AuthService] firebaseUser が null のため、onAuthStateChanged を待機します');
      try {
        firebaseUser = await new Promise<FirebaseUser | null>((resolve, reject) => {
          let unsubscribe: (() => void) | null = null;
          const timeout = setTimeout(() => {
            if (unsubscribe) {
              unsubscribe();
            }
            console.log('[AuthService] onAuthStateChanged の待機がタイムアウトしました');
            resolve(null);
          }, 5000);
          
          unsubscribe = onAuthStateChanged(this.auth, (user) => {
            console.log('[AuthService] onAuthStateChanged が発火しました:', user ? {
              uid: user.uid,
              email: user.email,
              emailVerified: user.emailVerified
            } : null);
            clearTimeout(timeout);
            if (unsubscribe) {
              unsubscribe();
            }
            resolve(user);
          });
        });
        
        console.log('[AuthService] onAuthStateChanged 待機後の firebaseUser:', firebaseUser ? {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          emailVerified: firebaseUser.emailVerified
        } : null);
      } catch (error) {
        console.error('[AuthService] onAuthStateChanged 待機中にエラー:', error);
        return null;
      }
    }
    
    if (firebaseUser) {
      // ユーザー情報を再読み込み（メール認証状態などを最新化）
      console.log('[AuthService] firebaseUser.reload() を呼び出し');
      await firebaseUser.reload();
      console.log('[AuthService] firebaseUser.reload() 完了, emailVerified:', firebaseUser.emailVerified);
      
      // 現在ログインしているユーザーの場合のみ、currentUserSubjectを更新
      // （社員メール送信時のサイドバー問題を防ぐため）
      const currentLoggedInUser = this.currentUserSubject.value;
      console.log('[AuthService] currentLoggedInUser:', currentLoggedInUser ? {
        uid: currentLoggedInUser.uid,
        email: currentLoggedInUser.email,
        emailVerified: currentLoggedInUser.emailVerified
      } : null);
      
      // currentLoggedInUserがnullの場合でも、firebaseUserが存在する場合は処理を続行
      // （メール認証リンクをクリックした直後など、currentUserSubjectがまだ更新されていない場合）
      if (!currentLoggedInUser || currentLoggedInUser.uid === firebaseUser.uid) {
        console.log('[AuthService] 条件一致 - currentUserSubjectを更新');
        // Firestoreで新アプリのユーザーかどうか確認
        const user = await this.getUserProfile(firebaseUser.uid);
        console.log('[AuthService] getUserProfile() 結果:', user ? {
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          isActive: user.isActive
        } : null);
        
        if (user && user.isActive) {
          // メール認証状態が変更された場合、Firestoreも更新
          if (firebaseUser.emailVerified !== user.emailVerified) {
            console.log('[AuthService] メール認証状態が変更されました:', {
              firebaseEmailVerified: firebaseUser.emailVerified,
              userEmailVerified: user.emailVerified
            });
            await this.updateEmailVerificationStatus(firebaseUser.uid, firebaseUser.emailVerified);
            // ユーザープロフィールを再取得
            const updatedUser = await this.getUserProfile(firebaseUser.uid);
            console.log('[AuthService] 更新後のユーザー:', updatedUser ? {
              uid: updatedUser.uid,
              email: updatedUser.email,
              emailVerified: updatedUser.emailVerified
            } : null);
            this.currentUserSubject.next(updatedUser);
            console.log('[AuthService] currentUserSubject を更新しました');
          } else {
            console.log('[AuthService] メール認証状態は変更されていません');
            // メール認証状態が変更されていない場合でも、最新の状態を反映
            this.currentUserSubject.next(user);
            console.log('[AuthService] currentUserSubject を更新しました（状態変更なし）');
          }
        } else {
          console.log('[AuthService] ユーザーが存在しないか、無効化されています');
        }
      } else {
        console.log('[AuthService] 条件不一致 - currentUserSubjectを更新しません');
      }
      
      return firebaseUser;
    }
    console.log('[AuthService] firebaseUser が null のため、null を返します');
    return null;
  }

  /**
   * 認証済みかどうか
   */
  isAuthenticated(): boolean {
    return this.auth.currentUser !== null;
  }

  /**
   * メール認証済みかどうか
   */
  isEmailVerified(): boolean {
    return this.auth.currentUser?.emailVerified ?? false;
  }

  /**
   * Firestoreからユーザープロフィールを取得
   */
  private async getUserProfile(uid: string): Promise<User | null> {
    try {
      const userDocRef = doc(this.firestore, `${environment.firestorePrefix}users`, uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        return null;
      }

      const data = userDoc.data();
      return {
        uid,
        email: data['email'],
        displayName: data['displayName'],
        emailVerified: data['emailVerified'] ?? false,
        role: data['role'],
        organizationId: data['organizationId'],
        employeeId: data['employeeId'],
        isActive: data['isActive'] ?? true,
        createdAt: data['createdAt']?.toDate() ?? new Date(),
        lastLoginAt: data['lastLoginAt']?.toDate(),
        emailNotificationEnabled: data['emailNotificationEnabled'],
        inAppNotificationEnabled: data['inAppNotificationEnabled']
      } as User;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  /**
   * Firestoreにユーザードキュメントを作成（パブリックメソッド）
   */
  async createUserDocumentForEmployee(uid: string, userData: Partial<User>): Promise<void> {
    console.log('[AuthService] createUserDocumentForEmployee開始:', { uid, userData });
    try {
      await this.createUserDocument(uid, userData);
      console.log('[AuthService] createUserDocumentForEmployee成功');
      
      // 書き込み後、実際にデータが作成されたか確認
      const userDocRef = doc(this.firestore, `${environment.firestorePrefix}users`, uid);
      const verifyDoc = await getDoc(userDocRef);
      console.log('[AuthService] createUserDocumentForEmployee確認:', { exists: verifyDoc.exists(), data: verifyDoc.exists() ? verifyDoc.data() : null });
    } catch (error: any) {
      console.error('[AuthService] createUserDocumentForEmployee失敗:', error);
      throw error;
    }
  }

  /**
   * Firestoreにユーザードキュメントを作成
   */
  private async createUserDocument(uid: string, userData: Partial<User>): Promise<void> {
    console.log('[AuthService] createUserDocument開始:', { uid, userData });
    const userDocRef = doc(this.firestore, `${environment.firestorePrefix}users`, uid);
    const dataToWrite = {
      ...userData,
      createdAt: new Date()
    };
    console.log('[AuthService] createUserDocument書き込みデータ:', dataToWrite);
    try {
      await setDoc(userDocRef, dataToWrite, { merge: true });
      console.log('[AuthService] createUserDocument書き込み成功');
    } catch (error: any) {
      console.error('[AuthService] createUserDocument書き込み失敗:', error);
      throw error;
    }
  }

  /**
   * 最終ログイン時刻を更新
   */
  private async updateLastLogin(uid: string): Promise<void> {
    const userDocRef = doc(this.firestore, `${environment.firestorePrefix}users`, uid);
    await setDoc(userDocRef, {
      lastLoginAt: new Date()
    }, { merge: true });
  }

  /**
   * メール認証状態を更新
   */
  private async updateEmailVerificationStatus(uid: string, emailVerified: boolean): Promise<void> {
    const userDocRef = doc(this.firestore, `${environment.firestorePrefix}users`, uid);
    await setDoc(userDocRef, {
      emailVerified: emailVerified
    }, { merge: true });
  }

  /**
   * ユーザーのorganizationIdを更新
   */
  async updateUserOrganizationId(uid: string, organizationId: string): Promise<void> {
    const userDocRef = doc(this.firestore, `${environment.firestorePrefix}users`, uid);
    await setDoc(userDocRef, {
      organizationId: organizationId
    }, { merge: true });
    
    // 既存のユーザー情報を取得して更新（getUserProfileを呼ばずに、タイミング問題を回避）
    const currentUser = this.currentUserSubject.value;
    if (currentUser) {
      // 既存のユーザー情報にorganizationIdを追加
      this.currentUserSubject.next({
        ...currentUser,
        organizationId: organizationId
      });
    } else {
      // currentUserがnullの場合はgetUserProfileを呼び出す
      const user = await this.getUserProfile(uid);
      if (user) {
        this.currentUserSubject.next(user);
      }
    }
  }

  /**
   * 社員の権限を更新（employeesコレクションとusersコレクションの両方を更新）
   */
  /**
   * ユーザー設定を更新
   */
  async updateUserSettings(uid: string, settings: { emailNotificationEnabled?: boolean; inAppNotificationEnabled?: boolean }): Promise<void> {
    try {
      const userDocRef = doc(this.firestore, `${environment.firestorePrefix}users`, uid);
      await updateDoc(userDocRef, {
        emailNotificationEnabled: settings.emailNotificationEnabled,
        inAppNotificationEnabled: settings.inAppNotificationEnabled
      });
    } catch (error) {
      console.error('ユーザー設定の更新に失敗しました:', error);
      throw error;
    }
  }

  async updateUserRole(employeeId: string, role: 'admin' | 'employee'): Promise<void> {
    // usersコレクションから該当するemployeeIdを持つユーザーを検索
    const usersRef = collection(this.firestore, `${environment.firestorePrefix}users`);
    const q = query(usersRef, where('employeeId', '==', employeeId));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      // 該当するユーザーが存在する場合、roleを更新
      const batch = querySnapshot.docs.map(docSnapshot => {
        const userDocRef = doc(this.firestore, `${environment.firestorePrefix}users`, docSnapshot.id);
        return setDoc(userDocRef, { role }, { merge: true });
      });
      await Promise.all(batch);

      // 現在ログインしているユーザーの権限が変更された場合は、currentUserSubjectを更新
      const currentUser = this.currentUserSubject.value;
      console.log('[AuthService] updateUserRole - currentUser:', currentUser ? {
        uid: currentUser.uid,
        employeeId: currentUser.employeeId,
        role: currentUser.role
      } : null, 'employeeId:', employeeId);
      
      if (currentUser && currentUser.employeeId === employeeId) {
        console.log('[AuthService] 権限変更を検出。currentUserSubjectを更新します。', {
          currentUserUid: currentUser.uid,
          employeeId: employeeId,
          newRole: role
        });
        
        // ユーザープロフィールを再取得して更新
        const updatedUser = await this.getUserProfile(currentUser.uid);
        if (updatedUser) {
          console.log('[AuthService] ユーザープロフィールを取得しました。', {
            uid: updatedUser.uid,
            role: updatedUser.role,
            isActive: updatedUser.isActive,
            organizationId: updatedUser.organizationId
          });
          this.currentUserSubject.next(updatedUser);
          console.log('[AuthService] currentUserSubjectを更新しました。');
        } else {
          console.error('[AuthService] ユーザープロフィールの取得に失敗しました。', {
            uid: currentUser.uid
          });
        }
      } else {
        console.log('[AuthService] 現在ログインしているユーザーの権限変更ではありません。', {
          currentUserEmployeeId: currentUser?.employeeId,
          targetEmployeeId: employeeId
        });
      }
    }
    // 該当するユーザーが存在しない場合（まだパスワード設定が完了していない場合）は何もしない
  }

  /**
   * 現在ログインしているユーザーのFirestoreドキュメントを監視
   */
  private watchUserDocument(uid: string): void {
    this.logToStorage('watchUserDocument 開始', { uid });
    console.log('[AuthService] watchUserDocument 開始', { uid });
    
    // 既存の監視を解除
    this.unwatchUserDocument();
    
    const userDocRef = doc(this.firestore, `${environment.firestorePrefix}users`, uid);
    
    // ドキュメントの変更を監視
    this.userDocumentUnsubscribe = onSnapshot(userDocRef, async (snapshot) => {
      this.logToStorage('onSnapshot 発火', { uid, exists: snapshot.exists() });
      console.log('[AuthService] onSnapshot 発火', { uid, exists: snapshot.exists() });
      
      const currentUser = this.currentUserSubject.value;
      
      // 現在ログインしているユーザーの場合のみ処理
      if (currentUser && currentUser.uid === uid) {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const updatedUser = {
            uid,
            email: data['email'],
            displayName: data['displayName'],
            emailVerified: data['emailVerified'] ?? false,
            role: data['role'],
            organizationId: data['organizationId'],
            employeeId: data['employeeId'],
            isActive: data['isActive'] ?? true,
            createdAt: data['createdAt']?.toDate() ?? new Date(),
            lastLoginAt: data['lastLoginAt']?.toDate()
          } as User;
          
          // 常にログを出力（権限変更の検出のため）
          this.logToStorage('onSnapshot - role比較', {
            currentUserRole: currentUser.role,
            updatedUserRole: updatedUser.role,
            roleChanged: currentUser.role !== updatedUser.role,
            uid: uid
          });
          console.log('[AuthService] onSnapshot - role比較', {
            currentUserRole: currentUser.role,
            updatedUserRole: updatedUser.role,
            roleChanged: currentUser.role !== updatedUser.role
          });
          
          // 権限が変更された場合のみログを出力
          if (currentUser.role !== updatedUser.role) {
            this.logToStorage('権限変更を検出（Firestore監視）', {
              oldRole: currentUser.role,
              newRole: updatedUser.role,
              uid: uid
            });
            console.log('[AuthService] 権限変更を検出（Firestore監視）:', {
              oldRole: currentUser.role,
              newRole: updatedUser.role,
              uid: uid
            });
          }
          
          this.logToStorage('currentUserSubject を更新', {
            uid: updatedUser.uid,
            role: updatedUser.role,
            organizationId: updatedUser.organizationId
          });
          this.currentUserSubject.next(updatedUser);
        }
      } else {
        this.logToStorage('onSnapshot - 条件不一致', { 
          currentUserUid: currentUser?.uid, 
          targetUid: uid 
        });
        console.log('[AuthService] onSnapshot - 条件不一致', { 
          currentUserUid: currentUser?.uid, 
          targetUid: uid 
        });
      }
    }, (error) => {
      this.logToStorage('Firestore監視エラー', { error: error.message });
      console.error('[AuthService] Firestore監視エラー:', error);
    });
  }

  /**
   * ユーザードキュメントの監視を解除
   */
  private unwatchUserDocument(): void {
    if (this.userDocumentUnsubscribe) {
      this.logToStorage('unwatchUserDocument - 監視を解除', null);
      console.log('[AuthService] unwatchUserDocument - 監視を解除');
      this.userDocumentUnsubscribe();
      this.userDocumentUnsubscribe = null;
    }
  }

  /**
   * localStorageにログを保存するヘルパー関数
   */
  private logToStorage(message: string, data: any): void {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        message,
        data: data !== null ? JSON.stringify(data) : null
      };
      
      // 既存のログを取得
      const existingLogs = localStorage.getItem('authServiceLogs');
      const logs = existingLogs ? JSON.parse(existingLogs) : [];
      
      // 新しいログを追加（最大100件まで保持）
      logs.push(logEntry);
      if (logs.length > 100) {
        logs.shift(); // 古いログを削除
      }
      
      // localStorageに保存
      localStorage.setItem('authServiceLogs', JSON.stringify(logs));
    } catch (error) {
      console.error('[AuthService] ログの保存に失敗しました:', error);
    }
  }

  /**
   * 認証エラーのハンドリング
   */
  private handleAuthError(error: any): Error {
    let message = '認証に失敗しました';
    
    switch (error.code) {
      case 'auth/email-already-in-use':
        message = 'このメールアドレスは既に使用されています';
        break;
      case 'auth/invalid-email':
        message = 'メールアドレスの形式が正しくありません';
        break;
      case 'auth/operation-not-allowed':
        message = 'この操作は許可されていません';
        break;
      case 'auth/weak-password':
        message = 'パスワードが弱すぎます（6文字以上）';
        break;
      case 'auth/user-disabled':
        message = 'このアカウントは無効化されています';
        break;
      case 'auth/user-not-found':
        message = 'ユーザーが見つかりません';
        break;
      case 'auth/wrong-password':
        message = 'パスワードが正しくありません';
        break;
      case 'auth/invalid-credential':
        message = 'メールアドレスまたはパスワードが正しくありません';
        break;
      case 'auth/too-many-requests':
        message = 'リクエストが多すぎます。しばらくしてから再試行してください';
        break;
      default:
        message = error.message || '認証に失敗しました';
    }
    
    return new Error(message);
  }
}

