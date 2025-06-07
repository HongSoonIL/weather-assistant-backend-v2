require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');

// Module import
const { geocodeGoogle, reverseGeocode } = require('./locationUtils');
const { getWeather, getWeatherByCoords } = require('./weatherUtils');
const conversationStore = require('./conversationStore');
const { extractDateFromText, getNearestForecastTime } = require('./timeUtils');
const { extractLocationFromText } = require('./placeExtractor');

const app = express();
const PORT = 4000;

// ✅ 필수 API 키
// 키 외부 노출을 막기 위해 배포 후 .env 파일로 분리할 수 있음.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

app.use(cors());
app.use(bodyParser.json());

// 실시간 위치
// 1. 위도/경도로 지역명 반환
app.post('/reverse-geocode', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const region = await reverseGeocode(latitude, longitude);
    res.json({ region });
  } catch (err) {
    console.error('📍 reverse-geocode 실패:', err.message);
    res.status(500).json({ error: '주소 변환 실패' });
  }
});


// 사용자의 위도/경도로 날씨 정보만 반환하는 API
// 2. 위도/경도로 날씨 정보
app.post('/weather', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const weather = await getWeatherByCoords(latitude, longitude);
    res.json(weather);
  } catch (err) {
    console.error('🌧️ 날씨 정보 가져오기 실패:', err.message);
    res.status(500).json({ error: '날씨 정보를 불러오는 데 실패했습니다.' });
  }
});

// 3. 특정 시간 기온 변화 그래프 출력용
app.post('/weather-graph', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${latitude}&lon=${longitude}&exclude=minutely,daily,alerts&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;
    const result = await axios.get(url);
    const data = result.data; // 한 번에 hourly + timezone_offset 사용

    const hourly = data.hourly;
    const timezoneOffsetSec = data.timezone_offset || 0;
    const offsetMs = timezoneOffsetSec * 1000;

    // 1. 현재 UTC 시각
    const utcNow = new Date();  // 무조건 UTC

    // 2. 해당 지역 현지 기준 시각을 계산
    const localNow = new Date(utcNow.getTime() + offsetMs);
    localNow.setMinutes(0, 0, 0); // 분, 초 제거 → 정각으로

    const hourlyTemps = [];

    for (let i = 0; i < 6; i++) {
      // 3. 3시간 간격 target UTC 시각 생성
      const targetLocalTime = new Date(localNow.getTime() + i * 3 * 60 * 60 * 1000);
      const targetUTC = new Date(targetLocalTime.getTime() - offsetMs);
      // 4. UTC 기준에서 가장 가까운 hourly 데이터 찾기
      const closest = hourly.reduce((prev, curr) => {
        const currTime = curr.dt * 1000;
        return Math.abs(currTime - targetUTC.getTime()) < Math.abs(prev.dt * 1000 - targetUTC.getTime()) ? curr : prev;
      });

      // 5. label은 현지 시간 기준
      const localTime = new Date(targetUTC.getTime() + offsetMs);
      const hour = new Date(targetUTC.getTime() + offsetMs).getUTCHours();
      const label = `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`;
      console.log(`✅ label=${label} | local=${localTime.toISOString()} | UTC=${targetUTC.toISOString()} | temp=${Math.round(closest.temp)}`);

      hourlyTemps.push({
        hour: label,
        temp: Math.round(closest.temp)
      });
    }

        res.json({ hourlyTemps });
        console.log('📡 최종 hourlyTemps:', hourlyTemps);

      } catch (err) {
        console.error('📊 시간별 기온 그래프용 API 실패:', err.message);
        res.status(500).json({ error: '그래프용 날씨 데이터를 불러오는 데 실패했습니다.' });
      }
    });


app.post('/gemini', async (req, res) => {
  const { userInput, coords } = req.body;
  console.log('💬 사용자 질문:', userInput);

  const forecastDate = extractDateFromText(userInput);
  const forecastKey = getNearestForecastTime(forecastDate);
  console.log('🕒 추출된 날짜:', forecastDate);
  console.log('📆 예보 키 (OpenWeather용):', forecastKey);

  // 1. 사용자 입력에서 지역명 추출
  const extractedLocation = extractLocationFromText(userInput);
  console.log('📍 추출된 장소:', extractedLocation);

  conversationStore.addUserMessage(userInput);

  const now = new Date();
  const isToday = forecastDate.toDateString() === now.toDateString();
  const keyForWeather = isToday ? null : forecastKey;

  // 함수로 빼면 재사용 가능할 것 같습니다.
  const dayLabel = isToday
    ? '오늘'
    : forecastDate.toLocaleDateString('ko-KR', {
     year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });

  let lat, lon, locationName;

  try {
    if (extractedLocation) {
      // 지역명이 명확히 있으면 geocode 사용 (GPS보다 우선)
      const geo = await geocodeGoogle(extractedLocation);
      if (!geo || !geo.lat || !geo.lon) {
        return res.json({ reply: `죄송해요. "${extractedLocation}" 지역의 위치를 찾을 수 없어요.` });
      }

      lat = geo.lat;
      lon = geo.lon;
      locationName = extractedLocation;
    } else if (coords) {
      // 지역명 없으면 그때만 GPS 사용
      lat = coords.latitude;
      lon = coords.longitude;
      locationName = await reverseGeocode(lat, lon);
    } else {
      return res.json({ reply: '어느 지역의 날씨를 알려드릴까요?' });
    }

    // 날씨 정보 요청
    const weather = await getWeather(lat, lon, keyForWeather);
  
const prompt = `
${dayLabel} "${locationName}"의 날씨 정보는 다음과 같습니다:
- 기온: ${weather.temp}℃
- 상태: ${weather.condition}
- 습도: ${weather.humidity}%
- 풍속: ${weather.wind}m/s

사용자에게 친근한 말투로 날씨를 요약하고, 실용적인 조언도 포함해 3~4문장으로 작성해주세요. 😊
`;

    // 🔹 전체 히스토리 + 최신 프롬프트로 구성
    const contents = [...conversationStore.getHistory(), { role: 'user', parts: [{ text: prompt }] }];

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      { contents }
    );

    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';

    // 🔹 Gemini 응답 저장
    conversationStore.addBotMessage(reply);
    conversationStore.trimTo(10); // 최근 10개까지만 유지 (메모리 절약)

    // 1) 볼드 마크다운 제거
    let formatted = reply.replace(/\*\*/g, '');

    // 2) “• ” 기준으로 분리하여 앞뒤 공백 제거
    const parts = formatted
      .split('• ')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // 3) 첫 줄(소개 문장)과 나머지 항목을 구분해서 재조합
    const header = parts.shift();
    const items = parts.map(p => `- ${p}`);

    // 4) “오늘 예상 날씨:” 앞뒤로 빈 줄 추가
    const idx = items.findIndex(p => p.startsWith('오늘 예상 날씨:'));
    if (idx !== -1) {
      items[idx] = `\n${items[idx]}`;
    }

    // 5) 최종 문자열 만들기
    formatted = [
      header,
      ...items
    ].join('\n');

    // 6) 응답으로 보내기
    res.json({
      reply: formatted,
      resolvedCoords: { lat, lon },
      locationName
    });

    } catch (err) {
    console.error('❌ Gemini API 오류 발생!');
    console.error('↳ 메시지:', err.message);
    console.error('↳ 상태 코드:', err.response?.status);
    console.error('↳ 상태 텍스트:', err.response?.statusText);
    console.error('↳ 응답 데이터:', JSON.stringify(err.response?.data, null, 2));
    console.error('↳ 요청 내용:', err.config?.data);

    res.status(err.response?.status || 500).json({
      error: 'Gemini API 호출 실패',
      message: err.response?.data?.error?.message || err.message
    });
  }
});


app.listen(PORT, () => {
  console.log(`✅ Gemini+Weather 서버 실행 중: http://localhost:${PORT}`);
});
