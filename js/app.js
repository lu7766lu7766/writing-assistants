import {
  loadSettings,
  saveSettings,
  loadDraft,
  saveDraft,
  clearDraft,
  makeEssayCacheKey,
  getCachedResult,
  setCachedResult,
  addHistoryRecord,
  listHistoryRecords,
  deleteHistoryRecord,
  clearHistoryRecords,
  clearAllLocalData,
  DEFAULT_SETTINGS
} from './storage.js';
import {
  MIN_CHARS,
  MAX_CHARS,
  countValidChars,
  countParagraphs,
  truncateToMaxChars,
  formatTimerSeconds,
  ExamTimer
} from './text.js';
import { gradeEssayWithGemini, fetchAvailableModels } from './gemini.js';
import {
  showToast,
  showConfirmModal,
  renderResultView,
  renderHistoryView,
  populateModelSelect
} from './ui.js';
import { copyReportToClipboard, downloadReportAsTxt } from './export.js';

const VIEWS = ['input', 'result', 'history', 'settings'];

const SAMPLE_ESSAYS = {
  intellectual: {
    type: 'intellectual',
    title: '數位時代的資訊素養與獨立思考',
    promptText:
      '現代人每天接收海量推播訊息，演算法往往投其所好，形成「同溫層效應」。請針對此現象分析其利弊，並提出個人應如何培養獨立思考的能力。',
    content: `在演算法主宰閱讀視野的時代，我們打開手機所看見的世界，往往不是真實世界的全貌，而是投射個人偏好的鏡像。大數據精準捕捉每一次停留與點擊，將相似的觀點源源不絕地推送到眼前。這種機制固然提升了資訊檢索的效率，卻也在無形中築起高聳的「同溫層」高牆。

同溫層效應最顯著的危機，在於消弭了異質對話的可能。當人們長期浸淫於立場單一的言論環境，容易產生「多數人皆與我同見」的錯覺，進而將不同意見視為偏激或無知。近年來網路社群上的公共議題討論，往往迅速流於情緒化的貼標籤與二元對立，正是因為演算法強化了確認偏誤，削弱了社會成員彼此理解的耐心。

然而，我們不必因此將科技視為洪水猛獸。演算法本身並無善惡，關鍵在於使用者是否具備足夠的資訊素養。要突破同溫層的桎梏，首先必須建立「查證與溯源」的習慣，面對聳動標題時先懸置判斷，檢視消息來源與證據效力。其次，應主動跨出舒適圈，刻意閱讀不同立場的媒體與專欄，練習站在反方角度推演其論證邏輯。

真正的獨立思考，並非標新立異或全盤否定他人，而是在眾聲喧嘩之中保持清醒的省察。唯有當我們學會駕馭資訊而非被演算法馴化，數位工具才能真正成為拓展視野的橋樑，而非禁錮心智的牢籠。`
  },
  expressive: {
    type: 'expressive',
    title: '季節的氣味',
    promptText: '氣味往往承載著獨特的記憶與情感。請以「季節的氣味」為題，描寫一段令你印象深刻的生命經驗與體悟。',
    content: `外婆家的三合院總是比日曆更早預告夏天的來臨。每年六月梅雨初歇，當第一道熾熱的陽光穿透竹林，空氣裡便浮動著一股混合了青草曝曬與樟木蒸騰的微苦香氣。對年少的我而言，那便是盛夏最鮮明的印記。

午後的埕場燙得像一面剛出爐的鐵板，外婆卻總愛在這時搬出竹篩，將洗淨切條的高麗菜與蘿蔔鋪展開來。我蹲在屋簷下的陰影裡，看著她布滿皺紋的手掌熟練地翻動菜葉，粗鹽揉進蔬菜纖維後滲出的水分，在烈日烘烤下化為一股溫厚而略帶鹹酸的氣息。風一吹過，竹篩邊緣的乾葉沙沙作響，那股樸實的菜乾香便順著穿堂風漫進廳堂，沾染在我的衣袖與髮梢。

升上高中後，課業的繁重讓我鮮少再回鄉下度暑。某個晚自習結束的雨夜，我走過街角老舊的雜貨鋪，木桶裡陳年菜脯的氣味冷不防鑽入鼻腔。那一瞬間，潮濕悶熱的台北街頭彷彿在眼前退去，取而代之的是三合院裡晃動的竹影，以及外婆遞來一碗冰涼綠豆湯時眼角的笑紋。

原來氣味是時間最忠實的琥珀。即使季節更迭、人世流轉，只要那一縷熟悉的氣息再次浮現，那些曾被歲月塵封的溫柔與牽掛，便會在記憶深處重新甦醒，成為支撐我前行的暖流。`
  }
};

let currentView = 'input';
let currentRecord = null;
let activeAbortController = null;
let cooldownTimerId = null;

function switchView(viewName) {
  if (!VIEWS.includes(viewName)) return;
  currentView = viewName;

  VIEWS.forEach((v) => {
    const section = document.getElementById(`view-${v}`);
    if (section) {
      section.hidden = v !== viewName;
    }
    const navBtn = document.querySelector(`[data-nav="${v}"]`);
    if (navBtn) {
      navBtn.classList.toggle('active', v === viewName);
      navBtn.setAttribute('aria-current', v === viewName ? 'page' : 'false');
    }
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStatsUI() {
  const textarea = document.getElementById('essay-content');
  const charCountEl = document.getElementById('char-count');
  const paraCountEl = document.getElementById('para-count');
  const lengthHintEl = document.getElementById('length-hint');
  const submitBtn = document.getElementById('grade-submit-btn');

  if (!textarea) return;

  const rawText = textarea.value;
  const check = truncateToMaxChars(rawText, MAX_CHARS);
  if (check.truncated) {
    textarea.value = check.text;
    showToast(`字數超過 ${MAX_CHARS} 字上限，已自動截斷超出的部分`, 'warning');
  }

  const chars = check.count;
  const paras = countParagraphs(textarea.value);

  if (charCountEl) charCountEl.textContent = String(chars);
  if (paraCountEl) paraCountEl.textContent = String(paras);

  if (lengthHintEl) {
    if (chars === 0) {
      lengthHintEl.textContent = `建議字數 ${MIN_CHARS}–${MAX_CHARS} 字（不含標點與空白）`;
      lengthHintEl.className = 'length-hint';
    } else if (chars < MIN_CHARS) {
      lengthHintEl.textContent = `目前僅 ${chars} 字，還差 ${MIN_CHARS - chars} 字才達最低評分門檻（${MIN_CHARS} 字）`;
      lengthHintEl.className = 'length-hint hint-warn';
    } else if (chars >= MAX_CHARS) {
      lengthHintEl.textContent = `已達 ${MAX_CHARS} 字上限`;
      lengthHintEl.className = 'length-hint hint-warn';
    } else {
      lengthHintEl.textContent = `字數符合評分範圍（${MIN_CHARS}–${MAX_CHARS} 字）`;
      lengthHintEl.className = 'length-hint hint-ok';
    }
  }

  if (submitBtn && !submitBtn.hasAttribute('data-cooldown')) {
    submitBtn.disabled = chars < MIN_CHARS;
  }
}

function getSelectedEssayType() {
  const checked = document.querySelector('input[name="essay-type"]:checked');
  return checked ? checked.value : 'intellectual';
}

function setSelectedEssayType(type) {
  const radio = document.querySelector(`input[name="essay-type"][value="${type}"]`);
  if (radio) radio.checked = true;
}

function persistDraftFromInputs() {
  const type = getSelectedEssayType();
  const title = document.getElementById('essay-title')?.value || '';
  const promptText = document.getElementById('essay-prompt')?.value || '';
  const content = document.getElementById('essay-content')?.value || '';
  saveDraft({ type, title, promptText, content });
}

function restoreDraftToInputs() {
  const draft = loadDraft();
  setSelectedEssayType(draft.type || 'intellectual');
  const titleEl = document.getElementById('essay-title');
  const promptEl = document.getElementById('essay-prompt');
  const contentEl = document.getElementById('essay-content');

  if (titleEl) titleEl.value = draft.title || '';
  if (promptEl) promptEl.value = draft.promptText || '';
  if (contentEl) contentEl.value = draft.content || '';
  updateStatsUI();
}

function syncSettingsToForm() {
  const settings = loadSettings();
  const keyInput = document.getElementById('settings-api-key');
  const modelSelect = document.getElementById('settings-model');
  const tempInput = document.getElementById('settings-temperature');
  const tempValue = document.getElementById('settings-temp-value');
  const saveHistoryCheckbox = document.getElementById('settings-save-history');
  const privacyBanner = document.getElementById('privacy-banner');

  if (keyInput) keyInput.value = settings.apiKey || '';
  populateModelSelect(modelSelect, settings.model, settings.availableModels || []);

  if (tempInput) tempInput.value = String(settings.temperature ?? 0.4);
  if (tempValue) tempValue.textContent = Number(settings.temperature ?? 0.4).toFixed(1);
  if (saveHistoryCheckbox) saveHistoryCheckbox.checked = settings.saveHistory !== false;

  if (privacyBanner) {
    privacyBanner.hidden = Boolean(settings.privacyNoticeDismissed);
  }
}

async function refreshHistoryUI() {
  const records = await listHistoryRecords();
  const countBadge = document.getElementById('history-count-badge');
  if (countBadge) {
    countBadge.textContent = records.length > 0 ? String(records.length) : '';
    countBadge.hidden = records.length === 0;
  }

  renderHistoryView(records, {
    onSelect: (record) => {
      currentRecord = record;
      renderResultView(record);
      switchView('result');
    },
    onRegrade: async (record) => {
      setSelectedEssayType(record.type || 'intellectual');
      const titleEl = document.getElementById('essay-title');
      const promptEl = document.getElementById('essay-prompt');
      const contentEl = document.getElementById('essay-content');
      if (titleEl) titleEl.value = record.title || '';
      if (promptEl) promptEl.value = record.promptText || '';
      if (contentEl) contentEl.value = record.content || '';
      persistDraftFromInputs();
      updateStatsUI();
      switchView('input');
      await startGrading({ forceRegrade: true });
    },
    onDelete: async (record) => {
      const ok = await showConfirmModal({
        title: '刪除單筆紀錄',
        message: `確定要刪除「${record.title || '未填題目'}」的批改紀錄嗎？`,
        confirmText: '刪除',
        danger: true
      });
      if (!ok) return;
      await deleteHistoryRecord(record.id);
      await refreshHistoryUI();
      showToast('已刪除該筆歷史紀錄', 'info');
    }
  });
}

function setLoadingState(isLoading) {
  const loadingOverlay = document.getElementById('loading-panel');
  const inputFormCard = document.getElementById('input-form-card');
  if (loadingOverlay) loadingOverlay.hidden = !isLoading;
  if (inputFormCard) inputFormCard.hidden = isLoading;
}

function startRateLimitCooldown(seconds) {
  const submitBtn = document.getElementById('grade-submit-btn');
  if (!submitBtn) return;

  if (cooldownTimerId) clearInterval(cooldownTimerId);
  let remaining = seconds;
  submitBtn.setAttribute('data-cooldown', '1');
  submitBtn.disabled = true;
  const origText = '開始評分';

  const tick = () => {
    if (remaining <= 0) {
      clearInterval(cooldownTimerId);
      cooldownTimerId = null;
      submitBtn.removeAttribute('data-cooldown');
      submitBtn.textContent = origText;
      updateStatsUI();
      return;
    }
    submitBtn.textContent = `請稍候 (${remaining}s)`;
    remaining--;
  };
  tick();
  cooldownTimerId = setInterval(tick, 1000);
}

async function handleModel404Fallback(apiKey) {
  switchView('settings');
  const statusEl = document.getElementById('model-detect-status');
  if (statusEl) {
    statusEl.textContent = '預設模型無法使用，正在自動為您偵測可用模型…';
    statusEl.className = 'field-hint hint-warn';
  }

  try {
    const models = await fetchAvailableModels(apiKey);
    if (models.length > 0) {
      const preferred = models[0].id;
      const updated = saveSettings({
        availableModels: models,
        model: preferred
      });
      syncSettingsToForm();
      if (statusEl) {
        statusEl.textContent = `已偵測到 ${models.length} 個可用模型，並自動切換為「${updated.model}」，請確認後再按評分。`;
        statusEl.className = 'field-hint hint-ok';
      }
      showToast(`已自動切換可用模型：${updated.model}`, 'info', 4500);
    } else if (statusEl) {
      statusEl.textContent = '此 API Key 未偵測到任何支援 generateContent 的 Gemini 模型。';
    }
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = err.message || '自動偵測模型失敗，請檢查 API Key。';
    }
  }
}

async function startGrading({ forceRegrade = false } = {}) {
  if (!navigator.onLine) {
    showToast('目前處於離線狀態，無法呼叫 AI 評分，但仍可查看歷史紀錄', 'warning');
    return;
  }

  const type = getSelectedEssayType();
  const title = (document.getElementById('essay-title')?.value || '').trim();
  const promptText = (document.getElementById('essay-prompt')?.value || '').trim();
  const contentEl = document.getElementById('essay-content');
  const rawContent = contentEl?.value || '';

  const truncatedCheck = truncateToMaxChars(rawContent, MAX_CHARS);
  if (truncatedCheck.truncated && contentEl) {
    contentEl.value = truncatedCheck.text;
    updateStatsUI();
  }

  const content = (contentEl?.value || '').trim();
  const validChars = countValidChars(content);

  if (validChars < MIN_CHARS) {
    showToast(`作文至少需要 ${MIN_CHARS} 個中文字（目前 ${validChars} 字）`, 'warning');
    contentEl?.focus();
    return;
  }

  const settings = loadSettings();
  if (!settings.apiKey || !settings.apiKey.trim()) {
    showToast('請先在設定頁輸入您的 Gemini API Key', 'warning');
    switchView('settings');
    document.getElementById('settings-api-key')?.focus();
    return;
  }

  const essayData = { type, title, promptText, content };
  const cacheKey = makeEssayCacheKey({ ...essayData, model: settings.model });

  if (!forceRegrade) {
    const cached = getCachedResult(cacheKey);
    if (cached) {
      currentRecord = cached;
      renderResultView(cached);
      switchView('result');
      showToast('已載入同一篇作文的快取評分（如需重評可點「重新評分」）', 'info');
      return;
    }
  }

  activeAbortController = new AbortController();
  setLoadingState(true);

  try {
    const scoreResult = await gradeEssayWithGemini({
      apiKey: settings.apiKey,
      model: settings.model,
      temperature: settings.temperature,
      essayData,
      signal: activeAbortController.signal
    });

    const record = {
      id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      type,
      title,
      promptText,
      content,
      model: settings.model,
      result: scoreResult
    };

    setCachedResult(cacheKey, record);

    if (settings.saveHistory !== false) {
      await addHistoryRecord(record);
      await refreshHistoryUI();
    }

    currentRecord = record;
    renderResultView(record);
    setLoadingState(false);
    switchView('result');
    showToast('評分完成！', 'success');
  } catch (err) {
    setLoadingState(false);
    if (err?.code === 'ABORTED') {
      showToast('已取消評分', 'info');
      return;
    }
    showToast(err?.message || '評分發生錯誤，請稍後再試', 'error', 5000);

    if (err?.code === 'NO_API_KEY' || err?.code === 'API_KEY_INVALID') {
      switchView('settings');
      document.getElementById('settings-api-key')?.focus();
    } else if (err?.isModelNotFound || err?.status === 404) {
      await handleModel404Fallback(settings.apiKey);
    } else if (err?.status === 429) {
      startRateLimitCooldown(err.retryAfterSec || 30);
    }
  } finally {
    activeAbortController = null;
  }
}

function initTimerUI() {
  const displayEl = document.getElementById('timer-display');
  const startPauseBtn = document.getElementById('timer-toggle-btn');
  const resetBtn = document.getElementById('timer-reset-btn');
  const presetSelect = document.getElementById('timer-preset');

  const timer = new ExamTimer({
    durationSeconds: 90 * 60,
    onTick: (remaining, running) => {
      if (displayEl) {
        displayEl.textContent = formatTimerSeconds(remaining);
        displayEl.classList.toggle('timer-urgent', remaining > 0 && remaining <= 300);
      }
      if (startPauseBtn) {
        startPauseBtn.textContent = running ? '暫停' : '開始計時';
      }
    },
    onFinish: () => {
      showToast('⏰ 寫作計時結束！請停筆並點擊「開始評分」檢視成果。', 'warning', 6000);
    }
  });

  startPauseBtn?.addEventListener('click', () => {
    if (timer.running) {
      timer.pause();
    } else {
      timer.start();
    }
  });

  resetBtn?.addEventListener('click', () => {
    const mins = Number(presetSelect?.value || 90);
    timer.reset(mins * 60);
  });

  presetSelect?.addEventListener('change', () => {
    const mins = Number(presetSelect.value || 90);
    timer.reset(mins * 60);
  });
}

function initOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  const updateOnlineStatus = () => {
    if (!banner) return;
    banner.hidden = navigator.onLine;
  };
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // Ignore SW errors in unsupported environments
      });
    });
  }
}

function bindEvents() {
  // Navigation buttons
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-nav');
      if (target === 'result' && !currentRecord) {
        showToast('尚無評分結果，請先輸入作文或從歷史紀錄選取', 'info');
        return;
      }
      switchView(target);
    });
  });

  // Privacy notice dismiss
  document.getElementById('dismiss-privacy-btn')?.addEventListener('click', () => {
    saveSettings({ privacyNoticeDismissed: true });
    const banner = document.getElementById('privacy-banner');
    if (banner) banner.hidden = true;
  });

  // Input form events
  const contentEl = document.getElementById('essay-content');
  const titleEl = document.getElementById('essay-title');
  const promptEl = document.getElementById('essay-prompt');

  contentEl?.addEventListener('input', () => {
    updateStatsUI();
    persistDraftFromInputs();
  });
  titleEl?.addEventListener('input', persistDraftFromInputs);
  promptEl?.addEventListener('input', persistDraftFromInputs);
  document.querySelectorAll('input[name="essay-type"]').forEach((radio) => {
    radio.addEventListener('change', persistDraftFromInputs);
  });

  // Sample essay buttons
  document.querySelectorAll('[data-sample]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-sample');
      const sample = SAMPLE_ESSAYS[key];
      if (!sample) return;
      setSelectedEssayType(sample.type);
      if (titleEl) titleEl.value = sample.title;
      if (promptEl) promptEl.value = sample.promptText;
      if (contentEl) contentEl.value = sample.content;
      const promptDetails = document.getElementById('prompt-details');
      if (promptDetails) promptDetails.open = true;
      updateStatsUI();
      persistDraftFromInputs();
      showToast(`已載入「${sample.title}」範例作文`, 'info');
    });
  });

  // Clear input button
  document.getElementById('clear-input-btn')?.addEventListener('click', async () => {
    if (!contentEl?.value && !titleEl?.value && !promptEl?.value) return;
    const ok = await showConfirmModal({
      title: '清空輸入區',
      message: '確定要清空目前正在編輯的題目與作文內容嗎？',
      confirmText: '清空',
      danger: true
    });
    if (!ok) return;
    if (titleEl) titleEl.value = '';
    if (promptEl) promptEl.value = '';
    if (contentEl) contentEl.value = '';
    clearDraft();
    updateStatsUI();
    showToast('已清空輸入內容', 'info');
  });

  // Grade submit & cancel
  document.getElementById('grade-submit-btn')?.addEventListener('click', () => {
    startGrading({ forceRegrade: false });
  });

  document.getElementById('cancel-grade-btn')?.addEventListener('click', () => {
    if (activeAbortController) {
      activeAbortController.abort();
    }
  });

  // Result view actions
  document.getElementById('copy-report-btn')?.addEventListener('click', async () => {
    if (!currentRecord) return;
    const ok = await copyReportToClipboard(currentRecord);
    if (ok) {
      showToast('已將完整評語複製到剪貼簿', 'success');
    } else {
      showToast('複製失敗，請手動選取複製', 'error');
    }
  });

  document.getElementById('download-txt-btn')?.addEventListener('click', () => {
    if (!currentRecord) return;
    downloadReportAsTxt(currentRecord);
    showToast('已開始下載 .txt 評閱報告', 'success');
  });

  document.getElementById('regrade-current-btn')?.addEventListener('click', async () => {
    if (!currentRecord) return;
    setSelectedEssayType(currentRecord.type || 'intellectual');
    if (titleEl) titleEl.value = currentRecord.title || '';
    if (promptEl) promptEl.value = currentRecord.promptText || '';
    if (contentEl) contentEl.value = currentRecord.content || '';
    persistDraftFromInputs();
    updateStatsUI();
    switchView('input');
    await startGrading({ forceRegrade: true });
  });

  document.getElementById('back-to-input-btn')?.addEventListener('click', () => {
    switchView('input');
  });

  // History clear all
  document.getElementById('clear-history-btn')?.addEventListener('click', async () => {
    const ok = await showConfirmModal({
      title: '清空所有歷史紀錄',
      message: '確定要永久刪除這台裝置上的所有作文批改紀錄嗎？此操作無法復原。',
      confirmText: '全部清空',
      danger: true
    });
    if (!ok) return;
    await clearHistoryRecords();
    await refreshHistoryUI();
    showToast('已清空所有歷史紀錄', 'info');
  });

  // Settings page events
  const keyInput = document.getElementById('settings-api-key');
  const toggleKeyBtn = document.getElementById('toggle-key-visibility');
  const modelSelect = document.getElementById('settings-model');
  const detectModelsBtn = document.getElementById('detect-models-btn');
  const tempInput = document.getElementById('settings-temperature');
  const tempValue = document.getElementById('settings-temp-value');
  const saveHistoryCheckbox = document.getElementById('settings-save-history');
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  const clearAllDataBtn = document.getElementById('clear-all-data-btn');

  toggleKeyBtn?.addEventListener('click', () => {
    if (!keyInput) return;
    const isPwd = keyInput.type === 'password';
    keyInput.type = isPwd ? 'text' : 'password';
    toggleKeyBtn.textContent = isPwd ? '隱藏' : '顯示';
  });

  tempInput?.addEventListener('input', () => {
    if (tempValue) {
      tempValue.textContent = Number(tempInput.value).toFixed(1);
    }
  });

  const saveFormSettings = () => {
    const apiKey = (keyInput?.value || '').trim();
    const model = modelSelect?.value || DEFAULT_SETTINGS.model;
    const temperature = Number(tempInput?.value ?? DEFAULT_SETTINGS.temperature);
    const saveHistory = saveHistoryCheckbox ? saveHistoryCheckbox.checked : true;
    saveSettings({ apiKey, model, temperature, saveHistory });
  };

  keyInput?.addEventListener('change', saveFormSettings);
  modelSelect?.addEventListener('change', saveFormSettings);
  tempInput?.addEventListener('change', saveFormSettings);
  saveHistoryCheckbox?.addEventListener('change', saveFormSettings);

  saveSettingsBtn?.addEventListener('click', () => {
    saveFormSettings();
    showToast('設定已儲存於本機瀏覽器', 'success');
  });

  detectModelsBtn?.addEventListener('click', async () => {
    const apiKey = (keyInput?.value || '').trim();
    const statusEl = document.getElementById('model-detect-status');
    if (!apiKey) {
      showToast('請先輸入 API Key 再偵測模型', 'warning');
      keyInput?.focus();
      return;
    }

    detectModelsBtn.disabled = true;
    detectModelsBtn.textContent = '偵測中…';
    if (statusEl) {
      statusEl.textContent = '正在向 Google API 查詢可用模型清單…';
      statusEl.className = 'field-hint';
    }

    try {
      const models = await fetchAvailableModels(apiKey);
      const currentModel = modelSelect?.value || DEFAULT_SETTINGS.model;
      const hasCurrent = models.some((m) => m.id === currentModel);
      const chosenModel = hasCurrent ? currentModel : models[0]?.id || currentModel;

      saveSettings({
        apiKey,
        availableModels: models,
        model: chosenModel
      });
      populateModelSelect(modelSelect, chosenModel, models);

      if (statusEl) {
        statusEl.textContent = `偵測成功！共找到 ${models.length} 個可用模型（標記 [Lite 輕量] 者速度最快、最省額度）。`;
        statusEl.className = 'field-hint hint-ok';
      }
      showToast(`已更新可用模型清單（共 ${models.length} 個）`, 'success');
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = err.message || '偵測失敗，請確認 API Key 是否正確。';
        statusEl.className = 'field-hint hint-warn';
      }
      showToast(err.message || '模型偵測失敗', 'error');
    } finally {
      detectModelsBtn.disabled = false;
      detectModelsBtn.textContent = '重新偵測可用模型';
    }
  });

  clearAllDataBtn?.addEventListener('click', async () => {
    const ok = await showConfirmModal({
      title: '清除所有本機資料',
      message: '這將會刪除本機儲存的 API Key、偏好設定、草稿以及所有批改歷史紀錄。共用電腦使用完畢強烈建議執行此操作。確定要清除嗎？',
      confirmText: '全部清除',
      danger: true
    });
    if (!ok) return;

    await clearAllLocalData();
    currentRecord = null;
    restoreDraftToInputs();
    syncSettingsToForm();
    await refreshHistoryUI();
    showToast('已清除所有本機資料與 API Key', 'success');
  });
}

async function initApp() {
  initOfflineBanner();
  syncSettingsToForm();
  restoreDraftToInputs();
  initTimerUI();
  bindEvents();
  await refreshHistoryUI();
  registerServiceWorker();
}

document.addEventListener('DOMContentLoaded', initApp);
