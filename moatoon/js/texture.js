// 질감 표현과 이미지 꾸미기(스티커 외곽선, 그림자)를 SVG 필터로 만든다.
// 편집 화면과 PNG 내보내기에 똑같이 들어간다. 글자에는 입히지 않는다.

const FILTERS = {
  pen: `<filter id="tex-pen" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="2.2" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`,
  pencil: `<filter id="tex-pencil" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="3" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feColorMatrix in="d" type="saturate" values="0.45" result="ds"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.95 0.35" numOctaves="2" seed="11" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.75" result="grain"/>
    <feComposite in="ds" in2="grain" operator="in"/>
  </filter>`,
  crayon: `<filter id="tex-crayon" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="5" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="4.5" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="2" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.2 2.35" result="wax"/>
    <feComposite in="d" in2="wax" operator="in"/>
  </filter>`,
  watercolor: `<filter id="tex-watercolor" x="-8%" y="-8%" width="116%" height="116%">
    <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="9" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="9" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="1.4" result="b"/>
    <feComposite in="b" in2="SourceGraphic" operator="arithmetic" k1="0" k2="0.72" k3="0.38" k4="0" result="mix"/>
    <feColorMatrix in="mix" type="saturate" values="0.85" result="soft"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="2" seed="4" result="paper"/>
    <feColorMatrix in="paper" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.9 1.25" result="pa"/>
    <feComposite in="soft" in2="pa" operator="in"/>
  </filter>`,
  marker: `<filter id="tex-marker" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="1" seed="6" result="w"/>
    <feDisplacementMap in="SourceGraphic" in2="w" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="0.55" result="b"/>
    <feColorMatrix in="b" type="saturate" values="1.35"/>
  </filter>`,
};

// 종이 결: 수채화·연필·크레용일 때 페이지 위에 아주 옅게 깐다
const PAPER = `<filter id="tex-paper" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" seed="1"/>
  <feColorMatrix type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.38  0 0 0 0 0.32  0 0 0 0.09 0"/>
</filter>`;

export const IMAGE_FILTERS = `<filter id="img-outline" x="-10%" y="-10%" width="120%" height="120%">
    <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="grow"/>
    <feFlood flood-color="#ffffff"/>
    <feComposite in2="grow" operator="in" result="stroke"/>
    <feMerge><feMergeNode in="stroke"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="img-shadow" x="-10%" y="-10%" width="130%" height="130%">
    <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.28"/>
  </filter>
  <filter id="img-outline-shadow" x="-10%" y="-10%" width="130%" height="130%">
    <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="grow"/>
    <feFlood flood-color="#ffffff"/>
    <feComposite in2="grow" operator="in" result="stroke"/>
    <feMerge result="st"><feMergeNode in="stroke"/><feMergeNode in="SourceGraphic"/></feMerge>
    <feDropShadow in="st" dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.28"/>
  </filter>`;

export function textureDefs(texture) {
  const f = FILTERS[texture] || '';
  const paper = ['watercolor', 'pencil', 'crayon'].includes(texture) ? PAPER : '';
  return f + paper + IMAGE_FILTERS;
}

// 한 가지 질감 필터 정의만 (컷 테두리 선처럼 따로 고른 질감에 쓴다)
export function filterDef(texture) { return FILTERS[texture] || ''; }

export function textureFilterAttr(texture) {
  return FILTERS[texture] ? ` filter="url(#tex-${texture})"` : '';
}

export function hasPaper(texture) { return ['watercolor', 'pencil', 'crayon'].includes(texture); }
