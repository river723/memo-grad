import React from 'react';
import { Provider as PaperProvider, Text, View, Button, Card } from 'react-native-paper';

const theme = {
  colors: {
    primary: '#1976D2',
    accent: '#FF9800',
    background: '#F5F5F5',
    surface: '#FFFFFF',
    text: '#212121',
  },
};

export default function SimpleApp() {
  const [count, setCount] = React.useState(0);

  return (
    <PaperProvider theme={theme}>
      <View style={{ flex: 1, backgroundColor: '#F5F5F5', padding: 20 }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Card style={{ padding: 20, minWidth: 300 }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', textAlign: 'center', color: '#1976D2', marginBottom: 20 }}>
              考研英语生词本
            </Text>

            <Text style={{ fontSize: 16, textAlign: 'center', marginBottom: 20, color: '#666' }}>
              简化版本 - 测试基础功能
            </Text>

            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, marginBottom: 10 }}>计数器: {count}</Text>
              <Button mode="contained" onPress={() => setCount(count + 1)}>
                点击测试
              </Button>
            </View>

            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, marginBottom: 10, color: '#666' }}>
                ✓ React Native Paper 正常工作
              </Text>
              <Text style={{ fontSize: 14, marginBottom: 10, color: '#666' }}>
                ✓ 主题配置正常
              </Text>
              <Text style={{ fontSize: 14, marginBottom: 10, color: '#666' }}>
                ✓ 状态管理正常
              </Text>
            </View>

            <Text style={{ fontSize: 12, textAlign: 'center', color: '#999', marginTop: 20 }}>
              如果看到这个页面，说明基础框架正常
            </Text>
          </Card>
        </View>
      </View>
    </PaperProvider>
  );
}