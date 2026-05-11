// AsyncStorage Web 兼容性测试
console.log('=== AsyncStorage 测试 ===');

try {
  // 动态导入以避免 SSR 问题
  import('@react-native-async-storage/async-storage').then(AsyncStorageModule => {
    const AsyncStorage = AsyncStorageModule.default;

    console.log('AsyncStorage 导入成功');

    // 测试存储
    AsyncStorage.setItem('test_key', 'test_value')
      .then(() => {
        console.log('✓ 存储测试成功');

        // 测试读取
        return AsyncStorage.getItem('test_key');
      })
      .then(value => {
        console.log('✓ 读取测试成功:', value);
        console.log('=== AsyncStorage 测试完成 ===');
      })
      .catch(error => {
        console.error('✗ AsyncStorage 测试失败:', error);
      });
  }).catch(error => {
    console.error('✗ AsyncStorage 导入失败:', error);
  });
} catch (error) {
  console.error('✗ 测试执行失败:', error);
}