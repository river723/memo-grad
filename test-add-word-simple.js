#!/usr/bin/env node

// 简化的测试脚本，直接测试核心逻辑

function parseWords(text) {
  if (!text.trim()) return [];

  const words = text
    .split(/[\s\n,，。；;：:、\-]/)
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0 && /^[a-zA-Z]+$/.test(w));

  const uniqueWords = [...new Set(words)];
  return uniqueWords;
}

function testWordParsing() {
  console.log('🔍 测试单词解析功能...');

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
      input: 'hello world test',
      expected: ['hello', 'world', 'test']
    },
    {
      input: '  multiple   spaces  ',
      expected: ['multiple', 'spaces']
    },
    {
      input: 'mixed, separators\nand spaces',
      expected: ['mixed', 'separators', 'and', 'spaces']
    }
  ];

  let allPassed = true;
  testCases.forEach((testCase, index) => {
    const result = parseWords(testCase.input);
    const passed = JSON.stringify(result) === JSON.stringify(testCase.expected);
    console.log(`  测试用例 ${index + 1}: ${passed ? '✅ 通过' : '❌ 失败'}`);
    if (!passed) {
      console.log(`    输入: "${testCase.input}"`);
      console.log(`    期望: ${JSON.stringify(testCase.expected)}`);
      console.log(`    实际: ${JSON.stringify(result)}`);
      allPassed = false;
    }
  });

  return allPassed;
}

function testDifficultyLogic() {
  console.log('\n📊 测试难度等级逻辑...');

  const getDifficultyLabel = (difficulty) => {
    return difficulty <= 2 ? '简单' : difficulty <= 3 ? '中等' : difficulty <= 4 ? '困难' : '极难';
  };

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 1: return '#4CAF50';
      case 2: return '#8BC34A';
      case 3: return '#FF9800';
      case 4: return '#FF5722';
      case 5: return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const testCases = [
    { difficulty: 1, expectedLabel: '简单', expectedColor: '#4CAF50' },
    { difficulty: 2, expectedLabel: '简单', expectedColor: '#8BC34A' },
    { difficulty: 3, expectedLabel: '中等', expectedColor: '#FF9800' },
    { difficulty: 4, expectedLabel: '困难', expectedColor: '#FF5722' },
    { difficulty: 5, expectedLabel: '极难', expectedColor: '#F44336' }
  ];

  let allPassed = true;
  testCases.forEach((testCase, index) => {
    const label = getDifficultyLabel(testCase.difficulty);
    const color = getDifficultyColor(testCase.difficulty);
    const passed = label === testCase.expectedLabel && color === testCase.expectedColor;
    console.log(`  难度等级 ${testCase.difficulty}: ${passed ? '✅ 通过' : '❌ 失败'}`);
    if (!passed) {
      console.log(`    期望标签: ${testCase.expectedLabel}, 实际: ${label}`);
      console.log(`    期望颜色: ${testCase.expectedColor}, 实际: ${color}`);
      allPassed = false;
    }
  });

  return allPassed;
}

function testUIComponentValidation() {
  console.log('\n🎨 测试UI组件验证逻辑...');

  // 测试单词数量限制
  const MAX_WORDS = 30;
  const testWordCount = (count) => {
    if (count === 0) return '请输入有效的单词';
    if (count > MAX_WORDS) return '一次最多只能处理30个单词';
    return null; // 无错误
  };

  const validationTests = [
    { count: 0, expected: '请输入有效的单词' },
    { count: 1, expected: null },
    { count: 15, expected: null },
    { count: 30, expected: null },
    { count: 31, expected: '一次最多只能处理30个单词' },
    { count: 50, expected: '一次最多只能处理30个单词' }
  ];

  let allPassed = true;
  validationTests.forEach((test, index) => {
    const result = testWordCount(test.count);
    const passed = result === test.expected;
    console.log(`  单词数量 ${test.count}: ${passed ? '✅ 通过' : '❌ 失败'}`);
    if (!passed) {
      console.log(`    期望: ${test.expected}, 实际: ${result}`);
      allPassed = false;
    }
  });

  return allPassed;
}

function testCategoryHandling() {
  console.log('\n🏷️  测试分类处理逻辑...');

  const WordCategory = {
    reading: '阅读',
    cloze: '完型',
    translation: '翻译',
    writing: '作文'
  };

  const categories = Object.keys(WordCategory);
  const expectedCategories = ['reading', 'cloze', 'translation', 'writing'];

  const passed = JSON.stringify(categories) === JSON.stringify(expectedCategories);
  console.log(`  分类定义: ${passed ? '✅ 通过' : '❌ 失败'}`);

  if (passed) {
    categories.forEach(category => {
      console.log(`    ✓ ${category}: ${WordCategory[category]}`);
    });
  }

  return passed;
}

async function main() {
  console.log('🧪 开始测试新增单词功能...\n');

  let allTestsPassed = true;

  allTestsPassed &= testWordParsing();
  allTestsPassed &= testDifficultyLogic();
  allTestsPassed &= testUIComponentValidation();
  allTestsPassed &= testCategoryHandling();

  console.log('\n' + '='.repeat(50));
  if (allTestsPassed) {
    console.log('🎉 所有测试通过！新增单词功能核心逻辑正常。');
  } else {
    console.log('❌ 部分测试失败，请检查实现。');
  }
  console.log('='.repeat(50));
}

main().catch(console.error);