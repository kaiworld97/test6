export const prerender = true;

export function GET() {
  const id = import.meta.env.PUBLIC_GA4_ID ?? '';
  if (!/^G-[A-Z0-9]+$/.test(id)) return new Response('', {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8' }
  });
  return new Response(`
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', ${JSON.stringify(id)});
    window.campusEvent = (name, parameters) => gtag('event', name, parameters || {});
    if (document.body.dataset.home) window.campusEvent('view_today');
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + ${JSON.stringify(id)};
    document.head.append(tag);
  `, { headers: { 'Content-Type': 'text/javascript; charset=utf-8' } });
}
