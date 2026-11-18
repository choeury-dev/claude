// OpenAI 이미지 편집 API (POST /v1/images/edits) 호출.
// 근거: OpenAI 공식 OpenAPI 명세 (github.com/openai/openai-openapi, 2026-11 확인)
//  - image: png/webp/jpg, 여러 장이면 image[] (최대 16장)
//  - mask: 투명한(알파 0) 부분만 고친다. PNG, image 와 같은 크기
//  - background: transparent | opaque | auto (transparent 는 png/webp 출력)
//  - size: 1024x1024 | 1536x1024 | 1024x1536 | auto  (2.x 모델은 임의 크기도 되지만 여기선 표준 크기만 쓴다)
//  - quality: low | medium | high (2.5 계열은 xhigh, max 도)
//  - 응답: data[].b64_json
// 키는 이 브라우저에만 저장하고 브라우저에서 OpenAI 로 바로 보낸다(혼자 쓰는 용도).

export const IMAGE_MODELS = [
  'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-2.6-sunburst', 'gpt-image-2.6-flare', 'gpt-image-2', 'gpt-image-1.5',
];
export const STANDARD_SIZES = [[1024, 1024], [1024, 1536], [1536, 1024]];

export async function editImage({ apiKey, model, prompt, images, mask, size, quality, background }) {
  if (!apiKey) throw new Error('OpenAI API 키가 없습니다. 설정 탭 "AI 연결"에 넣어 주세요.');
  const fd = new FormData();
  fd.append('model', model);
  fd.append('prompt', prompt);
  images.forEach((b, i) => fd.append(images.length > 1 ? 'image[]' : 'image', b, `image${i}.png`));
  if (mask) fd.append('mask', mask, 'mask.png');
  if (size) fd.append('size', size);
  if (quality) fd.append('quality', quality);
  if (background) fd.append('background', background);
  fd.append('output_format', 'png');
  fd.append('n', '1');
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: fd });
  } catch {
    throw new Error('OpenAI 에 연결하지 못했습니다. 인터넷 연결을 확인하거나, claude.ai 미리보기가 아닌 배포 주소에서 열어 주세요.');
  }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error?.message || ''; } catch { /* */ }
    const hint = res.status === 401 ? 'API 키가 맞지 않습니다.' : res.status === 429 ? '사용 한도나 요청 수 제한에 걸렸습니다. 잠시 뒤 다시 하거나 결제·한도를 확인해 주세요.' : res.status === 400 ? '요청이 거절되었습니다.' : `OpenAI 오류 (${res.status})`;
    throw Object.assign(new Error(`${hint}${msg ? ` (${msg})` : ''}`), { status: res.status });
  }
  const j = await res.json();
  const b64 = j.data && j.data[0] && j.data[0].b64_json;
  if (!b64) throw new Error('OpenAI 응답에 이미지가 없습니다.');
  return `data:image/png;base64,${b64}`;
}

// 키 확인: 모델 목록 조회(요금 없음)
export async function testOpenAIKey(apiKey) {
  let res;
  try { res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } }); } catch {
    throw new Error('OpenAI 에 연결하지 못했습니다. 인터넷 연결을 확인하거나, claude.ai 미리보기가 아닌 배포 주소에서 열어 주세요.');
  }
  if (res.status === 401) throw Object.assign(new Error('키가 맞지 않습니다(401). OpenAI 대시보드에서 키를 다시 복사해 주세요.'), { status: 401 });
  if (!res.ok) { let m = ''; try { m = (await res.json()).error?.message || ''; } catch { /* */ } throw new Error(`OpenAI 오류 (${res.status}) ${m}`); }
  return ((await res.json()).data || []).map((m) => m.id);
}
