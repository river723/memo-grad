// src/screens/DictionaryWordDetailScreen.tsx
//
// 词典单词详情页（栈屏，只读）。
// 数据直接取自本地词典（worddict.json），不做写回补全。
// 额外提供「加入生词本」入口，与个人生词本流程打通。

import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Platform, Alert } from 'react-native';
import { Text, Chip, Surface, Button, IconButton } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import StorageService from '../services/StorageService';
import { Word } from '../types';
import {
  getLocalWordDictResult,
  wordDictEntryToWord,
} from '../utils/wordUtils';
import { makeStyles } from '../utils/useStyles';
import { difficultyColor, palette } from '../theme/tokens';
import { showConfirm } from '../providers/ConfirmDialogProvider';

// Web 平台兼容性处理
let Speech: any = null;
if (Platform.OS !== 'web') {
  try {
    Speech = require('expo-speech');
  } catch (error) {
    console.warn('expo-speech not available:', error);
  }
}

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

export default function DictionaryWordDetailScreen() {
  const route = useAppRoute<'DictionaryWordDetail'>();
  const navigation = useAppNavigation();
  const styles = useStyles();

  const [word, setWord] = useState<Word | null>(null);
  const [inWordbook, setInWordbook] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showMemoryTip, setShowMemoryTip] = useState(true);

  // 加载词条：从词库读取并转成应用内 Word 结构（异步）
  useEffect(() => {
    let cancelled = false;
    const key = route.params?.word;
    if (!key) {
      setWord(null);
      return;
    }
    (async () => {
      const entry = await getLocalWordDictResult(key);
      if (cancelled) return;
      if (!entry) {
        setWord(null);
        return;
      }
      setWord(wordDictEntryToWord(key, entry) as Word);
    })();
    return () => {
      cancelled = true;
    };
  }, [route.params]);

  // 聚焦时读取生词本与设置，判断当前词是否已在生词本
  useFocusEffect(
    useCallback(() => {
      const key = route.params?.word?.toLowerCase();
      (async () => {
        try {
          const [words, settings] = await Promise.all([
            StorageService.getWords(),
            StorageService.getSettings(),
          ]);
          setInWordbook(
            !!key && words.some((w) => w.word.toLowerCase() === key)
          );
          setSoundEnabled(settings.soundEnabled !== false);
        } catch {
          setInWordbook(false);
        }
      })();
    }, [route.params])
  );

  const speakWord = (text: string) => {
    if (!soundEnabled) return;
    if (Speech && Platform.OS !== 'web') {
      Speech.speak(text, { language: 'en-US', pitch: 1.0, rate: 0.8 });
    } else if (Platform.OS === 'web' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.8;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const addToWordbook = useCallback(() => {
    if (!word || inWordbook) return;
    confirmAction(
      '加入生词本？',
      `将「${word.word}」加入你的生词本`,
      async () => {
        try {
          await StorageService.addWord(word);
          setInWordbook(true);
        } catch (e) {
          console.warn('addWord failed:', e);
        }
      },
      '加入'
    );
  }, [word, inWordbook]);

  if (!word) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>未找到该单词</Text>
        <Button onPress={() => navigation.goBack()}>返回</Button>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Surface style={styles.card}>
        <View style={styles.wordHeader}>
          <View style={styles.wordInfo}>
            <Text style={styles.wordText}>{word.word}</Text>
            {word.pronunciation_uk ? (
              <Text style={styles.pronunciation}>UK {word.pronunciation_uk}</Text>
            ) : null}
            {word.pronunciation_us ? (
              <Text style={styles.pronunciation}>US {word.pronunciation_us}</Text>
            ) : null}
          </View>
          <IconButton
            icon={soundEnabled ? 'volume-high' : 'volume-off'}
            size={28}
            onPress={() => speakWord(word.word)}
            disabled={!soundEnabled}
          />
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.metaBadge, { color: difficultyColor(word.difficulty) }]}>
            难度 {'★'.repeat(word.difficulty)}{'☆'.repeat(5 - word.difficulty)}
          </Text>
          <Text style={styles.freqBadge}>
            考频 {'■'.repeat(word.frequency)}{'□'.repeat(5 - word.frequency)}
          </Text>
        </View>
      </Surface>

      <Surface style={styles.card}>
        <Text style={styles.sectionTitle}>释义</Text>
        {word.definitions.map((def, index) => (
          <Surface key={index} style={styles.definitionItem}>
            <View style={styles.definitionHeader}>
              <Text style={styles.definitionLabel}>{def.part_of_speech}</Text>
              {def.is_core ? (
                <Chip compact style={styles.chip}>核心</Chip>
              ) : null}
              {def.is_rare_sense ? (
                <Chip compact style={styles.chip}>熟词僻义</Chip>
              ) : null}
            </View>
            <Text style={styles.definitionMeaning}>{def.meaning}</Text>
            {def.example ? (
              <Text style={styles.definitionExample}>例句：{def.example}</Text>
            ) : null}
          </Surface>
        ))}
      </Surface>

      {word.etymology ? (
        <Surface style={styles.card}>
          <Text style={styles.sectionTitle}>词根词缀</Text>
          <Text style={styles.sectionText}>{word.etymology}</Text>
        </Surface>
      ) : null}

      {word.memory_tip && showMemoryTip ? (
        <Surface style={styles.card}>
          <Text style={styles.sectionTitle}>记忆技巧</Text>
          <Text style={styles.sectionText}>{word.memory_tip}</Text>
        </Surface>
      ) : null}

      {Array.isArray(word.similar_words) && word.similar_words.length > 0 ? (
        <Surface style={styles.card}>
          <Text style={styles.sectionTitle}>易混词 / 相似词</Text>
          {word.similar_words.map((item, index) => (
            <View key={index} style={styles.similarItem}>
              <Text style={styles.similarWord}>
                {item.word} ({item.relation})
              </Text>
              <Text style={styles.similarDescription}>{item.description}</Text>
            </View>
          ))}
        </Surface>
      ) : null}

      <Button
        mode={inWordbook ? 'outlined' : 'contained'}
        icon={inWordbook ? 'check' : 'book-plus'}
        onPress={addToWordbook}
        disabled={inWordbook}
        style={styles.addBtn}
      >
        {inWordbook ? '已在生词本' : '加入生词本'}
      </Button>

      <Button
        mode="text"
        onPress={() => navigation.goBack()}
        style={styles.backButton}
      >
        返回
      </Button>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.background,
  },
  emptyText: {
    fontSize: 18,
    marginBottom: 16,
    color: colors.onSurfaceVariant,
  },
  wordHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  wordInfo: {
    flex: 1,
  },
  wordText: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    color: colors.onSurface,
  },
  pronunciation: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  metaBadge: {
    fontSize: 12,
    lineHeight: 16,
  },
  freqBadge: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: colors.onSurface,
  },
  definitionItem: {
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  definitionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  definitionLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 8,
    color: colors.onSurface,
  },
  chip: {
    marginLeft: 8,
  },
  definitionMeaning: {
    fontSize: 14,
    color: colors.onSurface,
    marginBottom: 6,
  },
  definitionExample: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
  },
  sectionText: {
    fontSize: 14,
    color: colors.onSurface,
    lineHeight: 22,
  },
  similarItem: {
    marginBottom: 12,
  },
  similarWord: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.onSurface,
  },
  similarDescription: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
  },
  addBtn: {
    marginBottom: 8,
    borderRadius: 8,
  },
  backButton: {
    marginTop: 4,
  },
}));
