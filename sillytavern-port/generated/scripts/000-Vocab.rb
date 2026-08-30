#==============================================================================
# ■ Vocab
#------------------------------------------------------------------------------
# 　用語とメッセージを定義するモジュールです。定数でメッセージなどを直接定義す
# るほか、グローバル変数 $data_system から用語データを取得します。
#==============================================================================

module Vocab

  # ショップ画面
  ShopBuy         = "Mua"
  ShopSell        = "Bán"
  ShopCancel      = "Bỏ đi"
  Possession      = "Chiếm lấy"

  # ステータス画面
  ExpTotal        = "Kinh Nghiệm hiện tại"
  ExpNext         = "Cần thêm %s"

  # セーブ／ロード画面
  SaveMessage     = "Lưu vào đâu?"
  LoadMessage     = "Mở tệp nào?"
  File            = "Tệp"

  # 複数メンバーの場合の表示
  PartyName       = "Đội của %s"

  # 戦闘基本メッセージ
  Emerge          = "%s xuất hiện!"
  Preemptive      = "%s tấn công bất ngờ!"
  Surprise        = "%s bị tấn công bất ngờ!"
  EscapeStart     = "%s chạy trốn!"
  EscapeFailure   = "Nhưng đường lui đã bị chặn lại!"

  # 戦闘終了メッセージ
  Victory         = "%s chiến thắng!"
  Defeat          = "%s thua trận."
  ObtainExp       = "%s nhận được Kinh Nghiệm!"
  ObtainGold      = "%s Linh Hồn được tìm thấy!"
  ObtainItem      = "%s được tìm thấy!"
  LevelUp         = "%s đã lên %s %s!"
  ObtainSkill     = "%s đã được học!"

  # アイテム使用
  UseItem         = "%s sử dụng %s!"

  # クリティカルヒット
  CriticalToEnemy = "CHÍ MẠNG!!"
  CriticalToActor = "CHÍ MẠNG!!"

  # アクター対象の行動結果
  ActorDamage     = "%s nhận %s sát thương!"
  ActorRecovery   = "%s đã hồi phục %s %s!"
  ActorGain       = "%s nhận được %s %s!"
  ActorLoss       = "%s mất %s %s!"
  ActorDrain      = "%s bị hút mất %s %s!"
  ActorNoDamage   = "%s nhận 0 sát thương!"
  ActorNoHit      = "Trượt! %s không nhận sát thương!"

  # 敵キャラ対象の行動結果
  EnemyDamage     = "%s đã nhận %s sát thương!"
  EnemyRecovery   = "%s đã hồi phục %s %s!"
  EnemyGain       = "%s nhận được %s %s!"
  EnemyLoss       = "%s mất %s %s!"
  EnemyDrain      = "%s bị hút mất %s %s!"
  EnemyNoDamage   = "%s nhận 0 sát thương!"
  EnemyNoHit      = "Trượt! %s không nhận sát thương!"

  # 回避／反射
  Evasion         = "%s né đòn đánh!"
  MagicEvasion    = "%s né phép thuật!"
  MagicReflection = "%s vô hiệu hoá phép thuật!"
  CounterAttack   = "%s phản đòn!"
  Substitute      = "%s bảo vệ %s!"

  # 能力強化／弱体
  BuffAdd         = "%s tăng %s!"
  DebuffAdd       = "%s giảm %s!"
  BuffRemove      = "%s phục hồi lại %s!"

  # スキル、アイテムの効果がなかった
  ActionFailure   = "%s không bị ảnh hưởng!"

  # エラーメッセージ
  PlayerPosError  = "プレイヤーの初期位置が設定されていません。"
  EventOverflow   = "コモンイベントの呼び出しが上限を超えました。"

  # 基本ステータス
  def self.basic(basic_id)
    $data_system.terms.basic[basic_id]
  end

  # 能力値
  def self.param(param_id)
    $data_system.terms.params[param_id]
  end

  # 装備タイプ
  def self.etype(etype_id)
    $data_system.terms.etypes[etype_id]
  end

  # コマンド
  def self.command(command_id)
    $data_system.terms.commands[command_id]
  end

  # 通貨単位
  def self.currency_unit
    $data_system.currency_unit
  end

  #--------------------------------------------------------------------------
  def self.level;       basic(0);     end   # レベル
  def self.level_a;     basic(1);     end   # レベル (短)
  def self.hp;          basic(2);     end   # HP
  def self.hp_a;        basic(3);     end   # HP (短)
  def self.mp;          basic(4);     end   # MP
  def self.mp_a;        basic(5);     end   # MP (短)
  def self.tp;          basic(6);     end   # TP
  def self.tp_a;        basic(7);     end   # TP (短)
  def self.fight;       command(0);   end   # 戦う
  def self.escape;      command(1);   end   # 逃げる
  def self.attack;      command(2);   end   # 攻撃
  def self.guard;       command(3);   end   # 防御
  def self.item;        command(4);   end   # アイテム
  def self.skill;       command(5);   end   # スキル
  def self.equip;       command(6);   end   # 装備
  def self.status;      command(7);   end   # ステータス
  def self.formation;   command(8);   end   # 並び替え
  def self.save;        command(9);   end   # セーブ
  def self.game_end;    command(10);  end   # ゲーム終了
  def self.weapon;      command(12);  end   # 武器
  def self.armor;       command(13);  end   # 防具
  def self.key_item;    command(14);  end   # 大事なもの
  def self.equip2;      command(15);  end   # 装備変更
  def self.optimize;    command(16);  end   # 最強装備
  def self.clear;       command(17);  end   # 全て外す
  def self.new_game;    command(18);  end   # ニューゲーム
  def self.continue;    command(19);  end   # コンティニュー
  def self.shutdown;    command(20);  end   # シャットダウン
  def self.to_title;    command(21);  end   # タイトルへ
  def self.cancel;      command(22);  end   # やめる
  #--------------------------------------------------------------------------
end
