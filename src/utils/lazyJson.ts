/**
 * 按需加载打包进应用的大 JSON 数据（worddict / realExams / stories 的本地 fallback）。
 *
 * 这几个文件动辄数 MB，若用静态 `import x from '../data/x.json'` 会被
 * webpack/Metro 直接内联进主包，拖慢首屏解析与执行。改成动态 `import()`
 * 后 webpack 会拆成独立 chunk 按需加载，在线场景根本不会下载。
 *
 * 动态 import 的返回形态跨打包器不一致：
 * - webpack（Expo web / Tauri 离线包）：把 JSON 包成 ES 模块，取 `.default`
 * - Metro（iOS/Android）：把 JSON 当 CommonJS，import() 直接回给数据本身
 * 这里两种形态都兜住。
 */
export async function loadJson<T>(importer: () => Promise<unknown>): Promise<T> {
  const mod = await importer();
  const m = mod as { default?: T };
  if (m && typeof m === 'object' && m.default !== undefined) {
    return m.default;
  }
  return mod as T;
}
