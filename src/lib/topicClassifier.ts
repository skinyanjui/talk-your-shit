import { type ConfessionTopic, VALIDATION_LIMITS } from '../types';

interface TopicRule {
  topic: ConfessionTopic;
  /** High-signal multi-word phrases and sentiment expressions */
  phrases: string[];
  /** Individual topic/sentiment stems and keywords */
  keywords: string[];
}

const TOPIC_RULES: TopicRule[] = [
  {
    topic: 'Advice',
    phrases: [
      'should i',
      'what should i do',
      'need advice',
      'any advice',
      'what would you do',
      'how do i',
      'am i wrong',
      'am i overreacting',
      'help me decide',
      'torn between',
      'is it weird if',
      'would you stay',
      'would you leave',
      'please advise',
      'open to advice',
    ],
    keywords: [
      'advice',
      'recommend',
      'suggestion',
      'suggestions',
      'opinions',
      'unsure',
      'dilemma',
      'decide',
      'deciding',
      'aita',
    ],
  },
  {
    topic: 'Hot Takes',
    phrases: [
      'unpopular opinion',
      'hot take',
      'nobody wants to admit',
      'no one wants to admit',
      'everyone pretends',
      'stop pretending',
      'harsh truth',
      'hard pill to swallow',
      'most people',
      'is a scam',
      'we need to talk about',
      'let us be honest',
      "let's be honest",
      'change my mind',
    ],
    keywords: [
      'overrated',
      'underrated',
      'normalize',
      'unpopular',
      'hypocrisy',
      'hypocrites',
      'nostalgia',
      'scam',
    ],
  },
  {
    topic: 'Secrets',
    phrases: [
      'nobody knows',
      'no one knows',
      'never told anyone',
      'never told a soul',
      "haven't told",
      'have not told',
      'to my grave',
      'behind their back',
      'behind his back',
      'behind her back',
      "they don't know",
      'double life',
      'keep it to myself',
      'keeping this secret',
    ],
    keywords: [
      'secret',
      'secrets',
      'secretly',
      'hiding',
      'hidden',
      'burner',
      'concealed',
      'undercover',
    ],
  },
  {
    topic: 'Confessions',
    phrases: [
      'i confess',
      'i have to admit',
      'i admit',
      'never admitted',
      'i lied',
      'i faked',
      'i pretended',
      'i feel guilty',
      'feel so guilty',
      'my fault',
      'i messed up',
      'i screwed up',
      'truth is i',
      'i stole',
    ],
    keywords: [
      'confess',
      'confession',
      'guilty',
      'guilt',
      'ashamed',
      'shame',
      'regret',
      'regretting',
      'lied',
      'lying',
      'faked',
    ],
  },
  {
    topic: 'Off the Record',
    phrases: [
      'off the record',
      'behind closed doors',
      'industry secret',
      'if they found out',
      'if my company found out',
      'signed an nda',
      'under nda',
      'cannot say this out loud',
      "can't say this out loud",
      'between us',
      'real reason',
      'quietly',
    ],
    keywords: [
      'nda',
      'insider',
      'whistleblower',
      'unofficially',
      'confidential',
      'throwaway',
      'backroom',
      'executive',
    ],
  },
  {
    topic: 'Work & Money',
    phrases: [
      'my boss',
      'my manager',
      'at work',
      'my job',
      'new job',
      'quit my job',
      'job market',
      'career move',
      'performance review',
      'turned down a promotion',
      'paycheck to paycheck',
      'credit card',
      'student loans',
      'cost of living',
      'side hustle',
    ],
    keywords: [
      'boss',
      'manager',
      'coworker',
      'coworkers',
      'colleague',
      'salary',
      'paycheck',
      'raise',
      'promotion',
      'career',
      'office',
      'corporate',
      'company',
      'layoff',
      'layoffs',
      'fired',
      'hired',
      'interview',
      'resume',
      'freelance',
      'client',
      'startup',
      'slack',
      'rent',
      'mortgage',
      'debt',
      'savings',
      'budget',
      'bills',
      'money',
      'broke',
      'income',
      'taxes',
      'investing',
      'analyst',
    ],
  },
  {
    topic: 'Relationships',
    phrases: [
      'my partner',
      'my boyfriend',
      'my girlfriend',
      'my husband',
      'my wife',
      'my ex',
      'best friend',
      'friend group',
      'first date',
      'fell in love',
      'out of love',
      'long distance',
      'red flag',
      'red flags',
      'broke up',
      'break up',
    ],
    keywords: [
      'dating',
      'relationship',
      'relationships',
      'boyfriend',
      'girlfriend',
      'husband',
      'wife',
      'spouse',
      'fiance',
      'marriage',
      'married',
      'divorce',
      'crush',
      'breakup',
      'cheated',
      'cheating',
      'ghosted',
      'situationship',
      'romance',
      'romantic',
      'anniversary',
      'wedding',
      'tinder',
      'hinge',
      'friendship',
      'friendships',
      'jealous',
    ],
  },
  {
    topic: 'Family',
    phrases: [
      'my mom',
      'my dad',
      'my mother',
      'my father',
      'my parents',
      'my family',
      'my sister',
      'my brother',
      'in-laws',
      'in laws',
      'growing up',
      'my kids',
      'my children',
      'family dinner',
      'for the holidays',
    ],
    keywords: [
      'family',
      'mom',
      'mother',
      'dad',
      'father',
      'parents',
      'parenting',
      'sibling',
      'siblings',
      'sister',
      'brother',
      'grandma',
      'grandpa',
      'grandparents',
      'aunt',
      'uncle',
      'cousin',
      'childhood',
      'thanksgiving',
      'holidays',
      'son',
      'daughter',
    ],
  },
  {
    topic: 'Health & Mind',
    phrases: [
      'mental health',
      'panic attack',
      'burned out',
      'burnt out',
      'burn out',
      'going to therapy',
      'my therapist',
      'feeling depressed',
      'so anxious',
      'chest tightened',
      'self care',
      'taking meds',
      'losing weight',
      'chronic pain',
    ],
    keywords: [
      'therapy',
      'therapist',
      'anxiety',
      'anxious',
      'depression',
      'depressed',
      'burnout',
      'stress',
      'stressed',
      'overwhelmed',
      'medication',
      'adhd',
      'trauma',
      'healing',
      'grief',
      'lonely',
      'loneliness',
      'exhausted',
      'doctor',
      'hospital',
      'health',
      'workout',
      'gym',
      'sobriety',
      'sober',
    ],
  },
  {
    topic: 'Night Thoughts',
    phrases: [
      'late at night',
      "can't sleep",
      'cant sleep',
      'cannot sleep',
      'lying awake',
      'wide awake',
      'staring at the ceiling',
      'at 3am',
      'at 2am',
      'in the middle of the night',
      'getting older',
      'meaning of life',
      'quiet night',
      'keeps me up',
    ],
    keywords: [
      '3am',
      '2am',
      'midnight',
      'insomnia',
      'overthinking',
      'existential',
      'sleepless',
      'silence',
      'alone',
      'wondering',
      'mortality',
      'dreams',
      'nightmare',
      'quiet',
    ],
  },
  {
    topic: 'Campus & School',
    phrases: [
      'grad school',
      'high school',
      'my professor',
      'final exam',
      'student debt',
      'my roommate',
      'college life',
      'drop out',
      'dropped out',
    ],
    keywords: [
      'college',
      'university',
      'campus',
      'dorm',
      'professor',
      'lecture',
      'semester',
      'exam',
      'exams',
      'finals',
      'midterm',
      'thesis',
      'dissertation',
      'homework',
      'assignment',
      'tuition',
      'degree',
      'major',
      'gpa',
      'student',
      'students',
      'school',
      'classroom',
      'teacher',
    ],
  },
  {
    topic: 'Tech & Internet',
    phrases: [
      'social media',
      'screen time',
      'the algorithm',
      'on my phone',
      'deleted instagram',
      'deleted tiktok',
      'artificial intelligence',
      'group chat',
      'online dating',
    ],
    keywords: [
      'app',
      'apps',
      'algorithm',
      'instagram',
      'tiktok',
      'twitter',
      'reddit',
      'youtube',
      'phone',
      'smartphone',
      'internet',
      'online',
      'doomscroll',
      'doomscrolling',
      'software',
      'coding',
      'developer',
      'script',
      'automated',
      'automation',
      'laptop',
      'tech',
      'ai',
      'crypto',
      'gaming',
      'notifications',
    ],
  },
  {
    topic: 'Culture',
    phrases: [
      'pop culture',
      'modern dating',
      'this generation',
      'in this city',
      'everyone online',
      'new movie',
      'tv show',
    ],
    keywords: [
      'culture',
      'movie',
      'movies',
      'film',
      'music',
      'album',
      'concert',
      'book',
      'books',
      'celebrity',
      'influencer',
      'influencers',
      'trend',
      'trends',
      'fashion',
      'art',
      'media',
      'society',
      'generation',
      'millennial',
      'millennials',
      'city',
      'restaurant',
      'travel',
      'sports',
      'podcast',
    ],
  },
];

function scorePostTopics(rawBody: string): Map<ConfessionTopic, number> {
  const scores = new Map<ConfessionTopic, number>();
  const normalized = rawBody.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return scores;

  const tokens = new Set(normalized.match(/[a-z0-9']+/g) ?? []);

  for (const rule of TOPIC_RULES) {
    let score = 0;

    for (const phrase of rule.phrases) {
      if (normalized.includes(phrase)) {
        score += 3;
      }
    }

    for (const keyword of rule.keywords) {
      if (tokens.has(keyword)) {
        score += 1.5;
      }
    }

    // Sentiment boost for Advice when asking direct questions
    if (rule.topic === 'Advice' && normalized.includes('?') && score > 0) {
      score += 1.5;
    }

    if (score > 0) {
      scores.set(rule.topic, score);
    }
  }

  return scores;
}

/**
 * Automatically infers the best-fitting discussion category from the post's
 * sentiment, phrasing, and subject cues. Falls back cleanly to 'Unfiltered'.
 */
export function classifyPostTopic(rawBody: string): ConfessionTopic {
  const scores = scorePostTopics(rawBody);
  let bestTopic: ConfessionTopic = 'Unfiltered';
  let bestScore = 0;

  for (const [topic, score] of scores.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }

  return bestScore >= 1.5 ? bestTopic : 'Unfiltered';
}

/**
 * Checks whether a post's sentiment and content fit a given category tab,
 * allowing multi-theme posts to surface naturally under relevant categories.
 */
export function matchesPostCategory(
  rawBody: string,
  targetTopic: ConfessionTopic,
  storedTopic?: ConfessionTopic
): boolean {
  const primary = classifyPostTopic(rawBody);
  if (primary === targetTopic) return true;

  const scores = scorePostTopics(rawBody);
  if (targetTopic !== 'Unfiltered' && (scores.get(targetTopic) ?? 0) >= 3) {
    return true;
  }

  // Fallback to stored topic when no stronger sentiment signal overrides it
  return primary === 'Unfiltered' && storedTopic === targetTopic;
}

/**
 * Derives a compact internal title snippet from the post body so Firestore
 * validation, bookmarks, and moderation logs always have a clean summary
 * without asking the author to write a separate headline.
 */
export function deriveTitleFromBody(rawBody: string): string {
  const cleaned = rawBody
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0] ?? rawBody.trim();

  const collapsed = cleaned.replace(/\s+/g, ' ').trim();
  const maxLen = Math.min(120, VALIDATION_LIMITS.titleMax);

  if (collapsed.length <= maxLen) {
    return collapsed.length >= VALIDATION_LIMITS.titleMin ? collapsed : 'Untitled post';
  }

  const sliced = collapsed.slice(0, maxLen - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const trimmed = lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced;
  return `${trimmed.replace(/[,;:\-\s]+$/, '')}…`;
}
