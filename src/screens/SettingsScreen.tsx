import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, Linking } from 'react-native';
import {
  Card,
  Text,
  Switch,
  List,
  Button as PaperButton,
  TextInput,
  Divider,
  Surface,
  Button,
  Modal
} from 'react-native-paper';
import StorageService from '../services/StorageService';
import { UI_CONFIG } from '../constants';
import { format } from 'date-fns';

export default function SettingsScreen() {
  const [settings, setSettings] = useState({
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
  });
  const [apiKey, setApiKey] = useState('');
  const [isEditingApiKey, setIsEditingApiKey] = useState(false);
  const [dataExport, setDataExport] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await StorageService.getSettings();
      setSettings(prev => ({ ...prev, ...savedSettings }));
      // 加载保存的API key
      if (savedSettings.apiKey) {
        setApiKey(savedSettings.apiKey);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = async (newSettings: any) => {
    try {
      const merged = { ...settings, ...newSettings };
      if (newSettings.soundEnabled === false) {
        merged.autoPlaySound = false;
      }
      await StorageService.saveSettings(merged);
      setSettings(merged);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const handleExport = async () => {
    try {
      const data = await StorageService.exportData();
      setDataExport(data);
      setShowExportModal(true);
    } catch (error) {
      Alert.alert('导出失败', '无法导出数据');
    }
  };

  const handleImport = async () => {
    Alert.alert(
      '导入数据',
      '确定要从文件导入数据吗？当前数据可能会被覆盖。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            try {
              await StorageService.importData(dataExport);
              Alert.alert('导入成功', '数据已成功导入');
            } catch (error) {
              Alert.alert('导入失败', '无法导入数据，请检查数据格式');
            }
          }
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
            });
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
            配置DeepSeek API密钥以使用AI智能分析功能
          </Text>
          <View style={styles.apiKeyContainer}>
            <TextInput
              mode="outlined"
              placeholder="输入API密钥"
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
          <Button
            mode="contained"
            onPress={() => saveSettings({ apiKey: apiKey })}
            style={styles.saveApiBtn}
          >
            保存API密钥
          </Button>
          <View style={styles.apiTips}>
            <Text style={styles.apiTip}>🔗 前往 <Text style={styles.apiLink} onPress={() => Linking.openURL('https://platform.deepseek.com/')}>platform.deepseek.com</Text> 获取API密钥</Text>
          </View>
        </Card.Content>
      </Card>

      {/* 数据管理 */}
      <Card style={styles.card}>
        <Card.Title title="📦 数据管理" titleStyle={styles.cardTitle} />
        <Card.Content>
          <View style={styles.dataActions}>
            <View style={styles.dataActionItem}>
              <Surface style={[styles.dataActionBtn, { backgroundColor: '#E8F5E9' }]}>
                <Text style={styles.dataActionText} onPress={handleExport}>导出数据</Text>
              </Surface>
              <Text style={styles.dataActionDesc}>导出所有学习数据</Text>
            </View>
            <View style={styles.dataActionItem}>
              <Surface style={[styles.dataActionBtn, { backgroundColor: '#FFF3E0' }]}>
                <Text style={styles.dataActionText} onPress={handleImport}>导入数据</Text>
              </Surface>
              <Text style={styles.dataActionDesc}>从文件恢复数据</Text>
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

      {/* 导出弹窗 */}
      <Modal visible={showExportModal} animationType="slide">
        <View style={styles.exportModal}>
          <Text style={styles.exportTitle}>📦 导出数据</Text>
          <ScrollView style={styles.exportContent}>
            <Text style={styles.exportJson}>{dataExport}</Text>
          </ScrollView>
          <View style={styles.exportActions}>
            <PaperButton onPress={() => setShowExportModal(false)}>关闭</PaperButton>
            <PaperButton onPress={() => { /* 复制到剪贴板 */ }}>复制</PaperButton>
          </View>
        </View>
      </Modal>
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
  },
  dataActionItem: {
    flex: 1,
    alignItems: 'center',
  },
  dataActionBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
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