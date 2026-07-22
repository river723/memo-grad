# -*- coding: utf-8 -*-
"""将 2026 考研英语一真题（完形 + 4 篇阅读）追加进 src/data/realExams.json。

数据来源：lazynote 站点的 section1 / section2-part-a[-2/-3/-4] 试卷排版页，
已由 curl 下载到 scripts/raw/2026-*.html。本脚本从这些 HTML 提取纯文本后解析。
"""
import json
import re
import html
import os

RAW = os.path.join(os.path.dirname(__file__), 'raw')
DATA = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'realExams.json')

# 客观题参考答案（来自整卷客观题答案速查表）
CLOZE_ANS = list('ADBCBCADDDDDCABCCBBA')  # 1..20
READING_ANS = {
    'text1': list('CDABB'),   # 21-25
    'text2': list('DABCA'),   # 26-30
    'text3': list('AACBD'),   # 31-35
    'text4': list('DCBDC'),   # 36-40
}


def visible_text(fname):
    h = open(os.path.join(RAW, fname), encoding='utf-8').read()
    t = re.sub(r'<script.*?</script>', '', h, flags=re.S)
    t = re.sub(r'<style.*?</style>', '', t, flags=re.S)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = html.unescape(t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def slice_paper(t):
    """截取「试卷原卷」到「选文出处」之间的正文。"""
    i = t.find('试卷原卷')
    j = t.find('选文出处')
    if j == -1:
        j = t.find('本页数据最后更新')
    return t[i:j]


def opt_prefix(letter, body):
    return f'{letter}) {body.strip()}'


# ---------- 完形填空 ----------
def build_cloze():
    t = slice_paper(visible_text('2026-section1.html'))
    # 正文在 "(10 points)" 之后、第一题 "1. [ A ]" 之前
    body_start = t.find('(10 points)') + len('(10 points)')
    q_start = t.find('1. [')
    passage = t[body_start:q_start].strip()
    # 将正文中作为空格标记的独立数字 1..20 依次替换为 [n]
    for n in range(1, 21):
        passage = re.sub(r'(?<!\[)\b%d\b(?!\])' % n, '[%d]' % n, passage, count=1)

    # 解析选项区：形如 "1. [ A ] Still [ B ] Therefore [ C ] Afterward [ D ] Instead"
    opts_region = t[q_start:]
    blanks = []
    for n in range(1, 21):
        pat = re.compile(
            r'%d\.\s*\[ A \](.*?)\[ B \](.*?)\[ C \](.*?)\[ D \](.*?)(?=\s*%d\.\s*\[ A \]|$)'
            % (n, n + 1)
        )
        m = pat.search(opts_region)
        if not m:
            raise SystemExit(f'完形第 {n} 题选项解析失败')
        a, b, c, d = (x.strip() for x in m.groups())
        blanks.append({
            'index': n,
            'options': [opt_prefix('A', a), opt_prefix('B', b),
                        opt_prefix('C', c), opt_prefix('D', d)],
            'answer': CLOZE_ANS[n - 1],
        })
    return {'id': '2026-e1-cloze', 'passage': passage, 'blanks': blanks}


# ---------- 阅读理解 ----------
def build_reading(fname, text_no, q_lo, q_hi):
    t = slice_paper(visible_text(fname))
    body_start = t.find('(40 points)') + len('(40 points)')
    region = t[body_start:]
    # 去掉开头的 "Text N" 标签
    region = re.sub(r'^\s*Text\s*\d+\s*', '', region)
    q_start = region.find(f'{q_lo}.')
    passage = region[:q_start].strip()

    qs_region = region[q_start:]
    questions = []
    ans = READING_ANS[f'text{text_no}']
    for i, n in enumerate(range(q_lo, q_hi + 1)):
        nxt = n + 1
        end_pat = r'(?=\s*%d\.\s)' % nxt if n < q_hi else r'$'
        pat = re.compile(
            r'%d\.\s*(.*?)\[ A \](.*?)\[ B \](.*?)\[ C \](.*?)\[ D \](.*?)%s'
            % (n, end_pat), re.S)
        m = pat.search(qs_region)
        if not m:
            raise SystemExit(f'阅读第 {n} 题解析失败')
        stem, a, b, c, d = (x.strip() for x in m.groups())
        questions.append({
            'id': f'2026-e1-text{text_no}-q{n}',
            'stem': stem,
            'options': [opt_prefix('A', a), opt_prefix('B', b),
                        opt_prefix('C', c), opt_prefix('D', d)],
            'answer': ans[i],
        })
    return {'id': f'2026-e1-text{text_no}', 'title': f'Text {text_no}',
            'passage': passage, 'questions': questions}


def main():
    cloze = build_cloze()
    readings = [
        build_reading('2026-section2-part-a.html', 1, 21, 25),
        build_reading('2026-section2-part-a-2.html', 2, 26, 30),
        build_reading('2026-section2-part-a-3.html', 3, 31, 35),
        build_reading('2026-section2-part-a-4.html', 4, 36, 40),
    ]

    entry = {
        'year': 2026,
        'english1': {'reading': readings, 'cloze': cloze},
        'english2': {'reading': [], 'cloze': None},
    }

    path = os.path.abspath(DATA)
    data = json.load(open(path, encoding='utf-8'))
    data = [y for y in data if y['year'] != 2026]  # 幂等：先移除旧的 2026
    data.append(entry)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # 校验输出
    print('cloze blanks:', len(cloze['blanks']))
    print('cloze passage placeholders:',
          len(re.findall(r'\[\d+\]', cloze['passage'])))
    for r in readings:
        print(r['id'], 'q=', len(r['questions']),
              'passage words=', len(r['passage'].split()))
    print('written to', path)


if __name__ == '__main__':
    main()
