/**
 * Returns a language instruction string to prepend to AI system prompts.
 * Math must always be LaTeX regardless of language.
 */
function getLanguageInstruction(language) {
  switch (language) {
    case 'en':
      return 'You must respond entirely in English. All explanations, step labels, and the final answer label must be in English. Step format: ① Step title (in English). Final answer label: \'Final Answer\'. Math expressions must always use LaTeX with $ $ delimiters regardless of language.';
    case 'ja':
      return 'すべての回答は必ず日本語で行ってください。ステップ形式: ① ステップタイトル（日本語）。最終答えラベル: \'最終答え\'。数式は言語に関わらず必ず $ $ のLaTeX形式を使用してください。';
    case 'zh':
      return '所有回答必须用中文。步骤格式: ① 步骤标题（中文）。最终答案标签: \'最终答案\'。无论使用何种语言，数学表达式必须始终使用 $ $ LaTeX格式。';
    case 'ko':
    default:
      return '모든 답변은 반드시 한국어로 해줘. 수식은 항상 $ $ 또는 $$ $$로 감싸서 LaTeX 형식으로 써야 해.';
  }
}

module.exports = { getLanguageInstruction };
