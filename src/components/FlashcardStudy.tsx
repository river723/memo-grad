/**
 * FlashcardStudy —— 剧场式 focus 学习卡片。
 *
 * - 单词面：56-72px 衬线居中、3D 翻转（rotateY 0→180，spring）
 * - 答案面：单词缩 28px 左对齐，释义 16px 行高 1.7
 * - 三按钮：再想想 / 不认识（赭石）/ 认识（墨绿）
 * - 答对飘 +1 绿点（spring 上飘 + 淡出）
 * - 答错横向 shake 4px × 3
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  Easing,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/theme';
import { radius, spacing, palette } from '../theme/tokens';
import { spring, springFlip, timingSlow, timingFast } from '../theme/motion';
import type { Word, AppSettings } from '../types';
import { canWordBeEnhanced } from '../utils/wordUtils';
import { Button } from 'react-native-paper';

interface FlashcardStudyProps {
  currentWord: Word;
  onResult: (correct: boolean) => void;
  speakWord: (w: string) => void;
  speechEnabled: boolean;
  onEnhance?: () => void;
  enhancing?: boolean;
  appSettings: AppSettings | null;
}

export default function FlashcardStudy({
  currentWord,
  onResult,
  speakWord,
  speechEnabled,
  onEnhance,
  enhancing,
  appSettings,
}: FlashcardStudyProps) {
  const { colors } = useAppTheme();
  const typography = colors.typography;
  const [flipped, setFlipped] = useState(false);

  // 正面单词字号按长度自适应，避免长单词在窄屏换行
  const wordLen = currentWord.word?.length || 0;
  const frontWordSize = wordLen <= 6 ? 56 : wordLen <= 8 ? 46 : wordLen <= 11 ? 38 : 30;
  const frontWordSpacing = frontWordSize >= 46 ? -1.2 : -0.6;
  const [showResult, setShowResult] = useState<'correct' | 'incorrect' | null>(null);
  const [backOverflow, setBackOverflow] = useState(false);
  const [backMaxHeight, setBackMaxHeight] = useState(0);

  // 翻转动画（rotateY 0→180）
  const rotate = useRef(new Animated.Value(0)).current;
  // 单词飘字 / shake
  const floatY = useRef(new Animated.Value(0)).current;
  const floatOpacity = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  // 翻转时驱动 3D 旋转
  useEffect(() => {
    Animated.spring(rotate, {
      toValue: flipped ? 1 : 0,
      ...springFlip,
      useNativeDriver: true,
    }).start();
  }, [flipped, rotate]);

  // 切换单词时重置状态
  useEffect(() => {
    setFlipped(false);
    setShowResult(null);
    setBackOverflow(false);
    rotate.setValue(0);
  }, [currentWord.id, rotate]);

  const handleAnswer = (correct: boolean) => {
    setShowResult(correct ? 'correct' : 'incorrect');
    if (correct) {
      floatOpacity.setValue(1);
      Animated.parallel([
        Animated.spring(floatY, { toValue: -32, ...spring, useNativeDriver: true }),
        Animated.timing(floatOpacity, { toValue: 0, ...timingSlow, delay: 100, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, ...timingFast, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, ...timingFast, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 1, ...timingFast, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, ...timingFast, easing: Easing.linear, useNativeDriver: true }),
      ]).start();
    }
    setTimeout(() => onResult(correct), 320);
  };

  // rotate 0..1 映射到 rotateY 0..180，前半 (0-0.5) 翻到 90 后半 (0.5-1) 翻到 180
  const frontRotate = rotate.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '90deg'] });
  const backRotate = rotate.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-90deg', '-90deg', '0deg'] });
  const frontOpacity = rotate.interpolate({ inputRange: [0, 0.49, 0.5, 1], outputRange: [1, 1, 0, 0] });
  const backOpacity = rotate.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [0, 0, 1, 1] });
  const shakeX = shake.interpolate({ inputRange: [-1, 0, 1], outputRange: [-4, 0, 4] });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* 卡片区（剧场式） */}
      <View style={{ flex: 1, padding: spacing.lg, justifyContent: 'center' }}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.outline,
              borderRadius: radius.lg,
              minHeight: 420,
              transform: [{ translateX: shakeX }, { perspective: 1000 }, { rotateY: frontRotate }],
              opacity: frontOpacity,
            },
            colors.shadow.card,
          ]}
          pointerEvents={flipped ? 'none' : 'auto'}
        >
          <Pressable
            onPress={() => !flipped && setFlipped(true)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}
          >
            {/* 难度条（4px 顶部色块） */}
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 4,
                backgroundColor: palette.difficulty[(currentWord.difficulty || 1) - 1] || colors.primary,
                borderTopLeftRadius: radius.lg,
                borderTopRightRadius: radius.lg,
              }}
            />
            <Text
              style={{
                color: colors.onSurfaceVariant,
                fontSize: typography.caption.size,
                fontWeight: '500',
                letterSpacing: 0.6,
                marginBottom: spacing.lg,
              }}
            >
              {(currentWord.definitions?.[0]?.part_of_speech || '').toUpperCase()}
            </Text>
            <Text
              style={{
                color: colors.onSurface,
                fontSize: frontWordSize,
                lineHeight: frontWordSize + 8,
                fontWeight: '700',
                letterSpacing: frontWordSpacing,
                textAlign: 'center',
                fontFamily: 'SourceSerif4, Georgia, serif',
                width: '100%',
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {currentWord.word}
            </Text>
            {(currentWord.pronunciation_uk || currentWord.pronunciation_us) && (
              <Text
                style={{
                  color: colors.tertiary,
                  fontSize: 13,
                  marginTop: 12,
                  fontStyle: 'italic',
                }}
              >
                {currentWord.pronunciation_uk ? `UK [${currentWord.pronunciation_uk}]` : ''}
                {currentWord.pronunciation_us ? `  US [${currentWord.pronunciation_us}]` : ''}
              </Text>
            )}

            {/* 飘字：+1 绿点 */}
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 80,
                right: 24,
                opacity: floatOpacity,
                transform: [{ translateY: floatY }],
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 2,
                  backgroundColor: colors.status.active.bg,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 12,
                }}
              >
                <Text style={{ color: colors.success, fontSize: 14, fontWeight: '700' }}>+1</Text>
              </View>
            </Animated.View>

            {/* 右上角发音按钮 */}
            <Pressable
              onPress={() => speechEnabled && speakWord(currentWord.word)}
              disabled={!speechEnabled}
              hitSlop={12}
              style={({ pressed }) => ({
                position: 'absolute',
                top: spacing.md,
                right: spacing.md,
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primaryContainer,
                opacity: speechEnabled ? (pressed ? 0.7 : 1) : 0.4,
              })}
            >
              <MaterialCommunityIcons
                name={speechEnabled ? 'volume-high' : 'volume-off'}
                size={26}
                color={speechEnabled ? colors.primary : colors.tertiary}
              />
            </Pressable>

            <View
              style={{
                position: 'absolute',
                bottom: spacing.lg,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text style={{ color: colors.tertiary, fontSize: typography.caption.size }}>点击翻释义</Text>
            </View>
          </Pressable>
        </Animated.View>

        {/* 背面（隐藏时透明） */}
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.outline,
              borderRadius: radius.lg,
              position: 'absolute',
              top: spacing.lg,
              left: spacing.lg,
              right: spacing.lg,
              bottom: spacing.lg,
              minHeight: 420,
              transform: [{ perspective: 1000 }, { rotateY: backRotate }],
              opacity: backOpacity,
            },
            colors.shadow.card,
          ]}
          pointerEvents={flipped ? 'auto' : 'none'}
        >
          <View
            style={{ flex: 1 }}
            onLayout={(e) => {
              const cardH = e.nativeEvent.layout.height;
              if (cardH > 0) setBackMaxHeight(cardH);
            }}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              onContentSizeChange={(_w, h) => {
                setBackOverflow(h > backMaxHeight - 32);
              }}
            >
              {/* 返回单词面 */}
              <Pressable
                onPress={() => setFlipped(false)}
                hitSlop={8}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  alignSelf: 'flex-start',
                  marginBottom: spacing.md,
                  paddingVertical: 4,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <MaterialCommunityIcons name="arrow-left" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
                  返回单词面
                </Text>
              </Pressable>
              {/* 单词缩到 28px 左对齐 */}
              <Text
                style={{
                  color: colors.onSurface,
                  fontSize: 26,
                  lineHeight: 32,
                  fontWeight: '700',
                  fontFamily: 'SourceSerif4, Georgia, serif',
                  letterSpacing: -0.5,
                  marginBottom: 4,
                }}
              >
                {currentWord.word}
              </Text>
                {(currentWord.pronunciation_uk || currentWord.pronunciation_us) && (
                  <Text
                    style={{
                      color: colors.tertiary,
                      fontSize: 12,
                      marginBottom: spacing.md,
                      fontStyle: 'italic',
                    }}
                  >
                    {currentWord.pronunciation_uk ? `UK [${currentWord.pronunciation_uk}]` : ''}
                    {currentWord.pronunciation_us ? `  US [${currentWord.pronunciation_us}]` : ''}
                  </Text>
                )}

                {/* 释义列表 */}
                {(currentWord.definitions || []).map((def, idx) => (
                  <View
                    key={idx}
                    style={{
                      paddingVertical: 6,
                      borderBottomColor: colors.outline,
                      borderBottomWidth: idx < (currentWord.definitions?.length || 0) - 1 ? 1 : 0,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <Text
                        style={{
                          color: colors.primary,
                          fontSize: 11,
                          fontWeight: '600',
                          fontStyle: 'italic',
                        }}
                      >
                        {def.part_of_speech}
                      </Text>
                      {def.is_core && (
                        <View
                          style={{
                            backgroundColor: colors.status.active.bg,
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            borderRadius: 8,
                          }}
                        >
                          <Text style={{ color: colors.success, fontSize: 10, fontWeight: '600' }}>核心</Text>
                        </View>
                      )}
                      {def.is_rare_sense && (
                        <View
                          style={{
                            backgroundColor: colors.status.pending.bg,
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            borderRadius: 8,
                          }}
                        >
                          <Text style={{ color: colors.warning, fontSize: 10, fontWeight: '600' }}>熟词僻义</Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={{
                        color: colors.onSurface,
                        fontSize: 14,
                        lineHeight: 21,
                        fontWeight: '500',
                      }}
                    >
                      {def.meaning}
                    </Text>
                    {def.example && (
                      <Text
                        style={{
                          color: colors.onSurfaceVariant,
                          fontSize: 12,
                          lineHeight: 18,
                          marginTop: 3,
                          fontStyle: 'italic',
                        }}
                      >
                        例：{def.example}
                      </Text>
                    )}
                  </View>
                ))}

                {/* 词根 */}
                {currentWord.etymology && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: colors.onSurfaceVariant, fontSize: 11, fontWeight: '600', marginBottom: 3, letterSpacing: 0.4 }}>
                      词根
                    </Text>
                    <Text style={{ color: colors.onSurface, fontSize: 13, lineHeight: 19 }}>
                      {currentWord.etymology}
                    </Text>
                  </View>
                )}

                {/* 记忆口诀 */}
                {currentWord.memory_tip && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: colors.onSurfaceVariant, fontSize: 11, fontWeight: '600', marginBottom: 3, letterSpacing: 0.4 }}>
                      记忆
                    </Text>
                    <Text style={{ color: colors.onSurface, fontSize: 13, lineHeight: 19 }}>
                      {currentWord.memory_tip}
                    </Text>
                  </View>
                )}

                {/* 易混词 */}
                {Array.isArray(currentWord.similar_words) && currentWord.similar_words.length > 0 && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: colors.onSurfaceVariant, fontSize: 11, fontWeight: '600', marginBottom: 3, letterSpacing: 0.4 }}>
                      易混词
                    </Text>
                    {currentWord.similar_words.map((sw, idx) => (
                      <Text key={idx} style={{ color: colors.onSurface, fontSize: 13, lineHeight: 19 }}>
                        · {sw.word}（{sw.relation === 'spelling' ? '形近' : sw.relation === 'meaning' ? '义近' : '同根'}）— {sw.description}
                      </Text>
                    ))}
                  </View>
                )}

                {onEnhance && canWordBeEnhanced(currentWord, appSettings) && (
                  <Button
                    mode="outlined"
                    icon="auto-fix"
                    onPress={onEnhance}
                    loading={enhancing}
                    disabled={enhancing}
                    compact
                    style={{ marginTop: spacing.md, alignSelf: 'flex-start' }}
                  >
                    {enhancing ? 'AI 补全中…' : 'AI 补全'}
                  </Button>
                )}
              </ScrollView>
              {backOverflow && (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: 28,
                    backgroundColor: colors.surface,
                    opacity: 0.85,
                    borderBottomLeftRadius: radius.lg,
                    borderBottomRightRadius: radius.lg,
                  }}
                />
              )}
          </View>
        </Animated.View>
      </View>

      {/* 底部三按钮（始终可见，但 flipped=false 时"再想想"不可用） */}
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing['2xl'],
          gap: spacing.sm,
        }}
      >
        <Pressable
          onPress={() => flipped && handleAnswer(false)}
          disabled={!flipped}
          style={({ pressed }) => [
            styles.bottomBtn,
            {
              backgroundColor: colors.surface,
              borderColor: colors.outline,
              borderRadius: radius.md,
              opacity: !flipped ? 0.4 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <MaterialCommunityIcons name="reload" size={18} color={colors.onSurfaceVariant} />
          <Text style={{ color: colors.onSurfaceVariant, fontSize: 14, fontWeight: '500' }}>再想想</Text>
        </Pressable>
        <Pressable
          onPress={() => flipped && handleAnswer(false)}
          disabled={!flipped}
          style={({ pressed }) => [
            styles.bottomBtn,
            {
              backgroundColor: colors.warning,
              borderRadius: radius.md,
              opacity: !flipped ? 0.4 : pressed ? 0.85 : 1,
              flex: 1.2,
            },
          ]}
        >
          <MaterialCommunityIcons name="close" size={20} color={colors.onWarning} />
          <Text style={{ color: colors.onWarning, fontSize: 15, fontWeight: '600' }}>不认识</Text>
        </Pressable>
        <Pressable
          onPress={() => flipped && handleAnswer(true)}
          disabled={!flipped}
          style={({ pressed }) => [
            styles.bottomBtn,
            {
              backgroundColor: colors.primary,
              borderRadius: radius.md,
              opacity: !flipped ? 0.4 : pressed ? 0.85 : 1,
              flex: 1.2,
            },
          ]}
        >
          <MaterialCommunityIcons name="check" size={20} color={colors.onPrimary} />
          <Text style={{ color: colors.onPrimary, fontSize: 15, fontWeight: '600' }}>认识</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
  },
  bottomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderWidth: 1,
  },
});
