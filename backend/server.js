require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');

// 서버 시작 시 API 키 확인 (테스트)
console.log('=== API 키 상태 확인 ===');
console.log('Gemini API 키:', process.env.GEMINI_API_KEY ? '있음' : '없음');
console.log('OpenWeather API 키:', process.env.OPENWEATHER_API_KEY ? '있음' : '없음');
console.log('Ambee API 키:', process.env.AMBEE_POLLEN_API_KEY ? '있음' : '없음');

// Module import
const { getUserProfile } = require('./userProfileUtils');
const { geocodeGoogle, reverseGeocode } = require('./locationUtils');
const { getWeatherByCoords } = require('./weatherUtils'); // 홈 화면 날씨 표시에 사용
const conversationStore = require('./conversationStore');
const { callGeminiForToolSelection, callGeminiForFinalResponse } = require('./geminiUtils');
const { availableTools, executeTool } = require('./tools');

const app = express();
const PORT = 4000;

// ✅ 필수 API 키
// 키 외부 노출을 막기 위해 배포 후 .env 파일로 분리할 수 있음.
const GEMINI_API_KEY       = process.env.GEMINI_API_KEY;
const OPENWEATHER_API_KEY  = process.env.OPENWEATHER_API_KEY;
const GOOGLE_MAPS_API_KEY  = process.env.GOOGLE_MAPS_API_KEY;
const AMBEE_POLLEN_API_KEY = process.env.AMBEE_POLLEN_API_KEY;

app.use(cors());
app.use(bodyParser.json());


//  채팅 제목 자동 생성 API
app.post('/generate-title', async (req, res) => {
  const { userInput } = req.body;
  
  try {
    const prompt = `
Generate a concise English title for this weather-related conversation based on the user's question.

Rules:
- Maximum 4 words
- Use title case (First Letter Capitalized)
- No emojis or special characters
- Focus on the main topic (weather, location, condition)
- Be specific and descriptive

User question: "${userInput}"

Examples:
"What's the weather like today?" → "Today’s Weather"
"오늘 날씨 어때?" → "Today’s Weather"
"오늘 서울 날씨 어때?" → "Seoul Weather Today"
"내일 부산 비 올까?" → "Busan Rain Tomorrow"
"미세먼지 농도 궁금해" → "Air Quality Check"
"꽃가루 알레르기 조심해야 할까?" → "Pollen Allergy Alert"
"이번주 날씨 어떨까?" → "Weekly Weather Forecast"
"습도가 높아?" → "Humidity Levels"

Title:`;

    const result = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ]
      }
    );

    let title = result.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'New Weather Chat';
    
    // "Title:" 접두사 제거 및 정리
    title = title.replace(/^Title:\s*/i, '').trim();
    title = title.replace(/[""]/g, ''); // 따옴표 제거
    
    // 4단어 초과시 자르기
    const words = title.split(' ');
    if (words.length > 4) {
      title = words.slice(0, 4).join(' ');
    }
    
    console.log('🏷️ 생성된 제목:', title);
    res.json({ title });
    
  } catch (err) {
    console.error('❌ 제목 생성 실패:', err.message);
    
    // 폴백: 키워드 기반 영어 제목 생성
    const fallbackTitle = generateEnglishFallbackTitle(userInput);
    res.json({ title: fallbackTitle });
  }
});

// 폴백 영어 제목 생성 함수 (한국어 + 영어 지원)
function generateEnglishFallbackTitle(input) {
  const patterns = [
    { keywords: ['날씨', 'weather', '기온', '온도', 'temperature'], title: 'Weather Inquiry' },
    { keywords: ['미세먼지', 'pm2.5', 'pm10', 'air quality', 'pollution'], title: 'Air Quality Check' },
    { keywords: ['꽃가루', '알레르기', 'pollen', 'allergy'], title: 'Pollen Alert' },
    { keywords: ['비', '폭우', 'rain', 'shower', 'precipitation'], title: 'Rain Forecast' },
    { keywords: ['눈', '폭설', 'snow', 'snowfall'], title: 'Snow Forecast' },
    { keywords: ['태풍', '바람', 'wind', 'typhoon', 'storm'], title: 'Wind Weather' },
    { keywords: ['습도', 'humidity', 'moisture'], title: 'Humidity Check' },
    { keywords: ['내일', 'tomorrow'], title: 'Tomorrow Weather' },
    { keywords: ['오늘', 'today'], title: 'Today Weather' },
    { keywords: ['이번주', 'week', 'weekly'], title: 'Weekly Forecast' }
  ];

  for (const pattern of patterns) {
    if (pattern.keywords.some(keyword => input.includes(keyword))) {
      return pattern.title;
    }
  }

  // 지역명 추출 시도
  const cityMap = {
    '서울': 'Seoul Weather',
    '부산': 'Busan Weather', 
    '대구': 'Daegu Weather',
    '인천': 'Incheon Weather',
    '광주': 'Gwangju Weather',
    '대전': 'Daejeon Weather',
    '울산': 'Ulsan Weather'
  };
  
  for (const [korean, english] of Object.entries(cityMap)) {
    if (input.includes(korean)) {
      return english;
    }
  }

  return 'Weather Chat';
}

// ✨ 신규 LLM 중심 채팅 엔드포인트 ✨
app.post('/chat', async (req, res) => {
    const { userInput, coords, uid } = req.body;
    console.log(`💬 사용자 질문 (UID: ${uid}):`, userInput);
    conversationStore.addUserMessage(userInput);

    try {
      // 1. 도구 선택
      const toolSelectionResponse = await callGeminiForToolSelection(userInput, availableTools);
      let functionCalls = toolSelectionResponse.candidates?.[0]?.content?.parts
        .filter(p => p.functionCall)
        .map(p => p.functionCall);

      functionCalls = functionCalls.map(call => ({
        ...call,
        args: {
          ...call.args,
          user_input: userInput
        }
      }));

      if (!functionCalls || functionCalls.length === 0) {
        throw new Error('도구 선택이 이루어지지 않았습니다.');
      }

      // 2. 도구 실행
      const executionPromises = functionCalls.map(call => executeTool(call, coords));
      const results = await Promise.allSettled(executionPromises);
      const toolOutputs = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      results.filter(r => r.status === 'rejected').forEach(r => console.error('❌ 도구 실행 실패:', r.reason));

      // 3. 사용자 프로필 가져오기
      const userProfile = await getUserProfile(uid);
      if (userProfile) console.log(`👤 사용자 프로필:`, userProfile);

      // 4. 최종 Gemini 응답 생성
      const finalResponse = await callGeminiForFinalResponse(
        userInput,
        toolSelectionResponse,
        toolOutputs,
        userProfile,
        functionCalls // 반드시 넘겨야 오류 없음
      );

      const reply = finalResponse.candidates?.[0]?.content?.parts?.[0]?.text || '죄송해요, 답변 생성에 실패했어요.';
      console.log('🤖 최종 생성 답변:', reply);
      // LLM의 답변 텍스트가 아닌, '실행된 도구'를 기준으로 데이터를 첨부합니다.
      const responsePayload = { reply };

      // ✅ 5. 사용자 질문에 따른 조건 분기
      const fullWeather = toolOutputs.find(o => o.tool_function_name === 'get_full_weather_with_context');
      const lowerInput = userInput.toLowerCase();

      // 그래프 조건 (기온/온도/그래프 등)
      if (lowerInput.includes('기온') || lowerInput.includes('온도') || lowerInput.includes('그래프')) {
        if (fullWeather?.output?.hourlyTemps?.length > 0) {
          responsePayload.graph = fullWeather.output.hourlyTemps;
        }
      }

      // 미세먼지 조건
      if (lowerInput.includes('미세먼지') || lowerInput.includes('먼지') || lowerInput.includes('공기')) {
        if (fullWeather?.output?.air?.pm25 !== undefined) {
          const pm25 = fullWeather.output.air.pm25;
          const getAirLevel = v => v <= 15 ? 'Good' : v <= 35 ? 'Moderate' : v <= 75 ? 'Poor' : 'Very Poor';
          responsePayload.dust = {
            value: pm25,
            level: getAirLevel(pm25)
          };
        }
      }

        res.json(responsePayload);
      } catch (err) {
        console.error('❌ /chat 처리 오류:', err.response ? JSON.stringify(err.response.data) : err.message);
        res.status(500).json({ error: '요청 처리 중 오류가 발생했습니다.' });
      }
});
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


app.listen(PORT, () => {
  console.log(`✅ Gemini+Weather 서버 실행 중: http://localhost:${PORT}`);
});

