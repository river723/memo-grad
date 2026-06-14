# scripts/

构建运行时静态资源的脚本，**不参与 App 打包，也不影响运行时依赖**。

## build-wordbank.js — 生成考研本地词库

把 [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT) (MIT) 的 `ecdict.csv` 拉下来，筛出 `tag` 含 `ky` 的考研词条，重塑为 [src/types/index.ts](../src/types/index.ts) 中 `Word` 类型的形状，输出到 `src/data/wordbank.json`。

### 用法

```bash
# 增量：缓存的 csv 已存在则跳过下载
node scripts/build-wordbank.js

# 强制重新下载 ecdict.csv（约 63 MB）
node scripts/build-wordbank.js --refresh

# 调试：输出带缩进的 JSON（默认每条一行，方便 git diff）
node scripts/build-wordbank.js --pretty
```

### 产物

| 文件 | 说明 |
|---|---|
| `scripts/raw/ecdict.csv` | 下载缓存，约 63 MB，**不入版本库**（`.gitignore` 屏蔽）|
| `src/data/wordbank.json` | 约 1.2 MB，~4800 条考研词，入版本库随 bundle 打包 |

### 字段映射

ECDICT 字段 → `Word` / `WordDefinition`：

- `word` → `word`（全大写普通词如 `CORE/FAX/TV` 转小写；`Christ/God` 等专有名词保留）
- `phonetic` → `pronunciation_uk` 与 `pronunciation_us`（同值）
- `translation`（按 `\n` 拆行）→ 每行一条 `WordDefinition`，行首 `n./vt./a.` 等抽出为 `part_of_speech`
- `pos`（如 `n:80/v:20`）→ 译文无词性前缀时的 fallback 词性
- `tag` → 含 `ky` 才保留
- `bnc` → `frequency`（≤2000=3 高频，≤5000=2 中频，其它=1 低频）
- `collins`（5★=最常用 → 1★=罕见）→ `difficulty`（4★+→2，3★→3，1-2★→4；缺失时按 BNC 回退）

被丢弃的释义：开头是 `[计]/[医]/[法]/[化]/[经]/[机]/[电]/[建]/[生]/[军]/...` 等学科标签的专业释义；`bear的过去式` 之类时态说明。

### 不生成的字段

`id` / `created_at` / `updated_at` / `is_core` / `is_rare_sense` / `example` / `etymology` / `similar_words`（空数组）。这些在用户从词库选词加入生词本时由 [`StorageService.addWord`](../src/services/StorageService.ts) 自动补 `id`/时间戳，例句和词根等可后续走 AI 分析补全。

### 可重复性

脚本不使用 `Date.now()` / `Math.random()` 等随机源；同一份输入 CSV 跑两次 MD5 一致。如果产物 diff 异常，先确认 `ecdict.csv` 是否被 `--refresh` 覆盖过。

### 数据源许可

ECDICT 项目采用 MIT 协议，可自由用于商业和非商业项目。词库本身的释义来自公开词典数据。详见 https://github.com/skywind3000/ECDICT 。
