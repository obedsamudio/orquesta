import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Act, Board, Status, Sub } from '../types'

const PANE = 'orquesta'
const EMPTY: Board = { model: '', acts: [], nActs: 0, agents: [], sum: { n: 0, acts: 0, tok: 0, first: 0, last: 0, bad: 0 }, mainTok: 0, tick: 0 }
// Change the tag when Board's fields change: it declines what an earlier version stored.
const board = atom({ plugin: 'orquesta', key: 'board' } as const, EMPTY, { shape: 'board-3' })

const FAM: Record<string, string> = { opus: '#e07a52', sonnet: '#5b9be6', haiku: '#7fb069', fable: '#c77dff' }
const color = (m: string) => FAM[Object.keys(FAM).find(k => m.toLowerCase().includes(k)) ?? ''] ?? '#a9a6b5'
const pretty = (m: string) => {
  if (!m) return '…'
  const [f = '', ...v] = m.replace(/^claude-/, '').replace(/-\d{8}$/, '').split('-')
  return f.charAt(0).toUpperCase() + f.slice(1) + (v.length ? ' ' + v.join('.') : '')
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

// Only basenames and descriptions are shown, so full paths and raw commands stay off a recorded screen.
function describe(tool: string, i: Record<string, unknown>): [string, string] {
  const s = (k: string) => String(i[k] ?? '')
  const base = (k: string) => s(k).split('/').pop() ?? ''
  switch (tool) {
    case 'Read': return ['Lee', base('file_path')]
    case 'Edit': case 'MultiEdit': return ['Edita', base('file_path')]
    case 'Write': return ['Escribe', base('file_path')]
    case 'Grep': return ['Busca', s('pattern')]
    case 'Glob': return ['Busca archivos', s('pattern')]
    case 'Bash': return ['Ejecuta', s('description') || 'comando']
    case 'WebSearch': return ['Busca en web', s('query')]
    case 'WebFetch': return ['Lee web', s('url').replace(/^https?:\/\//, '').split('/')[0] ?? '']
    case 'Agent': case 'Task': return ['Lanza agente', s('description')]
    case 'Skill': return ['Usa skill', s('skill')]
    default: return [tool.split('__').pop() ?? tool, '']
  }
}
const push = (acts: Act[], a: Act) => [a, ...acts].slice(0, 3)

const CSS = `
.t{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;fill:#f2efe9}
.m{font-family:ui-monospace,Menlo,monospace;font-size:13.5px;fill:#c9c6d1}
.mut{fill:#8a8794}
.flow{stroke-dasharray:6 8;animation:f .8s linear infinite}
@keyframes f{to{stroke-dashoffset:-14}}
.pulse{animation:p 1.2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes p{50%{opacity:.3;transform:scale(.6)}}
.pop{animation:pop .55s cubic-bezier(.2,1.4,.4,1);transform-box:fill-box;transform-origin:center}
@keyframes pop{from{opacity:0;transform:translateY(-16px) scale(.9)}}
.new{animation:n .4s ease-out}
@keyframes n{from{opacity:0;transform:translateY(-6px)}}
.blip{animation:b .6s ease-out}
@keyframes b{from{stroke-width:4}}
.done{opacity:.5}
.rise{animation:rise .6s cubic-bezier(.2,1.3,.4,1);transform-box:fill-box;transform-origin:center}
@keyframes rise{from{opacity:0;transform:translateY(14px) scale(.96)}}`

const W = 420
function actLines(acts: Act[], x: number, y: number, col: string, now: number, max: number, lines: number) {
  return acts.slice(0, lines).map((a, k) => {
    const cls = k === 0 && now - a.at < 900 ? 'm new' : 'm'
    return `<text class="${cls}" x="${x}" y="${y + k * 18}" opacity="${[1, 0.45, 0.2][k]}"><tspan fill="${col}" font-weight="600">${esc(a.verb)}</tspan> ${esc(cut(a.target, max - a.verb.length))}</text>`
  }).join('')
}
function pill(text: string, right: number, y: number, col: string) {
  const w = text.length * 7.6 + 18
  return `<rect x="${right - w}" y="${y - 13}" width="${w}" height="20" rx="10" fill="none" stroke="${col}" stroke-opacity=".5"/><text class="t" x="${right - w / 2}" y="${y + 1}" text-anchor="middle" font-size="13" font-weight="600" fill="${col}">${esc(text)}</text>`
}

const RED = '#e5534b'
const mmss = (ms: number) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` }
const tok = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`)
const fin = (a: Sub) => a.status !== 'run'
const bad = (a: Sub) => a.status === 'failed' || a.status === 'killed'

// Running agents first, then errors, then the most recent finished ones; at most 6 cards.
function pick(b: Board): Sub[] {
  const run = b.agents.filter(a => !fin(a)), err = b.agents.filter(bad)
  const ok = b.agents.filter(a => a.status === 'done')
  return [...run, ...err, ...ok.slice(-Math.max(0, 6 - run.length - err.length))].slice(0, 6).sort((x, y) => x.born - y.born)
}

function drawSvg(b: Board, now: number): string {
  const shown = pick(b)
  const run = b.agents.filter(a => !fin(a)), nbad = b.agents.filter(bad).length
  const byId = new Map(shown.map(a => [a.id, a]))
  const seen = new Set<string>() // guards against a parent cycle in the data
  const walk = (a: Sub): Sub[] => (seen.has(a.id) ? [] : (seen.add(a.id), [a, ...shown.filter(c => c.parentId === a.id).flatMap(walk)]))
  const rows = shown.filter(a => !byId.has(a.parentId ?? '')).flatMap(walk)
  const depthOf = (a: Sub) => { let d = 0; for (let p = byId.get(a.parentId ?? ''); p && d < 2; p = byId.get(p.parentId ?? '')) d++; return d }
  const yOf = new Map(rows.map((a, i) => [a.id, 160 + i * 96]))
  const showSum = b.sum.n > 0 && run.length === 0
  const top = 160, H = top + Math.max(1, rows.length) * 96 + 6 + (showSum ? 88 : 0)
  const mc = color(b.model), lastMain = b.acts[0]?.at ?? 0
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMin meet"><style>${CSS}</style>`
  s += `<rect width="${W}" height="${H}" rx="14" fill="#0b0b0f"/>`
  s += `<text class="t" x="14" y="28" font-size="21" font-weight="700">Orquesta de agentes</text>`
  s += `<text class="t mut" x="14" y="48" font-size="13">${run.length} activos · ${b.agents.length - run.length - nbad} listos${nbad ? ` · ${nbad} fallidos` : ''} · ${b.nActs} acciones</text>`
  // links first so cards sit on top
  rows.forEach(a => {
    const y = yOf.get(a.id) ?? top, d = depthOf(a), col = bad(a) ? RED : color(a.model), cy = y + 42, x = 40 + 24 * d
    const p = byId.get(a.parentId ?? '')
    const lx = p ? 40 + 24 * depthOf(p) + 14 : 24, from = p ? (yOf.get(p.id) ?? top) + 84 : 144
    const path = `M${lx} ${from} V${cy - 14} Q${lx} ${cy} ${x} ${cy}`
    s += bad(a) ? `<path d="${path}" fill="none" stroke="${RED}" stroke-width="2" opacity=".4"/>`
      : fin(a) ? `<path d="${path}" fill="none" stroke="${col}" stroke-width="2" opacity=".15"/>`
      : `<path class="flow" d="${path}" fill="none" stroke="${col}" stroke-width="2"/><circle r="4" fill="${col}" style="filter:drop-shadow(0 0 5px ${col})"><animateMotion dur="1.4s" repeatCount="indefinite" path="${path}"/></circle>`
  })
  // main agent
  s += `<rect class="${now - lastMain < 700 ? 'blip' : ''}" x="10" y="58" width="${W - 20}" height="86" rx="14" fill="#15141b" stroke="${mc}" stroke-opacity=".7" style="filter:drop-shadow(0 6px 14px ${mc}55)"/>`
  s += `<circle class="pulse" cx="27" cy="78" r="5" fill="${mc}"/><text class="t mut" x="40" y="82" font-size="12" letter-spacing="1.2">AGENTE PRINCIPAL</text>${pill(pretty(b.model), W - 22, 81, mc)}`
  s += b.acts.length ? actLines(b.acts, 24, 108, mc, now, 46, 2) : `<text class="m mut" x="24" y="108">Esperando…</text>`
  if (!shown.length) s += `<text class="t mut" x="${W / 2}" y="${top + 44}" text-anchor="middle" font-size="13">Sin subagentes todavía</text>`
  rows.forEach(a => {
    const y = yOf.get(a.id) ?? top, d = depthOf(a), x = 40 + 24 * d, w = W - 50 - 24 * d
    const col = bad(a) ? RED : color(a.model), last = a.acts[0]?.at ?? 0, r = x + w - 10
    const label = a.status === 'run' ? `${a.n} acc` : a.status === 'done' ? 'listo' : a.status === 'failed' ? '✕ falló' : '✕ detenido'
    s += `<g class="${[now - a.born < 900 ? 'pop' : '', a.status === 'done' ? 'done' : ''].join(' ')}">`
    s += `<rect class="${!fin(a) && now - last < 700 ? 'blip' : ''}" x="${x}" y="${y}" width="${w}" height="84" rx="12" fill="#15141b" stroke="${bad(a) ? RED : fin(a) ? '#2a2833' : col}" stroke-opacity="${bad(a) ? 0.9 : fin(a) ? 1 : 0.6}" stroke-width="${bad(a) ? 1.5 : 1}"/>`
    s += bad(a) ? `<circle cx="${x + 18}" cy="${y + 18}" r="4.5" fill="${RED}"/>`
      : fin(a) ? `<text class="t" x="${x + 16}" y="${y + 22}" font-size="12" fill="#5ad18a">✓</text>`
      : `<circle class="pulse" cx="${x + 18}" cy="${y + 18}" r="4.5" fill="${col}"/>`
    s += `<text class="t mut" x="${x + 30}" y="${y + 22}" font-size="12" letter-spacing="1">${esc(cut(a.type.toUpperCase(), 24 - 3 * d))}</text>${pill(pretty(a.model), r, y + 21, col)}`
    s += `<text class="t" x="${x + 14}" y="${y + 45}" font-size="16" font-weight="650">${esc(cut(a.desc, 30 - 3 * d))}</text>`
    s += `<text class="m" x="${r}" y="${y + 45}" text-anchor="end" font-size="13" fill="${fin(a) ? '#8a8794' : '#f2efe9'}">${mmss((fin(a) ? a.doneAt : now) - a.born)}</text>`
    s += a.acts.length ? actLines(a.acts, x + 14, y + 68, col, now, 26 - 3 * d, 1) : `<text class="m mut" x="${x + 14}" y="${y + 68}">arrancando…</text>`
    s += `<text class="t mut" x="${r}" y="${y + 68}" text-anchor="end" font-size="12">~${tok(a.tokens)} tok · <tspan${bad(a) ? ` fill="${RED}"` : ''}>${label}</tspan></text></g>`
  })
  if (showSum) {
    const m = b.sum, sy = top + rows.length * 96 + 2, c = m.bad ? RED : '#5ad18a'
    s += `<g class="${now - m.last < 3000 ? 'rise' : ''}"><rect x="10" y="${sy}" width="${W - 20}" height="78" rx="14" fill="#15141b" stroke="${c}" stroke-opacity=".55"/>`
    s += `<text class="t mut" x="24" y="${sy + 22}" font-size="12" letter-spacing="1.2">RESUMEN${m.bad ? ` · ${m.bad} CON ERROR` : ''}</text>`
    const cols: [string | number, string][] = [[m.n, 'agentes'], [m.acts, 'acciones'], [mmss(m.last - m.first), 'tiempo'], ['~' + tok(m.tok + b.mainTok), 'tokens']]
    cols.forEach(([v, l], i) => {
      const cx = [62, 154, 266, 362][i]
      s += `<text class="t" x="${cx}" y="${sy + 52}" text-anchor="middle" font-size="20" font-weight="700">${v}</text><text class="t mut" x="${cx}" y="${sy + 68}" text-anchor="middle" font-size="11">${l}</text>`
    })
    s += '</g>'
  }
  return s + '</svg>'
}

const LIVE = ['pending', 'running', 'waiting']
const KEEP_DONE_MS = 20000 // finished cards stay this long, then leave the panel
const KEEP_ERR_MS = 120000 // errors stay longer: an image has no click to dismiss them
const stat = (s: string | undefined): Status => (LIVE.includes(s ?? '') ? 'run' : s === 'failed' ? 'failed' : s === 'killed' ? 'killed' : 'done')
// Changes are queued and written once per tick: a write per tool call redrew the pane on every call and made it flicker.
let queue: ((b: Board) => Board)[] = []
const later = (fn: (b: Board) => Board) => { queue.push(fn) }
const sub = (id: string, desc: string, type: string, model: string, parentId?: string): Sub =>
  ({ id, desc, type, model, status: 'run', doneAt: 0, n: 0, acts: [], born: Date.now(), tokens: 0, parentId })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'orquesta', description: 'Abre el panel animado de agentes y subagentes' })
    void $.ui.open({ id: PANE, title: 'Orquesta' })
    let busy = false
    // A failing sound must never break the panel.
    const snd = (f: string) => { void $.audio.play({ asset: `sounds/${f}.wav` }).catch(() => {}) }
    $.clock.every(700, () => {
      if (busy) return
      busy = true
      const fns = queue
      queue = []
      void (async () => {
        try {
          const list = await $.agent.list()
          const cur = await read($, board)
          const now = Date.now(), st = new Map(list.map(a => [a.id, a.status as string]))
          const par = new Map(list.map(a => [a.id, a.parentId]))
          let b = cur
          // No event marks a subagent's end, so the real agent list is the source of truth for who runs.
          for (const a of list)
            if (LIVE.includes(a.status) && !b.agents.some(x => x.id === a.id))
              b = { ...b, agents: [...b.agents, sub(a.id, a.description, a.type, '', a.parentId)] }
          if (!cur.agents.length && b.agents.length) b = { ...b, sum: EMPTY.sum, mainTok: 0 } // a new batch starts a new summary
          b = fns.reduce((acc, f) => f(acc), b)
          const fresh = b.agents.some(x => !cur.agents.some(y => y.id === x.id))
          const ended: Sub[] = []
          const all = b.agents.map(x => {
            const parentId = par.get(x.id) ?? x.parentId
            if (x.status === 'run' && !LIVE.includes(st.get(x.id) ?? '') && now - x.born > 3000) {
              const y = { ...x, status: stat(st.get(x.id)), doneAt: now, parentId }
              ended.push(y)
              return y
            }
            if (x.status !== 'run' && LIVE.includes(st.get(x.id) ?? '')) return { ...x, status: 'run' as const, doneAt: 0, parentId }
            return parentId === x.parentId ? x : { ...x, parentId }
          })
          const kept = all.filter(x => !fin(x) || now - x.doneAt < (x.status === 'done' ? KEEP_DONE_MS : KEEP_ERR_MS))
          const parents = new Set(kept.map(x => x.parentId)) // a parent stays while its child is shown
          const agents = all.filter(x => kept.includes(x) || parents.has(x.id))
          let sum = b.sum
          if (ended.length)
            sum = {
              n: sum.n + ended.length, acts: sum.acts + ended.reduce((t, x) => t + x.n, 0), tok: sum.tok + ended.reduce((t, x) => t + x.tokens, 0),
              first: Math.min(sum.first || Infinity, ...ended.map(x => x.born)), last: now, bad: sum.bad + ended.filter(bad).length,
            }
          // Coarse 2 s tick: timers are static inside an image, so only this forces a redraw while something runs.
          b = { ...b, agents, sum, tick: agents.some(x => !fin(x)) ? Math.floor(now / 2000) : b.tick }
          if (JSON.stringify(b) !== JSON.stringify(cur)) await update($, board, () => b)
          if (fresh) snd('spawn')
          if (ended.length) snd('done')
        } catch {
          queue = [...fns, ...queue] // a failed tick keeps its changes for the next one
        } finally {
          busy = false
        }
      })()
    })
    return next(e)
  })

  on('command.run', { command: 'orquesta' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Orquesta' })
    return { text: 'Panel Orquesta abierto.' }
  })

  on('turn.step', async function* ($, e, next) {
    const { agentId, model } = e
    if (model)
      later(b => (agentId
        ? { ...b, agents: b.agents.map(a => (a.id === agentId && a.model !== model ? { ...a, model } : a)) }
        : b.model === model ? b : { ...b, model }))
    return yield* next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    const id = 'agentId' in r ? r.agentId : undefined
    if (id) {
      const s = sub(id, e.description ?? '', e.subagentType ?? 'agente', r.model ?? '')
      later(b => (b.agents.some(a => a.id === id)
        ? { ...b, agents: b.agents.map(a => (a.id === id ? { ...a, desc: a.desc || s.desc, model: a.model || s.model } : a)) }
        : { ...b, agents: [...b.agents, s] }))
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const u = e.usage, id = e.agentId
    if (u) {
      const t = u.input_tokens + u.output_tokens + u.cache_creation_input_tokens
      later(b => {
        if (!id) return { ...b, mainTok: b.mainTok + t }
        const a = b.agents.find(x => x.id === id)
        if (!a) return b
        return { ...b, sum: fin(a) ? { ...b.sum, tok: b.sum.tok + t } : b.sum, agents: b.agents.map(x => (x.id === id ? { ...x, tokens: x.tokens + t } : x)) }
      })
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const input = ((e as { input?: unknown }).input ?? {}) as Record<string, unknown>
    const [verb, target] = describe(e.tool, input)
    const act: Act = { verb, target, at: Date.now() }
    const id = e.agentId
    later(b => {
      if (!id) return { ...b, nActs: b.nActs + 1, acts: push(b.acts, act) }
      if (!b.agents.some(a => a.id === id)) return b // engine forks (compaction, memory) are not shown
      return { ...b, nActs: b.nActs + 1, agents: b.agents.map(a => (a.id === id ? { ...a, n: a.n + 1, acts: push(a.acts, act) } : a)) }
    })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'desktop') {
      const { Text } = $.ui.resolve(e)
      return <Text>El panel animado necesita la app de escritorio.</Text>
    }
    const { Box, Svg, Button } = $.ui.resolve({ ...e, surface: 'desktop' as const })
    const b = await read($, board)
    const svg = drawSvg(b, Date.now())
    const H = Number(/viewBox="0 0 \d+ (\d+)"/.exec(svg)?.[1] ?? 400)
    // shortcut: cell width guessed at 8.5px, since the pane reports its size only in cells.
    const width = Math.max(380, Math.round((e.viewport?.columns ?? 50) * 8.5))
    const run = b.agents.filter(a => !fin(a)).length
    // Drawn as an image, not an interactive frame: a frame reloads on every redraw and flashes.
    return (
      <Box flexDirection="column">
        <Svg source={svg} width={width} height={Math.round((width * H) / W)} alt={`Agente principal ${pretty(b.model)}, ${run} subagentes activos`} />
        {pick(b).map(a => (
          <Button key={a.id} onPress={() => $.ui.view({ agentId: a.id })}>Ver: {cut(a.desc, 28)}</Button>
        ))}
      </Box>
    )
  })
}
