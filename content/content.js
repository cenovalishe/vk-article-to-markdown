/**
 * VK Article to Markdown — Content Script
 * Converts VK article DOM to clean Markdown text.
 */

(function () {
  'use strict';

  if (window._vkMdExporterReady) return;
  window._vkMdExporterReady = true;

  // ─── Skip rules: UI chrome, placeholders, editor controls ────────────────

  /** CSS class fragments that mark non-content nodes */
  const SKIP_CLASS = [
    'article_ed_hover',
    'article_ed_paragraph_tools',
    'article_ed_guide',
    'article_ed__extra_controls',
    'article_ed__obj_edit',
    'article_ed__warn',
    'article_ed__select',
    'article_ed__caredit',
    'article_anchor_button',
    'article_anchor_tooltip',
    'article_ed__noconteditable',
    'article_ed_layer__list',           // article list sidebar
    'article_ed_layer__publish',        // publish settings panel
    'article_ed__figcaption_edit',      // editor pencil/edit overlay on captions
    'article_ed__caption_placeholder',  // "Добавьте описание" placeholder
    // Published article page chrome
    'article_layer__header',            // author name + publication date block
    'article_layer__simple_footer',     // "Н просмотров" footer
    'article_layer__tts_player',        // text-to-speech player
    'article_layer__top_actions',       // top action buttons (share, etc.)
    'article_layer__up',                // "назад" button
    'article_layer_misc',               // misc UI elements
  ];

  /** Placeholder text strings VK injects into empty editor blocks */
  const PLACEHOLDER_ATTRS = [
    'data-placeholder',
    'data-text',
  ];

  function shouldSkip(el) {
    // Check CSS classes
    const cls = typeof el.className === 'string'
      ? el.className
      : (el.className?.baseVal || '');

    for (const p of SKIP_CLASS) {
      if (cls.includes(p)) return true;
    }

    // Skip aria-hidden UI decorations
    if (el.getAttribute('aria-hidden') === 'true') return true;
    if (el.hasAttribute('hidden')) return true;

    // Skip editor placeholder spans/divs (empty blocks with placeholder text)
    // These have data-placeholder attribute and are empty content-wise
    for (const attr of PLACEHOLDER_ATTRS) {
      if (el.hasAttribute(attr) && el.textContent.trim() === '') return true;
    }

    return false;
  }

  /** Check if text is a VK editor placeholder (e.g. "Добавьте описание") */
  function isPlaceholderText(text) {
    const t = text.trim();
    const PLACEHOLDERS = [
      'Добавьте описание',
      'Добавьте заголовок',
      'Введите текст',
      'Add a caption',
      'Add a heading',
    ];
    return PLACEHOLDERS.includes(t);
  }

  // ─── Node → Markdown ──────────────────────────────────────────────────────

  function nodeToMd(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    if (shouldSkip(node)) return '';

    const tag = node.tagName.toLowerCase();
    const kids = () => Array.from(node.childNodes).map(nodeToMd).join('');

    switch (tag) {
      // ── Headings ──
      case 'h1': {
        const t = kids().trim();
        return t ? `# ${t}\n\n` : '';
      }
      case 'h2': {
        const t = kids().trim();
        return t ? `## ${t}\n\n` : '';
      }
      case 'h3': {
        const t = kids().trim();
        return t ? `### ${t}\n\n` : '';
      }
      case 'h4': return kids().trim() ? `#### ${kids().trim()}\n\n` : '';
      case 'h5': return kids().trim() ? `##### ${kids().trim()}\n\n` : '';
      case 'h6': return kids().trim() ? `###### ${kids().trim()}\n\n` : '';

      // ── Paragraphs ──
      case 'p': {
        const t = kids().trim();
        return t ? `${t}\n\n` : '';
      }

      case 'br': return '\n';

      // ── Inline formatting ──
      case 'strong':
      case 'b': {
        const t = kids();
        const trimmed = t.trim();
        if (!trimmed) return t; // preserve spaces around empty bold
        // Preserve leading/trailing spaces outside the markers
        const lead  = t.match(/^\s*/)[0];
        const trail = t.match(/\s*$/)[0];
        return `${lead}**${trimmed}**${trail}`;
      }

      case 'em':
      case 'i': {
        const t = kids();
        const trimmed = t.trim();
        if (!trimmed) return t;
        const lead  = t.match(/^\s*/)[0];
        const trail = t.match(/\s*$/)[0];
        return `${lead}*${trimmed}*${trail}`;
      }

      case 's':
      case 'del':
      case 'strike': {
        const trimmed = kids().trim();
        return trimmed ? `~~${trimmed}~~` : '';
      }

      case 'u': {
        const trimmed = kids().trim();
        return trimmed ? `<u>${trimmed}</u>` : '';
      }

      case 'code': return `\`${node.textContent}\``;

      case 'pre': {
        const codeEl = node.querySelector('code');
        const content = (codeEl ?? node).textContent.trim();
        const lang = codeEl?.className?.match(/language-(\w+)/)?.[1] ?? '';
        return `\`\`\`${lang}\n${content}\n\`\`\`\n\n`;
      }

      // ── Blockquote ──
      case 'blockquote': {
        const inner = kids().trim();
        if (!inner) return '';
        return inner.split('\n').map(l => `> ${l}`).join('\n') + '\n\n';
      }

      // ── Links ──
      case 'a': {
        const href = node.getAttribute('href') || '';
        const text = kids().trim();
        if (!text) return '';
        // Internal anchor → skip as link, keep text
        if (!href || href === '#') return text;
        const url = href.startsWith('http') ? href : `${location.origin}${href.startsWith('/') ? '' : '/'}${href}`;
        return `[${text}](${url})`;
      }

      // ── Images — skipped (text-only export) ──
      case 'img': {
        // Preserve emoji alt text
        if (node.classList.contains('emoji')) return node.getAttribute('alt') || '';
        return '';
      }

      // ── Figure: skip image, return only the caption text ──
      case 'figure': {
        // Look for figcaption INSIDE the figure only.
        // Sibling figcaptions (VK editor standalone divs) are handled
        // by case 'div' below to avoid double-rendering.
        const cap =
          node.querySelector('figcaption') ||
          node.querySelector('.article_ed__figcaption');
        if (!cap) return '';
        return extractFigcaptionText(cap);
      }

      // ── div elements ──
      case 'div': {
        const cls = typeof node.className === 'string' ? node.className : '';

        // article_ed__figcaption — VK editor caption block (sibling or nested).
        // Render unconditionally; placeholder children are already in SKIP_CLASS.
        // Note: article_ed__figcaption_edit (edit button) is in SKIP_CLASS
        //       so it won't match here even though it starts with the same prefix.
        if (cls.includes('article_ed__figcaption') &&
            !cls.includes('article_ed__figcaption_edit')) {
          return extractFigcaptionText(node);
        }

        return kids();
      }

      // ── Lists ──
      case 'ul': {
        const items = Array.from(node.children)
          .filter(c => c.tagName.toLowerCase() === 'li')
          .map(li => `- ${nodeToMd(li).trim()}`)
          .join('\n');
        return items ? `${items}\n\n` : '';
      }
      case 'ol': {
        const items = Array.from(node.children)
          .filter(c => c.tagName.toLowerCase() === 'li')
          .map((li, i) => `${i + 1}. ${nodeToMd(li).trim()}`)
          .join('\n');
        return items ? `${items}\n\n` : '';
      }
      case 'li': return kids();

      case 'hr': return '---\n\n';

      case 'table': return convertTable(node);

      // ── Skip purely structural UI ──
      case 'script':
      case 'style':
      case 'noscript':
      case 'svg':
      case 'button':
      case 'nav':
        return '';

      default:
        return kids();
    }
  }

  function convertTable(table) {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (!rows.length) return '';
    const toRow = cells =>
      '| ' + cells.map(c => c.textContent.trim().replace(/\|/g, '\\|')).join(' | ') + ' |';
    const heads = Array.from(rows[0].querySelectorAll('th, td'));
    const sep   = '| ' + heads.map(() => '---').join(' | ') + ' |';
    return [
      toRow(heads),
      sep,
      ...rows.slice(1).map(r => toRow(Array.from(r.querySelectorAll('td, th')))),
    ].join('\n') + '\n\n';
  }

  // ─── Find the article body ─────────────────────────────────────────────────

  function findArticleContainer() {
    const SELECTORS = [
      '.article_editor_canvas',
      '.article_view',
      '.article_theme',
      '.article_ed_layer__content',
      '.article_layer__content',
      '.ArticleView',
      '.ArticleBody',
      '.article_body',
      '.article_content',
      '.article__content',
      '[data-testid="article_view"]',
      '[data-testid="article_content"]',
      '[class*="article_layer"]',
      '[class*="ArticleView"]',
      '[contenteditable="true"]',
    ];

    for (const sel of SELECTORS) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (el.getClientRects().length === 0 && el.offsetHeight === 0) continue;
        if (el.textContent.trim().length > 5) {
          return el;
        }
      }
    }

    return null;
  }

  // ─── Extract title (deduplicated) ─────────────────────────────────────────

  function extractTitle(container) {
    const h1 = container?.querySelector('h1, .article_title, .ArticleTitle, [class*="article_title"]');
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();

    const pageH1 = document.querySelector('h1');
    if (pageH1 && pageH1.textContent.trim()) return pageH1.textContent.trim();

    const titleMeta = document.querySelector('meta[property="og:title"]');
    if (titleMeta && titleMeta.content) return titleMeta.content.trim();

    return document.title
      .replace(/ [|–—-] ВКонтакте$/, '')
      .replace(/ [|–—-] VK$/, '')
      .trim();
  }

  // ─── Build clean Markdown ─────────────────────────────────────────────────

  function buildMarkdown(container, title) {
    let md = nodeToMd(container);

    // Remove duplicate title if the H1 appears at the very start
    const titleMd = `# ${title}\n\n`;
    if (md.startsWith(titleMd)) {
      md = md.slice(titleMd.length);
    }
    // Also deduplicate if it appears twice
    md = md.replace(new RegExp(`^(${escapeRe(titleMd)})+`), titleMd);

    // Final assembly: just title + body, no front-matter
    let result = title ? `# ${title}\n\n` : '';
    result += md;

    // Cleanup
    result = result
      .replace(/\n{4,}/g, '\n\n\n')  // max 3 blank lines
      .replace(/[ \t]+\n/g, '\n')    // trailing whitespace
      .replace(/\n{3,}$/g, '\n')     // trailing blank lines
      .trimStart();

    return result + '\n';
  }

  /**
   * Extract text from a figcaption element.
   * Skips placeholder children (article_ed__caption_placeholder, figcaption_edit).
   * Returns only the contenteditable / real text child content.
   */
  function extractFigcaptionText(captionEl) {
    // shouldSkip already handles article_ed__caption_placeholder and figcaption_edit.
    // We just render all children through nodeToMd — skippable ones return ''.
    const inner = Array.from(captionEl.childNodes)
      .map(nodeToMd)
      .join('')
      .trim();

    if (!inner || isPlaceholderText(inner)) return '';
    return `${inner}\n\n`;
  }

  function escapeRe(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ─── Count plain-text characters (no MD markup) ───────────────────────────────────

  function countPlainChars(md) {
    const plain = md
      // Code blocks first (preserve content, strip fences)
      .replace(/```[\s\S]*?```/g, m => m.replace(/```\w*\n?/g, ''))
      // Inline code — strip backticks
      .replace(/`([^`]+)`/g, '$1')
      // Images: ![alt](url) → nothing
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      // Links: [text](url) → text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Bold/italic: ***text***, **text**, *text*, ___text___, __text__, _text_
      .replace(/(\*{1,3}|_{1,3})(.+?)\1/g, '$2')
      // Strikethrough: ~~text~~
      .replace(/~~(.+?)~~/g, '$1')
      // HTML tags like <u>...</u>
      .replace(/<[^>]+>/g, '')
      // Heading markers: # ## ###
      .replace(/^#{1,6}\s+/gm, '')
      // Blockquote markers
      .replace(/^>\s*/gm, '')
      // Unordered list markers
      .replace(/^[-*+]\s+/gm, '')
      // Ordered list markers
      .replace(/^\d+\.\s+/gm, '')
      // Horizontal rules
      .replace(/^-{3,}$/gm, '')
      // Collapse all whitespace (spaces, tabs, newlines) into nothing
      // We count only non-whitespace + spaces between words
      .replace(/[ \t\r\n]+/g, ' ')
      .trim();

    return plain.length;
  }

  // ─── Main ─────────────────────────────────────────────────────────────────

  function extractArticle() {
    const container = findArticleContainer();

    if (!container) {
      return {
        success: false,
        error: 'Не найден контейнер статьи. Убедитесь, что страница полностью загружена.',
      };
    }

    try {
      const title     = extractTitle(container);
      const markdown  = buildMarkdown(container, title);
      const charCount = countPlainChars(markdown);
      return { success: true, markdown, title, charCount };
    } catch (err) {
      return { success: false, error: `Ошибка: ${err.message}` };
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'extract') {
      try {
        sendResponse(extractArticle());
      } catch (err) {
        sendResponse({ success: false, error: `Ошибка при извлечении: ${err.message}` });
      }
      return false;
    } else if (message.action === 'ping') {
      sendResponse({ ready: true });
      return false;
    }
  });
})();
