/**
 * AI接口层 - 直接调用 DeepSeek API
 */

const AIInterface = {
  apiKey: '',

  /**
   * 设置API Key
   */
  setDirectMode(apiKey) {
    this.apiKey = apiKey;
  },

  /**
   * 直连DeepSeek API
   */
  async _call(bodyData, timeoutMs = 120000) {
    if (!this.apiKey) {
      throw new Error('请先设置 DeepSeek API Key');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-v4-flash',
          messages: [{ role: 'user', content: bodyData.prompt || bodyData.messages?.[0]?.content }],
          temperature: bodyData.temperature || 0.8,
          max_tokens: bodyData.maxTokens || 4096,
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' }
        }),
        signal: controller.signal
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`DeepSeek API 错误 (${resp.status}): ${errText}`);
      }

      const data = await resp.json();
      return JSON.parse(data.choices[0].message.content);
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * 生成初始五个国家（每国三值总和固定为30）
   */
  async generateCountries() {
    const prompt = `你是一个架空历史模拟游戏的AI。请生成5个虚构国家的历史背景。

要求：
1. 每个国家需要包含：名称（不能直接使用现实国家名称）、历史背景描述（80-120字）、科技值、文化值、金融值
2. 每个国家的科技值、文化值、金融值的大小符合该国背景描述中所体现的国家特征
3. 每个国家的科技值+文化值+金融值必须恰好等于30，各项在5-15之间浮动
4. 五个国家的背景应该各有特色且明显不同，基于不同文明体系且参考真实历史演化逻辑
5. 背景要有一定的真实感和深度，初始背景应该基于远古至古典时代的时代特征

请严格按照以下JSON格式返回：
{
  "countries": [
    {
      "name": "国家名",
      "background": "历史背景描述...",
      "tech": 数字(5-15),
      "culture": 数字(5-15),
      "finance": 数字(5-15)
    }
  ]
}
注意：每个国家的tech+culture+finance必须等于30。`;

    return this._call({ prompt });
  },

  /**
   * 根据回合数返回时代背景描述
   */
  _getEraContext(round) {
    const eras = [
      { max: 1, name: '远古至古典时代', style: '青铜兵器、城邦雏形、原始信仰、早期农耕、文字萌芽、部落征伐',
        eventThemes: '城邦建立、青铜冶炼、文字创制、原始信仰改革、部落统一战争、灌溉工程、早期法典、神话史诗编撰' },
      { max: 3, name: '中古至封建时代', style: '铁器普及、帝国兴衰、宗教兴盛、丝绸之路、骑士与城堡、科举与门阀',
        eventThemes: '帝国扩张、宗教改革、远洋探索、封建制度、骑兵战术、造纸与印刷、大学建立、黑死病与人口变革' },
      { max: 5, name: '文艺复兴至启蒙时代', style: '人文主义、科学革命、大航海、重商主义、启蒙思想、火器普及',
        eventThemes: '科学发现、海外殖民、思想启蒙、金融革命（银行与股票）、产业萌芽、军事改革、文化复兴运动' },
      { max: 7, name: '工业革命至近代', style: '蒸汽与铁路、民族国家、宪政改革、工业化、电报与报纸、世界大战',
        eventThemes: '工业革命、铁路建设、民族独立运动、宪政改革、金融体系建立、电力应用、现代教育普及、劳工运动' },
      { max: 8, name: '现代至信息时代', style: '全球化、信息革命、核能与航天、金融资本、人工智能、生态危机',
        eventThemes: '信息技术突破、全球化贸易、太空探索、核能应用、金融衍生品、生态保护运动、人工智能崛起、基因工程' }
    ];
    for (const era of eras) {
      if (round <= era.max) return era;
    }
    return eras[eras.length - 1];
  },

  /**
   * 生成10个历史事件（围绕玩家所选国家，供玩家挑选）
   */
  async generateEvents(round, playerCountry, allCountries, worldHistory) {
    const playerName = playerCountry.name;
    const allCountryNames = allCountries.map(c => c.name).join('、');
    const playerBg = playerCountry.background || '';
    const playerStats = `科技${playerCountry.tech} 文化${playerCountry.culture} 金融${playerCountry.finance}`;
    const era = this._getEraContext(round);

    const historySummary = worldHistory.map(h =>
      `第${h.round}回合：${h.summary}`
    ).join('\n');

    const valueHint = round <= 4
      ? '事件只能影响科技值和文化值，金融值变化必须为0。每个事件的科技值+文化值变化总和必须大于0且小于4，单项变化范围-3到+3。'
      : '事件可以影响科技值、文化值和金融值。每个事件的科技值+文化值变化总和必须大于0且小于4。金融值变化幅度可较大（-4到+8）。科技值、文化值变化范围-5到+5。';

    const prompt = `你是一个架空历史模拟游戏的AI。现在是第${round}回合，时代背景为【${era.name}】。

时代特征：${era.style}
适合本时代的事件主题：${era.eventThemes}

请围绕玩家国家"${playerName}"的历史背景，生成6个可能发生在该国的历史事件，供玩家挑选4个。事件的风格和内容必须符合${era.name}的时代特征。

玩家国家：${playerName}
该国背景：${playerBg}
该国当前状态：${playerStats}
世界上的其他国家：${allCountryNames}

已有世界历史：
${historySummary || '（游戏刚开始，尚无历史）'}

要求：
1. 每个事件必须影响玩家国家"${playerName}"（targetCountry必须是"${playerName}"），事件应贴合该国的历史背景和${era.name}的时代脉络
2. 事件标题（10-20字）、描述（30-60字），参考真实历史但又带有架空特色，语言风格符合${era.name}
3. 事件应有好有坏，好坏比例约5:5
4. ${valueHint}
5. 各项数值上限为60，下限为0
6. 事件之间可以有潜在关联性，部分事件可以组成"事件链"
7. 事件要覆盖内政、军事、文化、外交、经济等不同方向，避免重复表达
8. 可适当涉及与其他国家的互动（外交、贸易、战争等），但主体仍是玩家国家内部事件

请严格按照以下JSON格式返回：
{
  "events": [
    {
      "title": "事件标题",
      "description": "事件描述（30-60字）",
      "targetCountry": "${playerName}",
      "techChange": 数字,
      "cultureChange": 数字,
      "financeChange": 数字
    }
  ]
}`;

    return this._call({ prompt, round, playerCountry, allCountries, worldHistory });
  },

  /**
   * 为一个AI国家生成4个专属历史事件
   */
  async generateAICountryEvents(round, aiCountryName, allCountries, worldHistory, playerCountryName) {
    const countryNames = allCountries.map(c => c.name).join('、');
    const era = this._getEraContext(round);
    const historySummary = worldHistory.map(h =>
      `第${h.round}回合：${h.summary}`
    ).join('\n');

    const valueHint = round <= 4
      ? '事件只能影响科技值和文化值，金融值变化必须为0。每个事件的科技值+文化值变化总和必须大于0且小于4，单项变化范围-2到+3。'
      : '事件可以影响科技值、文化值和金融值。每个事件的科技值+文化值变化总和必须大于0且小于4。金融值变化幅度较大（-5到+10）。科技值、文化值变化范围-5到+5。';

    const prompt = `你是一个架空历史模拟游戏的AI。现在是第${round}回合，时代背景为【${era.name}】（${era.style}）。

请为AI控制的国家"${aiCountryName}"生成4个历史事件，事件风格必须符合${era.name}的时代特征。适合本时代的事件主题：${era.eventThemes}

所有国家：${countryNames}
玩家控制的国家是"${playerCountryName}"。

已有世界历史：
${historySummary || '（游戏刚开始，尚无历史）'}

要求：
1. 每个事件需要包含：标题（10-20字）、描述（30-60字）、影响的国家名（必须是${aiCountryName}）、对科技/文化/金融值的影响
2. 事件应贴合${aiCountryName}的历史背景和${era.name}的时代发展脉络
3. 事件有好有坏，比例约5:5
4. ${valueHint}
5. 各项数值上限为60，下限为0
6. 事件之间可以有潜在关联性，部分事件可以组成"事件链"
7. 事件要覆盖内政、军事、文化、外交、经济等不同方向，避免重复表达
8. 可适当涉及与其他国家的互动（外交、贸易、战争等），尤其是玩家国家"${playerCountryName}"，但主体仍是国家内部事件

请严格按照以下JSON格式返回：
{
  "events": [
    {
      "title": "事件标题",
      "description": "事件描述（30-60字）",
      "targetCountry": "${aiCountryName}",
      "techChange": 数字,
      "cultureChange": 数字,
      "financeChange": 数字
    }
  ]
}`;

    return this._call({ prompt, round, aiCountryName, allCountries, worldHistory, playerCountryName });
  },

  /**
   * 根据事件组合生成虚构历史
   */
  async generateHistory(round, countries, playerCountry, playerEvents, aiEvents, previousHistory, maxRounds) {
    const playerEventText = playerEvents.map((e, i) => `${i + 1}. ${e.title}：${e.description}`).join('\n');
    const aiEventText = aiEvents.map((e, i) => `${i + 1}. ${e.title}：${e.description}（发生于${e.targetCountry}）`).join('\n');
    const era = this._getEraContext(round);

    // 计算各国事件执行后的预期数值
    const projected = {};
    for (const c of countries) {
      projected[c.name] = { tech: c.tech, culture: c.culture, finance: c.finance };
    }
    for (const evt of [...playerEvents, ...aiEvents]) {
      const p = projected[evt.targetCountry];
      if (!p) continue;
      p.tech += (evt.techChange || 0);
      p.culture += (evt.cultureChange || 0);
      p.finance += (evt.financeChange || 0);
    }

    // 生成灭亡预警
    const dyingCountries = [];
    for (const c of countries) {
      if (c.destroyed) continue;
      const p = projected[c.name];
      const deaths = [];
      if (p.tech <= 0) deaths.push(`科技降至${p.tech}(≤0)`);
      if (p.culture <= 0) deaths.push(`文化降至${p.culture}(≤0)`);
      if (p.finance <= 0) deaths.push(`财政降至${p.finance}(≤0)`);
      if (deaths.length > 0) {
        dyingCountries.push(`${c.name}（${deaths.join('，')}）`);
      }
    }

    const doomHint = dyingCountries.length > 0
      ? `根据本回合事件的影响，以下国家将在本回合灭亡：\n` + dyingCountries.map(d => `  · ${d}`).join('\n')
      : '';

    const countryStatus = countries.map(c => {
      const p = projected[c.name];
      return `${c.name}：原科技${c.tech}→${p.tech} 原文化${c.culture}→${p.culture} 原金融${c.finance}→${p.finance}${c.destroyed ? '(已灭亡)' : ''}`;
    }).join('，');

    const roundContext = round >= maxRounds
      ? `这是最后一个回合（第${round}回合），本回合结束后将进行最终结算。`
      : round >= maxRounds - 2
        ? `游戏即将进入尾声（第${round}/${maxRounds}回合），事件影响应适度加大以推动终局。`
        : '';

    const prompt = `你是一个架空历史模拟游戏的AI。请根据本回合各国发生的历史事件及其发生顺序，撰写一段精彩的虚构历史叙述。

当前是第${round}回合（共${maxRounds}回合），时代为【${era.name}】。${roundContext}
叙述的语言风格应符合${era.name}的史书笔法（${era.style}）。

各国数值变化（原始→事件后）：${countryStatus}

${doomHint}

玩家国家"${playerCountry}"按先后顺序发生的事件：
${playerEventText}

其他国家发生的事件：
${aiEventText}

要求：
1. 撰写一段400-1000字的历史故事
2. 必须严格按照事件的先后顺序来叙述，先发生的事先写，体现出事件之间的因果链条
3. 如果某个国家在本回合灭亡，则根据发生事件描写该国灭亡的原因和过程，需强调该国灭亡
4. 对某个国家可适当涉及与其他国家的互动，但主体仍是这个国家的内部事件
5. 每个国家的故事单独分段，换行隔开；每段直接进行叙述，不要出现例如“（国家名）：（叙述）”的写法
6. 语言为通俗易懂的白话史书体，避免完全的文言文，但不失文学性
7. 根据事件顺序的合理性和连贯性，额外调整各国的科技/文化/金融值（在-4到+5之间）
8. 事件前后衔接越顺畅，正面加成越大；如果顺序明显矛盾则适当负面调整
9. 如果某个国家在本回合灭亡，其他国家根据其影响程度进行适当正面或负面调整
10. 如果某个国家已灭亡，其调整值应为0
11. 对玩家国家"${playerCountry}"适当减小正面加成但不增大负面调整
12. 第${maxRounds - 2}回合开始显著增强调整幅度，使游戏尽快进入结局
13. 叙述严格避免直接出现数值调整的说法或精确数值，也不要直接出现在某一回合的说法

请严格按照以下JSON格式返回：
{
  "historyText": "虚构历史故事...",
  "adjustments": {
    "每个存活国家名": { "tech": 数字, "culture": 数字, "finance": 数字 }
  },
  "summary": "一句话概括本回合（30字以内）"
}`;

    return this._call({
      prompt, round, countries, playerCountry, playerEvents, aiEvents, previousHistory, maxRounds
    });
  },

  /**
   * 生成游戏结局叙述（灭亡记录或盛世大发展）
   */
  async generateEnding(endResult, worldHistory, maxRounds) {
    const countryName = endResult.country?.name || '';
    const reason = endResult.reason || '';
    const endType = endResult.type || '';

    const historySummary = worldHistory.map(h =>
      `[第${h.round}回合] ${h.summary}`
    ).join('\n');

    // 根据结局类型判断：胜利/ai_victory → 大发展，death/final_scoring失败 → 灭亡记录
    const isRise = endType === 'victory' || endType === 'ai_victory' || endType === 'last_standing';

    const topic = isRise
      ? `${countryName}以${reason}，请撰写一段"盛世大发展"的历史叙述，描述该国如何登峰造极、开创辉煌时代。`
      : `${countryName}因${reason}，请撰写一段"灭亡记录"的历史叙述，描述该国覆灭的详细过程和原因。`;

    const prompt = `你是一个架空历史模拟游戏的AI。游戏已经结束，请为这局游戏撰写一段最终的结局篇章。

游戏共进行了${worldHistory.length}回合（上限${maxRounds}回合）。

${topic}

世界历史概要：
${historySummary}

要求：
1. 撰写一段300-500字的结局叙述
2. 如果是胜利结局，描述该国发展的巅峰成就与辉煌景象，并适当延申后续发展，但必须基于已有历史合理推断
3. 如果是灭亡结局，详细描写该国崩溃的历程与教训
4. 结局叙述严格参考之前的历史
5. 语言通俗易懂，有史诗感和宿命感，适当总结历史规律
6. 不要直接出现在某一回合的说法

请严格按照以下JSON格式返回：
{
  "endingText": "结局叙述..."
}`;

    return this._call({ prompt });
  }
};
