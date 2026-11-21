#!/usr/bin/env node
// Recolector de auditoria-web. Solo lectura: abre la URL, mide y escribe un JSON.
// Uso: node scripts/recoger.mjs <url> [--movil] [--solo-enlaces] [--salida archivo.json]
// Requiere: npm i -D playwright && npx playwright install chromium
import { chromium, devices } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--'));
if (!url) { console.error('Uso: node scripts/recoger.mjs <url> [--movil] [--solo-enlaces] [--salida archivo.json]'); process.exit(1); }
const movil = args.includes('--movil');
const soloEnlaces = args.includes('--solo-enlaces');
const salidaIdx = args.indexOf('--salida');
const salida = salidaIdx > -1 ? args[salidaIdx + 1] : null;

const browser = await chromium.launch();
const context = await browser.newContext(movil ? devices['iPhone 13'] : { viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const headers = {};
page.on('response', r => { if (r.url() === url || r.request().isNavigationRequest()) Object.assign(headers, r.headers()); });
const t0 = Date.now();
const resp = await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1500);

const datos = await page.evaluate(async ({ soloEnlaces }) => {
  const q = s => [...document.querySelectorAll(s)];
  const t = e => (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const norm = u => { try { const x = new URL(u, location.href); x.hash = ''; return x.href; } catch { return null; } };
  const enlaces = [...new Set(q('a[href]').map(a => norm(a.href)).filter(Boolean))];
  const base = {
    url: location.href, titulo: document.title, idioma: document.documentElement.lang,
    robots: document.querySelector('meta[name=robots]')?.content || null,
    canonica: document.querySelector('link[rel=canonical]')?.href || null,
    h1: q('h1').map(t),
    navegacion: q("nav, header, footer, [role=navigation]").map(n => ({ zona: n.tagName.toLowerCase(), enlaces: [...n.querySelectorAll("a")].map(a => ({ texto: t(a), href: norm(a.href) })) })),
    enlacesInternos: enlaces.filter(u => new URL(u).host === location.host),
    enlacesExternos: enlaces.filter(u => new URL(u).host !== location.host).length,
  };
  if (soloEnlaces) return base;
  const R = performance.getEntriesByType('resource'), N = performance.getEntriesByType('navigation')[0];
  const kb = x => Math.round(x / 1024);
  let reglas = 0, important = 0, mq = 0, sel = [];
  for (const s of document.styleSheets) { try { for (const r of s.cssRules) { reglas++; if (r.cssText.includes('!important')) important++; if (r.media) mq++; if (r.selectorText) sel.push(r.selectorText); } } catch {} }
  const muestra = sel.filter((_, i) => i % 7 === 0); let usados = 0;
  for (const s of muestra) { try { if (document.querySelector(s.replace(/::?[a-z-]+(\([^)]*\))?/g, ''))) usados++; } catch {} }
  const lum = c => { const m = (c.match(/[\d.]+/g) || [0, 0, 0]).map(Number); const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
  const fondo = e => { while (e) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\(.*, 0\)$/.test(b) && b !== 'transparent') return b; e = e.parentElement; } return 'rgb(255, 255, 255)'; };
  const textos = q('body *').filter(e => e.offsetParent && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
  const contrasteBajo = textos.map(e => { const cs = getComputedStyle(e); const a = lum(cs.color), b = lum(fondo(e)); const r = (Math.max(a, b) + .05) / (Math.min(a, b) + .05); const grande = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.6 && +cs.fontWeight >= 700); return { texto: t(e).slice(0, 40), ratio: +r.toFixed(2), px: cs.fontSize, ok: r >= (grande ? 3 : 4.5) }; }).filter(x => !x.ok);
  const lcp = await new Promise(res => { let v = null; new PerformanceObserver(l => { for (const e of l.getEntries()) v = { ms: Math.round(e.startTime), elemento: e.element?.tagName }; }).observe({ type: 'largest-contentful-paint', buffered: true }); setTimeout(() => res(v), 300); });
  const cls = await new Promise(res => { let v = 0; new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) v += e.value; }).observe({ type: 'layout-shift', buffered: true }); setTimeout(() => res(+v.toFixed(3)), 300); });
  return { ...base,
    description: document.querySelector('meta[name=description]')?.content || null,
    hreflang: q('link[rel=alternate][hreflang]').map(l => l.hreflang + '=' + l.href),
    og: Object.fromEntries(q('meta[property^="og:"]').map(m => [m.getAttribute('property'), m.content])),
    h2: q('h2').map(t), palabras: (document.body.innerText || '').split(/\s+/).filter(Boolean).length,
    schema: q('script[type="application/ld+json"]').map(s => { try { const j = JSON.parse(s.textContent); return (j['@graph'] || [j]).map(x => x['@type']).flat(); } catch { return ['invalido']; } }).flat(),
    rendimiento: { ttfb: Math.round(N.responseStart), dcl: Math.round(N.domContentLoadedEventEnd), load: Math.round(N.loadEventEnd), protocolo: N.nextHopProtocol, lcp, cls, visibilidad: document.visibilityState,
      peticiones: R.length, kbTransferidos: kb(R.reduce((a, r) => a + r.transferSize, 0)),
      kbCss: kb(R.filter(r => /\.css/.test(r.name)).reduce((a, r) => a + r.decodedBodySize, 0)),
      kbJs: kb(R.filter(r => r.initiatorType === 'script').reduce((a, r) => a + r.decodedBodySize, 0)),
      bloqueantes: R.filter(r => r.renderBlockingStatus === 'blocking').map(r => r.name.split('?')[0]),
      terceros: [...new Set(R.map(r => new URL(r.name).host).filter(h => h !== location.host))] },
    css: { hojas: document.styleSheets.length, reglas, important, mediaQueries: mq, selectoresUsados: `${usados}/${muestra.length}` },
    fuentes: [...new Set([...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family} ${f.weight} ${f.style}`))],
    imagenes: q('img').map(i => ({ src: i.currentSrc.split('?')[0], real: `${i.naturalWidth}x${i.naturalHeight}`, mostrada: `${i.clientWidth}x${i.clientHeight}`, lazy: i.loading, dimensiones: !!(i.getAttribute('width') && i.getAttribute('height')), alt: i.hasAttribute('alt') })),
    accesibilidad: { landmarks: { header: !!q('header,[role=banner]').length, nav: !!q('nav,[role=navigation]').length, main: !!q('main,[role=main]').length, footer: !!q('footer,[role=contentinfo]').length },
      saltarContenido: !!document.querySelector('a[href="#content"], a[href="#main"], .skip-link'),
      sinNombre: q('a,button').filter(e => !t(e) && !e.getAttribute('aria-label') && !e.querySelector('img[alt]')).length,
      objetivosPequenos: q('a,button').filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.height > 0 && (r.height < 24 || r.width < 24)).length,
      contrasteBajo: contrasteBajo.slice(0, 30), contrasteBajoTotal: contrasteBajo.length, textosVisibles: textos.length },
    cro: { ctas: q('a.button, a[class*=btn], a[class*=button], button').filter(e => e.offsetParent).map(e => ({ texto: t(e), destino: e.getAttribute('href') })),
      formularios: q('form').map(f => ({ accion: f.action, campos: [...f.elements].filter(e => e.type !== 'hidden').map(e => (e.name || e.type) + (e.required ? '*' : '')) })),
      anclasRotas: q('a[href^="#"]').map(a => a.getAttribute('href')).filter(h => h.length > 1 && !document.getElementById(h.slice(1))) },
    analitica: { globals: ['_paq', 'gtag', 'dataLayer', 'fbq', 'posthog', 'hj', 'clarity'].filter(k => window[k] !== undefined), dataLayer: (window.dataLayer || []).slice(0, 20).map(x => JSON.stringify(x).slice(0, 200)) }
  };
}, { soloEnlaces });

datos.estado = resp?.status() ?? null;
datos.cabeceras = Object.fromEntries(['cache-control', 'content-encoding', 'server', 'cf-cache-status', 'strict-transport-security', 'content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy'].map(k => [k, headers[k] ?? null]));
datos.medidoEn = new Date().toISOString(); datos.dispositivo = movil ? 'movil' : 'escritorio'; datos.msTotal = Date.now() - t0;
await browser.close();
const json = JSON.stringify(datos, null, 2);
if (salida) { mkdirSync(dirname(salida), { recursive: true }); writeFileSync(salida, json); } else console.log(json);
