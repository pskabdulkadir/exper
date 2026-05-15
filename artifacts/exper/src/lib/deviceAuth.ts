/**
 * Cihaz Kimliği Sistemi
 * - Tarayıcıda bir kez sh-XXXX formatında ID oluştur
 * - localStorage'de sakla ve değiştirme
 */

export const getPersistentDeviceId = async (): Promise<string> => {
  try {
    // 1. localStorage'de bak
    let deviceId = localStorage.getItem('sh_device_id');

    if (!deviceId) {
      // 2. Yoksa sh-3456 formatında üret
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      deviceId = `sh-${randomNum}`;

      // 3. localStorage'e kaydet
      localStorage.setItem('sh_device_id', deviceId);

      console.log(`✓ Yeni cihaz ID oluşturuldu: ${deviceId}`);
    } else {
      console.log(`✓ Mevcut cihaz ID bulundu: ${deviceId}`);
    }

    return deviceId;
  } catch (e) {
    console.error('Cihaz ID hatası:', e);
    throw e;
  }
};

/**
 * Cihaz ID'sini sil (örn: uygulamayı sıfırlama durumunda)
 */
export const resetDeviceId = (): void => {
  localStorage.removeItem('sh_device_id');
  console.log('✓ Cihaz ID sıfırlandı');
};

/**
 * Mevcut cihaz ID'sini getir (async çağrıya gerek yok ama konsistelik için)
 */
export const getCurrentDeviceId = (): string | null => {
  return localStorage.getItem('sh_device_id');
};
