// 규칙 기반 맞춤법·띄어쓰기 검사와 사실 확인 표시.
// 인터넷 없이 동작한다. 규칙에 없는 오류는 찾지 못하므로, 더 넓은 검사는 ai.js(Claude)를 쓴다.
// 각 규칙의 근거는 국립국어원 표준국어대사전·한글 맞춤법·외래어 표기법이다.

const finalOf = (ch) => {
  const c = ch.charCodeAt(0) - 0xac00;
  return c >= 0 && c < 11172 ? c % 28 : -1;
};
const hasRieul = (ch) => finalOf(ch) === 8; // 받침 ㄹ

const END = '(?=[\\s.,!?~…"\'」』)]|$)';

// level: 'fix' = 거의 항상 틀림, 'hint' = 뜻에 따라 다름(적용 전 확인)
const RULES = [
  { re: /됬/g, to: '됐', why: "'되었'이 줄면 '됐'입니다." },
  { re: /됀/g, to: '된', why: "'되다'의 관형형은 '된'입니다." },
  { re: /몇\s?일/g, to: '며칠', why: "'몇 일'은 쓰지 않고 항상 '며칠'로 씁니다." },
  { re: /어떻해/g, to: '어떡해', why: "'어떻게 해'가 줄면 '어떡해'입니다." },
  { re: /어떻케/g, to: '어떻게', why: "'어떻게'가 바른 표기입니다." },
  { re: new RegExp('([가-힣])께(요)?' + END, 'g'), test: (m) => hasRieul(m[1]), to: (m) => `${m[1]}게${m[2] || ''}`, why: "약속을 나타내는 어미는 '-ㄹ게'입니다. (할께 → 할게)" },
  { re: /([가-힣])꺼(?=야|예요|에요|지|다|면|라|니|든|고|래)/g, test: (m) => hasRieul(m[1]), to: (m) => `${m[1]} 거`, why: "'것'의 구어형은 '거'이고, 앞말과 띄어 씁니다. (할꺼야 → 할 거야)" },
  { re: /(내|너|니|제|네)꺼/g, to: (m) => `${m[1]} 거`, why: "'것'의 구어형은 '거'이고, 앞말과 띄어 씁니다." },
  { re: /금새/g, to: '금세', why: "'금시에'가 줄어든 말이라 '금세'입니다." },
  { re: /오랫만/g, to: '오랜만', why: "'오래간만'이 줄어든 말이라 '오랜만'입니다." },
  { re: /설레임/g, to: '설렘', why: "'설레다'의 명사형은 '설렘'입니다." },
  { re: /왠만/g, to: '웬만', why: "'웬만하다'가 바른 표기입니다." },
  { re: /웬지/g, to: '왠지', why: "'왜인지'가 줄어든 말이라 '왠지'입니다." },
  { re: /왠일/g, to: '웬일', why: "'어찌 된 일'이라는 뜻은 '웬일'입니다." },
  { re: new RegExp('안\\s?되' + END, 'g'), to: '안 돼', why: "'안 되어'가 줄면 '안 돼'이고, '안'은 띄어 씁니다." },
  { re: /안돼/g, to: '안 돼', why: "부정의 '안'은 뒷말과 띄어 씁니다. ('안됐다(가엾다)'의 뜻이면 붙여 씁니다.)", level: 'hint' },
  { re: /되요/g, to: '돼요', why: "'되어요'가 줄면 '돼요'입니다." },
  { re: /되서/g, to: '돼서', why: "'되어서'가 줄면 '돼서'입니다." },
  { re: /되(?=[.!?~…]|$)/g, to: '돼', why: "문장 끝에서는 '되어'가 줄어든 '돼'를 씁니다." },
  { re: /않\s?(하|해|했|돼|되)/g, to: (m) => `안 ${m[1]}`, why: "'않-'은 '아니하-'의 준말이라 '않하'처럼 쓰지 않습니다. 부정은 '안 하'로 씁니다." },
  { re: /어의\s?없/g, to: '어이없', why: "'어이없다'가 바른 표기입니다." },
  { re: /일일히/g, to: '일일이', why: "'일일이'가 바른 표기입니다." },
  { re: /깨끗히/g, to: '깨끗이', why: "'깨끗이'가 바른 표기입니다." },
  { re: /곰곰히/g, to: '곰곰이', why: "'곰곰이'가 바른 표기입니다." },
  { re: /틈틈히/g, to: '틈틈이', why: "'틈틈이'가 바른 표기입니다." },
  { re: /솔직이/g, to: '솔직히', why: "'솔직히'가 바른 표기입니다." },
  { re: /꼼꼼이/g, to: '꼼꼼히', why: "'꼼꼼히'가 바른 표기입니다." },
  { re: /희안/g, to: '희한', why: "'희한하다'가 바른 표기입니다." },
  { re: /역활/g, to: '역할', why: "'역할(役割)'이 바른 표기입니다." },
  { re: /뵈요/g, to: '봬요', why: "'뵈어요'가 줄면 '봬요'입니다." },
  { re: /구지/g, to: '굳이', why: "'굳이'가 바른 표기입니다. 소리는 [구지]로 납니다." },
  { re: /들어나/g, to: '드러나', why: "'드러나다'가 바른 표기입니다." },
  { re: /설겆이/g, to: '설거지', why: "'설거지'가 표준어입니다." },
  { re: /요세/g, to: '요새', why: "'요사이'가 줄어든 말이라 '요새'입니다." },
  { re: /사겼/g, to: '사귀었', why: "'사귀다'의 과거형은 '사귀었다'입니다." },
  { re: /아니예요/g, to: '아니에요', why: "'아니다' 뒤에는 '-에요'가 붙습니다." },
  { re: /뭐에요/g, to: '뭐예요', why: "'뭐+이에요'가 줄면 '뭐예요'입니다." },
  { re: /(할|갈|볼|줄|잘)려(고|면)/g, to: (m) => `${{ 할: '하', 갈: '가', 볼: '보', 줄: '주', 잘: '자' }[m[1]]}려${m[2]}`, why: "'-려고/-려면'은 받침 없는 말에 바로 붙습니다. (할려고 → 하려고)" },
  { re: /먹을려(고|면)/g, to: (m) => `먹으려${m[1]}`, why: "받침 있는 말에는 '-으려고'가 붙습니다." },
  { re: /([가-힣])수\s?(있|없)/g, test: (m) => hasRieul(m[1]) && m[1] !== '별', to: (m) => `${m[1]} 수 ${m[2]}`, why: "의존 명사 '수'는 앞말과 띄어 씁니다. (할수있다 → 할 수 있다)" },
  { re: /([가-힣])때(?=[\s,.!?]|$|[는도마])/g, test: (m) => hasRieul(m[1]) && m[1] !== '쓸', to: (m) => `${m[1]} 때`, why: "'때'는 명사라 앞말과 띄어 씁니다. (할때 → 할 때)" },
  { re: /([가-힣])것/g, test: (m) => hasRieul(m[1]) && !['날', '별', '들'].includes(m[1]), to: (m) => `${m[1]} 것`, why: "의존 명사 '것'은 앞말과 띄어 씁니다. (할것 → 할 것)" },
  { re: /(것|거)같/g, to: (m) => `${m[1]} 같`, why: "'같다'는 앞말과 띄어 씁니다. (것같아 → 것 같아)" },
  { re: /바램/g, to: '바람', why: "'바라다'의 명사형은 '바람'입니다. ('색이 바래다'의 뜻이면 그대로 둡니다.)", level: 'hint' },
  { re: /일부로/g, to: '일부러', why: "'일부러(고의로)'의 뜻이면 '일부러'입니다.", level: 'hint' },
  { re: /나레이션/g, to: '내레이션', why: "외래어 표기법에 따라 'narration'은 '내레이션'입니다." },
  { re: /메세지/g, to: '메시지', why: "외래어 표기법에 따라 'message'는 '메시지'입니다." },
  { re: /케익/g, to: '케이크', why: "외래어 표기법에 따라 'cake'는 '케이크'입니다." },
  { re: /쥬스/g, to: '주스', why: "외래어 표기법에 따라 'juice'는 '주스'입니다." },
  { re: /초콜렛/g, to: '초콜릿', why: "외래어 표기법에 따라 'chocolate'은 '초콜릿'입니다." },
  { re: /악세사리/g, to: '액세서리', why: "외래어 표기법에 따라 'accessory'는 '액세서리'입니다." },
  { re: /화이팅/g, to: '파이팅', why: "표준 표기는 '파이팅'이고, '힘내자'로 바꿔 써도 좋습니다." },
  { re: /컨텐츠/g, to: '콘텐츠', why: "외래어 표기법에 따라 'contents'는 '콘텐츠'입니다." },
  { re: /리더쉽/g, to: '리더십', why: "외래어 표기법에 따라 '-ship'은 '-십'입니다." },
  { re: /비지니스/g, to: '비즈니스', why: "외래어 표기법에 따라 'business'는 '비즈니스'입니다." },
  { re: /까페/g, to: '카페', why: "외래어 표기법에 따라 'café'는 '카페'입니다." },
  { re: /쇼파/g, to: '소파', why: "외래어 표기법에 따라 'sofa'는 '소파'입니다." },
  { re: /렌트카/g, to: '렌터카', why: "'rent-a-car'의 표기는 '렌터카'입니다." },
  { re: /플랭카드|플랜카드/g, to: '플래카드', why: "'placard'의 표기는 '플래카드'입니다." },
  { re: /미스테리/g, to: '미스터리', why: "외래어 표기법에 따라 'mystery'는 '미스터리'입니다." },
  { re: /바베큐/g, to: '바비큐', why: "외래어 표기법에 따라 'barbecue'는 '바비큐'입니다." },
  { re: /스케쥴/g, to: '스케줄', why: "외래어 표기법에 따라 'schedule'은 '스케줄'입니다." },
  { re: /팜플렛/g, to: '팸플릿', why: "외래어 표기법에 따라 'pamphlet'은 '팸플릿'입니다." },
  { re: /[ \t]{2,}/g, to: ' ', why: '띄어쓰기가 두 칸 이상 들어가 있습니다.' },
];

function applyRule(text, rule) {
  const found = [];
  const re = new RegExp(rule.re.source, rule.re.flags);
  const next = text.replace(re, (...args) => {
    const m = args.slice(0, -2);
    if (typeof args[args.length - 1] === 'object') m.pop(); // named groups
    if (rule.test && !rule.test(m)) return m[0];
    const to = typeof rule.to === 'function' ? rule.to(m) : rule.to;
    if (to === m[0]) return m[0];
    found.push({ from: m[0], to });
    return to;
  });
  return { next, found };
}

export function checkSpelling(text) {
  let current = String(text || '');
  const issues = [];
  for (const rule of RULES) {
    const { next, found } = applyRule(current, rule);
    for (const f of found) issues.push({ kind: 'spelling', level: rule.level || 'fix', from: f.from, to: f.to, why: rule.why });
    current = next;
  }
  return { issues, suggestion: current };
}

// 사실 여부는 규칙으로 판단할 수 없다. 숫자·연도·'최초' 같은 주장이 있으면 확인하라고만 표시한다.
const FACT_RE = /(\d{3,4}\s?년|\d+(?:\.\d+)?\s?(%|퍼센트|명|개국|km|킬로|미터|kg|원|달러|칼로리|kcal)|최초|처음으로|처음 만들|세계\s?최|가장\s?(큰|높|많|오래|빠)|유일|발명|원조|과학적으로|연구에 따르면)/;

export function checkFacts(text) {
  const m = String(text || '').match(FACT_RE);
  if (!m) return [];
  const hedged = /(대|래|다더라|라던데|라는데|이라던데|일걸|설이 있)[.!?~…]*\s*$/.test(text.trim());
  return [{
    kind: 'fact',
    level: 'hint',
    from: m[0],
    to: null,
    why: hedged
      ? `'${m[0]}'이(가) 들어간 주장입니다. 전해 들은 말투로 쓰여 있지만, 독자가 사실로 받아들일 수 있으니 출처를 확인해 보세요.`
      : `'${m[0]}'이(가) 들어간 주장입니다. 출처를 확인하거나, 확실하지 않으면 '~라는 말이 있대'처럼 전해 들은 말로 바꾸는 것을 권장합니다.`,
  }];
}

export function checkLine(text) {
  const sp = checkSpelling(text);
  return { issues: [...sp.issues, ...checkFacts(text)], suggestion: sp.suggestion };
}
