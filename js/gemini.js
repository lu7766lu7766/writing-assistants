import { SYSTEM_PROMPT, RESPONSE_SCHEMA, buildUserPrompt } from './prompt.js';
import { isQuoteInEssay } from './text.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 60_000;

export class GeminiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', isModelNotFound = false, retryAfterSec = 0 } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.code = code;
    this.isModelNotFound = isModelNotFound;
    this.retryAfterSec = retryAfterSec;
  }
}

function maskApiKey(text, apiKey) {
  if (!text) return '';
  let out = String(text);
  if (apiKey && apiKey.length >= 6) {
    out = out.split(apiKey).join('***API_KEY***');
  }
  return out.replace(/AIza[0-9A-Za-z\-_]{20,}/g, '***API_KEY***');
}

export function computeGradeFromTotal(total) {
  if (total >= 90) return 'A+';
  if (total >= 80) return 'A';
  if (total >= 70) return 'B+';
  if (total >= 60) return 'B';
  return 'C';
}

/**
 * 規範化並校驗 AI 回傳的評分 JSON，且比對原文標記是否逐字吻合
 */
export function normalizeScoreResult(raw, essayText) {
  const defaultDims = [
    { key: 'idea', name: '立意取材', score: 18, comment: '' },
    { key: 'structure', name: '結構組織', score: 18, comment: '' },
    { key: 'diction', name: '遣詞造句', score: 18, comment: '' },
    { key: 'mechanics', name: '錯別字與標點', score: 18, comment: '' }
  ];

  const dimMap = new Map();
  if (Array.isArray(raw?.dimensions)) {
    for (const d of raw.dimensions) {
      if (d && d.key) {
        const clampedScore = Math.max(0, Math.min(25, Math.round(Number(d.score) || 0)));
        dimMap.set(d.key, {
          key: d.key,
          name: d.name || defaultDims.find((x) => x.key === d.key)?.name || d.key,
          score: clampedScore,
          comment: String(d.comment || '').trim()
        });
      }
    }
  }

  const dimensions = defaultDims.map((def) => dimMap.get(def.key) || def);
  const sumScore = dimensions.reduce((acc, d) => acc + d.score, 0);
  const total =
    typeof raw?.total === 'number' && !Number.isNaN(raw.total)
      ? Math.max(0, Math.min(100, Math.round(raw.total)))
      : sumScore;
  const grade = computeGradeFromTotal(total);

  const corrections = Array.isArray(raw?.corrections)
    ? raw.corrections
        .filter((c) => c && (c.original || c.corrected))
        .map((c) => {
          const original = String(c.original || '').trim();
          const inText = isQuoteInEssay(original, essayText);
          return {
            original,
            corrected: String(c.corrected || '').trim(),
            type: ['錯字', '標點', '用詞', '語法'].includes(c.type) ? c.type : '用詞',
            explanation: String(c.explanation || '').trim(),
            verified: inText
          };
        })
    : [];

  const rewriteOrig = String(raw?.rewrite?.originalParagraph || '').trim();
  const rewrite = {
    originalParagraph: rewriteOrig,
    rewritten: String(raw?.rewrite?.rewritten || '').trim(),
    rationale: String(raw?.rewrite?.rationale || '').trim(),
    verified: rewriteOrig ? isQuoteInEssay(rewriteOrig, essayText) : true
  };

  return {
    total,
    grade,
    dimensions,
    summary: String(raw?.summary || '').trim(),
    strengths: Array.isArray(raw?.strengths) ? raw.strengths.map((s) => String(s).trim()).filter(Boolean) : [],
    improvements: Array.isArray(raw?.improvements)
      ? raw.improvements
          .filter((item) => item && (item.issue || item.suggestion))
          .map((item) => ({
            issue: String(item.issue || '').trim(),
            suggestion: String(item.suggestion || '').trim(),
            example: String(item.example || '').trim()
          }))
      : [],
    corrections,
    rewrite,
    nextSteps: Array.isArray(raw?.nextSteps) ? raw.nextSteps.map((s) => String(s).trim()).filter(Boolean) : []
  };
}

function mapHttpError(status, bodyJson, apiKey) {
  const errStatus = bodyJson?.error?.status || '';
  const errMsg = maskApiKey(bodyJson?.error?.message || '', apiKey);
  const details = bodyJson?.error?.details || [];
  const isInvalidKey =
    errStatus === 'INVALID_ARGUMENT' &&
    (errMsg.toLowerCase().includes('api key') ||
      details.some((d) => d?.reason === 'API_KEY_INVALID'));

  if (status === 400 && isInvalidKey) {
    return new GeminiError('請到設定頁重新貼上有效的 API Key', { status: 400, code: 'API_KEY_INVALID' });
  }
  if (status === 400) {
    return new GeminiError(`請求格式有誤：${errMsg || '請檢查輸入內容或更換模型'}`, { status: 400, code: 'BAD_REQUEST' });
  }
  if (status === 401 || status === 403) {
    return new GeminiError('請確認 Key 已啟用 Generative Language API，且未受網域限制', {
      status,
      code: 'PERMISSION_DENIED'
    });
  }
  if (status === 404) {
    return new GeminiError('此模型不存在或你的 Key 無權限，請到設定頁換模型', {
      status: 404,
      code: 'MODEL_NOT_FOUND',
      isModelNotFound: true
    });
  }
  if (status === 429) {
    return new GeminiError('今日免費額度已滿或請求太頻繁，請稍後再試', {
      status: 429,
      code: 'RATE_LIMITED',
      retryAfterSec: 30
    });
  }
  if (status >= 500) {
    return new GeminiError('伺服器忙線，請 1 分鐘後重試', { status, code: 'SERVER_ERROR' });
  }
  return new GeminiError(errMsg || `呼叫失敗（HTTP ${status}）`, { status, code: 'HTTP_ERROR' });
}

function extractJsonText(rawText) {
  if (!rawText) throw new Error('Empty response text');
  const trimmed = rawText.trim();
  // Strip accidental markdown fences if any
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return JSON.parse(candidate);
}

async function callGenerateContentOnce({ apiKey, model, temperature, userPrompt, signal }) {
  const cleanModel = (model || 'gemini-3.5-flash-lite').replace(/^models\//, '');
  const url = `${API_BASE}/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ],
    generationConfig: {
      temperature: typeof temperature === 'number' ? temperature : 0.4,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('TIMEOUT')), TIMEOUT_MS);
  if (signal) {
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted) {
      if (signal?.aborted) {
        throw new GeminiError('已取消評分', { code: 'ABORTED' });
      }
      throw new GeminiError('評分逾時（超過 60 秒），請檢查網路或換較快的模型重試', { code: 'TIMEOUT' });
    }
    throw new GeminiError('網路連線失敗，請檢查網路狀態後重試', { code: 'NETWORK_ERROR' });
  } finally {
    clearTimeout(timeoutId);
  }

  let bodyJson = null;
  try {
    bodyJson = await response.json();
  } catch {
    bodyJson = null;
  }

  if (!response.ok) {
    throw mapHttpError(response.status, bodyJson, apiKey);
  }

  const promptFeedbackBlock = bodyJson?.promptFeedback?.blockReason;
  if (promptFeedbackBlock) {
    throw new GeminiError('這段內容無法評分，請調整用詞', { code: 'SAFETY' });
  }

  const candidate = bodyJson?.candidates?.[0];
  if (!candidate) {
    throw new GeminiError('AI 未回傳任何評分結果，請稍後再試', { code: 'EMPTY_CANDIDATE' });
  }

  if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'PROHIBITED_CONTENT') {
    throw new GeminiError('這段內容無法評分，請調整用詞', { code: 'SAFETY' });
  }

  const textPart = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';
  const parsed = extractJsonText(textPart);
  return parsed;
}

/**
 * 評分主函式（若 JSON 解析失敗或被截斷則自動重試一次）
 */
export async function gradeEssayWithGemini({ apiKey, model, temperature, essayData, signal }) {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw new GeminiError('請先到設定頁貼上 Gemini API Key', { status: 400, code: 'NO_API_KEY' });
  }

  const userPrompt = buildUserPrompt(essayData);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const rawJson = await callGenerateContentOnce({
        apiKey: cleanKey,
        model,
        temperature,
        userPrompt,
        signal
      });
      return normalizeScoreResult(rawJson, essayData.content);
    } catch (err) {
      if (err instanceof GeminiError) {
        throw err;
      }
      // SyntaxError from JSON truncation -> retry once
      if (attempt === 1) {
        throw new GeminiError('AI 回傳格式解析失敗，請再試一次或切換模型', { code: 'JSON_PARSE_ERROR' });
      }
    }
  }
}

/**
 * 探測此 API Key 可用的 Gemini 模型清單（篩選含 generateContent 者）
 */
export async function fetchAvailableModels(apiKey) {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    throw new GeminiError('請先輸入 API Key 再偵測模型', { status: 400, code: 'NO_API_KEY' });
  }

  const url = `${API_BASE}/models?key=${encodeURIComponent(cleanKey)}`;
  let response;
  try {
    response = await fetch(url, { method: 'GET' });
  } catch {
    throw new GeminiError('無法連線至 Google 伺服器，請檢查網路', { code: 'NETWORK_ERROR' });
  }

  let bodyJson = null;
  try {
    bodyJson = await response.json();
  } catch {
    bodyJson = null;
  }

  if (!response.ok) {
    throw mapHttpError(response.status, bodyJson, cleanKey);
  }

  const models = Array.isArray(bodyJson?.models) ? bodyJson.models : [];
  const filtered = models
    .filter(
      (m) =>
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent') &&
        typeof m.name === 'string' &&
        m.name.includes('gemini')
    )
    .map((m) => {
      const id = m.name.replace(/^models\//, '');
      const isLite = id.toLowerCase().includes('lite');
      const isFlash = id.toLowerCase().includes('flash');
      return {
        id,
        displayName: m.displayName || id,
        isLite,
        isFlash
      };
    })
    .sort((a, b) => {
      if (a.isLite !== b.isLite) return a.isLite ? -1 : 1;
      if (a.isFlash !== b.isFlash) return a.isFlash ? -1 : 1;
      return b.id.localeCompare(a.id);
    });

  return filtered;
}

