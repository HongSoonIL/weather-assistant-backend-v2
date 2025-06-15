const { geocodeGoogle, reverseGeocode } = require('./locationUtils');
const { getWeather } = require('./weatherUtils');
const { getAirQuality, getPollenAmbee } = require('./airPollenUtils');
const axios = require('axios');
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

/**
 * @fileoverview Gemini API에 제공할 "도구(Tool)"를 정의하고,
 * Gemini의 요청에 따라 해당 도구를 실행하는 로직을 담당합니다.
 * 이 파일은 새로운 LLM 기반 아키텍처의 핵심 중 하나입니다.
 */

// ==================================================================
// 1. Gemini API에 전달할 도구 명세 (Function Declarations)
// ==================================================================
// 각 도구의 'description'을 명확하고 상세하게 작성하는 것이 매우 중요합니다.
// Gemini는 이 설명을 보고 어떤 도구를 사용할지 결정하기 때문입니다.
const availableTools = {
  functionDeclarations: [
    {
        
      name: 'get_all_weather_data',
      description: "사용자의 질문에 답하기 위해 필요한 모든 종류의 날씨 데이터(기온, 미세먼지, 꽃가루 등)를 한 번에 가져옵니다. 날씨와 관련된 모든 질문에 이 도구를 사용해야 합니다.",
      parameters: {
        type: 'OBJECT',
        properties: {
          location: { 
            type: 'STRING', 
            description: "날씨를 조회할 지역 이름(예: '서울', '속초'). 사용자가 이번 질문에서 지역을 명시적으로 언급한 경우에만 이 값을 설정합니다."
          },
        },
        // location은 선택 사항입니다.
        required: [],
      },
    },
  ],
};

// ==================================================================
// 2. Gemini의 요청에 따라 실제 함수를 실행하는 핸들러
// ==================================================================
async function executeTool(functionCall, userCoords) {
    const { name, args } = functionCall;
    
    let output;

    // 위치 인자(location)를 실제 좌표(lat, lon)로 변환하는 과정이 공통적으로 필요합니다.
    let lat, lon, locationName;
    if (args.location) {
        console.log(`📍 LLM이 추출한 지역: ${args.location}`);
        const geo = await geocodeGoogle(args.location);
        if (!geo) {
            console.log(`⚠️ '${args.location}' 위치를 찾을 수 없어 현재 위치로 대체합니다.`);
            if (!userCoords) throw new Error('현재 위치 좌표가 제공되지 않았습니다.');
            lat = userCoords.latitude;
            lon = userCoords.longitude;
        } else {
            lat = geo.lat;
            lon = geo.lon;
        }
        locationName = await reverseGeocode(lat, lon) || args.location;
    } else {
        console.log(`📍 지역 언급 없음. 현재 위치(GPS)를 사용합니다.`);
        if (!userCoords) throw new Error('현재 위치 좌표가 제공되지 않았습니다.');
        lat = userCoords.latitude;
        lon = userCoords.longitude;
        locationName = await reverseGeocode(lat, lon) || '현재 위치';
    }

  // ✨ [핵심 수정] get_all_weather_data가 호출되면 모든 API를 병렬로 실행합니다.
  if (name === 'get_all_weather_data') {
    console.log(`🌀 모든 날씨 데이터 수집 시작: ${locationName}`);
    
    // Promise.all을 사용해 모든 데이터를 한 번에 가져옵니다.
    const [weather, air, pollen] = await Promise.all([
        getWeather(lat, lon),
        getAirQuality(lat, lon),
        getPollenAmbee(lat, lon)
    ]);

    // 수집한 모든 데이터를 하나의 객체로 묶습니다.
    output = {
        locationName,
        weather,
        air,
        pollen
    };
  } else {
    throw new Error(`알 수 없는 도구 이름입니다: ${name}`);
  }
    return { tool_function_name: name, output };

}

module.exports = { availableTools, executeTool };