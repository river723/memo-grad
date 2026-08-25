import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, Alert, Linking, Platform, Pressable } from 'react-native';
import { Text, Switch, SegmentedButtons, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { format } from 'date-fns';
import StorageService from '../services/StorageService';
import FileService from '../services/FileService';
import { UI_CONFIG, AI_PROVIDERS } from '../constants';
import { AppSettings } from '../types';
import { OFFLINE_MODE } from '../config/appMode';
import { LocalAIEngine } from '../services/ai/localAIEngine';
import { useAppTheme } from '../theme/theme';
import { useAppNavigation } from '../navigation/types';
import { useAuth } from '../providers/AuthProvider';
import { useThemeContext } from '../providers/ThemeProvider';
import { makeStyles } from '../utils/useStyles';
import { radius, spacing } from '../theme/tokens';
import { showConfirm } from '../providers/ConfirmDialogProvider';
import SectionHeader from '../components/ds/SectionHeader';
import AppButton from '../components/ds/AppButton';

const BACKUP_FIELDS = [
  'word',
  'studyRecord',
  'studyPlan',
  'article',
  'examSession',
  'wrongQuestion',
  'ignoredWordbankWord',
  'realExamSession',
  'realExamWrongQuestion',
  'realExamDraft',
  'settings',
];

const showMessage = (title: string, message: string) => {
  showConfirm(title, message, { confirmText: '知道了', cancelText: '关闭' }).catch(() => {});
};

const showConfirmDialog = (title: string, message: string): Promise<boolean> => {
  return showConfirm(title, message, { confirmText: '确定', cancelText: '取消' });
};

const getBackupValidationError = (jsonData: string): string | null => {
  let data: unknown;
  try {
    data = JSON.parse(jsonData);
  } catch (error) {
    return '备份内容无法解析，请选择正确的 .bk 备份文件。';
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return '这不是本应用的备份文件。';
  }
  const backup = data as Record<string, unknown>;
  const hasBackupField = BACKUP_FIELDS.some(field =>
    Object.prototype.hasOwnProperty.call(backup, field)
  );
  return hasBackupField ? null : '这不是本应用的备份文件。';
};

const PLAN_LABEL: Record<string, string> = {
  monthly: '月度会员',
  quarterly: '季度会员',
  yearly: '年度会员',
};

export default function SettingsScreen() {
  const { colors } = useAppTheme();
  const typography = colors.typography;
  const styles = useStyles();
  const { setThemeMode } = useThemeContext();
  const { isPro, entitlement, refreshEntitlement } = useAuth();
  const navigation = useAppNavigation();
  const [settings, setSettings] = useState<AppSettings>({
    dailyNewWords: 10,
    reviewInterval: [1, 2, 4, 7, 15],
    soundEnabled: true,
    theme: 'light',
    fontSize: 14,
    autoPlaySound: false,
    showRareSense: true,
    showEtymology: true,
    articleWordCount: 10,
    articleLength: 200,
    examQuestionCount: 10,
    examAutoAdvance: true,
    autoAddNewWords: true,
    aiProvider: 'deepseek',
    aiModel: 'deepseek-v4-flash',
    apiKey: '',
  });
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  // 单机形态（OFFLINE_MODE）专用：本地 AI Key 配置态
  const [apiKey, setApiKey] = useState('');
  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [apiTestMessage, setApiTestMessage] = useState('');
  const [apiTestOk, setApiTestOk] = useState<boolean | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  useFocusEffect(
    useCallback(() => { refreshEntitlement(); }, [refreshEntitlement])
  );

  const loadSettings = async () => {
    try {
      const savedSettings = await StorageService.getSettings();
      setSettings(prev => ({ ...prev, ...savedSettings }));
      // 单机形态：回填本地 AI Key（在线形态该 state 不被渲染，无行为影响）
      setApiKey(savedSettings.apiKey || '');
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = async (newSettings: any) => {
    try {
      const updates = { ...newSettings };
      if (newSettings.soundEnabled === false) {
        updates.autoPlaySound = false;
      }
      await StorageService.saveSettings(updates);
      const latestSettings = await StorageService.getSettings();
      setSettings(latestSettings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  // —— 单机形态（OFFLINE_MODE）专用：本地 AI Key 的保存与连通性测试 ——
  const handleSaveAISettings = async () => {
    if (!apiKey.trim()) {
      showMessage('未填写 API Key', '请先填写 DeepSeek API Key');
      return;
    }
    await saveSettings({
      apiKey: apiKey.trim(),
      aiProvider: 'deepseek',
      aiModel: AI_PROVIDERS.deepseek.defaultModel,
    });
    LocalAIEngine.invalidateConfigCache();
    showMessage('保存成功', 'DeepSeek API 设置已保存');
  };

  const handleTestAISettings = async () => {
    if (!apiKey.trim()) {
      setApiTestOk(false);
      setApiTestMessage('请先填写 DeepSeek API Key');
      showMessage('配置不完整', '请先填写 DeepSeek API Key');
      return;
    }
    setIsTestingApi(true);
    setApiTestOk(null);
    setApiTestMessage('正在测试连接，请稍候...');
    try {
      const engine = new LocalAIEngine({ apiKey: apiKey.trim() });
      const ok = await engine.testApiKey();
      const message = ok
        ? 'DeepSeek API 可用'
        : '连接失败，请检查 API Key、模型 ID 或网络连接';
      setApiTestOk(ok);
      setApiTestMessage(message);
      showMessage(ok ? '连接成功' : '连接失败', message);
    } catch (error: any) {
      const message = error.message || '请检查 API 设置';
      setApiTestOk(false);
      setApiTestMessage(message);
      showMessage('连接失败', message);
    } finally {
      setIsTestingApi(false);
    }
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const exportedData = await StorageService.exportData();
      const fileName = FileService.generateBackupFileName();
      const result = await FileService.exportBackupFile(exportedData, fileName);
      if (result === 'canceled') return;
      showMessage(
        '导出成功',
        result === 'saved'
          ? '备份文件已保存到所选位置，请妥善保存 .bk 文件。'
          : result === 'downloaded'
            ? '备份文件已开始下载，请妥善保存 .bk 文件。'
            : '已打开系统分享面板，请选择保存位置并妥善保存 .bk 文件。'
      );
    } catch (error: any) {
      showMessage('导出失败', error.message || '无法导出备份文件');
    } finally {
      setIsExporting(false);
    }
  };

  const runImport = async () => {
    if (isImporting) return;
    setIsImporting(true);
    try {
      const fileText = await FileService.pickAndReadBackupFile();
      if (!fileText) return;
      const validationError = getBackupValidationError(fileText);
      if (validationError) {
        showMessage('导入失败', validationError);
        return;
      }
      await StorageService.importData(fileText);
      await loadSettings();
      showMessage('导入成功', '备份已成功导入，当前设备的 API Key 已保留。');
    } catch (error: any) {
      showMessage('导入失败', error.message || '无法导入备份文件，请检查文件格式');
    } finally {
      setIsImporting(false);
    }
  };

  const handleImport = async () => {
    if (Platform.OS === 'web') {
      await runImport();
      return;
    }
    Alert.alert(
      '导入备份',
      '请选择本应用导出的 .bk 备份文件。导入会覆盖本机已有学习数据；备份文件不会覆盖当前设备保存的 API Key。确定继续吗？',
      [
        { text: '取消', style: 'cancel' },
        { text: '选择 .bk 文件', onPress: runImport },
      ]
    );
  };

  const handleClearData = () => {
    showConfirmDialog('确认清除', '确定要清除所有数据吗？此操作无法撤销。').then(async confirmed => {
      if (!confirmed) return;
      await StorageService.clearAllData();
      setSettings({
        dailyNewWords: 10, reviewInterval: [1, 2, 4, 7, 15], soundEnabled: true, theme: 'light',
        fontSize: 14, autoPlaySound: false, showRareSense: true, showEtymology: true,
        articleWordCount: 10, articleLength: 200, examQuestionCount: 10, examAutoAdvance: true,
        aiProvider: 'deepseek', aiModel: 'deepseek-v4-flash', apiKey: '', autoAddNewWords: true,
      });
      setThemeMode('light');
      showMessage('已清除', '所有数据已清除');
    });
  };

  const handleResetDefaults = () => {
    showConfirmDialog('恢复默认', '确定要恢复所有设置为默认值吗？').then(async confirmed => {
      if (!confirmed) return;
      await saveSettings({
        dailyNewWords: 10, reviewInterval: [1, 2, 4, 7, 15], soundEnabled: true, theme: 'light',
        fontSize: 14, autoPlaySound: false, showRareSense: true, showEtymology: true,
        articleWordCount: 10, articleLength: 200, examQuestionCount: 10, examAutoAdvance: true,
        aiProvider: 'deepseek', aiModel: 'deepseek-v4-flash', apiKey: '', autoAddNewWords: true,
      });
      setThemeMode('light');
      showMessage('已恢复', '所有设置已恢复为默认值');
    });
  };

  const handleAdjustDailyNewWords = (delta: number) => {
    const newValue = Math.max(1, Math.min(UI_CONFIG.DAILY_NEW_WORDS_LIMIT, settings.dailyNewWords + delta));
    saveSettings({ dailyNewWords: newValue });
  };

  const handleAdjustExamQuestionCount = (delta: number) => {
    const newValue = Math.max(5, Math.min(20, (settings.examQuestionCount || 10) + delta));
    saveSettings({ examQuestionCount: newValue });
  };

  const surface = {
    backgroundColor: colors.surface,
    borderColor: colors.outline,
    borderRadius: radius.lg,
    borderWidth: 1,
  } as const;

  // 步进器：标签 + 值 + 加减 + 进度条
  const renderStepper = (
    label: string,
    value: number,
    min: number,
    max: number,
    fillPct: number,
    minLabel: string,
    maxLabel: string,
    onDec: () => void,
    onInc: () => void
  ) => {
    const decDisabled = value <= min;
    const incDisabled = value >= max;
    const stepBtn = (onPress: () => void, disabled: boolean, glyph: string) => (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.stepperBtn,
          { backgroundColor: colors.primaryContainer, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>{glyph}</Text>
      </Pressable>
    );
    return (
      <View style={styles.settingGroup}>
        <View style={styles.stepperHeader}>
          <Text style={styles.settingLabel}>{label}</Text>
          <View style={styles.stepperRow}>
            {stepBtn(onDec, decDisabled, '−')}
            <View style={styles.numberBadge}>
              <Text style={styles.numberText}>{value}</Text>
            </View>
            {stepBtn(onInc, incDisabled, '+')}
          </View>
        </View>
        <View style={styles.sliderContainer}>
          <View style={[styles.sliderFill, { width: `${Math.min(fillPct, 100)}%`, backgroundColor: colors.primary }]} />
        </View>
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>{minLabel}</Text>
          <Text style={styles.sliderLabel}>{maxLabel}</Text>
        </View>
      </View>
    );
  };

  const toggleRow = (
    icon: string,
    label: string,
    sublabel: string,
    value: boolean,
    onValueChange: (v: boolean) => void,
    disabled = false
  ) => (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.toggleLabel, disabled && { color: colors.tertiary }]}>{label}</Text>
        <Text style={styles.toggleSublabel}>{sublabel}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} color={colors.primary} disabled={disabled} />
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing['3xl'] }}>
      {/* 外观 */}
      <SectionHeader title="外观" icon="palette-outline" />
      <View style={[surface, { padding: spacing.md }, colors.shadow.hairline]}>
        <Text style={styles.settingLabel}>主题</Text>
        <SegmentedButtons
          value={settings.theme}
          onValueChange={(v) => { saveSettings({ theme: v as any }); setThemeMode(v as any); }}
          buttons={[
            { value: 'light', label: '浅色', icon: 'white-balance-sunny' },
            { value: 'dark', label: '深色', icon: 'weather-night' },
            { value: 'system', label: '跟随系统', icon: 'theme-light-dark' },
          ]}
          style={{ marginTop: spacing.sm }}
        />
      </View>

      {/* 学习设置 */}
      <SectionHeader title="学习设置" icon="cog-outline" />
      <View style={[surface, { padding: spacing.md }, colors.shadow.hairline]}>
        {renderStepper(
          '每日新词数量',
          settings.dailyNewWords,
          1,
          UI_CONFIG.DAILY_NEW_WORDS_LIMIT,
          (settings.dailyNewWords / UI_CONFIG.DAILY_NEW_WORDS_LIMIT) * 100,
          '1',
          String(UI_CONFIG.DAILY_NEW_WORDS_LIMIT),
          () => handleAdjustDailyNewWords(-1),
          () => handleAdjustDailyNewWords(1)
        )}
        <View style={styles.divider} />
        {toggleRow('robot-outline', '🤖 自动配词', settings.autoAddNewWords !== false ? `每天按考频自动补足到 ${settings.dailyNewWords} 个新词` : '关闭后仅手动添加生词', settings.autoAddNewWords !== false, v => saveSettings({ autoAddNewWords: v }))}
        <View style={styles.divider} />
        {renderStepper(
          'AI 出题练习题数',
          settings.examQuestionCount || 10,
          5,
          20,
          ((settings.examQuestionCount || 10) / 20) * 100,
          '5',
          '20',
          () => handleAdjustExamQuestionCount(-1),
          () => handleAdjustExamQuestionCount(1)
        )}
        <View style={styles.divider} />
        {toggleRow('lightning-bolt', '⚡ 答题自动跳转', settings.examAutoAdvance ? '答对后 2.5 秒自动下一题' : '手动点击下一题', settings.examAutoAdvance, v => saveSettings({ examAutoAdvance: v }))}
        {toggleRow('volume-high', '🔊 发音功能', '朗读单词发音', settings.soundEnabled, v => saveSettings({ soundEnabled: v }))}
        {toggleRow('book-alert', '🔇 熟词僻义', '显示特殊用法标注', settings.showRareSense, v => saveSettings({ showRareSense: v }))}
        {toggleRow('magnify-scan', '🔍 词根词缀', '显示词源分析', settings.showEtymology, v => saveSettings({ showEtymology: v }))}
        {toggleRow('volume-vibrate', '🔊 自动发音', settings.soundEnabled ? '学新单词时自动朗读' : '需先开启发音功能', settings.soundEnabled && settings.autoPlaySound, v => saveSettings({ autoPlaySound: v }), !settings.soundEnabled)}
      </View>

      {/* 文章生成设置 */}
      <SectionHeader title="文章生成设置" icon="file-document-outline" />
      <View style={[surface, { padding: spacing.md }, colors.shadow.hairline]}>
        {renderStepper(
          '每篇文章生词数',
          settings.articleWordCount || 10,
          5, 20,
          ((settings.articleWordCount || 10) / 20) * 100,
          '5', '20',
          () => saveSettings({ articleWordCount: Math.max(5, (settings.articleWordCount || 10) - 1) }),
          () => saveSettings({ articleWordCount: Math.min(20, (settings.articleWordCount || 10) + 1) })
        )}
        <View style={styles.divider} />
        {renderStepper(
          '文章目标词数',
          settings.articleLength || 200,
          100, 500,
          ((settings.articleLength || 200) / 500) * 100,
          '100', '500',
          () => saveSettings({ articleLength: Math.max(100, (settings.articleLength || 200) - 50) }),
          () => saveSettings({ articleLength: Math.min(500, (settings.articleLength || 200) + 50) })
        )}
      </View>

      {/* AI 功能订阅（在线）/ 本地 AI 设置（单机） */}
      {OFFLINE_MODE ? (
        <>
          <SectionHeader title="AI 设置" icon="key-variant" />
          <View style={[surface, { padding: spacing.md }, colors.shadow.hairline]}>
            <Text style={styles.apiInfo}>
              配置 DeepSeek API Key，用于单词分析、文章生成和 AI 出题。密钥仅保存在本机。
            </Text>
            <TextInput
              mode="outlined"
              label={`${AI_PROVIDERS.deepseek.name} API Key`}
              placeholder={AI_PROVIDERS.deepseek.keyPlaceholder}
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry={!isEditingApiKey}
              style={{ marginTop: spacing.sm }}
              right={
                <TextInput.Icon
                  icon={isEditingApiKey ? 'eye-off' : 'eye'}
                  onPress={() => setIsEditingApiKey(!isEditingApiKey)}
                />
              }
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <View style={{ flex: 1 }}>
                <AppButton
                  title={isTestingApi ? '测试中...' : '测试连接'}
                  onPress={handleTestAISettings}
                  variant="secondary"
                  fullWidth
                  disabled={isTestingApi}
                />
              </View>
              <View style={{ flex: 1 }}>
                <AppButton title="保存 AI 设置" onPress={handleSaveAISettings} variant="primary" fullWidth />
              </View>
            </View>
            {apiTestMessage ? (
              <Text
                style={[
                  styles.apiInfo,
                  { marginTop: spacing.sm, color: apiTestOk === true ? colors.primary : colors.error },
                ]}
              >
                {apiTestMessage}
              </Text>
            ) : null}
            <Text style={[styles.apiInfo, { marginTop: spacing.sm }]}>
              🔗 前往{' '}
              <Text style={{ color: colors.primary }} onPress={() => Linking.openURL(AI_PROVIDERS.deepseek.getKeyUrl)}>
                {AI_PROVIDERS.deepseek.name}
              </Text>{' '}
              获取 API Key
            </Text>
          </View>
        </>
      ) : (
        <>
          <SectionHeader title="AI 功能订阅" icon="crown-outline" />
          <View style={[surface, { padding: spacing.md }, colors.shadow.hairline]}>
            <View style={styles.subRow}>
              <View style={[styles.planBadge, { backgroundColor: isPro ? colors.primaryContainer : colors.surfaceVariant }]}>
                <Text style={[styles.planBadgeText, { color: isPro ? colors.primary : colors.onSurfaceVariant }]}>
                  {isPro ? `Pro · ${PLAN_LABEL[entitlement?.plan ?? ''] ?? '会员'}` : '免费版'}
                </Text>
              </View>
              {isPro && entitlement?.expiresAt && (
                <Text style={styles.expiryText}>到期 {format(new Date(entitlement.expiresAt), 'yyyy-MM-dd')}</Text>
              )}
            </View>
            {isPro && entitlement && (
              <Text style={styles.quotaText}>
                本月已用 {entitlement.quota.used} / {entitlement.quota.monthlyLimit} 次（剩余 {entitlement.quota.remaining}）
              </Text>
            )}
            <Text style={styles.apiInfo}>
              {isPro
                ? '感谢支持！订阅期内可无限制使用 AI 单词分析、文章生成、AI 出题、真题解析。'
                : 'AI 功能（单词分析、文章生成、AI 出题、真题解析）需要订阅解锁，订阅后由云端统一提供 DeepSeek 算力。'}
            </Text>
            <AppButton
              title={isPro ? '管理订阅' : '立即升级到 Pro'}
              onPress={() => navigation.navigate('Subscription')}
              variant={isPro ? 'secondary' : 'primary'}
              size="lg"
              fullWidth
              leftIcon={<MaterialCommunityIcons name={isPro ? 'card-account-details' : 'star'} size={20} color={isPro ? colors.primary : colors.onPrimary} />}
            />
          </View>
        </>
      )}

      {/* 数据管理 */}
      <SectionHeader title="数据管理" icon="database-outline" />
      <View style={[surface, { padding: spacing.md }, colors.shadow.hairline]}>
        <View style={styles.dataActions}>
          <View style={styles.dataActionItem}>
            <AppButton
              title="导出备份"
              onPress={handleExport}
              variant="secondary"
              size="md"
              loading={isExporting}
              disabled={isExporting || isImporting}
              fullWidth
              leftIcon={<MaterialCommunityIcons name="export" size={18} color={colors.primary} />}
            />
            <Text style={styles.dataActionDesc}>导出 .bk 压缩备份</Text>
          </View>
          <View style={styles.dataActionItem}>
            <AppButton
              title="导入备份"
              onPress={handleImport}
              variant="secondary"
              size="md"
              loading={isImporting}
              disabled={isExporting || isImporting}
              fullWidth
              leftIcon={<MaterialCommunityIcons name="import" size={18} color={colors.primary} />}
            />
            <Text style={styles.dataActionDesc}>从 .bk 文件恢复</Text>
          </View>
        </View>
      </View>

      {/* 高级选项 */}
      <SectionHeader title="高级选项" icon="alert-outline" />
      <View style={[surface, { padding: spacing.md }, colors.shadow.hairline]}>
        <View style={{ gap: spacing.sm }}>
          <AppButton
            title="重置所有设置"
            onPress={handleResetDefaults}
            variant="danger"
            size="md"
            fullWidth
            leftIcon={<MaterialCommunityIcons name="restore" size={18} color={colors.onPrimary} />}
          />
          <AppButton
            title="清除所有数据"
            onPress={handleClearData}
            variant="danger"
            size="md"
            fullWidth
            leftIcon={<MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.onPrimary} />}
          />
        </View>
      </View>

      {/* 版本信息 */}
      <View style={styles.footer}>
        <MaterialCommunityIcons name="book-open-variant" size={20} color={colors.tertiary} />
        <Text style={styles.footerText}>版本 1.0.0</Text>
        <Text style={styles.footerSub}>考研英语生词本AI版</Text>
        <Text style={styles.footerSub}>专注考研 · 科学背词</Text>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles(colors => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  settingGroup: {
    marginBottom: 12,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.onSurface,
  },
  stepperHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 12,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBadge: {
    minWidth: 44,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  sliderContainer: {
    height: 6,
    backgroundColor: colors.surfaceVariant,
    borderRadius: 3,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    borderRadius: 3,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sliderLabel: {
    fontSize: 11,
    color: colors.tertiary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.outline,
    marginVertical: 10,
    opacity: 0.5,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.onSurface,
  },
  toggleSublabel: {
    fontSize: 11,
    color: colors.tertiary,
    marginTop: 1,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  planBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  planBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  expiryText: {
    fontSize: 12,
    color: colors.tertiary,
  },
  quotaText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    marginBottom: 12,
  },
  apiInfo: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.onSurfaceVariant,
    marginBottom: 12,
  },
  dataActions: {
    flexDirection: 'row',
    gap: 12,
  },
  dataActionItem: {
    flex: 1,
    alignItems: 'center',
  },
  dataActionDesc: {
    fontSize: 11,
    color: colors.tertiary,
    marginTop: 6,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 4,
  },
  footerText: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    fontWeight: '500',
  },
  footerSub: {
    fontSize: 11,
    color: colors.tertiary,
  },
}));
