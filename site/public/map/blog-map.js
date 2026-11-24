(() => {
  const query = new URLSearchParams(location.search);
  const startLabels = { exit: '어린이대공원역 5번 출구', lift1: '김원관 1층 승강장', foyer: '김원관 6층 로비' };
  const graph = JSON.parse(document.getElementById('navdata').textContent);
  const from = Object.hasOwn(startLabels, query.get('from')) ? query.get('from') : null;
  const to = Object.hasOwn(graph.destinations, query.get('to')) ? query.get('to') : null;
  const guide = document.getElementById('guide');
  const dest = document.getElementById('dest');
  const loading = document.getElementById('loading');
  const flat = query.get('view') === '2d';

  function mapHref(start, target, view) {
    const params = new URLSearchParams({ from: start, to: target, mode: 'manual' });
    if (view) params.set('view', view);
    return '/map/?' + params.toString();
  }

  function findPath(start, target) {
    const adjacent = new Map();
    for (const chain of [...graph.chains, ['car1', 'car6']]) {
      for (let i = 1; i < chain.length; i++) {
        const a = chain[i - 1];
        const b = chain[i];
        adjacent.set(a, [...(adjacent.get(a) ?? []), b]);
        adjacent.set(b, [...(adjacent.get(b) ?? []), a]);
      }
    }
    const queue = [[start]];
    const visited = new Set([start]);
    for (const path of queue) {
      const last = path.at(-1);
      if (last === target) return path;
      for (const node of adjacent.get(last) ?? []) {
        if (visited.has(node)) continue;
        visited.add(node);
        queue.push([...path, node]);
      }
    }
    return [start, target];
  }

  function drawRoute(canvas, path) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const points = path.map(node => graph.nodes[node]);
    const minX = Math.min(...points.map(point => point[0]));
    const maxX = Math.max(...points.map(point => point[0]));
    const minY = Math.min(...points.map(point => point[1]));
    const maxY = Math.max(...points.map(point => point[1]));
    const { width, height } = canvas;
    const scale = Math.min((width - 86) / Math.max(maxX - minX, 20), (height - 86) / Math.max(maxY - minY, 20));
    const project = ([x, y]) => [width / 2 + (x - (minX + maxX) / 2) * scale,
      height / 2 - (y - (minY + maxY) / 2) * scale];
    ctx.fillStyle = '#edf0e5';
    ctx.fillRect(0, 0, width, height);
    const line = (points, fill) => {
      ctx.beginPath();
      for (const [i, point] of points.entries()) ctx[i ? 'lineTo' : 'moveTo'](...project(point));
      if (fill) {
        ctx.closePath();
        ctx.fill();
      } else ctx.stroke();
    };
    ctx.fillStyle = '#d5dfd2';
    for (const building of graph.mapBuildings) line(building, true);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#bacbb9';
    for (const street of graph.mapStreets) line(street, false);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#a95713';
    line(points, false);
    [points[0], points.at(-1)].forEach((point, index) => {
      const [x, y] = project(point);
      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fillStyle = index ? '#a95713' : '#214e38';
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(String(index + 1), x, y);
    });
  }

  function showFlat(message) {
    const start = from ?? 'exit';
    const target = to ?? 'pc';
    const targetInfo = graph.destinations[target];
    const panel = document.getElementById('map-fallback');
    panel.hidden = false;
    document.body.dataset.flatMap = '';
    panel.querySelector('p').textContent = message;
    panel.querySelector('[data-try-3d]').href = mapHref(start, target);
    const steps = [`${startLabels[start]}에서 출발`];
    if (graph.nodes[start][2] !== graph.nodes[target][2]) {
      steps.push(`김원관 엘리베이터로 ${graph.nodes[target][2]}층 이동`);
    }
    steps.push(targetInfo.note ?? `${targetInfo.name} (${targetInfo.sub}) 도착`);
    panel.querySelector('ol').replaceChildren(...steps.map(step => {
      const item = document.createElement('li');
      item.textContent = step;
      return item;
    }));
    drawRoute(panel.querySelector('canvas'), findPath(start, target));
  }

  function recordStart(mode) {
    const target = dest.value;
    const restaurants = { gunja: 'gyejeol', student: 'sandeul', jingwan: 'jingwan' };
    window.campusEvent?.('route_start', { mode, destination: target, restaurant_id: restaurants[target] ?? '' });
  }

  if (flat) {
    showFlat('지도에서 출발점 1과 도착점 2를 확인하세요.');
    return;
  }

  let initialized = false;
  function applyDeepLink() {
    if (initialized || document.body.hasAttribute('data-flat-map') || document.body.dataset.ready !== 'true') return;
    initialized = true;
    if (from) document.querySelector(`[data-start="${from}"]`)?.click();
    if (to) {
      dest.value = to;
      dest.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const startText = guide.textContent;
    guide.addEventListener('click', () => {
      if (guide.textContent !== startText) recordStart(from && to && guide.dataset.deepLink ? 'auto' : 'manual');
    });
    if (from && to && from !== to && query.get('mode') === 'auto') {
      guide.dataset.deepLink = 'true';
      guide.click();
      delete guide.dataset.deepLink;
    }
  }

  function checkMap() {
    applyDeepLink();
    if (!initialized && loading.textContent !== loading.dataset.initialText) {
      const errorText = loading.textContent.trim();
      showFlat(errorText || '3D 지도를 열 수 없어 2D 지도를 표시합니다.');
    }
  }

  const observer = new MutationObserver(checkMap);
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ready'] });
  observer.observe(loading, { childList: true, subtree: true, characterData: true });
  checkMap();
  setTimeout(() => {
    if (!initialized && !document.body.hasAttribute('data-flat-map')) {
      showFlat('3D 지도 로딩이 지연되어 2D 지도를 표시합니다.');
    }
  }, 30_000);
})();
