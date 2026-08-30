// src/screens/WordbankPickerScreen.tsx
//
// 从本地增强词典勾选单词，批量加入生词本。
// 数据来自 src/data/worddict.json，已包含词根、例句、易混词。

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  Platform,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Modal,
} from 'react-native';
import {
  Card,
  Text,
  TextInput,
  Button,
  Chip,
  Surface,
} from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation } from '../navigation/types';
import StorageService from '../services/StorageService';
import { Word } from '../types';
import { getLocalWordDictWords } from '../utils/wordUtils';
import { palette } from '../theme/tokens';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { showConfirm } from '../providers/ConfirmDialogProvider';

type WordbankEntry = Omit<Word, 'id' | 'created_at' | 'updated_at'>;

type SortMode = 'shuffle' | 'alpha' | 'diffAsc' | 'diffDesc' | 'freqAsc' | 'freqDesc';

const SORT_LABEL: Record<SortMode, string> = {
  shuffle: '乱序',
  alpha: '字母',
  diffAsc: '难度↑',
  diffDesc: '难度↓',
  freqAsc: '频度↑',
  freqDesc: '频度↓',
};

const SORT_ORDER: SortMode[] = ['shuffle', 'alpha', 'diffAsc', 'diffDesc', 'freqAsc', 'freqDesc'];

const DIFF_COLORS: Record<number, string> = {
  1: palette.success,
  2: palette.accent,
  3: palette.accent,
  4: palette.danger,
  5: palette.danger,
};

const ROW_HEIGHT = 72;
const PAGE_SIZE = 10;
const FREQ_MAX = 5;

const confirmAction = (
  title: string,
  message: string,
  onConfirm: () => void | Promise<void>,
  confirmText = '确认'
) => {
  showConfirm(title, message, { confirmText, cancelText: '取消' })
    .then(yes => {
      if (yes) {
        try { onConfirm(); } catch (e) { console.error('[confirmAction] 执行失败:', e); }
      }
    })
    .catch(err => console.error('[confirmAction] 弹窗失败:', err));
};

// -----------------------------------------------------------------------
// 子级行组件（React.memo 隔离渲染）

interface WordRowProps {
  entry: WordbankEntry;
  isSelected: boolean;
  onToggle: (word: string) => void;
  onIgnore: (word: string) => void;
}

const WordRow = React.memo(function WordRow({
  entry,
  isSelected,
  onToggle,
  onIgnore,
}: WordRowProps) {
  const styles = useStyles();
  // frequency / difficulty 均可能超出徽章档位，钳制后再 repeat，避免负数抛 RangeError
  const freqFilled = Math.max(0, Math.min(FREQ_MAX, entry.frequency || 0));
  const diffFilled = Math.max(0, Math.min(5, entry.difficulty || 0));
  return (
    <View style={[styles.row, isSelected && styles.rowSelected]}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onToggle(entry.word)}
        style={styles.rowContent}
      >
        {/* 勾选 */}
        <View style={styles.checkCol}>
          <View style={[
            styles.checkbox,
            isSelected && styles.checkboxChecked
          ]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
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
            {'★'.repeat(diffFilled)}{'☆'.repeat(5 - diffFilled)}
          </Text>
          <Text style={styles.freqBadge}>
            {'■'.repeat(freqFilled)}{'□'.repeat(FREQ_MAX - freqFilled)}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onIgnore(entry.word)}
        style={styles.ignorePill}
      >
        <Text style={styles.ignorePillText}>忽略</Text>
      </TouchableOpacity>
    </View>
  );
});

// -----------------------------------------------------------------------
// 主页面

export default function WordbankPickerScreen() {
  const navigation = useAppNavigation();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const flatRef = useRef<FlatList>(null);

  // 数据。异步加载：词库现在从后端拉取，加载前为空列表。
  const [list, setList] = useState<WordbankEntry[]>([]);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // 拉取词库全量列表（首次进入时加载一次）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const words = await getLocalWordDictWords();
        if (!cancelled) setList(words);
      } catch (err) {
        console.warn('[WordbankPicker] 拉取词库列表失败：', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 筛选
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('alpha');
  const [showSortModal, setShowSortModal] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);

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
          const [words, ignoredWords] = await Promise.all([
            StorageService.getWords(),
            StorageService.getIgnoredWordbankWords(),
          ]);
          setExisting(new Set(words.map((w) => w.word.toLowerCase())));
          setIgnored(new Set(ignoredWords));
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
    } else if (sortMode === 'freqAsc') {
      items = items.slice().sort((a, b) => a.frequency - b.frequency);
    } else if (sortMode === 'freqDesc') {
      items = items.slice().sort((a, b) => b.frequency - a.frequency);
    } else if (sortMode === 'shuffle' && !q) {
      // 乱序：Fisher-Yates 洗牌，shuffleSeed 变化时重新打乱
      items = items.slice();
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
    }
    // sortMode==='alpha' 维持 JSON 内置字母序

    return items;
  }, [list, debouncedQuery, sortMode, shuffleSeed]);

  // 第二层：剔除已在词本和已忽略的词 → 候选池
  const pool = useMemo(
    () => sorted.filter((e) => {
      const key = e.word.toLowerCase();
      return !existing.has(key) && !ignored.has(key);
    }),
    [sorted, existing, ignored]
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
  const unselectedGroupKeys = useMemo(
    () => groupKeys.filter((k) => !selected.has(k)),
    [groupKeys, selected]
  );

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

  // 忽略不想再推荐的词
  const ignoreWords = useCallback(async (wordKeys: string[]) => {
    if (!wordKeys.length) return;

    await StorageService.addIgnoredWordbankWords(wordKeys);
    setIgnored((prev) => {
      const next = new Set(prev);
      wordKeys.forEach((k) => next.add(k));
      return next;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      wordKeys.forEach((k) => next.delete(k));
      return next;
    });
  }, []);

  const ignoreWord = useCallback((word: string) => {
    ignoreWords([word.toLowerCase()]);
  }, [ignoreWords]);

  const ignoreUnselectedGroup = useCallback(() => {
    if (!unselectedGroupKeys.length) return;
    confirmAction(
      '忽略本组未选词？',
      `将不再推荐本组未勾选的 ${unselectedGroupKeys.length} 个单词`,
      () => ignoreWords(unselectedGroupKeys),
      '忽略'
    );
  }, [ignoreWords, unselectedGroupKeys]);

  const clearIgnored = useCallback(() => {
    if (!ignored.size) return;
    confirmAction(
      '恢复已忽略单词？',
      `将恢复 ${ignored.size} 个已忽略单词的推荐`,
      async () => {
        await StorageService.clearIgnoredWordbankWords();
        setIgnored(new Set());
      },
      '恢复'
    );
  }, [ignored]);

  // 上一组
  const prevGroup = useCallback(() => {
    if (group <= 0) return;
    setGroup((g) => Math.max(0, g - 1));
    flatRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [group]);

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
        onIgnore={ignoreWord}
      />
    ),
    [selected, toggle, ignoreWord]
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
        {ignored.size > 0 && (
          <TouchableOpacity onPress={clearIgnored}>
            <Text style={styles.statusIgnored}>· 已忽略 {ignored.size}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 搜索框 */}
      <Card style={styles.searchCard} elevation={0}>
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
          <Chip
            icon="sort"
            onPress={() => setShowSortModal(true)}
            style={styles.chip}
            mode="outlined"
            compact
          >
            {SORT_LABEL[sortMode]}
          </Chip>
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
          disabled={unselectedGroupKeys.length === 0}
          onPress={ignoreUnselectedGroup}
        >
          忽略本组未选
        </Button>
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
            <Text style={styles.emptyIcon}>{debouncedQuery ? '🔍' : '📚'}</Text>
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
            onPress={prevGroup}
            disabled={group === 0 || saving}
            style={styles.pageBtn}
            icon="arrow-left"
            contentStyle={styles.pageBtnContent}
          >
            上一组
          </Button>
          <Button
            mode="outlined"
            onPress={nextGroup}
            disabled={isLastGroup || saving}
            style={styles.pageBtn}
            icon="arrow-right"
            contentStyle={styles.pageBtnContent}
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

      {/* 排序选择弹窗 */}
      <Modal
        visible={showSortModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSortModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSortModal(false)}
        >
          <TouchableOpacity activeOpacity={1}>
            <Surface style={styles.sortModalContent} elevation={0}>
              <Text style={styles.sortModalTitle}>排序方式</Text>
              {SORT_ORDER.map((mode) => {
                const active = sortMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    style={styles.sortOption}
                    onPress={() => {
                      // 已在乱序时再次点击 → 重新洗牌
                      if (mode === 'shuffle') {
                        setShuffleSeed((s) => s + 1);
                      }
                      setSortMode(mode);
                      setShowSortModal(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name="check"
                      size={20}
                      color={active ? colors.primary : 'transparent'}
                    />
                    <Text
                      style={[
                        styles.sortOptionText,
                        active && styles.sortOptionTextActive,
                      ]}
                    >
                      {SORT_LABEL[mode]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </Surface>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// -----------------------------------------------------------------------
// StyleSheet

const useStyles = makeStyles(colors => ({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // 状态栏
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 8 : 4,
    paddingBottom: 6,
  },
  statusText: { fontSize: 13, color: colors.onSurfaceVariant },
  statusSelected: { fontSize: 13, color: colors.primary },
  statusExisting: { fontSize: 13, color: colors.tertiary },
  statusIgnored: { fontSize: 13, color: colors.warning },

  // 搜索
  searchCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.outline,
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
  chipGroupLabel: { fontSize: 12, color: colors.tertiary, marginRight: 2 },
  chip: {
    height: 28,
  },

  // 排序弹窗
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortModalContent: {
    width: 240,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
  },
  sortModalTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: colors.onSurfaceVariant,
    paddingHorizontal: 20,
    paddingBottom: 8,
    paddingTop: 4,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  sortOptionText: {
    fontSize: 16,
    color: colors.onSurface,
  },
  sortOptionTextActive: {
    color: colors.primary,
    fontWeight: 'bold',
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
    marginBottom: 4,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outline,
    overflow: 'hidden',
  },
  rowContent: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 6,
  },
  rowSelected: {
    backgroundColor: colors.primaryContainer,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  checkCol: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: colors.tertiary,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: 'bold',
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
    color: colors.onSurface,
  },
  phonetic: {
    fontSize: 12,
    color: colors.tertiary,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  meaning: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
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
    color: colors.tertiary,
    marginTop: 2,
  },
  ignorePill: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: palette.accentLight,
  },
  ignorePillText: {
    fontSize: 12,
    color: colors.warning,
  },

  // 空态
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    fontSize: 48,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: 15,
    color: colors.tertiary,
    marginTop: 12,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.tertiary,
    marginTop: 4,
  },

  // 底部按钮
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.outline,
    backgroundColor: colors.surface,
  },
  bottomHintWrap: {
    marginBottom: 8,
  },
  bottomHint: {
    fontSize: 12,
    color: colors.tertiary,
    textAlign: 'center',
  },
  bottomBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageBtn: {
    borderRadius: 8,
  },
  pageBtnContent: {
    flexDirection: 'row-reverse',
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
    color: colors.onSurfaceVariant,
  },
}));