const CJK_IDEOGRAPH_PATTERN = /[一-鿿㐀-䶿]/;

export function containsChinese(text: string): boolean {
  return CJK_IDEOGRAPH_PATTERN.test(text);
}
