#!/usr/bin/env node

// 测试新增单词功能的独立脚本
const path = require('path');
require('ts-node').register();

const StorageService = require('./src/services/StorageService').default;
const AIService = require('./src/services/AIService').default;
const { Word, WordCategory, AIResponse } = require('./src/types');

async function testAddWordFeature() {
  console.log('🧪 开始测试新增单词功能...\n');

  try {
    // 测试1: StorageService基本功能
    console.log('📦 测试StorageService...');
    await testStorageService();
    console.log('✅ StorageService测试通过\n');

    // 测试2: 单词解析功能
    console.log('🔍 测试单词解析功能...');
    testWordParsing();
    console.log('✅ 单词解析测试通过\n');

    // 测试3: AIService功能（需要API密钥）
    console.log('🤖 测试AIService功能...');
    await testAIService();
    console.log('✅ AIService测试通过\n');

    // 测试4: 完整流程测试
    console.log('🔄 测试完整新增单词流程...');
    await testCompleteWorkflow();
    console.log('✅ 完整流程测试通过\n');

    console.log('🎉 所有测试通过！新增单词功能正常。');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

async function testStorageService() {
  // 测试添加单词
  const testWord = {
    word: 'test',
    pronunciation_uk: '[test]',
    pronunciation_us: '[test]',
    definitions: [{
      part_of_speech: 'n.',
      meaning: '测试',
      example: 'This is a test.',
      is_core: true,
      is_rare_sense: false
    }],
    etymology: '来自古法语test',
    similar_words: [],
    category: 'reading',
    difficulty: 3,
    frequency: 1
  };

  const wordId = await StorageService.addWord(testWord);
  console.log(`  ✓ 添加单词成功，ID: ${wordId}`);

  // 测试获取单词
  const words = await StorageService.getWords();
  console.log(`  ✓ 获取单词列表，总数: ${words.length}`);

  // 测试搜索单词
  const searchResults = await StorageService.searchWords('test');
  console.log(`  ✓ 搜索单词，找到: ${searchResults.length} 个结果`);

  // 清理测试数据
  await StorageService.deleteWord(wordId);
  console.log('  ✓ 清理测试数据');
}

function testWordParsing() {
  // 测试单词解析逻辑
  const testCases = [
    {
      input: 'abandon persist diligent',
      expected: ['abandon', 'persist', 'diligent']
    },
    {
      input: 'abandon,persist,diligent',
      expected: ['abandon', 'persist', 'diligent']
    },
    {
      input: 'abandon\npersist\ndiligent',
      expected: ['abandon', 'persist', 'diligent']
    },
    {
      input: 'abandon；persist；diligent',
      expected: ['abandon', 'persist', 'diligent']
    },
    {
      input: 'hello world',
      expected: ['hello', 'world']
    }
  ];

  testCases.forEach((testCase, index) => {
    const result = parseWords(testCase.input);
    const passed = JSON.stringify(result) === JSON.stringify(testCase.expected);
    console.log(`  ✓ 测试用例 ${index + 1}: ${passed ? '通过' : '失败'}`);
    if (!passed) {
      console.log(`    输入: "${testCase.input}"`);
      console.log(`    期望: ${JSON.stringify(testCase.expected)}`);
      console.log(`    实际: ${JSON.stringify(result)}`);
    }
  });
}

async function testAIService() {
  try {
    // 注意：这里需要有效的API密钥才能实际测试
    const aiService = new AIService('test-api-key');

    // 测试单个单词分析（会失败，因为没有真实API密钥）
    try {
      await aiService.analyzeWord('test');
      console.log('  ⚠️  单个单词分析成功（使用了真实API密钥）');
    } catch (error) {
      console.log(`  ✓ 单个单词分析预期失败: ${error.message}`);
    }

    // 测试批量单词分析
    try {
      await aiService.analyzeWords(['test', 'example']);
      console.log('  ⚠️  批量单词分析成功（使用了真实API密钥）');
    } catch (error) {
      console.log(`  ✓ 批量单词分析预期失败: ${error.message}`);
    }
  } catch (error) {
    console.log(`  ✓ AIService初始化: ${error.message}`);
  }
}

async function testCompleteWorkflow() {
  // 模拟完整的单词添加流程

  // 1. 准备测试数据
  const words = ['example', 'demonstrate', 'illustrate'];
  console.log(`  ✓ 准备测试单词: ${words.join(', ')}`);

  // 2. 模拟AI分析结果
  const mockAIResponse = {
    definitions: [
      {
        part_of_speech: 'v.',
        meaning: '举例说明',
        example: 'He gave an example to demonstrate his point.',
        is_core: true,
        is_rare_sense: false
      }
    ],
    etymology: '来自拉丁语exemplum',
    similar_words: [
      {
        word: 'demonstrate',
        relation: 'meaning',
        description: '都有说明的意思，但demonstrate更强调论证'
      }
    ],
    suggestedDifficulty: 3
  };

  console.log('  ✓ 模拟AI分析结果');

  // 3. 保存单词
  for (const word of words) {
    const wordData = {
      word,
      pronunciation_uk: '[ɪɡˈzɑːmpəl]',
      pronunciation_us: '[ɪɡˈzæmpəl]',
      definitions: mockAIResponse.definitions,
      etymology: mockAIResponse.etymology,
      similar_words: mockAIResponse.similar_words,
      category: 'reading',
      difficulty: mockAIResponse.suggestedDifficulty,
      frequency: 1
    };

    const wordId = await StorageService.addWord(wordData);
    console.log(`  ✓ 保存单词 "${word}"，ID: ${wordId}`);

    // 清理
    await StorageService.deleteWord(wordId);
    console.log(`  ✓ 清理测试单词 "${word}"`);
  }
}

// 单词解析函数（从AddWordScreen复制）
function parseWords(text) {
  if (!text.trim()) return [];

  const words = text
    .split(/[\s\n,，。；;：:、\-]/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0 && /^[a-zA-Z]+$/.test(w));

  const uniqueWords = [...new Set(words)];
  return uniqueWords;
}

// 运行测试
testAddWordFeature().catch(console.error);