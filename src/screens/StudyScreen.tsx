import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, TextInput, Platform } from 'react-native';
import {
  Card,
  Text,
  Button,
  ProgressBar,
  Surface,
  Chip,
  SegmentedButtons
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import StorageService from '../services/StorageService';
import { Word, StudyRecord, StudyMode } from '../types';
import { REVIEW_INTERVALS } from '../constants';
import { format, addDays } from 'date-fns';

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
  const [currentMode, setCurrentMode] = useState<'flashcard' | 'listening' | 'quiz'>('flashcard');
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
  const [isContinueSession, setIsContinueSession] = useState(false);

  useEffect(() => {
    loadStudyWords();
  }, []);

  useEffect(() => {
    if (currentMode === 'quiz' && words.length > 0) {
      generateQuizOptions();
    }
  }, [currentMode, currentIndex]);

  const loadStudyWords = async (exceedDailyLimit = false) => {
    try {
      const todayPlans = await StorageService.getTodayStudyPlan();
      const allWords = await StorageService.getWords();
      const allRecords = await StorageService.getStudyRecords();
      const today = format(new Date(), 'yyyy-MM-dd');

      const settings = await StorageService.getSettings();
      const dailyLimit = typeof settings.dailyNewWords === 'number'
        ? settings.dailyNewWords
        : 10;

      let studyWords: Word[] = [];
      let newWordList: Word[] = [];
      let reviewWordList: Word[] = [];

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
    } catch (error) {
      console.error('Failed to load study words:', error);
    }
  };

  const getCurrentWord = (): Word | null => {
    if (words.length === 0) return null;
    return words[currentIndex] || null;
  };

  const handleResult = async (isCorrect: boolean) => {
    const currentWord = getCurrentWord();
    if (!currentWord) return;

    try {
      const record: Omit<StudyRecord, 'id'> = {
        word_id: currentWord.id!,
        study_date: format(new Date(), 'yyyy-MM-dd'),
        result: isCorrect ? 1 : 0,
        study_mode: currentMode
      };

      await StorageService.addStudyRecord(record);

      // 将对应学习计划标记为已完成
      const allPlans = await StorageService.getStudyPlans();
      const matchingPlan = allPlans.find(
        p => p.word_id === currentWord.id && !p.completed
      );
      if (matchingPlan?.id) {
        await StorageService.completeStudyPlan(matchingPlan.id);
      }

      // 为当前单词创建未来的艾宾浩斯复习计划
      for (const interval of REVIEW_INTERVALS) {
        const reviewDate = format(addDays(new Date(), interval), 'yyyy-MM-dd');
        const alreadyPlanned = allPlans.some(
          p => p.word_id === currentWord.id && p.plan_date === reviewDate
        );
        if (!alreadyPlanned) {
          await StorageService.addStudyPlan({
            word_id: currentWord.id!,
            plan_date: reviewDate,
            plan_type: 'review',
            completed: false
          });
        }
      }

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

      setCurrentResult(isCorrect ? 'correct' : 'incorrect');
      setShowResult(true);

      setTimeout(() => {
        setShowResult(false);
        nextWord();
      }, 2000);

    } catch (error) {
      console.error('Failed to save study record:', error);
    }
  };

  const nextWord = () => {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
      setSelectedAnswer('');
      setShowQuizResult(false);
      setListenAnswer('');
    } else {
      const newCompleted = Math.min(wordTypeCounts.newCount, studyStats.completed);
      const reviewCompleted = Math.max(0, studyStats.completed - newCompleted);
      const accuracyStr = studyStats.accuracy.toFixed(1);

      const title = isContinueSession
        ? 'Round Complete!'
        : 'Daily Goal Reached!';

      const statsMsg = [
        `New: ${newCompleted}/${wordTypeCounts.newCount}`,
        `Review: ${reviewCompleted}/${wordTypeCounts.reviewCount}`,
        `Accuracy: ${accuracyStr}% (${studyStats.correct}/${studyStats.completed})`,
      ].join('\n');

      Alert.alert(title, statsMsg, [
        {
          text: 'Continue',
          onPress: () => loadStudyWords(true),
        },
        {
          text: 'Back',
          onPress: () => navigation.goBack(),
        },
      ]);
    }
  };

  const speakWord = (word: string) => {
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
    if (!currentWord) return;

    setIsListening(true);
    speakWord(currentWord.word);

    setTimeout(() => {
      setIsListening(false);
    }, 10000);
  };

  const handleListenSubmit = () => {
    const currentWord = getCurrentWord();
    if (!currentWord) return;

    const isCorrect = listenAnswer.trim().toLowerCase() === currentWord.word.toLowerCase();
    handleResult(isCorrect);
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
                  icon="volume-high"
                >
                  Speak
                </Button>
                <Text style={styles.flipHint}>Tap to flip</Text>
              </View>
            ) : (
              <View style={styles.cardBack}>
                {currentWord.definitions.map((def, index) => (
                  <Surface key={index} style={styles.definitionItem}>
                    <View style={styles.definitionHeader}>
                      <Text style={styles.partOfSpeech}>{def.part_of_speech}</Text>
                      {def.is_core && <Chip mode="flat" compact style={styles.coreTag}>Core</Chip>}
                      {def.is_rare_sense && <Chip mode="flat" compact style={styles.rareTag}>Rare Sense</Chip>}
                    </View>
                    <Text style={styles.meaning}>{def.meaning}</Text>
                    {def.example && (
                      <Text style={styles.example}>Ex: {def.example}</Text>
                    )}
                  </Surface>
                ))}
              </View>
            )}
          </Card.Content>
        </Card>

        <Button
          mode="outlined"
          onPress={() => setIsFlipped(!isFlipped)}
          style={styles.flipButton}
        >
          {isFlipped ? 'Show Word' : 'Show Meaning'}
        </Button>

        {isFlipped && (
          <View style={styles.resultButtons}>
            <Button
              mode="contained"
              onPress={() => handleResult(false)}
              style={[styles.resultButton, { backgroundColor: '#F44336' }]}
            >
              Unknown
            </Button>
            <Button
              mode="contained"
              onPress={() => handleResult(true)}
              style={[styles.resultButton, { backgroundColor: '#4CAF50' }]}
            >
              Known
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
              <Text style={styles.listeningTitle}>Listening Practice</Text>
              <Surface style={styles.soundIcon}>
                <Text style={styles.soundEmoji}>{isListening ? '🔊' : '🎧'}</Text>
              </Surface>
              <Text style={styles.listeningHint}>
                {isListening ? 'Playing...' : 'Tap to listen to the word pronunciation'}
              </Text>
              <Button
                mode="contained"
                onPress={startListeningMode}
                loading={isListening}
                disabled={isListening}
                style={styles.playButton}
                icon="play"
              >
                Listen
              </Button>

              {isListening && (
                <View style={styles.answerSection}>
                  <Text style={styles.answerTitle}>What word did you hear?</Text>
                  <TextInput
                    mode="outlined"
                    placeholder="Enter the word you heard"
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
                      Skip
                    </Button>
                    <Button
                      mode="contained"
                      onPress={handleListenSubmit}
                      style={styles.answerBtn}
                    >
                      Submit
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
            <Text style={styles.quizTitle}>Choose the correct meaning</Text>
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

  if (words.length === 0) {
    return (
      <View style={styles.container}>
        <Card style={styles.emptyCard}>
          <Card.Content style={styles.emptyContent}>
            {allStudiedToday ? (
              <>
                <Text style={styles.emptyTitle}>All Caught Up!</Text>
                <Text style={styles.emptyText}>
                  You have studied all available words today. Come back tomorrow for reviews, or add more words to your vocabulary.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>No Words Yet</Text>
                <Text style={styles.emptyText}>
                  Please add some words to your vocabulary list first
                </Text>
              </>
            )}
            <Button
              mode="contained"
              onPress={() => navigation.navigate('AddWord' as never)}
              style={styles.addWordBtn}
            >
              Add Words
            </Button>
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
              setCurrentMode(value as StudyMode);
              setCurrentIndex(0);
              setIsFlipped(false);
              setSelectedAnswer('');
              setShowQuizResult(false);
              setShowResult(false);
              setListenAnswer('');
              setIsListening(false);
            }}
            buttons={[
              { value: 'flashcard', label: '📖 Card' },
              { value: 'listening', label: '🔊 Listen' },
              { value: 'quiz', label: '✏️ Quiz' }
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
            <Text style={styles.accuracyText}>
              Accuracy: {studyStats.accuracy.toFixed(1)}%
            </Text>
          </View>
          <ProgressBar
            progress={(currentIndex + 1) / Math.max(words.length, 1)}
            color="#1976D2"
            style={styles.progressBar}
          />
        </Card.Content>
      </Card>

      <ScrollView style={styles.content}>
        {currentMode === 'flashcard' && renderFlashcardMode()}
        {currentMode === 'listening' && renderListeningMode()}
        {currentMode === 'quiz' && renderQuizMode()}
        {showResult && (
          <View style={styles.resultOverlay}>
            <Surface style={styles.resultSurface}>
              <Text style={[
                styles.resultText,
                currentResult === 'correct' ? styles.correctColor : styles.incorrectColor
              ]}>
                {currentResult === 'correct' ? '✅ Correct!' : '❌ Review this word'}
              </Text>
            </Surface>
          </View>
        )}
      </ScrollView>
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