'use client'

import { useCallback, useRef, useState } from 'react'

import type { BoardDoc } from './types'

/** 撤销栈上限 */
export const HISTORY_LIMIT = 200

type State = { doc: BoardDoc; past: BoardDoc[]; future: BoardDoc[]; version: number }

/**
 * 画板文档 + 撤销 / 重做。对象都是不可变的，快照之间共享未改动的对象，200 步也不占多少内存。
 * version 每次变化都加一（提交、撤销、重做、重置），用来判断是否有未保存的修改。
 */
export function useBoardHistory(initial: () => BoardDoc) {
  const [state, setState] = useState<State>(() => ({
    doc: initial(),
    past: [],
    future: [],
    version: 0,
  }))
  const ref = useRef(state)
  ref.current = state

  /** 提交一次修改（返回 null / 原文档表示没有变化） */
  const commit = useCallback((next: BoardDoc | null | ((doc: BoardDoc) => BoardDoc | null)) => {
    setState((s) => {
      const doc = typeof next === 'function' ? next(s.doc) : next
      if (!doc || doc === s.doc) return s
      return {
        doc,
        past: [...s.past.slice(-(HISTORY_LIMIT - 1)), s.doc],
        future: [],
        version: s.version + 1,
      }
    })
  }, [])

  const undo = useCallback(() => {
    setState((s) => {
      const prev = s.past[s.past.length - 1]
      if (!prev) return s
      return {
        doc: prev,
        past: s.past.slice(0, -1),
        future: [s.doc, ...s.future],
        version: s.version + 1,
      }
    })
  }, [])

  const redo = useCallback(() => {
    setState((s) => {
      const next = s.future[0]
      if (!next) return s
      return {
        doc: next,
        past: [...s.past, s.doc],
        future: s.future.slice(1),
        version: s.version + 1,
      }
    })
  }, [])

  /** 整体替换（例如 AI 在服务端改了图纸后刷新），清空撤销栈 */
  const reset = useCallback((doc: BoardDoc) => {
    setState((s) => ({ doc, past: [], future: [], version: s.version + 1 }))
  }, [])

  return {
    doc: state.doc,
    version: state.version,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    /** 最新状态（事件回调里读，避免闭包拿到旧文档） */
    current: ref,
    commit,
    undo,
    redo,
    reset,
  }
}
