import React from 'react';
import { Provider as PaperProvider, Text, View } from 'react-native-paper';

const theme = {
  colors: {
    primary: '#1976D2',
    accent: '#FF9800',
    background: '#F5F5F5',
    surface: '#FFFFFF',
    text: '#212121',
  },
};

export default function TestApp() {
  return (
    <PaperProvider theme={theme}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' }}>
        <Text style={{ fontSize: 24, color: '#1976D2', fontWeight: 'bold' }}>考研英语生词本</Text>
        <Text style={{ fontSize: 16, marginTop: 10, color: '#666' }}>应用测试版本</Text>
      </View>
    </PaperProvider>
  );
}