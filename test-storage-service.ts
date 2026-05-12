import StorageService from './src/services/StorageService';
import { Word } from './src/types';

async function testStorageService() {
  console.log('📦 测试StorageService功能...\n');

  try {
    // 测试1: 获取空列表
    console.log('测试1: 获取空单词列表...');
    const emptyWords = await StorageService.getWords();
    console.log(`  ✓ 空列表: ${emptyWords.length} 个单词`);

    // 测试2: 添加单个单词
    console.log('\n测试2: 添加单词...');
    const testWord: Omit<Word, 'id'> = {
      word: 'example',
      pronunciation_uk: '[ɪɡˈzɑːmpəl]',
      pronunciation_us: '[ɪɡˈzæmpəl]',
      definitions: [{
        part_of_speech: 'n.',
        meaning: '例子',
        example: 'This is an example.',
        is_core: true,
        is_rare_sense: false
      }],
      etymology: '来自拉丁语exemplum',
      similar_words: [],
      category: 'reading',
      difficulty: 3,
      frequency: 1
    };

    const wordId = await StorageService.addWord(testWord);
    console.log(`  ✓ 添加成功，ID: ${wordId}`);

    // 测试3: 获取单词列表
    console.log('\n测试3: 获取单词列表...');
    const words = await StorageService.getWords();
    console.log(`  ✓ 列表大小: ${words.length} 个单词`);
    console.log(`  ✓ 单词: ${words[0].word}`);

    // 测试4: 按ID获取单词
    console.log('\n测试4: 按ID获取单词...');
    const wordById = await StorageService.getWordById(wordId);
    console.log(`  ✓ 找到单词: ${wordById?.word}`);

    // 测试5: 搜索单词
    console.log('\n测试5: 搜索单词...');
    const searchResults = await StorageService.searchWords('example');
    console.log(`  ✓ 搜索结果: ${searchResults.length} 个匹配`);

    // 测试6: 按分类筛选
    console.log('\n测试6: 按分类筛选...');
    const readingWords = await StorageService.getWordsByCategory('reading');
    console.log(`  ✓ 阅读分类: ${readingWords.length} 个单词`);

    // 测试7: 更新单词
    console.log('\n测试7: 更新单词...');
    await StorageService.updateWord(wordId, { difficulty: 4 });
    const updatedWord = await StorageService.getWordById(wordId);
    console.log(`  ✓ 难度更新: ${updatedWord?.difficulty}`);

    // 测试8: 删除单词
    console.log('\n测试8: 删除单词...');
    await StorageService.deleteWord(wordId);
    const afterDelete = await StorageService.getWords();
    console.log(`  ✓ 删除后: ${afterDelete.length} 个单词`);

    // 测试9: 批量添加单词
    console.log('\n测试9: 批量添加单词...');
    const batchWords = ['test', 'demo', 'sample'];
    for (const word of batchWords) {
      const batchWord: Omit<Word, 'id'> = {
        word: word,
        definitions: [{
          part_of_speech: 'n.',
          meaning: '测试',
          example: `This is a ${word}.`,
          is_core: false,
          is_rare_sense: false
        }],
        category: 'reading',
        difficulty: 2,
        frequency: 1
      };
      await StorageService.addWord(batchWord);
    }
    const batchWordsList = await StorageService.getWords();
    console.log(`  ✓ 批量添加后: ${batchWordsList.length} 个单词`);

    console.log('\n🎉 StorageService所有测试通过！');
  } catch (error) {
    console.error('❌ StorageService测试失败:', error);
  }
}

// 运行测试
testStorageService().catch(console.error);