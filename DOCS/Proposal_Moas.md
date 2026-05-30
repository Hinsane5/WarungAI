# PROPOSAL INOVASI GCW 2.0
## WARUNG AI
**AI-Powered Conversational POS & Smart CRM**

**Gunadarma Code Week 2026 | Google Developer Group**

**MOAS TEAM:**
- Darris Felicio Hartanto - Hustler
- Winsont Desvio Wu - Hustler
- Nicholas Kenny Hendrawan - Hipster
- Howard Frelindo Goh - Hacker

---

## 1. Pendahuluan

### 1.1 Latar Belakang
Usaha Mikro, Kecil, dan Menengah (UMKM), khususnya warung kelontong tradisional, merupakan tulang punggung ekonomi akar rumput di Indonesia. Berdasarkan lanskap ritel, warung tradisional masih menguasai lebih dari 70% transaksi barang kebutuhan sehari-hari (FMCG) (DataKantor, 2024 disitasi dari simplidot). Namun, mereka menghadapi dilema operasional harian: tuntutan untuk melayani pembeli dengan cepat berbenturan dengan kebutuhan mencatat arus stok dan kas agar bisnis tidak merugi.

Meskipun kontribusinya masif, adopsi teknologi pencatatan digital di sektor mikro ini masih sangat rendah. Aplikasi Point of Sale (POS) konvensional gagal diadopsi secara masif karena menciptakan barrier to entry yang tinggi. Antarmukanya memaksa pemilik warung untuk mengetik layar dan mencari item, yang justru memperlambat waktu transaksi pada jam sibuk dan menciptakan tingkat churn (berhenti menggunakan aplikasi) yang tinggi. Akibatnya, hingga tahun 2025, populasi warung kelontong di Indonesia menyusut drastis menjadi hanya 3,9 juta, turun dari 6,1 juta pada tahun 2007 (APKLI, 2026).

Hilangnya lebih dari 2,2 juta warung ini sejalan dengan studi Jessie Hagan yang menemukan bahwa 82% bisnis mikro gulung tikar bukan karena sepi pembeli, melainkan akibat kebocoran finansial yang tidak terdeteksi: shrinkage (stok hilang/kadaluarsa) dan piutang macet dari sistem "kasbon" akibat hambatan rasa sungkan (social friction). Di saat yang sama, raksasa minimarket modern terus berekspansi dengan lebih dari 42.000 gerai (CNBC Indonesia, 2026), di mana setiap satu gerai baru diestimasi mematikan 6-7 toko tradisional di sekitarnya (AKSES, 2025).

Warung kelontong tidak lagi sekedar butuh alasan untuk bertahan, mereka butuh alat tempur. Oleh karena itu, menghadirkan pendekatan teknologi yang frictionless (tanpa hambatan) dan sesuai dengan literasi digital pelaku UMKM bukan lagi sekadar inovasi, melainkan kebutuhan mendesak untuk mencegah kebocoran arus kas dan menyelamatkan ekonomi akar rumput.

WarungAI mendukung SDG 8 (Decent Work and Economic Growth) melalui penguatan keberlanjutan UMKM, serta SDG 9 (Industry, Innovation and Infrastructure) melalui digitalisasi operasional warung berbasis AI.

### 1.2 Tujuan Solusi
Tujuan utama dari solusi kami adalah mengeliminasi friksi data entry dengan memindahkan antarmuka operasional ke platform yang sudah menjadi kebiasaan sehari-hari UMKM: WhatsApp. Melalui integrasi kecerdasan buatan, kami menghadirkan **AI-Powered Conversational POS & Smart CRM**, sebuah ekosistem yang memberdayakan warung untuk melakukan pencatatan instan tanpa merubah ritme kerja.

Solusi ini dirangkum dalam 4 fitur utama:
1. **AI Conversational POS**: Menggantikan mesin kasir konvensional. Pemilik warung cukup mengirim pesan teks atau suara ke bot WhatsApp (contoh: "Masuk dua dus indomie, laku satu galon"), dan AI secara real-time mengekstrak entitas tersebut menjadi pembaruan database stok dan arus kas.
2. **Smart Kasbon & Behavioral Credit Scoring**: Digitalisasi buku utang. Sistem mencatat kasbon pelanggan via chat, memberikan peringatan otomatis jika pelanggan memiliki riwayat tunggakan, dan mengirim pesan penagihan otomatis untuk mengatasi social friction.
3. **Frictionless Loyalty Capture**: Warung memajang QR Code statis di area kasir. Pelanggan memindai QR tersebut untuk membuka web app HTML/JS ringan dan memasukkan nomor WhatsApp mereka secara mandiri (self-service). Nomor ini langsung terhubung dengan transaksi kasir saat itu. Sebagai output-nya, sistem secara otomatis akan mengirimkan pesan WhatsApp ke pelanggan yang berisi stempel digital atau poin apresiasi mereka. Jalur komunikasi yang sudah terhubung ini kemudian menjadi fondasi bagi sistem untuk mengirimkan katalog promo bundle personal dan pengingat belanja (predictive restock) di kemudian hari, semuanya berjalan tanpa intervensi manual dari pemilik warung.
4. **Proactive CRM & Predictive Restock**: Sistem menganalisis data historis untuk memprediksi stok yang akan habis atau expired (seasonality & slow-moving), serta mengirimkan pengingat otomatis ke pelanggan untuk membeli kembali barang rutin (seperti gas atau air galon).

### 1.3 Dampak dan Manfaat Solusi
**Dampak yang Diharapkan:**
- Menurunkan waktu pencatatan transaksi menjadi di bawah 10 detik, melalui sistem Whatsapp yang ringan yang tetap dapat beroperasi lancar pada HP low-end dan internet tidak stabil.
- Menekan tingkat shrinkage dan pemborosan modal melalui peringatan barang kadaluarsa dan barang yang tidak laku (slow-moving).
- Meningkatkan efisiensi arus kas warung melalui sistem penagihan kasbon yang terautomasi dan presisi.

**Manfaat bagi Masyarakat/Pengguna:**
- Bagi pelaku UMKM (pemilik warung), solusi ini memberikan ketenangan pikiran karena operasional tercatat rapi tanpa menambah beban kerja.
- Bagi masyarakat sekitar (pelanggan), mereka mendapatkan pengalaman berbelanja layaknya di ritel modern, mulai dari program loyalitas digital hingga pengingat kebutuhan rumah tangga, yang pada akhirnya memperkuat daya saing warung tradisional di tengah gempuran minimarket modern.

---

## 2. Business & Market Strategy (Hustler)

### 2.1 BMC (Business Model Canvas)
- **Key Partnerships**: Provider Cloud (GCP), WhatsApp Business Solution Provider (BSP), Distributor/Agen Sembako besar.
- **Key Activities**: Pelatihan model NLP untuk mengenali dialek/singkatan lokal, Pemeliharaan peladen (server), Akuisisi kemitraan grosir.
- **Key Resources**: Infrastruktur Backend (Node.js & MongoDB), Google Cloud (NLP/Speech-to-Text API), Pengembang perangkat lunak.
- **Unique Value Proposition**: Zero learning curve (berbasis WhatsApp yang sudah terinstal), Pencatatan instan via perintah suara/teks, Manajemen utang yang menjaga psikologi sosial (social friction), Pengingat kulakan (pembelian barang secara grosir) otomatis.
- **Customer Relationships**: Edukasi penggunaan berbasis chat, Automated support via Bot, Self-service web dashboard opsional.
- **Channels**: WhatsApp Business API, Komunitas/paguyuban agen sembako lokal, Kampanye langsung ke distributor (B2B2C).
- **Customer Segments**: Warung kelontong, Agen sembako, Ritel mikro di area perumahan padat penduduk.
- **Cost Structure**: Biaya variabel dari API (GCP, WABA), Biaya hosting database, Operasional R&D, Biaya pemasaran grassroots.
- **Revenue Streams**: B2C Freemium Subscription, B2C Micro-transaction, B2B Data Monetization.

#### 2.1.1 Business Model Canvas WarungAI
Kami menggunakan pendekatan Hybrid Monetization untuk memastikan adopsi massal di tingkat warung sekaligus menjaga profitabilitas bisnis dari sisi B2B.

**1. B2C (Langganan Warung - Skema Modular)**
Kami menerapkan sistem harga yang sangat terjangkau agar setara dengan pengeluaran harian warung (seperti membeli sebungkus rokok), dengan memisahkan biaya operasional API yang mahal.
- **Tier Gratis (Basic POS)**: Gratis selamanya. Fasilitas: Input teks/suara untuk stok dan kasbon (dibatasi 50 transaksi/hari). Tidak ada fitur CRM (Manajemen Loyalitas & Hubungan Pelanggan).
- **Tier Premium (Lite POS)**: Rp 15.000/bulan. Fasilitas: Transaksi POS tanpa batas, fitur Predictive Restock, dan 1x laporan ekspor Excel bulanan. Harga ini sangat ringan dan berfungsi untuk mengunci retensi (lock-in).
- **Pay-per-Blast (Add-on CRM)**: Fitur pengingat ke pelanggan dan promo tidak dimasukkan ke biaya bulanan untuk mencegah kebengkakan biaya API WhatsApp. Pemilik warung membeli "Koin Bot" (misal: Rp 10.000 untuk 50 pesan broadcast). Warung hanya membayar ketika mereka ingin melakukan promosi yang mendatangkan keuntungan langsung bagi mereka.

**2. Targeted B2B Promo (Monetisasi Distributor & Principal FMCG)**
Setelah mengakuisisi banyak warung, WarungAI membuka pintu pendapatan dari perusahaan besar.
- **FMCG Data Dashboard**: Menjual akses dashboard analitik tingkat regional kepada distributor besar atau principal (seperti Indofood atau Unilever). Dengan membayar biaya langganan B2B yang tinggi untuk melihat data real-time mengenai produk apa yang paling laku di suatu daerah, kecepatan barang habis (turnover rate), dan tren harga eceran, tanpa mengekspos data pribadi pelanggan warung.
- **Targeted B2B Promo**: Distributor dapat membayar untuk menyelipkan pesan promosi saat warung melakukan cek stok. (Contoh: Saat warung mengecek stok, bot membalas: "Stok Indomie sisa 5. Kebetulan Agen Sinar Jaya sedang ada promo beli 10 gratis 1, mau pesan sekarang?"). WarungAI mengambil komisi per transaksi group-buying ini.

### 2.2 Analisis Kompetitor

**SWOT Analysis:**
- **Strengths**: Tidak perlu mengunduh aplikasi, Kurva pembelajaran rendah (zero learning curve), Input bahasa natural (suara/teks), Pendekatan penagihan yang menjaga psikologi sosial.
- **Weaknesses**: Ketergantungan pada stabilitas API WhatsApp, Akurasi NLP Google saat menerima rekaman suara di lingkungan dengan noise (kebisingan) tinggi.
- **Opportunities**: Jutaan warung masih bergantung pada buku tulis, Pasar Blue Ocean untuk AI spesifik mikro, Terdapat potensi ekspansi integrasi dengan supply chain distributor besar (sistem group-buying).
- **Threats**: Perubahan kebijakan harga API dari Meta atau Google Cloud, Tantangan edukasi awal mengenai privasi dan keamanan data transaksi.

#### 2.2.1 S.W.O.T Analysis WarungAI
Dalam merancang solusi ini, kami belajar dari sejarah kegagalan kompetitor terdahulu. Kompetitor terkuat yang sering disebut, BukuKas (Lummo), telah tutup operasional per 26 Mei 2023 meski menerima pendanaan fantastis sebesar Rp 1,14 triliun dari investor global. Kegagalan utama mereka berakar pada pivot produk hingga 4 kali dalam 4 tahun tanpa strategi monetisasi yang jelas (CNBC Indonesia, 2023). Kami memitigasi kesalahan ini dengan tidak "membakar uang" untuk mengakuisisi pengguna aplikasi baru, melainkan menumpang pada infrastruktur WhatsApp dan membangun jalur revenue B2B (distributor) sejak hari pertama.

**Competitor Benchmarking**
| Fitur | Solusi Kami (AI WA POS) | Aplikasi POS Tradisional (Moka) | Aplikasi Buku Utang (Buku Warung) | Kasir Pintar |
|---|---|---|---|---|
| Platform | WhatsApp (Tanpa Install) | Aplikasi Terpisah | Aplikasi Terpisah | Aplikasi Terpisah |
| Metode Input | Natural Language (Teks/Suara) | Ketik & Cari Item (Tapping) | Ketik Manual | Ketik & Cari Item (Tapping) |
| Sistem Penagihan | Smart Credit Score + Owner-in-the-Loop | Tidak Ada | Penagihan Otomatis (Kaku) | Tidak ada |
| Predictive Restock | Ya (Berbasis AI & Seasonality) | Terbatas (Batas Minimum Stok) | Basic Stock Reminder | Terbatas (Batas Minimum Stok) |
| Loyalty / CRM | Proactive Push WA + QR Frictionless | Berbasis Poin (Manual) | Tidak Ada | Tidak |
| Harga Dasar | Gratis (terbatas) | Rp299.000+/bulan/outlet | Gratis (terbatas) | Gratis (terbatas) |
| Learning Curve | Nol (Pakai WA biasa) | Tinggi | Sedang | Sedang |

#### 2.2.2 Peta Posisi Strategis WarungAI dan Kompetitor
WarungAI berada di kuadran **High-Tech, Low Barrier**. Berada di posisi ideal yang belum ditempati kompetitor lain. Kami menciptakan blue ocean dengan menggabungkan kemudahan WhatsApp yang sudah ada dengan kecerdasan AI Google.

### 2.3 Strategi Go-To-Market (GTM)
Strategi GTM WarungAI berfokus pada pembangunan ekosistem retail akar rumput melalui flywheel ecosystem. Alih-alih membakar modal (cash-burn) untuk iklan digital, pertumbuhan organik diciptakan melalui value exchange antara warung, agen grosir, dan Principal FMCG.
- **Validasi Awal (Wholesale Co-Branding)**: Untuk memvalidasi model NLP berbiaya rendah, kami bermitra dengan 1-2 agen grosir sembako di Tangerang. Kami menempatkan QR Code pendaftaran di area kasir ("Cek Stok via WA dalam 1 Menit") untuk mengakuisisi warung tepat saat mereka melakukan kulakan. Value exchange: agen grosir mendapatkan dasbor analitik tren stok warung mitra mereka guna meningkatkan efisiensi inventaris grosir.
- **Akuisisi Pengguna (Community-Driven)**: Sebanyak 10% pengguna beta paling aktif akan diangkat menjadi "Duta WarungAI" di tingkat RT/RW. Dengan insentif akses Premium gratis dan komisi, para duta ini akan melatih sesama pemilik warung menggunakan WhatsApp WarungAI. Model ini mengubah referal pasif menjadi gerakan adopsi berbasis kepercayaan sosial yang tingkat konversinya jauh lebih tinggi dari iklan konvensional.
- **Distribusi & Monetisasi (Subsidi Silang B2B)**: Seluruh layanan didistribusikan murni via WhatsApp untuk memastikan zero learning curve. Untuk mempertahankan layanan dasar agar tetap gratis bagi warung, kami menjual promosi bertarget kepada Principal FMCG. Saat AI mendeteksi stok warung menipis, sistem merekomendasikan kulakan kontekstual (misal: promo Indomie dari distributor mitra). Principal FMCG mendapatkan akses iklan dengan intent pembelian tinggi, dan pendapatan promosi tersebut mensubsidi operasional API WhatsApp kami yang mengunci flywheel bisnis yang berkelanjutan.

*(Ilustrasi GTM Phase Timeline dapat dilihat pada Lampiran 2.3)*

### 2.3.1 Siklus Model Bisnis (Flywheel Effect) Ekosistem Warung AI
- **WarungAI (WhatsApp Chat)**: Input berupa perintah suara/teks POS warung.
- **WarungAI Server**: Agregasi & Anonimisasi Data NLP Transaksi Akar Rumput.
- **Principal FMCG & Distributor**: Membayar iklan Target Ads (B2B Targeted Promo Ads) menggunakan data tren pasar.
- **Subsidi**: Biaya operasional API WhatsApp disubsidi, menjadikan TIER GRATIS POS tetap gratis untuk warung.

---

## 3. User Experience & Design (Hipster)
Indonesia adalah pengguna WhatsApp terbesar ke-3 di dunia dengan 112 juta pengguna aktif yang rata-rata membuka aplikasi ini 1 jam 52 menit setiap hari (DataReportal, Agt 2025). Pendekatan UI/UX kami membangun di atas kebiasaan yang sudah ada, bukan menciptakan kebiasaan baru (Zero Learning Curve):
- **Pemilik Warung**: Tidak perlu mempelajari menu aplikasi baru. Antarmuka 100% berada di ruang obrolan WhatsApp yang sudah lazim digunakan. Laporan disajikan dalam bentuk infografis teks atau dokumen siap unduh.
- **Pelanggan**: Mendapatkan pengalaman modern layaknya di ritel besar hanya dengan scan QR, memasukkan nomor telepon, dan langsung menerima konfirmasi stempel digital via WhatsApp tanpa perlu mengunduh aplikasi apa pun.

### 3.1. User Journey
*(Lihat Customer Journey Map & Business Owner Journey Map)*

### 3.2. User Persona

#### 3.2.1 User Persona Pemilik Warung
- **Pak Joko (52 tahun) - Pemilik/Pengelola Warung Tunggal yang Multitasker**: Mengelola warung sembako (>10 tahun) yang sibuk. Menggunakan smartphone hanya untuk WA/sosial media. Menolak aplikasi POS digital yang rumit.
  - *Pain Points*: Sulit mengetik di layar kecil saat sibuk melayani pelanggan. Kerugian akibat stockout tak terduga.
  - *Proposed Solution*: AI Conversational POS. Aksi: Mengirim pesan suara "Terjual 5kg beras" saat tangan penuh.
- **Ibu Sri (43 tahun) - Pemilik Warung yang Tertekan secara Sosial**: Mengelola warung kelontong rumahan di pinggiran kota. Akrab dan ramah dengan semua tetangga.
  - *Pain Points*: Tetangga meminta kredit mikro (kasbon) tetapi dia merasa terlalu canggung untuk menagih/menolak pembayar yang macet/menunggak.
  - *Proposed Solution*: Smart Kasbon & Behavioral Credit Scoring. Sistem memeriksa skor kredit perilaku dan mengirim reminder otomatis berkala.
- **Mas Rio (28 tahun) - Pewaris Warung yang Visioner**: Penerus warung agen sembako gen 2. Ingin Bersaing dengan minimarket modern.
  - *Pain Points*: Modal stuck pada barang yang jarang laku. Pelanggan bermigrasi ke minimarket modern.
  - *Proposed Solution*: Predictive Restock & Proactive CRM. AI menghasilkan laporan musiman dan reminder belanja barang rutin.

#### 3.2.2 User Persona Pelanggan Warung
- **Ibu Sari (32 tahun) - Pengelola Keuangan Rumah Tangga**: Ibu 2 anak. Anggaran rumah tangga yang ketat. Pelanggan setia warung lokal. Pengguna aktif WA.
  - *Pain Points*: Sering kehabisan gas elpiji dan air galon tanpa disadari, sehingga harus repot belanja keluar / menunggu lama.
  - *Proposed Solution*: Proactive CRM. AI memantau siklus belanja dan mengirimkan pengingat WA sebelum habis. Dapat order online langsung via WA untuk dikirim ke rumahnya.
- **Mas Andi (26 tahun) - Pembeli dengan Pemasukan Terbatas**: Pekerja lepas / pengemudi ojol. Pendapatan harian tidak konsisten. Terkadang kasbon untuk kebutuhan harian (rokok dan kopi).
  - *Pain Points*: Mengandalkan kasbon tetapi kesulitan memantau jumlah hutangnya. Terkejut jumlah hutang di akhir bulan.
  - *Proposed Solution*: Smart Kasbon. Pelanggan menerima detail hutang via WA setiap kali kasbon. Pelanggan menerima pengingat berkala total kasbon yang dimilikinya.
- **Kevin (21 tahun) - Kepribadian yang Praktis**: Mahasiswa gen 2 & freelancer. Menyukai penggunaan teknologi yang cepat, praktis, dan modern.
  - *Pain Points*: Menghindari warung tradisional karena pelayanan lambat karena manual dan sdm warung terbatas.
  - *Proposed Solution*: Frictionless Loyalty Capture (QR). Pelanggan memindai QR Code di meja kasir untuk langsung menerima summary belanja dan stempel loyalitas via WA.

### 3.3. Mockup Produk
Berikut akses demo mockup antarmuka: `https://app.supademo.com/demo/cmpjuvpwm01hcxf0jjkufw2oy`

**3.3.1 Antarmuka pemasukan/pengeluaran barang & fitur conversational POS**
Menunjukkan UI WarungAI yang sepenuhnya terintegrasi dengan WhatsApp. Pemilik warung tidak perlu mengetik manual yang memakan waktu, melainkan cukup menggunakan fitur Voice Note. Sistem AI Google Cloud (Speech-to-Text & NLP) akan langsung memproses suara menjadi data transaksi, memperbarui stok, dan mencatat arus kas secara real time.

**3.3.2 Antarmuka fitur behavioral credit scoring**
Menampilkan fitur Behavioral Credit Scoring. Saat pelanggan dengan riwayat kredit buruk mencoba menambah utang, AI mendeteksi skor tersebut dan memberikan peringatan. Menggunakan pendekatan Owner-in-the-Loop, AI tidak langsung menolak, melainkan membuatkan draft/template penagihan untuk mencegah kecanggungan sosial (social friction).

**3.3.3 Antarmuka fitur proactive CRM** *(Lihat Lampiran)*
Berdasarkan data riwayat belanja, sistem AI memprediksi siklus habisnya barang rutinitas pelanggan (seperti Gas Elpiji). Bot otomatis mengirimkan pesan pengingat ke pelanggan.

**3.3.4 Antarmuka fitur frictionless loyalty capture** *(Lihat Lampiran)*
Berdasarkan riwayat belanja pelanggan, sistem secara otomatis mengirimkan pesan WhatsApp ke pelanggan berisi stempel digital atau poin apresiasi.

**3.3.5 Antarmuka dashboard web analitik** *(Lihat Lampiran)*
Menyajikan visualisasi data operasional bagi pemilik warung sekaligus analitik agregat regional untuk distributor FMCG.

---

## 4. Teknologi & Implementasi (Hacker)
Arsitektur sistem dirancang untuk performa tinggi dengan kompleksitas yang disembunyikan di backend:

| Komponen | Teknologi Utama | Fungsi |
|---|---|---|
| Frontend (UI) | WhatsApp Business API, HTML/CSS/JS/Bootstrap | Conversational UI untuk warung dan pelanggan; Web App ringan untuk Loyalty Capture. |
| Backend Logic | Node.js (Express) | Menangani routing pesan WhatsApp, logika MVC, perhitungan credit scoring, dan penjadwalan CRM. |
| Artificial Intelligence | Google Cloud Platform (Speech-to-Text & Natural Language API) | Mengekstrak entitas (Item, Qty, Aksi, Harga) dari input suara atau teks berantakan menjadi format JSON. |
| Database | MongoDB (NoSQL) | Menyimpan skema inventaris yang dinamis, log transaksi kas, dan histori perilaku pelanggan secara fleksibel. |

*(Ilustrasi Infrastruktur (simple) pada Lampiran 4)*

### 4.1 Pemanfaatan AI
AI menjadi inti dari sistem ini karena memungkinkan pemilik warung berinteraksi secara natural tanpa perlu mempelajari antarmuka baru. Terdapat 3 poin utama di mana AI meningkatkan fungsionalitas solusi:
1. **Conversational POS (Pemrosesan Perintah Natural)**: Pemilik cukup mengirim pesan "laku 3 indomie sama 2 aqua gelas" atau rekaman suara, dan AI otomatis mengekstrak informasi terstruktur (aksi, nama item, kuantitas, harga) lalu memperbarui database.
2. **Smart Kasbon**: Transaksi dianalisis secara historis. Sistem menghitung skor risiko berdasarkan tunggakan, jumlah utang, dll., untuk memberikan peringatan otomatis.
3. **Proactive CRM**: AI menganalisis data historis untuk mendeteksi barang mendekati habis, slow-moving, dan pola pembelian rutin.

**Teknologi AI yang Diterapkan:**
| Komponen | Teknologi | Fungsi |
|---|---|---|
| Entity Extraction | GCP Natural Language API | Mengekstrak item, kuantitas, aksi, dan harga dari teks bebas termasuk singkatan lokal (contoh: "aqua botol gede" -> {item: "Aqua 1500ml", qty: 1}) |
| Speech Recognition | GCP Speech-to-Text | Mengonversi pesan suara WhatsApp (format OGG/Opus) menjadi teks sebelum diproses NLP |
| Fallback Understanding | GCP Vertex AI (Generative AI) | Menangani pesan yang ambigu atau tidak dapat dipahami oleh Natural Language API, seperti typo berat, singkatan hiperlokal, atau pesan campur bahasa |
| Credit Scoring | Rule-Based Scoring Engine | Menghitung skor risiko kasbon dengan formula: (total_tunggakan * hari_terlambat) / frekuensi_lunas |
| Predictive Restock | Time-series Pattern Matching | Menganalisis histori transaksi per item untuk memprediksi kapan stok akan habis berdasarkan rata-rata penjualan harian dan tren musiman |
| Personalized CRM | Behavioral Segmentation | Mengelompokkan pelanggan berdasarkan recency, frequency, dan monetary value (RFM) untuk menentukan konten promo yang relevan |
| Data Analysis | GCP BigQuery | Menganalisis keseluruhan data transaksi dari seluruh warung dalam skala besar untuk menghasilkan insight pola restok, tren musiman, dan perilaku pelanggan |
| Automation & Scheduling | GCP Cloud Scheduler | Menjalankan proses batch secara terjadwal setiap malam, mencakup analisis prediktif restok, pembaruan credit score, dan pengiriman notifikasi CRM ke pelanggan |

### 4.2 Use case diagram
*(Lihat Diagram 4.2.1)*
Diagram use case menggambarkan bagaimana dua pengguna utama sistem (Pemilik Warung dan Pelanggan) berinteraksi dengan fitur-fitur yang tersedia. Pemilik warung memiliki akses ke lima fungsi inti: mencatat transaksi, memantau stok dan arus kas, mengelola kasbon, menerima peringatan stok menipis, serta melihat dashboard analitik (didukung BigQuery dan Looker Studio). Pelanggan berinteraksi via QR code untuk loyalty & promo via WhatsApp.

### 4.3 Sequence diagram
*(Lihat Diagram 4.3.1)*
Diagram sequence menggambarkan perjalanan pesan transaksi dari saat dikirim hingga konfirmasi diterima. Sistem memanggil GCP Natural Language API, dan jika confidence rendah, menggunakan Vertex AI sebagai fallback. Log transaksi dikirimkan real-time ke BigQuery. Terdapat proses batch (Cloud Scheduler) setiap malam untuk prediksi restok & segmentasi.

### 4.4 System design
*(Lihat Diagram 4.4.1)*
Diagram arsitektur menggambarkan lima lapisan utama: User Layer, Gateway Layer, Backend Layer (Node.js), GCP AI Layer, Analytics & Reporting Layer (BigQuery & Looker), dan Data Layer (MongoDB).

---

## 5. Kesimpulan & Roadmap Pengembangan

### 5.1 Kesimpulan
Dari 3,9 juta warung yang tersisa, sebagian besar akan terus kehilangan uang bukan karena kalah bersaing harga dengan Indomaret, tapi karena kasbon yang tidak tertagih dan stok yang tidak tercatat. Warung AI kami mengubah WhatsApp, aplikasi yang sudah dibuka setiap hari, menjadi sistem operasional lengkap yang dapat dilakukan tanpa menginstall aplikasi baru, tanpa pembelajaran tambahan dan tanpa mengubah ritme kerja. Data dari jutaan transaksi warung kemudian menjadi aset analitik yang bisa dijual ke distributor FMCG. Ini bukan hanya solusi untuk warung tetapi juga infrastruktur data untuk ekonomi akar rumput Indonesia.

### 5.2 Rencana Pengembangan
- **Q3 2026: Fase Validasi & Optimalisasi AI (Code: Grinding)**: Rilis Minimum Viable Product (MVP) kasir suara dan akuisisi 50 warung beta-tester di area Tangerang. Fokus pada pelatihan model NLP agar tahan bising dan mengenali dialek lokal. (Target: Akurasi NLP >95%, Retention >80%).
- **Q4 2026: Fase Integrasi Finansial & Ekspansi (Code: Go-Live)**: Integrasi fitur pembayaran instan berbasis QRIS langsung ke dalam bot WhatsApp untuk mempermudah penagihan kasbon online. Ekspansi ke 500 warung Jabodetabek dengan program "Duta WarungAI". (Target: 500 warung, GTV Rp 50 Juta, 20% premium conversion).
- **Q1 2027: Fase Skalabilitas Ekosistem & Monetisasi (Code: Flywheel)**: Peluncuran fitur Group-Buying (Kulakan Bersama) antar warung dan akses FMCG Data Dashboard berbayar untuk Principal. (Target: 5.000+ warung, kontrak B2B Principal FMCG, break-even).

### 5.3 Analisis Matriks & Mitigasi Risiko
*(Lihat Lampiran 5.3)*

---

## 6. Daftar Pustaka
[1] Ali Mahsun (Ketua Umum APKLI). 2026. "Asosiasi: Warung Kelontong Tersisa 3,9 Juta, Tergerus Ritel Modern." ANTARA News, 27 Februari 2026.
[2] Budi Arie Setiadi (Menteri Kominfo). 2024. "Coba Atasi Kesenjangan Digital, Kominfo Luncurkan Program Adopsi Teknologi Digital UMKM 2024." Ditjen Aptika.
[3] DataReportal & Kompas Tekno. 2025. "10 Media Sosial Terpopuler di Indonesia 2025..."
[4] CNN Indonesia. 2025. "Jumlah Pengguna WhatsApp Tembus 3 Miliar..."
[5] CNBC Indonesia. 2026. "Diultimatum 2 Menteri, Gurita Alfamart-Indomaret Tembus 44.366 Gerai."
[6] CNBC Indonesia. 2023. "Jeff Bezos Modali Dua Startup RI, Kini Semuanya Tutup."
[7] Mekari Qontak. 2026. "Harga WhatsApp Business API Terbaru."
[8] Jessie Hagen (U.S. Bank), SCORE. "Top Reasons Why Businesses Fail."
[9] SimpliDOTS. 2025. "Perbedaan Jenis Bisnis FMCG di Indonesia."
[10] CNBC Indonesia. 2026. "Toko Kelontong RI Bertumbangan Diklaim karena Ritel Modern..."
[11] Meta Developers. 2025. "Pricing Updates July 2025 WhatsApp Business Platform."

---

## 7. Lampiran

### Lampiran 2.3: GTM Phases Timeline
- **Phase 1 (Month 1-3):** 50 Warung (Area Tangerang) - Validasi NLP & Lapangan.
- **Phase 2 (Month 4-6):** 500 Warung (Wilayah Jabodetabek) - Peluncuran & Monetisasi B2C.
- **Phase 3 (Months 7+):** 5.000+ Warung (Fokus Urban Jawa) - Integrasi FMCG & Skalabilitas.

### Lampiran 5.3: Risk and Mitigation (Matriks Analisis WarungAI)
| Kode | Risiko | Deskripsi Risiko | Rencana Mitigasi (Action Plan) |
|---|---|---|---|
| R-01 | Teknologi (Tech Risk) | Tingkat kebisingan (noise) tinggi di pasar/jalan membuat Speech-to-Text AI salah mendeteksi nominal transaksi atau nama barang. | Menerapkan arsitektur Human-in-the-Loop. Bot selalu mengirimkan pesan konfirmasi ringkas (Contoh: "Tercatat: 2 Indomie. Benar? Balas Y/T"). Jika gagal 2x, sistem otomatis menyediakan fallback opsi input teks cepat. |
| R-02 | Pasar/Bisnis (Market Risk) | Pemilik warung enggan membayar biaya kuota "Koin Bot" untuk fitur CRM/notifikasi dan memilih kembali ke pencatatan buku fisik yang gratis | Mengunci model bisnis B2B Flywheel. Kami tidak membebankan biaya API WhatsApp yang mahal kepada warung, melainkan mensubsidi silangnya dari komisi iklan Targeted Promo yang dibayar oleh Principal FMCG besar. |
| R-03 | Regulasi (Regulatory Risk) | Meta (WhatsApp) memperbarui kebijakan harga API komersial secara mendadak atau memblokir bot karena dianggap menyebarkan spam. | Menjaga kepatuhan ketat Privacy Policy dengan hanya menggunakan Official WhatsApp Business Solution Provider (BSP). Sebagai rencana cadangan (backup), kami menyiapkan arsitektur Progressive Web App (PWA) HTML/JS yang sangat ringan dan hemat kuota internet. |
