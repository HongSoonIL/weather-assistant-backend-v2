// require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const { geocodeKakao } = require('./locationUtils'); // ✅ 위치 유틸 불러오기

const app = express();
const PORT = 4000;

// ✅ 필수 API 키
const GEMINI_API_KEY = 'AIzaSyAsxn4RLgLzEc8FuuEh9F5fo4JzQp9YjZo';
const OPENWEATHER_API_KEY = 'd3270bfa237a5956cc0812005dbf181c'; // OpenWeather 키만 필요함

app.use(cors());
app.use(bodyParser.json());


// ───────────────────────────────────────────────────────────────────────────────
// (1) 위경도 기반 날씨 정보 가져오기
// ───────────────────────────────────────────────────────────────────────────────
async function getWeather(lat, lon) {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;
  const res = await axios.get(url);
  const data = res.data;

  return {
    temp: Math.round(data.main.temp),
    condition: data.weather[0].description,
    humidity: data.main.humidity,
    wind: data.wind.speed
  };
}


// ───────────────────────────────────────────────────────────────────────────────
// (2) 위경도 기반 미세먼지 정보 가져오기 (Air Pollution API)
// ───────────────────────────────────────────────────────────────────────────────
async function getAirQuality(lat, lon) {
  const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
  const res = await axios.get(url);
  const data = res.data;

  // data.list[0].components 에 PM2.5와 PM10 정보가 담겨 있음
  const pm2_5 = data.list[0].components.pm2_5;
  const pm10  = data.list[0].components.pm10;

  return {
    pm2_5: pm2_5,
    pm10: pm10
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// (3) PM2.5 농도 등급과 조언을 반환하는 함수
// ───────────────────────────────────────────────────────────────────────────────
function classifyPm25(pm25) {
  // 한국 환경부 기준(μg/m³)
  if (pm25 <= 15) {
    return { grade: '좋음', advice: '좋은 공기입니다! 야외 활동에 문제 없어요 😊' };
  } else if (pm25 <= 35) {
    return { grade: '보통', advice: '보통 수준입니다. 민감한 분들은 주의하세요.' };
  } else if (pm25 <= 75) {
    return { grade: '나쁨', advice: '나쁨 수준입니다. 마스크를 착용하시고 장시간 외출은 자제하세요.' };
  } else {
    return { grade: '매우 나쁨', advice: '매우 나쁨입니다! 외출을 가능한 한 삼가고, 실내 공기 정화에 신경 쓰세요.' };
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// (4) /gemini 엔드포인트: 날씨 or 미세먼지 조회 분기
// ───────────────────────────────────────────────────────────────────────────────
app.post('/gemini', async (req, res) => {
  const { userInput } = req.body;
  console.log('💬 사용자 질문:', userInput);

  // ✅ 사용자 입력에서 지역명 추출 (예: "하남시", "제주도")
  const match = userInput.match(/([가-힣]+(시|도|군|구|동|읍|면)?)/);
  const region = match ? match[0] : null;

  if (!region) {
    return res.json({ reply: '어느 지역의 정보를 알려드릴까요? 예: "서울특별시 미세먼지" 또는 "부산광역시 날씨" 등으로 입력해주세요.' });
  }

  try {
    // (A) 먼저 카카오 지오코딩으로 위경도 가져오기
    const geo = await geocodeKakao(region);
    if (!geo) {
      return res.json({ reply: `죄송해요. "${region}" 지역의 위치 정보를 찾을 수 없어요.` });
    }

    const { lat, lon } = geo;

    // (B) 입력에 "미세먼지"라는 단어가 있으면 Air Quality API 호출
    if (userInput.includes('미세먼지')) {
      const airData = await getAirQuality(lat, lon);
      const { pm2_5, pm10 } = airData;

      // pm2_5 등급 분류 및 조언 얻기
      const { grade, advice } = classifyPm25(pm2_5);

      // 응답 문자열 작성
      const replyText = 
        `현재 "${region}"의 미세먼지 (PM2.5) 등급은 "${grade}" 입니다.\n` +
        `- PM2.5: ${pm2_5}㎍/m³\n` +
        `- PM10: ${pm10}㎍/m³\n\n` +
        `${advice}`;

      return res.json({ reply: replyText });
    }

    // (C) "미세먼지" 키워드가 없으면 기존의 날씨 조회 + Gemini 요약 분기
    const weather = await getWeather(lat, lon);

    // 오늘 날짜 예시: "2025년 6월 3일 화요일"
    const today = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    });

    // Gemini에게 전달할 프롬프트 구성
    const prompt = `
오늘은 ${today}입니다. "${region}"의 날씨 정보는 다음과 같습니다:
- 기온: ${weather.temp}℃  
- 상태: ${weather.condition}  
- 습도: ${weather.humidity}%  
- 풍속: ${weather.wind}m/s

사용자에게 친근한 말투로 날씨를 요약하고, 실용적인 조언도 포함해 3~4문장으로 작성해주세요. 😊
`;

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }]
      }
    );

    //텍스트 클렌징
    const raw = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // 1) 볼드 마크다운 (** … **) 제거
    let formatted = raw.replace(/\*\*/g, '');

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
    res.json({ reply: formatted });

  } catch (err) {
    console.error('❌ 오류 발생!');
    console.error('↳ 메시지:', err.message);
    console.error('↳ 상태 코드:', err.response?.status);
    console.error('↳ 상태 텍스트:', err.response?.statusText);
    console.error('↳ 응답 데이터:', JSON.stringify(err.response?.data, null, 2));
    console.error('↳ 요청 내용:', err.config?.data);

    res.status(err.response?.status || 500).json({
      error: '처리 중 오류가 발생했습니다.',
      message: err.response?.data?.error?.message || err.message
    });
  }
});


app.listen(PORT, () => {
  console.log(`✅ Gemini+Weather+AirQuality 서버 실행 중: http://localhost:${PORT}`);
});
