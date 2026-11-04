import { HELP_TOPICS } from './help';

describe('help: budget alerts', () => {
  const answer = HELP_TOPICS.find((t) => t.question === 'How do budget alerts work?')?.answer;

  it('says alerts repeat per budget period, which starts on the start day', () => {
    // Periods reset on the budget's start day, not the 1st of the month.
    expect(answer).toContain('at most once per budget period');
    expect(answer).toContain('Start day');
    expect(answer).not.toContain('once a month');
  });
});
