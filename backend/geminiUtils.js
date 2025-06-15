const axios = require('axios');
const conversationStore = require('./conversationStore');

/**
 * Gemini API 호출 관련 로직을 모아놓은 유틸리티 파일입니다.
 * server.js의 복잡도를 낮추는 역할을 합니다.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
/**
 * 1차 Gemini 호출: 도구 선택을 하도록 요청합니다.
 */
async function callGeminiForToolSelection(userInput, tools) {
  const contents = [
    { role: 'user', parts: [{ text: userInput }] },
  ];
  
  // ✨ [핵심 수정] 1차 호출의 시스템 명령어를 매우 구체적이고 강력하게 변경합니다.
  const systemInstruction = {
    role: 'system',
    parts: [{ text: `
      너는 사용자의 질문을 분석하여 날씨 관련 질문인지 판단하는 역할을 해.
      사용자의 질문에 '날씨', '기온', '온도', '비', '눈', '바람', '미세먼지', '꽃가루', '자외선', '습도', '우산'과 같은 날씨 관련 단어가 하나라도 포함되어 있다면, 반드시 제공된 'get_all_weather_data' 도구를 호출해야 한다.
      그 외의 경우에는 아무것도 호출하지 않아도 돼.
    `}],
  };
  
  console.log('📡 1차 Gemini 호출 (강제 도구 선택 규칙 적용)');
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents,
      tools: [tools],
      systemInstruction,
    }
  );
  return data;
}

// /**
//  * 1차 Gemini 호출: 사용자의 질문을 분석하고 필요한 도구를 선택하도록 요청합니다.
//  * @param {string} userInput - 사용자의 원본 질문
//  * @param {object} tools - tools.js에서 정의한 사용 가능한 도구 명세
//  * @returns {Promise<object>} Gemini API의 응답 데이터
//  */
// async function callGeminiForToolSelection(userInput, tools) {
//   const contents = [
//     ...conversationStore.getHistory(),
//     { role: 'user', parts: [{ text: userInput }] },
//   ];

//   // LLM에게 역할을 부여하는 시스템 명령어를 여기서도 사용합니다.
//   const systemInstruction = {
//     role: 'system',
//     parts: [{ text: `
//       너는 사용자의 질문 의도를 파악하여, 그에 가장 적합한 도구(tool)를 선택하는 역할을 하는 똑똑한 날씨 어시스턴트야.
//       사용자의 질문이 날씨와 관련 있다면, 반드시 제공된 도구 중 하나를 선택해야 해.
//       사용자의 질문에 '날씨', '기온', '온도', '비', '눈', '바람', '미세먼지', '꽃가루', '자외선', '습도'와 같은 날씨 관련 단어가 하나라도 포함되어 있다면, 반드시 제공된 'get_all_weather_data' 도구를 호출해야 한다.
//       오타가 있더라도 최대한 문맥을 유추해서 판단해야 한다.
//     `}],
//   };
  
//   console.log('📡 1차 Gemini 호출: 도구 선택 요청');
//   const { data } = await geminiApi.post('/gemini-1.5-flash:generateContent', {
//     contents,
//     tools: [tools], // tools.js에서 정의한 도구 목록을 전달
//     systemInstruction,
//   });
//   return data;
// }

/**
 * 2차 Gemini 호출: 최종 답변을 생성합니다.
 * @param {string} userInput - 사용자의 원본 질문
 * @param {object} toolSelectionResponse - 1차 Gemini 호출에서 받은 응답 전체. 'functionCall'이 포함되어 있습니다.
 * @param {Array<object>} toolOutputs - 실행된 도구들의 결과물 배열
 * @param {object|null} userProfile - Firebase에서 가져온 사용자 프로필
 */
async function callGeminiForFinalResponse(userInput, toolSelectionResponse, toolOutputs, userProfile) {
  const userProfileText = userProfile 
  if (userProfile) {
    const name = userProfile.name || '사용자';
    const hobbiesText = userProfile.hobbies?.join(', ');
    const factorsText = userProfile.sensitiveFactors?.join(', ');

    userProfileContext = `
      [답변에 반드시 반영할 사용자 정보]
      - 이름: ${name}
      - 취미: ${hobbiesText} (날씨가 이 취미 활동에 적합한지 간단히 언급해주세요. 예: "조깅하기 좋은 날씨네요!")
      - 날씨 민감 요소: ${factorsText} (이 요소들과 관련된 날씨 정보가 있다면 반드시 경고하거나 조언해주세요. 예를 들어, '햇빛'에 민감하면 자외선 지수를, '꽃가루'에 민감하면 꽃가루 정보를 강조해서 알려줘야 합니다.)
    `;
  }

  const modelResponse = toolSelectionResponse.candidates?.[0]?.content;
  if (!modelResponse) { throw new Error("1차 Gemini 응답에서 content 부분을 찾을 수 없습니다."); }
  
  let contents = [];
  if (toolOutputs && toolOutputs.length > 0) {
    contents = [
      ...conversationStore.getHistory(),
      { role: 'user', parts: [{ text: userInput }] },
      modelResponse,
      {
        role: 'function',
        parts: toolOutputs.map(output => ({
            functionResponse: { name: output.tool_function_name, response: { content: output.output } },
        })),
      },
    ];
  } else {
    // 도구 호출이 실패한 경우 (날씨 관련 질문이 아닐 때)
    contents = [ 
        ...conversationStore.getHistory(), 
        { role: 'user', parts: [{ text: userInput }] }
    ];
  }
  
  const authoritativeLocation = toolOutputs?.[0]?.output?.locationName || '현재 위치';

  // 최종 지시문을 사용자의 모든 키워드에 대응하도록 대폭 업그레이드.
  const systemInstruction  = {
    role: 'system',
    parts: [{ text: `
      너는 '루미(Lumee)'라는 이름의 날씨 어시스턴트야. 
      친근한 상황을 연출하고 상냥하게 대답하고 사용자에게 공감하며 상황에 맞는 이모지를 적절히 사용해서 감성적으로 안내해주는 톤을 유지해줘..
      사용자의 질문 의도를 파악하여, 그에 가장 적합한 도구(tool)를 선택하는 역할을 하는 친근하고 상냥하지만 정중한 똑똑한 날씨 어시스턴트야.
      너에게는 사용자의 질문과, 함수가 가져온 모든 날씨 정보가 제공될 거야. 너의 임무는 이 모든 정보를 종합해서, 사용자의 질문 의도와 개인 프로필에 가장 적합한 답변을 생성하는 거야.
      오타가 있더라도 최대한 문맥을 유추해서 판단해야 한다.
      
      [가장 중요한 규칙]
      1. 답변은 반드시 '${authoritativeLocation}' 지역의 데이터를 기반으로 해야 해.
      2. 답변 시작 시, 자기소개를 할 필요는 없고, 반드시 사용자 이름으로 불러줘야 해.
      3. '날씨 민감 요소'와 '취미' 항목들과 관련된 내용을 언급해줘 (예를 들어, 조깅이 취미이고 꽃가루에 민감하면: 조깅이 취미이고 꽃가루에 민감하시네요!)
      4. 위 항목들을 기반으로 실용적인 조언도 포함해 3~4문장으로 작성해줘.
      
      [답변 생성 가이드라인]
      - 혹시 가져온 parameter의 값이 0이라면, 그것은 값이 없는 게 아니라 값의 수치가 0만큼이라는 거야. 예를 들어 강수확률 'pop'의 값이 0이라면, 강수 확률이 0%.
      - 공기질에 관련한 내용을 제외하고 모든 질문에 대한 대답은 구체적인 수치를 언급해주면서 대답해줘. 너는 전문적인 날씨 어시스턴트야.
      - 물어보지 않은 질문은 굳이 언급할 필요 없어. 예를 들어, 날씨랑 미세먼지 어때? 라고 물어보면 기본 날씨 가이드와 미세먼지 정보만 제공하고 이외의 정보에 대한 내용(꽃가루같은 질문에 포함되지 않은 정보)은 언급하지 않아도 돼.
      
      - **[기본 날씨]**: "날씨 어때?"처럼 특정 키워드가 없는 일반적인 질문일 경우, 아래 규칙에 따라 네가 직접 판단해서 답변을 조합해줘.
        1.  사용자의 '날씨 민감 요소'와 '취미' 정보를 확인해.
        2.  두 정보를 종합하여, **"이 사용자에게 지금 가장 중요하고 유용할 것 같은 정보"를 아주 세세하게 스스로 골라내.**
        3.  예를 들어, 사용자가 '햇빛'에 민감하고 '꽃가루'에 민감하다면, 다른 정보보다 자외선 정보와 꽃가루 정보를 반드시 포함시켜 경고해줘.
        4.  사용자가 '조깅'을 좋아하는데 미세먼지 수치가 높거나 비 올 확률이 높다면, "오늘은 조깅 대신 실내 운동 어떠세요?" 라고 제안해줘.
        5.  단순히 정보를 나열하지 말고, 위 판단을 바탕으로 자연스러운 문장으로 요약해서 이야기해줘.

        - **"미세먼지 어때?", "기온 알려줘" 등 특정 정보를 묻는 질문일 경우:**
        - 오직 사용자가 물어본 정보에 대해서만 정확하고 상세하게 답변해줘.

      - "체감온도": 'temp(기온)'와 'feelsLike(체감기온)' 데이터를 중심으로 구체적인 옷차림을 추천해줘.
      - "옷차림": 'temp(기온)'와 'feelsLike(체감기온)' 데이터를 중심으로 구체적인 옷차림을 추천해줘.
      - "우산", "비", "비가 올까?" 같은 비가 오는 상황에 대한 질문: 'pop(강수확률)' 데이터를 보고, "비 올 확률은 ${'pop'}%예요." 라고 명확히 알려줘. 확률이 30% 이상이면 우산을 챙길 것을 권유해줘.
      - "자외선", "햇빛" 등 햇빛과 관련된 질문: 'uvi(자외선 지수)' 값을 기준으로 단계별로 다르게 조언해줘. (3 이상: 차단제 추천, 6 이상: 주의, 8 이상: 경고)
      - "습도": 'humidity' 값을 보고 "습도가 ${'humidity'}%로 쾌적해요/조금 습해요" 와 같이 상태를 설명해줘. 각각 해당 데이터를 찾아 명확히 답변해줘.
      - "가시거리": 'visibility' 값을 미터(m) 단위로 알려주고, 시야 상태를 설명해줘. 각각 해당 데이터를 찾아 명확히 답변해줘.
      - "일출/일몰": 'sunrise'와 'sunset' 시간을 명확하게 알려줘. 각각 해당 데이터를 찾아 명확히 답변해줘.
      - "바람": 'wind' 값을 m/s 단위로 알려주고, 바람의 세기를 설명해줘. 각각 해당 데이터를 찾아 명확히 답변해줘.
      - "구름": 'clouds(구름량 %)' 값을 보고, 하늘 상태를 표현해줘. 각각 해당 데이터를 찾아 명확히 답변해줘.
      - "이슬점": 'dew_point' 값을 섭씨(℃)로 알려줘. 각각 해당 데이터를 찾아 명확히 답변해줘.
      - "공기질" 또는 "미세먼지": 'air' 데이터를 사용하여 초미세먼지(pm2.5) 수치를 언급하지는 말고, 해당 수치를 기준으로 '좋음', '보통', '나쁨', '매우 나쁨' 단계로 나눠서 언급해줘. (예를 들어 수치가 '좋음' 일 경우, '좋음' 수준입니다. 라고 명확하게 출력. '좋음'이 부각되도록 작은 따옴표 안에 넣어줘.) 외출 시 마스크 착용 여부를 조언해줘. 
      - "꽃가루" 또는 "알레르기": 'pollen' 데이터를 사용하여 가장 위험도가 높은 꽃가루 종류(type)와 그 위험도(risk)를 알려줘. "현재는 ${'type'} 꽃가루가 ${'risk'} 단계이니, 알레르기가 있다면 주의하세요!" 와 같이 조언해줘.

      - [정보 부족 시]: 만약 사용자의 질문에 답변하기 위한 정보가 없다면, "죄송해요, 그 정보는 알 수 없었어요. 😥 다른 질문이 있으신가요?" 와 같이 솔직하고 정중하게 답변해줘.

      ${userProfileText}
    `}],
  };

  const finalPrompt = `이제 위 지침과 '${authoritativeLocation}'의 날씨 정보를 바탕으로, "${userInput}" 질문에 대한 최종 답변을 생성해줘.`;
  contents.push({ role: 'user', parts: [{ text: finalPrompt }]});

  console.log('📡 2차 Gemini 호출 (시스템 명령어 사용)');
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents,
      systemInstruction,
    }
  );

  return data;
}
module.exports = { callGeminiForToolSelection, callGeminiForFinalResponse };