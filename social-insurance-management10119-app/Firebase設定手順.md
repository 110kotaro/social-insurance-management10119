# Firebase設定手順

## 📋 目次
1. [Firebase Consoleで新規Webアプリを追加](#firebase-consoleで新規webアプリを追加)
2. [設定情報を取得してenvironment.tsに追加](#設定情報を取得してenvironmenttsに追加)
3. [動作確認](#動作確認)

---

## 🔥 Firebase Consoleで新規Webアプリを追加

### ステップ1: Firebase Consoleにアクセス
1. ブラウザで [Firebase Console](https://console.firebase.google.com/) にアクセス
2. Googleアカウントでログイン（既存のFirebaseプロジェクトにアクセスできるアカウント）

### ステップ2: プロジェクトを選択
1. プロジェクト一覧から **`kensyu10119`** を選択
   - プロジェクト一覧に表示されない場合は、検索ボックスで「kensyu10119」と検索
2. プロジェクトダッシュボードが表示されます

### ステップ3: プロジェクト設定を開く
1. 画面左上の **⚙️（歯車アイコン）** をクリック
   - プロジェクト名の横にある歯車アイコンです
2. ドロップダウンから **「プロジェクトの設定」** を選択
   - 英語版の場合は「Project settings」

### ステップ4: Webアプリを追加
1. 設定画面が開いたら、下にスクロールして **「マイアプリ」** セクションを確認
   - 英語版の場合は「Your apps」
2. **「</>（Webアプリを追加）」** アイコンをクリック
   - または、既存のアプリがある場合は **「アプリを追加」** ボタンをクリック
   - 英語版の場合は「Add app」>「Web」

### ステップ5: アプリ情報を入力
1. **アプリのニックネーム** を入力: `social-insurance-management-app`
   - この名前はFirebase Console内での識別用です（アプリの動作には影響しません）
2. **「このアプリのFirebase Hostingも設定します」** のチェックは **外す**（後で設定可能）
   - 英語版の場合は「Also set up Firebase Hosting for this app」のチェックを外す
3. **「アプリを登録」** ボタンをクリック
   - 英語版の場合は「Register app」

### ステップ6: 設定情報を確認
1. 設定コードが表示されます（以下のような形式）:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
     authDomain: "kensyu10119.firebaseapp.com",
     projectId: "kensyu10119",
     storageBucket: "kensyu10119.appspot.com",
     messagingSenderId: "123456789012",
     appId: "1:123456789012:web:abcdef1234567890",
     measurementId: "G-XXXXXXXXXX"  // オプション: Firebase Analytics用（表示される場合）
   };
   ```
2. **この画面は閉じないでください**（次のステップで使用します）
3. 必要に応じて、設定情報をコピーしておいてください

---

## ⚙️ 設定情報を取得してenvironment.tsに追加

### ステップ1: environment.tsファイルの確認

✅ **既に作成済みです！** `src/environments/environment.ts` と `src/environments/environment.prod.ts` が作成されています。

次に、Firebase Consoleから取得した設定情報をコピーして、これらのファイルに貼り付けます。

#### `src/environments/environment.ts` (開発環境用)
```typescript
export const environment = {
  production: false,
  firebase: {
    apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain: "kensyu10119.firebaseapp.com",
    projectId: "kensyu10119",
    storageBucket: "kensyu10119.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890",
    measurementId: "G-XXXXXXXXXX"  // オプション: Firebase Analytics用
  },
  // アプリ固有の設定
  appName: '社会保険管理システム',
  // Firestoreコレクション名のプレフィックス
  firestorePrefix: 'socialInsurance_',
  // Storageパスのプレフィックス
  storagePrefix: 'social-insurance/'
};
```

#### `src/environments/environment.prod.ts` (本番環境用)
```typescript
export const environment = {
  production: true,
  firebase: {
    apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain: "kensyu10119.firebaseapp.com",
    projectId: "kensyu10119",
    storageBucket: "kensyu10119.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890"
  },
  // アプリ固有の設定
  appName: '社会保険管理システム',
  // Firestoreコレクション名のプレフィックス
  firestorePrefix: 'socialInsurance_',
  // Storageパスのプレフィックス
  storagePrefix: 'social-insurance/'
};
```

**⚠️ 重要**: 
- Firebase Consoleから表示された設定情報の値を、`src/environments/environment.ts` と `src/environments/environment.prod.ts` の両方にコピー＆ペーストしてください
- **必須項目**: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId` の6つの値を正確にコピーしてください
- **オプション項目**: `measurementId` も表示されている場合はコピーしてください（Firebase Analytics用、必須ではありません）
- `YOUR_API_KEY_HERE` などのプレースホルダーを、実際の値に置き換えてください

**例**:
```typescript
// ❌ 間違い（プレースホルダーのまま）
apiKey: "YOUR_API_KEY_HERE",

// ✅ 正しい（実際の値）
apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
```

### ステップ2: tsconfig.jsonの設定確認

`tsconfig.json` に `environments` フォルダが含まれているか確認します。

```json
{
  "compilerOptions": {
    // ... 既存の設定
  },
  "files": [],
  "include": [
    "src/**/*"
  ]
}
```

`include` に `src/**/*` が含まれていればOKです。

### ステップ3: angular.jsonの設定確認

`angular.json` の `fileReplacements` セクションを確認します。

```json
{
  "projects": {
    "social-insurance-management10119-app": {
      "architect": {
        "build": {
          "configurations": {
            "production": {
              "fileReplacements": [
                {
                  "replace": "src/environments/environment.ts",
                  "with": "src/environments/environment.prod.ts"
                }
              ]
            }
          }
        }
      }
    }
  }
}
```

この設定により、本番ビルド時に自動的に `environment.prod.ts` が使用されます。

---

## ✅ 動作確認

### ステップ1: Firebase SDKのインストール

```bash
npm install @angular/fire firebase
```

### ステップ2: app.config.tsでFirebaseを初期化

`src/app/app.config.ts` に以下を追加します（後で実装時に詳細を説明します）:

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideStorage, getStorage } from '@angular/fire/storage';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => getFirestore()),
    provideAuth(() => getAuth()),
    provideStorage(() => getStorage()),
  ]
};
```

### ステップ3: 動作確認

```bash
npm start
```

エラーが表示されなければ設定完了です！

---

## 🔍 トラブルシューティング

### エラー: "Cannot find module '../environments/environment'"
- `src/environments/environment.ts` ファイルが存在するか確認
- ファイルパスが正しいか確認

### エラー: "Firebase: Error (auth/invalid-api-key)"
- Firebase Consoleから取得した設定情報が正しいか確認
- `environment.ts` の値が正確にコピーされているか確認

### 設定情報を再取得したい場合
1. Firebase Console > プロジェクト設定 > マイアプリ
2. 追加したWebアプリを選択
3. 設定情報が表示されます

---

## 📝 次のステップ

設定が完了したら、以下を実施してください：

1. ✅ Firebase設定完了
2. **フェーズ1.2: 認証基盤**の実装開始
3. **フェーズ1.3: ルーティング設定**の実装開始

