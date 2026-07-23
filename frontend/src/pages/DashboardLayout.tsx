import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard, ChartColumn, Database, Settings, Sun, Moon, LogOut, Monitor, ChevronRight,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter,
  SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  SidebarInset, SidebarTrigger,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { TooltipProvider } from '@/components/ui/tooltip';

// Hidden from the drawer until each report actually ships — uncomment as they're built.
const REPORT_ITEMS = [
  { label: 'Récapitulatif des ventes', path: '/dashboard/reports/recap' },
  { label: 'Ventes par article', path: '/dashboard/reports/articles' },
  { label: 'Ventes par catégorie', path: '/dashboard/reports/categories' },
  { label: 'Ventes par employé', path: '/dashboard/reports/employees' },
  { label: 'Mode de paiement', path: '/dashboard/reports/payment-methods' },
  // { label: 'Reçus', path: '/dashboard/reports/receipts' },
  // { label: 'Ventes par modificateur', path: '/dashboard/reports/modifiers' },
  // { label: 'Réductions', path: '/dashboard/reports/discounts' },
  // { label: 'Taxes', path: '/dashboard/reports/taxes' },
  { label: 'Périodes de travail', path: '/dashboard/reports/work-periods' },
  { label: 'Mouvements de caisse', path: '/dashboard/reports/cash-movements' },
];

function AppSidebar() {
  const location = useLocation();
  const isDashboardHome = location.pathname === '/dashboard';
  const isRaw = location.pathname === '/dashboard/raw';
  const isReportsRoute = location.pathname.startsWith('/dashboard/reports');
  const [reportsOpen, setReportsOpen] = useState(isReportsRoute);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Monitor className="h-4 w-4" />
          </div>
          <span className="font-heading text-sm font-semibold tracking-tight">POS Checker</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Tab 1 — Tableau de bord: no children, clicking navigates directly. */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isDashboardHome}>
                  <Link to="/dashboard">
                    <LayoutDashboard />
                    <span>Tableau de bord</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Tab 2 — Rapports et analyses: has children, clicking toggles expand/collapse
                  instead of navigating (there's no page at this level, only its children). */}
              <Collapsible open={reportsOpen} onOpenChange={setReportsOpen} className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={isReportsRoute && !reportsOpen}>
                      <ChartColumn />
                      <span>Rapports et analyses</span>
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {REPORT_ITEMS.map((item) => (
                        <SidebarMenuSubItem key={item.path}>
                          <SidebarMenuSubButton asChild isActive={location.pathname === item.path}>
                            <Link to={item.path}>
                              <span className="truncate">{item.label}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Données brutes: pinned to the bottom of the drawer, separate from the main nav. */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isRaw}>
              <Link to="/dashboard/raw">
                <Database />
                <span>Données brutes</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function DashboardLayout() {
  const navigate = useNavigate();
  const { dark, toggle } = useTheme();
  const username = localStorage.getItem('username');

  const logout = () => { localStorage.clear(); navigate('/login'); };

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-3 sm:px-5">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="hidden sm:inline text-sm text-muted-foreground mr-1">{username}</span>
              <Button variant="outline" size="sm" onClick={() => navigate('/settings')} className="hidden sm:inline-flex">
                <Settings /> Paramètres
              </Button>
              <Button variant="outline" size="icon" onClick={toggle} title={dark ? 'Mode clair' : 'Mode sombre'}>
                {dark ? <Sun /> : <Moon />}
              </Button>
              <Button variant="outline" size="sm" onClick={logout}>
                <LogOut /> <span className="hidden sm:inline">Déconnexion</span>
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
