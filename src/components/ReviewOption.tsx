import React from 'react';
import { View, Text } from 'react-native';
import { makeStyles } from '../utils/useStyles';
import type { RealExamLetter } from '../types';

/**
 * 真题选项前缀剥离：数据里 options 已带 "A) ..." / "A. ..." 前缀，
 * UI 单独渲染字母，需去掉前缀避免重复。无前缀则原样返回。
 */
export function stripLetterPrefix(option: string, letter: RealExamLetter): string {
  const prefix1 = `${letter}) `;
  const prefix2 = `${letter}. `;
  if (option.startsWith(prefix1)) return option.slice(prefix1.length);
  if (option.startsWith(prefix2)) return option.slice(prefix2.length);
  return option;
}

/**
 * 真题"回顾/错题"场景的只读选项行：标注正确项（绿）与用户错选项（红）。
 * 结果页与错题本共用，避免四处重复 renderReviewOption + 样式。
 * 答题屏（可点击）不用此组件。
 */
export default function ReviewOption({
  letter,
  option,
  isCorrect,
  isSelected,
}: {
  letter: RealExamLetter;
  option: string;
  isCorrect: boolean;
  isSelected: boolean;
}) {
  const styles = useStyles();

  let optionStyle = styles.reviewOption;
  let indexStyle = styles.reviewOptionIndex;
  let textStyle = styles.reviewOptionText;
  if (isCorrect) {
    optionStyle = { ...optionStyle, ...styles.reviewOptionCorrect };
    indexStyle = { ...indexStyle, ...styles.reviewOptionIndexCorrect };
    textStyle = { ...textStyle, ...styles.reviewOptionTextCorrect };
  } else if (isSelected) {
    optionStyle = { ...optionStyle, ...styles.reviewOptionIncorrect };
    indexStyle = { ...indexStyle, ...styles.reviewOptionIndexIncorrect };
    textStyle = { ...textStyle, ...styles.reviewOptionTextIncorrect };
  }

  return (
    <View style={optionStyle}>
      <Text style={indexStyle}>{letter}</Text>
      <Text style={textStyle}>{stripLetterPrefix(option, letter)}</Text>
      {isCorrect ? <Text style={styles.checkIcon}>✓</Text> : null}
      {isSelected && !isCorrect ? <Text style={styles.crossIcon}>✗</Text> : null}
    </View>
  );
}

const useStyles = makeStyles(colors => ({
  reviewOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outline,
    marginBottom: 6,
  },
  reviewOptionCorrect: { borderColor: colors.success, backgroundColor: colors.primaryContainer },
  reviewOptionIncorrect: { borderColor: colors.error, backgroundColor: colors.errorContainer },
  reviewOptionIndex: { fontSize: 13, fontWeight: '700', color: colors.tertiary, width: 20, textAlign: 'center' },
  reviewOptionIndexCorrect: { color: colors.success },
  reviewOptionIndexIncorrect: { color: colors.error },
  reviewOptionText: { fontSize: 13, color: colors.onSurface, flex: 1 },
  reviewOptionTextCorrect: { color: colors.success, fontWeight: '500' },
  reviewOptionTextIncorrect: { color: colors.error },
  checkIcon: { fontSize: 16, color: colors.success, fontWeight: '800', marginLeft: 4 },
  crossIcon: { fontSize: 16, color: colors.error, fontWeight: '800', marginLeft: 4 },
}));
