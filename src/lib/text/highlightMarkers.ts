/**
 * Question prompts/choices can contain [[ ]]-wrapped spans for HighlightedText to color.
 * Strip them before feeding prompt/choice/answer text into a downstream AI call (explanation,
 * essay grading) — the markers add no value there and could otherwise leak back out verbatim
 * in AI-generated text that renders as plain, unhighlighted text.
 */
export function stripHighlightMarkers(text: string): string {
  return text.replace(/\[\[(.+?)\]\]/g, '$1');
}
