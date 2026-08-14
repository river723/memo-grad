import React, { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Card, Text, Button, Surface } from 'react-native-paper';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { getExamSet } from '../utils/realExamContent';
import type { RealExamTranslationPaper } from '../types';

/**
 * 翻译阅览屏（英一划线句翻译 / 英二段落翻译）。翻译为主观题，无自动判分。
 * 提供：Directions、英文原文、逐句/整段"参考译文"（默认折叠，点击揭晓，鼓励先自译）。
 */
export default function RealExamTranslationScreen() {
  const navigation = useAppNavigation();
  const route = useAppRoute<'RealExamTranslation'>();
  const styles = useStyles();

  const { year, setId, paperId } = (route.params || {}) as {
    year: number;
    setId: 'english1' | 'english2';
    paperId: string;
  };

  const [paper, setPaper] = useState<RealExamTranslationPaper | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const set = await getExamSet(year, setId);
        const t = set?.translation && set.translation.id === paperId ? set.translation : null;
        if (!cancelled) setPaper(t);
      } catch (err) {
        console.warn('[RealExamTranslation] 拉取套卷失败：', err);
        if (!cancelled) setPaper(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, setId, paperId]);

  // 每条译文单独控制展开，默认全部折叠
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const toggle = (idx: number) => setRevealed(prev => ({ ...prev, [idx]: !prev[idx] }));

  if (loading) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>真题加载中…</Text>
      </View>
    );
  }

  if (!paper) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>题目不存在或已被移除</Text>
        <Button mode="contained" onPress={() => navigation.goBack()}>返回</Button>
      </View>
    );
  }

  const isSentence = paper.subtype === 'sentence';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.dirCard}>
          <Card.Content>
            <View style={styles.sectionTag}>
              <Text style={styles.sectionTagText}>Directions</Text>
            </View>
            <Text style={styles.dirText}>{paper.direction}</Text>
            <Text style={styles.subjectiveHint}>翻译为主观题，无标准答案。建议先自己译一遍，再对照参考译文。</Text>
          </Card.Content>
        </Card>

        {/* 英文原文（英一：完整原文，划线句在其中；英二：整段） */}
        {paper.passage ? (
          <Card style={styles.passageCard}>
            <Card.Content>
              <View style={styles.sectionTag}>
                <Text style={styles.sectionTagText}>English Text</Text>
              </View>
              <Text style={styles.passageText}>{paper.passage}</Text>
            </Card.Content>
          </Card>
        ) : null}

        <Text style={styles.reviewTitle}>
          {isSentence ? '逐句参考译文' : '参考译文'}
        </Text>
        {paper.items.map(item => {
          const open = revealed[item.index];
          return (
            <Card key={item.index} style={styles.itemCard}>
              <Card.Content>
                {isSentence ? (
                  <>
                    <Text style={styles.itemIndex}>第 {item.index} 句</Text>
                    <Text style={styles.itemEn}>{item.en}</Text>
                  </>
                ) : null}
                <TouchableOpacity onPress={() => toggle(item.index)} activeOpacity={0.7}>
                  <View style={styles.revealHeader}>
                    <Text style={styles.revealLabel}>参考译文</Text>
                    <Text style={styles.revealToggle}>{open ? '收起 ▲' : '查看 ▼'}</Text>
                  </View>
                </TouchableOpacity>
                {open ? (
                  <Surface style={styles.zhBox}>
                    <Text style={styles.zhText}>{item.zh}</Text>
                    {item.note ? <Text style={styles.noteText}>{item.note}</Text> : null}
                  </Surface>
                ) : null}
              </Card.Content>
            </Card>
          );
        })}

        <View style={styles.footerActions}>
          <Button mode="outlined" onPress={() => navigation.navigate('RealExamList')} style={styles.footerButton}>
            返回列表
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  container: { flex: 1, backgroundColor: colors.background },
  emptyContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32,
    backgroundColor: colors.background,
  },
  emptyText: { fontSize: 16, color: colors.tertiary, marginBottom: 16 },
  content: { padding: 16, paddingBottom: 32 },
  dirCard: { borderRadius: 12, elevation: 1, marginBottom: 12, backgroundColor: colors.surface },
  passageCard: { borderRadius: 12, elevation: 2, marginBottom: 16 },
  sectionTag: {
    alignSelf: 'flex-start', backgroundColor: colors.primaryContainer,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 10,
  },
  sectionTagText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  dirText: { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 20 },
  subjectiveHint: { fontSize: 12, color: colors.tertiary, marginTop: 8, lineHeight: 18 },
  passageText: { fontSize: 15, color: colors.onSurface, lineHeight: 25 },
  reviewTitle: { fontSize: 15, fontWeight: '700', color: colors.onSurface, marginBottom: 8 },
  itemCard: { borderRadius: 12, elevation: 1, marginBottom: 10 },
  itemIndex: { fontSize: 14, fontWeight: '700', color: colors.primary, marginBottom: 6 },
  itemEn: { fontSize: 14, color: colors.onSurface, lineHeight: 22, marginBottom: 10 },
  revealHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 4,
  },
  revealLabel: { fontSize: 13, fontWeight: '600', color: colors.onSurface },
  revealToggle: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  zhBox: {
    marginTop: 8, padding: 12, borderRadius: 8,
    backgroundColor: colors.primaryContainer, elevation: 0,
  },
  zhText: { fontSize: 14, color: colors.onSurface, lineHeight: 24 },
  noteText: { fontSize: 12, color: colors.onSurfaceVariant, lineHeight: 20, marginTop: 8 },
  footerActions: { flexDirection: 'row', marginTop: 12 },
  footerButton: { flex: 1 },
}));
