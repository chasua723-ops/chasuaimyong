import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPageState, loadPageState, savePageState } from './pageState';

describe('pageState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves and loads data back within the same day', () => {
    savePageState('quiz', { topicId: 't1', answer: '왓슨' });
    expect(loadPageState('quiz')).toEqual({ topicId: 't1', answer: '왓슨' });
  });

  it('returns null when nothing has been saved for that key', () => {
    expect(loadPageState('essay')).toBeNull();
  });

  it('discards and returns null for data saved on a previous day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T10:00:00'));
    savePageState('quiz', { answer: '어제 답' });

    vi.setSystemTime(new Date('2026-08-21T10:00:00'));
    expect(loadPageState('quiz')).toBeNull();
    // stale entry should be cleaned up, not just ignored
    expect(localStorage.getItem('quiz')).toBeNull();
  });

  it('clearPageState removes the entry outright', () => {
    savePageState('study', { topicId: 't1' });
    clearPageState('study');
    expect(loadPageState('study')).toBeNull();
  });

  it('does not throw when localStorage.getItem returns malformed JSON', () => {
    localStorage.setItem('quiz', '{not valid json');
    expect(loadPageState('quiz')).toBeNull();
  });
});
