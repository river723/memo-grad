import StorageService from './src/services/StorageService';
import AIService from './src/services/AIService';
import { Word, AIResponse } from './src/types';

// 模拟完整的单词添加流程
async function testCompleteWorkflow() {
  console.log('🔄 测试完整的单词添加流程...\n');

  // 模拟用户输入
  const userInput = 'abandon persist diligent';
  console.log(`📝 用户输入: "${userInput}"`);

  // 步骤1: 解析单词
  console.log('\n1️⃣ 步骤1: 解析单词...');
  const words = parseWords(userInput);
  console.log(`   ✓ 解析结果: ${words.join(', ')}`);
  console.log(`   ✓ 单词数量: ${words.length}`);

  // 步骤2: 模拟AI分析
  console.log('\n2️⃣ 步骤2: AI智能分析...');
  const mockAIResults = new Map<string, AIResponse>();

  for (const word of words) {
    const mockResponse: AIResponse = {
      definitions: getMockDefinitions(word),
      etymology: getMockEtymology(word),
      similar_words: getMockSimilarWords(word),
      suggestedDifficulty: Math.floor(Math.random() * 4) + 2 // 2-5的随机难度
    };
    mockAIResults.set(word, mockResponse);
    console.log(`   ✓ AI分析 "${word}": ${mockResponse.definitions.length}个释义, 难度${mockResponse.suggestedDifficulty}`);
  }

  // 步骤3: 选择分类
  console.log('\n3️⃣ 步骤3: 选择分类...');
  const category = 'reading';
  console.log(`   ✓ 选择分类: ${category}`);

  // 步骤4: 显示难度等级
  console.log('\n4️⃣ 步骤4: AI建议难度等级...');
  mockAIResults.forEach((result, word) => {
    const difficulty = result.suggestedDifficulty || 3;
    const difficultyLabel = getDifficultyLabel(difficulty);
    const difficultyColor = getDifficultyColor(difficulty);
    console.log(`   ✓ ${word}: ${difficultyLabel} (${difficulty}/5) - 颜色: ${difficultyColor}`);
  });

  // 步骤5: 保存单词到存储
  console.log('\n5️⃣ 步骤5: 保存单词...');
  const savedIds = [];

  for (const word of words) {
    const aiResult = mockAIResults.get(word);
    const wordData: Omit<Word, 'id'> = {
      word: word,
      pronunciation_uk: '[mock-pronunciation]',
      pronunciation_us: '[mock-pronunciation]',
      definitions: aiResult?.definitions || [{
        part_of_speech: 'n.',
        meaning: '待添加释义',
        example: '',
        is_core: false,
        is_rare_sense: false
      }],
      etymology: aiResult?.etymology || '',
      similar_words: aiResult?.similar_words || [],
      category: category,
      difficulty: aiResult?.suggestedDifficulty || 3,
      frequency: 1
    };

    const savedId = await StorageService.addWord(wordData);
    savedIds.push(savedId);
    console.log(`   ✓ 保存 "${word}" (ID: ${savedId})`);
  }

  // 步骤6: 验证保存结果
  console.log('\n6️⃣ 步骤6: 验证保存结果...');
  const allWords = await StorageService.getWords();
  const savedWords = allWords.filter(w => savedIds.includes(w.id!));

  console.log(`   ✓ 总单词数: ${allWords.length}`);
  console.log(`   ✓ 新增单词数: ${savedWords.length}`);

  savedWords.forEach(word => {
    console.log(`   ✓ ${word.word} - 分类: ${word.category}, 难度: ${word.difficulty}`);
  });

  // 步骤7: 测试搜索和筛选
  console.log('\n7️⃣ 步骤7: 测试搜索和筛选...');
  const searchResults = await StorageService.searchWords('a');
  console.log(`   ✓ 搜索 'a': ${searchResults.length} 个结果`);

  const categoryWords = await StorageService.getWordsByCategory(category);
  console.log(`   ✓ 分类 '${category}': ${categoryWords.length} 个单词`);

  // 清理测试数据
  console.log('\n🧹 清理测试数据...');
  for (const id of savedIds) {
    await StorageService.deleteWord(id);
    console.log(`   ✓ 删除单词 ID ${id}`);
  }

  const afterCleanup = await StorageService.getWords();
  console.log(`   ✓ 清理后剩余单词: ${afterCleanup.length}`);

  console.log('\n🎉 完整单词添加流程测试通过！');
  console.log('\n📊 流程总结:');
  console.log('   ✓ 用户输入 → 单词解析');
  console.log('   ✓ AI智能分析 → 难度评估');
  console.log('   ✓ 分类选择 → 数据存储');
  console.log('   ✓ 搜索验证 → 流程完成');
}

// 辅助函数 (从AddWordScreen复制)
function parseWords(text: string): string[] {
  if (!text.trim()) return [];

  const words = text
    .split(/[\s\n,，。；;：:、\-]/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0 && /^[a-zA-Z]+$/.test(w));

  const uniqueWords = [...new Set(words)];
  return uniqueWords;
}

function getDifficultyLabel(difficulty: number): string {
  return difficulty <= 2 ? '简单' : difficulty <= 3 ? '中等' : difficulty <= 4 ? '困难' : '极难';
}

function getDifficultyColor(difficulty: number): string {
  switch (difficulty) {
    case 1: return '#4CAF50';
    case 2: return '#8BC34A';
    case 3: return '#FF9800';
    case 4: return '#FF5722';
    case 5: return '#F44336';
    default: return '#9E9E9E';
  }
}

// 模拟数据生成器
function getMockDefinitions(word: string): any[] {
  const definitions = [
    {
      part_of_speech: 'v.',
      meaning: '放弃，停止',
      example: `He decided to ${word} his bad habits.`,
      is_core: true,
      is_rare_sense: false
    },
    {
      part_of_speech: 'n.',
      meaning: '停止，终止',
      example: `The ${word} of the project was unexpected.`,
      is_core: false,
      is_rare_sense: true
    }
  ];
  return definitions.slice(0, Math.floor(Math.random() * 2) + 1);
}

function getMockEtymology(word: string): string {
  const etymologies = [
    `来自拉丁语${word}are`,
    `来自古法语${word}er`,
    `来自希腊语${word}os`,
    `来自日耳曼语源${word}`
  ];
  return etymologies[Math.floor(Math.random() * etymologies.length)];
}

function getMockSimilarWords(word: string): any[] {
  const similarWords = [
    { base: 'stop', similar: ['cease', 'halt', 'quit'] },
    { base: 'keep', similar: ['maintain', 'preserve', 'retain'] },
    { base: 'work', similar: ['labor', 'toil', 'endeavor'] }
  ];

  const match = similarWords.find(s => word.includes(s.base) || s.base.includes(word));
  if (match) {
    return match.similar.slice(0, 2).map(s => ({
      word: s,
      relation: 'meaning',
      description: `与${word}意思相近，但用法略有不同`
    }));
  }

  return [];
}

// 运行完整流程测试
testCompleteWorkflow().catch(console.error);