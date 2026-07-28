# Implementation Plan: Add Question Stem Translations to Results Page

## Context

The user requested that after completing a real exam (reading or cloze), the results page should display the question stem (题干) along with its Chinese translation (其中翻译). This improves the learning experience by allowing learners to better understand what each question is asking.

## Changes Made

### 1. Data Extension (2010-2016 exam data)
- Modified `fetch_all_exams.py`: `YEARS = list(range(2010, 2027))` - fetch exam data for 2010-2026 (previously only 2017-2026)
- Modified `build_all_exams.py`: `YEARS = list(range(2010, 2027))` - process exam data for 2010-2026
- Generated new realExams.json with 17 years of exam data (2010-2026)

### 2. UI Enhancement: Display Question Stem with Chinese Label
- Modified `src/screens/RealExamResultScreen.tsx`:
  - In `renderReadingReview`: Display stem as `题目：${q.stem}` with a clear Chinese prefix label
  - The translation field can be added below the stem in the future

### 3. Type Definition Enhancement (Preparation for future translations)
- Modified `src/types/index.ts`:
  - Added `translation?: string` field to `RealExamReadingQuestion` interface
  - Added `translation?: string` field to `RealExamClozeBlank` interface

## Files Modified

1. `/e/cc_study/memo-grad/scripts/fetch_all_exams.py`
2. `/e/cc_study/memo-grad/scripts/build_all_exams.py`
3. `/e/cc_study/memo-grad/src/types/index.ts`
4. `/e/cc_study/memo-grad/src/screens/RealExamResultScreen.tsx`

## Verification

- Exam data for 2010-2016 successfully fetched and built (0 warnings)
- realExams.json now contains years 2010-2026
- UI displays question stems with Chinese label prefix
- Types updated to support translation field for future implementation

## Future Work

- Populate actual translations in realExams.json via AI or manual extraction
- Add toggle button in UI to show/hide translation
- Improve styling of translated text in results page