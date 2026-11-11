import { ESSAY_TYPES } from './prompt.js';

export function formatReportAsText(record) {
  if (!record || !record.result) return '';
  const { result } = record;
  const typeLabel = ESSAY_TYPES[record.type]?.label || '自由練習';
  const dateStr = new Date(record.createdAt || Date.now()).toLocaleString('zh-TW', {
    hour12: false
  });

  const lines = [
    '========================================',
    '        作文小助手（學測國寫評閱報告）',
    '========================================',
    `評閱時間：${dateStr}`,
    `題　　型：${typeLabel}`,
    `題　　目：${record.title || '（未填寫）'}`,
    `總　　分：${result.total} / 100（等第：${result.grade}）`,
    '',
    '【四面向得分】'
  ];

  for (const dim of result.dimensions || []) {
    lines.push(`- ${dim.name}：${dim.score} / 25`);
    if (dim.comment) {
      lines.push(`  評語：${dim.comment}`);
    }
  }

  lines.push('', '【整體總評】', result.summary || '（無）');

  lines.push('', '【文章優點】');
  if (result.strengths?.length) {
    result.strengths.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  } else {
    lines.push('（無）');
  }

  lines.push('', '【待改進與具體建議】');
  if (result.improvements?.length) {
    result.improvements.forEach((imp, i) => {
      lines.push(`${i + 1}. 問題：${imp.issue}`);
      lines.push(`   建議：${imp.suggestion}`);
      if (imp.example) {
        lines.push(`   示範：${imp.example}`);
      }
    });
  } else {
    lines.push('（無）');
  }

  lines.push('', '【逐句錯別字／標點／語病批改】');
  if (result.corrections?.length) {
    result.corrections.forEach((c, i) => {
      const tag = c.verified === false ? '[參考]' : `[${c.type}]`;
      lines.push(`${i + 1}. ${tag} 原文：「${c.original}」 → 修正：「${c.corrected}」`);
      if (c.explanation) {
        lines.push(`   說明：${c.explanation}`);
      }
    });
  } else {
    lines.push('未發現明顯錯別字或標點錯誤。');
  }

  lines.push('', '【段落改寫示範】');
  if (result.rewrite?.rewritten) {
    lines.push(`▼ 原文段落：\n${result.rewrite.originalParagraph || '（無）'}`);
    lines.push(`\n▼ 改寫示範：\n${result.rewrite.rewritten}`);
    if (result.rewrite.rationale) {
      lines.push(`\n▼ 改寫解析：\n${result.rewrite.rationale}`);
    }
  } else {
    lines.push('（無）');
  }

  lines.push('', '【下一步練習建議】');
  if (result.nextSteps?.length) {
    result.nextSteps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  } else {
    lines.push('（無）');
  }

  lines.push(
    '',
    '----------------------------------------',
    '【學生作文原文】',
    record.content || '',
    '========================================'
  );

  return lines.join('\n');
}

export async function copyReportToClipboard(record) {
  const text = formatReportAsText(record);
  if (!text) return false;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  // Fallback for older browsers
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok;
}

export function downloadReportAsTxt(record) {
  const text = formatReportAsText(record);
  if (!text) return;

  const safeTitle = (record.title || '國寫練習').replace(/[\\/:*?"<>|]/g, '_').slice(0, 24);
  const datePart = new Date(record.createdAt || Date.now()).toISOString().slice(0, 10);
  const filename = `${safeTitle}_評閱報告_${datePart}.txt`;

  const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

