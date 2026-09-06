import React, { useState, useCallback } from 'react';
import { View, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import { useAppTheme } from '../theme/theme';
import { makeStyles } from '../utils/useStyles';
import { radius, spacing } from '../theme/tokens';
import StorageService from '../services/StorageService';
import { ExamSession, DefinitionQuestion, ClozeQuestion, Word, WordDictEntry } from '../types';
import { parseWordHighlight } from './ExamAnswerScreen';
import AppButton from '../components/ds/AppButton';
import AppIcon from '../components/ds/AppIcon';
import EmptyState from '../components/ds/EmptyState';
import WordDictModal from '../components/WordDictModal';
import { getLocalWordDictResult, wordDictEntryToWord } from '../utils/wordUtils';

/**
 * 套题只读详情：浏览一套 AI 出题的全部题目与正确答案，并提供重做入口。
 * 数据按 rootId 现场重算分组（聚焦刷新），组不存在（已删）则回退题库。
 */
export default function ExamSetDetailScreen() {
  const { colors } = useAppTheme();
  const typography = colors.typography;
  const styles = useStyles();
  const navigation = useAppNavigation();
  const route = useAppRoute<'ExamSetDetail'>();
  const rootId = route.params?.rootId;
  const [set, setSet] = useState<{ latest: ExamSession; count: number; createdAt: string } | null>(
    null
  );
  const [missing, setMissing] = useState(false);
  const [showWordModal, setShowWordModal] = useState(false);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);

  /** 点击目标词弹释义卡片：优先生词本，缺失回落全局词库（复用错题本模式）。 */
  const handleWordTap = async (wordId: string | undefined, wordText: string) => {
    let word: Word | null = wordId ? await StorageService.getWordById(wordId) : null;
    if (!word) {
      const dict = await getLocalWordDictResult(wordText);
      if (dict) {
        const base = wordDictEntryToWord(wordText, dict as unknown as WordDictEntry);
        word = { ...base, id: `dict-${wordText.toLowerCase()}` } as Word;
      }
    }
    if (word) {
      setSelectedWord(word);
      setShowWordModal(true);
    }
  };

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const all = await StorageService.getExamSessions();
        const members = all
          .filter(s => (s.origin_id ?? s.id) === rootId && s.source !== 'wrong_review')
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (!rootId || members.length === 0) {
          setMissing(true);
          return;
        }
        setSet({
          latest: members[0],
          count: members.length,
          createdAt: members[members.length - 1].created_at,
        });
      })();
    }, [rootId])
  );

  const getAccuracyColor = (rate: number) => {
    if (rate >= 0.8) return colors.success;
    if (rate >= 0.6) return colors.warning;
    return colors.danger;
  };

  if (missing) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="library"
          title="套题不存在"
          description="这套题可能已被删除。"
          actionLabel="返回题库"
          onAction={() => navigation.goBack()}
        />
      </View>
    );
  }

  if (!set) {
    return (
      <View style={styles.container}>
        <Text style={{ color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 80 }}>
          加载中…
        </Text>
      </View>
    );
  }

  const questions = set.latest.questions;
  const isDefinition = set.latest.question_type === 'definition';
  const accuracy = set.latest.accuracy || 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}>
        {/* 概览 */}
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.surface, borderColor: colors.outline, borderRadius: radius.lg },
          ]}
        >
          <View style={styles.tagRow}>
            <Text style={[styles.typeTag, { color: colors.primary, backgroundColor: colors.status.active.bg }]}>
              {isDefinition ? '释义单选' : '完形选词'}
            </Text>
            <Text style={{ fontSize: typography.caption.size, color: colors.onSurfaceVariant }}>
              {questions.length} 题 · 已练 {set.count} 次
            </Text>
          </View>
          <View style={styles.statRow}>
            <Text style={{ fontSize: typography.caption.size, color: colors.tertiary }}>
              出题 {formatDate(set.createdAt)}
              {' · '}
              上次练习 {formatDate(set.latest.created_at)}
            </Text>
            <Text style={{ fontSize: 20, fontWeight: '800', color: getAccuracyColor(accuracy) }}>
              最新 {Math.round(accuracy * 100)}%
            </Text>
          </View>
        </View>

        {/* 题目只读列表 */}
        <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>题目与答案</Text>
        {questions.map((q, idx) =>
          q.type === 'definition' ? (
            <DefinitionReviewCard key={idx} index={idx} question={q as DefinitionQuestion} onWordPress={handleWordTap} />
          ) : (
            <ClozeReviewCard key={idx} index={idx} question={q as ClozeQuestion} onWordPress={handleWordTap} />
          )
        )}
      </ScrollView>

      {/* 底部重做 */}
      <View style={[styles.footer, { backgroundColor: colors.surface, borderTopColor: colors.outline }]}>
        <AppButton
          title="重做这套题"
          onPress={() =>
            navigation.navigate('ExamAnswer', {
              questions,
              questionType: set.latest.question_type,
              originId: rootId,
              source: 'generation',
            })
          }
          variant="primary"
          size="lg"
          fullWidth
          leftIcon={<AppIcon name="restart" size={20} color={colors.onPrimary} />}
        />
      </View>
      <WordDictModal
        visible={showWordModal}
        onClose={() => setShowWordModal(false)}
        word={selectedWord}
      />
    </View>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function SentenceBox({
  text,
  word,
  wordId,
  onWordPress,
}: {
  text: string;
  word?: string;
  wordId?: string;
  onWordPress?: (wordId: string | undefined, wordText: string) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const parts = word ? parseWordHighlight(text, word) : [{ text, isWord: false }];
  return (
    <View style={[styles.sentenceBox, { borderLeftColor: colors.primary }]}>
      <Text style={styles.sentenceText}>
        {parts.map((p, i) =>
          p.isWord ? (
            <Text
              key={i}
              style={styles.underlinedWord}
              onPress={onWordPress ? () => onWordPress(wordId, p.text) : undefined}
            >
              {p.text}
            </Text>
          ) : (
            <Text key={i}>{p.text}</Text>
          )
        )}
      </Text>
    </View>
  );
}

function OptionRow({ letter, text, isCorrect }: { letter: string; text: string; isCorrect: boolean }) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  return (
    <View style={[styles.optionRow, isCorrect && { borderColor: colors.success, backgroundColor: colors.status.active.bg }]}>
      <Text style={[styles.optionLetter, isCorrect && { color: colors.success }]}>{letter}</Text>
      <Text style={[styles.optionText, isCorrect && { color: colors.success, fontWeight: '600' }]}>{text}</Text>
      {isCorrect && <AppIcon name="check-bold" size={14} color={colors.success} />}
    </View>
  );
}

function DefinitionReviewCard({
  index,
  question,
  onWordPress,
}: {
  index: number;
  question: DefinitionQuestion;
  onWordPress: (wordId: string | undefined, wordText: string) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  return (
    <View style={[styles.qCard, { backgroundColor: colors.surface, borderColor: colors.outline }]}>
      <Text style={[styles.qIndex, { color: colors.primary }]}>Q{index + 1}</Text>
      <SentenceBox text={question.sentence} word={question.word} wordId={question.word_id} onWordPress={onWordPress} />
      {question.chinese_translation ? (
        <Text style={[styles.translation, { color: colors.primary }]}>题干译文：{question.chinese_translation}</Text>
      ) : null}
      <Text style={[styles.prompt, { color: colors.onSurfaceVariant }]}>划线单词的正确英文释义：</Text>
      {question.options.map((opt, i) => (
        <OptionRow
          key={i}
          letter={'ABCD'[i]}
          text={opt}
          isCorrect={opt === question.correct_definition}
        />
      ))}
    </View>
  );
}

function ClozeReviewCard({
  index,
  question,
  onWordPress,
}: {
  index: number;
  question: ClozeQuestion;
  onWordPress: (wordId: string | undefined, wordText: string) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useStyles();
  const parts = question.sentence.split('[BLANK]');
  return (
    <View style={[styles.qCard, { backgroundColor: colors.surface, borderColor: colors.outline }]}>
      <Text style={[styles.qIndex, { color: colors.warning }]}>[{index + 1}]</Text>
      <View style={[styles.sentenceBox, { borderLeftColor: colors.warning }]}>
        <Text style={styles.sentenceText}>
          {parts.length === 2 ? (
            <>
              <Text>{parts[0]}</Text>
              <Text style={styles.blankMarker}>______</Text>
              <Text>{parts[1]}</Text>
            </>
          ) : (
            question.sentence
          )}
        </Text>
      </View>
      {question.chinese_hint ? (
        <Text style={[styles.translation, { color: colors.warning }]}>题干译文：{question.chinese_hint}</Text>
      ) : null}
      <Text style={[styles.prompt, { color: colors.onSurfaceVariant }]}>
        正确答案：
        <Text
          style={[styles.underlinedWord, { textDecorationLine: 'underline' }]}
          onPress={onWordPress ? () => onWordPress(question.word_id, question.target_word) : undefined}
        >
          {question.target_word}
        </Text>
      </Text>
      {question.options.map((opt, i) => (
        <OptionRow
          key={i}
          letter={'ABCD'[i]}
          text={opt}
          isCorrect={opt === question.correct_answer}
        />
      ))}
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  summaryCard: {
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeTag: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  qCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 10,
  },
  qIndex: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  sentenceBox: {
    backgroundColor: colors.background,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    marginBottom: 10,
  },
  sentenceText: {
    fontSize: 16,
    color: colors.onSurface,
    lineHeight: 26,
    fontFamily: 'SourceSerif4, Georgia, serif',
  },
  underlinedWord: {
    color: colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
    textDecorationColor: colors.primary,
    textDecorationStyle: 'solid',
  },
  blankMarker: {
    fontWeight: '700',
    fontSize: 18,
    textDecorationLine: 'underline',
  },
  prompt: {
    fontSize: 13,
    marginBottom: 8,
  },
  translation: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.outline,
    marginBottom: 6,
  },
  optionLetter: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.tertiary,
    width: 20,
    textAlign: 'center',
  },
  optionText: {
    fontSize: 13,
    color: colors.onSurface,
    flex: 1,
    lineHeight: 19,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    borderTopWidth: 1,
  },
}));
