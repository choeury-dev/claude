import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePixels, judgeQuality, parseFaceReport } from '../shared/quality.js';

function image(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = fn(x, y); const i = (y * w + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}

const goodFace = { faceCount: 1, faceAreaRatio: 0.2, frontal: true, obstructed: false };

test('선명한 체크무늬는 통과, 단색은 흐림으로 판정', () => {
  const sharp = analyzePixels(image(64, 64, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? 200 : 60), { width: 1000, height: 1000 });
  assert.ok(sharp.sharpness > 40);
  assert.equal(judgeQuality(sharp, goodFace).ok, true);
  const flat = analyzePixels(image(64, 64, () => 128), { width: 1000, height: 1000 });
  assert.deepEqual(judgeQuality(flat, goodFace).problems.map((p) => p.code), ['BLURRY']);
});

test('어둡고 작은 사진', () => {
  const m = analyzePixels(image(32, 32, (x) => (x % 2 ? 40 : 10)), { width: 300, height: 400 });
  const codes = judgeQuality(m, goodFace).problems.map((p) => p.code);
  assert.ok(codes.includes('LOW_RES'));
  assert.ok(codes.includes('DARK'));
});

test('얼굴 판정 규칙', () => {
  const m = { shortSide: 1000, brightness: 120, sharpness: 300 };
  const codes = (face) => judgeQuality(m, face).problems.map((p) => p.code);
  assert.deepEqual(codes({ faceCount: 0 }), ['NO_FACE']);
  assert.deepEqual(codes({ faceCount: 3 }), ['MANY_FACES']);
  assert.deepEqual(codes({ faceCount: 1, faceAreaRatio: 0.01, frontal: false, obstructed: true }), ['FACE_SMALL', 'NOT_FRONTAL', 'OBSTRUCTED']);
  assert.deepEqual(codes(null), ['FACE_CHECK_FAILED']);
  assert.deepEqual(codes(goodFace), []);
});

test('모델 응답 파싱', () => {
  assert.deepEqual(parseFaceReport('```json\n{"faceCount":1,"faceAreaRatio":0.3,"frontal":true,"obstructed":false}\n```'),
    { faceCount: 1, faceAreaRatio: 0.3, frontal: true, obstructed: false });
  assert.equal(parseFaceReport('얼굴이 없어요'), null);
  assert.equal(parseFaceReport('{"faceCount":"many"}'), null);
  assert.equal(parseFaceReport('{"faceCount":1,"faceAreaRatio":7}').faceAreaRatio, 1);
});
