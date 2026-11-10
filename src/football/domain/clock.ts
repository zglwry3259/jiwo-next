/** 3×5 dot-matrix digits for the character clock, one string of three cells per row. */
const DIGITS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  ':': ['.', '#', '.', '#', '.'],
}
export const CLOCK_ROWS = 5

/** “14:37:05” in the visitor's own time zone. */
export const clockText = (date: Date) =>
  [date.getHours(), date.getMinutes(), date.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':')

export interface ClockCell {
  col: number
  row: number
  glyph: string
  /** Which character of the text the cell belongs to, so a changed digit can be found. */
  index: number
}
/** The lit cells of `text` laid out left to right, one blank column between characters. */
export function clockCells(text: string) {
  const cells: ClockCell[] = []
  let col = 0
  ;[...text].forEach((char, index) => {
    const rows = DIGITS[char]
    if (!rows) return
    rows.forEach((line, row) =>
      [...line].forEach((dot, x) => {
        if (dot === '#') cells.push({ col: col + x, row, glyph: char, index })
      }),
    )
    col += rows[0]!.length + 1
  })
  return { cells, cols: Math.max(0, col - 1) }
}
