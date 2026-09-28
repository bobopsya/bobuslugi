import { Route, Routes } from 'react-router-dom'
import { Layout, RequireAuth, RequireRole } from './components/Layout'
import { isConfigured } from './lib/supabase'
import { AdminPage } from './pages/admin/AdminPage'
import { ApplicationPage } from './pages/cabinet/ApplicationPage'
import { ApplicationsPage } from './pages/cabinet/ApplicationsPage'
import { CabinetPage } from './pages/cabinet/CabinetPage'
import { DocumentsPage } from './pages/cabinet/DocumentsPage'
import { FinesPage } from './pages/cabinet/FinesPage'
import { NotificationsPage } from './pages/cabinet/NotificationsPage'
import { SettingsPage } from './pages/cabinet/SettingsPage'
import { WalletPage } from './pages/cabinet/WalletPage'
import { CountriesPage, CountryPage } from './pages/CountriesPage'
import { ElectionPage, ElectionsPage } from './pages/ElectionsPage'
import { GovApplicationPage } from './pages/gov/GovApplicationPage'
import { GovPage } from './pages/gov/GovPage'
import { HomePage } from './pages/HomePage'
import { LoginPage, RegisterPage } from './pages/AuthPages'
import { LorePage } from './pages/LorePage'
import { NewsItemPage, NewsPage } from './pages/NewsPage'
import { NotFoundPage, SetupPage } from './pages/MiscPages'
import { ServicePage, ServicesPage } from './pages/ServicesPage'
import { VerifyPage } from './pages/VerifyPage'
import { WantedPage } from './pages/WantedPage'

const auth = (el: React.ReactNode) => <RequireAuth>{el}</RequireAuth>

export function App() {
  if (!isConfigured) return <SetupPage />
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="services/:code" element={<ServicePage />} />
        <Route path="news" element={<NewsPage />} />
        <Route path="news/:id" element={<NewsItemPage />} />
        <Route path="elections" element={<ElectionsPage />} />
        <Route path="elections/:id" element={<ElectionPage />} />
        <Route path="wanted" element={<WantedPage />} />
        <Route path="countries" element={<CountriesPage />} />
        <Route path="countries/:code" element={<CountryPage />} />
        <Route path="lore" element={<LorePage />} />
        <Route path="verify" element={<VerifyPage />} />
        <Route path="verify/:number" element={<VerifyPage />} />

        <Route path="cabinet" element={auth(<CabinetPage />)} />
        <Route path="cabinet/documents" element={auth(<DocumentsPage />)} />
        <Route path="cabinet/applications" element={auth(<ApplicationsPage />)} />
        <Route path="cabinet/applications/:id" element={auth(<ApplicationPage />)} />
        <Route path="cabinet/fines" element={auth(<FinesPage />)} />
        <Route path="cabinet/wallet" element={auth(<WalletPage />)} />
        <Route path="cabinet/notifications" element={auth(<NotificationsPage />)} />
        <Route path="cabinet/settings" element={auth(<SettingsPage />)} />

        <Route path="gov" element={auth(<RequireRole><GovPage /></RequireRole>)} />
        <Route path="gov/applications/:id" element={auth(<RequireRole><GovApplicationPage /></RequireRole>)} />

        <Route path="admin" element={auth(<RequireRole admin><AdminPage /></RequireRole>)} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
