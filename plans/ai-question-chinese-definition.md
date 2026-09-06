# 实现计划：AI 出题增加题干中文翻译

## 背景与需求（修正版）

AI 出题（释义单选 / 完形选词）在提交后查看该题时，缺**题干（英文句子）的中文翻译**：

- `DefinitionQuestion`（释义单选）：只有英文句子 + 英文释义选项，没有句子中文翻译。
- `ClozeQuestion`（完形选词）：已有 `chinese_hint`（句子中文大意/中文语境提示），但**AI题库套题详情**里没展示。

**需求**：
1. AI 出题时生成题干的完整中文翻译。
2. 在「提交后答题回顾 / AI题库 / 错题本」三处查看该题时，显示题干中文翻译。
3. 目标词的中文释义**不内联展示**，维持"点击目标词弹出释义卡片"的方式（错题本已有，其余两处补齐一致）。

**不在答题过程中展示**：对释义单选题而言，句子中文翻译会直接泄露答案。

## 方案

### 字段
- `DefinitionQuestion` 新增可选字段 `chinese_translation?: string`（题干完整中文翻译）。
- `ClozeQuestion` **复用**现有 `chinese_hint`（已是句子中文大意），不新增字段。

### 兼容性：零迁移
题目以 JSON 快照存储（AsyncStorage + Prisma Json，`exam_sessions.questions / answers / wrong_questions.question`）。可选字段向后兼容：旧数据缺字段时展示处隐藏该行；同步层把题目当不透明 JSON 直传，不受影响。`ExamDraft.version` 保持 1。

## 改动清单

### 1. 类型 [`src/types/index.ts`](../src/types/index.ts)
- `DefinitionQuestion` 增加 `chinese_translation?: string`
- （`ClozeQuestion` 不动，复用 `chinese_hint`）

### 2. AI 服务（在线）[`server/src/routes/aiRoutes.ts`](../server/src/routes/aiRoutes.ts)
- `generateDefinitionQuestions` prompt：JSON 模板加 `"chinese_translation":"题干的完整中文翻译"`，并说明是句子的逐句准确翻译。
- （完形已有 `chinese_hint`，不改）

### 3. AI 服务（离线）[`src/services/ai/localAIEngine.ts`](../src/services/ai/localAIEngine.ts)
- `generateDefinitionQuestions` prompt 加 `"chinese_translation":"题干的完整中文翻译"`，两处解析返回值各加 `chinese_translation: q.chinese_translation || ''`。

### 4. 出题透传 [`src/screens/ExamSetupScreen.tsx`](../src/screens/ExamSetupScreen.tsx)
- definition 分支构建 `DefinitionQuestion` 时加 `chinese_translation: q.chinese_translation || ''`。
- （cloze 分支已透传 `chinese_hint`，不动）

### 5. 展示：提交后答题回顾 [`src/screens/ExamResultScreen.tsx`](../src/screens/ExamResultScreen.tsx)
- 定义题：句子下方加一行 `题干译文：{chinese_translation}`（有值才显示）。
- 完形题：已有 `💡 chinese_hint` 展示，不变。
- 目标词行改成可点击 → 弹出生词释义卡片（`WordDictModal`）。

### 6. 展示：AI题库套题详情 [`src/screens/ExamSetDetailScreen.tsx`](../src/screens/ExamSetDetailScreen.tsx)
- `DefinitionReviewCard`：句子上方/下方加 `题干译文：{chinese_translation}`（有值才显示）。
- `ClozeReviewCard`：加 `题干译文：{chinese_hint}`（补齐当前缺失的展示）。
- 划线目标词（`SentenceBox` 里被高亮的那段）改成可点击 → 弹出生词释义卡片。

### 7. 展示：错题本 [`src/screens/WrongQuestionReviewScreen.tsx`](../src/screens/WrongQuestionReviewScreen.tsx)
- 定义题：`renderWordQuestionContent` 里句子下方加 `题干译文：{chinese_translation}`（有值才显示）。
- 完形题：已有 `💡 chinese_hint` 展示，不变。
- 目标词/正确答案 tag 点击弹出释义已具备，不动。

### 8. 目标词点击弹出释义（补齐两处一致性）
- 复用 `WrongQuestionReviewScreen` 的既有模式：`word_id` → `getWordById` 优先生词本，缺失时回落全局词库 `getLocalWordDictResult` 构造临时词 → `WordDictModal`。
- 应用到 `ExamResultScreen`（目标词行）与 `ExamSetDetailScreen`（句子中划线词段）。

## 验证

1. 在线模式出释义单选 → 每题都带题干中文翻译；完形 → `chinese_hint` 正常。
2. 离线模式（OFFLINE_MODE）出题 → 同上。
3. 提交后「答题回顾」/ AI题库套题详情 / 错题本三处均显示题干中文翻译。
4. 三处点击目标词都能弹出释义卡片。
5. 旧数据（无 `chinese_translation` 的历史 session / 错题）打开不报错，译文行隐藏。
6. 云端同步 pull/push 带新字段的 session → 字段完整透传。

## 非目标

- 答题过程中不展示任何中文（避免泄题）。
- 不为旧题目批量补译文（v1 隐藏处理；后续如需要可仿照 `generateRealExamExplanation` 做按需 AI 翻译）。
