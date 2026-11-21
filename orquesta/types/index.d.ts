export type Act = { verb: string; target: string; at: number }
export type Status = 'run' | 'done' | 'failed' | 'killed'
export type Sub = {
  id: string; desc: string; type: string; model: string; status: Status
  doneAt: number; n: number; acts: Act[]; born: number
  tokens: number; parentId?: string
}
export type Sum = { n: number; acts: number; tok: number; first: number; last: number; bad: number }
export type Board = { model: string; acts: Act[]; nActs: number; agents: Sub[]; sum: Sum; mainTok: number; tick: number }

declare module 'claude-code' {
  interface PluginState {
    orquesta: { board: Shaped<Board> }
  }
}
