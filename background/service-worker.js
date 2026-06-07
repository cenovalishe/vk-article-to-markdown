/**
 * Background Service Worker
 * Handles download requests and tab-level scripting
 */

'use strict';

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'download') {
    handleDownload(message).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // Keep channel open for async response
  }

  if (message.action === 'inject') {
    handleInject(message).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

/**
 * Inject content script into a tab if not yet loaded
 */
async function handleInject({ tabId }) {
  try {
    // Try pinging the content script first
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js'],
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Trigger file download
 */
async function handleDownload({ content, filename }) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const downloadId = await chrome.downloads.download({
      url,
      filename,
      saveAs: true,
    });
    // Revoke URL once download starts
    chrome.downloads.onChanged.addListener(function listener(delta) {
      if (delta.id === downloadId && delta.state?.current === 'complete') {
        URL.revokeObjectURL(url);
        chrome.downloads.onChanged.removeListener(listener);
      }
    });
    return { success: true, downloadId };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}
