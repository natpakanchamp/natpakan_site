import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { slugify } from '@/lib/admin/slug';
import { api, ApiError, type SavedPost } from './api';
import { clearAutosave, readAutosave, writeAutosave, type FormSnapshot } from './autosave';
import { initUploads } from './upload';

const PREVIEW_DEBOUNCE_MS = 150;
const AUTOSAVE_DEBOUNCE_MS = 800;
const PURIFY_OPTIONS = {
  ADD_TAGS: ['video', 'source'],
  ADD_ATTR: ['autoplay', 'loop', 'muted', 'playsinline', 'loading', 'controls'],
};

interface EditorState {
  name: string;
  sha: string;
  isDirty: boolean;
}

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function field(form: HTMLFormElement, name: string): HTMLInputElement {
  return form.elements.namedItem(name) as HTMLInputElement;
}

function snapshot(form: HTMLFormElement): FormSnapshot {
  const categories = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="categories"]:checked')).map((c) => c.value);
  return {
    title: field(form, 'title').value,
    date: field(form, 'date').value,
    time: field(form, 'time').value,
    slug: field(form, 'slug').value,
    excerpt: field(form, 'excerpt').value,
    categories,
    body: (form.elements.namedItem('body') as HTMLTextAreaElement).value,
  };
}

function fill(form: HTMLFormElement, data: FormSnapshot): void {
  field(form, 'title').value = data.title;
  field(form, 'date').value = data.date;
  field(form, 'time').value = data.time;
  field(form, 'slug').value = data.slug;
  field(form, 'excerpt').value = data.excerpt ?? '';
  form.querySelectorAll<HTMLInputElement>('input[name="categories"]').forEach((c) => {
    c.checked = data.categories.includes(c.value);
  });
  (form.elements.namedItem('body') as HTMLTextAreaElement).value = data.body;
}

function setStatus(el: HTMLElement, text: string, kind: 'info' | 'error' = 'info', link?: { href: string; label: string }): void {
  el.replaceChildren(document.createTextNode(text));
  el.classList.toggle('is-error', kind === 'error');
  if (link) {
    const a = document.createElement('a');
    a.href = link.href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = link.label;
    el.append(' ', a);
  }
}

function insertAtCursor(textarea: HTMLTextAreaElement, snippet: string): void {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const before = value.slice(0, start);
  const pad = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
  const text = `${pad}${snippet}\n\n`;
  textarea.setRangeText(text, start, end, 'end');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}

function postUrl(data: FormSnapshot): string {
  const [y, m, d] = data.date.split('-');
  const section = data.categories.includes('notes') ? 'notes' : 'activities';
  return data.slug && y ? `/${section}/${y}/${m}/${d}/${data.slug}/` : '';
}

export async function initEditor(): Promise<void> {
  const form = document.getElementById('post-form') as HTMLFormElement | null;
  if (!form) return;

  const textarea = form.elements.namedItem('body') as HTMLTextAreaElement;
  const preview = document.getElementById('preview') as HTMLElement;
  const status = document.getElementById('save-status') as HTMLElement;
  const urlPreview = document.getElementById('url-preview') as HTMLElement;
  const deleteBtn = document.getElementById('delete-btn') as HTMLButtonElement;
  const slugInput = field(form, 'slug');
  const state: EditorState = { name: form.dataset.file ?? '', sha: '', isDirty: false };
  const autosaveKey = () => state.name || 'new';
  let slugTouched = Boolean(state.name);

  const renderPreview = debounce(() => {
    const html = marked.parse(textarea.value, { async: false });
    preview.innerHTML = DOMPurify.sanitize(html, PURIFY_OPTIONS);
  }, PREVIEW_DEBOUNCE_MS);

  const saveLocal = debounce(() => writeAutosave(autosaveKey(), snapshot(form)), AUTOSAVE_DEBOUNCE_MS);

  const refreshMeta = () => {
    const url = postUrl(snapshot(form));
    urlPreview.textContent = url ? `URL: ${url}` : '';
  };

  form.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (target === slugInput) slugTouched = true;
    if (target.name === 'title' && !slugTouched) slugInput.value = slugify(target.value);
    state.isDirty = true;
    refreshMeta();
    renderPreview();
    saveLocal();
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.isDirty) e.preventDefault();
  });

  initUploads(
    textarea,
    document.getElementById('file-input') as HTMLInputElement,
    document.getElementById('upload-queue') as HTMLElement,
    (snippet) => insertAtCursor(textarea, snippet),
  );

  if (state.name) {
    setStatus(status, 'กำลังโหลดโพสต์…');
    try {
      const post = await api.getPost(state.name);
      state.sha = post.sha;
      fill(form, { ...post.fields, slug: post.slug, body: post.body });
      deleteBtn.hidden = false;
      setStatus(status, post.fields.draft ? 'สถานะ: draft (ยังไม่ขึ้นเว็บ)' : 'สถานะ: เผยแพร่แล้ว');
    } catch (error) {
      setStatus(status, error instanceof ApiError ? error.message : 'โหลดโพสต์ไม่สำเร็จ', 'error');
      return;
    }
  }

  const local = readAutosave(autosaveKey());
  if (local && JSON.stringify(local.data) !== JSON.stringify(snapshot(form))) {
    const when = new Date(local.savedAt).toLocaleString('th-TH');
    if (confirm(`พบร่างที่ยังไม่ได้บันทึก (${when}) ต้องการกู้คืนไหม?`)) {
      fill(form, local.data);
      state.isDirty = true;
      slugTouched = true;
    } else {
      clearAutosave(autosaveKey());
    }
  }
  refreshMeta();
  renderPreview();
  form.dataset.ready = 'true'; // listeners attached; also lets E2E tests wait deterministically

  const save = async (draft: boolean) => {
    if (!form.reportValidity()) return;
    const data = snapshot(form);
    if (!data.categories.length) return setStatus(status, 'เลือกหมวดอย่างน้อย 1 หมวด', 'error');

    const payload = { ...data, excerpt: data.excerpt || undefined, draft };
    const buttons = form.querySelectorAll<HTMLButtonElement>('button');
    buttons.forEach((b) => (b.disabled = true));
    setStatus(status, 'กำลังบันทึก…');

    try {
      const saved: SavedPost = state.name
        ? await api.updatePost(state.name, { ...payload, sha: state.sha })
        : await api.createPost(payload);
      clearAutosave(autosaveKey());
      const renamed = saved.name !== state.name;
      state.name = saved.name;
      state.sha = saved.sha;
      state.isDirty = false;
      deleteBtn.hidden = false;
      if (renamed) history.replaceState(null, '', `/admin/edit/?file=${encodeURIComponent(saved.name)}`);

      const message = draft
        ? 'บันทึก draft แล้ว (ไม่ขึ้นเว็บจริง)'
        : 'เผยแพร่แล้ว — Cloudflare กำลัง build ประมาณ 1–2 นาที';
      setStatus(status, message, 'info', { href: saved.commitUrl, label: 'ดู commit' });
    } catch (error) {
      setStatus(status, error instanceof ApiError ? error.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const intent = (e.submitter as HTMLButtonElement | null)?.value;
    void save(intent !== 'publish');
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void save(true);
    }
  });

  deleteBtn.addEventListener('click', async () => {
    if (!state.name || !confirm('ลบโพสต์นี้ถาวร? (ย้อนกลับได้จากประวัติ git)')) return;
    try {
      await api.deletePost(state.name, state.sha);
      clearAutosave(autosaveKey());
      state.isDirty = false;
      location.href = '/admin/';
    } catch (error) {
      setStatus(status, error instanceof ApiError ? error.message : 'ลบไม่สำเร็จ', 'error');
    }
  });
}
