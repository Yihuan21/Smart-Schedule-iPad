function renderAISettings() {
  const s = loadAISettings();
  const custom = s.mode === "custom";
  const protocol = s.protocol || "auto";
  const body = `
    <div class="ai-settings">
      <div class="setting-tip">
        <strong>默认先用你的 AI</strong>
        <p>默认模式完全沿用现有 Cloudflare Worker：识图走 <code>/zhipu</code>，结构校验走 <code>/deepseek</code>。这样不会破坏你现在已经上线的版本。</p>
      </div>

      <label class="setting-label">AI 使用模式
        <select id="aiMode">
          <option value="default" ${!custom ? "selected" : ""}>使用默认 AI（你的 Worker）</option>
          <option value="custom" ${custom ? "selected" : ""}>使用自定义 AI</option>
        </select>
      </label>

      <div id="customAIFields" class="custom-ai-fields ${custom ? "" : "hidden"}">
        <label class="setting-label">接口协议
          <select id="aiProtocol">
            <option value="auto" ${protocol==="auto"?"selected":""}>自动识别</option>
            <option value="openai-chat" ${protocol==="openai-chat"?"selected":""}>OpenAI Chat Completions 兼容</option>
            <option value="openai-responses" ${protocol==="openai-responses"?"selected":""}>OpenAI Responses</option>
            <option value="gemini" ${protocol==="gemini"?"selected":""}>Gemini 原生</option>
            <option value="anthropic" ${protocol==="anthropic"?"selected":""}>Claude Messages</option>
          </select>
        </label>
        <label class="setting-label">API Base URL
          <input id="aiBaseUrl" type="url" autocomplete="off" value="${escSetting(s.baseUrl)}" placeholder="例如 https://api.openai.com/v1">
        </label>
        <label class="setting-label">API Key
          <input id="aiApiKey" type="password" autocomplete="off" value="${escSetting(s.apiKey)}" placeholder="输入你自己的 API Key">
        </label>
        <label class="setting-check"><input id="aiRememberKey" type="checkbox" ${s.rememberKey!==false?"checked":""}> 在本机浏览器记住 API Key</label>
        <div class="setting-warning">自定义模式会把 Key 保存在当前浏览器并直接发送到你填写的服务地址。公开部署时，不建议把个人 Key 写进网页代码。</div>

        <div class="form-row">
          <label class="setting-label">文本/校验模型
            <input id="aiTextModel" value="${escSetting(s.textModel || s.model)}" placeholder="留空使用该协议默认模型">
          </label>
          <label class="setting-label">识图模型
            <input id="aiVisionModel" value="${escSetting(s.visionModel || s.model)}" placeholder="留空使用文本模型/默认模型">
          </label>
        </div>

        <div class="setting-actions">
          <button id="aiDetectBtn" class="dialog-btn secondary">自动识别接口</button>
          <button id="aiTestBtn" class="dialog-btn secondary">测试连接</button>
        </div>
        <div id="aiDetectResult" class="setting-result"></div>
      </div>

      <div class="setting-tip">
        <strong>课程时间规则</strong>
        <p>用于图片只有“第几节/第几课时”而没有具体钟表时间时的推算。图片本身有实际时间时，AI 会优先使用图片时间。</p>
        <div class="form-row">
          <label class="setting-label">标准课时（分钟）
            <input id="standardPeriodMinutes" type="number" min="1" max="180" step="1" value="${escSetting(loadScheduleTiming().standardPeriodMinutes)}">
          </label>
          <label class="setting-label">课间休息（分钟）
            <input id="breakMinutes" type="number" min="0" max="60" step="1" value="${escSetting(loadScheduleTiming().breakMinutes)}">
          </label>
        </div>
        <div class="setting-warning">默认：45 分钟课时 + 10 分钟课间。连续 2 课时的课程会按“45 + 10 + 45”理解为完整时间跨度。</div>
      </div>

      <div class="setting-tip small-tip">
        <strong>兼容范围</strong>
        <p>“OpenAI Chat Completions 兼容”可覆盖大量第三方模型平台；另外原生支持 OpenAI Responses、Gemini 和 Claude。真正能否识图还取决于你选的模型是否支持视觉输入。</p>
      </div>
    </div>`;

  showModal("⚙️ AI 服务设置", body, [
    {label:"恢复默认 AI", action:()=>{
      saveAISettings({...DEFAULT_AI_SETTINGS});
      renderAISettings();
      showNotice("已恢复为你的默认 Cloudflare Worker。", "success");
    }, secondary:true},
    {label:"保存设置", action:saveAISettingsFromUI}
  ]);

  const modeEl = document.getElementById("aiMode");
  modeEl.addEventListener("change", () => {
    document.getElementById("customAIFields").classList.toggle("hidden", modeEl.value !== "custom");
  });

  document.getElementById("aiDetectBtn")?.addEventListener("click", async () => {
    const resultBox = document.getElementById("aiDetectResult");
    try {
      resultBox.textContent = "正在识别接口……";
      const settings = readAISettingsFromUI(false);
      const result = await detectCustomAI(settings);
      resultBox.innerHTML = `<div class="success-box">已识别：<strong>${escSetting(result.label)}</strong>${result.models?.length ? `<br>发现 ${result.models.length} 个模型。` : ""}<br><small>${escSetting((result.hints||[]).join(" "))}</small></div>`;
      if (document.getElementById("aiProtocol").value === "auto" && result.protocol) {
        // 不改变用户的“自动识别”选择；只提示识别结果。
      }
    } catch (e) {
      resultBox.innerHTML = `<div class="error-box">${escSetting(e.message || "接口识别失败")}</div>`;
    }
  });

  document.getElementById("aiTestBtn")?.addEventListener("click", async () => {
    const resultBox = document.getElementById("aiDetectResult");
    try {
      resultBox.textContent = "正在测试连接（会发送一个极短测试请求）……";
      const settings = readAISettingsFromUI(false);
      const result = await testCustomAI(settings);
      resultBox.innerHTML = `<div class="success-box">连接成功：${escSetting(protocolLabel(result.protocol))} · ${escSetting(result.model)} · 返回：${escSetting(result.text || "（无文本）")}</div>`;
    } catch (e) {
      resultBox.innerHTML = `<div class="error-box">连接测试失败：${escSetting(e.message || "未知错误")}<br><small>常见原因：Base URL、Key、模型名、CORS 或服务商协议不匹配。</small></div>`;
    }
  });
}

function escSetting(v) {
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function readAISettingsFromUI(includeKey=true) {
  const old = loadAISettings();
  return {
    ...old,
    mode: document.getElementById("aiMode")?.value || "default",
    protocol: document.getElementById("aiProtocol")?.value || "auto",
    baseUrl: document.getElementById("aiBaseUrl")?.value.trim() || "",
    apiKey: includeKey ? (document.getElementById("aiApiKey")?.value.trim() || "") : (document.getElementById("aiApiKey")?.value.trim() || old.apiKey || ""),
    rememberKey: !!document.getElementById("aiRememberKey")?.checked,
    textModel: document.getElementById("aiTextModel")?.value.trim() || "",
    visionModel: document.getElementById("aiVisionModel")?.value.trim() || ""
  };
}

function saveAISettingsFromUI() {
  const s = readAISettingsFromUI(true);
  if (s.mode === "custom") {
    if (!s.baseUrl) { alert("请填写 API Base URL。"); return; }
    if (!s.apiKey) { alert("请填写 API Key。"); return; }
  }
  saveAISettings(s);
  saveScheduleTiming({
    standardPeriodMinutes: Number(document.getElementById("standardPeriodMinutes")?.value || 45),
    breakMinutes: Number(document.getElementById("breakMinutes")?.value || 0)
  });
  hideModal();
  showNotice(s.mode === "default" ? "已保存：继续使用你的默认 AI。" : `已保存：${protocolLabel(inferProtocol(s.baseUrl, s.protocol))}`, "success");
}

window.renderAISettings = renderAISettings;
