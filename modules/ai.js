/*
 * AI 适配层
 *
 * 兼容策略：
 * 1. 默认：继续使用现有 Cloudflare Worker 的 /zhipu + /deepseek，不改变旧接口。
 * 2. 自定义：支持自动识别/手动指定主流协议：
 *    - OpenAI Chat Completions 兼容接口（大量第三方服务采用）
 *    - OpenAI Responses API
 *    - Gemini 原生 generateContent
 *    - Anthropic Claude Messages API
 *
 * 注意：默认 Worker 的密钥仍然只在 Worker Secrets 中；自定义模式的 API Key
 * 会保存在当前浏览器 localStorage，并直接发送给用户填写的 API 地址。
 */

const WORKER_URL = "https://schedule-ai-proxy.yihuanchen219.workers.dev";
const AI_SETTINGS_KEY = "smart_schedule_ai_settings_v1";

const DEFAULT_AI_SETTINGS = {
  mode: "default", // default | custom
  protocol: "auto", // auto | openai-chat | openai-responses | gemini | anthropic
  baseUrl: "",
  apiKey: "",
  model: "",
  visionModel: "",
  textModel: "",
  rememberKey: true
};

function loadAISettings() {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {...DEFAULT_AI_SETTINGS, ...(parsed || {})};
  } catch {
    return {...DEFAULT_AI_SETTINGS};
  }
}

function saveAISettings(settings) {
  const next = {...DEFAULT_AI_SETTINGS, ...(settings || {})};
  if (!next.rememberKey) next.apiKey = "";
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

function clearAISettings() {
  localStorage.removeItem(AI_SETTINGS_KEY);
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function safeUrl(value) {
  try { return new URL(value); } catch { return null; }
}

function inferProtocol(baseUrl, requested = "auto") {
  if (requested && requested !== "auto") return requested;
  const u = safeUrl(baseUrl);
  const s = String(baseUrl || "").toLowerCase();
  if (!u) return "unknown";
  if (s.includes("anthropic.com") || s.includes("/anthropic")) return "anthropic";
  if (s.includes("generativelanguage.googleapis.com") && s.includes("/openai/")) return "openai-chat";
  if (s.includes("generativelanguage.googleapis.com") && !s.includes("/openai/")) return "gemini";
  if (s.includes("/responses")) return "openai-responses";
  // 默认优先 OpenAI-compatible：这是大量第三方模型平台的共同协议。
  return "openai-chat";
}

function protocolLabel(protocol) {
  return {
    "openai-chat": "OpenAI Chat Completions 兼容",
    "openai-responses": "OpenAI Responses",
    "gemini": "Gemini 原生",
    "anthropic": "Claude Messages"
  }[protocol] || protocol;
}

function defaultModelFor(protocol, role) {
  if (protocol === "openai-chat") return role === "vision" ? "gpt-4o" : "gpt-4o-mini";
  if (protocol === "openai-responses") return "gpt-5";
  if (protocol === "gemini") return "gemini-3.8-flash";
  if (protocol === "anthropic") return role === "vision" ? "claude-sonnet-5" : "claude-sonnet-5";
  return "";
}

async function readJsonResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = {raw:text}; }
  if (!response.ok) {
    const detail = data?.error?.message || data?.error?.status || data?.message || text || `HTTP ${response.status}`;
    throw new Error(`AI 请求失败（${response.status}）：${String(detail).slice(0,420)}`);
  }
  return data;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    return await readJsonResponse(await fetch(url, {...options, signal:controller.signal}));
  } catch (e) {
    if (e?.name === "AbortError") throw new Error("AI 请求超时（90 秒）。");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function callSmartService(path, data) {
  const response = await fetch(WORKER_URL + path, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(data)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`默认 AI 服务返回 ${response.status}: ${text.slice(0,240)}`);
  }
  try { return JSON.parse(text); }
  catch { throw new Error("默认 AI 服务返回的内容不是有效 JSON。"); }
}

function customConfig(settings = loadAISettings()) {
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const apiKey = String(settings.apiKey || "").trim();
  if (!baseUrl) throw new Error("请先填写自定义 AI 的 API Base URL。");
  if (!apiKey) throw new Error("请先填写自定义 AI API Key。");
  const protocol = inferProtocol(baseUrl, settings.protocol);
  if (protocol === "unknown") throw new Error("无法识别这个 API 地址，请把协议改成手动指定。");
  return {settings, baseUrl, apiKey, protocol};
}

function openAIEndpoint(baseUrl, path) {
  const clean = normalizeBaseUrl(baseUrl);
  if (clean.endsWith(path)) return clean;
  if (/\/chat\/completions$/i.test(clean) || /\/responses$/i.test(clean)) return clean;
  return clean + path;
}

function geminiBase(baseUrl) {
  let clean = normalizeBaseUrl(baseUrl);
  clean = clean.replace(/\/models$/i, "");
  return clean || "https://generativelanguage.googleapis.com/v1beta";
}

function anthropicEndpoint(baseUrl) {
  const clean = normalizeBaseUrl(baseUrl) || "https://api.anthropic.com";
  if (/\/v1\/messages$/i.test(clean)) return clean;
  if (/\/v1$/i.test(clean)) return clean + "/messages";
  return clean + "/v1/messages";
}

function extractContent(apiJson) {
  const content = apiJson?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content.map(x => typeof x === "string" ? x : (x?.text || "")).join("");
  }
  if (typeof content === "string") return content;
  // OpenAI Responses API
  if (typeof apiJson?.output_text === "string") return apiJson.output_text;
  const output = apiJson?.output;
  if (Array.isArray(output)) {
    return output.flatMap(item => Array.isArray(item?.content) ? item.content : [])
      .map(x => x?.text || x?.output_text || "").join("");
  }
  // Gemini 原生
  const parts = apiJson?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) return parts.map(x => x?.text || "").join("");
  // Claude
  if (Array.isArray(apiJson?.content)) return apiJson.content.map(x => x?.text || "").join("");
  return "";
}

function extractJson(text) {
  let s = String(text || "").trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(s); } catch {}

  const objectStart = s.indexOf("{");
  const objectEnd = s.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    try { return JSON.parse(s.slice(objectStart, objectEnd + 1)); } catch {}
  }
  const arrayStart = s.indexOf("[");
  const arrayEnd = s.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    try { return {courses:JSON.parse(s.slice(arrayStart, arrayEnd + 1))}; } catch {}
  }
  throw new Error("AI 没有返回可解析的课程表 JSON。");
}

function imagePartForOpenAI(imageDataUrl) {
  return {type:"image_url", image_url:{url:imageDataUrl}};
}

async function callCustomChat(messages, settings, options = {}) {
  const {baseUrl, apiKey, protocol} = customConfig(settings);
  const model = options.model || settings.textModel || settings.model || defaultModelFor(protocol, options.vision ? "vision" : "text");

  if (protocol === "openai-chat") {
    const endpoint = openAIEndpoint(baseUrl, "/chat/completions");
    return fetchJson(endpoint, {
      method:"POST",
      headers:{"Content-Type":"application/json", "Authorization":`Bearer ${apiKey}`},
      body:JSON.stringify({model, messages, temperature: options.temperature ?? 0.2})
    });
  }

  if (protocol === "openai-responses") {
    const endpoint = openAIEndpoint(baseUrl, "/responses");
    const input = messages.map(m => ({role:m.role, content:typeof m.content === "string"
      ? [{type:"input_text", text:m.content}]
      : m.content.map(part => part.type === "text"
        ? {type:"input_text", text:part.text}
        : part.type === "image_url"
          ? {type:"input_image", image_url:part.image_url.url}
          : part)}));
    return fetchJson(endpoint, {
      method:"POST",
      headers:{"Content-Type":"application/json", "Authorization":`Bearer ${apiKey}`},
      body:JSON.stringify({model, input})
    });
  }

  if (protocol === "gemini") {
    const endpoint = `${geminiBase(baseUrl)}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const system = messages.find(m => m.role === "system");
    const contents = messages.filter(m => m.role !== "system").map(m => ({
      role:m.role === "assistant" ? "model" : "user",
      parts:typeof m.content === "string" ? [{text:m.content}] : m.content.map(part => {
        if (part.type === "text") return {text:part.text};
        if (part.type === "image_url") return {inline_data:{mime_type:(part.image_url.url.match(/^data:([^;]+);/) || [,"image/jpeg"])[1], data:part.image_url.url.split(",")[1] || ""}};
        return {text:String(part)};
      })
    }));
    const body = {contents};
    if (system?.content) body.systemInstruction = {parts:[{text:String(system.content)}]};
    return fetchJson(endpoint, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(body)
    });
  }

  if (protocol === "anthropic") {
    const system = messages.filter(m => m.role === "system").map(m => String(m.content)).join("\n");
    const converted = messages.filter(m => m.role !== "system").map(m => ({
      role:m.role === "assistant" ? "assistant" : "user",
      content:typeof m.content === "string" ? m.content : m.content.map(part => {
        if (part.type === "text") return {type:"text", text:part.text};
        if (part.type === "image_url") {
          const match = part.image_url.url.match(/^data:([^;]+);base64,(.*)$/);
          if (!match) throw new Error("Claude 直连模式目前要求图片为 data URL。");
          return {type:"image", source:{type:"base64", media_type:match[1], data:match[2]}};
        }
        return {type:"text", text:String(part)};
      })
    }));
    const body = {
      model,
      max_tokens: options.maxTokens || 4096,
      messages:converted
    };
    if (system) body.system = system;
    return fetchJson(anthropicEndpoint(baseUrl), {
      method:"POST",
      headers:{"Content-Type":"application/json", "x-api-key":apiKey, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify(body)
    });
  }

  throw new Error(`暂不支持协议：${protocol}`);
}

async function testCustomAI(settings) {
  const cfg = customConfig(settings);
  const model = settings.textModel || settings.model || defaultModelFor(cfg.protocol, "text");
  const result = await callCustomChat([
    {role:"system", content:"你是连接测试助手。只回复 OK。"},
    {role:"user", content:"请只回复 OK。"}
  ], {...settings, model}, {model, temperature:0, maxTokens:16});
  return {protocol:cfg.protocol, model, text:extractContent(result).trim()};
}

async function detectCustomAI(settings) {
  const {baseUrl, apiKey} = customConfig(settings);
  const requested = settings.protocol || "auto";
  let protocol = inferProtocol(baseUrl, requested);
  const hints = [];
  const u = safeUrl(baseUrl);

  // URL 明显是原生 Gemini/Claude 时，不进行 /models 探测，避免无意义请求。
  if (requested === "auto" && u && !/generativelanguage\.googleapis\.com/i.test(baseUrl) && !/anthropic\.com/i.test(baseUrl)) {
    try {
      const modelsUrl = /\/models$/i.test(baseUrl) ? baseUrl : normalizeBaseUrl(baseUrl) + "/models";
      const response = await fetch(modelsUrl, {headers:{"Authorization":`Bearer ${apiKey}`}, method:"GET"});
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        const models = Array.isArray(data?.data) ? data.data.map(x => x?.id).filter(Boolean) : [];
        return {protocol:"openai-chat", label:protocolLabel("openai-chat"), models, source:"models endpoint"};
      }
    } catch (e) {
      hints.push("模型列表探测不可用，已根据 API 地址自动判断协议。");
    }
  }

  return {protocol, label:protocolLabel(protocol), models:[], source:"URL/协议规则", hints};
}

const RECOGNIZE_PROMPT = `
你是课程表图片结构识别器。请仔细读取整张图片，不要凭空补课。
目标：把图片中的课程转换成严格 JSON。

只输出 JSON，不要 Markdown，不要解释。
格式：
{
  "courses":[
    {
      "title":"课程名称",
      "day":"周一",
      "start":"08:00",
      "end":"08:45",
      "periods":1,
      "room":"教室或地点",
      "type":"课程",
      "task":"",
      "color":"#dbeafe",
      "confidence":0.95,
      "bbox":[0,0,1,1]
    }
  ],
  "issues":[]
}

规则：
1. day 只能是周一到周日。
2. 时间必须是 HH:MM。
3. “标准课时”默认按 45 分钟理解，但绝对不能把“1 课时”机械等同于 45 分钟的完整课程时间。
4. 课程可以连续占用多个标准课时。若同一课程连续占用 2、3、4……个标准课时，必须合并成一个 course，并填写 periods=对应课时数；start 是第一标准课时开始时间，end 是最后一个标准课时结束时间。中间的课间休息要包含在 start 到 end 的时间跨度内。
5. 例如：第1课时 08:00-08:45、休息10分钟、第2课时 08:55-09:40；如果同一门课连续上两课时，应识别为 start=08:00、end=09:40、periods=2，而不是 end=09:30，也不能拆成两门课。
6. 如果图片明确写出了钟表时间，优先使用图片上的实际时间；不要自行套用45分钟或固定课间。
7. 如果图片只有“第几节/第几课时”而没有钟表时间，按连续课时数识别 periods；时间只能在有可靠的课程时间规则时推算，不要猜。
8. 同一课程重复出现时尽量合并，不要制造重复课程。
9. 看不清的字段留空，并降低 confidence，不要猜。
10. color 只是为了在课程表中区分课程，可根据视觉位置分配柔和颜色。
11. bbox 是该课程单元格在原图中的归一化 [x,y,width,height]，无法判断时填 [0,0,0,0]。
12. 课程名称、地点、时间和节次尽量保留图片原文。
`;

async function recognizeSchedule(imageDataUrl) {
  const settings = loadAISettings();
  let apiJson;

  if (settings.mode !== "custom") {
    apiJson = await callSmartService("/zhipu", {image:imageDataUrl, prompt:RECOGNIZE_PROMPT});
  } else {
    const cfg = customConfig(settings);
    const model = settings.visionModel || settings.model || defaultModelFor(cfg.protocol, "vision");
    apiJson = await callCustomChat([
      {role:"system", content:"你是一个严格输出 JSON 的课程表图片识别器。"},
      {role:"user", content:[{type:"text", text:RECOGNIZE_PROMPT}, imagePartForOpenAI(imageDataUrl)]}
    ], {...settings, model}, {vision:true, model});
  }

  const parsed = extractJson(extractContent(apiJson));
  const courses = normalizeCourses(parsed.courses || []);
  const uncertain = courses.filter(c => Number(c.confidence) < 0.65);

  if (uncertain.length) {
    const verifyPrompt = `请再次核对这张课程表图片。下面是第一次识别中置信度较低的项目：\n${JSON.stringify(uncertain, null, 2)}\n\n只输出 JSON：{"courses":[...],"issues":[...]}。只返回这些项目的修正版；字段必须包含 title,day,start,end,room,type,task,color,confidence。如果图片仍看不清，保持原值并把 confidence 降低，不要猜。`;
    try {
      if (settings.mode !== "custom") {
        const second = await callSmartService("/zhipu", {image:imageDataUrl, prompt:verifyPrompt});
        const secondParsed = extractJson(extractContent(second));
        const corrected = normalizeCourses(secondParsed.courses || []);
        return {courses:mergeCorrections(courses, corrected), issues:[...(parsed.issues||[]), ...(secondParsed.issues||[])]};
      }
      const second = await callCustomChat([
        {role:"system", content:"只输出 JSON，不要 Markdown。"},
        {role:"user", content:[{type:"text", text:verifyPrompt}, imagePartForOpenAI(imageDataUrl)]}
      ], settings, {vision:true, model:settings.visionModel || settings.model || defaultModelFor(inferProtocol(settings.baseUrl, settings.protocol), "vision")});
      const secondParsed = extractJson(extractContent(second));
      const corrected = normalizeCourses(secondParsed.courses || []);
      return {courses:mergeCorrections(courses, corrected), issues:[...(parsed.issues||[]), ...(secondParsed.issues||[])]};
    } catch (e) {
      console.warn("二次核对失败，保留第一次识别结果", e);
    }
  }
  return {courses, issues:parsed.issues || []};
}

function mergeCorrections(original, corrected) {
  const out = original.slice();
  corrected.forEach(n => {
    let best = -1, bestScore = 0;
    out.forEach((o,i) => {
      const score=(o.title===n.title?4:0)+(o.day===n.day?2:0)+(o.start===n.start?2:0)+(o.room&&n.room&&o.room===n.room?1:0);
      if (score > bestScore) {bestScore=score;best=i;}
    });
    if (best >= 0 && bestScore >= 4) out[best] = {...out[best], ...n};
    else out.push(n);
  });
  return normalizeCourses(out);
}

async function validateAndRepairWithDeepSeek(courses) {
  const prompt = `你是课程表结构校验器。请检查下面 JSON 中的课程：\n${JSON.stringify(courses, null, 2)}\n\n请修复明显的格式错误、时间顺序错误、星期格式错误、重复课程，并保留图片识别到的原始课程名称。不要凭空增加课程。保留 periods 字段；如果一门课连续占用多个标准课时，不要拆开，也不要把课间休息误算成上课时间。只输出 JSON：{"courses":[{"title":"","day":"周一","start":"08:00","end":"08:45","periods":1,"room":"","type":"课程","task":"","color":"#dbeafe","confidence":1}],"issues":["问题说明"]}`;
  const settings = loadAISettings();
  let apiJson;

  if (settings.mode !== "custom") {
    apiJson = await callSmartService("/deepseek", {model:"deepseek-chat", temperature:0.2, messages:[
      {role:"system",content:"你只负责课程表数据结构校验与修复，不做额外推测。"},
      {role:"user",content:prompt}
    ]});
  } else {
    const protocol = inferProtocol(settings.baseUrl, settings.protocol);
    const model = settings.textModel || settings.model || defaultModelFor(protocol, "text");
    apiJson = await callCustomChat([
      {role:"system",content:"你只负责课程表数据结构校验与修复，不做额外推测。"},
      {role:"user",content:prompt}
    ], {...settings, model}, {model, temperature:0.2, maxTokens:4096});
  }

  const parsed = extractJson(extractContent(apiJson));
  return {courses:normalizeCourses(parsed.courses || courses), issues:Array.isArray(parsed.issues) ? parsed.issues : []};
}

function detectConflicts(courses) {
  const result=[];
  const byDay={};
  courses.forEach(c => (byDay[c.day] ||= []).push(c));
  Object.entries(byDay).forEach(([day,list]) => {
    list.sort((a,b)=>timeToMinutes(a.start)-timeToMinutes(b.start));
    for(let i=1;i<list.length;i++){
      const a=list[i-1],b=list[i];
      if(timeToMinutes(a.end)>timeToMinutes(b.start)) result.push(`${day}：${a.title} ${a.start}-${a.end} 与 ${b.title} ${b.start}-${b.end} 重叠`);
    }
  });
  return result;
}

// 暴露给设置页 / 其他模块。
window.AI_SETTINGS_KEY = AI_SETTINGS_KEY;
window.DEFAULT_AI_SETTINGS = DEFAULT_AI_SETTINGS;
window.loadAISettings = loadAISettings;
window.saveAISettings = saveAISettings;
window.clearAISettings = clearAISettings;
window.inferProtocol = inferProtocol;
window.protocolLabel = protocolLabel;
window.detectCustomAI = detectCustomAI;
window.testCustomAI = testCustomAI;
