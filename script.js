// script.js - Weather functionality using Open-Meteo API (no API key needed)
// Preserves all UI structure, only updates data in existing elements

// Weather code to condition and icon mapper (Open-Meteo WMO codes)
const weatherMap = {
  0: { condition: 'Clear sky', icon: '☀️', color: 'text-yellow-500' },
  1: { condition: 'Mainly clear', icon: '🌤️', color: 'text-yellow-400' },
  2: { condition: 'Partly cloudy', icon: '⛅', color: 'text-yellow-300' },
  3: { condition: 'Overcast', icon: '☁️', color: 'text-slate-400' },
  45: { condition: 'Fog', icon: '🌫️', color: 'text-slate-500' },
  48: { condition: 'Depositing rime fog', icon: '🌫️', color: 'text-slate-500' },
  51: { condition: 'Light drizzle', icon: '🌦️', color: 'text-blue-400' },
  53: { condition: 'Moderate drizzle', icon: '🌧️', color: 'text-blue-500' },
  55: { condition: 'Dense drizzle', icon: '🌧️', color: 'text-blue-600' },
  61: { condition: 'Slight rain', icon: '🌦️', color: 'text-blue-400' },
  63: { condition: 'Moderate rain', icon: '🌧️', color: 'text-blue-500' },
  65: { condition: 'Heavy rain', icon: '⛈️', color: 'text-blue-600' },
  71: { condition: 'Slight snow', icon: '🌨️', color: 'text-blue-300' },
  73: { condition: 'Moderate snow', icon: '❄️', color: 'text-blue-400' },
  75: { condition: 'Heavy snow', icon: '❄️', color: 'text-blue-500' },
  80: { condition: 'Slight rain showers', icon: '🌦️', color: 'text-blue-400' },
  81: { condition: 'Moderate rain showers', icon: '🌧️', color: 'text-blue-500' },
  82: { condition: 'Violent rain showers', icon: '⛈️', color: 'text-blue-600' },
  95: { condition: 'Thunderstorm', icon: '⛈️', color: 'text-purple-500' },
  96: { condition: 'Thunderstorm with hail', icon: '⛈️', color: 'text-purple-600' },
  99: { condition: 'Thunderstorm with heavy hail', icon: '⛈️', color: 'text-purple-700' },
  default: { condition: 'Unknown', icon: '🌤️', color: 'text-slate-500' }
};

// Get weather data for lat/lon
async function fetchWeather(lat, lon, timezone) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,weathercode&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=${timezone}&forecast_days=7`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Weather fetch failed');
  return await response.json();
}

// Search city for lat/lon
async function geocodeCity(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const response = await fetch(url);
  const data = await response.json();
  if (!data.results || data.results.length === 0) throw new Error('City not found');
  return data.results[0];
}

// Reverse geocode for location name (fallback for file:// CORS)
async function geocodeCityReverse(lat, lon) {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=en&format=json`;
    const response = await fetch(url);
    if (!response.ok) return { name: 'Current location' };
    const data = await response.json();
    return data;
  } catch (error) {
    console.warn('Reverse geocode failed (CORS?):', error);
    return { name: 'Current location' };
  }
}

// Update current weather section
function updateCurrent(data, timezone) {
  const section = document.querySelector('[data-purpose="current-weather"]');
  const tempEl = section.querySelector('h1');
  const iconSpan = section.querySelector('h1').parentElement.querySelector('svg');
  const conditionEl = section.querySelector('span.text-2xl');
  const humidityEl = section.querySelector('p.text-lg.font-semibold');
  const windEl = section.querySelectorAll('p.text-lg.font-semibold')[1];

  const code = (data.current_weather && data.current_weather.weathercode) || 0;
  const weather = weatherMap[code] || weatherMap.default;

  // Ideally get humidity from the closest matching current hour
  let humidity = 'N/A';
  if (data.hourly && Array.isArray(data.hourly.time) && data.hourly.relativehumidity_2m) {
    const nowIso = new Date().toISOString().slice(0, 13); // hour precision
    const index = data.hourly.time.findIndex(t => t.startsWith(nowIso));
    if (index !== -1) humidity = `${Math.round(data.hourly.relativehumidity_2m[index])}%`;
  }

  tempEl.textContent = `${Math.round(data.current_weather.temperature)}°C`;
  iconSpan.innerHTML = `<span class="${weather.color} text-3xl">${weather.icon}</span>`;
  conditionEl.textContent = weather.condition;
  humidityEl.textContent = humidity;
  windEl.textContent = `${Math.round(data.current_weather.windspeed * 2.237)}mph`; // m/s to mph
}

// Update hourly forecast (next 7 hours)
function updateHourly(data, timezone) {
  const container = document.querySelector('[data-purpose="hourly-section"] .flex');
  const now = new Date();
  const hours = data.hourly.time.slice(0, 7).map((time, i) => {
    const hourDate = new Date(time);
    const hour = hourDate.toLocaleTimeString('en-US', { hour: 'numeric', timeZone: timezone });
    return { temp: Math.round(data.hourly.temperature_2m[i]), code: data.hourly.weathercode[i], hour };
  });

  container.innerHTML = hours.map(({hour, temp, code}) => {
    const weather = weatherMap[code] || weatherMap.default;
    return `
      <div class="flex-shrink-0 w-24 bg-white p-4 rounded-custom shadow-sm border border-slate-100 flex flex-col items-center gap-2">
        <span class="text-sm font-medium text-slate-500">${hour}</span>
        <span class="w-8 h-8 ${weather.color} text-lg">${weather.icon}</span>
        <span class="font-bold text-lg">${temp}°</span>
      </div>
    `;
  }).join('');
}

// Update daily forecast (next 7 days)
function updateDaily(data, timezone) {
  const container = document.querySelector('[data-purpose="daily-section"] .grid');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const now = new Date();
  
  // Find today index and reorder: today first, then remaining days
  const todayIndex = data.daily.time.findIndex(time => {
    const dayDate = new Date(time);
    return dayDate.toDateString() === now.toDateString();
  });
  
  const reorderedData = [];
  if (todayIndex !== -1) {
    // Today first
    const todayDay = new Date(data.daily.time[todayIndex]);
    const todayMax = Math.round(data.daily.temperature_2m_max[todayIndex]);
    const todayCode = data.daily.weathercode[todayIndex];
    reorderedData.push({ dayName: 'Today', maxTemp: todayMax, code: todayCode, isToday: true });
    
    // Remaining days
    data.daily.time.forEach((time, i) => {
      if (i !== todayIndex) {
        const dayDate = new Date(time);
        const dayName = days[dayDate.getDay()];
        const maxTemp = Math.round(data.daily.temperature_2m_max[i]);
        const code = data.daily.weathercode[i];
        reorderedData.push({ dayName, maxTemp, code, isToday: false });
      }
    });
  } else {
    // Fallback
    reorderedData.push(...data.daily.time.map((time, i) => {
      const dayDate = new Date(time);
      const dayName = days[dayDate.getDay()];
      const maxTemp = Math.round(data.daily.temperature_2m_max[i]);
      const code = data.daily.weathercode[i];
      return { dayName, maxTemp, code, isToday: false };
    }));
  }

  const cards = reorderedData.slice(0, 7).map(({dayName, maxTemp, code, isToday}) => {
    const weather = weatherMap[code] || weatherMap.default;
    const bgClass = isToday ? 'bg-primary text-white shadow-lg scale-105' : 'bg-white shadow-sm border border-slate-100 scale-hover';
    return `
      <div class="${bgClass} p-4 rounded-custom flex flex-col items-center gap-1 fade-in">
        <span class="text-sm font-semibold ${isToday ? 'opacity-90 uppercase tracking-wide' : 'text-slate-500 uppercase'}">${dayName}</span>
        <span class="w-10 h-10 ${weather.color}">${weather.icon}</span>
        <span class="text-2xl font-bold">${maxTemp}°</span>
        <span class="text-xs font-medium ${isToday ? 'opacity-80' : 'text-slate-400'}">${weather.condition}</span>
      </div>
    `;
  });

  container.innerHTML = cards.join('');
}

// Load weather for city
async function loadWeather(city = 'London') {
  try {
    const geo = await geocodeCity(city);
    const data = await fetchWeather(geo.latitude, geo.longitude, geo.timezone);
    currentLat = geo.latitude;
    currentLon = geo.longitude;
    currentTimezone = geo.timezone;
    currentData = data;

    updateCurrent(data, geo.timezone);
    updateHourly(data, geo.timezone);
    updateDaily(data, geo.timezone);
  } catch (error) {
    console.error('Weather load error:', error);
    if (city && city.toLowerCase() !== 'london') {
      // Likely unknown city or network issue: gracefully fallback to London
      console.warn(`City not found or service unavailable for '${city}', falling back to London.`);
      if (document.getElementById('city-search')) {
        document.getElementById('city-search').value = 'London';
      }
      await loadWeather('London');
    } else {
      // After failing for default city, do not keep recursing.
      console.error('Fallback default city also failed. Check API availability.');
    }
  }
}

// Event listeners
let currentLat = null;
let currentLon = null;
let currentTimezone = null;
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('city-search');
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const city = searchInput.value.trim() || 'London';
      loadWeather(city);
    }
  });

  // Calendar functionality removed

  // Button handlers
  let currentLocationName = 'Current location';
  let currentData = null;
  document.getElementById('location-btn').addEventListener('click', async () => {
    const btn = document.getElementById('location-btn');
    btn.innerHTML = '<div class="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>';
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(async (pos) => {
      currentLat = pos.coords.latitude;
      currentLon = pos.coords.longitude;
      currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      // Skip reverse geocode if CORS issue - faster
      currentLocationName = 'Current location';
      
      const data = await fetchWeather(currentLat, currentLon, currentTimezone);
      currentData = data;
      updateCurrent(data, currentTimezone);
      updateHourly(data, currentTimezone);
      updateDaily(data, currentTimezone);
      searchInput.value = currentLocationName;
      
      // Reset button
      btn.disabled = false;
      btn.innerHTML = '<img src="map-pin-off.png" alt="My Location" class="w-5 h-5">';
      
    }, (error) => {
      console.error('Geolocation error:', error);
      // Reset button
      btn.disabled = false;
      btn.innerHTML = '<img src="map-pin-off.png" alt="My Location" class="w-5 h-5">';
      alert(`Location error: ${error.message}. Use city search or default London.`);
      // Quick fallback
      loadWeather('London');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });

  document.getElementById('dark-mode-btn').addEventListener('click', () => {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    if (isDark) {
      html.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    } else {
      html.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    }
  });

  document.getElementById('share-btn').addEventListener('click', async () => {
    const currentTemp = document.querySelector('h1').textContent;
    const conditionEl = document.querySelector('span.text-2xl');
    const condition = conditionEl.textContent;
    const weatherEmoji = weatherMap[currentData?.current?.weather_code || 0]?.icon || '🌤️';
    const city = searchInput.value.trim();
    const locationName = city || 'Current location';
    const shareText = `${locationName} ${currentTemp} ${condition} ${weatherEmoji}`;
    const fullText = `${locationName}: ${currentTemp} ${condition} ${weatherEmoji}. ${window.location.href}`;
    if (navigator.share) {
      await navigator.share({
        title: 'Weather Update',
        text: shareText,
        url: window.location.href
      });
    } else {
      await navigator.clipboard.writeText(fullText);
      alert('Copied: ' + shareText);
    }
  });

  // Load theme
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  // Default load
  loadWeather();
});

// Date-specific forecast (used by calendar picker)
async function fetchDateForecast(lat, lon, timezone, dateStr) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=${timezone}&start_date=${dateStr}&end_date=${dateStr}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Date forecast failed:', error);
    return null;
  }
}


