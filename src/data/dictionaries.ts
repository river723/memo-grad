// src/data/dictionaries.ts
//
// 词库注册表。DictionaryScreen 列出这里的全部词库，用户选择后进入
// DictionaryBrowse 浏览对应词库。新增词库只需在 DICTIONARIES 追加一项。
//
// 网络版改造后：词库 wordCount 不再硬编码，改为由 DictionaryScreen 通过
// wordUtils.getLocalWordDictMeta() 异步获取并填充。注册表只保留稳定的
// 静态元信息（id / name / description）。

/** 单个词库的元信息。 */
export interface DictMeta {
  /** 唯一标识，路由参数用。 */
  id: string;
  /** 展示名称。 */
  name: string;
  /** 一句话简介。 */
  description: string;
  /**
   * 词条数量。DictionaryScreen 在 mount 时异步拉取真实值覆盖。
   * 注册表里写 0 即可——它只是「加载前」的兜底展示。
   */
  wordCount: number;
}

/**
 * 已注册词库列表。
 * 'local' 为内置的考研核心增强词库，词条数由后端 word_dict_versions.wordCount 提供。
 *
 * 新增词库时：1) 后端先在 word_dict_versions 建一行；2) 在此追加一项 DictMeta。
 */
export const DICTIONARIES: DictMeta[] = [
  {
    id: 'local',
    name: '考研核心词库',
    description: '内置增强词库,剔除了超简单初高中基础词、小众专业冷词、极少考察的古旧词汇，只保留真题有考察价值的词，含释义、例句、词源与记忆技巧，可离线浏览与查询。',
    wordCount: 0,
  },
];

/** 按 id 查找词库，未命中返回 undefined。 */
export function getDictionaryById(id: string): DictMeta | undefined {
  return DICTIONARIES.find((d) => d.id === id);
}
