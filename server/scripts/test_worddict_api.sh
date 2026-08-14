#!/usr/bin/env bash
# 词库 API 验证脚本。
# 跑法：服务器起来后（npm run dev）执行：
#   bash server/scripts/test_worddict_api.sh
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

echo "== 1. GET /api/worddict/meta =="
RESP=$(curl -s -o /tmp/worddict_meta.json -w "%{http_code}" "$BASE/api/worddict/meta")
check "meta 200" "200" "$RESP"
ETAG=$(curl -s -D - "$BASE/api/worddict/meta" -o /dev/null | grep -i '^etag:' | tr -d '\r' | awk '{print $2}')
WORD_COUNT=$(grep -o '"wordCount":[0-9]*' /tmp/worddict_meta.json | head -1 | cut -d: -f2)
echo "  etag=$ETAG  wordCount=$WORD_COUNT"

echo "== 2. GET /api/worddict/meta with If-None-Match (期望 304) =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" -H "If-None-Match: $ETAG" "$BASE/api/worddict/meta")
check "meta 304" "304" "$RESP"

echo "== 3. GET /api/worddict/words/abandon =="
RESP=$(curl -s -o /tmp/worddict_abandon.json -w "%{http_code}" "$BASE/api/worddict/words/abandon")
check "abandon 200" "200" "$RESP"
MEANING=$(grep -o '"meaning":"[^"]*"' /tmp/worddict_abandon.json | head -1)
echo "  $MEANING"

echo "== 4. GET /api/worddict/words/NotARealWord (期望 404) =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/worddict/words/zzznotaword")
check "404" "404" "$RESP"

echo "== 5. GET /api/worddict/by-letter/a =="
RESP=$(curl -s -o /tmp/worddict_a.json -w "%{http_code}" "$BASE/api/worddict/by-letter/a")
check "by-letter 200" "200" "$RESP"
A_COUNT=$(grep -o '"count":[0-9]*' /tmp/worddict_a.json | head -1 | cut -d: -f2)
echo "  a 开头词条数=$A_COUNT"

echo "== 6. GET /api/worddict/by-letter/1 (非法前缀，期望 400) =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/worddict/by-letter/1")
check "400" "400" "$RESP"

echo "== 7. GET /api/worddict/full (首字节) =="
# /full 是 4.79 MB；这里只验证 200 + cache-control，不下载完整 body
RESP=$(curl -s -o /dev/null -w "%{http_code}" -r 0-0 "$BASE/api/worddict/full")
check "full 200" "200" "$RESP"
curl -s -D - -o /dev/null "$BASE/api/worddict/full" -r 0-0 | grep -iE '^(etag|cache-control):' | sed 's/^/  /'

echo "== 8. GET /api/worddict/full with If-None-Match (期望 304) =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" -H "If-None-Match: $ETAG" -r 0-0 "$BASE/api/worddict/full")
check "full 304" "304" "$RESP"

echo "== 9. GET /api/worddict/versions/不存在的版本 (期望 404) =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/worddict/versions/zzznotaversion/words")
check "version 404" "404" "$RESP"

echo
echo "=================================="
echo "通过: $PASS    失败: $FAIL"
echo "=================================="
exit $FAIL
