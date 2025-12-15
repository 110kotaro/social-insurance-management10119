/**
 * 申請フロー設定関連のモデル
 */

/**
 * 申請種別
 */
export interface ApplicationType {
  id: string; // ID（固定申請種別は固定ID、カスタム申請種別は自動生成）
  name: string; // 申請種別名（すべて編集可能）
  code: string; // 申請種別コード（すべて編集可能）
  category: 'internal' | 'external'; // カテゴリ（固定）
  enabled: boolean; // 有効/無効（編集可能）
  isCustom: boolean; // カスタム申請種別かどうか（trueの場合は削除可能）
  isDeletable: boolean; // 削除可能かどうか（外部申請はfalse、内部申請の初期種別はfalse、カスタム種別はtrue）
  description?: string; // 説明文（すべて編集可能）
}

/**
 * 添付書類設定
 */
export interface AttachmentSetting {
  applicationTypeId: string; // 申請種別ID
  allowedFormats?: string[]; // 許可するファイル形式（空の場合はすべて許可）
  maxFileSize?: number; // MB単位（空の場合は制限なし）
  description?: string; // 説明文
}

/**
 * 申請フロー設定
 */
export interface ApplicationFlowSettings {
  applicationTypes: ApplicationType[]; // 申請種別（内部申請は追加可能、すべて編集可能）
  approvalRule: {
    method: 'admin_any'; // 固定値：管理者のいずれか一名の承認
    description: string; // 説明文
  };
  attachmentSettings: AttachmentSetting[]; // 添付書類設定（申請種別ごと）
  notificationSettings: {
    internalDeadlineDays: number; // デフォルト3
    externalDeadlineDays: number; // デフォルト7
    reminderInterval: number; // リマインダー間隔（日数）
    notifyApplicant: boolean; // 申請者への通知
    notifyAdmin: boolean; // 管理者への通知
    notifyOnSubmit: boolean; // 申請提出時の通知
    notifyOnApprove: boolean; // 承認時の通知
    notifyOnReturn: boolean; // 差戻し時の通知
    notifyOnReject: boolean; // 却下時の通知
    reminderSettings?: {
      adminDaysBeforeLegalDeadline: number; // 管理者向け：法定期限のX日前（デフォルト7日）
      notifyOnOverdue: boolean; // 期限超過時の通知（原則毎日通知、デフォルトtrue）
      notifyOnDeadlineDay: boolean; // 期限当日の通知（10時くらい、デフォルトtrue）
      notifyBeforeDeadline: boolean; // 事前通知（X日前の通知、デフォルトtrue）
    };
  };
}

/**
 * デフォルトの内部申請種別（11種類）
 */
export const DEFAULT_INTERNAL_APPLICATION_TYPES: Omit<ApplicationType, 'id'>[] = [
  { name: '被扶養者（異動）届', code: 'DEPENDENT_CHANGE', category: 'internal', enabled: true, isCustom: false, isDeletable: false },
  { name: '高齢任意加入（取得・喪失）', code: 'ELDERLY_OPTIONAL', category: 'internal', enabled: true, isCustom: false, isDeletable: false },
  { name: '産前産後休業取得者申出書／変更（終了）', code: 'MATERNITY_LEAVE', category: 'internal', enabled: true, isCustom: false, isDeletable: false },
  { name: '育児休業取得者申出書（新規・延長）／終了届', code: 'CHILDCARE_LEAVE', category: 'internal', enabled: true, isCustom: false, isDeletable: false },
  { name: '養育期間特例申出書・終了届', code: 'NURTURING_PERIOD', category: 'internal', enabled: true, isCustom: false, isDeletable: false },
  { name: '住所変更届', code: 'ADDRESS_CHANGE', category: 'internal', enabled: true, isCustom: false, isDeletable: false },
  { name: '氏名変更届', code: 'NAME_CHANGE', category: 'internal', enabled: true, isCustom: false, isDeletable: false },
  { name: '生年月日訂正届', code: 'BIRTHDATE_CORRECTION', category: 'internal', enabled: true, isCustom: false, isDeletable: false },
  { name: '傷病手当金申請', code: 'SICKNESS_ALLOWANCE', category: 'internal', enabled: true, isCustom: false, isDeletable: false },
  { name: '出産手当金申請', code: 'MATERNITY_ALLOWANCE', category: 'internal', enabled: true, isCustom: false, isDeletable: false },
  { name: '任意継続資格取得届', code: 'VOLUNTARY_CONTINUATION', category: 'internal', enabled: true, isCustom: false, isDeletable: false },
];

/**
 * デフォルトの外部申請種別（26種類）
 */
export const DEFAULT_EXTERNAL_APPLICATION_TYPES: Omit<ApplicationType, 'id'>[] = [
  { name: '被保険者資格取得届（健保、年金両方）', code: 'INSURANCE_ACQUISITION', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '被保険者資格喪失届（健保、年金両方）', code: 'INSURANCE_LOSS', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '高齢任意加入被保険者（船員以外）資格取得申出／申請書（年金）', code: 'ELDERLY_ACQUISITION_PENSION', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '高齢任意加入被保険者（船員以外）資格喪失申出／申請書（年金）', code: 'ELDERLY_LOSS_PENSION', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '被扶養者（異動）届（健保、年金両方）', code: 'DEPENDENT_CHANGE_EXTERNAL', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '被保険者所属選択／二以上事業所勤務届（健保、年金両方）', code: 'MULTIPLE_WORKPLACE', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '70歳以上被用者所属選択／二以上事業所勤務届（年金）', code: 'OVER70_WORKPLACE', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '被保険者報酬月額算定基礎届（健保、年金両方）', code: 'REWARD_BASE', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '被保険者報酬月額変更届（健保、年金両方）', code: 'REWARD_CHANGE', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '被保険者賞与支払届（健保、年金）', code: 'BONUS_PAYMENT', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '賞与不支給報告書（健保、年金）', code: 'BONUS_NON_PAYMENT', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '標準賞与額累計申出書（健保）', code: 'BONUS_ACCUMULATION', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '産前産後休業取得者申出書／変更（終了）届（健保、年金両方）', code: 'MATERNITY_LEAVE_EXTERNAL', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '産前産後休業終了時報酬月額変更届（健保、年金両方）', code: 'MATERNITY_REWARD_CHANGE', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '育児休業等終了時報酬月額変更届（健保、年金両方）', code: 'CHILDCARE_REWARD_CHANGE', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '育児休業等取得者申出書（新規・延長）／終了届（健保、年金両方）', code: 'CHILDCARE_LEAVE_EXTERNAL', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '養育期間標準報酬月額特例申出書・終了届（年金）', code: 'NURTURING_REWARD_PENSION', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '被保険者区分変更届（健保、年金両方）', code: 'INSURANCE_CATEGORY_CHANGE', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '資格確認書回収不能届（健保）', code: 'CERTIFICATE_UNRECOVERABLE', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '被保険者住所変更届（国民年金第3号被保険者住所変更届）（健保、年金両方）', code: 'ADDRESS_CHANGE_EXTERNAL', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '被保険者氏名変更（訂正）届（健保、年金両方）', code: 'NAME_CHANGE_EXTERNAL', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '被保険者生年月日訂正届（健保、年金両方）', code: 'BIRTHDATE_CORRECTION_EXTERNAL', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '傷病手当金申請（健保）', code: 'SICKNESS_ALLOWANCE_EXTERNAL', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '出産手当金申請（健保）', code: 'MATERNITY_ALLOWANCE_EXTERNAL', category: 'external', enabled: true, isCustom: false, isDeletable: false },
  { name: '任意継続被保険者資格取得届（健保）', code: 'VOLUNTARY_CONTINUATION_EXTERNAL', category: 'external', enabled: true, isCustom: false, isDeletable: false },
];

