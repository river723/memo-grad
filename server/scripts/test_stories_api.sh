#!/usr/bin/env bash
# 系列故事 API 验证脚本。
# 跑法：服务器起来后（npm run dev）执行：
#   bash server/scripts/test_stories_api.sh
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

# 先拿到 story id
echo "== 0. 找 series =="
STORY_ID=$(npx tsx -e "import { PrismaClient } from '@prisma/client'; const p = new PrismaClient(); p.story.findFirst().then(s => { console.log(s.id); return p.\$disconnect(); });" 2>/dev/null | tail -1)
if [[ -z "$STORY_ID" ]]; then
  echo "  ❌ 找不到 story 行，请先跑 seed_stories"
  exit 1
fi
echo "  storyId=$STORY_ID"

echo "== 1. GET /api/stories/:storyId（列表，不含正文） =="
RESP=$(curl -s -D /tmp/story_headers.txt -o /tmp/story_meta.json -w "%{http_code}" "$BASE/api/stories/$STORY_ID")
check "meta 200" "200" "$RESP"
ETAG=$(grep -i '^etag:' /tmp/story_headers.txt | tr -d '\r' | awk '{print $2}')
CH_COUNT=$(grep -o '"chapterId":[0-9]*' /tmp/story_meta.json | wc -l | tr -d ' ')
echo "  etag=$ETAG  章节数=$CH_COUNT"

echo "== 2. GET /api/stories/:storyId with If-None-Match (期望 304) =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" -H "If-None-Match: $ETAG" "$BASE/api/stories/$STORY_ID")
check "meta 304" "304" "$RESP"

echo "== 3. GET /api/stories/:storyId/chapters/1 =="
RESP=$(curl -s -o /tmp/story_ch1.json -w "%{http_code}" "$BASE/api/stories/$STORY_ID/chapters/1")
check "chapter 200" "200" "$RESP"
TITLE=$(grep -o '"title":"[^"]*"' /tmp/story_ch1.json | head -1)
echo "  $TITLE"

echo "== 4. GET /api/stories/:storyId/chapters/99 (期望 404) =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/stories/$STORY_ID/chapters/99")
check "chapter 404" "404" "$RESP"

echo "== 5. GET /api/stories/:storyId/chapters/abc (非法，期望 400) =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/stories/$STORY_ID/chapters/abc")
check "chapter 400" "400" "$RESP"

echo "== 6. GET /api/stories/:storyId/full（全量） =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" -r 0-0 "$BASE/api/stories/$STORY_ID/full")
check "full 200" "200" "$RESP"
curl -s -D - -o /dev/null -r 0-0 "$BASE/api/stories/$STORY_ID/full" | grep -iE '^(etag|cache-control|content-length):' | sed 's/^/  /'

echo "== 7. GET /api/stories/:storyId/full with If-None-Match (期望 304) =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" -H "If-None-Match: $ETAG" -r 0-0 "$BASE/api/stories/$STORY_ID/full")
check "full 304" "304" "$RESP"

echo "== 8. GET /api/stories/不存在的id (期望 404) =="
RESP=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/stories/zzz-not-exist")
check "story 404" "404" "$RESP"

echo
echo "=================================="
echo "通过: $PASS    失败: $FAIL"
echo "=================================="
exit $FAIL
