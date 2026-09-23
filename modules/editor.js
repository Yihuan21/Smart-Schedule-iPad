function editCourse(index, courses, render, week, previewOnly=false) {
  const c = courses[index];
  if (!c) return;

  const body = `
    <form id="courseForm" class="edit-form">
      <label>课程名称<input id="fTitle" value="${esc(c.title)}" required></label>
      <div class="form-row">
        <label>星期
          <select id="fDay">${["周一","周二","周三","周四","周五","周六","周日"].map(d => `<option ${d===c.day?"selected":""}>${d}</option>`).join("")}</select>
        </label>
        <label>类型
          <select id="fType">${["课程","考试","作业","活动","其他"].map(d => `<option ${d===c.type?"selected":""}>${d}</option>`).join("")}</select>
        </label>
      </div>
      <div class="form-row">
        <label>开始<input id="fStart" type="time" value="${esc(c.start)}"></label>
        <label>结束<input id="fEnd" type="time" value="${esc(c.end)}"></label>
      </div>
      <label>连续标准课时数<input id="fPeriods" type="number" min="1" max="20" step="1" value="${esc(c.periods || 1)}"></label>
      <div class="setting-warning">默认一标准课时为45分钟。连续多课时之间的课间休息不会算作“上课45分钟”，但会包含在整门连续课程的开始—结束时间跨度中。识图时若图片给出实际时间，以图片为准。</div>
      <label>教室 / 地点<input id="fRoom" value="${esc(c.room)}"></label>
      <label>任务 / 备注<input id="fTask" value="${esc(c.task)}" placeholder="可不填"></label>
      <label>课程颜色
        <div class="color-grid">
          ${["#dbeafe","#dcfce7","#fef3c7","#fce7f3","#ede9fe","#cffafe","#e2e8f0","#fecaca"].map(color => `
            <button type="button" class="color-choice ${c.color===color?"selected":""}" data-color="${color}" style="background:${color}"></button>`).join("")}
        </div>
      </label>
      <input type="hidden" id="fColor" value="${esc(c.color)}">
    </form>`;

  const actions = [
    {label:"取消", action:hideModal, secondary:true},
    {label:"保存", action:()=>{
      const form = document.getElementById("courseForm");
      if (!form.reportValidity()) return;
      const start = document.getElementById("fStart").value || "08:00";
      const end = document.getElementById("fEnd").value || "08:45";
      const periods = Math.max(1, Math.min(20, Math.round(Number(document.getElementById("fPeriods").value) || 1)));
      if (timeToMinutesLocal(end) <= timeToMinutesLocal(start)) {
        alert("结束时间必须晚于开始时间。");
        return;
      }
      c.title = document.getElementById("fTitle").value.trim() || "未命名课程";
      c.day = document.getElementById("fDay").value;
      c.type = document.getElementById("fType").value;
      c.start = start;
      c.end = end;
      c.periods = periods;
      c.room = document.getElementById("fRoom").value.trim();
      c.task = document.getElementById("fTask").value.trim();
      c.color = document.getElementById("fColor").value;
      if (!previewOnly) saveCourses(week, courses);
      hideModal();
      if (!previewOnly) render();
      else if (typeof render === "function") render();
    }}
  ];

  if (!previewOnly) {
    actions.splice(1,0,{label:"删除", action:()=>{
      if (confirm("确定删除这节课程吗？")) {
        courses.splice(index,1);
        saveCourses(week,courses);
        hideModal();
        render();
      }
    }, danger:true});
  }

  showModal("编辑课程", body, actions);

  document.querySelectorAll(".color-choice").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("fColor").value = btn.dataset.color;
      document.querySelectorAll(".color-choice").forEach(x => x.classList.remove("selected"));
      btn.classList.add("selected");
    });
  });
}

function timeToMinutesLocal(t) {
  const [h,m] = String(t).split(":").map(Number);
  return (h||0)*60+(m||0);
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
