export type Owner = 'personal' | 'business'

/** Which of Kasun's businesses a business-owned record belongs to. */
export type Business = 'nexxel' | 'sweet_cocoa'

export interface Account {
  id: string
  name: string
  type: 'bank' | 'cash' | 'wallet' | 'credit_card'
  owner: Owner
  business: Business | null
  currency: string
  balance: number
  credit_limit: number | null
  notes: string | null
  archived: boolean
  created_at: string
}

export interface Category {
  id: string
  name: string
  kind: 'income' | 'expense'
  owner_scope: Owner | 'both'
  zoho_account_id: string | null
  zoho_account_name: string | null
  created_at: string
}

export interface Client {
  id: string
  name: string
  business: Business
  notes: string | null
  zoho_contact_id: string | null
  created_at: string
}

export interface Transaction {
  id: string
  txn_date: string
  account_id: string | null
  category_id: string | null
  amount: number
  description: string | null
  owner: Owner
  business: Business | null
  client_id: string | null
  project_name: string | null
  is_recurring: boolean
  recurring_frequency: 'weekly' | 'monthly' | 'yearly' | null
  source: string
  zoho_expense_id: string | null
  zoho_pushed_at: string | null
  created_at: string
}

export type AssetType =
  | 'property'
  | 'vehicle'
  | 'equipment'
  | 'electronics'
  | 'gold'
  | 'business_asset'
  | 'receivable'
  | 'other'

export interface Asset {
  id: string
  name: string
  type: AssetType
  owner: Owner
  quantity: number
  purchase_price: number | null
  current_value: number
  purchase_date: string | null
  notes: string | null
  created_at: string
}

export type InvestmentType = 'shares' | 'unit_trust' | 'etf' | 'crypto'

export interface Investment {
  id: string
  name: string
  type: InvestmentType
  owner: Owner
  quantity: number
  purchase_price: number
  current_price: number
  purchase_date: string | null
  notes: string | null
  created_at: string
}

export interface FixedDeposit {
  id: string
  bank: string
  owner: Owner
  amount: number
  rate: number
  start_date: string
  maturity_date: string
  expected_interest: number | null
  status: 'active' | 'matured' | 'reinvested' | 'withdrawn'
  notes: string | null
  created_at: string
}

export type LiabilityType =
  | 'personal_loan'
  | 'vehicle_lease'
  | 'mortgage'
  | 'credit_card_balance'
  | 'business_loan'
  | 'supplier_payment'
  | 'owed_to_others'

export interface Liability {
  id: string
  name: string
  type: LiabilityType
  owner: Owner
  principal: number | null
  remaining_balance: number
  interest_rate: number | null
  monthly_payment: number | null
  start_date: string | null
  payoff_date: string | null
  next_due_date: string | null
  notes: string | null
  created_at: string
}

export interface Invoice {
  id: string
  client_id: string | null
  zoho_invoice_id: string | null
  invoice_number: string | null
  amount: number
  balance: number
  status: 'draft' | 'sent' | 'paid' | 'overdue'
  issue_date: string | null
  due_date: string | null
  paid_date: string | null
  notes: string | null
  created_at: string
}

export interface Budget {
  id: string
  category_id: string
  owner: Owner
  month: string
  limit_amount: number
  created_at: string
}

export interface Goal {
  id: string
  name: string
  type: string
  target_amount: number
  target_date: string | null
  current_amount: number
  starting_amount: number
  notes: string | null
  created_at: string
}

export interface GoalContribution {
  id: string
  goal_id: string
  contribution_date: string
  amount: number
  note: string | null
  created_at: string
}

export interface WorkEntry {
  id: string
  client_id: string | null
  work_date: string
  month: string
  description: string
  quantity: number
  rate: number
  amount: number
  status: 'pending' | 'pushed'
  zoho_invoice_id: string | null
  zoho_invoice_number: string | null
  pushed_at: string | null
  notes: string | null
  created_at: string
}

export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface Subscription {
  id: string
  name: string
  amount: number
  billing_cycle: BillingCycle
  next_renewal_date: string
  owner: Owner
  business: Business | null
  category_id: string | null
  account_id: string | null
  status: 'active' | 'cancelled'
  notes: string | null
  zoho_account_id: string | null
  zoho_account_name: string | null
  created_at: string
}

export interface NetworthSnapshot {
  snapshot_date: string
  total_assets: number
  total_liabilities: number
  net_worth: number
  cash_total: number
  created_at: string
}
