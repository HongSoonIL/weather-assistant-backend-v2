const axios = require('axios');
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;


async function getWeather(lat, lon, forecastTime = null) {
  const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,daily,alerts&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;
  const res = await axios.get(url);
  const data = res.data;

  let target;
  if (!forecastTime) {
    target = data.current;
  } else {
    target = data.hourly.reduce((prev, curr) =>
      Math.abs(curr.dt * 1000 - forecastTime) < Math.abs(prev.dt * 1000 - forecastTime) ? curr : prev
    );
  }

  return {
    temp: Math.round(target.temp),
    feelsLike: Math.round(target.feels_like),
    condition: target.weather?.[0]?.description || '정보 없음',
    humidity: target.humidity,
    uvi: target.uvi,
    cloud: target.clouds,
    dewPoint: target.dew_point,
    visibility: target.visibility,
    wind: target.wind_speed,
    windDeg: target.wind_deg
  };
}

async function getWeatherByCoords(lat, lon) {
  const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,alerts&appid=${OPENWEATHER_API_KEY}&units=metric&lang=en`;
  
  try {
    const res = await axios.get(url);
    const current = res.data.current;
    const daily = res.data.daily[0];
    // ✨ 시간별 예보에서 '강수 확률'을 가져옵니다.
    const hourly = res.data.hourly;

    return {
      temp: Math.round(current.temp),
      feelsLike: Math.round(current.feels_like),
      tempMax: Math.round(daily.temp.max),
      tempMin: Math.round(daily.temp.min),
      humidity: current.humidity,
      wind: current.wind_speed,
      description: current.weather[0].description,
      weatherId: current.weather[0].id,
      icon: current.weather[0].icon,
      uvi: current.uvi,
      visibility: current.visibility,
      dew_point: Math.round(current.dew_point),
      clouds: current.clouds,
      sunrise: new Date(current.sunrise * 1000).toLocaleTimeString('ko-KR'),
      sunset: new Date(current.sunset * 1000).toLocaleTimeString('ko-KR'),
      pop: hourly[0]?.pop !== undefined ? Math.round(hourly[0].pop * 100) : 0, // 앞으로 1시간 내 강수 확률 (%)
      rain_1h: current.rain?.['1h'] || hourly[0]?.rain?.['1h'] || 0, // 1시간 예상 강수량 (mm)
      hourly: res.data.hourly,
      timezone_offset: res.data.timezone_offset,
    };
  } catch (error) {
    console.error("❌ 날씨 정보 조회 실패 (getWeatherByCoords):", error.message);
    return null;
  }
}

module.exports = {
    getWeather,
    getWeatherByCoords
};