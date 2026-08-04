/**
 * Today's date as YYYY-MM-DD in Korea Standard Time (UTC+9).
 *
 * The app is a "매일 아침 15분" habit tool used in Korea, so the day boundary must
 * be midnight KST — using UTC would serve yesterday's session until 09:00 KST.
 * The en-CA locale formats dates as YYYY-MM-DD natively.
 */
export function getTodayInSeoul(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);
}
