// src/screens/DictionaryScreen.tsx
//
// 词库选择页（底部 Tab「词库」首页）。
// 列出所有可用词库，用户选择一个词库「打开」后进入浏览/查询页。
// 数据源为 src/data/dictionaries.ts 注册表，新增词库只需追加一项。
//
// 网络版改造后：wordCount 由 wordUtils.getLocalWordDictMeta() 异步拉取。
// 拉取前显示「?」，避免误把 0 当真实值展示。

import React, { useEffect, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import { useAppNavigation } from '../navigation/types';
import { DICTIONARIES, DictMeta } from '../data/dictionaries';
import { getLocalWordDictMeta } from '../utils/wordUtils';
import { makeStyles } from '../utils/useStyles';

export default function DictionaryScreen() {
  const navigation = useAppNavigation();
  const styles = useStyles();

  /** 各词库的实时 wordCount 覆盖；key=字典 id。加载前为 undefined（显示 ?）。 */
  const [counts, setCounts] = useState<Record<string, number | undefined>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await getLocalWordDictMeta();
        if (cancelled) return;
        // 目前只有一个内置词库 id='local'；未来多词库时按 meta 映射对应 dict id
        setCounts((prev) => ({ ...prev, local: meta.wordCount }));
      } catch (err) {
        console.warn('[DictionaryScreen] 拉取词库 meta 失败：', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openDict = (dict: DictMeta) => {
    navigation.navigate('DictionaryBrowse', { dictId: dict.id });
  };

  const renderCount = (dict: DictMeta) => {
    const n = counts[dict.id];
    if (n === undefined) return '? 词';
    return `${n.toLocaleString()} 词`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📖 词库</Text>
        <Text style={styles.headerSubtitle}>
          选择一个词库打开，可浏览全部单词或按单词查询
        </Text>
      </View>

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
      >
        {DICTIONARIES.map((dict) => (
          <Card key={dict.id} style={styles.card} elevation={1}>
            <Card.Content>
              <View style={styles.cardHeader}>
                <Text style={styles.dictName}>{dict.name}</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>
                    {renderCount(dict)}
                  </Text>
                </View>
              </View>
              <Text style={styles.dictDesc}>{dict.description}</Text>
            </Card.Content>
            <Card.Actions style={styles.actions}>
              <Button
                mode="contained"
                icon="book-open-variant"
                onPress={() => openDict(dict)}
                style={styles.openBtn}
                contentStyle={styles.openBtnContent}
              >
                打开词库
              </Button>
            </Card.Actions>
          </Card>
        ))}

        <Text style={styles.footerHint}>
          💡 更多词库持续整理中
        </Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingTop: 16,
  },
  header: {
    padding: 20,
    paddingBottom: 16,
    backgroundColor: colors.primary,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
    marginTop: 4,
    lineHeight: 18,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  dictName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.onSurface,
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.primaryContainer,
  },
  countText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.onPrimaryContainer,
  },
  dictDesc: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 18,
  },
  actions: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    justifyContent: 'flex-end',
  },
  openBtn: {
    borderRadius: 8,
  },
  openBtnContent: {
    flexDirection: 'row-reverse',
  },
  footerHint: {
    fontSize: 12,
    color: colors.tertiary,
    textAlign: 'center',
    marginTop: 20,
  },
}));
