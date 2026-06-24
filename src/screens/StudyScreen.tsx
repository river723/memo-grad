import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, StyleSheet, TextInput, Platform, Alert } from 'react-native';
import {
  Card,
  Text,
  Button,
  ProgressBar,
  Surface,
  Chip,
  SegmentedButtons,
  Modal,
  ActivityIndicator,
  IconButton
} from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import { Word, StudyRecord, AppSettings, Article } from '../types';
import { REVIEW_INTERVALS } from '../constants';
import { format, addDays } from 'date-fns';
import AIService from '../services/AIService';
import { canWordBeEnhanced, mergeAIResultIntoWord } from '../utils/wordUtils';

type StudyScreenMode = 'flashcard' | 'listening' | 'quiz' | 'article';

interface PreviewSegment {
  text: string;
  isWord: boolean;
  wordObj?: Word;
}

function parsePreviewContent(
  content: string,
  targetWords: string[],
  wordMap?: Map<string, Word>
): PreviewSegment[] {
  if (!content || targetWords.length === 0) {
    return [{ text: content || '', isWord: false }];
  }

  const escapedWords = targetWords
    .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`\\b(${escapedWords.join('|')})\\b`, 'gi');

  const segments: PreviewSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: content.substring(lastIndex, match.index), isWord: false });
    }
    const matchedWord = match[0];
    segments.push({
      text: matchedWord,
      isWord: true,
      wordObj: wordMap?.get(matchedWord.toLowerCase()),
    });
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < content.length) {
    segments.push({ text: content.substring(lastIndex), isWord: false });
  }

  return segments;
}

// Web 平台兼容性处理
let Speech: any = null;
if (Platform.OS !== 'web') {
  try {
    Speech = require('expo-speech');
  } catch (error) {
    console.warn('expo-speech not available:', error);
  }
}

export default function StudyScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const customWordIds = Array.isArray(route.params?.wordIds)
    ? route.params.wordIds.filter((id: unknown): id is number => typeof id === 'number')
    : [];
  const customWordIdKey = customWordIds.join(',');
  const [currentMode, setCurrentMode] = useState<StudyScreenMode>('flashcard');
  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studyStats, setStudyStats] = useState({
    total: 0,
    completed: 0,
    correct: 0,
    accuracy: 0
  });
  const [showResult, setShowResult] = useState(false);
  const [currentResult, setCurrentResult] = useState<'correct' | 'incorrect' | null>(null);
  const [quizOptions, setQuizOptions] = useState<string[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [showQuizResult, setShowQuizResult] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [listenAnswer, setListenAnswer] = useState('');
  const [wordTypeCounts, setWordTypeCounts] = useState({ newCount: 0, reviewCount: 0 });
  const [allStudiedToday, setAllStudiedToday] = useState(false);
  const [isCustomReview, setIsCustomReview] = useState(false);
  const [isContinueSession, setIsContinueSession] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [trulyCompleted, setTrulyCompleted] = useState(0);
  const [speechSettings, setSpeechSettings] = useState({
    soundEnabled: true,
    autoPlaySound: false,
  });
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [enhancingWordId, setEnhancingWordId] = useState<number | null>(null);
  const [isGeneratingArticle, setIsGeneratingArticle] = useState(false);
  const [generatedArticle, setGeneratedArticle] = useState<{
    title: string;
    content: string;
    translation: string;
  } | null>(null);
  const [articleError, setArticleError] = useState<string | null>(null);
  const [showArticleTranslation, setShowArticleTranslation] = useState(false);
  const [generatedArticleWords, setGeneratedArticleWords] = useState<Word[]>([]);
  const [selectedArticleWord, setSelectedArticleWord] = useState<Word | null>(null);
  const [showArticleWordModal, setShowArticleWordModal] = useState(false);
  const [loadedArticleId, setLoadedArticleId] = useState<number | null>(null);
  // 用 useRef 追踪重试中单词的连续正确次数，不在 Map 中的单词 = 还没答错过（首次答对即过关）
  const retryMapRef = useRef<Map<number, number>>(new Map());
  const pendingIndexRef = useRef<number>(0);

  useEffect(() => {
    loadStudyWords();
  }, [customWordIdKey]);

  // 监听浮层关闭 + 队列为空 → 触发完成卡片
  useEffect(() => {
    if (!showResult && words.length === 0 && studyStats.completed > 0) {
      setShowCompletion(true);
    }
  }, [showResult, words.length]);

  useEffect(() => {
    if (currentMode === 'quiz' && words.length > 0) {
      generateQuizOptions();
    }
  }, [currentMode, currentIndex]);

  useEffect(() => {
    if (currentMode === 'article' && words.length > 0 && !generatedArticle) {
      loadExistingArticleForCurrentWords();
    }
  }, [currentMode, words.length, generatedArticle]);

  const loadStudyWords = async (exceedDailyLimit = false) => {
    try {
      setGeneratedArticle(null);
      setGeneratedArticleWords([]);
      setLoadedArticleId(null);
      setArticleError(null);
      setShowArticleTranslation(false);

      const todayPlans = await StorageService.getTodayStudyPlan();
      const allWords = await StorageService.getWords();
      const allRecords = await StorageService.getStudyRecords();
      const today = format(new Date(), 'yyyy-MM-dd');

      const settings = await StorageService.getSettings();
      setAppSettings(settings);
      setSpeechSettings({
        soundEnabled: settings.soundEnabled !== false,
        autoPlaySound: settings.autoPlaySound === true,
      });
      const dailyLimit = typeof settings.dailyNewWords === 'number'
        ? settings.dailyNewWords
        : 10;

      let studyWords: Word[] = [];
      let newWordList: Word[] = [];
      let reviewWordList: Word[] = [];

      if (customWordIds.length > 0) {
        const customIdSet = new Set(customWordIds);
        studyWords = allWords.filter(w => typeof w.id === 'number' && customIdSet.has(w.id));

        setWords(studyWords);
        setWordTypeCounts({ newCount: 0, reviewCount: studyWords.length });
        setStudyStats({
          total: studyWords.length,
          completed: 0,
          correct: 0,
          accuracy: 0
        });
        setCurrentIndex(0);
        setIsFlipped(false);
        setAllStudiedToday(false);
        setIsCustomReview(true);
        setIsContinueSession(false);
        setShowCompletion(false);
        retryMapRef.current = new Map();
        setTrulyCompleted(0);
        return;
      }

      setIsCustomReview(false);

      if (todayPlans.length > 0) {
        const wordIds = todayPlans.map(p => p.word_id).filter(id => id > 0);
        studyWords = allWords.filter(w => wordIds.includes(w.id!));
        newWordList = studyWords.filter(w =>
          todayPlans.some(p => p.word_id === w.id && p.plan_type === 'new')
        );
        reviewWordList = studyWords.filter(w =>
          todayPlans.some(p => p.word_id === w.id && p.plan_type === 'review')
        );
      } else {
        const allNewWords: Word[] = [];
        const allReviewWords: Word[] = [];

        for (const word of allWords) {
          const wordRecords = allRecords.filter(r => r.word_id === word.id);

          if (wordRecords.length === 0) {
            allNewWords.push(word);
          } else {
            const lastStudy = wordRecords.reduce((latest, r) =>
              r.study_date > latest ? r.study_date : latest, ''
            );
            const diffDays = Math.floor(
              (new Date(today).getTime() - new Date(lastStudy).getTime())
              / (1000 * 60 * 60 * 24)
            );

            if (REVIEW_INTERVALS.includes(diffDays)) {
              allReviewWords.push(word);
            }
          }
        }

        // 新词限量，复习词全取
        newWordList = allNewWords.slice(0, dailyLimit);
        reviewWordList = allReviewWords;
        studyWords = [...newWordList, ...reviewWordList];

        if (studyWords.length === 0) {
          setAllStudiedToday(true);
          setWords([]);
          return;
        }

        setAllStudiedToday(false);

        // 创建今日学习计划
        for (const word of studyWords) {
          const isNew = !allRecords.some(r => r.word_id === word.id);
          await StorageService.addStudyPlan({
            word_id: word.id!,
            plan_date: today,
            plan_type: isNew ? 'new' : 'review',
            completed: false
          });
        }
      }

      setWords(studyWords);
      setWordTypeCounts({
        newCount: newWordList.length,
        reviewCount: reviewWordList.length,
      });
      setStudyStats({
        total: studyWords.length,
        completed: 0,
        correct: 0,
        accuracy: 0
      });
      setCurrentIndex(0);
      setIsFlipped(false);
      setIsContinueSession(exceedDailyLimit);
      setShowCompletion(false);
      retryMapRef.current = new Map();
      setTrulyCompleted(0);
    } catch (error) {
      console.error('Failed to load study words:', error);
    }
  };

  const getCurrentWord = (): Word | null => {
    if (words.length === 0) return null;
    return words[currentIndex] || null;
  };

  // 手动触发 AI 补全：词条「骨架」缺词根/例句/近义词时由用户点击按钮调
  const enhanceCurrentWord = async () => {
    const w = getCurrentWord();
    if (!w || !appSettings || w.id == null) return;
    setEnhancingWordId(w.id);
    try {
      const ai = AIService.fromSettings(appSettings);
      const result = await ai.analyzeWord(w.word);
      const merged = mergeAIResultIntoWord(w, result);

      await StorageService.updateWord(w.id, merged);
      setWords(prev =>
        prev.map(x => (x.id === w.id ? { ...x, ...merged } : x))
      );
    } catch (err) {
      console.warn('AI 增强失败:', err);
    } finally {
      setEnhancingWordId(null);
    }
  };

  // 处理单词正式完成后的收尾工作（创建复习计划、标记计划完成）
  const finishWord = async (word: Word) => {
    try {
      const allPlans = await StorageService.getStudyPlans();
      const today = format(new Date(), 'yyyy-MM-dd');
      const matchingPlan = allPlans.find(
        p => p.word_id === word.id && p.plan_date === today && !p.completed
      );
      if (matchingPlan?.id) {
        await StorageService.completeStudyPlan(matchingPlan.id);
      }

      for (const interval of REVIEW_INTERVALS) {
        const reviewDate = format(addDays(new Date(), interval), 'yyyy-MM-dd');
        const alreadyPlanned = allPlans.some(
          p => p.word_id === word.id && p.plan_date === reviewDate
        );
        if (!alreadyPlanned) {
          await StorageService.addStudyPlan({
            word_id: word.id!,
            plan_date: reviewDate,
            plan_type: 'review',
            completed: false
          });
        }
      }
    } catch (error) {
      console.error('Failed to finish word:', error);
    }
  };

  const handleResult = async (isCorrect: boolean) => {
    const currentWord = getCurrentWord();
    if (!currentWord || currentMode === 'article') return;

    try {
      // 1. 记录学习记录
      const record: Omit<StudyRecord, 'id'> = {
        word_id: currentWord.id!,
        study_date: format(new Date(), 'yyyy-MM-dd'),
        result: isCorrect ? 1 : 0,
        study_mode: currentMode
      };
      await StorageService.addStudyRecord(record);

      // 2. 更新统计
      setStudyStats(prev => {
        const newCompleted = prev.completed + 1;
        const newCorrect = prev.correct + (isCorrect ? 1 : 0);
        return {
          ...prev,
          completed: newCompleted,
          correct: newCorrect,
          accuracy: (newCorrect / newCompleted) * 100
        };
      });

      const retryMap = retryMapRef.current;
      const inRetry = retryMap.has(currentWord.id!);
      let wordFinished = false;

      if (isCorrect && !inRetry) {
        // ★ 首次就答对 → 直接完成
        await finishWord(currentWord);
        wordFinished = true;
      } else if (isCorrect && inRetry) {
        // ★ 重试中答对 → 计数器 +1
        const count = retryMap.get(currentWord.id!)! + 1;
        if (count >= 2) {
          await finishWord(currentWord);
          retryMap.delete(currentWord.id!);
          wordFinished = true;
        } else {
          retryMap.set(currentWord.id!, count);
        }
      } else {
        // ★ 答错 → 进入重试模式（或计数器归零）
        retryMap.set(currentWord.id!, 0);
      }

      // 3. 更新队列 + 计算 nextIndex
      // 先恢复到卡片正面，避免队列更新后短暂显示下一个单词的释义面
      setIsFlipped(false);
      const wasLast = currentIndex >= words.length - 1;
      const nextIndex = wasLast ? 0 : currentIndex;

      if (wordFinished) {
        setWords(prev => prev.filter((_, i) => i !== currentIndex));
        setTrulyCompleted(prev => prev + 1);
      } else {
        setWords(prev => {
          const newWords = [...prev];
          const [moved] = newWords.splice(currentIndex, 1);
          newWords.push(moved);
          return newWords;
        });
      }

      pendingIndexRef.current = nextIndex;

      // 4. 显示结果浮层
      setCurrentResult(isCorrect ? 'correct' : 'incorrect');
      setShowResult(true);

      setTimeout(() => {
        setShowResult(false);
        setCurrentIndex(pendingIndexRef.current);
        setIsFlipped(false);
        setSelectedAnswer('');
        setShowQuizResult(false);
        setListenAnswer('');
      }, wordFinished ? 1500 : 1200);

    } catch (error) {
      console.error('Failed to save study record:', error);
    }
  };

  const speakWord = (word: string) => {
    if (!speechSettings.soundEnabled) return;

    if (Speech && Platform.OS !== 'web') {
      Speech.speak(word, {
        language: 'en-US',
        pitch: 1.0,
        rate: 0.8
      });
    } else if (Platform.OS === 'web' && 'speechSynthesis' in window) {
      // Web 平台的语音合成
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.8;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const generateQuizOptions = () => {
    const currentWord = getCurrentWord();
    if (!currentWord) return;

    const correctMeaning = currentWord.definitions[0]?.meaning || '';
    const otherWords = words.filter(w => w.id !== currentWord.id);
    const wrongOptions = otherWords
      .slice(0, 3)
      .map(w => w.definitions[0]?.meaning || 'Unknown meaning');

    const allOptions = [correctMeaning, ...wrongOptions].sort(() => Math.random() - 0.5);
    setQuizOptions(allOptions);
  };

  const handleQuizAnswer = (answer: string) => {
    setSelectedAnswer(answer);
    const currentWord = getCurrentWord();
    if (!currentWord) return;

    const isCorrect = answer === currentWord.definitions[0]?.meaning;
    setShowQuizResult(true);

    setTimeout(() => {
      handleResult(isCorrect);
    }, 1500);
  };

  const startListeningMode = () => {
    const currentWord = getCurrentWord();
    if (!currentWord || !speechSettings.soundEnabled) return;

    setIsListening(true);
    speakWord(currentWord.word);

    setTimeout(() => {
      setIsListening(false);
    }, 10000);
  };

  useEffect(() => {
    const currentWord = getCurrentWord();
    if (
      currentWord &&
      currentMode === 'flashcard' &&
      !showResult &&
      !showCompletion &&
      speechSettings.soundEnabled &&
      speechSettings.autoPlaySound
    ) {
      speakWord(currentWord.word);
    }
  }, [currentIndex, words, currentMode, showResult, showCompletion, speechSettings]);

  const handleListenSubmit = () => {
    const currentWord = getCurrentWord();
    if (!currentWord) return;

    const isCorrect = listenAnswer.trim().toLowerCase() === currentWord.word.toLowerCase();
    handleResult(isCorrect);
  };

  const getArticleWords = () => words.slice(0, 30);

  const getArticleTargetLength = (articleWords: Word[]) => articleWords.length * 20;

  const getArticleWordIds = (articleWords: Word[]) => articleWords
    .map(w => w.id)
    .filter((id): id is number => typeof id === 'number');

  const handleArticleWordTap = (wordObj?: Word) => {
    if (!wordObj) return;
    setSelectedArticleWord(wordObj);
    setShowArticleWordModal(true);
  };

  const loadExistingArticleForCurrentWords = async () => {
    const articleWords = getArticleWords();
    const currentWordIds = getArticleWordIds(articleWords);
    if (currentWordIds.length === 0) return;

    try {
      const articles = await StorageService.getArticles();
      const matchedArticle = articles
        .filter(article => {
          const articleIdSet = new Set(article.word_ids.filter(id => typeof id === 'number'));
          return currentWordIds.every(id => articleIdSet.has(id));
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

      if (matchedArticle) {
        setGeneratedArticle({
          title: matchedArticle.title,
          content: matchedArticle.content,
          translation: matchedArticle.translation,
        });
        setGeneratedArticleWords(articleWords);
        setLoadedArticleId(matchedArticle.id || null);
        setArticleError('已载入该组单词的历史短文，不会消耗 AI 额度。');
        setShowArticleTranslation(false);
      }
    } catch (error) {
      console.warn('Failed to load existing article:', error);
    }
  };

  const handleGenerateArticle = async () => {
    setArticleError(null);

    const articleWords = getArticleWords();
    const targetLength = getArticleTargetLength(articleWords);
    if (articleWords.length === 0) {
      setArticleError('本轮暂无可用于生成短文的单词');
      return;
    }

    const latestSettings = await StorageService.getSettings();
    setAppSettings(latestSettings);

    if (!latestSettings.apiKey || !latestSettings.aiModel) {
      const msg = '请先在设置中配置 AI API';
      setArticleError(msg);
      Alert.alert('未配置 API', msg);
      return;
    }

    setIsGeneratingArticle(true);
    setShowArticleTranslation(false);
    setGeneratedArticleWords([]);
    setLoadedArticleId(null);
    try {
      const aiService = AIService.fromSettings(latestSettings);
      const result = await aiService.generateFunArticle(
        articleWords.map(w => w.word),
        'random',
        targetLength
      );
      setGeneratedArticle(result);
      setGeneratedArticleWords(articleWords);

      try {
        const articleData: Omit<Article, 'id'> = {
          title: result.title,
          content: result.content,
          translation: result.translation,
          words: articleWords.map(w => w.word),
          word_ids: articleWords.map(w => w.id).filter((id): id is number => typeof id === 'number'),
          theme: 'random',
          created_at: new Date().toISOString(),
          read_count: 0,
        };
        const articleId = await StorageService.saveArticle(articleData);
        setLoadedArticleId(articleId);
        setArticleError('已自动保存，可在“趣味文章”中找到。');
      } catch (saveError) {
        console.warn('Auto-save article failed:', saveError);
        setArticleError('短文已生成，但自动保存失败，请稍后重试。');
      }
    } catch (error: any) {
      const msg = error.message || '短文生成失败，请重试';
      setArticleError(msg);
      Alert.alert('生成失败', msg);
    } finally {
      setIsGeneratingArticle(false);
    }
  };

  const renderHighlightedArticle = () => {
    if (!generatedArticle) return null;

    const articleWords = generatedArticleWords.length > 0 ? generatedArticleWords : getArticleWords();
    const wordMap = new Map(articleWords.map(word => [word.word.toLowerCase(), word]));
    const segments = parsePreviewContent(
      generatedArticle.content,
      articleWords.map(w => w.word),
      wordMap
    );
    return (
      <Text style={styles.articleContentText}>
        {segments.map((segment, index) => (
          <Text
            key={`${segment.text}-${index}`}
            style={segment.isWord ? styles.articleHighlight : undefined}
            onPress={segment.isWord ? () => handleArticleWordTap(segment.wordObj) : undefined}
          >
            {segment.text}
          </Text>
        ))}
      </Text>
    );
  };

  const renderArticleMode = () => {
    const articleWords = getArticleWords();
    const targetLength = getArticleTargetLength(articleWords);
    const hiddenWordCount = Math.max(0, words.length - articleWords.length);

    return (
      <View style={styles.modeContainer}>
        <Card style={styles.wordCard}>
          <Card.Content>
            <Text style={styles.articleTitle}>生成短文</Text>
            <Text style={styles.articleSubtitle}>
              用本轮单词生成一篇有趣英文短文，通过语境帮助记忆；阅读不会计入答题准确率。
            </Text>

            <View style={styles.articleWordWrap}>
              {articleWords.slice(0, 12).map(word => (
                <Chip key={word.id || word.word} compact style={styles.articleWordChip}>
                  {word.word}
                </Chip>
              ))}
              {articleWords.length > 12 && (
                <Chip compact style={styles.articleWordChip}>等 {articleWords.length} 个</Chip>
              )}
              {hiddenWordCount > 0 && (
                <Chip compact style={styles.articleLimitChip}>已优先使用前 30 个</Chip>
              )}
            </View>

            <Text style={styles.articleAutoLengthText}>
              将根据 {articleWords.length} 个生词自动生成约 {targetLength} 词的短文。
            </Text>

            {articleError && (
              <Text style={loadedArticleId ? styles.articleInfo : styles.articleError}>
                {articleError}
              </Text>
            )}

            <Button
              mode="contained"
              onPress={handleGenerateArticle}
              loading={isGeneratingArticle}
              disabled={isGeneratingArticle || articleWords.length === 0}
              icon="creation"
              style={styles.articleGenerateButton}
            >
              {generatedArticle ? '重新生成短文' : '生成短文'}
            </Button>

            {isGeneratingArticle && (
              <View style={styles.articleLoadingBox}>
                <ActivityIndicator animating color="#1976D2" />
                <Text style={styles.articleLoadingText}>AI 正在为你创作短文...</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {generatedArticle && (
          <Card style={styles.articlePreviewCard}>
            <Card.Content>
              <Text style={styles.articlePreviewTitle}>{generatedArticle.title}</Text>
              {renderHighlightedArticle()}

              <Text style={styles.articleTapHint}>
                💡 点击文中<Text style={styles.articleTapHintHighlight}>蓝色高亮</Text>生词可查看释义
              </Text>

              {!!generatedArticle.translation && (
                <Button
                  mode="text"
                  onPress={() => setShowArticleTranslation(prev => !prev)}
                  style={styles.articleTranslationButton}
                >
                  {showArticleTranslation ? '隐藏中文翻译' : '显示中文翻译'}
                </Button>
              )}

              {showArticleTranslation && !!generatedArticle.translation && (
                <Surface style={styles.articleTranslationBox}>
                  <Text style={styles.articleTranslationText}>{generatedArticle.translation}</Text>
                </Surface>
              )}
            </Card.Content>
          </Card>
        )}
      </View>
    );
  };

  const renderFlashcardMode = () => {
    const currentWord = getCurrentWord();
    if (!currentWord) return null;

    return (
      <View style={styles.modeContainer}>
        <Card style={styles.wordCard}>
          <Card.Content style={styles.cardContent}>
            {!isFlipped ? (
              <View style={styles.cardFront}>
                <Text style={styles.wordText}>{currentWord.word}</Text>
                {currentWord.pronunciation_uk && (
                  <Text style={styles.pronunciation}>
                    UK [{currentWord.pronunciation_uk}]
                  </Text>
                )}
                {currentWord.pronunciation_us && (
                  <Text style={styles.pronunciation}>
                    US [{currentWord.pronunciation_us}]
                  </Text>
                )}
                <Button
                  mode="outlined"
                  onPress={() => speakWord(currentWord.word)}
                  style={styles.soundButton}
                  icon={speechSettings.soundEnabled ? 'volume-high' : 'volume-off'}
                  disabled={!speechSettings.soundEnabled}
                >
                  {speechSettings.soundEnabled ? '发音' : '发音已关闭'}
                </Button>
                <Text style={styles.flipHint}>点击翻转</Text>
              </View>
            ) : (
              <View style={styles.cardBack}>
                {/* 单词 + 发音 */}
                <View style={styles.cardBackWordHeader}>
                  <Text style={styles.cardBackWord}>{currentWord.word}</Text>
                  <Button
                    mode="text"
                    onPress={() => speakWord(currentWord.word)}
                    icon={speechSettings.soundEnabled ? 'volume-high' : 'volume-off'}
                    compact
                    disabled={!speechSettings.soundEnabled}
                  >
                    {' '}
                  </Button>
                </View>
                {currentWord.pronunciation_uk && (
                  <Text style={styles.cardBackPronunciation}>
                    UK [{currentWord.pronunciation_uk}]
                    {currentWord.pronunciation_us ? `  US [${currentWord.pronunciation_us}]` : ''}
                  </Text>
                )}

                {/* 词根词缀 */}
                {currentWord.etymology && (
                  <Surface style={styles.etymologyBox}>
                    <Text style={styles.etymologyTitle}>🔍 词根词缀</Text>
                    <Text style={styles.etymologyText}>{currentWord.etymology}</Text>
                  </Surface>
                )}

                {/* 释义列表 */}
                {currentWord.definitions.map((def, index) => (
                  <Surface key={index} style={styles.definitionItem}>
                    <View style={styles.definitionHeader}>
                      <Text style={styles.partOfSpeech}>{def.part_of_speech}</Text>
                      {def.is_core && <Chip mode="flat" compact style={styles.coreTag}>核心</Chip>}
                      {def.is_rare_sense && <Chip mode="flat" compact style={styles.rareTag}>熟词僻义</Chip>}
                    </View>
                    <Text style={styles.meaning}>{def.meaning}</Text>
                    {def.example && (
                      <Text style={styles.example}>例句: {def.example}</Text>
                    )}
                  </Surface>
                ))}

                {/* AI 补全：仅当词条信息不全且已配置 AI 时显示 */}
                {canWordBeEnhanced(currentWord, appSettings) && (
                  <Button
                    mode="outlined"
                    icon="auto-fix"
                    onPress={enhanceCurrentWord}
                    loading={enhancingWordId === currentWord.id}
                    disabled={enhancingWordId === currentWord.id}
                    style={styles.enhanceBtn}
                    compact
                  >
                    {enhancingWordId === currentWord.id
                      ? 'AI 补全中...'
                      : 'AI 补全词根、例句、近义词'}
                  </Button>
                )}
              </View>
            )}
          </Card.Content>
        </Card>

        <Button
          mode="outlined"
          onPress={() => setIsFlipped(!isFlipped)}
          style={styles.flipButton}
        >
          {isFlipped ? '显示单词' : '显示释义'}
        </Button>

        {isFlipped && (
          <View style={styles.resultButtons}>
            <Button
              mode="contained"
              onPress={() => handleResult(false)}
              style={[styles.resultButton, { backgroundColor: '#F44336' }]}
            >
              不认识
            </Button>
            <Button
              mode="contained"
              onPress={() => handleResult(true)}
              style={[styles.resultButton, { backgroundColor: '#4CAF50' }]}
            >
              认识
            </Button>
          </View>
        )}
      </View>
    );
  };

  const renderListeningMode = () => {
    const currentWord = getCurrentWord();
    if (!currentWord) return null;

    return (
      <View style={styles.modeContainer}>
        <Card style={styles.wordCard}>
          <Card.Content>
            <View style={styles.listeningContainer}>
              <Text style={styles.listeningTitle}>听力练习</Text>
              <Surface style={styles.soundIcon}>
                <Text style={styles.soundEmoji}>{isListening ? '🔊' : '🎧'}</Text>
              </Surface>
              <Text style={styles.listeningHint}>
                {!speechSettings.soundEnabled
                  ? '发音功能已关闭，请先到设置中开启'
                  : isListening
                  ? '播放中...'
                  : '点击听取单词发音'}
              </Text>
              <Button
                mode="contained"
                onPress={startListeningMode}
                loading={isListening}
                disabled={isListening || !speechSettings.soundEnabled}
                style={styles.playButton}
                icon={speechSettings.soundEnabled ? 'play' : 'volume-off'}
              >
                {speechSettings.soundEnabled ? '播放' : '发音已关闭'}
              </Button>

              {isListening && (
                <View style={styles.answerSection}>
                  <Text style={styles.answerTitle}>你听到了哪个单词？</Text>
                  <TextInput
                    mode="outlined"
                    placeholder="输入你听到的单词"
                    value={listenAnswer}
                    onChangeText={setListenAnswer}
                    style={styles.listenInput}
                    autoCapitalize="none"
                  />
                  <View style={styles.answerButtons}>
                    <Button
                      mode="outlined"
                      onPress={() => handleResult(false)}
                      style={styles.answerBtn}
                    >
                      跳过
                    </Button>
                    <Button
                      mode="contained"
                      onPress={handleListenSubmit}
                      style={styles.answerBtn}
                    >
                      提交
                    </Button>
                  </View>
                </View>
              )}
            </View>
          </Card.Content>
        </Card>
      </View>
    );
  };

  const renderQuizMode = () => {
    const currentWord = getCurrentWord();
    if (!currentWord) return null;

    return (
      <View style={styles.modeContainer}>
        <Card style={styles.wordCard}>
          <Card.Content>
            <Text style={styles.quizTitle}>选择正确的释义</Text>
            <Text style={styles.quizWord}>{currentWord.word}</Text>

            <View style={styles.optionsContainer}>
              {quizOptions.map((option, index) => {
                const isSelected = selectedAnswer === option;
                const isCorrect = option === currentWord.definitions[0]?.meaning;
                const showFeedback = showQuizResult && isSelected;

                return (
                  <Surface
                    key={index}
                    style={[
                      styles.optionItem,
                      isSelected && styles.selectedOption,
                      showFeedback && isCorrect && styles.correctOption,
                      showFeedback && !isCorrect && isSelected && styles.incorrectOption
                    ]}
                  >
                    <Button
                      mode="text"
                      onPress={() => !showQuizResult && handleQuizAnswer(option)}
                      style={styles.optionButton}
                      disabled={showQuizResult}
                    >
                      <Text style={styles.optionText}>{option}</Text>
                    </Button>
                    {showFeedback && (
                      <Text style={styles.resultIcon}>{isCorrect ? '✅' : '❌'}</Text>
                    )}
                  </Surface>
                );
              })}
            </View>
          </Card.Content>
        </Card>
      </View>
    );
  };

  if (words.length === 0 && studyStats.completed === 0) {
    return (
      <View style={styles.container}>
        <Card style={styles.emptyCard}>
          <Card.Content style={styles.emptyContent}>
            {isCustomReview ? (
              <>
                <Text style={styles.emptyTitle}>暂无可复习单词</Text>
                <Text style={styles.emptyText}>
                  这些困难单词可能已被删除，请返回统计页重新选择。
                </Text>
              </>
            ) : allStudiedToday ? (
              <>
                <Text style={styles.emptyTitle}>今日任务已完成！</Text>
                <Text style={styles.emptyText}>
                  你今天已经学完了所有可用单词。明天再来复习，或者添加更多单词到生词本吧。
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>暂无单词</Text>
                <Text style={styles.emptyText}>
                  请先添加一些单词到生词本
                </Text>
              </>
            )}
            {!isCustomReview && (
              <Button
                mode="contained"
                onPress={() => navigation.navigate('AddWord' as never)}
                style={styles.addWordBtn}
              >
                添加单词
              </Button>
            )}
            {(isCustomReview || allStudiedToday) && (
              <Button
                mode="outlined"
                onPress={() => navigation.goBack()}
                style={styles.addWordBtn}
              >
                返回
              </Button>
            )}
          </Card.Content>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Card style={styles.modeSelector}>
        <Card.Content>
          <SegmentedButtons
            value={currentMode}
            onValueChange={(value) => {
              setCurrentMode(value as StudyScreenMode);
              setCurrentIndex(0);
              setIsFlipped(false);
              setSelectedAnswer('');
              setShowQuizResult(false);
              setShowResult(false);
              setListenAnswer('');
              setIsListening(false);
            }}
            buttons={[
              { value: 'flashcard', label: '📖 单词卡' },
              { value: 'listening', label: '🔊 听写' },
              { value: 'quiz', label: '✏️ 释义' },
              { value: 'article', label: '✨ 短文' }
            ]}
          />
        </Card.Content>
      </Card>

      <Card style={styles.progressCard}>
        <Card.Content>
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>
              {currentIndex + 1} / {words.length}
            </Text>
            <View style={styles.progressRight}>
              <Text style={styles.accuracyText}>
                准确率: {studyStats.accuracy.toFixed(1)}%
              </Text>
              <Button
                mode="text"
                onPress={() => setShowExitConfirm(true)}
                icon="close"
                textColor="#999"
                compact
                style={styles.exitBtn}
              >
                退出
              </Button>
            </View>
          </View>
          <ProgressBar
            progress={(currentIndex + 1) / Math.max(words.length, 1)}
            color="#1976D2"
            style={styles.progressBar}
          />
        </Card.Content>
      </Card>

      <ScrollView style={styles.content}>
        {showCompletion ? (
          <Card style={styles.completionCard}>
            <Card.Content style={styles.completionContent}>
              <Text style={styles.completionIcon}>
                {studyStats.accuracy >= 80 ? '\u{1F389}' : '\u{1F4AA}'}
              </Text>
              <Text style={styles.completionTitle}>
                {isCustomReview ? '强化复习完成！' : isContinueSession ? '本轮完成！' : '今日目标达成！'}
              </Text>

              <View style={styles.completionStats}>
                <View style={styles.completionStatItem}>
                  <Text style={styles.completionStatNumber}>
                    {Math.min(wordTypeCounts.newCount, studyStats.completed)}
                  </Text>
                  <Text style={styles.completionStatLabel}>新词</Text>
                </View>
                <View style={styles.completionStatItem}>
                  <Text style={styles.completionStatNumber}>
                    {Math.max(0, studyStats.completed -
                      Math.min(wordTypeCounts.newCount, studyStats.completed))}
                  </Text>
                  <Text style={styles.completionStatLabel}>复习</Text>
                </View>
                <View style={styles.completionStatItem}>
                  <Text style={[styles.completionStatNumber, {
                    color: studyStats.accuracy >= 80 ? '#4CAF50' :
                           studyStats.accuracy >= 60 ? '#FF9800' : '#F44336'
                  }]}>
                    {studyStats.accuracy.toFixed(1)}%
                  </Text>
                  <Text style={styles.completionStatLabel}>准确率</Text>
                </View>
              </View>

              <Text style={styles.completionDetail}>
                {studyStats.correct}/{studyStats.completed} 正确
              </Text>

              <View style={styles.completionActions}>
                <Button
                  mode="contained"
                  onPress={() => loadStudyWords(true)}
                  style={styles.completionPrimaryBtn}
                  icon="refresh"
                >
                  {isCustomReview ? '再练一遍' : '再来一组'}
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => navigation.goBack()}
                  style={styles.completionSecondaryBtn}
                  icon="arrow-left"
                >
                  返回
                </Button>
              </View>
            </Card.Content>
          </Card>
        ) : (
          <>
            {currentMode === 'flashcard' && renderFlashcardMode()}
            {currentMode === 'listening' && renderListeningMode()}
            {currentMode === 'quiz' && renderQuizMode()}
            {currentMode === 'article' && renderArticleMode()}
          </>
        )}
        {showResult && (
          <View style={styles.resultOverlay}>
            <Surface style={styles.resultSurface}>
              <Text style={[
                styles.resultText,
                currentResult === 'correct' ? styles.correctColor : styles.incorrectColor
              ]}>
                {currentResult === 'correct' ? '✅ 正确！' : '❌ 需要复习'}
              </Text>
            </Surface>
          </View>
        )}
      </ScrollView>

      {/* Exit confirmation Modal */}
      <Modal
        visible={showExitConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExitConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <Surface style={styles.modalContent}>
            <Text style={styles.modalTitle}>退出学习？</Text>
            <Text style={styles.modalText}>
              你已完成 {studyStats.completed} / {studyStats.total} 个单词。
              {'\n'}
              准确率: {studyStats.accuracy.toFixed(1)}%
              {'\n\n'}
              剩余单词将保留在学习计划中，下次可继续学习。
            </Text>
            <View style={styles.modalButtons}>
              <Button onPress={() => setShowExitConfirm(false)}>
                继续学习
              </Button>
              <Button
                mode="contained"
                onPress={() => {
                  setShowExitConfirm(false);
                  navigation.goBack();
                }}
                buttonColor="#F44336"
              >
                退出
              </Button>
            </View>
          </Surface>
        </View>
      </Modal>

      {/* 单词释义弹窗 */}
      <Modal
        visible={showArticleWordModal}
        onDismiss={() => setShowArticleWordModal(false)}
        contentContainerStyle={styles.articleWordModal}
      >
        {selectedArticleWord && (
          <View>
            <View style={styles.articleWordModalHeader}>
              <Text style={styles.articleWordModalTitle}>{selectedArticleWord.word}</Text>
              <IconButton
                icon="close"
                size={20}
                onPress={() => setShowArticleWordModal(false)}
              />
            </View>

            {selectedArticleWord.pronunciation_uk && (
              <Text style={styles.articleWordPronunciation}>
                英 /{selectedArticleWord.pronunciation_uk}/
                {selectedArticleWord.pronunciation_us &&
                  `  美 /${selectedArticleWord.pronunciation_us}/`}
              </Text>
            )}

            <View style={styles.articleWordDefinitions}>
              {selectedArticleWord.definitions.map((def, index) => (
                <View key={index} style={styles.articleWordDefItem}>
                  <View style={styles.articleWordDefHeader}>
                    <Chip style={styles.articleWordPosChip} textStyle={styles.articleWordPosChipText} compact>
                      {def.part_of_speech}
                    </Chip>
                    <Text style={styles.articleWordDefMeaning}>{def.meaning}</Text>
                    {def.is_core && (
                      <Chip
                        style={styles.articleWordCoreChip}
                        textStyle={styles.articleWordCoreChipText}
                        compact
                      >
                        核心
                      </Chip>
                    )}
                    {def.is_rare_sense && (
                      <Chip
                        style={styles.articleWordRareChip}
                        textStyle={styles.articleWordRareChipText}
                        compact
                      >
                        熟词僻义
                      </Chip>
                    )}
                  </View>
                  {def.example ? (
                    <Text style={styles.articleWordDefExample}>{def.example}</Text>
                  ) : null}
                </View>
              ))}
            </View>

            {selectedArticleWord.etymology ? (
              <View style={styles.articleWordEtymologySection}>
                <Text style={styles.articleWordSectionLabel}>词根词缀</Text>
                <Text style={styles.articleWordEtymologyText}>{selectedArticleWord.etymology}</Text>
              </View>
            ) : null}

            {Array.isArray(selectedArticleWord.similar_words) && selectedArticleWord.similar_words.length > 0 && (
              <View style={styles.articleWordSimilarSection}>
                <Text style={styles.articleWordSectionLabel}>易混词提醒</Text>
                {selectedArticleWord.similar_words.map((sw, index) => (
                  <Text key={index} style={styles.articleWordSimilarText}>
                    · {sw.word}（{sw.relation === 'spelling' ? '形近' : sw.relation === 'meaning' ? '义近' : '同根'}）— {sw.description}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 16,
  },
  modeSelector: {
    marginBottom: 16,
  },
  progressCard: {
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  exitBtn: {
    marginLeft: 4,
  },
  progressText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  accuracyText: {
    fontSize: 14,
    color: '#666',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  content: {
    flex: 1,
  },
  modeContainer: {
    flex: 1,
  },
  wordCard: {
    marginBottom: 16,
    elevation: 4,
  },
  cardContent: {
    padding: 24,
    minHeight: 200,
  },
  cardFront: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBack: {
    flex: 1,
  },
  cardBackWordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardBackWord: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  cardBackPronunciation: {
    fontSize: 13,
    color: '#888',
    marginBottom: 12,
  },
  etymologyBox: {
    padding: 10,
    marginBottom: 12,
    borderRadius: 8,
    elevation: 1,
    backgroundColor: '#F5F0FF',
  },
  etymologyTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7C4DFF',
    marginBottom: 4,
  },
  etymologyText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
  wordText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#1976D2',
    textAlign: 'center',
    marginBottom: 8,
  },
  pronunciation: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  soundButton: {
    marginBottom: 16,
  },
  flipHint: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  flipButton: {
    marginBottom: 16,
  },
  resultButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  resultButton: {
    flex: 1,
  },
  definitionItem: {
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
    elevation: 1,
    backgroundColor: '#F0FFF0',
  },
  definitionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  partOfSpeech: {
    fontSize: 12,
    color: '#666',
    marginRight: 8,
  },
  coreTag: {
    backgroundColor: '#1976D2',
  },
  rareTag: {
    backgroundColor: '#FF9800',
  },
  meaning: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 4,
  },
  example: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  enhanceBtn: {
    marginTop: 8,
    borderRadius: 8,
  },
  listeningContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  listeningTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#1976D2',
  },
  soundIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    marginBottom: 16,
  },
  soundEmoji: {
    fontSize: 32,
  },
  listeningHint: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  playButton: {
    paddingHorizontal: 24,
  },
  answerSection: {
    marginTop: 24,
    width: '100%',
  },
  answerTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 12,
    textAlign: 'center',
  },
  listenInput: {
    marginBottom: 16,
  },
  answerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  answerBtn: {
    flex: 1,
  },
  quizTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
    color: '#1976D2',
  },
  quizWord: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  optionsContainer: {
    gap: 12,
  },
  optionItem: {
    borderRadius: 8,
    elevation: 1,
    backgroundColor: '#F8F8F8',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  selectedOption: {
    backgroundColor: '#E3F2FD',
    borderColor: '#1976D2',
    borderWidth: 2,
  },
  correctOption: {
    backgroundColor: '#E8F5E8',
    borderColor: '#4CAF50',
    borderWidth: 2,
  },
  incorrectOption: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
    borderWidth: 2,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
  },
  optionText: {
    fontSize: 14,
    textAlign: 'left',
  },
  articleTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 8,
  },
  articleSubtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  articleWordWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  articleWordChip: {
    backgroundColor: '#E3F2FD',
  },
  articleLimitChip: {
    backgroundColor: '#FFF3E0',
  },
  articleSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  articleAutoLengthText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 12,
  },
  articleError: {
    color: '#F44336',
    fontSize: 14,
    marginBottom: 12,
  },
  articleInfo: {
    color: '#2E7D32',
    fontSize: 14,
    marginBottom: 12,
  },
  articleGenerateButton: {
    marginTop: 4,
    borderRadius: 10,
  },
  articleLoadingBox: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  articleLoadingText: {
    color: '#666',
  },
  articlePreviewCard: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
  },
  articlePreviewTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
    marginBottom: 14,
  },
  articleContentText: {
    fontSize: 16,
    lineHeight: 28,
    color: '#333',
  },
  articleHighlight: {
    color: '#1565C0',
    fontWeight: '800',
    textDecorationLine: 'underline',
    textDecorationColor: '#1565C0',
    textDecorationStyle: 'solid',
  },
  articleTapHint: {
    fontSize: 12,
    color: '#BBB',
    textAlign: 'center',
    marginTop: 12,
  },
  articleTapHintHighlight: {
    color: '#1976D2',
    fontWeight: '600',
  },
  articleTranslationButton: {
    marginTop: 16,
    borderColor: '#1976D2',
  },
  articleTranslationBox: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 16,
    marginTop: 16,
    backgroundColor: 'transparent',
    elevation: 0,
  },
  articleTranslationText: {
    fontSize: 15,
    lineHeight: 26,
    color: '#555',
  },
  articleWordModal: {
    backgroundColor: 'white',
    padding: 20,
    margin: 24,
    borderRadius: 16,
    maxHeight: '70%',
  },
  articleWordModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  articleWordModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1976D2',
  },
  articleWordPronunciation: {
    fontSize: 13,
    color: '#999',
    marginBottom: 16,
  },
  articleWordDefinitions: {
    marginBottom: 12,
  },
  articleWordDefItem: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  articleWordDefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  articleWordPosChip: {
    backgroundColor: '#F5F5F5',
    height: 22,
  },
  articleWordPosChipText: {
    fontSize: 10,
    color: '#666',
  },
  articleWordDefMeaning: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  articleWordCoreChip: {
    backgroundColor: '#E3F2FD',
    height: 22,
  },
  articleWordCoreChipText: {
    fontSize: 10,
    color: '#1976D2',
  },
  articleWordRareChip: {
    backgroundColor: '#FFF3E0',
    height: 22,
  },
  articleWordRareChipText: {
    fontSize: 10,
    color: '#E65100',
  },
  articleWordDefExample: {
    fontSize: 13,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 2,
    marginLeft: 4,
    lineHeight: 19,
  },
  articleWordEtymologySection: {
    marginBottom: 12,
    paddingTop: 4,
  },
  articleWordSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  articleWordEtymologyText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
  },
  articleWordSimilarSection: {
    marginBottom: 4,
  },
  articleWordSimilarText: {
    fontSize: 13,
    color: '#555',
    lineHeight: 20,
    marginBottom: 2,
  },
  resultIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  emptyCard: {
    marginTop: 50,
  },
  emptyContent: {
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1976D2',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  addWordBtn: {
    paddingHorizontal: 24,
    marginTop: 8,
  },
  completionCard: {
    marginBottom: 16,
    elevation: 4,
    borderRadius: 16,
  },
  completionContent: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  completionIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  completionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 24,
    textAlign: 'center',
  },
  completionStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 12,
  },
  completionStatItem: {
    alignItems: 'center',
  },
  completionStatNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  completionStatLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  completionDetail: {
    fontSize: 14,
    color: '#888',
    marginBottom: 28,
  },
  completionActions: {
    width: '100%',
    gap: 10,
  },
  completionPrimaryBtn: {
    borderRadius: 12,
    paddingVertical: 4,
  },
  completionSecondaryBtn: {
    borderRadius: 12,
    paddingVertical: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: 320,
    padding: 24,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    color: '#333',
  },
  modalText: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    marginBottom: 20,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  resultText: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  resultOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    zIndex: 100,
  },
  resultSurface: {
    padding: 32,
    borderRadius: 16,
    elevation: 8,
    minWidth: 200,
  },
  correctColor: {
    color: '#4CAF50',
  },
  incorrectColor: {
    color: '#F44336',
  },
});