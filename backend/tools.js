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
      name: 'get_general_weather',
      // 설명을 대폭 상세화하여 LLM의 이해도를 높입니다.
        description: "포괄적인 날씨 정보를 조회하는 가장 기본적인 도구입니다. 사용자가 '날씨', '기온', '온도' 같은 일반적인 질문, 또는 '비', '비가 올까?', '강수', '우산' 등 강수 관련 질문, 그리고 '햇빛', '해', '자외선' 등 태양 관련 질문을 할 때 사용합니다. 그 외 '옷차림', '습도', '가시거리', '바람', '구름', '일출/일몰', '이슬점' 질문에도 이 함수를 사용하세요.",
        parameters: {
            type: 'OBJECT',
            properties: {
            location: { 
                type: 'STRING', 
                description: "날씨를 조회할 지역 이름. 만약 사용자의 이번 질문에 지역 이름이 (예: '서울', '부산' 등 과 같이) 명시적으로 언급되지 않았다면, 이 값을 현재 위치인'CURRENT_LOCATION'으로 설정하세요. 사용자가 '여기' 또는 '현재 위치'라고 말할 때도 'CURRENT_LOCATION'을 사용합니다." 
            },
            date: { 
                type: 'STRING', 
                description: '조회할 날짜. 지정하지 않으면 오늘 날씨를 반환합니다.' 
            },
            graph_needed: {
                type: 'BOOLEAN',
                description: "사용자가 '기온', '온도' 또는 시간별 날씨 변화에 대해 명시적으로 질문했을 경우에만 true로 설정합니다. 그 외의 경우에는 false로 설정하세요."
            }
        },
        required: ['location', 'graph_needed'],
        },
    },
    {
        name: 'get_air_quality',
        description: "특정 지역의 공기질, 즉 미세먼지(pm10)와 초미세먼지(pm2.5) 농도를 조회합니다. '미세먼지', '공기질', '공기 상태' 등의 질문에 사용합니다.",
        parameters: {
            type: 'OBJECT',
            properties: {
            location: { 
                type: 'STRING', 
                description: "날씨를 조회할 지역 이름 (예: '서울', '부산' 등). 만약 사용자의 이번 질문에 지역 이름이 (예: '서울', '부산' 등 과 같이) 명시적으로 언급되지 않았다면, 이 값을 현재 위치인 'CURRENT_LOCATION'으로 설정하세요. 사용자가 '여기' 또는 '현재 위치'라고 말할 때도 'CURRENT_LOCATION'을 사용합니다." 
            },
        },
        required: ['location'],
        },
    },
    {
        name: 'get_pollen_info',
        description: "꽃가루 정보를 조회하는 전용 기능입니다. 사용자가 '꽃가루', '꽃가루 지수', '알레르기', '비염' 등 꽃가루와 관련된 질문을 할 때 반드시 이 함수를 호출해야 합니다.",
        parameters: {
            type: 'OBJECT',
            properties: {
            location: { 
                type: 'STRING', 
                description: "날씨를 조회할 지역 이름 (예: '서울', '부산' 등). 만약 사용자의 이번 질문에 지역 이름이 (예: '서울', '부산' 등 과 같이) 명시적으로 언급되지 않았다면, 이 값을 현재 위치인 'CURRENT_LOCATION'으로 설정하세요. 사용자가 '여기' 또는 '현재 위치'라고 말할 때도 'CURRENT_LOCATION'을 사용합니다." 
            },
        },
        required: ['location'],
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

    if (args.location && args.location.toUpperCase() === 'CURRENT_LOCATION') {
        if (!userCoords) throw new Error('현재 위치 좌표가 제공되지 않았습니다.');
        lat = userCoords.latitude;
        lon = userCoords.longitude;
    } else {
        const geo = await geocodeGoogle(args.location);
        if (!geo) throw new Error(`'${args.location}' 지역의 위치를 찾을 수 없습니다.`);
        lat = geo.lat;
        lon = geo.lon;
    }
    // 좌표를 기반으로 정확한 지역 이름을 가져옵니다. (Gemini에게 최종 정보 제공 시 사용)
    locationName = await reverseGeocode(lat, lon) || args.location; // 역지오코딩 실패 시 원래 위치명 사용

    switch (name) {
        case 'get_general_weather': {
            // 1. weatherUtils를 통해 모든 날씨 데이터를 가져옵니다.
            const weatherData = await getWeather(lat, lon);
            if (!weatherData) throw new Error("날씨 정보를 가져오지 못했습니다.");

            // 가져온 데이터에서 시간별 그래프 데이터를 직접 가공합니다.
            const hourlyTemps = [];
            if (weatherData.hourly) {
                const hourly = weatherData.hourly;
                const offsetMs = (weatherData.timezone_offset || 0) * 1000;
                const localNow = new Date(new Date().getTime() + offsetMs);
                localNow.setMinutes(0, 0, 0);

                for (let i = 0; i < 6; i++) {
                const targetLocalTime = new Date(localNow.getTime() + i * 3 * 60 * 60 * 1000);
                const targetUTC = new Date(targetLocalTime.getTime() - offsetMs);
                const closest = hourly.reduce((prev, curr) => 
                    Math.abs(curr.dt * 1000 - targetUTC.getTime()) < Math.abs(prev.dt * 1000 - targetUTC.getTime()) ? curr : prev
                );
                const hour = new Date(targetUTC.getTime() + offsetMs).getUTCHours();
                const label = `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? 'am' : 'pm'}`;
                hourlyTemps.push({ hour: label, temp: Math.round(closest.temp) });
                }
            }
            
            // 2. 최종 output에 weatherData와 함께 가공된 hourlyTemps를 추가합니다.
            output = { 
                locationName, 
                date: args.date || '오늘', 
                ...weatherData,
                hourlyTemps
            };
            break;
        }
        
        case 'get_air_quality':
        output = { locationName, air: await getAirQuality(lat, lon) };
        break;

        case 'get_pollen_info':
        output = { locationName, pollen: await getPollenAmbee(lat, lon) };
        break;

        default:
        throw new Error(`알 수 없는 도구 이름입니다: ${name}`);
    }
    
    return {
        tool_function_name: name,
        output,
    };
}

module.exports = { availableTools, executeTool };