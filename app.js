/**
 * Dashboard ZNT (Zona Nilai Tanah) - Jateng1.geojson Interactive Engine
 * Leaflet.js Map + Chart.js Visualizations + Google Sheets Real-Time Sync & Cross-Filtering
 */

// =============================================================================
// 1. METADATA ZONA KAJIAN (JATENG1.GEOJSON)
// =============================================================================
const JATENG_ZONES_META = {
  "33.02": { name: "Kab. Banyumas", shortName: "Banyumas", status: "selesai" },
  "33.03": { name: "Kab. Purbalingga", shortName: "Purbalingga", status: "selesai" },
  "33.26": { name: "Kab. Pekalongan", shortName: "Pekalongan", status: "selesai" },
  "33.27": { name: "Kab. Pemalang", shortName: "Pemalang", status: "proses" },
  "33.29": { name: "Kab. Brebes", shortName: "Brebes", status: "proses" }
};

// Variabel Global Data
let sheetsData = []; // Menyimpan SEMUA data mentah dari spreadsheet
let currentGeoJsonData = null;
const TARGET_TOTAL = 500; // Target total titik sampel

// =============================================================================
// 2. INISIALISASI GRAFIK (CHART.JS)
// =============================================================================
const ctxDonut = document.getElementById('donutSampleChart').getContext('2d');
const donutChart = new Chart(ctxDonut, {
  type: 'doughnut',
  data: {
    labels: ['Tercapai', 'Sisa Target'],
    datasets: [{ data: [0, TARGET_TOTAL], backgroundColor: ['#10b981', '#1e293b'], borderWidth: 0 }]
  },
  options: { responsive: true, maintainAspectRatio: false, cutout: '76%', plugins: { legend: { display: false } } }
});

const ctxBar = document.getElementById('barDailyChart').getContext('2d');
const barChart = new Chart(ctxBar, {
  type: 'bar',
  data: {
    labels: [],
    datasets: [{ label: 'Titik Sampel', data: [], backgroundColor: '#3b82f6', borderRadius: 4 }]
  },
  options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
});

// =============================================================================
// 3. INTEGRASI GOOGLE SHEETS 
// =============================================================================
const GOOGLE_SHEETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/16z3aC19TnVpV_s5BdYuClw0_hlGMw34j84u90qtO4K4/export?format=csv';

function fetchGoogleSheetsData() {
  Papa.parse(GOOGLE_SHEETS_CSV_URL, {
    download: true,
    header: true,
    complete: function (results) {
      console.log("✅ Data Google Sheets Berhasil Ditarik:", results.data);

      sheetsData = []; // Kosongkan data lama

      results.data.forEach((row, index) => {
        const surveyorName = row['Nama Surveyor'] || row['nama'] || row['Surveyor'];
        const notes = row['Keluh Kesah'] || row['Catatan'] || row['Kendala'];
        const timestamp = row['Timestamp'] || row['Waktu'];

        let jumlahTitikText = row['Jumlah titik sampel'] || row['Jumlah Titik Sampel'] || row['Jumlah Titik'];
        let jumlahTitik = parseInt(jumlahTitikText);
        if (isNaN(jumlahTitik)) jumlahTitik = 0;

        if (surveyorName) {
          // Masukkan SEMUA baris ke database internal agar bisa difilter
          sheetsData.push({
            id: index,
            surveyor: surveyorName,
            zone: row['Wilayah'] || row['Zona'] || 'Tidak Diketahui',
            priority: row['Tingkat Kendala'] || 'Info',
            time: timestamp || 'Baru saja',
            text: notes || '',
            points: jumlahTitik,
            rawDate: timestamp ? timestamp.split(' ')[0] : null
          });
        }
      });

      // Balik urutan agar data terbaru berada di atas
      sheetsData.reverse();

      // Panggil fungsi filter (fungsi ini yang akan mengupdate grafik & UI)
      applySortAndFilter();

      // --- UPDATE WAKTU SINKRONISASI TERAKHIR DI FOOTER ---
      const now = new Date();
      // Format jam (misal: 14:30:05)
      const timeString = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      // Format tanggal (misal: 16 Sep 2026)
      const dateString = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

      const elLastUpdate = document.getElementById('last-update-time');
      if (elLastUpdate) {
        elLastUpdate.innerText = `${dateString} | ${timeString}`;
      }
      // ---------------------------------------------------------
    },
    error: function (error) {
      console.error("❌ Gagal menarik data:", error);
    }
  });
}

fetchGoogleSheetsData();
setInterval(fetchGoogleSheetsData, 30000); // Auto update 30 detik

// =============================================================================
// 4. INISIALISASI PETA LEAFLET & BASEMAPS
// =============================================================================
const mapCenter = [-7.2000, 109.3000];
const defaultZoom = 9;

const map = L.map('leaflet-map', { center: mapCenter, zoom: defaultZoom, zoomControl: false });
L.control.zoom({ position: 'bottomleft' }).addTo(map);

const basemaps = {
  osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' })
};

let currentBasemap = basemaps.osm;
currentBasemap.addTo(map);

const polygonLayerGroup = L.layerGroup().addTo(map);
const zoneLayerMap = {};

function getZoneColor(status) {
  switch (status) {
    case 'selesai': return '#10b981';
    case 'proses': return '#eab308';
    default: return '#ef4444';
  }
}

function renderGeoJsonPolygons(geojsonData) {
  polygonLayerGroup.clearLayers();

  const geoJsonLayer = L.geoJSON(geojsonData, {
    style: function (feature) {
      const code = feature.properties.KDPKAB;
      const meta = JATENG_ZONES_META[code] || { status: 'proses' };
      const color = getZoneColor(meta.status);
      return { color: color, weight: 2.5, opacity: 0.95, fillColor: color, fillOpacity: meta.status === 'selesai' ? 0.38 : 0.25 };
    },
    onEachFeature: function (feature, layer) {
      const code = feature.properties.KDPKAB;
      const meta = JATENG_ZONES_META[code] || { name: feature.properties.WADMKK, status: 'proses' };
      zoneLayerMap[code] = layer;

      layer.bindPopup(`
        <div class="znt-popup">
          <div class="znt-popup-header">
            <span class="znt-popup-title">${meta.name}</span>
          </div>
          <div>Status Wilayah: Masuk Tahap ${meta.status}</div>
        </div>
      `);
      layer.on('mouseover', function () { this.setStyle({ weight: 4, fillOpacity: 0.55 }); });
      layer.on('mouseout', function () { this.setStyle({ weight: 2.5, fillOpacity: meta.status === 'selesai' ? 0.38 : 0.25 }); });
    }
  });

  geoJsonLayer.addTo(polygonLayerGroup);
  try { map.fitBounds(geoJsonLayer.getBounds(), { padding: [20, 20] }); } catch (e) { }

  currentGeoJsonData = geojsonData;
  populateKabupatenFilter(geojsonData.features);
  populateSurveyorFilter(geojsonData.features);
}

if (window.JATENG_GEOJSON) renderGeoJsonPolygons(window.JATENG_GEOJSON);

// =============================================================================
// 5. DROPDOWN PENGISI DATA
// =============================================================================
function populateKabupatenFilter(features) {
  const select = document.getElementById('sort-kabupaten');
  if (!select) return;
  select.innerHTML = '<option value="all">Semua Kabupaten</option>';
  const unique = [];
  features.forEach(f => {
    const kName = f.properties && f.properties.WADMKK;
    if (kName && !unique.includes(kName.trim())) unique.push(kName.trim());
  });
  unique.sort().forEach(name => {
    const opt = document.createElement('option'); opt.value = name; opt.textContent = name; select.appendChild(opt);
  });
}

function populateSurveyorFilter(features) {
  const select = document.getElementById('sort-surveyor');
  if (!select) return;
  select.innerHTML = '<option value="default">Semua Surveyor</option>';
  const unique = [];
  features.forEach(f => {
    const sName = f.properties && (f.properties.surveyor || f.properties.SURVEYOR);
    if (sName && !unique.includes(sName.trim())) unique.push(sName.trim());
  });
  unique.sort().forEach(name => {
    const opt = document.createElement('option'); opt.value = name; opt.textContent = name; select.appendChild(opt);
  });
}

// =============================================================================
// 6. SINKRONISASI FILTER -> UPDATE GRAFIK & PETA & FEED
// =============================================================================
const selectSortKabupaten = document.getElementById('sort-kabupaten');
const selectSortSurveyor = document.getElementById('sort-surveyor');
const btnResetFilters = document.getElementById('btn-reset-filters');

function applySortAndFilter() {
  const kabVal = selectSortKabupaten ? selectSortKabupaten.value : 'all';
  const surVal = selectSortSurveyor ? selectSortSurveyor.value : 'default';

  // Copy semua data dari Google Sheets
  let filteredList = [...sheetsData];

  // A. TERAPKAN FILTER KE DATA
  if (kabVal !== 'all') filteredList = filteredList.filter(item => item.zone.toLowerCase().includes(kabVal.toLowerCase()));
  if (surVal !== 'default') filteredList = filteredList.filter(item => item.surveyor.toLowerCase().includes(surVal.toLowerCase()));

  // B. HITUNG ULANG ANGKA BERDASARKAN HASIL FILTER
  let calculatedPoints = 0;
  const dailyCounts = {};

  filteredList.forEach(item => {
    calculatedPoints += item.points; // Jumlahkan titik

    // Hitung harian
    if (item.rawDate && item.points > 0) {
      dailyCounts[item.rawDate] = (dailyCounts[item.rawDate] || 0) + item.points;
    }
  });

  // C. UPDATE GRAFIK DONAT
  const sisaTarget = Math.max(0, TARGET_TOTAL - calculatedPoints);
  donutChart.data.datasets[0].data = [calculatedPoints, sisaTarget];
  donutChart.update();

  const elementAchieved = document.getElementById('achieved-points');
  const elementCenterDonut = document.querySelector('.donut-number');
  if (elementAchieved) elementAchieved.innerText = calculatedPoints;
  if (elementCenterDonut) elementCenterDonut.innerText = calculatedPoints;

  // D. UPDATE GRAFIK BATANG HARIAN
  const sortedDates = Object.keys(dailyCounts).sort((a, b) => new Date(a) - new Date(b));
  const last7Dates = sortedDates.slice(-7);
  const chartLabels = [];
  const chartDataPoints = [];
  const namaHariIndo = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  last7Dates.forEach(dateObj => {
    const d = new Date(dateObj);
    const hari = isNaN(d) ? dateObj : namaHariIndo[d.getDay()];
    chartLabels.push(hari);
    chartDataPoints.push(dailyCounts[dateObj]);
  });

  barChart.data.labels = chartLabels;
  barChart.data.datasets[0].data = chartDataPoints;
  barChart.update();

  // E. ZOOM PETA OTOMATIS
  if (surVal !== 'default' && currentGeoJsonData && currentGeoJsonData.features) {
    const matchedFeature = currentGeoJsonData.features.find(f => {
      const s = (f.properties.surveyor || f.properties.SURVEYOR || '').toLowerCase();
      return s.includes(surVal.toLowerCase()) || surVal.toLowerCase().includes(s);
    });
    if (matchedFeature) {
      const code = matchedFeature.properties.KDPKAB;
      if (zoneLayerMap[code]) {
        map.fitBounds(zoneLayerMap[code].getBounds(), { padding: [30, 30] });
        zoneLayerMap[code].openPopup();
      }
    }
  } else if (kabVal !== 'all') {
    let matchedCode = null;
    if (currentGeoJsonData && currentGeoJsonData.features) {
      const matchedFeature = currentGeoJsonData.features.find(f => {
        const k = (f.properties && f.properties.WADMKK ? f.properties.WADMKK : '').toLowerCase();
        return k === kabVal.toLowerCase() || k.includes(kabVal.toLowerCase());
      });
      if (matchedFeature) matchedCode = matchedFeature.properties.KDPKAB;
    }
    if (!matchedCode) {
      matchedCode = Object.keys(JATENG_ZONES_META).find(code =>
        JATENG_ZONES_META[code].name.toLowerCase().includes(kabVal.toLowerCase())
      );
    }
    if (matchedCode && zoneLayerMap[matchedCode]) {
      map.fitBounds(zoneLayerMap[matchedCode].getBounds(), { padding: [30, 30] });
      zoneLayerMap[matchedCode].openPopup();
    }
  }

  // F. TAMPILKAN PANEL HAMBATAN (Saring baris yang teksnya kosong agar tidak jadi sampah visual)
  const complaintsOnly = filteredList.filter(item => item.text.trim() !== '');
  renderComplaints(complaintsOnly);
}

function renderComplaints(list) {
  const container = document.getElementById('complaints-list');
  if (!container) return;
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = `<div style="padding: 18px; text-align: center; color: var(--text-muted); font-size: 0.72rem;">Belum ada hambatan terkait filter ini.</div>`;
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
}

if (selectSortKabupaten) selectSortKabupaten.addEventListener('change', applySortAndFilter);
if (selectSortSurveyor) selectSortSurveyor.addEventListener('change', applySortAndFilter);

if (btnResetFilters) {
  btnResetFilters.addEventListener('click', () => {
    if (selectSortKabupaten) selectSortKabupaten.value = 'all';
    if (selectSortSurveyor) selectSortSurveyor.value = 'default';
    try {
      const group = L.featureGroup([polygonLayerGroup]);
      map.fitBounds(group.getBounds(), { padding: [20, 20] });
    } catch (e) {
      map.setView(mapCenter, defaultZoom);
    }
    applySortAndFilter();
  });
}

// =============================================================================
// 7. UI INTERACTION (TOMBOL-TOMBOL PETA)
// =============================================================================
const btnBasemapToggle = document.getElementById('btn-basemap-toggle');
const basemapMenu = document.getElementById('basemap-menu');

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
      polygonLayerGroup.bringToFront();

      document.querySelectorAll('.basemap-option').forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');
      basemapMenu.classList.remove('show');
    }
  });
});

document.getElementById('btn-reset-zoom').addEventListener('click', () => {
  try {
    const group = L.featureGroup([polygonLayerGroup]);
    map.fitBounds(group.getBounds(), { padding: [20, 20] });
  } catch (e) {
    map.setView(mapCenter, defaultZoom);
  }
});

const togglePolygonsBtn = document.getElementById('toggle-polygons');
let polygonsVisible = true;
togglePolygonsBtn.addEventListener('click', () => {
  polygonsVisible = !polygonsVisible;
  if (polygonsVisible) {
    map.addLayer(polygonLayerGroup);
    togglePolygonsBtn.classList.add('active');
  } else {
    map.removeLayer(polygonLayerGroup);
    togglePolygonsBtn.classList.remove('active');
  }
});

const legendToggleBtn = document.getElementById('legend-toggle-btn');
const mapLegendCard = document.getElementById('map-legend');
legendToggleBtn.addEventListener('click', () => {
  mapLegendCard.classList.toggle('collapsed');
});