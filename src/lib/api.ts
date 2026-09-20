import { supabase } from './supabase'
import type {
  Account, Category, Client, Transaction, Asset, Investment,
  FixedDeposit, Liability, Invoice, Budget, Goal, NetworthSnapshot,
} from './types'

function table<T>(name: string) {
  return {
    async list(orderBy = 'created_at', ascending = false): Promise<T[]> {
      const { data, error } = await supabase.from(name).select('*').order(orderBy, { ascending })
      if (error) throw error
      return (data ?? []) as T[]
    },
    async create(row: Partial<T>): Promise<T> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.from(name).insert(row as any).select().single()
      if (error) throw error
      return data as T
    },
    async update(id: string, row: Partial<T>): Promise<T> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.from(name).update(row as any).eq('id', id).select().single()
      if (error) throw error
      return data as T
    },
    async remove(id: string): Promise<void> {
      const { error } = await supabase.from(name).delete().eq('id', id)
      if (error) throw error
    },
  }
}

export const accountsApi = table<Account>('nw_accounts')
export const categoriesApi = table<Category>('nw_categories')
export const clientsApi = table<Client>('nw_clients')
export const transactionsApi = table<Transaction>('nw_transactions')
export const assetsApi = table<Asset>('nw_assets')
export const investmentsApi = table<Investment>('nw_investments')
export const fixedDepositsApi = table<FixedDeposit>('nw_fixed_deposits')
export const liabilitiesApi = table<Liability>('nw_liabilities')
export const invoicesApi = table<Invoice>('nw_invoices')
export const budgetsApi = table<Budget>('nw_budgets')
export const goalsApi = table<Goal>('nw_goals')

export async function listTransactions(orderBy = 'txn_date', ascending = false): Promise<Transaction[]> {
  const { data, error } = await supabase.from('nw_transactions').select('*').order(orderBy, { ascending })
  if (error) throw error
  return (data ?? []) as Transaction[]
}

export async function upsertSnapshot(row: NetworthSnapshot): Promise<void> {
  const { error } = await supabase.from('nw_networth_snapshots').upsert(row, { onConflict: 'snapshot_date' })
  if (error) throw error
}

export async function listSnapshots(): Promise<NetworthSnapshot[]> {
  const { data, error } = await supabase
    .from('nw_networth_snapshots')
    .select('*')
    .order('snapshot_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as NetworthSnapshot[]
}
