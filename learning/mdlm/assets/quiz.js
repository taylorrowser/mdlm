document.querySelectorAll('[data-quiz-question]').forEach((question) => {
  const answers = question.querySelector('.answers');
  if (question.hasAttribute('data-shuffle') && answers) {
    const buttons = [...answers.children];
    for (let index = buttons.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [buttons[index], buttons[target]] = [buttons[target], buttons[index]];
    }
    buttons.forEach((button) => answers.appendChild(button));
  }
  const feedback = question.querySelector('[data-feedback]');
  question.querySelectorAll('[data-answer]').forEach((button) => {
    button.addEventListener('click', () => {
      if (question.dataset.answered === 'true') return;
      question.dataset.answered = 'true';
      const correct = button.dataset.correct === 'true';
      button.classList.add(correct ? 'correct' : 'wrong');
      question.querySelectorAll('[data-answer]').forEach((candidate) => {
        candidate.disabled = true;
        if (candidate.dataset.correct === 'true') candidate.classList.add('correct');
      });
      feedback.textContent = correct
        ? question.dataset.correctFeedback
        : question.dataset.wrongFeedback;
      updateScore();
    });
  });
});

function updateScore() {
  const questions = [...document.querySelectorAll('[data-quiz-question]')];
  const answered = questions.filter((question) => question.dataset.answered === 'true');
  const correct = questions.filter((question) => question.querySelector('.answer.wrong') === null && question.dataset.answered === 'true');
  const score = document.querySelector('[data-score]');
  if (!score) return;
  score.textContent = answered.length === questions.length
    ? `${correct.length}/${questions.length}. Send this score and the question that felt least certain to your teacher.`
    : `${answered.length}/${questions.length} answered.`;
}
