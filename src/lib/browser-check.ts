import { BANNER_STYLE_CSS, CLOSE_BUTTON_STYLE_CSS } from '@/lib/browser-warn-style'

/**
 * 浏览器能力检查（issue #188）。
 *
 * 判断依据（官方资料，2026-11）：
 * - Next.js 16 最低：Chrome/Edge ≥ 111（nextjs.org/docs/architecture/supported-browsers）
 * - Tailwind CSS v4 最低：Chrome ≥ 111（tailwindcss.com/docs/compatibility）
 * - 生产 CSS（Astryx 主题）实际使用 `@scope`：Chrome/Edge ≥ 118（MDN BCD，edge mirror chrome）
 * 取三者并集：**Chromium 内核 ≥ 118** 才被判为「能力足够」；< 118 判「过旧」。
 *
 * 原则：
 * - 只按**能力 + Chromium 内核版本**判断；绝不因「识别不到浏览器品牌/UA」告警（不误报未知浏览器）。
 * - 不确定是否低于 118 时不告警（宁可让新版 Edge 用户看到正常界面，也不误报）。
 * - 不读取/不上报用户代理。
 */
export const MIN_CHROMIUM_MAJOR = 118
const SCOPE_CONDITION = 'at-rule(@scope)'

export type BrowserCheckResult =
  | { decision: 'ok' }
  | { decision: 'too-old'; info: string }
  | { decision: 'unknown' }

export function checkBrowserSupport(): BrowserCheckResult {
  if (typeof window === 'undefined') return { decision: 'unknown' }

  // 关键能力：Astryx 主题依赖 @scope（Edge/Chrome 118+）。
  try {
    if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
      if (CSS.supports(SCOPE_CONDITION)) return { decision: 'ok' } // 能力足够，不做品牌/UA 判断（不误报）
    } else {
      // 极老环境连 CSS.supports 都没有：不判断，避免误报。
      return { decision: 'unknown' }
    }
  } catch {
    return { decision: 'unknown' }
  }

  // 走到这里说明：CSS.supports 可用但 @scope 不支持 → 需要内核版本判断
  // 来区分「已知过旧」（Edge/Chrome < 118）与「未知浏览器能力不足」。
  const ua = navigator.userAgent || ''
  const chrom = /(?:Chrome|Chromium)\/(\d+)/.exec(ua)
  // Edge 的 UA 含 Chrome/<v>，版本与 Chromium 同步；用「Chromium 家族」统一处理，
  // 避免因品牌误判。Edge 100 在本正则下 → 100。
  const major = chrom ? Number(chrom[1]) : null
  if (major !== null && Number.isFinite(major)) {
    if (major < MIN_CHROMIUM_MAJOR) return { decision: 'too-old', info: `Chromium ${major}` }
    // >= 118 但 @scope 仍不支持：罕见（UA 可信但能力异常），不告警，按 ok 处理。
    return { decision: 'ok' }
  }
  // 识别不到 Chromium 内核版本（Safari/Firefox 等）：不告警。
  return { decision: 'unknown' }
}

/** 给 UI 用的中文提示文案（旧内核可见；新版/未知显示为空，不占位）。 */
export function browserWarningHtml(result: BrowserCheckResult): string {
  if (result.decision !== 'too-old') return ''
  return (
    `⚠️ 您的浏览器版本过旧（${result.info}），界面可能显示异常。` +
    `更新方法：Edge → 设置 → 关于 Microsoft Edge；Chrome → 设置 → 关于 Chrome，更新后刷新页面。`
  )
}

/**
 * 内联早期脚本（服务器渲染，语言兼容旧内核，受现有 CSP 允许：script-src 含 'unsafe-inline'）。
 * 在 App chunk/CSS 可能失效时仍能挂上提示 DOM。
 * 逻辑与 checkBrowserSupport 完全一致。
 *
 * 样式不在这里手写：横幅与关闭按钮的声明来自 `lib/browser-warn-style.ts`，与 React 版共用同一份常量，
 * 避免两版漂移（`browser-warn-style.test.ts` 有断言）。运行时只依赖 DOM/CSS/localStorage，不依赖 React 或组件库。
 */
export const BROWSER_WARN_INIT_SCRIPT = `(function(){try{
  var root=document.documentElement;
  if(root.getAttribute('data-fmkj-browser-warn-set'))return;
  try{var _u=Number(localStorage.getItem('fmkj:browser-warn-dismissed-until')||'0');if(_u&&Date.now()<_u)return;}catch(e){}
  var ok=false,tooOld=false,info='';
  try{
    if(typeof CSS==='undefined'||typeof CSS.supports!=='function')return;
    ok=CSS.supports('${SCOPE_CONDITION}');
  }catch(e){return;}
  if(!ok){
    try{
      var m=/(?:Chrome|Chromium)\\/(\\d+)/.exec(navigator.userAgent||'');
      var v=m?parseInt(m[1],10):null;
      if(v!==null&&isFinite(v)&&v<${MIN_CHROMIUM_MAJOR}){tooOld=true;info='Chromium '+v;}
    }catch(e){}
  }
  if(tooOld){
    if(!document.body){ document.addEventListener('DOMContentLoaded',function(){ var d=makeWarn(info); if(d) document.body.appendChild(d); }); }
    else { var d0=makeWarn(info); if(d0) document.body.appendChild(d0); }
    root.setAttribute('data-fmkj-browser-warn-set','1');
    function makeWarn(info){ try{ return buildWarn(info) }catch(e){ return null } }
  } else {
    root.setAttribute('data-fmkj-browser-warn-set','1');
  }
  function buildWarn(info){
    var d=document.createElement('div');
    d.id='__fmkj_browser_warn';
    d.setAttribute('role','status');
    d.setAttribute('aria-live','polite');
    d.style.cssText='${BANNER_STYLE_CSS}';
    d.textContent='⚠️ 您的浏览器版本过旧（'+info+'），界面可能显示异常。更新方法：Edge → 设置 → 关于 Microsoft Edge，或 Chrome 设置 → 关于 Chrome，更新后刷新页面。';
    var x=document.createElement('button');
    x.type='button';x.setAttribute('aria-label','关闭浏览器过旧提示');
    x.style.cssText='${CLOSE_BUTTON_STYLE_CSS}';
    x.textContent='✕';
    x.onclick=function(){
      d.parentNode.removeChild(d);
      try{document.body.style.paddingTop='';}catch(e){}
      try{localStorage.setItem('fmkj:browser-warn-dismissed-until',String(Date.now()+30*864e5));}catch(e){}
    };
    d.appendChild(x);
    document.body.appendChild(d);
    try{ var h=d.offsetHeight||0; if(h) document.body.style.paddingTop=h+'px'; }catch(e){}
  }
}catch(e){}}())`
