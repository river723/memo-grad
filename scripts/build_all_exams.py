# -*- coding: utf-8 -*-
"""通用解析器：把 scripts/raw/exams/ 下的 HTML 转成 realExams.json。

针对 2017-2026 的英语一/二，每套 5 个模块（完形 + 4 篇阅读 Part A）：
- 完形：用原始 HTML 的 <u>N</u> 标记切正文（避开正文数字被误替换）
- 阅读：按视觉文本切正文/选项，答案取自落地页答案表
- 解析：从 sections 页按「第 N 空/第 N 题正确答案 ... 均可排除」段落抽取

输出结构复用 src/types/index.ts 的 RealExamYear。
"""
import json
import re
import html
import os
from collections import defaultdict

ROOT = os.path.dirname(__file__)
RAW = os.path.join(ROOT, 'raw', 'exams')
DATA = os.path.abspath(os.path.join(ROOT, '..', 'src', 'data', 'realExams.json'))

YEARS = list(range(2017, 2027))
SETS = [('english-one', 'english1'), ('english-two', 'english2')]


# ---------- HTML utility ----------
def read(fname):
    p = os.path.join(RAW, fname)
    if not os.path.exists(p):
        return None
    return open(p, encoding='utf-8').read()


def to_text(raw):
    t = re.sub(r'<script.*?</script>', '', raw, flags=re.S)
    t = re.sub(r'<style.*?</style>', '', t, flags=re.S)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = html.unescape(t)
    return re.sub(r'\s+', ' ', t).strip()


# ---------- landing page: answer table ----------
_CLOZE_ANS_RE = re.compile(r'完形填空.*?Section I\s*（1[–-]20\s*题）\s*(.*?)阅读理解', re.S)
_READ_BLOCK_RE = re.compile(
    r'阅读理解.*?Section II Part A(?:\s*\((\d+)\))?\s*（(\d+)[–-](\d+)\s*题）\s*(.*?)(?=阅读理解.*?Section II Part A|多项对应|新题型|Section II Part B|Section II Part C|Section III|Section IV|下载|$)',
    re.S)


def parse_answer_table(landing_text):
    """返回 {'cloze': ['A','D',...] len20, 'reading': {1:[..5], 2:[..5], 3:[..5], 4:[..5]}}"""
    out = {'cloze': [], 'reading': {}}
    m = _CLOZE_ANS_RE.search(landing_text)
    if not m:
        raise ValueError('cloze answer block missing')
    block = m.group(1)
    # 形如 "1 C Few · 2 A run · ..."
    for n, letter in re.findall(r'(\d{1,2})\s+([ABCD])\b', block):
        n = int(n)
        if 1 <= n <= 20 and len(out['cloze']) < n:
            out['cloze'].append(letter)
    if len(out['cloze']) != 20:
        # 兜底：按顺序抓 20 个 letter
        out['cloze'] = re.findall(r'\b([ABCD])\b', block)[:20]
    if len(out['cloze']) != 20:
        raise ValueError(f'cloze answers != 20 ({len(out["cloze"])})')

    for m in _READ_BLOCK_RE.finditer(landing_text):
        text_idx = int(m.group(1) or 1)
        q_lo, q_hi = int(m.group(2)), int(m.group(3))
        seg = m.group(4)
        letters = []
        for n, l in re.findall(r'(\d{1,2})\s+([ABCD])\b', seg):
            if q_lo <= int(n) <= q_hi:
                letters.append(l)
        if len(letters) != (q_hi - q_lo + 1):
            letters = re.findall(r'\b([ABCD])\b', seg)[:q_hi - q_lo + 1]
        out['reading'][text_idx] = letters
    return out


# ---------- cloze paper page ----------
def extract_cloze_passage(raw):
    """用 <u>… N …</u> 标记切正文，返回带 [1]..[20] 占位的英文段。"""
    # 用惰性匹配把 <u> … N … </u> 里唯一的整数抽出
    def sub(m):
        inner = m.group(1)
        n = re.search(r'(\d+)', inner)
        return f' [{n.group(1)}] ' if n else m.group(0)
    replaced = re.sub(r'<u[^>]*>(.*?)</u>', sub, raw, flags=re.S)
    t = to_text(replaced)
    # 定位正文范围：'(10 points)' 起，'1. [ A ]' 前止
    m1 = re.search(r'\(10 points\)', t)
    m2 = re.search(r'1\.\s*\[\s*A\s*\]', t)
    if not m1 or not m2:
        raise ValueError('cloze passage bounds missing')
    passage = t[m1.end():m2.start()].strip()
    # 校验 20 个占位符
    ph = re.findall(r'\[(\d+)\]', passage)
    if [int(x) for x in ph] != list(range(1, 21)):
        raise ValueError(f'cloze placeholders wrong: {ph}')
    return passage


def extract_cloze_options(raw):
    """返回 [(1,['A) Still',...,'D) Instead']), ...]"""
    t = to_text(raw)
    opts_region = t[re.search(r'1\.\s*\[\s*A\s*\]', t).start():]
    out = []
    for n in range(1, 21):
        end_pat = r'(?=\s*%d\.\s*\[\s*A\s*\])' % (n + 1) if n < 20 else r'(?=\s*选文出处|\s*本页数据)'
        pat = re.compile(
            r'%d\.\s*\[\s*A\s*\](.*?)\[\s*B\s*\](.*?)\[\s*C\s*\](.*?)\[\s*D\s*\](.*?)%s' % (n, end_pat), re.S)
        m = pat.search(opts_region)
        if not m:
            raise ValueError(f'cloze opt {n} parse fail')
        a, b, c, d = (x.strip() for x in m.groups())
        out.append((n, [f'A) {a}', f'B) {b}', f'C) {c}', f'D) {d}']))
    return out


# ---------- reading paper page ----------
def extract_reading(raw, q_lo, q_hi):
    """返回 (passage_text, [(qnum, stem, [A..D]), ...])"""
    t = to_text(raw)
    m = re.search(r'\(40 points\)', t)
    region = t[m.end():] if m else t
    region = re.sub(r'^\s*Text\s*\d+\s*', '', region)
    q_start = re.search(r'\b%d\.' % q_lo, region)
    passage = region[:q_start.start()].strip() if q_start else region.strip()
    qs_region = region[q_start.start():] if q_start else ''
    questions = []
    for n in range(q_lo, q_hi + 1):
        end_pat = r'(?=\s*%d\.\s)' % (n + 1) if n < q_hi else r'(?=\s*选文出处|\s*本页数据|$)'
        pat = re.compile(
            r'%d\.\s*(.*?)\[\s*A\s*\](.*?)\[\s*B\s*\](.*?)\[\s*C\s*\](.*?)\[\s*D\s*\](.*?)%s'
            % (n, end_pat), re.S)
        m = pat.search(qs_region)
        if not m:
            raise ValueError(f'reading q{n} parse fail')
        stem, a, b, c, d = (x.strip() for x in m.groups())
        questions.append((n, stem, [f'A) {a}', f'B) {b}', f'C) {c}', f'D) {d}']))
    return passage, questions


# ---------- explanation (jiexi) page ----------
FOOTER = '本页数据最后更新'


def clean_exp(s):
    s = re.split(r'\s*20(1[7-9]|2[0-6])\s*年考研英语[一二]\s*(完形填空|阅读理解)', s)[0]
    s = s.split(FOOTER)[0]
    return s.strip()


def extract_cloze_exp(jiexi_html):
    if jiexi_html is None:
        return {}
    t = to_text(jiexi_html)
    out = {}
    for n in range(1, 21):
        m = re.search(r'第\s*%d\s*空正确答案' % n, t)
        if not m:
            continue
        rest = t[m.start():]
        nxt = re.search(r'第\s*%d\s*空正确答案' % (n + 1), rest) if n < 20 else None
        out[n] = clean_exp(rest[:nxt.start()] if nxt else rest)
    return out


def extract_reading_exp(jiexi_html, q_lo, q_hi):
    if jiexi_html is None:
        return {}
    t = to_text(jiexi_html)
    out = {}
    for n in range(q_lo, q_hi + 1):
        m = re.search(r'第\s*%d\s*题[^。]*?正确答案' % n, t)
        if not m:
            continue
        rest = t[m.start():]
        nxt = re.search(r'第\s*%d\s*题[^。]*?正确答案' % (n + 1), rest) if n < q_hi else None
        out[n] = clean_exp(rest[:nxt.start()] if nxt else rest)
    return out


# ---------- reading slug detection ----------
def reading_slugs(landing_text_or_html, set_url_slug):
    """从落地页找 4 个阅读分节 slug，按 Text 1-4 顺序。"""
    hrefs = re.findall(r'href="/kaoyan/paper/%s/([^"/]+)/?"' % re.escape(set_url_slug),
                       landing_text_or_html)
    ordered = []
    for h in hrefs:
        if re.match(r'section2-part-a(-\d+)?$', h) and h not in ordered:
            ordered.append(h)
    return ordered[:4]


# ---------- main ----------
def build_set(year, url_slug, key_slug, errors):
    landing_raw = read(f'{year}-{url_slug}-landing.html')
    landing_text = to_text(landing_raw)
    ans = parse_answer_table(landing_text)

    # 完形
    cpaper = read(f'{year}-{url_slug}-section1-paper.html')
    cjiexi = read(f'{year}-{url_slug}-section1-jiexi.html')
    passage = extract_cloze_passage(cpaper)
    opts = extract_cloze_options(cpaper)
    exp = extract_cloze_exp(cjiexi)
    cloze = {
        'id': f'{year}-{"e1" if key_slug == "english1" else "e2"}-cloze',
        'passage': passage,
        'blanks': [
            {
                'index': n,
                'options': o,
                'answer': ans['cloze'][n - 1],
                **({'explanation': exp[n]} if exp.get(n) else {}),
            } for n, o in opts
        ],
    }
    if not cjiexi or len(exp) != 20:
        errors.append(f'{year}-{url_slug} cloze explanations={len(exp)}/20')

    # 阅读 4 篇
    slugs = reading_slugs(landing_raw, f'{year}-{url_slug}')
    if len(slugs) != 4:
        errors.append(f'{year}-{url_slug} reading slugs={slugs}')
        return {'reading': [], 'cloze': cloze}
    readings = []
    for idx, slug in enumerate(slugs, 1):
        q_lo = 21 + (idx - 1) * 5
        q_hi = q_lo + 4
        raw_paper = read(f'{year}-{url_slug}-{slug}-paper.html')
        raw_jiexi = read(f'{year}-{url_slug}-{slug}-jiexi.html')
        try:
            passage, qs = extract_reading(raw_paper, q_lo, q_hi)
        except Exception as e:
            errors.append(f'{year}-{url_slug} text{idx} parse: {e}')
            continue
        rexp = extract_reading_exp(raw_jiexi, q_lo, q_hi)
        ans_letters = ans['reading'].get(idx, [])
        if len(ans_letters) != 5:
            errors.append(f'{year}-{url_slug} text{idx} answers={ans_letters}')
            continue
        eshort = 'e1' if key_slug == 'english1' else 'e2'
        readings.append({
            'id': f'{year}-{eshort}-text{idx}',
            'title': f'Text {idx}',
            'passage': passage,
            'questions': [
                {
                    'id': f'{year}-{eshort}-text{idx}-q{n}',
                    'stem': stem,
                    'options': opts,
                    'answer': ans_letters[n - q_lo],
                    **({'explanation': rexp[n]} if rexp.get(n) else {}),
                } for n, stem, opts in qs
            ],
        })
        if len(rexp) != 5:
            errors.append(f'{year}-{url_slug} text{idx} explanations={len(rexp)}/5')
    return {'reading': readings, 'cloze': cloze}


def main():
    errors = []
    result = []
    for year in YEARS:
        entry = {'year': year, 'english1': None, 'english2': None}
        for url_slug, key_slug in SETS:
            try:
                entry[key_slug] = build_set(year, url_slug, key_slug, errors)
            except Exception as e:
                errors.append(f'{year}-{url_slug} BUILD FAIL: {e}')
                entry[key_slug] = {'reading': [], 'cloze': None}
        result.append(entry)
    with open(DATA, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    # 汇总
    print('\n=== SUMMARY ===')
    for y in result:
        e1 = y['english1']; e2 = y['english2']
        print(f'{y["year"]} | E1 r={len(e1["reading"])} cloze={bool(e1["cloze"])} | '
              f'E2 r={len(e2["reading"])} cloze={bool(e2["cloze"])}')
    print(f'\n{len(errors)} warnings:')
    for e in errors:
        print(' -', e)


if __name__ == '__main__':
    main()
