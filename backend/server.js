// require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const { geocodeGoogle } = require('./locationUtils'); // ✅ 위치 유틸 불러오기
const conversationStore = require('./conversationStore');
const { extractDateFromText, getNearestForecastTime } = require('./timeUtils');
const { extractLocationFromText } = require('./placeExtractor');
const { getWeather } = require('./weatherUtils');

const app = express();
const PORT = 4000;

// ✅ 필수 API 키
const GEMINI_API_KEY = 'AIzaSyCTlo8oCxSpm6wqu87tpWP2J3jeZbryP6k';
const OPENWEATHER_API_KEY = '81e4f6ae97b20ee022116a9ddae47b63'; // OpenWeather 키만 필요함

app.use(cors());
app.use(bodyParser.json());


app.post('/gemini', async (req, res) => {
  const { userInput } = req.body;
  console.log('💬 사용자 질문:', userInput);
  const forecastDate = extractDateFromText(userInput);
  const forecastKey = getNearestForecastTime(forecastDate);
  console.log('🕒 추출된 날짜:', forecastDate);
  console.log('📆 예보 키 (OpenWeather용):', forecastKey);

  conversationStore.addUserMessage(userInput);
  
  // ✅ 장소 추출
  const location = extractLocationFromText(userInput);
  console.log('📍 추출된 장소:', location);

  if (!location) {
    return res.json({ reply: '어느 지역의 날씨를 알려드릴까요?' });
  }

  try {
    const geo = await geocodeGoogle(location);
    if (!geo) {
      return res.json({ reply: `죄송해요. "${location}" 지역의 위치를 찾을 수 없어요.` });
    }

  const now = new Date();
  const isToday = forecastDate.toDateString() === now.toDateString();
  const keyForWeather = isToday ? null : forecastKey;

  const weather = await getWeather(geo.lat, geo.lon, keyForWeather);

  const dayLabel = isToday
    ? '오늘'
    : forecastDate.toLocaleDateString('ko-KR', {
     year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });

const prompt = `
${dayLabel} "${location}"의 날씨 정보는 다음과 같습니다:
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
    res.json({ reply: formatted });


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
