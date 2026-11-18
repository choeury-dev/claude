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

export function defaultSettings() {
  return {
    sizeId: 'insta45', width: 1080, height: 1350,
    layout: 'auto', style: 'sd',
    margin: 40, gutter: 24, showTitle: true,
    fonts: {
      title: { family: 'Black Han Sans', size: 56 },
      dialogue: { family: 'Jua', size: 30 },
      monologue: { family: 'Gaegu', size: 30 },
    },
  };
}
