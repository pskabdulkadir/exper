# AKN Exper - Araç Ekspertiz Uygulaması

Kamera üzerinden araç tanımlayan, gövde durumunu analiz eden ve sensör verilerini işleyerek kapsamlı teknik raporlar sunan yapay zeka destekli araç ekspertiz uygulaması.

## Run & Operate

- `pnpm --filter @workspace/exper run dev` — uygulamayı çalıştır
- `pnpm run typecheck` — tüm paketlerde tip kontrolü
- `pnpm run build` — derle

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- React 19 + Vite 7
- TailwindCSS v4
- TensorFlow.js (COCO-SSD + MobileNet) — yerel araç tespiti
- Firebase Firestore — cihaz lisans yönetimi
- motion/react (framer-motion) — animasyonlar
- jsPDF — rapor dışa aktarma
- Lucide React — ikonlar

## Where things live

- `artifacts/exper/src/App.tsx` — Ana uygulama (3895 satır)
- `artifacts/exper/src/components/CameraView.tsx` — Kamera bileşeni
- `artifacts/exper/src/lib/gemini.ts` — TensorFlow yapay zeka motoru
- `artifacts/exper/src/lib/licenseManager.ts` — Firebase cihaz lisans kontrolü
- `artifacts/exper/src/lib/firebase.ts` — Firebase bağlantısı
- `artifacts/exper/src/lib/deviceAuth.ts` — Cihaz kimlik sistemi
- `artifacts/exper/src/lib/translations.ts` — TR/EN/DE çeviri dosyası
- `artifacts/exper/src/hooks/useSensors.ts` — Cihaz sensörleri (ivme, manyetik)
- `artifacts/exper/src/hooks/useAudioAnalyzer.ts` — Ses analizi

## Architecture decisions

- Tüm AI analizi yerel olarak TensorFlow.js ile yapılır, dış API bağımlılığı yok
- Firebase Firestore cihaz yetkilendirmesi: her cihaz `sh-XXXX` ID ile kaydolur, admin onayı gerekli
- Firebase projesi: `exper-8bf14` (hardcoded — değiştirmeye gerek yok)
- jsPDF ile PDF rapor indirme özelliği mevcut
- WebGL cihazda desteklenmezse otomatik CPU fallback

## Product

- Araç tanıma (kamera üzerinden COCO-SSD + MobileNet)
- 360° gövde analizi (ön, arka, sol, sağ, tavan açılarından)
- Mekanik, elektrik ve gövde modu taramaları
- VIN numarası sorgulama
- Boya kalınlığı ve kaporta hasar raporu
- PDF ve TXT rapor dışa aktarma
- TR / EN / DE dil desteği

## Device Authorization (Cihaz Yetkilendirme)

Uygulama ilk açılışta cihazı Firebase'e kaydeder (PENDING durumu).
Firebase Console → Firestore → `AuthorizedDevices` koleksiyonundan:
- `isAuthorized: true` ve `status: "Authorized"` yaparak cihazı onayla

## Gotchas

- WebGL preview ortamında desteklenmez; gerçek cihazda çalışır
- Kamera erişimi HTTPS veya localhost gerektirir
- Firebase bağlantısı Long Polling modunda çalışır (güvenilir bağlantı)

## User preferences

_Kullanıcı tercihleri eklendikçe buraya yazılacak._
