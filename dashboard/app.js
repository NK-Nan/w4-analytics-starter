(function () {
  const R = window.React, h = R.createElement;
  const { useState, useMemo, useRef, useEffect } = R;

  const DONE = 'จัดส่งสำเร็จ', CANCEL = 'ยกเลิก', RETURN = 'คืนสินค้า';
  const ALL = '__all__';
  const REQUIRED = ['order_datetime', 'channel', 'region', 'category', 'qty', 'unit_price', 'discount_pct', 'status'];
  const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

  // Fixed en-US grouping so every figure shows commas (1,234,567) whatever the viewer's locale.
  const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0, useGrouping: true });
  const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });
  const fmtInt = nf0;
  const baht = (nf) => (v) => (v < 0 ? '−฿' : '฿') + nf.format(Math.abs(v));
  const fmtBaht = baht(nf0);
  const fmtBaht2 = baht(nf2);
  const fmtPct = (v) => v.toFixed(2) + '%';
  const beYear = (ym) => Number(ym.slice(0, 4)) + 543;
  const monthName = (ym) => TH_MONTH[Number(ym.slice(5, 7)) - 1];
  const monthLabel = (ym) => monthName(ym) + ' ' + beYear(ym);
  const monthIndex = (ym) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1;
  const monthFromIndex = (i) => Math.floor(i / 12) + '-' + String((i % 12) + 1).padStart(2, '0');

  // YYYY-MM-DD from order_datetime: ISO (2025-10-01 …) or D/M/YYYY; a Buddhist year (> 2400) becomes CE.
  function dayKey(v) {
    const s = String(v ?? '').trim();
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/), y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/))) { y = +m[3]; mo = +m[2]; d = +m[1]; }
    else return '';
    if (y > 2400) y -= 543;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  const dayLabel = (day) => Number(day.slice(8, 10)) + ' ' + monthName(day) + ' ' + beYear(day);

  // Mega sale days: month number = day number (10.10, 11.11, 12.12, 3.3, 6.6, 9.9).
  const MEGA = new Set(['10-10', '11-11', '12-12', '03-03', '06-06', '09-09']);
  const isMega = (day) => MEGA.has(day.slice(5));
  const megaName = (day) => Number(day.slice(5, 7)) + '.' + Number(day.slice(8, 10));

  const num = (x) => {
    if (x === undefined || x === null) return NaN;
    const s = String(x).replace(/,/g, '').trim();
    return s === '' ? NaN : Number(s);
  };

  // Turn parsed CSV objects into typed rows; count rows whose numbers can't be read.
  function prepare(raw) {
    let badNum = 0;
    const rows = raw.map((r) => {
      const status = String(r.status ?? '').trim();
      const qty = num(r.qty), price = num(r.unit_price);
      let disc = num(r.discount_pct);
      if (Number.isNaN(disc)) disc = 0;
      const ok = !Number.isNaN(qty) && !Number.isNaN(price);
      if (!ok && status === DONE) badNum++;
      const day = dayKey(r.order_datetime);
      return {
        day, month: day.slice(0, 7),
        productId: String(r.product_id ?? '').trim(),
        qty: ok ? qty : 0,
        channel: String(r.channel ?? '').trim() || '(ไม่ระบุ)',
        carrier: String(r.carrier ?? '').trim() || '(ไม่ระบุ)',
        region: String(r.region ?? '').trim() || '(ไม่ระบุ)',
        province: String(r.province ?? '').trim() || '(ไม่ระบุ)',
        category: String(r.category ?? '').trim() || '(ไม่ระบุ)',
        status: status || '(ว่าง)',
        net: status === DONE && ok ? qty * price * (1 - disc / 100) : 0,
      };
    });
    return { rows, badNum };
  }

  function useWidth() {
    const ref = useRef(null);
    const [w, setW] = useState(0);
    useEffect(() => {
      if (!ref.current) return;
      const ro = new ResizeObserver((es) => setW(Math.floor(es[0].contentRect.width)));
      ro.observe(ref.current);
      return () => ro.disconnect();
    }, []);
    return [ref, w];
  }

  function measure(texts) {
    const c = measure.c || (measure.c = document.createElement('canvas').getContext('2d'));
    c.font = "12px 'Prompt', " + getComputedStyle(document.body).fontFamily;
    return Math.max(0, ...texts.map((t) => c.measureText(t).width));
  }

  function Tip({ tip }) {
    if (!tip) return null;
    return h('div', { className: 'bs-tip', style: { left: tip.x + 'px', top: tip.y + 'px' } },
      h('div', { className: 'bs-tk' }, tip.k), h('div', null, tip.v));
  }

  function placeTip(w, x, y, k, v) {
    const tw = Math.max(measure([k, v]) + 20, 90);
    return { x: Math.min(Math.max(0, x - tw / 2), Math.max(0, w - tw)), y: Math.max(0, y - 52), k, v };
  }

  function LineChart({ data }) {
    const [ref, w] = useWidth();
    const [hover, setHover] = useState(null);
    const H = 260;
    if (!data.length) return h('div', { ref, className: 'bs-empty' }, 'ไม่มียอดขายสำเร็จในตัวกรองนี้');
    const yMax = Math.max(...data.map((d) => d.net)) || 1;
    const base = H - 40;
    const y = d3.scaleLinear([0, yMax * 1.08], [base, 10]).nice();
    const ticks = y.ticks(5);
    const ml = measure(ticks.map(fmtBaht)) + 10, mr = 12;
    const x = d3.scalePoint(data.map((d) => d.month), [ml, Math.max(ml + 1, w - mr)]).padding(0.3);
    const step = data.length > 1 ? x(data[1].month) - x(data[0].month) : w;
    const every = Math.max(1, Math.ceil((measure(TH_MONTH) + 6) / Math.max(1, step)));
    const line = d3.line().x((d) => x(d.month)).y((d) => y(d.net));
    const color = dash.colors[0];
    const onMove = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const px = (e.clientX - r.left) * (w / r.width);
      let best = 0;
      data.forEach((d, i) => { if (Math.abs(x(d.month) - px) < Math.abs(x(data[best].month) - px)) best = i; });
      setHover(best);
    };
    const hd = hover != null ? data[hover] : null;
    return h('div', { ref, className: 'bs-chart' },
      w > 0 && h('svg', { width: '100%', height: H, viewBox: `0 0 ${w} ${H}`, onMouseMove: onMove, onMouseLeave: () => setHover(null), role: 'img', 'aria-label': 'ยอดขายสุทธิรายเดือน' },
        ticks.map((t) => h('g', { key: t },
          h('line', { x1: ml, x2: w - mr, y1: y(t), y2: y(t), stroke: 'var(--cds-chart-grid)' }),
          h('text', { x: ml - 8, y: y(t), dy: '0.32em', textAnchor: 'end' }, fmtBaht(t)))),
        data.map((d, i) => i % every === 0 && h('text', { key: d.month, x: x(d.month), y: base + 18, textAnchor: 'middle' }, monthName(d.month))),
        data.map((d, i) => (i === 0 || beYear(d.month) !== beYear(data[i - 1].month)) && h('text', { key: 'y' + d.month, x: x(d.month), y: base + 34, textAnchor: i === 0 ? 'start' : 'middle', style: { fontWeight: 700 } }, 'พ.ศ. ' + beYear(d.month))),
        h('path', { d: line(data), fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        hd && h('line', { x1: x(hd.month), x2: x(hd.month), y1: 10, y2: base, stroke: 'var(--cds-chart-reference)' }),
        hd && h('circle', { cx: x(hd.month), cy: y(hd.net), r: 4, fill: color })),
      hd && h(Tip, { tip: placeTip(w, x(hd.month), y(hd.net), monthLabel(hd.month), fmtBaht(hd.net)) }));
  }

  function BarChart({ data, label, rows, colorOf }) {
    const [ref, w] = useWidth();
    const [hover, setHover] = useState(null);
    if (!data.length) return h('div', { ref, className: 'bs-empty' }, 'ไม่มียอดขายสำเร็จในตัวกรองนี้');
    const rowH = 36, H = Math.max(260, Math.max(data.length, rows || 0) * rowH + 30);
    const ml = measure(data.map((d) => d.label)) + 12;
    const mr = measure(data.map((d) => fmtBaht(d.net))) + 14;
    const x = d3.scaleLinear([0, Math.max(...data.map((d) => d.net)) || 1], [ml, Math.max(ml + 1, w - mr)]);
    const y = d3.scaleBand(data.map((d) => d.label), [10, H - 20]).padding(0.3);
    const bh = Math.min(32, y.bandwidth());
    const hd = hover != null ? data[hover] : null;
    return h('div', { ref, className: 'bs-chart', style: { minHeight: H + 'px' } },
      w > 0 && h('svg', { width: '100%', height: H, viewBox: `0 0 ${w} ${H}`, role: 'img', 'aria-label': label },
        h('line', { x1: ml, x2: ml, y1: 10, y2: H - 20, stroke: 'var(--cds-chart-axis)' }),
        data.map((d, i) => {
          const cy = y(d.label) + y.bandwidth() / 2;
          return h('g', { key: d.label, onMouseEnter: () => setHover(i), onMouseLeave: () => setHover(null) },
            h('rect', { x: ml, y: y(d.label), width: Math.max(0, w - ml), height: y.bandwidth(), fill: 'transparent' }),
            h('rect', { x: ml, y: cy - bh / 2, width: Math.max(1, x(d.net) - ml), height: bh, rx: 4, fill: colorOf ? colorOf(d.label) : dash.colors[0], opacity: hover == null || hover === i ? 1 : 0.55 }),
            h('text', { x: ml - 8, y: cy, dy: '0.32em', textAnchor: 'end' }, d.label),
            h('text', { x: x(d.net) + 6, y: cy, dy: '0.32em' }, fmtBaht(d.net)));
        })),
      hd && h(Tip, { tip: placeTip(w, x(hd.net), y(hd.label), hd.label, fmtBaht(hd.net) + ' · ' + fmtInt.format(hd.n) + ' คำสั่งซื้อ') }));
  }

  // Resolve a theme color token to rgb and pick black or white text that reads on it.
  function inkOn(color) {
    const el = document.createElement('span');
    el.style.color = color; el.style.display = 'none';
    document.body.appendChild(el);
    const m = getComputedStyle(el).color.match(/[\d.]+/g) || [0, 0, 0];
    el.remove();
    const [r, g, b] = m.slice(0, 3).map((v) => { v = Number(v) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1a1a1a' : '#ffffff';
  }

  // Vertical bars per carrier, stacked by category; each segment labelled with its share of that bar.
  function StackedBar({ data, cats }) {
    const [ref, w] = useWidth();
    const [hover, setHover] = useState(null);
    const colors = useMemo(() => cats.map((_, i) => dash.colors[i % dash.colors.length]), [cats]);
    const inks = useMemo(() => colors.map(inkOn), [colors]);
    if (!data.length) return h('div', { ref, className: 'bs-empty' }, 'ไม่มียอดขายสำเร็จในตัวกรองนี้');
    const H = 360, top = 26, base = H - 30;
    const yMax = Math.max(...data.map((d) => d.net)) || 1;
    const y = d3.scaleLinear([0, yMax], [base, top]);
    const x = d3.scaleBand(data.map((d) => d.label), [8, Math.max(9, w - 8)]).paddingInner(0.3).paddingOuter(0.15);
    const bw = Math.min(120, x.bandwidth());
    const hd = hover && data.find((d) => d.label === hover.bar);
    const hs = hd && hd.parts.find((p) => p.cat === hover.cat);
    return h('div', null,
      h('div', { ref, className: 'bs-chart', style: { minHeight: H + 'px' } },
        w > 0 && h('svg', { width: '100%', height: H, viewBox: `0 0 ${w} ${H}`, role: 'img', 'aria-label': 'ยอดขายสุทธิตามบริษัทขนส่ง แยกสัดส่วนหมวดสินค้า', onMouseLeave: () => setHover(null) },
          h('line', { x1: 0, x2: w, y1: base, y2: base, stroke: 'var(--cds-chart-axis)' }),
          data.map((d) => {
            const bx = x(d.label) + (x.bandwidth() - bw) / 2;
            let acc = 0;
            return h('g', { key: d.label },
              d.parts.map((p) => {
                const y0 = y(acc), y1 = y(acc + p.net); acc += p.net;
                const hgt = Math.max(0, y0 - y1), ci = cats.indexOf(p.cat);
                const txt = p.pct.toFixed(1) + '%';
                const fits = hgt >= 15 && bw >= measure([txt]) + 6;
                const on = !hover || (hover.bar === d.label && hover.cat === p.cat);
                return h('g', { key: p.cat, onMouseEnter: () => setHover({ bar: d.label, cat: p.cat }) },
                  h('rect', { x: bx, y: y1, width: bw, height: hgt, fill: colors[ci], opacity: on ? 1 : 0.45, stroke: 'var(--color-panel)', strokeWidth: 1 }),
                  fits && h('text', { x: bx + bw / 2, y: y1 + hgt / 2, dy: '0.32em', textAnchor: 'middle', style: { fill: inks[ci], pointerEvents: 'none' } }, txt));
              }),
              h('text', { x: bx + bw / 2, y: y(d.net) - 8, textAnchor: 'middle', style: { fill: 'var(--color-fg)', fontWeight: 700 } }, fmtBaht(d.net)),
              h('text', { x: bx + bw / 2, y: base + 18, textAnchor: 'middle' }, d.label));
          })),
        hs && h(Tip, { tip: placeTip(w, x(hd.label) + x.bandwidth() / 2, y(hd.net), hd.label + ' · ' + hs.cat, fmtBaht(hs.net) + ' · ' + hs.pct.toFixed(1) + '% ของบริษัทนี้') })),
      h('div', { className: 'bs-legend' }, cats.map((c, i) => h('span', { key: c },
        h('i', { style: { background: colors[i] } }), c))));
  }

  // Regions as thick bars, each followed by its provinces as thinner bars; one shared baht scale.
  function RegionBar({ data }) {
    const [ref, w] = useWidth();
    const [hover, setHover] = useState(null);
    if (!data.length) return h('div', { ref, className: 'bs-empty' }, 'ไม่มียอดขายสำเร็จในตัวกรองนี้');
    const rows = [];
    data.forEach((r) => {
      rows.push({ key: 'r:' + r.label, kind: 'region', label: r.label, net: r.net, n: r.n, share: r.share });
      r.provinces.forEach((p) => rows.push({ key: 'p:' + r.label + ':' + p.label, kind: 'province', label: p.label, net: p.net, n: p.n, share: p.share, region: r.label }));
    });
    const indent = 14, gapTop = 10;
    let yy = 6;
    rows.forEach((r, i) => {
      if (r.kind === 'region' && i > 0) yy += gapTop;
      r.y = yy; r.h = r.kind === 'region' ? 30 : 22; yy += r.h;
    });
    const H = yy + 6;
    const ml = Math.max(...rows.map((r) => measure([r.label]) + (r.kind === 'province' ? indent : 0))) + 12;
    const valTxt = (r) => fmtBaht(r.net) + (r.kind === 'province' ? '  ' + r.share.toFixed(1) + '%' : '');
    const mr = measure(rows.map(valTxt)) + 14;
    const x = d3.scaleLinear([0, Math.max(...rows.map((r) => r.net)) || 1], [ml, Math.max(ml + 1, w - mr)]);
    const hd = hover != null ? rows[hover] : null;
    return h('div', { ref, className: 'bs-chart', style: { minHeight: H + 'px' } },
      w > 0 && h('svg', { width: '100%', height: H, viewBox: `0 0 ${w} ${H}`, role: 'img', 'aria-label': 'ยอดขายสุทธิตามภูมิภาคและจังหวัด' },
        h('line', { x1: ml, x2: ml, y1: 0, y2: H, stroke: 'var(--cds-chart-axis)' }),
        rows.map((r, i) => {
          const reg = r.kind === 'region', cy = r.y + r.h / 2, bh = reg ? 20 : 12;
          return h('g', { key: r.key, onMouseEnter: () => setHover(i), onMouseLeave: () => setHover(null) },
            h('rect', { x: 0, y: r.y, width: w, height: r.h, fill: 'transparent' }),
            h('rect', { x: ml, y: cy - bh / 2, width: Math.max(1, x(r.net) - ml), height: bh, rx: 4,
              fill: reg ? dash.colors[0] : 'var(--cds-chart-muted)', opacity: hover == null || hover === i ? 1 : 0.55 }),
            h('text', { x: reg ? 0 : indent, y: cy, dy: '0.32em', style: reg ? { fill: 'var(--color-fg)', fontWeight: 700 } : null }, r.label),
            h('text', { x: x(r.net) + 6, y: cy, dy: '0.32em', style: reg ? { fill: 'var(--color-fg)', fontWeight: 700 } : null }, valTxt(r)));
        })),
      hd && h(Tip, { tip: placeTip(w, x(hd.net), hd.y + 4,
        hd.kind === 'region' ? hd.label : hd.region + ' · ' + hd.label,
        fmtBaht(hd.net) + ' · ' + hd.share.toFixed(1) + (hd.kind === 'region' ? '% ของทั้งหมด' : '% ของภูมิภาค') + ' · ' + fmtInt.format(hd.n) + ' คำสั่งซื้อ') }));
  }

  // Vertical bars (one per mega sale day) with a dashed line for the normal-day value.
  function VBar({ data, fmt, refValue, refLabel, color, label }) {
    const [ref, w] = useWidth();
    const [hover, setHover] = useState(null);
    if (!data.length) return h('div', { ref, className: 'bs-empty' }, 'ไม่มีวันเมกะเซลในไฟล์นี้');
    const H = 280, top = 26, base = H - 30;
    const yMax = Math.max(refValue || 0, ...data.map((d) => d.value)) * 1.12 || 1;
    const y = d3.scaleLinear([0, yMax], [base, top]);
    const x = d3.scaleBand(data.map((d) => d.key), [8, Math.max(9, w - 8)]).paddingInner(0.35).paddingOuter(0.2);
    const bw = Math.min(56, x.bandwidth());
    const hd = hover != null ? data[hover] : null;
    const refTxt = refLabel + ' ' + fmt(refValue);
    return h('div', { ref, className: 'bs-chart', style: { minHeight: H + 'px' } },
      w > 0 && h('svg', { width: '100%', height: H, viewBox: `0 0 ${w} ${H}`, role: 'img', 'aria-label': label },
        h('line', { x1: 0, x2: w, y1: base, y2: base, stroke: 'var(--cds-chart-axis)' }),
        data.map((d, i) => {
          const bx = x(d.key) + (x.bandwidth() - bw) / 2;
          return h('g', { key: d.key, onMouseEnter: () => setHover(i), onMouseLeave: () => setHover(null) },
            h('rect', { x: x(d.key), y: top, width: x.bandwidth(), height: base - top, fill: 'transparent' }),
            h('rect', { x: bx, y: y(d.value), width: bw, height: Math.max(1, base - y(d.value)), rx: 4, fill: color, opacity: hover == null || hover === i ? 1 : 0.55 }),
            h('text', { x: bx + bw / 2, y: y(d.value) - 8, textAnchor: 'middle', style: { fill: 'var(--color-fg)', fontWeight: 700 } }, fmt(d.value)),
            h('text', { x: bx + bw / 2, y: base + 18, textAnchor: 'middle' }, d.key));
        }),
        refValue != null && h('g', null,
          h('line', { x1: 0, x2: w, y1: y(refValue), y2: y(refValue), stroke: 'var(--cds-chart-reference)', strokeDasharray: '5 4', strokeWidth: 1.5 }),
          h('text', { x: w - 4, y: y(refValue) - 6, textAnchor: 'end', style: { fill: 'var(--color-fg)' } }, refTxt))),
      hd && h(Tip, { tip: placeTip(w, x(hd.key) + x.bandwidth() / 2, y(hd.value), hd.title, hd.tip) }));
  }

  // Two 100% bars: share of net sales vs share of days, mega sale days against normal days.
  function ShareBars({ mega }) {
    const rowsDef = [
      { k: 'สัดส่วนยอดขายสุทธิ', a: mega.share, an: fmtBaht(mega.net), bn: fmtBaht(mega.normalNet) },
      { k: 'สัดส่วนจำนวนวัน', a: mega.dayShare, an: fmtInt.format(mega.days) + ' วัน', bn: fmtInt.format(mega.normalDays) + ' วัน' },
    ];
    return h('div', { className: 'bs-share' },
      rowsDef.map((r) => h('div', { key: r.k, className: 'bs-share-row' },
        h('div', { className: 'bs-share-k' }, r.k),
        h('div', { className: 'bs-share-bar' },
          h('div', { className: 'bs-share-a', style: { width: Math.max(r.a, 0.5) + '%', background: dash.colors[1] } }),
          h('div', { className: 'bs-share-b', style: { width: (100 - r.a) + '%' } })),
        h('div', { className: 'bs-share-v' },
          h('span', null, h('i', { style: { background: dash.colors[1] } }), 'วันเมกะเซล ', h('b', null, r.a.toFixed(2) + '%'), ' · ' + r.an),
          h('span', null, h('i', { style: { background: 'var(--cds-chart-muted)' } }), 'วันปกติ ', h('b', null, (100 - r.a).toFixed(2) + '%'), ' · ' + r.bn)))));
  }

  function MegaTable({ mega, hasCost }) {
    const gmTxt = (g) => (g ? fmtPct(g.pct) : '—');
    return h('div', { className: 'bs-tablewrap' },
      h('table', { className: 'bs-table' },
        h('thead', null, h('tr', null,
          ['วัน', 'วันที่', 'ยอดขายสุทธิ', 'คำสั่งซื้อสำเร็จ', '% ของยอดทั้งปี', 'เท่าของวันปกติ', '% กำไรขั้นต้น'].map((t) => h('th', { key: t }, t)))),
        h('tbody', null,
          mega.byDay.map((d) => h('tr', { key: d.day },
            h('td', null, h('b', null, d.label)), h('td', null, dayLabel(d.day)),
            h('td', null, fmtBaht(d.net)), h('td', null, fmtInt.format(d.n)), h('td', null, fmtPct(d.share)),
            h('td', null, d.ratio.toFixed(2) + '×'), h('td', null, hasCost ? gmTxt(d.gm) : '—'))),
          h('tr', { className: 'bs-tr-ref' },
            h('td', null, h('b', null, 'วันปกติ')), h('td', null, 'เฉลี่ยต่อวัน (' + fmtInt.format(mega.normalDays) + ' วัน)'),
            h('td', null, fmtBaht(mega.normalAvg)), h('td', null, '—'), h('td', null, fmtPct(100 - mega.share)),
            h('td', null, '1.00×'), h('td', null, hasCost ? gmTxt(mega.normalGm) : '—')))));
  }

  // ---- Executive summary: summary figures only (≤ 30 values) go to Claude, never rows.
  const r2 = (v) => Math.round(v * 100) / 100;
  function buildSummary(s, scope, period, hasCost) {
    const top = (list) => list[0] || { label: '-', net: 0 };
    const sh = (v) => (s.net ? r2((v / s.net) * 100) : 0);
    const best = s.monthly.length ? s.monthly.reduce((a, b) => (b.net > a.net ? b : a)) : null;
    const worst = s.monthly.length ? s.monthly.reduce((a, b) => (b.net < a.net ? b : a)) : null;
    const reg = top(s.regionMix), ch = top(s.channel), cat = top(s.category), car = top(s.carrier);
    const o = {
      ช่วงเวลา: period, ตัวกรอง: scope,
      ยอดขายสุทธิ_บาท: r2(s.net), คำสั่งซื้อสำเร็จ: s.orders, AOV_บาท: r2(s.aov),
      อัตรายกเลิก_pct: r2(s.cancelRate), อัตราคืนสินค้า_pct: r2(s.returnRate),
      ช่องทางยอดสูงสุด: ch.label, ช่องทางยอดสูงสุด_สัดส่วน_pct: sh(ch.net),
      หมวดยอดสูงสุด: cat.label, หมวดยอดสูงสุด_สัดส่วน_pct: sh(cat.net),
      ภูมิภาคยอดสูงสุด: reg.label, ภูมิภาคยอดสูงสุด_สัดส่วน_pct: sh(reg.net),
      บริษัทขนส่งยอดสูงสุด: car.label,
      เดือนยอดสูงสุด: best ? monthLabel(best.month) : '-', เดือนยอดสูงสุด_บาท: best ? r2(best.net) : 0,
      เดือนยอดต่ำสุด: worst ? monthLabel(worst.month) : '-', เดือนยอดต่ำสุด_บาท: worst ? r2(worst.net) : 0,
      จำนวนวันเมกะเซล: s.mega.days, ยอดขายวันเมกะเซล_สัดส่วน_pct: r2(s.mega.share),
      ยอดเฉลี่ยต่อวัน_เมกะเซล_บาท: r2(s.mega.avg), ยอดเฉลี่ยต่อวัน_วันปกติ_บาท: r2(s.mega.normalAvg),
    };
    if (hasCost) {
      o.กำไรขั้นต้น_pct = r2(s.gmAll.pct);
      o.กำไรขั้นต้น_วันเมกะเซล_pct = r2(s.mega.gm.pct);
      o.กำไรขั้นต้น_วันปกติ_pct = r2(s.mega.normalGm.pct);
    }
    return Object.fromEntries(Object.entries(o).slice(0, 30));
  }
  // Every number the JSON holds (numeric values and digits inside its text), normalised.
  const normNum = (t) => String(Number(String(t).replace(/,/g, '')));
  function allowedNumbers(obj) {
    const set = new Set();
    Object.values(obj).forEach((v) => {
      if (typeof v === 'number') { set.add(normNum(v)); set.add(normNum(v.toFixed(2))); }
      else String(v).replace(/\d[\d,]*(?:\.\d+)?/g, (m) => { set.add(normNum(m)); return m; });
    });
    return set;
  }
  const strayNumbers = (line, allowed) => (line.match(/\d[\d,]*(?:\.\d+)?/g) || []).filter((m) => !allowed.has(normNum(m.replace(/[.,]$/, ''))));

  function ExecSummary({ summary }) {
    const [st, setSt] = useState({ phase: 'idle', text: '', error: '' });
    const [showJson, setShowJson] = useState(false);
    const ctl = useRef(null);
    const json = JSON.stringify(summary, null, 2);
    const nValues = Object.keys(summary).length;
    const run = async () => {
      if (ctl.current) ctl.current.abort();
      const ac = new AbortController(); ctl.current = ac;
      setSt({ phase: 'thinking', text: '', error: '' });
      const sample = window.claude && window.claude.use ? await window.claude.use('sample') : null;
      if (!sample) { setSt({ phase: 'error', text: '', error: 'มุมมองนี้เรียก Claude ไม่ได้ (ไม่ได้เปิดใน claude.ai หรือไม่ได้รับสิทธิ์)' }); return; }
      const prompt = [
        'คุณคือนักวิเคราะห์ที่เขียนสรุปยอดขายให้ผู้บริหารร้านออนไลน์ "บ้านสบาย ช็อป"',
        'เขียนบทสรุปภาษาไทย 5 บรรทัดพอดี บรรทัดละ 1 ประเด็น จาก JSON ด้านล่างเท่านั้น',
        'กติกา: (1) ตัวเลขทุกตัวต้องคัดลอกมาจาก JSON ตรงตัว ห้ามคำนวณ ปัดเศษ หรือสร้างตัวเลขใหม่ รวมถึงผลต่างหรืออัตราส่วน',
        '(2) ใช้เลขอารบิก ใส่คอมมาคั่นหลักพันได้ (3) ไม่ใส่เลขลำดับ หัวข้อ bullet หรือ markdown (4) คีย์ที่ลงท้าย _pct คือเปอร์เซ็นต์ _บาท คือบาท',
        '(5) บรรทัดสุดท้ายเป็นข้อเสนอแนะ 1 ข้อที่อิงจากตัวเลขใน JSON',
        'ตอบเฉพาะ 5 บรรทัดนั้น',
        '', 'JSON:', JSON.stringify(summary),
      ].join('\n');
      try {
        const res = await sample(prompt, { signal: ac.signal, modelTier: 'default', onText: ({ text }) => setSt({ phase: 'thinking', text, error: '' }) });
        setSt({ phase: 'done', text: res.text, error: '' });
      } catch (e) {
        if (e && e.code === 'cancelled') return;
        const msg = e && e.code === 'not_granted' ? 'ไม่ได้รับอนุญาตให้เรียก Claude' : e && e.code === 'rate_limited' ? 'เรียกถี่เกินไป โปรดรอสักครู่แล้วลองใหม่' : 'สรุปไม่สำเร็จ: ' + ((e && e.message) || 'ไม่ทราบสาเหตุ');
        setSt({ phase: 'error', text: (e && e.text) || '', error: msg });
      }
    };
    const allowed = useMemo(() => allowedNumbers(summary), [json]);
    const lines = st.text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5);
    return h('div', { className: 'bs-card bs-exec', id: 'exec-summary' },
      h('div', { className: 'bs-exec-head' },
        h('div', null,
          h('h2', null, 'สรุปให้ผู้บริหาร'),
          h('p', { className: 'bs-sub' }, `ส่งเฉพาะตัวเลขสรุป ${nValues} ค่า (ไม่ส่งข้อมูลดิบ) ให้ Claude เขียน 5 บรรทัด · ตามตัวกรองปัจจุบัน`)),
        h('button', { className: 'bs-upload bs-exec-btn', onClick: run, disabled: st.phase === 'thinking' },
          st.phase === 'thinking' ? 'กำลังเขียน…' : st.phase === 'done' ? 'สรุปใหม่' : 'สรุปให้ผู้บริหาร')),
      st.phase === 'thinking' && !st.text && h('p', { className: 'bs-sub' }, 'Claude กำลังคิด…'),
      lines.length > 0 && h('ol', { className: 'bs-exec-lines' }, lines.map((l, i) => {
        const bad = st.phase === 'done' ? strayNumbers(l, allowed) : [];
        return h('li', { key: i, className: bad.length ? 'bs-exec-bad' : null }, l,
          bad.length > 0 && h('span', { className: 'bs-warn' }, ' ⚠ ตัวเลขไม่อยู่ใน JSON: ' + bad.join(', ')));
      })),
      st.phase === 'done' && lines.length !== 5 && h('p', { className: 'bs-warn' }, `ได้ ${lines.length} บรรทัด (ขอ 5) ลองกด “สรุปใหม่”`),
      st.error && h('p', { className: 'bs-err' }, st.error),
      h('button', { className: 'bs-btn', onClick: () => setShowJson(!showJson), 'aria-expanded': showJson }, showJson ? 'ซ่อน JSON ที่ส่ง' : 'ดู JSON ที่ส่ง'),
      showJson && h('pre', { className: 'bs-json' }, json));
  }

  // ---- PDF export of the executive summary: heading → sub-headings → bullets; ≤ 100 words per sub-heading.
  const SECTION_LIMIT = 100;
  const TOTAL_LIMIT = 300;
  const REPORT_TITLE = 'บทสรุปผู้บริหาร';
  const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  const countWords = (t) => (segmenter ? [...segmenter.segment(t)].filter((x) => x.isWordLike).length : t.split(/\s+/).filter(Boolean).length);
  const fmtJ = (v) => (Number.isInteger(v) ? nf0.format(v) : nf2.format(v));

  // A report is {sections: [{heading, bullets: [text]}], recs: [{topic, cause, effect, action}]}.
  const REC_HEADING = 'ข้อเสนอแนะ';
  const recLines = (r) => [['เหตุ: ', r.cause], ['ผล: ', r.effect], ['แนวทางแก้ไข: ', r.action]];
  const sectionText = (x) => [x.heading, ...x.bullets].join('\n');
  const recsText = (recs) => [REC_HEADING, ...recs.flatMap((r) => [r.topic, ...recLines(r).map(([l, t]) => l + t)])].join('\n');
  const subtitleOf = (summary) => summary['ช่วงเวลา'] + ' · ' + summary['ตัวกรอง'];
  const reportText = (summary, rep) => [REPORT_TITLE, subtitleOf(summary), ...rep.sections.map(sectionText), recsText(rep.recs)].join('\n');

  // The summary JSON as table rows: readable label (unit from the key's suffix) and formatted value.
  const TABLE_HEADING = 'ตารางตัวเลขสรุป';
  const tableRows = (summary) => Object.entries(summary).map(([k, v]) => {
    const unit = k.endsWith('_pct') ? '%' : k.endsWith('_บาท') ? 'บาท' : '';
    const label = k.replace(/_(pct|บาท)$/, '').replace(/_/g, ' ');
    return [label, typeof v === 'number' ? fmtJ(v) + (unit === '%' ? '%' : unit ? ' ' + unit : '') : String(v)];
  });

  // Which JSON figures the text leaves out: numbers by value, labels by their text.
  function missingFigures(summary, text) {
    const found = new Set((text.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((m) => normNum(m.replace(/[.,]$/, ''))));
    return Object.entries(summary).filter(([, v]) => (typeof v === 'number' ? !found.has(normNum(v)) && !found.has(normNum(v.toFixed(2))) : !text.includes(String(v)))).map(([k]) => k);
  }

  function checkReport(summary, rep) {
    const text = reportText(summary, rep);
    const allowed = allowedNumbers(summary);
    const parts = [...rep.sections.map((x) => ({ heading: x.heading, text: sectionText(x) })), { heading: REC_HEADING, text: recsText(rep.recs) }];
    const perSection = parts.map((p) => ({ heading: p.heading, words: countWords(p.text) }));
    return {
      words: countWords(text),
      perSection,
      over: perSection.filter((p) => p.words > SECTION_LIMIT),
      stray: [...new Set(strayNumbers(text.replace(REPORT_TITLE, ''), allowed))],
      missing: missingFigures(summary, text),
    };
  }

  // Report written from the JSON alone; used when Claude can't be reached or its draft fails the checks.
  function templateReport(j) {
    const cost = j['กำไรขั้นต้น_pct'] !== undefined;
    const sections = [
      { heading: 'ภาพรวมยอดขาย', bullets: [
        `ยอดขายสุทธิ ${fmtJ(j['ยอดขายสุทธิ_บาท'])} บาท ช่วง ${j['ช่วงเวลา']} (${j['ตัวกรอง']})`,
        `คำสั่งซื้อสำเร็จ ${fmtJ(j['คำสั่งซื้อสำเร็จ'])} รายการ มูลค่าเฉลี่ยต่อคำสั่งซื้อ (AOV) ${fmtJ(j['AOV_บาท'])} บาท`] },
      { heading: 'คุณภาพคำสั่งซื้อ', bullets: [
        `อัตรายกเลิก ${fmtJ(j['อัตรายกเลิก_pct'])}% ของคำสั่งซื้อทั้งหมด`,
        `อัตราคืนสินค้า ${fmtJ(j['อัตราคืนสินค้า_pct'])}%`] },
      { heading: 'ช่องทางและหมวดสินค้า', bullets: [
        `ช่องทาง ${j['ช่องทางยอดสูงสุด']} ทำยอดสูงสุด ${fmtJ(j['ช่องทางยอดสูงสุด_สัดส่วน_pct'])}% ของยอดขาย`,
        `หมวด ${j['หมวดยอดสูงสุด']} นำด้วยสัดส่วน ${fmtJ(j['หมวดยอดสูงสุด_สัดส่วน_pct'])}%`] },
      { heading: 'พื้นที่และการจัดส่ง', bullets: [
        `ภูมิภาค ${j['ภูมิภาคยอดสูงสุด']} มียอดสูงสุด ${fmtJ(j['ภูมิภาคยอดสูงสุด_สัดส่วน_pct'])}%`,
        `บริษัทขนส่งที่รองรับยอดมากที่สุดคือ ${j['บริษัทขนส่งยอดสูงสุด']}`] },
      { heading: 'แนวโน้มรายเดือน', bullets: [
        `สูงสุด ${j['เดือนยอดสูงสุด']} ${fmtJ(j['เดือนยอดสูงสุด_บาท'])} บาท`,
        `ต่ำสุด ${j['เดือนยอดต่ำสุด']} ${fmtJ(j['เดือนยอดต่ำสุด_บาท'])} บาท`] },
      { heading: 'วันเมกะเซล', bullets: [
        `${fmtJ(j['จำนวนวันเมกะเซล'])} วันสร้างยอด ${fmtJ(j['ยอดขายวันเมกะเซล_สัดส่วน_pct'])}% ของทั้งหมด`,
        `ยอดเฉลี่ยต่อวัน ${fmtJ(j['ยอดเฉลี่ยต่อวัน_เมกะเซล_บาท'])} บาท เทียบวันปกติ ${fmtJ(j['ยอดเฉลี่ยต่อวัน_วันปกติ_บาท'])} บาท`] },
    ];
    if (cost) sections.push({ heading: 'กำไรขั้นต้น', bullets: [
      `กำไรขั้นต้นรวม ${fmtJ(j['กำไรขั้นต้น_pct'])}%`,
      `วันเมกะเซล ${fmtJ(j['กำไรขั้นต้น_วันเมกะเซล_pct'])}% เทียบวันปกติ ${fmtJ(j['กำไรขั้นต้น_วันปกติ_pct'])}%`] });
    const recs = [];
    if (cost && j['กำไรขั้นต้น_วันเมกะเซล_pct'] < j['กำไรขั้นต้น_วันปกติ_pct']) recs.push({ topic: 'กำไรวันเมกะเซล',
      cause: 'ส่วนลดกดกำไรต่ำกว่าวันปกติ',
      effect: 'ยอดสูงแต่กำไรต่อบาทลดลง',
      action: 'ตั้งเพดานส่วนลดและคัดสินค้ากำไรสูง' });
    else if (!cost) recs.push({ topic: 'ข้อมูลต้นทุน',
      cause: 'ยังไม่มีต้นทุนสินค้า',
      effect: 'ประเมินความคุ้มของส่วนลดไม่ได้',
      action: 'อัปโหลด products.csv' });
    recs.push({ topic: 'การยกเลิกคำสั่งซื้อ',
      cause: 'มีคำสั่งซื้อถูกยกเลิก',
      effect: 'ยอดหลุดและเสียต้นทุน',
      action: 'ยืนยันสต็อกและแจ้งเวลาส่งชัดเจน' });
    recs.push({ topic: 'การพึ่งพาพื้นที่หลัก',
      cause: 'ยอดกระจุกในภูมิภาคที่นำ',
      effect: 'เสี่ยงเมื่อพื้นที่นั้นชะลอ',
      action: 'ทำแคมเปญในภูมิภาคอื่น' });
    return { sections, recs };
  }

  // Normalise Claude's JSON into the report shape.
  function readReport(out) {
    const sections = (out && Array.isArray(out.sections) ? out.sections : [])
      .filter((x) => x && x.heading && Array.isArray(x.bullets))
      .map((x) => ({ heading: String(x.heading).trim(), bullets: x.bullets.map((b) => String(b).trim()).filter(Boolean) }))
      .filter((x) => x.bullets.length);
    const recs = (out && Array.isArray(out.recommendations) ? out.recommendations : [])
      .filter((r) => r && r.cause && r.effect && r.action)
      .map((r) => ({ topic: String(r.topic || 'ประเด็น').trim(), cause: String(r.cause).trim(), effect: String(r.effect).trim(), action: String(r.action).trim() }));
    if (!sections.length || !recs.length) throw { code: 'bad_shape', message: 'คำตอบไม่อยู่ในรูปแบบที่ขอ' };
    return { sections, recs };
  }

  // Lay the report out on A4 canvases (the browser shapes Thai), keeping every text run's position
  // so the PDF can carry an invisible, selectable text layer over each page image.
  async function layoutReport(summary, rep) {
    if (document.fonts) await Promise.all(["400 24px 'Prompt'", "700 24px 'Prompt'"].map((f) => document.fonts.load(f).catch(() => {})));
    const W = 1190, H = 1684, M = 100, BOTTOM = H - 110, FF = "'Prompt', sans-serif";
    const pages = [], runs = [];
    let g, y;
    const newPage = () => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#2563eb'; g.fillRect(0, 0, W, 14);
      pages.push(c); y = M;
    };
    const fontOf = (size, weight) => `${weight} ${size}px ${FF}`;
    const ascentOf = (size, weight) => { g.font = fontOf(size, weight); const m = g.measureText('กÅ'); return m.fontBoundingBoxAscent || size * 0.95; };
    // Break text into lines no wider than maxW (Thai has no spaces: break on word segments).
    const wrap = (text, font, firstW, restW) => {
      g.font = font;
      const parts = segmenter ? [...segmenter.segment(text)].map((x) => x.segment) : text.split(/(\s+)/);
      const lines = []; let line = '';
      parts.forEach((p) => {
        const limit = lines.length ? restW : firstW;
        if (line && g.measureText(line + p).width > limit) { lines.push(line.trimEnd()); line = p.trimStart(); }
        else line += p;
      });
      if (line) lines.push(line.trimEnd());
      return lines;
    };
    const run = (str, x, size, weight, color) => {
      const base = y + ascentOf(size, weight);
      g.font = fontOf(size, weight); g.fillStyle = color; g.textBaseline = 'alphabetic';
      g.fillText(str, x, base);
      runs.push({ page: pages.length - 1, str, x, base, size, w: g.measureText(str).width });
    };
    const ensure = (need) => { if (y + need > BOTTOM) newPage(); };
    // A paragraph with an optional bold label and a marker hanging to the left of it.
    const para = ({ x, marker, label, text, size, color, lh, after }) => {
      const right = W - M, lineH = size * lh;
      g.font = fontOf(size, 700); const lw = label ? g.measureText(label).width : 0;
      const lines = wrap(text, fontOf(size, 400), right - x - lw, right - x);
      ensure(lineH * Math.min(2, lines.length));
      lines.forEach((ln, i) => {
        ensure(lineH);
        if (i === 0 && marker) run(marker, x - size * 1.1, size, 700, '#2563eb');
        if (i === 0 && label) run(label, x, size, 700, '#111827');
        run(ln, i === 0 ? x + lw : x, size, 400, color);
        y += lineH;
      });
      y += after;
    };
    const heading = (text) => {
      ensure(30 * 1.5 + 26 * 1.6 * 2);
      g.fillStyle = '#2563eb'; g.fillRect(M, y + 8, 6, 30);
      run(text, M + 20, 30, 700, '#111827');
      y += 30 * 1.5 + 4;
    };

    newPage();
    run(REPORT_TITLE, M, 48, 700, '#111827'); y += 48 * 1.4;
    para({ x: M, text: subtitleOf(summary), size: 24, color: '#6b7280', lh: 1.5, after: 18 });
    g.fillStyle = '#e5e7eb'; g.fillRect(M, y, W - 2 * M, 2); y += 28;
    const BX = M + 44;
    rep.sections.forEach((x) => {
      heading(x.heading);
      x.bullets.forEach((b) => para({ x: BX, marker: '•', text: b, size: 25, color: '#1f2937', lh: 1.6, after: 6 }));
      y += 22;
    });
    heading(REC_HEADING);
    rep.recs.forEach((r) => {
      para({ x: BX, marker: '•', text: r.topic, size: 25, color: '#111827', lh: 1.6, after: 2 });
      recLines(r).forEach(([label, t]) => para({ x: BX + 36, marker: '–', label, text: t, size: 23, color: '#1f2937', lh: 1.6, after: 2 }));
      y += 14;
    });
    // Summary figures table: header row, zebra rows, label left / value right; a row grows when its label wraps
    // and the header repeats on a new page, so no text overlaps.
    const table = (rows) => {
      const x0 = M, x1 = W - M, colV = x0 + (x1 - x0) * 0.58, pad = 14, size = 22, lh = 1.5;
      const head = () => {
        g.fillStyle = '#1e3a8a'; g.fillRect(x0, y, x1 - x0, size * lh + pad * 2);
        y += pad; run('รายการ', x0 + pad, size, 700, '#ffffff');
        g.font = fontOf(size, 700); const hw = g.measureText('ค่า').width; run('ค่า', x1 - pad - hw, size, 700, '#ffffff');
        y += size * lh + pad;
      };
      head();
      rows.forEach(([label, value], i) => {
        const lLines = wrap(label, fontOf(size, 400), colV - x0 - pad * 2, colV - x0 - pad * 2);
        const vLines = wrap(value, fontOf(size, 700), x1 - colV - pad * 2, x1 - colV - pad * 2);
        const rowH = Math.max(lLines.length, vLines.length) * size * lh + pad * 2;
        if (y + rowH > BOTTOM) { newPage(); head(); }
        g.fillStyle = i % 2 ? '#ffffff' : '#f1f5f9'; g.fillRect(x0, y, x1 - x0, rowH);
        g.fillStyle = '#e2e8f0'; g.fillRect(x0, y + rowH - 1, x1 - x0, 1);
        const top = y + pad;
        lLines.forEach((ln, k) => { y = top + k * size * lh; run(ln, x0 + pad, size, 400, '#1f2937'); });
        vLines.forEach((ln, k) => { y = top + k * size * lh; g.font = fontOf(size, 700); run(ln, x1 - pad - g.measureText(ln).width, size, 700, '#111827'); });
        y = top - pad + rowH;
      });
      y += 20;
    };
    ensure(260); // keep the table heading with its header row and first rows
    heading(TABLE_HEADING);
    table(tableRows(summary));

    pages.forEach((c, i) => {
      const pg = c.getContext('2d'); pg.font = fontOf(18, 400); pg.fillStyle = '#9ca3af'; pg.textBaseline = 'alphabetic';
      pg.fillText('บ้านสบาย ช็อป · บทสรุปผู้บริหาร', M, H - 50);
    });
    return { pages, runs, W, H };
  }

  // PDF: each page is the JPEG of its canvas plus an invisible text layer (render mode 3) in a
  // Type0 font whose CIDs are the UTF-16 code units, mapped 1:1 back to Unicode by ToUnicode,
  // so the text can be selected, searched and copied. Each run is stretched (Tz) to its drawn width.
  function buildPdf({ pages, runs, W, H }) {
    const enc = new TextEncoder();
    const chunks = []; let len = 0; const offs = [];
    const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
    const obj = (n, body) => { offs[n] = len; put(`${n} 0 obj\n`); body(); put('\nendobj\n'); };
    const stream = (n, dict, data) => obj(n, () => { put(`<< ${dict} /Length ${typeof data === 'string' ? enc.encode(data).length : data.length} >>\nstream\n`); put(data); put('\nendstream'); });
    const PW = 595.28, PH = 841.89, k = PW / W, DW = 500;
    const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');
    const hexStr = (s) => { let o = ''; for (let i = 0; i < s.length; i++) o += hex4(s.charCodeAt(i)); return o; };
    const n = pages.length;
    // objects: 1 catalog, 2 pages, 3 font, 4 cidfont, 5 descriptor, 6 tounicode, then 3 per page
    const P0 = 7;
    put('%PDF-1.4\n'); put(new Uint8Array([37, 226, 227, 207, 211, 10]));
    obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => put(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${P0 + i * 3} 0 R`).join(' ')}] >>`));
    obj(3, () => put('<< /Type /Font /Subtype /Type0 /BaseFont /GlyphLessFont /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 6 0 R >>'));
    obj(4, () => put(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /GlyphLessFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /DW ${DW} /CIDToGIDMap /Identity >>`));
    obj(5, () => put('<< /Type /FontDescriptor /FontName /GlyphLessFont /Flags 5 /FontBBox [0 -250 500 1000] /ItalicAngle 0 /Ascent 1000 /Descent -250 /CapHeight 1000 /StemV 80 >>'));
    let cmap = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def /CMapType 2 def\n1 begincodespacerange <0000> <FFFF> endcodespacerange\n';
    const ranges = []; for (let hi = 0; hi < 256; hi++) if (hi < 0xd8 || hi > 0xdf) ranges.push(`<${hex4(hi * 256)}> <${hex4(hi * 256 + 255)}> <${hex4(hi * 256)}>`);
    for (let i = 0; i < ranges.length; i += 100) { const part = ranges.slice(i, i + 100); cmap += `${part.length} beginbfrange\n${part.join('\n')}\nendbfrange\n`; }
    cmap += 'endcmap CMapName currentdict /CMap defineresource pop end end';
    stream(6, '', cmap);
    pages.forEach((c, i) => {
      const p = P0 + i * 3, cs = p + 1, im = p + 2;
      const b = atob(c.toDataURL('image/jpeg', 0.92).split(',')[1]); const u = new Uint8Array(b.length); for (let q = 0; q < b.length; q++) u[q] = b.charCodeAt(q);
      let content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q\nBT 3 Tr\n`;
      runs.filter((r) => r.page === i && r.str.length).forEach((r) => {
        const fs = r.size * k, wpt = r.w * k, units = r.str.length * (DW / 1000) * fs;
        const tz = units > 0 ? (wpt / units) * 100 : 100;
        content += `/F1 ${fs.toFixed(2)} Tf ${tz.toFixed(2)} Tz 1 0 0 1 ${(r.x * k).toFixed(2)} ${(PH - r.base * k).toFixed(2)} Tm <${hexStr(r.str)}> Tj\n`;
      });
      content += 'ET';
      obj(p, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${im} 0 R >> /Font << /F1 3 0 R >> >> /Contents ${cs} 0 R >>`));
      stream(cs, '', content);
      stream(im, `/Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, u);
    });
    const total = P0 + n * 3, xref = len;
    put(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let i = 1; i < total; i++) put(String(offs[i]).padStart(10, '0') + ' 00000 n \n');
    put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  function ReportPreview({ summary, rep }) {
    return h('div', { className: 'bs-report' },
      h('h3', null, REPORT_TITLE),
      h('p', { className: 'bs-sub' }, subtitleOf(summary)),
      rep.sections.map((x, i) => h('section', { key: i }, h('h4', null, x.heading), h('ul', null, x.bullets.map((b, k) => h('li', { key: k }, b))))),
      h('section', null, h('h4', null, REC_HEADING),
        h('ul', null, rep.recs.map((r, i) => h('li', { key: i }, h('b', null, r.topic),
          h('ul', { className: 'bs-rec' }, recLines(r).map(([l, t]) => h('li', { key: l }, h('b', null, l), t))))))),
      h('section', null, h('h4', null, TABLE_HEADING),
        h('table', { className: 'bs-table bs-sumtable' },
          h('thead', null, h('tr', null, h('th', null, 'รายการ'), h('th', null, 'ค่า'))),
          h('tbody', null, tableRows(summary).map(([l, v]) => h('tr', { key: l }, h('td', null, l), h('td', null, h('b', null, v))))))));
  }

  function PdfExport({ summary }) {
    const [st, setSt] = useState({ phase: 'idle', rep: null, source: '', note: '', error: '' });
    const [link, setLink] = useState(null);
    const ctl = useRef(null);
    const key = JSON.stringify(summary);
    useEffect(() => { setSt({ phase: 'idle', rep: null, source: '', note: '', error: '' }); setLink(null); }, [key]);
    const hasCost = summary['กำไรขั้นต้น_pct'] !== undefined;

    const ask = async (sample, feedback) => {
      const prompt = [
        'เขียน "บทสรุปผู้บริหาร" ภาษาไทยของร้านออนไลน์ บ้านสบาย ช็อป จาก JSON ด้านล่างเท่านั้น',
        'หัวข้อย่อย (sections) ตามลำดับ: ภาพรวมยอดขาย, คุณภาพคำสั่งซื้อ, ช่องทางและหมวดสินค้า, พื้นที่และการจัดส่ง, แนวโน้มรายเดือน, วันเมกะเซล' + (hasCost ? ', กำไรขั้นต้น' : ''),
        'แต่ละหัวข้อย่อยเป็น bullet 2–3 ข้อ สั้น กระชับ อธิบายความหมายต่อธุรกิจ แต่ละหัวข้อย่อยไม่เกิน 60 คำ',
        'recommendations: ข้อเสนอแนะ 2–3 ประเด็น แต่ละประเด็นเขียนแบบเหตุและผล: topic (ชื่อประเด็น), cause (เหตุ อ้างอิงตัวเลขใน JSON), effect (ผลต่อธุรกิจ), action (แนวทางแก้ไขหรือปรับปรุงที่ทำได้จริง) รวมทุกประเด็นไม่เกิน 90 คำ',
        `ทั้งเอกสารไม่เกิน ${TOTAL_LIMIT - 30} คำ และต้องกล่าวถึงค่าทุกค่าใน JSON อย่างน้อยหนึ่งครั้ง`,
        'ตัวเลขทุกตัวต้องคัดลอกจาก JSON ตรงตัว (ใส่คอมมาคั่นหลักพันได้) ห้ามคำนวณ ปัดเศษ หรือสร้างตัวเลขใหม่ ห้ามใส่เลขลำดับ ใช้เลขอารบิก',
        'คีย์ที่ลงท้าย _pct คือเปอร์เซ็นต์ _บาท คือบาท',
        'ตอบเป็น JSON เท่านั้น: {"sections":[{"heading":"...","bullets":["..."]}],"recommendations":[{"topic":"...","cause":"...","effect":"...","action":"..."}]}',
        feedback ? 'ฉบับก่อนมีปัญหา: ' + feedback + ' โปรดแก้ให้ถูกต้อง' : '',
        '', 'JSON:', key,
      ].join('\n');
      return readReport(await sample.json(prompt, { signal: ctl.current.signal, modelTier: 'default' }));
    };
    const problems = (c) => [
      c.over.length ? 'หัวข้อเกิน ' + SECTION_LIMIT + ' คำ: ' + c.over.map((p) => `${p.heading} (${p.words})`).join(', ') : '',
      c.words > TOTAL_LIMIT ? `ยาวรวม ${c.words} คำ เกิน ${TOTAL_LIMIT}` : '',
      c.stray.length ? 'มีตัวเลขที่ไม่อยู่ใน JSON: ' + c.stray.join(', ') : '',
      c.missing.length ? 'ขาดค่า: ' + c.missing.join(', ') : '',
    ].filter(Boolean).join(' · ');

    const generate = async () => {
      if (ctl.current) ctl.current.abort();
      ctl.current = new AbortController();
      setLink(null);
      setSt({ phase: 'thinking', rep: null, source: '', note: '', error: '' });
      const sample = window.claude && window.claude.use ? await window.claude.use('sample') : null;
      if (!sample) {
        setSt({ phase: 'ready', rep: templateReport(summary), source: 'template', note: 'เรียก Claude จากมุมมองนี้ไม่ได้ จึงใช้ฉบับมาตรฐานที่เขียนจาก JSON โดยตรง', error: '' });
        return;
      }
      try {
        let rep = await ask(sample, '');
        let fb = problems(checkReport(summary, rep));
        if (fb) { rep = await ask(sample, fb); fb = problems(checkReport(summary, rep)); }
        setSt({ phase: 'ready', rep, source: 'claude', note: fb ? 'ฉบับของ Claude ยังไม่ผ่านการตรวจทุกข้อ ใช้ “ฉบับมาตรฐาน” แทนได้' : '', error: '' });
      } catch (e) {
        if (e && e.code === 'cancelled') return;
        const msg = e && e.code === 'not_granted' ? 'ไม่ได้รับอนุญาตให้เรียก Claude' : e && e.code === 'rate_limited' ? 'เรียกถี่เกินไป โปรดรอสักครู่' : 'Claude เขียนไม่สำเร็จ: ' + ((e && e.message) || 'ไม่ทราบสาเหตุ');
        setSt({ phase: 'ready', rep: templateReport(summary), source: 'template', note: msg + ' จึงใช้ฉบับมาตรฐานแทน', error: '' });
      }
    };

    const download = async () => {
      setSt((x) => ({ ...x, error: '' }));
      try {
        const blob = buildPdf(await layoutReport(summary, st.rep));
        const filename = 'บทสรุปผู้บริหาร-บ้านสบายช็อป.pdf';
        const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
        if (dl) {
          try { await dl.save({ filename, data: blob }); return; } catch (e) { if (e && e.code === 'cancelled') return; }
        }
        const url = URL.createObjectURL(blob);
        setLink(url);
        const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      } catch (e) {
        setSt((x) => ({ ...x, error: 'สร้าง PDF ไม่สำเร็จ: ' + ((e && e.message) || e) }));
      }
    };

    const chk = st.rep ? checkReport(summary, st.rep) : null;
    return h('div', { className: 'bs-card bs-exec', id: 'exec-pdf' },
      h('div', { className: 'bs-exec-head' },
        h('div', null,
          h('h2', null, 'Export บทสรุปผู้บริหาร (.pdf)'),
          h('p', { className: 'bs-sub' }, `หัวข้อหลัก → หัวข้อย่อยแบบ bullet (ไม่เกิน ${SECTION_LIMIT} คำต่อหัวข้อ) → ข้อเสนอแนะแบบเหตุและผล → ตารางตัวเลขสรุป (ไม่นับรวมในจำนวนคำ) · ข้อความใน PDF เลือกและคัดลอกได้`)),
        h('div', { className: 'bs-exec-actions' },
          h('button', { className: 'bs-btn', onClick: generate, disabled: st.phase === 'thinking' }, st.phase === 'thinking' ? 'Claude กำลังเขียน…' : st.rep ? 'เขียนใหม่' : 'สร้างบทสรุป'),
          st.rep && st.source === 'claude' && h('button', { className: 'bs-btn', onClick: () => setSt((x) => ({ ...x, rep: templateReport(summary), source: 'template', note: '' })) }, 'ใช้ฉบับมาตรฐาน'),
          h('button', { className: 'bs-upload bs-exec-btn', onClick: download, disabled: !st.rep || st.phase === 'thinking' }, 'ดาวน์โหลด .pdf'))),
      st.phase === 'idle' && h('p', { className: 'bs-sub' }, 'กด “สร้างบทสรุป” เพื่อดูตัวอย่างก่อน แล้วจึงดาวน์โหลด PDF'),
      st.note && h('p', { className: 'bs-warn' }, st.note),
      chk && h('div', { className: 'bs-check' },
        h('span', null, 'รวม ', h('b', { className: 'bs-n' }, fmtInt.format(chk.words)), ' คำ'),
        h('span', { className: chk.over.length ? 'bs-warn' : null }, chk.over.length ? 'หัวข้อเกิน ' + SECTION_LIMIT + ' คำ: ' + chk.over.map((p) => p.heading).join(', ') : `ทุกหัวข้อไม่เกิน ${SECTION_LIMIT} คำ (มากสุด ${Math.max(...chk.perSection.map((p) => p.words))})`),
        h('span', { className: chk.missing.length ? 'bs-warn' : null }, chk.missing.length ? 'ยังไม่ครอบคลุม: ' + chk.missing.join(', ') : 'ครอบคลุมทุกค่าใน JSON'),
        h('span', { className: chk.stray.length ? 'bs-warn' : null }, chk.stray.length ? 'ตัวเลขไม่อยู่ใน JSON: ' + chk.stray.join(', ') : 'ไม่มีตัวเลขนอก JSON'),
        h('span', null, st.source === 'claude' ? 'เขียนโดย Claude' : 'ฉบับมาตรฐาน')),
      st.rep && h(ReportPreview, { summary, rep: st.rep }),
      st.error && h('p', { className: 'bs-err' }, st.error),
      link && h('p', { className: 'bs-sub' }, 'ถ้าไฟล์ไม่ดาวน์โหลดอัตโนมัติ ', h('a', { href: link, download: 'บทสรุปผู้บริหาร-บ้านสบายช็อป.pdf', target: '_blank', rel: 'noopener' }, 'คลิกที่นี่เพื่อเปิด PDF')));
  }

  function Select({ label, value, options, onChange }) {
    return h('label', { className: 'bs-field' }, label,
      h('select', { value, onChange: (e) => onChange(e.target.value) },
        h('option', { value: ALL }, 'ทั้งหมด'),
        options.map((o) => h('option', { key: o, value: o }, o))));
  }

  function Kpi({ label, value, note, tone }) {
    return h('div', { className: 'bs-card bs-kpi bs-' + tone },
      h('div', { className: 'bs-label' }, label),
      h('div', { className: 'bs-val' }, value),
      note && h('div', { className: 'bs-note' }, note));
  }

  function App() {
    const [file, setFile] = useState(null);     // {name, rows, badNum, parseErrors}
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [region, setRegion] = useState(ALL);
    const [category, setCategory] = useState(ALL);
    const [products, setProducts] = useState(null); // {name, cost: Map(product_id → unit_cost), n}
    const [tab, setTab] = useState(() => (['#mega', '#exec'].includes(location.hash) ? location.hash.slice(1) : 'overview'));
    const goTab = (t) => { setTab(t); try { dash.setLink(t); } catch (e) {} };

    const onProducts = (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      setError('');
      Papa.parse(f, {
        header: true, skipEmptyLines: 'greedy', encoding: 'UTF-8',
        transformHeader: (k) => k.replace(/^\uFEFF/, '').trim(),
        complete: (res) => {
          const cols = res.meta.fields || [];
          const missing = ['product_id', 'unit_cost'].filter((c) => !cols.includes(c));
          if (missing.length) { setError('products.csv ขาดคอลัมน์: ' + missing.join(', ')); return; }
          const cost = new Map();
          res.data.forEach((r) => { const c = num(r.unit_cost), id = String(r.product_id ?? '').trim(); if (id && !Number.isNaN(c)) cost.set(id, c); });
          setProducts({ name: f.name, cost, n: cost.size });
        },
        error: (err) => setError('อ่าน products.csv ไม่สำเร็จ: ' + err.message),
      });
    };

    const onFile = (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      setBusy(true); setError('');
      Papa.parse(f, {
        header: true,
        skipEmptyLines: 'greedy',
        encoding: 'UTF-8',
        transformHeader: (k) => k.replace(/^﻿/, '').trim(),
        complete: (res) => {
          setBusy(false);
          const cols = res.meta.fields || [];
          const missing = REQUIRED.filter((c) => !cols.includes(c));
          if (missing.length) {
            setFile(null);
            setError('ไฟล์ขาดคอลัมน์: ' + missing.join(', ') + ' — โปรดตรวจว่าเป็น orders.csv');
            return;
          }
          const { rows, badNum } = prepare(res.data);
          setFile({ name: f.name, rows, badNum, parseErrors: res.errors.length, hasCarrier: cols.includes('carrier'), hasProvince: cols.includes('province') });
          setRegion(ALL); setCategory(ALL);
        },
        error: (err) => { setBusy(false); setError('อ่านไฟล์ไม่สำเร็จ: ' + err.message); },
      });
    };

    const rows = file ? file.rows : [];
    const regions = useMemo(() => [...new Set(rows.map((r) => r.region))].sort((a, b) => a.localeCompare(b, 'th')), [rows]);
    const categories = useMemo(() => [...new Set(rows.map((r) => r.category))].sort((a, b) => a.localeCompare(b, 'th')), [rows]);
    const view = useMemo(() => rows.filter((r) => (region === ALL || r.region === region) && (category === ALL || r.category === category)), [rows, region, category]);

    const s = useMemo(() => {
      const statusAll = d3.rollups(rows, (v) => v.length, (r) => r.status);
      const statusView = new Map(d3.rollups(view, (v) => v.length, (r) => r.status));
      const done = view.filter((r) => r.status === DONE);
      const net = d3.sum(done, (r) => r.net);
      const cancels = statusView.get(CANCEL) || 0;
      const returns = statusView.get(RETURN) || 0;
      const byMonth = new Map(d3.rollups(done.filter((r) => r.month), (v) => d3.sum(v, (r) => r.net), (r) => r.month));
      const idx = [...byMonth.keys()].map(monthIndex);
      const monthly = idx.length ? d3.range(d3.min(idx), d3.max(idx) + 1).map(monthFromIndex).map((m) => ({ month: m, net: byMonth.get(m) || 0 })) : [];
      const byKey = (key) => d3.rollups(done, (v) => ({ net: d3.sum(v, (r) => r.net), n: v.length }), (r) => r[key])
        .map(([k, o]) => ({ label: k, net: o.net, n: o.n })).sort((a, b) => b.net - a.net);
      const channel = byKey('channel'), carrier = byKey('carrier'), category = byKey('category');
      // categories ordered by their total, largest first (bottom of each stack)
      const cats = d3.rollups(done, (v) => d3.sum(v, (r) => r.net), (r) => r.category).sort((a, b) => b[1] - a[1]).map(([c]) => c);
      const regionMix = byKey('region').map((r) => {
        const inR = done.filter((x) => x.region === r.label);
        const provinces = d3.rollups(inR, (v) => ({ net: d3.sum(v, (x) => x.net), n: v.length }), (x) => x.province)
          .map(([p, o]) => ({ label: p, net: o.net, n: o.n, share: r.net ? (o.net / r.net) * 100 : 0 })).sort((a, b) => b.net - a.net);
        return { ...r, share: net ? (r.net / net) * 100 : 0, provinces };
      });
      const carrierMix = carrier.map((c) => {
        const byCat = new Map(d3.rollups(done.filter((r) => r.carrier === c.label), (v) => d3.sum(v, (r) => r.net), (r) => r.category));
        const parts = cats.filter((k) => byCat.get(k) > 0).map((k) => ({ cat: k, net: byCat.get(k), pct: c.net ? (byCat.get(k) / c.net) * 100 : 0 }));
        return { label: c.label, net: c.net, parts };
      });
      // Gross profit = net − qty × unit_cost, over rows whose product has a cost.
      const cost = products ? products.cost : null;
      const gm = (list) => {
        if (!cost) return null;
        let n = 0, c = 0, miss = 0;
        list.forEach((r) => { const u = cost.get(r.productId); if (u === undefined) { miss++; return; } n += r.net; c += r.qty * u; });
        return { pct: n ? ((n - c) / n) * 100 : 0, profit: n - c, miss };
      };
      const allDays = new Set(rows.map((r) => r.day).filter(Boolean));
      const megaDays = [...allDays].filter(isMega).sort();
      const normalDays = allDays.size - megaDays.length;
      const megaRows = done.filter((r) => isMega(r.day)), normalRows = done.filter((r) => r.day && !isMega(r.day));
      const megaNet = d3.sum(megaRows, (r) => r.net), normalNet = d3.sum(normalRows, (r) => r.net);
      const normalAvg = normalDays ? normalNet / normalDays : 0;
      const megaByDay = megaDays.map((day) => {
        const list = megaRows.filter((r) => r.day === day), dn = d3.sum(list, (r) => r.net);
        return { day, label: megaName(day), net: dn, n: list.length, share: net ? (dn / net) * 100 : 0, ratio: normalAvg ? dn / normalAvg : 0, gm: gm(list) };
      });
      const mega = {
        days: megaDays.length, normalDays, allDays: allDays.size, net: megaNet, normalNet,
        share: net ? (megaNet / net) * 100 : 0, dayShare: allDays.size ? (megaDays.length / allDays.size) * 100 : 0,
        avg: megaDays.length ? megaNet / megaDays.length : 0, normalAvg,
        gm: gm(megaRows), normalGm: gm(normalRows), byDay: megaByDay,
      };
      return {
        gmAll: gm(done), mega,
        net, orders: done.length, aov: done.length ? net / done.length : 0,
        cancelRate: view.length ? (cancels / view.length) * 100 : 0, cancels,
        returnRate: view.length ? (returns / view.length) * 100 : 0, returns,
        statusAll: statusAll.sort((a, b) => b[1] - a[1]), statusView, monthly, channel, carrier, category, cats, carrierMix, regionMix,
      };
    }, [rows, view, products]);

    const filtered = region !== ALL || category !== ALL;
    const scope = filtered ? [region !== ALL ? region : null, category !== ALL ? category : null].filter(Boolean).join(' · ') : 'ทุกภูมิภาค · ทุกหมวด';
    const period = s.monthly.length ? monthLabel(s.monthly[0].month) + ' – ' + monthLabel(s.monthly[s.monthly.length - 1].month) : '';
    const top = s.channel[0];
    const hasCost = !!products;
    const summary = useMemo(() => buildSummary(s, scope, period, hasCost), [s, scope, period, hasCost]);
    const gmMiss = hasCost && s.gmAll ? s.gmAll.miss : 0;

    return h('div', { className: 'bs-wrap' },
      h('div', { className: 'bs-head' },
        h('h1', null, 'แดชบอร์ดยอดขาย บ้านสบาย ช็อป'),
        h('p', null, file
          ? `${scope}${period ? ' · ' + period : ''} — ยอดขายสุทธิ ${fmtBaht(s.net)}${top ? `, ช่องทาง ${top.label} ทำยอดสูงสุด (${s.net ? ((top.net / s.net) * 100).toFixed(1) : '0'}%)` : ''}`
          : 'อัปโหลดไฟล์ orders.csv เพื่อดูยอดขาย ข้อมูลอ่านในเบราว์เซอร์ของคุณเท่านั้น ไม่ได้ส่งหรือบันทึกไปที่ใด')),

      h('div', { className: 'bs-card bs-bar' },
        h('div', { className: 'bs-upwrap' },
          h('label', { className: 'bs-upload' },
            h('input', { type: 'file', accept: '.csv,text/csv', onChange: onFile }),
            busy ? 'กำลังอ่านไฟล์…' : (file ? 'อัปโหลดไฟล์ใหม่' : 'อัปโหลด orders.csv')),
          h('span', { className: 'bs-fname' }, file ? 'ไฟล์: ' + file.name : 'CSV แบบ UTF-8 (มี BOM ได้)')),
        h('div', { className: 'bs-upwrap' },
          h('label', { className: 'bs-upload bs-upload-2' },
            h('input', { type: 'file', accept: '.csv,text/csv', onChange: onProducts }),
            products ? 'อัปโหลด products.csv ใหม่' : 'อัปโหลด products.csv'),
          h('span', { className: 'bs-fname' }, products ? `ไฟล์: ${products.name} · ต้นทุน ${fmtInt.format(products.n)} สินค้า` : 'ใช้คำนวณ % กำไรขั้นต้น (unit_cost)')),
        h(Select, { label: 'ภูมิภาค', value: region, options: regions, onChange: setRegion }),
        h(Select, { label: 'หมวดสินค้า', value: category, options: categories, onChange: setCategory }),
        filtered && h('button', { className: 'bs-btn', onClick: () => { setRegion(ALL); setCategory(ALL); } }, 'ล้างตัวกรอง')),

      error && h('div', { className: 'bs-err', role: 'alert' }, error),

      h('div', { className: 'bs-kpis' },
        h(Kpi, { tone: 'blue', label: 'ยอดขายสุทธิ', value: file ? fmtBaht(s.net) : '—', note: 'qty × ราคา × (1 − ส่วนลด%) เฉพาะจัดส่งสำเร็จ ไม่รวมค่าส่ง' }),
        h(Kpi, { tone: 'green', label: 'คำสั่งซื้อสำเร็จ', value: file ? fmtInt.format(s.orders) : '—', note: 'สถานะ “จัดส่งสำเร็จ”' }),
        h(Kpi, { tone: 'yellow', label: 'AOV', value: file ? fmtBaht2(s.aov) : '—', note: 'ยอดขายสุทธิ ÷ คำสั่งซื้อสำเร็จ' }),
        h(Kpi, { tone: 'red', label: 'อัตรายกเลิก', value: file ? fmtPct(s.cancelRate) : '—', note: file ? `${fmtInt.format(s.cancels)} จาก ${fmtInt.format(view.length)} คำสั่งซื้อ` : 'ยกเลิก ÷ คำสั่งซื้อทั้งหมด' }),
        h(Kpi, { tone: 'orange', label: 'อัตราคืนสินค้า', value: file ? fmtPct(s.returnRate) : '—', note: file ? `${fmtInt.format(s.returns)} จาก ${fmtInt.format(view.length)} คำสั่งซื้อ` : 'คืนสินค้า ÷ คำสั่งซื้อทั้งหมด' })),

      file && h('div', { className: 'bs-check', 'aria-label': 'ตรวจสอบข้อมูล' },
        h('span', null, 'อ่านได้ ', h('b', { className: 'bs-n' }, fmtInt.format(rows.length)), ' แถว'),
        filtered && h('span', null, 'ตามตัวกรอง ', h('b', { className: 'bs-n' }, fmtInt.format(view.length)), ' แถว'),
        s.statusAll.map(([st, n]) => h('span', { key: st }, st + ' ',
          h('b', { className: 'bs-n' }, fmtInt.format(filtered ? (s.statusView.get(st) || 0) : n)),
          filtered ? ' / ' + fmtInt.format(n) : '')),
        file.parseErrors > 0 && h('span', { className: 'bs-warn' }, `แถวที่ PapaParse แจ้งปัญหา ${fmtInt.format(file.parseErrors)}`),
        file.badNum > 0 && h('span', { className: 'bs-warn' }, `แถวสำเร็จที่ตัวเลขอ่านไม่ได้ ${fmtInt.format(file.badNum)} (ไม่นับในยอด)`),
        gmMiss > 0 && h('span', { className: 'bs-warn' }, `แถวสำเร็จที่ไม่พบต้นทุนใน products.csv ${fmtInt.format(gmMiss)} (ไม่นับใน % กำไรขั้นต้น)`)),

      file && h('div', { className: 'bs-tabs', role: 'tablist' },
        [['overview', 'ภาพรวม'], ['mega', 'วันเมกะเซล'], ['exec', 'บทสรุปผู้บริหาร']].map(([k, t]) => h('button', {
          key: k, id: 'tab-' + k, role: 'tab', 'aria-selected': tab === k, className: 'bs-tab' + (tab === k ? ' bs-tab-on' : ''), onClick: () => goTab(k),
        }, t))),

      file && tab === 'exec' && h('div', { className: 'bs-grid', id: 'exec' },
        h('div', { className: 'bs-wide' }, h(ExecSummary, { summary })),
        h('div', { className: 'bs-wide' }, h(PdfExport, { summary }))),

      file && tab === 'overview' && h('div', { className: 'bs-grid', id: 'overview' },
        h('h3', { className: 'bs-section' }, 'แนวโน้มรายเดือน'),
        h('div', { className: 'bs-card bs-wide', id: 'monthly' },
          h('h2', null, 'ยอดขายสุทธิรายเดือน'),
          h('p', { className: 'bs-sub' }, 'บาท · ' + scope),
          h(LineChart, { data: s.monthly })),

        h('h3', { className: 'bs-section' }, 'ช่องทางขายและหมวดสินค้า'),
        h('div', { className: 'bs-card', id: 'channel' },
          h('h2', null, 'ยอดขายสุทธิตามช่องทาง'),
          h('p', { className: 'bs-sub' }, 'บาท · เรียงจากมากไปน้อย · ' + scope),
          h(BarChart, { data: s.channel, label: 'ยอดขายสุทธิตามช่องทาง', rows: Math.max(s.channel.length, s.category.length) })),
        h('div', { className: 'bs-card', id: 'category' },
          h('h2', null, 'ยอดขายสุทธิตามหมวดสินค้า'),
          h('p', { className: 'bs-sub' }, 'บาท · เรียงจากมากไปน้อย · สีเดียวกับกราฟบริษัทขนส่ง · ' + scope),
          h(BarChart, { data: s.category, label: 'ยอดขายสุทธิตามหมวดสินค้า', rows: Math.max(s.channel.length, s.category.length),
            colorOf: (c) => dash.colors[Math.max(0, s.cats.indexOf(c)) % dash.colors.length] })),

        h('h3', { className: 'bs-section' }, 'การจัดส่งและพื้นที่'),
        h('div', { className: 'bs-card bs-wide', id: 'carrier-mix' },
          h('h2', null, 'ยอดขายสุทธิตามบริษัทขนส่ง แยกตามหมวดสินค้า'),
          h('p', { className: 'bs-sub' }, 'บาท · % = สัดส่วนของหมวดในยอดของบริษัทนั้น · เรียงบริษัทและหมวดจากมากไปน้อย · ' + scope + (file.hasCarrier ? '' : ' · ไฟล์ไม่มีคอลัมน์ carrier')),
          h(StackedBar, { data: s.carrierMix, cats: s.cats })),
        h('div', { className: 'bs-card bs-wide', id: 'region' },
          h('h2', null, 'ยอดขายสุทธิตามภูมิภาคและจังหวัด'),
          h('p', { className: 'bs-sub' }, 'บาท · แท่งหนา = ภูมิภาค, แท่งบาง = จังหวัดในภูมิภาคนั้น (% ของยอดภูมิภาค) · เรียงจากมากไปน้อย · ' + scope + (file.hasProvince ? '' : ' · ไฟล์ไม่มีคอลัมน์ province')),
          h(RegionBar, { data: s.regionMix }))),

      file && tab === 'mega' && h('div', { className: 'bs-grid', id: 'mega' },
        h('div', { className: 'bs-kpis bs-wide' },
          h(Kpi, { tone: 'blue', label: 'สัดส่วนยอดขายวันเมกะเซล', value: fmtPct(s.mega.share),
            note: `${fmtInt.format(s.mega.days)} วันจาก ${fmtInt.format(s.mega.allDays)} วัน (${fmtPct(s.mega.dayShare)} ของจำนวนวัน)` }),
          h(Kpi, { tone: 'green', label: 'ยอดขายเฉลี่ยต่อวัน · เมกะเซล', value: fmtBaht(s.mega.avg),
            note: `วันปกติ ${fmtBaht(s.mega.normalAvg)}/วัน · ${s.mega.normalAvg ? (s.mega.avg / s.mega.normalAvg).toFixed(2) : '—'}× ของวันปกติ` }),
          h(Kpi, { tone: 'yellow', label: '% กำไรขั้นต้น · เมกะเซล', value: hasCost ? fmtPct(s.mega.gm.pct) : '—',
            note: hasCost ? `กำไรขั้นต้น ${fmtBaht(s.mega.gm.profit)}` : 'อัปโหลด products.csv เพื่อคำนวณ' }),
          h(Kpi, { tone: 'orange', label: '% กำไรขั้นต้น · วันปกติ', value: hasCost ? fmtPct(s.mega.normalGm.pct) : '—',
            note: hasCost ? `ต่างกัน ${(s.mega.gm.pct - s.mega.normalGm.pct).toFixed(2)} จุด (เมกะเซล − ปกติ)` : 'อัปโหลด products.csv เพื่อคำนวณ' })),

        h('div', { className: 'bs-card bs-wide', id: 'mega-share' },
          h('h2', null, 'สัดส่วนยอดขาย: วันเมกะเซล เทียบวันปกติ'),
          h('p', { className: 'bs-sub' }, 'เทียบสัดส่วนยอดขายสุทธิกับสัดส่วนจำนวนวัน · ' + scope),
          h(ShareBars, { mega: s.mega })),

        h('div', { className: 'bs-card', id: 'mega-daily' },
          h('h2', null, 'ยอดขายสุทธิแต่ละวันเมกะเซล'),
          h('p', { className: 'bs-sub' }, 'บาท · เส้นประ = ยอดเฉลี่ยต่อวันของวันปกติ · ' + scope),
          h(VBar, { label: 'ยอดขายสุทธิแต่ละวันเมกะเซล', color: dash.colors[1], fmt: fmtBaht, refValue: s.mega.normalAvg, refLabel: 'วันปกติ',
            data: s.mega.byDay.map((d) => ({ key: d.label, value: d.net, title: d.label + ' · ' + dayLabel(d.day), tip: fmtBaht(d.net) + ' · ' + d.ratio.toFixed(2) + '× ของวันปกติ' })) })),
        h('div', { className: 'bs-card', id: 'mega-gm' },
          h('h2', null, '% กำไรขั้นต้นแต่ละวันเมกะเซล'),
          h('p', { className: 'bs-sub' }, '(ยอดขายสุทธิ − qty × unit_cost) ÷ ยอดขายสุทธิ · เส้นประ = วันปกติ · ' + scope),
          hasCost
            ? h(VBar, { label: '% กำไรขั้นต้นแต่ละวันเมกะเซล', color: dash.colors[2], fmt: fmtPct, refValue: s.mega.normalGm.pct, refLabel: 'วันปกติ',
                data: s.mega.byDay.map((d) => ({ key: d.label, value: d.gm.pct, title: d.label + ' · ' + dayLabel(d.day), tip: 'กำไรขั้นต้น ' + fmtPct(d.gm.pct) + ' · ' + fmtBaht(d.gm.profit) })) })
            : h('div', { className: 'bs-empty' }, 'อัปโหลด products.csv (มีคอลัมน์ product_id, unit_cost) เพื่อดู % กำไรขั้นต้น')),

        h('div', { className: 'bs-card bs-wide', id: 'mega-table' },
          h('h2', null, 'รายละเอียดวันเมกะเซล'),
          h('p', { className: 'bs-sub' }, 'วันเมกะเซล = วันที่เลขวันเท่ากับเลขเดือน (10.10, 11.11, 12.12, 3.3, 6.6, 9.9) · วันปกติ = วันอื่นที่มีคำสั่งซื้อในไฟล์ · ' + scope),
          h(MegaTable, { mega: s.mega, hasCost }))),

      h('p', { className: 'bs-def' }, 'อัตรายกเลิก / อัตราคืนสินค้า = จำนวนแถวสถานะ “ยกเลิก” / “คืนสินค้า” ÷ จำนวนคำสั่งซื้อทั้งหมดในตัวกรอง × 100 · กำไรขั้นต้น = ยอดขายสุทธิ − qty × unit_cost (จาก products.csv เชื่อมด้วย product_id) · เดือน = 7 ตัวอักษรแรกของ order_datetime'));
  }

  const el = document.getElementById('bs-app');
  const rerender = () => window.__bsRoot && window.__bsRoot.render(h(App));
  if (document.fonts) document.fonts.load("12px 'Prompt'").then(rerender, () => {});
  if (!window.__bsRoot || window.__bsRootEl !== el) {
    window.__bsRoot = ReactDOM.createRoot(el);
    window.__bsRootEl = el;
  }
  window.__bsRoot.render(h(App));
})();
