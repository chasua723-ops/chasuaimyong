import { describe, it, expect } from 'vitest';
import { stripHighlightMarkers } from './highlightMarkers';

describe('stripHighlightMarkers', () => {
  it('removes [[ ]] markers but keeps the wrapped text', () => {
    expect(stripHighlightMarkers('다음 문장에서 [[这个]]의 용법으로 옳은 것은?')).toBe(
      '다음 문장에서 这个의 용법으로 옳은 것은?'
    );
  });

  it('handles multiple markers in the same string', () => {
    expect(stripHighlightMarkers('[[在]]他的脸上都是汗。')).toBe('在他的脸上都是汗。');
  });

  it('returns unmarked text unchanged', () => {
    expect(stripHighlightMarkers('다음 중 옳은 것은?')).toBe('다음 중 옳은 것은?');
  });
});
