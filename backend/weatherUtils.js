const axios = require('axios');

const OPENWEATHER_API_KEY = '81e4f6ae97b20ee022116a9ddae47b63'; // 실제 키로 대체하세요

// 🔹 위경도 기반 날씨 정보 가져오기 (One Call 3.0)
async function getWeather(lat, lon, forecastTime = null) {
  const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,daily,alerts&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;

  const res = await axios.get(url);
  const data = res.data;

  // 🔸 현재 or 시간대별 중 가장 가까운 값 선택
  let target;
  if (!forecastTime) {
    target = data.current;
  } else {
    const nearest = data.hourly.reduce((prev, curr) => {
      const diffPrev = Math.abs(prev.dt * 1000 - forecastTime);
      const diffCurr = Math.abs(curr.dt * 1000 - forecastTime);
      return diffCurr < diffPrev ? curr : prev;
    });
    target = nearest;
  }

  return {
    temp: Math.round(target.temp),
    feelsLike: Math.round(target.feels_like),
    condition: target.weather?.[0]?.description || '정보 없음',
    icon: target.weather?.[0]?.icon || '',
    humidity: target.humidity,
    uvi: target.uvi,
    cloud: target.clouds,
    dewPoint: target.dew_point,
    visibility: target.visibility,
    wind: target.wind_speed,
    windDeg: target.wind_deg
  };
}

module.exports = {
  getWeather
};
