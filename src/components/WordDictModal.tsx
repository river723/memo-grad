/**
 * WordDictModal —— 阅读类页面共享的「单词释义弹窗」。
 *
 * StoryDetailScreen 与 ArticleDetailScreen 原各自内嵌几乎逐字相同的单词弹窗
 * （释义 + 词根词缀 + 记忆口诀 + 易混词），此处收敛为单一组件，基于 AppModal。
 *
 *   <WordDictModal visible={show} onClose={close} word={selectedWord} />
 *
 * word 为 null 时不渲染内容（仅壳）。dismissOnBackdrop 默认 true（点遮罩关闭）。
 */
import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AppModal from './ds/AppModal';
import { useAppTheme } from '../theme/theme';
import { radius, spacing } from '../theme/tokens';
import type { Word } from '../types';

export interface WordDictModalProps {
  visible: boolean;
  onClose: () => void;
  word: Word | null;
  testID?: string;
}

export default function WordDictModal({ visible, onClose, word, testID }: WordDictModalProps) {
  const { colors } = useAppTheme();
  const t = colors.typography;

  return (
    <AppModal
      visible={visible}
      onClose={onClose}
      testID={testID}
      contentStyle={{ padding: 0, maxHeight: '72%', maxWidth: 460 }}
    >
      {word && (
        <View>
          {/* 头部：单词 + 关闭 */}
          <View style={styles.header}>
            <Text
              style={[
                styles.title,
                {
                  color: colors.primary,
                  fontSize: typography.headline.size,
                  lineHeight: typography.headline.lineHeight,
                },
              ]}
            >
              {word.word}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }}>
            {word.pronunciation_uk ? (
              <Text style={[styles.pron, { color: colors.tertiary, fontSize: t.bodySm.size }]}>
                英 /{word.pronunciation_uk}/
                {word.pronunciation_us ? `  美 /${word.pronunciation_us}/` : ''}
              </Text>
            ) : null}

            {/* 释义列表 */}
            <View style={styles.definitions}>
              {word.definitions.map((def, index) => (
                <View
                  key={index}
                  style={[
                    styles.defItem,
                    {
                      borderBottomColor: colors.outline,
                      borderBottomWidth: index < word.definitions.length - 1 ? 1 : 0,
                    },
                  ]}
                >
                  <View style={styles.defHeader}>
                    <Pill bg={colors.surfaceVariant} fg={colors.onSurfaceVariant}>
                      {def.part_of_speech}
                    </Pill>
                    <Text
                      style={{
                        flex: 1,
                        color: colors.onSurface,
                        fontSize: t.bodyLg.size,
                        fontWeight: '500',
                      }}
                    >
                      {def.meaning}
                    </Text>
                    {def.is_core && (
                      <Pill bg={colors.primaryContainer} fg={colors.primary}>
                        核心
                      </Pill>
                    )}
                    {def.is_rare_sense && (
                      <Pill bg={colors.secondaryContainer} fg={colors.secondary}>
                        熟词僻义
                      </Pill>
                    )}
                  </View>
                  {def.example ? (
                    <Text
                      style={{
                        color: colors.tertiary,
                        fontSize: t.bodySm.size,
                        fontStyle: 'italic',
                        marginTop: 2,
                        marginLeft: 4,
                        lineHeight: t.bodySm.lineHeight,
                      }}
                    >
                      {def.example}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>

            {/* 词根词缀 */}
            {word.etymology ? (
              <Section title="词根词缀">
                <Text style={[styles.sectionText, { color: colors.onSurfaceVariant, fontSize: t.bodySm.size, lineHeight: t.body.lineHeight }]}>
                  {word.etymology}
                </Text>
              </Section>
            ) : null}

            {/* 记忆口诀 */}
            {word.memory_tip ? (
              <Section title="记忆口诀">
                <Text style={[styles.sectionText, { color: colors.onSurfaceVariant, fontSize: t.bodySm.size, lineHeight: t.body.lineHeight }]}>
                  {word.memory_tip}
                </Text>
              </Section>
            ) : null}

            {/* 易混词提醒 */}
            {Array.isArray(word.similar_words) && word.similar_words.length > 0 && (
              <Section title="易混词提醒">
                {word.similar_words.map((sw, index) => (
                  <Text
                    key={index}
                    style={[styles.sectionText, { color: colors.onSurfaceVariant, fontSize: t.bodySm.size, lineHeight: t.body.lineHeight }]}
                  >
                    · {sw.word}（{sw.relation === 'spelling' ? '形近' : sw.relation === 'meaning' ? '义近' : '同根'}）— {sw.description}
                  </Text>
                ))}
              </Section>
            )}
          </ScrollView>
        </View>
      )}
    </AppModal>
  );
}

/** 节标题（弹窗内用，比 SectionHeader 更轻）。 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.sectionBlock}>
      <Text
        style={{
          color: colors.onSurfaceVariant,
          fontSize: colors.typography.caption.size,
          fontWeight: '600',
          marginBottom: 4,
          letterSpacing: 0.3,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

/** 小药丸标签（替代 paper Chip，更贴合 DS 风格）。 */
function Pill({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: bg, borderColor: bg, borderRadius: radius.pill },
      ]}
    >
      <Text style={{ color: fg, fontSize: 10, fontWeight: '600', letterSpacing: 0.2 }} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { fontWeight: '700' },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pron: { marginBottom: spacing.md },
  definitions: { marginBottom: spacing.md },
  defItem: {
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
  },
  defHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  sectionBlock: {
    marginBottom: spacing.md,
    paddingTop: 4,
  },
  sectionText: {
    marginBottom: 2,
  },
});
