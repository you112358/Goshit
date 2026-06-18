/**
 * 游戏核心控制器
 * 管理游戏流程和阶段转换
 */

const GameController = {
  /** 保存当前可重试的操作 */
  _retryAction: null,

  /** 设置重试操作 */
  _setRetry(action) {
    this._retryAction = action;
    UI.showRetryButton(); // 加载遮罩上显示重试按钮
  },

  /**
   * 重试上一次失败的操作
   */
  retry() {
    if (this._retryAction) {
      UI.showLoading('');
      this._retryAction();
    }
  },

  /**
   * 开始新游戏
   */
  async startNewGame() {
    GameState.reset();
    UI.showLoading('正在生成国家...');

    try {
      const data = await AIInterface.generateCountries();
      GameState.countries = data.countries.map(c => ({
        name: c.name,
        background: c.background,
        tech: c.tech,
        culture: c.culture,
        finance: c.finance,
        destroyed: false
      }));
      GameState.phase = 'select';
      this._retryAction = null;
      UI.hideLoading();
      UI.showScreen('select');
      UI.renderCountries();
    } catch (err) {
      console.error(err);
      UI.hideLoading();
      UI.showToast('生成国家失败: ' + err.message, true);
      this._setRetry(() => this.startNewGame());
    }
  },

  /**
   * 玩家选择国家
   */
  selectCountry(index) {
    GameState.playerIndex = index;
    GameState.round = 1;
    UI.renderCountries();
    UI.updateBottomPanel();

    setTimeout(() => this.startRound(), 800);
  },

  /**
   * 开始新回合：生成玩家事件池 + AI国家各自的事件
   */
  async startRound() {
    GameState.phase = 'events';
    GameState.selectedEvents = [];
    GameState.aiCountryEvents = {};
    GameState.playerEventPool = [];

    UI.showLoading(`正在构思第 ${GameState.round} 回合的历史事件...`);

    try {
      const playerCountry = GameState.getPlayerCountry();
      const activeCountries = GameState.countries.filter(c => !c.destroyed);
      const aiCountries = GameState.getAICountries();

      // 并行生成：玩家国家事件池 + 每个AI国家各4个事件
      const tasks = [
        AIInterface.generateEvents(GameState.round, playerCountry, activeCountries, GameState.worldHistory)
      ];

      for (const aiCountry of aiCountries) {
        tasks.push(
          AIInterface.generateAICountryEvents(
            GameState.round,
            aiCountry.name,
            activeCountries,
            GameState.worldHistory,
            playerCountry.name
          )
        );
      }

      const results = await Promise.all(tasks);

      // 第一个结果是玩家事件池
      GameState.playerEventPool = results[0].events || [];

      // 后续结果是各AI国家的事件
      for (let i = 0; i < aiCountries.length; i++) {
        const aiData = results[i + 1];
        GameState.aiCountryEvents[aiCountries[i].name] = aiData.events || [];
      }

      UI.hideLoading();
      UI.showScreen('events');
      UI.updateBottomPanel();
      UI.renderEvents();
      this._retryAction = null;
    } catch (err) {
      console.error(err);
      UI.hideLoading();
      UI.showToast('生成事件失败: ' + err.message, true);
      this._setRetry(() => this.startRound());
    }
  },

  /**
   * 切换事件的选中状态
   */
  toggleEvent(event) {
    const idx = GameState.selectedEvents.indexOf(event);
    if (idx >= 0) {
      GameState.selectedEvents.splice(idx, 1);
    } else {
      if (GameState.selectedEvents.length >= 4) {
        UI.showToast('最多只能选择4个事件', true);
        return;
      }
      GameState.selectedEvents.push(event);
    }
    UI.renderEvents();
    UI.updateConfirmButton();
  },

  /**
   * 确认选择，生成历史
   */
  async confirmEvents() {
    if (GameState.selectedEvents.length !== 4) {
      UI.showToast('请选择恰好4个事件', true);
      return;
    }

    // 收集所有AI事件
    const allAIEvents = [];
    for (const events of Object.values(GameState.aiCountryEvents)) {
      allAIEvents.push(...events);
    }

    const allPlayerEvents = GameState.selectedEvents;

    UI.showLoading('正在构史...');
    GameState.phase = 'history';

    try {
      const data = await AIInterface.generateHistory(
        GameState.round,
        GameState.countries.filter(c => !c.destroyed),
        GameState.getPlayerCountry().name,
        allPlayerEvents,
        allAIEvents,
        GameState.worldHistory,
        GameState.maxRounds
      );

      // 应用所有事件效果
      for (const event of [...allPlayerEvents, ...allAIEvents]) {
        GameState.applyEvent(event);
      }
      // 应用历史调整
      GameState.applyAdjustments(data.adjustments);
      // 最终钳位并判定灭亡
      GameState.clampAll();

      // 记录世界历史
      GameState.worldHistory.push({
        round: GameState.round,
        summary: data.summary,
        historyText: data.historyText,
        playerEvents: [...allPlayerEvents],
        aiEvents: [...allAIEvents],
        adjustments: data.adjustments
      });

      UI.hideLoading();
      UI.showScreen('history');
      UI.renderHistory(data);
      UI.updateBottomPanel();

      // 检查游戏结束条件
      let endResult = GameState.checkGameEnd();
      if (!endResult && GameState.round >= GameState.maxRounds) {
        endResult = GameState.finalScoring();
      }
      if (endResult) {
        GameState._pendingEndResult = endResult;
        UI.showEndButton();
        // 异步生成结局叙述
        AIInterface.generateEnding(endResult, GameState.worldHistory, GameState.maxRounds)
          .then(ending => { GameState._endingNarrative = ending; })
          .catch(() => {});
      }
      this._retryAction = null;
    } catch (err) {
      console.error(err);
      UI.hideLoading();
      UI.showToast('生成历史失败: ' + err.message, true);
      this._setRetry(() => this.confirmEvents());
    }
  },

  /**
   * 进入下一回合
   */
  nextRound() {
    if (GameState.gameResult) return;

    GameState.round++;

    // 最后一回合提示
    if (GameState.round === GameState.maxRounds) {
      UI.showToast('⚠️ 最后一回合！本回合结束后将进行最终结算');
    } else if (GameState.round === GameState.maxRounds - 1) {
      UI.showToast('⚠️ 倒数第二回合，请谨慎选择！');
    }

    this.startRound();
  },

  /**
   * 重新开始
   */
  restart() {
    this._retryAction = null;
    GameState.reset();
    UI.showScreen('start');
    UI.updateBottomPanel();
    UI.checkApiConfig();
  }
};
