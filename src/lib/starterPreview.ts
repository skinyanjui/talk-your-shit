import { Timestamp } from 'firebase/firestore';
import type { Confession, ConfessionTopic, SensitivityLevel } from '../types';
import { classifyPostTopic, deriveTitleFromBody } from './topicClassifier';

export interface StarterPostSeed {
  id: string;
  authorHandle: string;
  isAnonymous: boolean;
  body: string;
  expectedTopic: ConfessionTopic;
  sensitivity: SensitivityLevel;
  score: number;
  upvotes: number;
  downvotes: number;
  minutesAgo: number;
}

/**
 * 28 curated starter posts — 2 for each of the 14 discussion categories.
 * Every post is written to match its category naturally via sentiment/topic
 * classification, and is reused for both cold-start previews and live seeding.
 */
export const STARTER_POST_SEEDS: StarterPostSeed[] = [
  // 1. Unfiltered (2)
  {
    id: 'preview-unfiltered-1',
    authorHandle: 'Anonymous #4A9C',
    isAnonymous: true,
    body: 'Honestly, half of what people call having your life together is just remembering to cancel free trials and returning packages before the 30-day window closes. Nobody actually has a grand five-year blueprint; most of us are just improvising week by week and hoping our calendar looks intentional.',
    expectedTopic: 'Unfiltered',
    sensitivity: 'open',
    score: 38,
    upvotes: 40,
    downvotes: 2,
    minutesAgo: 14,
  },
  {
    id: 'preview-unfiltered-2',
    authorHandle: 'CandidWren-218',
    isAnonymous: false,
    body: 'I stopped forcing myself to finish long hobbies, side projects, and conversations that lost their spark twenty minutes in. Everything got noticeably lighter the week I gave myself permission to put things down without hesitation and spend that energy where it actually counts.',
    expectedTopic: 'Unfiltered',
    sensitivity: 'open',
    score: 29,
    upvotes: 31,
    downvotes: 2,
    minutesAgo: 95,
  },

  // 2. Hot Takes (2)
  {
    id: 'preview-hottakes-1',
    authorHandle: 'QuietFox-492',
    isAnonymous: false,
    body: 'Unpopular opinion: most people keep old social circles alive purely on nostalgia, not actual compatibility. Stop pretending we would choose each other today just because we shared a zip code years ago. Letting some dynamics quietly graduate is healthier for everyone.',
    expectedTopic: 'Hot Takes',
    sensitivity: 'open',
    score: 46,
    upvotes: 52,
    downvotes: 6,
    minutesAgo: 32,
  },
  {
    id: 'preview-hottakes-2',
    authorHandle: 'Anonymous #8D14',
    isAnonymous: true,
    body: "Hot take: open-floor spaces, mandatory icebreakers, and overpriced weekend brunch are all wildly overrated. Let's be honest, nobody wants to admit they would rather have quiet walls, a straightforward lunch, and an extra hour of their own afternoon instead of forced small talk.",
    expectedTopic: 'Hot Takes',
    sensitivity: 'open',
    score: 54,
    upvotes: 59,
    downvotes: 5,
    minutesAgo: 185,
  },

  // 3. Relationships (2)
  {
    id: 'preview-relationships-1',
    authorHandle: 'Anonymous #3C7B',
    isAnonymous: true,
    body: 'The quietest green flag in dating is how someone acts when plans fall apart at the last minute. With my partner now, a missed train turns into a laugh; after my last breakup, I realized every red flag showed up in those small moments long before any big argument.',
    expectedTopic: 'Relationships',
    sensitivity: 'open',
    score: 41,
    upvotes: 43,
    downvotes: 2,
    minutesAgo: 48,
  },
  {
    id: 'preview-relationships-2',
    authorHandle: 'AmberCedar-604',
    isAnonymous: false,
    body: 'My boyfriend and I started doing a ten-minute Sunday check-in where we share one thing that felt great and one tiny annoyance before it festers. It sounded overly structured for a relationship at first, but it eliminated almost every late-week argument we used to have.',
    expectedTopic: 'Relationships',
    sensitivity: 'open',
    score: 33,
    upvotes: 34,
    downvotes: 1,
    minutesAgo: 260,
  },

  // 4. Work & Money (2)
  {
    id: 'preview-work-1',
    authorHandle: 'Anonymous #6E2F',
    isAnonymous: true,
    body: 'I automated 80% of my senior analyst job two years ago and my manager still has no idea. Every Monday morning a workflow pulls our regional metrics, formats the deck, and drafts three bullets of cautious optimism. My salary and performance review have never been higher because I am finally not exhausted.',
    expectedTopic: 'Work & Money',
    sensitivity: 'open',
    score: 62,
    upvotes: 66,
    downvotes: 4,
    minutesAgo: 22,
  },
  {
    id: 'preview-work-2',
    authorHandle: 'SlateFlint-831',
    isAnonymous: false,
    body: 'Living paycheck to paycheck taught me more about budgeting than any course ever could. The biggest shift in my savings came when I stopped stressing over small daily purchases and instead renegotiated my rent, switched insurance, and asked my boss for an overdue raise.',
    expectedTopic: 'Work & Money',
    sensitivity: 'open',
    score: 36,
    upvotes: 38,
    downvotes: 2,
    minutesAgo: 310,
  },

  // 5. Family (2)
  {
    id: 'preview-family-1',
    authorHandle: 'Anonymous #B81E',
    isAnonymous: true,
    body: 'I told my family I missed the flight for the holidays, but I actually cleared security, sat at Gate B14 staring at the boarding line, and went home. Four days of passive-aggressive commentary from my parents and siblings felt impossible this year, so I took a train back and slept twelve hours straight.',
    expectedTopic: 'Family',
    sensitivity: 'sensitive',
    score: 49,
    upvotes: 51,
    downvotes: 2,
    minutesAgo: 74,
  },
  {
    id: 'preview-family-2',
    authorHandle: 'VelvetEcho-145',
    isAnonymous: false,
    body: 'Nobody prepares you for the exact moment you realize your mom and dad are just regular people improvising too. Growing up I thought my parents had every answer mapped out; visiting my mother and father as an adult completely changed how patiently I listen to them.',
    expectedTopic: 'Family',
    sensitivity: 'open',
    score: 44,
    upvotes: 45,
    downvotes: 1,
    minutesAgo: 420,
  },

  // 6. Culture (2)
  {
    id: 'preview-culture-1',
    authorHandle: 'GlassLynx-719',
    isAnonymous: false,
    body: 'Every new movie trailer gives away the entire third act now, and half of pop culture feels engineered for a thirty-second clip instead of a real story. I went to a small independent film last weekend without watching a single preview and forgot how good genuine surprise feels.',
    expectedTopic: 'Culture',
    sensitivity: 'open',
    score: 31,
    upvotes: 33,
    downvotes: 2,
    minutesAgo: 112,
  },
  {
    id: 'preview-culture-2',
    authorHandle: 'Anonymous #91C0',
    isAnonymous: true,
    body: 'Local music and neighborhood dining always feel best right before a spot turns into a viral trend. Once influencers pack every restaurant for the aesthetic, the regulars quietly move three blocks over and start the whole cycle of city culture again.',
    expectedTopic: 'Culture',
    sensitivity: 'open',
    score: 28,
    upvotes: 30,
    downvotes: 2,
    minutesAgo: 510,
  },

  // 7. Tech & Internet (2)
  {
    id: 'preview-tech-1',
    authorHandle: 'Anonymous #2A5D',
    isAnonymous: true,
    body: 'I turned my smartphone screen to grayscale and deleted Instagram and TikTok for thirty days to cut my screen time. The first weekend my thumb kept tapping empty spaces on my phone out of habit, and by week two I realized the algorithm was fueling 90% of my daily restlessness.',
    expectedTopic: 'Tech & Internet',
    sensitivity: 'open',
    score: 52,
    upvotes: 54,
    downvotes: 2,
    minutesAgo: 58,
  },
  {
    id: 'preview-tech-2',
    authorHandle: 'IronCipher-382',
    isAnonymous: false,
    body: 'Everything online feels weirdly loud and strangely empty at the same time. Between nonstop notifications, endless software updates, and social media feeds built for doomscrolling, the calmest part of my day is leaving my laptop shut after dinner.',
    expectedTopic: 'Tech & Internet',
    sensitivity: 'open',
    score: 26,
    upvotes: 27,
    downvotes: 1,
    minutesAgo: 615,
  },

  // 8. Health & Mind (2)
  {
    id: 'preview-health-1',
    authorHandle: 'Anonymous #5F0E',
    isAnonymous: true,
    body: "Going to therapy didn't magically erase my anxiety, it just taught me how to notice when I'm overwhelmed before it turns into a full panic attack. My therapist gave me one simple rule: treat your mental health like physical recovery, not a personal failing.",
    expectedTopic: 'Health & Mind',
    sensitivity: 'open',
    score: 57,
    upvotes: 58,
    downvotes: 1,
    minutesAgo: 88,
  },
  {
    id: 'preview-health-2',
    authorHandle: 'SilentSparrow-550',
    isAnonymous: false,
    body: 'I underestimated how much burnout was disguising itself as laziness. Treating rest as real self care—twenty minutes at the gym, steady sleep, and stepping away when stressed and exhausted—brought my focus back faster than any productivity system.',
    expectedTopic: 'Health & Mind',
    sensitivity: 'open',
    score: 39,
    upvotes: 40,
    downvotes: 1,
    minutesAgo: 720,
  },

  // 9. Night Thoughts (2)
  {
    id: 'preview-night-1',
    authorHandle: 'Anonymous #C4E2',
    isAnonymous: true,
    body: "Why do the most honest realizations always show up at 3am when you can't sleep and you're staring at the ceiling? Something about the silence late at night strips away all the daytime noise and leaves you overthinking every choice from the last five years.",
    expectedTopic: 'Night Thoughts',
    sensitivity: 'open',
    score: 43,
    upvotes: 44,
    downvotes: 1,
    minutesAgo: 140,
  },
  {
    id: 'preview-night-2',
    authorHandle: 'HollowMoth-907',
    isAnonymous: false,
    body: "Lying awake past midnight always makes time feel strangely slippery. It hits me in the middle of the night that we're all getting older faster than we expect, and half the quiet moments we rush past right now are the exact ones we'll miss most.",
    expectedTopic: 'Night Thoughts',
    sensitivity: 'open',
    score: 35,
    upvotes: 36,
    downvotes: 1,
    minutesAgo: 840,
  },

  // 10. Campus & School (2)
  {
    id: 'preview-campus-1',
    authorHandle: 'Anonymous #1D88',
    isAnonymous: true,
    body: 'Nobody talks about how lonely the first semester of college can feel even when your dorm is packed with students. Walking across campus after a three-hour lecture and pretending you have plans before midterms is a rite of passage almost everyone hides.',
    expectedTopic: 'Campus & School',
    sensitivity: 'open',
    score: 37,
    upvotes: 39,
    downvotes: 2,
    minutesAgo: 165,
  },
  {
    id: 'preview-campus-2',
    authorHandle: 'AshRaven-274',
    isAnonymous: false,
    body: 'My professor handed back our final exam with a single margin note saying clear thinking beats memorized formulas every time. After years of obsessing over GPA and tuition in university, that one sentence genuinely changed how I approach learning.',
    expectedTopic: 'Campus & School',
    sensitivity: 'open',
    score: 25,
    upvotes: 26,
    downvotes: 1,
    minutesAgo: 930,
  },

  // 11. Advice (2)
  {
    id: 'preview-advice-1',
    authorHandle: 'Anonymous #E73B',
    isAnonymous: true,
    body: "Need advice: I'm torn between staying in a comfortable neighborhood where everything feels predictable or moving somewhere completely new where I don't know a single soul. What would you do if you felt ready for a reset but nervous about starting over?",
    expectedTopic: 'Advice',
    sensitivity: 'open',
    score: 30,
    upvotes: 31,
    downvotes: 1,
    minutesAgo: 105,
  },
  {
    id: 'preview-advice-2',
    authorHandle: 'BluntJackal-612',
    isAnonymous: false,
    body: "Am I wrong for wanting to skip a pricey destination trip that would eat half my buffer? I care about the people invited, I'm just unsure how to decline gracefully without making it awkward. How do I say no kindly? Any advice or suggestions are welcome.",
    expectedTopic: 'Advice',
    sensitivity: 'open',
    score: 34,
    upvotes: 35,
    downvotes: 1,
    minutesAgo: 1040,
  },

  // 12. Confessions (2)
  {
    id: 'preview-confessions-1',
    authorHandle: 'Anonymous #F20A',
    isAnonymous: true,
    body: 'I have to admit I faked knowing how to play chess for an entire summer just to fit in with a new group. I memorized two openings, nodded seriously whenever someone made a move, and still feel slightly guilty whenever they brag about how strategic I am.',
    expectedTopic: 'Confessions',
    sensitivity: 'open',
    score: 48,
    upvotes: 49,
    downvotes: 1,
    minutesAgo: 128,
  },
  {
    id: 'preview-confessions-2',
    authorHandle: 'Anonymous #4B61',
    isAnonymous: true,
    body: "I lied years ago about why I left an old club and pretended it was a scheduling conflict when the truth is I was just embarrassed I couldn't keep up. I still regret not being honest back then—nobody would have judged me half as harshly as I judged myself.",
    expectedTopic: 'Confessions',
    sensitivity: 'open',
    score: 29,
    upvotes: 30,
    downvotes: 1,
    minutesAgo: 1180,
  },

  // 13. Secrets (2)
  {
    id: 'preview-secrets-1',
    authorHandle: 'Anonymous #A09D',
    isAnonymous: true,
    body: "Nobody knows I keep a separate journal I've never told anyone about where I write letters I never intend to send. I'm taking this to my grave—putting things down in secret and locking the notebook away keeps me far calmer than venting out loud.",
    expectedTopic: 'Secrets',
    sensitivity: 'open',
    score: 45,
    upvotes: 46,
    downvotes: 1,
    minutesAgo: 152,
  },
  {
    id: 'preview-secrets-2',
    authorHandle: 'Anonymous #88C3',
    isAnonymous: true,
    body: "I've been secretly taking weekend pottery classes for eight months and haven't told a single person in my circle. Having one small thing they don't know about—with zero opinions, expectations, or pressure to monetize it—feels weirdly sacred.",
    expectedTopic: 'Secrets',
    sensitivity: 'open',
    score: 51,
    upvotes: 52,
    downvotes: 1,
    minutesAgo: 1320,
  },

  // 14. Off the Record (2)
  {
    id: 'preview-offrecord-1',
    authorHandle: 'Anonymous #7F2A',
    isAnonymous: true,
    body: "Off the record, the best career move I ever made was turning down a title that came with zero extra autonomy. Behind closed doors, half the executive leadership team quietly admits the extra status isn't worth losing every evening and weekend.",
    expectedTopic: 'Off the Record',
    sensitivity: 'open',
    score: 40,
    upvotes: 42,
    downvotes: 2,
    minutesAgo: 66,
  },
  {
    id: 'preview-offrecord-2',
    authorHandle: 'Anonymous #D319',
    isAnonymous: true,
    body: "Between us, the biggest industry secret in consulting is that almost every polished deck starts from the exact same three templates. Unofficially, people aren't paying for magic frameworks—they're paying for an insider voice who can say what their own team cannot say this out loud.",
    expectedTopic: 'Off the Record',
    sensitivity: 'open',
    score: 47,
    upvotes: 49,
    downvotes: 2,
    minutesAgo: 1460,
  },
];

export function normalizeBodyFingerprint(body: string): string {
  return body.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 72);
}

/**
 * Returns only the starter posts that are not already present in the live feed,
 * so seeding is idempotent and never duplicates posts.
 */
export function getMissingStarterPosts(existingConfessions: Confession[]): StarterPostSeed[] {
  const existingFingerprints = new Set(
    existingConfessions.map((c) => normalizeBodyFingerprint(c.body))
  );
  return STARTER_POST_SEEDS.filter(
    (seed) => !existingFingerprints.has(normalizeBodyFingerprint(seed.body))
  );
}

/**
 * Cold-start example posts shown ONLY while the Firestore `confessions`
 * collection has zero documents, so first-time visitors immediately see
 * all 14 categories populated with 2 posts each.
 */
export function getColdStartPreviewConfessions(): Confession[] {
  const now = Date.now();
  return [...STARTER_POST_SEEDS]
    .sort((a, b) => a.minutesAgo - b.minutesAgo)
    .map((sample) => {
      const ts = Timestamp.fromMillis(now - sample.minutesAgo * 60_000);
      return {
        id: sample.id,
        authorUid: 'preview',
        authorHandle: sample.authorHandle,
        isAnonymous: sample.isAnonymous,
        title: deriveTitleFromBody(sample.body),
        body: sample.body,
        topic: classifyPostTopic(sample.body),
        sensitivity: sample.sensitivity,
        isEncrypted: false,
        ciphertext: '',
        encryptionIv: '',
        encryptionSalt: '',
        encryptionHint: '',
        score: sample.score,
        upvotes: sample.upvotes,
        downvotes: sample.downvotes,
        replyCount: 0,
        flagCount: 0,
        status: 'active',
        moderationNote: '',
        createdAt: ts,
        updatedAt: ts,
      };
    });
}
