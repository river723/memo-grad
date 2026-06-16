// src/screens/WordbankPickerScreen.tsx
//
// 从本地增强词典勾选单词，批量加入生词本。
// 数据来自 src/data/worddict.json，已包含词根、例句、易混词。

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Platform,
  TouchableOpacity,
  Alert,
  SafeAreaView,
} from 'react-native';
import {
  Card,
  Text,
  TextInput,
  Button,
  Chip,
} from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import { Word } from '../types';
import { getLocalWordDictWords } from '../utils/wordUtils';

type WordbankEntry = Omit<Word, 'id' | 'created_at' | 'updated_at'>;

type SortMode = 'alpha' | 'diffAsc' | 'diffDesc';

const SORT_LABEL: Record<SortMode, string> = {
  alpha: '字母',
  diffAsc: '难度↑',
  diffDesc: '难度↓',
};

const DIFF_COLORS: Record<number, string> = {
  1: '#4CAF50',
  2: '#8BC34A',
  3: '#FF9800',
  4: '#FF5722',
  5: '#F44336',
};

const ROW_HEIGHT = 72;
const PAGE_SIZE = 10;

// -----------------------------------------------------------------------
// 子级行组件（React.memo 隔离渲染）

interface WordRowProps {
  entry: WordbankEntry;
  isSelected: boolean;
  onToggle: (word: string) => void;
}

const WordRow = React.memo(function WordRow({
  entry,
  isSelected,
  onToggle,
}: WordRowProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onToggle(entry.word)}
      style={[styles.row, isSelected && styles.rowSelected]}
    >
      {/* 勾选 */}
      <View style={styles.checkCol}>
        {isSelected ? (
          <MaterialIcons name="check-box" size={22} color="#1976D2" />
        ) : (
          <MaterialIcons name="check-box-outline-blank" size={22} color="#9E9E9E" />
        )}
      </View>

      {/* 单词信息 */}
      <View style={styles.infoCol}>
        <View style={styles.wordLine}>
          <Text style={styles.word}>{entry.word}</Text>
          {entry.pronunciation_uk && (
            <Text style={styles.phonetic}> {entry.pronunciation_uk}</Text>
          )}
        </View>
        <Text style={styles.meaning} numberOfLines={1}>
          {entry.definitions[0]?.meaning || '暂无释义'}
        </Text>
      </View>

      {/* 难度 + 频率 */}
      <View style={styles.metaCol}>
        <Text style={[styles.diffBadge, { color: DIFF_COLORS[entry.difficulty] || '#999' }]}>
          {'★'.repeat(entry.difficulty)}{'☆'.repeat(5 - entry.difficulty)}
        </Text>
        <Text style={styles.freqBadge}>
          {'■'.repeat(entry.frequency)}{'□'.repeat(3 - entry.frequency)}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// -----------------------------------------------------------------------
// 主页面

export default function WordbankPickerScreen() {
  const navigation = useNavigation();
  const flatRef = useRef<FlatList>(null);

  // 数据
  const [list] = useState<WordbankEntry[]>(() => getLocalWordDictWords());
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // 筛选
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('alpha');

  // 分组
  const [group, setGroup] = useState(0);

  // 搜索防抖
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  // 每次聚焦时重新读取现有词本
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const words = await StorageService.getWords();
          setExisting(new Set(words.map((w) => w.word.toLowerCase())));
        } catch {
          // 词本为空时静默失败
          setExisting(new Set());
        }
      })();
    }, [])
  );

  // 第一层：筛选 + 搜索 + 排序（保留所有命中项）
  const sorted = useMemo(() => {
    let items = list;

    const q = debouncedQuery.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (e) =>
          e.word.toLowerCase().includes(q) ||
          (e.definitions[0]?.meaning || '').toLowerCase().includes(q)
      );
      items = items.slice().sort((a, b) => {
        const aStarts = a.word.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.word.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts;
      });
    }

    if (sortMode === 'diffAsc') {
      items = items.slice().sort((a, b) => a.difficulty - b.difficulty);
    } else if (sortMode === 'diffDesc') {
      items = items.slice().sort((a, b) => b.difficulty - a.difficulty);
    }
    // sortMode==='alpha' 维持 JSON 内置字母序

    return items;
  }, [list, debouncedQuery, sortMode]);

  // 第二层：剔除已在词本的词 → 候选池
  const pool = useMemo(
    () => sorted.filter((e) => !existing.has(e.word.toLowerCase())),
    [sorted, existing]
  );

  // 第三层：当前组（最多 10 个）
  const groupItems = useMemo(
    () => pool.slice(group * PAGE_SIZE, group * PAGE_SIZE + PAGE_SIZE),
    [pool, group]
  );

  const totalGroups = Math.max(1, Math.ceil(pool.length / PAGE_SIZE));
  const isLastGroup = group >= totalGroups - 1;

  // 筛选/搜索/排序变更 → 回到第 1 组
  useEffect(() => {
    setGroup(0);
  }, [debouncedQuery, sortMode]);

  // 加入后 pool 缩短可能让 group 越界 → 自动夹到合法范围
  useEffect(() => {
    if (group >= totalGroups) {
      setGroup(Math.max(0, totalGroups - 1));
    }
  }, [group, totalGroups]);

  // 当前组单词的 lowercase key 列表（全选用）
  const groupKeys = useMemo(
    () => groupItems.map((e) => e.word.toLowerCase()),
    [groupItems]
  );
  const allInGroupSelected =
    groupKeys.length > 0 && groupKeys.every((k) => selected.has(k));

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allInGroupSelected) {
        groupKeys.forEach((k) => next.delete(k));
      } else {
        groupKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  }, [groupKeys, allInGroupSelected]);

  // 切换勾选
  const toggle = useCallback((word: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = word.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // 下一组
  const nextGroup = useCallback(() => {
    if (isLastGroup) return;
    setGroup((g) => g + 1);
    flatRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [isLastGroup]);

  const keyExtractor = useCallback(
    (item: WordbankEntry) => item.word.toLowerCase(),
    []
  );

  const getItemLayout = useCallback(
    (_data: any, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    []
  );

  const renderRow = useCallback(
    ({ item }: { item: WordbankEntry }) => (
      <WordRow
        entry={item}
        isSelected={selected.has(item.word.toLowerCase())}
        onToggle={toggle}
      />
    ),
    [selected, toggle]
  );

  // 批量加入
  const addSelected = useCallback(async () => {
    if (!selected.size) return;

    setSaving(true);
    const lookup = new Map(list.map((e) => [e.word.toLowerCase(), e]));
    let success = 0;
    let fail = 0;
    const addedKeys: string[] = [];

    for (const wordKey of selected) {
      const entry = lookup.get(wordKey);
      if (!entry || existing.has(wordKey)) continue;
      try {
        await StorageService.addWord(entry);
        success++;
        addedKeys.push(wordKey);
      } catch {
        fail++;
      }
    }

    // 把刚加入的词追加到 existing → pool 自动收缩
    if (addedKeys.length) {
      setExisting((prev) => {
        const next = new Set(prev);
        addedKeys.forEach((k) => next.add(k));
        return next;
      });
    }
    setSelected(new Set());
    setSaving(false);

    const msg =
      `成功加入 ${success} 个单词到生词本` +
      (fail > 0 ? `，${fail} 个失败` : '');

    Alert.alert('完成 ✅', msg, [
      { text: '继续选词', style: 'default' },
      { text: '返回', onPress: () => navigation.goBack() },
    ]);
  }, [selected, list, existing, navigation]);

  const selectedCount = selected.size;

  return (
    <SafeAreaView style={styles.screen}>
      {/* 状态栏 */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          候选池 {pool.length} 词 · 第 {totalGroups === 0 ? 0 : group + 1}/{totalGroups} 组
        </Text>
        {selectedCount > 0 && (
          <Text style={styles.statusSelected}>· 已选 {selectedCount}</Text>
        )}
        <Text style={styles.statusExisting}>· 词本已有 {existing.size}</Text>
      </View>

      {/* 搜索框 */}
      <Card style={styles.searchCard}>
        <TextInput
          mode="flat"
          placeholder="搜索单词或释义..."
          value={query}
          onChangeText={setQuery}
          left={<TextInput.Icon icon="magnify" />}
          clearButtonMode="while-editing"
          style={styles.searchInput}
          autoCapitalize="none"
        />
      </Card>

      {/* 筛选 Chip 行 */}
      <View style={styles.chipRow}>
        <View style={styles.chipGroup}>
          <Text style={styles.chipGroupLabel}>排序</Text>
          {(['alpha', 'diffAsc', 'diffDesc'] as SortMode[]).map(
            (v) => (
              <Chip
                key={v}
                selected={sortMode === v}
                onPress={() => setSortMode(v)}
                style={styles.chip}
                mode="outlined"
                compact
              >
                {SORT_LABEL[v]}
              </Chip>
            )
          )}
        </View>
      </View>

      {/* 全选工具条 */}
      <View style={styles.groupHeader}>
        <Text style={styles.groupHeaderText}>
          本组 {groupItems.length} 个候选词
        </Text>
        <View style={{ flex: 1 }} />
        <Button
          mode="text"
          compact
          disabled={groupItems.length === 0}
          onPress={toggleSelectAll}
        >
          {allInGroupSelected ? '取消全选' : '全选本组'}
        </Button>
      </View>

      {/* 单词列表 */}
      <FlatList
        ref={flatRef}
        data={groupItems}
        renderItem={renderRow}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons
              name={debouncedQuery ? 'search-off' : 'library-books'}
              size={48}
              color="#CCC"
            />
            <Text style={styles.emptyText}>
              {debouncedQuery
                ? '没有找到匹配的单词'
                : pool.length === 0
                  ? '已浏览完所有候选词'
                  : '本组没有候选词'}
            </Text>
            <Text style={styles.emptyHint}>
              {debouncedQuery
                ? '试试其他搜索词'
                : pool.length === 0
                  ? '可调整筛选条件再继续'
                  : '试试调整筛选条件'}
            </Text>
          </View>
        }
      />

      {/* 底部固定按钮条 */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomHintWrap}>
          <Text style={styles.bottomHint}>
            💡 本地增强词典已包含词根、例句、易混词
          </Text>
        </View>
        <View style={styles.bottomBtnRow}>
          <Button
            mode="outlined"
            onPress={nextGroup}
            disabled={isLastGroup || saving}
            style={styles.nextBtn}
            icon="arrow-right"
          >
            下一组
          </Button>
          <Button
            mode="contained"
            onPress={addSelected}
            disabled={selectedCount === 0 || saving}
            loading={saving}
            style={styles.addBtn}
            icon="book-plus"
          >
            {saving
              ? '加入中...'
              : `加入生词本${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

// -----------------------------------------------------------------------
// StyleSheet

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },

  // 状态栏
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 8 : 4,
    paddingBottom: 6,
  },
  statusText: { fontSize: 13, color: '#666' },
  statusSelected: { fontSize: 13, color: '#1976D2' },
  statusExisting: { fontSize: 13, color: '#999' },

  // 搜索
  searchCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    elevation: 1,
    borderRadius: 8,
  },
  searchInput: {
    backgroundColor: 'transparent',
    fontSize: 15,
  },

  // 筛选行
  chipRow: {
    paddingHorizontal: 12,
    paddingBottom: 6,
    gap: 6,
  },
  chipGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  chipGroupLabel: { fontSize: 12, color: '#999', marginRight: 2 },
  chip: {
    height: 28,
  },

  // 列表
  list: {
    flex: 1,
    paddingHorizontal: 12,
  },

  // 行
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 8,
    backgroundColor: '#FFF',
    elevation: 1,
  },
  rowSelected: {
    backgroundColor: '#E3F2FD',
    elevation: 2,
  },
  checkCol: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
    paddingRight: 8,
  },
  wordLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  word: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  phonetic: {
    fontSize: 12,
    color: '#999',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  meaning: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  metaCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 70,
  },
  diffBadge: {
    fontSize: 11,
    lineHeight: 14,
  },
  freqBadge: {
    fontSize: 10,
    color: '#AAA',
    marginTop: 2,
  },

  // 空态
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 13,
    color: '#CCC',
    marginTop: 4,
  },

  // 底部按钮
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#FFF',
  },
  bottomHintWrap: {
    marginBottom: 8,
  },
  bottomHint: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
  bottomBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nextBtn: {
    borderRadius: 8,
  },
  addBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: Platform.OS === 'web' ? 6 : 4,
  },

  // 全选工具条
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  groupHeaderText: {
    fontSize: 12,
    color: '#666',
  },
});