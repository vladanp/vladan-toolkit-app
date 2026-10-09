/** Time-of-day greeting for the home screen. */
export function greeting(hour: number = new Date().getHours()): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  if (hour >= 18 && hour < 23) return 'Good evening';
  return 'Burning the midnight oil';
}
