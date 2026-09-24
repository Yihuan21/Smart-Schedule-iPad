(function(){
function imageData(file){
 return new Promise(function(resolve,reject){
  var fr=new FileReader();
  fr.onload=function(){resolve(fr.result)};
  fr.onerror=function(){reject(new Error("图片读取失败"))};
  fr.readAsDataURL(file);
 });
}
function resizeImage(file){
 return imageData(file).then(function(src){
  return new Promise(function(resolve,reject){
   var img=new Image();
   img.onload=function(){
    var max=2200;
    var scale=Math.min(1,max/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
    var w=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));
    var h=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
    var canvas=document.createElement("canvas");
    canvas.width=w; canvas.height=h;
    var ctx=canvas.getContext("2d");
    if(!ctx){reject(new Error("浏览器不支持图片处理"));return}
    ctx.fillStyle="#fff";ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);
    resolve(canvas.toDataURL("image/jpeg",.86));
   };
   img.onerror=function(){reject(new Error("图片解码失败"))};
   img.src=src;
  });
 });
}
window.recognize=async function(file){
 var box=document.getElementById("recognitionResult");
 if(!file){if(box)box.innerHTML="<p class=\"err\">还没有选择课程表图片。</p>";return}
 try{
  if(box)box.innerHTML="<div class=\"recognition-status\"><b>① 图片已选择</b><span>正在压缩图片…</span></div>";
  var image=await resizeImage(file);
  if(box)box.innerHTML="<div class=\"recognition-status\"><b>② 图片已准备</b><span>正在调用智谱视觉 API…</span></div>";
  var d=await api("/zhipu",{method:"POST",body:JSON.stringify({image:image,prompt:"识别课程表并严格输出 JSON：{courses:[{title,day,start,end,periods,room}]}。只识别图片实际出现且能确认的课程。课程可能只有1到7天，绝对不要补齐不存在的日期。day只能是周一到周日。明确时钟时间优先；连续节次合并为真实开始和结束时间；看不清不要猜。"} )});
  if(!d||!d.choices||!d.choices.length){
   var em="视觉 API 没有返回结果";
   if(d&&d.error&&d.error.message)em=d.error.message;
   else if(d&&typeof d.error==="string")em=d.error;
   throw new Error(em);
  }
  if(box)box.innerHTML="<div class=\"recognition-status\"><b>③ AI 已返回</b><span>正在解析识别结果…</span></div>";
  var raw=d.choices[0]&&d.choices[0].message&&d.choices[0].message.content||"";
  var a=raw.indexOf("{"),b=raw.lastIndexOf("}");
  var data;
  if(a>=0&&b>a)data=JSON.parse(raw.slice(a,b+1));else data=JSON.parse(raw);
  var list=Array.isArray(data.courses)?data.courses:[];
  if(!list.length)throw new Error("API 已返回，但没有识别到可确认的课程");
  var days=[];
  list.forEach(function(v){if(v.day&&days.indexOf(v.day)<0)days.push(v.day)});
  var html="<div class=\"recognition-head\"><div><b>④ 识别成功</b><span> 共 "+days.length+" 天、"+list.length+" 门/节课程</span></div><button id=\"clearRecognition\" class=\"secondary\" type=\"button\">清除</button></div><p class=\"muted\">已确认图片上传成功、视觉 API 返回成功并解析出课程；不会自动补齐其他天。</p><div class=\"recognition-days\">";
  days.forEach(function(day){
   html+="<div class=\"recognition-day\"><b>"+esc(day)+"</b>";
   list.filter(function(v){return v.day===day}).forEach(function(v){
    html+="<div class=\"recognition-course\"><span>"+esc(v.start||"--")+"–"+esc(v.end||"--")+"</span><strong>"+esc(v.title||"未命名课程")+"</strong>";
    if(v.room)html+="<small>"+esc(v.room)+"</small>";
    html+="</div>";
   });
   html+="</div>";
  });
  html+="</div>";
  if(box)box.innerHTML=html;
  var clear=document.getElementById("clearRecognition");
  if(clear)clear.onclick=function(){box.innerHTML=""};
 }catch(e){
  if(box)box.innerHTML="<div class=\"recognition-status error\"><b>识别失败</b><span>"+esc(e.message||"未知错误")+"</span></div><p class=\"muted\">如果这里显示 API 错误，说明图片已经上传，问题在视觉接口或返回内容。</p>";
 }
};
function bindRecognition(){
 var input=document.getElementById("image");
 if(input)input.onchange=function(e){window.recognize(e.target.files[0])};
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bindRecognition);else bindRecognition();
})();