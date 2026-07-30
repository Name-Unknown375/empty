// Toolbar click → open the planner in a tab. The whole app is planner.html;
// this service worker exists only for this handler.
//
// ?partner=chrome-extension tags the planner's analytics events (planner.js
// includes the slug in every track() payload) so extension usage is
// distinguishable from site/embed usage. The slug is NOT in the partner
// co-brand allowlist, so it has no UI effect.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('planner.html') + '?partner=chrome-extension' });
});
