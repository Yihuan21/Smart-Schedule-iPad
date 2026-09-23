function showModal(title, body, actions=[]) {
  const modal = document.getElementById("modal");
  document.getElementById("modalTitle").textContent = title || "";
  document.getElementById("modalBody").innerHTML = body || "";
  const box = document.getElementById("modalActions");
  box.innerHTML = "";
  actions.forEach(a => {
    const btn = document.createElement("button");
    btn.className = "dialog-btn" + (a.secondary ? " secondary" : "") + (a.danger ? " danger" : "");
    btn.textContent = a.label;
    btn.addEventListener("click", a.action);
    box.appendChild(btn);
  });
  modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function hideModal() {
  const modal = document.getElementById("modal");
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function showHelp() {
  showModal("📘 新手使用指南", `
    <div class="help-content">
      <h3>① 上传课程表</h3>
      <p>点击「上传课程表」，选择一张清晰、完整的课程表图片。系统会先做图片压缩，再进行 AI 识别和结构校验。</p>
      <h3>② 识别后先预览</h3>
      <p>系统不会直接覆盖你的课程。先显示识别结果、异常提示和时间冲突，再由你决定是否应用。</p>
      <h3>③ 修改课程</h3>
      <p>点击课程卡片、右下角编辑按钮，或长按课程卡片约 0.65 秒，都可以打开编辑面板。</p>
      <p>可以修改课程名称、星期、开始/结束时间、地点、类型、任务/备注和颜色，也可以删除课程。</p>
      <h3>④ 自动保存</h3>
      <p>课程修改会保存到当前设备浏览器的本地存储。不同周次分别保存。</p>
      <h3>⑤ AI 排课</h3>
      <p>AI 识别用于整理图片中的课程信息；第二阶段会做结构检查、格式修复和冲突检查。</p>
      <h3>⑥ iPad 使用</h3>
      <p>横屏时课程会按星期分栏，竖屏时自动变成适合触摸的卡片布局。底部操作栏方便单手操作。</p>
      <p class="soft-tip">建议：第一次使用时，先用一张完整清晰的课程表测试。识别结果仍建议你快速检查一遍。</p>
    </div>
  `, [{label:"知道了", action:hideModal}]);
}

document.getElementById("modalX").addEventListener("click", hideModal);
document.getElementById("modal").addEventListener("click", e => {
  if (e.target.id === "modal") hideModal();
});
window.showModal = showModal;
window.hideModal = hideModal;
window.showHelp = showHelp;
