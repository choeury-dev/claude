// 카테고리와 템플릿. 클라이언트(화면)와 서버(프롬프트)가 같이 쓴다.
// 여행지 목록·명언 문구는 초안이다. README "보완해야 할 자료" 참고.

export const CATEGORIES = [
  { id: 'travel', title: '여행', icon: '✈️', desc: '가고 싶던 여행지에서 찍은 것처럼' },
  { id: 'hyodo', title: '효도', icon: '🎂', desc: '용돈 케이크 받고 활짝 웃는 사진' },
  { id: 'quote', title: '명언', icon: '📜', desc: '좋은 글귀와 함께 멋진 프로필' },
  { id: 'retro', title: '웃긴사진', icon: '📻', desc: '7080 그 시절 사진으로 변신' },
];

// 모든 템플릿에 공통으로 붙는 "얼굴은 그대로" 규칙.
export const IDENTITY_RULES = [
  'Edit the attached photo of a Korean person in their 60s or 70s.',
  'IDENTITY LOCK: this must remain exactly the same person. Keep face shape, eyes, eyelids, eyebrows, nose, lips, ears, hairline, age and skin tone unchanged.',
  'Do not make the person look younger, slimmer or like someone else. Keep natural wrinkles and laugh lines.',
  'Light retouch only: slightly soften blemishes and dark spots, even out skin tone, gentle flattering light, a little brighter eyes.',
  'Keep the original facial expression unless the scene asks for a smile; never change teeth or eye shape.',
  'Photorealistic, single square image, high detail on the face.',
  'Do not add any text, letters, numbers, logos or watermarks.',
].join(' ');

export const TEMPLATES = [
  // ── 여행 ────────────────────────────────────────────
  {
    id: 'travel_jeju_canola', category: 'travel', title: '제주 유채꽃밭',
    scene: 'Place the person standing in a bright yellow canola flower field in Jeju Island in spring, Seongsan Ilchulbong in the soft-focus background, clear blue sky, warm daylight. Waist-up framing, person centered.',
  },
  {
    id: 'travel_gyeongju_autumn', category: 'travel', title: '경주 불국사 단풍',
    scene: 'Place the person in front of a traditional Korean temple courtyard in Gyeongju in late autumn, red and orange maple leaves, golden afternoon light. Waist-up framing.',
  },
  {
    id: 'travel_zhangjiajie', category: 'travel', title: '중국 장가계',
    scene: 'Place the person on a scenic viewing deck at Zhangjiajie, China, with tall misty sandstone pillar mountains behind, soft morning haze. Waist-up framing, wearing light outdoor travel clothes.',
  },
  {
    id: 'travel_danang', category: 'travel', title: '베트남 다낭',
    scene: 'Place the person on a sunny tropical beach resort in Da Nang, Vietnam, turquoise sea and palm trees behind, bright summer light, relaxed vacation outfit. Waist-up framing.',
  },
  {
    id: 'travel_swiss', category: 'travel', title: '스위스 알프스',
    scene: 'Place the person on a mountain trail in the Swiss Alps with snowy peaks and green meadows behind, crisp clear day. Waist-up framing, outdoor jacket.',
  },

  // ── 효도 ────────────────────────────────────────────
  {
    id: 'hyodo_money_cake', category: 'hyodo', title: '용돈 케이크',
    scene: 'The person is joyfully holding a white cream birthday cake with a long string of rolled paper money being pulled out of the top of the cake, a popular Korean "allowance cake" surprise. Big happy surprised smile, warm living-room home party with balloons. Money must be stylized pastel paper notes with no legible design, not an exact replica of any real banknote.',
  },
  {
    id: 'hyodo_birthday_table', category: 'hyodo', title: '생신상 꽃다발',
    scene: 'The person sits at a festive Korean birthday table with traditional dishes, a large bouquet of flowers in their arms, warm cozy restaurant lighting, happy smile.',
  },
  {
    id: 'hyodo_carnation', category: 'hyodo', title: '카네이션 감사',
    scene: 'The person wears a red carnation corsage on the chest and holds a small bouquet of red carnations, soft pastel background with gentle bokeh, warm Parents\' Day mood, gentle smile.',
  },

  // ── 명언 (글귀는 화면에서 직접 그린다: AI가 한글을 정확히 못 쓰는 경우가 많음) ──
  {
    id: 'quote_autumn_hanok', category: 'quote', title: '가을 한옥',
    scene: 'The person sits on a wooden bench under a traditional Korean hanok eave with vivid autumn maple leaves and yellow chrysanthemums, golden sunlight, elegant warm scarf.',
    layout: 'left',
    overlay: {
      title: '살아보니\n알겠더라',
      accent: '#c0392b',
      lines: [
        '서두르지 않아도\n꽃은 제때 피더라',
        '내 편 한 사람이\n큰 힘이 되더라',
        '오늘 웃는 사람이\n결국 이기더라',
        '건강이\n가장 큰 재산이더라',
      ],
    },
  },
  {
    id: 'quote_spring_blossom', category: 'quote', title: '봄 벚꽃길',
    scene: 'The person stands on a cherry blossom lined road in full bloom, pink petals in the air, soft spring light, light cardigan.',
    layout: 'left',
    overlay: {
      title: '오늘도\n좋은 날',
      accent: '#d6336c',
      lines: [
        '좋은 사람과\n밥 한 끼면 충분해요',
        '걱정은 반으로\n웃음은 두 배로',
        '천천히 가도\n괜찮아요',
      ],
    },
  },
  {
    id: 'quote_sea_sunrise', category: 'quote', title: '바다 일출',
    scene: 'The person stands on a calm seaside promenade at sunrise, golden sun rising over the sea, warm hopeful light, neat outfit.',
    layout: 'left',
    overlay: {
      title: '건강하고\n행복하세요',
      accent: '#e67700',
      lines: [
        '아침 햇살처럼\n늘 따뜻하시길',
        '가족 모두\n평안하시길',
        '웃을 일만\n가득하시길',
      ],
    },
  },

  // ── 웃긴사진 (7080) ─────────────────────────────────
  {
    id: 'retro_school_70s', category: 'retro', title: '70년대 졸업사진',
    scene: 'Recreate as a 1970s Korean high school graduation photo: black-and-white film, the same person (same age, unchanged face) wearing a vintage black school uniform with a stiff collar and school cap, holding a rolled diploma, slightly faded paper texture, funny proud serious pose.',
    retro: true,
  },
  {
    id: 'retro_disco_80s', category: 'retro', title: '80년대 디스코장',
    scene: 'Recreate as a 1980s Korean disco nightclub snapshot: the same person (same age, unchanged face) in a shiny colorful 80s outfit with big shoulder pads, mirror ball and neon lights, playful dance pose, warm color film grain and slight flash look.',
    retro: true,
  },
  {
    id: 'retro_dabang', category: 'retro', title: '옛날 다방 DJ',
    scene: 'Recreate as a 1970s Korean tea-room (dabang) photo: the same person (same age, unchanged face) as the music DJ in a glass booth with LP records and a big microphone, retro wallpaper, faded warm film colors, cheerful expression.',
    retro: true,
  },
  {
    id: 'retro_stage_80s', category: 'retro', title: '80년대 가요무대',
    scene: 'Recreate as a 1980s Korean TV music show stage photo: the same person (same age, unchanged face) singing into a handheld microphone in a sparkly stage costume, colorful stage lights, slightly washed-out broadcast film look.',
    retro: true,
  },
];

export function templatesOf(categoryId) {
  return TEMPLATES.filter((t) => t.category === categoryId);
}

export function findTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || null;
}

/** 서버가 이미지 모델에 보낼 프롬프트 */
export function buildPrompt(template) {
  if (!template) throw new Error('unknown template');
  const parts = [IDENTITY_RULES, 'Scene: ' + template.scene];
  if (template.layout === 'left') {
    parts.push('Composition: place the person on the left half of the frame. Keep the right 45% of the image calm, softly blurred and uncluttered, because text will be added there later.');
  }
  if (template.retro) {
    parts.push('The photographic style and clothing may change, but the face must stay recognisably identical to the input.');
  }
  return parts.join('\n');
}
