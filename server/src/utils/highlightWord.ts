/**
 * 在句子中定位目标单词并用 *word* 包裹，供释义单选题高亮划线词。
 *
 * AI 经常不按 prompt 要求加星号，且句子里常出现屈折形式（abandon -> abandoned/abandoning），
 * 故后端在返回前做一次"尽力补标"：先找精确词，再按词干匹配常见屈折变体。
 * 已存在 *...* 标记时保持原样，不重复包裹。
 */

/** 转义正则特殊字符 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 生成目标词常见屈折变体的词干匹配正则。
 * 覆盖：复数/三单 -s/-es、过去式/过去分词 -ed、进行时 -ing、比较级 -er/-est，
 * 以及双写末辅音（stop->stopped）、去 e（make->making）、y->i（try->tried）等规则变化。
 * 仅对长度 >=3 的词启用，避免 1-2 字母短词误伤。
 */
function buildVariantRegex(word: string): RegExp | null {
  const w = word.toLowerCase();
  if (w.length < 3) return null;

  const stems = new Set<string>([w]);

  // 去掉常见后缀反推词干，后续统一构造屈折形式
  const stripSuffix = (s: string, suffixes: string[]) => {
    for (const suf of suffixes) {
      if (s.endsWith(suf) && s.length - suf.length >= 3) {
        stems.add(s.slice(0, -suf.length));
      }
    }
  };
  stripSuffix(w, ['ing', 'ed', 'es', 'er', 'est', 's', 'ly']);
  // try/tried 类：以 ied/ies 结尾 -> y
  if (w.endsWith('ied') || w.endsWith('ies')) stems.add(w.slice(0, -3) + 'y');

  const variants = new Set<string>();
  const add = (v: string) => v.length >= 3 && variants.add(v);

  for (const stem of stems) {
    add(stem);
    add(stem + 's');
    add(stem + 'es');
    add(stem + 'ed');
    add(stem + 'ing');
    add(stem + 'er');
    add(stem + 'est');
    add(stem + 'ly');
    // 以不发音 e 结尾：去 e 加 ing/ed
    if (stem.endsWith('e')) {
      add(stem.slice(0, -1) + 'ing');
      add(stem.slice(0, -1) + 'ed');
    }
    // 辅音+y -> y 变 i
    if (stem.endsWith('y') && stem.length >= 2 && !'aeiou'.includes(stem[stem.length - 2])) {
      add(stem.slice(0, -1) + 'ies');
      add(stem.slice(0, -1) + 'ied');
      add(stem.slice(0, -1) + 'ier');
      add(stem.slice(0, -1) + 'iest');
    }
    // 单音节短元音 + 单辅音末字母 -> 双写
    if (stem.length >= 3) {
      const last3 = stem.slice(-3);
      if (/[aeiou][b-df-hj-np-tv-z]$/.test(last3)) {
        const doubled = stem + stem[stem.length - 1];
        add(doubled + 'ed');
        add(doubled + 'ing');
        add(doubled + 'er');
      }
    }
  }

  // 目标词本身必须在内
  add(w);

  const alternation = Array.from(variants)
    .sort((a, b) => b.length - a.length) // 长形式优先，避免部分匹配
    .map(escapeRegex)
    .join('|');
  // 词边界：前后不能是字母/数字/下划线
  return new RegExp(`(?<![A-Za-z0-9_])(?:${alternation})(?![A-Za-z0-9_])`, 'i');
}

/**
 * 若 sentence 中尚无以 * 标记的词，尝试找到目标词（含屈折变体）并用 * 包裹。
 * 返回处理后的句子；找不到或已标记时原样返回。
 */
export function ensureWordHighlight(sentence: string, targetWord: string): string {
  if (!sentence || !targetWord) return sentence;
  // 已存在标记则信任 AI 的标注
  if (/\*[^*]+\*/.test(sentence)) return sentence;

  const word = targetWord.trim();
  // 1. 精确匹配（词边界，保留原大小写）
  const exact = new RegExp(
    `(?<![A-Za-z0-9_])${escapeRegex(word)}(?![A-Za-z0-9_])`,
    'i',
  );
  let m = exact.exec(sentence);
  if (m) {
    return sentence.slice(0, m.index) + '*' + m[0] + '*' + sentence.slice(m.index + m[0].length);
  }

  // 2. 词干/屈折变体匹配
  const variant = buildVariantRegex(word);
  if (variant) {
    m = variant.exec(sentence);
    if (m) {
      return sentence.slice(0, m.index) + '*' + m[0] + '*' + sentence.slice(m.index + m[0].length);
    }
  }

  return sentence;
}
