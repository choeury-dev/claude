// Claude 로 맞춤법·사실 확인을 한 번 더 한다 (선택 기능).
// API 키는 이 브라우저의 localStorage 에만 저장되고, 요청은 브라우저에서 Anthropic API 로 바로 간다.
// 그래서 공용 컴퓨터나 남에게 배포하는 사이트에서는 쓰지 말 것.

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.4.0/+esm';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'suggestion', 'spellingNote', 'factVerdict', 'factNote'],
        properties: {
          id: { type: 'string' },
          suggestion: { type: 'string', description: '맞춤법·띄어쓰기·사실을 고친 권장 문장. 고칠 것이 없으면 원문 그대로.' },
          spellingNote: { type: 'string', description: '무엇을 왜 고쳤는지 한두 문장. 없으면 빈 문자열.' },
          factVerdict: { type: 'string', enum: ['none', 'ok', 'doubtful', 'false', 'unverifiable'] },
          factNote: { type: 'string', description: '사실 판단의 근거. 확실하지 않으면 그렇다고 쓴다. 없으면 빈 문자열.' },
        },
      },
    },
  },
};

const SYSTEM = `너는 한국어 웹툰 대사 교정자다.
각 대사의 맞춤법과 띄어쓰기를 한글 맞춤법·표준어 규정·외래어 표기법 기준으로 고친다.
말투, 유행어, 의성어, 캐릭터 개성은 바꾸지 않는다. 틀린 곳만 고친다.
대사에 사실 주장(숫자, 연도, 역사, 과학, '최초' 등)이 있으면 factVerdict 로 판단한다:
none = 사실 주장 없음, ok = 맞음, doubtful = 의심스러움, false = 틀림, unverifiable = 판단할 근거가 부족함.
너는 인터넷을 검색하지 않는다. 확실하지 않으면 ok 나 false 대신 doubtful 이나 unverifiable 을 쓴다.
사실이 틀렸거나 의심스러우면 suggestion 에서 사실에 맞게 고치거나 '~라는 말이 있대'처럼 전해 들은 말로 바꾼다.`;

export async function aiCheck(apiKey, lines) {
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const payload = lines.map((l) => ({ id: l.id, speaker: l.speaker || '', kind: l.kind, text: l.text }));
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `다음 대사들을 검사해 줘.\n${JSON.stringify(payload, null, 2)}` }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude 가 이 요청을 처리하지 않았습니다.');
  if (response.stop_reason === 'max_tokens') throw new Error('응답이 너무 길어 잘렸습니다. 대사를 나눠서 검사해 주세요.');
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('응답에 결과가 없습니다.');
  return JSON.parse(textBlock.text).items;
}

export function describeError(err) {
  const s = err && (err.status || err.statusCode);
  if (s === 401) return 'API 키가 맞지 않습니다. 키를 다시 확인해 주세요.';
  if (s === 429) return '요청이 많아 잠시 막혔습니다. 조금 뒤에 다시 시도해 주세요.';
  if (s === 400) return `요청 형식 오류: ${err.message}`;
  if (s >= 500) return 'Anthropic 서버 오류입니다. 잠시 뒤 다시 시도해 주세요.';
  if (err instanceof TypeError) return '네트워크에 연결할 수 없습니다. 이 페이지를 로컬 서버(README 참고)에서 열었는지 확인해 주세요.';
  return err && err.message ? err.message : String(err);
}
