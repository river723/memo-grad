// src/data/dictionaries.ts
//
// 词库注册表。DictionaryScreen 列出这里的全部词库，用户选择后进入
// DictionaryBrowse 浏览对应词库。新增词库只需在 DICTIONARIES 追加一项。
// 目前数据源统一为本地增强词典 worddict.json（经 wordUtils 读取）。

import worddictJson from './worddict.json';
import { WordDictJson } from '../types';

const worddict = worddictJson as WordDictJson;

/** 单个词库的元信息。 */
export interface DictMeta {
  /** 唯一标识，路由参数用。 */
  id: string;
  /** 展示名称。 */
  name: string;
  /** 一句话简介。 */
  description: string;
  /** 词条数量，用于卡片角标展示。 */
  wordCount: number;
}

/**
 * 已注册词库列表。
 * 'local' 为内置的考研核心增强词库，词条数取自 worddict.json。
 */
export const DICTIONARIES: DictMeta[] = [
  {
    id: 'local',
    name: '考研核心词库',
    description: '内置增强词库，含释义、例句、词源与记忆技巧，可离线浏览与查询。',
    wordCount: Object.keys(worddict.results).length,
  },
];

/** 按 id 查找词库，未命中返回 undefined。 */
export function getDictionaryById(id: string): DictMeta | undefined {
  return DICTIONARIES.find((d) => d.id === id);
}
