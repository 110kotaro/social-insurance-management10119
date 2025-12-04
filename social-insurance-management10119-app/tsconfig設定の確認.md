# tsconfig.json と environments フォルダの設定

## 📋 確認事項

### 現在の設定状況

✅ **`tsconfig.app.json`を更新しました！**

`tsconfig.app.json`の`include`に`src/**/*.ts`を追加したので、`environments`フォルダは自動的に含まれます。

### 設定内容

#### `tsconfig.app.json`（更新済み）
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/app",
    "types": []
  },
  "files": [
    "src/main.ts"
  ],
  "include": [
    "src/**/*.ts",      // ✅ 追加: すべてのTypeScriptファイルを含む
    "src/**/*.d.ts"     // 型定義ファイル
  ]
}
```

#### `tsconfig.json`（変更不要）
```json
{
  "compilerOptions": {
    // ... コンパイラオプション
  },
  "angularCompilerOptions": {
    // ... Angular固有のオプション
  }
}
```

## ✅ 動作確認

### 1. ファイルが正しく認識されているか確認

`src/environments/environment.ts`をインポートできるか確認：

```typescript
// 例: src/app/app.config.ts
import { environment } from '../environments/environment';
```

### 2. エラーが出る場合の対処法

#### エラー: "Cannot find module '../environments/environment'"

**原因**: TypeScriptが`environments`フォルダを認識していない

**解決方法**:
1. `tsconfig.app.json`の`include`に`src/**/*.ts`が含まれているか確認
2. IDEを再起動（VS Codeの場合は `Ctrl+Shift+P` → "Reload Window"）
3. `npm start`でビルドエラーが出ないか確認

#### エラー: "File is not under 'rootDir'"

**原因**: `rootDir`の設定が原因

**解決方法**: `tsconfig.app.json`に以下を追加（通常は不要）：
```json
{
  "compilerOptions": {
    "rootDir": "./src"
  }
}
```

## 🔍 補足説明

### Angular CLIの動作

Angular CLIでは、`tsconfig.app.json`の`files`に`src/main.ts`を指定しているため、そこからインポートされるファイルは自動的に含まれます。

しかし、明示的に`include`に`src/**/*.ts`を追加することで：
- ✅ `environments`フォルダが確実に認識される
- ✅ IDEの補完が正しく動作する
- ✅ 型チェックが正しく行われる

### ファイル構造

```
src/
├── environments/          ✅ これが含まれる
│   ├── environment.ts
│   └── environment.prod.ts
├── app/
│   └── ...
└── main.ts
```

## 📝 次のステップ

設定が完了したら：

1. ✅ `tsconfig.app.json`の確認（完了）
2. **Firebase SDKのインストール**
   ```bash
   npm install @angular/fire firebase
   ```
3. **`app.config.ts`でFirebaseを初期化**（次のフェーズで実装）

---

## ❓ よくある質問

### Q: `tsconfig.json`にも`include`を追加する必要はありますか？

**A**: いいえ、必要ありません。
- `tsconfig.json`は基本設定
- `tsconfig.app.json`がアプリケーション用の設定で、`tsconfig.json`を継承している
- `tsconfig.app.json`の`include`で十分です

### Q: `environments`フォルダが認識されない場合は？

**A**: 以下を確認してください：
1. `src/environments/environment.ts`ファイルが存在するか
2. `tsconfig.app.json`の`include`に`src/**/*.ts`が含まれているか
3. IDEを再起動
4. `npm start`でビルドエラーを確認

