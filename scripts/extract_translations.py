# -*- coding: utf-8 -*-
"""从 scripts/raw/exams/*-jiexi.html 抽取每篇文章的段落级中英对照。

站点解析页原始 HTML 里每段英文正文用 <div style="text-indent:2em..."> 包裹，
段末紧跟 <p class="lt-zh" lang="zh-CN"> 中文段，一段对一段。完形正文里空以
<u>N</u> 标记，替换为 [N] 保留占位（与 realExams.json 中 passage 字段一致）。

产物：给 src/data/realExams.json 中每个 reading passage 和 cloze paper 追加
paragraphs: [{en, zh}, ...] 字段。幂等——已有 paragraphs 会被重写。
"""
import json
import os
import re
import html

ROOT = os.path.dirname(__file__)
RAW = os.path.join(ROOT, 'raw', 'exams')
DATA = os.path.abspath(os.path.join(ROOT, '..', 'src', 'data', 'realExams.json'))

# 段落对模式：<div ...text-indent:2em...>[英文块（可能含 <u>N</u>、<span> 等）]<p class="lt-zh"...>[中文]</p></div>
PAIR_RE = re.compile(
    r'<div[^>]*text-indent:\s*2em[^>]*>(.*?)<p class="lt-zh"[^>]*>(.*?)</p>\s*</div>',
    re.S,
)


def strip_tags(s):
    # 完形空 <u> N </u> → [N]，保留占位；空白折叠
    def u_to_ph(m):
        n = re.search(r'(\d+)', m.group(1))
        return f' [{n.group(1)}] ' if n else ''
    s = re.sub(r'<u[^>]*>(.*?)</u>', u_to_ph, s, flags=re.S)
    s = re.sub(r'<[^>]+>', ' ', s)
    s = html.unescape(s)
    return re.sub(r'\s+', ' ', s).strip()


def extract_pairs(fname):
    p = os.path.join(RAW, fname)
    if not os.path.exists(p):
        return []
    raw = open(p, encoding='utf-8').read()
    out = []
    for m in PAIR_RE.finditer(raw):
        en = strip_tags(m.group(1))
        zh = strip_tags(m.group(2))
        # 站点在阅读英文段首加了 "P1"..."P6" 段号，做题者不需要，剥掉
        en = re.sub(r'^P\d+\s+', '', en)
        if en and zh:
            out.append({'en': en, 'zh': zh})
    return out


def slug_for(reading_id):
    # reading id 形如 2017-e1-text1；jiexi 文件名要用 English-one/two 和 section2-part-a[-N]
    return None  # 见 main 中的映射


def reading_slugs_from_landing(landing_html, set_url_slug):
    """复用 build_all_exams.py 的规则：从落地页拿 4 个阅读分节 slug，按 Text 1-4 顺序。"""
    hrefs = re.findall(
        r'href="/kaoyan/paper/%s/([^"/]+)/?"' % re.escape(set_url_slug),
        landing_html,
    )
    ordered = []
    for h in hrefs:
        if re.match(r'section2-part-a(-\d+)?$', h) and h not in ordered:
            ordered.append(h)
    return ordered[:4]


def main():
    data = json.load(open(DATA, encoding='utf-8'))
    stats = {'cloze_ok': 0, 'cloze_empty': 0, 'reading_ok': 0, 'reading_empty': 0}

    for y in data:
        year = y['year']
        for setkey, url_slug in [('english1', 'english-one'), ('english2', 'english-two')]:
            s = y[setkey]

            # 完形
            if s.get('cloze'):
                pairs = extract_pairs(f'{year}-{url_slug}-section1-jiexi.html')
                if pairs:
                    s['cloze']['paragraphs'] = pairs
                    stats['cloze_ok'] += 1
                else:
                    stats['cloze_empty'] += 1
                    print(f'  ! {year}-{setkey} cloze: 0 pairs')

            # 阅读——需要拿到 4 个 slug 的对应
            landing_path = os.path.join(RAW, f'{year}-{url_slug}-landing.html')
            if not os.path.exists(landing_path):
                continue
            landing = open(landing_path, encoding='utf-8').read()
            slugs = reading_slugs_from_landing(landing, f'{year}-{url_slug}')
            for idx, r in enumerate(s.get('reading', []) or [], 1):
                if idx > len(slugs):
                    break
                slug = slugs[idx - 1]
                pairs = extract_pairs(f'{year}-{url_slug}-{slug}-jiexi.html')
                if pairs:
                    r['paragraphs'] = pairs
                    stats['reading_ok'] += 1
                else:
                    stats['reading_empty'] += 1
                    print(f'  ! {year}-{setkey} {r["id"]}: 0 pairs')

    with open(DATA, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print('\n=== 抽取统计 ===')
    print(f'cloze:   ok={stats["cloze_ok"]}  empty={stats["cloze_empty"]}')
    print(f'reading: ok={stats["reading_ok"]}  empty={stats["reading_empty"]}')

    # 抽样打印
    print('\n=== 抽样 ===')
    for probe_year, setkey in [(2017, 'english1'), (2022, 'english2'), (2026, 'english1')]:
        y = next(x for x in data if x['year'] == probe_year)
        c = y[setkey]['cloze']
        r0 = y[setkey]['reading'][0] if y[setkey]['reading'] else None
        print(f'-- {probe_year} {setkey} --')
        if c and c.get('paragraphs'):
            print(f'  cloze paragraphs: {len(c["paragraphs"])}')
            print(f'  §1 EN: {c["paragraphs"][0]["en"][:80]}')
            print(f'  §1 ZH: {c["paragraphs"][0]["zh"][:60]}')
        if r0 and r0.get('paragraphs'):
            print(f'  {r0["id"]} paragraphs: {len(r0["paragraphs"])}')
            print(f'  §1 EN: {r0["paragraphs"][0]["en"][:80]}')
            print(f'  §1 ZH: {r0["paragraphs"][0]["zh"][:60]}')


if __name__ == '__main__':
    main()
