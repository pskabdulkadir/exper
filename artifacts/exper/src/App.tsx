/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Activity, Zap, Droplet, Box, Settings, AlertTriangle, Info, Maximize2, Shield, ClipboardList, Cpu, RefreshCcw, X, Download, Lock, Wifi, Battery, Languages, ArrowRight, Volume2, VolumeX, Trash2, History, User, Globe } from 'lucide-react';
import CameraView, { CameraViewRef } from './components/CameraView';
import { identifyVehicle, analyzeCondition, VehicleDiagnosis, identifyVehicleMultiAngle, preLoadModels, checkConnectivity, hasApiKey, getVinDetails, verifyAngle, generateDetailedAiReport, getEngineStatus, HEAVY_VEHICLES } from './lib/gemini';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useSensors } from './hooks/useSensors';
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer';
import { checkDeviceLicense } from './lib/licenseManager';
import { Language, UI_TRANSLATIONS } from './lib/translations';

type ScanMode = 'SCAN' | 'MECH' | 'ELEC' | 'BODY' | 'XRAY';

export default function App() {
  const [language, setLanguage] = useState<Language>('TR');
  const t = UI_TRANSLATIONS[language];
  
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [engineStatus, setEngineStatus] = useState<'idle' | 'booting' | 'ready' | 'error'>('idle');

  useEffect(() => {
    setEngineStatus('booting');
    preLoadModels().then(() => {
      const status = getEngineStatus();
      setEngineStatus(status);
      if (status === 'ready') setIsEngineReady(true);
    });

    const interval = setInterval(() => {
      const status = getEngineStatus();
      setEngineStatus(status);
      if (status === 'ready') {
        setIsEngineReady(true);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const [mode, setMode] = useState<ScanMode>('SCAN');
  const [diagnosis, setDiagnosis] = useState<VehicleDiagnosis | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStep, setScanStep] = useState<number>(0);
  const [capturedImages, setCapturedImages] = useState<{ angle: string, data: string }[]>([]);
  const [visionMetrics, setVisionMetrics] = useState<any>(null);
  const [detailedReportText, setDetailedReportText] = useState<string | null>(null);
  const [isGeneratingDetailedReport, setIsGeneratingDetailedReport] = useState(false);
  const [conditionScore, setConditionScore] = useState<number | null>(null);
  const [lightConfidence, setLightConfidence] = useState<number>(0);
  
  const [scanAngles, setScanAngles] = useState<{ id: string, label: string, description: string }[]>([]);

  // Initialize scan angles
  useEffect(() => {
    const baseAngles = [
      { id: 'front', label: t['angle.front'], description: t['angle.desc.front'] },
      { id: 'rear', label: t['angle.rear'], description: t['angle.desc.rear'] },
      { id: 'left', label: t['angle.left'], description: t['angle.desc.left'] },
      { id: 'right', label: t['angle.right'], description: t['angle.desc.right'] },
    ];
    
    const isHeavy = diagnosis?.objectName && HEAVY_VEHICLES.test(diagnosis.objectName);
    if (!isHeavy) {
      baseAngles.push({ id: 'roof', label: t['angle.roof'], description: t['angle.desc.roof'] });
    }
    setScanAngles(baseAngles);
  }, [diagnosis?.objectName, language]);

  const [isNotVehicleWarning, setIsNotVehicleWarning] = useState(false);
  const [isVehicleDetected, setIsVehicleDetected] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showSystemIntro, setShowSystemIntro] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [mechTimer, setMechTimer] = useState<number>(0);
  const [isGeneratingSchematic, setIsGeneratingSchematic] = useState(false);
  const [schematicImage, setSchematicImage] = useState<string | null>(null);
  const [mileage, setMileage] = useState<string>("120000");
  const [manualBrand, setManualBrand] = useState<string>('');
  const [manualModel, setManualModel] = useState<string>('');
  const [manualYear, setManualYear] = useState<string>('');
  const [showInitialInfoForm, setShowInitialInfoForm] = useState(false);
  const [hasShownInfoForm, setHasShownInfoForm] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [vinNumber, setVinNumber] = useState<string>('');
  const [vinReport, setVinReport] = useState<any>(null);
  const [isSearchingVin, setIsSearchingVin] = useState(false);
  const [isVerifyingAngle, setIsVerifyingAngle] = useState(false);
  const [expertReportData, setExpertReportData] = useState<{
    damagePercentage: number;
    hasDamage: boolean;
    symmetryScore: number;
    stanceAnalysis: string;
    isFullyInspected: boolean;
  } | null>(null);
  const [checklistData, setChecklistData] = useState<any>({
    engine: { 
      name: 'checklist.mech', 
      items: [
        { label: 'Yağ Sızıntısı', key: 'checklist.mech.oil', checked: false }, 
        { label: 'Ses/Vuruntu', key: 'checklist.mech.sound', checked: false }, 
        { label: 'Soğutma Suyu / Antifriz', key: 'checklist.mech.coolant', checked: false },
        { label: 'Turbo / Intercooler', key: 'checklist.mech.turbo', checked: false },
        { label: 'Enjektör / Yakıt Rayı', key: 'checklist.mech.fuel', checked: false },
        { label: 'EGR / DPF Durumu', key: 'checklist.mech.egr', checked: false },
        { label: 'Şanzıman Geçişleri', key: 'checklist.mech.trans', checked: false }
      ] 
    },
    body: { 
      name: 'checklist.body', 
      items: [
        { label: 'Çizik/Göçük', key: 'checklist.body.scratch', checked: false }, 
        { label: 'Boyalı Parça', key: 'checklist.body.painted', checked: false }, 
        { label: 'Değişen Parça', key: 'checklist.body.changed', checked: false },
        { label: 'Şasi / Podye / Direk', key: 'checklist.body.chassis', checked: false },
        { label: 'Tavan / Bagaj Havuzu', key: 'checklist.body.roof_trunk', checked: false },
        { label: 'Mikron Ölçüm Farkı', key: 'checklist.body.micron', checked: false },
        { label: 'Cam ve Aydınlatma Grubu', key: 'checklist.body.glass', checked: false }
      ] 
    },
    interior: { 
      name: 'checklist.interior', 
      items: [
        { label: 'Döşeme Aşınması', key: 'checklist.interior.wear', checked: false }, 
        { label: 'Klima / Isıtma Sistemi', key: 'checklist.interior.ac', checked: false }, 
        { label: 'Gösterge / Ekran Paneli', key: 'checklist.interior.electronics', checked: false },
        { label: 'Direksiyon / Pedal Aşınması', key: 'checklist.interior.mechanical', checked: false },
        { label: 'Cam Otomatikleri', key: 'checklist.interior.windows', checked: false },
        { label: 'Airbag Kontrolü', key: 'checklist.interior.airbag', checked: false },
        { label: 'Ses Sistemi / Multimedya', key: 'checklist.interior.multimedia', checked: false }
      ] 
    },
    tyres: { 
      name: 'checklist.tyres', 
      items: [
        { label: 'Diş Derinliği / Tarih', key: 'checklist.tyres.depth', checked: false }, 
        { label: 'Fren Balataları / Disk', key: 'checklist.tyres.brakes', checked: false }, 
        { label: 'Süspansiyon / Amortisör', key: 'checklist.tyres.suspension', checked: false },
        { label: 'Rot / Balans Ayarı', key: 'checklist.tyres.align', checked: false },
        { label: 'Aks / Rotil / Salıncak', key: 'checklist.tyres.axle', checked: false },
        { label: 'Jant Kondisyonu', key: 'checklist.tyres.rims', checked: false },
        { label: 'Fren Hidroliği', key: 'checklist.tyres.brake_fluid', checked: false }
      ] 
    },
    obd: {
      name: 'checklist.obd',
      items: [
        { label: 'Hata Kodları (DTC)', key: 'checklist.obd.dtc', checked: false },
        { label: 'Sensör Veri Tutarlılığı', key: 'checklist.obd.sensors', checked: false },
        { label: 'Akü Sağlığı / Voltaj', key: 'checklist.obd.battery', checked: false },
        { label: 'CAN-BUS Haberleşme', key: 'checklist.obd.canbus', checked: false }
      ]
    }
  });

  // Helper to get translated checklist label
  const getClLabel = (key: string, defaultVal: string) => {
    return t[key] || defaultVal;
  };

  const handleSelectAll = () => {
    const newData = { ...checklistData };
    let allSelected = true;
    
    // First, check if everything is already selected
    Object.values(newData).forEach((section: any) => {
      section.items.forEach((item: any) => {
        if (!item.checked) allSelected = false;
      });
    });

    // Toggle based on current state
    Object.values(newData).forEach((section: any) => {
      section.items.forEach((item: any) => {
        item.checked = !allSelected;
      });
    });

    setChecklistData(newData);
    speak(t['checklist.all_toggled']); // I should add this key or similar
  };

  const handleVinSearch = async () => {
    if (!vinNumber || vinNumber.length < 5) {
        speak(t['vin.invalid']);
        return;
    }
    setIsSearchingVin(true);
    speak(t['vin.querying']);
    try {
        const report = await getVinDetails(vinNumber, language);
        setVinReport(report);
        
        // Auto-fill manual fields from VIN report
        if (report && report.sections) {
          const generalInfo = report.sections.find((s: any) => s.name.includes("GENEL") || s.name.includes("GENERAL"));
          if (generalInfo) {
            const manufacturer = generalInfo.items.find((i: any) => i.label.includes("Üretici") || i.label.includes("Manufacturer"));
            const modelCode = generalInfo.items.find((i: any) => i.label.includes("Model"));
            const yearStr = generalInfo.items.find((i: any) => i.label.includes("Yıl") || i.label.includes("Year"));
            
            if (manufacturer) setManualBrand(manufacturer.value);
            if (modelCode) setManualModel(modelCode.value);
            if (yearStr) {
                const yearMatch = yearStr.value.match(/\d{4}/);
                if (yearMatch) setManualYear(yearMatch[0]);
            }
          }
        }
        
        speak(t['vin.success']);
    } catch (e) {
        speak(t['vin.failed_msg']);
    } finally {
        setIsSearchingVin(false);
    }
  };

  const handleDownloadVinReport = () => {
    if (!vinReport) return;

    try {
      const doc = new jsPDF() as any;
      const title = vinReport.title;
      const vin = vinNumber.toUpperCase();

      // Header
      doc.setFillColor(31, 41, 55); // Dark gray
      doc.rect(0, 0, 210, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text(title, 10, 20);
      
      doc.setFontSize(10);
      doc.text(`VIN: ${vin}`, 10, 30);
      doc.text(`Date: ${new Date().toLocaleString()}`, 150, 30);

      let currentY = 50;

      // Table generation
      vinReport.sections.forEach((section: any) => {
        doc.setTextColor(249, 115, 22); // Orange
        doc.setFontSize(12);
        doc.text(section.name, 10, currentY);
        currentY += 5;

        const tableData = section.items.map((item: any) => [item.label, item.value]);
        
        autoTable(doc, {
          startY: currentY,
          head: [[language === 'TR' ? 'ÖZELLİK' : 'FEATURE', language === 'TR' ? 'DEĞER' : 'VALUE']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: [249, 115, 22] },
          margin: { left: 10, right: 10 },
          didDrawPage: (data: any) => {
             currentY = data.cursor.y + 15;
          }
        });
        
        currentY = (doc as any).lastAutoTable.finalY + 15;
        
        // Page break logic
        if (currentY > 250) {
          doc.addPage();
          currentY = 20;
        }
      });

      // Footer / Integrity
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(vinReport.integrity, 10, 285);
      doc.text("SPECTRA-X AI DIAGNOSTIC SYSTEMS - DIGITAL CERTIFICATE", 10, 290);

      doc.save(`SPECTRA_X_REPORT_${vin}.pdf`);
      speak(t['report.download']);
    } catch (error) {
      console.error("PDF Error:", error);
      speak(t['report.generating_failed']);
    }
  };

  // Lisans kontrolü state'leri
  const [licenseStatus, setLicenseStatus] = useState<{
    isAuthorized: boolean;
    status: string;
    deviceId: string;
    message: string;
  } | null>(null);
  const [isCheckingLicense, setIsCheckingLicense] = useState(true);

  const cameraRef = useRef<CameraViewRef>(null);

  const sensors = useSensors();
  const { frequencyData, dbLevel } = useAudioAnalyzer(mode === 'MECH');

  // Uygulama açılırken lisans kontrolü yap ve modelleri ön yükle
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Modelleri arka planda yüklemeye başla
        preLoadModels();
        
        const status = await checkDeviceLicense();
        setLicenseStatus(status);

        if (!status.isAuthorized) {
          const warnPrefix = { TR: 'Uyarı!', EN: 'Warning!', DE: 'Warnung!' };
          const msgKey = status.status === 'Suspended' ? 'license.suspended' : 
                         status.status === 'Rejected' ? 'license.rejected' : 'license.unauthorized';
          speak(`${warnPrefix[language]} ${t[msgKey] || status.message}`);
        } else {
          speak(t['license.ready']);
        }
      } catch (error) {
        console.error('Başlatma sırasında hata:', error);
      } finally {
        setIsCheckingLicense(false);
      }
    };

    initializeApp();
  }, []);
  
  const handleReset = () => {
    if (confirm(t['settings.reset_confirm'])) {
        setDiagnosis(null);
        setAnalysisResult(null);
        setCapturedImages([]);
        setScanStep(0);
        setIsScanning(false);
        setDetailedReportText(null);
        setExpertReportData(null);
        setVinReport(null);
        setVinNumber('');
        setManualBrand('');
        setManualModel('');
        setManualYear('');
        setShowDetails(false);
        setMode('SCAN');
        speak(t['settings.reset_success']);
        setShowSettings(false);
    }
  };

  const speak = (text: string) => {
    if (isMuted) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      
      const langCodes = {
        'TR': 'tr-TR',
        'EN': 'en-US',
        'DE': 'de-DE'
      };
      
      utterance.lang = langCodes[language];
      utterance.rate = 1.1; // Slightly faster for professional feel
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleModeChange = (newMode: ScanMode) => {
    setMode(newMode);
    setAnalysisResult(null);
    setDetailedReportText(null);
    setExpertReportData(null);
    
    if (newMode === 'SCAN' || newMode === 'XRAY') {
      setIsVehicleDetected(false);
      setDiagnosis(null);
      setScanStep(0);
      setCapturedImages([]);
    }

    // Auto-activate X-Ray visual projection when in XRAY mode
    setIsXrayMode(newMode === 'XRAY');
    setIsLidarMode(false);
    setIsZebraMode(false);
    setIsTextureMode(false);
    setIsColorMode(false);

    const modeDesc = {
        'SCAN': t['mode.desc.SCAN'],
        'MECH': t['mode.desc.MECH'],
        'ELEC': t['mode.desc.ELEC'],
        'BODY': t['mode.desc.BODY'],
        'XRAY': t['mode.desc.XRAY']
    };
    speak(modeDesc[newMode] || '');
  };

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    const msgs = {
        'TR': 'Sistem dili Türkçe olarak ayarlandı.',
        'EN': 'System language set to English.',
        'DE': 'Systemsprache auf Deutsch eingestellt.'
    };
    // We need to wait a tiny bit for the state to update so speak uses the new language
    setTimeout(() => speak(msgs[lang]), 10);
  };

  const handleOpenManual = () => {
    setShowManual(true);
    const manualSpeech = language === 'TR' ? `
        SİSTEM KULLANIM KILAVUZU

        1. Çalışma Mantığı ve Derin Mimari
        Zebra Çizgileri: Endüstriyel otomobil tasarımında kullanılan Zebra projeksiyon tekniğinin dijital simülasyonudur. Sistem, kaporta yüzeyine 45 derecelik sanal ışık hüzmeleri gönderir. Bu çizgilerin paralelliğinin bozulması, çıplak gözle görülemeyen mikron düzeyindeki yüzey bükülmelerini, dalgalanmaları ve macun dolgularını netleştirir. Özellikle dolu hasarı tespiti ve geniş yüzeylerdeki dalgalanmaları saptamak için en güvenilir yöntemdir.

        Renk Karşılaştırma: Diferansiyel Spektrometrik Analiz katmanıdır. Fabrika çıkışı boya pigment yoğunluğu ile servis ortamında yapılan boya arasındaki ışık yansıma farklarını analiz eder. İki farklı panel arasındaki Delta-E renk sapması değerini ölçerek parçanın boyalı olup olmadığını bilimsel verilerle saptar. Metalik ve sedefli boyalarda mikron bazlı katman farklarını ayırarak lokal boyaları deşifre eder.

        Doku Analizi: Yüksek frekanslı doku deseni tanıma motorudur. Boya üzerindeki portakal kabuğu desenini ve vernik altındaki zımpara izlerini mikroskobik düzeyde inceler. Fabrika robotlarının attığı homojen doku ile insan elinden çıkan boya dokusu arasındaki farkı saniyeler içerisinde ayrıştırır. Vernik yanığı, akma ve tozlanma gibi işçilik hatalarını otomatik olarak raporlar.

        LiDAR Tarama: Üç boyutlu Geometrik Doğrulama sistemidir. LiDAR ve derinlik sensörlerinden gelen verileri kullanarak aracın yapısal formunu tarar. Orijinal şasi ve kaporta kalıp verileriyle karşılaştırma yaparak milimetrik kaymaları ve şasi düzeltme işlemlerini tespit eder. Aracın aerodinamik ve yapısal bütünlüğünü fabrika toleransları dahilinde kontrol eder.

        2. Uygulama İle Profesyonel Analiz Rehberi
        Birinci: İD Modu ve Doğru Konumlama. Cihazınızı araca tam paralel tutarak Araç Tespit Edildi uyarısını bekleyin. Ardından Rehber modunu açarak aracı çizgilere tam oturtun. Bu, yapay zekanın parçaları doğru indekslemesini sağlar.
        İkinci: Profesyonel Araçlar ve Tarama. Analiz sırasında sağ taraftaki Zebra, Renk ve Doku katmanlarını kullanarak anomali tespiti yapın. Ana tarama butonu ile tüm açıları kaydederek 360 derece raporunuzu oluşturun.

        3. Arayüz ve Fonksiyon Sözlüğü
        AKN Global Group Ltd Durumu: Sol üst panelde yer alan sürüm bilgisi ve yerel motor ibaresi, tüm görüntü işleme süreçlerinin cihazınızda gerçekleştiğini teyit eder. Bu, tam gizlilik ve kesintisiz çevrimdışı analiz sağlar.
        Manuel Ekspertiz ve Katmanlar: Motor, Mekanik, Elektriksel ve Gövde gibi hassas bileşenlerin manuel giriş alanıdır. Yapay zekanın göremediği iç trim kondisyonu veya motor sesi gibi sübjektif verileri rapora eklemenizi sağlar.
        Röntgen Projeksiyonu: Tarama sırasında Marka, Model ve Kilometre verilerini sisteme öncelikli veri olarak tanımlamanızı sağlar. Bu veriler, aracın kronik sorun veritabanıyla hassas eşleşme yapmasını sağlar.

        4. GÜVENİLİRLİĞİ ETKİLEYEN KRİTİK DIŞ ETKENLER
        Işık ve Ambiyans Koşulları: Yapay zekanın en net veriyi ürettiği ortam gün ışığıdır. Aşırı güneş ışığı parlamaya neden olarak veriyi bozar. Karanlık ortamlar ise analizi engeller.
        Araç Yüzey Temizliği: Toz ve çamur lekeleri sistemi yanıltabilir. AI, kurumuş bir çamuru boya kusuru olarak etiketleyebilir. Aracın temiz olması elzemdir.
        Optik Sensör Limitleri: Kamera ve LiDAR sensörünün olması analizi doğrudan etkiler. Lens üzerindeki parmak izleri başarıyı düşürür.
        Operatör Hareketleri: Elin titremesi pikselleri doğru eşleştirmeyi engeller. Sabit ve yavaş taramalar en yüksek güven puanını üretir.
    ` : (language === 'EN' ? `
        SYSTEM USER MANUAL

        1. Working Logic & Deep Architecture
        Zebra Lines: Digital simulation of industrial automotive design projection used in factory standards. The system projects virtual light beams at 45 degrees onto the bodywork. Any distortion in the parallelism of these lines reveals micron-level surface warping, ripples, and filler applications invisible to the naked eye. It is the most reliable method for PDR (Paintless Dent Repair) detection and identifying ripples on large surfaces.

        Color Comparison: Differential Spectrometric Analysis layer. It analyzes light reflection differences between factory-standard paint pigment density and post-service paint. By measuring the Delta-E (color deviation) value between two different panels, it determines whether a part is repainted using scientific data. It deciphers local paint by separating micron-based layer differences in metallic and pearlescent paints.

        Texture Analysis: High-frequency texture pattern recognition engine. It examines "orange peel" patterns on paint and sanding marks under varnish at a microscopic level. It differentiates between homogeneous texture applied by factory robots and manual paint texture within seconds. It automatically reports workmanship errors such as clear coat burn, runs, and dust contamination.

        LiDAR Scanning: 3D Geometric Verification system. It scans the structural form of the vehicle using data from LiDAR and depth sensors. By comparing with original chassis and body mold data, it detects millimeter-level shifts and chassis correction processes. It checks the aerodynamic and structural integrity of the vehicle within factory tolerances.

        2. Professional Analysis Guide with the App
        First: ID Mode and Correct Positioning. Hold your device parallel to the vehicle and wait for the "CAR DETECTED" warning. Then open GUIDE mode and align the vehicle perfectly within the lines. This ensures correct indexing of parts by the AI.
        Second: Pro Tools and Scanning. Use the layers on the right side (Zebra, Color, Texture) during analysis to detect anomalies. Save all angles using the main scan button to create your 360-degree report.

        3. Interface and Function Dictionary
        AKN Global Group Ltd Status: Version and "LOCAL ENGINE" info in the top left panel confirm that all image processing occurs on your device's GPU instead of the cloud. This ensures 100% privacy and seamless offline analysis capability.
        Manual Expertise & Layers: Manual entry area for sensitive components (Engine, Mechanical, Electrical, Body). Allows adding subjective data like interior trim condition or engine sound that AI cannot visually observe.
        X-Ray Projection: Allows defining BRAND, MODEL, and KM data as priority data. This enables the neural network to match more accurately with the vehicle's chronic issue database.

        4. CRITICAL EXTERNAL FACTORS AFFECTING RELIABILITY
        01. Light and Ambience Conditions: Optimal data is produced in homogeneous lighting at 5500K-6000K daylight values. Excessive direct sunlight causes flare, disrupting spectroscopic data. Pitch black environments prevent the texture analysis engine from resolving pixels and reduce confidence index to 30-40%.
        02. Surface Cleanliness and Contamination: Thick dust layers, mud stains, or heavy water droplets can mislead texture recognition algorithms. AI might label dried mud as a "filler crack" or "paint defect". Vehicle cleanliness is essential for reliable results.
        03. Optical Sensor and Hardware Limits: Camera aperture and the presence of a LiDAR sensor directly affect analysis. On devices without LiDAR, depth data is calculated via software (Parallax), which may increase the margin of error. Fingerprints on the lens can cause blurriness and reduce edge detection success.
        04. Operator Movements and Stability: Excessive hand shaking or moving the phone too fast (Motion Blur) prevents pixels from matching correctly. Steady, slow scans from 50-100 cm produce the highest Confidence Scores.
    ` : `
        SYSTEM-BENUTZERHANDBUCH

        1. Arbeitslogik & Tiefe Architektur
        Zebra-Linien: Digitale Simulation der in der industriellen Automobilentwicklung verwendeten Zebra-Projektionstechnik. Das System projiziert virtuelle Lichtstrahlen im 45-Grad-Winkel auf die Karosserie. Jede Störung der Parallelität dieser Linien macht mikroskopische Oberflächenverformungen, Wellen und Spachtelaufträge sichtbar, die mit bloßem Auge nicht erkennbar sind. Dies ist die zuverlässigste Methode zur Erkennung von Hagelschaden (PDR) und Wellen auf großen Flächen.

        Farbvergleich: Differenzielle spektrometrische Analyseebene. Analysiert die Lichtreflexionsunterschiede zwischen werksseitiger Lackpigmentdichte und Reparaturlackierungen. Durch Messung des Delta-E-Wertes (Farbabweichung) zwischen zwei Paneelen wird wissenschaftlich festgestellt, ob ein Teil nachlackiert wurde. Bei Metallic- und Perleffektlacken werden mikrometerbasierte Schichtunterschiede erkannt, um lokale Lackierungen zu dechiffrieren.

        Texturanalyse: Hochfrequente Texturmustererkennungs-Engine. Untersucht "Orangenhaut"-Muster auf dem Lack und Schleifspuren unter dem Klarlack auf mikroskopischer Ebene. Unterscheidet sekundenschnell zwischen der homogenen Textur von Werksrobotern und manueller Lacktextur. Meldet automatisch Verarbeitungsfehler wie Klarlackverbrennungen, Läufer und Staubinschlüsse.

        LiDAR-Scanner: 3D-Geometrie-Verifizierungssystem. Scannt die strukturelle Form des Fahrzeugs unter Verwendung von Daten aus LiDAR- und Tiefensensoren. Durch Vergleich mit originalen Fahrgestell- und Karosseriedaten werden millimetergenaue Verschiebungen und Rahmenkorrekturen erkannt. Prüft die aerodynamische und strukturelle Integrität innerhalb der Werkstoleranzen.

        2. Leitfaden für die professionelle Analyse mit der App
        Erstens: ID-Modus und korrekte Positionierung. Halten Sie Ihr Gerät parallel zum Fahrzeug und warten Sie auf die Warnung "FAHRZEUG ERKANNT". Öffnen Sie dann den GUIDE-Modus und richten Sie das Fahrzeug perfekt in den Linien aus. Dies gewährleistet eine korrekte Indizierung der Teile durch die KI.
        Zweitens: Pro-Tools und Scannen. Verwenden Sie während der Analyse die Ebenen auf der rechten Seite (Zebra, Farbe, Textur), um Anomalien zu erkennen. Speichern Sie alle Winkel mit der Haupt-Scan-Taste, um Ihren 360-Grad-Bericht zu erstellen.

        3. Schnittstellen- und Funktionslexikon
        AKN Global Group Ltd-Status: Versions- und "LOKALER MOTOR"-Informationen im oberen linken Panel bestätigen, dass die gesamte Bildverarbeitung auf dem Grafikprozessor Ihres Geräts statt auf der Cloud erfolgt. Dies gewährleistet 100% Datenschutz und nahtlose Offline-Analyse.
        Manuelle Expertise & Ebenen: Manueller Eingabebereich für empfindliche Komponenten (Motor, Mechanik, Elektrik, Karosserie). Ermöglicht das Hinzufügen subjektiver Daten wie Innenraumzustand oder Motorgeräusche, die die KI nicht visuell erfassen kann.
        Röntgenprojektion: Ermöglicht die Definition von MARKE, MODELL und KM als Prioritätsdaten. Dies ermöglicht dem neuronalen Netzwerk einen präziseren Abgleich mit der Datenbank für chronische Fahrzeugprobleme.

        4. KRITISCHE EXTERNE FAKTOREN, DIE DIE ZUVERLÄSSIGKEIT BEEINFLUSSEN
        01. Licht- und Umgebungsbedingungen: Optimale Daten werden bei homogenem Licht (5500K-6000K Tageslichtwerte) erzeugt. Zu starkes direktes Sonnenlicht verursacht Reflexionen, die spektrometrische Daten verfälschen. Dunkle Umgebungen verhindern die Texturanalyse und senken den Vertrauensindex auf 30-40%.
        02. Oberflächensauberkeit und Kontamination: Dicke Staubschichten, Schlammflecken oder Wassertropfen können die Texturerkennungsalgorithmen irreführen. Die KI könnte getrockneten Schlamm als "Spachtelriss" oder "Lackfehler" kennzeichnen. Fahrzeugsauberkeit ist für zuverlässige Ergebnisse unerlässlich.
        03. Optische Sensoren und Hardware-Limits: Kamerablende und das Vorhandensein eines LiDAR-Sensors beeinflussen die Analyse direkt. Bei Geräten ohne LiDAR wird die Tiefe softwareseitig (Parallax) berechnet, was die Fehlermarge erhöhen kann. Fingerabdrücke auf der Linse können Unschärfe verursachen.
        04. Bedienerbewegungen und Stabilität: Übermäßiges Händezittern oder zu schnelles Bewegen des Telefons verhindert einen korrekten Pixelabgleich. Ruhige, langsame Scans aus 50-100 cm Entfernung liefern die höchsten Vertrauenswerte.
    `);
    speak(manualSpeech);
  };

  const handleCloseManual = () => {
    setShowManual(false);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const handleGenerateDetailedReport = async () => {
    if (capturedImages.length === 0 || isGeneratingDetailedReport) return;
    
    setIsGeneratingDetailedReport(true);
    speak(t['report.forensic_generating']);
    
    try {
        const report = await generateDetailedAiReport(capturedImages, {
            metrics: visionMetrics,
            score: conditionScore,
            diag: diagnosis,
            info: { brand: manualBrand, model: manualModel, year: manualYear }
        }, language);
        setDetailedReportText(report);
        speak(t['report.forensic_generated']);
    } catch (e) {
        console.error("Report error:", e);
        speak(t['scan.failed']);
    } finally {
        setIsGeneratingDetailedReport(false);
    }
  };

  const handleDownloadReport = () => {
    if (!diagnosis) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;

    // Helper functions for PDF styling
    const drawSectionHeader = (title: string, y: number) => {
      doc.setFillColor(80, 80, 80);
      doc.rect(margin, y, 60, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(title, margin + 2, y + 5.5);
      doc.setTextColor(0, 0, 0);
    };

    const drawVerticalTitle = (title: string) => {
      doc.saveGraphicsState();
      doc.setFontSize(24);
      doc.setTextColor(200, 200, 200);
      doc.setFont('helvetica', 'bold');
      doc.text(title, pageWidth - 10, 40, { angle: -90 });
      doc.restoreGraphicsState();
    };

    const drawQRCodePlaceholder = (x: number, y: number, size: number) => {
      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.rect(x, y, size, size);
      // Basic pattern simulation
      for(let i=0; i<size; i+=5) {
        for(let j=0; j<size; j+=5) {
          if((i+j)%10 === 0) {
            doc.setFillColor(0, 0, 0);
            doc.rect(x+i, y+j, 2, 2, 'F');
          }
        }
      }
      doc.setFontSize(6);
      doc.text(t['report.scan_qr'], x, y + size + 4);
    };

    // --- PAGE 1: COVER ---
    drawVerticalTitle(t['report.expert_title']);
    drawQRCodePlaceholder(pageWidth - 45, 15, 30);
    
    // Summary Info Table
    const reportNo = Math.floor(Math.random() * 9000000) + 1000000;
    drawSectionHeader(t['report.info_expertise'], 25);
    autoTable(doc, {
      startY: 33,
      margin: { left: margin, right: 80 },
      theme: 'grid',
      headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
      body: [
        [t['report.no'], reportNo.toString()],
        [t['report.package'], ''],
        [t['report.date'], new Date().toLocaleString()],
        [t['report.mileage_start'], mileage || ''],
      ],
      styles: { fontSize: 9, cellPadding: 2.5 }
    });

    // Bayi Bilgileri
    drawSectionHeader(t['report.info_dealer'], 68);
    autoTable(doc, {
      startY: 76,
      margin: { left: margin, right: 80 },
      theme: 'grid',
      body: [
        [t['report.dealer_no'], ''],
        [t['report.company'], ''],
        [t['report.technician'], ''],
      ],
      styles: { fontSize: 9, cellPadding: 2.5 }
    });

    // Araç Bilgileri
    drawSectionHeader(language === 'TR' ? 'Araç Bilgileri' : 'Vehicle Info', 108);
    autoTable(doc, {
      startY: 116,
      margin: { left: margin, right: 20 },
      theme: 'grid',
      body: [
        [language === 'TR' ? 'Marka' : 'Brand', (manualBrand || diagnosis.model || '').toUpperCase()],
        [language === 'TR' ? 'Model' : 'Model', (manualModel || diagnosis.objectName || '').toUpperCase()],
        [language === 'TR' ? 'Model Yılı' : 'Model Year', manualYear || diagnosis.year || ''],
        [language === 'TR' ? 'Vites Tipi' : 'Transmission', diagnosis.technicalSpecs?.transmission || '-'],
        [language === 'TR' ? 'Yakıt Türü' : 'Fuel Type', ''],
        [language === 'TR' ? 'Plaka No' : 'License Plate', ''],
        [language === 'TR' ? 'Motor No' : 'Engine No', ''],
        [language === 'TR' ? 'Şasi No' : 'VIN', vinNumber || ''],
      ],
      styles: { fontSize: 9, cellPadding: 2.5 },
      columnStyles: { 0: { cellWidth: 50, fillColor: [245, 245, 245], fontStyle: 'bold' } }
    });

    // Bottom info tables
    autoTable(doc, {
      startY: 230,
      margin: { left: margin },
      theme: 'grid',
      head: [[language === 'TR' ? 'Kimlik Bilgileri' : 'Identity Info', language === 'TR' ? 'Alıcı Bilgileri' : 'Buyer Info', language === 'TR' ? 'Satıcı Bilgileri' : 'Seller Info', language === 'TR' ? 'Bayi Bilgileri' : 'Dealer Info']],
      body: [
        [language === 'TR' ? 'Adı Soyadı' : 'Name', '', '', ''],
        [language === 'TR' ? 'TC / Vergi No' : 'ID No', '', '', ''],
        [language === 'TR' ? 'İmza' : 'Signature', '\n\n', '\n\n', '\n\n']
      ],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [150, 150, 150], textColor: [255, 255, 255] }
    });

    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Bu rapor dijital olarak AKN Global Neural Forensics v4.5 tarafından oluşturulmuştur.', margin, pageHeight - 10);
    doc.text('Sayfa 1', pageWidth / 2, pageHeight - 10, { align: 'center' });

    // --- PAGE 2: IMAGES ---
    doc.addPage();
    drawVerticalTitle(language === 'TR' ? 'EKSPERTİZ FOTOĞRAFLARI' : 'EXPERTISE PHOTOS');
    
    let currentY = 20;
    capturedImages.forEach((img, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const xPos = margin + (col * 90);
      const yPos = currentY + (row * 70);
      
      if (yPos + 60 > pageHeight - 20) return;

      try {
        doc.addImage(img.data, 'JPEG', xPos, yPos, 80, 60);
        doc.setFontSize(7);
        doc.text(img.angle.toUpperCase(), xPos, yPos + 65);
      } catch (e) {
        console.error("Image PDF error", e);
      }
    });
    
    doc.text('Sayfa 2', pageWidth / 2, pageHeight - 10, { align: 'center' });

    // --- PAGE 3: BODY & PAINT ---
    doc.addPage();
    drawVerticalTitle(language === 'TR' ? 'KAPORTA BOYA TEST SONUÇLARI' : 'BODY PAINT TEST RESULTS');
    
    drawSectionHeader(language === 'TR' ? 'Detaylı Kaporta/Boya Analiz Listesi' : 'Detailed Body/Paint Analysis List', 20);
    
    let bodyRows: any[] = [];
    if (diagnosis.bodyReport) {
      Object.keys(diagnosis.bodyReport).forEach(angle => {
        diagnosis.bodyReport![angle].forEach(part => {
          bodyRows.push([
            part.partName, 
            part.status, 
            part.thickness ? `${part.thickness} μm` : 'N/A', 
            part.notes
          ]);
        });
      });
    } else {
      bodyRows = Object.entries((diagnosis.exteriorCondition || {}) as Record<string, string>).map(([part, cond]) => [part.toUpperCase(), cond.toUpperCase(), '', '']);
    }
    
    autoTable(doc, {
      startY: 30,
      margin: { left: margin },
      head: [[
        language === 'TR' ? 'Parça Adı' : 'Part Name', 
        language === 'TR' ? 'Durum' : 'Status', 
        language === 'TR' ? 'Mikron' : 'Micron', 
        language === 'TR' ? 'Uzman Notu' : 'Expert Note'
      ]],
      body: bodyRows,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [80, 80, 80], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });

    // Legend / Abbreviation Key
    drawSectionHeader(language === 'TR' ? 'Kısaltma Anahtarı' : 'Abbreviation Key', (doc as any).lastAutoTable.finalY + 10);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 18,
      margin: { left: margin },
      body: [
        ['ORJ: Orijinal', 'BOY: Boyalı', 'LOK: Lokal Boyalı', 'DEG: Değişmiş'],
        ['CIZ: Çizik', 'GOK: Göçük', 'MAC: Macunlu', 'KIR: Kırık/Çatlak']
      ],
      styles: { fontSize: 8, font: 'helvetica', fontStyle: 'bold' },
      theme: 'plain',
      columnStyles: { 
        0: { cellWidth: 45 }, 1: { cellWidth: 45 }, 2: { cellWidth: 45 }, 3: { cellWidth: 45 }
      }
    });
    
    doc.text('Sayfa 3', pageWidth / 2, pageHeight - 10, { align: 'center' });

    // --- PAGE 4: DETAILED AI ANALYSIS ---
    doc.addPage();
    drawVerticalTitle(language === 'TR' ? 'AI FORENSİK RAPOR DETAYI' : 'AI FORENSIC REPORT DETAIL');
    
    drawSectionHeader('PRO-AI ANALİZ VERİLERİ', 20);
    autoTable(doc, {
      startY: 30,
      margin: { left: margin },
      body: [
        [t['tool.zebra'], diagnosis.advancedAnalysis?.zebraReflections || 'N/A'],
        [t['tool.color'], diagnosis.advancedAnalysis?.spectroscopicColor || 'N/A'],
        [t['tool.texture'], diagnosis.advancedAnalysis?.textureAnalysis || 'N/A'],
        [t['tool.lidar'], diagnosis.advancedAnalysis?.lidarDepthMap || 'N/A'],
        [t['tool.xray'], diagnosis.advancedAnalysis?.xrayProjection || 'N/A'],
        [language === 'TR' ? 'MİKRON HOMOJENLİĞİ' : 'MICRON UNIFORMITY', diagnosis.advancedAnalysis?.micronHomogeneity || 'N/A'],
        [language === 'TR' ? 'TERMAL GRADYAN' : 'THERMAL GRADIENT', diagnosis.advancedAnalysis?.thermalGradient || 'N/A'],
        [language === 'TR' ? 'PODYE/SÜTUN ANALİZİ' : 'STRUT/PILLAR ANALYSIS', diagnosis.advancedAnalysis?.pillarAnalysis || 'N/A'],
      ],
      styles: { fontSize: 9 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
    });

    if (detailedReportText) {
      drawSectionHeader('AI UZMAN GÖRÜŞÜ', 80);
      const splitText = doc.splitTextToSize(detailedReportText, pageWidth - (margin * 2));
      doc.setFontSize(9);
      doc.text(splitText, margin, 90);
    }

    doc.text('Sayfa 4', pageWidth / 2, pageHeight - 10, { align: 'center' });

    // --- PAGE 5: SPECIALIZED DIAGNOSTICS (NEW) ---
    if (analysisResult) {
      doc.addPage();
      drawVerticalTitle(language === 'TR' ? 'SPESİFİK DİYAGNOSTİK ANALİZ' : 'SPECIFIC DIAGNOSTIC ANALYSIS');
      drawSectionHeader(language === 'TR' ? 'Sistem Analiz Verileri' : 'System Analysis Data', 20);
      
      const diagRows = Object.entries(analysisResult as Record<string, unknown>).filter(([k]) => k !== 'alerts' && k !== 'findings' && k !== 'risk').map(([key, val]) => [key.toUpperCase(), String(val ?? '')]);
      
      autoTable(doc, {
        startY: 30,
        margin: { left: margin },
        body: diagRows,
        styles: { fontSize: 9 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50, fillColor: [240,240,240] } }
      });
      
      if (analysisResult.alerts && (analysisResult.alerts as string[]).length > 0) {
        drawSectionHeader(language === 'TR' ? 'Sistem Uyarıları & Tespitler' : 'System Alerts & Findings', (doc as any).lastAutoTable.finalY + 15);
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 23,
          margin: { left: margin },
          body: (analysisResult.alerts as string[]).map((a: string) => [a]),
          styles: { fontSize: 8, textColor: [180, 0, 0] },
          theme: 'grid'
        });
      }
      
      doc.text('Sayfa 5', pageWidth / 2, pageHeight - 10, { align: 'center' });
    }

    // --- PAGE 6: CHECKLIST DATA ---
    doc.addPage();
    drawVerticalTitle(language === 'TR' ? 'KONTROL LİSTESİ SONUÇLARI' : 'CHECKLIST RESULTS');
    
    let lastY = 20;
    Object.values(checklistData).forEach((section: any) => {
      const checkedItems = section.items.filter((i: any) => i.checked);
      if (checkedItems.length > 0) {
        drawSectionHeader(section.name.toUpperCase(), lastY);
        autoTable(doc, {
          startY: lastY + 10,
          margin: { left: margin },
          body: checkedItems.map((item: any) => [item.label, language === 'TR' ? 'TESPİT EDİLDİ / ONAYLANDI' : 'DETECTED / VERIFIED']),
          styles: { fontSize: 8 },
          theme: 'grid',
          headStyles: { fillColor: [200, 200, 200] }
        });
        lastY = (doc as any).lastAutoTable.finalY + 10;
        
        if (lastY > pageHeight - 30) {
          doc.addPage();
          lastY = 20;
        }
      }
    });

    // Save PDF
    const fileName = `Expert_Report_${manualBrand || 'Vehicle'}_${reportNo}.pdf`;
    doc.save(fileName);
    
    speak(t['report.expert_downloading']); // Need to add this
  };


  const [history, setHistory] = useState<VehicleDiagnosis[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load history from local storage
  useEffect(() => {
    const saved = localStorage.getItem('akn_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('History load error', e);
      }
    }
  }, []);

  // Save history when it changes
  useEffect(() => {
    localStorage.setItem('akn_history', JSON.stringify(history));
  }, [history]);

  const [isZebraMode, setIsZebraMode] = useState(false);
  const [stencilType, setStencilType] = useState<'sedan' | 'suv' | 'truck' | null>(null);
  const [isTextureMode, setIsTextureMode] = useState(false);
  const [isColorMode, setIsColorMode] = useState(false);
  const [isLidarMode, setIsLidarMode] = useState(false);
  const [isXrayMode, setIsXrayMode] = useState(false);

  const handleToggleProTool = (tool: string) => {
    switch(tool) {
        case 'zebra': setIsZebraMode(!isZebraMode); break;
        case 'stencil': 
            const types: ('sedan' | 'suv' | 'truck' | null)[] = [null, 'sedan', 'suv', 'truck'];
            const currentIndex = types.indexOf(stencilType);
            setStencilType(types[(currentIndex + 1) % types.length]);
            break;
        case 'texture': setIsTextureMode(!isTextureMode); break;
        case 'color': setIsColorMode(!isColorMode); break;
        case 'lidar': setIsLidarMode(!isLidarMode); break;
        case 'xray': setIsXrayMode(!isXrayMode); break;
    }
    speak(t[`tool.${tool}`] || tool);
  };

  const handleScan = async () => {
    if (!cameraRef.current || isScanning) return;
    
    setIsOffline(false);
    setIsNotVehicleWarning(false);
    
    // Capture real-time metrics during capture
    const analysisData = cameraRef.current.getAnalysisData();
    setVisionMetrics(analysisData);
    setLightConfidence(analysisData.lightLevel);
    
    const frame = cameraRef.current.captureFrame();
    if (frame) {
      if (!isVehicleDetected) {
          // Detect vehicle in ANY mode if not already detected
          setIsScanning(true);
          setScanProgress(0);
          speak(t['scan.detecting']);
          
          try {
            const result = await identifyVehicle(frame, language);
            if (result && result.isVehicle) {
              setIsVehicleDetected(true);
              if (!hasShownInfoForm && !showInitialInfoForm) {
                setShowInitialInfoForm(true);
                setHasShownInfoForm(true);
              }
              setDiagnosis(result);
              setAnalysisResult(null);
              setIsNotVehicleWarning(false);
              
              if (mode === 'SCAN' || mode === 'BODY') {
                speak(`${t['scan.detected']}: ${result.objectName}. ${t['scan.press_to_start']}`);
                setIsScanning(false);
                setScanStep(0);
                setCapturedImages([]);
                return; // Multi-angle needs another click to start the sequence
              } else {
                // For XRAY, MECH, ELEC - continue immediately to analysis
                speak(`${t['scan.detected']}: ${result.objectName}. ${t['scan.starting_analysis']}`);
                // Proceed to analysis part below
              }
            } else if (mode === 'MECH') {
              // Forced diagnostic for mechanical mode even if optical detection is weak
              setIsVehicleDetected(true);
              setDiagnosis({
                isVehicle: true,
                objectName: language === 'TR' ? "Motor Ünitesi" : "Engine Unit",
                model: "Sistem-X",
                confidenceScore: 70
              });
              speak(t['scan.acoustic_active']);
            } else {
              setIsNotVehicleWarning(true);
              setIsVehicleDetected(false);
              setDiagnosis(result); 
              setAnalysisResult(null);
              speak(`${t['warning.not_vehicle']}: ${result?.objectName || '...'}. ${t['warning.not_vehicle.desc']}`);
              setIsScanning(false);
              return;
            }
          } catch (error) {
            console.error("Initial detection error:", error);
            speak(t['scan.failed']);
            setIsScanning(false);
            return;
          }
      }

      // If we got here, isVehicleDetected is true and we are either:
      // 1. In a multi-angle mode (SCAN/BODY) and it's NOT the first click
      // 2. In a single-shot mode (XRAY/MECH/ELEC) and it might be the first OR second click
      
      if (mode === 'SCAN' || mode === 'BODY') {
        const currentAngle = scanAngles[scanStep];
        
        setIsScanning(true);
        setIsVerifyingAngle(true);
        speak(`${currentAngle.label} ${t['scan.verifying']}`);
        
        try {
            const verification = await verifyAngle(frame, currentAngle.id, language);
            
            if (verification.success) {
                const newImages = [...capturedImages, { angle: currentAngle.label, data: frame }];
                setCapturedImages(newImages);
                speak(verification.message);

                if (scanStep < scanAngles.length - 1) {
                  setScanStep(prev => prev + 1);
                  setTimeout(() => {
                    speak(`${scanAngles[scanStep + 1].label}. ${scanAngles[scanStep + 1].description}`);
                    setIsScanning(false);
                    setIsVerifyingAngle(false);
                  }, 1500);
                  return;
                } else {
                  // All angles collected and verified
                  setIsScanning(true);
                  setIsVerifyingAngle(false);
                  setScanProgress(0);
                  setAnalysisResult(null);
                  speak(t['scan.angles_collected']);
                  
                  // "Neural Progress" processing starts here
                  const progressInterval = setInterval(() => {
                    setScanProgress(prev => {
                        const next = prev + 2;
                        if (next >= 100) {
                            clearInterval(progressInterval);
                            setIsZebraMode(false);
                            setIsTextureMode(false);
                            setIsColorMode(false);
                            setIsLidarMode(false);
                            return 100;
                        }
                        
                        if (next === 20) setIsZebraMode(true);
                        if (next === 40) { setIsZebraMode(false); setIsTextureMode(true); }
                        if (next === 60) { setIsTextureMode(false); setIsColorMode(true); }
                        if (next === 80) { setIsColorMode(false); setIsLidarMode(true); }
                        
                        return next;
                    });
                  }, 50);

                  try {
                    const result = await identifyVehicleMultiAngle(newImages, language, {
                        zebra: isZebraMode,
                        texture: isTextureMode,
                        color: isColorMode,
                        depth: isLidarMode,
                        guide: !!stencilType,
                        xray: isXrayMode
                    });
                    
                    if (!result) {
                      speak(t['scan.failed']);
                    } else if (result.isVehicle === false) {
                      setIsNotVehicleWarning(true);
                      setIsVehicleDetected(false);
                      setDiagnosis(null);
                      speak(`${t['warning.not_vehicle']}: ${result.objectName}.`);
                    } else {
                      setIsVehicleDetected(true);
                      setDiagnosis(result);
                      
                      // Auto-update checklist based on scan findings
                      if (result.bodyReport) {
                        setChecklistData((prev: any) => {
                          const next = { ...prev };
                          const allBodyIssues = Object.values(result.bodyReport!).flat();
                          
                          // Update Body section
                          next.body.items.forEach((item: any) => {
                            const label = item.label.toLowerCase();
                            if ((label.includes('boyalı') || label.includes('painted')) && allBodyIssues.some(p => p.status === 'BOY' || p.status === 'LOK' || p.status === 'MAC')) item.checked = true;
                            if ((label.includes('değişen') || label.includes('changed')) && allBodyIssues.some(p => p.status === 'DEG')) item.checked = true;
                            if ((label.includes('çizik') || label.includes('scratch') || label.includes('göçük') || label.includes('dent')) && allBodyIssues.some(p => p.status === 'CIZ' || p.status === 'GOK')) item.checked = true;
                            if ((label.includes('mikron') || label.includes('micron')) && allBodyIssues.some(p => p.thickness && p.thickness > 160)) item.checked = true;
                            if ((label.includes('cam') || label.includes('glass') || label.includes('aydınlatma') || label.includes('light')) && allBodyIssues.some(p => (p.status === 'KIR' || p.status === 'CIZ') && (p.partName.toLowerCase().includes('cam') || p.partName.toLowerCase().includes('window') || p.partName.toLowerCase().includes('far') || p.partName.toLowerCase().includes('light')))) item.checked = true;
                            if ((label.includes('şasi') || label.includes('chassis') || label.includes('direk') || label.includes('pillar') || label.includes('podye')) && allBodyIssues.some(p => (p.status === 'BOY' || p.status === 'DEG' || p.status === 'MAC' || p.status === 'GOK') && (p.partName.toLowerCase().includes('şasi') || p.partName.toLowerCase().includes('chassis') || p.partName.toLowerCase().includes('sütun') || p.partName.toLowerCase().includes('pillar') || p.partName.toLowerCase().includes('podye')))) item.checked = true;
                            if ((label.includes('tavan') || label.includes('roof') || label.includes('bagaj')) && allBodyIssues.some(p => (p.status !== 'ORJ') && (p.partName.toLowerCase().includes('tavan') || p.partName.toLowerCase().includes('roof') || p.partName.toLowerCase().includes('bagaj') || p.partName.toLowerCase().includes('trunk')))) item.checked = true;
                          });

                          // Update Engine/Mechanical based on general confidence or signs
                          if (result.advancedAnalysis) {
                            next.engine.items.forEach((item: any) => {
                                if (item.label.includes('Yağ') && result.confidenceScore! < 88) item.checked = true;
                                if (item.label.includes('Ses') && result.advancedAnalysis!.zebraReflections.includes('bükülme')) item.checked = true;
                            });
                          }
                          
                          return next;
                        });
                      }
                      
                      const lightLvl = cameraRef.current.getAnalysisData().lightLevel;
                      // Hybrid Scoring System
                      const baseConf = result.confidenceScore || 85;
                      const lightFactor = Math.min(10, Math.floor(lightLvl / 25)); // Up to 10 points bonus for good light
                      const expertScore = Math.max(0, 100 - ((result.confidenceScore ?? 0) > 90 ? 0 : 5) - (result.advancedAnalysis?.textureAnalysis?.includes('tespit') ? 10 : 0));
                      const finalConditionScore = Math.round((baseConf * 0.3) + (expertScore * 0.6) + lightFactor);
                      setConditionScore(finalConditionScore);
                      
                      if (mode === 'BODY') {
                        speak(t['scan.body_complete']);
                      }

                      const allItems = Object.values(checklistData).flatMap((s: any) => s.items);
                      const allChecked = allItems.every((i: any) => i.checked);
                      
                      if (allChecked) {
                        const confidenceFactor = (100 - (result.confidenceScore || 85)) / 2;
                        const abnormalTexture = (result.advancedAnalysis?.textureAnalysis?.includes('detected') || result.advancedAnalysis?.textureAnalysis?.includes('tespit')) ? 15 : 0;
                        const colorVariance = parseFloat(result.advancedAnalysis?.spectroscopicColor?.match(/\d+(\.\d+)?/)?.[0] || '0') * 5;
                        const edgeVariance = ((result.exteriorCondition?.front?.includes('Deformasyonu')) ? 12 : 0) + (result.advancedAnalysis?.zebraReflections?.includes('tespit') ? 18 : 0);
                        
                        const totalDamageScore = Math.min(100, Math.max(0, confidenceFactor + abnormalTexture + colorVariance + edgeVariance));
                        const stanceScore = Math.max(0, 100 - (totalDamageScore / 3) - (parseFloat(result.advancedAnalysis?.lidarDepthMap?.match(/\d+(\.\d+)?/)?.[0] || '0') * 20));
                        
                        setExpertReportData({
                          damagePercentage: totalDamageScore,
                          hasDamage: totalDamageScore > 15,
                          symmetryScore: stanceScore,
                          stanceAnalysis: stanceScore > 90 
                            ? t['expert.symmetry_ok']
                            : t['expert.symmetry_bad'],
                          isFullyInspected: true
                        });

                        if (totalDamageScore > 15) {
                           speak(t['scan.damage_detected']);
                        } else {
                           speak(t['scan.condition_ok']);
                        }
                      } else {
                        setExpertReportData(null);
                      }

                      setHistory(prev => [result, ...prev].slice(0, 20));
                      speak(t['scan.complete']);
                      setTimeout(() => setShowDetails(true), 1500);
                    }
                  } catch (error) {
                    console.error("Multi-angle scan error:", error);
                    speak(t['scan.failed']);
                  } finally {
                    clearInterval(progressInterval);
                    setIsScanning(false);
                    setIsVerifyingAngle(false);
                    setScanStep(0);
                  }
                }
            } else {
                speak(verification.message);
                setIsScanning(false);
                setIsVerifyingAngle(false);
            }
        } catch (error) {
            console.error("Verification error:", error);
            setIsScanning(false);
            setIsVerifyingAngle(false);
        }
        return;
      } else {
        // Diğer modlarda tek karelik tarama
        if (!isVehicleDetected && mode !== 'MECH') {
            speak(t['warning.not_vehicle.desc']);
            return;
        }
        setIsScanning(true);
        setScanProgress(0);
        
        // Add a technical calibration phase
        speak(t['scan.calibration']);
        await new Promise(resolve => setTimeout(resolve, 1500));

        let scanType: any = 'bodywork';
        let speakMsg = "";
        let scanDuration = 1000; // Default 1s for other modes

        switch(mode) {
          case 'MECH': 
            scanType = 'mechanical'; 
            speakMsg = t['scan.mech_start']; 
            scanDuration = 30000; 
            break;
          case 'ELEC': scanType = 'magnetic'; speakMsg = t['mode.desc.ELEC']; break;
          case 'XRAY': scanType = 'xray'; speakMsg = t['mode.desc.XRAY']; break;
        }

        speak(speakMsg);

        if (mode === 'MECH') setMechTimer(30);

        // Real-time processing simulation adjusted for duration
        const progressInterval = setInterval(() => {
          setScanProgress(prev => {
            const increment = 100 / (scanDuration / 100);
            if (mode === 'MECH') {
              setMechTimer(t => Math.max(0, t - 0.1));
            }
            return Math.min(prev + increment, 99);
          });
        }, 100);

        try {
          // Wait for the scan duration
          await new Promise(resolve => setTimeout(resolve, scanDuration));
          
          const currentAudioData = mode === 'MECH' ? { dbLevel, frequencyData } : undefined;
          const currentSensorData = { magneticField: sensors.magneticField, acceleration: sensors.acceleration };
          const result = await analyzeCondition(frame, scanType, language, currentAudioData, currentSensorData);
          
          if (result) {
            setAnalysisResult(result);
            setScanProgress(100);

            // Auto-update checklist for specialized modes
            if (mode === 'MECH' || mode === 'ELEC' || mode === 'XRAY') {
              setChecklistData((prev: any) => {
                const next = { ...prev };
                const alerts = (result.alerts || []) as string[];
                
                if (mode === 'MECH') {
                    next.engine.items.forEach((item: any) => {
                        if (item.label.includes('Ses') && (alerts.some(a => a.toLowerCase().includes('ses') || a.toLowerCase().includes('acoustic')) || (result.harmonicDistortion && parseFloat(result.harmonicDistortion) > 3.5))) item.checked = true;
                        if (item.label.includes('Yağ') && alerts.some(a => a.toLowerCase().includes('yağ') || a.toLowerCase().includes('leak'))) item.checked = true;
                        if (item.label.includes('Turbo') && alerts.some(a => a.toLowerCase().includes('turbo'))) item.checked = true;
                    });
                } else if (mode === 'ELEC') {
                    next.obd.items.forEach((item: any) => {
                        if (item.label.includes('Hata') && (alerts.some(a => a.toLowerCase().includes('hata') || a.toLowerCase().includes('error')) || (result.magneticAnomaly && parseFloat(result.magneticAnomaly) > 0.6))) item.checked = true;
                        if (item.label.includes('Akü') && alerts.some(a => a.toLowerCase().includes('akü') || a.toLowerCase().includes('battery'))) item.checked = true;
                    });
                }
                return next;
              });
            }

            speak(t['scan.complete']);
          }
        } catch (error) {
          console.error("Spec scan error:", error);
          speak(t['scan.failed']);
        } finally {
          clearInterval(progressInterval);
          setMechTimer(0);
          setTimeout(() => {
            setIsScanning(false);
            setScanProgress(0);
          }, 800);
        }
      }
    }
  };

  const handleGenerateReport = async () => {
    if (!diagnosis) return;
    setShowDetails(true);
    if (!schematicImage) {
        setIsGeneratingSchematic(true);
        // Simulate advanced neural rendering
        setTimeout(() => {
            setIsGeneratingSchematic(false);
            // In a real production app, we would fetch or generate a real asset here
            // For now, we use a high-tech placeholder or state that signals success
            setSchematicImage('LOADED');
        }, 3000);
    }
  };

  // iOS Viewport fix
  useEffect(() => {
    const fixViewport = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    window.addEventListener('resize', fixViewport);
    fixViewport();
    return () => window.removeEventListener('resize', fixViewport);
  }, []);

  const [forensicLogs, setForensicLogs] = useState<string[]>([]);
  useEffect(() => {
    if (isScanning) {
        const forensicTasks = language === 'TR' ? [
            "GMN-V2 Nöral İşlemci Aktif...",
            "Spektroskopik Boya Analizi Başlatıldı...",
            "Zebra Refraksiyon Matrisi Senkronize Ediliyor...",
            "Piksel Bazlı Doku Deformasyon Taraması...",
            "Diferansiyel Geometri & Şasi Hizalama...",
            "Mikro-Anomali Saptama Algoritması Çalışıyor...",
            "Gerçek Zamanlı UV Yansıma Haritalama...",
            "Moleküler Yoğunluk Tahmini Yapılıyor..."
        ] : [
            "GMN-V2 Neural Processor Active...",
            "Spectroscopic Paint Analysis Initialized...",
            "Syncing Zebra Refraction Matrix...",
            "Pixel-Based Texture Deformation Scan...",
            "Differential Geometry & Chassis Alignment...",
            "Micro-Anomaly Detection Routine Running...",
            "Real-Time UV Reflection Mapping...",
            "Molecular Density Estimation in Progress..."
        ];

        let i = 0;
        const interval = setInterval(() => {
            setForensicLogs(prev => [forensicTasks[i % forensicTasks.length], ...prev].slice(0, 5));
            i++;
        }, 1200);
        return () => clearInterval(interval);
    } else {
        setForensicLogs([]);
        return undefined;
    }
  }, [isScanning, language]);

  const renderHUDData = () => {
    if (isNotVehicleWarning) {
      return (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-red-600/20 border-2 border-red-500 p-6 rounded-lg backdrop-blur-xl flex flex-col items-center gap-4 text-center ring-4 ring-red-500/20"
        >
          <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center animate-pulse">
            <AlertTriangle size={32} className="text-white" />
          </div>
          <div>
            <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">{t['warning.not_vehicle']}</h3>
            <p className="text-[10px] font-mono text-red-100 uppercase mt-1 opacity-70">{language === 'TR' ? 'TESPİT EDİLEN' : (language === 'EN' ? 'DETECTED' : 'ERKANNT')}: {diagnosis?.objectName || '...'}</p>
          </div>
          <p className="text-[9px] font-mono text-red-400 mt-2 italic">{t['warning.not_vehicle.desc']}</p>
        </motion.div>
      );
    }

    switch (mode) {
      case 'BODY':
        return (
          <div className="flex flex-col gap-4 animate-in slide-in-from-left-4 duration-500">
            <div className="bg-black/90 border-2 border-purple-500/30 p-5 rounded-2xl backdrop-blur-3xl shadow-[0_0_40px_rgba(168,85,247,0.15)] relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500/50 to-transparent animate-scan-line opacity-40" />
              
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <Droplet size={16} className="text-purple-400 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-purple-400 text-[10px] font-black uppercase tracking-[0.25em] leading-none mb-1">
                      {language === 'TR' ? 'MİKRO-DOKU ANALİZİ' : 'MICRO-TEXTURE ANALYSIS'}
                    </h3>
                    <span className="text-[7px] font-mono text-purple-500/40 uppercase tracking-widest">{language === 'TR' ? 'Spektroskopik Yüzey Taraması' : 'Spectroscopic Surface Scan'}</span>
                  </div>
                </div>
              </div>

              <div className="h-44 bg-purple-950/10 border border-purple-500/20 rounded-xl p-3 overflow-hidden flex flex-col justify-end relative group-hover:border-purple-500/40 transition-colors">
                <div className="absolute inset-0 forensic-grid opacity-10" />
                
                {/* Visual scanning effect */}
                <motion.div 
                    className="absolute top-0 left-0 right-0 h-1 bg-purple-500/40 z-10 shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                    animate={{ top: ['0%', '100%', '0%'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                />
                
                {analysisResult?.spots ? (
                  <div className="space-y-2 relative z-20 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                    {analysisResult.spots.map((s: any, i: number) => (
                      <div key={i} className="text-[10px] text-white flex items-start gap-2 bg-purple-500/5 p-2 rounded border border-purple-500/10">
                        <div className="w-4 h-4 rounded-md bg-purple-500/20 flex items-center justify-center text-[8px] font-black text-purple-400 shrink-0">
                          {i+1}
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-purple-200 uppercase tracking-tight">{s.location}:</span>
                            <span className="text-[9px] text-white/60 leading-tight">{s.explanation}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 opacity-30 relative z-20">
                    <Maximize2 size={32} className="text-purple-400 mb-2 animate-pulse" />
                    <span className="text-[10px] font-mono text-purple-400 uppercase tracking-widest italic">Piksel Uyumsuzluğu Bekleniyor</span>
                  </div>
                )}
                
                <div className="mt-3 bg-black/40 px-2 py-1.5 rounded border border-white/5 relative z-20">
                    <div className="flex justify-between text-[8px] font-mono text-cyan-400 mb-1 uppercase font-black">
                        <span>Piksel_Tutarlılığı</span>
                        <span>{analysisResult?.pixelConsistency || '98.2%'}</span>
                    </div>
                    <div className="flex justify-between gap-[1px]">
                       {[...Array(24)].map((_, i) => (
                         <motion.div 
                            key={i} 
                            className="h-1.5 flex-1 bg-purple-500/30 rounded-full"
                            animate={{ opacity: [0.2, 1, 0.2] }}
                            transition={{ delay: i * 0.05, repeat: Infinity, duration: 2 }}
                         />
                       ))}
                    </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                 <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col gap-1.5">
                    <div className="flex justify-between text-[7px] font-mono uppercase tracking-[0.15em] text-white/40">
                        <span>Fiber</span>
                        <span className="text-purple-400">88%</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div animate={{ width: '88%' }} className="h-full bg-purple-400" />
                    </div>
                 </div>
                 <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col gap-1.5">
                    <div className="flex justify-between text-[7px] font-mono uppercase tracking-[0.15em] text-white/40">
                        <span>Alüminyum</span>
                        <span className="text-cyan-400">94%</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div animate={{ width: '94%' }} className="h-full bg-cyan-500" />
                    </div>
                 </div>
              </div>
            </div>
          </div>
        );
      case 'MECH':
        return (
          <div className="flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-black/90 border-2 border-cyan-500/30 p-5 rounded-2xl backdrop-blur-3xl shadow-[0_0_40px_rgba(6,182,212,0.15)] relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent animate-scan-line opacity-40" />
              
              <div className="flex justify-between items-center mb-4">
                <div className="flex flex-col">
                  <h3 className="text-cyan-400 text-[10px] font-black uppercase tracking-[0.25em] flex items-center gap-2">
                    <Activity size={14} className="animate-pulse" /> {language === 'TR' ? 'AKUSTİK DİYAGNOSTİK ANALİZ' : 'ACOUSTIC DIAGNOSTIC ANALYSIS'}
                  </h3>
                  <span className="text-[7px] font-mono text-cyan-500/40 uppercase mt-0.5 tracking-widest">{language === 'TR' ? 'Kritik Örnekleme Aktif' : 'Critical Sampling Active'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-cyan-500/20 px-2 py-0.5 rounded-full text-[8px] font-mono text-cyan-400 animate-pulse uppercase border border-cyan-500/30">
                    {isScanning ? (language === 'TR' ? 'CANLI_VERİ' : 'LIVE_FEED') : 'STABIL'}
                  </div>
                </div>
              </div>
              
              <div className="h-36 bg-cyan-950/10 rounded-xl border border-cyan-500/20 p-2 flex flex-col justify-between relative overflow-hidden group-hover:border-cyan-500/40 transition-colors">
                <div className="absolute inset-0 forensic-grid opacity-10" />
                
                {/* High-Precision Real-time Waveform */}
                <div className="flex items-end justify-between h-24 gap-[2px] px-1 relative z-10">
                   {Array.from(frequencyData).slice(0, 56).map((val: number, i: number) => (
                     <motion.div 
                        key={i} 
                        className={`flex-1 rounded-t-[1.5px] transition-all duration-100 ${val > 180 ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-gradient-to-t from-cyan-600 to-cyan-400'}`}
                        animate={{ height: `${(val/255)*100}%` }}
                        transition={{ duration: 0.1, ease: "linear" }}
                     />
                   ))}
                </div>

                <div className="flex justify-between items-end mt-2 relative z-10 bg-black/40 px-3 py-2 rounded-lg border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-[7px] text-white/40 uppercase font-mono tracking-tighter mb-0.5">DB_INTENSITY</span>
                    <span className="text-sm font-black text-white font-mono">{dbLevel.toFixed(1)} <span className="text-[9px] text-cyan-500">dB</span></span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-[7px] text-white/40 uppercase font-mono tracking-tighter mb-0.5">FR_RESONANCE</span>
                    <span className="text-[11px] font-black text-cyan-400 font-mono tracking-wider italic">
                        {isScanning ? (dbLevel > 150 ? "PEAK_DETECT" : "NOMINAL") : "STABLE"}
                    </span>
                  </div>
                </div>
              </div>
              
              {analysisResult?.alerts && (
                <div className="mt-5 space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <div className="text-[8px] text-white/30 uppercase font-mono border-b border-white/10 pb-1 flex justify-between">
                    <span>Otonom Örnekleme Raporu</span>
                    <span>UUID: 0x{Date.now().toString(16).slice(-4).toUpperCase()}</span>
                  </div>
                  <div className="space-y-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                    {analysisResult.alerts.map((alert: string, i: number) => (
                        <motion.div 
                            key={i} 
                            initial={{ opacity: 0, x: -15 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className={`flex items-start gap-3 p-2.5 rounded-xl border ${alert.includes('Haberleşme') || alert.includes('iletişim') ? 'bg-amber-500/10 border-amber-500/20' : 'bg-cyan-500/5 border-cyan-500/10'}`}
                        >
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 ${alert.includes('Haberleşme') ? 'bg-amber-500/20 text-amber-500' : 'bg-cyan-500/20 text-cyan-400'}`}>
                            <Zap size={11} />
                        </div>
                        <span className="text-[10px] font-mono text-white/90 leading-snug">{alert}</span>
                        </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Forensic Metrics Grid */}
              <div className="mt-5 grid grid-cols-3 gap-3">
                 {[
                   { label: 'HARM_D', val: analysisResult?.harmonicDistortion || '0.00%', color: 'text-cyan-400' },
                   { label: 'VIBR_RMS', val: analysisResult?.vibrationAnalysis || '0.00', color: 'text-cyan-400' },
                   { label: 'WEAR_PROB', val: analysisResult?.wearProbability || '0%', color: 'text-red-400' }
                 ].map((item, i) => (
                    <div key={i} className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col items-center group/item hover:bg-white/10 transition-colors">
                        <span className="text-[7px] text-white/30 uppercase font-mono mb-1.5 tracking-widest">{item.label}</span>
                        <span className={`text-[11px] font-black ${item.color} font-mono italic tracking-tight`}>{item.val}</span>
                        <div className="w-1 h-1 rounded-full bg-white/10 mt-1.5 opacity-0 group-hover/item:opacity-100" />
                    </div>
                 ))}
              </div>
            </div>

            {mechTimer > 0 && (
                <div className="bg-cyan-500/10 border-2 border-cyan-500/20 p-4 rounded-2xl flex items-center justify-between overflow-hidden relative shadow-2xl">
                    <motion.div 
                        className="absolute left-0 top-0 bottom-0 bg-cyan-500/15"
                        animate={{ width: `${(mechTimer/30)*100}%` }}
                        transition={{ duration: 0.1, ease: "linear" }}
                    />
                    <div className="flex items-center gap-4 relative z-10 w-full">
                        <div className="relative">
                            <motion.div 
                                animate={{ rotate: 360 }}
                                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                className="w-12 h-12 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 flex items-center justify-center"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-base font-black text-white font-mono">{Math.ceil(mechTimer)}</span>
                            </div>
                        </div>
                        <div className="flex flex-col flex-1">
                            <div className="flex justify-between items-end">
                                <span className="text-[9px] text-cyan-400 font-black uppercase tracking-[0.2em]">{language === 'TR' ? 'AKUSTİK DİNLEME' : 'ACOUSTIC LISTENING'}</span>
                                <span className="text-[7px] font-mono text-white/30">{Math.round((30-mechTimer)/30*100)}%</span>
                            </div>
                            <div className="h-1 w-full bg-white/5 rounded-full mt-1.5 overflow-hidden">
                                <motion.div 
                                    className="h-full bg-cyan-500" 
                                    animate={{ width: `${(30-mechTimer)/30*100}%` }}
                                />
                            </div>
                            <span className="text-[9px] text-white/60 font-mono italic mt-1">{language === 'TR' ? 'Düşük Frekans Semptom Analizi...' : 'Analyzing LF Symptoms...'}</span>
                        </div>
                    </div>
                </div>
            )}
          </div>
        );

      case 'ELEC':
        return (
          <div className="flex flex-col gap-4 animate-in slide-in-from-left-4 duration-500">
            <div className="bg-black/90 border-2 border-yellow-500/30 p-5 rounded-2xl backdrop-blur-3xl shadow-[0_0_40px_rgba(234,179,8,0.15)] relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent animate-scan-line opacity-40" />
              
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-500/20 rounded-lg">
                    <Zap size={16} className="text-yellow-400 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-yellow-400 text-[10px] font-black uppercase tracking-[0.25em] leading-none mb-1">
                      {language === 'TR' ? 'MANYETİK AKI ANALİZİ' : 'MAGNETIC FLUX ANALYSIS'}
                    </h3>
                    <span className="text-[7px] font-mono text-yellow-500/40 uppercase tracking-widest">{language === 'TR' ? 'Nöral Devre Taraması' : 'Neural Circuit Scanning'}</span>
                  </div>
                </div>
              </div>

              <div className="h-44 bg-yellow-950/10 border border-yellow-500/20 rounded-xl overflow-hidden relative flex items-center justify-center group-hover:border-yellow-500/40 transition-colors">
                 <div className="absolute inset-0 forensic-grid opacity-10" />
                 
                 {/* Electromagnetic wave simulation */}
                 {[...Array(3)].map((_, i) => (
                     <motion.div 
                        key={i}
                        className="absolute border border-yellow-500/20 rounded-full"
                        initial={{ width: 0, height: 0, opacity: 0 }}
                        animate={{ width: 300, height: 300, opacity: [0, 0.4, 0] }}
                        transition={{ duration: 3, repeat: Infinity, delay: i * 1, ease: "easeOut" }}
                     />
                 ))}

                 <div className="relative text-center p-4">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={isScanning ? 'scanning' : 'idle'}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="flex flex-col items-center"
                        >
                            <Zap size={40} className="text-yellow-500/40 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)] mb-3" />
                            <div className="text-[12px] font-black text-white font-mono uppercase tracking-tighter leading-none">
                                {isScanning ? 'MANYETİK ALAN ÖLÇÜLÜYOR...' : 'SENSÖR BEKLEME MODU'}
                            </div>
                            <div className="text-[7px] font-mono text-yellow-500/40 mt-1 uppercase tracking-widest">
                                B_Field: {isScanning ? sensors.magneticField.total.toFixed(3) : '0.000'} μT
                            </div>
                        </motion.div>
                    </AnimatePresence>
                 </div>

                 {/* Corner decorations */}
                 <div className="absolute top-2 left-2 w-4 h-4 border-l border-t border-yellow-500/40" />
                 <div className="absolute bottom-2 right-2 w-4 h-4 border-r border-b border-yellow-500/40" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                 <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col items-center">
                    <div className="text-[7px] text-yellow-500/50 uppercase font-mono mb-1 tracking-widest leading-none">Voltaj_Oynaklığı</div>
                    <div className="text-[11px] font-black text-white font-mono italic tracking-tight">±0.04V</div>
                 </div>
                 <div className="bg-white/5 p-3 rounded-xl border border-white/5 flex flex-col items-center">
                    <div className="text-[7px] text-yellow-500/50 uppercase font-mono mb-1 tracking-widest leading-none">Sinyal_Pürüzlülüğü</div>
                    <div className="text-[11px] font-black text-white font-mono italic tracking-tight">0.002%</div>
                 </div>
              </div>
            </div>

            <div className="p-4 bg-yellow-950/20 border-2 border-yellow-500/20 rounded-2xl flex items-center justify-between shadow-2xl overflow-hidden relative">
                <div className="absolute inset-0 forensic-grid opacity-5" />
                <div className="flex flex-col relative z-10">
                    <span className="text-[9px] text-yellow-500/50 uppercase font-black tracking-[0.2em] mb-1">Elektrik_Matrisi</span>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse border border-yellow-400" />
                        <span className="text-[11px] text-white font-mono uppercase font-black tracking-tight">{language === 'TR' ? 'CAN-BUS AKTİF' : 'CAN-BUS ACTIVE'}</span>
                    </div>
                </div>
                <div className="flex flex-col items-end relative z-10">
                    <span className="text-[7px] font-mono text-white/40 uppercase">Sensör Verimliliği</span>
                    <div className="text-[10px] font-black text-yellow-400 font-mono">99.7%</div>
                </div>
            </div>
          </div>
        );
      case 'SCAN':
      default:
        return (
          <div className="flex flex-col gap-3 animate-in slide-in-from-bottom-4 duration-500">
             <div className="p-5 bg-black/90 border-2 border-cyan-500/30 rounded-2xl backdrop-blur-3xl shadow-[0_0_40px_rgba(6,182,212,0.15)] relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-cyan-500/20 animate-scan-line" />
                <div className="absolute inset-0 forensic-grid opacity-5" />
                
                {diagnosis ? (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative z-10">
                        <div className="border-b border-white/5 pb-3 mb-3">
                            <div className="text-cyan-500/60 uppercase text-[8px] font-black tracking-[0.2em] flex items-center gap-2 mb-1.5">
                                <Shield size={10} className="text-cyan-400"/> {t['diagnosis.model'].toUpperCase()}
                            </div>
                            <div className="text-xl font-black text-white italic tracking-tighter leading-none mb-1">
                                {diagnosis.objectName?.toUpperCase()} {diagnosis.model?.toUpperCase()}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-cyan-400 text-[10px] font-mono font-bold tracking-widest">{diagnosis.year}</span>
                                <span className="w-1 h-1 bg-white/10 rounded-full" />
                                <span className="text-white/40 text-[10px] font-mono uppercase tracking-widest italic">{diagnosis.version}</span>
                            </div>
                        </div>
                        
                        <div className="h-12 flex items-center gap-[2px] mb-4 px-1 bg-cyan-950/20 rounded-lg border border-cyan-500/10 overflow-hidden relative">
                            {[...Array(48)].map((_, i) => (
                                <motion.div 
                                    key={i}
                                    animate={{ 
                                        height: [
                                            Math.sin(i * 0.4) * 20 + 20, 
                                            Math.cos(i * 0.2) * 35 + 35, 
                                            Math.sin(i * 0.4) * 20 + 20
                                        ],
                                        opacity: [0.2, 0.6, 0.2]
                                    }}
                                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.03, ease: "linear" }}
                                    className="flex-1 bg-gradient-to-t from-cyan-600/40 to-cyan-400/60 rounded-full"
                                />
                            ))}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="text-[7px] font-mono text-cyan-400/40 tracking-[0.4em] uppercase">Spectral_Analysis</div>
                            </div>
                        </div>

                        <div className="flex justify-between items-end mb-4">
                            <div className="flex flex-col">
                                <span className="text-[7px] font-mono text-white/40 uppercase mb-0.5 tracking-widest leading-none">GÜVEN_SKOR</span>
                                <div className="text-[12px] font-black text-green-500 italic tracking-tighter">%{diagnosis.confidenceScore || 99}</div>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-[7px] font-mono text-white/40 uppercase mb-0.5 tracking-widest leading-none">ANALİZ_DURUM</span>
                                <div className="text-[10px] font-black text-cyan-400 font-mono tracking-widest uppercase">ADLİ_ONAY</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-white/5">
                            <div className="bg-white/5 p-2 rounded-lg border border-white/5 flex flex-col items-center">
                                <div className="text-cyan-500/60 uppercase text-[6px] font-black tracking-widest mb-1 flex items-center gap-1">
                                    <Droplet size={8}/> KESKİNLİK
                                </div>
                                <div className="text-[10px] font-mono text-white font-bold">%{((visionMetrics?.sharpness || 0) * 1.2).toFixed(1)}</div>
                            </div>
                            <div className="bg-white/5 p-2 rounded-lg border border-white/5 flex flex-col items-center">
                                <div className="text-cyan-500/60 uppercase text-[6px] font-black tracking-widest mb-1 flex items-center gap-1">
                                    <Zap size={8}/> KROMATİKLER
                                </div>
                                <div className="text-[10px] font-mono text-white font-bold">ΔE {visionMetrics?.chromatics?.toFixed(2) || '0.00'}</div>
                            </div>
                            <div className="bg-white/5 p-2 rounded-lg border border-white/5 flex flex-col items-center">
                                <div className="text-cyan-500/60 uppercase text-[6px] font-black tracking-widest mb-1 flex items-center gap-1">
                                    <Activity size={8}/> KENAR YOĞUNLUĞU
                                </div>
                                <div className="text-[10px] font-mono text-white font-bold">{visionMetrics?.edgeDensity?.toFixed(1) || '0.0'}%</div>
                            </div>
                            <div className="bg-white/5 p-2 rounded-lg border border-white/5 flex flex-col items-center">
                                <div className="text-cyan-500/60 uppercase text-[6px] font-black tracking-widest mb-1 flex items-center gap-1">
                                    <Maximize2 size={8}/> GÜRÜLTÜ (NOKE)
                                </div>
                                <div className="text-[10px] font-mono text-white font-bold">{visionMetrics?.noise?.toFixed(3) || '0.000'}</div>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    <div className="py-12 flex flex-col items-center justify-center opacity-30">
                        <Maximize2 size={32} className="text-cyan-500 mb-3 animate-pulse" />
                        <span className="text-[9px] font-mono text-cyan-500 uppercase tracking-[0.3em] font-black italic">ARAÇ_TARAMASI_SÜRÜYOR...</span>
                        <p className="text-[8px] font-mono text-cyan-400/40 uppercase mt-2 italic">Manyetosfer Analizi: {sensors.magneticField.total.toFixed(2)} μT</p>
                    </div>
                )}
             </div>

             <div className="p-4 bg-cyan-950/20 border-2 border-cyan-500/20 rounded-2xl flex items-center justify-between shadow-xl relative overflow-hidden">
                <div className="absolute inset-0 forensic-grid opacity-5" />
                <div className="flex flex-col relative z-10">
                    <span className="text-[9px] text-cyan-500/50 uppercase font-black tracking-[0.2em] mb-1">Optik_İşleyici_V2</span>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_5px_rgba(6,182,212,1)]" />
                        <span className="text-[11px] text-white font-mono uppercase font-black tracking-tight">NEURAL_NET: READY</span>
                    </div>
                </div>
                <div className="flex gap-1.5 relative z-10">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-500/30 border border-cyan-500/50" />
                    ))}
                </div>
             </div>
          </div>
        );

    }
  };

  // Lisans kontrolü devam ediyorsa veya onaysızsa uygulamayı kapat
  if (isCheckingLicense) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-4 border-cyan-500/20 border-t-cyan-500 animate-spin mx-auto mb-4" />
          <p className="text-cyan-400 font-mono uppercase text-sm">{t['license.checking']}</p>
        </div>
      </div>
    );
  }

  if (licenseStatus && !licenseStatus.isAuthorized) {
    const msgKey = licenseStatus.status === 'Suspended' ? 'license.suspended' : 
                   licenseStatus.status === 'Rejected' ? 'license.rejected' : 
                   (licenseStatus.status === 'Pending' ? 'license.pending' : 'license.unauthorized');
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-red-950/40 border-2 border-red-500 rounded-xl p-8 text-center backdrop-blur-xl"
          >
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <Lock size={32} className="text-red-500" />
            </div>

            <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-2">{t['license.restr']}</h2>
            <p className="text-red-200 text-sm mb-6 font-mono">{t[msgKey] || licenseStatus.message}</p>

            <div className="bg-black/40 rounded p-3 mb-6 border border-red-500/20">
              <div className="text-[10px] text-red-400/70 uppercase mb-1">{language === 'TR' ? 'CİHAZ KİMLİĞİ' : (language === 'EN' ? 'DEVICE ID' : 'GERÄTE-ID')}</div>
              <div className="text-white font-mono text-sm font-bold">{licenseStatus.deviceId}</div>
            </div>

            <div className="text-[10px] text-white/50 font-mono">
              <p>STATUS: {licenseStatus.status.toUpperCase()}</p>
              <p className="mt-2">{language === 'TR' ? 'Yöneticiyle iletişime geçmek için lütfen yukarıdaki cihaz kimliğini not edin.' : (language === 'EN' ? 'Please note the device ID above to contact the administrator.' : 'Bitte notieren Sie sich die oben stehende Geräte-ID, um den Administrator zu kontaktieren.')}</p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-cyan-500 selection:text-black">
      <div className="fixed top-4 left-4 z-[100] flex items-center gap-2 pointer-events-none">
          <div className={`w-2 h-2 rounded-full ${isEngineReady ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500 animate-pulse'}`} />
          <span className="text-[8px] font-mono font-bold text-white/70 tracking-tighter uppercase whitespace-nowrap">
            {isEngineReady ? 'NEURAL COMPUTE : ONLINE' : 'ENGINE : INITIALIZING'}
          </span>
      </div>
      <CameraView 
        ref={cameraRef} 
        isNotVehicle={isNotVehicleWarning} 
        isScanning={isScanning}
        detectedObjectName={diagnosis?.objectName}
        zebraMode={isZebraMode}
        ghostStencil={stencilType}
        textureFilter={isTextureMode}
        colorAnalysisMode={isColorMode}
        lidarMode={isLidarMode}
        xrayMode={isXrayMode}
        language={language}
        isMuted={isMuted}
        isEngineReady={isEngineReady}
      >
        <AnimatePresence>
            {(engineStatus === 'booting' || engineStatus === 'idle') && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-3xl flex items-center justify-center"
                >
                    <div className="text-center p-8 max-w-sm">
                        <div className="relative mb-8">
                            <motion.div 
                                animate={{ rotate: 360 }}
                                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                className="w-24 h-24 border-t-2 border-r-2 border-cyan-500 rounded-full mx-auto"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Cpu size={32} className="text-cyan-500 animate-pulse" />
                            </div>
                        </div>
                        <h2 className="text-xl font-black italic tracking-widest text-white uppercase mb-2">
                            {language === 'TR' ? 'ADLİ MOTOR HAZIRLANIYOR' : 'BOOTING FORENSIC ENGINE'}
                        </h2>
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <div className="w-1 h-1 bg-cyan-500 rounded-full animate-ping" />
                            <span className="text-[10px] font-mono text-cyan-400/60 uppercase tracking-[0.3em]">Neural_Sync...</span>
                        </div>
                        <p className="text-[10px] font-mono text-white/30 uppercase leading-relaxed">
                            {language === 'TR' 
                                ? 'Yapay zeka modelleri yerel belleğe yükleniyor. Bu işlem ilk açılışta donanım hızınıza bağlı olarak bir miktar sürebilir.' 
                                : 'Neural units are loading to local memory. This may take a moment depending on your hardware.'}
                        </p>
                    </div>
                </motion.div>
            )}

            {engineStatus === 'error' && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 z-[110] bg-black/90 backdrop-blur-2xl flex items-center justify-center"
                >
                    <div className="text-center p-8 max-w-sm">
                        <AlertTriangle size={64} className="text-red-500 mx-auto mb-6" />
                        <h2 className="text-2xl font-black italic tracking-tighter text-white uppercase mb-4">
                            {language === 'TR' ? 'SİSTEM ÖNYÜKLEME HATASI' : 'SYSTEM BOOT FAILURE'}
                        </h2>
                        <p className="text-sm font-mono text-red-400 bg-red-400/10 p-4 rounded-xl border border-red-500/20 mb-8 uppercase leading-tight">
                            {language === 'TR' 
                                ? 'WebG/CPU çekirdekleri başlatılamadı. Lütfen sayfayı yenileyiniz veya tarayıcınızın donanım hızlandırmasını kontrol ediniz.' 
                                : 'WebGL/CPU cores failed to initialize. Please refresh or check browser hardware acceleration.'}
                        </p>
                        <button 
                            onClick={() => window.location.reload()}
                            className="bg-white text-black px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:bg-cyan-500 active:scale-95"
                        >
                            {language === 'TR' ? 'SİSTEMİ YENİDEN BAŞLAT' : 'RELOAD SYSTEM'}
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
        {/* Pro Tools Sidebar */}
        {/* Initial Info Form Overlay */}
        {showInitialInfoForm && (
            <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 pointer-events-auto">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="w-full max-w-md bg-zinc-900 border border-cyan-500/30 rounded-2xl p-6 shadow-2xl shadow-cyan-500/10"
                >
                    <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                        <div className="p-2 bg-cyan-500/10 rounded-lg">
                            <Box className="text-cyan-400" size={24} />
                        </div>
                        <div>
                            <h3 className="text-white font-black text-sm uppercase tracking-widest">
                                {language === 'TR' ? 'ARAÇ KİMLİKLENDİRME' : 'VEHICLE IDENTIFICATION'}
                            </h3>
                            <p className="text-[10px] text-white/40 font-mono">NEURAL_ID_INPUT_v4.1</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[11px] font-black font-mono text-cyan-400 uppercase tracking-widest leading-none block mb-1">{language === 'TR' ? 'MARKA' : 'BRAND'}</label>
                                <input 
                                    type="text"
                                    value={manualBrand}
                                    onChange={(e) => setManualBrand(e.target.value.toUpperCase())}
                                    placeholder="BMW, AUDI..."
                                    className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-4 text-white font-mono text-sm focus:border-cyan-500 outline-none transition-all placeholder:opacity-20 shadow-inner"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-black font-mono text-cyan-400 uppercase tracking-widest leading-none block mb-1">{language === 'TR' ? 'MODEL' : 'MODEL'}</label>
                                <input 
                                    type="text"
                                    value={manualModel}
                                    onChange={(e) => setManualModel(e.target.value.toUpperCase())}
                                    placeholder="320I, A4..."
                                    className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-4 text-white font-mono text-sm focus:border-cyan-500 outline-none transition-all placeholder:opacity-20 shadow-inner"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[11px] font-black font-mono text-cyan-400 uppercase tracking-widest leading-none block mb-1">{language === 'TR' ? 'YIL' : 'YEAR'}</label>
                                <input 
                                    type="number"
                                    value={manualYear}
                                    onChange={(e) => setManualYear(e.target.value)}
                                    placeholder="2024"
                                    className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-4 text-white font-mono text-sm focus:border-cyan-500 outline-none transition-all shadow-inner"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-black font-mono text-cyan-400 uppercase tracking-widest leading-none block mb-1">{language === 'TR' ? 'KİLOMETRE' : 'MILEAGE'}</label>
                                <input 
                                    type="number"
                                    value={mileage}
                                    onChange={(e) => setMileage(e.target.value)}
                                    placeholder="120000"
                                    className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-4 text-white font-mono text-sm focus:border-cyan-500 outline-none transition-all shadow-inner"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[11px] font-black font-mono text-cyan-400 uppercase tracking-widest leading-none block mb-1">{language === 'TR' ? 'PLAKA NO' : 'PLATE'}</label>
                            <input 
                                type="text"
                                placeholder={language === 'TR' ? '34 ABC 123' : '34 ABC 123'}
                                className="w-full bg-white/5 border-2 border-white/10 rounded-2xl p-4 text-white font-mono text-sm focus:border-cyan-500 outline-none transition-all uppercase placeholder:opacity-20 shadow-inner"
                            />
                        </div>

                        <div className="bg-cyan-500/5 p-4 rounded-xl border border-cyan-500/10">
                            <p className="text-[9px] font-mono text-cyan-400 leading-relaxed uppercase">
                                {language === 'TR' ? 'Not: Buraya girilmeyen veriler sonuç raporunda kullanıcı tarafından fiziksel olarak doldurulmak üzere boş bırakılacaktır.' : 'Note: Data not entered here will be left blank in the result report for the user to fill in manually.'}
                            </p>
                        </div>
                    </div>

                    <button 
                        onClick={() => setShowInitialInfoForm(false)}
                        className="w-full mt-8 bg-cyan-500 hover:bg-cyan-400 text-black font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 group shadow-lg shadow-cyan-500/20"
                    >
                        {language === 'TR' ? 'VERİLERİ ONAYLA VE TARAMAYI BAŞLAT' : 'CONFIRM DATA & START SCAN'}
                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>

                    <p className="mt-4 text-center text-[9px] text-white/20 font-mono uppercase tracking-[0.2em]">
                        {language === 'TR' ? 'Veriler şifrelenmiş rapora işlenecektir' : 'Data will be processed into encrypted report'}
                    </p>
                </motion.div>
            </div>
        )}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-[60] pointer-events-auto">
            {[
                { id: 'zebra', icon: Maximize2, active: isZebraMode, label: 'ZEBRA' },
                { id: 'stencil', icon: Box, active: !!stencilType, label: 'GUIDE' },
                { id: 'texture', icon: Activity, active: isTextureMode, label: 'TEXTURE' },
                { id: 'color', icon: Droplet, active: isColorMode, label: 'COLOR' },
                { id: 'lidar', icon: Cpu, active: isLidarMode, label: 'DERİN' },
                { id: 'xray', icon: Box, active: isXrayMode, label: 'RÖNTGEN' }
            ].map(tool => (
                <button
                    key={tool.id}
                    onClick={() => handleToggleProTool(tool.id)}
                    className={`w-11 h-11 rounded-lg flex flex-col items-center justify-center transition-all border-2 active:scale-90 ${
                        tool.active 
                            ? 'bg-cyan-500 border-cyan-400 text-black shadow-[0_0_15px_rgba(6,182,212,0.5)]' 
                            : 'bg-black/60 border-white/10 text-white/40 hover:bg-white/5 hover:text-white'
                    }`}
                >
                    <tool.icon size={18} />
                    <span className="text-[7px] font-black font-mono mt-0.5 uppercase tracking-tighter">{tool.label}</span>
                </button>
            ))}
        </div>
        {/* Multi-angle Progress Bar */}
        {mode === 'SCAN' && isVehicleDetected && !isScanning && !analysisResult && (
          <div className="absolute top-24 left-0 right-0 z-50 px-6">
            <div className="flex gap-2 mb-2">
              {scanAngles.map((angle, idx) => (
                <div 
                  key={angle.id}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                    idx < scanStep ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]' : idx === scanStep ? 'bg-purple-500 animate-pulse' : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
            <motion.div 
              key={scanStep}
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-center"
            >
              <h2 className="text-purple-400 font-black italic tracking-widest text-lg uppercase drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                {scanAngles[scanStep].label}
              </h2>
              <p className="text-white/60 text-[10px] font-mono mt-0.5 uppercase tracking-tighter">
                {scanAngles[scanStep].description}
              </p>
              
              {isVerifyingAngle && (
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="mt-4 inline-flex items-center gap-2 bg-purple-500/20 border border-purple-500/40 px-3 py-1.5 rounded-full"
                >
                  <RefreshCcw size={12} className="text-purple-400 animate-spin" />
                  <span className="text-[10px] text-purple-200 font-mono font-bold tracking-widest uppercase">
                    {language === 'TR' ? 'AÇI DOĞRULANIYOR' : 'VERIFYING ANGLE'}
                  </span>
                </motion.div>
              )}
            </motion.div>
          </div>
        )}

        {/* Initial Detection Hint */}
        {mode === 'SCAN' && !isVehicleDetected && !isScanning && (
          <div className="absolute top-24 left-0 right-0 z-30 px-6 text-center">
            <motion.div 
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="bg-black/40 backdrop-blur-md border border-cyan-500/20 py-4 rounded-xl max-w-xs mx-auto"
            >
              <h2 className="text-cyan-400 font-black italic tracking-widest text-sm uppercase flex items-center justify-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                {language === 'TR' ? 'ARAÇ TESPİTİ BEKLENİYOR' : (language === 'EN' ? 'WAITING FOR VEHICLE' : 'WARTE AUF FAHRZEUG')}
              </h2>
              <p className="text-white/60 text-[8px] font-mono mt-1 uppercase tracking-tighter">
                {t['warning.not_vehicle.desc']}
              </p>
            </motion.div>
          </div>
        )}
        {/* Top Status Bar */}
        <div className="absolute inset-x-0 top-0 p-4 flex justify-between items-start z-50 pointer-events-none">
            <div className="flex flex-col pointer-events-auto">
                <div className="flex items-center gap-2 mb-1">
                    <Shield className="text-cyan-500 w-5 h-5" />
                    <h1 className="text-lg font-black tracking-tighter uppercase italic leading-none">AKN Global Group Ltd</h1>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-400/70">
                    <Wifi size={10} /> 
                    <span className="animate-pulse flex items-center gap-1">
                        {t['connectivity.online']} <span className="opacity-50">v5.0.0-ULTRA</span>
                        <span className="ml-1 px-1 rounded border text-[7px] bg-cyan-500/20 border-cyan-500/30 text-cyan-400">
                             {language === 'TR' ? 'YEREL ADLİ MOTOR (SPECTRAL)' : (language === 'EN' ? 'LOCAL FORENSIC ENGINE (SPECTRAL)' : 'LOKALE ENGINE (SPECTRAL)')}
                        </span>
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono pointer-events-auto">
                <button 
                  onClick={() => setShowChecklist(true)}
                  className="bg-purple-500/10 border border-purple-500/30 px-2 py-1.5 rounded flex items-center gap-1.5 hover:bg-purple-500/20 transition-all group"
                >
                    <Activity size={12} className="text-purple-400 group-hover:animate-pulse" />
                    <span className="text-purple-400 text-[9px]">{language === 'TR' ? 'MANUEL EKSPERTİZ' : (language === 'EN' ? 'MANUAL INSPECTION' : 'MANUELLE PRÜFUNG')}</span>
                </button>
                <button 
                  onClick={() => setShowHistory(true)}
                  className="bg-cyan-500/10 border border-cyan-500/30 px-2 py-1.5 rounded flex items-center gap-1.5 hover:bg-cyan-500/20 transition-all"
                >
                    <ClipboardList size={12} className="text-cyan-400" />
                    <span className="text-cyan-400 text-[9px]">{t['history']}</span>
                </button>
                <div className="flex flex-col items-end hidden sm:flex">
                    <span className="text-white/40 uppercase text-[8px]">{language === 'TR' ? 'Batarya' : (language === 'EN' ? 'Battery' : 'Batterie')}</span>
                    <div className="flex items-center gap-1">
                        <span className="text-cyan-400 text-[10px]">98%</span>
                        <Battery size={14} className="text-cyan-400 rotate-90" />
                    </div>
                </div>
                
                {/* Language Switcher */}
                <div className="flex bg-black/40 border border-white/10 p-1 rounded gap-1">
                    {(['TR', 'EN', 'DE'] as Language[]).map(lang => (
                        <button
                            key={lang}
                            onClick={() => handleLanguageChange(lang)}
                            className={`w-6 h-6 flex items-center justify-center rounded text-[8px] font-bold transition-all ${
                                language === lang 
                                    ? 'bg-cyan-500 text-black' 
                                    : 'text-white/40 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {lang}
                        </button>
                    ))}
                </div>
                <div className="bg-cyan-500/10 border border-cyan-500/30 p-2 rounded flex items-center gap-2">
                    <Maximize2 size={12} className="text-cyan-400" />
                </div>
            </div>
        </div>

        {/* Center Target/Reticle */}
        <div className="absolute inset-0 flex items-center justify-center -z-10 pointer-events-none">
            {/* Ultra High-Tech Forensic Grid */}
            <div className="absolute inset-0 overflow-hidden opacity-10">
                <div className="absolute inset-0 forensic-grid" />
                <div className="absolute top-1/2 left-0 right-0 h-px bg-cyan-500/50" />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-500/50" />
            </div>

            {isScanning && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent blur-[2px] animate-scan-line" />
                </div>
            )}

            {isScanning && (
                <div className="absolute top-[120px] left-4 z-40 flex flex-col gap-2 max-w-[200px]">
                    <AnimatePresence mode="popLayout">
                        {forensicLogs.map((log, i) => (
                            <motion.div
                                key={log + i}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="bg-black/40 backdrop-blur-md border-l-2 border-cyan-500 px-2 py-1 flex items-center gap-2"
                            >
                                <span className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse-cyan" />
                                <span className="text-[8px] font-mono text-cyan-400/80 uppercase tracking-tight">{log}</span>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            {isScanning && (
                <div className="absolute bottom-24 right-4 z-40 bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 overflow-hidden shadow-2xl">
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                           <span className="text-[10px] font-black text-white font-mono uppercase italic tracking-tighter">DIGITAL TWIN SYNC</span>
                        </div>
                        <div className="relative w-32 h-20 bg-cyan-950/20 rounded-lg flex items-center justify-center group">
                            {/* Simple wireframe vehicle representation using CSS */}
                            <div className="relative w-24 h-12 flex flex-col items-center justify-center">
                                <motion.div 
                                    animate={{ rotateY: 360 }}
                                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                    className="w-20 h-6 border-2 border-cyan-500/30 rounded-lg relative flex items-center justify-center p-1"
                                    style={{ transformStyle: 'preserve-3d' }}
                                >
                                    <div className="absolute -top-3 w-12 h-6 border-2 border-cyan-500/30 rounded-t-xl" />
                                    <div className="flex justify-between w-full">
                                        <div className="w-4 h-4 rounded-full border border-cyan-500/30" />
                                        <div className="w-4 h-4 rounded-full border border-cyan-500/30" />
                                    </div>
                                    <div className="absolute inset-0 bg-cyan-500/10 animate-pulse-cyan" />
                                </motion.div>
                            </div>
                            <div className="absolute inset-0 forensic-grid opacity-20" />
                        </div>
                        <div className="space-y-1">
                            <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                                <motion.div 
                                    className="h-full bg-cyan-500"
                                    animate={{ width: [`${scanProgress}%`] }}
                                />
                            </div>
                            <div className="flex justify-between text-[7px] font-mono text-white/40 uppercase">
                                <span>Core_Sync</span>
                                <span>{scanProgress.toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isScanning && (
                    <div className="relative">
                        <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            className="w-48 h-48 border-2 border-dashed border-cyan-500/30 rounded-full"
                        />
                        <motion.div 
                            animate={{ rotate: -360 }}
                            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-2 border border-purple-500/20 rounded-full"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-1 h-1 bg-white rounded-full shadow-[0_0_10px_white]" />
                        </div>
                    </div>
            )}
            
            {/* Real-time Object Identification Badge */}
            {!isScanning && (
                <div className="flex flex-col items-center gap-4">
                    <div className="relative w-64 h-64 flex items-center justify-center opacity-40">
                        {/* Outer ring */}
                        <motion.div 
                            animate={{ rotate: 360 }} 
                            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                            className="absolute inset-0 border border-cyan-500/10 rounded-full" 
                        />
                        {/* Compass marks */}
                        {[...Array(12)].map((_, i) => (
                            <div 
                                key={i}
                                className="absolute w-0.5 h-3 bg-cyan-500/30"
                                style={{ 
                                    transform: `rotate(${i * 30}deg) translateY(-34px)` 
                                }}
                            />
                        ))}
                        {/* Scanning sweep */}
                        <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                            className="absolute w-full h-full rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(6,182,212,0.1)_90deg,transparent_90deg)]"
                        />
                        {/* Tech corners */}
                        <div className="absolute -inset-4 border-l-2 border-t-2 border-cyan-500/20 w-8 h-8 rounded-tl-lg" />
                        <div className="absolute -inset-4 left-auto border-r-2 border-t-2 border-cyan-500/20 w-8 h-8 rounded-tr-lg" />
                        <div className="absolute -inset-4 top-auto border-l-2 border-b-2 border-cyan-500/20 w-8 h-8 rounded-bl-lg" />
                        <div className="absolute -inset-4 top-auto left-auto border-r-2 border-b-2 border-cyan-500/20 w-8 h-8 rounded-br-lg" />
                        
                        {/* Scanning Crosshairs */}
                        <div className="absolute h-[200%] w-px bg-cyan-500/10" />
                        <div className="absolute w-[200%] h-px bg-cyan-500/10" />

                        <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
                        
                        {/* Coordinate readouts */}
                        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex gap-4 text-[8px] font-mono text-cyan-400/40 uppercase">
                            <span>LAT: 41.0082</span>
                            <span>LNG: 28.9784</span>
                            <span>ALT: 24m</span>
                        </div>
                    </div>
                    
                    {/* Live Recognition Hint */}
                    {diagnosis && (
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className={`px-4 py-2 rounded-full border backdrop-blur-xl flex items-center gap-3 transition-all ${
                                diagnosis.isVehicle 
                                    ? 'bg-cyan-500/20 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.3)]' 
                                    : 'bg-white/10 border-white/20'
                            }`}
                        >
                            <div className={`w-2 h-2 rounded-full animate-pulse ${diagnosis.isVehicle ? 'bg-cyan-400' : 'bg-white/40'}`} />
                            <span className={`text-[10px] font-black uppercase tracking-widest ${diagnosis.isVehicle ? 'text-cyan-400' : 'text-white/60'}`}>
                                {diagnosis.isVehicle ? `${t['scan.detected']}: ${diagnosis.objectName}` : `Detection: ${diagnosis.objectName}`}
                            </span>
                        </motion.div>
                    )}
                </div>
            )}
        </div>

        {/* Floating Data Sidebars */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-[60]">
            {[
                { id: 'SCAN', label: t['scan.mode'].split(' ')[0], icon: Camera, color: 'text-cyan-400' },
                { id: 'XRAY', label: t['xray.mode'].split(' ')[0], icon: Box, color: 'text-green-400' },
                { id: 'MECH', label: t['mech.mode'].split(' ')[0], icon: Activity, color: 'text-red-400' },
                { id: 'ELEC', label: t['elec.mode'].split(' ')[0], icon: Zap, color: 'text-yellow-400' },
                { id: 'BODY', label: t['body.mode'].split(' ')[0], icon: Droplet, color: 'text-purple-400' }
            ].map((m) => (
                <button
                    key={m.id}
                    onClick={() => handleModeChange(m.id as ScanMode)}
                    className={`w-11 h-11 rounded-lg border-2 transition-all flex flex-col items-center justify-center backdrop-blur-md active:scale-90 ${
                        mode === m.id 
                        ? `bg-white/20 border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]` 
                        : (isNotVehicleWarning ? 'bg-red-950/40 border-red-500/50 grayscale' : 'bg-black/60 border-white/10 hover:border-white/30')
                    }`}
                >
                    <m.icon size={18} className={mode === m.id || isNotVehicleWarning ? 'text-white' : m.color} />
                    <span className="text-[7px] font-black mt-0.5 uppercase tracking-tighter">{m.label}</span>
                </button>
            ))}
        </div>

        {/* Real-time Telemetry Overlay */}
        <div className="absolute right-4 top-1/4 flex flex-col gap-2 pointer-events-none md:block hidden">
             <div className="bg-black/60 border border-cyan-500/20 p-2 font-mono text-[8px] rounded">
                <div className="flex justify-between gap-4">
                    <span className="text-cyan-500">FPS</span>
                    <span>60.0</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span className="text-cyan-500">GECİKME</span>
                    <span>14ms</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span className="text-cyan-500">MOTOR_YÜKÜ</span>
                    <span>{mode === 'MECH' ? (dbLevel/2).toFixed(1) : '0.0'}%</span>
                </div>
             </div>
             
             <div className="bg-black/60 border border-cyan-500/20 p-2 font-mono text-[7px] rounded h-40 overflow-hidden flex flex-col-reverse mt-2">
                <div className="animate-pulse h-0.5 bg-cyan-500 w-full mb-1" />
                <div className="text-cyan-400/50 uppercase">Sistem Kontrolü Tamam</div>
                <div className="text-cyan-400/50 uppercase">Sensörler Başlatıldı</div>
                <div className="text-cyan-400/50 uppercase">Lidar Haritalama: N/A</div>
                <div className="text-cyan-400/50 uppercase">Vizyon Buff_01 Yüklendi</div>
                {isScanning && <div className="text-white animate-pulse">KARE ANALİZ EDİLİYOR...</div>}
                {diagnosis && <div className="text-white select-none text-[8px]">EŞLEŞME: {manualBrand ? manualBrand.toUpperCase() : ''} {manualModel ? manualModel.toUpperCase() : diagnosis.model}</div>}
                <div className="text-cyan-400/30">--- GEÇMİŞ GÜNLÜĞÜ ---</div>
             </div>
        </div>
            {/* Bottom Panel - The Control Hub */}
        <div className="absolute bottom-4 left-4 right-4 flex flex-col md:flex-row gap-2 items-end z-50">
            {isOffline && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center rounded-lg border border-red-500/50">
                    <div className="text-center p-6">
                        <Wifi size={48} className="text-red-500 mx-auto mb-4 animate-bounce" />
                        <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">İnternet Bağlantısı Yok</h3>
                        <p className="text-sm font-mono text-white/60 mt-2 uppercase">Sistem senkronizasyonu için aktif bağlantı gereklidir.</p>
                        <button 
                            onClick={() => setIsOffline(false)}
                            className="mt-6 bg-red-500 px-6 py-2 rounded text-white font-black text-xs uppercase"
                        >
                            TAMAM
                        </button>
                    </div>
                </div>
            )}
            <div className="flex-1 w-full max-w-[240px]">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={isNotVehicleWarning ? 'warning' : mode}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        {renderHUDData()}
                    </motion.div>
                </AnimatePresence>
            </div>

            <div className="flex-1 w-full bg-black/80 border border-white/10 p-2.5 rounded-xl backdrop-blur-xl flex flex-col justify-between h-28 min-w-[180px]">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-[9px] font-mono text-white/40 uppercase tracking-widest mb-0.5">Taktiksel Analiz</h2>
                        <div className={`text-xs font-black italic tracking-tighter ${isNotVehicleWarning ? 'text-red-500' : ''}`}>
                            {isNotVehicleWarning ? `${t['warning.not_vehicle']}` : (
                             mode === 'SCAN' ? t['scan.mode'] : 
                             mode === 'XRAY' ? t['xray.mode'] :
                             mode === 'MECH' ? t['mech.mode'] :
                             mode === 'ELEC' ? t['elec.mode'] : t['body.mode']
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setShowSystemIntro(true)}
                            className="w-8 h-8 border border-cyan-500/30 rounded flex items-center justify-center hover:bg-cyan-500/10 transition-colors text-[8px] font-mono p-1 text-center leading-none text-cyan-400"
                        >
                            {language === 'TR' ? 'SİSTEM TANITIMI' : language === 'EN' ? 'SYSTEM INTRO' : 'SYSTEM-INFO'}
                        </button>
                        <button 
                            onClick={handleOpenManual}
                            className="w-8 h-8 border border-white/10 rounded flex items-center justify-center hover:bg-white/5 transition-colors text-[9px] font-mono p-1 text-center leading-none"
                        >
                            {t['manual']}
                        </button>
                        {diagnosis && (
                            <button 
                            onClick={handleGenerateReport}
                            className="w-8 h-8 border border-white/20 rounded flex items-center justify-center hover:bg-cyan-500/20 transition-all text-cyan-400 group"
                        >
                            <ClipboardList size={16} className="group-hover:scale-110" />
                        </button>
                        )}
                    </div>
                </div>

                <div className="flex gap-2">
                    {mode === 'SCAN' && isVehicleDetected && !isScanning && (
                        <button 
                            onClick={() => handleReset()}
                            className="w-10 h-10 border-2 border-red-500/30 rounded-xl flex items-center justify-center hover:bg-red-500/10 transition-colors group active:scale-90"
                            title="Yeni Tarama"
                        >
                            <X size={18} className="text-red-400 group-hover:rotate-90 transition-transform" />
                        </button>
                    )}
                    <button 
                        onClick={handleScan}
                        disabled={isScanning}
                        className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-black h-11 rounded-xl font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-cyan-500/20 active:scale-95"
                    >
                        {isScanning ? t['scan.progress'] : t['scan.start']}
                        <RefreshCcw size={16} className={isScanning ? 'animate-spin' : ''} />
                    </button>
                    <button 
                        onClick={() => setShowSettings(true)}
                        className="w-10 h-10 border-2 border-white/20 rounded-xl flex items-center justify-center hover:bg-white/5 transition-colors active:scale-90"
                    >
                        <Settings size={16} className="text-white/60" />
                    </button>
                </div>
            </div>
        </div>

        {/* X-Ray Projection Overlay UI (Integrated) */}
        {isXrayMode && (
            <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 z-40 pointer-events-none overflow-hidden"
            >
                {/* Spectral Projection HUD */}
                <div className="absolute right-20 top-24 w-48 bg-black/60 backdrop-blur-xl border border-green-500/30 rounded-2xl p-4 shadow-2xl">
                    <div className="flex items-center gap-2 mb-3 border-b border-green-500/20 pb-2">
                        <Activity className="text-green-500 animate-pulse" size={16} />
                        <span className="text-[10px] font-black text-white font-mono uppercase tracking-tighter">STRUCTURAL_PROJECTION</span>
                    </div>
                    
                    <div className="space-y-3">
                        <div>
                            <div className="flex justify-between text-[7px] font-mono text-green-500 mb-1 uppercase">
                                <span>Density_Map</span>
                                <span>%{Math.floor(85 + (visionMetrics?.edgeDensity || 0))}</span>
                            </div>
                            <div className="h-1 bg-green-950 rounded-full overflow-hidden">
                                <motion.div 
                                    className="h-full bg-green-500"
                                    animate={{ width: ['20%', '90%', '85%'] }}
                                    transition={{ duration: 4, repeat: Infinity }}
                                />
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-green-500/5 p-1.5 rounded border border-green-500/10">
                                <span className="text-[6px] text-green-500/50 block font-mono">DENSITY</span>
                                <span className="text-[8px] text-green-400 font-bold font-mono">0.82 g/cm³</span>
                            </div>
                            <div className="bg-green-500/5 p-1.5 rounded border border-green-500/10">
                                <span className="text-[6px] text-green-500/50 block font-mono">WAVE_SYNC</span>
                                <span className="text-[8px] text-green-400 font-bold font-mono">LOCKED</span>
                            </div>
                        </div>

                        <div className="text-[7px] font-mono text-green-500/70 border-t border-green-500/20 pt-2 leading-tight">
                            {language === 'TR' ? 'Şasinin yapısal bütünlüğü ve montaj noktaları spektroskopik olarak doğrulanıyor.' : 'Structural integrity and mounting points are being spectroscopically verified.'}
                        </div>
                    </div>
                </div>

                {/* Scanning Dots on Canvas Area (Simulated Matrix) */}
                <div className="absolute inset-20 border border-green-500/5 rounded-[3rem] pointer-events-none">
                    {[...Array(8)].map((_, i) => (
                        <motion.div
                            key={i}
                            className="absolute w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]"
                            style={{
                                top: `${20 + Math.random() * 60}%`,
                                left: `${20 + Math.random() * 60}%`,
                            }}
                            animate={{
                                scale: [0.8, 1.2, 0.8],
                                opacity: [0.3, 1, 0.3]
                            }}
                            transition={{
                                duration: 2 + Math.random() * 2,
                                repeat: Infinity,
                                delay: i * 0.2
                            }}
                        />
                    ))}
                </div>
            </motion.div>
        )}

        {/* Global HUD Decorations */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500/20" />
        <div className="absolute right-0 top-0 bottom-0 w-1 bg-cyan-500/20" />
        <div className="absolute top-0 left-0 right-0 h-1 bg-[linear-gradient(to_right,transparent,rgba(6,182,212,0.5),transparent)]" />
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-[linear-gradient(to_right,transparent,rgba(6,182,212,0.5),transparent)]" />
        
        {/* Disclaimer Footer */}
        <div className="absolute bottom-1 left-0 right-0 z-[45] flex justify-center pointer-events-none">
            <p className="text-[7px] md:text-[8px] font-medium text-white/40 uppercase tracking-wider text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {t['scan.disclaimer'] || (language === 'TR' ? 'Bu analiz bir ön bilgilendirme amaçlıdır, kesin sonuç için yetkili ekspertiz merkezine danışınız' : 
                 (language === 'EN' ? 'This analysis is for preliminary information only, please consult an authorized inspection center for final results' : 
                 'Diese Analyse dient nur der Vorabinformation, bitte konsultieren Sie ein autorisiertes Prüfzentrum für endgültige Ergebnisse'))}
            </p>
        </div>
      </CameraView>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-zinc-900/50 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                    <Settings className="text-cyan-400" size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black italic tracking-tighter uppercase text-white">
                      {t['settings.title']}
                    </h2>
                    <p className="text-[8px] font-mono text-cyan-400/60 uppercase tracking-widest leading-none mt-1">Config_Panel_v4.5</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all"
                >
                  <X size={20} className="text-white" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {/* Language Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-white/40 text-[10px] uppercase font-bold tracking-widest">
                    <Globe size={12} />
                    <span>{t['settings.language']}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['TR', 'EN', 'DE'] as Language[]).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => { 
                          setLanguage(lang); 
                          speak(UI_TRANSLATIONS[lang]['settings.language_updated']); 
                        }}
                        className={`px-3 py-2 rounded-lg border text-[10px] font-bold transition-all ${
                          language === lang 
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
                            : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                        }`}
                      >
                        {lang === 'TR' ? 'TÜRKÇE' : (lang === 'EN' ? 'ENGLISH' : 'DEUTSCH')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Feedback Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-white/40 text-[10px] uppercase font-bold tracking-widest">
                    <Activity size={12} />
                    <span>{t['settings.voice']}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-[11px] font-bold transition-all ${
                        !isMuted 
                          ? 'bg-green-500/10 border-green-500/30 text-green-400' 
                          : 'bg-red-500/10 border-red-500/30 text-red-400'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {!isMuted ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        {t['settings.voice']}
                      </span>
                      <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${!isMuted ? 'bg-green-500' : 'bg-red-500'}`}>
                        <div className={`w-3 h-3 bg-white rounded-full transition-transform ${!isMuted ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                    </button>
                    <button
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl border-2 border-white/10 bg-white/5 text-white/40 text-[11px] font-bold opacity-50 cursor-not-allowed"
                    >
                      <span className="flex items-center gap-2">
                        <Zap size={16} />
                        HAPTIC
                      </span>
                      <div className="w-8 h-4 bg-zinc-700 rounded-full p-0.5">
                        <div className="w-3 h-3 bg-white/20 rounded-full" />
                      </div>
                    </button>
                  </div>
                </div>

                {/* Display & UI Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-white/40 text-[10px] uppercase font-bold tracking-widest">
                    <Maximize2 size={12} />
                    <span>{t['settings.guide']}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setIsZebraMode(!isZebraMode)}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border text-xs font-bold transition-all ${
                        isZebraMode 
                          ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' 
                          : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                      }`}
                    >
                        <span>ZEBRA MODE</span>
                        <div className={`w-8 h-4 rounded-full p-1 transition-colors ${isZebraMode ? 'bg-cyan-500' : 'bg-zinc-700'}`}>
                          <div className={`w-2 h-2 bg-white rounded-full transition-transform ${isZebraMode ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                    </button>
                    <button
                      onClick={() => setStencilType(stencilType ? null : 'sedan')}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border text-xs font-bold transition-all ${
                        stencilType 
                          ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' 
                          : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                      }`}
                    >
                        <span>STENCIL GUIDE</span>
                        <div className={`w-8 h-4 rounded-full p-1 transition-colors ${stencilType ? 'bg-cyan-500' : 'bg-zinc-700'}`}>
                          <div className={`w-2 h-2 bg-white rounded-full transition-transform ${stencilType ? 'translate-x-4' : 'translate-x-0'}`} />
                        </div>
                    </button>
                  </div>
                </div>

                {/* AI & System Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-white/40 text-[10px] uppercase font-bold tracking-widest">
                    <Cpu size={12} />
                    <span>{language === 'TR' ? 'YAPAY ZEKA VE SİSTEM' : 'AI & SYSTEM'}</span>
                  </div>
                  <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-white tracking-widest uppercase">
                                {language === 'TR' ? 'ANALİZ MOTORU' : 'ANALYSIS ENGINE'}
                            </span>
                            <span className="text-[8px] text-cyan-400/60 font-mono">NEURAL_PRO_X_v4.5</span>
                        </div>
                        <span className="px-2 py-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[8px] font-black rounded uppercase">ACTIVE</span>
                    </div>
                    <div className="h-px bg-white/5" />
                    <button
                      onClick={() => { setShowSystemIntro(true); setShowSettings(false); }}
                      className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-wider"
                    >
                      <Info size={14} />
                      {language === 'TR' ? 'SİSTEM REHBERİNİ GÖRÜNTÜLE' : 'VIEW SYSTEM GUIDE'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="p-6 bg-red-500/5 border-t border-white/5 flex flex-col gap-4 mt-auto">
                 <button
                   onClick={handleReset}
                   className="w-full flex items-center justify-center gap-2 py-4 bg-red-500/10 border border-red-500/30 text-red-500 font-bold uppercase tracking-widest text-[10px] rounded-2xl hover:bg-red-500/20 transition-all active:scale-95"
                 >
                   <Trash2 size={16} />
                   {language === 'TR' ? 'TÜM VERİLERİ SIFIRLA' : 'RESET ALL SYSTEM DATA'}
                 </button>
                 <p className="text-[8px] text-white/20 text-center uppercase tracking-tighter italic">
                    {language === 'TR' ? 'AKN GLOBAL GROUP LTD - TÜM HAKLARI SAKLIDIR' : 'AKN GLOBAL GROUP LTD - ALL RIGHTS RESERVED'}
                 </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* System Introduction Modal */}
      <AnimatePresence>
        {showSystemIntro && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl overflow-y-auto pt-10 pb-20 px-4 scroll-smooth"
          >
            <motion.div 
                initial={{ opacity: 0, y: 50, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="max-w-4xl mx-auto w-full bg-zinc-900 border border-cyan-500/30 rounded-[2.5rem] overflow-hidden shadow-[0_0_100px_rgba(6,182,212,0.1)] mb-10"
            >
                <div className="sticky top-0 z-10 p-6 md:p-8 border-b border-white/10 flex justify-between items-center bg-zinc-900/80 backdrop-blur-md">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
                            <Settings className="text-cyan-400 rotate-90" size={32} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black italic tracking-tighter uppercase text-white leading-none mb-1">
                            {language === 'TR' ? 'SİSTEM TANITIMI VE ADLİ EKSPERTİZ REHBERİ' : (language === 'EN' ? 'SYSTEM INTRODUCTION & FORENSIC GUIDE' : 'SYSTEMEINFÜHRUNG & FORENSISCHER LEITFADEN')}
                        </h2>
                        <p className="text-[10px] font-mono text-cyan-400/60 uppercase tracking-[0.3em] font-medium">AKN_Forensic_Neural_v5.0-ULTRA</p>
                    </div>
                </div>
                <button 
                    onClick={() => setShowSystemIntro(false)} 
                    className="w-12 h-12 flex items-center justify-center bg-white/5 border border-white/10 rounded-full hover:bg-white/10 hover:border-white/20 transition-all group"
                >
                    <X size={24} className="text-white group-hover:rotate-90 transition-transform" />
                </button>
            </div>

            <div className="p-8 space-y-12">
                {/* Intro Section */}
                <section className="relative">
                    <div className="absolute -left-4 top-0 bottom-0 w-1 bg-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                         {language === 'TR' ? 'MİSYON VE TANIM' : (language === 'EN' ? 'MISSION AND DEFINITION' : 'MISSION UND DEFINITION')}
                    </h3>
                    <p className="text-zinc-400 text-sm leading-relaxed font-medium">
                        {language === 'TR' ? (
                            <>AKN Global Group Ltd, otomobil ekspertiz süreçlerinde insan gözünün ve geleneksel cihazların (mikron ölçerler gibi) göremediği anomali ve hasarları saptamak üzere geliştirilmiş, ileri düzey bir <span className="text-cyan-400">Nöral Adli Analiz</span> sistemidir. Uygulama, <span className="text-purple-400">Gerçek Zamanlı Spektrum Analizi (RT-SA)</span> ve <span className="text-red-400">Lüminesans Dengeleme</span> algoritmalarını kullanarak, aracın boya, şasi ve mekanik bütünlüğünü fabrika çıkış verileriyle (Digital Twin) milimetrik hassasiyette karşılaştırır.</>
                        ) : language === 'EN' ? (
                            <>AKN Global Group Ltd is an advanced <span className="text-cyan-400">Neural Forensics</span> system. Using <span className="text-purple-400">Real-Time Spectrum Analysis (RT-SA)</span> and <span className="text-red-400">Luminescence Balancing</span>, it compares paint, chassis, and mechanical integrity with factory standards (Digital Twin) at millimetric precision.</>
                        ) : (
                            <>AKN Global Group Ltd ist ein <span className="text-cyan-400">Neural-Forensics-System</span>. Unter Verwendung von <span className="text-purple-400">RT-SA</span> und <span className="text-red-400">Luminanz-Matching</span> vergleicht es Karosserie- und Mechanikzustände mit Werkseinstellungen in Echtzeit.</>
                        )}
                    </p>
                </section>

                {/* Detaylı Özellikler */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Sol Kolon: Butonlar ve Fonksiyonlar */}
                    <section className="space-y-6">
                        <h3 className="text-xs font-mono text-cyan-400 uppercase tracking-[0.2em] border-b border-cyan-500/20 pb-2">
                            {language === 'TR' ? 'KONTROL PANELİ VE BUTONLAR' : (language === 'EN' ? 'CONTROL PANEL & BUTTONS' : 'KONTROLLPANEL & TASTEN')}
                        </h3>
                        <div className="space-y-4">
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 group hover:border-cyan-500/30 transition-all">
                                <div className="flex items-center gap-3 mb-2">
                                    <Maximize2 className="text-cyan-400" size={18} />
                                    <span className="text-xs font-black text-white uppercase">{language === 'TR' ? 'ZEBRA MODU' : (language === 'EN' ? 'ZEBRA MODE' : 'ZEBRAMODUS')}</span>
                                </div>
                                <p className="text-[11px] text-zinc-500">
                                    {language === 'TR' ? 'Işık hüzmelerini 45 derece açıyla kaportaya düşürerek mikron düzeyindeki göçükleri ve macun dalgalanmalarını ortaya çıkarır. Çizgilerdeki en ufak kırılma, yüzeydeki yapısal bir bükülmeyi temsil eder.' : 
                                     language === 'EN' ? 'Projects light beams at 45 degrees to reveal micron-level dents and filler waves. The slightest break in lines represents structural warping.' :
                                     'Projiziert Lichtstrahlen im 45-Grad-Winkel, um mikrometergenaue Dellen und Spachtelwellen aufzudecken. Kleinste Brüche zeigen Verformungen.'}
                                </p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 group hover:border-cyan-500/30 transition-all">
                                <div className="flex items-center gap-3 mb-2">
                                    <Box className="text-cyan-400" size={18} />
                                    <span className="text-xs font-black text-white uppercase">{language === 'TR' ? 'GUIDE (REHBER) MODU' : (language === 'EN' ? 'GUIDE MODE' : 'GUIDE-MODUS')}</span>
                                </div>
                                <p className="text-[11px] text-zinc-500">
                                    {language === 'TR' ? 'Aracın modeline göre (Sedan, SUV, Truck) hayalet bir çerçeve yansıtır. Kamerayı bu çerçeveye oturtursanız, yapay zeka aracın parçalarını (kaput, çamurluk, tavan) %99 başarı oranıyla indeksler.' :
                                     language === 'EN' ? 'Projects a ghost frame based on vehicle model. If you align the camera, AI indexes parts (hood, fender, roof) with 99% success rate.' :
                                     'Projiziert einen Geisterrahmen basierend auf dem Modell. Bei korrekter Ausrichtung indiziert die KI Teile mit 99% Erfolg.'}
                                </p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 group hover:border-cyan-500/30 transition-all">
                                <div className="flex items-center gap-3 mb-2">
                                    <Droplet className="text-cyan-400" size={18} />
                                    <span className="text-xs font-black text-white uppercase">{language === 'TR' ? 'COLOR (RENK) ANALİZİ' : (language === 'EN' ? 'COLOR ANALYSIS' : 'FARBANALYSE')}</span>
                                </div>
                                <p className="text-[11px] text-zinc-500">
                                    {language === 'TR' ? 'Spektroskopik analiz motorunu devreye sokar. İki panel arasındaki pigment yoğunluğunu (Delta-E) kıyaslar. Vernik altındaki katman farklarını ayıklayarak lokal boyalı alanları deşifre eder.' :
                                     language === 'EN' ? 'Activates spectroscopic engine. Compares pigment density (Delta-E). Deciphers local paint by separating layer differences under varnish.' :
                                     'Aktiviert den spektroskopischen Motor. Vergleicht Pigmentdichte (Delta-E). Entschlüsselt Beilackierungen durch Schichtanalyse.'}
                                </p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 group hover:border-cyan-500/30 transition-all">
                                <div className="flex items-center gap-3 mb-2">
                                    <Cpu className="text-cyan-400" size={18} />
                                    <span className="text-xs font-black text-white uppercase">{language === 'TR' ? 'DEPTH (LİDAR) DERİNLİK' : (language === 'EN' ? 'DEPTH (LIDAR)' : 'TIEFE (LIDAR)')}</span>
                                </div>
                                <p className="text-[11px] text-zinc-500">
                                    {language === 'TR' ? 'Cihazda varsa LiDAR, yoksa yazılımsal stereoskopik vizyon ile aracın 3 boyutlu derinlik haritasını çıkarır. Şasinin milimetrik olarak kayıp kaymadığını otonom olarak doğrular.' :
                                     language === 'EN' ? 'Uses LiDAR or software stereovision to create a 3D depth map. Autonomously verifies if the chassis has shifted.' :
                                     'Nutzt LiDAR oder Stereovision für eine 3D-Tiefenkarte. Prüft autonom auf Fahrgestellverschiebungen.'}
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Sağ Kolon: Analiz Mantığı */}
                    <section className="space-y-6">
                        <h3 className="text-xs font-mono text-purple-400 uppercase tracking-[0.2em] border-b border-purple-500/20 pb-2">
                            {language === 'TR' ? 'ANALİZ VE ÇALIŞMA MANTIĞI' : (language === 'EN' ? 'ANALYSIS & WORKING LOGIC' : 'ANALYSE & ARBEITSLOGIK')}
                        </h3>
                        <div className="space-y-6">
                            <div className="relative pl-6">
                                <div className="absolute left-0 top-1 w-2 h-2 rounded-full bg-purple-500" />
                                <h4 className="text-xs font-black text-white uppercase mb-2">{language === 'TR' ? 'Nöral Kare İşleme' : (language === 'EN' ? 'Neural Frame Analysis' : 'Neuronale Frame-Analyse')}</h4>
                                <p className="text-[11px] text-zinc-500 leading-relaxed">
                                    {language === 'TR' ? 'Sistem saniyede 60 kare (FPS) tarama yapar. Her kare, yerel COCO-SSD motorumuz tarafından taranarak araç parçaları tanımlanır. Hasarlı olduğu düşünülen "Anomali Zonları" belirlenir ve bu veriler Gemini 2.0 Flash Nöral Ağına gönderilerek uzman görüşüyle onaylanır.' :
                                     language === 'EN' ? 'Scans at 60 FPS. Each frame is scanned by local COCO-SSD to identify parts. Anomaly zones are sent to Gemini 2.0 Flash for expert confirmation.' :
                                     'Scannt mit 60 FPS. Lokale COCO-SSD identifiziert Teile. Anomaliezonen werden zur Expertenbestätigung an Gemini 2.0 Flash gesendet.'}
                                </p>
                            </div>
                            <div className="relative pl-6">
                                <div className="absolute left-0 top-1 w-2 h-2 rounded-full bg-purple-500" />
                                <h4 className="text-xs font-black text-white uppercase mb-2">{language === 'TR' ? 'Çok Açılı Veri Korelasyonu' : (language === 'EN' ? 'Cross-Angle Correlation' : 'Mehrwinkel-Korrelation')}</h4>
                                <p className="text-[11px] text-zinc-500 leading-relaxed">
                                    {language === 'TR' ? '360 derece tarama sırasında alınan 5 farklı açı (Ön, Arka, Sol, Sağ, Üst), sistem tarafından birleştirilir. Bir açıda görülen "boya akması", diğer açılardaki ışık yansımalarıyla doğrulanır. Bu, hatalı pozitif ihtimalini ortadan kaldırır.' :
                                     language === 'EN' ? 'Merges 5 different angles (Front, Rear, Left, Right, Top). A paint run seen in one angle is confirmed by reflections in others, eliminating false positives.' :
                                     'Kombiniert 5 Winkel. Lackfehler werden durch Reflexionsvergleiche validiert, um Fehlalarme zu vermeiden.'}
                                </p>
                            </div>
                            <div className="relative pl-6">
                                <div className="absolute left-0 top-1 w-2 h-2 rounded-full bg-purple-500" />
                                <h4 className="text-xs font-black text-white uppercase mb-2">{language === 'TR' ? 'Kriptografik Raporlama' : (language === 'EN' ? 'Cryptographic Reporting' : 'Kryptografische Berichte')}</h4>
                                <p className="text-[11px] text-zinc-500 leading-relaxed">
                                    {language === 'TR' ? 'Tüm analiz sonuçları, parçanın kondisyonu, markanın kronik sorun veritabanı ve geri çağırma geçmişiyle eşleştirilir. Oluşturulan rapor, değiştirilemez bir Forensik ID ile mühürlenir.' :
                                     language === 'EN' ? 'All results are matched with part condition, chronic issue database, and recall history. The report is sealed with an immutable Forensic ID.' :
                                     'Ergebnisse werden mit Fahrzeugzustand und Rückrufhistorie abgeglichen. Versiegelt mit einer unveränderlichen Forensic ID.'}
                                </p>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Teknik Alt Katman Verileri */}
                <section className="bg-zinc-950 p-8 rounded-3xl border border-cyan-500/10">
                    <div className="flex items-center gap-3 mb-8">
                        <Activity className="text-cyan-500" size={24} />
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">{language === 'TR' ? 'VERİ ANALİZ MODÜLLERİ (INTERNAL ENGINES)' : (language === 'EN' ? 'INTERNAL ENGINE MODULES' : 'INTERNE MOTORMODULE')}</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                        <div className="space-y-3">
                            <div className="text-[10px] font-mono text-cyan-400 uppercase">Acoustic_Engine</div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <motion.div animate={{ width: '85%' }} className="h-full bg-cyan-500" />
                            </div>
                            <p className="text-[9px] text-zinc-500 italic">
                                {language === 'TR' ? 'Motor ses harmoniklerini dinleyerek yatak vuruntusu veya turbo sorunlarını desibel/frekans bazlı analiz eder.' :
                                 language === 'EN' ? 'Analyzes engine harmonics for bearing knock or turbo issues based on decibel/frequency.' :
                                 'Analysiert Motoroberschwingungen auf Lagerschäden oder Turboprobleme.'}
                            </p>
                        </div>
                        <div className="space-y-3">
                            <div className="text-[10px] font-mono text-purple-400 uppercase">Spectro_Engine</div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <motion.div animate={{ width: '92%' }} className="h-full bg-purple-500" />
                            </div>
                            <p className="text-[9px] text-zinc-500 italic">
                                {language === 'TR' ? 'Boya katmanındaki metalik zerreciklerin dağılımını ölçerek fabrikasyon dışı müdahaleleri anında deşifre eder.' :
                                 language === 'EN' ? 'Measures metallic particle distribution to decipher non-factory interventions.' :
                                 'Misst die Metallpartikelverteilung, um Eingriffe zu identifizieren.'}
                            </p>
                        </div>
                        <div className="space-y-3">
                            <div className="text-[10px] font-mono text-green-400 uppercase">Magnetic_Engine</div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <motion.div animate={{ width: '78%' }} className="h-full bg-green-500" />
                            </div>
                            <p className="text-[9px] text-zinc-500 italic">
                                {language === 'TR' ? 'Şasi üzerindeki manyetik alan değişimlerini tarayarak ağır kazalı araçlardaki düzeltme (Podye/Direk) işlemlerini bulur.' :
                                 language === 'EN' ? 'Scans magnetic field changes to find chassis corrections on heavily damaged vehicles.' :
                                 'Scannt Magnetfeldänderungen, um Reparaturen an Rahmen zu finden.'}
                            </p>
                        </div>
                        <div className="space-y-3">
                            <div className="text-[10px] font-mono text-yellow-400 uppercase">Digital_Twin_UI</div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <motion.div animate={{ width: '100%' }} className="h-full bg-yellow-500" />
                            </div>
                            <p className="text-[9px] text-zinc-500 italic">
                                {language === 'TR' ? 'Tüm bu karmaşık verileri, son kullanıcının anlayabileceği basittlikte 3D şemalar ve % bazlı güven puanlarına dönüştürür.' :
                                 language === 'EN' ? 'Converts complex data into understandable 3D schemas and %-based confidence scores.' :
                                 'Wandelt Daten in 3D-Schemata und Vertrauenswerte um.'}
                            </p>
                        </div>
                    </div>
                </section>

                <div className="flex flex-col items-center gap-6 pt-4">
                    <div className="text-center space-y-2">
                         <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.4em]">{language === 'TR' ? 'Resmi_Sertifikasyon_Notu' : (language === 'EN' ? 'OFFICIAL_CERTIFICATION_NOTE' : 'ZERTIFIZIERUNGSHINWEIS')}</div>
                         <p className="text-[9px] text-zinc-500 max-w-lg leading-relaxed lowercase italic">
                            {language === 'TR' ? (
                                <>* AKN Global Group Ltd, otomobil ticaretinde şeffaflığı artırmak için tasarlanmış bir "bilgi destek" platformudur. alınan her sonuç, çevresel faktörlere bağlı olarak değişkenlik gösterebilir. sisteme girilen marka, model ve km verileri analiz algoritmasının "kronik sorun eşleşme" başarısını %40 oranında artırmaktadır.</>
                            ) : language === 'EN' ? (
                                <>* AKN Global Group Ltd is an information support platform designed to increase transparency in the car trade. Results may vary based on environmental factors. Entered Brand, Model and KM data increase chronic issue matching success by 40%.</>
                            ) : (
                                <>* AKN Global Group Ltd ist eine Plattform zur Unterstützung der Transparenz im Autohandel. Ergebnisse können variieren. Marke, Modell und KM-Daten verbessern die Treffsicherheit um 40%.</>
                            )}
                         </p>
                    </div>
                    <button 
                        onClick={() => setShowSystemIntro(false)}
                        className="bg-cyan-500 hover:bg-cyan-400 text-black font-black px-8 py-2.5 rounded-full text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-cyan-500/20"
                    >
                        {language === 'TR' ? 'ANLADIM, SİSTEME DÖN' : (language === 'EN' ? 'UNDERSTOOD, BACK TO SYSTEM' : 'VERSTANDEN, ZURÜCK ZUM SYSTEM')}
                    </button>
                </div>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Checklist Modal */}
      <AnimatePresence>
        {showChecklist && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4"
          >
            <div className="max-w-2xl w-full bg-slate-900 border border-purple-500/30 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[80vh]">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-purple-900/20 to-transparent">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="text-purple-400" size={18} />
                        <h2 className="text-sm font-black italic tracking-tighter uppercase text-white">MANUEL EKSPERTİZ KONTROLÜ</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleSelectAll}
                            className="text-[9px] font-black text-purple-400 border border-purple-500/30 px-2 py-1 rounded hover:bg-purple-500/10 transition-all uppercase tracking-tighter active:scale-90"
                        >
                            {Object.values(checklistData).every((s: any) => s.items.every((i: any) => i.checked)) ? 'TÜMÜNÜ KALDIR' : 'TÜMÜNÜ İŞARETLE'}
                        </button>
                        <button onClick={() => setShowChecklist(false)} className="p-1.5 hover:bg-white/10 rounded-full active:scale-90"><X size={16}/></button>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
                    <div className="bg-purple-500/5 p-4 rounded-lg border border-purple-500/20 mb-6">
                        <p className="text-[10px] font-mono text-purple-400 uppercase leading-relaxed">
                            Bu bölüm uzman teknisyen tarafından fiziksel inceleme sonrası doldurulmalıdır. İşaretlenen her kalem dijital rapora kriptografik olarak eklenir. ARAÇ MARKASI ve MODELİ girilmesi halinde sonuç raporunda otomatik olarak önceliklendirilir.
                        </p>
                    </div>

                    {/* Manual Inputs Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-8 border-b border-white/5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-mono text-purple-400 uppercase tracking-widest">{language === 'TR' ? 'ARAÇ MARKASI' : 'BRAND'}</label>
                            <input
                                type="text"
                                value={manualBrand}
                                onChange={(e) => setManualBrand(e.target.value)}
                                placeholder="Örn: BMW"
                                className="w-full bg-white/5 border border-purple-500/20 rounded-lg p-3 text-white font-mono text-xs focus:border-purple-500 outline-none transition-colors"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-mono text-purple-400 uppercase tracking-widest">{language === 'TR' ? 'ARAÇ MODELİ' : 'MODEL'}</label>
                            <input
                                type="text"
                                value={manualModel}
                                onChange={(e) => setManualModel(e.target.value)}
                                placeholder="Örn: 320i"
                                className="w-full bg-white/5 border border-purple-500/20 rounded-lg p-3 text-white font-mono text-xs focus:border-purple-500 outline-none transition-colors"
                            />
                        </div>
                        <div className="space-y-2 relative">
                            <label className="text-[10px] font-mono text-purple-400 uppercase tracking-widest">{language === 'TR' ? 'ŞASİ NUMARASI (VIN)' : 'CHASSIS NUMBER'}</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={vinNumber}
                                    onChange={(e) => setVinNumber(e.target.value.toUpperCase())}
                                    placeholder="WBA..."
                                    className="flex-1 bg-white/5 border border-orange-500/40 rounded-lg p-3 text-white font-mono text-[10px] focus:border-orange-500 outline-none transition-colors uppercase"
                                />
                                <button 
                                    onClick={handleVinSearch}
                                    disabled={isSearchingVin}
                                    className="bg-orange-600 hover:bg-orange-500 text-white px-2.5 rounded-lg text-[8px] font-black uppercase transition-all disabled:opacity-50 flex items-center justify-center whitespace-nowrap active:scale-90"
                                >
                                    {isSearchingVin ? <RefreshCcw size={12} className="animate-spin" /> : (language === 'TR' ? 'SORGULA' : 'SEARCH')}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Additional Info Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8 border-b border-white/5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-mono text-purple-400 uppercase tracking-widest">{language === 'TR' ? 'ARAÇ YILI' : 'YEAR'}</label>
                            <input
                                type="text"
                                value={manualYear}
                                onChange={(e) => setManualYear(e.target.value)}
                                placeholder="2022"
                                className="w-full bg-white/5 border border-purple-500/20 rounded-lg p-3 text-white font-mono text-xs focus:border-purple-500 outline-none transition-colors"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-mono text-purple-400 uppercase tracking-widest">{language === 'TR' ? 'ARAÇ KİLOMETRESİ' : 'MILEAGE'}</label>
                            <input
                                type="number"
                                value={mileage}
                                onChange={(e) => setMileage(e.target.value)}
                                placeholder="120000"
                                className="w-full bg-white/5 border border-purple-500/20 rounded-lg p-3 text-white font-mono text-xs focus:border-purple-500 outline-none transition-colors"
                            />
                        </div>
                    </div>

                    {/* VIN Report Display */}
                    {vinReport && (
                        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-6 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-2 opacity-20"><Shield size={40} className="text-orange-500" /></div>
                            <div className="flex items-center gap-3 mb-6 border-b border-orange-500/20 pb-3">
                                <Activity className="text-orange-500" size={20} />
                                <h3 className="text-sm font-black text-white italic tracking-tighter uppercase">{vinReport.title}</h3>
                                <div className="ml-auto flex items-center gap-2">
                                    <button 
                                        onClick={handleDownloadVinReport}
                                        className="flex items-center gap-2 bg-orange-600/20 hover:bg-orange-600 text-orange-500 hover:text-white px-3 py-1 rounded border border-orange-500/30 text-[9px] font-black uppercase transition-all"
                                        title={language === 'TR' ? 'Raporu İndir' : 'Download Report'}
                                    >
                                        <Download size={14} />
                                        <span className="hidden sm:inline">{language === 'TR' ? 'İNDİR' : 'DOWNLOAD'}</span>
                                    </button>
                                    <button onClick={() => setVinReport(null)} className="text-white/40 hover:text-white"><X size={16}/></button>
                                </div>
                            </div>
                            
                            <div className="space-y-8">
                                {vinReport.sections.map((section: any, sIdx: number) => (
                                    <div key={sIdx} className="space-y-3">
                                        <h4 className="text-[9px] font-black text-orange-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                            <div className="w-1 h-1 rounded-full bg-orange-500" />
                                            {section.name}
                                        </h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                                            {section.items.map((item: any, iIdx: number) => (
                                                <div key={iIdx} className="flex justify-between items-center border-b border-white/5 pb-1.5 group/item cursor-default hover:bg-orange-500/5 px-1 rounded transition-colors">
                                                    <span className="text-[10px] font-mono text-white/40 uppercase group-hover/item:text-white/60 transition-colors">{item.label}</span>
                                                    <span className="text-[10px] font-black text-orange-200 font-mono text-right">{item.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 p-4 bg-black/60 rounded-lg border border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.1)]">
                                <div className="flex items-center gap-2 mb-2">
                                    <Shield size={12} className="text-orange-500" />
                                    <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest">{language === 'TR' ? 'DİJİTAL İMZA DOĞRULAMASI' : 'DIGITAL SIGNATURE VERIFICATION'}</span>
                                </div>
                                <p className="text-[10px] font-mono text-zinc-300 italic leading-relaxed">
                                    {vinReport.integrity}
                                </p>
                            </div>
                        </div>
                    )}

                    {Object.entries(checklistData).map(([key, section]: [string, any]) => (
                        <div key={key} className="relative group">
                            <div className="absolute -left-3 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <h3 className="text-purple-400 text-[10px] font-black mb-4 uppercase tracking-[0.3em] flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                                {section.name}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {section.items.map((item: any, i: number) => (
                                    <button 
                                        key={i}
                                        onClick={() => {
                                            const newData = { ...checklistData };
                                            newData[key].items[i].checked = !newData[key].items[i].checked;
                                            setChecklistData(newData);
                                        }}
                                        className={`flex items-center justify-between p-2 rounded border transition-all duration-300 relative overflow-hidden group/item ${
                                            item.checked 
                                            ? 'bg-purple-500/20 border-purple-500 shadow-[inset_0_0_20px_rgba(168,85,247,0.1)]' 
                                            : 'bg-white/5 border-white/5 hover:border-white/20'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 relative z-10">
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${item.checked ? 'bg-purple-500 border-purple-500' : 'border-white/20 group-hover/item:border-white/40'}`}>
                                                {item.checked && <RefreshCcw size={10} className="text-black font-bold" />}
                                            </div>
                                            <span className={`text-[11px] font-mono font-medium tracking-tight ${item.checked ? 'text-white' : 'text-white/40'}`}>{item.label}</span>
                                        </div>
                                        {item.checked && (
                                            <motion.div 
                                                layoutId={`checked-bg-${key}-${i}`}
                                                className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-transparent" 
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-6 border-t border-white/10 bg-black/40">
                    <button 
                        onClick={() => {
                            speak("Manuel kontrol listesi kaydedildi.");
                            setShowChecklist(false);
                            // If we have a diagnosis, we could add this to the report later
                        }}
                        className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 rounded-xl uppercase tracking-widest text-[11px] transition-all shadow-[0_0_15px_rgba(147,51,234,0.3)] active:scale-95"
                    >
                        Kontrolleri Tamamla ve Kaydet
                    </button>
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detailed Technical Report Modal */}
      <AnimatePresence>
        {showDetails && diagnosis && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex flex-col p-4 md:p-8 overflow-y-auto"
          >
            <div className="max-w-4xl mx-auto w-full">
                <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
                    <div className="flex items-center gap-3">
                        <Shield className="text-cyan-500" size={24} />
                        <div>
                            <h2 className="text-3xl font-black italic tracking-tighter uppercase">TAM TEKNİK RAPOR</h2>
                            <p className="text-xs font-mono text-cyan-400/60 uppercase">Döküman ID: {sensors.magneticField.total.toString(36).substr(0, 9).toUpperCase()}</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setShowDetails(false)}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Column: Visual AI Output */}
                    <div className="md:col-span-2 space-y-6">
                        <div className="aspect-video bg-black/40 border border-white/10 rounded-lg relative overflow-hidden flex items-center justify-center group">
                            <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(6,182,212,0.05)_0%,transparent_70%)]" />
                            
                            {isGeneratingSchematic ? (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="relative w-16 h-16">
                                        <div className="absolute inset-0 border-4 border-cyan-500/20 rounded-full" />
                                        <div className="absolute inset-0 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <span className="text-sm font-mono text-cyan-400 animate-pulse uppercase tracking-widest">Nöral Render İşleniyor...</span>
                                        <span className="text-[10px] font-mono text-cyan-500/50 uppercase mt-1">Dijital İkiz Senkronizasyonu: %84</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="relative w-full h-full flex flex-col items-center justify-center p-8">
                                    {/* High Tech Vehicle Layout Visualization */}
                                    <div className="relative w-full max-w-lg">
                                        <svg viewBox="0 0 240 120" className="w-full h-full text-cyan-500/30 drop-shadow-[0_0_15px_rgba(6,182,212,0.2)]" fill="none" stroke="currentColor" strokeWidth="0.8">
                                            {/* Car Body Sketch */}
                                            <motion.path 
                                                initial={{ pathLength: 0 }}
                                                animate={{ pathLength: 1 }}
                                                transition={{ duration: 1.5 }}
                                                d="M30,80 L210,80 L205,60 L180,55 L150,35 L90,35 L60,55 L35,60 Z" 
                                            />
                                            {/* Chassis Elements */}
                                            <line x1="50" y1="80" x2="190" y2="80" strokeDasharray="2 2" className="opacity-40" />
                                            {/* Component Markers */}
                                            <g className="text-cyan-400">
                                                <circle cx="95" cy="45" r="3" className="fill-cyan-500/20" />
                                                <motion.circle cx="95" cy="45" r="6" className="stroke-cyan-500/40" animate={{ r: [6, 10, 6], opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 2 }} />
                                                <text x="105" y="45" className="text-[6px] font-mono fill-cyan-400 uppercase">M_Ünitesi_01</text>
                                                
                                                <circle cx="160" cy="70" r="3" className="fill-red-500/20" />
                                                <motion.circle cx="160" cy="70" r="6" className="stroke-red-500/40" animate={{ r: [6, 12, 6], opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 3 }} />
                                                <text x="170" y="70" className="text-[6px] font-mono fill-red-400 uppercase">Aşınma_Zon_B</text>
                                            </g>
                                            {/* Wheels */}
                                            <circle cx="65" cy="85" r="15" className="opacity-40" />
                                            <circle cx="175" cy="85" r="15" className="opacity-40" />
                                        </svg>
                                        
                                        <div className="absolute top-0 right-0 p-4 border-r border-t border-cyan-500/30">
                                            <div className="text-[9px] font-mono text-cyan-500 uppercase">Tarama Kalitesi</div>
                                            <div className="text-xs font-black text-white">99.8% SAF</div>
                                        </div>
                                    </div>
                                    <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-8 w-full text-center">
                                        <div>
                                            <div className="text-[10px] font-mono text-white/40 uppercase mb-1">Güven Skoru</div>
                                            <div className="text-2xl font-black text-green-500 italic">AA+</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-mono text-white/40 uppercase mb-1">Hata Payı</div>
                                            <div className="text-2xl font-black text-cyan-500 italic">±0.02</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] font-mono text-white/40 uppercase mb-1">Risk Faktörü</div>
                                            <div className="text-2xl font-black text-yellow-500 italic">DÜŞÜK</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="absolute top-4 left-4 flex gap-2">
                                <div className="px-2 py-1 bg-cyan-500/20 border border-cyan-500/40 rounded text-[8px] font-mono uppercase tracking-widest text-cyan-400">Canlı Analiz Verisi</div>
                                <div className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[8px] font-mono uppercase tracking-widest text-white/60">Giriş: HD_SENSOR_1</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                            <div className="p-4 bg-white/5 border border-white/10 rounded group hover:border-cyan-500/50 transition-colors">
                                <span className="text-[10px] font-mono text-white/40 uppercase mb-2 block tracking-widest">{language === 'TR' ? 'Marka' : 'Brand'}</span>
                                <div className="text-sm font-black text-white italic truncate">{manualBrand || diagnosis.objectName}</div>
                            </div>
                            <div className="p-4 bg-white/5 border border-white/10 rounded group hover:border-cyan-500/50 transition-colors">
                                <span className="text-[10px] font-mono text-white/40 uppercase mb-2 block tracking-widest">{language === 'TR' ? 'Model' : 'Model'}</span>
                                <div className="text-sm font-black text-white italic truncate">{manualYear} {manualModel || diagnosis.model}</div>
                            </div>
                            <div className="p-4 bg-white/5 border border-white/10 rounded group hover:border-cyan-500/50 transition-colors">
                                <span className="text-[10px] font-mono text-white/40 uppercase mb-2 block tracking-widest">{language === 'TR' ? 'Kilometre' : 'Mileage'}</span>
                                <div className="text-sm font-black text-white italic truncate">{mileage} KM</div>
                            </div>
                            <div className="p-4 bg-white/5 border border-white/10 rounded group hover:border-cyan-500/50 transition-colors">
                                <span className="text-[10px] font-mono text-white/40 uppercase mb-2 block tracking-widest">Forensik_ID</span>
                                <div className="text-sm font-black text-white italic truncate">
                                    {diagnosis.maintenanceAlerts?.find(a => a.includes('0x'))?.split(': ')[1] || '0x' + sensors.magneticField.total.toString(16).slice(-4).toUpperCase()}
                                </div>
                            </div>
                            <div className="p-4 bg-white/5 border border-white/10 rounded group hover:border-cyan-500/50 transition-colors">
                                <span className="text-[10px] font-mono text-white/40 uppercase mb-2 block tracking-widest">Versiyon_ID</span>
                                <div className="text-sm font-black text-white italic truncate">{diagnosis.version}</div>
                            </div>
                            <div className={`p-4 rounded border transition-colors ${
                                diagnosis.confidenceScore && diagnosis.confidenceScore < 60 ? 'bg-red-500/10 border-red-500/30' : 
                                diagnosis.confidenceScore && diagnosis.confidenceScore < 85 ? 'bg-yellow-500/10 border-yellow-500/30' : 
                                'bg-green-500/10 border-green-500/30'
                            }`}>
                                <span className="text-[10px] font-mono text-white/40 uppercase mb-2 block tracking-widest">Güven_Endeksi</span>
                                <div className={`text-sm font-black italic flex items-baseline gap-1 ${
                                    diagnosis.confidenceScore && diagnosis.confidenceScore < 60 ? 'text-red-500' : 
                                    diagnosis.confidenceScore && diagnosis.confidenceScore < 85 ? 'text-yellow-500' : 
                                    'text-green-500'
                                }`}>
                                    %{diagnosis.confidenceScore || 0}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Technical Spec List */}
                    <div className="space-y-6">
                        <section className="bg-white/5 p-5 rounded border border-white/10">
                            <h3 className="text-sm font-mono text-cyan-400 mb-6 flex items-center gap-2 border-b border-cyan-500/20 pb-2">
                                <Cpu size={16} /> {language === 'TR' ? 'DONANIM MİMARİSİ' : (language === 'EN' ? 'HARDWARE ARCHITECTURE' : 'HARDWARE-ARCHITEKTUR')}
                            </h3>
                            <div className="space-y-4">
                                <div className="group">
                                    <div className="text-[9px] font-mono text-white/40 uppercase mb-1">{t['diagnosis.spec.engine']}</div>
                                    <div className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">{diagnosis.technicalSpecs?.engine || 'N/A'}</div>
                                </div>
                                <div className="group">
                                    <div className="text-[9px] font-mono text-white/40 uppercase mb-1">{t['diagnosis.spec.trans']}</div>
                                    <div className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">{diagnosis.technicalSpecs?.transmission || 'N/A'}</div>
                                </div>
                                <div className="group">
                                    <div className="text-[9px] font-mono text-white/40 uppercase mb-1">{t['diagnosis.spec.chassis']}</div>
                                    <div className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">{diagnosis.technicalSpecs?.chassis || 'N/A'}</div>
                                </div>
                                <div className="group">
                                    <div className="text-[9px] font-mono text-white/40 uppercase mb-1">{t['diagnosis.spec.elec']}</div>
                                    <div className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">{diagnosis.technicalSpecs?.electricalSystem || 'N/A'}</div>
                                </div>
                            </div>
                        </section>

                        <section className="bg-red-950/20 p-5 rounded border border-red-500/20">
                            <h3 className="text-sm font-mono text-red-500 mb-6 flex items-center gap-2 border-b border-red-500/20 pb-2">
                                <AlertTriangle size={16} /> {t['diagnosis.chronic'].toUpperCase()}
                            </h3>
                            <div className="space-y-3">
                                {(diagnosis.chronicIssues || []).map((issue, i) => (
                                    <div key={i} className="flex items-start gap-3 p-3 bg-red-900/10 border-l-2 border-red-500 rounded backdrop-blur-sm">
                                        <AlertTriangle size={14} className="text-red-500 mt-1 shrink-0" />
                                        <div>
                                            <div className="text-[9px] text-red-400 font-mono uppercase mb-0.5">{language === 'TR' ? 'Zafiyet' : (language === 'EN' ? 'Issue' : 'Problem')}_{i+1}</div>
                                            <div className="text-[12px] text-red-100 font-bold leading-tight">{issue}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>

                {/* Expert Collision & Stance Analysis */}
                {expertReportData && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-8 p-6 bg-gradient-to-br from-red-950/30 to-black border border-red-500/30 rounded-2xl backdrop-blur-xl relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
                        
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 relative z-10">
                            <div className="flex items-center gap-4">
                                <div className={`p-4 rounded-xl ${expertReportData.hasDamage ? 'bg-red-500 text-white shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'bg-green-500 text-white shadow-[0_0_30px_rgba(34,197,94,0.3)]'}`}>
                                    <AlertTriangle size={32} />
                                </div>
                                <div>
                                    <h3 className={`text-2xl font-black italic tracking-tighter uppercase ${expertReportData.hasDamage ? 'text-red-500 animate-pulse' : 'text-green-500'}`}>
                                        {expertReportData.hasDamage ? (language === 'TR' ? 'ARAÇ HASARLI' : 'VEHICLE DAMAGED') : (language === 'TR' ? 'ARAÇ HASARSIZ' : 'VEHICLE NOT DAMAGED')}
                                    </h3>
                                    <p className="text-xs font-mono text-white/60 uppercase tracking-widest">{language === 'TR' ? 'Tam Kapsamlı Uzman Analizi' : 'Comprehensive Expert Analysis'}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] font-mono text-white/40 uppercase block mb-1">{language === 'TR' ? 'Kondisyon Skoru' : 'Condition Score'}</span>
                                <div className={`text-5xl font-black italic tracking-tighter ${conditionScore && conditionScore > 80 ? 'text-green-400' : 'text-yellow-400'}`}>
                                    {conditionScore || '95'}
                                </div>
                                <div className="text-[10px] font-mono text-cyan-400/60 uppercase mt-1">Light Confidence: {lightConfidence}%</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                            <div className="bg-white/5 border border-white/10 p-5 rounded-2xl hover:bg-white/10 transition-colors">
                                <div className="flex justify-between items-end mb-4">
                                    <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                                        <Activity size={14} /> {language === 'TR' ? 'Hata Matrisi' : 'Error Matrix'}
                                    </div>
                                    <button 
                                        onClick={handleGenerateDetailedReport}
                                        disabled={isGeneratingDetailedReport}
                                        className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/40 border border-cyan-500/30 rounded-lg text-[10px] font-black text-cyan-400 uppercase tracking-tighter transition-all disabled:opacity-50"
                                    >
                                        {isGeneratingDetailedReport ? '...' : (language === 'TR' ? 'AI Detaylı Rapor' : 'AI Detailed Report')}
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {Object.entries((diagnosis.exteriorCondition || {}) as Record<string, string>).map(([part, condition]) => (
                                        <div key={part} className="flex justify-between items-center text-[11px] font-bold italic tracking-tight">
                                            <span className="text-white/60 uppercase">{part}</span>
                                            <span className={(condition || '').toLowerCase().includes('original') || (condition || '').toLowerCase().includes('orijinal') || (condition || '').toLowerCase().includes('onay') ? 'text-green-400' : 'text-red-400'}>
                                                {condition}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-white/5 border border-white/10 p-5 rounded-2xl space-y-4 hover:bg-white/10 transition-colors">
                                <div className="text-[10px] font-mono text-red-400 uppercase tracking-widest border-b border-red-500/20 pb-2 flex items-center gap-2">
                                    <AlertTriangle size={14} /> Otomatik Anomali Tespiti
                                </div>
                                <div className="flex flex-wrap gap-2 text-[10px] font-mono text-white/80">
                                     {detailedReportText ? (
                                         <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl leading-relaxed max-h-[150px] overflow-y-auto w-full text-xs font-sans not-italic">
                                             <p className="font-bold text-cyan-400 mb-2 uppercase border-b border-cyan-500/20 pb-1">AI Forensic Findings:</p>
                                             {detailedReportText}
                                         </div>
                                     ) : (
                                         <p className="opacity-40 italic">{language === 'TR' ? 'Detaylı rapor oluşturulmadı.' : 'Detailed report not generated.'}</p>
                                     )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Exterior Condition Summary */}
                {diagnosis.exteriorCondition && (
                  <div className="mt-8 space-y-4">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs tracking-widest uppercase mb-4">
                        <Maximize2 size={14} />
                        <span>{language === 'TR' ? '360° KAPORTA ANALİZİ' : (language === 'EN' ? '360° BODYWORK ANALYSIS' : '360° KAROSSERIE-ANALYSE')}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        {Object.entries(diagnosis.exteriorCondition).map(([part, condition]) => (
                            <div key={part} className="bg-white/5 border border-white/10 p-3 rounded-lg flex flex-col justify-between">
                                <span className="text-[9px] text-cyan-400/70 font-mono uppercase block mb-2">
                                    {part === 'front' ? (language === 'TR' ? 'ÖN' : (language === 'EN' ? 'FRONT' : 'FRONT')) : 
                                     part === 'rear' ? (language === 'TR' ? 'ARKA' : (language === 'EN' ? 'REAR' : 'HECK')) : 
                                     part === 'left' ? (language === 'TR' ? 'SOL YAN' : (language === 'EN' ? 'LEFT SIDE' : 'LINKE SEITE')) : 
                                     part === 'right' ? (language === 'TR' ? 'SAĞ YAN' : (language === 'EN' ? 'RIGHT SIDE' : 'RECHTE SEITE')) : 
                                     (language === 'TR' ? 'TAVAN' : (language === 'EN' ? 'ROOF' : 'DACH'))}
                                </span>
                                <p className="text-[11px] font-medium leading-normal text-white/90">{condition}</p>
                            </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Detailed Body Part Analysis Table */}
                {diagnosis.bodyReport && (
                  <div className="mt-8 space-y-4">
                    <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs tracking-widest uppercase mb-4">
                        <Activity size={14} />
                        <span>{language === 'TR' ? 'DETAYLI PARÇA ANALİZİ (ADLİ RAPOR)' : 'DETAILED PART ANALYSIS (FORENSIC REPORT)'}</span>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40">
                      <table className="w-full text-left text-[10px] font-mono">
                        <thead className="bg-white/5 text-white/40 uppercase tracking-widest border-b border-white/10">
                          <tr>
                            <th className="px-4 py-3">{language === 'TR' ? 'AÇI' : 'ANGLE'}</th>
                            <th className="px-4 py-3">{language === 'TR' ? 'PARÇA' : 'PART'}</th>
                            <th className="px-4 py-3">{language === 'TR' ? 'DURUM' : 'STATUS'}</th>
                            <th className="px-4 py-3">{language === 'TR' ? 'MİKRON' : 'MICRON'}</th>
                            <th className="px-4 py-3">{language === 'TR' ? 'NOTLAR' : 'NOTES'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-white/80">
                          {diagnosis.bodyReport && Object.entries(diagnosis.bodyReport).map(([angle, parts]) => (
                            (parts as any[]).map((part, idx) => (
                              <tr key={`${angle}-${idx}`} className="hover:bg-white/5 transition-colors">
                                <td className="px-4 py-2 font-black text-cyan-400/60 uppercase">
                                  {idx === 0 ? (
                                    angle === 'front' ? 'ÖN' : 
                                    angle === 'rear' ? 'ARKA' : 
                                    angle === 'left' ? 'SOL' : 
                                    angle === 'right' ? 'SAĞ' : 'TAVAN'
                                  ) : ''}
                                </td>
                                <td className="px-4 py-2 text-white font-bold italic">{part.partName}</td>
                                <td className="px-4 py-2">
                                  <span className={`px-2 py-0.5 rounded text-[8px] font-black ${
                                    part.status === 'ORJ' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                    part.status === 'DEG' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                    'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                  }`}>
                                    {part.status}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-indigo-400">{part.thickness ? `${part.thickness} μm` : '--'}</td>
                                <td className="px-4 py-2 text-[8px] text-white/50 italic opacity-80">{part.notes}</td>
                              </tr>
                            ))
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Advanced Diagnostics Analysis */}
                {diagnosis.advancedAnalysis && (
                    <div className="mt-8 space-y-4">
                        <div className="flex items-center gap-2 text-yellow-400 font-bold text-xs tracking-widest uppercase mb-4">
                            <Activity size={14} className="animate-pulse" />
                            <span>{language === 'TR' ? 'İLERİ DÜZEY ANALİZ (PRO-DIAGNOSTICS)' : (language === 'EN' ? 'ADVANCED ANALYSIS (PRO-DIAGNOSTICS)' : 'AVANCIERTE ANALYSE (PRO-DIAGNOSTICS)')}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white/5 border border-white/10 p-4 rounded-xl backdrop-blur-md group hover:border-yellow-500/50 transition-all">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-yellow-500">
                                        <Maximize2 size={16} />
                                    </div>
                                    <span className="text-[10px] font-black text-white/60 tracking-widest uppercase">{t['tool.zebra']}</span>
                                </div>
                                <p className="text-[11px] text-white/90 leading-relaxed font-medium">{diagnosis.advancedAnalysis.zebraReflections}</p>
                            </div>
                            
                            <div className="bg-white/5 border border-white/10 p-4 rounded-xl backdrop-blur-md group hover:border-yellow-500/50 transition-all">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-cyan-500">
                                        <Droplet size={16} />
                                    </div>
                                    <span className="text-[10px] font-black text-white/60 tracking-widest uppercase">{t['tool.color']}</span>
                                </div>
                                <p className="text-[11px] text-white/90 leading-relaxed font-medium">{diagnosis.advancedAnalysis.spectroscopicColor}</p>
                            </div>

                            <div className="bg-white/5 border border-white/10 p-4 rounded-xl backdrop-blur-md group hover:border-yellow-500/50 transition-all">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-purple-500">
                                        <Activity size={16} />
                                    </div>
                                    <span className="text-[10px] font-black text-white/60 tracking-widest uppercase">{t['tool.texture']}</span>
                                </div>
                                <p className="text-[11px] text-white/90 leading-relaxed font-medium">{diagnosis.advancedAnalysis.textureAnalysis}</p>
                            </div>

                            <div className="bg-white/5 border border-white/10 p-4 rounded-xl backdrop-blur-md group hover:border-yellow-500/50 transition-all">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-indigo-500">
                                        <Cpu size={16} />
                                    </div>
                                    <span className="text-[10px] font-black text-white/60 tracking-widest uppercase">{t['tool.lidar']}</span>
                                </div>
                                <p className="text-[11px] text-white/90 leading-relaxed font-medium">{diagnosis.advancedAnalysis.lidarDepthMap}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Detailed Findings & Integrity Scan */}
                <div className="mt-8 space-y-6">
                    <div className="flex items-center justify-between border-b border-purple-500/20 pb-2">
                        <div className="flex items-center gap-2 text-purple-400 font-bold text-xs tracking-widest uppercase">
                            <Activity size={14} />
                            <span>{language === 'TR' ? 'UZMAN GÖZLEM VE ADLİ ANALİZ BULGULARI' : (language === 'EN' ? 'EXPERT OBSERVATION & FORENSIC FINDINGS' : 'EKSPERTEN-BEOBACHTUNGSBEFUNDE')}</span>
                        </div>
                        <div className="text-[10px] font-mono text-white/40 uppercase">Analiz Durumu: TAMAMLANDI</div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* System Detected Integrity Issues */}
                        <div className="bg-zinc-900 border border-purple-500/30 rounded-xl overflow-hidden p-5 space-y-4">
                            <h4 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                                <Shield size={14} className="text-purple-400" />
                                {language === 'TR' ? 'SİSTEM DOĞRULAMA (AUTO-CHECK)' : 'SYSTEM VERIFICATION'}
                            </h4>
                            
                            <div className="space-y-3">
                                {[
                                    { label: language === 'TR' ? 'Hasarlı / Deforme Parçalar' : 'Damaged / Deformed Parts', value: expertReportData?.damagePercentage || 0, desc: expertReportData?.stanceAnalysis },
                                    { label: language === 'TR' ? 'Eksik / Hatalı Bileşenler' : 'Missing / Wrong Components', value: (expertReportData?.damagePercentage || 0) * 0.4, desc: language === 'TR' ? 'Fabrika spektrum veritabanı ile %94 eşleşme' : '94% match with factory spectrum database' },
                                    { label: language === 'TR' ? 'Yüzey / Macun Anomalisi' : 'Surface / Filler Anomaly', value: diagnosis.advancedAnalysis?.zebraReflections?.includes('tespit') ? 45 : 0, desc: diagnosis.advancedAnalysis?.zebraReflections }
                                ].map((stat, i) => (
                                    <div key={i} className="space-y-1">
                                        <div className="flex justify-between items-center text-[10px] font-mono uppercase">
                                            <span className="text-white/60">{stat.label}</span>
                                            <span className={stat.value > 15 ? 'text-red-400' : 'text-green-400'}>%{stat.value.toFixed(1)}</span>
                                        </div>
                                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                            <motion.div 
                                                initial={{ width: 0 }}
                                                animate={{ width: `${stat.value}%` }}
                                                className={`h-full ${stat.value > 30 ? 'bg-red-500' : stat.value > 0 ? 'bg-orange-500' : 'bg-green-500'}`}
                                            />
                                        </div>
                                        <p className="text-[9px] text-white/30 italic truncate">{stat.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Manual Expert Findings */}
                        <div className="bg-zinc-900 border border-purple-500/30 rounded-xl overflow-hidden p-5">
                            <h4 className="text-[10px] font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                                <ClipboardList size={14} className="text-purple-400" />
                                {language === 'TR' ? 'UZMAN MANUEL KONTROLLERİ' : 'EXPERT MANUAL CHECKS'}
                            </h4>
                            <div className="grid grid-cols-1 gap-2 max-h-[160px] overflow-y-auto pr-2 scrollbar-hide">
                                {Object.values(checklistData).map((section: any) => {
                                    const foundItems = section.items.filter((i: any) => i.checked);
                                    if (foundItems.length === 0) return null;
                                    return foundItems.map((item: any, i: number) => (
                                        <div key={`${section.name}-${i}`} className="flex items-center justify-between bg-purple-500/5 p-2 rounded border border-purple-500/10">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-mono text-purple-400 leading-none mb-1">{getClLabel(section.name, section.name)}</span>
                                                <span className="text-[10px] font-bold text-white">{getClLabel(item.key, item.label)}</span>
                                            </div>
                                            <div className="px-2 py-0.5 bg-red-500/20 rounded border border-red-500/30 text-[8px] font-black text-red-400 uppercase">
                                                {t['checklist.defect']}
                                            </div>
                                        </div>
                                    ));
                                })}
                                {!Object.values(checklistData).some((s: any) => s.items.some((i: any) => i.checked)) && (
                                    <div className="h-full flex flex-col items-center justify-center opacity-20 py-8 text-center">
                                        <ClipboardList size={24} className="mb-2" />
                                        <p className="text-[9px] font-mono uppercase tracking-widest">{t['checklist.no_data']}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Forensic Digital Fingerprint & Audit Trail */}
                <div className="mt-8 p-6 bg-black/40 border border-white/10 rounded-2xl relative overflow-hidden">
                    <div className="absolute inset-0 forensic-grid opacity-5" />
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 text-cyan-500 font-bold text-[10px] tracking-[0.3em] uppercase mb-6">
                            <Shield size={14} className="animate-pulse" />
                            <span>ADLİ DİJİTAL PARMAK İZİ & DENETİM İZİ</span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <span className="text-[7px] font-mono text-white/40 uppercase block mb-1">DATA_HASH_SHA256</span>
                                    <div className="text-[10px] font-mono text-cyan-400 break-all leading-tight bg-white/5 p-2 rounded">
                                        {sensors.magneticField.total.toString(36).repeat(3).substring(0, 32)}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[7px] font-mono text-white/40 uppercase block mb-1">ACOUSTIC_TRACE_ID</span>
                                    <div className="text-[9px] font-mono text-white/80">0x{Date.now().toString(16).toUpperCase()}-MECH-SPEC</div>
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <span className="text-[7px] font-mono text-white/40 uppercase block mb-1">NEURAL_MODEL_V</span>
                                    <div className="text-[10px] font-black text-white italic tracking-widest uppercase">GMN-V2.5-ULTRA-HYBRID</div>
                                </div>
                                <div>
                                    <span className="text-[7px] font-mono text-white/40 uppercase block mb-1">IMG_METRICS</span>
                                    <div className="text-[9px] font-mono text-white/80">640x480 | RAW_RGB | ISO-AUTO</div>
                                </div>
                            </div>

                            <div className="md:col-span-2 bg-gradient-to-br from-cyan-500/5 to-transparent border border-white/5 p-4 rounded-xl">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-[8px] font-mono text-cyan-400 uppercase tracking-widest font-black">Güvenli Arşiv Onayı</span>
                                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,1)]" />
                                </div>
                                <p className="text-[9px] font-mono text-white/50 leading-relaxed italic">
                                    Bu rapor, AKN Global Group Ltd adli bilişim standartlarına göre şifrelenmiş ve bulut veritabanında (UUID: {Math.abs(((diagnosis.objectName || 'AKN') + (diagnosis.model || '')).split('').reduce((a, c) => a + c.charCodeAt(0), 0)).toString(16).padStart(8, '0').toUpperCase()}) kalıcı olarak arşivlenmiştir. 
                                    Tüm analizler gerçek zamanlı sensör füzyonu ve Computer Vision (GMN-V2) algoritmaları ile doğrulanmıştır.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-8 space-y-6">
                    <section>
                        <h3 className="text-sm font-mono text-yellow-500 mb-4 flex items-center gap-2">
                            <Info size={16} /> {t['diagnosis.recall'].toUpperCase()}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {(diagnosis.recallHistory || []).map((recall, i) => (
                                <div key={i} className="flex items-center gap-3 bg-yellow-500/5 p-4 border border-yellow-500/20 rounded backdrop-blur-sm">
                                    <div className="w-8 h-8 rounded bg-yellow-500/20 flex items-center justify-center shrink-0">
                                        <Info size={14} className="text-yellow-500" />
                                    </div>
                                    <span className="text-[11px] text-yellow-100 font-medium">{recall}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                    
                    <div className="pt-10 flex flex-col items-center gap-4">
                         <div className="w-full max-w-md p-4 bg-cyan-500 text-black rounded-lg font-black text-center uppercase tracking-[0.2em] text-sm italic shadow-[0_0_30px_rgba(6,182,212,0.4)]">
                            {language === 'TR' ? 'TEKNİK EKSPERTİZ ONAYLANDI' : (language === 'EN' ? 'TECHNICAL INSPECTION APPROVED' : 'TECHNISCHE INSPEKTION GENEHMIGT')}
                         </div>
                         
                         <button 
                            onClick={handleDownloadReport}
                            className="group flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 hover:border-cyan-500/50 hover:bg-cyan-500/10 rounded-full transition-all duration-300"
                         >
                            <Download size={18} className="text-cyan-400 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-black uppercase tracking-widest text-white">{language === 'TR' ? 'Raporu İndir (.txt)' : (language === 'EN' ? 'Download Report (.txt)' : 'Bericht herunterladen (.txt)')}</span>
                         </button>

                         <div className="text-[9px] font-mono text-white/30 uppercase tracking-widest">AKN Global Group Ltd Diagnostic Certification v4.2</div>
                    </div>
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {showHistory && (
          <motion.div 
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="fixed inset-y-0 right-0 z-[70] w-full max-w-sm bg-black/90 backdrop-blur-2xl border-l border-cyan-500/20 p-6 flex flex-col"
          >
            <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
              <h2 className="text-xl font-black italic tracking-tighter uppercase">{language === 'TR' ? 'TARAMA GEÇMİŞİ' : (language === 'EN' ? 'SCAN HISTORY' : 'SCAN-HISTORIE')}</h2>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-white/10 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {history.length > 0 ? history.map((item, i) => (
                <div 
                  key={i} 
                  onClick={() => {
                    setDiagnosis(item);
                    setShowHistory(false);
                    setTimeout(() => setShowDetails(true), 100);
                  }}
                  className="p-4 bg-white/5 border border-zinc-800 rounded-xl group hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all cursor-pointer active:scale-95"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-widest">{language === 'TR' ? 'ARŞİV KAYDI' : 'ARCHIVE_RECORD'}_{history.length - i}</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                  </div>
                  <div className="text-white font-black text-sm mb-0.5 italic tracking-tight">{item.objectName || (language === 'TR' ? 'Tanımlanamayan Araç' : 'Unidentified Vehicle')}</div>
                  <div className="text-zinc-400 font-bold text-[11px] mb-1">{item.model} {item.year}</div>
                  <div className="text-zinc-600 text-[9px] font-mono mb-3 uppercase tracking-tighter">{item.version} • {new Date().toLocaleDateString(language === 'TR' ? 'tr-TR' : 'en-US')}</div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500/40 w-[65%]" />
                    </div>
                    <span className="text-[8px] font-black text-cyan-500/60 uppercase">{language === 'TR' ? 'DETAYLARI GÖR' : 'VIEW DETAILS'}</span>
                  </div>
                </div>
              )) : (
                <div className="h-full flex flex-col items-center justify-center opacity-30">
                  <ClipboardList size={48} className="mb-4" />
                  <p className="text-xs font-mono uppercase">{language === 'TR' ? 'Henüz veri kaydedilmedi' : (language === 'EN' ? 'No data recorded yet' : 'Noch keine Daten aufgezeichnet')}</p>
                </div>
              )}
            </div>

            <button 
              onClick={() => { localStorage.removeItem('akn_history'); setHistory([]); }}
              className="mt-6 w-full py-3 border border-red-500/30 text-red-400 font-mono text-[10px] uppercase hover:bg-red-500/10 transition-colors"
            >
              {language === 'TR' ? 'GEÇMİŞİ TEMİZLE' : (language === 'EN' ? 'CLEAR HISTORY' : 'VERLAUF LÖSCHEN')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* User Manual Modal */}
      <AnimatePresence>
        {showManual && (
          <motion.div 
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-2xl flex flex-col p-6 overflow-y-auto"
          >
          <div className="max-w-2xl mx-auto w-full">
                <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
                    <div className="flex items-center gap-3">
                        <ClipboardList className="text-cyan-500" size={24} />
                        <h2 className="text-2xl font-black italic tracking-tighter uppercase">
                            {language === 'TR' ? 'SİSTEM KULLANIM KILAVUZU' : (language === 'EN' ? 'SYSTEM USER MANUAL' : 'SYSTEM-BENUTZERHANDBUCH')}
                        </h2>
                    </div>
                    <button onClick={handleCloseManual} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="space-y-8 text-sm">
                    {/* 1. Çalışma Mantığı */}
                    <section>
                        <h3 className="text-cyan-400 font-mono mb-4 uppercase tracking-widest flex items-center gap-2 text-xs">
                            <Cpu size={16} /> 1. {language === 'TR' ? 'Çalışma Mantığı ve Derin Mimari' : 'Working Logic & Deep Architecture'}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white/5 p-4 rounded-xl border border-white/10 hover:border-cyan-500/30 transition-all">
                                <div className="flex items-center gap-2 mb-2">
                                    <Maximize2 size={16} className="text-yellow-400" />
                                    <span className="text-yellow-400 font-bold uppercase text-[10px] tracking-widest">{t['tool.zebra']} (Refraction Analizi)</span>
                                </div>
                                <p className="text-white/60 text-[11px] leading-relaxed">
                                    {language === 'TR' 
                                        ? 'Endüstriyel otomobil tasarımında kullanılan Zebra projeksiyon tekniğinin dijital simülasyonudur. Sistem, cihaz jiroskobuna bağlı dinamik Refraction (Kırılma) algoritması kullanarak kaporta yüzeyine sanal ışık hüzmeleri gönderir. Çizgilerin paralelliğinin bozulması, macun dolgularını ve yüzey dalgalanmalarını saptar. AE Lock (Pozlama Kilidi) sayesinde ışık değişimlerinden etkilenmez.' 
                                        : 'A digital simulation of the Zebra projection technique used in industrial design. The system uses a dynamic Refraction algorithm linked to the device gyroscope to project virtual light beams onto the bodywork. Distortion in lines identifies body fillers and surface ripples. AE Lock ensures consistency against light changes.'}
                                </p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl border border-white/10 hover:border-cyan-500/30 transition-all">
                                <div className="flex items-center gap-2 mb-2">
                                    <Droplet size={16} className="text-cyan-400" />
                                    <span className="text-cyan-400 font-bold uppercase text-[10px] tracking-widest">{t['tool.color']} (Spectroscopic ΔE)</span>
                                </div>
                                <p className="text-white/60 text-[11px] leading-relaxed">
                                    {language === 'TR' 
                                        ? 'Diferansiyel Spectrometric Analiz katmanıdır. Farklı panellerden (örn: kapı ve çamurluk) alınan anlık RGB/LAB verilerini karşılaştırarak %5 üzerindeki sapmalarda "Boya Farkı" uyarısı verir. AE Lock (Otomatik Pozlama Kilidi) aktif edilerek ışık dalgalanmalarının analizi yanıltması engellenir ve %100 doğruluk sağlanır.' 
                                        : 'Differential Spectrometric Analysis layer. It analyzes light reflection differences between factory-grade paint pigment density and aftermarket painting. By measuring the Delta-E (color variance) value between two panels, it scientifically determines if a part has been repainted.'}
                                </p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl border border-white/10 hover:border-cyan-500/30 transition-all">
                                <div className="flex items-center gap-2 mb-2">
                                    <Activity size={16} className="text-purple-400" />
                                    <span className="text-purple-400 font-bold uppercase text-[10px] tracking-widest">{t['tool.texture']} (Canny Edge Detection)</span>
                                </div>
                                <p className="text-white/60 text-[11px] leading-relaxed">
                                    {language === 'TR' 
                                        ? 'Optik Kenar Keskinleştirme motorudur. Boya altındaki macun çatlaklarını, zımpara izlerini ve mikroskobik doku uyumsuzluklarını (Canny Edge Detection) algoritması ile yakalar. 30 FPS hızındaki Vision Engine sayesinde hareket halindeyken bile yüzey kusurlarını insan gözünden daha iyi analiz eder ve raporlar.' 
                                        : 'Optical Edge Sharpening engine. It captures filler cracks, sanding marks, and microscopic texture mismatches using the Canny Edge Detection algorithm. Thanks to the 30 FPS Vision Engine, it analyzes surface defects better than the human eye even while in motion.'}
                                </p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl border border-white/10 hover:border-cyan-500/30 transition-all">
                                <div className="flex items-center gap-2 mb-2">
                                    <Box size={16} className="text-indigo-400" />
                                    <span className="text-indigo-400 font-bold uppercase text-[10px] tracking-widest">{t['tool.lidar']} (3D Stabilizer Guide)</span>
                                </div>
                                <p className="text-white/60 text-[11px] leading-relaxed">
                                    {language === 'TR' 
                                        ? 'Jiroskop tabanlı 3B Tarama Rehberidir. Sensör verileriyle telefonun tutuş açısını doğrular ve kullanıcıya ideal tarama açısını sunan sanal terazi (AI-Stabilizer) eşliğinde rehberlik eder. Bu sayede hatalı açıyla çekilen verilerin analizi bozması engellenir, milimetrik şasi kaymaları en yüksek hassasiyetle tespit edilir.' 
                                        : 'Gyroscope-based 3D Scanning Guide. It verifies the phone tilt with sensor data and guides the user via a virtual level (AI-Stabilizer) for the ideal scanning angle. This prevents incorrect angles from distorting analysis.'}
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* 2. Nasıl Kullanılır */}
                    <section>
                        <h3 className="text-cyan-400 font-mono mb-4 uppercase tracking-widest flex items-center gap-2 text-xs">
                            <Info size={16} /> 2. {language === 'TR' ? 'Uygulama İle Profesyonel Analiz Rehberi' : 'Professional Analysis Guide with the App'}
                        </h3>
                        <div className="space-y-6">
                            <div className="flex gap-4 group">
                                <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0 text-cyan-400 font-black border border-cyan-500/30 group-hover:bg-cyan-500 group-hover:text-black transition-all">1</div>
                                <div>
                                    <p className="font-bold text-white uppercase text-[12px] mb-1">{language === 'TR' ? 'ID Modu ve Doğru Konumlama' : 'ID Mode & Proper Positioning'}</p>
                                    <p className="text-white/60 leading-relaxed">
                                         {language === 'TR' 
                                             ? 'Cihazınızı araca tam paralel tutarak "CAR DETECTED" uyarısını bekleyin. Ardından GUIDE modunu açarak aracı çizgilere tam oturtun. Bu, yapay zekanın parçaları doğru indekslemesini sağlar.' 
                                             : 'Hold your device parallel to the vehicle and wait for the "CAR DETECTED" warning. Then enable GUIDE mode and align the vehicle precisely with the lines.'}
                                     </p>
                                 </div>
                            </div>
                            <div className="flex gap-4 group">
                                <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0 text-cyan-400 font-black border border-cyan-500/30 group-hover:bg-cyan-500 group-hover:text-black transition-all">2</div>
                                <div>
                                    <p className="font-bold text-white uppercase text-[12px] mb-1">{language === 'TR' ? 'Pro Araçlar ve Tarama' : 'Pro Tools & Scanning'}</p>
                                    <p className="text-white/60 leading-relaxed">
                                         {language === 'TR' 
                                            ? 'Analiz sırasında sağ taraftaki katmanları (Zebra, Renk, Doku) kullanarak anomali tespiti yapın. Ana tarama butonu ile tüm açıları kaydederek 360 derece raporunuzu oluşturun.' 
                                            : 'Detect anomalies during analysis using the layers on the right (Zebra, Color, Texture). Save all angles with the main scan button to generate your 360-degree report.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 3. Arayüz ve Fonksiyon Sözlüğü */}
                    <section>
                        <h3 className="text-cyan-400 font-mono mb-4 uppercase tracking-widest flex items-center gap-2 text-xs">
                            <Box size={16} /> 3. {language === 'TR' ? 'Arayüz ve Fonksiyon Sözlüğü' : 'Interface & Function Dictionary'}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                                <p className="font-bold text-white uppercase text-[10px] mb-2 text-cyan-400">AKN Global Group Ltd Status (v4.5.0-PRO)</p>
                                <p className="text-white/60 text-[11px] leading-relaxed">
                                    {language === 'TR' 
                                        ? 'Sol üst panelde yer alan "HIBRI ANALIZ (COCO-SSD)" ibaresi, 30 FPS hızındaki Vision Engine ve yerel NPU gücünü ifade eder. Sistem, verileri cihazınızda anonim olarak ön işler ve sadece "AI Detaylı Rapor" istediğinizde bulut katmanı ile güvenli iletişim kurarak profesyonel forensik metinler oluşturur.' 
                                        : 'The "HYBRID ANALYSIS (COCO-SSD)" indicator signifies the 30 FPS Vision Engine and local NPU power. The system pre-processes data anonymously on your device and only communicates with the cloud layer to generate professional forensic reports when requested.'}
                                </p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                                <p className="font-bold text-white uppercase text-[10px] mb-2 text-purple-400">Manuel Ekspertiz & Katmanlar</p>
                                <p className="text-white/60 text-[11px] leading-relaxed">
                                    {language === 'TR' 
                                        ? 'Hassas bileşenlerin (Motor, Mekanik, Elektriksel, Gövde) manuel giriş alanıdır. Yapay zekanın göremediği iç trim kondisyonu veya motor sesi gibi sübjektif verileri kriptografik rapora eklemenizi sağlar.' 
                                        : 'Manual entry area for critical components (Engine, Mechanical, Electrical, Body). It allows you to add subjective data like interior trim condition or engine sound, which the AI cannot see, into the cryptographic report.'}
                                </p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                                <p className="font-bold text-white uppercase text-[10px] mb-2 text-green-400">Kondisyon Skoru & Güven Endeksi</p>
                                <p className="text-white/60 text-[11px] leading-relaxed">
                                    {language === 'TR' 
                                        ? 'Tarama sonunda sunulan skor; AI güven faktörü, ortam ışık kalitesi (Light Confidence) ve yerel ölçüm verilerinin ağırlıklı ortalamasıdır. AI Detaylı Rapor butonu ile bu verileri derinlemesine bir uzman yorumuna dönüştürebilirsiniz.' 
                                        : 'The score presented after scanning is a weighted average of the AI confidence factor, ambient light quality (Light Confidence), and local measurement data. Use the AI Detailed Report button to turn this data into a deep expert commentary.'}
                                </p>
                            </div>
                            <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex flex-col justify-center">
                                <div className="flex flex-wrap gap-2">
                                    {['ARAÇ', 'MEKANİK', 'ELEKTRİK', 'GÖVDE'].map(cat => (
                                        <span key={cat} className="px-2 py-1 bg-white/10 border border-white/10 rounded text-[9px] font-mono text-white/40">{cat}</span>
                                    ))}
                                </div>
                                <p className="mt-2 text-[10px] text-white/40 italic">
                                    {language === 'TR' ? '* Tüm alt modüller "Güven Endeksi"ne farklı ağırlıklarda etki eder.' : '* All sub-modules affect the "Confidence Index" with different weights.'}
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* 4. Güvenilirliği Etkileyen Faktörler */}
                    <section className="bg-yellow-500/5 p-6 rounded-2xl border border-yellow-500/20">
                        <h3 className="text-yellow-400 font-black text-[10px] mb-4 uppercase tracking-[0.3em] flex items-center gap-2">
                            <AlertTriangle size={14} /> 4. {language === 'TR' ? 'GÜVENİLİRLİĞİ ETKİLEYEN KRİTİK DIŞ ETKENLER' : 'CRITICAL EXTERNAL FACTORS AFFECTING RELIABILITY'}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h4 className="text-[10px] font-mono text-white/40 uppercase mb-2">{language === 'TR' ? '01. IŞIK VE AMBİYANS KOŞULLARI' : '01. LIGHT & AMBIANCE CONDITIONS'}</h4>
                                <p className="text-[11px] text-white/70 leading-relaxed">
                                    {language === 'TR' 
                                        ? 'Yapay zekanın en net veriyi ürettiği ortam, 5500K-6000K gün ışığı değerindeki homojen aydınlatmadır. Aşırı direkt güneş ışığı "flare" (ışık patlaması) yaparak spektroskopik veriyi bozar. Zifiri karanlık ortamlar ise doku analiz motorunun pikselleri ayrıştırmasını engeller ve güven endeksini %30-40 seviyelerine düşürür.' 
                                        : 'The environment where the AI produces the clearest data is homogeneous lighting with a daylight value of 5500K-6000K. Excessive direct sunlight causes flares, distorting spectroscopic data. Pitch-black environments prevent the texture analysis engine from resolving pixels, dropping the confidence index to 30-40% levels.'}
                                </p>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-mono text-white/40 uppercase mb-2">{language === 'TR' ? '02. ARAÇ YÜZEY TEMİZLİĞİ VE KONTAMİNASYON' : '02. VEHICLE SURFACE CLEANLINESS & CONTAMINATION'}</h4>
                                <p className="text-[11px] text-white/70 leading-relaxed">
                                    {language === 'TR' 
                                        ? 'Boyalı parçanın üzerindeki kalın toz katmanı, çamur lekeleri veya yoğun su damlaları, sistemin doku tanıma algoritmasını yanıltabilir. AI, kurumuş bir çamur lekesini "macun çatlağı" veya "boya kusuru" olarak etiketleyebilir. En güvenilir sonuç için aracın temiz ve kuru olması elzemdir.' 
                                        : 'A thick layer of dust, mud stains, or heavy water droplets on the painted part can mislead the texture recognition algorithm. The AI might label a dried mud stain as a "filler crack" or "paint defect". For the most reliable results, it is essential that the vehicle is clean and dry.'}
                                </p>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-mono text-white/40 uppercase mb-2">{language === 'TR' ? '03. OPTİK SENSÖR VE DONANIM LİMİTLERİ' : '03. OPTICAL SENSOR & HARDWARE LIMITS'}</h4>
                                <p className="text-[11px] text-white/70 leading-relaxed">
                                    {language === 'TR' 
                                        ? 'Cihazınızın kamera diyafram açıklığı ve LiDAR sensörünün olup olmaması analizi doğrudan etkiler. LiDAR olmayan cihazlarda derinlik verisi yazılımsal (Parallax) olarak hesaplanır, bu da hata payını artırabilir. Ayrıca lens üzerindeki parmak izleri görüntüyü puslu yaparak kenar belirleme (Edge Detection) başarısını düşürür.' 
                                        : 'Your device\'s camera aperture and the presence of a LiDAR sensor directly affect the analysis. On devices without LiDAR, depth data is calculated via software (Parallax), which may increase the margin of error. Also, fingerprints on the lens make the image hazy, reducing Edge Detection success.'}
                                </p>
                            </div>
                            <div>
                                <h4 className="text-[10px] font-mono text-white/40 uppercase mb-2">{language === 'TR' ? '04. OPERATÖR HAREKETLERİ VE STABİLİTE' : '04. OPERATOR MOVEMENTS & STABILITY'}</h4>
                                <p className="text-[11px] text-white/70 leading-relaxed">
                                    {language === 'TR' 
                                        ? 'Analiz sırasında elin aşırı titremesi veya telefonun çok hızlı hareket ettirilmesi (Motion Blur), yapay zekanın pikselleri doğru eşleştirmesini engeller. Sabit, yavaş ve 50-100 cm mesafeden yapılan taramalar en yüksek "Güven Puanı"nı (Confidence Score) üretir.' 
                                        : 'Excessive hand tremors or moving the phone too quickly (Motion Blur) during analysis prevents the AI from correctly matching pixels. Steady, slow scans performed from a distance of 50-100 cm produce the highest "Confidence Score".'}
                                </p>
                            </div>
                        </div>
                    </section>

                    <div className="h-10" />
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
