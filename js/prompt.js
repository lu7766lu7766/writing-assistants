export const ESSAY_TYPES = {
  intellectual: {
    label: '知性題',
    desc: '重統整判斷、邏輯分析、正反論證與觀點深度'
  },
  expressive: {
    label: '情意題',
    desc: '重體物感懷、經驗描摹、情感真摯與意象經營'
  },
  free: {
    label: '自由練習',
    desc: '依文章文體與主題綜合評估立意、結構與文辭'
  }
};

export const SYSTEM_PROMPT = `你是一位資深的臺灣高中國文老師，長期擔任大考中心學測國語文寫作能力測驗（國寫）閱卷委員，熟悉大考中心四大評分原則。

請遵守以下評閱規範：
1. 【題型意識】先確認學生選擇的題型（知性題／情意題／自由練習）：
   - 知性題：重視是否準確解讀引文、論點是否鮮明、論據是否具體、推論是否合乎邏輯、有無正反思辨。
   - 情意題：重視描寫是否具象生動、情感是否真摯自然、能否由個人經驗昇華至普遍生命體悟，忌空泛口號與濫情。
   - 自由練習：先判斷其文體取向（偏論理或偏抒情敘事），再依相應標準評閱。
2. 【四面向給分】（各面向滿分 25 分，四項加總應等於 total 總分 0–100）：
   - idea（立意取材）：是否切合題旨、材料是否具體不落俗套、見解是否深刻。
   - structure（結構組織）：段落配置、開頭破題與結尾收束、段落間轉折與前後照應。
   - diction（遣詞造句）：語詞精準度、句式變化、修辭運用、有無語病或冗詞贅字。
   - mechanics（錯別字與標點）：錯別字、漏字、標點符號誤用（如一逗到底）、格式規範。
3. 【等第換算】（練習用基準，須與 total 一致）：
   - 90–100：A+
   - 80–89：A
   - 70–79：B+
   - 60–69：B
   - 0–59：C
4. 【評分尺度】「嚴謹但不刻薄，具體且有溫度」：以臺灣高中同年級前三志願學生平均水準為 80 分（A）基準，分數與評語必須完全一致（不可給高分卻滿篇批評，或給低分卻只說好話）。
5. 【嚴禁幻覺與編造】
   - strengths、corrections、rewrite.originalParagraph 中引用的所有字詞與句子，必須 **100% 逐字出自學生原文**，絕對不可自行改寫後當作原文引用，也不可捏造原文沒有的錯字！
   - 若原文沒有明顯錯字或標點錯誤，corrections 請回傳空陣列 []。
6. 【建議可執行】improvements 與 nextSteps 必須給出具體可操作的方法與修改示範（例如「將抽象形容詞改為視覺／聽覺細節」、「在第二段首句加入過渡句承接上文」），不可只寫「多閱讀、多練習」。
7. 【語言規範】全程使用繁體中文與臺灣慣用詞彙（例如：段落、標點符號、立意、論據、鋪陳），只輸出符合 schema 的 JSON，不要加上 markdown 程式碼圍籬。`;

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  required: [
    'total',
    'grade',
    'dimensions',
    'summary',
    'strengths',
    'improvements',
    'corrections',
    'rewrite',
    'nextSteps'
  ],
  properties: {
    total: {
      type: 'INTEGER',
      description: '四面向加總後的總分（0 到 100）'
    },
    grade: {
      type: 'STRING',
      enum: ['A+', 'A', 'B+', 'B', 'C'],
      description: '對應總分的等第（90-100 A+, 80-89 A, 70-79 B+, 60-69 B, 0-59 C）'
    },
    dimensions: {
      type: 'ARRAY',
      description: '四面向評分，依序為立意取材(idea)、結構組織(structure)、遣詞造句(diction)、錯別字與標點(mechanics)',
      items: {
        type: 'OBJECT',
        required: ['key', 'name', 'score', 'comment'],
        properties: {
          key: {
            type: 'STRING',
            enum: ['idea', 'structure', 'diction', 'mechanics']
          },
          name: {
            type: 'STRING',
            description: '面向中文名稱：立意取材、結構組織、遣詞造句、錯別字與標點'
          },
          score: {
            type: 'INTEGER',
            description: '該面向得分（0 到 25）'
          },
          comment: {
            type: 'STRING',
            description: '針對該面向的具體評語（約 40–90 字）'
          }
        }
      }
    },
    summary: {
      type: 'STRING',
      description: '兩到三句整體總評，點出文章最大亮點與最優先改進方向'
    },
    strengths: {
      type: 'ARRAY',
      description: '2 到 4 點具體優點，須直接引用原文片段加以說明',
      items: { type: 'STRING' }
    },
    improvements: {
      type: 'ARRAY',
      description: '2 到 4 點待改進項目，含問題診斷、具體改法與示範句',
      items: {
        type: 'OBJECT',
        required: ['issue', 'suggestion', 'example'],
        properties: {
          issue: { type: 'STRING', description: '問題點' },
          suggestion: { type: 'STRING', description: '具體怎麼改' },
          example: { type: 'STRING', description: '修改後的示範句或寫法範例' }
        }
      }
    },
    corrections: {
      type: 'ARRAY',
      description: '逐句錯別字、標點、用詞或語法修正；original 必須完全存在於原文中。若無則回傳空陣列',
      items: {
        type: 'OBJECT',
        required: ['original', 'corrected', 'type', 'explanation'],
        properties: {
          original: { type: 'STRING', description: '原文實際出現的片段（必須逐字吻合）' },
          corrected: { type: 'STRING', description: '建議修正後的片段' },
          type: {
            type: 'STRING',
            enum: ['錯字', '標點', '用詞', '語法']
          },
          explanation: { type: 'STRING', description: '簡短說明原因' }
        }
      }
    },
    rewrite: {
      type: 'OBJECT',
      required: ['originalParagraph', 'rewritten', 'rationale'],
      properties: {
        originalParagraph: {
          type: 'STRING',
          description: '挑選原文中最值得示範改寫的一段（須出自原文）'
        },
        rewritten: {
          type: 'STRING',
          description: '保留原意但提升文辭、結構或深度的改寫示範版本'
        },
        rationale: {
          type: 'STRING',
          description: '說明改了什麼、為什麼這樣改能提升分數'
        }
      }
    },
    nextSteps: {
      type: 'ARRAY',
      description: '下一次寫作可以練習的 3 件具體事項',
      items: { type: 'STRING' }
    }
  }
};

export function buildUserPrompt({ type, title, promptText, content }) {
  const typeInfo = ESSAY_TYPES[type] || ESSAY_TYPES.free;
  const cleanTitle = (title || '').trim() || '（未提供題目，請依內文主旨評閱）';
  const cleanPrompt = (promptText || '').trim() || '（未提供引文／寫作說明）';

  return [
    `【題型】${typeInfo.label}（${typeInfo.desc}）`,
    `【題目】${cleanTitle}`,
    `【寫作說明／引文】\n${cleanPrompt}`,
    `【學生作文原文】（請嚴格針對以下原文批改，引用處必須逐字存在於原文中）\n${content.trim()}`
  ].join('\n\n');
}
