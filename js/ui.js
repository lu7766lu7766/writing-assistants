import { ESSAY_TYPES } from './prompt.js';
import { countValidChars } from './text.js';

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function gradeClass(grade) {
  switch (grade) {
    case 'A+':
      return 'grade-aplus';
    case 'A':
      return 'grade-a';
    case 'B+':
      return 'grade-bplus';
    case 'B':
      return 'grade-b';
    default:
      return 'grade-c';
  }
}

let toastTimer = null;

export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  container.innerHTML = `
    <div class="toast toast-${escapeHtml(type)}" role="status" aria-live="polite">
      <span class="toast-text">${escapeHtml(message)}</span>
      <button type="button" class="toast-close" aria-label="關閉通知">&times;</button>
    </div>
  `;

  const closeBtn = container.querySelector('.toast-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      container.innerHTML = '';
    });
  }

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    container.innerHTML = '';
  }, duration);
}

/**
 * 自訂確認對話框（不使用原生 alert / confirm）
 */
export function showConfirmModal({ title, message, confirmText = '確定', cancelText = '取消', danger = false }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    if (!modal) {
      resolve(true);
      return;
    }

    const titleEl = modal.querySelector('#modal-title');
    const msgEl = modal.querySelector('#modal-message');
    const confirmBtn = modal.querySelector('#modal-confirm-btn');
    const cancelBtn = modal.querySelector('#modal-cancel-btn');

    titleEl.textContent = title || '請確認';
    msgEl.textContent = message || '';
    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    confirmBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

    modal.hidden = false;
    confirmBtn.focus();

    const cleanup = (answer) => {
      modal.hidden = true;
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      resolve(answer);
    };

    const onConfirm = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e) => {
      if (e.target === modal) cleanup(false);
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
  });
}

export function renderResultView(record) {
  const container = document.getElementById('result-content');
  if (!container || !record || !record.result) return;

  const { result } = record;
  const typeLabel = ESSAY_TYPES[record.type]?.label || '自由練習';
  const charCount = countValidChars(record.content);
  const dateStr = new Date(record.createdAt || Date.now()).toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const dimsHtml = (result.dimensions || [])
    .map((d) => {
      const pct = Math.max(0, Math.min(100, Math.round((d.score / 25) * 100)));
      return `
        <div class="dim-item">
          <div class="dim-header">
            <span class="dim-name">${escapeHtml(d.name)}</span>
            <span class="dim-score"><strong>${d.score}</strong> / 25</span>
          </div>
          <div class="dim-bar-track" role="progressbar" aria-valuenow="${d.score}" aria-valuemin="0" aria-valuemax="25">
            <div class="dim-bar-fill" style="width: ${pct}%"></div>
          </div>
          <p class="dim-comment">${escapeHtml(d.comment)}</p>
        </div>
      `;
    })
    .join('');

  const strengthsHtml = (result.strengths || []).length
    ? `<ul class="list-check">${result.strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>`
    : `<p class="muted-text">無特別標註之優點項目。</p>`;

  const improvementsHtml = (result.improvements || []).length
    ? `<div class="improvement-list">
        ${result.improvements
          .map(
            (imp, idx) => `
          <div class="improvement-item">
            <div class="imp-title"><span class="imp-num">${idx + 1}</span> ${escapeHtml(imp.issue)}</div>
            <p class="imp-suggestion"><strong>修改方向：</strong>${escapeHtml(imp.suggestion)}</p>
            ${
              imp.example
                ? `<div class="imp-example"><strong>示範句：</strong>${escapeHtml(imp.example)}</div>`
                : ''
            }
          </div>
        `
          )
          .join('')}
      </div>`
    : `<p class="muted-text">目前無特定待改進項目。</p>`;

  const correctionsHtml = (result.corrections || []).length
    ? `<div class="table-wrap">
        <table class="corrections-table">
          <thead>
            <tr>
              <th>類別</th>
              <th>原文片段</th>
              <th>建議修正</th>
              <th>說明</th>
            </tr>
          </thead>
          <tbody>
            ${result.corrections
              .map(
                (c) => `
              <tr>
                <td>
                  <span class="tag tag-type">${escapeHtml(c.type)}</span>
                  ${
                    c.verified === false
                      ? `<span class="tag tag-unverified" title="此句未完全逐字匹配原文，僅供參考">參考</span>`
                      : ''
                  }
                </td>
                <td class="cell-orig">${escapeHtml(c.original)}</td>
                <td class="cell-corr">${escapeHtml(c.corrected)}</td>
                <td class="cell-exp">${escapeHtml(c.explanation)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>`
    : `<p class="empty-hint">未發現明顯錯別字、標點誤用或語病。</p>`;

  const rewrite = result.rewrite || {};
  const rewriteHtml = rewrite.rewritten
    ? `<div class="rewrite-grid">
        <div class="rewrite-box rewrite-orig">
          <div class="rewrite-label">
            原文段落
            ${rewrite.verified === false ? '<span class="tag tag-unverified">參考節錄</span>' : ''}
          </div>
          <p class="serif-text">${escapeHtml(rewrite.originalParagraph)}</p>
        </div>
        <div class="rewrite-box rewrite-new">
          <div class="rewrite-label">升等改寫示範</div>
          <p class="serif-text">${escapeHtml(rewrite.rewritten)}</p>
        </div>
      </div>
      ${
        rewrite.rationale
          ? `<div class="rewrite-rationale"><strong>改寫解析：</strong>${escapeHtml(rewrite.rationale)}</div>`
          : ''
      }`
    : `<p class="muted-text">無段落改寫示範。</p>`;

  const nextStepsHtml = (result.nextSteps || []).length
    ? `<ol class="list-numbered">${result.nextSteps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`
    : `<p class="muted-text">無下一步練習建議。</p>`;

  container.innerHTML = `
    <div class="card score-hero-card">
      <div class="score-hero-meta">
        <span class="badge-type">${escapeHtml(typeLabel)}</span>
        <span class="meta-dot">·</span>
        <span>${charCount} 字</span>
        <span class="meta-dot">·</span>
        <span>${escapeHtml(dateStr)}</span>
        ${record.model ? `<span class="meta-dot">·</span><span class="meta-model">${escapeHtml(record.model)}</span>` : ''}
      </div>
      ${record.title ? `<h2 class="result-essay-title">${escapeHtml(record.title)}</h2>` : ''}
      <div class="score-hero-main">
        <div class="score-number-block">
          <span class="score-big">${result.total}</span>
          <span class="score-denom">/ 100</span>
        </div>
        <div class="grade-badge ${gradeClass(result.grade)}" aria-label="等第 ${escapeHtml(result.grade)}">
          <span class="grade-label">等第</span>
          <span class="grade-value">${escapeHtml(result.grade)}</span>
        </div>
      </div>
      <p class="score-disclaimer">※ 等第與分數為 AI 依學測國寫四大原則估算之練習基準，僅供自主練習參考。</p>
    </div>

    <section class="card">
      <h3 class="card-title">四面向得分分析</h3>
      <div class="dimensions-grid">
        ${dimsHtml}
      </div>
    </section>

    <section class="card">
      <h3 class="card-title">整體總評</h3>
      <p class="summary-text serif-text">${escapeHtml(result.summary)}</p>
    </section>

    <section class="card">
      <h3 class="card-title">文章亮點與優點</h3>
      ${strengthsHtml}
    </section>

    <section class="card">
      <h3 class="card-title">待改進與具體建議</h3>
      ${improvementsHtml}
    </section>

    <section class="card">
      <h3 class="card-title">逐句錯別字・標點・用詞批改</h3>
      ${correctionsHtml}
    </section>

    <section class="card">
      <h3 class="card-title">段落改寫示範</h3>
      ${rewriteHtml}
    </section>

    <section class="card">
      <h3 class="card-title">下一步寫作練習建議</h3>
      ${nextStepsHtml}
    </section>

    <details class="card original-essay-details">
      <summary class="card-title summary-clickable">檢視學生作文原文（${charCount} 字）</summary>
      <div class="original-essay-body serif-text">${escapeHtml(record.content)}</div>
    </details>
  `;
}

export function renderHistoryView(records, { onSelect, onRegrade, onDelete }) {
  const listEl = document.getElementById('history-list');
  const trendCard = document.getElementById('history-trend-card');
  const trendChart = document.getElementById('history-trend-chart');
  const clearAllBtn = document.getElementById('clear-history-btn');

  if (!listEl) return;

  if (!records || records.length === 0) {
    if (trendCard) trendCard.hidden = true;
    if (clearAllBtn) clearAllBtn.disabled = true;
    listEl.innerHTML = `
      <div class="card empty-state-card">
        <p class="empty-state-title">尚無批改歷史紀錄</p>
        <p class="muted-text">完成作文評分後，紀錄會自動儲存在這台裝置的瀏覽器中，離線也能隨時回顧。</p>
      </div>
    `;
    return;
  }

  if (clearAllBtn) clearAllBtn.disabled = false;

  // Render trend of up to last 10 records (chronological left to right)
  const recent10 = records.slice(0, 10).reverse();
  if (trendCard && trendChart) {
    trendCard.hidden = false;
    trendChart.innerHTML = recent10
      .map((rec, idx) => {
        const total = rec.result?.total ?? 0;
        const grade = rec.result?.grade ?? 'C';
        const dateShort = new Date(rec.createdAt).toLocaleDateString('zh-TW', {
          month: 'numeric',
          day: 'numeric'
        });
        return `
          <div class="trend-col" title="${escapeHtml(rec.title || '無題目')} (${total}分)">
            <span class="trend-score">${total}</span>
            <div class="trend-bar-wrap">
              <div class="trend-bar ${gradeClass(grade)}" style="height: ${Math.max(8, total)}%"></div>
            </div>
            <span class="trend-date">${escapeHtml(dateShort)}</span>
          </div>
        `;
      })
      .join('');
  }

  listEl.innerHTML = records
    .map((rec) => {
      const typeLabel = ESSAY_TYPES[rec.type]?.label || '自由練習';
      const title = rec.title?.trim() || '（未填題目）';
      const snippet = (rec.content || '').trim().replace(/\s+/g, ' ').slice(0, 65);
      const dateStr = new Date(rec.createdAt).toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const total = rec.result?.total ?? '--';
      const grade = rec.result?.grade ?? 'C';

      return `
        <article class="card history-item" data-id="${escapeHtml(rec.id)}">
          <div class="history-item-main" data-action="view" tabindex="0" role="button" aria-label="檢視 ${escapeHtml(title)} 評分結果">
            <div class="history-item-info">
              <div class="history-meta">
                <span class="badge-type">${escapeHtml(typeLabel)}</span>
                <span class="history-date">${escapeHtml(dateStr)}</span>
              </div>
              <h4 class="history-title">${escapeHtml(title)}</h4>
              <p class="history-snippet serif-text">${escapeHtml(snippet)}${rec.content?.length > 65 ? '…' : ''}</p>
            </div>
            <div class="history-score-box">
              <span class="history-total">${total}</span>
              <span class="grade-pill ${gradeClass(grade)}">${escapeHtml(grade)}</span>
            </div>
          </div>
          <div class="history-item-actions">
            <button type="button" class="btn btn-sm btn-outline" data-action="view">查看結果</button>
            <button type="button" class="btn btn-sm btn-outline" data-action="regrade">重新評分</button>
            <button type="button" class="btn btn-sm btn-ghost-danger" data-action="delete">刪除</button>
          </div>
        </article>
      `;
    })
    .join('');

  listEl.querySelectorAll('.history-item').forEach((itemEl) => {
    const id = itemEl.getAttribute('data-id');
    const record = records.find((r) => r.id === id);
    if (!record) return;

    itemEl.querySelectorAll('[data-action="view"]').forEach((el) => {
      el.addEventListener('click', () => onSelect(record));
      if (el.getAttribute('role') === 'button') {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(record);
          }
        });
      }
    });

    const regradeBtn = itemEl.querySelector('[data-action="regrade"]');
    if (regradeBtn) {
      regradeBtn.addEventListener('click', () => onRegrade(record));
    }

    const delBtn = itemEl.querySelector('[data-action="delete"]');
    if (delBtn) {
      delBtn.addEventListener('click', () => onDelete(record));
    }
  });
}

export function populateModelSelect(selectEl, currentModel, detectedModels = []) {
  if (!selectEl) return;

  const builtInModels = [
    { id: 'gemini-3.5-flash-lite', displayName: 'gemini-3.5-flash-lite（預設・極速省額度）', isLite: true },
    { id: 'gemini-2.5-flash-lite', displayName: 'gemini-2.5-flash-lite（輕量快速）', isLite: true },
    { id: 'gemini-2.5-flash', displayName: 'gemini-2.5-flash（均衡推薦）', isLite: false },
    { id: 'gemini-2.0-flash-lite', displayName: 'gemini-2.0-flash-lite（輕量備用）', isLite: true },
    { id: 'gemini-2.0-flash', displayName: 'gemini-2.0-flash（穩定備用）', isLite: false }
  ];

  const mergedMap = new Map();
  for (const m of builtInModels) {
    mergedMap.set(m.id, m);
  }
  for (const m of detectedModels) {
    const tag = m.isLite ? ' [Lite 輕量]' : '';
    mergedMap.set(m.id, {
      id: m.id,
      displayName: `${m.id}${tag}`,
      isLite: m.isLite
    });
  }

  if (currentModel && !mergedMap.has(currentModel)) {
    mergedMap.set(currentModel, {
      id: currentModel,
      displayName: `${currentModel}（自訂）`,
      isLite: currentModel.includes('lite')
    });
  }

  selectEl.innerHTML = Array.from(mergedMap.values())
    .map(
      (m) =>
        `<option value="${escapeHtml(m.id)}" ${m.id === currentModel ? 'selected' : ''}>${escapeHtml(
          m.displayName
        )}</option>`
    )
    .join('');
}
