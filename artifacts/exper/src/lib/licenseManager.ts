import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  Timestamp,
  query,
  getDocs
} from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from './firebase';
import { getPersistentDeviceId } from './deviceAuth';

export interface AuthorizedDevice {
  deviceId: string;
  isAuthorized: boolean;
  createdAt: Timestamp;
  status: 'Pending' | 'Authorized' | 'Rejected' | 'Suspended';
  lastUsed?: Timestamp;
  usageCount?: number;
}

/**
 * Yeni cihazı Firestore'a kaydet
 * (Cihaz ilk kez kullanıldığında)
 */
export const registerDeviceInFirestore = async (): Promise<string> => {
  const deviceId = await getPersistentDeviceId();

  if (!isFirebaseConfigured) return deviceId;

  const deviceRef = doc(firestore, 'AuthorizedDevices', deviceId);
  const deviceSnap = await getDoc(deviceRef);

  // Eğer zaten kayıtlıysa güncelle, yoksa oluştur
  if (!deviceSnap.exists()) {
    await setDoc(deviceRef, {
      deviceId: deviceId,
      isAuthorized: false,
      createdAt: Timestamp.now(),
      status: 'Pending',
      usageCount: 0,
    } as AuthorizedDevice);

    console.log(`✓ Cihaz Firestore'a kaydedildi: ${deviceId} (Beklemede)`);
  } else {
    // Mevcut cihaz, lastUsed güncelle
    const existingDevice = deviceSnap.data() as AuthorizedDevice;
    const usageCount = (existingDevice.usageCount || 0) + 1;

    await setDoc(deviceRef, {
      ...existingDevice,
      lastUsed: Timestamp.now(),
      usageCount: usageCount,
    }, { merge: true });

    console.log(`✓ Cihaz güncellendi: ${deviceId} (Kullanım: ${usageCount})`);
  }

  return deviceId;
};

/**
 * Cihaz lisans durumunu kontrol et
 */
export const checkDeviceLicense = async (): Promise<{
  isAuthorized: boolean;
  status: string;
  deviceId: string;
  message: string;
}> => {
  const deviceId = await getPersistentDeviceId();

  // OVERRIDE: For preview/development environment, we auto-authorize
  // Bu kısım, Firebase onayı olmadan uygulamanın açılmasını engellemek için kaldırıldı.
  // if (!isFirebaseConfigured || process.env.NODE_ENV === 'development' || window.location.hostname.includes('cloudshell') || window.location.hostname.includes('web-66fa')) {
  //   return {
  //     isAuthorized: true,
  //     status: 'Aktif',
  //     deviceId: deviceId,
  //     message: 'Sistem Onaylı: AI Studio Preview modunda tam erişim yetkisi sağlandı.',
  //   };
  // }

  const deviceRef = doc(firestore, 'AuthorizedDevices', deviceId);

  try {
    const deviceSnap = await getDoc(deviceRef);

    if (!deviceSnap.exists()) {
      // Cihaz henüz Firestore'da değil
      await registerDeviceInFirestore();
      return {
        isAuthorized: false,
        status: 'Pending',
        deviceId: deviceId,
        message: 'Cihaz başarıyla kaydedildi. Yöneticinin onayını beklemek için lütfen bekleyin.',
      };
    }

    const device = deviceSnap.data() as AuthorizedDevice;

    if (device.status === 'Suspended') {
      return {
        isAuthorized: false,
        status: 'Suspended',
        deviceId: deviceId,
        message: 'Bu cihaz askıya alınmıştır. Yöneticiyle iletişime geçin.',
      };
    }

    if (device.status === 'Rejected') {
      return {
        isAuthorized: false,
        status: 'Rejected',
        deviceId: deviceId,
        message: 'Bu cihaz reddedildi. Yöneticiyle iletişime geçin.',
      };
    }

    if (!device.isAuthorized) {
      return {
        isAuthorized: false,
        status: 'Pending',
        deviceId: deviceId,
        message: 'Lisansınız henüz onaylanmadı. Yönetici onayını beklemek için lütfen bekleyin.',
      };
    }

    // Başarılı - cihaz yetkilendirildi
    return {
      isAuthorized: true,
      status: 'Authorized',
      deviceId: deviceId,
      message: 'Cihaz yetkilendirildi. Uygulamayı kullanabilirsiniz.',
    };
  } catch (error: any) {
    console.error('Lisans kontrolü hatası:', error);

    // Offline durumunu kontrol et
    if (error?.code === 'unavailable' || error?.message?.includes('offline')) {
      console.warn('⚠️ Firebase çevrimdışı. Yeniden denenecek...');
      // 2 saniye sonra tekrar dene
      return new Promise((resolve) => {
        setTimeout(() => {
          checkDeviceLicense().then(resolve).catch(() => {
            throw new Error('Firebase hala çevrimdışı. İnternet bağlantınızı kontrol edin.');
          });
        }, 2000);
      });
    }

    throw error;
  }
};

/**
 * Firestore'den tüm cihazları getir (yönetici paneli için)
 */
export const getAllDevices = async (): Promise<AuthorizedDevice[]> => {
  try {
    const devicesQuery = query(
      collection(firestore, 'AuthorizedDevices')
    );
    const querySnapshot = await getDocs(devicesQuery);
    
    const devices: AuthorizedDevice[] = [];
    querySnapshot.forEach((doc) => {
      devices.push(doc.data() as AuthorizedDevice);
    });

    return devices;
  } catch (error) {
    console.error('Cihaz listesi alınırken hata:', error);
    throw error;
  }
};

/**
 * Bir cihazı yetkilendir (yönetici tarafından)
 */
export const authorizeDevice = async (deviceId: string): Promise<void> => {
  try {
    const deviceRef = doc(firestore, 'AuthorizedDevices', deviceId);
    await setDoc(deviceRef, {
      isAuthorized: true,
      status: 'Authorized',
    }, { merge: true });

    console.log(`✓ Cihaz yetkilendirildi: ${deviceId}`);
  } catch (error) {
    console.error('Cihaz yetkilendirme hatası:', error);
    throw error;
  }
};

/**
 * Bir cihazı reddet veya askıya al (yönetici tarafından)
 */
export const rejectDevice = async (deviceId: string, reason: string = ''): Promise<void> => {
  try {
    const deviceRef = doc(firestore, 'AuthorizedDevices', deviceId);
    await setDoc(deviceRef, {
      isAuthorized: false,
      status: 'Rejected',
      rejectionReason: reason,
    }, { merge: true });

    console.log(`✓ Cihaz reddedildi: ${deviceId}`);
  } catch (error) {
    console.error('Cihaz reddetme hatası:', error);
    throw error;
  }
};
