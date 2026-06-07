/**
 * VK Article to Markdown — Popup Logic
 * Manages UI state, triggers extraction, and initiates download
 */

'use strict';

/* ---- DOM References ---- */
const $   = (id) => document.getElementById(id);
const app = {
  spinner:        $('spinner'),
  iconCheck:      $('iconCheck'),
  iconError:      $('iconError'),
  iconInfo:       $('iconInfo'),
  statusCard:     $('statusCard'),
  statusMessage:  $('statusMessage'),
  statusDetail:   $('statusDetail'),
  articleInfo:    $('articleInfo'),
  articleTitle:   $('articleTitle'),
  articleMeta:    $('articleMeta'),
  previewSection: $('previewSection'),
  previewContent: $('previewContent'),
  btnExport:      $('btnExport'),
  btnRetry:       $('btnRetry'),
  btnCopy:        $('btnCopy'),
  btnCopyLabel:   $('btnCopyLabel'),
};

/* ---- State ---- */
let currentMarkdown = '';
let currentTitle    = '';
let activeTab       = null;

/* ---- UI Helpers ---- */

function showSpinner() {
  app.spinner.classList.remove('hidden');
  app.iconCheck.classList.add('hidden');
  app.iconError.classList.add('hidden');
  app.iconInfo.classList.add('hidden');
}

function showIcon(type) {
  app.spinner.classList.add('hidden');
  app.iconCheck.classList.toggle('hidden', type !== 'check');
  app.iconError.classList.toggle('hidden', type !== 'error');
  app.iconInfo.classList.toggle('hidden', type !== 'info');
}

function setStatus(icon, message, detail = '', cardClass = '') {
  showIcon(icon);
  app.statusMessage.textContent = message;
  app.statusDetail.textContent  = detail;

  app.statusCard.classList.remove('is-success', 'is-error', 'is-warning');
  if (cardClass) app.statusCard.classList.add(cardClass);
}

function showArticleInfo(title, meta) {
  app.articleTitle.textContent = title || 'Без названия';
  app.articleMeta.textContent  = meta;
  app.articleInfo.classList.remove('hidden');
}

function showPreview(markdown) {
  // Show first ~600 chars of markdown as preview
  const preview = markdown.slice(0, 600) + (markdown.length > 600 ? '\n…' : '');
  app.previewContent.textContent = preview;
  app.previewSection.classList.remove('hidden');
}

function setExportEnabled(enabled) {
  app.btnExport.disabled = !enabled;
}

function showRetry(visible) {
  app.btnRetry.classList.toggle('hidden', !visible);
}

/* ---- Filename sanitizer ---- */
function sanitizeFilename(name) {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-{2,}/g, '-')
    .slice(0, 80) || 'vk_article';
}

/* ---- Main flow ---- */

async function init() {
  showSpinner();
  app.statusMessage.textContent = 'Проверяю страницу…';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;

    if (!tab) {
      setStatus('error', 'Не удалось получить текущую вкладку', '', 'is-error');
      return;
    }

    const url = tab.url || '';

    // Check if this is a VK article page
    if (!isVKArticlePage(url)) {
      setStatus(
        'info',
        'Это не страница статьи ВКонтакте',
        'Откройте статью на vk.com/@slug или через редактор статей и нажмите иконку снова.',
        'is-warning'
      );
      return;
    }

    setStatus('', 'Извлекаю содержимое статьи…');
    showSpinner();

    // Inject content script (in case page was loaded before extension)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content.js'],
      });
    } catch {
      // Already injected — that's fine
    }

    // Wait a moment for the script to settle
    await sleep(200);

    // Send extraction request
    const result = await sendToTab(tab.id, { action: 'extract' });

    if (!result || !result.success) {
      const errMsg = result?.error || 'Неизвестная ошибка';
      setStatus('error', 'Не удалось извлечь статью', errMsg, 'is-error');
      showRetry(true);
      return;
    }

    // Success!
    currentMarkdown = result.markdown;
    currentTitle    = result.title || 'article';

    setStatus('check', 'Готово к экспорту!', '', 'is-success');
    showArticleInfo(result.title, `Размер: ${formatSize(result.markdown.length)}`);
    showPreview(result.markdown);
    setExportEnabled(true);

  } catch (err) {
    setStatus('error', 'Ошибка', err.message, 'is-error');
    showRetry(true);
  }
}

/**
 * Detects VK article pages by URL pattern.
 * Supported formats:
 *   vk.com/@group-article-slug          — published article
 *   vk.com/group?z=article{id}_{oid}    — article viewer overlay
 *   vk.com/group?z=article_edit{id}...  — article editor
 */
function isVKArticlePage(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host !== 'vk.com') return false;

    // Format 1: vk.com/@slug
    if (u.pathname.startsWith('/@')) return true;

    // Format 2: vk.com/anything?z=article... or ?z=article_edit...
    const z = u.searchParams.get('z') || '';
    if (/^article/.test(z)) return true;

    return false;
  } catch {
    return false;
  }
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  return `${(bytes / 1024).toFixed(1)} КБ`;
}

/* ---- Event handlers ---- */

async function handleExport() {
  if (!currentMarkdown) return;

  const filename = `${sanitizeFilename(currentTitle)}.md`;

  app.btnExport.disabled = true;
  app.btnExport.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style="width:15px;height:15px">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" stroke-dasharray="56" stroke-dashoffset="20"
        style="animation: spin 0.8s linear infinite; transform-origin:center;"/>
    </svg>
    Сохраняю…
  `;

  try {
    // Use chrome.downloads via service worker (offscreen-safe approach)
    const blob = new Blob([currentMarkdown], { type: 'text/markdown;charset=utf-8' });
    const dataUrl = await blobToDataUrl(blob);

    await chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: true,
    });

    setStatus('check', 'Файл сохранён!', filename, 'is-success');
  } catch (err) {
    setStatus('error', 'Не удалось сохранить файл', err.message, 'is-error');
  } finally {
    app.btnExport.disabled = false;
    app.btnExport.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      Скачать .md файл
    `;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function handleCopy() {
  if (!currentMarkdown) return;

  try {
    await navigator.clipboard.writeText(currentMarkdown);
    app.btnCopy.classList.add('btn--copied');
    app.btnCopyLabel.textContent = 'Скопировано!';
    setTimeout(() => {
      app.btnCopy.classList.remove('btn--copied');
      app.btnCopyLabel.textContent = 'Копировать';
    }, 2000);
  } catch {
    app.btnCopyLabel.textContent = 'Ошибка!';
    setTimeout(() => {
      app.btnCopyLabel.textContent = 'Копировать';
    }, 2000);
  }
}

/* ---- Wire events ---- */
app.btnExport.addEventListener('click', handleExport);
app.btnRetry.addEventListener('click', () => {
  app.articleInfo.classList.add('hidden');
  app.previewSection.classList.add('hidden');
  showRetry(false);
  setExportEnabled(false);
  init();
});
app.btnCopy.addEventListener('click', handleCopy);

/* ---- Boot ---- */
document.addEventListener('DOMContentLoaded', init);
