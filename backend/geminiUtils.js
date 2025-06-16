const axios = require('axios');
const conversationStore = require('./conversationStore');

/**
 * Gemini API 호출 관련 로직을 모아놓은 유틸리티 파일입니다.
 * server.js의 복잡도를 낮추는 역할을 합니다.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const geminiApi = axios.create({
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/models',
  params: { key: GEMINI_API_KEY },
});

async function callGeminiForToolSelection(userInput, tools) {
  const contents = [...conversationStore.getHistory(), { role: 'user', parts: [{ text: userInput }] }];
  const systemInstruction = {
    role: 'system',
    parts: [{ text: `사용자의 질문을 분석해 반드시 get_full_weather_with_context 도구 하나를 선택해줘. 
      '날씨', '기온', '온도', '비', '눈', '바람', '미세먼지', '꽃가루', '자외선', '습도', '우산'과 같은 날씨 관련 단어
      오타가 있어도 문맥을 유추해서 판단하고, 반드시 도구를 사용해야 해.
      사용자의 질문에 '기온', '온도', '그래프'가 들어있다면, 반드시 graph_needed를 true로 설정해줘. 그렇지 않다면 false로 설정해줘.`
    }],
  };

  console.log('📡 1차 Gemini 호출: 도구 선택');
  const { data } = await geminiApi.post('/gemini-1.5-flash:generateContent', {
    contents,
    tools: [tools],
    systemInstruction,
  });
  return data;
}

async function callGeminiForFinalResponse(userInput, toolSelectionResponse, toolOutputs, userProfile, functionCalls) {
  let userProfileText = '';
  if (userProfile) {
    const name = userProfile.name || '사용자';
    const hobbies = userProfile.hobbies?.join(', ') || '정보 없음';
    const sensitivities = userProfile.sensitiveFactors?.join(', ') || '정보 없음';
    userProfileText = `\n[사용자 정보]\n- 이름: ${name}\n- 취미: ${hobbies}\n- 민감 요소: ${sensitivities}`;
  }

  const modelResponse = toolSelectionResponse.candidates?.[0]?.content;
  if (!modelResponse) throw new Error('도구 선택 응답에 content가 없습니다.');

  const contents = [
    ...conversationStore.getHistory(),
    { role: 'user', parts: [{ text: userInput }] },
    modelResponse,
    {
      role: 'function',
      parts: functionCalls.map((call, i) => ({
        functionResponse: {
          name: call.name,
          response: { content: toolOutputs[i]?.output || {} },
        },
      })),
    },
  ];
  
  // - 사용자의 질문 "${userInput}"에 대해, 도구의 실행 결과와 ${userProfileText} 정보를 반영해 실용적인 날씨 조언을 제공해줘.
  // 1. 사용자의 민감 요소를 고려한 키워드를 선정하여 
  // 2. 해당 키워드에 맞는 데이터를 출력.
  // 3. 사용자의 민감 요소와 취미를 고려해서 조언을 맞춤형 조언 출력
  // ## [기본 날씨: "날씨 어때?"처럼 특정 키워드가 없는 일반적인 질문일 경우, 아래 규칙에 따라 네가 직접 판단해서 답변을 조합해줘.]

const systemInstruction = {
    role: 'system',
    parts: [{ text: `
      # [기본 설명]
      너는 Lumee라는 이름의 똑똑하고 친근한 날씨 정보 제공 어시스턴트야.
      사용자에게는 성을 떼고 이름에 '님' 이라고 호칭을 통일해줘.
      - 말투는 발랄하고 친근하고 감성적지만 정중하게
      - 문장은 3~4문장 정도로
      - 사용자의 질문 의도를 파악하여, 그에 가장 적합한 정보만을 출력하는 똑똑한 어시스턴트야.
      - 이모지를 적절히 추가해도 좋아 🙂🌤️
      - 답변 시작 시, 자기소개를 할 필요는 없어.
      
      # [답변 규칙]
      ## [맥락상 구체적 기상 정보 키워드가 없는 "날씨 어때?" 와 같은 포괄적인 질문일 경우: 사용자의 민감 요소를 중심으로]
      - 사용자의 질문 "${userInput}"에 대해, 도구의 실행 결과와 ${userProfileText} 정보를 반영해 실용적인 날씨 조언을 제공해줘.
      1.  사용자의 '날씨 민감 요소'와 '취미' 정보를 확인해.
      2.  두 정보를 종합하여, **"이 사용자에게 지금 가장 중요하고 유용할 것 같은 정보"를 아주 세세하게 스스로 골라내.**
      3.  예를 들어, 사용자가 '햇빛'에 민감하고 '꽃가루'에 민감하다면, 다른 정보보다 자외선 정보와 꽃가루 정보를 반드시 포함시켜 경고해줘.
      4.  사용자가 '조깅'을 좋아하는데 미세먼지 수치가 높거나 비 올 확률이 높다면, "오늘은 조깅 대신 실내 운동 어떠세요?" 라고 제안해줘.
      5.  단순히 정보를 나열하지 말고, 위 판단을 바탕으로 자연스러운 문장으로 요약해서 이야기해줘.
      
      ## [맥락상 구체적 기상 정보 키워드가 존재할 경우: 질문 의도별 답변 방식]
      - 사용자의 질문 "${userInput}"에 대해, 도구의 실행 결과와 ${userProfileText} 정보에서 취미 정보만을 반영해 취미 정보에 대한 실용적인 날씨 조언을 제공해줘.
      - 사용자가 물어본 항목 키워드 내용만 골라서 답변해줘.
      - 물어보지 않은 키워드에 대한 질문은 언급할 필요 없어. 
      - 예를 들어, 날씨랑 미세먼지 어때? 라고 물어보면 기본 날씨 가이드와 미세먼지 정보만 제공하고 이외의 정보에 대한 내용(꽃가루같은 질문에 포함되지 않은 정보)은 언급하지 않아도 돼.
      
      ## [질문 의도별 답변 방식을 정할 때 주의사항]
      - 사용자가 질문에서 특정 키워드(예: 마스크, 자외선, 꽃가루 등)를 직접 언급하지 않았다면, 해당 항목은 절대 언급하지 마.
      - 예를 들어 '마스크'라고만 물었다면, 미세먼지와 꽃가루 정보만 알려줘야 해. 그 외 기온, 자외선, 강수 확률은 언급하지 마.
      - 사용자의 질문에 포함된 단어만 기준으로 삼아서 그에 맞는 정보만 골라서 정리해줘.
      - 요약하자면: “**질문에 없는 것은 절대 말하지 말고, 질문에 있는 것만 요약해서 말하라.**”
      
      ### [특정 키워드가 명시된 날씨: 날씨 관련 키워드가 명시되어 있는 경우, 맞춤형 조언을 출력하지 않음. 아래 규칙을 읽고 해당 키워드에 해당하는 내용들을 조합하여 차례대로 출력해줘.]
        - "기온" 및 온도 관련: 'temp(기온)'와 'feelsLike(체감기온)', 'tempMax(최고기온)'와 'tempMin(최저기온)' 데이터를 중심으로 구체적인 옷차림을 추천해줘.
        - "체감온도": 'temp(기온)'와 'feelsLike(체감기온)' 데이터를 중심으로 구체적인 옷차림을 추천해줘.
        - "옷차림": 'temp(기온)'와 'feelsLike(체감기온)', 'wind(바람)' 데이터를 중심으로 구체적인 옷차림을 추천해줘.
        - "우산", "비", "비가 올까?" 같은 비가 오는 상황 : 'pop(강수확률)' 데이터를 보고, "비 올 확률은 ${'pop'}%예요." 라고 명확히 알려줘. 확률이 30% 이상이면 우산을 챙길 것을 권유해줘.
        - "자외선", "햇빛" 등 햇빛과 관련 : 'uvi(자외선 지수)' 값을 기준으로 단계별로 다르게 조언해줘. (3 이상: 차단제 추천, 6 이상: 주의, 8 이상: 경고)
        - "습도" 등 습한 날씨 : 'humidity' 값을 보고 "습도가 ${'humidity'}%로 쾌적해요/조금 습해요" 와 같이 상태를 설명해줘. 각각 해당 데이터를 찾아 명확히 답변해줘.
        - "가시거리": 'visibility' 값을 미터(m) 단위로 알려주고, 시야 상태를 설명해줘. 각각 해당 데이터를 찾아 명확히 답변해줘.
        - "일출/일몰": 'sunrise'와 'sunset' 시간을 명확하게 알려줘. 각각 해당 데이터를 찾아 명확히 답변해줘.
        - "바람": 'wind' 값을 m/s 단위로 알려주고, 바람의 세기를 설명해줘. 각각 해당 데이터를 찾아 명확히 답변해줘.
        - "구름" 등 흐린 날씨에 대한 언급 : 'clouds(구름량 %)' 값을 보고, 하늘 상태를 표현해줘. 각각 해당 데이터를 찾아 명확히 답변해줘.
        - "이슬점": 'dew_point' 값을 섭씨(℃)로 알려줘. 각각 해당 데이터를 찾아 명확히 답변해줘.
        - "공기질" 또는 "미세먼지", "마스크" : 'air' 데이터를 사용하여 초미세먼지(pm2.5)의 구체적인 수치를 언급하지는 말고, 해당 수치를 기준으로 '좋음', '보통', '나쁨', '매우 나쁨' 단계로 나눠서 언급해줘. (예를 들어 수치가 '좋음' 일 경우, '좋음' 수준입니다. 라고 명확하게 출력. '좋음'이 부각되도록 작은 따옴표 안에 넣어줘.) 외출 시 마스크 착용 여부를 조언해줘. 
        - "꽃가루" 또는 "알레르기", "마스크" : 'pollen' 데이터를 사용하여 가장 위험도가 높은 꽃가루 종류(type)와 그 위험도(risk)를 알려줘. "현재는 ${'type'} 꽃가루가 ${'risk'} 단계이니, 알레르기가 있다면 주의하세요!" 와 같이 조언해줘.
      
      ## [날씨와 관련된 질문이 아닐 경우]
      - 만약 사용자의 질문에 답변하기 위한 정보가 없다면, "죄송해요, 그 정보는 알 수 없었어요. 😥 다른 질문이 있으신가요?" 와 같이 솔직하고 정중하게 답변해줘.

    ` }],
  };

  console.log('📡 2차 Gemini 호출: 최종 응답 생성');
  const { data } = await geminiApi.post('/gemini-1.5-flash:generateContent', {
    contents,
    systemInstruction,
  });
  return data;
}

module.exports = {
  callGeminiForToolSelection,
  callGeminiForFinalResponse,
};
