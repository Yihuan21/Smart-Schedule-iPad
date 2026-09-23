let currentWeek = loadCurrentWeek();
let courses = loadCourses(currentWeek);
let pendingImage = null;

function uid() {
  return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  courses = normalizeCourses(courses);
  saveCourses(currentWeek, courses);

  document.getElementById("weekTitle").textContent = `第 ${currentWeek} 周`;
  const box = document.getElementById("schedule");
  const empty = document.getElementById("emptyState");
  box.innerHTML = "";

  if (!courses.length) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const groups = {};
  days.forEach(d => groups[d] = []);
  courses.forEach((c, i) => {
    const d = days.includes(c.day) ? c.day : "周一";
    groups[d].push({...c, _index:i});
  });

  days.forEach(day => {
    if (!groups[day].length) return;
    groups[day].sort((a,b) => timeToMinutes(a.start)-timeToMinutes(b.start));
    const col = document.createElement("section");
    col.className = "day-column";
    col.innerHTML = `<div class="day-title">${day}</div>`;
    groups[day].forEach(c => {
      const card = document.createElement("article");
      card.className = "course-card";
      card.style.setProperty("--course-color", c.color || "#dbeafe");
      card.innerHTML = `
        <div class="course-color"></div>
        <div class="course-main">
          <div class="course-title">${escapeHtml(c.title || "未命名课程")}</div>
          <div class="course-time">${escapeHtml(c.start)}–${escapeHtml(c.end)}</div>
          <div class="course-room">${escapeHtml(c.room || "未填写地点")}</div>
          <div class="course-tags">
            ${c.type ? `<span>${escapeHtml(c.type)}</span>` : ""}
            ${c.task ? `<span>任务：${escapeHtml(c.task)}</span>` : ""}
          </div>
        </div>
        <button class="edit-mini" aria-label="编辑">✎</button>
      `;
      card.addEventListener("click", () => editCourse(c._index, courses, render, currentWeek));
      const editBtn = card.querySelector(".edit-mini");
      editBtn.addEventListener("click", e => {
        e.stopPropagation();
        editCourse(c._index, courses, render, currentWeek);
      });
      addLongPress(card, () => editCourse(c._index, courses, render, currentWeek));
      col.appendChild(card);
    });
    box.appendChild(col);
  });
}

function addLongPress(el, callback) {
  let timer = null;
  const start = () => {
    timer = setTimeout(() => {
      timer = null;
      if (navigator.vibrate) navigator.vibrate(12);
      callback();
    }, 650);
  };
  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  el.addEventListener("pointerdown", start);
  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("pointerleave", cancel);
}

function timeToMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ""));
  return m ? Number(m[1])*60 + Number(m[2]) : 0;
}

function changeWeek(delta) {
  currentWeek = Math.min(20, Math.max(1, currentWeek + delta));
  saveCurrentWeek(currentWeek);
  courses = loadCourses(currentWeek);
  render();
}

function goToday() {
  currentWeek = 1;
  saveCurrentWeek(currentWeek);
  courses = loadCourses(currentWeek);
  render();
  showNotice("已回到第 1 周。实际学期周次可以在课程表中自行调整。", "info");
}

function addCourse() {
  courses.push({
    id: uid(),
    title: "新课程",
    day: "周一",
    start: "08:00",
    end: "08:50",
    room: "",
    color: "#dbeafe",
    type: "课程",
    task: "",
    confidence: 1
  });
  saveCourses(currentWeek, courses);
  render();
  editCourse(courses.length - 1, courses, render, currentWeek);
}

function showNotice(text, kind="info") {
  const area = document.getElementById("noticeArea");
  area.innerHTML = `<div class="notice ${kind}">${escapeHtml(text)}</div>`;
  setTimeout(() => {
    if (area.textContent.includes(text)) area.innerHTML = "";
  }, 5000);
}

function startUpload() {
  document.getElementById("imageInput").click();
}

async function handleImage(file) {
  if (!file) return;
  try {
    showModal("正在识别", `<div class="progress-box"><div class="spinner"></div><p>正在压缩图片并识别课程表……</p><small>识别完成后会自动进行结构校验和冲突检查。</small></div>`, []);
    const dataUrl = await compressImage(file, 1800, 0.86);
    pendingImage = dataUrl;
    const result = await recognizeSchedule(dataUrl);
    const normalized = normalizeCourses(result.courses || []);
    if (!normalized.length) throw new Error("AI 没有识别到可用课程。");

    const repaired = await validateAndRepairWithDeepSeek(normalized);
    const finalCourses = normalizeCourses(repaired.courses || normalized);
    const conflicts = detectConflicts(finalCourses);

    showRecognitionPreview(finalCourses, conflicts, repaired.issues || []);
  } catch (err) {
    console.error(err);
    showModal(
      "识别失败",
      `<div class="error-box"><strong>没有成功生成课程表。</strong><p>${escapeHtml(err.message || "未知错误")}</p><p>请确认图片清晰、完整，并检查网络连接。</p></div>`,
      [{label:"关闭", action:hideModal}]
    );
  }
}

function showRecognitionPreview(list, conflicts, issues) {
  const conflictText = conflicts.length
    ? `<div class="warning-box"><strong>发现 ${conflicts.length} 个时间冲突</strong><ul>${conflicts.map(c => `<li>${escapeHtml(c)}</li>`).join("")}</ul><small>你可以先应用结果，再逐项编辑。</small></div>`
    : `<div class="success-box">结构校验通过，暂未发现时间冲突。</div>`;

  const issueText = issues.length
    ? `<details class="issue-details"><summary>AI 校验提示（${issues.length}）</summary><ul>${issues.map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ul></details>`
    : "";

  const rows = list.map((c,i) => `
    <div class="preview-row">
      <span class="preview-dot" style="background:${escapeHtml(c.color)}"></span>
      <div>
        <strong>${escapeHtml(c.title)}</strong>
        <small>${escapeHtml(c.day)} · ${escapeHtml(c.start)}–${escapeHtml(c.end)} · ${escapeHtml(c.room || "地点未识别")}</small>
      </div>
      <button class="mini-edit" data-i="${i}">编辑</button>
    </div>`).join("");

  showModal(
    "识别结果",
    `${conflictText}${issueText}<div class="preview-list">${rows}</div>`,
    [
      {label:"取消", action:hideModal, secondary:true},
      {label:"应用到第 "+currentWeek+" 周", action:()=>{
        courses = list.map(c => ({...c, id:c.id || uid()}));
        saveCourses(currentWeek, courses);
        hideModal();
        render();
        showNotice("课程已保存。你可以点击任意课程继续修改。", "success");
      }}
    ]
  );

  document.querySelectorAll(".mini-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.i);
      hideModal();
      setTimeout(() => editTemporaryCourse(list, i), 50);
    });
  });
}

function editTemporaryCourse(list, index) {
  const temp = {...list[index], id:list[index].id || uid()};
  const tempList = list.slice();
  tempList[index] = temp;
  editCourse(index, tempList, () => {
    list[index] = tempList[index];
    showRecognitionPreview(list, detectConflicts(list), []);
  }, currentWeek, true);
}

document.getElementById("uploadBtn").addEventListener("click", startUpload);
document.getElementById("addCourseBtn").addEventListener("click", addCourse);
document.getElementById("dockAdd").addEventListener("click", addCourse);
document.getElementById("dockAi").addEventListener("click", startUpload);
document.getElementById("dockToday").addEventListener("click", goToday);
document.getElementById("todayBtn").addEventListener("click", goToday);
document.getElementById("prevWeek").addEventListener("click", () => changeWeek(-1));
document.getElementById("nextWeek").addEventListener("click", () => changeWeek(1));
document.getElementById("helpBtn").addEventListener("click", showHelp);
document.getElementById("dockHelp").addEventListener("click", showHelp);
document.getElementById("imageInput").addEventListener("change", e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  handleImage(file);
});

window.addEventListener("error", e => console.error("页面错误:", e.error || e.message));
render();


// 注册 Service Worker；失败不影响主页面和 AI 功能。
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(err => {
      console.warn("Service Worker 注册失败，不影响课程表使用：", err);
    });
  });
}
