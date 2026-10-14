/**
 * Dashboard ZNT (Zona Nilai Tanah) Kabupaten Purbalingga
 * Peta Utama: APL.geojson
 * Filter Surveyor terhubung spesifik ke berkas GeoJSON masing-masing:
 *  - M Al Alim Murtadho              -> Alim.geojson
 *  - Sekar Ranna                     -> Sekar.geojson
 *  - Sahman Ismail Kadum Suparta     -> Sahman.geojson
 *  - Akhmad Sujatna                  -> Akhmad.geojson
 */

// =============================================================================
// 1. INISIALISASI PROJ4JS UNTUK EPSG:23835 (INDONESIA TM-3 ZONE 49.1)
// =============================================================================
if (typeof proj4 !== 'undefined') {
  proj4.defs("EPSG:23835", "+proj=tmerc +lat_0=0 +lon_0=109.5 +k=0.9999 +x_0=200000 +y_0=1500000 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
}

function reprojectCoordinates(coords) {
  if (!Array.isArray(coords)) return coords;
  if (typeof coords[0] === 'number') {
    // Jika koordinat dalam satuan meter (TM-3 Zone 49.1)
    if (Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 90) {
      if (typeof proj4 !== 'undefined') {
        const p = proj4("EPSG:23835", "WGS84", [coords[0], coords[1]]);
        return [p[0], p[1]];
      }
    }
    return [coords[0], coords[1]];
  }
  return coords.map(reprojectCoordinates);
}

function reprojectGeoJson(geojsonData) {
  if (!geojsonData || !geojsonData.features) return geojsonData;
  geojsonData.features.forEach(feature => {
    if (feature.geometry && feature.geometry.coordinates) {
      feature.geometry.coordinates = reprojectCoordinates(feature.geometry.coordinates);
    }
  });
  return geojsonData;
}

// =============================================================================
// 2. KONFIGURASI PETA UTAMA (APL) & 4 SURVEYOR
// =============================================================================
const APL_CONFIG = {
  name: 'Area Penggunaan Lain (APL)',
  file: 'APL.geojson',
  color: '#06b6d4',       // Cyan border
  fillColor: '#0891b2',   // Deep cyan fill
  weight: 2.5
};

const SURVEYOR_CONFIGS = [
  {
    id: 'alim',
    name: 'M Al Alim Murtadho',
    file: 'Alim.geojson',
    aliases: ['m al alim murtadho', 'alim', 'budi pratama'],
    color: '#10b981',     // Emerald Green
    accentColor: '#34d399',
    shortName: 'Alim'
  },
  {
    id: 'sekar',
    name: 'Sekar Renna',
    file: 'Sekar.geojson',
    aliases: ['sekar renna', 'sekar ranna', 'sekar', 'dewi a', 'siti rahma'],
    color: '#f43f5e',     // Rose Pink
    accentColor: '#fb7185',
    shortName: 'Sekar'
  },
  {
    id: 'sahman',
    name: 'Sahman Ismail Kadum Suparta',
    file: 'Sahman.geojson',
    aliases: ['sahman ismail kadum suparta', 'sahman', 'hendra k'],
    color: '#f59e0b',     // Amber Orange
    accentColor: '#fbbf24',
    shortName: 'Sahman'
  },
  {
    id: 'akhmad',
    name: 'Akhmad Sujatna',
    file: 'Akhmad.geojson',
    aliases: ['akhmad sujatna', 'akhmad', 'reza mahendra'],
    color: '#3b82f6',     // Sky Blue
    accentColor: '#60a5fa',
    shortName: 'Akhmad'
  }
];

// Helper untuk menemukan konfigurasi surveyor berdasarkan nama atau alias
function findSurveyorConfig(val) {
  if (!val || val === 'default') return null;
  const lower = val.toLowerCase().trim();
  return SURVEYOR_CONFIGS.find(c =>
    c.id === lower ||
    c.name.toLowerCase() === lower ||
    (c.aliases && c.aliases.some(a => lower === a || lower.includes(a) || a.includes(lower)))
  );
}

// Pemetaan nama surveyor dari data Google Sheets ke 4 nama resmi
const SURVEYOR_MAPPING = {
  "budi pratama": "M Al Alim Murtadho",
  "alim": "M Al Alim Murtadho",
  "m al alim murtadho": "M Al Alim Murtadho",
  "dewi a": "Sekar Renna",
  "sekar": "Sekar Renna",
  "sekar ranna": "Sekar Renna",
  "sekar renna": "Sekar Renna",
  "hendra k": "Sahman Ismail Kadum Suparta",
  "sahman": "Sahman Ismail Kadum Suparta",
  "sahman ismail kadum suparta": "Sahman Ismail Kadum Suparta",
  "reza mahendra": "Akhmad Sujatna",
  "akhmad": "Akhmad Sujatna",
  "akhmad sujatna": "Akhmad Sujatna",
  "siti rahma": "Sekar Renna"
};

// Variabel Global Data
let sheetsData = [];
const surveyorLayers = {};      // id & name -> L.geoJSON layer
const surveyorFeatures = {};    // id & name -> array of features
let aplLayer = null;            // L.geoJSON layer untuk APL.geojson
let aplFeaturesCount = 0;       // Jumlah fitur poligon APL
let allZntTotalCount = 0;       // Total zona gabungan 4 surveyor
const MULTIPLIER_TARGET = 3;   // Target titik = jumlah polygon geojson * 3
const DEFAULT_TOTAL_POLYGONS = 797; // 197 (Alim) + 200 (Sekar) + 200 (Sahman) + 200 (Akhmad)
let currentTargetTotal = DEFAULT_TOTAL_POLYGONS * MULTIPLIER_TARGET; // 2.391 Titik

// Helper fungsi untuk menghitung capaian titik surveyor dari data Google Sheets
function getSurveyorPoints(cfgOrName) {
  let count = 0;
  if (!cfgOrName) return 0;
  const cfg = typeof cfgOrName === 'string' ? findSurveyorConfig(cfgOrName) : cfgOrName;
  const targetName = cfg ? cfg.name.toLowerCase() : cfgOrName.toLowerCase();

  sheetsData.forEach(item => {
    const itemSur = (item.surveyor || '').toLowerCase().trim();
    if (cfg) {
      if (itemSur === cfg.name.toLowerCase() ||
          itemSur.includes(cfg.id) ||
          (cfg.aliases && cfg.aliases.some(a => itemSur === a || itemSur.includes(a)))) {
        count += item.points || 0;
      }
    } else if (itemSur.includes(targetName) || targetName.includes(itemSur)) {
      count += item.points || 0;
    }
  });
  return count;
}

// Skema Warna Gradasi Merah sampai Hijau (0% - 100%)
function getProgressColor(pct) {
  if (pct >= 100) return '#10b981'; // Hijau Emerald (Target Selesai)
  if (pct >= 75)  return '#22c55e'; // Hijau Segar (Tinggi)
  if (pct >= 50)  return '#eab308'; // Kuning (Sedang)
  if (pct >= 25)  return '#f59e0b'; // Oranye/Amber (Proses)
  if (pct > 0)    return '#f97316'; // Oranye Kemerahan (Awal)
  return '#ef4444';                 // Merah (0% / Belum Mulai)
}

function getInterpolatedProgressColor(pct) {
  const p = Math.max(0, Math.min(100, pct)) / 100;
  let r, g, b;
  if (p < 0.5) {
    const t = p / 0.5;
    // #ef4444 (239, 68, 68) -> #eab308 (234, 179, 8)
    r = Math.round(239 + (234 - 239) * t);
    g = Math.round(68 + (179 - 68) * t);
    b = Math.round(68 + (8 - 68) * t);
  } else {
    const t = (p - 0.5) / 0.5;
    // #eab308 (234, 179, 8) -> #10b981 (16, 185, 129)
    r = Math.round(234 + (16 - 234) * t);
    g = Math.round(179 + (185 - 179) * t);
    b = Math.round(8 + (129 - 8) * t);
  }
  return `rgb(${r}, ${g}, ${b})`;
}

// Helper fungsi untuk menghitung target titik sampel: jumlah polygon GeoJSON * 3
function calculateTargetPoints(surveyorConfig) {
  if (surveyorConfig && surveyorFeatures[surveyorConfig.id]) {
    // Jika surveyor tertentu dipilih -> jumlah polygon berkas surveyor tersebut * 3
    const polyCount = surveyorFeatures[surveyorConfig.id].length;
    return polyCount * MULTIPLIER_TARGET;
  }

  // Jika "Semua Surveyor" (default) -> total polygon dari 4 berkas geojson (Alim, Sekar, Sahman, Akhmad) * 3
  let totalSurveyorPolygons = 0;
  SURVEYOR_CONFIGS.forEach(cfg => {
    if (surveyorFeatures[cfg.id]) {
      totalSurveyorPolygons += surveyorFeatures[cfg.id].length;
    }
  });

  if (totalSurveyorPolygons === 0) {
    totalSurveyorPolygons = DEFAULT_TOTAL_POLYGONS;
  }

  return totalSurveyorPolygons * MULTIPLIER_TARGET;
}

// =============================================================================
// 3. INISIALISASI GRAFIK (CHART.JS)
// =============================================================================
const ctxDonut = document.getElementById('donutSampleChart').getContext('2d');
const donutChart = new Chart(ctxDonut, {
  type: 'doughnut',
  data: {
    labels: ['Tercapai', 'Sisa Target'],
    datasets: [{ data: [0, currentTargetTotal], backgroundColor: ['#10b981', '#1e293b'], borderWidth: 0 }]
  },
  options: { responsive: true, maintainAspectRatio: false, cutout: '76%', plugins: { legend: { display: false } } }
});

const ctxBar = document.getElementById('barDailyChart').getContext('2d');
const barChart = new Chart(ctxBar, {
  type: 'bar',
  data: {
    labels: [],
    datasets: [{
      label: 'Titik Sampel',
      data: [],
      backgroundColor: '#3b82f6',
      borderRadius: 6,
      maxBarThickness: 34,
      barPercentage: 0.55,
      categoryPercentage: 0.6
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#f8fafc',
        bodyColor: '#93c5fd',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 8,
        displayColors: false,
        callbacks: {
          label: (context) => ` ${context.parsed.y} Titik Sampel`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8', font: { size: 10, weight: '600' } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.06)' },
        ticks: { color: '#94a3b8', font: { size: 10 }, precision: 0 },
        beginAtZero: true
      }
    }
  }
});

// =============================================================================
// 4. INTEGRASI GOOGLE SHEETS
// =============================================================================
const GOOGLE_SHEETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/16z3aC19TnVpV_s5BdYuClw0_hlGMw34j84u90qtO4K4/export?format=csv';

function fetchGoogleSheetsData() {
  Papa.parse(GOOGLE_SHEETS_CSV_URL, {
    download: true,
    header: true,
    complete: function (results) {
      console.log("✅ Data Google Sheets Berhasil Ditarik:", results.data);

      sheetsData = [];

      results.data.forEach((row, index) => {
        let surveyorName = row['Nama Surveyor'] || row['nama'] || row['Surveyor'];
        const notes = row['Keluh Kesah'] || row['Catatan'] || row['Kendala'];
        const timestamp = row['Timestamp'] || row['Waktu'];

        let jumlahTitikText = row['Jumlah titik sampel'] || row['Jumlah Titik Sampel'] || row['Jumlah Titik'];
        let jumlahTitik = parseInt(jumlahTitikText);
        if (isNaN(jumlahTitik)) jumlahTitik = 0;

        if (surveyorName) {
          surveyorName = surveyorName.trim();
          const lowerName = surveyorName.toLowerCase();
          if (SURVEYOR_MAPPING[lowerName]) {
            surveyorName = SURVEYOR_MAPPING[lowerName];
          }

          sheetsData.push({
            id: index,
            surveyor: surveyorName,
            zone: row['Wilayah'] || row['Zona'] || 'Purbalingga',
            priority: row['Tingkat Kendala'] || 'Info',
            time: timestamp || 'Baru saja',
            text: notes || '',
            points: jumlahTitik,
            rawDate: timestamp ? timestamp.split(' ')[0] : null
          });
        }
      });

      sheetsData.reverse();

      populateSurveyorFilter();
      applySortAndFilter();

      // Update waktu sinkronisasi terakhir di footer
      const now = new Date();
      const timeString = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateString = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

      const elLastUpdate = document.getElementById('last-update-time');
      if (elLastUpdate) {
        elLastUpdate.innerText = `${dateString} | ${timeString}`;
      }
    },
    error: function (error) {
      console.error("❌ Gagal menarik data Google Sheets:", error);
    }
  });
}

fetchGoogleSheetsData();
setInterval(fetchGoogleSheetsData, 30000); // Auto update 30 detik

// =============================================================================
// 5. INISIALISASI PETA LEAFLET & BASEMAPS
// =============================================================================
const mapCenter = [-7.3880, 109.3639]; // Pusat Kabupaten Purbalingga
const defaultZoom = 11;

const map = L.map('leaflet-map', { center: mapCenter, zoom: defaultZoom, zoomControl: false });
L.control.zoom({ position: 'bottomleft' }).addTo(map);

const basemaps = {
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' })
};

let currentBasemap = basemaps.osm;
currentBasemap.addTo(map);

// Grup layer di peta
const aplLayerGroup = L.layerGroup().addTo(map);        // Layer Utama APL
const polygonLayerGroup = L.layerGroup().addTo(map);    // Layer Wilayah Surveyor

// =============================================================================
// 6. PEMUATAN PETA UTAMA APL.GEOJSON & 4 BERKAS SURVEYOR
// =============================================================================
async function loadAllGeoJsonData() {
  console.log("📡 Memuat Peta Utama (APL.geojson) secara default...");
  aplLayerGroup.clearLayers();
  polygonLayerGroup.clearLayers();
  allZntTotalCount = 0;

  // ---------------------------------------------------------------------------
  // A. PETA UTAMA DEFAULT: APL.geojson
  // ---------------------------------------------------------------------------
  try {
    const aplResp = await fetch(APL_CONFIG.file);
    if (aplResp.ok) {
      let aplData = await aplResp.json();
      aplData = reprojectGeoJson(aplData);
      aplFeaturesCount = (aplData.features || []).length;

      aplLayer = L.geoJSON(aplData, {
        style: {
          color: APL_CONFIG.color,
          weight: 2.5,
          opacity: 0.95,
          fillColor: APL_CONFIG.fillColor,
          fillOpacity: 0.35
        },
        onEachFeature: function (feature, layer) {
          const p = feature.properties || {};
          const luasText = p.Luas ? `${Number(p.Luas).toLocaleString('id-ID')} m²` : (p.Shape_Area ? `${Math.round(p.Shape_Area).toLocaleString('id-ID')} m²` : '-');

          layer.bindTooltip('<strong>Kawasan APL</strong> (Area Penggunaan Lain)', { sticky: true });

          layer.bindPopup(`
            <div class="znt-popup">
              <div class="znt-popup-header" style="border-left: 4px solid ${APL_CONFIG.color};">
                <span class="znt-popup-title">Peta Utama: Kawasan APL</span>
              </div>
              <div style="font-size:0.75rem; margin-top:6px; display:flex; flex-direction:column; gap:4px;">
                <div><strong>Kawasan:</strong> Area Penggunaan Lain (APL)</div>
                <div><strong>Status:</strong> Peta Interaktif Default</div>
                <div><strong>Berkas:</strong> <code>${APL_CONFIG.file}</code></div>
                <div><strong>Luas Area:</strong> ${luasText}</div>
              </div>
            </div>
          `);

          layer.on('mouseover', function () {
            this.setStyle({ weight: 4, fillOpacity: 0.55 });
          });
          layer.on('mouseout', function () {
            this.setStyle({ weight: 2.5, fillOpacity: 0.35 });
          });
        }
      });

      aplLayer.addTo(aplLayerGroup);
      console.log(`✅ Peta Utama ${APL_CONFIG.file} berhasil dimuat & ditampilkan secara default.`);

      // Fokuskan peta ke batas wilayah utama APL
      try {
        map.fitBounds(aplLayer.getBounds(), { padding: [25, 25] });
      } catch (e) { }

      const statTotalZona = document.getElementById('stat-total-zona');
      if (statTotalZona) {
        statTotalZona.innerText = aplFeaturesCount;
      }

      // Terapkan tampilan default APL.geojson ke peta interaktif
      applySortAndFilter();
    }
  } catch (err) {
    console.warn(`Gagal memuat ${APL_CONFIG.file}:`, err);
  }

  // ---------------------------------------------------------------------------
  // B. BERKAS SURVEYOR: DIMUAT SECARA PARALEL DI LATAR BELAKANG
  // ---------------------------------------------------------------------------
  await Promise.all(SURVEYOR_CONFIGS.map(async (cfg) => {
    try {
      const resp = await fetch(cfg.file);
      if (!resp.ok) return;

      let geojsonData = await resp.json();
      geojsonData = reprojectGeoJson(geojsonData);

      const features = geojsonData.features || [];
      surveyorFeatures[cfg.id] = features;
      surveyorFeatures[cfg.name] = features;
      allZntTotalCount += features.length;

      const layer = L.geoJSON(geojsonData, {
        style: function () {
          const survPts = getSurveyorPoints(cfg);
          const survTgt = calculateTargetPoints(cfg);
          const survPct = survTgt > 0 ? (survPts / survTgt) * 100 : 0;
          const progFillColor = getInterpolatedProgressColor(survPct);

          return {
            color: cfg.color,
            weight: 2.2,
            opacity: 0.95,
            fillColor: progFillColor,
            fillOpacity: 0.45
          };
        },
        onEachFeature: function (feature, l) {
          const props = feature.properties || {};
          const zoneTitle = props.HISTZONE ? `Zona ${props.HISTZONE}` : (props.NOZN ? `Zona ${props.NOZN}` : `Zona ZNT`);
          const landUse = props.PENGGUNAAN || 'Umum';
          const luas = props.Luas_M2 ? `${(props.Luas_M2 / 10000).toFixed(2)} Ha (${Math.round(props.Luas_M2).toLocaleString('id-ID')} m²)` : (props.Luas_Ha ? `${props.Luas_Ha.toFixed(2)} Ha` : '-');

          l.bindPopup(function () {
            const survPts = getSurveyorPoints(cfg);
            const survTgt = calculateTargetPoints(cfg);
            const survPct = survTgt > 0 ? (survPts / survTgt) * 100 : 0;
            const solidColor = getProgressColor(survPct);
            const statusLabel = survPct >= 75 ? 'Tercapai' : (survPct >= 25 ? 'Sedang' : 'Rendah');

            return `
              <div class="znt-popup">
                <div class="znt-popup-header" style="border-left: 4px solid ${cfg.color};">
                  <span class="znt-popup-title">${zoneTitle}</span>
                  <span class="znt-badge" style="background:${solidColor}; color:#fff;">${statusLabel}</span>
                </div>
                <div style="font-size:0.75rem; margin-top:6px; display:flex; flex-direction:column; gap:4px;">
                  <div><strong>Surveyor:</strong> ${cfg.name}</div>
                  <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.06); padding:3px 6px; border-radius:4px; margin:2px 0;">
                    <span><strong>Progres Titik:</strong></span>
                    <span style="color:${solidColor}; font-weight:700;">${survPts} / ${survTgt} (${survPct.toFixed(1)}%)</span>
                  </div>
                  <div><strong>Penggunaan:</strong> ${landUse}</div>
                  <div><strong>Luas Zona:</strong> ${luas}</div>
                  <div><strong>Berkas:</strong> <code>${cfg.file}</code></div>
                  ${props.NILAIZN ? `<div><strong>Nilai ZNT:</strong> Rp ${Number(props.NILAIZN).toLocaleString('id-ID')}</div>` : ''}
                </div>
              </div>
            `;
          });

          l.on('mouseover', function () {
            this.setStyle({ weight: 4, fillOpacity: 0.70 });
          });
          l.on('mouseout', function () {
            const survPts = getSurveyorPoints(cfg);
            const survTgt = calculateTargetPoints(cfg);
            const survPct = survTgt > 0 ? (survPts / survTgt) * 100 : 0;
            const progFillColor = getInterpolatedProgressColor(survPct);
            this.setStyle({ weight: 2.2, fillColor: progFillColor, fillOpacity: 0.45 });
          });
        }
      });

      // Simpan layer untuk dipanggil secara dinamis di backend saat surveyor diklik
      surveyorLayers[cfg.id] = layer;
      surveyorLayers[cfg.name] = layer;

      console.log(`✅ [Backend] ${cfg.name} (${cfg.file}) siap di backend (${features.length} zona).`);
    } catch (err) {
      console.warn(`Gagal memuat ${cfg.file}:`, err);
    }
  }));

  populateSurveyorFilter();
  applySortAndFilter();
}

loadAllGeoJsonData();

// =============================================================================
// 7. DROPDOWN PENGISI DATA SURVEYOR (TAMPILAN BERSIH TANPA NAMA FILE)
// =============================================================================
function populateSurveyorFilter() {
  const select = document.getElementById('sort-surveyor');
  if (!select) return;
  const currentVal = select.value;

  select.innerHTML = '<option value="default">Semua Surveyor</option>';

  SURVEYOR_CONFIGS.forEach(cfg => {
    const opt = document.createElement('option');
    opt.value = cfg.name;
    opt.textContent = cfg.name;
    select.appendChild(opt);
  });

  if (currentVal && currentVal !== 'default') {
    const matched = findSurveyorConfig(currentVal);
    if (matched) {
      select.value = matched.name;
    }
  }
}

// =============================================================================
// 8. SINKRONISASI FILTER -> HUBUNGKAN LAYER BERKAS, GRAFIK & PETA
// =============================================================================
const selectSortSurveyor = document.getElementById('sort-surveyor');
const btnResetFilters = document.getElementById('btn-reset-filters');

function applySortAndFilter() {
  const surVal = selectSortSurveyor ? selectSortSurveyor.value : 'default';
  const matchedCfg = findSurveyorConfig(surVal);

  // Copy semua data dari Google Sheets
  let filteredList = [...sheetsData];

  // A. TERAPKAN FILTER KE DATA SPREADSHEET
  if (matchedCfg) {
    filteredList = filteredList.filter(item => {
      const itemSurveyor = (item.surveyor || '').toLowerCase();
      return itemSurveyor.includes(matchedCfg.name.toLowerCase()) ||
        matchedCfg.aliases.some(a => itemSurveyor.includes(a));
    });
  }

  // B. KONTROL TAMPILAN PETA INTERAKTIF & HUBUNGKAN BERKAS GEOJSON
  const statTotalZona = document.getElementById('stat-total-zona');
  const sortStatusText = document.getElementById('sort-status-text');

  if (matchedCfg && surveyorLayers[matchedCfg.id]) {
    const activeLayer = surveyorLayers[matchedCfg.id];

    // 1. Bersihkan layer surveyor lain dari peta utama
    polygonLayerGroup.clearLayers();

    // 2. Tampilkan HANYA file geojson surveyor terpilih pada peta dengan warna gradasi progres titik
    polygonLayerGroup.addLayer(activeLayer);

    const survPts = getSurveyorPoints(matchedCfg);
    const survTgt = calculateTargetPoints(matchedCfg);
    const survPct = survTgt > 0 ? (survPts / survTgt) * 100 : 0;
    const progColor = getInterpolatedProgressColor(survPct);

    activeLayer.setStyle({
      color: matchedCfg.color,
      weight: 3,
      opacity: 1,
      fillColor: progColor,
      fillOpacity: 0.65
    });

    // 3. Zoom otomatis ke cakupan layer geojson surveyor tersebut
    try {
      map.fitBounds(activeLayer.getBounds(), { padding: [35, 35] });
    } catch (e) { }

    // 4. Update counter total zona spesifik untuk surveyor tersebut
    const featCount = surveyorFeatures[matchedCfg.id] ? surveyorFeatures[matchedCfg.id].length : 0;
    if (statTotalZona) {
      statTotalZona.innerText = featCount;
    }

    // 5. Update status indicator teks (tanpa nama file geojson)
    if (sortStatusText) {
      sortStatusText.innerHTML = `<i class="fa-solid fa-user-check" style="color:${matchedCfg.color}"></i> Surveyor: <strong>${matchedCfg.name}</strong> &bull; (${featCount} zona)`;
    }

  } else {
    // DEFAULT (SEMUA SURVEYOR): TAMPILKAN SEMUA FILE DENGAN WARNA GRADASI PROGRES TITIK
    polygonLayerGroup.clearLayers();

    // Tambahkan kembali seluruh layer surveyor pada peta interaktif
    SURVEYOR_CONFIGS.forEach(cfg => {
      const lyr = surveyorLayers[cfg.id];
      if (lyr) {
        const survPts = getSurveyorPoints(cfg);
        const survTgt = calculateTargetPoints(cfg);
        const survPct = survTgt > 0 ? (survPts / survTgt) * 100 : 0;
        const progColor = getInterpolatedProgressColor(survPct);

        lyr.setStyle({
          color: cfg.color,
          weight: 2,
          opacity: 0.95,
          fillColor: progColor,
          fillOpacity: 0.45
        });
        polygonLayerGroup.addLayer(lyr);
      }
    });

    // Peta utama APL selalu aktif sebagai batas kawasan
    if (aplLayer) {
      if (!aplLayerGroup.hasLayer(aplLayer)) {
        aplLayerGroup.addLayer(aplLayer);
      }
      try {
        map.fitBounds(aplLayer.getBounds(), { padding: [25, 25] });
      } catch (e) {
        map.setView(mapCenter, defaultZoom);
      }
    } else {
      map.setView(mapCenter, defaultZoom);
    }
    map.closePopup();

    if (statTotalZona) {
      statTotalZona.innerText = allZntTotalCount || aplFeaturesCount || 3;
    }

    if (sortStatusText) {
      sortStatusText.innerHTML = `<i class="fa-solid fa-map" style="color:#0891b2"></i> Wilayah: <strong>Semua Surveyor & APL</strong> &bull; (${allZntTotalCount} total zona)`;
    }
  }

  // C. HITUNG ULANG ANGKA BERDASARKAN HASIL FILTER
  let calculatedPoints = 0;
  const dailyCounts = {};

  filteredList.forEach(item => {
    calculatedPoints += item.points;

    if (item.rawDate && item.points > 0) {
      dailyCounts[item.rawDate] = (dailyCounts[item.rawDate] || 0) + item.points;
    }
  });

  // D. HITUNG TARGET TITIK (JUMLAH POLYGON GEOJSON * 3) & UPDATE GRAFIK DONAT
  const targetPoints = calculateTargetPoints(matchedCfg);
  const sisaTarget = Math.max(0, targetPoints - calculatedPoints);
  const completionPct = targetPoints > 0 ? ((calculatedPoints / targetPoints) * 100).toFixed(1) : '0.0';

  donutChart.data.datasets[0].data = [calculatedPoints, sisaTarget];
  donutChart.update();

  const elementTargetPoints = document.getElementById('target-points');
  if (elementTargetPoints) {
    elementTargetPoints.innerText = targetPoints.toLocaleString('id-ID');
  }

  const elementAchieved = document.getElementById('achieved-points');
  const elementCenterDonut = document.querySelector('.donut-number');
  if (elementAchieved) elementAchieved.innerText = calculatedPoints.toLocaleString('id-ID');
  if (elementCenterDonut) elementCenterDonut.innerText = calculatedPoints.toLocaleString('id-ID');

  const elementDonutSub = document.querySelector('.donut-sub') || document.getElementById('donut-target-sub');
  if (elementDonutSub) {
    elementDonutSub.innerText = `/ ${targetPoints.toLocaleString('id-ID')}`;
  }

  const elementSampleBadge = document.querySelector('.sample-card .card-badge');
  if (elementSampleBadge) {
    elementSampleBadge.innerText = `${completionPct}%`;
  }

  // E. UPDATE GRAFIK BATANG HARIAN
  function parseDateKey(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
    const d = new Date(dateStr);
    return isNaN(d) ? null : d;
  }

  const sortedDates = Object.keys(dailyCounts).sort((a, b) => {
    const da = parseDateKey(a) || 0;
    const db = parseDateKey(b) || 0;
    return da - db;
  });
  const last7Dates = sortedDates.slice(-7);
  const chartLabels = [];
  const chartDataPoints = [];
  const namaBulanIndo = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  last7Dates.forEach(dateObj => {
    const d = parseDateKey(dateObj);
    let label = dateObj;
    if (d) {
      label = `${d.getDate()} ${namaBulanIndo[d.getMonth()]}`;
    }
    chartLabels.push(label);
    chartDataPoints.push(dailyCounts[dateObj]);
  });

  barChart.data.labels = chartLabels;
  barChart.data.datasets[0].data = chartDataPoints;
  barChart.update();

  // Update Legenda Donat Dinamis
  const elDonutAchieved = document.getElementById('donut-legend-achieved');
  const elDonutRemaining = document.getElementById('donut-legend-remaining');
  if (elDonutAchieved) elDonutAchieved.innerText = calculatedPoints.toLocaleString('id-ID');
  if (elDonutRemaining) elDonutRemaining.innerText = sisaTarget.toLocaleString('id-ID');

  // F. TAMPILKAN PANEL HAMBATAN
  const complaintsOnly = filteredList.filter(item => item.text.trim() !== '');
  renderComplaints(complaintsOnly);

  // G. PERBARUI LEGENDA PETA MENGIKUTI PROGRES TITIK (GRADASI MERAH SAMPAI HIJAU)
  updateMapLegendAndStatus(matchedCfg, calculatedPoints, targetPoints);
}

// =============================================================================
// PEMBARUAN LEGENDA PETA MENGIKUTI PROGRES TITIK (SKEMA GRADASI MERAH - HIJAU)
// =============================================================================
function updateMapLegendAndStatus(matchedCfg, currentCalculatedPoints, currentTargetPoints) {
  const overallTarget = calculateTargetPoints(null);
  const displayPoints = currentCalculatedPoints;
  const displayTarget = currentTargetPoints > 0 ? currentTargetPoints : overallTarget;
  const displayPct = displayTarget > 0 ? (displayPoints / displayTarget) * 100 : 0;

  // 1. Update Posisi Pointer Gradasi & Badge Persentase
  const elPointer = document.getElementById('legend-progress-pointer');
  if (elPointer) {
    elPointer.style.left = `${Math.min(100, Math.max(0, displayPct))}%`;
    elPointer.setAttribute('title', `Progres Capaian Titik: ${displayPct.toFixed(1)}%`);
  }

  const elBadgeTotal = document.getElementById('legend-total-pct');
  if (elBadgeTotal) {
    elBadgeTotal.innerText = `${displayPct.toFixed(1)}%`;
    const badgeColor = getInterpolatedProgressColor(displayPct);
    elBadgeTotal.style.background = `${badgeColor}25`;
    elBadgeTotal.style.borderColor = `${badgeColor}60`;
    elBadgeTotal.style.color = badgeColor;
  }

  // 2. Kategori Status Progres Titik per Surveyor
  let countLow = 0, countMid = 0, countHigh = 0;
  const surveyorStats = SURVEYOR_CONFIGS.map(cfg => {
    const pts = getSurveyorPoints(cfg);
    const tgt = calculateTargetPoints(cfg);
    const pct = tgt > 0 ? (pts / tgt) * 100 : 0;
    const progressColor = getInterpolatedProgressColor(pct);
    const solidColor = getProgressColor(pct);

    let statusLabel = 'Rendah';
    if (pct >= 75) {
      statusLabel = 'Tercapai';
      countHigh++;
    } else if (pct >= 25) {
      statusLabel = 'Sedang';
      countMid++;
    } else {
      statusLabel = 'Rendah';
      countLow++;
    }

    return {
      cfg,
      pts,
      tgt,
      pct,
      progressColor,
      solidColor,
      statusLabel
    };
  });

  // 3. Update Daftar Surveyor di Legenda
  const survListContainer = document.getElementById('legend-surveyor-list');
  if (survListContainer) {
    survListContainer.innerHTML = '';
    surveyorStats.forEach(item => {
      const isSelected = matchedCfg && matchedCfg.id === item.cfg.id;
      const row = document.createElement('div');
      row.className = `legend-surveyor-row ${isSelected ? 'active' : ''}`;
      row.setAttribute('data-surveyor', item.cfg.name);
      row.title = `Klik untuk fokus wilayah ${item.cfg.name} (${item.pts}/${item.tgt} Titik)`;

      row.innerHTML = `
        <div class="legend-surv-top">
          <div class="legend-surv-name-group">
            <span class="swatch-dot" style="background-color:${item.solidColor}; box-shadow: 0 0 6px ${item.solidColor};"></span>
            <span>${item.cfg.name}</span>
          </div>
          <span class="legend-surv-badge" style="background:${item.solidColor}25; color:${item.solidColor}; border:1px solid ${item.solidColor}50;">
            ${item.pct.toFixed(1)}%
          </span>
        </div>
        <div class="legend-surv-bar-track">
          <div class="legend-surv-bar-fill" style="width: ${Math.max(3, Math.min(100, item.pct))}%; background: ${item.solidColor};"></div>
        </div>
        <div class="legend-surv-details">
          <span><strong style="color:#f8fafc;">${item.pts}</strong> / ${item.tgt} Titik</span>
          <span style="color:${item.solidColor}; font-weight:600;">${item.statusLabel}</span>
        </div>
      `;

      survListContainer.appendChild(row);
    });
  }

  // 5. Update Footer Legenda
  const elFooterAchieved = document.getElementById('legend-footer-achieved');
  const elFooterTarget = document.getElementById('legend-footer-target');
  const elFooterPct = document.getElementById('legend-footer-pct');
  if (elFooterAchieved) elFooterAchieved.innerText = displayPoints.toLocaleString('id-ID');
  if (elFooterTarget) elFooterTarget.innerText = displayTarget.toLocaleString('id-ID');
  if (elFooterPct) elFooterPct.innerText = `${displayPct.toFixed(1)}%`;

  // 6. Sinkronisasi Kartu Sidebar STATUS ZONA KAJIAN
  const elZonePct = document.getElementById('zone-completion-pct');
  if (elZonePct) {
    elZonePct.innerText = `${displayPct.toFixed(1)}%`;
    const col = getInterpolatedProgressColor(displayPct);
    elZonePct.style.color = col;
    elZonePct.style.borderColor = `${col}60`;
    elZonePct.style.background = `${col}20`;
  }

  // Zona Selesai dihitung dari jumlah titik sampel dibagi 3 (dibulatkan ke bawah)
  const zonaSelesai = Math.floor(displayPoints / 3);

  const elStatSelesai = document.getElementById('stat-zona-selesai');
  if (elStatSelesai) {
    elStatSelesai.innerText = zonaSelesai.toLocaleString('id-ID');
    elStatSelesai.setAttribute('title', `${displayPoints} Titik ÷ 3 = ${(displayPoints / 3).toFixed(2)} (Dibulatkan ke bawah: ${zonaSelesai} Zona)`);
  }

  // Progress bar progres zona selesai (0 - 100%)
  const segDone = document.getElementById('prog-seg-done');
  if (segDone) {
    segDone.style.width = `${Math.min(100, Math.max(0, displayPct))}%`;
  }

  // 7. Update Badge Navigasi Mobile
  const elMobileBadge = document.getElementById('mobile-nav-points-badge');
  if (elMobileBadge) {
    elMobileBadge.innerText = `${displayPoints} Titik`;
  }
}

function renderComplaints(list) {
  const container = document.getElementById('complaints-list');
  if (!container) return;
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `<div style="padding: 18px; text-align: center; color: var(--text-muted); font-size: 0.72rem;">Belum ada hambatan terkait filter ini.</div>`;
    setTimeout(() => { if (map) map.invalidateSize(); }, 300);
    return;
  }

  list.forEach(item => {
    const card = document.createElement('div');
    card.className = 'complaint-item';
    const priorityClass = item.priority === 'Tinggi' ? 'high' : item.priority === 'Sedang' ? 'medium' : 'info';

    card.innerHTML = `
      <div class="complaint-header">
        <span class="surveyor-name"><i class="fa-regular fa-user"></i> ${item.surveyor}</span>
        <span class="priority-tag ${priorityClass}">${item.priority}</span>
      </div>
      <div class="complaint-meta">
        <span><i class="fa-solid fa-map-location-dot"></i> ${item.zone}</span>
        <span>&bull;</span>
        <span><i class="fa-regular fa-clock"></i> ${item.time}</span>
      </div>
      <div class="complaint-text">${item.text}</div>
    `;
    container.appendChild(card);
  });

  setTimeout(() => { if (map) map.invalidateSize(); }, 300);
}

window.filterBySurveyor = function(name) {
  if (selectSortSurveyor) {
    selectSortSurveyor.value = name || 'default';
    applySortAndFilter();
  }
};

if (selectSortSurveyor) {
  selectSortSurveyor.addEventListener('change', applySortAndFilter);
  selectSortSurveyor.addEventListener('input', applySortAndFilter);
}

// Delegasi klik elemen legenda [data-surveyor] langsung ke filter peta
document.addEventListener('click', (e) => {
  const targetRow = e.target.closest('[data-surveyor]');
  if (targetRow && targetRow.closest('#map-legend')) {
    const surveyor = targetRow.getAttribute('data-surveyor');
    if (surveyor) {
      window.filterBySurveyor(surveyor);
    }
  }
});

if (btnResetFilters) {
  btnResetFilters.addEventListener('click', () => {
    if (selectSortSurveyor) selectSortSurveyor.value = 'default';
    applySortAndFilter();
  });
}

// =============================================================================
// 9. UI INTERACTION (TOMBOL-TOMBOL PETA)
// =============================================================================
const btnBasemapToggle = document.getElementById('btn-basemap-toggle');
const basemapMenu = document.getElementById('basemap-menu');

if (btnBasemapToggle && basemapMenu) {
  btnBasemapToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    basemapMenu.classList.toggle('show');
  });

  document.querySelectorAll('.basemap-option').forEach(option => {
    option.addEventListener('click', () => {
      const layerKey = option.getAttribute('data-layer');
      if (basemaps[layerKey]) {
        map.removeLayer(currentBasemap);
        currentBasemap = basemaps[layerKey];
        currentBasemap.addTo(map);
        aplLayerGroup.bringToFront();
        polygonLayerGroup.bringToFront();

        document.querySelectorAll('.basemap-option').forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        basemapMenu.classList.remove('show');
      }
    });
  });
}

const btnResetZoom = document.getElementById('btn-reset-zoom');
if (btnResetZoom) {
  btnResetZoom.addEventListener('click', () => {
    if (aplLayer) {
      try {
        map.fitBounds(aplLayer.getBounds(), { padding: [25, 25] });
      } catch (e) {
        map.setView(mapCenter, defaultZoom);
      }
    } else {
      map.setView(mapCenter, defaultZoom);
    }
  });
}

const togglePolygonsBtn = document.getElementById('toggle-polygons');
let polygonsVisible = true;
if (togglePolygonsBtn) {
  togglePolygonsBtn.addEventListener('click', () => {
    polygonsVisible = !polygonsVisible;
    if (polygonsVisible) {
      map.addLayer(aplLayerGroup);
      map.addLayer(polygonLayerGroup);
      togglePolygonsBtn.classList.add('active');
    } else {
      map.removeLayer(aplLayerGroup);
      map.removeLayer(polygonLayerGroup);
      togglePolygonsBtn.classList.remove('active');
    }
  });
}

const legendToggleBtn = document.getElementById('legend-toggle-btn');
const mapLegendCard = document.getElementById('map-legend');
if (legendToggleBtn && mapLegendCard) {
  legendToggleBtn.addEventListener('click', () => {
    mapLegendCard.classList.toggle('collapsed');
  });
}

// =============================================================================
// 10. KONTROL TAMPILAN ADAPTIF & NAVIGASI MULTI-LAYAR (RESPONSIVE)
// =============================================================================
const appContainer = document.querySelector('.app-container');
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const mobileSegButtons = document.querySelectorAll('.m-seg-btn');
const btnMobileViewMap = document.getElementById('btn-mobile-view-map');
const btnMobileViewDash = document.getElementById('btn-mobile-view-dash');

function setMobileView(viewName) {
  if (!appContainer) return;
  appContainer.setAttribute('data-mobile-view', viewName);

  mobileSegButtons.forEach(btn => {
    if (btn.getAttribute('data-view') === viewName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Segarkan ukuran peta Leaflet setelah render transisi
  setTimeout(() => {
    if (map) {
      map.invalidateSize();
      if (aplLayer && viewName !== 'data') {
        try {
          map.fitBounds(aplLayer.getBounds(), { padding: [15, 15] });
        } catch (e) { }
      }
    }
  }, 160);
}

mobileSegButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetView = btn.getAttribute('data-view');
    if (targetView) setMobileView(targetView);
  });
});

// Tombol pintas tambahan jika ada
if (btnMobileViewMap) btnMobileViewMap.addEventListener('click', () => setMobileView('map'));
if (btnMobileViewDash) btnMobileViewDash.addEventListener('click', () => setMobileView('data'));

// Inisialisasi awal tampilan mobile / desktop
function initResponsiveLayout() {
  if (window.innerWidth <= 768) {
    if (!appContainer.getAttribute('data-mobile-view')) {
      appContainer.setAttribute('data-mobile-view', 'split');
    }
    // Perkecil legenda secara default di layar HP agar tidak menghalangi peta
    if (mapLegendCard && !mapLegendCard.classList.contains('collapsed')) {
      mapLegendCard.classList.add('collapsed');
    }
  } else {
    if (appContainer) {
      appContainer.removeAttribute('data-mobile-view');
    }
  }
  if (map) {
    setTimeout(() => map.invalidateSize(), 200);
  }
}

initResponsiveLayout();

// Tombol sembunyikan/tampilkan sidebar desktop
if (btnToggleSidebar) {
  btnToggleSidebar.addEventListener('click', () => {
    if (!appContainer) return;
    const isCollapsed = appContainer.classList.toggle('sidebar-collapsed');
    const icon = btnToggleSidebar.querySelector('i');
    if (icon) {
      if (isCollapsed) {
        icon.className = 'fa-solid fa-arrow-right';
        btnToggleSidebar.setAttribute('title', 'Tampilkan Panel Sidebar');
      } else {
        icon.className = 'fa-solid fa-bars-staggered';
        btnToggleSidebar.setAttribute('title', 'Sembunyikan Panel Sidebar');
      }
    }
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 360);
  });
}

// Event resize layar & rotasi HP (Landscape / Portrait)
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    initResponsiveLayout();
  }, 150);
});