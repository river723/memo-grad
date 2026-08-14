#!/usr/bin/env bash
# 真题内容 API 验证脚本。
# 跑法：服务器起来后（npm run dev）执行：
#   bash server/scripts/test_exam_api.sh
#
# 退出码：0 = 全部通过；非 0 = 有失败

set -uo pipefail

BASE="${BASE:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✅ $name (HTTP $actual)"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name (期望 $expected, 实际 $actual)"
    FAIL=$((FAIL+1))
  fi
}

echo "== 1. GET /api/exams/years =="
RESP=$(curl -s -o /tmp/exam_years.json -w "%{http_code}" "$BASE/api/exams/years")
check "years 200" "200" "$RESP"
YEAR_COUNT=$(grep -o '"year":[0-9]*' /tmp/exam_years.json | wc -l | tr -d ' ')
echo "  年份数=$YEAR_COUNT"

echo "== 2. GET /api/exams/2026/english1（整套卷） =="
RESP=$(curl -s -D /tmp/exam_paper_headers.txt -o /tmp/exam_paper.json -w "%{http_code}" "$BASE/api/exams/2026/english1")
check "paper 200" "200" "$RESP"
ETAG=$(grep -i '^etag:' /tmp/exam_paper_headers.txt | tr -d '\r' | awk '{print $2}')
READING_COUNT=$(grep -o '"id":"2026-e1-text[1-4]"' /tmp/exam_paper.json | wc -l | tr -d ' ')
echo "  etag=$ETAG  reading篇数=$READING_COUNT"

echo "== 3. GET /api/exams/2026/english1 with If-None-Match (期望 304) =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" -H "If-None-Match: $ETAG" "$BASE/api/exams/2026/english1")
check "paper 304" "304" "$RESP"

echo "== 4. GET /api/exams/2026/english1/reading =="
RESP=$(curl -s -o /tmp/exam_reading.json -w "%{http_code}" "$BASE/api/exams/2026/english1/reading")
check "reading 200" "200" "$RESP"

echo "== 5. GET /api/exams/2026/english1/cloze =="
RESP=$(curl -s -o /tmp/exam_cloze.json -w "%{http_code}" "$BASE/api/exams/2026/english1/cloze")
check "cloze 200" "200" "$RESP"
BLANKS=$(grep -o '"index":[0-9]*' /tmp/exam_cloze.json | wc -l | tr -d ' ')
echo "  空格数=$BLANKS"

echo "== 6. GET /api/exams/2026/english1/newtype =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/exams/2026/english1/newtype")
check "newtype 200" "200" "$RESP"

echo "== 7. GET /api/exams/2026/english1/translation =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/exams/2026/english1/translation")
check "translation 200" "200" "$RESP"

echo "== 8. GET /api/exams/2026/english1/writing =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/exams/2026/english1/writing")
check "writing 200" "200" "$RESP"

echo "== 9. GET /api/exams/questions/2026-e1-text1-q21（单题反查） =="
RESP=$(curl -s -o /tmp/exam_question.json -w "%{http_code}" "$BASE/api/exams/questions/2026-e1-text1-q21")
check "question 200" "200" "$RESP"
QSTEM=$(grep -o '"stem":"[^"]*"' /tmp/exam_question.json | head -1 | cut -c1-60)
echo "  $QSTEM..."

echo "== 10. GET /api/exams/questions/不存在的题 (期望 404) =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/exams/questions/1999-e1-text1-q99")
check "question 404" "404" "$RESP"

echo "== 11. GET /api/exams/1999/english1 (不存在年份，期望 404) =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/exams/1999/english1")
check "paper 404" "404" "$RESP"

echo "== 12. GET /api/exams/2026/english3 (非法 setId，期望 400) =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/exams/2026/english3")
check "setId 400" "400" "$RESP"

echo
echo "=================================="
echo "通过: $PASS    失败: $FAIL"
echo "=================================="
exit $FAIL
