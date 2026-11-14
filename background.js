const RULE_START = 1000;
const RULE_END = 1999;
const OVERRIDE_ALARM_PREFIX = "focusbox-override:";
const SESSION_ALARM = "focusbox-session-end";

const DEFAULT_STATE = {
  sites: ["youtube.com", "instagram.com", "tiktok.com"],
  modes: {
    STUDY: ["google.com", "wikipedia.org", "classroom.google.com"],
    READING: ["goodreads.com", "openlibrary.org"],
    CREATIVE: ["docs.google.com", "figma.com"],
    FILMMAKING: ["youtube.com", "vimeo.com", "docs.google.com"]
  },
  selectedMode: "STUDY",
  durationMinutes: 45,
  sessionActive: false,
  sessionEndAt: null,
  sessionStartedAt: null,
  overrides: {},
  stats: {
    totalSessions: 0,
    completedSessions: 0,
    blockedAttempts: 0,
    overrideRequests: 0,
    focusMinutes: 0
  },
  history: []
};

async function getState() {
  const saved = await chrome.storage.local.get("focusbox");
  return structuredClone({ ...DEFAULT_STATE, ...(saved.focusbox || {}) });
}

async function saveState(state) {
  await chrome.storage.local.set({ focusbox: state });
}

function cleanDomain(input) {
  let value = String(input || "").trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  value = value.replace(/^\*\./, "");
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) {
    throw new Error("Enter a valid domain, such as youtube.com");
  }
  return value;
}

async function applyRules() {
  const state = await getState();
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.filter(r => r.id >= RULE_START && r.id <= RULE_END).map(r => r.id);
  const now = Date.now();
  const activeOverrides = new Set(
    Object.entries(state.overrides || {})
      .filter(([, item]) => item.expiresAt > now)
      .map(([domain]) => domain)
  );

  let domains = [];
  if (state.sessionActive && state.sessionEndAt && state.sessionEndAt > now) {
    domains = [...new Set((state.sites || []).map(cleanDomain))].filter(d => !activeOverrides.has(d));
  }

  const addRules = domains.slice(0, RULE_END - RULE_START + 1).map((domain, index) => ({
    id: RULE_START + index,
    priority: 1,
    action: { type: "redirect", redirect: { extensionPath: "/blocked.html" } },
    condition: { urlFilter: `||${domain}^`, resourceTypes: ["main_frame"] }
  }));

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}

async function endSession(reason = "completed") {
  const state = await getState();
  if (!state.sessionActive) return state;
  const started = state.sessionStartedAt || Date.now();
  const elapsed = Math.max(0, Math.round((Date.now() - started) / 60000));
  state.sessionActive = false;
  state.sessionEndAt = null;
  state.sessionStartedAt = null;
  state.stats.totalSessions += 1;
  state.stats.focusMinutes += elapsed;
  if (reason === "completed") state.stats.completedSessions += 1;
  state.history.unshift({
    date: new Date().toISOString(),
    mode: state.selectedMode,
    minutes: elapsed,
    result: reason
  });
  state.history = state.history.slice(0, 100);
  await saveState(state);
  await chrome.alarms.clear(SESSION_ALARM);
  await applyRules();
  return state;
}

chrome.runtime.onInstalled.addListener(async () => {
  const saved = await chrome.storage.local.get("focusbox");
  if (!saved.focusbox) await saveState(DEFAULT_STATE);
  await applyRules();
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === SESSION_ALARM) {
    await endSession("completed");
    return;
  }
  if (alarm.name.startsWith(OVERRIDE_ALARM_PREFIX)) {
    const domain = alarm.name.slice(OVERRIDE_ALARM_PREFIX.length);
    const state = await getState();
    delete state.overrides[domain];
    await saveState(state);
    await applyRules();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      let state = await getState();
      switch (message.type) {
        case "GET_STATE":
          sendResponse({ ok: true, state });
          return;
        case "START_SESSION": {
          const minutes = Math.max(1, Math.min(240, Number(message.minutes) || 45));
          state.selectedMode = String(message.mode || "STUDY");
          state.durationMinutes = minutes;
          state.sessionActive = true;
          state.sessionStartedAt = Date.now();
          state.sessionEndAt = Date.now() + minutes * 60000;
          state.overrides = {};
          await saveState(state);
          await chrome.alarms.create(SESSION_ALARM, { when: state.sessionEndAt });
          await applyRules();
          sendResponse({ ok: true, state });
          return;
        }
        case "END_SESSION":
          state = await endSession("ended-early");
          sendResponse({ ok: true, state });
          return;
        case "ADD_SITE": {
          const domain = cleanDomain(message.domain);
          if (!state.sites.includes(domain)) state.sites.push(domain);
          await saveState(state);
          await applyRules();
          sendResponse({ ok: true, state });
          return;
        }
        case "REMOVE_SITE": {
          const domain = cleanDomain(message.domain);
          state.sites = state.sites.filter(d => d !== domain);
          delete state.overrides[domain];
          await saveState(state);
          await applyRules();
          sendResponse({ ok: true, state });
          return;
        }
        case "REQUEST_OVERRIDE": {
          const domain = cleanDomain(message.domain);
          const reason = String(message.reason || "").trim();
          if (reason.length < 12) throw new Error("Please explain your reason in at least 12 characters.");
          if (!state.sessionActive) throw new Error("There is no active focus session.");
          if (!state.sites.includes(domain)) throw new Error("That domain is not on your blocklist.");
          const minutes = Math.max(1, Math.min(15, Number(message.minutes) || 5));
          const expiresAt = Date.now() + minutes * 60000;
          state.overrides[domain] = { expiresAt, reason };
          state.stats.overrideRequests += 1;
          state.history.unshift({
            date: new Date().toISOString(),
            mode: state.selectedMode,
            minutes,
            result: "temporary-override",
            domain,
            reason
          });
          state.history = state.history.slice(0, 100);
          await saveState(state);
          await chrome.alarms.create(OVERRIDE_ALARM_PREFIX + domain, { when: expiresAt });
          await applyRules();
          sendResponse({ ok: true, state, message: `${domain} allowed for ${minutes} minute(s).` });
          return;
        }
        case "BLOCKED_ATTEMPT": {
          state.stats.blockedAttempts += 1;
          await saveState(state);
          sendResponse({ ok: true, state });
          return;
        }
        case "UPDATE_SETTINGS": {
          state.selectedMode = String(message.mode || state.selectedMode);
          state.durationMinutes = Math.max(1, Math.min(240, Number(message.minutes) || state.durationMinutes));
          await saveState(state);
          sendResponse({ ok: true, state });
          return;
        }
        default:
          throw new Error("Unknown command.");
      }
    } catch (error) {
      sendResponse({ ok: false, error: error.message || String(error) });
    }
  })();
  return true;
});
