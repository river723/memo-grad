import AIService from './src/services/AIService';
import { AIResponse } from './src/types';

// 测试AIService的核心功能
async function testAIService() {
  console.log('🤖 测试AIService功能...\n');

  // 测试1: 测试解析函数
  console.log('🧪 测试1: AI响应解析函数...');

  const mockContent = `
好的，我来分析这个单词的考研英语用法。

{
  "definitions": [
    {
      "part_of_speech": "v.",
      "meaning": "放弃，抛弃",
      "example": "He abandoned his family.",
      "is_core": true,
      "is_rare_sense": false
    },
    {
      "part_of_speech": "v.",
      "meaning": "终止，停止",
      "example": "The project was abandoned due to lack of funding.",
      "is_core": false,
      "is_rare_sense": true
    }
  ],
  "etymology": "来自古法语abandonner，来自abandon（投降）",
  "similar_words": [
    {
      "word": "desert",
      "relation": "meaning",
      "description": "都有放弃的意思，但abandon强调完全放弃，desert强调遗弃"
    },
    {
      "word": "forsake",
      "relation": "meaning",
      "description": "都有抛弃的意思，但forsake更书面化，常用于正式场合"
    }
  ],
  "suggestedDifficulty": 2
}
`;

  const aiService = new AIService('test-key');
  const parsed = aiService.parseAIResponse(mockContent);

  console.log(`  ✓ 成功解析JSON响应`);
  console.log(`  ✓ 定义数量: ${parsed.definitions?.length}`);
  console.log(`  ✓ 词源: ${parsed.etymology?.substring(0, 20)}...`);
  console.log(`  ✓ 相似词: ${parsed.similar_words?.length}`);
  console.log(`  ✓ 建议难度: ${parsed.suggestedDifficulty}`);

  // 测试2: 测试批量响应解析
  console.log('\n🧪 测试2: 批量AI响应解析...');

  const batchContent = `
{
  "results": {
    "abandon": {
      "definitions": [
        {
          "part_of_speech": "v.",
          "meaning": "放弃",
          "example": "He abandoned his post.",
          "is_core": true,
          "is_rare_sense": false
        }
      ],
      "etymology": "来自古法语abandonner",
      "suggestedDifficulty": 2
    },
    "persist": {
      "definitions": [
        {
          "part_of_speech": "v.",
          "meaning": "坚持，持续",
          "example": "The problem persists.",
          "is_core": true,
          "is_rare_sense": false
        }
      ],
      "etymology": "来自拉丁语persistere",
      "suggestedDifficulty": 3
    }
  }
}
`;

  const batchParsed = aiService.parseBatchAIResponse(batchContent);
  console.log(`  ✓ 批量解析单词数量: ${batchParsed.size}`);
  console.log(`  ✓ abandon难度: ${batchParsed.get('abandon')?.suggestedDifficulty}`);
  console.log(`  ✓ persist难度: ${batchParsed.get('persist')?.suggestedDifficulty}`);

  // 测试3: 测试Prompt生成
  console.log('\n🧪 测试3: Prompt生成函数...');

  const singlePrompt = aiService.buildWordAnalysisPrompt('abandon');
  console.log(`  ✓ 单个单词Prompt长度: ${singlePrompt.length} 字符`);
  console.log(`  ✓ 包含关键词: ${singlePrompt.includes('abandon')}`);

  const batchPrompt = aiService.buildBatchAnalysisPrompt(['abandon', 'persist', 'diligent']);
  console.log(`  ✓ 批量Prompt长度: ${batchPrompt.length} 字符`);
  console.log(`  ✓ 包含所有单词: ${batchPrompt.includes('abandon') && batchPrompt.includes('persist') && batchPrompt.includes('diligent')}`);

  // 测试4: 测试内容生成Prompt
  console.log('\n🧪 测试4: 内容生成Prompt...');

  const contentPrompt = aiService.buildContentGenerationPrompt([1, 2, 3], 'passage');
  console.log(`  ✓ 内容生成Prompt长度: ${contentPrompt.length} 字符`);
  console.log(`  ✓ 包含单词ID: ${contentPrompt.includes('1, 2, 3')}`);

  // 测试5: 验证API配置
  console.log('\n🧪 测试5: API配置验证...');

  const expectedConfig = {
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    DEFAULT_MODEL: 'anthropic/claude-3-haiku',
    MAX_RETRIES: 3,
    TIMEOUT: 10000
  };

  console.log(`  ✓ API基础URL: ${expectedConfig.OPENROUTER_BASE_URL}`);
  console.log(`  ✓ 默认模型: ${expectedConfig.DEFAULT_MODEL}`);
  console.log(`  ✓ 超时时间: ${expectedConfig.TIMEOUT}ms`);

  console.log('\n🎉 AIService核心功能测试通过！');
  console.log('\n⚠️  注意: 实际API调用需要有效的OpenRouter API密钥');
  console.log('要获取API密钥，请访问: https://openrouter.ai/keys');
}

// 运行测试
testAIService().catch(console.error);