(() => {
  const API = "https://schedule-ai-proxy.yihuanchen219.workers.dev";
  const $ = id => document.getElementById(id);
  const msg = (text, ok=false) => {
    const el = $("authMsg");
    if (el) el.innerHTML = '<p class="' + (ok ? 'ok' : 'err') + '">' +
      String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) + '</p>';
  };
  const request = async (path, options={}) => {
    options.headers = Object.assign({'content-type':'application/json'}, options.headers || {});
    const r = await fetch(API + path, options);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || ('服务器返回 HTTP ' + r.status));
    return d;
  };
  async function sendCodeDirect() {
    const btn = $("sendCode");
    if (btn) { btn.disabled = true; btn.textContent = "发送中…"; }
    msg("正在连接服务器发送验证码…", true);
    try {
      const d = await request("/auth/send-code", {
        method:"POST",
        body:JSON.stringify({
          name: $("name")?.value || "",
          email: $("email")?.value || "",
          password: $("password")?.value || ""
        })
      });
      msg(d.message || "验证码已发送，请检查邮箱", true);
      let n=60;
      const timer=setInterval(() => {
        n--;
        if (!btn) return;
        if (n<=0) { clearInterval(timer); btn.disabled=false; btn.textContent="发送验证码"; }
        else btn.textContent=n+"秒后重发";
      },1000);
    } catch(e) {
      msg(e.message || "验证码发送失败");
      if (btn) { btn.disabled=false; btn.textContent="发送验证码"; }
    }
  }
  async function loginDirect() {
    const btn=$("login");
    if(btn) btn.disabled=true;
    msg("正在登录…", true);
    try {
      const d=await request("/auth/login",{method:"POST",body:JSON.stringify({
        email:$("email")?.value || "", password:$("password")?.value || ""
      })});
      sessionStorage.setItem("ss_token",d.token);
      location.reload();
    } catch(e) {
      msg(e.message || "登录失败");
      if(btn) btn.disabled=false;
    }
  }
  async function registerDirect() {
    const btn=$("register");
    if(btn) btn.disabled=true;
    msg("正在验证邮箱并创建账号…", true);
    try {
      const d=await request("/auth/register",{method:"POST",body:JSON.stringify({
        email:$("email")?.value || "", code:$("code")?.value || ""
      })});
      sessionStorage.setItem("ss_token",d.token);
      location.reload();
    } catch(e) {
      msg(e.message || "注册失败");
      if(btn) btn.disabled=false;
    }
  }
  function bind() {
    const s=$("sendCode"), l=$("login"), r=$("register");
    if(s) s.onclick=sendCodeDirect;
    if(l) l.onclick=loginDirect;
    if(r) r.onclick=registerDirect;
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",bind);
  else bind();
})();