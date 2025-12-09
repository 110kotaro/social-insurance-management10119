/**
 * 申請種別ごとの説明PDFファイル一覧
 * フォルダ構造: assets/templates/{申請種別フォルダ名}/{ファイル名}
 */
export const EXPLANATION_PDFS: Record<string, string[]> = {
  // 被保険者資格取得届
  'INSURANCE_ACQUISITION': ['被保険者資格取得届説明資料.pdf','被保険者資格取得届記入例.pdf'],
  
  // 被保険者資格喪失届
  'INSURANCE_LOSS': ['被保険者資格喪失届説明資料.pdf','被保険者資格喪失届記入例.pdf'],
  
  // 被扶養者（異動）届（外部申請）
  'DEPENDENT_CHANGE_EXTERNAL': ['被扶養者（異動）届説明資料.pdf','被扶養者（異動）届（該当）記入例.pdf','被扶養者（異動）届（非該当）記入例.pdf','被扶養者（異動）届（変更）記入例.pdf'],
  
  // 被扶養者（異動）届（内部申請）
  'DEPENDENT_CHANGE': ['被扶養者（異動）届説明資料.pdf','被扶養者（異動）届（該当）記入例.pdf','被扶養者（異動）届（非該当）記入例.pdf','被扶養者（異動）届（変更）記入例.pdf'],
  
  // 被保険者住所変更届（外部申請）
  'ADDRESS_CHANGE_EXTERNAL': ['被保険者住所変更届説明資料.pdf','被保険者住所変更届記入例.pdf'],
  
  // 住所変更届（内部申請）
  'ADDRESS_CHANGE': ['被保険者住所変更届説明資料.pdf','被保険者住所変更届記入例.pdf'],
  
  // 被保険者氏名変更（訂正）届（外部申請）
  'NAME_CHANGE_EXTERNAL': ['被保険者氏名変更（訂正）届説明資料.pdf','被保険者氏名変更（訂正）届記入例.pdf'],
  
  // 氏名変更届（内部申請）
  'NAME_CHANGE': ['被保険者氏名変更届説明資料.pdf','被保険者氏名変更届記入例.pdf'],
  
  // 被保険者報酬月額算定基礎届
  'REWARD_BASE': ['算定基礎届の記入・提出ガイドブック.pdf','被保険者報酬月額算定基礎届説明資料.pdf','被保険者報酬月額算定基礎届記入例.pdf'],
  
  // 被保険者報酬月額変更届
  'REWARD_CHANGE': ['被保険者報酬月額変更届説明資料.pdf','被保険者報酬月額変更届記入例.pdf'],
  
  // 被保険者賞与支払届
  'BONUS_PAYMENT': ['賞与支払関係の説明資料.pdf','被保険者賞与支払届記入例.pdf']
};

/**
 * 申請種別コードからフォルダ名を取得
 */
export function getApplicationTypeFolderName(code: string): string {
  const folderNames: Record<string, string> = {
    'INSURANCE_ACQUISITION': '被保険者資格取得届',
    'INSURANCE_LOSS': '被保険者資格喪失届',
    'DEPENDENT_CHANGE_EXTERNAL': '被扶養者（異動）届',
    'DEPENDENT_CHANGE': '被扶養者（異動）届',
    'ADDRESS_CHANGE_EXTERNAL': '被保険者住所変更届',
    'ADDRESS_CHANGE': '住所変更届',
    'NAME_CHANGE_EXTERNAL': '被保険者氏名変更（訂正）届',
    'NAME_CHANGE': '氏名変更届',
    'REWARD_BASE': '被保険者報酬月額算定基礎届',
    'REWARD_CHANGE': '被保険者報酬月額変更届',
    'BONUS_PAYMENT': '被保険者賞与支払届'
  };
  
  return folderNames[code] || code;
}

