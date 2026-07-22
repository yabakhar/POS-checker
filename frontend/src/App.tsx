import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import ClientLogin from './pages/ClientLogin';
import DashboardLayout from './pages/DashboardLayout';
import DashboardHome from './pages/dashboard/DashboardHome';
import SalesRecapPage from './pages/dashboard/SalesRecapPage';
import SalesByArticlePage from './pages/dashboard/SalesByArticlePage';
import SalesByCategoryPage from './pages/dashboard/SalesByCategoryPage';
import SalesByEmployeePage from './pages/dashboard/SalesByEmployeePage';
import PaymentMethodsPage from './pages/dashboard/PaymentMethodsPage';
import TaxesPage from './pages/dashboard/TaxesPage';
import WorkPeriodsPage from './pages/dashboard/WorkPeriodsPage';
import ReportPlaceholder from './pages/dashboard/ReportPlaceholder';
import RawDataBrowser from './pages/dashboard/RawDataBrowser';
import ClientSettings from './pages/ClientSettings';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<ClientLogin />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute role="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute role="client">
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardHome />} />
          <Route path="reports/recap" element={<SalesRecapPage />} />
          <Route path="reports/articles" element={<SalesByArticlePage />} />
          <Route path="reports/categories" element={<SalesByCategoryPage />} />
          <Route path="reports/employees" element={<SalesByEmployeePage />} />
          <Route path="reports/payment-methods" element={<PaymentMethodsPage />} />
          <Route path="reports/receipts" element={<ReportPlaceholder title="Reçus" />} />
          <Route path="reports/modifiers" element={<ReportPlaceholder title="Ventes par modificateur" />} />
          <Route path="reports/discounts" element={<ReportPlaceholder title="Réductions" />} />
          <Route path="reports/taxes" element={<TaxesPage />} />
          <Route path="reports/work-periods" element={<WorkPeriodsPage />} />
          <Route path="raw" element={<RawDataBrowser />} />
        </Route>
        <Route
          path="/settings"
          element={
            <ProtectedRoute role="client">
              <ClientSettings />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
