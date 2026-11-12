// Russian plural forms for the seat's words (AGT-98).

/** A count with its Russian word: 1 золотой, 2 золотых, 5 золотых; 1 день, 2 дня, 5 дней. */
export function plural(count: number, one: string, few: string, many: string): string {
  const ten = count % 10;
  const hundred = count % 100;
  const word = ten === 1 && hundred !== 11 ? one : ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14) ? few : many;
  return `${count} ${word}`;
}

