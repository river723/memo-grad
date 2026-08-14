import React, { useEffect, useState } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import { Card, Text, Button, Surface } from 'react-native-paper';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import { getExamSet } from '../utils/realExamContent';
import type { RealExamWritingPaper } from '../types';

/**
 * 写作阅览屏（小作文 + 大作文）。写作为主观题，无自动判分。
 * 提供：每篇的 Directions 题目、参考范文（默认折叠，鼓励先自己写）、范文中译。
 */
export default function RealExamWritingScreen() {
  const navigation = useAppNavigation();
  const route = useAppRoute<'RealExamWriting'>();
  const styles = useStyles();

  const { year, setId, paperId } = (route.params || {}) as {
    year: number;
    setId: 'english1' | 'english2';
    paperId: string;
  };

  const [paper, setPaper] = useState<RealExamWritingPaper | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const set = await getExamSet(year, setId);
        const w = set?.writing && set.writing.id === paperId ? set.writing : null;
        if (!cancelled) setPaper(w);
      } catch (err) {
        console.warn('[RealExamWriting] 拉取套卷失败：', err);
        if (!cancelled) setPaper(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, setId, paperId]);

  // 每篇的范文单独控制展开，默认折叠
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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.pageHint}>写作为主观题，无标准答案。建议先自己写一篇，再对照参考范文。</Text>
        {paper.parts.map((part, idx) => {
          const open = revealed[idx];
          return (
            <Card key={idx} style={styles.partCard}>
              <Card.Content>
                <View style={styles.sectionTag}>
                  <Text style={styles.sectionTagText}>{part.label}</Text>
                </View>
                <Text style={styles.dirText}>{part.direction}</Text>

                {part.sample ? (
                  <>
                    <TouchableOpacity onPress={() => toggle(idx)} activeOpacity={0.7}>
                      <View style={styles.revealHeader}>
                        <Text style={styles.revealLabel}>参考范文</Text>
                        <Text style={styles.revealToggle}>{open ? '收起 ▲' : '查看 ▼'}</Text>
                      </View>
                    </TouchableOpacity>
                    {open ? (
                      <Surface style={styles.sampleBox}>
                        <Text style={styles.sampleText}>{part.sample}</Text>
                        {part.sampleTranslation ? (
                          <>
                            <View style={styles.divider} />
                            <Text style={styles.zhLabel}>参考译文</Text>
                            <Text style={styles.zhText}>{part.sampleTranslation}</Text>
                          </>
                        ) : null}
                        {part.analysis ? (
                          <>
                            <View style={styles.divider} />
                            <Text style={styles.zhLabel}>写作解析</Text>
                            <Text style={styles.zhText}>{part.analysis}</Text>
                          </>
                        ) : null}
                      </Surface>
                    ) : null}
                  </>
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
  pageHint: { fontSize: 12, color: colors.tertiary, marginBottom: 12, lineHeight: 18 },
  partCard: { borderRadius: 12, elevation: 2, marginBottom: 14 },
  sectionTag: {
    alignSelf: 'flex-start', backgroundColor: colors.primaryContainer,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 10,
  },
  sectionTagText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  dirText: { fontSize: 14, color: colors.onSurface, lineHeight: 22 },
  revealHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, marginTop: 8,
  },
  revealLabel: { fontSize: 13, fontWeight: '600', color: colors.onSurface },
  revealToggle: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  sampleBox: {
    marginTop: 4, padding: 12, borderRadius: 8,
    backgroundColor: colors.primaryContainer, elevation: 0,
  },
  sampleText: { fontSize: 14, color: colors.onSurface, lineHeight: 24 },
  divider: { height: 1, backgroundColor: colors.outline, marginVertical: 12, opacity: 0.5 },
  zhLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 6 },
  zhText: { fontSize: 13, color: colors.onSurface, lineHeight: 22 },
  footerActions: { flexDirection: 'row', marginTop: 12 },
  footerButton: { flex: 1 },
}));
