import React from 'react';
import { View, Text } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';

// 最简单的测试组件
const SimpleTest = () => {
  console.log('SimpleTest 组件渲染了');

  return (
    <PaperProvider>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' }}>
        <Text style={{ fontSize: 24, color: '#1976D2' }}>测试组件正常渲染</Text>
        <Text style={{ fontSize: 16, marginTop: 10, color: '#666' }}>如果看到这个，说明基础框架正常</Text>
      </View>
    </PaperProvider>
  );
};

export default SimpleTest;