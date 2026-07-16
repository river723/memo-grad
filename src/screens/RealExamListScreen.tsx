import React from 'react';
import { View, ScrollView } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import { useAppNavigation } from '../navigation/types';
import { makeStyles } from '../utils/useStyles';
import realExamsRaw from '../data/realExams.json';
import type { RealExamYear } from '../types';

const realExams = realExamsRaw as unknown as RealExamYear[];

/**
 * 真题练习入口页：按年份列出可练习的历年真题。
 * 每一年一张 Card，包含英语一/英语二两个子区块，
 * 阅读部分列出每篇 passage 的独立入口，完形各一个入口。
 */
export default function RealExamListScreen() {
  const navigation = useAppNavigation();
  const styles = useStyles();

  // 数据来自静态 JSON，按年份倒序展示（近年优先）
  const years = [...realExams].sort((a, b) => b.year - a.year);

  const goReading = (year: number, setId: 'english1' | 'english2', passageId: string) => {
    navigation.navigate('RealExamReading', { year, setId, passageId });
  };

  const goCloze = (year: number, setId: 'english1' | 'english2', paperId: string) => {
    navigation.navigate('RealExamCloze', { year, setId, paperId });
  };

  if (years.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📚</Text>
        <Text style={styles.emptyText}>暂无真题数据</Text>
        <Text style={styles.emptyHint}>后续版本将逐步补充历年真题</Text>
      </View>
    );
  }

  /** 渲染某一侧（英语一/二）的入口 */
  const renderSet = (label: string, reading: NonNullable<RealExamYear['english1']>['reading'], cloze: RealExamYear['english1']['cloze'], setId: 'english1' | 'english2') => (
    <View style={styles.setGroup}>
      <Text style={styles.setTitle}>{label}</Text>
      {reading.length > 0 && (
        <View style={styles.readingGroup}>
          {reading.map((passage, idx) => (
            <Button
              key={passage.id}
              mode="outlined"
              icon="book-open-variant"
              onPress={() => goReading(years.find(y => y.year === parseInt(passage.id.slice(0, 4)))!.year, setId, passage.id)}
              style={styles.actionButton}
            >
              {passage.title || `Text ${idx + 1}`} ({passage.questions.length}题)
            </Button>
          ))}
        </View>
      )}
      {cloze && (
        <Button
          mode="outlined"
          icon="format-letter-matches"
          onPress={() => {
            const y = years.find(y => y.english1?.cloze?.id === cloze.id || y.english2?.cloze?.id === cloze.id);
            if (y) goCloze(y.year, setId, cloze.id);
          }}
          style={styles.actionButton}
        >
          完形填空 (20空)
        </Button>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.tip}>
          共 {years.length} 年真题 · 一次一篇 · 客观题自动评分
        </Text>
        {years.map(year => (
          <Card key={year.year} style={styles.yearCard}>
            <Card.Title
              title={`${year.year} 年`}
              titleStyle={styles.cardTitle}
              subtitle="考研英语一 / 英语二"
            />
            <Card.Content>
              {renderSet('英语一', year.english1.reading, year.english1.cloze, 'english1')}
              {renderSet('英语二', year.english2.reading, year.english2.cloze, 'english2')}
            </Card.Content>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  tip: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginBottom: 12,
    textAlign: 'center',
  },
  yearCard: {
    marginBottom: 12,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  setGroup: {
    marginBottom: 12,
  },
  setTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
    marginBottom: 6,
  },
  readingGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  actionButton: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.background,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: colors.onSurfaceVariant,
    marginBottom: 6,
  },
  emptyHint: {
    fontSize: 13,
    color: colors.tertiary,
    textAlign: 'center',
  },
}));
