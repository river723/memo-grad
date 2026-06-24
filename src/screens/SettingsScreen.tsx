import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, Linking, Platform } from 'react-native';
import {
  Card,
  Text,
  Switch,
  List,
  Button as PaperButton,
  TextInput,
  Divider,
  Surface,
  Button
} from 'react-native-paper';
import StorageService from '../services/StorageService';
import FileService from '../services/FileService';
import AIService from '../services/AIService';
import { AI_PROVIDERS, UI_CONFIG } from '../constants';
import { AppSettings } from '../types';

const BACKUP_FIELDS = [
  'words',
  'studyRecords',
  'studyPlans',
  'articles',
  'examSessions',
  'wrongQuestions',
  'ignoredWordbankWords',
  'settings',
];

const showMessage = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
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

export default function SettingsScreen() {
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
    aiProvider: 'deepseek',
    aiModel: AI_PROVIDERS.deepseek.defaultModel,
    apiKey: '',
  });
  const [apiKey, setApiKey] = useState('');
  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [apiTestMessage, setApiTestMessage] = useState('');
  const [apiTestOk, setApiTestOk] = useState<boolean | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await StorageService.getSettings();
      setSettings(prev => ({ ...prev, ...savedSettings }));
      // 加载保存的 DeepSeek API 设置
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

  const handleSaveAISettings = async () => {
    if (!apiKey.trim()) {
      Alert.alert('未填写 API Key', '请先填写 DeepSeek API Key');
      return;
    }
    await saveSettings({
      apiKey: apiKey.trim(),
      aiProvider: 'deepseek',
      aiModel: AI_PROVIDERS.deepseek.defaultModel,
    });
    Alert.alert('保存成功', 'DeepSeek API 设置已保存');
  };

  const handleTestAISettings = async () => {
    if (!apiKey.trim()) {
      const message = '请先填写 DeepSeek API Key';
      setApiTestOk(false);
      setApiTestMessage(message);
      Alert.alert('配置不完整', message);
      return;
    }
    setIsTestingApi(true);
    setApiTestOk(null);
    setApiTestMessage('正在测试连接，请稍候...');
    try {
      const aiService = new AIService({
        provider: 'deepseek',
        apiKey: apiKey.trim(),
        model: AI_PROVIDERS.deepseek.defaultModel,
      });
      const ok = await aiService.testApiKey();
      const message = ok
        ? `${aiService.getProviderName()} API 可用`
        : '连接失败，请检查 API Key、模型 ID 或网络连接';
      setApiTestOk(ok);
      setApiTestMessage(message);
      Alert.alert(ok ? '连接成功' : '连接失败', message);
    } catch (error: any) {
      const message = error.message || '请检查 API 设置';
      setApiTestOk(false);
      setApiTestMessage(message);
      Alert.alert('连接失败', message);
    } finally {
      setIsTestingApi(false);
    }
  };

  const handleExport = async () => {
    if (isExporting) {
      return;
    }

    setIsExporting(true);
    try {
      const exportedData = await StorageService.exportData();
      const fileName = FileService.generateBackupFileName();

      const result = await FileService.exportBackupFile(exportedData, fileName);
      showMessage(
        '导出成功',
        result === 'downloaded'
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
    if (isImporting) {
      return;
    }

    setIsImporting(true);
    try {
      const fileText = await FileService.pickAndReadBackupFile();
      if (!fileText) {
        return;
      }

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
        {
          text: '选择 .bk 文件',
          onPress: runImport,
        }
      ]
    );
  };

  const handleClearData = () => {
    Alert.alert(
      '确认清除',
      '确定要清除所有数据吗？此操作无法撤销。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '清除',
          style: 'destructive',
          onPress: async () => {
            await StorageService.clearAllData();
            setSettings({
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
              aiProvider: 'deepseek',
              aiModel: AI_PROVIDERS.deepseek.defaultModel,
              apiKey: '',
            });
            setApiKey('');
            Alert.alert('已清除', '所有数据已清除');
          }
        }
      ]
    );
  };

  const handleResetDefaults = () => {
    Alert.alert(
      '恢复默认',
      '确定要恢复所有设置为默认值吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: () => {
            saveSettings({
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
              aiProvider: 'deepseek',
              aiModel: AI_PROVIDERS.deepseek.defaultModel,
            });
          }
        }
      ]
    );
  };

  const handleAdjustDailyNewWords = (delta: number) => {
    const newValue = Math.max(1, Math.min(
      UI_CONFIG.DAILY_NEW_WORDS_LIMIT,
      settings.dailyNewWords + delta
    ));
    saveSettings({ dailyNewWords: newValue });
  };

  const handleAdjustExamQuestionCount = (delta: number) => {
    const newValue = Math.max(5, Math.min(
      20,
      (settings.examQuestionCount || 10) + delta
    ));
    saveSettings({ examQuestionCount: newValue });
  };

  const renderSettingItem = (title: string, value: string | number, onPress?: () => void) => (
    <List.Item
      title={title}
      description={value?.toString()}
      left={props => <List.Icon {...props} icon="cog" />}
      onPress={onPress}
      style={styles.settingItem}
    />
  );

  const currentProvider = AI_PROVIDERS.deepseek;

  return (
    <ScrollView style={styles.container}>
      {/* 学习设置 */}
      <Card style={styles.card}>
        <Card.Title title="⚙️ 学习设置" titleStyle={styles.cardTitle} />
        <Card.Content>
          <View style={styles.settingGroup}>
            <Text style={styles.settingLabel}>每日新词数量</Text>
            <View style={styles.numberInput}>
              <View style={styles.stepperRow}>
                <PaperButton
                  mode="outlined"
                  compact
                  onPress={() => handleAdjustDailyNewWords(-1)}
                  style={styles.stepperBtn}
                  labelStyle={styles.stepperBtnLabel}
                >
                  -
                </PaperButton>
                <Surface style={styles.numberButton}>
                  <Text style={styles.numberText}>{settings.dailyNewWords}</Text>
                </Surface>
                <PaperButton
                  mode="outlined"
                  compact
                  onPress={() => handleAdjustDailyNewWords(1)}
                  style={styles.stepperBtn}
                  labelStyle={styles.stepperBtnLabel}
                >
                  +
                </PaperButton>
              </View>
            </View>
            <View style={styles.sliderContainer}>
              <View
                style={[
                  styles.sliderFill,
                  { width: `${(settings.dailyNewWords / UI_CONFIG.DAILY_NEW_WORDS_LIMIT) * 100}%` }
                ]}
              />
            </View>
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>1</Text>
              <Text style={styles.sliderLabel}>{UI_CONFIG.DAILY_NEW_WORDS_LIMIT}</Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.settingGroup}>
            <Text style={styles.settingLabel}>考题练习题数</Text>
            <View style={styles.numberInput}>
              <View style={styles.stepperRow}>
                <PaperButton
                  mode="outlined"
                  compact
                  onPress={() => handleAdjustExamQuestionCount(-1)}
                  style={styles.stepperBtn}
                  labelStyle={styles.stepperBtnLabel}
                >
                  -
                </PaperButton>
                <Surface style={styles.numberButton}>
                  <Text style={styles.numberText}>{settings.examQuestionCount || 10}</Text>
                </Surface>
                <PaperButton
                  mode="outlined"
                  compact
                  onPress={() => handleAdjustExamQuestionCount(1)}
                  style={styles.stepperBtn}
                  labelStyle={styles.stepperBtnLabel}
                >
                  +
                </PaperButton>
              </View>
            </View>
            <View style={styles.sliderContainer}>
              <View
                style={[
                  styles.sliderFill,
                  { width: `${((settings.examQuestionCount || 10) / 20) * 100}%` }
                ]}
              />
            </View>
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>5</Text>
              <Text style={styles.sliderLabel}>20</Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>🔊 发音功能</Text>
              <Text style={styles.toggleSublabel}>朗读单词发音</Text>
            </View>
            <Switch
              value={settings.soundEnabled}
              onValueChange={value => saveSettings({ soundEnabled: value })}
              color="#1976D2"
            />
          </View>

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>🔇 熟词僻义</Text>
              <Text style={styles.toggleSublabel}>显示特殊用法标注</Text>
            </View>
            <Switch
              value={settings.showRareSense}
              onValueChange={value => saveSettings({ showRareSense: value })}
              color="#1976D2"
            />
          </View>

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleLabel}>🔍 词根词缀</Text>
              <Text style={styles.toggleSublabel}>显示词源分析</Text>
            </View>
            <Switch
              value={settings.showEtymology}
              onValueChange={value => saveSettings({ showEtymology: value })}
              color="#1976D2"
            />
          </View>

          <View style={styles.toggleRow}>
            <View>
              <Text style={[styles.toggleLabel, !settings.soundEnabled && styles.disabledText]}>
                🔊 自动发音
              </Text>
              <Text style={styles.toggleSublabel}>
                {settings.soundEnabled ? '学新单词时自动朗读' : '需先开启发音功能'}
              </Text>
            </View>
            <Switch
              value={settings.soundEnabled && settings.autoPlaySound}
              onValueChange={value => saveSettings({ autoPlaySound: value })}
              color="#1976D2"
              disabled={!settings.soundEnabled}
            />
          </View>
        </Card.Content>
      </Card>

      {/* 文章生成设置 */}
      <Card style={styles.card}>
        <Card.Title title="📝 文章生成设置" titleStyle={styles.cardTitle} />
        <Card.Content>
          <View style={styles.settingGroup}>
            <Text style={styles.settingLabel}>每篇文章生词数</Text>
            <View style={styles.numberInput}>
              <View style={styles.stepperRow}>
                <PaperButton
                  mode="outlined"
                  compact
                  onPress={() => {
                    const newValue = Math.max(5, (settings.articleWordCount || 10) - 1);
                    saveSettings({ articleWordCount: newValue });
                  }}
                  style={styles.stepperBtn}
                  labelStyle={styles.stepperBtnLabel}
                >
                  -
                </PaperButton>
                <Surface style={styles.numberButton}>
                  <Text style={styles.numberText}>{settings.articleWordCount || 10}</Text>
                </Surface>
                <PaperButton
                  mode="outlined"
                  compact
                  onPress={() => {
                    const newValue = Math.min(20, (settings.articleWordCount || 10) + 1);
                    saveSettings({ articleWordCount: newValue });
                  }}
                  style={styles.stepperBtn}
                  labelStyle={styles.stepperBtnLabel}
                >
                  +
                </PaperButton>
              </View>
            </View>
            <View style={styles.sliderContainer}>
              <View
                style={[
                  styles.sliderFill,
                  { width: `${((settings.articleWordCount || 10) / 20) * 100}%` }
                ]}
              />
            </View>
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>5</Text>
              <Text style={styles.sliderLabel}>20</Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.settingGroup}>
            <Text style={styles.settingLabel}>文章目标词数</Text>
            <View style={styles.numberInput}>
              <View style={styles.stepperRow}>
                <PaperButton
                  mode="outlined"
                  compact
                  onPress={() => {
                    const newValue = Math.max(100, (settings.articleLength || 200) - 50);
                    saveSettings({ articleLength: newValue });
                  }}
                  style={styles.stepperBtn}
                  labelStyle={styles.stepperBtnLabel}
                >
                  -
                </PaperButton>
                <Surface style={styles.numberButton}>
                  <Text style={styles.numberText}>{settings.articleLength || 200}</Text>
                </Surface>
                <PaperButton
                  mode="outlined"
                  compact
                  onPress={() => {
                    const newValue = Math.min(500, (settings.articleLength || 200) + 50);
                    saveSettings({ articleLength: newValue });
                  }}
                  style={styles.stepperBtn}
                  labelStyle={styles.stepperBtnLabel}
                >
                  +
                </PaperButton>
              </View>
            </View>
            <View style={styles.sliderContainer}>
              <View
                style={[
                  styles.sliderFill,
                  { width: `${((settings.articleLength || 200) / 500) * 100}%` }
                ]}
              />
            </View>
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabel}>100</Text>
              <Text style={styles.sliderLabel}>500</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* API设置 */}
      <Card style={styles.card}>
        <Card.Title title="🤖 AI API设置" titleStyle={styles.cardTitle} />
        <Card.Content>
          <Text style={styles.apiInfo}>
            配置 DeepSeek API Key，用于单词分析、文章生成和 AI 出题。
          </Text>
          <Text style={styles.apiTip}>{currentProvider.helpText}</Text>
          <View style={styles.apiKeyContainer}>
            <TextInput
              mode="outlined"
              label={`${currentProvider.name} API Key`}
              placeholder={currentProvider.keyPlaceholder}
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry={!isEditingApiKey}
              style={styles.apiInput}
              right={
                <TextInput.Icon
                  icon={isEditingApiKey ? "eye-off" : "eye"}
                  onPress={() => setIsEditingApiKey(!isEditingApiKey)}
                />
              }
            />
          </View>
          <View style={styles.apiActions}>
            <Button
              mode="outlined"
              onPress={handleTestAISettings}
              loading={isTestingApi}
              disabled={isTestingApi}
              style={styles.apiActionBtn}
            >
              {isTestingApi ? '测试中...' : '测试连接'}
            </Button>
            <Button
              mode="contained"
              onPress={handleSaveAISettings}
              style={styles.apiActionBtn}
            >
              保存 AI 设置
            </Button>
          </View>
          {apiTestMessage ? (
            <Text style={[
              styles.apiTestMessage,
              apiTestOk === true && styles.apiTestSuccess,
              apiTestOk === false && styles.apiTestError
            ]}>
              {apiTestMessage}
            </Text>
          ) : null}
          <View style={styles.apiTips}>
            <Text style={styles.apiTip}>🔗 前往 <Text style={styles.apiLink} onPress={() => Linking.openURL(currentProvider.getKeyUrl)}>{currentProvider.name}</Text> 获取 API Key</Text>
            <Text style={styles.apiTip}>🔒 API Key 仅保存在本机，导出数据时不会包含真实密钥。</Text>
          </View>
        </Card.Content>
      </Card>

      {/* 数据管理 */}
      <Card style={styles.card}>
        <Card.Title title="📦 数据管理" titleStyle={styles.cardTitle} />
        <Card.Content>
          <View style={styles.dataActions}>
            <View style={styles.dataActionItem}>
              <Button
                mode="contained-tonal"
                icon="export"
                onPress={handleExport}
                loading={isExporting}
                disabled={isExporting || isImporting}
                style={[styles.dataActionBtn, { backgroundColor: '#E8F5E9' }]}
                labelStyle={styles.dataActionText}
              >
                导出备份
              </Button>
              <Text style={styles.dataActionDesc}>导出 .bk 压缩备份</Text>
            </View>
            <View style={styles.dataActionItem}>
              <Button
                mode="contained-tonal"
                icon="import"
                onPress={handleImport}
                loading={isImporting}
                disabled={isExporting || isImporting}
                style={[styles.dataActionBtn, { backgroundColor: '#FFF3E0' }]}
                labelStyle={styles.dataActionText}
              >
                导入备份
              </Button>
              <Text style={styles.dataActionDesc}>从 .bk 文件恢复数据</Text>
            </View>
          </View>
        </Card.Content>
      </Card>

      {/* 高级设置 */}
      <Card style={styles.card}>
        <Card.Title title="⚡ 高级选项" titleStyle={styles.cardTitle} />
        <Card.Content>
          <View style={styles.dangerActions}>
            <Surface style={[styles.dangerBtn, { backgroundColor: '#FFEBEE' }]}>
              <Text style={styles.dangerBtnText} onPress={handleResetDefaults}>
                重置所有设置
              </Text>
            </Surface>
            <Surface style={[styles.dangerBtn, { backgroundColor: '#FCE4EC' }]}>
              <Text style={[styles.dangerBtnText, { color: '#F44336' }]} onPress={handleClearData}>
                清除所有数据
              </Text>
            </Surface>
          </View>
        </Card.Content>
      </Card>

      {/* 版本信息 */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>版本 1.0.0</Text>
        <Text style={styles.footerSub}>考研英语生词本</Text>
        <Text style={styles.footerSub}>专注考研 · 科学背词</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 16,
  },
  card: {
    marginBottom: 16,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  settingItem: {
    paddingVertical: 8,
  },
  settingGroup: {
    marginBottom: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  numberInput: {
    alignItems: 'center',
    marginBottom: 8,
  },
  numberButton: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
  },
  numberText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1976D2',
  },
  sliderContainer: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: '#1976D2',
    borderRadius: 4,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sliderLabel: {
    fontSize: 12,
    color: '#999',
  },
  divider: {
    marginVertical: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  toggleSublabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  disabledText: {
    color: '#999',
  },
  apiInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  apiKeyContainer: {
    marginBottom: 12,
  },
  apiInput: {
    backgroundColor: 'transparent',
  },
  saveApiBtn: {
    marginTop: 8,
  },
  apiActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  apiActionBtn: {
    flex: 1,
  },
  apiTestMessage: {
    fontSize: 13,
    color: '#666',
    marginTop: 10,
    lineHeight: 20,
  },
  apiTestSuccess: {
    color: '#2E7D32',
  },
  apiTestError: {
    color: '#D32F2F',
  },
  apiTips: {
    marginTop: 8,
  },
  apiTip: {
    fontSize: 13,
    color: '#666',
    lineHeight: 20,
  },
  apiLink: {
    color: '#1976D2',
    fontWeight: 'bold',
  },
  dataActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  dataActionItem: {
    flex: 1,
    alignItems: 'center',
  },
  dataActionBtn: {
    borderRadius: 8,
    width: '100%',
  },
  dataActionText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  dataActionDesc: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  dangerActions: {
    gap: 12,
  },
  dangerBtn: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  dangerBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 14,
    color: '#999',
  },
  footerSub: {
    fontSize: 12,
    color: '#CCC',
    marginTop: 2,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  stepperBtn: {
    borderRadius: 8,
    minWidth: 40,
  },
  stepperBtnLabel: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  exportModal: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'white',
  },
  exportTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  exportContent: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
  },
  exportJson: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  exportActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
});