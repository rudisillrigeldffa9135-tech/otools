/** 站内页面路径转成浏览器可直接打开的地址（H5 用于 <a href>，可在新标签页中打开） */
export function pageHref(path: string) {
  const base = (import.meta.env.VITE_APP_PUBLIC_BASE || '/').replace(/\/?$/, '/')
  const p = path.startsWith('/') ? path.slice(1) : path
  return import.meta.env.VITE_APP_ROUTER_MODE === 'history' ? `${base}${p}` : `${base}#/${p}`
}
