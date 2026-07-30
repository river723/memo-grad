# -*- coding: utf-8 -*-
"""批量下载 2017-2026 考研英语一/二真题页面（完形 + 阅读 Part A）。

对每年每套：
  1. 下载落地页 /kaoyan/paper/{year}-english-{one|two}/
  2. 从中提取 section1（完形）与 section2-part-a[-N]（阅读）分节链接
  3. 下载每个分节的「题目页」(/paper/) 与「解析页」(/sections/)
所有 HTML 存到 scripts/raw/exams/。幂等：已存在且非空的文件跳过。
"""
import os
import re
import time
import urllib.request

BASE = 'https://english-exam.lazynote.cn'
OUT = os.path.join(os.path.dirname(__file__), 'raw', 'exams')
os.makedirs(OUT, exist_ok=True)

YEARS = list(range(2010, 2027))
SETS = ['english-one', 'english-two']

UA = {'User-Agent': 'Mozilla/5.0 (batch-exam-fetch)'}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', errors='replace')


def save(name, text):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write(text)


def cached(name):
    p = os.path.join(OUT, name)
    return os.path.exists(p) and os.path.getsize(p) > 2000


def get(url, name):
    """下载 url 存到 name；已缓存则读回。返回 HTML 文本。"""
    p = os.path.join(OUT, name)
    if cached(name):
        return open(p, encoding='utf-8').read()
    html = fetch(url)
    save(name, html)
    time.sleep(0.4)
    return html


def section_slugs(landing_html, setslug):
    """从落地页提取完形与阅读 Part A 的分节 slug（去重、保序）。"""
    hrefs = re.findall(r'href="(/kaoyan/paper/%s/[^"]+)"' % re.escape(setslug), landing_html)
    slugs = []
    for h in hrefs:
        m = re.match(r'/kaoyan/paper/%s/([^/]+)/?$' % re.escape(setslug), h)
        if not m:
            continue
        s = m.group(1)
        if s == 'section1' or re.match(r'section2-part-a(-\d+)?$', s):
            if s not in slugs:
                slugs.append(s)
    return slugs


# 新题型 / 翻译 / 写作分节 slug（按套别固定）。仅对 NEW_YEARS 抓取。
NEW_YEARS = list(range(2010, 2027))
EXTRA_SLUGS = {
    'english-one': ['section2-part-b', 'section2-part-c', 'section3-part-a', 'section3-part-b'],
    'english-two': ['section2-part-b', 'section3', 'section-iv-part-a', 'section-iv-part-b'],
}


def fetch_extra():
    """抓取新题型/翻译/写作分节的题目页与解析页（幂等）。"""
    for year in NEW_YEARS:
        for setslug in SETS:
            for slug in EXTRA_SLUGS[setslug]:
                purl = f'{BASE}/kaoyan/paper/{year}-{setslug}/{slug}/'
                pname = f'{year}-{setslug}-{slug}-paper.html'
                jurl = f'{BASE}/kaoyan/sections/{year}-{setslug}/{slug}/'
                jname = f'{year}-{setslug}-{slug}-jiexi.html'
                for url, name in [(purl, pname), (jurl, jname)]:
                    try:
                        get(url, name)
                    except Exception as e:
                        print(f'  ! {name} failed: {e}')


def main():
    manifest = []
    for year in YEARS:
        for setslug in SETS:
            landing_url = f'{BASE}/kaoyan/paper/{year}-{setslug}/'
            landing_name = f'{year}-{setslug}-landing.html'
            try:
                landing = get(landing_url, landing_name)
            except Exception as e:
                print(f'  ! landing {year}-{setslug} failed: {e}')
                continue
            slugs = section_slugs(landing, f'{year}-{setslug}')
            print(f'{year}-{setslug}: {slugs}')
            for slug in slugs:
                # 题目页
                purl = f'{BASE}/kaoyan/paper/{year}-{setslug}/{slug}/'
                pname = f'{year}-{setslug}-{slug}-paper.html'
                # 解析页
                jurl = f'{BASE}/kaoyan/sections/{year}-{setslug}/{slug}/'
                jname = f'{year}-{setslug}-{slug}-jiexi.html'
                for url, name in [(purl, pname), (jurl, jname)]:
                    try:
                        get(url, name)
                    except Exception as e:
                        print(f'  ! {name} failed: {e}')
            manifest.append((year, setslug, slugs))
    # 新题型 / 翻译 / 写作分节（仅 NEW_YEARS，slug 固定）
    fetch_extra()
    # 记 manifest
    with open(os.path.join(OUT, '_manifest.txt'), 'w', encoding='utf-8') as f:
        for year, setslug, slugs in manifest:
            f.write(f'{year}\t{setslug}\t{",".join(slugs)}\n')
    print('done. files in', OUT)


if __name__ == '__main__':
    main()
