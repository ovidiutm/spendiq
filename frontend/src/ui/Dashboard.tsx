import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { StatementDetails, Transaction } from './types'
import ReactECharts from 'echarts-for-react'
import { translate, type Language } from './i18n'

const PIE_COLORS = ['#0ea5e9', '#22c55e', '#f97316', '#6366f1', '#f43f5e', '#14b8a6', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444']
const DASHBOARD_VIEW_STATE_KEY = 'expenses-helper.dashboard-view-state.v1'

function formatRON(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return ''
  return v.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' RON'
}

function formatDateDDMMYYYY(value: string | null | undefined): string {
  if (!value) return ''
  const s = String(value).trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  const already = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s)
  if (already) return s
  return s
}

function normalizeIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

function getMerchantKey(t: Transaction): string {
  return (t.merchant || t.title || '').trim()
}

function txMentionsSavingsAccount(tx: Transaction, targetIban: string): boolean {
  const targetNorm = normalizeIban(targetIban)
  const lines = Array.isArray(tx.raw_lines) ? tx.raw_lines : []
  return lines.some(line => normalizeIban(String(line)).includes(targetNorm))
}

function txMentionsAnySavingsAccount(tx: Transaction, accounts: string[]): boolean {
  if (!accounts.length) return false
  return accounts.some(account => txMentionsSavingsAccount(tx, account))
}

function toSafeId(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function loadDashboardViewState(): any {
  try {
    const raw = localStorage.getItem(DASHBOARD_VIEW_STATE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object') ? parsed : {}
  } catch {
    return {}
  }
}

type Props = {
  txs: Transaction[]
  statementDetails: StatementDetails | null
  categories: string[]
  language: Language
  savingsAccounts: string[]
  onAddSavingsAccount: (iban: string) => void | Promise<void>
  onDeleteSavingsAccount: (iban: string) => void | Promise<void>
  onOverrideMerchant: (merchant: string, type: string, category: string) => void | Promise<void>
  onOverrideTransaction: (tx: Transaction, category: string) => void | Promise<void>
  newCategory: string
  onNewCategoryChange: (value: string) => void
  onAddCategory: () => void | Promise<void>
  selectedCategory: string
  onSelectedCategoryChange: (value: string) => void
  editingCategory: string | null
  editingValue: string
  onEditingValueChange: (value: string) => void
  onStartRenameCategory: (name: string) => void
  onApplyRenameCategory: () => void | Promise<void>
  onCancelRenameCategory: () => void
  onDeleteCategory: (name: string) => void | Promise<void>
  canResetCategories: boolean
  onResetSettings: () => void | Promise<void>
}

type SortColumn = 'date' | 'merchant' | 'type' | 'category' | 'amount'
type SortDirection = 'asc' | 'desc'
type FinanceModalKind = 'income' | 'expenses' | 'savings'
type BalanceTableFilter = 'none' | 'savings'

function toCsvRow(values: (string | number | null | undefined)[]): string {
  return values
    .map(v => {
      const s = v === null || v === undefined ? '' : String(v)
      const escaped = s.replace(/"/g, '""')
      return `"${escaped}"`
    })
    .join(',')
}

function buildCsv(txs: Transaction[]): string {
  const header = toCsvRow([
    'Date',
    'Merchant',
    'Type',
    'Category',
    'Amount',
    'Direction',
    'Method',
  ])
  const lines = [header]
  for (const t of txs) {
    lines.push(
      toCsvRow([
        formatDateDDMMYYYY(t.date),
        t.merchant ?? '',
        t.title ?? '',
        t.category ?? 'Other',
        t.amount ?? '',
        t.direction ?? '',
        t.method ?? '',
      ])
    )
  }
  return lines.join('\r\n')
}

type OverflowTitleTextProps = {
  text: string | null | undefined
  style?: React.CSSProperties
  className?: string
  onClick?: React.MouseEventHandler<HTMLDivElement>
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>
}

function OverflowTitleText({ text, style, className, onClick, onMouseEnter, onMouseLeave }: OverflowTitleTextProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) {
      setIsOverflowing(false)
      return
    }

    const checkOverflow = () => {
      setIsOverflowing(el.scrollWidth > el.clientWidth + 1)
    }

    checkOverflow()

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(checkOverflow)
      ro.observe(el)
    }

    window.addEventListener('resize', checkOverflow)
    return () => {
      window.removeEventListener('resize', checkOverflow)
      if (ro) ro.disconnect()
    }
  }, [text])

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      title={isOverflowing ? String(text ?? '') : undefined}
    >
      {text ?? ''}
    </div>
  )
}

export default function Dashboard({
  txs,
  statementDetails,
  categories,
  language,
  savingsAccounts,
  onAddSavingsAccount,
  onDeleteSavingsAccount,
  onOverrideMerchant,
  onOverrideTransaction,
  newCategory,
  onNewCategoryChange,
  onAddCategory,
  selectedCategory,
  onSelectedCategoryChange,
  editingCategory,
  editingValue,
  onEditingValueChange,
  onStartRenameCategory,
  onApplyRenameCategory,
  onCancelRenameCategory,
  onDeleteCategory,
  canResetCategories,
  onResetSettings,
}: Props) {
  const t = (ro: string, en: string) => translate(language, ro, en)
  const initialView = loadDashboardViewState()
  const [isResettingSettings, setIsResettingSettings] = useState(false)
  const [categoryActionBusy, setCategoryActionBusy] = useState<'add' | 'rename' | 'delete' | null>(null)
  const [savingsAddBusy, setSavingsAddBusy] = useState(false)
  const [savingsDeleteBusyAccount, setSavingsDeleteBusyAccount] = useState<string | null>(null)

  const handleResetSettings = async () => {
    if (isResettingSettings) return
    setIsResettingSettings(true)
    try {
      await onResetSettings()
    } finally {
      setIsResettingSettings(false)
    }
  }
  const resetDashboardView = () => {
    setQ('')
    setCategory('All')
    setDirection('debit')
    setTableQuery('')
    setTableQueryField('all')
    setCategoryChangeMode('merchant_type')
    setSortBy('date')
    setSortDir('desc')
    setChartFocusCategory(null)
    setChartFocusMerchant(null)
    setHoveredLegendCategory(null)
    setHoveredTopMerchant(null)
    setHoveredDetails(null)
    setHoveredRowKey(null)
    setFinanceModal(null)
    setBalanceTableFilter('none')
    const chart = categoriesChartRef.current?.getEchartsInstance?.()
    if (chart) {
      chart.dispatchAction({ type: 'downplay', seriesIndex: 0 })
      chart.dispatchAction({ type: 'hideTip' })
      const option = chart.getOption?.()
      const dataLen = Array.isArray(option?.series?.[0]?.data) ? option.series[0].data.length : 0
      for (let i = 0; i < dataLen; i += 1) {
        chart.dispatchAction({ type: 'unselect', seriesIndex: 0, dataIndex: i })
      }
    }
    try {
      localStorage.removeItem(DASHBOARD_VIEW_STATE_KEY)
    } catch {
      // ignore local storage errors
    }
  }
  const [q, setQ] = useState(String(initialView.q ?? ''))
  const [category, setCategory] = useState<string>(String(initialView.category ?? 'All'))
  const [direction, setDirection] = useState<'All'|'debit'|'credit'>(
    initialView.direction === 'All' || initialView.direction === 'credit' ? initialView.direction : 'debit'
  ) // V1 expense-focused default
  const [tableQuery, setTableQuery] = useState(String(initialView.tableQuery ?? ''))
  const [tableQueryField, setTableQueryField] = useState<'all' | SortColumn>(
    initialView.tableQueryField === 'date' || initialView.tableQueryField === 'merchant' || initialView.tableQueryField === 'type' || initialView.tableQueryField === 'category' || initialView.tableQueryField === 'amount'
      ? initialView.tableQueryField
      : 'all'
  )
  const [categoryChangeMode, setCategoryChangeMode] = useState<'merchant_type' | 'single_transaction'>(
    initialView.categoryChangeMode === 'single_transaction' ? 'single_transaction' : 'merchant_type'
  )
  const [sortBy, setSortBy] = useState<SortColumn>(
    initialView.sortBy === 'merchant' || initialView.sortBy === 'type' || initialView.sortBy === 'category' || initialView.sortBy === 'amount'
      ? initialView.sortBy
      : 'date'
  )
  const [sortDir, setSortDir] = useState<SortDirection>(initialView.sortDir === 'asc' ? 'asc' : 'desc')
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [isSavingsAccountsModalOpen, setIsSavingsAccountsModalOpen] = useState(false)
  const [newSavingsAccount, setNewSavingsAccount] = useState('')
  const [highlightedSavingsAccount, setHighlightedSavingsAccount] = useState<string | null>(null)
  const [pendingSavingsHighlight, setPendingSavingsHighlight] = useState<string | null>(null)
  const [financeModal, setFinanceModal] = useState<FinanceModalKind | null>(null)
  const [balanceTableFilter, setBalanceTableFilter] = useState<BalanceTableFilter>('none')
  const [chartFocusCategory, setChartFocusCategory] = useState<string | null>(
    typeof initialView.chartFocusCategory === 'string' ? initialView.chartFocusCategory : null
  )
  const [chartFocusMerchant, setChartFocusMerchant] = useState<string | null>(
    typeof initialView.chartFocusMerchant === 'string' ? initialView.chartFocusMerchant : null
  )
  const [hoveredLegendCategory, setHoveredLegendCategory] = useState<string | null>(null)
  const [hoveredTopMerchant, setHoveredTopMerchant] = useState<string | null>(null)
  const [hoveredDetails, setHoveredDetails] = useState<{ text: string, x: number, y: number } | null>(null)
  const [hoveredRowKey, setHoveredRowKey] = useState<string | null>(null)
  const categoriesChartRef = useRef<any>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverDraftRef = useRef<{ text: string, x: number, y: number } | null>(null)
  const savingsHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    [categories]
  )
  const categoryColumnWidth = useMemo(() => {
    const longestCategory = sortedCategories.reduce((max, c) => Math.max(max, c.length), 0)
    // Include room for select paddings + arrow and keep a safe min/max.
    return Math.max(150, Math.min(300, 22 + longestCategory * 8))
  }, [sortedCategories])
  const categoryCellWidth = useMemo(
    () => Math.max(categoryColumnWidth + 90, 260),
    [categoryColumnWidth]
  )

  useEffect(() => {
    try {
      localStorage.setItem(
        DASHBOARD_VIEW_STATE_KEY,
        JSON.stringify({
          q,
          category,
          direction,
          tableQuery,
          tableQueryField,
          categoryChangeMode,
          sortBy,
          sortDir,
          chartFocusCategory,
          chartFocusMerchant,
        })
      )
    } catch {
      // ignore cache write errors
    }
  }, [q, category, direction, tableQuery, tableQueryField, categoryChangeMode, sortBy, sortDir, chartFocusCategory, chartFocusMerchant])

  // Recover from stale persisted view-state (e.g. renamed/deleted category).
  // If selected category no longer exists, fall back to "All".
  useEffect(() => {
    if (category === 'All') return
    const exists = categories.some(c => c === category)
    if (!exists) {
      setCategory('All')
    }
  }, [category, categories])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return txs.filter(t => {
      if (direction !== 'All' && t.direction !== direction) return false
      if (category !== 'All' && (t.category ?? 'Other') !== category) return false
      if (query) {
        const blob = `${t.title} ${t.merchant}`.toLowerCase()
        if (!blob.includes(query)) return false
      }
      return true
    })
  }, [txs, q, category, direction])

  const spendByCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of filtered) {
      if (t.amount === null) continue
      const cat = t.category ?? 'Other'
      const v = Math.abs(t.amount)
      m.set(cat, (m.get(cat) ?? 0) + v)
    }
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [filtered])

  const topMerchantsBase = useMemo(() => {
    if (!chartFocusCategory) return filtered
    return filtered.filter(t => (t.category ?? 'Other') === chartFocusCategory)
  }, [filtered, chartFocusCategory])

  const topMerchants = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of topMerchantsBase) {
      if (t.amount === null) continue
      const merch = getMerchantKey(t)
      m.set(merch, (m.get(merch) ?? 0) + Math.abs(t.amount))
    }
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [topMerchantsBase])

  const tableBase = useMemo(() => {
    const merchantScoped = !chartFocusMerchant
      ? topMerchantsBase
      : topMerchantsBase.filter(t => getMerchantKey(t) === chartFocusMerchant)

    if (balanceTableFilter !== 'savings') return merchantScoped
    return merchantScoped.filter(t => t.amount !== null && txMentionsAnySavingsAccount(t, savingsAccounts))
  }, [topMerchantsBase, chartFocusMerchant, balanceTableFilter, savingsAccounts])

  const incomeVsExpensesBase = useMemo(() => txs, [txs])

  const incomeVsExpenses = useMemo(() => {
    let income = 0
    let expenses = 0
    let savingsIn = 0
    let savingsOut = 0
    for (const t of incomeVsExpensesBase) {
      if (t.amount === null) continue
      if (t.direction === 'credit') {
        income += Math.abs(t.amount)
      } else {
        expenses += Math.abs(t.amount)
      }

      if (txMentionsAnySavingsAccount(t, savingsAccounts)) {
        if (t.direction === 'credit') {
          savingsOut += Math.abs(t.amount)
        } else if (t.direction === 'debit') {
          savingsIn += Math.abs(t.amount)
        }
      }
    }
    const difference = income - expenses
    const savings = savingsIn - savingsOut
    return {
      summary: { income, expenses, difference, savings },
      chartData: [
        { type: 'Income', value: income, color: '#22c55e' },
        { type: 'Expenses', value: expenses, color: '#f97316' },
        { type: 'Savings', value: savings, color: '#0ea5e9' },
      ],
    }
  }, [incomeVsExpensesBase, savingsAccounts])

  const savingsIbanRows = useMemo(() => {
    return txs
      .filter(t => t.amount !== null && txMentionsAnySavingsAccount(t, savingsAccounts))
      .map(t => {
        const flow = t.direction === 'credit' ? 'Out' : 'In'
        return {
          date: t.date,
          merchant: t.merchant,
          type: t.title,
          category: t.category ?? 'Other',
          direction: t.direction,
          flow,
          amountAbs: Math.abs(t.amount as number),
        }
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [txs, savingsAccounts])

  const incomeRows = useMemo(() => {
    return txs
      .filter(t => t.amount !== null && t.direction === 'credit')
      .map(t => ({
        date: t.date,
        merchant: t.merchant,
        type: t.title,
        category: t.category ?? 'Other',
        direction: t.direction,
        amountAbs: Math.abs(t.amount as number),
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [txs])

  const expenseRows = useMemo(() => {
    return txs
      .filter(t => t.amount !== null && t.direction === 'debit')
      .map(t => ({
        date: t.date,
        merchant: t.merchant,
        type: t.title,
        category: t.category ?? 'Other',
        direction: t.direction,
        amountAbs: Math.abs(t.amount as number),
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [txs])

  const savingsInTotal = useMemo(
    () => savingsIbanRows.filter(r => r.flow === 'In').reduce((s, r) => s + r.amountAbs, 0),
    [savingsIbanRows]
  )
  const savingsOutTotal = useMemo(
    () => savingsIbanRows.filter(r => r.flow === 'Out').reduce((s, r) => s + r.amountAbs, 0),
    [savingsIbanRows]
  )
  const savingsNetTotal = savingsInTotal - savingsOutTotal
  const savingsAccountSummaries = useMemo(() => {
    const byAccount: Record<string, { count: number; inTotal: number; outTotal: number; net: number }> = {}
    for (const account of savingsAccounts) {
      const rows = txs.filter(t => t.amount !== null && txMentionsSavingsAccount(t, account))
      const count = rows.length
      const inTotal = rows
        .filter(t => t.direction === 'debit')
        .reduce((s, t) => s + Math.abs(t.amount as number), 0)
      const outTotal = rows
        .filter(t => t.direction === 'credit')
        .reduce((s, t) => s + Math.abs(t.amount as number), 0)
      byAccount[account] = {
        count,
        inTotal,
        outTotal,
        net: inTotal - outTotal,
      }
    }
    return byAccount
  }, [savingsAccounts, txs])

  const totalSpend = useMemo(() => spendByCategory.reduce((s, r) => s + r.value, 0), [spendByCategory])
  const categoryLegend = useMemo(() => {
    return spendByCategory.map((entry, idx) => {
      const percent = totalSpend > 0 ? (entry.value / totalSpend) * 100 : 0
      return {
        ...entry,
        color: PIE_COLORS[idx % PIE_COLORS.length],
        percent,
      }
    })
  }, [spendByCategory, totalSpend])

  const tableRows = useMemo(() => {
    const query = tableQuery.trim().toLowerCase()
    const getTooltipDetailsText = (t: Transaction): string => {
      if (!Array.isArray(t.raw_lines) || t.raw_lines.length <= 1) return ''
      return t.raw_lines
        .slice(1)
        .map(s => String(s).trim())
        .filter(Boolean)
        .join('\n')
    }
    const matches = (t: Transaction): boolean => {
      if (!query) return true
      const fields: Record<SortColumn, string> = {
        date: `${t.date ?? ''} ${formatDateDDMMYYYY(t.date)}`,
        merchant: t.merchant ?? '',
        type: t.title ?? '',
        category: t.category ?? 'Other',
        amount: t.amount === null ? '' : String(Math.abs(t.amount)),
      }
      if (tableQueryField === 'all') {
        const baseMatch = Object.values(fields).some(v => v.toLowerCase().includes(query))
        if (baseMatch) return true
        const detailsText = getTooltipDetailsText(t).toLowerCase()
        return detailsText.includes(query)
      }
      return fields[tableQueryField].toLowerCase().includes(query)
    }

    const sorted = tableBase
      .filter(matches)
      .slice()
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1

        if (sortBy === 'amount') {
          const av = a.amount === null ? Number.NEGATIVE_INFINITY : a.amount
          const bv = b.amount === null ? Number.NEGATIVE_INFINITY : b.amount
          return (av - bv) * dir
        }

        if (sortBy === 'date') {
          return a.date.localeCompare(b.date) * dir
        }

        const aText =
          sortBy === 'merchant' ? (a.merchant ?? '') :
          sortBy === 'type' ? (a.title ?? '') :
          (a.category ?? 'Other')
        const bText =
          sortBy === 'merchant' ? (b.merchant ?? '') :
          sortBy === 'type' ? (b.title ?? '') :
          (b.category ?? 'Other')
        return aText.localeCompare(bText, undefined, { sensitivity: 'base' }) * dir
      })

    return sorted
  }, [tableBase, tableQuery, tableQueryField, sortBy, sortDir])

  const canExport = tableRows.length > 0
  const tableAmountSum = useMemo(
    () => tableRows.reduce((sum, t) => sum + (t.amount ?? 0), 0),
    [tableRows]
  )

  const onExportCsv = () => {
    if (!canExport) return
    const csv = buildCsv(tableRows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'expenses-helper-export.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onExportCategoriesCsv = () => {
    const lines = [
      toCsvRow(['Category']),
      ...sortedCategories.map(c => toCsvRow([c])),
    ]
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'categories.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleSort = (column: SortColumn) => {
    if (sortBy === column) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(column)
    setSortDir(column === 'date' || column === 'amount' ? 'desc' : 'asc')
  }

  const sortIndicator = (column: SortColumn): string => {
    if (sortBy !== column) return '\u2195'
    return sortDir === 'asc' ? '\u2191' : '\u2193'
  }

  const getDetailsText = (t: Transaction): string => {
    if (Array.isArray(t.raw_lines) && t.raw_lines.length > 0) {
      const detailsOnly = t.raw_lines.slice(1).map(s => String(s).trim()).filter(Boolean)
      if (detailsOnly.length > 0) {
        return detailsOnly.join('\n')
      }
    }
    return [
      `Date: ${formatDateDDMMYYYY(t.date)}`,
      `Merchant: ${t.merchant ?? ''}`,
      `Type: ${t.title ?? ''}`,
      `Category: ${t.category ?? 'Other'}`,
      `Amount: ${formatRON(t.amount)}`,
      `Direction: ${t.direction ?? ''}`,
      `Method: ${t.method ?? ''}`,
    ].join('\n')
  }

  const clearHoverTimer = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  const scheduleHover = (text: string, x: number, y: number) => {
    clearHoverTimer()
    hoverDraftRef.current = { text, x, y }
    hoverTimerRef.current = setTimeout(() => {
      if (hoverDraftRef.current) {
        setHoveredDetails(hoverDraftRef.current)
      }
    }, 1000)
  }

  const onPieCategoryClick = (slice: any) => {
    const name = String(slice?.name ?? '')
    if (!name) return
    setChartFocusCategory(prev => (prev === name ? null : name))
  }

  const getPieDataIndexByName = (name: string): number => {
    return spendByCategory.findIndex(entry => entry.name === name)
  }

  const dispatchPieHover = (name: string) => {
    const chart = categoriesChartRef.current?.getEchartsInstance?.()
    const dataIndex = getPieDataIndexByName(name)
    if (!chart || dataIndex < 0) return
    chart.dispatchAction({ type: 'downplay', seriesIndex: 0 })
    chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex })
  }

  const clearPieHover = () => {
    const chart = categoriesChartRef.current?.getEchartsInstance?.()
    if (!chart) return
    chart.dispatchAction({ type: 'downplay', seriesIndex: 0 })
    chart.dispatchAction({ type: 'hideTip' })
  }

  const onLegendRowClick = (name: string) => {
    const dataIndex = getPieDataIndexByName(name)
    const chart = categoriesChartRef.current?.getEchartsInstance?.()
    const willSelect = chartFocusCategory !== name

    onPieCategoryClick({ name })

    if (chart && dataIndex >= 0) {
      if (willSelect) {
        chart.dispatchAction({ type: 'select', seriesIndex: 0, dataIndex })
      } else {
        chart.dispatchAction({ type: 'unselect', seriesIndex: 0, dataIndex })
      }
      dispatchPieHover(name)
    }
  }

  const onIncomeExpensesBarClick = (entry: any) => {
    const barType = String(entry?.type ?? entry?.payload?.type ?? '')
    if (barType === 'Income') {
      setDirection('credit')
      setCategory('All')
      setChartFocusCategory(null)
      setChartFocusMerchant(null)
      setBalanceTableFilter('none')
      setFinanceModal(null)
      return
    }
    if (barType === 'Expenses') {
      setDirection('debit')
      setCategory('All')
      setChartFocusCategory(null)
      setChartFocusMerchant(null)
      setBalanceTableFilter('none')
      setFinanceModal(null)
      return
    }
    if (barType === 'Savings') {
      setDirection('All')
      setCategory('All')
      setChartFocusCategory(null)
      setChartFocusMerchant(null)
      // Silent table-only filter: transactions that mention any configured savings IBAN.
      setBalanceTableFilter('savings')
      setFinanceModal(null)
    }
  }


  const triggerSavingsAccountHighlight = (account: string) => {
    if (savingsHighlightTimerRef.current) {
      clearTimeout(savingsHighlightTimerRef.current)
      savingsHighlightTimerRef.current = null
    }
    setHighlightedSavingsAccount(account)
    savingsHighlightTimerRef.current = setTimeout(() => {
      setHighlightedSavingsAccount(prev => (prev === account ? null : prev))
      savingsHighlightTimerRef.current = null
    }, 1000)
  }

    const handleAddSavingsAccount = async () => {
    const normalized = normalizeIban(newSavingsAccount)
    if (!normalized || savingsAddBusy) return
    if (savingsAccounts.includes(normalized)) {
      triggerSavingsAccountHighlight(normalized)
      return
    }
    setSavingsAddBusy(true)
    setPendingSavingsHighlight(normalized)
    try {
      await onAddSavingsAccount(normalized)
      setNewSavingsAccount('')
    } catch {
      setPendingSavingsHighlight(null)
    } finally {
      setSavingsAddBusy(false)
    }
  }

  const handleDeleteSavingsAccount = async (account: string) => {
    if (savingsDeleteBusyAccount) return
    setSavingsDeleteBusyAccount(account)
    try {
      await onDeleteSavingsAccount(account)
    } finally {
      setSavingsDeleteBusyAccount(null)
    }
  }

  const handleAddCategoryClick = async () => {
    if (categoryActionBusy) return
    setCategoryActionBusy('add')
    try {
      await onAddCategory()
    } finally {
      setCategoryActionBusy(null)
    }
  }

  const handleDeleteCategoryClick = async (name: string) => {
    if (categoryActionBusy) return
    setCategoryActionBusy('delete')
    try {
      await onDeleteCategory(name)
    } finally {
      setCategoryActionBusy(null)
    }
  }

  const handleApplyRenameCategoryClick = async () => {
    if (categoryActionBusy) return
    setCategoryActionBusy('rename')
    try {
      await onApplyRenameCategory()
    } finally {
      setCategoryActionBusy(null)
    }
  }
  // If user changes selectors/search, clear previous pie drill-down
  // so table and top merchants always follow current selectors.
  useEffect(() => {
    setChartFocusCategory(null)
    setChartFocusMerchant(null)
  }, [direction, category, q])

  useEffect(() => {
    if (balanceTableFilter !== 'savings') return
    if (direction !== 'All' || category !== 'All') {
      setBalanceTableFilter('none')
    }
  }, [balanceTableFilter, direction, category])

  // If current pie drill-down category no longer exists after recategorization/reload,
  // clear it so selectors and filters drive the view again.
  useEffect(() => {
    if (!chartFocusCategory) return
    const stillExists = filtered.some(t => (t.category ?? 'Other') === chartFocusCategory)
    if (!stillExists) {
      setChartFocusCategory(null)
    }
  }, [filtered, chartFocusCategory])

  useEffect(() => {
    if (!chartFocusMerchant) return
    const stillExists = topMerchantsBase.some(t => getMerchantKey(t) === chartFocusMerchant)
    if (!stillExists) {
      setChartFocusMerchant(null)
    }
  }, [topMerchantsBase, chartFocusMerchant])

  useEffect(() => {
    if (!pendingSavingsHighlight) return
    if (!savingsAccounts.includes(pendingSavingsHighlight)) return
    triggerSavingsAccountHighlight(pendingSavingsHighlight)
    setPendingSavingsHighlight(null)
  }, [pendingSavingsHighlight, savingsAccounts])

  useEffect(() => {
    return () => {
      if (savingsHighlightTimerRef.current) {
        clearTimeout(savingsHighlightTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const onResetView = () => resetDashboardView()
    window.addEventListener('expenses-helper-reset-dashboard-view', onResetView)
    return () => window.removeEventListener('expenses-helper-reset-dashboard-view', onResetView)
  }, [])

  const financeModalMeta = useMemo(() => {
    if (!financeModal) return null
    if (financeModal === 'income') {
      return {
        title: t('Tranzactii venituri', 'Income Transactions'),
        filename: 'income-transactions.csv',
        rows: incomeRows,
        total: incomeRows.reduce((s, r) => s + r.amountAbs, 0),
        showFlow: false,
      }
    }
    if (financeModal === 'expenses') {
      return {
        title: t('Tranzactii cheltuieli', 'Expenses Transactions'),
        filename: 'expenses-transactions.csv',
        rows: expenseRows,
        total: expenseRows.reduce((s, r) => s + r.amountAbs, 0),
        showFlow: false,
      }
    }
    return {
      title: t('Economii nete (conturi configurate)', 'Savings Net (Configured accounts)'),
      filename: 'savings-iban-transactions.csv',
      rows: savingsIbanRows,
      total: savingsIbanRows.reduce((s, r) => s + r.amountAbs, 0),
      showFlow: true,
    }
  }, [financeModal, incomeRows, expenseRows, savingsIbanRows, language])

  const effectivePieSelection = hoveredLegendCategory ?? chartFocusCategory
  const categoriesPieOption = useMemo(() => {
    return {
      animationDuration: 650,
      animationDurationUpdate: 650,
      animationEasing: 'cubicOut',
      animationEasingUpdate: 'cubicInOut',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        borderColor: '#334155',
        borderWidth: 1,
        textStyle: { color: '#f8fafc', fontSize: 12 },
        formatter: (p: any) => `${p.marker} ${p.name}<br/>${formatRON(Number(p.value))} (${Number(p.percent).toFixed(1)}%)`,
      },
      series: [
        {
          type: 'pie',
          radius: ['0%', '78%'],
          center: ['50%', '50%'],
          selectedMode: 'single',
          selectedOffset: 8,
          avoidLabelOverlap: true,
          minAngle: 2,
          itemStyle: {
            borderColor: '#ffffff',
            borderWidth: 2,
          },
          label: { show: false },
          labelLine: { show: false },
          emphasis: {
            scale: true,
            scaleSize: 6,
            itemStyle: {
              shadowBlur: 14,
              shadowOffsetY: 3,
              shadowColor: 'rgba(15, 23, 42, 0.25)',
            },
          },
          data: spendByCategory.map((entry, idx) => ({
            name: entry.name,
            value: entry.value,
            selected: effectivePieSelection === entry.name,
            itemStyle: { color: PIE_COLORS[idx % PIE_COLORS.length] },
          })),
        },
      ],
    }
  }, [spendByCategory, effectivePieSelection])


  const topMerchantsOption = useMemo(() => {
    const axisMax = topMerchants.reduce((mx, m) => Math.max(mx, m.value), 0)
    return {
      animationDuration: 520,
      animationDurationUpdate: 520,
      grid: { left: 4, right: 8, top: 0, bottom: 20, containLabel: false },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        borderColor: '#334155',
        borderWidth: 1,
        textStyle: { color: '#f8fafc', fontSize: 12 },
        formatter: (p: any) => {
          if (!p) return ''
          const merchant = String(p?.data?.merchant ?? p?.name ?? '')
          return `${p.marker} ${merchant}<br/>${formatRON(Number(p.value))}`
        },
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: axisMax > 0 ? axisMax * 1.05 : 1,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          show: true,
          color: '#64748b',
          fontSize: 11,
          formatter: (value: number) => {
            const n = Number(value)
            if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`
            if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(0)}k`
            return `${Math.round(n)}`
          },
        },
      },
      yAxis: {
        type: 'category',
        data: topMerchants.map((_, idx) => String(idx)),
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: topMerchants.map((m, idx) => {
            const isActive = chartFocusMerchant === m.name
            const isHovered = hoveredTopMerchant === m.name
            return {
              name: String(idx),
              merchant: m.name,
              value: m.value,
              itemStyle: {
                borderRadius: [0, 8, 8, 0],
                color: {
                  type: 'linear',
                  x: 0,
                  y: 0,
                  x2: 1,
                  y2: 0,
                  colorStops: [
                    { offset: 0, color: '#14b8a6' },
                    { offset: 1, color: '#0ea5e9' },
                  ],
                },
                shadowBlur: isActive ? 18 : isHovered ? 12 : 6,
                shadowColor: isActive ? 'rgba(2, 132, 199, 0.46)' : 'rgba(2, 132, 199, 0.22)',
              },
            }
          }),
          barWidth: 16,
          barCategoryGap: '34%',
          emphasis: {
            itemStyle: {
              shadowBlur: 18,
              shadowColor: 'rgba(2, 132, 199, 0.42)',
            },
          },
        },
      ],
    }
  }, [topMerchants, chartFocusMerchant, hoveredTopMerchant])

  const incomeVsExpensesOption = useMemo(() => {
    const typeLabel: Record<string, string> = {
      Income: t('Venituri', 'Income'),
      Expenses: t('Cheltuieli', 'Expenses'),
      Savings: t('Economii', 'Savings'),
    }
    const barStyles: Record<string, any> = {
      Income: {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: '#4ade80' },
          { offset: 1, color: '#16a34a' },
        ],
      },
      Expenses: {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: '#fb923c' },
          { offset: 1, color: '#ea580c' },
        ],
      },
      Savings: {
        type: 'linear',
        x: 0,
        y: 0,
        x2: 0,
        y2: 1,
        colorStops: [
          { offset: 0, color: '#38bdf8' },
          { offset: 1, color: '#0284c7' },
        ],
      },
    }
    return {
      animationDuration: 520,
      animationDurationUpdate: 520,
      grid: { left: 30, right: 8, top: 8, bottom: 22, containLabel: false },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        borderColor: '#334155',
        borderWidth: 1,
        textStyle: { color: '#f8fafc', fontSize: 12 },
        formatter: (params: any[]) =>
          (params || [])
            .map((p: any) => `${p.marker} ${typeLabel[String(p.name)] ?? String(p.name)}: ${formatRON(Number(p.value))}`)
            .join('<br/>'),
      },
      xAxis: {
        type: 'category',
        data: incomeVsExpenses.chartData.map(x => x.type),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#526173',
          fontSize: 12,
          formatter: (value: string) => typeLabel[String(value)] ?? String(value),
        },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        min: (v: any) => {
          const minValue = Number(v?.min ?? 0)
          if (minValue >= 0) return 0
          return minValue * 1.12
        },
        max: (v: any) => {
          const maxValue = Number(v?.max ?? 0)
          if (maxValue <= 0) return 0
          return maxValue * 1.08
        },
        splitLine: { show: true, lineStyle: { type: 'dashed', color: '#dbe4ef' } },
        axisLabel: {
          color: '#526173',
          fontSize: 11,
          hideOverlap: true,
          formatter: (value: number) => {
            const n = Number(value)
            if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`
            if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(0)}k`
            return `${n}`
          },
        },
      },
      series: [
        {
          type: 'bar',
          data: incomeVsExpenses.chartData.map(x => ({
            value: x.value,
            itemStyle: {
              color: barStyles[x.type] ?? x.color,
              borderRadius: x.value >= 0 ? [8, 8, 0, 0] : [0, 0, 8, 8],
            },
          })),
          barMaxWidth: 52,
          barCategoryGap: '35%',
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(15, 23, 42, 0.22)',
            },
          },
        },
      ],
    }
  }, [incomeVsExpenses.chartData, language])

  const onExportFinanceModalCsv = () => {
    if (!financeModalMeta) return
    const rows: string[] = []
    rows.push(
      toCsvRow(
        financeModalMeta.showFlow
          ? ['Date', 'Merchant', 'Type', 'Category', 'Direction', 'Savings Flow', 'Amount']
          : ['Date', 'Merchant', 'Type', 'Category', 'Direction', 'Amount']
      )
    )
    for (const r of financeModalMeta.rows as any[]) {
      rows.push(
        toCsvRow(
          financeModalMeta.showFlow
            ? [formatDateDDMMYYYY(r.date), r.merchant ?? '', r.type ?? '', r.category ?? 'Other', r.direction ?? '', r.flow ?? '', r.amountAbs ?? '']
            : [formatDateDDMMYYYY(r.date), r.merchant ?? '', r.type ?? '', r.category ?? 'Other', r.direction ?? '', r.amountAbs ?? '']
        )
      )
    }
    const csv = rows.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = financeModalMeta.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!txs.length) {
    return (
      <section id="dashboard-empty-state" style={{ marginTop: 14, color: '#444' }}>
        <p>{t('Incarca un extras pentru a vedea dashboard-ul.', 'Upload a statement to see your dashboard.')}</p>
      </section>
    )
  }

  return (
    <section id="dashboard-main-section" style={{ marginTop: 14 }}>
      <section id="card-account-statement-details" style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>{t('Detalii extras de cont', 'Account Statement Details')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div id="statement-detail-account-holder">
            <div style={{ fontSize: 12, color: '#64748b' }}>{t('Titular cont', 'Account Holder')}</div>
            <div style={{ fontWeight: 600, color: '#0f172a' }}>{statementDetails?.account_holder || '-'}</div>
          </div>
          <div id="statement-detail-account-number">
            <div style={{ fontSize: 12, color: '#64748b' }}>{t('Numar cont', 'Account Number')}</div>
            <div style={{ fontWeight: 600, color: '#0f172a' }}>{statementDetails?.account_number || '-'}</div>
          </div>
          <div id="statement-detail-account-type">
            <div style={{ fontSize: 12, color: '#64748b' }}>{t('Tip cont', 'Account Type')}</div>
            <div style={{ fontWeight: 600, color: '#0f172a' }}>{statementDetails?.account_type || '-'}</div>
          </div>
          <div id="statement-detail-statement-period">
            <div style={{ fontSize: 12, color: '#64748b' }}>{t('Perioada extras', 'Statement Period')}</div>
            <div style={{ fontWeight: 600, color: '#0f172a' }}>{statementDetails?.statement_period || '-'}</div>
          </div>
        </div>
      </section>
      
      <div className="top-cards-grid">
        <div id="card-categories" style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>{t('Categorii', 'Categories')}</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <select id="select-categories-direction" value={direction} onChange={e => setDirection(e.target.value as any)} style={{ padding: 8, borderRadius: 10, border: '1px solid #bbb', minWidth: 160 }}>
              <option value="debit">{t('Cheltuieli (debit)', 'Expenses (debits)')}</option>
              <option value="credit">{t('Venituri (credit)', 'Income (credits)')}</option>
              <option value="All">{t('Toate', 'All')}</option>
            </select>
            <select id="select-categories-filter" value={category} onChange={e => setCategory(e.target.value)} style={{ padding: 8, borderRadius: 10, border: '1px solid #bbb', minWidth: 160 }}>
              <option value="All">{t('Toate categoriile', 'All categories')}</option>
              {sortedCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                id="btn-open-category-modal"
                className="app-btn"
                onClick={() => setIsCategoryModalOpen(true)}
                title={t('Adauga/Sterge/Editeaza categoria', 'Add/Remove/Edit Category')}
                style={{
                  width: 36,
                  height: 36,
                  padding: 0,
                  borderRadius: 10,
                  border: '1px solid #d1dbe8',
                  background: '#ffffff',
                  color: '#1f2937',
                  fontWeight: 700,
                  fontSize: 18,
                  lineHeight: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {'\u271A'}
              </button>
                                                        <button
                id="btn-default-settings"
                className="app-btn"
                onClick={() => { void handleResetSettings() }}
                title={t('Reseteaza categoriile la valorile implicite', 'Reset Categories to initial/default name values')}
                disabled={!canResetCategories}
                style={{
                  width: 36,
                  height: 36,
                  padding: 0,
                  borderRadius: 10,
                  border: '1px solid #d1dbe8',
                  background: '#ffffff',
                  color: '#1f2937',
                  fontWeight: 700,
                  fontSize: 18,
                  lineHeight: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {'\u21B6'}
              </button>
              
            </div>
          </div>

          <div className="categories-content-grid" style={{ minHeight: 210 }}>
            <div className="categories-legend-pane" style={{ borderRight: '1px solid #eef2f7', paddingRight: 12 }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                {t('Legenda', 'Legend')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2, maxHeight: 210, overflowY: 'auto' }}>
                {categoryLegend.map(item => (
                  <div
                    key={item.name}
                    onClick={() => onLegendRowClick(item.name)}
                    onMouseEnter={() => {
                      setHoveredLegendCategory(item.name)
                      dispatchPieHover(item.name)
                    }}
                    onMouseLeave={() => {
                      setHoveredLegendCategory(prev => (prev === item.name ? null : prev))
                      clearPieHover()
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      fontSize: 12,
                      cursor: 'pointer',
                      borderRadius: 8,
                      padding: '3px 6px',
                      background:
                        chartFocusCategory === item.name
                          ? '#eff6ff'
                          : hoveredLegendCategory === item.name
                            ? '#f8fafc'
                            : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, display: 'inline-block' }} />
                      <span style={{ color: '#334155' }}>{item.name}</span>
                    </div>
                    <div style={{ color: '#475569' }}>
                      {formatRON(item.value)} ({item.percent.toFixed(1)}%)
                    </div>
                  </div>
                ))}
                {!categoryLegend.length && (
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{t('Nu exista date de categorii pentru filtrele curente.', 'No category data for current filters.')}</div>
                )}
              </div>
            </div>
            <div style={{ height: '100%', minHeight: 210 }}>
              <ReactECharts
                ref={categoriesChartRef}
                option={categoriesPieOption}
                style={{ width: '100%', height: '100%' }}
                onEvents={{
                  click: (params: any) => onPieCategoryClick({ name: params?.name }),
                }}
              />
            </div>
          </div>
        </div>

        <div id="card-top-merchants" style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginTop: 0 }}>{t('Top Comercianti', 'Top Merchants')}</h3>
          <div style={{ position: 'relative', minWidth: 0, marginBottom: 8 }}>
            <span
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
                fontSize: 13,
                pointerEvents: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
                <line x1="16.2" y1="16.2" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={t('Cauta comerciant / tip...', 'Search merchant / type...')}
              style={{ padding: '8px 8px 8px 30px', borderRadius: 10, border: '1px solid #bbb', width: '100%', minWidth: 0, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ flex: 1, minHeight: 210 }}>
            <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 20px', columnGap: 10, rowGap: 0 }}>
              <div style={{ gridColumn: 1, gridRow: 1, borderRight: '1px solid #e2e8f0', paddingRight: 10, minWidth: 0, display: 'grid', gridTemplateRows: `repeat(${Math.max(topMerchants.length, 1)}, minmax(0, 1fr))` }}>
                {topMerchants.map((m, idx) => (
                  <OverflowTitleText
                    key={`top-merchant-label-${idx}`}
                    text={m.name}
                    style={{
                      alignSelf: 'center',
                      fontSize: 11,
                      color: '#324154',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      cursor: 'pointer',
                      fontWeight: chartFocusMerchant === m.name ? 700 : 400,
                    }}
                    onMouseEnter={() => setHoveredTopMerchant(m.name)}
                    onMouseLeave={() => setHoveredTopMerchant(prev => (prev === m.name ? null : prev))}
                    onClick={() => setChartFocusMerchant(prev => (prev === m.name ? null : m.name))}
                  />
                ))}
                {!topMerchants.length && (
                  <div style={{ alignSelf: 'center', fontSize: 12, color: '#94a3b8' }}>{t('Nu exista date pentru comercianti.', 'No merchant data.')}</div>
                )}
              </div>
              <div style={{ gridColumn: 1, gridRow: 2, borderRight: '1px solid #e2e8f0' }} />
              <div style={{ gridColumn: 2, gridRow: '1 / span 2', minWidth: 0 }}>
                <ReactECharts
                  option={topMerchantsOption}
                  style={{ width: '100%', height: '100%', cursor: 'pointer' }}
                  onEvents={{
                    click: (params: any) => {
                      const merchant = String(params?.data?.merchant ?? '')
                      if (!merchant) return
                      setChartFocusMerchant(prev => (prev === merchant ? null : merchant))
                    },
                    mouseover: (params: any) => {
                      const merchant = String(params?.data?.merchant ?? '')
                      setHoveredTopMerchant(merchant || null)
                    },
                    mouseout: () => {
                      setHoveredTopMerchant(null)
                    },
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div id="card-income-expenses-savings" style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginTop: 0 }}>{t('Sumar Balanta', 'Balance Overview')}</h3>
          <div style={{ marginBottom: 8, fontSize: 12, color: '#334155' }}>
            <div>{t('Diferenta neta:', 'Net difference:')} <strong>{formatRON(incomeVsExpenses.summary.difference)}</strong></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <span>{t('Economii nete:', 'Savings net:')} <strong>{formatRON(incomeVsExpenses.summary.savings)}</strong></span>
              <div style={{ width: 1, height: 18, background: '#dbe4ef' }} />
              <button
                id="btn-open-savings-accounts-modal"
                className="app-btn"
                onClick={() => setIsSavingsAccountsModalOpen(true)}
                style={{
                  width: 28,
                  height: 28,
                  padding: 0,
                  borderRadius: 8,
                  border: '1px solid #d1dbe8',
                  background: '#fff',
                  color: '#1f2937',
                  fontWeight: 700,
                  fontSize: 16,
                  lineHeight: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title={t('Adauga cont de economii', 'Add savings account')}
              >
                {'\u271A'}
              </button>
            </div>
          </div>
          <div style={{ height: '100%', minHeight: 170 }}>
            <ReactECharts
              option={incomeVsExpensesOption}
              style={{ width: '100%', height: '100%', cursor: 'pointer' }}
              onEvents={{
                click: (params: any) => {
                  const barType = String(params?.name ?? params?.data?.type ?? '')
                  if (barType === 'Income' || barType === 'Expenses' || barType === 'Savings') {
                    onIncomeExpensesBarClick({ type: barType })
                  }
                },
              }}
            />
          </div>
        </div>
      </div>

      <div id="card-transactions" style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12, marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>{t('Tranzactii', 'Transactions')}</h3>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
          {t('Treci cu mouse-ul peste un rand pentru detaliile complete din PDF.', 'Hover any row to see full transaction details from the PDF.')}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ position: 'relative', minWidth: 260 }}>
            <span
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
                fontSize: 13,
                pointerEvents: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
                <line x1="16.2" y1="16.2" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <input
              value={tableQuery}
              onChange={e => setTableQuery(e.target.value)}
              placeholder={t('Filtreaza tabelul...', 'Filter table...')}
              style={{ padding: '8px 8px 8px 30px', borderRadius: 10, border: '1px solid #bbb', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <select
            id="select-transactions-filter-field"
            value={tableQueryField}
            onChange={e => setTableQueryField(e.target.value as ('all' | SortColumn))}
            style={{ padding: 8, borderRadius: 10, border: '1px solid #bbb' }}
            title={tableQueryField === 'all' ? t('Sunt incluse si detaliile complete ale tranzactiei', 'Full transaction details included') : undefined}
          >
            <option value="all">{t('Toate coloanele', 'All columns')}</option>
            <option value="date">{t('Data', 'Date')}</option>
            <option value="merchant">{t('Comerciant', 'Merchant')}</option>
            <option value="type">{t('Tip', 'Type')}</option>
            <option value="category">{t('Categorie', 'Category')}</option>
            <option value="amount">{t('Suma', 'Amount')}</option>
          </select>
          <div style={{ width: 1, height: 26, background: '#dbe4ef' }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
            <span>{t('Salveaza categoria pentru:', 'Save category for:')}</span>
          </div>
          <select
            id="select-transactions-category-change-mode"
            value={categoryChangeMode}
            onChange={e => setCategoryChangeMode(e.target.value as 'merchant_type' | 'single_transaction')}
            style={{ padding: 8, borderRadius: 10, border: '1px solid #bbb' }}
            title={
              categoryChangeMode === 'merchant_type'
                ? t(
                    'Comerciant + Tip: schimbarea pe un rand se aplica tuturor tranzactiilor cu acelasi Comerciant si Tip.',
                    'Merchant + Type: changing one row applies category to all transactions with same Merchant and Type.'
                  )
                : t(
                    'Tranzactie individuala: schimbarea pe un rand se aplica doar acelei tranzactii.',
                    'Single Transaction: changing one row applies category only to that exact transaction.'
                  )
            }
          >
            <option
              value="merchant_type"
              title={t(
                'Schimbarea pe un rand se aplica tuturor tranzactiilor cu acelasi Comerciant si Tip.',
                'Changing one row applies category to all transactions with same Merchant and Type.'
              )}
            >
              {t('Comerciant + Tip', 'Merchant + Type')}
            </option>
            <option
              value="single_transaction"
              title={t(
                'Schimbarea pe un rand se aplica doar acelei tranzactii.',
                'Changing one row applies category only to that exact transaction.'
              )}
            >
              {t('Tranzactie individuala', 'Single Transaction')}
            </option>
          </select>
          <div style={{ width: 1, height: 26, background: '#dbe4ef' }} />
          <div style={{ color: '#64748b', fontSize: 12 }}>
            {t('Tranzactii', 'Transactions')}: {tableRows.length} | {t('Suma totala', 'Amount Sum')}: {formatRON(tableAmountSum)}
          </div>
          <button
            id="btn-export-csv"
            className="app-btn"
            onClick={onExportCsv}
            disabled={!canExport}
            style={{
              marginLeft: 'auto',
              padding: '8px 12px',
              borderRadius: 10,
              border: 'none',
              background: canExport ? 'linear-gradient(135deg, #0ea5e9, #2563eb)' : '#d6dce5',
              color: canExport ? '#fff' : '#49566a',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              boxShadow: canExport ? '0 6px 16px rgba(37,99,235,0.25)' : 'none',
            }}
          >
            {t('Export CSV (filtrat)', 'Export CSV (filtered)')}
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 120 }} />
              <col style={{ width: 300 }} />
              <col style={{ width: 300 }} />
              <col style={{ width: categoryCellWidth }} />
              <col style={{ width: 150 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px 6px' }}>
                  <button id="btn-sort-date" className="app-btn" onClick={() => toggleSort('date')} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontWeight: 600 }}>
                    {t('Data', 'Date')} {sortIndicator('date')}
                  </button>
                </th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px 6px' }}>
                  <button id="btn-sort-merchant" className="app-btn" onClick={() => toggleSort('merchant')} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontWeight: 600 }}>
                    {t('Comerciant', 'Merchant')} {sortIndicator('merchant')}
                  </button>
                </th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px 6px' }}>
                  <button id="btn-sort-type" className="app-btn" onClick={() => toggleSort('type')} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontWeight: 600 }}>
                    {t('Tip', 'Type')} {sortIndicator('type')}
                  </button>
                </th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px 6px', width: categoryCellWidth, minWidth: categoryCellWidth, maxWidth: categoryCellWidth }}>
                  <button id="btn-sort-category" className="app-btn" onClick={() => toggleSort('category')} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontWeight: 600 }}>
                    {t('Categorie', 'Category')} {sortIndicator('category')}
                  </button>
                </th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #eee', padding: '8px 6px' }}>
                  <button id="btn-sort-amount" className="app-btn" onClick={() => toggleSort('amount')} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontWeight: 600 }}>
                    {t('Suma', 'Amount')} {sortIndicator('amount')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((tx, idx) => (
                <tr
                  key={idx}
                  onMouseOver={() => setHoveredRowKey(`${tx.date}-${idx}`)}
                  onMouseEnter={(e) => {
                    setHoveredDetails(null)
                    scheduleHover(getDetailsText(tx), e.clientX, e.clientY)
                  }}
                  onMouseMove={(e) => {
                    const detailsText = getDetailsText(tx)
                    if (hoverDraftRef.current && hoverDraftRef.current.text === detailsText) {
                      hoverDraftRef.current = {
                        ...hoverDraftRef.current,
                        x: e.clientX,
                        y: e.clientY,
                      }
                    }
                    setHoveredDetails(prev => (
                      prev && prev.text === detailsText
                        ? { ...prev, x: e.clientX, y: e.clientY }
                        : prev
                    ))
                  }}
                  onMouseLeave={() => {
                    setHoveredRowKey(null)
                    clearHoverTimer()
                    hoverDraftRef.current = null
                    setHoveredDetails(null)
                  }}
                  style={{
                    borderBottom: '2px solid #d6e1ee',
                    background: hoveredRowKey === `${tx.date}-${idx}` ? '#f4f7fb' : '#ffffff',
                    transition: 'background-color 120ms ease',
                  }}
                >
                  <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{formatDateDDMMYYYY(tx.date)}</td>
                  <td style={{ padding: '8px 6px', width: 300, minWidth: 300, maxWidth: 300 }}>
                    <OverflowTitleText text={tx.merchant} style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} />
                    <div style={{ fontSize: 12, color: '#666' }}>{tx.method ?? ''}</div>
                  </td>
                  <td style={{ padding: '8px 6px', width: 300, minWidth: 300, maxWidth: 300 }}>
                    <OverflowTitleText text={tx.title} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} />
                  </td>
                  <td style={{ padding: '8px 6px', width: categoryCellWidth, minWidth: categoryCellWidth, maxWidth: categoryCellWidth }}>
                    <select
                      id={`select-transaction-category-${idx}`}
                      value={tx.category ?? 'Other'}
                      onChange={(e) => (
                        categoryChangeMode === 'merchant_type'
                          ? onOverrideMerchant(tx.merchant, tx.title, e.target.value)
                          : onOverrideTransaction(tx, e.target.value)
                      )}
                      style={{ padding: 6, borderRadius: 10, border: '1px solid #bbb', width: categoryColumnWidth, maxWidth: '100%', boxSizing: 'border-box' }}
                    >
                      {sortedCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#666',
                        marginTop: 4,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {categoryChangeMode === 'merchant_type'
                        ? t('Seteaza categoria per comerciant + tip', 'Set category per merchant + type')
                        : t('Seteaza categoria doar pentru aceasta tranzactie', 'Set category only for this transaction')}
                    </div>
                  </td>
                  <td style={{ padding: '8px 6px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {formatRON(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {hoveredDetails && (
        <div
          style={{
            position: 'fixed',
            left: hoveredDetails.x + 12,
            top: hoveredDetails.y + 12,
            zIndex: 9999,
            background: '#0f172a',
            color: '#f8fafc',
            borderRadius: 10,
            border: '1px solid #334155',
            padding: '10px 12px',
            maxWidth: 520,
            maxHeight: 320,
            overflowY: 'auto',
            boxShadow: '0 16px 32px rgba(2, 6, 23, 0.35)',
            fontSize: 12,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            pointerEvents: 'none',
          }}
        >
          {hoveredDetails.text}
        </div>
      )}
      {isCategoryModalOpen && (
        <div
          id="modal-category-overlay"
          onClick={() => {
            setIsCategoryModalOpen(false)
            onCancelRenameCategory()
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            id="modal-category-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 620,
              background: '#ffffff',
              borderRadius: 14,
              border: '1px solid #d9e2ec',
              boxShadow: '0 22px 46px rgba(15,23,42,0.25)',
              padding: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h4 style={{ margin: 0 }}>{t('Adauga / Editeaza categorie', 'Add / Edit category')}</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  id="btn-close-category-modal"
                  className="app-btn"
                  onClick={() => {
                    setIsCategoryModalOpen(false)
                    onCancelRenameCategory()
                  }}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: '1px solid #d9e2ec',
                    background: '#fff',
                    color: '#334155',
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  x
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  value={newCategory}
                  onChange={e => onNewCategoryChange(e.target.value)}
                  placeholder={t('Nume categorie noua...', 'New category name...')}
                  style={{ padding: 8, borderRadius: 10, border: '1px solid #bbb', minWidth: 240, flex: 1 }}
                />
                                                                <button
                  id="btn-add-category"
                  className="app-btn"
                  onClick={() => { void handleAddCategoryClick() }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(135deg, #06b6d4, #0284c7)',
                    color: '#fff',
                    fontWeight: 600,
                    minWidth: 96,
                  }}
                >
                  {t('Adauga', 'Add')}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  id="select-category-modal-target"
                  value={selectedCategory}
                  onChange={e => onSelectedCategoryChange(e.target.value)}
                  style={{ padding: 8, borderRadius: 10, border: '1px solid #bbb', minWidth: 240, flex: 1 }}
                >
                  <option value="">{t('Selecteaza o categorie...', 'Select a category...')}</option>
                  {sortedCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                {!!selectedCategory && editingCategory !== selectedCategory && (
                  <>
                    <button
                      id={`btn-start-rename-${toSafeId(selectedCategory)}`}
                      className="app-btn"
                      onClick={() => onStartRenameCategory(selectedCategory)}
                      disabled={selectedCategory === 'Other'}
                      style={{
                        padding: '7px 11px',
                        borderRadius: 10,
                        border: '1px solid #c9d3e0',
                        background: '#ffffff',
                        color: '#243447',
                        opacity: selectedCategory === 'Other' ? 0.5 : 1,
                      }}
                    >
                      {t('Redenumeste', 'Rename')}
                    </button>
                                                                                <button
                      id={`btn-delete-category-${toSafeId(selectedCategory)}`}
                      className="app-btn"
                      onClick={() => { void handleDeleteCategoryClick(selectedCategory) }}
                      disabled={selectedCategory === 'Other'}
                      style={{
                        padding: '7px 11px',
                        borderRadius: 10,
                        border: '1px solid #f3c7d1',
                        background: '#fff1f2',
                        color: '#be123c',
                        opacity: selectedCategory === 'Other' ? 0.5 : 1,
                        minWidth: 96,
                      }}
                    >
                      {t('Sterge', 'Delete')}
                    </button>
                  </>
                )}
              </div>

              {!!selectedCategory && editingCategory === selectedCategory && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    value={editingValue}
                    onChange={e => onEditingValueChange(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') onApplyRenameCategory()
                      if (e.key === 'Escape') onCancelRenameCategory()
                    }}
                    style={{ padding: 8, borderRadius: 10, border: '1px solid #bbb', minWidth: 240, flex: 1 }}
                    autoFocus
                  />
                                                                        <button
                    id="btn-save-category-rename"
                    className="app-btn"
                    onClick={() => { void handleApplyRenameCategoryClick() }}
                    style={{
                      padding: '7px 11px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                      color: '#fff',
                      fontWeight: 600,
                      minWidth: 96,
                    }}
                  >
                    {t('Salveaza', 'Save')}
                  </button>
                  <button
                    id="btn-cancel-category-rename"
                    className="app-btn"
                    onClick={onCancelRenameCategory}
                    style={{
                      padding: '7px 11px',
                      borderRadius: 10,
                      border: '1px solid #c9d3e0',
                      background: '#f8fafc',
                      color: '#243447',
                    }}
                  >
                    {t('Anuleaza', 'Cancel')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {isSavingsAccountsModalOpen && (
        <div
          id="modal-savings-accounts-overlay"
          onClick={() => setIsSavingsAccountsModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            id="modal-savings-accounts-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 620,
              background: '#ffffff',
              borderRadius: 14,
              border: '1px solid #d9e2ec',
              boxShadow: '0 22px 46px rgba(15,23,42,0.25)',
              padding: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h4 style={{ margin: 0 }}>{t('Conturi de economii', 'Savings Accounts')}</h4>
              <button
                id="btn-close-savings-accounts-modal"
                className="app-btn"
                onClick={() => setIsSavingsAccountsModalOpen(false)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: '1px solid #d9e2ec',
                  background: '#fff',
                  color: '#334155',
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                x
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 10, lineHeight: 1.35 }}>
              {t(
                'Toate IBAN-urile adaugate in aceasta lista sunt considerate conturi de economii. Tranzactiile din extras care contin aceste conturi sunt folosite pentru calculul economiilor nete.',
                'All IBANs added to this list are treated as savings accounts. Transactions from the uploaded statement that contain these accounts are used to calculate the net savings amount.'
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <input
                id="input-savings-account"
                value={newSavingsAccount}
                onChange={e => setNewSavingsAccount(e.target.value)}
                placeholder={t('IBAN cont economii', 'Savings account IBAN')}
                style={{ padding: 8, borderRadius: 10, border: '1px solid #bbb', minWidth: 240, flex: 1 }}
              />
                                                        <button
                id="btn-add-savings-account"
                className="app-btn"
                onClick={() => { void handleAddSavingsAccount() }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #06b6d4, #0284c7)',
                  color: '#fff',
                  fontWeight: 600,
                  minWidth: 96,
                }}
              >
                {t('Adauga', 'Add')}
              </button>
            </div>

            <div style={{ display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
              {savingsAccounts.map(account => (
                <div
                  key={account}
                  className={highlightedSavingsAccount === account ? 'savings-account-highlight' : undefined}
                  style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 10px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>{account}</span>
                                                                                <button
                      id={`btn-delete-savings-account-${toSafeId(account)}`}
                      className="app-btn"
                      onClick={() => { void handleDeleteSavingsAccount(account) }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: '1px solid #f3c7d1',
                        background: '#fff1f2',
                        color: '#be123c',
                        fontWeight: 600,
                        minWidth: 96,
                      }}
                    >
                      {t('Sterge', 'Delete')}
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: '#334155' }}>
                    {t('Tranzactii', 'Transactions')}: <strong>{savingsAccountSummaries[account]?.count ?? 0}</strong> {' '}
                    {t('Intrari', 'In')}: <strong>{formatRON(savingsAccountSummaries[account]?.inTotal ?? 0)}</strong> {' '}
                    {t('Iesiri', 'Out')}: <strong>{formatRON(savingsAccountSummaries[account]?.outTotal ?? 0)}</strong> {' '}
                    Net: <strong>{formatRON(savingsAccountSummaries[account]?.net ?? 0)}</strong>
                  </div>
                </div>
              ))}
              {!savingsAccounts.length && (
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {t('Nu exista conturi de economii adaugate.', 'No savings accounts added.')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {financeModalMeta && (
        <div
          id="modal-finance-overlay"
          onClick={() => setFinanceModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 9998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            id={`modal-finance-card-${financeModal ?? 'unknown'}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 1000,
              maxHeight: '82vh',
              overflow: 'hidden',
              background: '#ffffff',
              borderRadius: 14,
              border: '1px solid #d9e2ec',
              boxShadow: '0 22px 46px rgba(15,23,42,0.25)',
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ position: 'sticky', top: 0, zIndex: 6, background: '#fff', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h4 style={{ margin: 0 }}>{financeModalMeta.title}</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    id="btn-export-finance-modal-csv"
                    className="app-btn"
                    onClick={onExportFinanceModalCsv}
                    disabled={!financeModalMeta.rows.length}
                    style={{
                      padding: '7px 11px',
                      borderRadius: 10,
                      border: 'none',
                      background: financeModalMeta.rows.length ? 'linear-gradient(135deg, #0ea5e9, #2563eb)' : '#d6dce5',
                      color: financeModalMeta.rows.length ? '#fff' : '#49566a',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {t('Export CSV', 'Export CSV')}
                  </button>
                  <button
                    id="btn-close-finance-modal"
                    className="app-btn"
                    onClick={() => setFinanceModal(null)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: '1px solid #d9e2ec',
                      background: '#fff',
                      color: '#334155',
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    x
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#334155' }}>
                <div>{t('Tranzactii', 'Transactions')}: <strong>{financeModalMeta.rows.length}</strong></div>
                {financeModal === 'savings' ? (
                  <>
                    <div>{t('Intrari economii', 'Savings In')}: <strong>{formatRON(savingsInTotal)}</strong></div>
                    <div>{t('Iesiri economii', 'Savings Out')}: <strong>{formatRON(savingsOutTotal)}</strong></div>
                    <div>{t('Net', 'Net')}: <strong>{formatRON(savingsNetTotal)}</strong></div>
                  </>
                ) : (
                  <div>{t('Total', 'Total')}: <strong>{formatRON(financeModalMeta.total)}</strong></div>
                )}
              </div>
            </div>

            <div style={{ overflow: 'auto', minHeight: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: '8px 6px', position: 'sticky', top: 0, background: '#fff', zIndex: 5 }}>{t('Data', 'Date')}</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: '8px 6px', position: 'sticky', top: 0, background: '#fff', zIndex: 5 }}>{t('Comerciant', 'Merchant')}</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: '8px 6px', position: 'sticky', top: 0, background: '#fff', zIndex: 5 }}>{t('Tip', 'Type')}</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: '8px 6px', position: 'sticky', top: 0, background: '#fff', zIndex: 5 }}>{t('Categorie', 'Category')}</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: '8px 6px', position: 'sticky', top: 0, background: '#fff', zIndex: 5 }}>{t('Directie', 'Direction')}</th>
                    {financeModalMeta.showFlow && (
                      <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: '8px 6px', position: 'sticky', top: 0, background: '#fff', zIndex: 5 }}>{t('Flux economii', 'Savings Flow')}</th>
                    )}
                    <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: '8px 6px', position: 'sticky', top: 0, background: '#fff', zIndex: 5 }}>{t('Suma', 'Amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(financeModalMeta.rows as any[]).map((r, idx) => (
                    <tr key={`${r.date}-${r.merchant}-${idx}`} style={{ borderBottom: '1px solid #eef2f7' }}>
                      <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{formatDateDDMMYYYY(r.date)}</td>
                      <td style={{ padding: '8px 6px' }}>{r.merchant}</td>
                      <td style={{ padding: '8px 6px' }}>{r.type}</td>
                      <td style={{ padding: '8px 6px' }}>{r.category ?? 'Other'}</td>
                      <td style={{ padding: '8px 6px', textTransform: 'capitalize' }}>{r.direction}</td>
                      {financeModalMeta.showFlow && (
                        <td style={{ padding: '8px 6px' }}>{r.flow}</td>
                      )}
                      <td style={{ padding: '8px 6px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {formatRON(r.amountAbs)}
                      </td>
                    </tr>
                  ))}
                  {!financeModalMeta.rows.length && (
                    <tr>
                      <td colSpan={financeModalMeta.showFlow ? 7 : 6} style={{ padding: '10px 6px', color: '#64748b' }}>
                        {t('Nu exista tranzactii pentru aceasta vizualizare.', 'No transactions found for this view.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
