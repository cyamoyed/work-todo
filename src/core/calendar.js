/* work-todo — pure calendar grid builder (no DOM / no Vue) */

import { parseDateStr, toDateStr } from './dates.js';

/**
 * Build calendar cells for a month cursor, ported from renderCalendar().
 * @param {{y: number, m: number}} cursor month cursor (m is 0-based)
 * @param {string|null} selectedDateStr currently selected due date (YYYY-MM-DD)
 * @param {string} todayStr today (YYYY-MM-DD)
 * @returns {{cells: Array<{y:number,m:number,d:number,date:string,muted:boolean,isToday:boolean,isSelected:boolean}>, title: string}}
 */
export function buildCalendarCells(cursor, selectedDateStr, todayStr) {
  const title = `${cursor.y} 年 ${cursor.m + 1} 月`;
  const first = new Date(cursor.y, cursor.m, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const daysInPrev = new Date(cursor.y, cursor.m, 0).getDate();

  const selected = parseDateStr(selectedDateStr || '');

  const raw = [];
  for (let i = 0; i < startOffset; i++) {
    const day = daysInPrev - startOffset + 1 + i;
    raw.push({
      y: cursor.m === 0 ? cursor.y - 1 : cursor.y,
      m: cursor.m === 0 ? 11 : cursor.m - 1,
      d: day,
      muted: true,
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    raw.push({ y: cursor.y, m: cursor.m, d, muted: false });
  }
  while (raw.length % 7 !== 0) {
    const idx = raw.length;
    const day = idx - (startOffset + daysInMonth) + 1;
    raw.push({
      y: cursor.m === 11 ? cursor.y + 1 : cursor.y,
      m: cursor.m === 11 ? 0 : cursor.m + 1,
      d: day,
      muted: true,
    });
  }

  const cells = raw.map((cell) => {
    const date = toDateStr(cell.y, cell.m, cell.d);
    return {
      ...cell,
      date,
      isToday: date === todayStr,
      isSelected: !!selected && date === toDateStr(selected.y, selected.m, selected.d),
    };
  });

  return { title, cells };
}
