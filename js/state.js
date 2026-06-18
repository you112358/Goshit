/**
 * 游戏状态管理
 * 管理所有游戏数据的中央状态存储
 */

const GameState = {
  // 游戏阶段: 'start' | 'select' | 'events' | 'history' | 'end'
  phase: 'start',

  // 回合数
  round: 0,

  // 最大回合数（第10回合结束时强制结算）
  maxRounds: 10,

  // 五个国家
  countries: [],

  // 玩家选择的国家索引
  playerIndex: -1,

  // 当前回合：给玩家选择的事件池（6个）
  playerEventPool: [],

  // 玩家选择的4个事件（有序）
  selectedEvents: [],

  // AI国家各自的事件（每个AI国家4个）
  aiCountryEvents: {}, // { "国家名": [events] }

  // 世界历史记录
  worldHistory: [],

  // 游戏结果: null | 'win' | 'lose'
  gameResult: null,

  /**
   * 获取玩家国家
   */
  getPlayerCountry() {
    return this.countries[this.playerIndex] || null;
  },

  /**
   * 获取存活的AI国家列表
   */
  getAICountries() {
    return this.countries.filter((_, i) => i !== this.playerIndex && !this.countries[i].destroyed);
  },

  /**
   * 检查胜利/失败条件（在每回合历史生成后调用）
   * 任意值降到0 → 亡国
   * 任意值升到最大值(60) → 胜利
   */
  checkGameEnd() {
    const player = this.getPlayerCountry();
    if (!player) return null;

    // 检查玩家失败
    if (player.tech <= 0 || player.culture <= 0 || player.finance <= 0) {
      this.gameResult = 'lose';
      return { result: 'lose', country: player, reason: this._getDeathReason(player), type: 'death' };
    }

    // 标记AI国家灭亡
    for (const c of this.getAICountries()) {
      if (c.tech <= 0 || c.culture <= 0 || c.finance <= 0) {
        c.destroyed = true;
      }
    }

    // 收集所有达成胜利条件的国家（任意值≥60），总分最高者胜
    const allCandidates = [player, ...this.getAICountries()].filter(c =>
      c.tech >= 60 || c.culture >= 60 || c.finance >= 60
    );
    if (allCandidates.length > 0) {
      const winner = allCandidates.reduce((a, b) =>
        (a.tech + a.culture + a.finance) >= (b.tech + b.culture + b.finance) ? a : b
      );
      if (winner === player) {
        this.gameResult = 'win';
        return { result: 'win', country: player, reason: this._getVictoryReason(player), type: 'victory' };
      } else {
        this.gameResult = 'lose';
        return { result: 'lose', country: winner, reason: `${winner.name}率先登峰造极，你的文明黯然失色...`, type: 'ai_victory' };
      }
    }

    // 最后幸存者直接胜利
    const alive = this.countries.filter(c => !c.destroyed);
    if (alive.length === 1) {
      const last = alive[0];
      if (last === player) {
        this.gameResult = 'win';
        return { result: 'win', country: player, reason: `${player.name}成为世界上唯一的文明，统一了天下！`, type: 'last_standing' };
      } else {
        this.gameResult = 'lose';
        return { result: 'lose', country: last, reason: `${last.name}成为世界上唯一的文明，你的国家被历史遗忘...`, type: 'last_standing' };
      }
    }

    return null;
  },

  /**
   * 第10回合结束时的最终结算
   * 计算每个存活的国家的数值总和，最高者获胜
   */
  finalScoring() {
    const alive = this.countries.filter(c => !c.destroyed);
    if (alive.length === 0) return { result: 'lose', reason: '所有文明都已消亡...' };

    // 计算每个国家的总和
    const scored = alive.map(c => ({
      name: c.name,
      total: c.tech + c.culture + c.finance,
      tech: c.tech,
      culture: c.culture,
      finance: c.finance
    })).sort((a, b) => b.total - a.total);

    const player = this.getPlayerCountry();
    const playerScore = scored.find(s => s.name === player.name);
    const isPlayerWin = scored[0].name === player.name;

    this.gameResult = isPlayerWin ? 'win' : 'lose';

    return {
      result: this.gameResult,
      type: 'final_scoring',
      scores: scored,
      playerScore: playerScore,
      isPlayerWin: isPlayerWin,
      reason: isPlayerWin
        ? `${player.name}以总和${playerScore.total}点位居榜首，赢得了历史的认可！`
        : `${scored[0].name}以总和${scored[0].total}点领先，${player.name}仅获${playerScore.total}点...`
    };
  },

  _getDeathReason(country) {
    const parts = [];
    if (country.tech <= 0) parts.push('科技衰微');
    if (country.culture <= 0) parts.push('文化断绝');
    if (country.finance <= 0) parts.push('财政崩溃');
    return `${country.name}因${parts.join('、')}而亡国`;
  },

  _getVictoryReason(country) {
    const parts = [];
    if (country.tech >= 60) parts.push('科技登峰造极');
    if (country.culture >= 60) parts.push('文化光耀万世');
    if (country.finance >= 60) parts.push('财富冠绝天下');
    return `${country.name}以${parts.join('、')}开创了不世辉煌！`;
  },

  /**
   * 应用事件效果到国家（不钳位，允许暂时为负）
   */
  applyEvent(event) {
    const country = this.countries.find(c => c.name === event.targetCountry);
    if (!country || country.destroyed) return;

    country.tech += (event.techChange || 0);
    country.culture += (event.cultureChange || 0);
    country.finance += (event.financeChange || 0);
  },

  /**
   * 应用AI历史调整（不钳位）
   */
  applyAdjustments(adjustments) {
    for (const [name, adj] of Object.entries(adjustments)) {
      const country = this.countries.find(c => c.name === name);
      if (!country || country.destroyed) continue;
      country.tech += (adj.tech || 0);
      country.culture += (adj.culture || 0);
      country.finance += (adj.finance || 0);
    }
  },

  /**
   * 最终钳位：将≤0的值强制归0，>60的钳位到60
   */
  clampAll() {
    for (const c of this.countries) {
      if (c.destroyed) { c.tech = 0; c.culture = 0; c.finance = 0; continue; }
      c.tech = Math.max(0, Math.min(60, c.tech));
      c.culture = Math.max(0, Math.min(60, c.culture));
      c.finance = Math.max(0, Math.min(60, c.finance));
    }
  },

  /**
   * 重置状态
   */
  reset() {
    this.phase = 'start';
    this.round = 0;
    this.countries = [];
    this.playerIndex = -1;
    this.playerEventPool = [];
    this.selectedEvents = [];
    this.aiCountryEvents = {};
    this.worldHistory = [];
    this.gameResult = null;
    this._pendingEndResult = null;
  }
};
