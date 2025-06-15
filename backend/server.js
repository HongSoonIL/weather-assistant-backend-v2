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
      // 1. [1차 Gemini 호출] 결과 전체를 변수에 저장
      const toolSelectionResponse = await callGeminiForToolSelection(userInput, availableTools);
      const functionCalls = toolSelectionResponse.candidates?.[0]?.content?.parts.filter(p => p.functionCall).map(p => p.functionCall);
      let toolOutputs = [];
      // Gemini가 함수를 사용하라고 했을 때만 실행
        if (functionCalls && functionCalls.length > 0) {
          console.log('🛠️ Gemini가 선택한 도구:', functionCalls.map(call => call.name).join(', '));
          const executionPromises = functionCalls.map(call => executeTool(call, coords));
          const results = await Promise.allSettled(executionPromises);
          toolOutputs = results.filter(r => r.status === 'fulfilled').map(r => r.value);
          results.filter(r => r.status === 'rejected').forEach(r => console.error('❗️ 도구 실행 실패:', r.reason));
          console.log('📊 도구 실행 성공 결과:', toolOutputs);
        } else {
          console.log('🤔 특정 도구가 필요하지 않은 일반 대화입니다.');
        }

      const userProfile = await getUserProfile(uid);
      if (userProfile) console.log(`👤 ${uid} 님의 프로필을 찾았습니다.`);

      // 2. [2차 Gemini 호출] ✨ 1차 호출 결과(toolSelectionResponse)를 함께 전달
      const finalResponse = await callGeminiForFinalResponse(
          userInput, 
          toolSelectionResponse,
          toolOutputs, 
          userProfile
      );
      const reply = finalResponse.candidates?.[0]?.content?.parts?.[0]?.text || '죄송해요, 답변을 생성하는 데 문제가 발생했어요.';
      
      console.log('🤖 최종 생성 답변:', reply);
      // LLM의 답변 텍스트가 아닌, '실행된 도구'를 기준으로 데이터를 첨부합니다.
      const responsePayload = { reply };

      // ✨ [핵심 수정] LLM이 호출한 함수의 '인자(args)'를 직접 확인합니다.
      const weatherFunctionCall = functionCalls?.find(call => call.name === 'get_general_weather');
      
      // graph_needed 파라미터가 true로 설정되었을 때만 그래프 데이터를 포함시킵니다.
      if (weatherFunctionCall?.args?.graph_needed === true) {
          const weatherToolOutput = toolOutputs.find(o => o.tool_function_name === 'get_general_weather');
          if (weatherToolOutput?.output?.hourlyTemps?.length > 0) {
              responsePayload.graph = weatherToolOutput.output.hourlyTemps;
              console.log('📈 LLM이 그래프가 필요하다고 판단하여 데이터를 포함합니다.');
          }
      }

      // get_air_quality 도구 결과에서 미세먼지 데이터를 찾습니다.
      const airToolOutput = toolOutputs.find(o => o.tool_function_name === 'get_air_quality');
      if (airToolOutput?.output?.air) {
          const pm25 = airToolOutput.output.air.pm25;
          // 프론트엔드가 필요로 하는 형식으로 가공
          const getAirLevel = v => { if (v <= 15) return 'Good'; if (v <= 35) return 'Moderate'; if (v <= 75) return 'Poor'; return 'Very Poor'; };
          responsePayload.dust = { value: pm25, level: getAirLevel(pm25) };
          console.log('😷 응답에 미세먼지 데이터를 포함합니다.');
      }
      
      res.json(responsePayload);
    } catch (err) {
        console.error('❌ /chat 엔드포인트 처리 중 심각한 오류 발생:', err.response ? JSON.stringify(err.response.data) : err.message);
        res.status(500).json({ error: '요청 처리 중 서버에서 오류가 발생했습니다.' });
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

// app.post('/gemini', async (req, res) => {
//   const { userInput, coords } = req.body;
//   console.log('💬 사용자 질문:', userInput);

//   // (A) 날짜/시간 추출 (필요 시)
//   const forecastDate = extractDateFromText(userInput);
//   const forecastKey  = getNearestForecastTime(forecastDate);

//   console.log('🕒 추출된 날짜:', forecastDate);
//   console.log('📆 예보 키 (OpenWeather용):', forecastKey);

//   // 1. 사용자 입력에서 지역명 추출
//   const extractedLocation = extractLocationFromText(userInput);
//   console.log('📍 추출된 장소:', extractedLocation);

//   conversationStore.addUserMessage(userInput);

//   let lat, lon, locationName, uid;
//   try {
//     uid = req.body.uid || null;//프론트에서 uid 가져오는 코드
//     if (extractedLocation) {
//       // 지역명이 명확히 있으면 geocode 사용 (GPS보다 우선)
//       const geo = await geocodeGoogle(extractedLocation);
//       if (!geo || !geo.lat || !geo.lon) {
//         return res.json({ reply: `죄송해요. "${extractedLocation}" 지역의 위치를 찾을 수 없어요.` });
//       }
//       lat = geo.lat;
//       lon = geo.lon;
//       locationName = extractedLocation;
//     } else if (coords) {
//       // 지역명 없으면 그때만 GPS 사용
//       lat = coords.latitude;
//       lon = coords.longitude;
//       locationName = await reverseGeocode(lat, lon);
//     } else {
//       return res.json({ reply: '어느 지역의 날씨를 알려드릴까요?' });
//     }

//     console.log(`📍 "${locationName}" → lat: ${lat}, lon: ${lon}`);
//   } catch (err) {
//     console.error('❌ 지오코딩/역지오코딩 중 오류:', err);
//     return res.json({ reply: '위치 정보를 가져오는 중 오류가 발생했어요.' });
//   }
// //우산, 옷차림, 공기질 등등에 대한 답변 이끌어 내는 코드. weatherAdviceRouter.js에서 실행
// // 공기질
// if (weatherAdvice.isAirRelated(userInput)) {
//   return await weatherAdvice.handleAirAdvice({ lat, lon, locationName, uid }, res);
// }

// // 꽃가루
// if (weatherAdvice.isPollenRelated(userInput)) {
//   return await weatherAdvice.handlePollenAdvice({ lat, lon, locationName, uid }, res);
// }

// // 우산
// if (weatherAdvice.isUmbrellaRelated(userInput)) {
//   return await weatherAdvice.handleUmbrellaAdvice({ lat, lon, locationName, uid }, res);
// }

// // 옷차림
// if (weatherAdvice.isClothingRelated(userInput)) {
//   return await weatherAdvice.handleClothingAdvice({ lat, lon, locationName, uid }, res);
// }

// // 습도
// if (weatherAdvice.isHumidityRelated(userInput)) {
//   return await weatherAdvice.handleHumidityAdvice({ lat, lon, locationName, uid }, res);
// }

// // 가시거리
// if (weatherAdvice.isVisibilityRelated(userInput)) {
//   return await weatherAdvice.handleVisibilityAdvice({ lat, lon, locationName, uid }, res);
// }

// // 일출/일몰
// if (weatherAdvice.isSunTimeRelated(userInput)) {
//   return await weatherAdvice.handleSunTimeAdvice({ lat, lon, locationName, uid }, res);
// }

// // 자외선
// if (weatherAdvice.isUVRelated(userInput)) {
//   return await weatherAdvice.handleUVAdvice({ lat, lon, locationName, uid }, res);
// }

// // 바람
// if (weatherAdvice.isWindRelated(userInput)) {
//   return await weatherAdvice.handleWindAdvice({ lat, lon, locationName, uid }, res);
// }

// // 구름량
// if (weatherAdvice.isCloudRelated(userInput)) {
//   return await weatherAdvice.handleCloudAdvice({ lat, lon, locationName, uid }, res);
// }

// // 이슬점
// if (weatherAdvice.isDewPointRelated(userInput)) {
//   return await weatherAdvice.handleDewPointAdvice({ lat, lon, locationName, uid }, res);
// }

//   // (F) “꽃가루” / “미세먼지” 키워드가 없는 경우 → 현재 날씨 조회 + Gemini 요약
//   const now = new Date();
//   const isToday = forecastDate.toDateString() === now.toDateString();
//   const dayLabel = isToday
//   ? '오늘'
//   : forecastDate.toLocaleDateString('ko-KR', {
//       year: 'numeric',
//       month: 'long',
//       day: 'numeric',
//       weekday: 'long'
//     });
//   try {
//     // ★ 수정: getWeather를 현재 날씨만 가져오는 함수로 교체
//     const weatherData = await getWeather(lat, lon, uid);
//     if (!weatherData) {
//       return res.json({ reply: '죄송해요. 현재 날씨 정보를 가져오지 못했어요.' });
//     }

//   // 사용자 정보 포맷 구성
//   const userInfo = await getUserProfile(uid);
//   const userText = userInfo ? `
// 사용자 정보:
// - 이름: ${userInfo.name}
// - 민감 요소: ${userInfo.sensitiveFactors?.join(', ') || '없음'}
// - 취미: ${userInfo.hobbies?.join(', ') || '없음'}
// ` : '';
//   const prompt = `
// ${userText}
// ${dayLabel} "${locationName}"의 날씨 정보는 다음과 같습니다:
// - 기온: ${weatherData.temp}℃
// - 상태: ${weatherData.condition}
// - 습도: ${weatherData.humidity}%
// - 풍속: ${weatherData.wind}m/s

// 사용자에게 친근한 말투로 날씨를 요약하고, 실용적인 조언도 포함해 3~4문장으로 작성해주세요. 😊
// `;

//     // 🔹 전체 히스토리 + 최신 프롬프트로 구성
//     const contents = [...conversationStore.getHistory(), { role: 'user', parts: [{ text: prompt }] }];

//     const result = await axios.post(
//       `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
//       { contents }
//     );

//     const reply = result.data.candidates?.[0]?.content?.parts?.[0]?.text || '답변을 생성하지 못했어요.';

//     // 🔹 Gemini 응답 저장
//     conversationStore.addBotMessage(reply);
//     conversationStore.trimTo(10); // 최근 10개까지만 유지 (메모리 절약)

//     // 1) 볼드 마크다운 제거
//     let formatted = reply.replace(/\*\*/g, '');

//     // 2) “• ” 기준으로 분리하여 앞뒤 공백 제거
//     const parts = formatted
//       .split('• ')
//       .map(s => s.trim())
//       .filter(s => s.length > 0);

//     // 3) 첫 줄(소개 문장)과 나머지 항목을 구분해서 재조합
//     const header = parts.shift();
//     const items = parts.map(p => `- ${p}`);

//     // 4) “오늘 예상 날씨:” 앞뒤로 빈 줄 추가
//     const idx = items.findIndex(p => p.startsWith('오늘 예상 날씨:'));
//     if (idx !== -1) {
//       items[idx] = `\n${items[idx]}`;
//     }

//     // 5) 최종 문자열 만들기
//     formatted = [
//       header,
//       ...items
//     ].join('\n');

//     // 6) 응답으로 보내기
//     res.json({
//       reply: formatted,
//       resolvedCoords: { lat, lon },
//       locationName
//     });

//     } catch (err) {
//     console.error('❌ Gemini API 오류 발생!');
//     console.error('↳ 메시지:', err.message);
//     console.error('↳ 상태 코드:', err.response?.status);
//     console.error('↳ 상태 텍스트:', err.response?.statusText);
//     console.error('↳ 응답 데이터:', JSON.stringify(err.response?.data, null, 2));
//     console.error('↳ 요청 내용:', err.config?.data);

//     return res.status(err.response?.status || 500).json({
//       error: 'Gemini API 호출 실패',
//       message: err.response?.data?.error?.message || err.message
      
//     });
//   }
// });


app.listen(PORT, () => {
  console.log(`✅ Gemini+Weather 서버 실행 중: http://localhost:${PORT}`);
});

