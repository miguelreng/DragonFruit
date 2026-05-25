// @ts-nocheck

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_TWEET_RECT") return false;
  const article = document.querySelector('article[data-testid="tweet"]') || document.querySelector("article");
  if (!article) {
    sendResponse(null);
    return false;
  }
  article.scrollIntoView({ block: "center", inline: "center" });
  const rect = article.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  sendResponse({
    x: Math.max(0, rect.left * scale),
    y: Math.max(0, rect.top * scale),
    width: Math.max(1, rect.width * scale),
    height: Math.max(1, rect.height * scale),
  });
  return false;
});
