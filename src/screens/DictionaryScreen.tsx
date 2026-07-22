// src/screens/DictionaryScreen.tsx
//
// 词库选择页（底部 Tab「词库」首页）。
// 列出所有可用词库，用户选择一个词库「打开」后进入浏览/查询页。
// 数据源为 src/data/dictionaries.ts 注册表，新增词库只需追加一项。

import React from 'react';
import { View, ScrollView } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import { useAppNavigation } from '../navigation/types';
import { DICTIONARIES, DictMeta } from '../data/dictionaries';
import { makeStyles } from '../utils/useStyles';

export default function DictionaryScreen() {
  const navigation = useAppNavigation();
  const styles = useStyles();

  const openDict = (dict: DictMeta) => {
    navigation.navigate('DictionaryBrowse', { dictId: dict.id });
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
                    {dict.wordCount.toLocaleString()} 词
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
    backgroundColor: colors.appBar,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.onAppBar,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.onAppBar,
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
