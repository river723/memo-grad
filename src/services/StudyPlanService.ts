import { format, subDays } from 'date-fns';
import { WeeklyStudyTrend } from '../types';
import StorageService from './StorageService';

/**
 * 学习统计服务（只读）。
 *
 * 注意：每日"出题/复习调度"不在这里，而由 `services/scheduler.ts` 的阶段化
 * 间隔重复算法 + Word.review_stage/next_due_date 决定，StudyScreen 据此派生当日队列。
 * 本服务仅为首页/统计页提供周趋势等汇总数据。
 */
class StudyPlanService {
  private storage: typeof StorageService;

  constructor() {
    this.storage = StorageService;
  }

  async getWeeklyStudyTrend(): Promise<WeeklyStudyTrend[]> {
    const [allRecords, allPlans] = await Promise.all([
      this.storage.getStudyRecords(),
      this.storage.getStudyPlans(),
    ]);

    const weeklyTrend: WeeklyStudyTrend[] = [];
    for (let i = 6; i >= 0; i--) {
      const targetDate = subDays(new Date(), i);
      const date = format(targetDate, 'yyyy-MM-dd');
      const dayLabel = targetDate.toLocaleDateString('zh-CN', { weekday: 'short' });
      const records = allRecords.filter(record => record.study_date === date);
      const plans = allPlans.filter(plan => plan.plan_date === date);
      const correctCount = records.filter(record => record.result === 1).length;
      const completedCount = plans.filter(plan => plan.completed).length;
      const studiedWordIds = new Set(records.map(record => record.word_id));

      weeklyTrend.push({
        date,
        dayLabel,
        studyCount: records.length,
        studiedWordCount: studiedWordIds.size,
        correctCount,
        accuracy: records.length > 0 ? correctCount / records.length : null,
        plannedCount: plans.length,
        completedCount,
        completionRate: plans.length > 0 ? completedCount / plans.length : null,
      });
    }

    return weeklyTrend;
  }

  async calculateStudyStats(): Promise<{
    totalWords: number;
    masteredWords: number;
    todayProgress: number;
    weeklyProgress: number[];
    weeklyTrend: WeeklyStudyTrend[];
  }> {
    const today = format(new Date(), 'yyyy-MM-dd');
    const [allPlans, weeklyTrend] = await Promise.all([
      this.storage.getStudyPlans(),
      this.getWeeklyStudyTrend(),
    ]);
    const todayPlans = allPlans.filter(plan => plan.plan_date === today);

    // 计算今日进度
    const todayCompleted = todayPlans.filter(p => p.completed).length;
    const todayTotal = todayPlans.length;
    const todayProgress = todayTotal > 0 ? todayCompleted / todayTotal : 0;

    return {
      totalWords: 0, // 需要从数据库获取
      masteredWords: 0, // 需要从数据库计算
      todayProgress,
      weeklyProgress: weeklyTrend.map(day => day.accuracy ?? 0),
      weeklyTrend
    };
  }
}

export default StudyPlanService;
