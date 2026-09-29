// Claims below are curated from the linked official Build & Runs product pages.
// Review this catalog when product pages change so generated posts stay factual.
export const catalog = [
  {
    id: 'findmeoutfit', name: 'Find Me Outfit', category: 'Style AI', platform: 'iPhone',
    url: 'https://buildandruns.com/findmeoutfit/',
    icon: 'https://buildandruns.com/assets/home-icons/findmeoutfit.webp',
    color: '#d9d2ff',
    features: [
      'Photo Extraction separates visible clothing in an outfit photo into individual wardrobe pieces.',
      'Live Try On previews a saved supported piece on camera in a 30-second session.',
      'AI Lookbook combines 2 to 5 wardrobe pieces and an occasion into three styled looks.',
      'Shop Similar finds related products with merchant links and available price information.',
      'Price Watch can notify users when tracked product prices change.'
    ]
  },
  {
    id: 'talescrafter', name: 'TalesCrafter', category: 'Stories', platform: 'iPhone & iPad',
    url: 'https://buildandruns.com/talescrafter/',
    icon: 'https://buildandruns.com/assets/home-icons/talescrafter.webp',
    color: '#ffd8ad',
    features: [
      'Children can choose a hero name, place, and moral to shape a personalized story.',
      'Stories can be created in 28 languages.',
      'The app offers multiple narration voices and a Read Story feature.',
      'Favorite stories can be saved in a personal library and revisited later.',
      'The story experience is designed to be age-appropriate and child-safe.'
    ]
  },
  {
    id: 'astrofuture', name: 'AstroFuture', category: 'Astrology', platform: 'Android',
    url: 'https://buildandruns.com/astrofuture/',
    icon: 'https://buildandruns.com/assets/home-icons/astrofuture.webp',
    color: '#d2d8ff',
    features: [
      'Users can create a birth chart from their birth details.',
      'Daily sky insights summarize the day’s planetary rhythm.',
      'Relationship compatibility compares two charts in a guided flow.',
      'AI guidance answers focused questions with personalized interpretations.',
      'The app offers token packages and consultation packages for deeper questions.'
    ]
  },
  {
    id: 'heptapod', name: 'Heptapod', category: 'Speech tools', platform: 'Mac',
    url: 'https://buildandruns.com/heptapod/',
    icon: 'https://buildandruns.com/assets/home-icons/heptapod.webp',
    color: '#bdece2',
    features: [
      'Live Translate can translate speech from videos, calls, courses, and streams on a Mac.',
      'On-device Transcribe creates local transcripts after a speech model is downloaded.',
      'Users can save translated session audio for later use.',
      'Heptapod works with audio from a browser tab or other source playing on the Mac.',
      'Live translation uses cloud minutes only during an active live speech session.'
    ]
  },
  {
    id: 'findskincare', name: 'FindSkinCare', category: 'Skin care', platform: 'iPhone',
    url: 'https://buildandruns.com/findskincare/',
    icon: 'https://buildandruns.com/findskincare/assets/fsc.webp',
    color: '#f5d5d9',
    features: [
      'A clear front photo gives an overview of visible cosmetic skin signals such as texture and redness.',
      'Morning and evening routine guidance keeps everyday care simple.',
      'Guided AI Scan in Pro captures four face angles: front, left, right, and up.',
      'Focus Area in Pro lets a user mark one part of a photo for more focused cosmetic guidance.',
      'Users can explore and save product matches in the context of their visible skin analysis.'
    ],
    guardrail: 'Cosmetic guidance only. Never claim diagnosis, treatment, medical accuracy, or guaranteed results.'
  },
  {
    id: 'thokka', name: 'Thokka', category: 'Tactile audio', platform: 'Mac',
    url: 'https://buildandruns.com/thokka/',
    icon: 'https://buildandruns.com/assets/home-icons/thokka.webp',
    color: '#e9d0a9',
    features: [
      'Thokka offers 17 curated mechanical keyboard switch sound profiles.',
      'Prepared 48 kHz sounds play on physical key press and optionally release.',
      'Its sound engine prepares samples in memory before the user types.',
      'The app has no cloud account, analytics, tracking, or ads.',
      'An optional local AI model can turn a text prompt into a reusable press-and-release sound bank.'
    ],
    guardrail: 'Do not claim that live keystroke processing uses AI or sends typed text to the cloud.'
  }
];

export function getApp(id) {
  return catalog.find((app) => app.id === id);
}
