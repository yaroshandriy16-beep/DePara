(() => {
  "use strict";
  const CATALOG_URL = "./data/catalog.json";
  let catalog = { faculties: [] };
  let selectedGroupId = "";
  const DATA_URL = () => selectedGroupId ? `./data/groups/${encodeURIComponent(selectedGroupId)}.json` : null;
  const CACHE_KEY = (id) => `vnau-schedule-cache-v2-${id}`;
  const SETTINGS_KEY = "vnau-settings-v2";
  const $ = (id) => document.getElementById(id);
  let scheduleData = { meta: {}, lessons: [] };
  let lastChecked = null;
  let dataOrigin = "GitHub";
  let toastTimer;

  const dateFormatter = new Intl.DateTimeFormat("uk-UA", { weekday: "long", day: "numeric", month: "long" });
  const dateShort = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short" });
  const timeNow = () => new Date();
  const safeText = (value) => String(value ?? "").trim();

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function getSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch (_) { return {}; }
  }
  function fillSelect(id, entries, placeholder) {
    const el = $(id); el.replaceChildren();
    el.add(new Option(placeholder, ""));
    entries.forEach(entry => el.add(new Option(entry.label, String(entry.value))));
  }
  function updateCourses(preferred = "") {
    const faculty = catalog.faculties.find(f => String(f.id) === $("facultySelect").value);
    fillSelect("courseSelect", (faculty?.courses || []).map(c => ({value:c.course,label:`${c.course} курс`})), "Виберіть курс");
    if ([...$("courseSelect").options].some(o => o.value === String(preferred))) $("courseSelect").value = String(preferred);
    updateGroups();
  }
  function updateGroups(preferred = "") {
    const faculty = catalog.faculties.find(f => String(f.id) === $("facultySelect").value);
    const course = faculty?.courses.find(c => String(c.course) === $("courseSelect").value);
    fillSelect("groupInput", (course?.groups || []).map(g => ({value:g.id,label:g.name})), "Виберіть групу");
    if ([...$("groupInput").options].some(o => o.value === String(preferred))) $("groupInput").value = String(preferred);
  }
  async function loadCatalog() {
    try {
      const response = await fetch(CATALOG_URL + "?v=" + Date.now(), {cache:"no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.faculties) || !data.faculties.length) throw new Error("Порожній каталог");
      catalog = data;
      try { localStorage.setItem("vnau-catalog-cache-v2", JSON.stringify(data)); } catch (_) {}
    } catch (error) {
      try { catalog = JSON.parse(localStorage.getItem("vnau-catalog-cache-v2") || "null") || {faculties:[]}; } catch (_) {}
      if (!catalog.faculties.length) toast("Не вдалося завантажити каталог груп.");
    }
    fillSelect("facultySelect", catalog.faculties.map(f => ({value:f.id,label:f.name})), "Виберіть факультет");
    const saved = getSettings();
    const preferredFaculty = saved.faculty || "7";
    if ([...$("facultySelect").options].some(o => o.value === String(preferredFaculty))) $("facultySelect").value = String(preferredFaculty);
    else if (catalog.faculties[0]) $("facultySelect").value = String(catalog.faculties[0].id);
    updateCourses(saved.course || "4");
    updateGroups(saved.groupId || "3641");
    selectedGroupId = $("groupInput").value;
    updateGroupLabel();
    await refreshSchedule({silent:true});
  }
  function saveSettings() {
    const settings = {
      theme: document.body.classList.contains("light-theme") ? "light" : "dark",
      faculty: $("facultySelect").value, course: $("courseSelect").value,
      groupId: $("groupInput").value
    };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) {}
  }
  function updateGroupLabel() {
    $("selectedGroupLabel").textContent = $("groupInput").selectedOptions[0]?.textContent || "Оберіть групу";
  }

  function normalizeData(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.lessons)) {
      throw new Error("Формат JSON неправильний: потрібен масив lessons.");
    }
    const lessons = data.lessons.map((lesson, index) => {
      if (!lesson || !lesson.date || !lesson.start || !lesson.end || !lesson.subject) {
        throw new Error(`Заняття №${index + 1}: потрібні date, start, end і subject.`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(lesson.date) || !/^\d{2}:\d{2}$/.test(lesson.start) || !/^\d{2}:\d{2}$/.test(lesson.end)) {
        throw new Error(`Заняття №${index + 1}: перевір формат дати/часу.`);
      }
      return {
        date: lesson.date, start: lesson.start, end: lesson.end,
        subject: safeText(lesson.subject), room: safeText(lesson.room),
        teacher: safeText(lesson.teacher), type: safeText(lesson.type),
        note: safeText(lesson.note)
      };
    });
    lessons.sort((a,b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
    return { meta: data.meta && typeof data.meta === "object" ? data.meta : {}, lessons };
  }

  function saveScheduleCache(data, origin) {
    try {
      localStorage.setItem(CACHE_KEY(selectedGroupId), JSON.stringify({
        savedAt: new Date().toISOString(), origin, data
      }));
      $("cacheStatus").textContent = `Збережено ${new Date().toLocaleString("uk-UA")}`;
    } catch (_) {
      $("cacheStatus").textContent = "Браузер не дозволив зберегти кеш";
    }
  }

  function readScheduleCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY(selectedGroupId)) || "null");
      if (cached && cached.data) {
        scheduleData = normalizeData(cached.data);
        dataOrigin = "Кеш пристрою";
        $("cacheStatus").textContent = `Збережено ${new Date(cached.savedAt).toLocaleString("uk-UA")}`;
        return true;
      }
    } catch (_) {}
    $("cacheStatus").textContent = "Кеш ще не створено";
    return false;
  }

  async function refreshSchedule({ silent = false } = {}) {
    if (!selectedGroupId) { scheduleData = {meta:{},lessons:[]}; renderAll(); updateReliability("empty"); return; }
    lastChecked = new Date();
    $("lastChecked").textContent = lastChecked.toLocaleString("uk-UA");
    $("connectionPill").innerHTML = `<i></i> ${navigator.onLine ? "Онлайн" : "Офлайн"}`;
    if (!navigator.onLine) {
      const gotCache = readScheduleCache();
      renderAll();
      updateReliability(gotCache ? "cache" : "offline-empty");
      if (!silent) toast(gotCache ? "Показано збережений розклад офлайн." : "Немає інтернету й збережених даних.");
      return;
    }
    try {
      const response = await fetch(DATA_URL() + "?v=" + Date.now(), { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = normalizeData(await response.json());
      scheduleData = parsed;
      dataOrigin = DATA_URL();
      saveScheduleCache(scheduleData, dataOrigin);
      renderAll();
      updateReliability(scheduleData.lessons.length ? "fresh" : "empty");
      if (!silent) toast(scheduleData.lessons.length ? "Розклад перевірено й оновлено." : "Файл завантажено, але заняття ще не внесені.");
    } catch (error) {
      const gotCache = readScheduleCache();
      renderAll();
      updateReliability(gotCache ? "cache" : "error");
      if (!silent) toast(gotCache ? "Не вдалося оновити — показано кеш." : "Не вдалося завантажити файл групи. Перевір GitHub.");
      console.warn("Schedule fetch failed:", error);
    }
  }

  function updateReliability(status) {
    const labels = {
      fresh: ["Дані завантажено", "Актуально", "tag-green"],
      empty: ["Файл доступний, занять немає", "Потрібен імпорт", "tag-warning"],
      cache: ["Показано збережену копію", "Кеш", "tag-warning"],
      "offline-empty": ["Офлайн, даних немає", "Офлайн", "tag-warning"],
      error: ["Не вдалося завантажити дані", "Помилка", "tag-warning"]
    };
    const item = labels[status] || labels.error;
    $("dataStatus").textContent = item[0];
    $("dataStatusBadge").textContent = item[1];
    $("dataStatusBadge").className = "tag " + item[2];
    $("dataSource").textContent = dataOrigin;
    $("connectionPill").innerHTML = `<i></i> ${navigator.onLine ? "Онлайн" : "Офлайн"}`;
  }

  function activeLessons() {
    const chosenGroup = safeText($("groupInput").selectedOptions[0]?.textContent).toLocaleLowerCase("uk-UA");
    const dataGroup = safeText(scheduleData.meta.group).toLocaleLowerCase("uk-UA");
    // This starter JSON contains one group's schedule. Never show it under another group label.
    if (dataGroup && chosenGroup && dataGroup !== chosenGroup) return [];
    return scheduleData.lessons;
  }

  function lessonDateTime(lesson) { return new Date(`${lesson.date}T${lesson.start}:00`); }
  function getNextLesson() {
    const now = timeNow();
    return activeLessons().find(lesson => lessonDateTime(lesson) > now) || null;
  }

  function renderCountdown() {
    const lesson = getNextLesson();
    if (!lesson) {
      const groupMismatch = safeText(scheduleData.meta.group) && safeText($("groupInput").selectedOptions[0]?.textContent) && safeText(scheduleData.meta.group).toLocaleLowerCase("uk-UA") !== safeText($("groupInput").selectedOptions[0]?.textContent).toLocaleLowerCase("uk-UA");
      $("nextSubject").textContent = groupMismatch ? "Для цієї групи даних немає" : (scheduleData.lessons.length ? "Усі заняття вже минули" : "Розклад ще не додано");
      $("nextDetails").textContent = groupMismatch ? `Файл schedule.json містить групу ${scheduleData.meta.group}. Імпортуй дані для ${safeText($("groupInput").selectedOptions[0]?.textContent)}.` : (scheduleData.lessons.length ? "Перевір іншу дату або онови schedule.json." : "На вибраний період занять немає або дані ще не опубліковані.");
      $("nextDate").textContent = "—";
      $("nextRoom").textContent = "Аудиторія —";
      $("nextType").textContent = scheduleData.lessons.length ? "На цей момент" : "Очікуємо дані";
      ["countDays","countHours","countMinutes","countSeconds"].forEach(id => $(id).textContent = "--");
      return;
    }
    const target = lessonDateTime(lesson);
    const delta = Math.max(0, target - timeNow());
    const days = Math.floor(delta / 86400000);
    const hours = Math.floor((delta % 86400000) / 3600000);
    const minutes = Math.floor((delta % 3600000) / 60000);
    const seconds = Math.floor((delta % 60000) / 1000);
    $("countDays").textContent = String(days).padStart(2,"0");
    $("countHours").textContent = String(hours).padStart(2,"0");
    $("countMinutes").textContent = String(minutes).padStart(2,"0");
    $("countSeconds").textContent = String(seconds).padStart(2,"0");
    $("nextSubject").textContent = lesson.subject;
    $("nextDetails").textContent = `${dateFormatter.format(target)} • ${lesson.start}–${lesson.end}${lesson.teacher ? " • " + lesson.teacher : ""}`;
    $("nextDate").textContent = dateShort.format(target);
    $("nextRoom").textContent = lesson.room ? `Аудиторія ${lesson.room}` : "Аудиторія не вказана";
    $("nextType").textContent = lesson.type || "Заняття";
  }

  function renderSchedule() {
    const query = safeText($("searchInput").value).toLocaleLowerCase("uk-UA");
    const selectedDate = $("dateFilter").value;
    const list = activeLessons().filter(lesson => {
      const haystack = [lesson.subject, lesson.teacher, lesson.room, lesson.type, lesson.note, lesson.date].join(" ").toLocaleLowerCase("uk-UA");
      return (!query || haystack.includes(query)) && (!selectedDate || lesson.date === selectedDate);
    });
    const container = $("scheduleList");
    container.replaceChildren();
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const icon = document.createElement("span"); icon.className = "empty-icon"; icon.textContent = "▦";
      const title = document.createElement("strong");
      const groupMismatch = safeText(scheduleData.meta.group) && safeText($("groupInput").selectedOptions[0]?.textContent) && safeText(scheduleData.meta.group).toLocaleLowerCase("uk-UA") !== safeText($("groupInput").selectedOptions[0]?.textContent).toLocaleLowerCase("uk-UA");
      title.textContent = groupMismatch ? "Для цієї групи даних немає" : (scheduleData.lessons.length ? "Нічого не знайдено" : "Поки немає занять");
      const p = document.createElement("p");
      p.textContent = groupMismatch ? `schedule.json зараз містить групу ${scheduleData.meta.group}. Імпортуй або опублікуй JSON для обраної групи.` : (scheduleData.lessons.length ? "Спробуй інший пошуковий запит або дату." : "На вибраний період занять немає або дані ще не опубліковані.");
      empty.append(icon,title,p); container.append(empty); return;
    }
    list.forEach(lesson => {
      const article = document.createElement("article"); article.className = "lesson";
      const time = document.createElement("div"); time.className = "lesson-time";
      const start = document.createElement("strong"); start.textContent = lesson.start;
      const end = document.createElement("small"); end.textContent = lesson.end;
      const day = document.createElement("small"); day.textContent = dateShort.format(new Date(`${lesson.date}T12:00:00`));
      time.append(start,end,day);
      const info = document.createElement("div"); info.className = "lesson-info";
      const title = document.createElement("h3"); title.textContent = lesson.subject;
      const details = document.createElement("p");
      details.textContent = [lesson.teacher, lesson.room || "", lesson.note].filter(Boolean).join(" • ") || "Додаткових відомостей немає";
      const tags = document.createElement("div"); tags.className = "lesson-tags";
      const type = document.createElement("span"); type.className = "tag tag-green"; type.textContent = lesson.type || "Заняття";
      const date = document.createElement("span"); date.className = "tag tag-warning"; date.textContent = dateFormatter.format(new Date(`${lesson.date}T12:00:00`));
      tags.append(type,date); info.append(title,details,tags); article.append(time,info); container.append(article);
    });
  }

  function renderAll() {
    $("todayLabel").textContent = dateFormatter.format(new Date());
    updateGroupLabel();
    renderCountdown();
    renderSchedule();
  }

  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = normalizeData(JSON.parse(String(reader.result)));
        scheduleData = parsed;
        dataOrigin = "Імпортований JSON на цьому пристрої";
        saveScheduleCache(scheduleData, dataOrigin);
        renderAll(); updateReliability(scheduleData.lessons.length ? "fresh" : "empty");
        toast(`Імпортовано занять: ${scheduleData.lessons.length}.`);
      } catch (error) {
        toast(error.message || "Не вдалося прочитати JSON.");
      } finally { $("importFile").value = ""; }
    };
    reader.onerror = () => toast("Не вдалося прочитати вибраний файл.");
    reader.readAsText(file);
  }

  $("themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("light-theme");
    saveSettings();
    $("themeToggle").textContent = document.body.classList.contains("light-theme") ? "☾" : "☼";
  });
  $("facultySelect").addEventListener("change", () => { updateCourses(); updateGroupLabel(); });
  $("courseSelect").addEventListener("change", () => { updateGroups(); updateGroupLabel(); });
  $("groupInput").addEventListener("change", updateGroupLabel);
  $("applyGroup").addEventListener("click", async () => {
    if (!$("groupInput").value) { toast("Спочатку вибери групу."); return; }
    selectedGroupId = $("groupInput").value;
    scheduleData = {meta:{},lessons:[]};
    saveSettings(); updateGroupLabel(); renderAll();
    await refreshSchedule();
  });
  $("refreshButton").addEventListener("click", () => refreshSchedule());
  $("searchInput").addEventListener("input", renderSchedule);
  $("dateFilter").addEventListener("change", renderSchedule);
  $("clearDate").addEventListener("click", () => { $("dateFilter").value = ""; renderSchedule(); });
  $("importFile").addEventListener("change", e => importJson(e.target.files && e.target.files[0]));
  window.addEventListener("online", () => refreshSchedule({ silent: true }));
  window.addEventListener("offline", () => {
    $("connectionPill").innerHTML = "<i></i> Офлайн";
    if (readScheduleCache()) { renderAll(); updateReliability("cache"); }
    else updateReliability("offline-empty");
  });
  document.querySelectorAll("[data-nav]").forEach(link => {
    link.addEventListener("click", () => {
      document.querySelectorAll("[data-nav]").forEach(item => item.classList.remove("active"));
      link.classList.add("active");
      const target = link.dataset.nav;
      const section = target === "schedule" ? $("scheduleList") : target === "status" ? document.querySelector(".reliability-card") : document.querySelector(".hero");
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  if (getSettings().theme === "light") document.body.classList.add("light-theme");
  $("themeToggle").textContent = document.body.classList.contains("light-theme") ? "☾" : "☼";
  renderAll();
  loadCatalog();
  setInterval(renderCountdown, 1000);

  // Telegram Mini App enhancement; the page still works in an ordinary browser.
  try {
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
  } catch (_) {}
})();
