import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';
import { AlertTriangle, RefreshCcw, Maximize2, ShieldCheck, Zap, Activity } from 'lucide-react';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import { motion, AnimatePresence } from 'motion/react';
import { Language, GLOBAL_TRANSLATIONS, UI_TRANSLATIONS } from '../lib/translations';
import { preLoadModels, forensicEngine, VEHICLE_KEYWORDS } from '../lib/gemini';

export interface CameraViewRef {
  captureFrame: () => string | null;
  getAnalysisData: () => any;
}

interface CameraViewProps {
  children?: React.ReactNode;
  isNotVehicle?: boolean;
  isScanning?: boolean;
  detectedObjectName?: string;
  onCameraError?: (error: string) => void;
  zebraMode?: boolean;
  ghostStencil?: 'sedan' | 'suv' | 'truck' | null;
  textureFilter?: boolean;
  colorAnalysisMode?: boolean;
  lidarMode?: boolean;
  xrayMode?: boolean;
  onVehicleDetected?: (detected: boolean) => void;
  language?: 'TR' | 'EN' | 'DE';
  isMuted?: boolean;
  isEngineReady?: boolean;
}

const CameraView = forwardRef<CameraViewRef, CameraViewProps>((props, ref) => {
  const { isEngineReady = true } = props;
  const t = UI_TRANSLATIONS[props.language || 'TR'];
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [isTooClose, setIsTooClose] = useState(false);
  
  // Voice Assistant for Macro Warning
  useEffect(() => {
    if (isTooClose && !props.isMuted) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const msg = t['scan.close'];
        const utterance = new SpeechSynthesisUtterance(msg);
        const langCodes = {
            'TR': 'tr-TR',
            'EN': 'en-US',
            'DE': 'de-DE'
        };
        utterance.lang = langCodes[props.language || 'TR'];
        utterance.rate = 1.1;
        window.speechSynthesis.speak(utterance);
      }
    }
  }, [isTooClose, props.language, props.isMuted]);

  const [detections, setDetections] = useState<{class: string, score: number}[]>([]);
  const [orientation, setOrientation] = useState({ alpha: 0, beta: 0, gamma: 0 });
  
  // Real-time analysis metrics
  const [metrics, setMetrics] = useState({
    fps: 0,
    vehicleConfidence: 0,
    lightLevel: 0,
    colorDelta: 0,
    edgeComplexity: 0
  });

  const [sampledColors, setSampledColors] = useState<{a: string, b: string}>({ a: '#000', b: '#000' });

  useEffect(() => {
    async function loadModel() {
      try {
        await preLoadModels();
        // Centralized preLoadModels in lib/gemini.ts already sets global models
        // But we need to trigger a re-render or check them here if needed.
        // For efficiency, we'll use the identification logic directly.
      } catch (e) {
        console.warn("Vision Engine: Load suppressed.", e);
      }
    }
    loadModel();

    const handleOrientation = (e: DeviceOrientationEvent) => {
      setOrientation({
        alpha: e.alpha || 0,
        beta: e.beta || 0,
        gamma: e.gamma || 0
      });
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  useEffect(() => {
    async function startCamera() {
      try {
        setError(null);
        if (!window.isSecureContext) throw new Error("InsecureContext: Camera requires HTTPS or localhost.");
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("TargetNotSupported: Your browser does not support camera access.");

        const constraints: MediaStreamConstraints = { 
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false 
        };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
          console.warn("First attempt with 'environment' failed, retrying with default video...", err);
          // Retry with absolute basics if specific constraints failed
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        
        // AE LOCK Attempt
        const advancedConstraints: any = {};
        if (capabilities.whiteBalanceMode?.includes('locked')) advancedConstraints.whiteBalanceMode = 'locked';
        if (capabilities.exposureMode?.includes('locked')) advancedConstraints.exposureMode = 'locked';
        if (capabilities.focusMode?.includes('continuous')) advancedConstraints.focusMode = 'continuous';
        
        if (Object.keys(advancedConstraints).length > 0) {
          try {
            await track.applyConstraints({ advanced: [advancedConstraints] } as any);
          } catch (e) { console.warn("AE Lock constraints failed", e); }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera access failed:", err);
        setError(String(err));
        if (props.onCameraError) props.onCameraError(String(err));
      }
    }
    startCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [retryKey]);

  // Analysis Loop (Throttled for Performance)
  useEffect(() => {
    let animationId: number;
    let lastTime = performance.now();
    let lastAiTime = 0;
    let frames = 0;
    
    const analysisCanvas = document.createElement('canvas');
    analysisCanvas.width = 320;
    analysisCanvas.height = 320;
    const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });

    const analyze = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animationId = requestAnimationFrame(analyze);
        return;
      }

      const now = performance.now();
      frames++;
      if (now - lastTime >= 1000) {
        setMetrics(m => ({ ...m, fps: frames }));
        frames = 0;
        lastTime = now;
      }

      // 1. AI Inference (Throttled for Performance)
      if (isEngineReady && now - lastAiTime > 400) {
        lastAiTime = now;
        try {
          if (analysisCtx && forensicEngine.cocoModel) {
            analysisCtx.drawImage(videoRef.current, 0, 0, 320, 320);
            
            // Multi-Model Detection
            const predictions = await forensicEngine.cocoModel.detect(analysisCanvas);
            const currentDetections = predictions
              .filter(p => p.score > 0.25) // Lowered threshold for better live feedback
              .map(p => ({ class: p.class, score: p.score }));

            if (forensicEngine.classificationModel) {
              const classifications = await forensicEngine.classificationModel.classify(analysisCanvas, 5);
              classifications.forEach(c => {
                if (c.probability > 0.2) { // Lowered threshold
                  const mainLabel = c.className.split(',')[0].toLowerCase();
                  if (!currentDetections.some(d => d.class.includes(mainLabel))) {
                    currentDetections.push({ class: mainLabel, score: c.probability });
                  }
                }
              });
            }

            setDetections(currentDetections.sort((a, b) => b.score - a.score).slice(0, 8));

            const vehicle = currentDetections.find(p => VEHICLE_KEYWORDS.test(p.class));
            
            if (vehicle && vehicle.score > 0.3) {
              if (props.onVehicleDetected) props.onVehicleDetected(true);
              setMetrics(m => ({ ...m, vehicleConfidence: vehicle.score * 100 }));
            } else {
              if (props.onVehicleDetected) props.onVehicleDetected(false);
              setMetrics(m => ({ ...m, vehicleConfidence: 0 }));
            }
          }
        } catch (e) {
          console.error("Inference skip:", e);
        }
      }

      // 2. Fast Analysis (Every Frame) - Color & Light
      if (analysisCtx) {
        analysisCtx.drawImage(videoRef.current, 0, 0, 100, 100);
        const data = analysisCtx.getImageData(0, 0, 100, 100).data;
        let totalBrightness = 0;
        for (let i = 0; i < 40000; i += 16) {
          totalBrightness += (data[i] + data[i+1] + data[i+2]) / 3;
        }
        const avgBrightness = totalBrightness / (10000 / 4);
        setMetrics(m => ({ ...m, lightLevel: (avgBrightness / 255) * 100 }));
        setIsTooClose(avgBrightness > 245 || avgBrightness < 10);

        if (props.colorAnalysisMode) {
          const p1 = (30 * 100 + 50) * 4;
          const p2 = (70 * 100 + 50) * 4;
          const c1 = { r: data[p1], g: data[p1+1], b: data[p1+2] };
          const c2 = { r: data[p2], g: data[p2+1], b: data[p2+2] };
          const delta = Math.sqrt(Math.pow(c1.r - c2.r, 2) + Math.pow(c1.g - c2.g, 2) + Math.pow(c1.b - c2.b, 2));
          setMetrics(m => ({ ...m, colorDelta: (delta / 441) * 100 }));
          setSampledColors({ a: `rgb(${c1.r}, ${c1.g}, ${c1.b})`, b: `rgb(${c2.r}, ${c2.g}, ${c2.b})` });
        }
      }

      animationId = requestAnimationFrame(analyze);
    };

    analyze();
    return () => cancelAnimationFrame(animationId);
  }, [isEngineReady, props.colorAnalysisMode, props.onVehicleDetected, props.language]);

  useImperativeHandle(ref, () => ({
    captureFrame: () => {
      if (!videoRef.current || !canvasRef.current) return null;
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    },
    getAnalysisData: () => ({
      metrics,
      orientation,
      timestamp: new Date().toISOString()
    })
  }));

  const getTranslatedLabel = (label: string) => {
    const lang = props.language || 'TR';
    const dict = GLOBAL_TRANSLATIONS[lang];
    const lower = label.toLowerCase();
    
    if (dict[lower]) return dict[lower];
    
    // Fallback for compound labels
    for (const [key, val] of Object.entries(dict)) {
        if (lower.includes(key)) return val;
    }
    
    return label.toUpperCase();
  };

  return (
    <div className={`fixed inset-0 bg-black overflow-hidden transition-colors duration-500 ${props.isNotVehicle ? 'ring-[24px] ring-red-600/50 ring-inset' : ''}`}>
      <video 
        ref={videoRef}
        autoPlay playsInline muted 
        className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ${props.isNotVehicle ? 'grayscale opacity-40 scale-110 blur-sm' : 'opacity-60 grayscale-[0.05]'}`}
      />
      <canvas ref={canvasRef} className="hidden" />
      
      {/* 30 FPS Info Overlay */}
      <div className="absolute top-4 left-4 z-40 bg-black/80 backdrop-blur-xl border border-white/10 px-3 py-1.5 rounded-xl flex gap-4 items-center">
        <div className="flex flex-col">
          <span className="text-[7px] text-white/40 font-mono tracking-widest">{t['mode.engine']}</span>
          <span className={`text-[11px] font-black font-mono ${metrics.fps > 25 ? 'text-green-400' : 'text-amber-400'}`}>{metrics.fps} FPS</span>
        </div>
        <div className="w-px h-6 bg-white/10" />
        <div className="flex flex-col">
          <span className="text-[7px] text-white/40 font-mono tracking-widest">{t['scan.analyzing']}</span>
          <span className="text-[11px] font-black font-mono text-cyan-400">{metrics.lightLevel.toFixed(1)}%</span>
        </div>
        {detections.length > 0 && (
          <>
            <div className="w-px h-6 bg-white/10" />
            <div className="flex flex-col max-w-[120px] overflow-hidden">
              <span className="text-[7px] text-white/40 font-mono tracking-widest">{t['scan.detected']}</span>
              <div className="flex gap-2 items-center">
                <span className="text-[10px] font-black font-mono text-purple-400 truncate uppercase">
                    {getTranslatedLabel(detections[0].class)}
                </span>
                <span className="text-[8px] font-mono text-purple-400/50">{Math.round(detections[0].score * 100)}%</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Real-time Object Tracking labels */}
      <div className="absolute inset-0 pointer-events-none z-30">
        <AnimatePresence>
            {detections.slice(1).map((det, i) => (
                <motion.div
                    key={`${det.class}-${i}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="absolute left-4 bg-white/5 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-lg text-[9px] font-mono text-white/60 flex items-center gap-2"
                    style={{ top: `${100 + (i * 35)}px` }}
                >
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                    <span className="uppercase tracking-widest">{getTranslatedLabel(det.class)}</span>
                    <span className="opacity-40">{Math.round(det.score * 100)}%</span>
                </motion.div>
            ))}
        </AnimatePresence>
      </div>

      {error && (
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center p-8 text-center z-50">
          <AlertTriangle size={48} className="text-red-500 mb-4 animate-pulse" />
          <h2 className="text-white font-black text-xl mb-2 uppercase italic">SENSOR ERROR</h2>
          <p className="text-red-200 text-xs font-mono max-w-xs mb-6 opacity-80">
            {error.includes("NotAllowedError") || error.includes("Permission denied") 
              ? (props.language === 'TR' ? 'Kameraya erişim reddedildi. Lütfen tarayıcı ayarlarından izin verin.' : 
                 (props.language === 'DE' ? 'Kamerazugriff verweigert. Bitte in den Browsereinstellungen erlauben.' : 'Camera access denied. Please allow in browser settings.'))
              : error}
          </p>
          <div className="flex gap-4">
             <button onClick={() => window.location.reload()} className="bg-red-600/20 border border-red-600 text-white px-6 py-3 rounded-full font-bold uppercase text-[10px] tracking-widest">RELOAD</button>
             <button onClick={() => {
               setError(null);
               // This will trigger the effect again because we're clearing the error,
               // but we need a way to re-run the effect.
               // We'll add a retry key.
               setRetryKey(k => k + 1);
             }} className="bg-red-600 text-white px-8 py-3 rounded-full font-bold uppercase text-[10px] tracking-widest shadow-xl">RETRY NOW</button>
          </div>
        </div>
      )}

      {/* X-Ray Projection Simulation */}
      {props.xrayMode && (
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
          <div className="w-full h-full bg-cyan-900/10 backdrop-invert backdrop-contrast-150 mix-blend-screen opacity-60" />
          <motion.div 
            animate={{ y: ['-100%', '100%'] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute inset-x-0 h-1 bg-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.8)]"
          />
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-green-500/20 border border-green-500/40 px-4 py-2 rounded-full backdrop-blur-md">
             <span className="text-[10px] font-black font-mono text-green-400 uppercase tracking-[0.3em] animate-pulse">X-RAY_PROJECTION_ACTIVE</span>
          </div>
          
          {/* Internal structure simulation dots */}
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.4, 0] }}
              transition={{ duration: 2, repeat: Infinity, delay: Math.random() * 2 }}
              className="absolute w-1 h-1 bg-green-400 rounded-full"
              style={{ 
                left: `${Math.random() * 100}%`, 
                top: `${Math.random() * 100}%` 
              }}
            />
          ))}
        </div>
      )}

      {/* Depth Map / LiDAR Simulation */}
      {props.lidarMode && (
        <div className="absolute inset-0 pointer-events-none z-20">
          <div className="w-full h-full opacity-40 mix-blend-screen overflow-hidden">
            <svg width="100%" height="100%" className="absolute inset-0">
               <defs>
                 <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                   <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(6,182,212,0.3)" strokeWidth="0.5"/>
                 </pattern>
               </defs>
               <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
            <div 
              className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1)_0%,transparent_70%)] animate-pulse" 
              style={{ transform: `scale(${1 + Math.abs(orientation.beta) / 100})` }}
            />
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0.1, scale: 0.8 }}
                animate={{ 
                  opacity: [0.1, 0.3, 0.1],
                  scale: [0.8, 1.2, 0.8],
                  x: [0, 20 * (i-2), 0],
                  y: [0, 20 * (i-2), 0]
                }}
                transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }}
                className="absolute inset-0 border border-cyan-500/10 rounded-full"
              />
            ))}
            <div className="absolute top-1/2 left-4 right-4 h-px bg-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.5)] animate-scan" style={{ animationDuration: '4s' }} />
          </div>
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-cyan-500/20 border border-cyan-500/40 px-4 py-2 rounded-full backdrop-blur-md">
             <span className="text-[10px] font-black font-mono text-cyan-400 uppercase tracking-[0.3em] animate-pulse">LIDAR_SCANNING_ACTIVE</span>
          </div>
        </div>
      )}

      {/* Dynamic Zebra Filter - Reacts to Gravity */}
      {props.zebraMode && (
        <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-80">
            <div 
                className="w-full h-full"
                style={{
                    background: `repeating-linear-gradient(${45 + orientation.gamma}deg, #000, #000 15px, #fff 15px, #fff 30px)`,
                    animation: 'flow 1.5s linear infinite',
                    transform: `scale(1.5) rotate(${orientation.beta / 20}deg)`
                }}
            />
        </div>
      )}

      {/* Optical Edge Detection (Canny-style Convolution) */}
      {props.textureFilter && (
        <div className="absolute inset-0 pointer-events-none backdrop-contrast-[1.2] backdrop-brightness-[1.1]">
            <svg style={{ visibility: 'hidden', position: 'absolute' }}>
                <filter id="edge-vision">
                    <feConvolveMatrix 
                      order="3" 
                      kernelMatrix="-1 -1 -1 -1 9 -1 -1 -1 -1" 
                    />
                    <feColorMatrix type="saturate" values="4" />
                </filter>
            </svg>
            <div className="w-full h-full opacity-60 mix-blend-multiply" style={{ filter: 'url(#edge-vision)' }} />
        </div>
      )}

      {/* Gyroscope 3D Balance Guide */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-50">
          <div className="relative w-56 h-56 flex items-center justify-center">
              {/* Center Cross */}
              <div className="absolute w-4 h-4 text-white/40">
                <div className="absolute top-1/2 left-0 w-full h-px bg-current" />
                <div className="absolute left-1/2 top-0 w-px h-full bg-current" />
              </div>

              {/* Vertical Guide */}
              <div 
                className={`absolute w-0.5 bg-white/20 transition-all duration-300 ${Math.abs(orientation.gamma) < 3 ? 'h-full bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'h-24'}`} 
                style={{ transform: `rotate(${orientation.gamma}deg)` }}
              />
              
              {/* Horizontal Guide - Target 90deg orientation */}
              <div 
                className={`absolute h-0.5 bg-white/20 transition-all duration-300 ${Math.abs(orientation.beta - 90) < 3 ? 'w-full bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'w-24'}`}
                style={{ transform: `rotate(${orientation.gamma}deg)` }}
              />
              
              <div className="absolute top-0 left-0 w-full h-full border border-white/5 rounded-full" />
              <div className="absolute top-4 left-4 right-4 bottom-4 border border-white/5 rounded-full" />
              
              <div className="text-[7px] font-mono text-white/30 absolute -top-6 w-full text-center tracking-[0.3em]">AI-STABILIZER MODE</div>
          </div>
      </div>

      {/* Color Analysis Comparison Interface */}
      {props.colorAnalysisMode && metrics.colorDelta > 0 && (
        <div className="absolute inset-x-0 bottom-32 flex flex-col items-center pointer-events-none">
            <div className="bg-black/90 p-5 border border-white/10 rounded-2xl flex gap-8 items-center backdrop-blur-3xl shadow-2xl">
                <div className="flex gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-10 h-10 rounded-lg border border-white/20 shadow-inner" style={{ backgroundColor: sampledColors.a }} />
                      <span className="text-[7px] text-white/40 font-mono italic">UNIT A</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-10 h-10 rounded-lg border border-white/20 shadow-inner" style={{ backgroundColor: sampledColors.b }} />
                      <span className="text-[7px] text-white/40 font-mono italic">UNIT B</span>
                    </div>
                </div>
                
                <div className="w-px h-10 bg-white/10" />

                <div className="flex flex-col">
                    <span className="text-[7px] text-white/40 font-mono tracking-tighter uppercase">{t.deviation}</span>
                    <span className={`text-2xl font-black font-mono leading-none ${metrics.colorDelta > 15 ? 'text-red-500' : 'text-green-400'}`}>
                        {metrics.colorDelta.toFixed(1)}
                    </span>
                </div>

                <div className="bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                    <span className="text-[7px] text-white/40 block mb-1 uppercase font-mono tracking-widest">{t['diagnosis.spec.elec']}</span>
                    <span className={`text-[11px] font-black tracking-tight uppercase ${metrics.colorDelta > 15 ? 'text-red-500' : 'text-green-500'}`}>
                        {metrics.colorDelta > 15 ? t['checklist.defect'] : t['status.ok']}
                    </span>
                </div>
            </div>
            
            {/* Visual pointers on screen */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[200px] w-8 h-8 border border-white/20 rounded-full flex items-center justify-center">
                <div className="w-1 h-1 bg-white rounded-full animate-ping" />
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[-100px] w-8 h-8 border border-white/20 rounded-full flex items-center justify-center">
                <div className="w-1 h-1 bg-white rounded-full animate-ping" />
            </div>
        </div>
      )}

      {props.children}

      <style>{`
        @keyframes scan { 0% { transform: translateY(-100%); } 100% { transform: translateY(500%); } }
        @keyframes flow { from { background-position: 0 0; } to { background-position: 60px 60px; } }
      `}</style>
      
      {/* Macro Mode Warning */}
      {isTooClose && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-amber-500 text-black px-8 py-3 rounded-full font-black text-xs tracking-widest shadow-2xl animate-bounce border-2 border-black flex items-center gap-2">
            <Activity size={16} />
            {t['scan.close']}
          </div>
        </div>
      )}
    </div>
  );
});

export default CameraView;
