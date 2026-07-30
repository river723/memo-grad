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

YEARS = list(range(2010, 2027))
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
    # 切掉解析末尾泄漏的页内标题/FAQ导航，统一以 "20YY年考研英语[一二]" 开头
    # （完形/阅读/新题型/翻译/写作各题型的标题与 FAQ 均以此起头，正文极少这样自我引用）
    s = re.split(r'\s*20\d\d\s*年\s*考研英语\s*[一二]', s)[0]
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


# ---------- new-type (Part B) / translation / writing ----------
# 新题型子类型：从落地页答案表标签识别
NEWTYPE_SUBTYPE = [
    ('段落排序', 'ordering'),
    ('段落小标题', 'heading'),
    ('选句填空', 'sentence'),
    ('多项对应', 'matching'),
]


def parse_newtype_answers(landing_text):
    """从落地页答案表抽取新题型（Part B）子类型与 41-45 答案。

    返回 (subtype, {41:'B', ...}) 或 (None, {})。
    覆盖三种表述：
      排序题   "41=B → 预给A → 42=F → ..."
      匹配类   "41 F · 42 C · 43 A · ..."（A–H）
      正误判断 "41 F · 42 T · ..."（英二2010，答案仅 T/F）
    """
    tbl = landing_text[landing_text.find('客观题参考答案速查表'):]
    if not tbl:
        return None, {}
    subtype = None
    for label, st in NEWTYPE_SUBTYPE:
        if re.search(label + r'[^A-Za-z]*Section II Part B', tbl):
            subtype = st
            break
    m = re.search(r'Section II Part B(.*?)(?=英译汉|写作|Section III|Section IV|整卷|$)', tbl, re.S)
    seg = m.group(1) if m else ''
    ans = {}
    for n, letter in re.findall(r'(4[1-5])\s*=?\s*([A-H])\b', seg):
        n = int(n)
        if 41 <= n <= 45 and n not in ans:
            ans[n] = letter
    # 正误判断题：标签未命中且答案里含 T（A–H 正则会漏掉 T）
    if subtype is None:
        tf = {}
        for n, letter in re.findall(r'(4[1-5])\s*([TF])\b', seg):
            n = int(n)
            if 41 <= n <= 45 and n not in tf:
                tf[n] = letter
        if len(tf) == 5:
            return 'truefalse', tf
    return subtype, ans


def _split_option_pool(body):
    """把 "[ A ] xxx [ B ] yyy ... [ H ] zzz" 切成 {letter: text}。取最后一处连续的选项池。"""
    # 找到最后一个从 [ A ] 起、含 [ B ] 的选项池区块
    starts = [m.start() for m in re.finditer(r'\[\s*A\s*\]', body)]
    for s in reversed(starts):
        region = body[s:]
        if re.search(r'\[\s*B\s*\]', region):
            out = {}
            marks = list(re.finditer(r'\[\s*([A-H])\s*\]', region))
            for i, mk in enumerate(marks):
                letter = mk.group(1)
                end = marks[i + 1].start() if i + 1 < len(marks) else len(region)
                text = region[mk.end():end].strip()
                out[letter] = text
            if len(out) >= 5:
                return out
    return {}


def extract_newtype_exp(jiexi_html):
    """新题型逐位号解析。返回 {41: '...'}。

    各子类型真正的解析锚点不统一，但都有唯一的"强锚点"（含实质解析词）：
      排序   '第 N 位正确答案'
      标题/选句 '第 N 空应选'
      多项对应 '第 N 题答案为'
      正误   '第 N 题…正确答案'
    优先用强锚点（每种页面只出现一次，直指解析正文）；无强锚点再回退到
    '第 N 题/空'（跳过以问号结尾的 FAQ 问句与页尾残句）。
    """
    if jiexi_html is None:
        return {}
    t = to_text(jiexi_html)

    def marker(n):
        # 1) 强锚点：唯一且直指解析正文
        strong = [
            r'第\s*%d\s*位正确答案' % n,
            r'第\s*%d\s*空应选' % n,
            r'第\s*%d\s*题答案为' % n,
            r'第\s*%d\s*题[^？?]{0,10}正确答案' % n,
        ]
        for pat in strong:
            m = re.search(pat, t)
            if m:
                return m.start()
        # 2) 回退：第 N 题/空，取其后 60 字不含问号的最后一处（避开 FAQ 问句）
        best = None
        for pat in (r'第\s*%d\s*题' % n, r'第\s*%d\s*空' % n, r'\b%d\.\s' % n):
            for m in re.finditer(pat, t):
                nxt = t[m.end():m.end() + 60]
                if '？' in nxt or '?' in nxt:
                    continue
                if best is None or m.start() > best:
                    best = m.start()
        return best

    starts = {n: marker(n) for n in range(41, 46)}
    valid = sorted(s for s in starts.values() if s is not None)
    out = {}
    for n in range(41, 46):
        s = starts[n]
        if s is None:
            continue
        # 结束位置：下一个（任意位号的）锚点起点，避免串题
        after = [v for v in valid if v > s]
        end = min(after) if after else len(t)
        out[n] = clean_exp(t[s:end])
    return out


def _extract_truefalse_statements(body):
    """正误判断题：从题目页抽 41-45 的陈述句。格式 'NN. statement [ T ] [ F ]'。"""
    out = {}
    for n in range(41, 46):
        end_pat = r'(?=\s*%d\.\s)' % (n + 1) if n < 45 else r'(?=\s*选文出处|\s*本页数据|$)'
        pat = re.compile(r'%d\.\s*(.*?)\[\s*T\s*\]' % n + r'.*?' + end_pat, re.S)
        m = pat.search(body)
        if m:
            out[n] = re.sub(r'\s+', ' ', m.group(1)).strip()
    return out


def build_newtype(year, url_slug, key_slug, landing_text, errors):
    """构建新题型（Part B）。答案取落地页表；选项池/正文取题目页；解析取 jiexi。"""
    subtype, ans = parse_newtype_answers(landing_text)
    paper = read(f'{year}-{url_slug}-section2-part-b-paper.html')
    if paper is None:
        return None
    if not subtype or len(ans) != 5:
        errors.append(f'{year}-{url_slug} newtype answers={ans} subtype={subtype}')
        return None
    raw = paper
    t = to_text(raw)
    i = t.find('Directions')
    j = t.find('本页数据')
    body = t[i:j] if i >= 0 and j > i else t
    # Directions：截到 "(N points)" 处
    md = re.search(r'Directions.*?\(\d+\s*points?\)', body, re.S)
    direction = md.group(0).strip() if md else ''
    eshort = 'e1' if key_slug == 'english1' else 'e2'
    exp = extract_newtype_exp(read(f'{year}-{url_slug}-section2-part-b-jiexi.html'))

    # 正误判断题（英二2010）：无 A–H 选项池；每题一个陈述句，选 T/F
    if subtype == 'truefalse':
        stmts = _extract_truefalse_statements(body)
        if len(stmts) != 5:
            errors.append(f'{year}-{url_slug} truefalse statements={len(stmts)}/5')
            return None
        # 共享阅读文章：Directions 之后、第 41 题之前
        first_q = re.search(r'\b41\.\s', body)
        passage = None
        if md and first_q:
            passage = re.sub(r'\s+', ' ', body[md.end():first_q.start()]).strip() or None
        if len(exp) != 5:
            errors.append(f'{year}-{url_slug} newtype explanations={len(exp)}/5')
        return {
            'id': f'{year}-{eshort}-newtype',
            'subtype': 'truefalse',
            'direction': direction,
            **({'passage': passage} if passage else {}),
            'options': [{'letter': 'T', 'text': '正确 (True)'}, {'letter': 'F', 'text': '错误 (False)'}],
            'questions': [
                {
                    'index': n,
                    'stem': stmts[n],
                    'answer': ans[n],
                    **({'explanation': exp[n]} if exp.get(n) else {}),
                } for n in range(41, 46)
            ],
        }

    pool = _split_option_pool(body)
    if len(pool) < 5:
        errors.append(f'{year}-{url_slug} newtype option pool={len(pool)}')
        return None
    # 正文（标题匹配/7选5/多项对应有带编号文章；排序题无）
    passage = None
    if subtype != 'ordering':
        first_a = re.search(r'\[\s*A\s*\]', body)
        p_region = body[md.end():first_a.start()] if md and first_a else ''
        # 站点用 "(NN) 占位符这是等待完型填空的句子位置" 标记待填空位，清成简洁的 "(NN) ____"
        p_region = re.sub(r'占位符这是等待完型填空的句子位置', '____', p_region)
        passage = re.sub(r'\s+', ' ', p_region).strip() or None
    fixed_letters = set()
    if subtype == 'ordering':
        # 从答案表 seg 里"预给X"识别固定段
        tbl = landing_text[landing_text.find('客观题参考答案速查表'):]
        mseg = re.search(r'Section II Part B(.*?)(?=英译汉|写作|Section III|$)', tbl, re.S)
        if mseg:
            fixed_letters = set(re.findall(r'预给\s*([A-H])', mseg.group(1)))
    options = [
        {
            'letter': L,
            'text': pool[L],
            **({'fixed': True} if L in fixed_letters else {}),
        } for L in sorted(pool.keys())
    ]
    questions = [
        {
            'index': n,
            'answer': ans[n],
            **({'explanation': exp[n]} if exp.get(n) else {}),
        } for n in range(41, 46)
    ]
    if len(exp) != 5:
        errors.append(f'{year}-{url_slug} newtype explanations={len(exp)}/5')
    return {
        'id': f'{year}-{eshort}-newtype',
        'subtype': subtype,
        'direction': direction,
        **({'passage': passage} if passage else {}),
        'options': options,
        'questions': questions,
    }


def build_translation(year, url_slug, key_slug, errors):
    """构建翻译（英一 section2-part-c 划线句；英二 section3 段落）。纯阅览。"""
    is_e1 = key_slug == 'english1'
    pslug = 'section2-part-c' if is_e1 else 'section3'
    paper = read(f'{year}-{url_slug}-{pslug}-paper.html')
    jiexi = read(f'{year}-{url_slug}-{pslug}-jiexi.html')
    if paper is None:
        return None
    t = to_text(paper)
    i = t.find('Directions')
    j = t.find('本页数据')
    body = t[i:j] if i >= 0 and j > i else t
    md = re.search(r'Directions.*?\(\d+\s*points?\)', body, re.S)
    direction = md.group(0).strip() if md else ''
    passage = body[md.end():].strip() if md else body.strip()
    eshort = 'e1' if is_e1 else 'e2'
    items = []
    jt = to_text(jiexi) if jiexi else ''
    if is_e1:
        # 英一：逐句 "第 N 题「英文」...参考译文是「中文」"
        for n in range(46, 51):
            m = re.search(r'第\s*%d\s*题[「『""]([^」』""]*)' % n, jt)
            if not m:
                continue
            en = m.group(1).strip()
            rest = jt[m.end():]
            mz = re.search(r'参考译文是[「『""]([^」』""]*)', rest)
            zh = mz.group(1).strip() if mz else ''
            items.append({'index': n, 'en': en, 'zh': zh})
        if len(items) != 5:
            errors.append(f'{year}-{url_slug} translation items={len(items)}/5')
    else:
        # 英二：整段译文 "P1 ... P2 ..."
        m = re.search(r'参考译文是[^P]*?(P1\s.*?)(?=本页数据|逐句解析|FAQ|$)', jt, re.S)
        block = m.group(1) if m else ''
        paras = re.split(r'\bP\d+\s', block)
        paras = [p.strip() for p in paras if p.strip()]
        zh = ' '.join(paras).strip()
        if zh:
            items.append({'index': 1, 'en': passage, 'zh': zh})
        else:
            errors.append(f'{year}-{url_slug} translation paragraph zh missing')
    return {
        'id': f'{year}-{eshort}-translation',
        'subtype': 'sentence' if is_e1 else 'paragraph',
        'direction': direction,
        'passage': passage,
        'items': items,
    }


def _extract_writing_part(jiexi_html, label):
    """从写作 jiexi 页抽 Directions + 参考范文 + 参考译文。"""
    if jiexi_html is None:
        return None
    t = to_text(jiexi_html)
    md = re.search(r'Directions:.*?\(\d+\s*points?\)', t, re.S)
    direction = md.group(0).strip() if md else ''
    # 参考范文：【参考范文 ...】 至 【参考译文】
    ms = re.search(r'【\s*参考范文[^】]*】(.*?)(?=【\s*参考译文|【|本页数据|$)', t, re.S)
    sample = None
    if ms:
        s = ms.group(1)
        # 去掉 "写作无唯一标准答案，以下为达标示范" 之类前缀
        s = re.sub(r'^[^A-Za-z]*(?=[A-Z])', '', s, count=1)
        sample = s.strip() or None
    ma = re.search(r'【\s*参考译文\s*】(.*?)(?=【|本页数据|逐段|审题|ANALYSIS|$)', t, re.S)
    sample_zh = ma.group(1).strip() if ma else None
    if not direction and not sample:
        return None
    return {
        'label': label,
        'direction': direction,
        **({'sample': sample} if sample else {}),
        **({'sampleTranslation': sample_zh} if sample_zh else {}),
    }


def build_writing(year, url_slug, key_slug, errors):
    """构建写作（小作文 + 大作文）。纯阅览。"""
    is_e1 = key_slug == 'english1'
    if is_e1:
        specs = [('section3-part-a', 'Part A 小作文'), ('section3-part-b', 'Part B 大作文')]
    else:
        specs = [('section-iv-part-a', 'Part A 小作文'), ('section-iv-part-b', 'Part B 大作文')]
    parts = []
    for slug, label in specs:
        part = _extract_writing_part(read(f'{year}-{url_slug}-{slug}-jiexi.html'), label)
        if part:
            parts.append(part)
        else:
            errors.append(f'{year}-{url_slug} writing {slug} empty')
    if not parts:
        return None
    eshort = 'e1' if is_e1 else 'e2'
    return {'id': f'{year}-{eshort}-writing', 'parts': parts}


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
        fallback = {'reading': [], 'cloze': cloze}
        _attach_extra(fallback, year, url_slug, key_slug, landing_text, errors)
        return fallback
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
    result = {'reading': readings, 'cloze': cloze}
    _attach_extra(result, year, url_slug, key_slug, landing_text, errors)
    return result


# 仅这些年份补新题型/翻译/写作（与 fetch_all_exams.NEW_YEARS 保持一致）
NEW_YEARS = set(range(2010, 2027))


def _attach_extra(result, year, url_slug, key_slug, landing_text, errors):
    """把新题型/翻译/写作挂到 set 结果上（仅 NEW_YEARS）。缺失不阻塞。"""
    if year not in NEW_YEARS:
        return
    try:
        nt = build_newtype(year, url_slug, key_slug, landing_text, errors)
        if nt:
            result['newType'] = nt
    except Exception as e:
        errors.append(f'{year}-{url_slug} newtype FAIL: {e}')
    try:
        tr = build_translation(year, url_slug, key_slug, errors)
        if tr:
            result['translation'] = tr
    except Exception as e:
        errors.append(f'{year}-{url_slug} translation FAIL: {e}')
    try:
        wr = build_writing(year, url_slug, key_slug, errors)
        if wr:
            result['writing'] = wr
    except Exception as e:
        errors.append(f'{year}-{url_slug} writing FAIL: {e}')


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
        def tag(s):
            return (f'r={len(s["reading"])} cl={bool(s["cloze"])} '
                    f'nt={bool(s.get("newType"))} tr={bool(s.get("translation"))} wr={bool(s.get("writing"))}')
        print(f'{y["year"]} | E1 {tag(e1)} | E2 {tag(e2)}')
    print(f'\n{len(errors)} warnings:')
    for e in errors:
        print(' -', e)


if __name__ == '__main__':
    main()
