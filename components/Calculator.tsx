import React, { useState, useEffect } from 'react';
import { AppSettings, Customer, Estimate, FoamType, JobStatus, JobItem, JobLocation } from '../types';
import { Save, RefreshCw, Plus, Calculator as CalcIcon, MapPin, Camera, Eye, EyeOff, X } from 'lucide-react';
import { saveEstimate } from '../services/storage';
import { useToast } from './Toast';

interface CalculatorProps {
  settings: AppSettings;
  customers: Customer[];
  onSave: () => void;
}

const Calculator: React.FC<CalculatorProps> = ({ settings, customers, onSave }) => {
  const { showToast } = useToast();

  // --- State ---
  const [activeTab, setActiveTab] = useState<'building' | 'walls' | 'flat'>('building');
  const [showPricing, setShowPricing] = useState(true);
  
  // Job Info
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [jobName, setJobName] = useState('');
  const [location, setLocation] = useState<JobLocation | undefined>(undefined);
  const [images, setImages] = useState<string[]>([]);
  
  // Dimensions
  const [length, setLength] = useState(0);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(8);
  const [pitch, setPitch] = useState(0);
  const [isGable, setIsGable] = useState(true);
  
  // Foam Specs
  const [wallFoamType, setWallFoamType] = useState<FoamType>(FoamType.OPEN_CELL);
  const [wallThickness, setWallThickness] = useState(3.5);
  const [roofFoamType, setRoofFoamType] = useState<FoamType>(FoamType.OPEN_CELL);
  const [roofThickness, setRoofThickness] = useState(5.5);
  const [wastePct, setWastePct] = useState(10);
  
  // Pricing
  const [laborHours, setLaborHours] = useState(0);
  const [tripCharge, setTripCharge] = useState(0);
  const [miscItems, setMiscItems] = useState<JobItem[]>([]);

  // Results State
  const [results, setResults] = useState({
    wallArea: 0,
    roofArea: 0,
    totalBFOpen: 0,
    totalBFClosed: 0,
    setsOpen: 0,
    setsClosed: 0,
    materialCost: 0,
    laborCost: 0,
    subtotal: 0,
    tax: 0,
    total: 0
  });

  // --- Calculations ---
  useEffect(() => {
    let wArea = 0;
    let rArea = 0;

    // 1. Geometry
    if (activeTab === 'building') {
      // Simple Box Model
      wArea = (length + width) * 2 * height;
      
      // Roof with pitch
      const pitchFactor = Math.sqrt(Math.pow(12, 2) + Math.pow(pitch, 2)) / 12;
      const flatRoofArea = length * width;
      rArea = flatRoofArea * pitchFactor;

      if (isGable) {
         const rise = (pitch / 12) * (width / 2);
         const oneGableArea = 0.5 * width * rise;
         wArea += (oneGableArea * 2); 
      }
    } else if (activeTab === 'walls') {
      wArea = length * height; // Here Length is linear footage
      rArea = 0;
    } else if (activeTab === 'flat') {
      rArea = length * width; // Treat flat area as "Roof/Ceiling" logic
      wArea = 0;
    }

    // 2. Board Feet & Sets
    const wBF = wArea * wallThickness;
    const rBF = rArea * roofThickness;
    
    // Add waste
    const wasteMult = 1 + (wastePct / 100);
    const totalWBF = wBF * wasteMult;
    const totalRBF = rBF * wasteMult;

    let bfOpen = 0;
    let bfClosed = 0;

    // Assign to type
    if (activeTab !== 'flat') {
      if (wallFoamType === FoamType.OPEN_CELL) bfOpen += totalWBF; else bfClosed += totalWBF;
    }
    if (activeTab !== 'walls') {
      if (roofFoamType === FoamType.OPEN_CELL) bfOpen += totalRBF; else bfClosed += totalRBF;
    }

    const setsOpen = bfOpen > 0 ? bfOpen / settings.openCellYield : 0;
    const setsClosed = bfClosed > 0 ? bfClosed / settings.closedCellYield : 0;

    // 3. Costs
    const matCost = (setsOpen * settings.openCellCost) + (setsClosed * settings.closedCellCost);
    const labCost = laborHours * settings.laborRate;
    const miscCost = miscItems.reduce((acc, item) => acc + item.total, 0);

    const sub = matCost + labCost + tripCharge + miscCost;
    const tax = sub * (settings.taxRate / 100);
    const tot = sub + tax;

    setResults({
      wallArea: wArea,
      roofArea: rArea,
      totalBFOpen: bfOpen,
      totalBFClosed: bfClosed,
      setsOpen,
      setsClosed,
      materialCost: matCost,
      laborCost: labCost,
      subtotal: sub,
      tax,
      total: tot
    });

  }, [length, width, height, pitch, isGable, wallFoamType, wallThickness, roofFoamType, roofThickness, wastePct, laborHours, tripCharge, miscItems, activeTab, settings]);

  const handleGPS = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        showToast("Location Captured Successfully", "success");
      }, (err) => {
        showToast("Could not capture location: " + err.message, "error");
      });
    } else {
      showToast("Geolocation not supported", "error");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        setImages([...images, reader.result as string]);
        showToast("Photo Added", "success");
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSave = (status: JobStatus) => {
    if (!selectedCustomerId) {
      showToast("Please select a customer first", "error");
      return;
    }

    const newEstimate: Estimate = {
      id: Date.now().toString(),
      number: `EST-${Math.floor(Math.random() * 10000)}`,
      customerId: selectedCustomerId,
      date: new Date().toISOString(),
      status: status,
      jobName: jobName || "Untitled Job",
      location: location,
      images: images,
      calcData: {
        length, width, wallHeight: height, roofPitch: pitch, isGable,
        wallFoamType, wallThickness, roofFoamType, roofThickness, wastePct
      },
      totalBoardFeetOpen: results.totalBFOpen,
      totalBoardFeetClosed: results.totalBFClosed,
      setsRequiredOpen: results.setsOpen,
      setsRequiredClosed: results.setsClosed,
      items: [
        { id: '1', description: 'Spray Foam Material', quantity: 1, unit: 'Lot', unitPrice: results.materialCost, total: results.materialCost },
        { id: '2', description: 'Labor', quantity: laborHours, unit: 'Hours', unitPrice: settings.laborRate, total: results.laborCost },
        ...(tripCharge > 0 ? [{ id: '3', description: 'Trip Charge', quantity: 1, unit: 'Flat', unitPrice: tripCharge, total: tripCharge }] : []),
        ...miscItems
      ],
      subtotal: results.subtotal,
      tax: results.tax,
      total: results.total
    };
    
    saveEstimate(newEstimate);
    showToast(status === JobStatus.DRAFT ? "Draft Saved" : "Work Order Created", "success");
    onSave();
  };

  const addMiscItem = () => {
    const newItem: JobItem = {
      id: Date.now().toString(),
      description: 'New Item',
      quantity: 1,
      unit: 'Each',
      unitPrice: 0,
      total: 0
    };
    setMiscItems([...miscItems, newItem]);
  };

  const updateMiscItem = (index: number, field: keyof JobItem, value: any) => {
    const newItems = [...miscItems];
    newItems[index] = { ...newItems[index], [field]: value };
    newItems[index].total = newItems[index].quantity * newItems[index].unitPrice;
    setMiscItems(newItems);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-20">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900">Estimator</h2>
        <div className="flex gap-2">
           <button 
             onClick={() => setShowPricing(!showPricing)} 
             className="p-2 text-slate-600 hover:bg-slate-100 rounded flex items-center gap-1 border border-slate-200"
             title="Toggle Pricing"
           >
             {showPricing ? <EyeOff className="w-5 h-5"/> : <Eye className="w-5 h-5"/>}
             <span className="text-sm hidden md:inline">{showPricing ? 'Hide Prices' : 'Show Prices'}</span>
           </button>
          <button onClick={() => {
            setLength(0); setWidth(0); setMiscItems([]); setImages([]); setLocation(undefined);
          }} className="p-2 text-slate-600 hover:bg-slate-100 rounded">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Inputs */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Customer & Job Info */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="bg-slate-100 p-1 rounded text-slate-500">1</span> Job Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
                <select 
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 p-2 border"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                >
                  <option value="">Select Customer...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Job Name</label>
                <input 
                  type="text" 
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 p-2 border"
                  placeholder="e.g. Smith Residence Attic"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                />
              </div>
              
              {/* Site Data */}
              <div className="md:col-span-2 flex flex-col md:flex-row gap-4 mt-2">
                 <button 
                   onClick={handleGPS}
                   className={`flex-1 flex items-center justify-center gap-2 py-2 border rounded-lg hover:bg-slate-50 transition-colors ${location ? 'text-green-600 border-green-200 bg-green-50' : 'text-slate-600 border-slate-200'}`}
                 >
                   <MapPin className="w-4 h-4" />
                   {location ? `GPS Captured (${location.accuracy?.toFixed(0)}m acc)` : 'Capture GPS Location'}
                 </button>
                 <label className="flex-1 flex items-center justify-center gap-2 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer text-slate-600">
                    <Camera className="w-4 h-4" />
                    Upload Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                 </label>
              </div>
              
              {/* Image Preview */}
              {images.length > 0 && (
                <div className="md:col-span-2 flex gap-2 overflow-x-auto py-2">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                      <img src={img} alt="Job site" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => removeImage(idx)}
                        className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl shadow-sm"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Geometry */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="bg-slate-100 p-1 rounded text-slate-500">2</span> Dimensions
            </h3>
            
            <div className="flex border-b border-slate-100 mb-4">
              <button 
                onClick={() => setActiveTab('building')}
                className={`px-4 py-2 text-sm font-medium ${activeTab === 'building' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-slate-500'}`}
              >
                Building
              </button>
              <button 
                onClick={() => setActiveTab('walls')}
                className={`px-4 py-2 text-sm font-medium ${activeTab === 'walls' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-slate-500'}`}
              >
                Walls Only
              </button>
              <button 
                onClick={() => setActiveTab('flat')}
                className={`px-4 py-2 text-sm font-medium ${activeTab === 'flat' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-slate-500'}`}
              >
                Flat Area
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs uppercase text-slate-500 font-bold mb-1">Length (ft)</label>
                <input type="number" className="w-full p-2 border rounded" value={length} onChange={(e) => setLength(Number(e.target.value))} />
              </div>
              <div>
                 <label className="block text-xs uppercase text-slate-500 font-bold mb-1">
                   {activeTab === 'walls' ? 'Height (ft)' : 'Width (ft)'}
                 </label>
                <input type="number" className="w-full p-2 border rounded" value={width} onChange={(e) => setWidth(Number(e.target.value))} />
              </div>
              
              {activeTab === 'building' && (
                <>
                  <div>
                    <label className="block text-xs uppercase text-slate-500 font-bold mb-1">Wall Height</label>
                    <input type="number" className="w-full p-2 border rounded" value={height} onChange={(e) => setHeight(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-xs uppercase text-slate-500 font-bold mb-1">Roof Pitch (/12)</label>
                    <input type="number" className="w-full p-2 border rounded" value={pitch} onChange={(e) => setPitch(Number(e.target.value))} />
                  </div>
                </>
              )}
            </div>
            
            {activeTab === 'building' && (
              <div className="mt-4">
                <label className="inline-flex items-center">
                  <input type="checkbox" className="rounded text-brand-600 focus:ring-brand-500" checked={isGable} onChange={(e) => setIsGable(e.target.checked)} />
                  <span className="ml-2 text-sm text-slate-700">Include Gable Ends?</span>
                </label>
              </div>
            )}
          </div>

          {/* Foam Specs */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="bg-slate-100 p-1 rounded text-slate-500">3</span> Foam Specification
            </h3>
            
            <div className="space-y-4">
              {(activeTab === 'building' || activeTab === 'walls') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b pb-4 border-slate-100">
                  <span className="md:col-span-2 font-medium text-sm text-slate-900">Walls</span>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Type</label>
                    <select className="w-full p-2 border rounded" value={wallFoamType} onChange={(e) => setWallFoamType(e.target.value as FoamType)}>
                      <option>{FoamType.OPEN_CELL}</option>
                      <option>{FoamType.CLOSED_CELL}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Thickness (in)</label>
                    <input type="number" step="0.5" className="w-full p-2 border rounded" value={wallThickness} onChange={(e) => setWallThickness(Number(e.target.value))} />
                  </div>
                </div>
              )}

              {(activeTab === 'building' || activeTab === 'flat') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <span className="md:col-span-2 font-medium text-sm text-slate-900">Roof / Ceiling</span>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Type</label>
                    <select className="w-full p-2 border rounded" value={roofFoamType} onChange={(e) => setRoofFoamType(e.target.value as FoamType)}>
                      <option>{FoamType.OPEN_CELL}</option>
                      <option>{FoamType.CLOSED_CELL}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Thickness (in)</label>
                    <input type="number" step="0.5" className="w-full p-2 border rounded" value={roofThickness} onChange={(e) => setRoofThickness(Number(e.target.value))} />
                  </div>
                </div>
              )}
              
              <div className="pt-2">
                 <label className="block text-xs uppercase text-slate-500 font-bold mb-1">Waste Factor (%)</label>
                 <input type="range" min="0" max="30" className="w-full accent-brand-600" value={wastePct} onChange={(e) => setWastePct(Number(e.target.value))} />
                 <div className="text-right text-xs text-slate-500">{wastePct}%</div>
              </div>
            </div>
          </div>

          {/* Pricing Add-ons */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
             <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="bg-slate-100 p-1 rounded text-slate-500">4</span> Pricing & Extras
            </h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Labor Hours</label>
                <input type="number" className="w-full p-2 border rounded" value={laborHours} onChange={(e) => setLaborHours(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Trip Charge ($)</label>
                <input type="number" className="w-full p-2 border rounded" value={tripCharge} onChange={(e) => setTripCharge(Number(e.target.value))} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500">Additional Line Items</label>
              {miscItems.map((item, idx) => (
                <div key={item.id} className="flex gap-2 items-center">
                   <input 
                      className="flex-grow p-2 border rounded text-sm" 
                      placeholder="Description" 
                      value={item.description} 
                      onChange={(e) => updateMiscItem(idx, 'description', e.target.value)} 
                    />
                    <input 
                      type="number" 
                      className="w-20 p-2 border rounded text-sm" 
                      placeholder="Price" 
                      value={item.unitPrice} 
                      onChange={(e) => updateMiscItem(idx, 'unitPrice', Number(e.target.value))} 
                    />
                    <button onClick={() => {
                      const newItems = [...miscItems];
                      newItems.splice(idx, 1);
                      setMiscItems(newItems);
                    }} className="text-red-500 hover:text-red-700">×</button>
                </div>
              ))}
              <button onClick={addMiscItem} className="text-sm text-brand-600 flex items-center gap-1 mt-2">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Results Sticky */}
        <div className="lg:col-span-1">
          <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg sticky top-6">
            <h3 className="text-xl font-bold mb-6 border-b border-slate-700 pb-4 flex items-center gap-2">
              <CalcIcon className="w-5 h-5 text-brand-500" /> Estimate Summary
            </h3>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-sm text-slate-300">
                <span>Wall Area</span>
                <span>{results.wallArea.toFixed(0)} sq ft</span>
              </div>
              <div className="flex justify-between text-sm text-slate-300">
                <span>Roof Area</span>
                <span>{results.roofArea.toFixed(0)} sq ft</span>
              </div>
              <div className="border-t border-slate-700 pt-2"></div>
               <div className="flex justify-between text-sm">
                <span>Open Cell Sets</span>
                <span className="text-brand-400 font-mono">{results.setsOpen.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Closed Cell Sets</span>
                <span className="text-brand-400 font-mono">{results.setsClosed.toFixed(2)}</span>
              </div>
            </div>

            {showPricing && (
              <div className="bg-slate-800 rounded-lg p-4 space-y-2 mb-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between text-sm">
                  <span>Materials</span>
                  <span>${results.materialCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                 <div className="flex justify-between text-sm">
                  <span>Labor</span>
                  <span>${results.laborCost.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Extras/Fees</span>
                  <span>${(tripCharge + miscItems.reduce((a,b) => a + b.total, 0)).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-400">
                  <span>Tax ({settings.taxRate}%)</span>
                  <span>${results.tax.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
                <div className="border-t border-slate-600 pt-2 mt-2 flex justify-between font-bold text-xl text-white">
                  <span>Total</span>
                  <span>${results.total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <button 
                onClick={() => handleSave(JobStatus.DRAFT)}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors flex justify-center items-center gap-2"
              >
                <Save className="w-4 h-4" /> Save as Draft
              </button>
              <button 
                 onClick={() => handleSave(JobStatus.WORK_ORDER)}
                className="w-full py-3 bg-brand-600 hover:bg-brand-700 rounded-lg font-medium transition-colors text-white shadow-lg shadow-brand-900/50"
              >
                Create Work Order
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Calculator;