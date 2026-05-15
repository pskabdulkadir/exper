import { useState, useEffect } from 'react';

export interface SensorData {
  magneticField: { x: number; y: number; z: number; total: number };
  acceleration: { x: number; y: number; z: number; total: number };
  isAvailable: boolean;
}

export function useSensors() {
  const [data, setData] = useState<SensorData>({
    magneticField: { x: 0, y: 0, z: 0, total: 0 },
    acceleration: { x: 0, y: 0, z: 0, total: 0 },
    isAvailable: false
  });

  const requestPermission = async () => {
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceMotionEvent as any).requestPermission();
        return permission === 'granted';
      } catch (e) {
        console.error("Permission request failed", e);
        return false;
      }
    }
    return true;
  };

  useEffect(() => {
    let magneticSensor: any = null;

    const startSensors = async () => {
      const hasPermission = await requestPermission();
      if (!hasPermission) return;

      if (typeof (window as any).Magnetometer === 'function') {
        try {
          magneticSensor = new (window as any).Magnetometer({ frequency: 20 });
          magneticSensor.addEventListener('reading', () => {
            const { x, y, z } = magneticSensor;
            setData(prev => ({
              ...prev,
              magneticField: { x, y, z, total: Math.sqrt(x*x + y*y + z*z) },
              isAvailable: true
            }));
          });
          magneticSensor.start();
        } catch (err) {
          console.warn("Magnetometer access denied/unavailable", err);
        }
      }

      const handleMotion = (event: DeviceMotionEvent) => {
        const { x, y, z } = event.accelerationIncludingGravity || { x: 0, y: 0, z: 0 };
        setData(prev => ({
          ...prev,
          acceleration: { 
              x: x || 0, 
              y: y || 0, 
              z: z || 0, 
              total: Math.sqrt((x||0)**2 + (y||0)**2 + (z||0)**2) 
          },
          isAvailable: true
        }));
      };

      window.addEventListener('devicemotion', handleMotion);
      return () => window.removeEventListener('devicemotion', handleMotion);
    };

    startSensors();

    return () => {
      if (magneticSensor) magneticSensor.stop();
    };
  }, []);

  return { ...data, requestPermission };
}
