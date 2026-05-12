import { format, addDays, subDays } from 'date-fns';
import { StudyPlan, Word, StudyRecord } from '../types';
import { REVIEW_INTERVALS } from '../constants';
import StorageService from './StorageService';

class StudyPlanService {
  private storage: StorageService;

  constructor() {
    this.storage = StorageService;
  }

  async generateStudyPlan(
    totalDays: number,
    dailyNewWords: number,
    existingWords: Word[] = []
  ): Promise<StudyPlan[]> {
    const plans: StudyPlan[] = [];
    const startDate = new Date();

    // 为现有单词生成复习计划
    for (const word of existingWords) {
      const reviewPlans = await this.generateReviewPlans(word.id!);
      plans.push(...reviewPlans);
    }

    // 为新的学习天数生成计划
    for (let day = 0; day < totalDays; day++) {
      const planDate = format(addDays(startDate, day), 'yyyy-MM-dd');

      // 每天的新词学习计划
      for (let i = 0; i < dailyNewWords; i++) {
        plans.push({
          word_id: 0, // 新词，ID待定
          plan_date: planDate,
          plan_type: 'new',
          completed: false
        });
      }

      // 根据艾宾浩斯曲线安排复习
      const reviewPlans = await this.generateDailyReviewPlans(planDate);
      plans.push(...reviewPlans);
    }

    return plans;
  }

  private async generateReviewPlans(wordId: number): Promise<StudyPlan[]> {
    const plans: StudyPlan[] = [];
    const today = new Date();

    // 获取该单词的学习记录，确定下次复习时间
    const records = await this.storage.getStudyRecordsByDate(format(today, 'yyyy-MM-dd'));
    const wordRecords = records.filter(r => r.word_id === wordId);

    let nextReviewInterval = REVIEW_INTERVALS[0]; // 默认1天后复习

    if (wordRecords.length > 0) {
      // 根据正确率调整复习间隔
      const correctRate = wordRecords.filter(r => r.result === 1).length / wordRecords.length;

      if (correctRate >= 0.8) {
        // 正确率高，延长复习间隔
        const currentIndex = REVIEW_INTERVALS.indexOf(nextReviewInterval);
        nextReviewInterval = REVIEW_INTERVALS[Math.min(currentIndex + 1, REVIEW_INTERVALS.length - 1)];
      } else {
        // 正确率低，缩短复习间隔
        nextReviewInterval = REVIEW_INTERVALS[0];
      }
    }

    // 生成复习计划
    for (let i = 0; i < REVIEW_INTERVALS.length; i++) {
      const reviewDate = format(addDays(today, REVIEW_INTERVALS[i]), 'yyyy-MM-dd');

      plans.push({
        word_id: wordId,
        plan_date: reviewDate,
        plan_type: 'review',
        completed: false
      });
    }

    return plans;
  }

  private async generateDailyReviewPlans(planDate: string): Promise<StudyPlan[]> {
    const plans: StudyPlan[] = [];
    const targetDate = new Date(planDate);

    // 为今天需要复习的单词创建计划
    for (const interval of REVIEW_INTERVALS) {
      const studyDate = format(subDays(targetDate, interval), 'yyyy-MM-dd');

      // 这里应该查询在studyDate学习的单词
      // 简化实现，实际应该从数据库查询
      const wordsToReview = await this.getWordsByStudyDate(studyDate);

      for (const word of wordsToReview) {
        plans.push({
          word_id: word.id!,
          plan_date: planDate,
          plan_type: 'review',
          completed: false
        });
      }
    }

    return plans;
  }

  private async getWordsByStudyDate(date: string): Promise<Word[]> {
    // 简化实现，实际应该从数据库查询指定日期学习的单词
    // 这里返回空数组，需要在完整实现中完善
    const words = await this.storage.getWords();
    return words.slice(0, 3); // 临时返回前3个单词作为示例
  }

  async calculateStudyStats(): Promise<{
    totalWords: number;
    masteredWords: number;
    todayProgress: number;
    weeklyProgress: number[];
  }> {
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayPlans = await this.storage.getTodayStudyPlan();
    const todayRecords = await this.storage.getStudyRecordsByDate(today);

    // 计算今日进度
    const todayCompleted = todayPlans.filter(p => p.completed).length;
    const todayTotal = todayPlans.length;
    const todayProgress = todayTotal > 0 ? todayCompleted / todayTotal : 0;

    // 计算一周进度
    const weeklyProgress: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      const records = await this.storage.getStudyRecordsByDate(date);
      const correctCount = records.filter(r => r.result === 1).length;
      const accuracy = records.length > 0 ? correctCount / records.length : 0;
      weeklyProgress.push(accuracy);
    }

    return {
      totalWords: 0, // 需要从数据库获取
      masteredWords: 0, // 需要从数据库计算
      todayProgress,
      weeklyProgress
    };
  }

  async adjustPlanForDifficulty(wordId: number, difficulty: number): Promise<void> {
    // 根据单词难度调整复习频率
    const multiplier = difficulty >= 4 ? 0.5 : difficulty <= 2 ? 2 : 1;

    // 重新计算该单词的复习计划
    const newPlans = await this.generateReviewPlans(wordId);

    // 保存调整后的计划
    for (const plan of newPlans) {
      await this.storage.addStudyPlan(plan);
    }
  }
}

export default StudyPlanService;