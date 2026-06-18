/**
 * UI渲染层
 * 负责所有DOM操作和界面更新
 */

const UI = {
  // 缓存DOM引用
  els: {},

  /** 渲染单个数值变化标签 */
  _changeTag(icon, value) {
    if (value) {
      const cls = value > 0 ? 'effect-positive' : 'effect-negative';
      const sign = value > 0 ? '+' : '';
      return `<span class="${cls}">${icon}${sign}${value}</span>`;
    }
    return `<span class="effect-zero">${icon}0</span>`;
  },

  /**
   * 初始化UI，缓存DOM元素
   */
  init() {
    this.els = {
      screens: {
        start: document.getElementById('screen-start'),
        select: document.getElementById('screen-select'),
        events: document.getElementById('screen-events'),
        history: document.getElementById('screen-history'),
        end: document.getElementById('screen-end')
      },
      roundInfo: document.getElementById('round-info'),
      roundNum: document.getElementById('round-num'),
      bottomPanel: document.getElementById('bottom-panel'),
      countriesRow: document.getElementById('countries-row'),
      historyRow: document.getElementById('history-row'),
      countriesContainer: document.getElementById('countries-container'),
      eventsPool: document.getElementById('events-pool-list'),
      eventsSelected: document.getElementById('events-selected-list'),
      poolCount: document.getElementById('pool-count'),
      selectedCount: document.getElementById('selected-count'),
      btnConfirmEvents: document.getElementById('btn-confirm-events'),
      btnNextRound: document.getElementById('btn-next-round'),
      btnStart: document.getElementById('btn-start'),
      btnEnd: document.getElementById('btn-show-end'),
      historyText: document.getElementById('history-text'),
      statsSummary: document.getElementById('stats-summary'),
      loadingOverlay: document.getElementById('loading-overlay'),
      loadingText: document.getElementById('loading-text'),
      btnRetry: document.getElementById('btn-retry'),
      toast: document.getElementById('toast'),
      endContent: document.getElementById('end-content'),
      configStatus: document.getElementById('config-status'),
      apiKeyInput: document.getElementById('api-key-input')
    };

    // 事件绑定
    this.els.btnStart.addEventListener('click', () => GameController.startNewGame());
    this.els.btnConfirmEvents.addEventListener('click', () => GameController.confirmEvents());
    this.els.btnNextRound.addEventListener('click', () => GameController.nextRound());
    this.els.btnEnd.addEventListener('click', () => this.showEndScreen());

    // API Key 输入监听
    this.els.apiKeyInput.addEventListener('input', () => this.checkApiConfig());

    // 初始检查
    this.checkApiConfig();
  },

  /**
   * 检查API配置状态（仅直连模式）
   */
  async checkApiConfig() {
    const key = this.els.apiKeyInput.value.trim();
    if (key && key.startsWith('sk-')) {
      AIInterface.setDirectMode(key);
      this.els.btnStart.disabled = false;
      this.els.configStatus.textContent = '✅ API Key 已就绪，点击开始';
      this.els.configStatus.style.color = 'var(--accent-green)';
    } else if (key && !key.startsWith('sk-')) {
      this.els.btnStart.disabled = true;
      this.els.configStatus.textContent = '⚠️ API Key 格式不正确（应以 sk- 开头）';
      this.els.configStatus.style.color = 'var(--accent-red)';
    } else {
      this.els.btnStart.disabled = true;
      this.els.configStatus.textContent = '🔑 请输入 DeepSeek API Key 以开始游戏';
      this.els.configStatus.style.color = 'var(--accent-gold)';
    }
  },

  /**
   * 切换显示的屏幕
   */
  showScreen(name) {
    Object.values(this.els.screens).forEach(el => el.classList.add('hidden'));
    const screen = this.els.screens[name];
    if (screen) screen.classList.remove('hidden');

    if (name === 'start' || name === 'end') {
      this.els.bottomPanel.classList.add('hidden');
      this.els.roundInfo.classList.add('hidden');
    } else {
      this.els.bottomPanel.classList.remove('hidden');
      this.els.roundInfo.classList.remove('hidden');
    }

    // 进入历史页时复位按钮到默认状态
    if (name === 'history') {
      this.els.btnNextRound.classList.remove('hidden');
      this.els.btnEnd.classList.add('hidden');
    }
  },

  /**
   * 渲染国家选择卡片
   */
  renderCountries() {
    const container = this.els.countriesContainer;
    container.innerHTML = '';

    GameState.countries.forEach((country, index) => {
      const card = document.createElement('div');
      card.className = 'country-card';
      if (GameState.playerIndex === index) {
        card.classList.add('selected');
      }
      card.innerHTML = `
        <div class="country-name">${country.name}</div>
        <div class="country-background">${country.background}</div>
        <div class="country-stats">
          <div class="stat-item">
            <div class="stat-icon">🔬</div>
            <div class="stat-value">${country.tech}</div>
            <div class="stat-label">科技</div>
          </div>
          <div class="stat-item">
            <div class="stat-icon">🎭</div>
            <div class="stat-value">${country.culture}</div>
            <div class="stat-label">文化</div>
          </div>
          <div class="stat-item">
            <div class="stat-icon">💰</div>
            <div class="stat-value">${country.finance}</div>
            <div class="stat-label">金融</div>
          </div>
        </div>
      `;

      if (GameState.playerIndex < 0) {
        card.addEventListener('click', () => GameController.selectCountry(index));
      }

      container.appendChild(card);
    });

    this.els.screens.select.querySelector('.phase-desc').textContent =
      GameState.playerIndex >= 0
        ? '已选择 ' + GameState.countries[GameState.playerIndex].name
        : '正在生成历史背景...';
  },

  /**
   * 渲染事件列表（支持拖拽：池→选区、选区内排序、选区→池）
   */
  renderEvents() {
    const poolList = this.els.eventsPool;
    const selectedList = this.els.eventsSelected;

    poolList.innerHTML = '';
    selectedList.innerHTML = '';

    // ===== 可选事件池 =====
    GameState.playerEventPool.forEach((event, idx) => {
      const isSelected = GameState.selectedEvents.includes(event);
      if (isSelected) return;

      const card = this._createEventCard(event, 'in-pool');
      card.draggable = true;
      card.dataset.poolIndex = idx;

      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'pool:' + idx);
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('click', () => {
        if (!card.classList.contains('dragging')) GameController.toggleEvent(event);
      });

      poolList.appendChild(card);
    });

    // ===== 已选事件（可拖拽排序，也可拖回池） =====
    GameState.selectedEvents.forEach((event, index) => {
      const card = this._createEventCard(event, 'in-selected');
      card.draggable = true;
      card.dataset.eventIndex = index;

      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'selected:' + index);
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const raw = e.dataTransfer.getData('text/plain');
        if (raw.startsWith('selected:')) {
          const from = parseInt(raw.split(':')[1]);
          if (from !== index && !isNaN(from)) this._reorderSelected(from, index);
        }
      });
      card.addEventListener('click', () => {
        if (!card.classList.contains('dragging')) GameController.toggleEvent(event);
      });

      selectedList.appendChild(card);
    });

    // ===== 列表区域接受拖放 =====
    this._setupListDropZone(poolList, 'pool');
    this._setupListDropZone(selectedList, 'selected');

    this.els.poolCount.textContent = GameState.playerEventPool.length - GameState.selectedEvents.length;
    this.els.selectedCount.textContent = GameState.selectedEvents.length;
    this.updateConfirmButton();
  },

  /**
   * 为列表设置放置区域（接收从另一列表拖来的卡片）
   */
  _setupListDropZone(listEl, zoneType) {
    listEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    listEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const [src, idxStr] = raw.split(':');
      const idx = parseInt(idxStr);
      if (isNaN(idx)) return;

      // 从池拖到选区：添加事件
      if (src === 'pool' && zoneType === 'selected') {
        const event = GameState.playerEventPool[idx];
        if (event && !GameState.selectedEvents.includes(event) && GameState.selectedEvents.length < 4) {
          GameState.selectedEvents.push(event);
          this.renderEvents();
        }
      }
      // 从选区拖到池：移除事件
      if (src === 'selected' && zoneType === 'pool') {
        GameState.selectedEvents.splice(idx, 1);
        this.renderEvents();
      }
    });
  },

  /**
   * 重新排序已选事件
   */
  _reorderSelected(fromIndex, toIndex) {
    const arr = GameState.selectedEvents;
    const [moved] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, moved);
    this.renderEvents();
  },

  /**
   * 创建事件卡片DOM
   */
  _createEventCard(event, cssClass) {
    const card = document.createElement('div');
    card.className = `event-card ${cssClass}`;

    const effects = [
      this._changeTag('🔬', event.techChange),
      this._changeTag('🎭', event.cultureChange),
      this._changeTag('💰', event.financeChange)
    ];

    card.innerHTML = `
      <div class="event-target">${event.targetCountry}</div>
      <div class="event-title">${event.title}</div>
      <div class="event-desc">${event.description}</div>
      <div class="event-effects">${effects.join('')}</div>
    `;

    return card;
  },

  /**
   * 更新确认按钮状态
   */
  updateConfirmButton() {
    this.els.btnConfirmEvents.disabled = GameState.selectedEvents.length !== 4;
  },

  /**
   * 渲染历史叙述
   */
  renderHistory(data) {
    this.els.historyText.textContent = data.historyText;

    // 渲染数值变化
    const summary = this.els.statsSummary;
    summary.innerHTML = '';

    for (const [name, adj] of Object.entries(data.adjustments)) {
      const country = GameState.countries.find(c => c.name === name);
      // 跳过已灭亡或本回合数值归零的国家
      if (!country || country.destroyed) continue;
      if (country.tech <= 0 || country.culture <= 0 || country.finance <= 0) continue;

      const div = document.createElement('div');
      div.className = 'stat-change';
      div.innerHTML = `
        <div class="country-name-sm">${name}</div>
        <div class="changes">
          ${this._changeTag('🔬', adj.tech)}
          ${this._changeTag('🎭', adj.culture)}
          ${this._changeTag('💰', adj.finance)}
        </div>
      `;
      summary.appendChild(div);
    }

    // 更新回合显示
    this.els.roundNum.textContent = GameState.round;
    // 在回合数旁显示进度
    const maxLabel = GameState.round >= GameState.maxRounds ? ' (最终回合)' :
      GameState.round >= GameState.maxRounds - 1 ? ` / ${GameState.maxRounds}` : '';
    // 用 round-label 显示附加上下文
    const roundLabel = document.querySelector('.round-label:last-child');
    if (roundLabel) {
      roundLabel.textContent = maxLabel || '回合';
    }

    // 更新历史纪要
    this._renderHistoryEntries();
  },

  /**
   * 渲染历史纪要（横排）
   */
  _renderHistoryEntries() {
    const container = this.els.historyRow;
    container.innerHTML = '';

    GameState.worldHistory.slice().reverse().forEach(entry => {
      const span = document.createElement('span');
      span.className = 'h-entry-item';
      span.innerHTML = `<span class="he-round">[第${entry.round}回合]</span> ${entry.summary}`;
      container.appendChild(span);
    });
  },

  /**
   * 更新底部面板（列国志横排 + 本回合事件）
   */
  updateBottomPanel() {
    if (GameState.countries.length === 0) return;

    // 收集本回合各国家的事件（仅历史/结束阶段显示AI事件）
    const countryEvents = {};
    const showAiEvents = GameState.phase === 'history' || GameState.phase === 'end';

    if (GameState.selectedEvents.length > 0) {
      for (const evt of GameState.selectedEvents) {
        const name = evt.targetCountry;
        if (!countryEvents[name]) countryEvents[name] = [];
        countryEvents[name].push(evt);
      }
    }
    if (showAiEvents) {
      for (const [cname, events] of Object.entries(GameState.aiCountryEvents)) {
        if (!countryEvents[cname]) countryEvents[cname] = [];
        countryEvents[cname].push(...events);
      }
    }

    // 列国志
    const row = this.els.countriesRow;
    row.innerHTML = '';
    GameState.countries.forEach(country => {
      const isPlayer = GameState.playerIndex >= 0 &&
        GameState.countries[GameState.playerIndex] === country;

      const div = document.createElement('div');
      div.className = 'country-card-h' + (isPlayer ? ' player-country' : '');
      if (country.destroyed) div.style.opacity = '0.4';

      let eventsHtml = '';
      const evts = countryEvents[country.name];
      if (evts && evts.length > 0) {
        eventsHtml = '<div class="cch-events">';
        for (const evt of evts) {
          const parts = [
            this._changeTag('🔬', evt.techChange),
            this._changeTag('🎭', evt.cultureChange),
            this._changeTag('💰', evt.financeChange)
          ];
          eventsHtml += `<div class="cch-event"><span class="cch-ev-title">${evt.title}</span> ${parts.join(' ')}</div>`;
        }
        eventsHtml += '</div>';
      }

      div.innerHTML = `
        <div class="cch-top">
          <span class="cch-name">${isPlayer ? '👑 ' : ''}${country.name}${country.destroyed ? '💀' : ''}</span>
          <span class="cch-stats">
            <span class="cch-stat">🔬<span class="cch-stat-val">${country.tech}</span></span>
            <span class="cch-stat">🎭<span class="cch-stat-val">${country.culture}</span></span>
            <span class="cch-stat">💰<span class="cch-stat-val">${country.finance}</span></span>
          </span>
        </div>
        ${eventsHtml}
      `;
      row.appendChild(div);
    });

    this._renderHistoryEntries();
    this.els.roundNum.textContent = GameState.round || '-';
  },

  /**
   * 显示"查看结局"按钮
   */
  showEndButton() {
    this.els.btnNextRound.classList.add('hidden');
    this.els.btnEnd.classList.remove('hidden');
  },

  /**
   * 切换到结局画面
   */
  showEndScreen() {
    if (!GameState._pendingEndResult) return;
    GameState.phase = 'end';
    this.showScreen('end');
    this.renderEndScreen(GameState._pendingEndResult);
  },

  /**
   * 渲染游戏结束画面
   */
  renderEndScreen(result) {
    const container = this.els.endContent;
    // 用 endType 而非 result 判断展示模式
    const isRise = result.type === 'victory' || result.type === 'ai_victory' || result.type === 'last_standing';
    const isPlayerWin = result.result === 'win';
    const isFinalScoring = result.type === 'final_scoring';

    let summaryHTML = '';

    if (isFinalScoring && result.scores) {
      summaryHTML = `
        <h4 style="color:var(--accent-gold);margin-bottom:12px;">📊 第${GameState.maxRounds}回合 最终结算</h4>
        <div class="final-scores">
          ${result.scores.map((s, i) => `
            <div class="final-score-row ${s.name === GameState.getPlayerCountry().name ? 'player-row' : ''}">
              <span class="fs-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
              <span class="fs-name">${s.name}</span>
              <span class="fs-detail">🔬${s.tech} 🎭${s.culture} 💰${s.finance}</span>
              <span class="fs-total">${s.total} 点</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    summaryHTML += `
      <h4 style="color:var(--accent-gold);margin:16px 0 12px;">📜 历史总结</h4>
      ${GameState.worldHistory.map(h =>
        `<p style="margin-bottom:8px;"><strong>[第${h.round}回合]</strong> ${h.summary}</p>`
      ).join('')}
      <hr style="border-color:var(--border-color);margin:16px 0;">
      <p><strong>共经历 ${GameState.round} 个回合</strong></p>
    `;

    // 结局叙述
    let endingHTML = '';
    if (GameState._endingNarrative?.endingText) {
      endingHTML = `
        <div class="ending-narrative">
          <h4 style="color:var(--accent-gold);margin-bottom:12px;">${isRise ? '🌟 盛世华章' : '📜 灭亡记录'}</h4>
          <div class="ending-text">${GameState._endingNarrative.endingText.replace(/\n/g, '</p><p>')}</div>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="end-icon">${isPlayerWin ? '🏆' : '💀'}</div>
      <h2 style="color:${isPlayerWin ? 'var(--accent-gold)' : 'var(--accent-red)'}">
        ${isPlayerWin ? '青史留名！' : isRise ? '大势已去...' : '折戟沉沙...'}
      </h2>
      <div class="end-result">${result.reason}</div>
      <div class="end-summary">
        ${endingHTML}
        ${summaryHTML}
      </div>
      <button class="btn-primary" onclick="GameController.restart()">重新构史</button>
    `;
  },

  /**
   * 显示加载遮罩
   */
  showLoading(text) {
    this.els.btnRetry.classList.add('hidden');
    this.els.loadingText.textContent = text || 'AI正在思考...';
    this.els.loadingOverlay.classList.remove('hidden');
  },

  /**
   * 隐藏加载遮罩
   */
  hideLoading() {
    this.els.btnRetry.classList.add('hidden');
    this.els.loadingOverlay.classList.add('hidden');
  },

  /**
   * 加载失败时显示重试按钮
   */
  showRetryButton() {
    this.els.loadingText.textContent = '❌ 生成失败，检查网络或 API Key 是否正确';
    this.els.btnRetry.classList.remove('hidden');
    this.els.loadingOverlay.classList.remove('hidden');
  },

  /**
   * 显示Toast消息
   */
  showToast(message, isError = false) {
    const toast = this.els.toast;
    toast.textContent = message;
    toast.style.borderColor = isError ? 'var(--accent-red)' : 'var(--border-gold)';
    toast.classList.remove('hidden');

    // 重置动画
    toast.style.animation = 'none';
    toast.offsetHeight; // reflow
    toast.style.animation = 'toastIn 0.3s ease, toastOut 0.3s ease 2.5s forwards';

    setTimeout(() => toast.classList.add('hidden'), 2800);
  }
};
