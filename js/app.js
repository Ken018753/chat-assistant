/**
 * 高情商聊天助手 — 应用交互逻辑
 */
(function () {
  'use strict';

  // ========== DOM ==========
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ========== 状态 ==========
  let state = {
    relationship: 'colleague',
    style: 'formal',
    history: [],
  };

  // ========== 初始化 ==========
  function init() {
    loadHistory();
    renderRelationships();
    renderStyles();
    bindEvents();
    renderHistory();
  }

  // ========== 渲染关系标签 ==========
  function renderRelationships() {
    const wrap = $('#relationship-tags');
    wrap.innerHTML = '';
    for (const [key, val] of Object.entries(ChatEngine.RELATIONSHIPS)) {
      const tag = document.createElement('button');
      tag.className = 'tag' + (key === state.relationship ? ' active' : '');
      tag.dataset.key = key;
      tag.innerHTML = `<span class="tag-icon">${val.icon}</span><span>${val.label}</span>`;
      tag.addEventListener('click', () => {
        state.relationship = key;
        $$('#relationship-tags .tag').forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
      });
      wrap.appendChild(tag);
    }
  }

  // ========== 渲染风格标签 ==========
  function renderStyles() {
    const wrap = $('#style-tags');
    wrap.innerHTML = '';
    for (const [key, val] of Object.entries(ChatEngine.STYLES)) {
      const tag = document.createElement('button');
      tag.className = 'tag style-tag' + (key === state.style ? ' active' : '');
      tag.dataset.key = key;
      tag.innerHTML = `<span class="tag-icon">${val.icon}</span><span>${val.label}</span>`;
      tag.addEventListener('click', () => {
        state.style = key;
        $$('#style-tags .tag').forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
      });
      wrap.appendChild(tag);
    }
  }

  // ========== 生成回复 ==========
  function generateReply() {
    const chatContext = $('#chat-context').value.trim();
    const purpose = $('#purpose').value.trim();

    if (!purpose) {
      showToast('请先输入聊天目的');
      $('#purpose').focus();
      return;
    }

    // 显示 loading
    $('#generate-btn').classList.add('loading');
    $('#generate-btn').disabled = true;

    setTimeout(() => {
      const result = ChatEngine.generate({
        chatContext,
        purpose,
        relationship: state.relationship,
        style: state.style,
      });

      renderResults(result);
      $('#generate-btn').classList.remove('loading');
      $('#generate-btn').disabled = false;
    }, 400);
  }

  // ========== 渲染结果 ==========
  function renderResults(data) {
    const panel = $('#result-panel');
    const labels = ['方案一', '方案二', '方案三'];
    const hints = ['直接可用', '换个角度', '折中方案'];

    let html = '';

    // 场景 & 情感标签
    html += '<div class="result-meta">';
    const scenarioNames = {
      decline:'拒绝', gratitude:'感谢', apology:'道歉', leave:'请假', report:'汇报',
      followup:'催促', invitation:'邀约', greeting:'祝福', agreement:'同意',
      negotiation:'协商', comfort:'安慰', confession:'表白', general:'通用'
    };
    const sentimentMap = { positive:'积极', neutral:'中性', negative:'负面' };
    const sentimentColor = { positive:'#16a34a', neutral:'#6b7280', negative:'#dc2626' };
    html += `<span class="meta-badge">${scenarioNames[data.scenario] || '通用'}</span>`;
    if (data.sentiment !== 'neutral') {
      html += `<span class="meta-badge" style="color:${sentimentColor[data.sentiment]};border-color:${sentimentColor[data.sentiment]}">${sentimentMap[data.sentiment]}</span>`;
    }
    html += '</div>';

    // 三个方案
    data.results.forEach((text, i) => {
      html += `
        <div class="result-card" data-index="${i}">
          <div class="result-card-header">
            <span class="result-label">${labels[i]}</span>
            <span class="result-hint">${hints[i]}</span>
          </div>
          <div class="result-text">${escapeHtml(text)}</div>
          <div class="result-actions">
            <button class="btn-copy" data-text="${escapeAttr(text)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              复制
            </button>
            <button class="btn-save" data-text="${escapeAttr(text)}" data-purpose="${escapeAttr($('#purpose').value)}" data-rel="${state.relationship}" data-sty="${state.style}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
              保存
            </button>
          </div>
        </div>
      `;
    });

    // 贴士
    if (data.tips && data.tips.length) {
      html += '<div class="tips-section">';
      data.tips.forEach(t => { html += `<div class="tip-item">${t}</div>`; });
      html += '</div>';
    }

    panel.innerHTML = html;
    panel.classList.add('show');

    // 绑定复制 & 保存
    panel.querySelectorAll('.btn-copy').forEach(btn => {
      btn.addEventListener('click', () => copyToClipboard(btn.dataset.text, btn));
    });
    panel.querySelectorAll('.btn-save').forEach(btn => {
      btn.addEventListener('click', () => saveToHistory(btn.dataset));
    });

    // 滚动到结果
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ========== 复制到剪贴板 ==========
  function copyToClipboard(text, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showCopySuccess(btn);
      }).catch(() => {
        fallbackCopy(text, btn);
      });
    } else {
      fallbackCopy(text, btn);
    }
  }

  function fallbackCopy(text, btn) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showCopySuccess(btn); }
    catch (e) { showToast('复制失败，请手动复制'); }
    document.body.removeChild(ta);
  }

  function showCopySuccess(btn) {
    const original = btn.innerHTML;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> 已复制';
    btn.classList.add('copied');
    showToast('已复制到剪贴板');
    setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove('copied');
    }, 2000);
  }

  // ========== 历史记录 ==========
  function loadHistory() {
    try {
      const raw = localStorage.getItem('chat-assistant-history');
      state.history = raw ? JSON.parse(raw) : [];
    } catch { state.history = []; }
  }

  function saveToHistory(dataset) {
    const item = {
      id: Date.now(),
      text: dataset.text,
      purpose: dataset.purpose,
      relationship: dataset.rel,
      style: dataset.sty,
      time: new Date().toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }),
    };
    state.history.unshift(item);
    if (state.history.length > 50) state.history = state.history.slice(0, 50);
    persistHistory();
    renderHistory();
    showToast('已保存到历史记录');
  }

  function deleteHistory(id) {
    state.history = state.history.filter(h => h.id !== id);
    persistHistory();
    renderHistory();
    showToast('已删除');
  }

  function persistHistory() {
    localStorage.setItem('chat-assistant-history', JSON.stringify(state.history));
  }

  function renderHistory() {
    const panel = $('#history-list');
    if (!state.history.length) {
      panel.innerHTML = '<div class="empty-history">暂无历史记录<br><span>生成的优质回复保存后会显示在这里</span></div>';
      return;
    }
    const relMap = ChatEngine.RELATIONSHIPS;
    const styMap = ChatEngine.STYLES;
    panel.innerHTML = state.history.map(h => `
      <div class="history-item">
        <div class="history-meta">
          <span class="history-rel">${(relMap[h.relationship]||{}).icon||''} ${(relMap[h.relationship]||{}).label||''}</span>
          <span class="history-style">${(styMap[h.style]||{}).icon||''} ${(styMap[h.style]||{}).label||''}</span>
          <span class="history-time">${h.time}</span>
        </div>
        <div class="history-purpose">${escapeHtml(h.purpose)}</div>
        <div class="history-text">${escapeHtml(h.text).slice(0, 80)}${h.text.length > 80 ? '…' : ''}</div>
        <div class="history-actions">
          <button class="btn-mini btn-copy-mini" data-text="${escapeAttr(h.text)}">复制</button>
          <button class="btn-mini btn-reuse" data-id="${h.id}">复用</button>
          <button class="btn-mini btn-del" data-id="${h.id}">删除</button>
        </div>
      </div>
    `).join('');

    panel.querySelectorAll('.btn-copy-mini').forEach(btn => {
      btn.addEventListener('click', () => copyToClipboard(btn.dataset.text, btn));
    });
    panel.querySelectorAll('.btn-reuse').forEach(btn => {
      btn.addEventListener('click', () => reuseHistory(parseInt(btn.dataset.id)));
    });
    panel.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', () => deleteHistory(parseInt(btn.dataset.id)));
    });
  }

  function reuseHistory(id) {
    const item = state.history.find(h => h.id === id);
    if (!item) return;
    $('#purpose').value = item.purpose;
    state.relationship = item.relationship;
    state.style = item.style;
    renderRelationships();
    renderStyles();
    toggleHistoryPanel(false);
    showToast('已加载，点击生成即可使用');
    $('#purpose').scrollIntoView({ behavior:'smooth', block:'center' });
  }

  function toggleHistoryPanel(force) {
    const panel = $('#history-panel');
    const overlay = $('#overlay');
    if (force === false) {
      panel.classList.remove('open');
      overlay.classList.remove('show');
    } else if (force === true) {
      panel.classList.add('open');
      overlay.classList.add('show');
    } else {
      panel.classList.toggle('open');
      overlay.classList.toggle('show');
    }
  }

  // ========== Toast ==========
  let toastTimer;
  function showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
  }

  // ========== 工具 ==========
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
  function escapeAttr(s) {
    return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ========== 事件绑定 ==========
  function bindEvents() {
    $('#generate-btn').addEventListener('click', generateReply);
    $('#purpose').addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') generateReply();
    });
    $('#history-toggle').addEventListener('click', () => toggleHistoryPanel());
    $('#history-close').addEventListener('click', () => toggleHistoryPanel(false));
    $('#overlay').addEventListener('click', () => toggleHistoryPanel(false));
    $('#clear-history').addEventListener('click', () => {
      if (state.history.length === 0) { showToast('暂无历史记录'); return; }
      if (confirm('确定清空所有历史记录？')) {
        state.history = [];
        persistHistory();
        renderHistory();
        showToast('已清空');
      }
    });

    // 快捷场景按钮
    $$('.quick-scenario').forEach(btn => {
      btn.addEventListener('click', () => {
        $('#purpose').value = btn.dataset.purpose;
        $('#purpose').focus();
      });
    });
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
