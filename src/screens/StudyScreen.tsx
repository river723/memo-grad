import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Platform, Alert } from 'react-native';
import {
  Card,
  Text,
  Button,
  ProgressBar,
  Surface,
  Chip,
  SegmentedButtons,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native-paper';
import { useAppNavigation, useAppRoute } from '../navigation/types';
import StorageService from '../services/StorageService';
import AutoWordService from '../services/AutoWordService';
import { Word, StudyRecord, AppSettings, Article } from '../types';
import { REVIEW_INTERVALS } from '../constants';
import { format, addDays } from 'date-fns';
import AIService, { SubscriptionRequiredError } from '../services/AIService';
import { subscriptionPrompt } from '../utils/subscriptionPrompt';
import { canWordBeEnhanced, mergeAIResultIntoWord } from '../utils/wordUtils';
import { makeStyles } from '../utils/useStyles';
import { useAppTheme } from '../theme/theme';
import { palette, radius, spacing } from '../theme/tokens';
import FlashcardStudy from '../components/FlashcardStudy';
import WordDictModal from '../components/WordDictModal';
import { useToast } from '../components/ds/Toast';

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
  const navigation = useAppNavigation();
  const route = useAppRoute<'Study'>();
  const { colors } = useAppTheme();
  const styles = useStyles();
  const toast = useToast();
  const customWordIds = Array.isArray(route.params?.wordIds)
    ? route.params.wordIds.filter((id: unknown): id is string => typeof id === 'string' && id !== '')
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
  const [enhancingWordId, setEnhancingWordId] = useState<string | null>(null);
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
  const [loadedArticleId, setLoadedArticleId] = useState<string | null>(null);
  // 用 useRef 追踪重试中单词的连续正确次数，不在 Map 中的单词 = 还没答错过（首次答对即过关）
  const retryMapRef = useRef<Map<string, number>>(new Map());
  const pendingIndexRef = useRef<number>(0);
  // 本轮新词 id 集合，用于在 finishWord 时按新词/复习词分别累计真实完成数
  const newWordIdSetRef = useRef<Set<string>>(new Set());
  // 「太简单」移出生词本的词数：全靠它清空队列且未学一词时也能触发完成卡
  const removedCountRef = useRef(0);
  // 选择题选项生成的序号：异步拉全词库作干扰项时，丢弃过期请求防止写回上一个词的选项
  const quizSeqRef = useRef(0);
  const [completedByType, setCompletedByType] = useState({ newDone: 0, reviewDone: 0 });

  useEffect(() => {
    loadStudyWords();
  }, [customWordIdKey]);

  // 监听浮层关闭 + 队列为空 → 触发完成卡片
  useEffect(() => {
    if (!showResult && words.length === 0 && (studyStats.completed > 0 || removedCountRef.current > 0)) {
      setShowCompletion(true);
    }
  }, [showResult, words.length]);

  // 当前词 id：答对出队/答错回队尾后 currentIndex 常保持不变，仅靠索引无法察觉「换词」，
  // 必须以词 id 作为依赖，否则选择题选项会停留在上一个词（四个选项里没有当前词的正确释义）。
  const currentWordId = words[currentIndex]?.id;

  useEffect(() => {
    if (currentMode === 'quiz' && words.length > 0) {
      generateQuizOptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, currentWordId]);

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

      // 学习页首载也做一次被动补充（日期守卫保证每天只跑一次）；
      // 「再来一组」入口则强制补充，跳过守卫。自定义复习会话不动生词本。
      if (customWordIds.length === 0) {
        const autoAdded = await AutoWordService.fillTodayIfNeeded(
          exceedDailyLimit ? { force: true } : undefined
        );
        if (autoAdded > 0) {
          toast.info(`已自动补充 ${autoAdded} 个新词`);
        }
      }

      const allWords = await StorageService.getWords();
      const todayPlansRaw = await StorageService.getTodayStudyPlan();
      // 自愈：清理指向已删除词的未完成计划（旧版「太简单」遗留的幽灵待学——
      // 首页显示有待学、学习页却捞不到词）。收尾后首页计数即恢复。
      const validWordIds = new Set(allWords.map(w => w.id));
      for (const plan of todayPlansRaw) {
        if (!validWordIds.has(plan.word_id)) {
          await StorageService.completeStudyPlan(plan.id);
        }
      }
      const todayPlans = todayPlansRaw.filter(p => validWordIds.has(p.word_id));
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
        // Word.id 在网络版已从自增数字迁移为客户端生成的 UUID（string），
        // 这里必须按 string 匹配，否则 customIdSet 永远命中不了 → 误报"暂无可复习单词"。
        studyWords = allWords.filter(w => typeof w.id === 'string' && customIdSet.has(w.id));

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
        newWordIdSetRef.current = new Set();
        removedCountRef.current = 0;
        setCompletedByType({ newDone: 0, reviewDone: 0 });
        setTrulyCompleted(0);
        return;
      }

      setIsCustomReview(false);

      if (todayPlans.length > 0) {
        // 空 word_id 是"新词占位"计划，不对应具体单词，需排除
        const wordIds = todayPlans.map(p => p.word_id).filter(id => id !== '');
        const plannedIdSet = new Set(wordIds);
        studyWords = allWords.filter(w => wordIds.includes(w.id));
        newWordList = studyWords.filter(w =>
          todayPlans.some(p => p.word_id === w.id && p.plan_type === 'new')
        );
        reviewWordList = studyWords.filter(w =>
          todayPlans.some(p => p.word_id === w.id && p.plan_type === 'review')
        );

        // 合并计划外的生词本未学新词（手工添加 / 自动配词补充的词），
        // 否则只要存在未完成计划，当日新加的词就永远进不了学习队列。
        // 新词总量仍以「每日新词数」封顶。
        const studiedIdSet = new Set(allRecords.map(r => r.word_id));
        const extraNew = allWords.filter(w =>
          !plannedIdSet.has(w.id) && !studiedIdSet.has(w.id)
        );
        newWordList = [...newWordList, ...extraNew].slice(0, dailyLimit);
        const mergedNewIds = new Set(newWordList.map(w => w.id));
        studyWords = [...newWordList, ...reviewWordList];

        // 计划里的词可能已全部被移除（如「太简单」）——队列空时按"今日已完成"处理，
        // 给出「再来一组」出口；否则会落到没有按钮的「暂无单词」死胡同。
        if (studyWords.length === 0) {
          setAllStudiedToday(true);
          setWords([]);
          return;
        }

        // 为计划外新词补建当日计划，保持仪表盘"今日计划"计数一致
        for (const word of studyWords) {
          if (mergedNewIds.has(word.id) && !plannedIdSet.has(word.id)) {
            await StorageService.addStudyPlan({
              word_id: word.id,
              plan_date: today,
              plan_type: 'new',
              completed: false
            });
          }
        }
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
            word_id: word.id,
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
      newWordIdSetRef.current = new Set(newWordList.map(w => w.id).filter(Boolean));
      setCompletedByType({ newDone: 0, reviewDone: 0 });
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
      removedCountRef.current = 0;
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
    if (!w || !w.id) return;
    setEnhancingWordId(w.id);
    try {
      const result = await AIService.analyzeWord(w.word);
      const merged = mergeAIResultIntoWord(w, result);

      await StorageService.updateWord(w.id, merged);
      setWords(prev =>
        prev.map(x => (x.id === w.id ? { ...x, ...merged } : x))
      );
    } catch (err: any) {
      if (err instanceof SubscriptionRequiredError) {
        subscriptionPrompt(navigation, 'AI 单词增强需要会员订阅，是否前往订阅页？');
        return;
      }
      console.warn('AI 增强失败:', err);
    } finally {
      setEnhancingWordId(null);
    }
  };

  // 处理单词正式完成后的收尾工作（创建复习计划、标记计划完成）
  const finishWord = async (word: Word) => {
    try {
      // 按新词/复习词累计真实完成数（每个词过关时只调用一次）
      const isNewWord = Boolean(word.id) && newWordIdSetRef.current.has(word.id);
      setCompletedByType(prev => ({
        newDone: prev.newDone + (isNewWord ? 1 : 0),
        reviewDone: prev.reviewDone + (isNewWord ? 0 : 1),
      }));

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
            word_id: word.id,
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
        word_id: currentWord.id,
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
      const inRetry = retryMap.has(currentWord.id);
      let wordFinished = false;

      if (isCorrect && !inRetry) {
        // ★ 首次就答对 → 直接完成
        await finishWord(currentWord);
        wordFinished = true;
      } else if (isCorrect && inRetry) {
        // ★ 重试中答对 → 计数器 +1
        const count = retryMap.get(currentWord.id)! + 1;
        if (count >= 2) {
          await finishWord(currentWord);
          retryMap.delete(currentWord.id);
          wordFinished = true;
        } else {
          retryMap.set(currentWord.id, count);
        }
      } else {
        // ★ 答错 → 进入重试模式（或计数器归零）
        retryMap.set(currentWord.id, 0);
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

      // 4. 反馈 + 推进
      if (currentMode === 'flashcard') {
        // 单词卡是自评：翻面后已看到释义，卡片自身也有飘字/抖动反馈（FlashcardStudy 内 320ms），
        // 无需再弹全屏对错浮层、不停留，直接切下一张。
        setCurrentIndex(nextIndex);
        setIsFlipped(false);
      } else {
        // 选择/听写：需要停留看清正确答案，保留全屏对错浮层 1.2~1.5s 再推进
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
      }

    } catch (error) {
      console.error('Failed to save study record:', error);
    }
  };

  /**
   * 「太简单」：当前词已认识，移出生词本并跳下一词。
   * 与 handleResult 的差异：不写 StudyRecord、不进错题重试、不排复习计划，
   * 只软删除（dirty 标记随同步走）+ 收尾当日未完成计划 + 队列出队 + 进度分母减一。
   */
  const handleTooEasy = async () => {
    const currentWord = getCurrentWord();
    if (!currentWord || currentMode === 'article') return;

    try {
      await StorageService.deleteWord(currentWord.id);
      // 计划在载入时就已创建；词被移除后必须同步标记完成，
      // 否则首页一直显示"今日还有 N 个生词"、点进去却找不到词（幽灵待学）。
      await StorageService.completeTodayPlansForWord(currentWord.id);
      removedCountRef.current += 1;

      // 新词/复习词各自计数减一，保持头部统计一致
      const isNewWord = newWordIdSetRef.current.has(currentWord.id);
      setWordTypeCounts(prev => ({
        newCount: Math.max(0, prev.newCount - (isNewWord ? 1 : 0)),
        reviewCount: Math.max(0, prev.reviewCount - (isNewWord ? 0 : 1)),
      }));

      setIsFlipped(false);
      const wasLast = currentIndex >= words.length - 1;
      pendingIndexRef.current = wasLast ? 0 : currentIndex;

      setWords(prev => prev.filter((_, i) => i !== currentIndex));
      setStudyStats(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      setCurrentIndex(pendingIndexRef.current);

      toast.info(`已将 "${currentWord.word}" 移出生词本`);
    } catch (error) {
      console.error('Failed to remove word:', error);
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

  const generateQuizOptions = async () => {
    const currentWord = getCurrentWord();
    if (!currentWord) return;

    const correctMeaning = currentWord.definitions[0]?.meaning?.trim();
    if (!correctMeaning) return;

    // 干扰项必须取自整本生词本而非当前队列：队列答到末尾会出队、所剩无几，凑不满 3 个干扰项。
    const seq = ++quizSeqRef.current;
    let poolWords: Word[] = words;
    try {
      const all = await StorageService.getWords();
      if (Array.isArray(all) && all.length > 0) poolWords = all;
    } catch {
      // 读词库失败则退回用当前队列
    }
    // await 期间若已切到下一个词，丢弃本次结果，避免写回上一个词的选项
    if (quizSeqRef.current !== seq) return;

    // 去重 + 排除当前词、空释义、与正确释义相同的项
    const pool = Array.from(
      new Set(
        poolWords
          .filter(w => w.id !== currentWord.id)
          .map(w => w.definitions[0]?.meaning?.trim())
          .filter((m): m is string => !!m && m !== correctMeaning)
      )
    );
    // Fisher–Yates 洗牌后取前 3 个
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const wrongOptions = pool.slice(0, 3);

    const allOptions = [correctMeaning, ...wrongOptions].sort(() => Math.random() - 0.5);
    setQuizOptions(allOptions);
    setSelectedAnswer('');
    setShowQuizResult(false);
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
    .filter((id): id is string => typeof id === 'string' && id !== '');

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
          const articleIdSet = new Set(article.word_ids.filter(id => typeof id === 'string' && id !== ''));
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

    setIsGeneratingArticle(true);
    setShowArticleTranslation(false);
    setGeneratedArticleWords([]);
    setLoadedArticleId(null);
    try {
      const result = await AIService.generateFunArticle(
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
          word_ids: articleWords.map(w => w.id).filter((id): id is string => typeof id === 'string' && id !== ''),
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
      if (error instanceof SubscriptionRequiredError) {
        subscriptionPrompt(navigation, 'AI 文章生成需要会员订阅，是否前往订阅页？');
        return;
      }
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
    const hasArticle = !!generatedArticle;

    return (
      <View style={styles.modeContainer}>
        {!hasArticle && (
        <View style={styles.wordCard}>
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
              <ActivityIndicator animating color={colors.primary} />
              <Text style={styles.articleLoadingText}>AI 正在为你创作短文...</Text>
            </View>
          )}
        </View>
        )}

        {hasArticle && (
          <View style={styles.articlePreviewCard}>
            {/* 重新生成短文入口（次要） */}
            <Button
              mode="outlined"
              compact
              icon="refresh"
              onPress={handleGenerateArticle}
              loading={isGeneratingArticle}
              disabled={isGeneratingArticle || articleWords.length === 0}
              style={{ alignSelf: 'flex-start', marginBottom: spacing.sm }}
            >
              重新生成短文
            </Button>
            {articleError && (
              <Text style={loadedArticleId ? styles.articleInfo : styles.articleError}>
                {articleError}
              </Text>
            )}
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

            {isGeneratingArticle && (
              <View style={styles.articleLoadingBox}>
                <ActivityIndicator animating color={colors.primary} />
                <Text style={styles.articleLoadingText}>AI 正在为你创作短文...</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderFlashcardMode = () => {
    const currentWord = getCurrentWord();
    if (!currentWord) return null;

    return (
      <FlashcardStudy
        currentWord={currentWord}
        onResult={handleResult}
        onRemove={handleTooEasy}
        speakWord={speakWord}
        speechEnabled={speechSettings.soundEnabled}
        onEnhance={enhanceCurrentWord}
        enhancing={enhancingWordId === currentWord.id}
        appSettings={appSettings}
      />
    );
  };

  const renderListeningMode = () => {
    const currentWord = getCurrentWord();
    if (!currentWord) return null;

    return (
      <View style={styles.modeContainer}>
        <View style={styles.wordCard}>
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
        </View>
      </View>
    );
  };

  const renderQuizMode = () => {
    const currentWord = getCurrentWord();
    if (!currentWord) return null;

    return (
      <View style={styles.modeContainer}>
        <View style={styles.wordCard}>
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
        </View>
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
                  你今天已经学完了所有可用单词。想继续可以再来一组，也可以添加更多单词到生词本。
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
            {!isCustomReview && allStudiedToday && (
              <Button
                mode="contained"
                icon="refresh"
                onPress={() => loadStudyWords(true)}
                style={styles.addWordBtn}
              >
                再来一组
              </Button>
            )}
            {!isCustomReview && (
              <Button
                mode="contained"
                onPress={() => navigation.navigate('AddWord')}
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
      <View style={styles.modeSelector}>
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
      </View>

      <View style={styles.progressCard}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressText}>
            {trulyCompleted} / {studyStats.total}
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
          progress={trulyCompleted / Math.max(studyStats.total, 1)}
          color={colors.primary}
          style={styles.progressBar}
        />
      </View>

      {/* 单词卡模式不套外层 ScrollView：小屏手机上底部三按钮会被挤出首屏（要上划才可见）。
          FlashcardStudy 自身是「卡片 flex 撑满 + 底部按钮固定」的弹性布局，给它有界高度即可，
          释义面过长由其内部 ScrollView 兜底；完成卡/听写/释义/短文内容高度不定，保留滚动。 */}
      {!(currentMode === 'flashcard' && !showCompletion) && (
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
                    {completedByType.newDone}
                  </Text>
                  <Text style={styles.completionStatLabel}>新词</Text>
                </View>
                <View style={styles.completionStatItem}>
                  <Text style={styles.completionStatNumber}>
                    {completedByType.reviewDone}
                  </Text>
                  <Text style={styles.completionStatLabel}>复习</Text>
                </View>
                <View style={styles.completionStatItem}>
                  <Text style={[styles.completionStatNumber, {
                    color: studyStats.accuracy >= 80 ? colors.success :
                           studyStats.accuracy >= 60 ? colors.warning : colors.danger
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
        ) : null}
        {!showCompletion && (
          <>
            {currentMode === 'listening' && renderListeningMode()}
            {currentMode === 'quiz' && renderQuizMode()}
            {currentMode === 'article' && renderArticleMode()}
          </>
        )}
      </ScrollView>
      )}

      {/* 无外层滚动的单词卡模式：卡片弹性占满剩余空间，底部三按钮固定可见 */}
      {currentMode === 'flashcard' && !showCompletion && renderFlashcardMode()}

      {/* 答题结果浮层提到根容器：绝对定位覆盖全屏，两种渲染分支下行为一致 */}
      {showResult && (
        <View style={styles.resultOverlay}>
          <View
            style={[
              styles.resultSurface,
              currentResult === 'correct'
                ? styles.resultSurfaceCorrect
                : styles.resultSurfaceIncorrect,
            ]}
          >
            <View
              style={[
                styles.resultIconBubble,
                currentResult === 'correct'
                  ? styles.resultIconBubbleCorrect
                  : styles.resultIconBubbleIncorrect,
              ]}
            >
              <Text
                style={[
                  styles.resultIconGlyph,
                  currentResult === 'correct'
                    ? styles.resultIconGlyphCorrect
                    : styles.resultIconGlyphIncorrect,
                ]}
              >
                {currentResult === 'correct' ? '✓' : '✕'}
              </Text>
            </View>
            <Text
              style={[
                styles.resultText,
                currentResult === 'correct'
                  ? styles.resultTextCorrect
                  : styles.resultTextIncorrect,
              ]}
            >
              {currentResult === 'correct' ? '认识' : '不认识'}
            </Text>
          </View>
        </View>
      )}

      {/* Exit confirmation Modal */}
      <Modal
        visible={showExitConfirm}
        onDismiss={() => setShowExitConfirm(false)}
        contentContainerStyle={styles.exitModalContent}
      >
        <View style={styles.exitModalIconWrap}>
          <View style={styles.exitModalIconBubble}>
            <Text style={styles.exitModalIconGlyph}>↩</Text>
          </View>
        </View>

        <Text style={styles.exitModalTitle}>退出学习？</Text>

        <View style={styles.exitModalStatsCard}>
          <View style={styles.exitModalStatRow}>
            <Text style={styles.exitModalStatLabel}>已学单词</Text>
            <Text style={styles.exitModalStatValue}>
              <Text style={styles.exitModalStatValueNum}>
                {studyStats.completed}
              </Text>
              <Text style={styles.exitModalStatValueSep}> / </Text>
              <Text style={styles.exitModalStatValueTotal}>
                {studyStats.total}
              </Text>
            </Text>
          </View>
          <View style={styles.exitModalStatDivider} />
          <View style={styles.exitModalStatRow}>
            <Text style={styles.exitModalStatLabel}>准确率</Text>
            <Text style={styles.exitModalStatValue}>
              <Text style={styles.exitModalStatValueNum}>
                {studyStats.accuracy.toFixed(1)}
              </Text>
              <Text style={styles.exitModalStatValuePct}> %</Text>
            </Text>
          </View>
        </View>

        <Text style={styles.exitModalHint}>
          剩余单词将保留在学习计划中{'\n'}下次可继续学习
        </Text>

        <View style={styles.exitModalActions}>
          <Button
            mode="text"
            onPress={() => setShowExitConfirm(false)}
            style={styles.exitModalCancelBtn}
            labelStyle={styles.exitModalCancelLabel}
          >
            继续学习
          </Button>
          <Button
            mode="contained"
            onPress={() => {
              setShowExitConfirm(false);
              navigation.goBack();
            }}
            style={styles.exitModalConfirmBtn}
            contentStyle={styles.exitModalConfirmContent}
            labelStyle={styles.exitModalConfirmLabel}
            buttonColor={palette.danger}
            textColor={palette.onPrimary}
            icon="exit-to-app"
          >
            确认退出
          </Button>
        </View>
      </Modal>

      {/* 单词释义弹窗 */}
      <WordDictModal
        visible={showArticleWordModal}
        onClose={() => setShowArticleWordModal(false)}
        word={selectedArticleWord}
      />
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  modeSelector: {
    marginBottom: 16,
  },
  progressCard: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
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
    color: colors.primary,
  },
  accuracyText: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
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
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
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
    color: colors.primary,
  },
  cardBackPronunciation: {
    fontSize: 13,
    color: colors.tertiary,
    marginBottom: 12,
  },
  etymologyBox: {
    padding: 10,
    marginBottom: 12,
    borderRadius: 8,
    elevation: 1,
    backgroundColor: colors.surfaceVariant,
  },
  etymologyTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
    marginBottom: 4,
  },
  etymologyText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    lineHeight: 18,
  },
  wordText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  pronunciation: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 16,
  },
  soundButton: {
    marginBottom: 16,
  },
  flipHint: {
    fontSize: 14,
    color: colors.tertiary,
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
    backgroundColor: colors.surfaceVariant,
  },
  definitionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  partOfSpeech: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginRight: 8,
  },
  coreTag: {
    backgroundColor: colors.primary,
  },
  rareTag: {
    backgroundColor: palette.accent,
  },
  meaning: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 4,
  },
  example: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
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
    color: colors.primary,
  },
  soundIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryContainer,
    marginBottom: 16,
  },
  soundEmoji: {
    fontSize: 32,
  },
  listeningHint: {
    fontSize: 16,
    color: colors.onSurfaceVariant,
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
    color: colors.primary,
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
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  selectedOption: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  correctOption: {
    backgroundColor: palette.successLight,
    borderColor: palette.success,
    borderWidth: 2,
  },
  incorrectOption: {
    backgroundColor: palette.dangerLight,
    borderColor: palette.danger,
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
    color: colors.primary,
    marginBottom: 8,
  },
  articleSubtitle: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
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
    backgroundColor: colors.primaryContainer,
  },
  articleLimitChip: {
    backgroundColor: palette.accentLight,
  },
  articleSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.onSurface,
    marginBottom: 10,
  },
  articleAutoLengthText: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    lineHeight: 20,
    marginBottom: 12,
  },
  articleError: {
    color: palette.danger,
    fontSize: 14,
    marginBottom: 12,
  },
  articleInfo: {
    color: palette.successDark,
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
    color: colors.onSurfaceVariant,
  },
  articlePreviewCard: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  articlePreviewTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.onSurface,
    marginBottom: 14,
  },
  articleContentText: {
    fontSize: 16,
    lineHeight: 28,
    color: colors.onSurface,
  },
  articleHighlight: {
    color: colors.primary,
    fontWeight: '800',
    textDecorationLine: 'underline',
    textDecorationColor: colors.primary,
    textDecorationStyle: 'solid',
  },
  articleTapHint: {
    fontSize: 12,
    color: colors.tertiary,
    textAlign: 'center',
    marginTop: 12,
  },
  articleTapHintHighlight: {
    color: colors.primary,
    fontWeight: '600',
  },
  articleTranslationButton: {
    marginTop: 16,
    borderColor: colors.primary,
  },
  articleTranslationBox: {
    borderTopWidth: 1,
    borderTopColor: colors.outline,
    paddingTop: 16,
    marginTop: 16,
    backgroundColor: 'transparent',
    elevation: 0,
  },
  articleTranslationText: {
    fontSize: 15,
    lineHeight: 26,
    color: colors.onSurfaceVariant,
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
    color: colors.primary,
  },
  emptyText: {
    fontSize: 16,
    color: colors.onSurfaceVariant,
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
    color: colors.primary,
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
    color: colors.primary,
  },
  completionStatLabel: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 4,
  },
  completionDetail: {
    fontSize: 14,
    color: colors.tertiary,
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
  // ---- Exit confirm modal (sibling of ArticleListScreen delete modal) ----
  exitModalContent: {
    backgroundColor: colors.surface,
    marginHorizontal: 32,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.outline,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  exitModalIconWrap: {
    marginBottom: 14,
  },
  exitModalIconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.dangerLight,
  },
  exitModalIconGlyph: {
    fontSize: 28,
    fontWeight: '700',
    color: palette.danger,
    lineHeight: 32,
  },
  exitModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    color: colors.onSurface,
    marginBottom: 18,
    letterSpacing: 0.2,
  },
  exitModalStatsCard: {
    width: '100%',
    backgroundColor: colors.surfaceVariant,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  exitModalStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  exitModalStatDivider: {
    height: 1,
    backgroundColor: colors.outline,
    marginVertical: 8,
  },
  exitModalStatLabel: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },
  exitModalStatValue: {
    fontSize: 16,
    color: colors.onSurface,
  },
  exitModalStatValueNum: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.3,
  },
  exitModalStatValueTotal: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.onSurfaceVariant,
  },
  exitModalStatValueSep: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
    marginHorizontal: 2,
  },
  exitModalStatValuePct: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.onSurfaceVariant,
  },
  exitModalHint: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    color: colors.onSurfaceVariant,
    marginBottom: 22,
  },
  exitModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  exitModalCancelBtn: {
    flex: 1,
    borderRadius: 10,
  },
  exitModalCancelLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.onSurface,
    letterSpacing: 0.5,
  },
  exitModalConfirmBtn: {
    flex: 1.2,
    borderRadius: 10,
  },
  exitModalConfirmContent: {
    height: 44,
  },
  exitModalConfirmLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: palette.onPrimary,
  },
  resultText: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1.2,
    color: colors.onSurface,
  },
  resultTextCorrect: {
    color: palette.successDark,
  },
  resultTextIncorrect: {
    color: palette.dangerDark,
  },
  resultOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 17, 16, 0.78)',
    zIndex: 100,
  },
  resultSurface: {
    backgroundColor: colors.surface,
    paddingHorizontal: 36,
    paddingVertical: 28,
    borderRadius: 18,
    minWidth: 220,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.outline,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  resultSurfaceCorrect: {
    borderColor: palette.success,
  },
  resultSurfaceIncorrect: {
    borderColor: palette.danger,
  },
  resultIconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  resultIconBubbleCorrect: {
    backgroundColor: palette.successLight,
  },
  resultIconBubbleIncorrect: {
    backgroundColor: palette.dangerLight,
  },
  resultIconGlyph: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 34,
  },
  resultIconGlyphCorrect: {
    color: palette.success,
  },
  resultIconGlyphIncorrect: {
    color: palette.danger,
  },
}));