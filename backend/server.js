// require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
const PORT = 4000;

// 키 외부 노출을 막기 위해 배포 후 .env 파일로 분리할 수 있음.
const GEMINI_API_KEY = 'AIzaSyAsxn4RLgLzEc8FuuEh9F5fo4JzQp9YjZo';
// const GEMINI_MODEL = process.env.GEMINI_MODEL;
// const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENWEATHER_API_KEY = 'a72c7174a9b30d55f73d52a104868e49'; // 여기에_OpenWeather_API_키
const GOOGLE_MAPS_API_KEY = 'AIzaSyAiZGWeaxSGW5pHHl7DvlMFp80y_pnO1Fg' // GOOGLE_MAPS API: 위치 받아오기

app.use(cors());
app.use(bodyParser.json());


// 실시간 위치
app.post('/reverse-geocode', async (req, res) => {
  const { latitude, longitude } = req.body;

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        latlng: `${latitude},${longitude}`,
        key: GOOGLE_MAPS_API_KEY,
        language: 'en'
      }
    });

    const components = response.data.results[0]?.address_components;

    const city = components?.find(c =>
      c.types.includes('locality') || c.types.includes('administrative_area_level_1')
    )?.long_name;

    const country = components?.find(c =>
      c.types.includes('country')
    )?.short_name;

    const region = city && country ? `${city}, ${country}` : 'Unknown';
    res.json({ region });
  } catch (error) {
    console.error('📍 Google Geocoding 실패:', error.message);
    res.status(500).json({ error: '주소 변환 실패' });
  }
});

// OpenWeather 불러오기
async function getWeatherByCoords(lat, lon) {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;
  const response = await axios.get(url);
  const data = response.data;

  return {
    temp: Math.round(data.main.temp),
    condition: data.weather[0].description,
    humidity: data.main.humidity,
    wind: data.wind.speed
  };
}

// 🔍 실시간 날씨 정보 가져오기
async function getSeoulWeather() {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=Seoul&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;
  const response = await axios.get(url);
  const data = response.data;

  return {
    temp: Math.round(data.main.temp),
    condition: data.weather[0].description,
    humidity: data.main.humidity,
    wind: data.wind.speed
  };
}


app.post('/gemini', async (req, res) => {
  const { userInput } = req.body;
  console.log('📩 POST /gemini 요청 수신됨');
  console.log('💬 사용자 질문:', userInput);

  try {

    // 사용자 위치를 저장하여 해당 위치 기반 날씨 출력
    const { userInput, location, coords } = req.body;

    if (userInput.includes('현재 위치') && userInput.includes('날씨') && coords) {
      const weather = await getWeatherByCoords(coords.latitude, coords.longitude);

      const prompt = `
    사용자의 현재 위치는 ${location}입니다. (위도: ${coords.latitude}, 경도: ${coords.longitude})
    다음은 실시간 날씨 정보입니다:
    - 기온: ${weather.temp}도
    - 상태: ${weather.condition}
    - 습도: ${weather.humidity}%
    - 풍속: ${weather.wind}m/s

이 정보를 바탕으로 사용자에게 친근한 말투로 오늘 날씨 요약과 조언을 해주세요.
답변은 3~4문장 이내로, 너무 길지 않게 써주세요. 문장 마지막에 이모지도 붙여주세요.
    `;

      const result = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: prompt }] }]
        }
      );

      const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text;
      return res.json({ reply });
    }

    // ✅ 질문이 "서울 날씨"면 OpenWeather → Gemini로 연결
    if (userInput.includes('서울') && userInput.includes('날씨')) {
      const weather = await getSeoulWeather();

      const prompt = `
사용자가 오늘 서울 날씨에 대해 물어봤습니다.
현재 날씨 정보는 다음과 같습니다:
- 기온: ${weather.temp}도
- 상태: ${weather.condition}
- 습도: ${weather.humidity}%
- 풍속: ${weather.wind}m/s

이 정보를 바탕으로 사용자에게 친근한 말투로 오늘 날씨 요약과 조언을 해주세요.
답변은 3~4문장 이내로, 너무 길지 않게 써주세요. 문장 마지막에 이모지도 붙여주세요.
`;

      const result = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: prompt }] }]
        }
      );

      const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log('[🌤️ Gemini 날씨 응답]', reply);
      return res.json({ reply });
    }


    // ✅ 일반 질문 → Gemini로 처리
    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: userInput }] }]
      }
    );

    const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text;
    res.json({ reply });

  } catch (err) {
    console.error('❌ Gemini API 오류 발생!');
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
  console.log(`✅ Gemini 백엔드 서버 실행 중: http://localhost:${PORT}`);
});
