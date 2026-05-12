import StorageService from './src/services/StorageService';
import { Word } from './src/types';

// 简单的测试函数
async function runTests() {
  console.log('🧪 开始测试StorageService...\n');

  // 测试数据
  const testWords = [
    'abandon',
    'persist',
    'diligent',
    'consistent',
    'attribute'
  ];

  try {
    // 测试1: 批量添加单词
    console.log('📝 测试批量添加单词...');
    const addedIds = [];

    for (const wordText of testWords) {
      const wordData: Omit<Word, 'id'> = {
        word: wordText,
        pronunciation_uk: '',
        pronunciation_us: '',
        definitions: [{
          part_of_speech: 'v.',
          meaning: '测试释义',
          example: `Example sentence with ${wordText}.`,
          is_core: true,
          is_rare_sense: false
        }],
        etymology: '测试词源',
        similar_words: [],
        category: 'reading',
        difficulty: 3,
        frequency: 1
      };

      const id = await StorageService.addWord(wordData);
      addedIds.push(id);
      console.log(`  ✓ 添加 "${wordText}" (ID: ${id})`);
    }

    // 测试2: 获取所有单词
    console.log('\n📋 测试获取单词列表...');
    const allWords = await StorageService.getWords();
    console.log(`  ✓ 总计: ${allWords.length} 个单词`);

    allWords.forEach(word => {
      console.log(`    - ${word.word} (分类: ${word.category}, 难度: ${word.difficulty})`);
    });

    // 测试3: 搜索功能
    console.log('\n🔍 测试搜索功能...');
    const searchResults = await StorageService.searchWords('a');
    console.log(`  ✓ 搜索 "a": 找到 ${searchResults.length} 个结果`);

    // 测试4: 按分类筛选
    console.log('\n🏷️  测试按分类筛选...');
    const readingWords = await StorageService.getWordsByCategory('reading');
    console.log(`  ✓ 阅读分类: ${readingWords.length} 个单词`);

    // 测试5: 更新单词
    console.log('\n🔄 测试更新单词...');
    const firstId = addedIds[0];
    await StorageService.updateWord(firstId, {
      difficulty: 5,
      pronunciation_uk: '[əˈbændən]'
    });
    console.log(`  ✓ 更新单词 ID ${firstId}`);

    const updatedWord = await StorageService.getWordById(firstId);
    console.log(`  ✓ 新难度: ${updatedWord?.difficulty}, 音标: ${updatedWord?.pronunciation_uk}`);

    // 测试6: 删除单词
    console.log('\n🗑️  测试删除单词...');
    await StorageService.deleteWord(firstId);
    console.log(`  ✓ 删除单词 ID ${firstId}`);

    const afterDelete = await StorageService.getWords();
    console.log(`  ✓ 删除后剩余: ${afterDelete.length} 个单词`);

    // 测试7: 清空所有测试数据
    console.log('\n🧹 清理测试数据...');
    for (const id of addedIds.slice(1)) {
      await StorageService.deleteWord(id);
    }
    console.log('  ✓ 清理完成');

    console.log('\n🎉 StorageService测试全部通过！');
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
runTests().catch(console.error);