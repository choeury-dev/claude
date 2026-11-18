// 모아툰 작업실에서 쓰는 목록(감정, 동작, 말풍선, 배경, 레이아웃, 크기, 그림체, 폰트).
// UI와 스크립트 해석이 같은 목록을 쓴다.

export const EMOTIONS = [
  { id: 'neutral', label: '기본', words: ['기본', '보통', '평소'] },
  { id: 'happy', label: '기쁨', words: ['기쁨', '기뻐', '웃음', '웃으며', '행복', '신남', '신나서', '밝게'] },
  { id: 'sad', label: '슬픔', words: ['슬픔', '슬퍼', '울먹', '우는', '눈물', '시무룩'] },
  { id: 'angry', label: '화남', words: ['화남', '화나', '화가', '분노', '버럭', '발끈'] },
  { id: 'surprised', label: '놀람', words: ['놀람', '놀라', '깜짝', '헉'] },
  { id: 'embarrassed', label: '당황', words: ['당황', '민망', '머쓱', '진땀'] },
  { id: 'love', label: '설렘', words: ['설렘', '설레', '두근', '반함', '하트'] },
  { id: 'tired', label: '피곤', words: ['피곤', '지침', '졸림', '졸려', '녹초'] },
  { id: 'annoyed', label: '짜증', words: ['짜증', '귀찮', '못마땅', '심드렁'] },
  { id: 'blank', label: '무표정', words: ['무표정', '멍', '무심', '덤덤'] },
];

export const ACTIONS = [
  { id: 'stand', label: '서 있기', words: ['서 있', '선다', '서서'] },
  { id: 'wave', label: '손 흔들기', words: ['손을 흔', '손 흔', '인사', '반갑게'] },
  { id: 'point', label: '가리키기', words: ['가리', '손가락'] },
  { id: 'run', label: '달리기', words: ['달려', '달린', '뛰어', '뛴다', '달리기', '헐레벌떡'] },
  { id: 'sit', label: '앉기', words: ['앉', '착석'] },
  { id: 'jump', label: '점프', words: ['점프', '뛰어오', '폴짝', '펄쩍'] },
  { id: 'arms', label: '팔짱', words: ['팔짱'] },
  { id: 'cheer', label: '만세', words: ['만세', '두 팔을 들', '양팔을 들', '환호'] },
  { id: 'scratch', label: '머리 긁기', words: ['머리를 긁', '머리 긁', '긁적'] },
  { id: 'phone', label: '전화', words: ['전화', '통화', '휴대폰을 귀'] },
];

export const BUBBLES = [
  { id: 'speech', label: '대화', role: 'dialogue' },
  { id: 'thought', label: '생각', role: 'monologue' },
  { id: 'shout', label: '외침', role: 'dialogue' },
  { id: 'whisper', label: '속삭임', role: 'dialogue' },
  { id: 'narration', label: '내레이션', role: 'monologue' },
];

export const FONT_ROLES = [
  { id: 'title', label: '제목' },
  { id: 'dialogue', label: '대화' },
  { id: 'monologue', label: '독백' },
];

// Google Fonts 에 있는 한글 글꼴만 넣는다 (index.html 에서 한 번에 불러옴).
export const FONTS = [
  'Black Han Sans', 'Do Hyeon', 'Jua', 'Gowun Dodum', 'Noto Sans KR',
  'Nanum Gothic', 'Nanum Pen Script', 'Gaegu', 'Hi Melody', 'Gamja Flower', 'Poor Story',
];

export const BACKGROUNDS = [
  { id: 'none', label: '배경 없음', words: [] },
  { id: 'cafe', label: '카페', words: ['카페', '커피숍', '까페'] },
  { id: 'room', label: '방·집', words: ['방', '집', '거실', '침실', '부엌'] },
  { id: 'classroom', label: '교실', words: ['교실', '학교', '강의실'] },
  { id: 'office', label: '사무실', words: ['사무실', '회사', '회의실', '책상'] },
  { id: 'street', label: '거리', words: ['거리', '길', '골목', '횡단보도', '건물 앞'] },
  { id: 'park', label: '공원', words: ['공원', '산책', '나무', '벤치'] },
  { id: 'beach', label: '바다', words: ['바다', '해변', '바닷가'] },
  { id: 'bus', label: '지하철·버스', words: ['지하철', '버스', '전철', '정류장'] },
  { id: 'store', label: '편의점·가게', words: ['편의점', '가게', '마트', '식당'] },
];

export const NIGHT_WORDS = ['밤', '새벽', '저녁', '야근'];

// rows: 각 줄의 칸 비율. 예) [[1],[1,1]] = 위 1칸, 아래 2칸
export const LAYOUTS = [
  { id: 'auto', label: '장면 수에 맞춤', rows: null },
  { id: 'v3', label: '세로 3컷', rows: [[1], [1], [1]] },
  { id: 'v4', label: '세로 4컷', rows: [[1], [1], [1], [1]] },
  { id: 'g4', label: '2×2 (4컷)', rows: [[1, 1], [1, 1]] },
  { id: 'm5', label: '1-2-2 (5컷)', rows: [[1], [1, 1], [1, 1]] },
  { id: 'g6', label: '2×3 (6컷)', rows: [[1, 1], [1, 1], [1, 1]] },
  { id: 'g9', label: '3×3 (9컷)', rows: [[1, 1, 1], [1, 1, 1], [1, 1, 1]] },
];

export const SIZES = [
  { id: 'insta45', label: '인스타 피드 4:5', w: 1080, h: 1350 },
  { id: 'square', label: '정사각 1:1', w: 1080, h: 1080 },
  { id: 'story', label: '스토리 9:16', w: 1080, h: 1920 },
  { id: 'custom', label: '직접 입력', w: 1200, h: 1600 },
];

export const STYLES = [
  { id: 'sd', label: '2등신 SD', note: '큰 머리, 짧은 몸' },
  { id: 'stick', label: '심플 선화', note: '막대 인형처럼 가볍게' },
  { id: 'bean', label: '동글 콩', note: '몸통에 얼굴이 있는 콩 캐릭터' },
];

export const CHARACTER_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#e64980', '#5c940d'];

export const MONOLOGUE_WORDS = ['속마음', '독백', '생각', '속으로', '혼잣말'];
export const SHOUT_WORDS = ['외침', '소리', '고함', '버럭', '크게'];
export const WHISPER_WORDS = ['속삭', '작게', '소곤'];

// 질감 표현: 그림(배경·인물·업로드 이미지)에 SVG 필터로 입힌다. 글자에는 입히지 않는다.
export const TEXTURES = [
  { id: 'clean', label: '깔끔', note: '질감 없이 매끈하게' },
  { id: 'pen', label: '펜', note: '살짝 떨리는 잉크 선' },
  { id: 'pencil', label: '연필', note: '흑연 결이 보이는 선과 면' },
  { id: 'crayon', label: '크레용', note: '거칠고 빈틈 있는 왁스 질감' },
  { id: 'watercolor', label: '수채화', note: '번지는 가장자리와 종이 결' },
  { id: 'marker', label: '마커', note: '진하고 살짝 번진 색' },
];

export const PAGE_KINDS = [
  { id: 'cover', label: '표지' },
  { id: 'content', label: '내용' },
  { id: 'ending', label: '마지막(요약)' },
];

// 3×3 위치. 워터마크와 페이지 번호를 모든 페이지 같은 자리에 고정한다.
export const ANCHORS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
export const ANCHOR_LABEL = { tl: '왼쪽 위', tc: '가운데 위', tr: '오른쪽 위', ml: '왼쪽 가운데', mc: '가운데', mr: '오른쪽 가운데', bl: '왼쪽 아래', bc: '가운데 아래', br: '오른쪽 아래' };

export const PAGE_NUMBER_FORMATS = [
  { id: 'n/total', label: '1 / 5' },
  { id: 'n', label: '1' },
  { id: '0n', label: '01' },
  { id: 'dash', label: '- 1 -' },
];

// 기본 레이아웃(지울 수 없음). 좌표는 페이지 크기에 대한 비율(0~1).
export const BUILTIN_TEMPLATES = [
  {
    id: 'builtin-cover', name: '기본 표지', kind: 'cover', builtin: true,
    panels: [{ x: 0.07, y: 0.07, w: 0.86, h: 0.55 }],
    texts: [
      { slot: 'episode', role: 'dialogue', align: 'center', x: 0.3, y: 0.655, w: 0.4, h: 0.05, sizeScale: 0.9 },
      { slot: 'title', role: 'title', align: 'center', x: 0.07, y: 0.71, w: 0.86, h: 0.13, sizeScale: 1.3 },
      { slot: 'subtitle', role: 'monologue', align: 'center', x: 0.07, y: 0.85, w: 0.86, h: 0.08, sizeScale: 1.1 },
    ],
  },
  { id: 'auto', name: '설정한 컷 레이아웃 따르기', kind: 'content', builtin: true, panels: null, texts: [] },
  {
    id: 'builtin-ending', name: '기본 마지막(요약)', kind: 'ending', builtin: true,
    panels: [{ x: 0.07, y: 0.68, w: 0.86, h: 0.25 }],
    texts: [
      { slot: 'heading', role: 'title', align: 'center', x: 0.07, y: 0.06, w: 0.86, h: 0.09, sizeScale: 0.85 },
      { slot: 'summary', role: 'dialogue', align: 'left', box: true, x: 0.07, y: 0.17, w: 0.86, h: 0.47, sizeScale: 1 },
    ],
  },
];

export function defaultSettings() {
  return {
    sizeId: 'insta45', width: 1080, height: 1350,
    layout: 'auto', style: 'sd', texture: 'clean',
    margin: 40, gutter: 24, showTitle: false,
    panelsPerPage: 4,
    fonts: {
      title: { family: 'Black Han Sans', size: 56 },
      dialogue: { family: 'Jua', size: 30 },
      monologue: { family: 'Gaegu', size: 30 },
    },
    watermark: { enabled: true, type: 'text', text: '@my_moatoon', assetId: null, anchor: 'br', dx: 24, dy: 14, size: 20, opacity: 0.55, color: '#1b1f2a', skipCover: false },
    pageNumber: { enabled: true, format: 'n/total', anchor: 'bc', dx: 0, dy: 14, size: 20, opacity: 0.8, color: '#1b1f2a', skipCover: true },
    pageTemplates: { cover: 'builtin-cover', content: 'auto', ending: 'builtin-ending' },
    border: { texture: 'clean', width: 4, color: '#1b1f2a' }, // 컷 테두리 선
  };
}

// 저장해 둔 설정에 새로 생긴 항목이 없으면 기본값으로 채운다.
export function withDefaults(saved) {
  const d = defaultSettings();
  if (!saved) return d;
  return {
    ...d, ...saved,
    fonts: { ...d.fonts, ...(saved.fonts || {}) },
    watermark: { ...d.watermark, ...(saved.watermark || {}) },
    pageNumber: { ...d.pageNumber, ...(saved.pageNumber || {}) },
    pageTemplates: { ...d.pageTemplates, ...(saved.pageTemplates || {}) },
    border: { ...d.border, ...(saved.border || {}) },
  };
}
