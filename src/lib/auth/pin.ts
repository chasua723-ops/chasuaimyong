export function verifyPin(inputPin: string, expectedPin: string): boolean {
  return inputPin.trim() === expectedPin.trim();
}
