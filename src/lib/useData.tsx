import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  accountsApi, categoriesApi, clientsApi, listTransactions, assetsApi,
  investmentsApi, fixedDepositsApi, liabilitiesApi, invoicesApi, budgetsApi,
  goalsApi, listSnapshots, workEntriesApi,
} from './api'
import type {
  Account, Category, Client, Transaction, Asset, Investment, FixedDeposit,
  Liability, Invoice, Budget, Goal, NetworthSnapshot, WorkEntry,
} from './types'
import { useAuth } from './useAuth'

interface DataState {
  accounts: Account[]
  categories: Category[]
  clients: Client[]
  transactions: Transaction[]
  assets: Asset[]
  investments: Investment[]
  fixedDeposits: FixedDeposit[]
  liabilities: Liability[]
  invoices: Invoice[]
  budgets: Budget[]
  goals: Goal[]
  snapshots: NetworthSnapshot[]
  workEntries: WorkEntry[]
  loading: boolean
  refresh: (key?: DataKey) => Promise<void>
}

type DataKey =
  | 'accounts' | 'categories' | 'clients' | 'transactions' | 'assets'
  | 'investments' | 'fixedDeposits' | 'liabilities' | 'invoices' | 'budgets'
  | 'goals' | 'snapshots' | 'workEntries'

const DataContext = createContext<DataState | null>(null)

const loaders: Record<DataKey, () => Promise<unknown>> = {
  accounts: () => accountsApi.list('name', true),
  categories: () => categoriesApi.list('name', true),
  clients: () => clientsApi.list('name', true),
  transactions: () => listTransactions(),
  assets: () => assetsApi.list('current_value', false),
  investments: () => investmentsApi.list('name', true),
  fixedDeposits: () => fixedDepositsApi.list('maturity_date', true),
  liabilities: () => liabilitiesApi.list('remaining_balance', false),
  invoices: () => invoicesApi.list('due_date', false),
  budgets: () => budgetsApi.list('month', false),
  goals: () => goalsApi.list('target_date', true),
  snapshots: () => listSnapshots(),
  workEntries: () => workEntriesApi.list('created_at', false),
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [state, setState] = useState<Omit<DataState, 'refresh'>>({
    accounts: [], categories: [], clients: [], transactions: [], assets: [],
    investments: [], fixedDeposits: [], liabilities: [], invoices: [],
    budgets: [], goals: [], snapshots: [], workEntries: [], loading: true,
  })

  const refresh = useCallback(async (key?: DataKey) => {
    if (key) {
      const data = await loaders[key]()
      setState((s) => ({ ...s, [key]: data }))
      return
    }
    setState((s) => ({ ...s, loading: true }))
    const keys = Object.keys(loaders) as DataKey[]
    const results = await Promise.all(keys.map((k) => loaders[k]()))
    setState((s) => {
      const next = { ...s, loading: false }
      keys.forEach((k, i) => {
        ;(next as Record<string, unknown>)[k] = results[i]
      })
      return next
    })
  }, [])

  useEffect(() => {
    if (session) refresh()
  }, [session, refresh])

  return <DataContext.Provider value={{ ...state, refresh }}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
