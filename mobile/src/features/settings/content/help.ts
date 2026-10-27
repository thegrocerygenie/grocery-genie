export interface HelpTopic {
  question: string;
  answer: string;
}

/**
 * Settings → Help & feedback. Each answer describes what the app does today;
 * update it when the behavior changes.
 */
export const HELP_TOPICS: HelpTopic[] = [
  {
    question: 'How do I get the best scan?',
    answer:
      'Lay the receipt flat in good light, fill the frame and hold steady. If the photo looks blurry or too dark, the camera tells you before you take it, and you can always retake.',
  },
  {
    question: 'Can I scan without a connection?',
    answer:
      'Yes. A receipt you scan or import while offline is saved on your phone and uploads automatically when the connection is back. You can see it under Pending in History.',
  },
  {
    question: 'How do budget alerts work?',
    answer:
      'You can get an alert at 50%, 80% and 100% of your monthly budget. Each one is sent at most once a month. Turn them on or off in Settings → Notifications.',
  },
  {
    question: 'Can I fix a wrong category?',
    answer:
      'Yes. When you review a receipt, tap the dot next to an item and pick the right category. The change applies to that item on past and future receipts.',
  },
  {
    question: 'Can I change a receipt after saving it?',
    answer: 'Yes. Open it from History and tap Edit.',
  },
  {
    question: 'Which languages can receipts be in?',
    answer:
      'English, French, Spanish, German, Serbian and Mandarin. Choose yours in Settings → Language.',
  },
  {
    question: 'I deleted a receipt by mistake.',
    answer:
      'Deleted receipts stay in Settings → Recently deleted for 30 days. Open it there and tap Restore.',
  },
];
