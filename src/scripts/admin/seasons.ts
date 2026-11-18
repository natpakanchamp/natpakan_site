import { isInRange, monthDayIn, parseMonthDay, SITE_TIME_ZONE } from '@/lib/seasons';
import { api, ApiError, type SeasonSetting } from './api';

const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function select(form: HTMLFormElement, name: string): HTMLSelectElement {
  return form.elements.namedItem(name) as HTMLSelectElement;
}

function readCard(form: HTMLFormElement, id: string): SeasonSetting {
  const md = (edge: string) => `${select(form, `${id}.${edge}.month`).value}-${select(form, `${id}.${edge}.day`).value}`;
  const enabled = (form.elements.namedItem(`${id}.enabled`) as HTMLInputElement).checked;
  return { enabled, start: md('start'), end: md('end') };
}

function fillCard(form: HTMLFormElement, id: string, s: SeasonSetting) {
  (form.elements.namedItem(`${id}.enabled`) as HTMLInputElement).checked = s.enabled;
  for (const edge of ['start', 'end'] as const) {
    const [month, day] = s[edge].split('-');
    select(form, `${id}.${edge}.month`).value = month;
    select(form, `${id}.${edge}.day`).value = day;
  }
}

const human = (md: string) => {
  const { month, day } = parseMonthDay(md);
  return `${day} ${MONTHS[month - 1]}`;
};

/** Describe the setting and whether it would be showing today (site time zone). */
function describe(s: SeasonSetting): { text: string; on: boolean; valid: boolean } {
  try {
    const range = { start: parseMonthDay(s.start), end: parseMonthDay(s.end) };
    const span = `${human(s.start)} – ${human(s.end)} ของทุกปี${range.start.month * 100 + range.start.day > range.end.month * 100 + range.end.day ? ' (ข้ามปีใหม่)' : ''}`;
    if (!s.enabled) return { text: `ปิดอยู่ · ${span}`, on: false, valid: true };
    const on = isInRange(monthDayIn(new Date(), SITE_TIME_ZONE), range);
    return { text: `${on ? '● กำลังแสดงอยู่ตอนนี้' : '○ ยังไม่ถึงช่วงแสดง'} · ${span}`, on, valid: true };
  } catch {
    return { text: 'วันที่ไม่มีอยู่จริง (เช่น 30 ก.พ.)', on: false, valid: false };
  }
}

export async function initSeasonsPage(): Promise<void> {
  const form = document.getElementById('seasons-form') as HTMLFormElement | null;
  if (!form) return;
  const status = document.getElementById('save-status') as HTMLElement;
  const cards = Array.from(form.querySelectorAll<HTMLElement>('[data-season-id]'));
  const ids = cards.map((c) => c.dataset.seasonId as string);
  let sha: string | undefined;

  const refresh = () => {
    let allValid = true;
    for (const card of cards) {
      const d = describe(readCard(form, card.dataset.seasonId as string));
      const el = card.querySelector<HTMLElement>('[data-status]');
      if (el) {
        el.textContent = d.text;
        el.dataset.on = String(d.on);
        el.classList.toggle('is-error', !d.valid);
      }
      allValid &&= d.valid;
    }
    return allValid;
  };

  form.addEventListener('change', refresh);

  try {
    const loaded = await api.getSeasons();
    sha = loaded.sha;
    for (const id of ids) if (loaded.seasons[id]) fillCard(form, id, loaded.seasons[id]);
    status.textContent = '';
  } catch (error) {
    status.textContent = error instanceof ApiError ? error.message : 'โหลดไม่สำเร็จ';
    status.classList.add('is-error');
    return;
  }
  refresh();
  form.dataset.ready = 'true';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!refresh()) {
      status.textContent = 'แก้วันที่ที่ไม่ถูกต้องก่อนบันทึก';
      status.classList.add('is-error');
      return;
    }
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    status.classList.remove('is-error');
    status.textContent = 'กำลังบันทึก…';
    try {
      const seasons = Object.fromEntries(ids.map((id) => [id, readCard(form, id)]));
      const saved = await api.saveSeasons(seasons, sha);
      sha = saved.sha;
      status.replaceChildren(document.createTextNode('บันทึกแล้ว — เว็บกำลัง build ใหม่ราว 1–2 นาที '));
      const link = document.createElement('a');
      link.href = saved.commitUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'ดู commit';
      status.append(link);
    } catch (error) {
      status.textContent = error instanceof ApiError ? error.message : 'บันทึกไม่สำเร็จ';
      status.classList.add('is-error');
    } finally {
      if (button) button.disabled = false;
    }
  });
}
