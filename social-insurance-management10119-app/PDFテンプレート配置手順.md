# PDFテンプレート配置手順

## 1. テンプレートPDFファイルの配置

被保険者資格取得届のPDFテンプレートを以下の場所に配置してください：

```
src/assets/templates/pdf/insurance_acquisition_template.pdf
```

### 配置手順

1. 添付された「被保険者資格取得届.pdf」ファイルをコピー
2. プロジェクトの `src/assets/templates/pdf/` ディレクトリに配置
3. ファイル名を `insurance_acquisition_template.pdf` にリネーム

### ディレクトリ構造

```
src/
  assets/
    templates/
      pdf/
        insurance_acquisition_template.pdf  ← ここに配置
```

## 2. フォームフィールド名の確認（オプション）

PDFテンプレートのフォームフィールド名が分からない場合、以下の方法で確認できます：

### 方法1: ブラウザの開発者ツールを使用

1. アプリケーションを起動
2. ブラウザの開発者ツール（F12）を開く
3. コンソールで以下を実行：

```javascript
// PDF生成サービスを注入してフォームフィールド一覧を取得
// （実装が必要な場合は、application-create.component.tsに一時的に追加）
```

### 方法2: pdf-libを使用してフィールド名を取得

`src/app/core/services/pdf-generation.service.ts` の `getFormFields()` メソッドを使用：

```typescript
const pdfService = inject(PdfGenerationService);
const fields = await pdfService.getFormFields();
console.log(fields); // フォームフィールド一覧が表示される
```

## 3. フォームフィールド名のマッピング調整

現在の実装では、フォームフィールド名を動的に検索するロジックを使用していますが、実際のPDFテンプレートのフィールド名に合わせて調整が必要な場合があります。

### 調整が必要な箇所

- `src/app/core/services/pdf-generation.service.ts`
  - `fillSubmitterInfo()` メソッド: 提出者情報のフィールドマッピング
  - `fillInsuredPersons()` メソッド: 被保険者情報のフィールドマッピング

### フィールド名のマッピング例

実際のPDFテンプレートのフィールド名が分かったら、以下のようにマッピングを調整してください：

```typescript
// 例: 提出日のフィールド名が "submission_date" の場合
if (fieldName === 'submission_date' || fieldName.includes('提出日')) {
  field.setText(`${era}${eraYear}年${month}月${day}日`);
}
```

## 4. 動作確認

1. 申請作成画面で「被保険者資格取得届」を選択
2. 必要事項を入力
3. 内容確認画面で「申請を作成」ボタンをクリック
4. PDFが生成され、Cloud Storageに保存されることを確認
5. 申請詳細画面で生成されたPDFが添付されていることを確認

## 5. エラーが発生した場合

PDF生成に失敗した場合、以下のエラーが内容確認画面に表示されます：

- **エラー表示**: 赤いカードでエラー内容が表示されます
- **エラー内容**: フィールド名とエラーメッセージが表示されます
- **対処方法**: エラー内容を確認し、該当するフィールドの入力値を修正してください

## 6. 注意事項

- PDFテンプレートはフォームフィールド（入力可能なフィールド）を持つPDFである必要があります
- フォームフィールド名は、実際のPDFテンプレートのフィールド名に合わせて調整が必要な場合があります
- 4人を超える被保険者がいる場合、4人ごとにPDFが生成されます（例: 5人の場合、2枚のPDFが生成されます）

