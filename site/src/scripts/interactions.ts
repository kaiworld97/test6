declare global {
  interface Window {
    campusEvent?: (name: string, parameters?: Record<string, string | boolean>) => void;
  }
}

for (const list of document.querySelectorAll<HTMLElement>('[role="tablist"]')) {
  const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  function select(tab: HTMLButtonElement) {
    for (const candidate of tabs) {
      const selected = candidate === tab;
      candidate.setAttribute('aria-selected', String(selected));
      candidate.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(candidate.getAttribute('aria-controls')!);
      if (panel) panel.hidden = !selected;
    }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      const targets: Record<string, number> = {
        ArrowLeft: (index - 1 + tabs.length) % tabs.length,
        ArrowRight: (index + 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1
      };
      const targetIndex = targets[event.key];
      if (typeof targetIndex !== 'number') return;
      event.preventDefault();
      select(tabs[targetIndex]);
      tabs[targetIndex].focus();
    });
  });
}

document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const route = event.target.closest<HTMLElement>('[data-route]');
  if (route) {
    const parameters: Record<string, string> = { placement: route.dataset.placement ?? 'page' };
    if (route.dataset.route === 'classroom') parameters.destination = 'pc';
    else parameters.restaurant_id = route.dataset.route ?? '';
    window.campusEvent?.('route_click', parameters);
  }
  const feedback = event.target.closest<HTMLButtonElement>('[data-helpful]');
  if (feedback && feedback.getAttribute('aria-pressed') !== 'true') {
    feedback.setAttribute('aria-pressed', 'true');
    feedback.textContent = '✓ 도움됐어요';
    window.campusEvent?.('helpful_click');
  }
});

export {};
