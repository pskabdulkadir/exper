import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  Timestamp, 
  terminate, 
  clearIndexedDbPersistence,
  initializeFirestore
} from 'firebase/firestore';

/**
 * Firebase config - .env dosyasından yükle
 * VITE_FIREBASE_API_KEY vb. değişkenleri ayarla
 */
const firebaseConfig = {
  apiKey: "AIzaSyB_kgolQop0RIhB1y26OViM2YGbC50I4rM",
  authDomain: "exper-8bf14.firebaseapp.com",
  projectId: "exper-8bf14",
  storageBucket: "exper-8bf14.firebasestorage.app",
  messagingSenderId: "921455411379",
  appId: "1:921455411379:web:ff937034133b0c054770c6"
};

// Kontrol et: Config tamam mı?
export const isFirebaseConfigured = !!firebaseConfig.apiKey && !!firebaseConfig.projectId;

let app;
let firestore: any;

if (isFirebaseConfigured) {
  // Firebase'i başlat
  app = initializeApp(firebaseConfig);
  // Firestore'u başlat - Long Polling kullanarak bağlantıyı daha stabil hale getir
  firestore = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  });
  console.log('✓ Firebase bağlantısı başarılı (Long Polling):', firebaseConfig.projectId);
} else {
  console.warn('⚠️ Firebase API anahtarı eksik. Yerel depolama (Local Storage) modu aktif.');
  // Mock app to prevent crashes if something expects it
  app = { name: '[DEFAULT]', options: {}, automaticDataCollectionEnabled: false };
  firestore = null; 
}

export { firestore };

/**
 * Firestore'u sıfırla (geliştiriciler için)
 * Offline durumundan kurtulmak istersen bu fonksiyonu çağır
 */
export async function resetFirestore() {
  try {
    await terminate(firestore);
    await clearIndexedDbPersistence(firestore);
    console.log('✓ Firestore sıfırlandı, sayfa yenile');
  } catch (error) {
    console.error('Firestore sıfırlama hatası:', error);
  }
}

export { Timestamp };
