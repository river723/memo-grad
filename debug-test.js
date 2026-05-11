// 简单的调试测试脚本
console.log('=== MemoGrad 调试测试 ===');

// 测试1: 检查环境变量
console.log('1. 环境变量检查:');
try {
  require('dotenv').config();
  console.log('   ✓ .env 文件加载成功');
  console.log('   ✓ API密钥:', process.env.OPENROUTER_API_KEY ? '已配置' : '未配置');
} catch (error) {
  console.log('   ✗ 环境变量加载失败:', error.message);
}

// 测试2: 检查关键文件存在性
console.log('\n2. 文件检查:');
const fs = require('fs');
const path = require('path');

const filesToCheck = [
  'src/services/StorageService.ts',
  'src/services/AIService.ts',
  'src/navigation/AppNavigator.tsx',
  'src/screens/HomeScreen.tsx'
];

filesToCheck.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`   ${exists ? '✓' : '✗'} ${file}`);
});

// 测试3: 检查 package.json 依赖
console.log('\n3. 依赖检查:');
try {
  const pkg = require('./package.json');
  const requiredDeps = ['expo', 'react-native', 'react-native-paper', '@react-navigation/native'];
  requiredDeps.forEach(dep => {
    const hasDep = !!pkg.dependencies[dep];
    console.log(`   ${hasDep ? '✓' : '✗'} ${dep}`);
  });
} catch (error) {
  console.log('   ✗ package.json 读取失败');
}

console.log('\n=== 调试测试完成 ===');