export type TxDirection = 'debit' | 'credit'

export type Transaction = {
  date: string
  title: string
  merchant: string
  method?: string | null
  amount: number | null
  currency: 'RON'
  direction: TxDirection
  category?: string
  raw_lines?: string[]
}

export type StatementDetails = {
  account_holder?: string | null
  account_number?: string | null
  account_type?: string | null
  statement_period?: string | null
}
