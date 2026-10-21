# Maç Analiz

Tüm liglerdeki maçları fikstür üzerinden arayıp maç öncesi analiz sunan yerel web uygulaması.

## Çalıştırma

1. [API-Football](https://www.api-football.com/) hesabı açıp API anahtarı alın. Servisin ücretsiz planı günlük 100 isteğe kadar sunuyor; tüm planlarda lig kapsamı var, ücretsiz planda sezon ve istek sınırları bulunuyor. Kadro, sakatlık, geçmiş karşılaşma ve fikstür uçları API sağlayıcısına bağlıdır.
2. Bu klasörde PowerShell açın ve anahtarı oturum değişkeni olarak ayarlayın:

   ```powershell
   $env:API_FOOTBALL_KEY = "ANAHTARINIZ"
   node server.js
   ```

3. Tarayıcıda `http://localhost:4173` adresini açın. Anahtar tarayıcıya gönderilmez; yerel sunucuda kalır.

## İnternette yayınlama (Render)

`render.yaml` Render Blueprint tanımıdır. Yayın için bu `outputs` klasöründeki dosyaları bir GitHub deposuna göndermek, Render hesabında **New > Blueprint** ile depoyu bağlamak ve istenince `API_FOOTBALL_KEY` değerini Render ortam değişkeni olarak girmek gerekir. Anahtarı GitHub'a ya da bu dosyalara eklemeyin. Render, uygulamayı `onrender.com` adresinde yayınlar. Render web servisi yapılandırması `PORT` değişkenini kullanır ve uygulama `0.0.0.0` üzerinde dinler.

Bu tanım ücretsiz servis planını seçer. Ücretsiz servislerin çalışma/uyku davranışı ve mevcut limitleri Render planına göre değişebilir; yayın sırasında güncel koşulları kontrol edin.

API anahtarı olmadan arayüz demo modunda açılır. Gerçek maç listesi ve takım analizi için API anahtarı gereklidir. Takım isimleri elle girildiğinde, yalnızca o gün/tarihte fikstürde eşleşen bir karşılaşma seçilebilir; fikstürden maç seçmek şu an analiz akışını başlatır.

## Analiz hakkında

Galibiyet/beraberlik oranları, lig içi sezon galibiyet oranı, ev sahibi avantajı ve maç eksikleri ile oluşturulan başlangıç seviyesi bir model tahminidir. Bunlar bahis tavsiyesi veya kesin sonuç değildir. Veri sağlayıcı bazı liglerde ilk 11 ve sakatlık verisini sunmayabilir ya da gecikmeli güncelleyebilir. Analiz kartı bunu açıkça belirtir.
