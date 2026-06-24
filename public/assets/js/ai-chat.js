(function () {
  'use strict';

  var ENDPOINT = '/.netlify/functions/chat';

  // ── Context extraction ─────────────────────────────────────────────────────

  function slugFromPath() {
    var parts = window.location.pathname.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || 'home';
  }

  function stripHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  function truncate(text, max) {
    if (text.length <= max) return text;
    var cut = text.lastIndexOf(' ', max);
    return text.slice(0, cut > 0 ? cut : max) + '…';
  }

  function extractPostContext() {
    var content = document.querySelector('.post-content');
    if (!content) return null;

    var articleText = truncate(
      content.innerText.replace(/\s+/g, ' ').trim(),
      4000
    );

    return {
      title: (document.querySelector('.post-title') || {}).textContent?.trim() || document.title,
      slug: slugFromPath(),
      url: window.location.pathname,
      isNotebook: document.body.classList.contains('notes-page'),
      articleText: articleText,
    };
  }

  // ── Section context for selection ──────────────────────────────────────────

  function findSectionHeading(node) {
    var el = node.nodeType === 3 ? node.parentElement : node;
    while (el && el !== document.body) {
      var sibling = el.previousElementSibling;
      while (sibling) {
        if (/^H[2-4]$/.test(sibling.tagName)) return sibling.textContent.trim();
        sibling = sibling.previousElementSibling;
      }
      el = el.parentElement;
    }
    return '';
  }

  function getSurroundingText(range) {
    var node = range.commonAncestorContainer;
    var el = node.nodeType === 3 ? node.parentElement : node;
    var block = el.closest('p, li, blockquote, .exam-box') || el;
    return truncate(block.textContent.trim(), 600);
  }

  // ── Payload builder ────────────────────────────────────────────────────────

  function buildPayload(mode, ctx, messages, selection) {
    var postCtx = ctx || {};

    var context = {
      articleText: postCtx.articleText || '',
      selectedText: (selection && selection.text) || '',
      sectionHeading: (selection && selection.heading) || '',
      surroundingText: (selection && selection.surrounding) || '',
    };

    return {
      mode: mode,
      post: {
        title: postCtx.title || document.title,
        slug: postCtx.slug || slugFromPath(),
        url: postCtx.url || window.location.pathname,
        isNotebook: !!postCtx.isNotebook,
      },
      context: context,
      messages: messages || [],
    };
  }

  // ── API call ───────────────────────────────────────────────────────────────

  async function callAPI(payload) {
    var res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    var data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Server error');
    return data;
  }

  // ── Chat panel ─────────────────────────────────────────────────────────────

  var panel = document.getElementById('ai-chat-panel');
  var fab = document.getElementById('ai-chat-fab');
  var closeBtn = document.getElementById('ai-chat-close');
  var messagesEl = document.getElementById('ai-chat-messages');
  var form = document.getElementById('ai-chat-form');
  var input = document.getElementById('ai-chat-input');
  var sendBtn = form ? form.querySelector('.aic-send') : null;
  var actionBar = document.getElementById('ai-action-bar');
  var summaryBtn = actionBar ? actionBar.querySelector('[data-action="summary"]') : null;

  var state = {
    open: false,
    loading: false,
    messages: [],  // { role: 'user'|'ai', content: string }
    postCtx: null,
    pendingSelection: null,
  };

  function init() {
    state.postCtx = extractPostContext();

    // Show action bar and summary button only on post pages
    if (state.postCtx && actionBar) {
      actionBar.hidden = false;
    } else if (messagesEl) {
      messagesEl.classList.add('no-post');
    }

    if (fab) fab.addEventListener('click', openPanel);
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    if (form) form.addEventListener('submit', onSubmit);
    if (summaryBtn) summaryBtn.addEventListener('click', onSummary);
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          form.dispatchEvent(new Event('submit'));
        }
      });
      input.addEventListener('input', autoResize);
    }

    initSelectionTooltip();
  }

  function openPanel() {
    state.open = true;
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    fab.setAttribute('aria-expanded', 'true');
    setTimeout(function () { if (input) input.focus(); }, 320);
  }

  function closePanel() {
    state.open = false;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    fab.setAttribute('aria-expanded', 'false');
  }

  function setLoading(on) {
    state.loading = on;
    if (sendBtn) sendBtn.disabled = on;
    if (summaryBtn) summaryBtn.disabled = on;
    if (input) input.disabled = on;

    if (on) {
      var el = document.createElement('div');
      el.className = 'aic-msg aic-msg--ai aic-msg--loading';
      el.id = 'aic-loading';
      el.innerHTML = '<div class="aic-bubble"><div class="aic-dot"></div><div class="aic-dot"></div><div class="aic-dot"></div></div>';
      messagesEl.appendChild(el);
      scrollToBottom();
    } else {
      var loading = document.getElementById('aic-loading');
      if (loading) loading.remove();
    }
  }

  function addMessage(role, content, cached) {
    state.messages.push({ role: role, content: content });

    var msg = document.createElement('div');
    msg.className = 'aic-msg aic-msg--' + (role === 'user' ? 'user' : 'ai');

    var bubble = document.createElement('div');
    bubble.className = 'aic-bubble';
    bubble.textContent = content;
    msg.appendChild(bubble);

    if (cached) {
      var badge = document.createElement('span');
      badge.className = 'aic-cached';
      badge.textContent = '(cached)';
      msg.appendChild(badge);
    }

    messagesEl.appendChild(msg);
    scrollToBottom();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }

  async function onSummary() {
    if (state.loading) return;

    var payload = buildPayload('summary', state.postCtx, []);
    setLoading(true);

    try {
      var data = await callAPI(payload);
      setLoading(false);
      addMessage('ai', data.reply, data.cached);
    } catch (err) {
      setLoading(false);
      addMessage('ai', 'ขออภัย เกิดข้อผิดพลาด: ' + err.message);
    }
  }

  async function onExplain(selection) {
    if (state.loading) return;
    if (!state.open) openPanel();

    addMessage('user', '"' + truncate(selection.text, 120) + '"');

    var payload = buildPayload('explain', state.postCtx, [], selection);
    setLoading(true);

    try {
      var data = await callAPI(payload);
      setLoading(false);
      addMessage('ai', data.reply);
    } catch (err) {
      setLoading(false);
      addMessage('ai', 'ขออภัย เกิดข้อผิดพลาด: ' + err.message);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (state.loading) return;

    var text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';
    addMessage('user', text);

    // Build chat history (exclude current message — already added)
    var history = state.messages.slice(0, -1).map(function (m) {
      return { role: m.role === 'user' ? 'user' : 'assistant', content: m.content };
    });
    history.push({ role: 'user', content: text });

    var payload = buildPayload('chat', state.postCtx, history);
    setLoading(true);

    try {
      var data = await callAPI(payload);
      setLoading(false);
      addMessage('ai', data.reply);
    } catch (err) {
      setLoading(false);
      addMessage('ai', 'ขออภัย เกิดข้อผิดพลาด: ' + err.message);
    }
  }

  // ── Selection tooltip ──────────────────────────────────────────────────────

  function initSelectionTooltip() {
    var tip = document.getElementById('ai-sel-tip');
    var btn = document.getElementById('ai-sel-btn');
    if (!tip || !btn) return;

    var currentSel = null;

    document.addEventListener('mouseup', function (e) {
      // Don't trigger inside the chat panel
      if (panel && panel.contains(e.target)) return;
      // Only inside post content
      var content = document.querySelector('.post-content');
      if (!content) return;

      setTimeout(function () {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) {
          hideTip();
          return;
        }

        var range = sel.getRangeAt(0);
        var selectedText = sel.toString().trim();
        if (selectedText.length < 10) { hideTip(); return; }

        // Confirm selection is inside .post-content
        if (!content.contains(range.commonAncestorContainer)) { hideTip(); return; }

        currentSel = {
          text: selectedText,
          heading: findSectionHeading(range.startContainer),
          surrounding: getSurroundingText(range),
        };

        var rect = range.getBoundingClientRect();
        var midX = rect.left + rect.width / 2 + window.scrollX;
        var topY = rect.top + window.scrollY;

        tip.style.left = midX + 'px';
        tip.style.top = topY + 'px';
        tip.classList.add('is-visible');
        tip.setAttribute('aria-hidden', 'false');
      }, 10);
    });

    document.addEventListener('mousedown', function (e) {
      if (!tip.contains(e.target)) hideTip();
    });

    btn.addEventListener('click', function () {
      if (currentSel) {
        hideTip();
        onExplain(currentSel);
        currentSel = null;
      }
    });

    function hideTip() {
      tip.classList.remove('is-visible');
      tip.setAttribute('aria-hidden', 'true');
    }
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
