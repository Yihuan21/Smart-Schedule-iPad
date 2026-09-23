const STORAGE_PREFIX = "smart_schedule_v2_";
const SCHEDULE_TIMING_KEY = STORAGE_PREFIX + "timing_v1";
const DEFAULT_SCHEDULE_TIMING = {standardPeriodMinutes:45, breakMinutes:10};

function loadScheduleTiming() {
  try {
    const raw = localStorage.getItem(SCHEDULE_TIMING_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const rawPeriod = Number(parsed.standardPeriodMinutes);
    const rawBreak = Number(parsed.breakMinutes);
    const standardPeriodMinutes = Math.min(180, Math.max(1, Number.isFinite(rawPeriod) ? rawPeriod : 45));
    const breakMinutes = Math.min(60, Math.max(0, Number.isFinite(rawBreak) ? rawBreak : 10));
    return {standardPeriodMinutes, breakMinutes};
  } catch {
    return {...DEFAULT_SCHEDULE_TIMING};
  }
}

function saveScheduleTiming(value={}) {
  const next = {
    standardPeriodMinutes: Math.min(180, Math.max(1, Number.isFinite(Number(value.standardPeriodMinutes)) ? Number(value.standardPeriodMinutes) : 45)),
    breakMinutes: Math.min(60, Math.max(0, Number.isFinite(Number(value.breakMinutes)) ? Number(value.breakMinutes) : 10))
  };
  localStorage.setItem(SCHEDULE_TIMING_KEY, JSON.stringify(next));
  return next;
}

function addMinutesToTime(time, minutes) {
  const total = timeToMinutesStorage(time) + Number(minutes || 0);
  const safe = Math.max(0, Math.min(23 * 60 + 59, total));
  return String(Math.floor(safe / 60)).padStart(2, "0") + ":" + String(safe % 60).padStart(2, "0");
}

function timeToMinutesStorage(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function endTimeForPeriods(start, periods, timing=loadScheduleTiming()) {
  const n = Math.max(1, Math.round(Number(periods) || 1));
  return addMinutesToTime(start, n * timing.standardPeriodMinutes + (n - 1) * timing.breakMinutes);
}

function getStorageKey(week) {
  return STORAGE_PREFIX + "w" + week;
}

function loadCourses(week) {
  try {
    const raw = localStorage.getItem(getStorageKey(week));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("读取课程失败", e);
    return [];
  }
}

function saveCourses(week, data) {
  localStorage.setItem(getStorageKey(week), JSON.stringify(normalizeCourses(data)));
}

function loadCurrentWeek() {
  const n = Number(localStorage.getItem(STORAGE_PREFIX + "current_week") || 1);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function saveCurrentWeek(week) {
  localStorage.setItem(STORAGE_PREFIX + "current_week", String(week));
}

function cleanupLegacyState() {
  if (localStorage.getItem(STORAGE_PREFIX + "cleanup_done") === "1") return;
  for (const key of Object.keys(localStorage)) {
    if (
      key === "schedule_ai_w3" ||
      key === "schedule_ai_w4" ||
      key === "schedule_ai_w5" ||
      key.startsWith("w3:") ||
      key.startsWith("w4:") ||
      key.startsWith("w5:")
    ) {
      localStorage.removeItem(key);
    }
  }
  localStorage.setItem(STORAGE_PREFIX + "cleanup_done", "1");
}

function normalizeCourses(list) {
  const days = ["周一","周二","周三","周四","周五","周六","周日"];
  const colors = ["#dbeafe","#dcfce7","#fef3c7","#fce7f3","#ede9fe","#cffafe","#e2e8f0"];
  if (!Array.isArray(list)) return [];

  return list.map((raw, i) => {
    const c = raw || {};
    const day = days.includes(c.day) ? c.day : inferDay(c.day);
    const periodsRaw = Number(c.periods ?? c.periodCount ?? c.lessonCount ?? 1);
    const periods = Number.isFinite(periodsRaw) ? Math.max(1, Math.min(20, Math.round(periodsRaw))) : 1;
    const start = normalizeTime(c.start || c.startTime || "08:00");
    let end = normalizeTime(c.end || c.endTime || "");
    if (!c.end && !c.endTime) end = endTimeForPeriods(start, periods);
    return {
      id: c.id || ("c_" + Date.now().toString(36) + "_" + i),
      title: String(c.title || c.name || c.course || "未命名课程").trim(),
      day,
      start,
      end,
      periods,
      room: String(c.room || c.location || "").trim(),
      color: /^#[0-9a-f]{6}$/i.test(c.color || "") ? c.color : colors[i % colors.length],
      type: String(c.type || "课程").trim(),
      task: String(c.task || c.assignment || "").trim(),
      confidence: Number.isFinite(Number(c.confidence)) ? Number(c.confidence) : 1,
      source: c.source || "manual"
    };
  }).filter(c => c.title);
}

function inferDay(v) {
  const s = String(v || "");
  const map = {
    "1":"周一","2":"周二","3":"周三","4":"周四","5":"周五","6":"周六","7":"周日",
    "一":"周一","二":"周二","三":"周三","四":"周四","五":"周五","六":"周六","日":"周日","天":"周日"
  };
  return map[s] || "周一";
}

function normalizeTime(v) {
  const s = String(v || "").trim().replace("：",":");
  const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return "08:00";
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2] || 0)));
  return String(h).padStart(2,"0") + ":" + String(min).padStart(2,"0");
}

cleanupLegacyState();
