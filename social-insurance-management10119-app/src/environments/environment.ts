// 開発環境用の設定
export const environment = {
  production: false,
  useEmulator: true,  // Firebase Emulatorを使用するかどうか
  firebase: {
    // ⚠️ 以下の値はFirebase Consoleから取得した設定情報に置き換えてください
    // Firebase Console > プロジェクト設定 > マイアプリ > Webアプリの設定コードからコピー
    apiKey: "AIzaSyBI5iwEIJQwg9JWQYIJYalp1wPtVh9_lAM",                    // 例: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    authDomain: "kensyu10119.firebaseapp.com",      // 通常は "プロジェクトID.firebaseapp.com"
    projectId: "kensyu10119",                        // プロジェクトID（変更不要）
    storageBucket: "kensyu10119.firebasestorage.app",       // Firebase Storage バケット名
    messagingSenderId: "1072279896525",  // 例: "123456789012"
    appId: "1:1072279896525:web:bb98d4b07e7af4c2848484",                       // 例: "1:123456789012:web:abcdef1234567890"
    measurementId: "G-VTCM8F69CM"        // オプション: Firebase Analytics用（G-XXXXXXXXXX形式）
  },
  // アプリ固有の設定
  appName: '社会保険管理システム',
  // Firestoreコレクション名のプレフィックス（既存アプリと分離するため）
  firestorePrefix: 'socialInsurance_',
  // Storageパスのプレフィックス（既存アプリと分離するため）
  storagePrefix: 'social-insurance/'
};

