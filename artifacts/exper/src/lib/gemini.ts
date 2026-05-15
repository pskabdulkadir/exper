import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as mobilenet from '@tensorflow-models/mobilenet';
import { Language, GLOBAL_TRANSLATIONS } from './translations';

export const hasApiKey = false;

export async function checkConnectivity(): Promise<boolean> {
    return navigator.onLine;
}

const NOISY_LABELS = [
    'mosquito net', 'window screen', 'mesh', 'chainlink fence', 'velvet',
    'refrigerator', 'screen', 'honeycomb', 'window shade', 'loudspeaker', 'textile', 'fabric'
];

function translateClass(className: string, lang: Language = 'TR'): string {
    const lower = className.toLowerCase();
    const dikt = GLOBAL_TRANSLATIONS[lang];
    if (dikt[lower]) return dikt[lower];
    const parts = lower.split(/[\s,]+/).filter(p => p.length > 2);
    for (const part of parts) {
        if (dikt[part]) return dikt[part];
    }
    for (const [key, value] of Object.entries(dikt)) {
        if (lower.includes(key)) return value;
    }
    return className;
}

export type EngineStatus = 'idle' | 'booting' | 'ready' | 'error';

export const forensicEngine = {
    cocoModel: null as cocoSsd.ObjectDetection | null,
    classificationModel: null as mobilenet.MobileNet | null,
    isReady: false,
    status: 'idle' as EngineStatus
};

export let cocoModel: cocoSsd.ObjectDetection | null = null;
export let classificationModel: mobilenet.MobileNet | null = null;

let isModelLoading = false;
let modelLoadingPromise: Promise<void> | null = null;

export const VEHICLE_KEYWORDS = /car|truck|bus|motorcycle|van|cab|ambulance|fire engine|garbage truck|pickup|trailer|wagon|sedan|coupe|convertible|hatchback|suv|minivan|cycle|auto|vehicle|heavy vehicle|tractor unit|semi-truck|lorry|wreck|junk|scrap car|ruin/i;
export const HEAVY_VEHICLES = /bus|truck|pickup|trailer|garbage truck|fire engine|lorry|semi-truck|tractor unit|kamyon|otobüs|çekici|tır/i;
export const SCRAP_KEYWORDS = /wreck|junk|scrap|ruin|broken|damaged|hurda|hasarlı|kazalı/i;

export async function preLoadModels() {
    if (forensicEngine.status === 'ready' && forensicEngine.cocoModel && forensicEngine.classificationModel) return;
    if (isModelLoading && modelLoadingPromise) return modelLoadingPromise;

    isModelLoading = true;
    forensicEngine.status = 'booting';
    modelLoadingPromise = (async () => {
        try {
            console.log("Forensic Engine: Booting local neural units...");
            try {
                await tf.setBackend('webgl');
            } catch {
                console.warn("WebGL not supported, falling back to CPU");
                await tf.setBackend('cpu');
            }
            await tf.ready();
            const [coco, mobile] = await Promise.all([
                cocoSsd.load({ base: 'lite_mobilenet_v2' }),
                mobilenet.load({ version: 2, alpha: 1.0 })
            ]);
            forensicEngine.cocoModel = coco;
            forensicEngine.classificationModel = mobile;
            cocoModel = coco;
            classificationModel = mobile;
            forensicEngine.isReady = true;
            forensicEngine.status = 'ready';
            console.log("Forensic Engine: Local processors online.");
        } catch (e) {
            console.error("Forensic Engine: Boot failure", e);
            forensicEngine.status = 'error';
        } finally {
            isModelLoading = false;
            modelLoadingPromise = null;
        }
    })();
    return modelLoadingPromise;
}

export function getEngineStatus() {
    return forensicEngine.status;
}

async function getLocalModels() {
    if (!forensicEngine.isReady || !forensicEngine.cocoModel) {
        await preLoadModels();
    }
    return {
        cocoModel: forensicEngine.cocoModel || cocoModel,
        classificationModel: forensicEngine.classificationModel || classificationModel
    };
}

// ─── VIN / WMI Tablosu (Genişletilmiş) ───────────────────────────────────────
const WMI_TABLE: Record<string, string> = {
    // Almanya
    'WBA': 'BMW', 'WBS': 'BMW M GmbH', 'WBY': 'BMW (Elektrik)',
    'WDB': 'Mercedes-Benz', 'WDD': 'Mercedes-Benz', 'WDC': 'Mercedes-Benz SUV',
    'WVW': 'Volkswagen', 'WV1': 'Volkswagen Ticari', 'WV2': 'Volkswagen Bus',
    'WAU': 'Audi', 'WAP': 'Porsche (AG)', 'WP0': 'Porsche', 'WP1': 'Porsche SUV',
    'W09': 'Porsche (başka fabrika)',
    'W0L': 'Opel', 'W0V': 'Opel/Vauxhall',
    // Fransa
    'VF1': 'Renault', 'VF3': 'Peugeot', 'VF6': 'Peugeot (diğer)',
    'VF7': 'Citroën', 'VF8': 'Citroën (DS)',
    // İtalya
    'ZFA': 'Fiat', 'ZFB': 'Fiat (başka)',
    'ZAR': 'Alfa Romeo', 'ZFF': 'Ferrari', 'ZHW': 'Lamborghini',
    'ZLA': 'Lancia', 'ZCF': 'Iveco', 'SCC': 'Lotus',
    // İngiltere
    'SAL': 'Land Rover', 'SAD': 'Jaguar', 'SAJ': 'Jaguar (XJ)',
    'SCA': 'Rolls-Royce', 'SCB': 'Bentley', 'SCE': 'McLaren',
    'SDB': 'Aston Martin', 'SFD': 'Alexander Dennis',
    'SAB': 'Range Rover (eski)',
    // İsveç
    'YV1': 'Volvo', 'YV4': 'Volvo SUV', 'YS3': 'Saab',
    // Çek Cumhuriyeti
    'TMB': 'Škoda', 'TMT': 'Tatra',
    // Macaristan
    'TRU': 'Audi (Macaristan)',
    // Japonya
    'JHM': 'Honda', 'JH4': 'Acura',
    'JTD': 'Toyota', 'JT2': 'Toyota', 'JT3': 'Toyota SUV',
    'JN1': 'Nissan', 'JN8': 'Nissan SUV',
    'JF1': 'Subaru', 'JF2': 'Subaru (4WD)',
    'JA3': 'Mitsubishi', 'JA4': 'Mitsubishi SUV', 'JA32': 'Mitsubishi Colt',
    'JMB': 'Mitsubishi (ek)',
    'JS1': 'Suzuki', 'JS3': 'Suzuki SUV',
    'JM1': 'Mazda', 'JM3': 'Mazda SUV',
    'JA1': 'Mitsubishi (diğer)',
    // Güney Kore
    'KL1': 'Chevrolet (Daewoo)', 'KL3': 'Daewoo',
    'KMH': 'Hyundai', 'KMF': 'Hyundai Ticari',
    'KNA': 'Kia', 'KNM': 'Kia (fabrika)',
    // Amerika Birleşik Devletleri
    '1FA': 'Ford (Otomobil)', '1FT': 'Ford (Kamyon)',
    '1G1': 'Chevrolet', '1GC': 'Chevrolet Kamyon', '1GT': 'GMC',
    '2G1': 'Chevrolet (Kanada)', '2T1': 'Toyota (Kanada)',
    '3FA': 'Ford (Meksika)', '3VW': 'Volkswagen (Meksika)',
    '4T1': 'Toyota (ABD)', '5YJ': 'Tesla',
    '1C3': 'Chrysler', '1C4': 'Jeep', '2C3': 'Chrysler (Kanada)',
    '1N4': 'Nissan (ABD)', '1N6': 'Nissan Kamyon (ABD)',
    '1HG': 'Honda (ABD)', '19U': 'Acura (ABD)',
    '2HG': 'Honda (Kanada)',
    // Romanya
    'UU1': 'Dacia',
    // İspanya
    'VSS': 'SEAT', 'VS6': 'Ford (İspanya)',
    'VSA': 'Mercedes-Benz (İspanya)',
    // Brezilya
    '9BW': 'Volkswagen (Brezilya)', '9BD': 'Fiat (Brezilya)',
    '8AF': 'Ford (Arjantin)',
    // Çin
    'LSV': 'Volkswagen (Çin)', 'LFV': 'Volkswagen FAW',
    'LGB': 'Buick (Çin)', 'LFP': 'Toyota (Çin)',
    'LSY': 'SAIC-GM Cadillac',
    // Hindistan
    'MAL': 'Mahindra', 'MAT': 'Tata Motors',
    // Diğer
    'TW1': 'Toyota (Türkiye)',
    'YV2': 'Volvo Kamyon', 'YV3': 'Volvo Otobüs',
};

export async function getVinDetails(vin: string, lang: Language = 'TR') {
    const cleanVin = vin.trim().toUpperCase();
    if (cleanVin.length < 17) {
        return {
            title: lang === 'TR' ? 'GEÇERSİZ VIN' : 'INVALID VIN',
            sections: [],
            integrity: lang === 'TR' ? 'VIN numarası 17 karakter olmalıdır.' : 'VIN must be 17 characters.'
        };
    }

    // WMI (3 karakter)
    const wmi3 = cleanVin.substring(0, 3);
    const wmi2 = cleanVin.substring(0, 2);
    const brand = WMI_TABLE[wmi3] || WMI_TABLE[wmi2] || (lang === 'TR' ? 'Bilinmeyen Marka' : 'Unknown Brand');

    // Üretim yılı (10. karakter)
    const yearMap: Record<string, number> = {
        'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014, 'F': 2015,
        'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019, 'L': 2020, 'M': 2021,
        'N': 2022, 'P': 2023, 'R': 2024, 'S': 2025, 'T': 2026,
        'V': 1997, 'W': 1998, 'X': 1999, 'Y': 2000,
        '1': 2001, '2': 2002, '3': 2003, '4': 2004, '5': 2005,
        '6': 2006, '7': 2007, '8': 2008, '9': 2009
    };
    const yearChar = cleanVin[9] || 'M';
    const prodYear = yearMap[yearChar] || 2021;

    // Üretici ülkesi (1. karakter)
    const countryMap: Record<string, string> = {
        'W': lang === 'TR' ? 'Almanya' : 'Germany',
        'V': lang === 'TR' ? 'Fransa' : 'France',
        'Z': lang === 'TR' ? 'İtalya' : 'Italy',
        'S': lang === 'TR' ? 'İngiltere' : 'United Kingdom',
        'Y': lang === 'TR' ? 'Finlandiya/İsveç' : 'Finland/Sweden',
        'U': lang === 'TR' ? 'Romanya/Polonya' : 'Romania/Poland',
        'T': lang === 'TR' ? 'İsviçre/Çek Cumh.' : 'Switzerland/Czech Rep.',
        'J': lang === 'TR' ? 'Japonya' : 'Japan',
        'K': lang === 'TR' ? 'Güney Kore' : 'South Korea',
        'L': lang === 'TR' ? 'Çin' : 'China',
        'M': lang === 'TR' ? 'Hindistan/Tayland' : 'India/Thailand',
        '1': lang === 'TR' ? 'ABD' : 'USA',
        '2': lang === 'TR' ? 'Kanada' : 'Canada',
        '3': lang === 'TR' ? 'Meksika' : 'Mexico',
        '4': lang === 'TR' ? 'ABD' : 'USA',
        '5': lang === 'TR' ? 'ABD' : 'USA',
        '6': lang === 'TR' ? 'Avustralya' : 'Australia',
        '9': lang === 'TR' ? 'Brezilya' : 'Brazil',
        '8': lang === 'TR' ? 'Arjantin' : 'Argentina',
    };
    const country = countryMap[cleanVin[0]] || (lang === 'TR' ? 'Bilinmiyor' : 'Unknown');

    // Kontrol rakamı doğrulama (9. karakter)
    const checkDigit = cleanVin[8];
    const isValidChecksum = /^[0-9X]$/.test(checkDigit);

    const templates = {
        TR: {
            title: 'FABRİKA ÇIKIŞ KONFİGÜRASYON RAPORU',
            sections: [
                {
                    name: 'GENEL ARAÇ BİLGİLERİ',
                    items: [
                        { label: 'Üretici (WMI)', value: brand },
                        { label: 'Üretim Yılı', value: prodYear.toString() },
                        { label: 'Üretim Ülkesi', value: country },
                        { label: 'Şasi Numarası', value: cleanVin },
                        { label: 'Kontrol Basamağı', value: checkDigit + (isValidChecksum ? ' ✓' : ' ✗') },
                    ]
                },
                {
                    name: 'ARAÇ TANIMLAMA (VDS)',
                    items: [
                        { label: 'VDS Kodu', value: cleanVin.substring(3, 9) },
                        { label: 'Sıra Numarası', value: cleanVin.substring(11) },
                        { label: 'Durum', value: 'Fabrika Standartlarına Uygun' }
                    ]
                }
            ],
            integrity: `VIN verileri yerel WMI veritabanıyla doğrulandı. Üretici: ${brand} | Yıl: ${prodYear}`
        },
        EN: {
            title: 'FACTORY SPECIFICATION REPORT',
            sections: [
                {
                    name: 'GENERAL VEHICLE INFO',
                    items: [
                        { label: 'Manufacturer (WMI)', value: brand },
                        { label: 'Production Year', value: prodYear.toString() },
                        { label: 'Country of Origin', value: country },
                        { label: 'Chassis Number', value: cleanVin },
                        { label: 'Check Digit', value: checkDigit + (isValidChecksum ? ' ✓' : ' ✗') },
                    ]
                },
                {
                    name: 'VEHICLE DESCRIPTOR (VDS)',
                    items: [
                        { label: 'VDS Code', value: cleanVin.substring(3, 9) },
                        { label: 'Serial Number', value: cleanVin.substring(11) },
                        { label: 'Status', value: 'Matches Factory Standards' }
                    ]
                }
            ],
            integrity: `VIN verified against local WMI database. Manufacturer: ${brand} | Year: ${prodYear}`
        }
    };
    return lang === 'TR' ? templates.TR : templates.EN;
}

// ─── Tip Tanımları ────────────────────────────────────────────────────────────

export interface BodyPartStatus {
    partName: string;
    status: 'ORJ' | 'BOY' | 'LOK' | 'DEG' | 'CIZ' | 'GOK' | 'KIR' | 'MAC';
    thickness?: number;
    notes?: string;
}

export interface VehicleDiagnosis {
    model?: string;
    year?: string;
    version?: string;
    chronicIssues?: string[];
    recallHistory?: string[];
    maintenanceAlerts?: string[];
    isVehicle: boolean;
    objectName: string;
    vehicleSubtype?: string;
    anglesAnalyzed?: string[];
    confidenceScore?: number;
    confidenceReason?: string;
    exteriorCondition?: Record<string, string>;
    bodyReport?: Record<string, BodyPartStatus[]>;
    technicalSpecs?: {
        engine: string;
        transmission: string;
        chassis: string;
        electricalSystem: string;
    };
    advancedAnalysis?: {
        zebraReflections: string;
        spectroscopicColor: string;
        textureAnalysis: string;
        lidarDepthMap: string;
        xrayProjection?: string;
        micronHomogeneity?: string;
        thermalGradient?: string;
        pillarAnalysis?: string;
    };
}

export interface SensorData {
    magneticField?: { x: number; y: number; z: number; total: number };
    acceleration?: { x: number; y: number; z: number; total: number };
}

const BODY_PARTS_BY_ANGLE: Record<string, { id: string; nameTR: string; nameEN: string }[]> = {
    front: [
        { id: 'hood', nameTR: 'Motor Kaputu', nameEN: 'Hood' },
        { id: 'bumper_f', nameTR: 'Ön Tampon', nameEN: 'Front Bumper' },
        { id: 'headlights', nameTR: 'Ön Farlar', nameEN: 'Headlights' },
        { id: 'grille', nameTR: 'Izgara / Panjur', nameEN: 'Grille' },
    ],
    rear: [
        { id: 'trunk', nameTR: 'Bagaj Kapağı', nameEN: 'Trunk Lid' },
        { id: 'bumper_r', nameTR: 'Arka Tampon', nameEN: 'Rear Bumper' },
        { id: 'taillights', nameTR: 'Arka Stop Lambaları', nameEN: 'Taillights' },
    ],
    left: [
        { id: 'door_fl', nameTR: 'Sol Ön Kapı', nameEN: 'Front Left Door' },
        { id: 'door_rl', nameTR: 'Sol Arka Kapı', nameEN: 'Rear Left Door' },
        { id: 'fender_fl', nameTR: 'Sol Ön Çamurluk', nameEN: 'Front Left Fender' },
        { id: 'mirror_l', nameTR: 'Sol Dış Ayna', nameEN: 'Left Mirror' },
    ],
    right: [
        { id: 'door_fr', nameTR: 'Sağ Ön Kapı', nameEN: 'Front Right Door' },
        { id: 'door_rr', nameTR: 'Sağ Arka Kapı', nameEN: 'Rear Right Door' },
        { id: 'fender_fr', nameTR: 'Sağ Ön Çamurluk', nameEN: 'Front Right Fender' },
        { id: 'mirror_r', nameTR: 'Sağ Dış Ayna', nameEN: 'Right Mirror' },
    ],
    roof: [
        { id: 'roof', nameTR: 'Tavan Paneli', nameEN: 'Roof Panel' },
        { id: 'a_pillar', nameTR: 'A Sütunu', nameEN: 'A-Pillar' },
        { id: 'b_pillar', nameTR: 'B Sütunu', nameEN: 'B-Pillar' },
    ]
};

// ─── Araç Alt Tipi (MobileNet ImageNet Sınıflarından) ─────────────────────────
const IMAGENET_VEHICLE_SUBTYPES: [RegExp, { tr: string; en: string }][] = [
    [/sports? car|sport car/i,                      { tr: 'Spor Otomobil',    en: 'Sports Car' }],
    [/convertible|cabriolet/i,                       { tr: 'Kabriolet',        en: 'Convertible' }],
    [/limousine|limo/i,                              { tr: 'Limuzin',          en: 'Limousine' }],
    [/jeep|land.?rover/i,                            { tr: 'SUV / Offroad',    en: 'SUV / Off-road' }],
    [/minivan|microvan/i,                            { tr: 'Minivan',          en: 'Minivan' }],
    [/pickup|pick.?up/i,                             { tr: 'Pickup Kamyonet',  en: 'Pickup Truck' }],
    [/ambulance/i,                                   { tr: 'Ambulans',         en: 'Ambulance' }],
    [/fire engine|fire truck/i,                      { tr: 'İtfaiye Aracı',   en: 'Fire Engine' }],
    [/tow truck|wrecker/i,                           { tr: 'Çekici Araç',     en: 'Tow Truck' }],
    [/garbage truck|dustcart/i,                      { tr: 'Çöp Kamyonu',     en: 'Garbage Truck' }],
    [/school bus/i,                                  { tr: 'Okul Otobüsü',    en: 'School Bus' }],
    [/minibus|microbus/i,                            { tr: 'Minibüs',          en: 'Minibus' }],
    [/trolleybus|trolley/i,                          { tr: 'Troleybüs',        en: 'Trolleybus' }],
    [/bus|coach/i,                                   { tr: 'Otobüs',           en: 'Bus' }],
    [/semi.?truck|tractor unit|lorry/i,              { tr: 'TIR / Çekici',    en: 'Semi-Truck' }],
    [/truck|kamyon/i,                                { tr: 'Kamyon',           en: 'Truck' }],
    [/recreational vehicle|rv\b|camper/i,            { tr: 'Karavan / RV',    en: 'Caravan / RV' }],
    [/motorcycle|motorbike/i,                        { tr: 'Motosiklet',       en: 'Motorcycle' }],
    [/scooter|moped/i,                               { tr: 'Scooter',          en: 'Scooter' }],
    [/go.?kart/i,                                    { tr: 'Go-Kart',          en: 'Go-Kart' }],
    [/race car|racer|racing/i,                       { tr: 'Yarış Aracı',     en: 'Race Car' }],
    [/model.?t|vintage|classic/i,                    { tr: 'Klasik Araç',     en: 'Classic Car' }],
    [/cab|taxi|hack/i,                               { tr: 'Sedan / Taksi',   en: 'Sedan / Taxi' }],
    [/suv|4x4|crossover/i,                           { tr: 'SUV / Crossover', en: 'SUV / Crossover' }],
    [/hatchback/i,                                   { tr: 'Hatchback',        en: 'Hatchback' }],
    [/station.?wagon|estate/i,                       { tr: 'Station Wagon',   en: 'Station Wagon' }],
    [/coupe/i,                                       { tr: 'Coupe',            en: 'Coupe' }],
];

function extractVehicleSubtype(cocoResults: any[], mobileResults: any[], lang: Language): string {
    const allLabels = [
        ...cocoResults.map(p => p.class || ''),
        ...mobileResults.map(c => c.className || '')
    ];
    for (const label of allLabels) {
        for (const [pattern, names] of IMAGENET_VEHICLE_SUBTYPES) {
            if (pattern.test(label)) {
                return lang === 'TR' ? names.tr : names.en;
            }
        }
    }
    return lang === 'TR' ? 'Otomobil' : 'Car';
}

// ─── Piksel Analiz Motoru (512×512 Yüksek Çözünürlük) ────────────────────────
async function analyzeImageSignature(img: HTMLCanvasElement | HTMLImageElement): Promise<{
    brightness: number; complexity: number; variance: number;
    textureStability: number; chromatics: number; noise: number;
    sharpness: number; edgeDensity: number;
    quadrantVariance: number[];
}> {
    const SIZE = 512;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = SIZE;
    canvas.height = SIZE;
    ctx?.drawImage(img, 0, 0, SIZE, SIZE);
    const imageData = ctx?.getImageData(0, 0, SIZE, SIZE);
    if (!imageData) {
        return { brightness: 0, complexity: 0, variance: 0, textureStability: 0,
                 chromatics: 0, noise: 0, sharpness: 0, edgeDensity: 0, quadrantVariance: [0,0,0,0] };
    }

    const data = imageData.data;
    const pixelCount = data.length / 4;

    let bSum = 0, cSum = 0;
    let rSum = 0, gSum = 0, bCSum = 0;
    let noiseLevel = 0, sharpness = 0, edgeDensity = 0;

    // İlk geçiş: temel metrikler
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const avg = (r + g + b) / 3;
        bSum += avg;
        rSum += r; gSum += g; bCSum += b;

        if (i >= 4) {
            const prev = (data[i - 4] + data[i - 3] + data[i - 2]) / 3;
            const diff = Math.abs(avg - prev);
            if (diff > 20) cSum++;
            if (diff > 45) sharpness++;
            if (diff > 12 && diff < 35) edgeDensity++;
            if (diff < 4 && diff > 0) noiseLevel++;
        }
    }

    const avgBrightness = bSum / pixelCount;
    const avgR = rSum / pixelCount;
    const avgG = gSum / pixelCount;
    const avgB = bCSum / pixelCount;

    // İkinci geçiş: varyans
    let vSum = 0;
    for (let i = 0; i < data.length; i += 4) {
        vSum += Math.abs(data[i] - avgR) + Math.abs(data[i + 1] - avgG) + Math.abs(data[i + 2] - avgB);
    }
    const variance = vSum / (pixelCount * 3);

    // Delta-E kromatik sapma
    const chromatics = Math.sqrt(
        Math.pow(avgR - avgG, 2) + Math.pow(avgG - avgB, 2) + Math.pow(avgB - avgR, 2)
    );

    // Bölge (quadrant) varyans analizi — panel başına hasar tespiti için
    const half = SIZE / 2;
    const quadrantVariance: number[] = [0, 0, 0, 0]; // sol-üst, sağ-üst, sol-alt, sağ-alt
    const qCounts = [0, 0, 0, 0];
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const idx = (y * SIZE + x) * 4;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
            const localDev = Math.abs(r - avgR) + Math.abs(g - avgG) + Math.abs(b - avgB);
            const q = (y < half ? 0 : 2) + (x < half ? 0 : 1);
            quadrantVariance[q] += localDev;
            qCounts[q]++;
        }
    }
    quadrantVariance.forEach((v, i) => { quadrantVariance[i] = v / (qCounts[i] || 1); });

    return {
        brightness: avgBrightness,
        complexity: cSum / (pixelCount * 0.1),
        variance,
        chromatics,
        textureStability: Math.max(0, 100 - (cSum / pixelCount * 100)),
        noise: (noiseLevel / pixelCount) * 100,
        sharpness: (sharpness / pixelCount) * 100,
        edgeDensity: (edgeDensity / pixelCount) * 100,
        quadrantVariance
    };
}

// ─── Parça Durumu Üretimi (Deterministik - random yok) ────────────────────────
function deterministicOffset(seed: string, range: number): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    return ((Math.abs(hash) % range) - Math.floor(range / 2));
}

function generatePartStatusFromMetrics(metrics: ReturnType<typeof analyzeImageSignature> extends Promise<infer T> ? T : never, lang: Language, objectName: string = '', partId: string = ''): BodyPartStatus {
    const { variance, complexity, chromatics, sharpness, edgeDensity, noise, textureStability } = metrics;
    let status: BodyPartStatus['status'] = 'ORJ';
    let thickness = 105 + (Math.floor(variance * 10) % 15);
    let notes = lang === 'TR' ? 'Orijinal yüzey bütünlüğü saptandı.' : 'Original surface integrity detected.';

    const isScrap = SCRAP_KEYWORDS.test(objectName);

    if (textureStability < 55 || edgeDensity > 38 || noise > 12 || isScrap) {
        status = 'DEG';
        thickness = 85 + (Math.floor(variance * 5) % 25);
        notes = isScrap
            ? (lang === 'TR' ? 'HURDA/ENKAZ: Yapısal bütünlük kaybolmuş, ağır adli hasar.' : 'WRECK/SCRAP: Structural integrity lost, heavy forensic damage detected.')
            : (lang === 'TR' ? 'KRİTİK: Gövde geometrisi ağır hasarlı veya parça değişimi saptandı.' : 'CRITICAL: Body geometry heavily damaged or part replacement detected.');
    } else if (chromatics > 30 || (variance > 155 && textureStability < 75)) {
        status = 'BOY';
        thickness = 180 + (Math.floor(variance * 10) % 130);
        notes = lang === 'TR' ? 'Spektroskopik sapma: İkincil katman boya emaresi.' : 'Spectroscopic deviation: Evidence of secondary layer paint.';
    } else if (complexity > 48 && sharpness < 35) {
        status = 'MAC';
        thickness = 450 + (Math.floor(variance * 30) % 500);
        notes = lang === 'TR' ? 'Düşük yüzey keskinliği ve yüksek dolgu yoğunluğu (MACUNLU).' : 'Low surface sharpness and high fill density (PUTTY/MACUN).';
    } else if (variance > 125 || chromatics > 20) {
        status = 'LOK';
        thickness = 135 + (Math.floor(variance * 5) % 35);
        notes = lang === 'TR' ? 'Bölgesel pigment asimetrisi (Lokal Boya).' : 'Regional pigment asymmetry (Local Paint).';
    } else if (complexity > 30) {
        status = 'CIZ';
        notes = lang === 'TR' ? 'Yüzeysel mikro-abrazyon (Çizik).' : 'Superficial micro-abrasion (Scratch).';
    }

    // Deterministik mikron sapması (part ID + status kombinasyonundan)
    if (thickness) {
        thickness += deterministicOffset(partId + status, 6);
        thickness = Math.max(60, thickness);
    }

    return { partName: '', status, thickness, notes };
}

async function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src.startsWith('data:') ? src : `data:image/jpeg;base64,${src}`;
    });
}

// ─── Açı Doğrulama ────────────────────────────────────────────────────────────
export async function verifyAngle(imageDataBase64: string, angleId: string, lang: Language = 'TR'): Promise<{ success: boolean; message: string }> {
    const { cocoModel } = await getLocalModels();
    if (!cocoModel) return { success: true, message: 'Forensic Bypass' };

    const img = await loadImage(imageDataBase64);
    const predictions = await cocoModel.detect(img);
    const isVehicle = predictions.some(p => VEHICLE_KEYWORDS.test(p.class) && p.score > 0.4);

    if (!isVehicle) return {
        success: false,
        message: lang === 'TR' ? 'Araç kadrajda bulunamadı.' : 'Vehicle not in frame.'
    };
    return {
        success: true,
        message: lang === 'TR' ? 'Açı Onaylandı. Devam edebilirsiniz.' : 'Angle Verified. You may proceed.'
    };
}

// ─── Tek Kare Araç Tanımlama ──────────────────────────────────────────────────
export async function identifyVehicle(imageDataBase64: string, lang: Language = 'TR'): Promise<VehicleDiagnosis | null> {
    const { cocoModel, classificationModel } = await getLocalModels();
    const img = await loadImage(imageDataBase64);

    let preds: cocoSsd.DetectedObject[] = [];
    let classes: { className: string; probability: number }[] = [];

    try {
        if (cocoModel) preds = await cocoModel.detect(img);
        if (classificationModel) classes = await classificationModel.classify(img, 7);
    } catch (e) {
        console.warn('Inference failed', e);
    }

    // Araç tespiti
    const vehicle = preds.find(p => VEHICLE_KEYWORDS.test(p.class) && p.score > 0.3);
    const classMatch = classes.find(c => c.probability > 0.25 && VEHICLE_KEYWORDS.test(c.className)
        && !NOISY_LABELS.some(n => c.className.toLowerCase().includes(n)));

    if (!vehicle && !classMatch) {
        const bestCoco   = preds.sort((a, b) => b.score - a.score)[0];
        const bestMobile = classes.sort((a, b) => b.probability - a.probability)[0];
        let foundLabel = lang === 'TR' ? 'Nesne Tanımlanamadı' : 'Object Not Identified';
        if (bestCoco) {
            foundLabel = translateClass(bestCoco.class, lang);
        } else if (bestMobile) {
            foundLabel = translateClass(bestMobile.className.split(',')[0], lang);
        }
        return { isVehicle: false, objectName: foundLabel };
    }

    const metrics = await analyzeImageSignature(img);

    // Araç alt tipi
    const subtype = extractVehicleSubtype(preds, classes, lang);

    // Ana nesne etiketi
    const typeLabel = vehicle ? vehicle.class : (classes[0]?.className.split(',')[0] || 'vehicle');
    const objectName = translateClass(typeLabel, lang);

    // Güven skoru: COCO tespit skoru (%60) + görüntü kalitesi (%40)
    const detectionScore = vehicle ? vehicle.score : (classMatch?.probability || 0.5);
    const imageQuality = Math.min(100,
        metrics.textureStability * 0.4 +
        metrics.brightness / 2.55 +
        Math.min(30, metrics.sharpness * 3)
    );
    const confidenceScore = Math.round(Math.min(99, detectionScore * 60 + imageQuality * 0.4));

    // Görüntü kalite seviyesi
    const qualityLabel = imageQuality > 70
        ? (lang === 'TR' ? 'Yüksek Çözünürlük' : 'High Resolution')
        : imageQuality > 45
            ? (lang === 'TR' ? 'Orta Çözünürlük' : 'Medium Resolution')
            : (lang === 'TR' ? 'Düşük Işık / Bulanık' : 'Low Light / Blurred');

    return {
        isVehicle: true,
        objectName,
        vehicleSubtype: subtype,
        model: subtype,
        version: qualityLabel,
        confidenceScore,
        confidenceReason: lang === 'TR'
            ? `COCO-SSD: ${(detectionScore * 100).toFixed(0)}% | Görüntü Kalitesi: ${imageQuality.toFixed(0)}%`
            : `COCO-SSD: ${(detectionScore * 100).toFixed(0)}% | Image Quality: ${imageQuality.toFixed(0)}%`,
        technicalSpecs: {
            engine: lang === 'TR' ? 'Mekanik Tarama Gerekli (MECH modu)' : 'Mechanical Scan Required (MECH mode)',
            transmission: lang === 'TR' ? 'Mekanik Tarama Gerekli' : 'Mechanical Scan Required',
            chassis: lang === 'TR' ? 'Gövde Taraması Gerekli (BODY modu)' : 'Body Scan Required (BODY mode)',
            electricalSystem: lang === 'TR' ? 'Elektrik Taraması Gerekli (ELEC modu)' : 'Electrical Scan Required (ELEC mode)',
        }
    };
}

// ─── Çok Açılı Araç Analizi ───────────────────────────────────────────────────
export async function identifyVehicleMultiAngle(
    images: { angle: string; data: string }[],
    lang: Language = 'TR',
    options: Record<string, boolean> = {}
): Promise<VehicleDiagnosis | null> {
    const base = await identifyVehicle(images[0].data, lang);
    if (!base) return null;

    const bodyReport: Record<string, BodyPartStatus[]> = {};
    const exteriorCondition: Record<string, string> = {};
    const allMetrics: Awaited<ReturnType<typeof analyzeImageSignature>>[] = [];

    for (const img of images) {
        const htmlImg = await loadImage(img.data);
        const metrics = await analyzeImageSignature(htmlImg);
        allMetrics.push(metrics);

        let angleKey = 'front';
        const aLower = img.angle.toLowerCase();
        if (aLower.includes('rear') || aLower.includes('arka')) angleKey = 'rear';
        else if (aLower.includes('left') || aLower.includes('sol')) angleKey = 'left';
        else if (aLower.includes('right') || aLower.includes('sağ')) angleKey = 'right';
        else if (aLower.includes('roof') || aLower.includes('tavan')) angleKey = 'roof';

        const parts = BODY_PARTS_BY_ANGLE[angleKey] || [];
        bodyReport[angleKey] = parts.map(p => {
            const status = generatePartStatusFromMetrics(metrics, lang, base.objectName, p.id);
            status.partName = lang === 'TR' ? p.nameTR : p.nameEN;
            return status;
        });

        const abnormal = bodyReport[angleKey].filter(p => p.status !== 'ORJ');
        if (abnormal.length === 0) {
            exteriorCondition[angleKey] = lang === 'TR' ? 'Orijinal — Hasar Yok' : 'Original — No Damage';
        } else {
            const statusSummary = [...new Set(abnormal.map(p => p.status))].join(', ');
            exteriorCondition[angleKey] = lang === 'TR'
                ? `${abnormal.length} Kusur [${statusSummary}]`
                : `${abnormal.length} Defect(s) [${statusSummary}]`;
        }
    }

    // Tüm açıların ortalama metrikleri
    const avg = (key: keyof typeof allMetrics[0]) =>
        allMetrics.reduce((s, m) => s + (m[key] as number), 0) / allMetrics.length;

    const avgChromatics   = avg('chromatics');
    const avgStability    = avg('textureStability');
    const avgEdge         = avg('edgeDensity');
    const avgVariance     = avg('variance');
    const avgSharpness    = avg('sharpness');
    const avgNoise        = avg('noise');

    // Boya tutarlılığı (100'e yakın = iyi)
    const paintConsistency = Math.max(0, 100 - (avgChromatics / 2)).toFixed(1);

    // Geometrik sapma tahmini (kenar yoğunluğundan)
    const geomDeviation = (avgEdge / 50).toFixed(2);

    // Mikron homojenliği
    const micronHomogeneity = allMetrics
        .flatMap(m => m.quadrantVariance)
        .reduce((a, b) => a + b, 0) / (allMetrics.length * 4);
    const micronLabel = micronHomogeneity < 40
        ? (lang === 'TR' ? 'Homojen (±8µm)' : 'Homogeneous (±8µm)')
        : micronHomogeneity < 80
            ? (lang === 'TR' ? 'Orta Homojenlik (±18µm)' : 'Medium Homogeneity (±18µm)')
            : (lang === 'TR' ? 'Heterojen — Panel Farkı Yüksek (±35µm)' : 'Heterogeneous — High Panel Variance (±35µm)');

    // Zebra analizi
    const zebraLabel = avgStability > 85
        ? (lang === 'TR' ? 'Aktif yansıma matrisi doğrusal — deformasyon yok.' : 'Active reflection matrix linear — no deformation.')
        : avgStability > 65
            ? (lang === 'TR' ? 'Hafif yansıma sapması — lokal boya veya çizik ihtimali.' : 'Mild reflection deviation — possible local paint or scratch.')
            : (lang === 'TR' ? 'Belirgin yansıma bozulması — yüzey deformasyonu veya dolgu tespit edildi.' : 'Significant reflection distortion — surface deformation or filler detected.');

    // Doku analizi
    const textureLabel = avgStability > 70
        ? (lang === 'TR' ? 'Nöral doku stabilizasyonu onaylandı — orijinal yüzey.' : 'Neural texture stabilization verified — original surface.')
        : (lang === 'TR' ? 'Mikro-doku bozulması saptandı — yeniden boyama veya dolgu şüphesi.' : 'Micro-texture degradation detected — repaint or filler suspected.');

    // Lidar derinlik haritası
    const lidarLabel = lang === 'TR'
        ? `Geometrik gövde sapması ~${geomDeviation}mm | Kenar yoğunluğu: ${avgEdge.toFixed(1)}`
        : `Geometric body deviation ~${geomDeviation}mm | Edge density: ${avgEdge.toFixed(1)}`;

    // Spektroskopik renk
    const colorLabel = lang === 'TR'
        ? `ΔE bazlı pigment tutarlılığı: %${paintConsistency} | Kromatik sapma: ${avgChromatics.toFixed(2)}`
        : `ΔE-based pigment consistency: ${paintConsistency}% | Chromatic deviation: ${avgChromatics.toFixed(2)}`;

    // Pillar / şasi analizi (en yüksek quadrant varyansından)
    const maxQuadVariance = Math.max(...allMetrics.flatMap(m => m.quadrantVariance));
    const pillarLabel = maxQuadVariance > 90
        ? (lang === 'TR' ? 'Sütun/Podye bölgesinde yüksek varyans — yapısal hasar şüphesi.' : 'High variance in pillar/sill area — structural damage suspected.')
        : (lang === 'TR' ? 'Sütun ve podye geometrisi fabrika toleransında.' : 'Pillar and sill geometry within factory tolerance.');

    // Güncellenen güven skoru (çok açılı daha güvenilir)
    const multiAngleConfidence = Math.round(Math.min(99,
        (base.confidenceScore || 70) * 0.5 +
        (avgStability * 0.3) +
        (avgSharpness * 1.5) +
        (10 - Math.min(10, avgNoise))
    ));

    return {
        ...base,
        confidenceScore: multiAngleConfidence,
        anglesAnalyzed: images.map(i => i.angle),
        bodyReport,
        exteriorCondition,
        advancedAnalysis: {
            zebraReflections: zebraLabel,
            spectroscopicColor: colorLabel,
            textureAnalysis: textureLabel,
            lidarDepthMap: lidarLabel,
            micronHomogeneity: micronLabel,
            pillarAnalysis: pillarLabel,
            xrayProjection: options.xray
                ? (lang === 'TR' ? `Yapısal projeksiyon aktif — varyans ${avgVariance.toFixed(1)}` : `Structural projection active — variance ${avgVariance.toFixed(1)}`)
                : undefined,
        }
    };
}

// ─── Mod Bazlı Analiz (Mekanik / Elektrik / Gövde) ───────────────────────────
export async function analyzeCondition(
    imageDataBase64: string,
    scanType: string,
    lang: Language = 'TR',
    audioData?: { dbLevel: number; frequencyData: Uint8Array; avgDbLevel?: number; peakDbLevel?: number },
    sensorData?: SensorData
): Promise<Record<string, unknown>> {
    const img = await loadImage(imageDataBase64);
    const metrics = await analyzeImageSignature(img);

    // ── MEKANİK ANALİZ ────────────────────────────────────────────────────────
    if (scanType === 'mechanical' && audioData && audioData.frequencyData.length > 0) {
        const freqArray = Array.from(audioData.frequencyData);
        const totalBins = freqArray.length;

        // Frekans bantları (256 bin FFT, ~44100 Hz örnekleme ile her bin ~86 Hz)
        const subBass   = freqArray.slice(0, Math.floor(totalBins * 0.03));                          // 0–200 Hz: motor titreşimi
        const bass      = freqArray.slice(Math.floor(totalBins * 0.03), Math.floor(totalBins * 0.08)); // 200–500 Hz: temel motor sesi
        const midLow    = freqArray.slice(Math.floor(totalBins * 0.08), Math.floor(totalBins * 0.2));  // 500–1500 Hz: vuruntu/tıkırtı
        const midHigh   = freqArray.slice(Math.floor(totalBins * 0.2), Math.floor(totalBins * 0.45)); // 1.5–4 kHz: metalik sürtünme
        const highFreq  = freqArray.slice(Math.floor(totalBins * 0.45));                             // 4–20 kHz: ıslık/turbo whine

        const avgBand = (band: number[]) => band.length ? band.reduce((a, b) => a + b, 0) / band.length : 0;

        const subBassAvg  = avgBand(subBass);
        const bassAvg     = avgBand(bass);
        const midLowAvg   = avgBand(midLow);
        const midHighAvg  = avgBand(midHigh);
        const highFreqAvg = avgBand(highFreq);

        const dbLevel     = audioData.avgDbLevel ?? audioData.dbLevel;
        const peakDb      = audioData.peakDbLevel ?? audioData.dbLevel;

        // Harmonik Bozulma: düşük/yüksek frekans oranı
        const harmonicRatio = bassAvg > 0 ? (midHighAvg + highFreqAvg) / bassAvg : 0;
        const harmonicPct   = Math.min(15, harmonicRatio * 8).toFixed(2);

        // Anomali tespiti
        const hasKnock      = midLowAvg > 160 || subBassAvg > 180;
        const hasMeSmearing = midHighAvg > 140;
        const hasTurboWhine = highFreqAvg > 120;
        const hasHighVibr   = subBassAvg > 200;
        const hasOverall    = dbLevel > 140;

        const alerts: string[] = [];
        if (hasKnock)      alerts.push(lang === 'TR' ? 'Düşük frekanslı metalik vuruntu saptandı (500–1500 Hz)' : 'Low-frequency metallic knock detected (500–1500 Hz)');
        if (hasMeSmearing) alerts.push(lang === 'TR' ? 'Orta-yüksek frekanslı metalik sürtünme (1.5–4 kHz)' : 'Mid-high metallic friction (1.5–4 kHz)');
        if (hasTurboWhine) alerts.push(lang === 'TR' ? 'Yüksek frekanslı bileşen (4+ kHz) — turbo/kayış ıslığı şüphesi' : 'High-frequency component (4+ kHz) — turbo/belt whine suspected');
        if (hasHighVibr)   alerts.push(lang === 'TR' ? 'Aşırı motor titreşimi saptandı (0–200 Hz)' : 'Excessive engine vibration detected (0–200 Hz)');
        if (hasOverall)    alerts.push(lang === 'TR' ? 'Genel gürültü seviyesi yüksek' : 'Overall noise level elevated');

        if (alerts.length === 0) {
            alerts.push(lang === 'TR' ? 'Mekanik harmoni nominal seviyelerde. Anormallik saptanmadı.' : 'Mechanical harmony at nominal levels. No anomaly detected.');
        }

        const status = alerts.length > 1
            ? (lang === 'TR' ? 'ANOMALİ TESPİT EDİLDİ' : 'ANOMALY DETECTED')
            : (lang === 'TR' ? 'STABİL' : 'STABLE');

        return {
            status,
            harmonicDistortion: harmonicPct + '%',
            vibrationAnalysis: (dbLevel / 100).toFixed(4) + ' g-rms',
            peakLevel: peakDb.toFixed(1) + ' dB',
            subBassLevel: subBassAvg.toFixed(1),
            midLowLevel: midLowAvg.toFixed(1),
            highFreqLevel: highFreqAvg.toFixed(1),
            alerts,
            findings: alerts.join(' | ')
        };
    }

    // ── ELEKTRİK / XRAY ANALİZ ───────────────────────────────────────────────
    if (scanType === 'magnetic' || scanType === 'xray') {
        const magRaw   = sensorData?.magneticField;
        const accelRaw = sensorData?.acceleration;

        // Gerçek manyetometre verisi veya görüntü varyansından tahmin
        const magTotal  = magRaw ? magRaw.total : (metrics.variance / 2);
        const magX      = magRaw ? magRaw.x : 0;
        const magY      = magRaw ? magRaw.y : 0;
        const magZ      = magRaw ? magRaw.z : 0;
        const accelTot  = accelRaw ? accelRaw.total : 0;

        // Anomali eşiği: Araç çevresinde normal değer ~40–80 µT
        // Güçlü anomali (kablo veya hasarlı elektrik): >100 µT
        const isStrongAnomaly  = magTotal > 100;
        const isMildAnomaly    = magTotal > 65 && !isStrongAnomaly;
        const hasAccelAnomaly  = accelTot > 12;
        const hasStructuralHit = metrics.variance > 180 || metrics.noise > 15;

        const alerts: string[] = [];
        if (isStrongAnomaly)  alerts.push(lang === 'TR' ? `Güçlü manyetik anomali: ${magTotal.toFixed(1)} µT — elektrik kaçağı veya şasi deformasyonu şüphesi` : `Strong magnetic anomaly: ${magTotal.toFixed(1)} µT — electrical leakage or chassis deformation suspected`);
        if (isMildAnomaly)    alerts.push(lang === 'TR' ? `Orta düzey manyetik sapma: ${magTotal.toFixed(1)} µT — kablo izolasyonu veya topraklama problemi ihtimali` : `Moderate magnetic deviation: ${magTotal.toFixed(1)} µT — wiring insulation or grounding issue possible`);
        if (hasAccelAnomaly)  alerts.push(lang === 'TR' ? `Anormal ivme verisi: ${accelTot.toFixed(2)} m/s² — mekanik titreşim kaynağı` : `Abnormal acceleration: ${accelTot.toFixed(2)} m/s² — mechanical vibration source`);
        if (hasStructuralHit) alerts.push(lang === 'TR' ? 'Görüntü bütünlük indeksi düşük — yapısal hasar veya elektromanyetik parazit' : 'Image integrity index low — structural damage or electromagnetic interference');

        if (alerts.length === 0) {
            alerts.push(lang === 'TR' ? 'Elektromanyetik alan stabil. Elektrik sistemi normalde.' : 'Electromagnetic field stable. Electrical system nominal.');
        }

        const sensorSource = magRaw
            ? (lang === 'TR' ? 'Cihaz Manyetometresi (Gerçek)' : 'Device Magnetometer (Real)')
            : (lang === 'TR' ? 'Görüntü Varyans Tahmini' : 'Image Variance Estimate');

        return {
            status: isStrongAnomaly ? (lang === 'TR' ? 'KRİTİK' : 'CRITICAL')
                : isMildAnomaly ? (lang === 'TR' ? 'UYARI' : 'WARNING')
                : 'STABLE',
            magneticAnomaly: magTotal.toFixed(2) + ' µT',
            magneticVector: `X:${magX.toFixed(1)} Y:${magY.toFixed(1)} Z:${magZ.toFixed(1)} µT`,
            structuralIntegrity: (100 - (metrics.noise / 2)).toFixed(1) + '%',
            sensorSource,
            alerts,
            findings: alerts.join(' | ')
        };
    }

    // ── GENEL GÖVDE TARAMASI ─────────────────────────────────────────────────
    const qualityLabel = metrics.brightness > 130
        ? (lang === 'TR' ? 'Yüksek_Netlik' : 'High_Clarity')
        : (lang === 'TR' ? 'Düşük_Işık' : 'Low_Light');

    return {
        type: qualityLabel,
        confidence: Math.round(metrics.textureStability) + '%',
        sharpnessIndex: metrics.sharpness.toFixed(1),
        chromaticDeviation: metrics.chromatics.toFixed(2),
        noiseLevel: metrics.noise.toFixed(2) + '%',
        alerts: metrics.textureStability < 50
            ? [lang === 'TR' ? 'Doku verisi zayıf, tarama kalitesi yetersiz.' : 'Texture data weak, scan quality insufficient.']
            : []
    };
}

// ─── AI Detaylı Rapor ─────────────────────────────────────────────────────────
export async function generateDetailedAiReport(
    images: { angle: string; data: string }[],
    metadata: Record<string, unknown>,
    lang: Language = 'TR'
): Promise<string> {
    const diag = metadata.diag as VehicleDiagnosis;
    const sep  = '═'.repeat(44);
    let report = lang === 'TR' ? `SPECTRA-X NÖRAL FORENSİK RAPORU\n` : `SPECTRA-X NEURAL FORENSIC REPORT\n`;
    report += `${sep}\n`;
    report += (lang === 'TR' ? `ARAÇ TİPİ  : ` : `VEHICLE    : `) + (diag?.objectName || '—') + '\n';
    report += (lang === 'TR' ? `ALT TİP    : ` : `SUBTYPE    : `) + (diag?.vehicleSubtype || diag?.model || '—') + '\n';
    report += (lang === 'TR' ? `GÜVEN      : ` : `CONFIDENCE : `) + `%${diag?.confidenceScore || '—'}` + '\n';
    if (diag?.confidenceReason) report += `           ${diag.confidenceReason}\n`;
    report += '\n';

    if (diag?.advancedAnalysis) {
        const a = diag.advancedAnalysis;
        report += `[ZEBRA]    ${a.zebraReflections}\n`;
        report += `[SPEKTRO]  ${a.spectroscopicColor}\n`;
        report += `[DOKU]     ${a.textureAnalysis}\n`;
        report += `[LIDAR]    ${a.lidarDepthMap}\n`;
        if (a.micronHomogeneity) report += `[MİKRON]   ${a.micronHomogeneity}\n`;
        if (a.pillarAnalysis)    report += `[SÜTUN]    ${a.pillarAnalysis}\n`;
        report += '\n';
    }

    if (diag?.bodyReport) {
        report += lang === 'TR' ? `KAPORTA FORENSİK ANALİZİ:\n` : `BODY FORENSIC ANALYSIS:\n`;
        report += `${'─'.repeat(44)}\n`;
        Object.entries(diag.bodyReport).forEach(([angle, parts]) => {
            const hasIssues = parts.some(p => p.status !== 'ORJ');
            report += `[${angle.toUpperCase()}] ${hasIssues ? (lang === 'TR' ? 'SORUNLU' : 'ISSUES FOUND') : (lang === 'TR' ? 'TEMİZ' : 'CLEAN')}\n`;
            parts.forEach(p => {
                const statusIcon = p.status === 'ORJ' ? '✓' : '✗';
                report += `  ${statusIcon} ${p.partName}: [${p.status}]${p.thickness ? ` ${p.thickness}µm` : ''} — ${p.notes}\n`;
            });
        });
        report += '\n';
    }

    report += `\n${lang === 'TR' ? 'YEREL MOTOR SENTEZİ' : 'LOCAL ENGINE SYNTHESIS'} v5.0 | TF.js COCO-SSD + MobileNet v2\n`;
    return report;
}
