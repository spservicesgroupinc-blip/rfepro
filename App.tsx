import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Calculator as CalculatorIcon, 
  FileText, 
  Users, 
  Package, 
  Settings as SettingsIcon,
  Menu,
  X,
  FileDown,
  Printer
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import Calculator from './components/Calculator';
import CRM from './components/CRM';
import Inventory from './components/Inventory';
import Settings from './components/Settings';
import Auth from './components/Auth';
import { ToastProvider } from './components/Toast';
import { NAV_ITEMS } from './constants';
import { getCustomers, getEstimates, getInventory, getSettings, generatePDF, saveEstimate, getUser } from './services/storage';
import { JobStatus, Estimate, User } from './types';

const App: React.FC = () => {
  // --- Data State ---
  const [activeView, setActiveView] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Storage State
  const [user, setUser] = useState<User | null>(getUser());
  const [customers, setCustomers] = useState(getCustomers());
  const [estimates, setEstimates] = useState(getEstimates());
  const [inventory, setInventory] = useState(getInventory());
  const [settings, setSettings] = useState(getSettings());
  const [lastUpdate, setLastUpdate] = useState(Date.now()); // Trigger re-renders

  // --- Effects ---
  useEffect(() => {
    // Refresh data when lastUpdate changes
    setCustomers(getCustomers());
    setEstimates(getEstimates());
    setInventory(getInventory());
    setSettings(getSettings());
    setUser(getUser());
  }, [lastUpdate]);

  const refreshData = () => setLastUpdate(Date.now());

  // --- Job List Component ---
  const JobsList = () => {
    const [filter, setFilter] = useState('All');
    
    const filteredEstimates = estimates.filter(e => {
        if (filter === 'All') return true;
        return e.status === filter;
    });

    const handleStatusChange = (est: Estimate, newStatus: JobStatus) => {
        const updated = { ...est, status: newStatus };
        saveEstimate(updated);
        refreshData();
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
             <h2 className="text-2xl font-bold text-slate-900">Jobs & Estimates</h2>
             <select 
               className="p-2 border rounded-lg bg-white"
               value={filter}
               onChange={(e) => setFilter(e.target.value)}
             >
               <option value="All">All Jobs</option>
               <option value={JobStatus.DRAFT}>Drafts</option>
               <option value={JobStatus.WORK_ORDER}>Work Orders</option>
               <option value={JobStatus.INVOICED}>Invoices</option>
               <option value={JobStatus.PAID}>Paid</option>
               <option value={JobStatus.ARCHIVED}>Archived</option>
             </select>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">Ref #</th>
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEstimates.map(est => {
                  const customer = customers.find(c => c.id === est.customerId);
                  return (
                  <tr key={est.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 font-mono text-slate-600">{est.number}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">{customer?.name || 'Unknown'}</td>
                    <td className="px-6 py-4 text-slate-600">{new Date(est.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-medium text-slate-900">${est.total.toLocaleString()}</td>
                    <td className="px-6 py-4">
                        <select 
                            value={est.status}
                            onChange={(e) => handleStatusChange(est, e.target.value as JobStatus)}
                            className="text-xs rounded-full px-2 py-1 border-0 ring-1 ring-inset ring-slate-200 bg-slate-50 focus:ring-2 focus:ring-brand-500"
                        >
                            {Object.values(JobStatus).map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button 
                         onClick={() => generatePDF(est, customer, settings)}
                         className="text-slate-500 hover:text-brand-600 mx-1" 
                         title="Download PDF"
                        >
                         <FileDown className="w-4 h-4" />
                       </button>
                    </td>
                  </tr>
                )})}
                {filteredEstimates.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-slate-400">No jobs found matching this filter.</td></tr>
                )}
              </tbody>
            </table>
        </div>
      </div>
    );
  };

  // --- Render Active View ---
  const renderContent = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard estimates={estimates} inventory={inventory} onNavigate={setActiveView} />;
      case 'calculator':
        return <Calculator settings={settings} customers={customers} onSave={() => { refreshData(); setActiveView('jobs'); }} />;
      case 'jobs':
        return <JobsList />;
      case 'customers':
        return <CRM customers={customers} onRefresh={refreshData} />;
      case 'inventory':
        return <Inventory items={inventory} onRefresh={refreshData} />;
      case 'settings':
        return <Settings settings={settings} onSave={refreshData} />;
      default:
        return <Dashboard estimates={estimates} inventory={inventory} onNavigate={setActiveView} />;
    }
  };

  const IconComponent = (name: string) => {
    switch (name) {
      case 'LayoutDashboard': return <LayoutDashboard className="w-5 h-5" />;
      case 'Calculator': return <CalculatorIcon className="w-5 h-5" />;
      case 'FileText': return <FileText className="w-5 h-5" />;
      case 'Users': return <Users className="w-5 h-5" />;
      case 'Package': return <Package className="w-5 h-5" />;
      case 'Settings': return <SettingsIcon className="w-5 h-5" />;
      default: return <LayoutDashboard className="w-5 h-5" />;
    }
  };

  if (!user || !user.isAuthenticated) {
    return (
      <ToastProvider>
        <Auth onLogin={refreshData} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900">
        
        {/* Mobile Sidebar Overlay */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-200 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="bg-brand-600 p-2 rounded-lg">
                 <CalculatorIcon className="w-6 h-6 text-white" />
               </div>
               <div>
                 <h1 className="font-bold text-lg leading-tight">SprayFoam<span className="text-brand-500">Pro</span></h1>
                 <p className="text-xs text-slate-400">Estimator & CRM</p>
               </div>
            </div>
            <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden text-slate-400">
              <X className="w-6 h-6" />
            </button>
          </div>

          <nav className="p-4 space-y-1">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveView(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors
                  ${activeView === item.id 
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/50' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }
                `}
              >
                {IconComponent(item.icon)}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="absolute bottom-0 w-full p-4 border-t border-slate-800 bg-slate-900">
              <div className="flex items-center gap-3 px-2">
                  <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold uppercase">
                      {user.username.substring(0,2)}
                  </div>
                  <div>
                      <p className="text-sm font-medium text-white">{user.username}</p>
                      <p className="text-xs text-slate-500">{user.company}</p>
                  </div>
              </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
          {/* Mobile Header */}
          <header className="lg:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between">
            <button onClick={() => setIsMobileMenuOpen(true)} className="text-slate-600">
              <Menu className="w-6 h-6" />
            </button>
            <span className="font-bold text-slate-900">SprayFoam Pro</span>
            <div className="w-6"></div> {/* Spacer */}
          </header>

          {/* View Area */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-8">
              {renderContent()}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
};

export default App;