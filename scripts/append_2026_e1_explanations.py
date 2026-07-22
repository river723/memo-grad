# -*- coding: utf-8 -*-
"""为 2026 英语一真题补充每题「解析」（explanation）字段。

数据来源：lazynote 站点「题目解析」页 /kaoyan/sections/2026-english-one/...，
已由 curl 下载到 scripts/raw/2026-jiexi-*.html。
运行本脚本前需先跑 append_2026_e1.py 生成题目主体。
"""
import json
import re
import html
import os

RAW = os.path.join(os.path.dirname(__file__), 'raw')
DATA = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'realExams.json'))

# 站点页脚固定文案，作为解析正文的右边界
FOOTER = '本页数据最后更新'


def visible_text(fname):
    h = open(os.path.join(RAW, fname), encoding='utf-8').read()
    t = re.sub(r'<script.*?</script>', '', h, flags=re.S)
    t = re.sub(r'<style.*?</style>', '', t, flags=re.S)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = html.unescape(t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def clean(s):
    # 去掉夹在解析之间的站点导航面包屑
    s = re.split(r'\s*2026年考研英语一\s*(完形填空|阅读理解)', s)[0]
    s = s.split(FOOTER)[0]
    return s.strip()


def extract_cloze():
    """返回 {1..20: explanation}。段落形如「第 N 空正确答案 …」。"""
    t = visible_text('2026-jiexi-section1.html')
    out = {}
    for n in range(1, 21):
        start_pat = re.compile(r'第\s*%d\s*空正确答案' % n)
        m = start_pat.search(t)
        if not m:
            raise SystemExit(f'完形第 {n} 空解析定位失败')
        rest = t[m.start():]
        # 下一空的起点或页脚作为右边界
        nxt = re.search(r'第\s*%d\s*空正确答案' % (n + 1), rest) if n < 20 else None
        seg = rest[:nxt.start()] if nxt else rest
        out[n] = clean(seg)
    return out


def extract_reading(fname, q_lo, q_hi):
    """返回 {qnum: explanation}。段落形如「第 N 题…正确答案 …均可排除。」。"""
    t = visible_text(fname)
    out = {}
    for n in range(q_lo, q_hi + 1):
        m = re.search(r'第\s*%d\s*题[^。]*?正确答案' % n, t)
        if not m:
            raise SystemExit(f'{fname} 第 {n} 题解析定位失败')
        rest = t[m.start():]
        nxt = re.search(r'第\s*%d\s*题[^。]*?正确答案' % (n + 1), rest) if n < q_hi else None
        seg = rest[:nxt.start()] if nxt else rest
        out[n] = clean(seg)
    return out


def main():
    data = json.load(open(DATA, encoding='utf-8'))
    y = next(x for x in data if x['year'] == 2026)
    e1 = y['english1']

    # 完形
    cloze_exp = extract_cloze()
    for b in e1['cloze']['blanks']:
        b['explanation'] = cloze_exp[b['index']]

    # 阅读
    reading_files = {
        1: ('2026-jiexi-section2-part-a.html', 21, 25),
        2: ('2026-jiexi-section2-part-a-2.html', 26, 30),
        3: ('2026-jiexi-section2-part-a-3.html', 31, 35),
        4: ('2026-jiexi-section2-part-a-4.html', 36, 40),
    }
    for r in e1['reading']:
        tno = int(re.search(r'text(\d)', r['id']).group(1))
        fname, lo, hi = reading_files[tno]
        exp = extract_reading(fname, lo, hi)
        for q in r['questions']:
            qn = int(re.search(r'q(\d+)$', q['id']).group(1))
            q['explanation'] = exp[qn]

    with open(DATA, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # 校验
    print('cloze explanations:', sum(1 for b in e1['cloze']['blanks'] if b.get('explanation')))
    for r in e1['reading']:
        print(r['id'], 'exp=', sum(1 for q in r['questions'] if q.get('explanation')))
    print('sample cloze#1:', e1['cloze']['blanks'][0]['explanation'][:60])
    print('sample q21:', e1['reading'][0]['questions'][0]['explanation'][:60])


if __name__ == '__main__':
    main()
