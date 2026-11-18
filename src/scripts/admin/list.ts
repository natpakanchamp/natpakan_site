import { api, ApiError } from './api';

interface KnownPost {
  title: string;
  draft: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function readKnown(list: HTMLElement): Record<string, KnownPost> {
  try {
    return JSON.parse(list.dataset.known ?? '{}') as Record<string, KnownPost>;
  } catch {
    return {};
  }
}

function renderItem(name: string, known: KnownPost | undefined): HTMLLIElement {
  const date = name.slice(0, 10);
  const li = el('li', 'post-row');
  const link = el('a', 'post-row-link');
  link.href = `/admin/edit/?file=${encodeURIComponent(name)}`;

  link.append(el('time', 'post-row-date', date));
  link.append(el('span', 'post-row-title', known?.title ?? name.replace(/^\d{4}-\d{2}-\d{2}-|\.md$/g, '')));
  if (known?.draft) link.append(el('span', 'badge badge-draft', 'draft'));
  if (!known) link.append(el('span', 'badge', 'รอ build'));

  li.append(link);
  return li;
}

export async function initPostList(): Promise<void> {
  const list = document.getElementById('post-list');
  const status = document.getElementById('post-list-status');
  if (!list || !status) return;

  const known = readKnown(list);
  try {
    const posts = await api.listPosts();
    list.replaceChildren(...posts.map((p) => renderItem(p.name, known[p.name.replace(/\.md$/, '')])));
    status.textContent = `${posts.length} โพสต์`;
  } catch (error) {
    status.textContent = error instanceof ApiError ? error.message : 'โหลดรายการไม่สำเร็จ';
    status.classList.add('is-error');
  }
}
