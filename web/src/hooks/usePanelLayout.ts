import { useCallback, useEffect, useState } from 'react'

const DEFAULT_COLUMN_WIDTH = 352
const DEFAULT_ROW_RATIO = 0.5

export function usePanelLayout(columnCount: number) {
  const [columnWidths, setColumnWidths] = useState<number[]>([])
  const [rowRatios, setRowRatios] = useState<number[]>([])

  useEffect(() => {
    setColumnWidths((prev) => {
      if (prev.length === columnCount) return prev
      if (columnCount < prev.length) return prev.slice(0, columnCount)
      const next = prev.slice()
      while (next.length < columnCount) next.push(DEFAULT_COLUMN_WIDTH)
      return next
    })
    setRowRatios((prev) => {
      if (prev.length === columnCount) return prev
      if (columnCount < prev.length) return prev.slice(0, columnCount)
      const next = prev.slice()
      while (next.length < columnCount) next.push(DEFAULT_ROW_RATIO)
      return next
    })
  }, [columnCount])

  const setColumnWidth = useCallback((index: number, width: number) => {
    setColumnWidths((prev) => {
      if (prev[index] === width) return prev
      const next = prev.slice()
      next[index] = width
      return next
    })
  }, [])

  const setRowRatio = useCallback((index: number, ratio: number) => {
    setRowRatios((prev) => {
      if (prev[index] === ratio) return prev
      const next = prev.slice()
      next[index] = ratio
      return next
    })
  }, [])

  return { columnWidths, rowRatios, setColumnWidth, setRowRatio }
}
