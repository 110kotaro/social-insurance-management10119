import { Injectable, inject } from '@angular/core';
import { Auth, User as FirebaseUser, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendEmailVerification, sendPasswordResetEmail, onAuthStateChanged, updateProfile } from '@angular/fire/auth';
import { Firestore, doc, setDoc, getDoc, collection, query, where, getDocs } from '@angular/fire/firestore';
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
        }
        // それ以外（新規作成されたユーザーなど）は無視
      } else {
        // ログアウトの場合（firebaseUserがnull）
        // 現在ログインしているユーザーがログアウトした場合のみ処理
        if (currentLoggedInUser) {
          this.currentUserSubject.next(null);
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

      // メール認証送信
      await sendEmailVerification(user);

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
      await sendPasswordResetEmail(this.auth, email);
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
      await sendPasswordResetEmail(this.auth, email);

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
        await sendPasswordResetEmail(this.auth, email);
        
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
      await sendEmailVerification(user);
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
        lastLoginAt: data['lastLoginAt']?.toDate()
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
    await this.createUserDocument(uid, userData);
  }

  /**
   * Firestoreにユーザードキュメントを作成
   */
  private async createUserDocument(uid: string, userData: Partial<User>): Promise<void> {
    const userDocRef = doc(this.firestore, `${environment.firestorePrefix}users`, uid);
    await setDoc(userDocRef, {
      ...userData,
      createdAt: new Date()
    }, { merge: true });
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
    }
    // 該当するユーザーが存在しない場合（まだパスワード設定が完了していない場合）は何もしない
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

