import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/useAuth'
import { DataProvider } from './lib/useData'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import Transactions from './pages/Transactions'
import Portfolio from './pages/Portfolio'
import Budgets from './pages/Budgets'
import Forecast from './pages/Forecast'
import Invoices from './pages/Invoices'
import Businesses from './pages/Businesses'
import Goals from './pages/Goals'
import Subscriptions from './pages/Subscriptions'
import NetWorthDetail from './pages/overview/NetWorthDetail'
import CashFlowDetail from './pages/overview/CashFlowDetail'
import HealthDetail from './pages/overview/HealthDetail'
import ReceivablesDetail from './pages/overview/ReceivablesDetail'

function Gate() {
  const { session, loading } = useAuth()
  if (loading) return <div style={{ padding: 40 }}>Loading…</div>
  if (!session) return <Login />
  return (
    <DataProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/forecast" element={<Forecast />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/businesses" element={<Businesses />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/overview/net-worth" element={<NetWorthDetail />} />
            <Route path="/overview/cash-flow" element={<CashFlowDetail />} />
            <Route path="/overview/health" element={<HealthDetail />} />
            <Route path="/overview/receivables" element={<ReceivablesDetail />} />
          </Route>
        </Routes>
      </HashRouter>
    </DataProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
