import { api, ApiError } from './api';
import { compressImage } from './compress';

type InsertSnippet = (snippet: string) => void;

/** PUT straight to R2 with progress; fetch() cannot report upload progress. */
function putWithProgress(url: string, file: File, onProgress: (ratio: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`อัปโหลดไม่สำเร็จ (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('อัปโหลดไม่สำเร็จ (เครือข่ายหรือ CORS ของ R2)'));
    xhr.send(file);
  });
}

function queueItem(queue: HTMLElement, name: string): { set: (text: string, state?: 'done' | 'error') => void } {
  const li = document.createElement('li');
  const label = document.createElement('span');
  const state = document.createElement('span');
  label.textContent = name;
  state.className = 'upload-state';
  li.append(label, state);
  queue.prepend(li);
  return {
    set(text, kind) {
      state.textContent = text;
      li.dataset.state = kind ?? 'busy';
      if (kind === 'done') setTimeout(() => li.remove(), 4000);
    },
  };
}

async function uploadOne(file: File, queue: HTMLElement, insert: InsertSnippet): Promise<void> {
  const item = queueItem(queue, file.name);
  try {
    item.set('กำลังย่อรูป…');
    const prepared = await compressImage(file);
    item.set('ขอสิทธิ์อัปโหลด…');
    const presigned = await api.presign({ filename: prepared.name, contentType: prepared.type, size: prepared.size, alt: '' });
    await putWithProgress(presigned.uploadUrl, prepared, (r) => item.set(`${Math.round(r * 100)}%`));
    insert(presigned.snippet);
    item.set('เสร็จแล้ว', 'done');
  } catch (error) {
    item.set(error instanceof ApiError || error instanceof Error ? error.message : 'อัปโหลดไม่สำเร็จ', 'error');
  }
}

export function initUploads(textarea: HTMLTextAreaElement, input: HTMLInputElement, queue: HTMLElement, insert: InsertSnippet): void {
  const handle = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) await uploadOne(file, queue, insert);
  };

  input.addEventListener('change', () => {
    if (input.files?.length) void handle(input.files).then(() => (input.value = ''));
  });

  textarea.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      textarea.classList.add('is-dropping');
    }
  });
  textarea.addEventListener('dragleave', () => textarea.classList.remove('is-dropping'));
  textarea.addEventListener('drop', (e) => {
    textarea.classList.remove('is-dropping');
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    void handle(e.dataTransfer.files);
  });
  textarea.addEventListener('paste', (e) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!files.length) return;
    e.preventDefault();
    void handle(files);
  });
}
