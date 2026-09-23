const WORKER_URL = "https://schedule-ai-proxy.yihuanchen219.workers.dev";

async function callSmartService(path, data) {
  const response = await fetch(WORKER_URL + path, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(data)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`AI 服务返回 ${response.status}: ${text.slice(0,240)}`);
  }
  try { return JSON.parse(text); }
  catch { throw new Error("AI 服务返回的内容不是有效 JSON。"); }
}

async function compressImage(file, maxSide=1800, quality=0.86) {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件。");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

function extractContent(apiJson) {
  const content = apiJson?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content.map(x => typeof x === "string" ? x : (x.text || "")).join("");
  }
  return typeof content === "string" ? content : "";
}

function extractJson(text) {
  let s = String(text || "").trim();
  s = s.replace(/^```(?:json)?/i,"").replace(/```$/,"").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start,end+1);
  try { return JSON.parse(s); } catch {}
  const a = s.indexOf("[");
  const b = s.lastIndexOf("]");
  if (a >= 0 && b > a) {
    try { return {courses:JSON.parse(s.slice(a,b+1))}; } catch {}
  }
  throw new Error("AI 没有返回可解析的课程表 JSON。");
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
      "end":"08:50",
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
3. 同一课程重复出现时尽量合并，不要制造重复课程。
4. 看不清的字段留空，并降低 confidence，不要猜。
5. color 只是为了在课程表中区分课程，可根据视觉位置分配柔和颜色。
6. bbox 是该课程单元格在原图中的归一化 [x,y,width,height]，无法判断时填 [0,0,0,0]。
7. 课程名称、地点、时间尽量保留图片原文。
`;

async function recognizeSchedule(imageDataUrl) {
  const apiJson = await callSmartService("/zhipu", {
    image: imageDataUrl,
    prompt: RECOGNIZE_PROMPT
  });
  const parsed = extractJson(extractContent(apiJson));
  const courses = normalizeCourses(parsed.courses || []);
  const uncertain = courses.filter(c => Number(c.confidence) < 0.65);

  // 第二次识别：针对低置信度结果，让视觉模型再次核对整图中的具体课程。
  if (uncertain.length) {
    const verifyPrompt = `
请再次核对这张课程表图片。下面是第一次识别中置信度较低的项目：
${JSON.stringify(uncertain, null, 2)}

只输出 JSON：
{"courses":[...],"issues":[...]}

只返回这些项目的修正版；字段必须包含 title,day,start,end,room,type,task,color,confidence。
如果图片仍看不清，保持原值并把 confidence 降低，不要猜。
`;
    try {
      const second = await callSmartService("/zhipu", {
        image: imageDataUrl,
        prompt: verifyPrompt
      });
      const secondParsed = extractJson(extractContent(second));
      const corrected = normalizeCourses(secondParsed.courses || []);
      const merged = mergeCorrections(courses, corrected);
      return {courses:merged, issues:[...(parsed.issues||[]), ...(secondParsed.issues||[])]};
    } catch (e) {
      console.warn("二次核对失败，保留第一次识别结果", e);
    }
  }
  return {courses, issues:parsed.issues || []};
}

function mergeCorrections(original, corrected) {
  const out = original.slice();
  corrected.forEach(n => {
    let best = -1;
    let bestScore = 0;
    out.forEach((o,i) => {
      const score =
        (o.title === n.title ? 4 : 0) +
        (o.day === n.day ? 2 : 0) +
        (o.start === n.start ? 2 : 0) +
        (o.room && n.room && o.room === n.room ? 1 : 0);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0 && bestScore >= 4) out[best] = {...out[best], ...n};
    else out.push(n);
  });
  return normalizeCourses(out);
}

async function validateAndRepairWithDeepSeek(courses) {
  const prompt = `
你是课程表结构校验器。请检查下面 JSON 中的课程：
${JSON.stringify(courses, null, 2)}

请修复明显的格式错误、时间顺序错误、星期格式错误、重复课程，并保留图片识别到的原始课程名称。
不要凭空增加课程。
只输出 JSON：
{
  "courses":[
    {"title":"","day":"周一","start":"08:00","end":"08:50","room":"","type":"课程","task":"","color":"#dbeafe","confidence":1}
  ],
  "issues":["问题说明"]
}
`;
  const apiJson = await callSmartService("/deepseek", {
    model:"deepseek-chat",
    temperature:0.2,
    messages:[
      {role:"system",content:"你只负责课程表数据结构校验与修复，不做额外推测。"},
      {role:"user",content:prompt}
    ]
  });
  const parsed = extractJson(extractContent(apiJson));
  return {
    courses: normalizeCourses(parsed.courses || courses),
    issues: Array.isArray(parsed.issues) ? parsed.issues : []
  };
}

function detectConflicts(courses) {
  const result = [];
  const byDay = {};
  courses.forEach(c => (byDay[c.day] ||= []).push(c));
  Object.entries(byDay).forEach(([day,list]) => {
    list.sort((a,b)=>timeToMinutes(a.start)-timeToMinutes(b.start));
    for (let i=1;i<list.length;i++) {
      const a = list[i-1], b = list[i];
      if (timeToMinutes(a.end) > timeToMinutes(b.start)) {
        result.push(`${day}：${a.title} ${a.start}-${a.end} 与 ${b.title} ${b.start}-${b.end} 重叠`);
      }
    }
  });
  return result;
}
